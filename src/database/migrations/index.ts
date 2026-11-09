import { initialSchema } from './001-initial-schema';

/** A forward-only SQL migration. `id` must be unique and sort in apply order. */
export interface Migration {
  id: string;
  up: string;
}

/** Every migration, in the order it must be applied. Append new ones at the end. */
export const migrations: Migration[] = [initialSchema];
