import { Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto';
import { likePattern } from '../../common/utils/ids';
import { orderBy, SqlWhere } from '../../common/utils/sql';
import { DatabaseService } from '../../database/database.service';
import { StockLineDto } from '../deliveries/deliveries.dto';
import { addToCompany, validateLines } from '../deliveries/stock-movements';
import { stripTotal } from '../projects/projects.service';
import { CompanyStockQueryDto, ProjectStockQueryDto } from './stores.dto';

/** Company store stock status (brief: Out of stock / Low stock / Available). */
const STOCK_STATUS_SQL = `CASE WHEN cs.quantity = 0 THEN 'OUT_OF_STOCK'
                               WHEN cs.quantity <= cs.reorder_point THEN 'LOW_STOCK'
                               ELSE 'AVAILABLE' END`;
/** Sort rank so "status" sorts from most to least urgent. */
const STOCK_STATUS_RANK = `CASE WHEN cs.quantity = 0 THEN 0 WHEN cs.quantity <= cs.reorder_point THEN 1 ELSE 2 END`;

@Injectable()
export class StoresService {
  constructor(private readonly db: DatabaseService) {}

  /** Company store: Stock screen (10). Every material appears, even at 0. */
  async companyStock(query: CompanyStockQueryDto) {
    const where = new SqlWhere();
    if (query.search) where.add(`m.name ILIKE ${where.param(likePattern(query.search))}`);
    if (query.category) where.add(`m.category = ${where.param(query.category)}`);
    if (query.status?.length) where.add(`${STOCK_STATUS_SQL} = ANY(${where.param(query.status)}::text[])`);

    const sort = orderBy(
      query.sortBy,
      { name: 'm.name', quantity: 'cs.quantity', status: STOCK_STATUS_RANK },
      'name',
      query.order,
      'm.id',
    );
    const rows = await this.db.query(
      `SELECT m.id AS "materialId", m.name, m.category, m.unit,
              cs.quantity, cs.in_transit_out AS "inTransitToProjects",
              cs.reorder_point AS "reorderPoint", ${STOCK_STATUS_SQL} AS status,
              cs.updated_at AS "updatedAt",
              count(*) OVER() AS total
         FROM company_stock cs JOIN materials m ON m.id = cs.material_id
         ${where.sql()} ${sort}
        LIMIT ${where.param(query.limit)} OFFSET ${where.param(query.offset)}`,
      where.params,
    );
    return paginate(stripTotal(rows), rows[0]?.total ?? 0, query);
  }

  /**
   * Adds supplier stock to the company store - the only way new material
   * enters SiteTrack. All lines are applied in one transaction and logged in
   * `stock_additions`.
   */
  async addStock(userId: number, lines: StockLineDto[], note?: string) {
    const sorted = [...lines].sort((a, b) => a.materialId - b.materialId);
    await this.db.transaction(async (tx) => {
      await validateLines(tx, sorted);
      await addToCompany(tx, sorted, { restock: true, releaseInTransit: false });
      await tx.query(
        `INSERT INTO stock_additions (material_id, quantity, note, added_by)
         SELECT r.material_id, r.quantity, $3, $4
           FROM unnest($1::bigint[], $2::numeric[]) AS r(material_id, quantity)`,
        [sorted.map((l) => l.materialId), sorted.map((l) => l.quantity), note ?? null, userId],
      );
    });
    return this.companyStockRows(sorted.map((l) => l.materialId));
  }

  async setReorderPoint(materialId: number, reorderPoint: number) {
    const row = await this.db.one(
      `UPDATE company_stock SET reorder_point = $2, updated_at = now() WHERE material_id = $1 RETURNING material_id`,
      [materialId, reorderPoint],
    );
    if (!row) throw new NotFoundException('Material not found');
    return (await this.companyStockRows([materialId]))[0];
  }

  /** Project: Store screen (7). */
  async projectStock(projectId: number, query: ProjectStockQueryDto) {
    const where = new SqlWhere();
    where.add(`ps.project_id = ${where.param(projectId)}`);
    if (query.search) where.add(`m.name ILIKE ${where.param(likePattern(query.search))}`);
    if (query.category) where.add(`m.category = ${where.param(query.category)}`);
    const sort = orderBy(
      query.sortBy,
      { name: 'm.name', quantity: 'ps.quantity', lastDelivery: 'ps.last_delivery_at' },
      'name',
      query.order,
      'm.id',
    );
    const rows = await this.db.query(
      `SELECT m.id AS "materialId", m.name, m.category, m.unit, ps.quantity,
              ps.last_delivery_at AS "lastDeliveryAt", count(*) OVER() AS total
         FROM project_stock ps JOIN materials m ON m.id = ps.material_id
         ${where.sql()} ${sort}
        LIMIT ${where.param(query.limit)} OFFSET ${where.param(query.offset)}`,
      where.params,
    );
    return paginate(stripTotal(rows), rows[0]?.total ?? 0, query);
  }

  private companyStockRows(materialIds: number[]) {
    return this.db.query(
      `SELECT m.id AS "materialId", m.name, m.unit, cs.quantity,
              cs.in_transit_out AS "inTransitToProjects", cs.reorder_point AS "reorderPoint",
              ${STOCK_STATUS_SQL} AS status
         FROM company_stock cs JOIN materials m ON m.id = cs.material_id
        WHERE cs.material_id = ANY($1::bigint[]) ORDER BY m.name`,
      [materialIds],
    );
  }
}
