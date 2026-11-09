import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination.dto';
import { InvitationStatus } from '../../common/enums';
import { DatabaseService } from '../../database/database.service';
import { stripTotal } from '../projects/projects.service';

/**
 * Notifications screen (3). Today every notification is a project invitation,
 * so notifications are a view over `project_invitations` for the caller.
 * "Unread" means the person has not opened/answered it yet (`read_at` null).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthUser, query: PaginationQueryDto) {
    const rows = await this.db.query(
      `SELECT i.id, 'PROJECT_INVITATION' AS type, i.status,
              json_build_object('code', p.code, 'name', p.name) AS project,
              json_build_object('id', b.id, 'name', b.name) AS "invitedBy",
              i.created_at AS "createdAt", i.responded_at AS "respondedAt",
              (i.read_at IS NOT NULL) AS read,
              (i.status = 'PENDING') AS "canRespond",
              count(*) OVER() AS total
         FROM project_invitations i
         JOIN projects p ON p.id = i.project_id
         LEFT JOIN users b ON b.id = i.invited_by
        WHERE i.user_id = $1
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT $2 OFFSET $3`,
      [user.id, query.limit, query.offset],
    );
    const page = paginate(stripTotal(rows), rows[0]?.total ?? 0, query);
    return { ...page, unreadCount: await this.unreadCount(user) };
  }

  /** Badge shown on every page. Served by a partial index on unread rows. */
  async unreadCount(user: AuthUser): Promise<number> {
    const row = await this.db.one<{ count: number }>(
      `SELECT count(*)::int AS count FROM project_invitations WHERE user_id = $1 AND read_at IS NULL`,
      [user.id],
    );
    return row!.count;
  }

  async markRead(user: AuthUser, id: number) {
    const row = await this.db.one(
      `UPDATE project_invitations SET read_at = coalesce(read_at, now())
        WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user.id],
    );
    if (!row) throw new NotFoundException('Notification not found');
    return { id, read: true };
  }

  async markAllRead(user: AuthUser) {
    await this.db.query(`UPDATE project_invitations SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [
      user.id,
    ]);
    return { unreadCount: 0 };
  }

  /**
   * Accept or reject an invitation. Only the invited person can answer; for
   * anyone else the invitation simply does not exist (404). Accepting adds the
   * person as a regular (non-admin) member in the same transaction.
   */
  async respond(user: AuthUser, id: number, accept: boolean) {
    return this.db.transaction(async (tx) => {
      const invitation = await tx.one<{ project_id: number; status: InvitationStatus }>(
        `SELECT i.project_id, i.status FROM project_invitations i
           JOIN projects p ON p.id = i.project_id AND p.deleted_at IS NULL
          WHERE i.id = $1 AND i.user_id = $2
          FOR UPDATE OF i`,
        [id, user.id],
      );
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (invitation.status !== InvitationStatus.PENDING) {
        throw new ConflictException(`Invitation is already ${invitation.status.toLowerCase()}`);
      }

      const status = accept ? InvitationStatus.ACCEPTED : InvitationStatus.REJECTED;
      await tx.query(
        `UPDATE project_invitations
            SET status = $2, responded_at = now(), read_at = coalesce(read_at, now())
          WHERE id = $1`,
        [id, status],
      );
      if (accept) {
        await tx.query(
          `INSERT INTO project_members (project_id, user_id, is_admin) VALUES ($1, $2, false)
           ON CONFLICT DO NOTHING`,
          [invitation.project_id, user.id],
        );
      }
      const project = await tx.one(`SELECT code, name FROM projects WHERE id = $1`, [invitation.project_id]);
      return { id, status, project };
    });
  }
}
