/**
 * Domain enums. The string values match the Postgres ENUM types created in
 * migration 001, so they can be passed straight into SQL parameters.
 */

/** App-wide role, chosen at registration. */
export enum AppRole {
  /** Sees only the projects they are a member of. */
  USER = 'USER',
  /** Everything a USER can, plus the company store. */
  STORE_MANAGER = 'STORE_MANAGER',
  /** Every project and the company store, member or not. */
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum TaskStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

/** Status actions a person can take on a task. */
export enum TaskAction {
  START = 'START',
  COMPLETE = 'COMPLETE',
  REOPEN = 'REOPEN',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum DeliveryDirection {
  /** Company store -> project store. */
  TO_PROJECT = 'TO_PROJECT',
  /** Project store -> company store. */
  TO_COMPANY = 'TO_COMPANY',
}

export enum DeliveryStatus {
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum StockStatus {
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  LOW_STOCK = 'LOW_STOCK',
  AVAILABLE = 'AVAILABLE',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/** Roles that can reach the company store and its deliveries. */
export const COMPANY_STORE_ROLES = [AppRole.STORE_MANAGER, AppRole.SUPER_ADMIN];
