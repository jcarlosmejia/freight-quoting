// Tarifarios: matriz ruta guardada × vehículo con valores fijados al calcular; recálculo explícito.
import type { FastifyInstance } from 'fastify';
import { ENGINE_VERSION, round2 } from '../../shared/costing/index.ts';
import { HttpError, requirePerm } from '../auth.ts';
import { all, insert, one, run, tx, update, type DB } from '../db.ts';
import type { AppContext } from '../app.ts';
import { priceListDocx, priceListPdf, recordDocument } from '../services/documents.ts';
import { createQuote, describeFreight, freightSnapshot, getQuote } from '../services/quotes.ts';
import { n, oneOf, s } from '../services/validate.ts';
import { body, idParam } from './crud.ts';

function computeRow(db: DB, companyId: number, list: { profit_pct: number; financing_pct: number; tax_pct: number }, routeId: number, vehicleId: number) {
  const sr = one(db, 'SELECT * FROM saved_routes WHERE id = ? AND company_id = ?', routeId, companyId);
  if (!sr) throw new HttpError(400, 'Ruta guardada no encontrada.');
  const v = one(db, 'SELECT name FROM vehicles WHERE id = ? AND company_id = ?', vehicleId, companyId);
  if (!v) throw new HttpError(400, 'Vehículo no encontrado.');
  const route = JSON.parse(sr.route);
  const { snapshot, unitSubtotal } = freightSnapshot(db, companyId, vehicleId, route, { profitPct: list.profit_pct, financingPct: list.financing_pct, taxPct: list.tax_pct });
  return {
    saved_route_id: routeId,
    vehicle_id: vehicleId,
    route_name: sr.name,
    vehicle_name: v.name,
    distance_meters: snapshot.route.legMeters.reduce((a: number, b: number) => a + b, 0),
    tolls: snapshot.result.tolls,
    unit_subtotal: unitSubtotal,
    price_with_tax: round2(unitSubtotal * (1 + list.tax_pct / 100)),
    snapshot: JSON.stringify(snapshot),
    engine_version: ENGINE_VERSION,
  };
}

const listOut = (db: DB, companyId: number, id: number) => {
  const l = one(db, 'SELECT p.*, c.legal_name AS client_name FROM price_lists p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ? AND p.company_id = ?', id, companyId);
  if (!l) throw new HttpError(404, 'Lista de precios no encontrada.');
  const rows = all(db, 'SELECT id, saved_route_id, vehicle_id, route_name, vehicle_name, distance_meters, tolls, unit_subtotal, price_with_tax, engine_version, computed_at FROM price_list_rows WHERE price_list_id = ? ORDER BY route_name, vehicle_name', id);
  return { ...l, rows };
};

export function registerPriceLists(app: FastifyInstance, { db, dataDir }: AppContext) {
  app.get('/api/price-lists', async (r) => {
    const u = requirePerm(r, 'ver:lista_precios');
    return all(db, 'SELECT p.*, c.legal_name AS client_name, (SELECT COUNT(*) FROM price_list_rows WHERE price_list_id = p.id) AS row_count FROM price_lists p LEFT JOIN clients c ON c.id = p.client_id WHERE p.company_id = ? ORDER BY p.updated_at DESC', u.companyId);
  });

  app.get('/api/price-lists/:id', async (r) => {
    const u = requirePerm(r, 'ver:lista_precios');
    return listOut(db, u.companyId, idParam((r.params as any).id));
  });

  app.post('/api/price-lists', async (r, reply) => {
    const u = requirePerm(r, 'agregar:lista_precios');
    const b = body(r.body);
    const routeIds = (Array.isArray(b.routeIds) ? b.routeIds : []).map(idParam);
    const vehicleIds = (Array.isArray(b.vehicleIds) ? b.vehicleIds : []).map(idParam);
    if (!routeIds.length || !vehicleIds.length) throw new HttpError(400, 'Selecciona al menos una ruta guardada y un vehículo.');
    if (routeIds.length * vehicleIds.length > 500) throw new HttpError(400, 'Máximo 500 combinaciones por lista.');
    const clientId = b.clientId == null || b.clientId === '' ? null : idParam(b.clientId);
    if (clientId && !one(db, 'SELECT id FROM clients WHERE id = ? AND company_id = ?', clientId, u.companyId)) throw new HttpError(400, 'Cliente no encontrado.');
    const list = { profit_pct: n(b.profitPct, 'utilidad', { min: -100, max: 1000, def: 20 }), financing_pct: n(b.financingPct, 'financiamiento', { min: 0, max: 100, def: 0 }), tax_pct: n(b.taxPct, 'IVA', { min: 0, max: 100, def: 16 }) };
    const rows = routeIds.flatMap((rid: number) => vehicleIds.map((vid: number) => computeRow(db, u.companyId, list, rid, vid)));
    const id = tx(db, () => {
      const id = insert(db, 'price_lists', { company_id: u.companyId, name: s(b.name, 'nombre', { required: true, max: 200 })!, client_id: clientId, ...list });
      for (const row of rows) insert(db, 'price_list_rows', { ...row, price_list_id: id });
      return id;
    });
    reply.status(201);
    return listOut(db, u.companyId, id);
  });

  app.patch('/api/price-lists/:id', async (r) => {
    const u = requirePerm(r, 'modificar:lista_precios');
    const id = idParam((r.params as any).id);
    listOut(db, u.companyId, id);
    const b = body(r.body);
    if (b.client_id != null && !one(db, 'SELECT id FROM clients WHERE id = ? AND company_id = ?', Number(b.client_id), u.companyId)) throw new HttpError(400, 'Cliente no encontrado.');
    update(db, 'price_lists', id, { name: 'name' in b ? s(b.name, 'nombre', { required: true, max: 200 })! : undefined, client_id: 'client_id' in b ? (b.client_id == null ? null : Number(b.client_id)) : undefined, updated_at: new Date().toISOString() });
    return listOut(db, u.companyId, id);
  });

  /** Recalcula filas con costos vigentes conservando la estrategia comercial de la lista. */
  app.post('/api/price-lists/:id/recalculate', async (r) => {
    const u = requirePerm(r, 'modificar:lista_precios');
    const id = idParam((r.params as any).id);
    const l = one(db, 'SELECT * FROM price_lists WHERE id = ? AND company_id = ?', id, u.companyId);
    if (!l) throw new HttpError(404, 'Lista de precios no encontrada.');
    const b = body(r.body);
    const only = Array.isArray(b.rowIds) ? new Set(b.rowIds.map(Number)) : null;
    const rows = all(db, 'SELECT * FROM price_list_rows WHERE price_list_id = ?', id).filter((x) => !only || only.has(x.id));
    const skipped: string[] = [];
    tx(db, () => {
      for (const row of rows) {
        if (row.saved_route_id == null || row.vehicle_id == null) {
          skipped.push(`${row.route_name} · ${row.vehicle_name}`);
          continue;
        }
        const fresh = computeRow(db, u.companyId, l as any, row.saved_route_id, row.vehicle_id);
        update(db, 'price_list_rows', row.id, { ...fresh, computed_at: new Date().toISOString() });
      }
      run(db, 'UPDATE price_lists SET updated_at = ? WHERE id = ?', new Date().toISOString(), id);
    });
    return { ...listOut(db, u.companyId, id), skipped };
  });

  app.delete('/api/price-lists/:id', async (r) => {
    const u = requirePerm(r, 'eliminar:lista_precios');
    const res = run(db, 'DELETE FROM price_lists WHERE id = ? AND company_id = ?', idParam((r.params as any).id), u.companyId);
    if (!res.changes) throw new HttpError(404, 'Lista de precios no encontrada.');
    return { ok: true };
  });

  app.delete('/api/price-lists/:id/rows/:rowId', async (r) => {
    const u = requirePerm(r, 'modificar:lista_precios');
    const id = idParam((r.params as any).id);
    listOut(db, u.companyId, id);
    const res = run(db, 'DELETE FROM price_list_rows WHERE id = ? AND price_list_id = ?', idParam((r.params as any).rowId), id);
    if (!res.changes) throw new HttpError(404, 'Fila no encontrada.');
    return listOut(db, u.companyId, id);
  });

  /** Convierte filas seleccionadas en una cotización nueva con sus mismos valores fijados. */
  app.post('/api/price-lists/:id/to-quote', async (r, reply) => {
    const u = requirePerm(r, 'agregar:cotizacion');
    const id = idParam((r.params as any).id);
    const l = listOut(db, u.companyId, id);
    const b = body(r.body);
    const ids = new Set((Array.isArray(b.rowIds) ? b.rowIds : []).map(Number));
    const rows = all(db, 'SELECT * FROM price_list_rows WHERE price_list_id = ?', id).filter((x) => ids.has(x.id));
    if (!rows.length) throw new HttpError(400, 'Selecciona al menos una fila.');
    const quoteId = createQuote(db, u.companyId, u.id, { clientId: l.client_id ?? null });
    tx(db, () => {
      rows.forEach((row, i) => {
        // Se copia el snapshot fijado de la fila; no se recalcula con costos actuales.
        const snap = JSON.parse(row.snapshot);
        insert(db, 'quote_items', {
          quote_id: quoteId,
          position: i + 1,
          kind: 'freight',
          description: describeFreight(row.vehicle_name, snap.route),
          quantity: 1,
          unit_subtotal: row.unit_subtotal,
          vehicle_id: row.vehicle_id,
          saved_route_id: row.saved_route_id,
          snapshot: row.snapshot,
          engine_version: row.engine_version,
        });
      });
    });
    reply.status(201);
    return getQuote(db, u.companyId, quoteId);
  });

  app.get('/api/price-lists/:id/export', async (r, reply) => {
    const u = requirePerm(r, 'exportar:lista_precios');
    const id = idParam((r.params as any).id);
    const q = r.query as Record<string, string>;
    const format = oneOf(q.format, 'formato', ['docx', 'pdf'] as const);
    const g = format === 'docx' ? priceListDocx(db, u.companyId, id, dataDir, q.template ? idParam(q.template) : null) : await priceListPdf(db, u.companyId, id, dataDir);
    recordDocument(db, u.companyId, u.id, 'price_list', id, format, g);
    reply.header('Content-Disposition', `attachment; filename="${g.fileName}"`).type(g.mime);
    return g.buffer;
  });
}
