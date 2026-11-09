/**
 * Central, typed application configuration.
 *
 * Every value can be overridden by an environment variable so the same image
 * runs locally, in docker compose and in production without code changes.
 */
export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string;
  database: {
    url?: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    poolMax: number;
    /** Apply pending SQL migrations automatically on boot. */
    migrateOnStart: boolean;
  };
  auth: {
    jwtSecret: string;
    /** Lifetime of a short-lived access token, e.g. "15m". */
    accessTokenTtl: string;
    /**
     * Sliding idle lifetime of a session (refresh token), in days. Each refresh
     * pushes the expiry forward, so an active user is never asked to log in again.
     */
    refreshTokenTtlDays: number;
  };
  throttle: {
    ttlMs: number;
    limit: number;
    authLimit: number;
  };
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default (): { app: AppConfig } => ({
  app: {
    port: int(process.env.PORT, 3000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    database: {
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST ?? 'localhost',
      port: int(process.env.DB_PORT, 5432),
      name: process.env.DB_NAME ?? 'sitetrack',
      user: process.env.DB_USER ?? 'sitetrack',
      password: process.env.DB_PASSWORD ?? 'sitetrack',
      poolMax: int(process.env.DB_POOL_MAX, 20),
      migrateOnStart: process.env.DB_MIGRATE_ON_START !== 'false',
    },
    auth: {
      jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
      accessTokenTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTokenTtlDays: int(process.env.REFRESH_TTL_DAYS, 30),
    },
    throttle: {
      ttlMs: int(process.env.THROTTLE_TTL_MS, 60_000),
      limit: int(process.env.THROTTLE_LIMIT, 1000),
      authLimit: int(process.env.THROTTLE_AUTH_LIMIT, 20),
    },
  },
});
