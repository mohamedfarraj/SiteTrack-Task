import { Pool } from 'pg';
import { migrations } from './migrations';

/** Arbitrary constant used as the advisory-lock key while migrating. */
const MIGRATION_LOCK_KEY = 727_001;

/**
 * Minimal, forward-only migration runner.
 *
 * - Migrations are plain SQL strings, versioned in `src/database/migrations`.
 * - Applied ids are tracked in `schema_migrations`.
 * - A session advisory lock makes it safe if several API instances boot at once.
 * - Each migration runs in its own transaction (Postgres DDL is transactional).
 */
export async function runMigrations(pool: Pool, log: (msg: string) => void = console.log): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.id));

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      log(`Applying migration ${migration.id}`);
      await client.query('BEGIN');
      try {
        await client.query(migration.up);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
