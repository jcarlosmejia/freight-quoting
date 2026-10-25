// Clientes, ubicaciones, casetas y rutas guardadas.
import type { FastifyInstance } from 'fastify';
import { HttpError, requirePerm } from '../auth.ts';
import { all, insert, one, run, tx } from '../db.ts';
import type { AppContext } from '../app.ts';
import { geocode, mapConfig, planRoute, routingProviders } from '../services/routing.ts';
import { isoDate, n, nullableN, oneOf, parseRoute, s } from '../services/validate.ts';
import { body, idParam, registerCrud, type FieldParser } from './crud.ts';

const str = (label: string, max = 300): FieldParser => (v) => s(v, label, { max });
const rfc: FieldParser = (v) => {
  const x = s(v, 'RFC', { max: 13 });
  if (x && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(x)) throw new HttpError(400, 'RFC de 12 caracteres (moral) o 13 (física).');
  return x?.toUpperCase() ?? null;
};
const email: FieldParser = (v) => {
  const x = s(v, 'correo', { max: 200 });
  if (x && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) throw new HttpError(400, 'Correo inválido.');
  return x;
};

const csvCell = (v: unknown) => {
  const t = String(v ?? '');
  // Neutraliza fórmulas al abrir el CSV en una hoja de cálculo.
  const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function registerCatalog(app: FastifyInstance, { db, env }: AppContext) {
  registerCrud(app, db, {
    path: 'clients',
    table: 'clients',
    fields: {
      legal_name: (v) => s(v, 'razón social', { required: true, max: 300 }),
      trade_name: str('nombre comercial'),
      rfc,
      contact_name: str('contacto', 200),
      phone: str('teléfono', 40),
      email,
      address: str('dirección', 500),
      notes: str('notas internas', 2000),
    },
    perms: { list: 'ver:cliente', create: 'agregar:cliente', update: 'modificar:cliente', remove: 'archivar:cliente' },
    order: 'legal_name',
    softDelete: `archived_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  });

  app.patch('/api/clients/:id/restore', async (r) => {
    const u = requirePerm(r, 'archivar:cliente');
    const res = run(db, 'UPDATE clients SET archived_at = NULL WHERE id = ? AND company_id = ?', idParam((r.params as any).id), u.companyId);
    if (!res.changes) throw new HttpError(404, 'Cliente no encontrado.');
    return { ok: true };
  });

  app.get('/api/clients-export.csv', async (r, reply) => {
    const u = requirePerm(r, 'exportar:cliente');
    const rows = all(db, 'SELECT legal_name, trade_name, rfc, contact_name, phone, email, address, archived_at FROM clients WHERE company_id = ? ORDER BY legal_name', u.companyId);
    const head = ['razon_social', 'nombre_comercial', 'rfc', 'contacto', 'telefono', 'correo', 'direccion', 'archivado'];
    reply.header('Content-Disposition', 'attachment; filename="clientes.csv"').type('text/csv; charset=utf-8');
    return '﻿' + [head.join(','), ...rows.map((x) => Object.values(x).map(csvCell).join(','))].join('\n');
  });

  registerCrud(app, db, {
    path: 'locations',
    table: 'locations',
    fields: {
      name: (v) => s(v, 'nombre', { required: true, max: 200 }),
      kind: (v) => oneOf(v, 'tipo', ['base', 'ubicacion'] as const, 'ubicacion'),
      address: str('dirección', 500),
      city: str('ciudad', 100),
      state: str('estado', 100),
      zip: str('código postal', 10),
      ref_notes: str('referencias', 300),
      lat: (v) => nullableN(v, 'latitud', { min: -90, max: 90 }),
      lon: (v) => nullableN(v, 'longitud', { min: -180, max: 180 }),
    },
    perms: { list: 'ver:ruta', create: 'agregar:ruta', update: 'agregar:ruta', remove: 'eliminar:ruta' },
    order: 'kind, name',
  });

  // ---- Casetas ----
  app.get('/api/tolls', async (r) => {
    const u = requirePerm(r, 'ver:ruta');
    const plazas = all(db, 'SELECT * FROM toll_plazas WHERE company_id = ? ORDER BY name', u.companyId);
    const rates = all(db, 'SELECT tr.* FROM toll_rates tr JOIN toll_plazas p ON p.id = tr.plaza_id WHERE p.company_id = ? ORDER BY tr.effective_from DESC', u.companyId);
    return plazas.map((p) => ({ ...p, rates: rates.filter((x) => x.plaza_id === p.id) }));
  });

  app.post('/api/tolls', async (r, reply) => {
    const u = requirePerm(r, 'agregar:ruta');
    const b = body(r.body);
    const id = tx(db, () => {
      const id = insert(db, 'toll_plazas', { company_id: u.companyId, name: s(b.name, 'nombre', { required: true, max: 200 })!, highway: s(b.highway, 'carretera', { max: 200 }), source: s(b.source, 'fuente', { required: true, max: 300 })!, notes: s(b.notes, 'notas', { max: 1000 }) });
      for (const rate of Array.isArray(b.rates) ? b.rates : []) addRate(id, rate);
      return id;
    });
    reply.status(201);
    return { id };
  });

  const addRate = (plazaId: number, x: any) =>
    insert(db, 'toll_rates', {
      plaza_id: plazaId,
      vehicle_class: s(x?.vehicle_class, 'clase vehicular', { required: true, max: 20 })!,
      direction: s(x?.direction, 'sentido', { max: 100 }) ?? 'ambos',
      amount: n(x?.amount, 'tarifa', { min: 0, max: 1e6 }),
      effective_from: isoDate(x?.effective_from, 'vigencia') ?? new Date().toISOString().slice(0, 10),
      source: s(x?.source, 'fuente de la tarifa', { required: true, max: 300 })!,
    });

  app.post('/api/tolls/:id/rates', async (r, reply) => {
    const u = requirePerm(r, 'agregar:ruta');
    const id = idParam((r.params as any).id);
    if (!one(db, 'SELECT id FROM toll_plazas WHERE id = ? AND company_id = ?', id, u.companyId)) throw new HttpError(404, 'Caseta no encontrada.');
    reply.status(201);
    return { id: addRate(id, body(r.body)) };
  });

  app.delete('/api/tolls/:id', async (r) => {
    const u = requirePerm(r, 'eliminar:ruta');
    const res = run(db, 'DELETE FROM toll_plazas WHERE id = ? AND company_id = ?', idParam((r.params as any).id), u.companyId);
    if (!res.changes) throw new HttpError(404, 'Caseta no encontrada.');
    return { ok: true };
  });

  /** Tarifa vigente de una caseta para una clase vehicular en una fecha (la más reciente no futura). */
  app.get('/api/tolls/quote', async (r) => {
    const u = requirePerm(r, 'ver:ruta');
    const q = r.query as Record<string, string>;
    const cls = s(q.vehicle_class, 'clase vehicular', { required: true, max: 20 })!;
    const date = isoDate(q.date, 'fecha') ?? new Date().toISOString().slice(0, 10);
    return all(
      db,
      `SELECT p.id AS plaza_id, p.name, p.highway, tr.direction, tr.amount, tr.effective_from, tr.source
         FROM toll_plazas p JOIN toll_rates tr ON tr.plaza_id = p.id
        WHERE p.company_id = ? AND tr.vehicle_class = ? AND tr.effective_from <= ?
          AND tr.effective_from = (SELECT MAX(effective_from) FROM toll_rates t2 WHERE t2.plaza_id = p.id AND t2.vehicle_class = tr.vehicle_class AND t2.direction = tr.direction AND t2.effective_from <= ?)
        ORDER BY p.name`,
      u.companyId,
      cls,
      date,
      date,
    );
  });

  // ---- Rutas ----
  app.get('/api/routing/providers', async (r) => {
    requirePerm(r, 'ver:ruta');
    return routingProviders(env);
  });

  app.get('/api/map-config', async (r) => {
    requirePerm(r, 'ver:cotizacion');
    return mapConfig(env);
  });

  app.get('/api/geocode', async (r) => {
    requirePerm(r, 'agregar:cotizacion');
    const q = s((r.query as any).q, 'búsqueda', { required: true, max: 200 })!;
    if (q.length < 3) throw new HttpError(400, 'Escribe al menos 3 caracteres.');
    return geocode(env, q);
  });

  // ---- Ubicaciones frecuentes y rutas frecuentes por km ----
  app.get('/api/km-routes', async (r) => {
    const u = requirePerm(r, 'ver:ruta');
    return all(db, 'SELECT * FROM km_routes WHERE company_id = ? ORDER BY name', u.companyId).map((x) => ({ ...x, origin: JSON.parse(x.origin), destination: JSON.parse(x.destination), waypoints: JSON.parse(x.waypoints) }));
  });

  app.post('/api/km-routes', async (r, reply) => {
    const u = requirePerm(r, 'agregar:ruta');
    const b = body(r.body);
    const place = (x: any, f: string) => {
      const o = x && typeof x === 'object' ? x : {};
      return JSON.stringify({ address: s(o.address, `dirección de ${f}`, { required: true, max: 300 }), city: s(o.city, 'ciudad', { max: 100 }), state: s(o.state, 'estado', { max: 100 }), zip: s(o.zip, 'CP', { max: 10 }), references: s(o.references, 'referencias', { max: 300 }), lat: nullableN(o.lat, 'latitud', { min: -90, max: 90 }), lon: nullableN(o.lon, 'longitud', { min: -180, max: 180 }) });
    };
    const id = insert(db, 'km_routes', {
      company_id: u.companyId,
      name: s(b.name, 'nombre', { required: true, max: 200 })!,
      origin: place(b.origin, 'origen'),
      destination: place(b.destination, 'destino'),
      waypoints: JSON.stringify((Array.isArray(b.waypoints) ? b.waypoints : []).slice(0, 10).map((w: any, i: number) => JSON.parse(place(w, `punto ${i + 1}`)))),
      outbound_km: n(b.outbound_km, 'km de ida', { min: 0, max: 20000 }),
      return_km: nullableN(b.return_km, 'km de regreso', { min: 0, max: 20000 }),
      distance_source: oneOf(b.distance_source, 'origen de la distancia', ['manual', 'proveedor'] as const, 'manual'),
      distance_note: s(b.distance_note, 'nota', { max: 300 }),
      tolls_outbound: n(b.tolls_outbound, 'casetas de ida', { min: 0, max: 1e7, def: 0 }),
      tolls_return: n(b.tolls_return, 'casetas de regreso', { min: 0, max: 1e7, def: 0 }),
    });
    reply.status(201);
    return { id };
  });

  app.delete('/api/km-routes/:id', async (r) => {
    const u = requirePerm(r, 'eliminar:ruta');
    const res = run(db, 'DELETE FROM km_routes WHERE id = ? AND company_id = ?', idParam((r.params as any).id), u.companyId);
    if (!res.changes) throw new HttpError(404, 'Ruta no encontrada.');
    return { ok: true };
  });

  app.post('/api/routing/plan', async (r) => {
    requirePerm(r, 'agregar:cotizacion');
    const b = body(r.body);
    const coords = (Array.isArray(b.coords) ? b.coords : []).map((c: any, i: number) => [n(c?.[0], `longitud ${i + 1}`, { min: -180, max: 180 }), n(c?.[1], `latitud ${i + 1}`, { min: -90, max: 90 })] as [number, number]);
    return planRoute(env, String(b.provider ?? ''), coords, b.truck as any);
  });

  app.get('/api/saved-routes', async (r) => {
    const u = requirePerm(r, 'ver:ruta');
    return all(db, 'SELECT * FROM saved_routes WHERE company_id = ? ORDER BY name', u.companyId).map((x) => ({ ...x, route: JSON.parse(x.route) }));
  });

  app.post('/api/saved-routes', async (r, reply) => {
    const u = requirePerm(r, 'agregar:ruta');
    const b = body(r.body);
    const route = parseRoute(b.route);
    const id = insert(db, 'saved_routes', { company_id: u.companyId, name: s(b.name, 'nombre', { required: true, max: 200 })!, route: JSON.stringify(route), routing_source: oneOf(b.routing_source, 'origen', ['manual', 'ors', 'osrm'] as const, 'manual') });
    reply.status(201);
    return { id };
  });

  app.delete('/api/saved-routes/:id', async (r) => {
    const u = requirePerm(r, 'eliminar:ruta');
    const res = run(db, 'DELETE FROM saved_routes WHERE id = ? AND company_id = ?', idParam((r.params as any).id), u.companyId);
    if (!res.changes) throw new HttpError(404, 'Ruta no encontrada.');
    return { ok: true };
  });
}
