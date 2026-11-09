import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { DatabaseService, Queryable } from '../../database/database.service';
import { ProjectAccessService } from '../projects/project-access.service';

/** Advisory-lock namespace for membership changes of one project. */
const MEMBERSHIP_LOCK = 2;

/**
 * Members and invitations (screen 9).
 *
 * Every change that could remove the last project admin (demote, remove,
 * leave) runs in a transaction holding a per-project advisory lock, so two
 * admins demoting each other at the same moment cannot leave a project with
 * no admin at all.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: ProjectAccessService,
  ) {}

  async listMembers(user: AuthUser, code: string) {
    const { projectId } = await this.access.resolve(user, code);
    return this.db.query(
      `SELECT u.id AS "userId", u.name, u.email, m.is_admin AS "isAdmin", m.joined_at AS "joinedAt"
         FROM project_members m JOIN users u ON u.id = m.user_id
        WHERE m.project_id = $1
        ORDER BY m.is_admin DESC, u.name, u.id`,
      [projectId],
    );
  }

  /** Invitations that have not been answered yet. */
  async listPendingInvitations(user: AuthUser, code: string) {
    const { projectId } = await this.access.resolve(user, code);
    return this.db.query(
      `SELECT i.id, i.created_at AS "createdAt",
              json_build_object('id', u.id, 'name', u.name, 'email', u.email) AS invitee,
              json_build_object('id', b.id, 'name', b.name) AS "invitedBy"
         FROM project_invitations i
         JOIN users u ON u.id = i.user_id
         LEFT JOIN users b ON b.id = i.invited_by
        WHERE i.project_id = $1 AND i.status = 'PENDING'
        ORDER BY i.created_at DESC, i.id DESC`,
      [projectId],
    );
  }

  /** Project admins invite any other registered user by email. */
  async invite(user: AuthUser, code: string, email: string) {
    const { projectId } = await this.access.resolveAdmin(user, code);
    const invitee = await this.db.one<{ id: number; is_member: boolean }>(
      `SELECT u.id, EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = $2 AND m.user_id = u.id) AS is_member
         FROM users u WHERE lower(u.email) = $1`,
      [email, projectId],
    );
    if (!invitee) throw new NotFoundException('No registered user has this email');
    if (invitee.is_member) throw new ConflictException('This person is already a member');

    try {
      return await this.db.one(
        `INSERT INTO project_invitations (project_id, user_id, invited_by)
         VALUES ($1, $2, $3)
         RETURNING id, status, created_at AS "createdAt"`,
        [projectId, invitee.id, user.id],
      );
    } catch (err) {
      // Partial unique index: one PENDING invitation per (project, user).
      if (err.code === '23505') throw new ConflictException('This person already has a pending invitation');
      throw err;
    }
  }

  /** Withdraw an invitation that has not been answered yet. */
  async withdraw(user: AuthUser, code: string, invitationId: number) {
    const { projectId } = await this.access.resolveAdmin(user, code);
    const row = await this.db.one(
      `UPDATE project_invitations SET status = 'WITHDRAWN', responded_at = now()
        WHERE id = $1 AND project_id = $2 AND status = 'PENDING'
        RETURNING id, status`,
      [invitationId, projectId],
    );
    if (!row) throw new NotFoundException('No pending invitation with this id in the project');
    return row;
  }

  /** Make a member a project admin (or demote one, keeping at least one admin). */
  async setAdmin(user: AuthUser, code: string, memberId: number, isAdmin: boolean) {
    const { projectId } = await this.access.resolveAdmin(user, code);
    return this.db.transaction(async (tx) => {
      await this.lock(tx, projectId);
      const member = await this.lockedMember(tx, projectId, memberId);
      if (member.is_admin && !isAdmin) await this.assertAnotherAdmin(tx, projectId, memberId);
      await tx.query(`UPDATE project_members SET is_admin = $3 WHERE project_id = $1 AND user_id = $2`, [
        projectId,
        memberId,
        isAdmin,
      ]);
      return { userId: memberId, isAdmin };
    });
  }

  /**
   * Project admins remove members. Any member may also remove themselves
   * (leave). Removal is effective on the person's very next request.
   */
  async remove(user: AuthUser, code: string, memberId: number) {
    const access =
      memberId === user.id ? await this.access.resolve(user, code) : await this.access.resolveAdmin(user, code);
    if (!access.isMember) throw new NotFoundException('Not a member of this project');

    return this.db.transaction(async (tx) => {
      await this.lock(tx, access.projectId);
      const member = await this.lockedMember(tx, access.projectId, memberId);
      if (member.is_admin) await this.assertAnotherAdmin(tx, access.projectId, memberId);
      await tx.query(`DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, [
        access.projectId,
        memberId,
      ]);
      return { removed: true };
    });
  }

  private async lock(tx: Queryable, projectId: number) {
    await tx.query(`SELECT pg_advisory_xact_lock($1, $2)`, [MEMBERSHIP_LOCK, projectId]);
  }

  private async lockedMember(tx: Queryable, projectId: number, userId: number) {
    const member = await tx.one<{ is_admin: boolean }>(
      `SELECT is_admin FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId],
    );
    if (!member) throw new NotFoundException('Member not found in this project');
    return member;
  }

  private async assertAnotherAdmin(tx: Queryable, projectId: number, exceptUserId: number) {
    const other = await tx.one(
      `SELECT 1 FROM project_members WHERE project_id = $1 AND is_admin AND user_id <> $2 LIMIT 1`,
      [projectId, exceptUserId],
    );
    if (!other) {
      throw new BadRequestException(
        'A project must always have at least one project admin. Promote someone else first.',
      );
    }
  }
}
