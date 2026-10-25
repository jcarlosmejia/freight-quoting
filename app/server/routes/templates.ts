// Plantillas Word por tipo de documento.
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { HttpError, requirePerm } from '../auth.ts';
import { all, insert, one, run, tx, type DB } from '../db.ts';
import type { AppContext } from '../app.ts';
import { templateTags } from '../services/docx.ts';
import { oneOf, s } from '../services/validate.ts';
import { body, idParam } from './crud.ts';

export const TEMPLATE_VARIABLES = {
  quote: {
    Empresa: ['empresa_nombre', 'empresa_legal_name', 'empresa_rfc', 'empresa_telefono', 'empresa_email', 'empresa_website', 'empresa_direccion'],
    Cliente: ['cliente_nombre', 'cliente_rfc', 'cliente_contacto', 'cliente_email', 'cliente_telefono', 'cliente_direccion'],
    Cotización: ['cotizacion_numero', 'cotizacion_fecha', 'cotizacion_vigencia', 'cotizacion_estado', 'notas'],
    'Partidas (una fila de tabla; se repite por partida)': ['item_n', 'item_descripcion', 'item_cantidad', 'item_unitario', 'item_importe', 'item_aumento_pct', 'item_aumento_monto', 'item_vacio_no_cobrado'],
    Totales: ['subtotal', 'iva_pct', 'iva_monto', 'total'],
  },
  price_list: {
    Empresa: ['empresa_nombre', 'empresa_legal_name', 'empresa_rfc', 'empresa_telefono', 'empresa_email', 'empresa_website', 'empresa_direccion'],
    Cliente: ['cliente_nombre', 'cliente_rfc', 'cliente_contacto', 'cliente_email', 'cliente_telefono', 'cliente_direccion'],
    Lista: ['lista_nombre', 'lista_fecha', 'iva_pct'],
    'Filas (una fila de tabla; se repite por ruta × vehículo)': ['item_destino', 'item_vehiculo', 'item_km', 'item_precio', 'item_precio_iva'],
  },
};

export function storeTemplate(db: DB, dataDir: string, companyId: number, kind: 'quote' | 'price_list', name: string, description: string | null, buf: Buffer, isDefault: boolean) {
  const rel = join('templates', String(companyId), `${randomUUID()}.docx`);
  mkdirSync(join(dataDir, 'templates', String(companyId)), { recursive: true });
  writeFileSync(join(dataDir, rel), buf);
  return tx(db, () => {
    if (isDefault) run(db, 'UPDATE templates SET is_default = 0 WHERE company_id = ? AND kind = ?', companyId, kind);
    return insert(db, 'templates', { company_id: companyId, kind, name, description, file_path: rel, sha256: createHash('sha256').update(buf).digest('hex'), is_default: isDefault });
  });
}

export function registerTemplates(app: FastifyInstance, { db, dataDir }: AppContext) {
  app.get('/api/templates', async (r) => {
    const u = requirePerm(r, 'ver:plantilla');
    return all(db, 'SELECT id, kind, name, description, is_default, sha256, created_at FROM templates WHERE company_id = ? ORDER BY kind, is_default DESC, name', u.companyId);
  });

  app.get('/api/templates/variables', async (r) => {
    requirePerm(r, 'ver:plantilla');
    return TEMPLATE_VARIABLES;
  });

  app.post('/api/templates', async (r, reply) => {
    const u = requirePerm(r, 'agregar:plantilla');
    const file = await r.file();
    if (!file) throw new HttpError(400, 'Adjunta un archivo .docx.');
    const fields = Object.fromEntries(Object.entries(file.fields).map(([k, v]: [string, any]) => [k, v?.value]));
    const buf = await file.toBuffer();
    let tags: string[];
    try {
      tags = templateTags(buf);
    } catch {
      throw new HttpError(400, 'El archivo no es un documento Word (.docx) válido.');
    }
    const kind = oneOf(fields.kind, 'tipo', ['quote', 'price_list'] as const, 'quote');
    const known = new Set(Object.values(TEMPLATE_VARIABLES[kind]).flat());
    const unknown = tags.filter((t) => !known.has(t) && !/^[#/]items$/.test(t));
    const id = storeTemplate(db, dataDir, u.companyId, kind, s(fields.name, 'nombre', { required: true, max: 200 }) ?? file.filename, s(fields.description, 'descripción', { max: 500 }), buf, fields.is_default === 'true');
    reply.status(201);
    return { id, tags, unknown };
  });

  app.patch('/api/templates/:id', async (r) => {
    const u = requirePerm(r, 'modificar:plantilla');
    const id = idParam((r.params as any).id);
    const t = one(db, 'SELECT * FROM templates WHERE id = ? AND company_id = ?', id, u.companyId);
    if (!t) throw new HttpError(404, 'Plantilla no encontrada.');
    const b = body(r.body);
    tx(db, () => {
      if (b.is_default === true) {
        run(db, 'UPDATE templates SET is_default = 0 WHERE company_id = ? AND kind = ?', u.companyId, t.kind);
        run(db, 'UPDATE templates SET is_default = 1 WHERE id = ?', id);
      }
      if ('name' in b) run(db, 'UPDATE templates SET name = ? WHERE id = ?', s(b.name, 'nombre', { required: true, max: 200 }), id);
      if ('description' in b) run(db, 'UPDATE templates SET description = ? WHERE id = ?', s(b.description, 'descripción', { max: 500 }), id);
    });
    return one(db, 'SELECT id, kind, name, description, is_default FROM templates WHERE id = ?', id);
  });

  app.get('/api/templates/:id/download', async (r, reply) => {
    const u = requirePerm(r, 'ver:plantilla');
    const t = one(db, 'SELECT * FROM templates WHERE id = ? AND company_id = ?', idParam((r.params as any).id), u.companyId);
    if (!t) throw new HttpError(404, 'Plantilla no encontrada.');
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(t.name)}.docx"`).type('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    return readFileSync(join(dataDir, t.file_path));
  });

  app.delete('/api/templates/:id', async (r) => {
    const u = requirePerm(r, 'eliminar:plantilla');
    const t = one(db, 'SELECT * FROM templates WHERE id = ? AND company_id = ?', idParam((r.params as any).id), u.companyId);
    if (!t) throw new HttpError(404, 'Plantilla no encontrada.');
    if (t.is_default) throw new HttpError(409, 'No se puede eliminar la plantilla predeterminada; elige otra como predeterminada primero.');
    run(db, 'DELETE FROM templates WHERE id = ?', t.id);
    rmSync(join(dataDir, t.file_path), { force: true });
    return { ok: true };
  });
}
