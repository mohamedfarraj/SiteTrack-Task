/**
 * Public identifiers.
 *
 * Projects are addressed as PRJ-0042 and tasks as PRJ-0042-T-0137. Internally
 * the project code maps 1:1 to the numeric primary key, and a task code to
 * (project id, task number). Parsing is strict; anything malformed is treated
 * as "not found" so it never reveals whether an ID exists.
 */

const PROJECT_CODE = /^PRJ-(\d{1,9})$/i;
const TASK_CODE = /^PRJ-(\d{1,9})-T-(\d{1,9})$/i;

export function formatSeq(n: number): string {
  return n < 10000 ? String(n).padStart(4, '0') : String(n);
}

export function projectCode(id: number): string {
  return `PRJ-${formatSeq(id)}`;
}

/** "PRJ-0042" -> 42, or undefined when the text is not a project code. */
export function parseProjectCode(code: string): number | undefined {
  const match = PROJECT_CODE.exec(code.trim());
  return match ? Number(match[1]) : undefined;
}

/** "PRJ-0042-T-0137" -> { projectId: 42, number: 137 }. */
export function parseTaskCode(code: string): { projectId: number; number: number } | undefined {
  const match = TASK_CODE.exec(code.trim());
  return match ? { projectId: Number(match[1]), number: Number(match[2]) } : undefined;
}

/**
 * Interprets a free-text search as a numeric ID when it looks like one:
 *   projects: "PRJ-0042", "prj-42", "0042", "42"         -> 42
 *   tasks:    "PRJ-0042-T-0137", "T-0137", "0137", "137" -> 137
 */
export function searchNumber(search: string, kind: 'project' | 'task'): number | undefined {
  const text = search.trim();
  const pattern = kind === 'project' ? /^(?:PRJ-)?0*(\d{1,9})$/i : /^(?:PRJ-\d+-)?(?:T-)?0*(\d{1,9})$/i;
  const match = pattern.exec(text);
  return match ? Number(match[1]) : undefined;
}

/** Escapes LIKE wildcards so a user's "%" or "_" is matched literally. */
export function likePattern(search: string): string {
  return `%${search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
