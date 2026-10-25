import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { buildApp } from '../server/app.ts';
import { insert, migrate, openDb, type DB } from '../server/db.ts';
import { ensureSystemRoles, seed } from '../server/seed.ts';
import { hashPassword } from '../server/auth.ts';
import { docxText } from '../server/services/docx.ts';
import { civilToday } from '../server/services/quotes.ts';
import nodemailer from 'nodemailer';

const sentMail: any[] = [];

const H = { 'x-requested-with': 'freight-quoting' };
let dir: string;
let db: DB;
let app: Awaited<ReturnType<typeof buildApp>>;
const ADMIN = { email: 'admin@demo.test', password: 'clave-de-prueba-admin' };
const USER = { email: 'usuario@demo.test', password: 'clave-de-prueba-usuario' };

async function login(creds: { email: string; password: string }) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: creds });
  expect(res.statusCode).toBe(200);
  const c = res.cookies.find((x) => x.name === 'fl_session')!;
  return { cookie: `fl_session=${c.value}`, setCookie: c };
}

function client(cookie: string) {
  const call = (method: any, url: string, payload?: unknown) => app.inject({ method, url, headers: { ...H, cookie }, payload: payload as any });
  return {
    get: (u: string) => call('GET', u),
    post: (u: string, p?: unknown) => call('POST', u, p ?? {}),
    patch: (u: string, p: unknown) => call('PATCH', u, p),
    put: (u: string, p: unknown) => call('PUT', u, p),
    del: (u: string) => call('DELETE', u),
  };
}

let admin: ReturnType<typeof client>;
let user: ReturnType<typeof client>;
let refVehicleId: number;
let refRoute: any;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'freight-quoting-test-'));
  db = openDb(join(dir, 'db.sqlite'));
  migrate(db);
  seed(db, { adminEmail: ADMIN.email, adminPassword: ADMIN.password, userEmail: USER.email, userPassword: USER.password, dataDir: dir });
  app = await buildApp({
    db, dataDir: dir, env: { APP_SECRET: 'secreto-de-prueba' }, secureCookies: false,
    // Transporte SMTP en memoria: no sale ningún correo.
    mailTransport: (cfg) => {
      const t = nodemailer.createTransport({ streamTransport: true, buffer: true });
      const send = t.sendMail.bind(t);
      (t as any).sendMail = async (m: any) => { const info: any = await send(m); sentMail.push({ cfg, m, raw: info.message.toString() }); return info; };
      return t;
    },
  });
  admin = client((await login(ADMIN)).cookie);
  user = client((await login(USER)).cookie);
  const vehicles = (await admin.get('/api/vehicles')).json();
  refVehicleId = vehicles.find((v: any) => v.name.startsWith('Referencia T3-S2')).id;
  refRoute = (await admin.get('/api/saved-routes')).json()[0].route;
});

afterAll(async () => {
  await app.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('sesión y CSRF', () => {
  it('cookie HttpOnly y SameSite=Strict', async () => {
    const { setCookie } = await login(ADMIN);
    expect(setCookie.httpOnly).toBe(true);
    expect(String(setCookie.sameSite).toLowerCase()).toBe('strict');
  });
  it('sin sesión → 401; credenciales malas → 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/quotes' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', headers: H, payload: { email: ADMIN.email, password: 'x' } })).statusCode).toBe(401);
  });
  it('mutación sin cabecera anti-CSRF → 403', async () => {
    const { cookie } = await login(ADMIN);
    const res = await app.inject({ method: 'POST', url: '/api/quotes', headers: { cookie }, payload: {} });
    expect(res.statusCode).toBe(403);
  });
});

describe('cotización de flete guardada', () => {
  let quote: any;
  it('se calcula en servidor y reproduce el caso de referencia', async () => {
    const res = await admin.post('/api/quotes', { item: { kind: 'freight', vehicleId: refVehicleId, route: refRoute, input: {} } });
    expect(res.statusCode).toBe(201);
    quote = res.json();
    const year = civilToday().slice(0, 4);
    expect(quote.folio).toBe(`COT-${year}-0001`);
    expect(quote.items[0].unit_subtotal).toBe(4455.36);
    expect(quote.totals).toMatchObject({ subtotal: 4455.36, tax: 712.86, total: 5168.22 });
    expect(quote.items[0].description).toBe('Servicio de Referencia T3-S2 (valores de evaluación) de Ciudad de México a Puebla');
  });

  it('los folios son únicos y consecutivos', async () => {
    const folios = new Set<string>();
    for (let i = 0; i < 5; i++) folios.add((await admin.post('/api/quotes', {})).json().folio);
    expect(folios.size).toBe(5);
    expect([...folios].at(-1)).toMatch(/-0006$/);
  });

  it('la cotización histórica no cambia al modificar costos; recalcular es explícito y deja revisión', async () => {
    expect((await admin.patch(`/api/vehicles/${refVehicleId}`, { fuel_price: 30 })).statusCode).toBe(200);
    const again = (await admin.get(`/api/quotes/${quote.id}`)).json();
    expect(again.items[0].unit_subtotal).toBe(4455.36);
    expect(again.items[0].snapshot.params.vehicle.fuelPricePerLiter).toBeCloseTo(23.41, 2);
    const rc = (await admin.post(`/api/quotes/${quote.id}/items/${again.items[0].id}/recalculate`)).json();
    expect(rc.change.before).toBe(4455.36);
    expect(rc.change.after).toBeGreaterThan(4455.36);
    const revs = (await admin.get(`/api/quotes/${quote.id}/items/${again.items[0].id}/revisions`)).json();
    expect(revs).toHaveLength(1);
    expect(revs[0].unit_subtotal).toBe(4455.36);
    await admin.patch(`/api/vehicles/${refVehicleId}`, { fuel_price: 23.41 });
  });

  it('estados y vigencia con fecha civil', async () => {
    const res = await admin.patch(`/api/quotes/${quote.id}`, { status: 'sent', valid_until: '2026-11-24' });
    expect(res.json()).toMatchObject({ status: 'sent', valid_until: '2026-11-24' });
    expect((await admin.patch(`/api/quotes/${quote.id}`, { status: 'inventado' })).statusCode).toBe(400);
  });

  it('exporta Word y PDF con contenido comprobable y registra el documento', async () => {
    quote = (await admin.post('/api/quotes', { validUntil: '2026-11-24', notes: 'Prueba sin envío', item: { kind: 'freight', vehicleId: refVehicleId, route: refRoute } })).json();
    const docx = await admin.get(`/api/quotes/${quote.id}/export?format=docx`);
    expect(docx.statusCode).toBe(200);
    const text = docxText(docx.rawPayload);
    expect(text).toContain(quote.folio);
    expect(text).toContain('$5,168.22');
    expect(text).toContain('24 de noviembre de 2026');
    expect(text).toContain('Ciudad de México a Puebla');
    expect(text).not.toContain('${');

    const pdf = await admin.get(`/api/quotes/${quote.id}/export?format=pdf`);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const parsed = await new PDFParse({ data: new Uint8Array(pdf.rawPayload) }).getText();
    expect(parsed.text).toContain(quote.folio);
    expect(parsed.text).toContain('$5,168.22');
    expect(parsed.text).toContain('24 de noviembre de 2026');

    const docs = (await admin.get('/api/documents')).json();
    expect(docs.slice(0, 2).map((d: any) => d.format).sort()).toEqual(['docx', 'pdf']);
    expect(docs[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('permisos aplicados en servidor', () => {
  it('el rol usuario cotiza pero no administra', async () => {
    expect((await user.post('/api/quotes', {})).statusCode).toBe(201);
    expect((await user.patch('/api/company/numbering', { folio_prefix: 'X' })).statusCode).toBe(403);
    expect((await user.get('/api/users')).statusCode).toBe(403);
    expect((await user.post('/api/roles', { name: 'x', permissions: [] })).statusCode).toBe(403);
    expect((await user.get('/api/backup')).statusCode).toBe(403);
  });

  it('un rol sin permiso de ver cotizaciones recibe 403', async () => {
    const roleId = (await admin.post('/api/roles', { name: 'Solo clientes', permissions: ['ver:cliente'] })).json().id;
    await admin.post('/api/users', { email: 'limitado@demo.test', name: 'Limitado', password: 'clave-limitada-123', role_id: roleId });
    const limited = client((await login({ email: 'limitado@demo.test', password: 'clave-limitada-123' })).cookie);
    expect((await limited.get('/api/clients')).statusCode).toBe(200);
    expect((await limited.get('/api/quotes')).statusCode).toBe(403);
    expect((await limited.post('/api/clients', { legal_name: 'X' })).statusCode).toBe(403);
  });

  it('techo de privilegios: un gestor de usuarios no escala a admin ni otorga permisos que no tiene', async () => {
    const perms = ['lista:usuarios', 'agregar:usuario', 'modificar:usuario', 'rol:usuario', 'ver:rol', 'agregar:rol', 'modificar:rol', 'asignar:permiso'];
    const gestorRole = (await admin.post('/api/roles', { name: 'Gestor', permissions: perms })).json().id;
    await admin.post('/api/users', { email: 'gestor@demo.test', name: 'Gestor', password: 'clave-gestor-123', role_id: gestorRole });
    const g = client((await login({ email: 'gestor@demo.test', password: 'clave-gestor-123' })).cookie);
    const roles = (await g.get('/api/roles')).json();
    const adminRole = roles.find((r: any) => r.name === 'admin').id;
    const users = (await g.get('/api/users')).json();
    const me = users.find((x: any) => x.email === 'gestor@demo.test');
    const adminUser = users.find((x: any) => x.email === ADMIN.email);
    expect((await g.patch(`/api/users/${me.id}`, { role_id: adminRole })).statusCode).toBe(403);
    expect((await g.post('/api/users', { email: 'nuevo-admin@demo.test', name: 'X', password: 'clave-larga-123', role_id: adminRole })).statusCode).toBe(403);
    expect((await g.patch(`/api/users/${adminUser.id}`, { password: 'clave-tomada-123' })).statusCode).toBe(403);
    expect((await g.post('/api/roles', { name: 'Más poder', permissions: ['ver:cotizacion'] })).statusCode).toBe(403);
    expect((await g.patch(`/api/roles/${gestorRole}`, { permissions: perms })).statusCode).toBe(403);
    const userRole = roles.find((r: any) => r.name === 'usuario').id;
    expect((await g.post('/api/users', { email: 'operador2@demo.test', name: 'X', password: 'clave-larga-123', role_id: userRole })).statusCode).toBe(403);
    expect((await g.post('/api/roles', { name: 'Sub', permissions: ['lista:usuarios'] })).statusCode).toBe(201);
  });

  it('cambiar contraseña invalida las sesiones del usuario', async () => {
    const { cookie } = await login(USER);
    const u2 = client(cookie);
    expect((await u2.get('/api/quotes')).statusCode).toBe(200);
    const target = (await admin.get('/api/users')).json().find((x: any) => x.email === USER.email);
    expect((await admin.patch(`/api/users/${target.id}`, { password: 'otra-clave-usuario' })).statusCode).toBe(200);
    expect((await u2.get('/api/quotes')).statusCode).toBe(401);
    await admin.patch(`/api/users/${target.id}`, { password: USER.password });
    user = client((await login(USER)).cookie);
  });

  it('una empresa no puede leer ni modificar datos de otra', async () => {
    const other = insert(db, 'companies', { name: 'Otra empresa ficticia' });
    const roles = ensureSystemRoles(db, other);
    insert(db, 'users', { company_id: other, email: 'otra@demo.test', name: 'Otra', password_hash: hashPassword('clave-otra-empresa'), role_id: roles.admin });
    const o = client((await login({ email: 'otra@demo.test', password: 'clave-otra-empresa' })).cookie);
    expect((await o.get('/api/quotes')).json()).toEqual([]);
    expect((await o.get('/api/quotes/1')).statusCode).toBe(404);
    expect((await o.patch(`/api/vehicles/${refVehicleId}`, { name: 'x' })).statusCode).toBe(404);
    expect((await o.post('/api/quotes', { item: { kind: 'freight', vehicleId: refVehicleId, route: refRoute } })).statusCode).toBe(404);
    expect((await o.post('/api/quotes', {})).json().folio).toMatch(/-0001$/);
  });
});

describe('validación de entradas', () => {
  it('rechaza rutas incoherentes y valores fuera de rango', async () => {
    const bad = { ...refRoute, legMeters: [] };
    expect((await admin.post('/api/calculate/freight', { vehicleId: refVehicleId, route: bad })).statusCode).toBe(400);
    expect((await admin.post('/api/calculate/freight', { vehicleId: refVehicleId, route: refRoute, input: { taxPct: 300 } })).statusCode).toBe(400);
  });
  it('peajes: una caseta cruzada dos veces se cobra dos veces', async () => {
    const route = {
      stops: [{ label: 'A', loaded: true }, { label: 'B', loaded: false }, { label: 'A', loaded: false }],
      legMeters: [100000, 100000],
      drivingSeconds: 7200,
      tollPasses: [{ legIndex: 0, name: 'Caseta de prueba A', amount: 652 }, { legIndex: 1, name: 'Caseta de prueba A', amount: 652 }],
    };
    const snap = (await admin.post('/api/calculate/freight', { vehicleId: refVehicleId, route })).json();
    expect(snap.result.tolls).toBe(1304);
  });
});

describe('renta y tarifarios', () => {
  it('renta mensual sin recorrido reproduce el caso observado', async () => {
    const snap = (await admin.post('/api/calculate/rental', { vehicleId: refVehicleId, input: { unit: 'month', quantity: 1 } })).json();
    expect(Math.round(snap.result.total * 100) / 100).toBe(68565.63);
  });

  it('el tarifario fija valores; la conversión a cotización los conserva', async () => {
    const routeId = (await admin.get('/api/saved-routes')).json()[0].id;
    const list = (await admin.post('/api/price-lists', { name: 'Lista de prueba', routeIds: [routeId], vehicleIds: [refVehicleId], profitPct: 20, taxPct: 16 })).json();
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0].unit_subtotal).toBe(4455.36);
    expect(list.rows[0].price_with_tax).toBe(5168.22);
    await admin.patch(`/api/vehicles/${refVehicleId}`, { fuel_price: 30 });
    const q = (await admin.post(`/api/price-lists/${list.id}/to-quote`, { rowIds: [list.rows[0].id] })).json();
    expect(q.items[0].unit_subtotal).toBe(4455.36);
    const re = (await admin.post(`/api/price-lists/${list.id}/recalculate`, {})).json();
    expect(re.rows[0].unit_subtotal).toBeGreaterThan(4455.36);
    await admin.patch(`/api/vehicles/${refVehicleId}`, { fuel_price: 23.41 });
    const docx = await admin.get(`/api/price-lists/${list.id}/export?format=docx`);
    expect(docxText(docx.rawPayload)).toContain('Referencia CDMX – Puebla');
  });
});

describe('persistencia', () => {
  it('los datos sobreviven a cerrar y reabrir la base', async () => {
    const count = db.prepare('SELECT COUNT(*) AS n FROM quotes').get()!.n;
    const file = join(dir, 'db.sqlite');
    const db2 = openDb(file);
    expect(db2.prepare('SELECT COUNT(*) AS n FROM quotes').get()!.n).toBe(count);
    expect(migrate(db2)).toEqual([]);
    db2.close();
  });
});

describe('cotización por km (caso CARMAG)', () => {
  const carmag = {
    route: {
      origin: { address: 'Av. Juan Gil Preciado #9200, int. 1, Parque Empresarial Tesistán', city: 'Zapopan', state: 'Jalisco', zip: '45200' },
      destination: { address: 'Calle Gonzálo Peña #303, Col. Francisco Medrano', city: 'Altamira', state: 'Tamaulipas', zip: '89602' },
    },
    trip: { outboundKm: 815, tripType: 'sencillo', distanceSource: 'manual', evaluateEmptyReturn: true },
    cargo: { pallets: 16, weightTons: 16, goods: 'Carga paletizada' },
  };
  let quote: any;
  let plataformaId: number;

  it('genera cinco alternativas por tarifa más margen objetivo y precio de referencia', async () => {
    const vs = (await admin.get('/api/vehicles')).json();
    plataformaId = vs.find((v: any) => v.name.startsWith('Referencia T3-S2')).id;
    const d = (await admin.get(`/api/km-quotes/defaults?vehicleId=${plataformaId}`)).json();
    expect(d.unit.unitType).toBe('plataforma');
    expect(d.pricing).toMatchObject({ minRate: 6000, maxRate: 6500 });
    const scenarios = [...d.scenarios, { id: 'ref', label: 'Referencia', kind: 'precio', freight: 5_200_000 }];
    const calc = (await admin.post('/api/calculate/km', { vehicleId: plataformaId, input: { ...carmag, scenarios } })).json();
    const byRate = calc.scenarios.filter((x: any) => x.kind === 'tarifa');
    expect(byRate.map((x: any) => x.subtotal / 100)).toEqual([48_900, 49_715, 50_530, 51_345, 52_975]);
    expect(calc.scenarios.find((x: any) => x.id === 'ref').subtotal).toBe(5_200_000);
    expect(calc.scenarios.every((x: any) => x.costs.total > 0)).toBe(true);
    expect(calc.recommendedId).toBeTruthy();

    const res = await admin.post('/api/quotes', { item: { kind: 'km', vehicleId: plataformaId, input: { ...carmag, scenarios }, selectedScenarioId: 'ref' } });
    expect(res.statusCode).toBe(201);
    quote = res.json();
    expect(quote.totals).toMatchObject({ subtotal: 52_000, tax: 8_320, total: 60_320 });
    expect(quote.origin_label).toBe('Zapopan, Jalisco');
    expect(quote.items[0].description).toContain('Zapopan, Jalisco → Altamira, Tamaulipas');
  });

  it('PDF para el cliente sin datos internos; PDF interno sólo bajo solicitud', async () => {
    const pdf = await admin.get(`/api/quotes/${quote.id}/km-pdf`);
    const text = (await new PDFParse({ data: new Uint8Array(pdf.rawPayload) }).getText()).text;
    expect(text).toContain(quote.folio);
    expect(text).toContain('Av. Juan Gil Preciado');
    expect(text).toContain('16 pallets / 16 t');
    expect(text).toContain('$60,320.00');
    for (const hidden of ['Margen', 'Excedente', 'Costo total', 'Operador', 'USO INTERNO']) expect(text).not.toContain(hidden);
    const cmp = await admin.get(`/api/quotes/${quote.id}/km-pdf?scenarios=t1,t3,t5`);
    const cmpText = (await new PDFParse({ data: new Uint8Array(cmp.rawPayload) }).getText()).text;
    expect(cmpText).toContain('ALTERNATIVAS');
    expect(cmpText).toContain('$48,900.00');
    expect(cmpText).toContain('$52,975.00');
    const internal = await admin.get(`/api/quotes/${quote.id}/km-pdf?internal=1`);
    expect((await new PDFParse({ data: new Uint8Array(internal.rawPayload) }).getText()).text).toContain('USO INTERNO');
    expect((await user.get(`/api/quotes/${quote.id}/km-pdf?internal=1`)).statusCode).toBe(200);
  });

  it('mensajes de WhatsApp y correo sólo con datos comerciales; se registra como preparado', async () => {
    const m = (await admin.get(`/api/quotes/${quote.id}/messages?scenarios=t1,ref`)).json();
    expect(m.whatsapp).toContain(quote.folio);
    expect(m.whatsapp).toContain('$48,900.00 + IVA');
    expect(m.whatsapp).not.toMatch(/margen|costo|operador/i);
    expect(m.whatsappUrl).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(m.email.subject).toContain('Zapopan, Jalisco → Altamira, Tamaulipas');
    const c = await admin.post(`/api/quotes/${quote.id}/communications`, { channel: 'whatsapp', body: m.whatsapp, scenarioIds: ['t1'] });
    expect(c.statusCode).toBe(201);
    expect((await admin.get(`/api/quotes/${quote.id}/communications`)).json()[0]).toMatchObject({ channel: 'whatsapp', status: 'preparado' });
  });

  it('correo: exige SMTP y confirmación; adjunta el PDF y registra envío', async () => {
    const payload = { to: 'compras@cliente-uno.test', subject: 'Cotización', body: 'Texto', scenarioIds: ['ref'], confirm: true };
    expect((await admin.post(`/api/quotes/${quote.id}/email`, payload)).statusCode).toBe(409);
    await admin.put('/api/integrations/smtp', { host: 'smtp.ejemplo.test', port: 587, user: 'u', password: 'p', from: 'cotizaciones@ejemplo.test' });
    expect((await admin.post(`/api/quotes/${quote.id}/email`, { ...payload, confirm: false })).statusCode).toBe(400);
    const res = await admin.post(`/api/quotes/${quote.id}/email`, payload);
    expect(res.statusCode).toBe(200);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].cfg.auth).toEqual({ user: 'u', pass: 'p' });
    expect(sentMail[0].raw).toContain('Content-Type: application/pdf');
    expect(sentMail[0].raw).toContain(`${quote.folio}`);
    const comms = (await admin.get(`/api/quotes/${quote.id}/communications`)).json();
    expect(comms[0]).toMatchObject({ channel: 'correo', status: 'enviado', recipient: 'compras@cliente-uno.test' });
  });

  it('elegir otra alternativa, editar con revisión, negociar, duplicar, archivar y filtrar', async () => {
    const item = quote.items[0];
    let q = (await admin.post(`/api/quotes/${quote.id}/items/${item.id}/select`, { scenarioId: 't3' })).json();
    expect(q.totals.subtotal).toBe(50_530);
    const input = { ...item.snapshot.input, route: item.snapshot.places, trip: { ...item.snapshot.input.trip, tripType: 'redondo', returnKm: 815, returnBillable: false } };
    q = (await admin.put(`/api/quotes/${quote.id}/items/${item.id}/km`, { input, selectedScenarioId: 't3' })).json();
    expect(q.items[0].snapshot.result.km).toMatchObject({ driven: 1630, billable: 815 });
    expect(q.totals.subtotal).toBe(50_530);
    expect((await admin.get(`/api/quotes/${quote.id}/items/${item.id}/revisions`)).json()).toHaveLength(2);
    q = (await admin.patch(`/api/quotes/${quote.id}`, { status: 'negotiating', final_amount: 51_000, follow_up_on: civilToday() })).json();
    expect(q.status).toBe('negotiating');
    expect((await admin.get('/api/follow-ups')).json().map((x: any) => x.id)).toContain(quote.id);
    const dup = (await admin.post(`/api/quotes/${quote.id}/duplicate`)).json();
    expect(dup.folio).not.toBe(quote.folio);
    expect(dup.items[0].unit_subtotal).toBe(50_530);
    expect(dup.status).toBe('draft');
    expect((await admin.get('/api/quotes?q=altamira')).json().map((x: any) => x.id)).toEqual(expect.arrayContaining([quote.id, dup.id]));
    await admin.patch(`/api/quotes/${dup.id}`, { archived: true });
    expect((await admin.get('/api/quotes?q=altamira')).json().map((x: any) => x.id)).not.toContain(dup.id);
    expect((await admin.get('/api/quotes?archived=1')).json().map((x: any) => x.id)).toContain(dup.id);
    const csv = await admin.get('/api/quotes-export.csv?q=altamira');
    expect(csv.body).toContain(quote.folio);
  });

  it('configuración de tarifas por tipo de unidad: sólo con permiso de preferencias', async () => {
    expect((await user.patch('/api/km-config', { units: { caja_seca: { pricing: { minRate: 7000, maxRate: 7600 } } } })).statusCode).toBe(403);
    const cfg = (await admin.patch('/api/km-config', { units: { caja_seca: { pricing: { minRate: 7000, maxRate: 7600 } } } })).json();
    expect(cfg.units.caja_seca.pricing.minRate).toBe(7000);
    expect(cfg.units.plataforma.pricing.minRate).toBe(6000);
    expect((await admin.patch('/api/km-config', { units: { plataforma: { pricing: { minRate: 7000, maxRate: 6000 } } } })).statusCode).toBe(400);
    const dry = (await admin.get('/api/vehicles')).json().find((v: any) => v.name.startsWith('Caja seca'));
    const d = (await admin.get(`/api/km-quotes/defaults?vehicleId=${dry.id}`)).json();
    expect(d.unit).toMatchObject({ unitType: 'caja_seca', lengthFt: 53 });
    expect(d.scenarios[0].rate).toBe(7000);
  });
});
