import { ConflictException, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { assertDateOrder } from '../../common/dto/date-range';
import { paginate } from '../../common/dto/pagination.dto';
import { AppRole } from '../../common/enums';
import { likePattern, searchNumber } from '../../common/utils/ids';
import { orderBy, SqlWhere } from '../../common/utils/sql';
import { DatabaseService } from '../../database/database.service';
import { ProjectAccessService } from './project-access.service';
import { CreateProjectDto, ProjectListQueryDto, UpdateProjectDto } from './projects.dto';

/** SQL for a task being Late (see the brief's status table). Uses UTC "today". */
export const LATE_TASK_SQL = (t: string) =>
  `((${t}.status <> 'DONE' AND ${t}.planned_end < CURRENT_DATE)
    OR (${t}.status = 'NOT_STARTED' AND ${t}.planned_start < CURRENT_DATE))`;

/** Columns shared by the list and detail views. `late` and `v` are joined in. */
const PROJECT_COLUMNS = `
  p.id, p.code, p.name,
  p.planned_start AS "plannedStart", p.planned_end AS "plannedEnd",
  coalesce(v.is_admin, false) AS "isAdmin",
  (v.is_member IS TRUE) AS "isMember",
  p.member_count AS "memberCount",
  json_build_object(
    'notStarted', p.tasks_not_started,
    'inProgress', p.tasks_in_progress,
    'done',       p.tasks_done
  ) AS "taskCounts",
  (p.tasks_not_started + p.tasks_in_progress + p.tasks_done) AS "totalTasks",
  ${percentDoneSql('p')} AS "percentDone",
  coalesce(l.late, 0)::int AS "lateTasks",
  p.tasks_blocked AS "blockedTasks",
  p.created_at AS "createdAt"`;

function percentDoneSql(p: string): string {
  const total = `(${p}.tasks_not_started + ${p}.tasks_in_progress + ${p}.tasks_done)`;
  return `CASE WHEN ${total} = 0 THEN 0 ELSE round(${p}.tasks_done * 100.0 / ${total}, 1)::float END`;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: ProjectAccessService,
  ) {}

  /**
   * Projects screen (4).
   *
   * Performance: status counts, blocked counts and member counts are trigger-
   * maintained columns on `projects`, so the only aggregate computed here is
   * "late tasks", which depends on today's date. It is restricted to the
   * visible projects and served by two partial indexes (open tasks by end
   * date, not-started tasks by start date).
   */
  async list(user: AuthUser, query: ProjectListQueryDto) {
    const isSuperAdmin = user.role === AppRole.SUPER_ADMIN;
    const where = new SqlWhere([user.id]);
    where.add('p.deleted_at IS NULL');

    if (query.search) {
      const n = searchNumber(query.search, 'project');
      const name = `p.name ILIKE ${where.param(likePattern(query.search))}`;
      where.add(n !== undefined ? `(${name} OR p.id = ${where.param(n)})` : name);
    }

    // Users see only their projects; SuperAdmins see all of them.
    const visibility = isSuperAdmin
      ? `LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = $1`
      : `JOIN project_members m ON m.project_id = p.id AND m.user_id = $1`;

    const sort = orderBy(
      query.sortBy,
      {
        name: 'p.name',
        startDate: 'p.planned_start',
        percentDone: percentDoneSql('p'),
        lateTasks: 'coalesce(l.late, 0)',
      },
      'name',
      query.order,
      'p.id',
    );

    where.params.push(query.limit, query.offset);
    const limitIdx = where.params.length - 1;

    const rows = await this.db.query(
      `WITH v AS (
         SELECT p.id, m.is_admin, (m.user_id IS NOT NULL) AS is_member
           FROM projects p ${visibility}
          ${where.sql()}
       ),
       l AS (
         SELECT t.project_id, count(*) AS late
           FROM tasks t JOIN v ON v.id = t.project_id
          WHERE ${LATE_TASK_SQL('t')}
          GROUP BY t.project_id
       )
       SELECT ${PROJECT_COLUMNS}, count(*) OVER() AS total
         FROM v
         JOIN projects p ON p.id = v.id
         LEFT JOIN l ON l.project_id = p.id
        ${query.hasLateTasks ? 'WHERE coalesce(l.late, 0) > 0' : ''}
        ${sort}
        LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
      where.params,
    );
    return paginate(stripTotal(rows), rows[0]?.total ?? 0, query);
  }

  async get(user: AuthUser, code: string) {
    const { projectId } = await this.access.resolve(user, code);
    return this.findById(projectId, user.id);
  }

  /** Creating a project makes the creator its first project admin. */
  async create(user: AuthUser, dto: CreateProjectDto) {
    assertDateOrder(dto.plannedStart, dto.plannedEnd, 'planned dates');
    const id = await this.db.transaction(async (tx) => {
      const project = await tx.one<{ id: number }>(
        `INSERT INTO projects (name, planned_start, planned_end, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [dto.name, dto.plannedStart, dto.plannedEnd, user.id],
      );
      await tx.query(`INSERT INTO project_members (project_id, user_id, is_admin) VALUES ($1, $2, true)`, [
        project!.id,
        user.id,
      ]);
      return project!.id;
    });
    return this.findById(id, user.id);
  }

  /** Project admins edit name and planned dates. The ID never changes. */
  async update(user: AuthUser, code: string, dto: UpdateProjectDto) {
    const { projectId } = await this.access.resolveAdmin(user, code);
    const current = await this.db.one<{ planned_start: string; planned_end: string }>(
      `SELECT planned_start, planned_end FROM projects WHERE id = $1`,
      [projectId],
    );
    assertDateOrder(
      dto.plannedStart ?? current!.planned_start,
      dto.plannedEnd ?? current!.planned_end,
      'planned dates',
    );

    await this.db.query(
      `UPDATE projects
          SET name          = coalesce($2, name),
              planned_start = coalesce($3, planned_start),
              planned_end   = coalesce($4, planned_end),
              updated_at    = now()
        WHERE id = $1`,
      [projectId, dto.name ?? null, dto.plannedStart ?? null, dto.plannedEnd ?? null],
    );
    return this.findById(projectId, user.id);
  }

  /**
   * Removes a project (soft delete, so delivery history stays intact).
   * Refused while material is still on site or on its way, because that stock
   * would otherwise silently disappear: send it back to the company store first.
   */
  async remove(user: AuthUser, code: string) {
    const { projectId } = await this.access.resolveAdmin(user, code);
    await this.db.transaction(async (tx) => {
      // Lock the project so no delivery can start while we check.
      await tx.query(`SELECT id FROM projects WHERE id = $1 FOR UPDATE`, [projectId]);
      const blockers = await tx.one<{ in_transit: number; stocked: number }>(
        `SELECT
           (SELECT count(*) FROM deliveries WHERE project_id = $1 AND status = 'IN_TRANSIT')::int AS in_transit,
           (SELECT count(*) FROM project_stock WHERE project_id = $1 AND quantity > 0)::int AS stocked`,
        [projectId],
      );
      if (blockers!.in_transit > 0 || blockers!.stocked > 0) {
        throw new ConflictException(
          'Project still holds material or has deliveries in transit. Return all stock to the company store first.',
        );
      }
      await tx.query(`UPDATE projects SET deleted_at = now() WHERE id = $1`, [projectId]);
      await tx.query(
        `UPDATE project_invitations SET status = 'WITHDRAWN', responded_at = now()
          WHERE project_id = $1 AND status = 'PENDING'`,
        [projectId],
      );
    });
    return { deleted: true };
  }

  /** Lightweight project picker for the company store (managers & SuperAdmins). */
  async pickList(search: string | undefined, limit: number) {
    const params: unknown[] = [limit];
    let filter = '';
    if (search) {
      params.push(likePattern(search));
      const n = searchNumber(search, 'project');
      if (n !== undefined) params.push(n);
      filter = n !== undefined ? `AND (name ILIKE $2 OR id = $3)` : `AND name ILIKE $2`;
    }
    return this.db.query(
      `SELECT id, code, name FROM projects WHERE deleted_at IS NULL ${filter} ORDER BY name, id LIMIT $1`,
      params,
    );
  }

  private async findById(projectId: number, userId: number) {
    const row = await this.db.one(
      `WITH v AS (
         SELECT p.id, m.is_admin, (m.user_id IS NOT NULL) AS is_member
           FROM projects p
           LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = $2
          WHERE p.id = $1
       ),
       l AS (
         SELECT t.project_id, count(*) AS late FROM tasks t
          WHERE t.project_id = $1 AND ${LATE_TASK_SQL('t')}
          GROUP BY t.project_id
       )
       SELECT ${PROJECT_COLUMNS}
         FROM v JOIN projects p ON p.id = v.id
         LEFT JOIN l ON l.project_id = p.id`,
      [projectId, userId],
    );
    if (!row) throw this.access.notFound();
    return row;
  }
}

/** Removes the window-function `total` column from list rows. */
export function stripTotal<T extends { total?: unknown }>(rows: T[]): Omit<T, 'total'>[] {
  return rows.map(({ total: _total, ...rest }) => rest);
}
