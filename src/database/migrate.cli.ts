/**
 * Stand-alone migration command: `npm run migrate`.
 * The API also migrates on boot, so this is only needed for manual workflows.
 */
import appConfig from '../config/app.config';
import { runMigrations } from './migrator';
import { createPool } from './pool';

async function main(): Promise<void> {
  const pool = createPool(appConfig().app.database);
  try {
    await runMigrations(pool);
    console.log('Migrations are up to date.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
