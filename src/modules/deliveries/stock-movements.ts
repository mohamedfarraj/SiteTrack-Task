import { BadRequestException, ConflictException } from '@nestjs/common';
import { Queryable } from '../../database/database.service';
import { StockLineDto } from './deliveries.dto';

/**
 * Low-level stock movements, always called inside a transaction.
 *
 * Concurrency rules that keep stores from ever going negative:
 *  1. Rows are locked with SELECT ... FOR UPDATE *in material_id order*, so
 *     two transactions touching overlapping materials always lock in the same
 *     order and cannot deadlock.
 *  2. The availability check happens after the lock, so it cannot be
 *     invalidated by a parallel delivery.
 *  3. CHECK (quantity >= 0) on the tables is the final safety net.
 */

/** Rejects duplicate materials in one request and unknown material ids. */
export async function validateLines(tx: Queryable, lines: StockLineDto[]): Promise<void> {
  const ids = lines.map((l) => l.materialId);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException('Each material may appear only once per request');
  }
  const found = await tx.one<{ n: number }>(`SELECT count(*)::int AS n FROM materials WHERE id = ANY($1::bigint[])`, [
    ids,
  ]);
  if (found!.n !== ids.length) throw new BadRequestException('Some materials do not exist');
}

const arrays = (lines: StockLineDto[]) => [lines.map((l) => l.materialId), lines.map((l) => l.quantity)];

/** Takes stock out of the company store and marks it "in transit to projects". */
export async function takeFromCompany(tx: Queryable, lines: StockLineDto[]): Promise<void> {
  const [ids, qty] = arrays(lines);
  const short = await tx.query(
    `WITH req AS (SELECT * FROM unnest($1::bigint[], $2::numeric[]) AS r(material_id, quantity)),
          locked AS (SELECT cs.material_id, cs.quantity FROM company_stock cs
                      WHERE cs.material_id = ANY($1::bigint[]) ORDER BY cs.material_id FOR UPDATE)
     SELECT m.name, coalesce(l.quantity, 0) AS available, req.quantity AS requested
       FROM req JOIN materials m ON m.id = req.material_id
       LEFT JOIN locked l ON l.material_id = req.material_id
      WHERE coalesce(l.quantity, 0) < req.quantity`,
    [ids, qty],
  );
  throwIfShort(short, 'the company store');
  await tx.query(
    `UPDATE company_stock cs
        SET quantity = cs.quantity - r.quantity,
            in_transit_out = cs.in_transit_out + r.quantity,
            updated_at = now()
       FROM unnest($1::bigint[], $2::numeric[]) AS r(material_id, quantity)
      WHERE cs.material_id = r.material_id`,
    [ids, qty],
  );
}

/** Takes stock out of a project store (delivery back to the company store). */
export async function takeFromProject(tx: Queryable, projectId: number, lines: StockLineDto[]): Promise<void> {
  const [ids, qty] = arrays(lines);
  const short = await tx.query(
    `WITH req AS (SELECT * FROM unnest($2::bigint[], $3::numeric[]) AS r(material_id, quantity)),
          locked AS (SELECT ps.material_id, ps.quantity FROM project_stock ps
                      WHERE ps.project_id = $1 AND ps.material_id = ANY($2::bigint[])
                      ORDER BY ps.material_id FOR UPDATE)
     SELECT m.name, coalesce(l.quantity, 0) AS available, req.quantity AS requested
       FROM req JOIN materials m ON m.id = req.material_id
       LEFT JOIN locked l ON l.material_id = req.material_id
      WHERE coalesce(l.quantity, 0) < req.quantity`,
    [projectId, ids, qty],
  );
  throwIfShort(short, 'the project store');
  await tx.query(
    `UPDATE project_stock ps
        SET quantity = ps.quantity - r.quantity, last_delivery_at = now()
       FROM unnest($2::bigint[], $3::numeric[]) AS r(material_id, quantity)
      WHERE ps.project_id = $1 AND ps.material_id = r.material_id`,
    [projectId, ids, qty],
  );
}

/**
 * Adds to the company store.
 *  - restock:          add the quantities to the shelf stock.
 *  - releaseInTransit: subtract them from "in transit to projects" (used when a
 *                      company->project delivery is recorded, rejected or cancelled).
 */
export async function addToCompany(
  tx: Queryable,
  lines: StockLineDto[],
  opts: { releaseInTransit: boolean; restock: boolean },
): Promise<void> {
  const [ids, qty] = arrays(lines);
  await tx.query(
    `SELECT material_id FROM company_stock WHERE material_id = ANY($1::bigint[]) ORDER BY material_id FOR UPDATE`,
    [ids],
  );
  await tx.query(
    `UPDATE company_stock cs
        SET quantity       = cs.quantity + CASE WHEN $3 THEN r.quantity ELSE 0 END,
            in_transit_out = cs.in_transit_out - CASE WHEN $4 THEN r.quantity ELSE 0 END,
            updated_at     = now()
       FROM unnest($1::bigint[], $2::numeric[]) AS r(material_id, quantity)
      WHERE cs.material_id = r.material_id`,
    [ids, qty, opts.restock, opts.releaseInTransit],
  );
}

/** Adds stock to a project store, creating rows the first time a material arrives. */
export async function addToProject(
  tx: Queryable,
  projectId: number,
  lines: StockLineDto[],
  opts: { touchLastDelivery: boolean },
): Promise<void> {
  const [ids, qty] = arrays(lines);
  await tx.query(
    `INSERT INTO project_stock (project_id, material_id, quantity, last_delivery_at)
     SELECT $1, r.material_id, r.quantity, CASE WHEN $4 THEN now() END
       FROM unnest($2::bigint[], $3::numeric[]) AS r(material_id, quantity)
      ORDER BY r.material_id
     ON CONFLICT (project_id, material_id) DO UPDATE
        SET quantity = project_stock.quantity + EXCLUDED.quantity,
            last_delivery_at = CASE WHEN $4 THEN now() ELSE project_stock.last_delivery_at END`,
    [projectId, ids, qty, opts.touchLastDelivery],
  );
}

function throwIfShort(short: { name: string; available: number; requested: number }[], store: string): void {
  if (!short.length) return;
  const detail = short.map((s) => `${s.name} (available ${s.available}, requested ${s.requested})`).join('; ');
  throw new ConflictException(`Not enough stock in ${store}: ${detail}`);
}
