import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assertDateOrder } from '../../common/dto/date-range';
import { paginate } from '../../common/dto/pagination.dto';
import { DeliveryDirection, DeliveryStatus } from '../../common/enums';
import { SqlWhere } from '../../common/utils/sql';
import { DatabaseService } from '../../database/database.service';
import { stripTotal } from '../projects/projects.service';
import { DeliveryListQueryDto, StockLineDto } from './deliveries.dto';
import { addToCompany, addToProject, takeFromCompany, takeFromProject, validateLines } from './stock-movements';

/** Which store the caller is acting for. */
export type StoreSide = 'COMPANY' | 'PROJECT';

export type DeliveryAction = 'RECORD' | 'REJECT' | 'CANCEL';

/**
 * Deliveries move material between the company store and ONE project store,
 * in either direction (project stores never deliver to each other, because a
 * delivery always has the company store on one end).
 *
 *   initiate -> IN_TRANSIT   stock leaves the sender immediately
 *   record   -> DELIVERED    receiver: stock joins the receiver
 *   reject   -> REJECTED     receiver: stock returns to the sender
 *   cancel   -> CANCELLED    sender:   stock returns to the sender
 *
 * Each step is one transaction (all or nothing). Deliveries are never edited
 * after they are initiated; only their status moves forward once.
 */
@Injectable()
export class DeliveriesService {
  constructor(private readonly db: DatabaseService) {}

  /** Sender side starts a delivery. Returns the created delivery. */
  async initiate(side: StoreSide, projectId: number, userId: number, lines: StockLineDto[], note?: string) {
    const direction = side === 'COMPANY' ? DeliveryDirection.TO_PROJECT : DeliveryDirection.TO_COMPANY;
    const sorted = [...lines].sort((a, b) => a.materialId - b.materialId);

    const id = await this.db.transaction(async (tx) => {
      // FOR SHARE: the project cannot be deleted while this delivery is created.
      const project = await tx.one(`SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL FOR SHARE`, [
        projectId,
      ]);
      if (!project) throw new NotFoundException('Project not found');
      await validateLines(tx, sorted);

      if (direction === DeliveryDirection.TO_PROJECT) await takeFromCompany(tx, sorted);
      else await takeFromProject(tx, projectId, sorted);

      const delivery = await tx.one<{ id: number }>(
        `INSERT INTO deliveries (project_id, direction, note, line_count, sent_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [projectId, direction, note ?? null, sorted.length, userId],
      );
      await tx.query(
        `INSERT INTO delivery_lines (delivery_id, material_id, quantity)
         SELECT $1, * FROM unnest($2::bigint[], $3::numeric[])`,
        [delivery!.id, sorted.map((l) => l.materialId), sorted.map((l) => l.quantity)],
      );
      return delivery!.id;
    });
    return this.get(side, id, side === 'PROJECT' ? projectId : undefined);
  }

  /**
   * Record / reject (receiver) or cancel (sender) an in-transit delivery.
   * `projectId` scopes project-side calls so a member of one project can never
   * touch another project's delivery (it is simply "not found").
   */
  async settle(side: StoreSide, deliveryId: number, action: DeliveryAction, userId: number, projectId?: number) {
    await this.db.transaction(async (tx) => {
      const delivery = await tx.one<{ project_id: number; direction: DeliveryDirection; status: DeliveryStatus }>(
        `SELECT project_id, direction, status FROM deliveries
          WHERE id = $1 AND ($2::int IS NULL OR project_id = $2)
          FOR UPDATE`,
        [deliveryId, projectId ?? null],
      );
      if (!delivery) throw new NotFoundException('Delivery not found');

      const sender: StoreSide = delivery.direction === DeliveryDirection.TO_PROJECT ? 'COMPANY' : 'PROJECT';
      const isSender = side === sender;
      if (action === 'CANCEL' && !isSender) throw new ForbiddenException('Only the sending store can cancel');
      if (action !== 'CANCEL' && isSender) {
        throw new ForbiddenException('Only the receiving store can record or reject a delivery');
      }
      if (delivery.status !== DeliveryStatus.IN_TRANSIT) {
        throw new ConflictException(`Delivery is already ${delivery.status.toLowerCase().replace('_', ' ')}`);
      }

      const lines = await tx.query<StockLineDto>(
        `SELECT material_id AS "materialId", quantity FROM delivery_lines
          WHERE delivery_id = $1 ORDER BY material_id`,
        [deliveryId],
      );

      const toProject = delivery.direction === DeliveryDirection.TO_PROJECT;
      if (action === 'RECORD') {
        // Stock joins the receiver.
        if (toProject) {
          await addToProject(tx, delivery.project_id, lines, { touchLastDelivery: true });
          await addToCompany(tx, lines, { restock: false, releaseInTransit: true });
        } else {
          await addToCompany(tx, lines, { restock: true, releaseInTransit: false });
        }
      } else if (toProject) {
        // Rejected / cancelled: stock returns to the company store.
        await addToCompany(tx, lines, { restock: true, releaseInTransit: true });
      } else {
        // Rejected / cancelled: stock returns to the project store.
        await addToProject(tx, delivery.project_id, lines, { touchLastDelivery: false });
      }

      const status = { RECORD: 'DELIVERED', REJECT: 'REJECTED', CANCEL: 'CANCELLED' }[action];
      await tx.query(`UPDATE deliveries SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1`, [
        deliveryId,
        status,
        userId,
      ]);
    });
    return this.get(side, deliveryId, projectId);
  }

  /**
   * Delivery lists (screens 8 and 11), newest first. Material lines are only
   * aggregated for the requested page, never for the whole table.
   */
  async list(side: StoreSide, query: DeliveryListQueryDto, projectId?: number) {
    assertDateOrder(query.from, query.to);
    const where = new SqlWhere();
    if (projectId !== undefined) where.add(`d.project_id = ${where.param(projectId)}`);
    if (query.direction) where.add(`d.direction = ${where.param(query.direction)}`);
    if (query.status?.length) where.add(`d.status = ANY(${where.param(query.status)}::delivery_status[])`);
    if (query.from) where.add(`d.sent_at >= ${where.param(query.from)}::date`);
    if (query.to) where.add(`d.sent_at < ${where.param(query.to)}::date + 1`);

    const rows = await this.db.query(
      `WITH page AS (
         SELECT d.*, count(*) OVER() AS total
           FROM deliveries d ${where.sql()}
          ORDER BY d.sent_at DESC, d.id DESC
          LIMIT ${where.param(query.limit)} OFFSET ${where.param(query.offset)}
       )
       ${this.selectDeliveries('page', where.param(side))}
       ORDER BY d.sent_at DESC, d.id DESC`,
      where.params,
    );
    return paginate(stripTotal(rows), rows[0]?.total ?? 0, query);
  }

  async get(side: StoreSide, deliveryId: number, projectId?: number) {
    const row = await this.db.one(
      `WITH page AS (
         SELECT d.*, 0 AS total FROM deliveries d
          WHERE d.id = $1 AND ($2::int IS NULL OR d.project_id = $2)
       )
       ${this.selectDeliveries('page', '$3')}`,
      [deliveryId, projectId ?? null, side],
    );
    if (!row) throw new NotFoundException('Delivery not found');
    const { total: _total, ...delivery } = row;
    return delivery;
  }

  /**
   * Shared projection. `allowedActions` is computed from the viewer's side
   * ($side): the receiver may RECORD/REJECT, the sender may CANCEL, and only
   * while the delivery is in transit.
   */
  private selectDeliveries(source: string, sideParam: string): string {
    return `
      SELECT d.id, d.direction, d.status, d.note, d.line_count AS "lineCount",
             (CASE WHEN ${sideParam} = 'PROJECT' THEN d.direction = 'TO_PROJECT'
                   ELSE d.direction = 'TO_COMPANY' END) AS incoming,
             json_build_object('code', p.code, 'name', p.name) AS project,
             d.sent_at AS "sentAt",
             json_build_object('id', su.id, 'name', su.name) AS "sentBy",
             CASE WHEN d.status = 'DELIVERED' THEN d.resolved_at END AS "receivedAt",
             CASE WHEN d.status = 'DELIVERED' THEN json_build_object('id', ru.id, 'name', ru.name) END AS "receivedBy",
             d.resolved_at AS "resolvedAt",
             CASE WHEN ru.id IS NOT NULL THEN json_build_object('id', ru.id, 'name', ru.name) END AS "resolvedBy",
             CASE WHEN d.status <> 'IN_TRANSIT' THEN '[]'::json
                  WHEN (${sideParam} = 'PROJECT') = (d.direction = 'TO_PROJECT') THEN '["RECORD","REJECT"]'::json
                  ELSE '["CANCEL"]'::json END AS "allowedActions",
             (SELECT json_agg(json_build_object(
                       'materialId', m.id, 'name', m.name, 'unit', m.unit, 'quantity', l.quantity)
                     ORDER BY m.name)
                FROM delivery_lines l JOIN materials m ON m.id = l.material_id
               WHERE l.delivery_id = d.id) AS materials,
             d.total
        FROM ${source} d
        JOIN projects p ON p.id = d.project_id
        LEFT JOIN users su ON su.id = d.sent_by
        LEFT JOIN users ru ON ru.id = d.resolved_by`;
  }
}
