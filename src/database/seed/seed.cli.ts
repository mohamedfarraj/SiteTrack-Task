/**
 * Fills the database with a large, realistic data set.
 *
 *   npm run seed                 # inside the API container: docker compose exec api npm run seed
 *   npm run seed -- --force      # wipe existing data first
 *   SEED_SCALE=0.05 npm run seed # a small data set for quick local work
 *
 * Every seeded account uses the password "Password123!". Handy logins:
 *   superadmin@sitetrack.dev · manager@sitetrack.dev · user@sitetrack.dev
 */
import * as bcrypt from 'bcryptjs';
import appConfig from '../../config/app.config';
import { runMigrations } from '../migrator';
import { createPool } from '../pool';
import { DEFAULT_VOLUMES, SeedVolumes, seedSql } from './seed.sql';

export const SEED_PASSWORD = 'Password123!';

function volumes(): SeedVolumes {
  const scale = Number(process.env.SEED_SCALE ?? '1');
  if (!(scale > 0 && scale <= 10)) throw new Error('SEED_SCALE must be between 0 and 10');
  const s = (n: number, min: number) => Math.max(min, Math.round(n * scale));
  return {
    users: s(DEFAULT_VOLUMES.users, 100),
    projects: s(DEFAULT_VOLUMES.projects, 20),
    bigProjects: s(DEFAULT_VOLUMES.bigProjects, 1),
    bigProjectTasks: s(DEFAULT_VOLUMES.bigProjectTasks, 200),
    avgTasks: s(DEFAULT_VOLUMES.avgTasks, 120),
    materials: s(DEFAULT_VOLUMES.materials, 400),
    deliveries: s(DEFAULT_VOLUMES.deliveries, 1000),
  };
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const pool = createPool({ ...appConfig().app.database, poolMax: 2 });
  const started = Date.now();
  const log = (msg: string) => console.log(`[seed +${((Date.now() - started) / 1000).toFixed(1)}s] ${msg}`);

  // Migrate first (it checks out and releases its own connection).
  await runMigrations(pool, log);
  const client = await pool.connect();

  try {
    const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
    if (rows[0].n > 0 && !force) {
      log('Database already has data. Re-run with --force to wipe it and seed again.');
      return;
    }

    const v = volumes();
    log(`Seeding ${JSON.stringify(v)}`);

    // One shared bcrypt hash: hashing 5,000 passwords would take minutes.
    const hash = await bcrypt.hash(SEED_PASSWORD, 10);

    await client.query('BEGIN');
    await client.query(`SELECT set_config('seed.hash', $1, true)`, [hash]);
    // Bulk mode: skip triggers and FK checks while loading (needs a superuser,
    // which the docker compose database user is). The data is generated to be
    // consistent, and the counters the triggers would maintain are rebuilt at the end.
    await client.query(`SET LOCAL session_replication_role = replica`);
    await client.query(`SET LOCAL work_mem = '128MB'`);

    for (const statement of seedSql(v)) {
      const label = statement.trim().split('\n')[0].slice(0, 70);
      const result = await client.query(statement);
      log(`${label}${result.rowCount ? `  (${result.rowCount} rows)` : ''}`);
    }
    await client.query('COMMIT');

    log('Vacuum + analyze (fresh statistics for the query planner)');
    await client.query('VACUUM (ANALYZE)');

    const counts = await client.query(`
      SELECT (SELECT count(*) FROM users) AS users,
             (SELECT count(*) FROM projects) AS projects,
             (SELECT count(*) FROM project_members) AS memberships,
             (SELECT count(*) FROM project_invitations) AS invitations,
             (SELECT count(*) FROM tasks) AS tasks,
             (SELECT count(*) FROM task_dependencies) AS dependencies,
             (SELECT count(*) FROM materials) AS materials,
             (SELECT count(*) FROM deliveries) AS deliveries,
             (SELECT count(*) FROM delivery_lines) AS delivery_lines`);
    log(`Done: ${JSON.stringify(counts.rows[0])}`);
    log(
      `Log in with user@sitetrack.dev / manager@sitetrack.dev / superadmin@sitetrack.dev, password "${SEED_PASSWORD}"`,
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
