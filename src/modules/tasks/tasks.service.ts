import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { assertDateOrder } from '../../common/dto/date-range';
import { paginate } from '../../common/dto/pagination.dto';
import { TaskAction, TaskStatus } from '../../common/enums';
import { likePattern, parseTaskCode, searchNumber } from '../../common/utils/ids';
import { orderBy, SqlWhere } from '../../common/utils/sql';
import { DatabaseService, Queryable } from '../../database/database.service';
import { ProjectAccess, ProjectAccessService } from '../projects/project-access.service';
import { LATE_TASK_SQL, stripTotal } from '../projects/projects.service';
import {
  ACTION_TARGET,
  allowedActions,
  buildGraph,
  createsCycle,
  distancesFrom,
  Edge,
  rejectionReason,
} from './task-rules';
import { CreateTaskDto, TaskListQueryDto, UpdateTaskDto } from './tasks.dto';

/** Advisory-lock namespace for "the task graph of one project". */
const TASK_GRAPH_LOCK = 1;

/** Blocked = not done and at least one direct dependency is not done (see task-rules.ts). */
const BLOCKED_SQL = (t: string) => `(${t}.status <> 'DONE' AND ${t}.open_deps_count > 0)`;

const TASK_COLUMNS = (t: string) => `
  ${t}.id, ${t}.code, ${t}.name,
  ${t}.planned_start AS "plannedStart", ${t}.planned_end AS "plannedEnd",
  ${t}.status,
  ${LATE_TASK_SQL(t)} AS late,
  ${BLOCKED_SQL(t)} AS blocked,
  ${t}.dependents_count AS "dependentsCount"`;

interface TaskRow {
  id: number;
  number: number;
  status: TaskStatus;
  open_deps_count: number;
}

/**
 * Tasks, dependencies and the status machine (screens 5 and 6).
 *
 * Concurrency: every change to a project's task graph or task statuses runs in
 * a transaction that first takes `pg_advisory_xact_lock(1, projectId)`. That
 * serialises them per project (other projects are unaffected), so checks such
 * as "no cycle" or "no dependent has started" cannot be invalidated by a
 * parallel request between the check and the write.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: ProjectAccessService,
  ) {}

  /** Project: Tasks screen (5). */
  async list(user: AuthUser, projectCode: string, query: TaskListQueryDto) {
    const { projectId } = await this.access.resolve(user, projectCode);
    assertDateOrder(query.from, query.to);

    const where = new SqlWhere();
    where.add(`t.project_id = ${where.param(projectId)}`);
    if (query.status?.length) where.add(`t.status = ANY(${where.param(query.status)}::task_status[])`);
    if (query.late !== undefined) where.add(query.late ? LATE_TASK_SQL('t') : `NOT ${LATE_TASK_SQL('t')}`);
    if (query.blocked !== undefined) where.add(query.blocked ? BLOCKED_SQL('t') : `NOT ${BLOCKED_SQL('t')}`);
    // Planned period overlaps [from, to].
    if (query.from) where.add(`t.planned_end >= ${where.param(query.from)}`);
    if (query.to) where.add(`t.planned_start <= ${where.param(query.to)}`);
    if (query.search) {
      const n = searchNumber(query.search, 'task');
      const name = `t.name ILIKE ${where.param(likePattern(query.search))}`;
      where.add(n !== undefined ? `(${name} OR t.number = ${where.param(n)})` : name);
    }

    const sort = orderBy(
      query.sortBy,
      {
        id: 't.number',
        name: 't.name',
        startDate: 't.planned_start',
        endDate: 't.planned_end',
        dependents: 't.dependents_count',
      },
      'id',
      query.order,
      't.number',
    );

    const rows = await this.db.query(
      `SELECT ${TASK_COLUMNS('t')}, count(*) OVER() AS total
         FROM tasks t ${where.sql()}
         ${sort}
        LIMIT ${where.param(query.limit)} OFFSET ${where.param(query.offset)}`,
      where.params,
    );

    // Direct dependencies for just this page of tasks.
    const deps = await this.directDependencies(rows.map((r) => r.id));
    const items = stripTotal(rows).map((r) => ({ ...r, dependsOn: deps.get(r.id) ?? [] }));
    return paginate(items, rows[0]?.total ?? 0, query);
  }

  /**
   * Task details screen (6): the task, the status actions allowed right now,
   * every task it waits on and every task that waits on it (direct or
   * indirect), each with its distance in steps.
   */
  async get(user: AuthUser, projectCode: string, taskCode: string) {
    const access = await this.access.resolve(user, projectCode);
    return this.details(access, await this.findTask(this.db, access, taskCode));
  }

  async create(user: AuthUser, projectCode: string, dto: CreateTaskDto) {
    const access = await this.access.resolve(user, projectCode);
    assertDateOrder(dto.plannedStart, dto.plannedEnd, 'planned dates');

    const task = await this.db.transaction(async (tx) => {
      await this.lockGraph(tx, access.projectId);
      const prerequisites = await this.resolveCodes(tx, access, dto.dependsOn ?? []);

      // Per-project counter: concurrency-safe (row lock) and never reused.
      const counter = await tx.one<{ number: number }>(
        `UPDATE projects SET last_task_number = last_task_number + 1
          WHERE id = $1 RETURNING last_task_number AS number`,
        [access.projectId],
      );
      const created = await tx.one<TaskRow>(
        `INSERT INTO tasks (project_id, number, name, planned_start, planned_end)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, number, status, open_deps_count`,
        [access.projectId, counter!.number, dto.name, dto.plannedStart, dto.plannedEnd],
      );
      // A brand-new task has no dependents, so these edges cannot form a cycle.
      if (prerequisites.length) {
        await tx.query(
          `INSERT INTO task_dependencies (task_id, depends_on_id, project_id)
           SELECT $1, unnest($2::bigint[]), $3`,
          [created!.id, prerequisites.map((p) => p.id), access.projectId],
        );
      }
      return created!;
    });
    return this.details(access, task);
  }

  async update(user: AuthUser, projectCode: string, taskCode: string, dto: UpdateTaskDto) {
    const access = await this.access.resolve(user, projectCode);
    const task = await this.findTask(this.db, access, taskCode);
    const current = await this.db.one(`SELECT planned_start, planned_end FROM tasks WHERE id = $1`, [task.id]);
    assertDateOrder(dto.plannedStart ?? current.planned_start, dto.plannedEnd ?? current.planned_end, 'planned dates');

    await this.db.query(
      `UPDATE tasks
          SET name          = coalesce($2, name),
              planned_start = coalesce($3, planned_start),
              planned_end   = coalesce($4, planned_end),
              updated_at    = now()
        WHERE id = $1`,
      [task.id, dto.name ?? null, dto.plannedStart ?? null, dto.plannedEnd ?? null],
    );
    return this.details(access, task);
  }

  /** Deletes a task and its dependency links. Its ID is never reused. */
  async remove(user: AuthUser, projectCode: string, taskCode: string) {
    const access = await this.access.resolve(user, projectCode);
    await this.db.transaction(async (tx) => {
      await this.lockGraph(tx, access.projectId);
      const task = await this.findTask(tx, access, taskCode);
      // Edges first: the counter triggers need the task row to still exist.
      await tx.query(`DELETE FROM task_dependencies WHERE task_id = $1 OR depends_on_id = $1`, [task.id]);
      await tx.query(`DELETE FROM tasks WHERE id = $1`, [task.id]);
    });
    return { deleted: true };
  }

  /** Start / Mark as done / Reopen. Any other change of status is rejected. */
  async transition(user: AuthUser, projectCode: string, taskCode: string, action: TaskAction) {
    const access = await this.access.resolve(user, projectCode);
    const task = await this.db.transaction(async (tx) => {
      await this.lockGraph(tx, access.projectId);
      const current = await this.findTask(tx, access, taskCode);
      const state = await this.state(tx, current);
      const reason = rejectionReason(action, state);
      if (reason) throw new ConflictException(reason);

      const target = ACTION_TARGET[action];
      await tx.query(
        `UPDATE tasks
            SET status = $2::task_status,
                started_at   = CASE WHEN $3::text = 'START' THEN now() ELSE started_at END,
                completed_at = CASE WHEN $2::task_status = 'DONE' THEN now() ELSE NULL END,
                updated_at   = now()
          WHERE id = $1`,
        [current.id, target, action],
      );
      return current;
    });
    return this.details(access, task);
  }

  /** Adds "task waits for dependsOn". Same project only, no cycles. */
  async addDependency(user: AuthUser, projectCode: string, taskCode: string, dependsOnCode: string) {
    const access = await this.access.resolve(user, projectCode);
    const task = await this.db.transaction(async (tx) => {
      await this.lockGraph(tx, access.projectId);
      const task = await this.findTask(tx, access, taskCode);
      const [prerequisite] = await this.resolveCodes(tx, access, [dependsOnCode]);

      if (prerequisite.id === task.id) throw new BadRequestException('A task cannot depend on itself');

      const graph = buildGraph(await this.edges(tx, access.projectId));
      if (graph.dependsOn.get(task.id)?.includes(prerequisite.id)) {
        throw new ConflictException('This dependency already exists');
      }
      if (createsCycle(task.id, prerequisite.id, graph)) {
        throw new ConflictException('This dependency would make the task wait on itself (circular dependency)');
      }
      // Keep the invariant from task-rules.ts: a started task may only wait on done tasks.
      if (task.status !== TaskStatus.NOT_STARTED && prerequisite.status !== TaskStatus.DONE) {
        throw new ConflictException('A task that has started can only depend on tasks that are done');
      }

      await tx.query(`INSERT INTO task_dependencies (task_id, depends_on_id, project_id) VALUES ($1, $2, $3)`, [
        task.id,
        prerequisite.id,
        access.projectId,
      ]);
      return task;
    });
    return this.details(access, task);
  }

  async removeDependency(user: AuthUser, projectCode: string, taskCode: string, dependsOnCode: string) {
    const access = await this.access.resolve(user, projectCode);
    const task = await this.db.transaction(async (tx) => {
      await this.lockGraph(tx, access.projectId);
      const task = await this.findTask(tx, access, taskCode);
      const [prerequisite] = await this.resolveCodes(tx, access, [dependsOnCode]);
      const removed = await tx.query(
        `DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_id = $2 RETURNING task_id`,
        [task.id, prerequisite.id],
      );
      if (!removed.length) throw new NotFoundException('Dependency not found');
      return task;
    });
    return this.details(access, task);
  }

  // ---------------------------------------------------------------------------

  private async details(access: ProjectAccess, task: Pick<TaskRow, 'id'>) {
    const row = await this.db.one(
      `SELECT ${TASK_COLUMNS('t')},
              t.started_at AS "startedAt", t.completed_at AS "completedAt",
              t.created_at AS "createdAt", t.updated_at AS "updatedAt",
              t.number, t.open_deps_count
         FROM tasks t WHERE t.id = $1`,
      [task.id],
    );
    if (!row) throw new NotFoundException('Task not found');

    // Walk the project's graph in memory: one query for the edges, then BFS.
    const graph = buildGraph(await this.edges(this.db, access.projectId));
    const waitsOn = distancesFrom(row.id, graph.dependsOn);
    const waitedOnBy = distancesFrom(row.id, graph.dependents);

    const related = await this.db.query(
      `SELECT ${TASK_COLUMNS('t')}, t.number FROM tasks t WHERE t.id = ANY($1::bigint[])`,
      [[...waitsOn.keys(), ...waitedOnBy.keys()]],
    );
    const byId = new Map(related.map((r) => [r.id, r]));
    const withDistance = (distances: Map<number, number>) =>
      [...distances.entries()]
        .map(([id, distance]) => {
          const { number: _n, ...t } = byId.get(id);
          return { ...t, distance, direct: distance === 1 };
        })
        .sort((a, b) => a.distance - b.distance || a.code.localeCompare(b.code));

    const directDependents = graph.dependents.get(row.id) ?? [];
    const hasStartedDependents = directDependents.some((id) => byId.get(id)?.status !== TaskStatus.NOT_STARTED);

    const { number: _number, open_deps_count, ...task_ } = row;
    return {
      ...task_,
      project: { code: access.code, name: access.name },
      allowedActions: allowedActions({ status: row.status, openDependencies: open_deps_count, hasStartedDependents }),
      waitsOn: withDistance(waitsOn),
      waitedOnBy: withDistance(waitedOnBy),
    };
  }

  private async state(tx: Queryable, task: TaskRow) {
    // Re-check from the source tables (not the counter) inside the lock.
    const row = await tx.one<{ open: number; started_dependents: number }>(
      `SELECT
         (SELECT count(*) FROM task_dependencies d JOIN tasks p ON p.id = d.depends_on_id
           WHERE d.task_id = $1 AND p.status <> 'DONE')::int AS open,
         (SELECT count(*) FROM task_dependencies d JOIN tasks c ON c.id = d.task_id
           WHERE d.depends_on_id = $1 AND c.status <> 'NOT_STARTED')::int AS started_dependents`,
      [task.id],
    );
    return {
      status: task.status,
      openDependencies: row!.open,
      hasStartedDependents: row!.started_dependents > 0,
    };
  }

  private async lockGraph(tx: Queryable, projectId: number) {
    await tx.query(`SELECT pg_advisory_xact_lock($1, $2)`, [TASK_GRAPH_LOCK, projectId]);
  }

  private edges(db: Queryable, projectId: number): Promise<Edge[]> {
    return db.query<Edge>(
      `SELECT task_id AS "taskId", depends_on_id AS "dependsOnId" FROM task_dependencies WHERE project_id = $1`,
      [projectId],
    );
  }

  /** Finds a task by code inside the given project; 404 otherwise. */
  private async findTask(db: Queryable, access: ProjectAccess, taskCode: string): Promise<TaskRow> {
    const parsed = parseTaskCode(taskCode);
    if (!parsed || parsed.projectId !== access.projectId) throw new NotFoundException('Task not found');
    const task = await db.one<TaskRow>(
      `SELECT id, number, status, open_deps_count FROM tasks WHERE project_id = $1 AND number = $2`,
      [access.projectId, parsed.number],
    );
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  /** Resolves task codes that must all belong to this project. */
  private async resolveCodes(db: Queryable, access: ProjectAccess, codes: string[]): Promise<TaskRow[]> {
    const numbers: number[] = [];
    for (const code of new Set(codes.map((c) => c.toUpperCase()))) {
      const parsed = parseTaskCode(code);
      if (!parsed) throw new BadRequestException(`"${code}" is not a valid task ID`);
      if (parsed.projectId !== access.projectId) {
        throw new BadRequestException('Dependencies can only link tasks in the same project');
      }
      numbers.push(parsed.number);
    }
    if (!numbers.length) return [];
    const rows = await db.query<TaskRow>(
      `SELECT id, number, status, open_deps_count FROM tasks WHERE project_id = $1 AND number = ANY($2::int[])`,
      [access.projectId, numbers],
    );
    if (rows.length !== numbers.length) throw new BadRequestException('Some dependency tasks do not exist');
    return rows;
  }

  private async directDependencies(taskIds: number[]) {
    const map = new Map<number, { code: string; name: string; status: TaskStatus }[]>();
    if (!taskIds.length) return map;
    const rows = await this.db.query(
      `SELECT d.task_id AS "taskId",
              json_agg(json_build_object('code', p.code, 'name', p.name, 'status', p.status) ORDER BY p.number) AS deps
         FROM task_dependencies d JOIN tasks p ON p.id = d.depends_on_id
        WHERE d.task_id = ANY($1::bigint[])
        GROUP BY d.task_id`,
      [taskIds],
    );
    for (const row of rows) map.set(row.taskId, row.deps);
    return map;
  }
}
