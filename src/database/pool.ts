import { Pool, PoolConfig, types } from 'pg';

/*
 * Type parsers: make node-postgres return friendly JS values.
 *
 *  - int8 / bigint (OID 20): ids and counts. All our values are far below
 *    Number.MAX_SAFE_INTEGER, so a JS number is safe and nicer for clients.
 *  - numeric (OID 1700): stock quantities (numeric(14,3)) -> JS number.
 *  - date (OID 1082): keep the plain "YYYY-MM-DD" string. Converting it to a
 *    JS Date would shift it by the server time zone, and planned dates are
 *    calendar dates, not instants.
 */
types.setTypeParser(20, (v) => Number.parseInt(v, 10));
types.setTypeParser(1700, (v) => Number.parseFloat(v));
types.setTypeParser(1082, (v) => v);

export interface DbConnectionOptions {
  url?: string;
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  poolMax: number;
}

/** Builds a pg connection pool from config (shared by the API, migrator and seeder). */
export function createPool(options: DbConnectionOptions, extra: PoolConfig = {}): Pool {
  const base: PoolConfig = options.url
    ? { connectionString: options.url }
    : {
        host: options.host,
        port: options.port,
        database: options.name,
        user: options.user,
        password: options.password,
      };

  return new Pool({
    ...base,
    max: options.poolMax,
    idleTimeoutMillis: 30_000,
    // Every connection works in UTC so CURRENT_DATE ("today" for Late) is stable.
    options: '-c timezone=UTC',
    ...extra,
  });
}
