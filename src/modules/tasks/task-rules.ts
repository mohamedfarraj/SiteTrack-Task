import { TaskAction, TaskStatus } from '../../common/enums';

/**
 * Pure task rules: the status machine and dependency-graph helpers.
 * Kept free of I/O so they are easy to unit test (see task-rules.spec.ts).
 *
 * ---------------------------------------------------------------------------
 * The invariant that keeps Blocked cheap
 * ---------------------------------------------------------------------------
 * "B depends on A" means B waits for A. The brief says a task waits on every
 * task it can reach by following dependencies (transitively).
 *
 * We maintain one invariant:
 *
 *     If a task has started (IN_PROGRESS or DONE), every task it waits on,
 *     directly or indirectly, is DONE.
 *
 * It holds because every operation that could break it is refused:
 *   - Start:          only when all direct dependencies are DONE (and, by the
 *                     invariant, *their* dependencies are DONE too).
 *   - Reopen A:       only when no direct dependent has started. (If some
 *                     indirect dependent X had started, the direct dependent
 *                     on the path to X would be DONE, i.e. started.)
 *   - Add dependency: a started task may only gain a dependency on a DONE task.
 *   - Removing tasks or edges only removes constraints.
 *
 * Consequences:
 *   - Blocked(T) = T is not DONE and at least one *direct* dependency is not
 *     DONE. If every direct dependency is DONE then, by the invariant, all
 *     indirect ones are DONE as well. So Blocked needs no graph traversal and
 *     is backed by the trigger-maintained `open_deps_count` column.
 *   - "Every task it waits on is done" (the Start rule) is also a direct check.
 * ---------------------------------------------------------------------------
 */

export interface TaskState {
  status: TaskStatus;
  /** Number of direct dependencies that are not DONE. */
  openDependencies: number;
  /** Whether any task that directly waits on this one has started. */
  hasStartedDependents: boolean;
}

/** The status actions allowed right now (screen 6 shows only these). */
export function allowedActions(task: TaskState): TaskAction[] {
  switch (task.status) {
    case TaskStatus.NOT_STARTED:
      return task.openDependencies === 0 ? [TaskAction.START] : [];
    case TaskStatus.IN_PROGRESS:
      return [TaskAction.COMPLETE];
    case TaskStatus.DONE:
      return task.hasStartedDependents ? [] : [TaskAction.REOPEN];
  }
}

/** Status a successful action moves the task to. */
export const ACTION_TARGET: Record<TaskAction, TaskStatus> = {
  [TaskAction.START]: TaskStatus.IN_PROGRESS,
  [TaskAction.COMPLETE]: TaskStatus.DONE,
  [TaskAction.REOPEN]: TaskStatus.IN_PROGRESS,
};

/** Human-readable reason an action is refused, or undefined when allowed. */
export function rejectionReason(action: TaskAction, task: TaskState): string | undefined {
  if (allowedActions(task).includes(action)) return undefined;
  switch (action) {
    case TaskAction.START:
      return task.status !== TaskStatus.NOT_STARTED
        ? 'Only a task that has not started can be started'
        : 'Cannot start: some tasks it waits on are not done yet';
    case TaskAction.COMPLETE:
      return 'Only a task in progress can be marked as done';
    case TaskAction.REOPEN:
      return task.status !== TaskStatus.DONE
        ? 'Only a done task can be reopened'
        : 'Cannot reopen: a task that waits on it has already started';
  }
}

/** A dependency edge: `taskId` waits for `dependsOnId`. */
export interface Edge {
  taskId: number;
  dependsOnId: number;
}

export interface Graph {
  /** task -> tasks it directly waits on */
  dependsOn: Map<number, number[]>;
  /** task -> tasks that directly wait on it */
  dependents: Map<number, number[]>;
}

export function buildGraph(edges: Edge[]): Graph {
  const dependsOn = new Map<number, number[]>();
  const dependents = new Map<number, number[]>();
  for (const { taskId, dependsOnId } of edges) {
    push(dependsOn, taskId, dependsOnId);
    push(dependents, dependsOnId, taskId);
  }
  return { dependsOn, dependents };
}

/**
 * Breadth-first search from `start`, returning every reachable task with its
 * distance in steps (shortest path). BFS visits each task once, so it is
 * O(tasks + edges) even when there are many paths between two tasks.
 */
export function distancesFrom(start: number, adjacency: Map<number, number[]>): Map<number, number> {
  const distance = new Map<number, number>();
  let frontier = [start];
  let depth = 0;
  while (frontier.length) {
    depth++;
    const next: number[] = [];
    for (const node of frontier) {
      for (const neighbour of adjacency.get(node) ?? []) {
        if (neighbour === start || distance.has(neighbour)) continue;
        distance.set(neighbour, depth);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return distance;
}

/**
 * Would adding "taskId depends on dependsOnId" make a task wait on itself?
 * That happens exactly when `taskId` is already reachable from `dependsOnId`
 * by following dependencies (A -> B -> ... -> A), or when they are the same.
 */
export function createsCycle(taskId: number, dependsOnId: number, graph: Graph): boolean {
  if (taskId === dependsOnId) return true;
  return distancesFrom(dependsOnId, graph.dependsOn).has(taskId);
}

function push(map: Map<number, number[]>, key: number, value: number): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
