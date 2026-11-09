import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { AppRole } from '../../common/enums';
import { parseProjectCode } from '../../common/utils/ids';
import { DatabaseService, Queryable } from '../../database/database.service';

/** What the caller may do inside one project. */
export interface ProjectAccess {
  projectId: number;
  code: string;
  name: string;
  isMember: boolean;
  isAdmin: boolean;
}

/**
 * The single gate in front of everything that lives inside a project
 * (tasks, store, deliveries, members, invitations).
 *
 * Rules (from the brief):
 *  - Members can read and work in their project.
 *  - SuperAdmins can reach every project, member or not.
 *  - Anyone else gets 404 "Project not found" - exactly the same answer as for
 *    a project that does not exist, so guessing IDs reveals nothing.
 *  - Project-admin-only actions return 403 for plain members (they already
 *    know the project exists, so a 403 leaks nothing).
 *
 * Membership is read from the database on every request, so removing a member
 * takes effect on their very next call.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly db: DatabaseService) {}

  async resolve(user: AuthUser, code: string, db: Queryable = this.db): Promise<ProjectAccess> {
    const projectId = parseProjectCode(code);
    if (projectId === undefined) throw this.notFound();

    const row = await db.one<{ id: number; code: string; name: string; is_member: boolean; is_admin: boolean }>(
      `SELECT p.id, p.code, p.name,
              (m.user_id IS NOT NULL) AS is_member,
              coalesce(m.is_admin, false) AS is_admin
         FROM projects p
         LEFT JOIN project_members m ON m.project_id = p.id AND m.user_id = $2
        WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [projectId, user.id],
    );

    if (!row || (!row.is_member && user.role !== AppRole.SUPER_ADMIN)) throw this.notFound();

    return {
      projectId: row.id,
      code: row.code,
      name: row.name,
      isMember: row.is_member,
      isAdmin: row.is_admin,
    };
  }

  /** Like resolve(), but also requires the caller to be a project admin. */
  async resolveAdmin(user: AuthUser, code: string, db: Queryable = this.db): Promise<ProjectAccess> {
    const access = await this.resolve(user, code, db);
    if (!access.isAdmin) throw new ForbiddenException('Only project admins can do this');
    return access;
  }

  notFound(): NotFoundException {
    return new NotFoundException('Project not found');
  }
}
