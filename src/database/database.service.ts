import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { AppConfig } from '../config/app.config';
import { runMigrations } from './migrator';
import { createPool } from './pool';

/** Anything that can run a parameterised SQL statement (the pool or a transaction). */
export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = any>(sql: string, params?: unknown[]): Promise<T | undefined>;
}

/** A Queryable bound to a single connection inside BEGIN ... COMMIT. */
class TxClient implements Queryable {
  constructor(private readonly client: PoolClient) {}

  async query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.client.query(sql, params);
    return result.rows as T[];
  }

  async one<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }
}

/**
 * Thin data-access layer over node-postgres.
 *
 * We deliberately use hand-written SQL instead of an ORM: the hard parts of
 * SiteTrack (row locks for stock, advisory locks for the task graph, window
 * functions and aggregates for the list screens) are all expressed most
 * clearly and efficiently in SQL. Every query is parameterised ($1, $2 ...),
 * so user input never reaches the SQL text.
 */
@Injectable()
export class DatabaseService implements Queryable, OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    const app = this.config.getOrThrow<AppConfig>('app');
    this.pool = createPool(app.database);
    this.pool.on('error', (err) => this.logger.error(`Idle client error: ${err.message}`));
  }

  async onModuleInit(): Promise<void> {
    const app = this.config.getOrThrow<AppConfig>('app');
    if (app.database.migrateOnStart) {
      // `docker compose up` must give a ready-to-use API, so we migrate on boot.
      await runMigrations(this.pool, (msg) => this.logger.log(msg));
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }

  async query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async one<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  /**
   * Runs `work` inside a single transaction. Everything succeeds or nothing
   * does, which is what the brief requires for adding stock and every delivery
   * step. Any thrown error rolls back.
   */
  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new TxClient(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
