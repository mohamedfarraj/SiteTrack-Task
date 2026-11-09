/**
 * Tiny helper to build parameterised WHERE clauses without string-concatenating
 * user input. Values are always passed as $n placeholders.
 *
 *   const where = new SqlWhere([userId]);         // $1 is reserved
 *   where.add(`p.name ILIKE ${where.param(pattern)}`);
 *   db.query(`SELECT ... ${where.sql()}`, where.params);
 */
export class SqlWhere {
  private readonly clauses: string[] = [];

  constructor(readonly params: unknown[] = []) {}

  /** Registers a value and returns its placeholder, e.g. "$3". */
  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  add(clause: string): this {
    this.clauses.push(clause);
    return this;
  }

  /** "WHERE a AND b" (or "" when empty). */
  sql(prefix = 'WHERE'): string {
    return this.clauses.length ? `${prefix} ${this.clauses.join(' AND ')}` : '';
  }

  /** Just "a AND b" (or "TRUE"). */
  conditions(): string {
    return this.clauses.length ? this.clauses.join(' AND ') : 'TRUE';
  }
}

/** Maps a whitelisted sort key to an ORDER BY fragment (never user text). */
export function orderBy(
  sortBy: string | undefined,
  columns: Record<string, string>,
  fallback: string,
  direction: 'asc' | 'desc' | undefined,
  tieBreaker: string,
): string {
  const column = (sortBy && columns[sortBy]) || columns[fallback];
  const dir = direction === 'desc' ? 'DESC' : 'ASC';
  return `ORDER BY ${column} ${dir} NULLS LAST, ${tieBreaker}`;
}
