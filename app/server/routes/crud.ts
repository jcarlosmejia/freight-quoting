// CRUD genérico con alcance por empresa y permisos en servidor.
import type { FastifyInstance } from 'fastify';
import { HttpError, requirePerm } from '../auth.ts';
import { all, insert, one, run, update, type DB } from '../db.ts';

export type FieldParser = (v: unknown, body: Record<string, unknown>) => string | number | boolean | null;

export interface CrudSpec {
  path: string;
  table: string;
  fields: Record<string, FieldParser>;
  perms: { list: string; create: string; update: string; remove: string };
  order?: string;
  listWhere?: string;
  /** Validación adicional (p. ej. claves foráneas de la misma empresa). */
  check?: (db: DB, companyId: number, values: Record<string, unknown>) => void;
  /** Si existe, DELETE marca el registro en lugar de borrarlo. */
  softDelete?: string;
}

export const body = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {});

export function parseFields(fields: Record<string, FieldParser>, b: Record<string, unknown>, partial: boolean) {
  const out: Record<string, any> = {};
  for (const [k, parse] of Object.entries(fields)) {
    if (partial && !(k in b)) continue;
    out[k] = parse(b[k], b);
  }
  return out;
}

export function idParam(v: unknown): number {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido.');
  return id;
}

export function registerCrud(app: FastifyInstance, db: DB, spec: CrudSpec) {
  app.get(`/api/${spec.path}`, async (req) => {
    const u = requirePerm(req, spec.perms.list);
    return all(db, `SELECT * FROM ${spec.table} WHERE company_id = ? ${spec.listWhere ?? ''} ORDER BY ${spec.order ?? 'id'}`, u.companyId);
  });
  app.post(`/api/${spec.path}`, async (req, reply) => {
    const u = requirePerm(req, spec.perms.create);
    const values = parseFields(spec.fields, body(req.body), false);
    spec.check?.(db, u.companyId, values);
    const id = insert(db, spec.table, { ...values, company_id: u.companyId });
    reply.status(201);
    return one(db, `SELECT * FROM ${spec.table} WHERE id = ?`, id);
  });
  app.patch(`/api/${spec.path}/:id`, async (req) => {
    const u = requirePerm(req, spec.perms.update);
    const id = idParam((req.params as any).id);
    if (!one(db, `SELECT id FROM ${spec.table} WHERE id = ? AND company_id = ?`, id, u.companyId)) throw new HttpError(404, 'Registro no encontrado.');
    const values = parseFields(spec.fields, body(req.body), true);
    spec.check?.(db, u.companyId, values);
    update(db, spec.table, id, values, `AND company_id = ${u.companyId}`);
    return one(db, `SELECT * FROM ${spec.table} WHERE id = ?`, id);
  });
  app.delete(`/api/${spec.path}/:id`, async (req) => {
    const u = requirePerm(req, spec.perms.remove);
    const id = idParam((req.params as any).id);
    const res = spec.softDelete
      ? run(db, `UPDATE ${spec.table} SET ${spec.softDelete} WHERE id = ? AND company_id = ?`, id, u.companyId)
      : run(db, `DELETE FROM ${spec.table} WHERE id = ? AND company_id = ?`, id, u.companyId);
    if (!res.changes) throw new HttpError(404, 'Registro no encontrado.');
    return { ok: true };
  });
}
