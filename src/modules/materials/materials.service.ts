import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto';
import { likePattern } from '../../common/utils/ids';
import { orderBy, SqlWhere } from '../../common/utils/sql';
import { DatabaseService } from '../../database/database.service';
import { stripTotal } from '../projects/projects.service';
import { CreateMaterialDto, MaterialListQueryDto, UpdateMaterialDto } from './materials.dto';

const MATERIAL_COLUMNS = `m.id, m.name, m.category, m.unit, m.created_at AS "createdAt", m.updated_at AS "updatedAt"`;

/** The shared materials catalogue. Everyone logged in can read it. */
@Injectable()
export class MaterialsService {
  constructor(private readonly db: DatabaseService) {}

  async list(query: MaterialListQueryDto) {
    const where = new SqlWhere();
    // ILIKE '%x%' is served by the pg_trgm GIN index on materials.name.
    if (query.search) where.add(`m.name ILIKE ${where.param(likePattern(query.search))}`);
    if (query.category) where.add(`m.category = ${where.param(query.category)}`);
    const sort = orderBy(query.sortBy, { name: 'm.name', category: 'm.category' }, 'name', query.order, 'm.id');
    const rows = await this.db.query(
      `SELECT ${MATERIAL_COLUMNS}, count(*) OVER() AS total
         FROM materials m ${where.sql()} ${sort}
        LIMIT ${where.param(query.limit)} OFFSET ${where.param(query.offset)}`,
      where.params,
    );
    return paginate(stripTotal(rows), rows[0]?.total ?? 0, query);
  }

  async categories(): Promise<string[]> {
    const rows = await this.db.query<{ category: string }>(`SELECT DISTINCT category FROM materials ORDER BY category`);
    return rows.map((r) => r.category);
  }

  async get(id: number) {
    const row = await this.db.one(`SELECT ${MATERIAL_COLUMNS} FROM materials m WHERE m.id = $1`, [id]);
    if (!row) throw new NotFoundException('Material not found');
    return row;
  }

  /** Creates the material and its (empty) company-store row in one transaction. */
  async create(dto: CreateMaterialDto) {
    const id = await this.db
      .transaction(async (tx) => {
        const row = await tx.one<{ id: number }>(
          `INSERT INTO materials (name, category, unit) VALUES ($1, $2, $3) RETURNING id`,
          [dto.name, dto.category, dto.unit],
        );
        await tx.query(`INSERT INTO company_stock (material_id) VALUES ($1)`, [row!.id]);
        return row!.id;
      })
      .catch(duplicateName);
    return this.get(id);
  }

  async update(id: number, dto: UpdateMaterialDto) {
    const row = await this.db
      .one(
        `UPDATE materials
            SET name = coalesce($2, name), category = coalesce($3, category),
                unit = coalesce($4, unit), updated_at = now()
          WHERE id = $1 RETURNING id`,
        [id, dto.name ?? null, dto.category ?? null, dto.unit ?? null],
      )
      .catch(duplicateName);
    if (!row) throw new NotFoundException('Material not found');
    return this.get(id);
  }

  /**
   * Removes a material that has never been used. Once it has stock or appears
   * in a delivery, history depends on it, so removal is refused (409).
   */
  async remove(id: number) {
    await this.db.transaction(async (tx) => {
      const stock = await tx.one<{ quantity: number; in_transit_out: number }>(
        `SELECT quantity, in_transit_out FROM company_stock WHERE material_id = $1 FOR UPDATE`,
        [id],
      );
      if (stock && (stock.quantity > 0 || stock.in_transit_out > 0)) {
        throw new ConflictException('The company store still holds this material');
      }
      const deleted = await tx.query(`DELETE FROM materials WHERE id = $1 RETURNING id`, [id]).catch((err) => {
        if (err.code === '23503') {
          throw new ConflictException('This material is used by project stores, deliveries or stock history');
        }
        throw err;
      });
      if (!deleted.length) throw new NotFoundException('Material not found');
    });
    return { deleted: true };
  }
}

function duplicateName(err: { code?: string }): never {
  if (err.code === '23505') throw new ConflictException('A material with this name already exists');
  throw err;
}
