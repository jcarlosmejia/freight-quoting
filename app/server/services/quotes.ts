// Cotizaciones: folios, partidas calculadas en servidor, snapshots inmutables y recálculo explícito.
import {
  computeFreight,
  computeRental,
  defaultFreightInput,
  defaultRentalInput,
  ENGINE_VERSION,
  round2,
  type FreightInput,
  type RentalInput,
  type RouteInput,
} from '../../shared/costing/index.ts';
import { HttpError } from '../auth.ts';
import { all, insert, one, run, tx, type DB, type Row } from '../db.ts';
import { describeKm, kmDefaults, kmSnapshot, KM_ENGINE_VERSION, placeLabel } from './kmquotes.ts';
import { loadParams } from './params.ts';
import { parseFreightInput, parseRentalInput, parseRoute } from './validate.ts';

export interface Preferences {
  profitPct: number;
  financingPct: number;
  taxPct: number;
  validityDays: number;
  cargoTypes: { name: string; surchargePct: number }[];
  driverPayMethod: FreightInput['driverPay']['method'];
  driverPayApplyMargin: boolean;
  profitEditable: boolean;
  taxEditable: boolean;
  financingEditable: boolean;
  driverPayEditable: boolean;
  cargoTypeEditable: boolean;
  /** Color de identidad para documentos (hex). */
  brandColor: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  profitPct: 20,
  financingPct: 0,
  taxPct: 16,
  validityDays: 30,
  cargoTypes: [
    { name: 'Carga General', surchargePct: 0 },
    { name: 'Carga Refrigerada', surchargePct: 0 },
    { name: 'Material Peligroso', surchargePct: 0 },
  ],
  driverPayMethod: 'per_km',
  driverPayApplyMargin: true,
  profitEditable: true,
  taxEditable: true,
  financingEditable: true,
  driverPayEditable: true,
  cargoTypeEditable: true,
  brandColor: '#1D4ED8',
};

export function getPreferences(db: DB, companyId: number): Preferences {
  const row = one(db, 'SELECT preferences FROM companies WHERE id = ?', companyId);
  return { ...DEFAULT_PREFERENCES, ...(row ? JSON.parse(row.preferences) : {}) };
}

/** Fecha civil en la zona de la empresa (America/Mexico_City para MX); evita el desfase UTC observado. */
export function civilToday(timeZone = 'America/Mexico_City', now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return p;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Reserva el siguiente folio dentro de una transacción; el índice único (company_id, folio) impide duplicados. */
export function nextFolio(db: DB, companyId: number, year: number): string {
  const c = one(db, 'SELECT folio_prefix, folio_digits, folio_include_year FROM companies WHERE id = ?', companyId)!;
  run(db, 'INSERT INTO folio_counters (company_id, year, last) VALUES (?, ?, 0) ON CONFLICT DO NOTHING', companyId, year);
  run(db, 'UPDATE folio_counters SET last = last + 1 WHERE company_id = ? AND year = ?', companyId, year);
  const { last } = one(db, 'SELECT last FROM folio_counters WHERE company_id = ? AND year = ?', companyId, year)!;
  const seq = String(last).padStart(c.folio_digits, '0');
  return c.folio_include_year ? `${c.folio_prefix}-${year}-${seq}` : `${c.folio_prefix}-${seq}`;
}

export function createQuote(db: DB, companyId: number, userId: number, body: { clientId?: number | null; notes?: string | null; validUntil?: string | null }) {
  const prefs = getPreferences(db, companyId);
  if (body.clientId != null && !one(db, 'SELECT id FROM clients WHERE id = ? AND company_id = ?', body.clientId, companyId)) {
    throw new HttpError(400, 'Cliente no encontrado.');
  }
  const today = civilToday();
  return tx(db, () => {
    const folio = nextFolio(db, companyId, Number(today.slice(0, 4)));
    return insert(db, 'quotes', {
      company_id: companyId,
      folio,
      client_id: body.clientId ?? null,
      issued_on: today,
      valid_until: body.validUntil ?? addDays(today, prefs.validityDays),
      tax_pct: prefs.taxPct,
      notes: body.notes ?? null,
      created_by: userId,
    });
  });
}

export function getQuote(db: DB, companyId: number, id: number) {
  const q = one(db, 'SELECT * FROM quotes WHERE id = ? AND company_id = ?', id, companyId);
  if (!q) throw new HttpError(404, 'Cotización no encontrada.');
  const items = all(db, 'SELECT * FROM quote_items WHERE quote_id = ? ORDER BY position', id).map(itemOut);
  return { ...q, effective_status: effectiveStatus(q.status, q.valid_until), items, totals: quoteTotals(items, q.tax_pct, q.retention_pct ?? 0) };
}

const itemOut = (r: Row) => ({ ...r, snapshot: JSON.parse(r.snapshot) });

/** Escenario elegido de una partida por km (o null si la partida es de otro tipo). */
export const selectedScenario = (snapshot: any) => (snapshot?.kind === 'km' ? snapshot.result.scenarios.find((x: any) => x.id === snapshot.selectedScenarioId) ?? null : null);

export function quoteTotals(items: { quantity: number; unit_subtotal: number; snapshot: any }[], taxPct: number, retentionPct = 0) {
  const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unit_subtotal, 0));
  // Partidas por km pueden tener renglones no gravables (p. ej. casetas); se respeta su proporción gravable.
  const taxable = round2(items.reduce((s, i) => {
    const sc = selectedScenario(i.snapshot);
    const ratio = sc && sc.subtotal > 0 ? sc.taxableBase / sc.subtotal : 1;
    return s + i.quantity * i.unit_subtotal * ratio;
  }, 0));
  const profit = items.reduce((s, i) => s + i.quantity * (selectedScenario(i.snapshot) ? selectedScenario(i.snapshot).surplus / 100 : (i.snapshot?.result?.profit ?? 0)), 0);
  const emptyNotCharged = items.reduce((s, i) => s + i.quantity * (i.snapshot?.result?.emptyNotCharged ?? 0), 0);
  const tax = round2(taxable * (taxPct / 100));
  const retention = round2(taxable * (retentionPct / 100));
  return { subtotal, taxable, profit: round2(profit), emptyNotCharged: round2(emptyNotCharged), taxPct, tax, retentionPct, retention, total: round2(subtotal + tax - retention) };
}

export function freightSnapshot(db: DB, companyId: number, vehicleId: number, rawRoute: unknown, rawInput: unknown) {
  const params = loadParams(db, companyId, vehicleId);
  const route: RouteInput = parseRoute(rawRoute);
  const prefs = getPreferences(db, companyId);
  const defaults = { ...defaultFreightInput(params.vehicle), profitPct: prefs.profitPct, financingPct: prefs.financingPct, taxPct: prefs.taxPct };
  defaults.driverPay = { ...defaults.driverPay, method: prefs.driverPayMethod, applyMargin: prefs.driverPayApplyMargin };
  const input = parseFreightInput(rawInput, defaults);
  const result = computeFreight(params, route, input);
  const { warnings, ...frozenParams } = params;
  return { snapshot: { kind: 'freight', engine: ENGINE_VERSION, computedAt: new Date().toISOString(), params: frozenParams, route, input, result, warnings }, unitSubtotal: round2(result.subtotal) };
}

export function rentalSnapshot(db: DB, companyId: number, vehicleId: number, rawInput: unknown) {
  const params = loadParams(db, companyId, vehicleId);
  const prefs = getPreferences(db, companyId);
  const input: RentalInput = parseRentalInput(rawInput, { ...defaultRentalInput(params), profitPct: prefs.profitPct, taxPct: prefs.taxPct });
  const result = computeRental(params, input);
  const { warnings, ...frozenParams } = params;
  return {
    snapshot: { kind: 'rental', engine: ENGINE_VERSION, computedAt: new Date().toISOString(), params: frozenParams, input, result, warnings },
    unitSubtotal: round2(result.unitSubtotal),
    quantity: Math.max(1, Math.floor(input.quantity) || 1),
  };
}

export function describeFreight(vehicleName: string, route: RouteInput): string {
  const stops = route.stops;
  const first = stops[0]?.label ?? '';
  let lastLoaded = -1;
  for (let i = stops.length - 2; i >= 0; i--) if (stops[i].loaded) { lastLoaded = i + 1; break; }
  const end = stops[stops.length - 1]?.label ?? '';
  if (lastLoaded > 0 && lastLoaded < stops.length - 1) return `Servicio de ${vehicleName} de ${first} a ${stops[lastLoaded].label} (con regreso a ${end})`;
  return `Servicio de ${vehicleName} de ${first} a ${end}`;
}

export function addItem(db: DB, companyId: number, quoteId: number, body: Record<string, unknown>) {
  getQuote(db, companyId, quoteId);
  const vehicleId = Number(body.vehicleId);
  if (!Number.isInteger(vehicleId)) throw new HttpError(400, 'Selecciona un vehículo.');
  const vehicle = one(db, 'SELECT name FROM vehicles WHERE id = ? AND company_id = ?', vehicleId, companyId);
  if (!vehicle) throw new HttpError(404, 'Vehículo no encontrado.');
  const savedRouteId = body.savedRouteId == null ? null : Number(body.savedRouteId);
  if (savedRouteId != null && !one(db, 'SELECT id FROM saved_routes WHERE id = ? AND company_id = ?', savedRouteId, companyId)) {
    throw new HttpError(400, 'Ruta guardada no encontrada.');
  }
  let built: { snapshot: any; unitSubtotal: number; quantity?: number };
  let description: string;
  if (body.kind === 'rental') {
    built = rentalSnapshot(db, companyId, vehicleId, body.input);
    const unitWord = { hour: 'hora(s)', shift: 'jornada(s)', day: 'día(s)', week: 'semana(s)', month: 'mes(es)', flat: 'mes(es)' }[built.snapshot.input.unit as string];
    description = `${built.snapshot.input.unit === 'flat' ? 'Renta fija de' : 'Renta de'} ${vehicle.name} — ${built.snapshot.input.quantity} ${unitWord}`;
  } else if (body.kind === 'freight') {
    built = freightSnapshot(db, companyId, vehicleId, body.route, body.input);
    description = describeFreight(vehicle.name, built.snapshot.route);
  } else if (body.kind === 'km') {
    built = kmSnapshot(db, companyId, vehicleId, body.input && typeof body.input === 'object' ? { ...(body.input as object), selectedScenarioId: body.selectedScenarioId } : {});
    description = describeKm(built.snapshot, vehicle.name);
  } else throw new HttpError(400, 'Tipo de partida inválido.');
  const custom = typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 500) : null;
  return tx(db, () => {
    const pos = one(db, 'SELECT COALESCE(MAX(position), 0) + 1 AS p FROM quote_items WHERE quote_id = ?', quoteId)!.p;
    const id = insert(db, 'quote_items', {
      quote_id: quoteId,
      position: pos,
      kind: body.kind as string,
      description: custom ?? description,
      quantity: built.quantity ?? 1,
      unit_subtotal: built.unitSubtotal,
      vehicle_id: vehicleId,
      saved_route_id: savedRouteId,
      snapshot: JSON.stringify(built.snapshot),
      engine_version: body.kind === 'km' ? KM_ENGINE_VERSION : ENGINE_VERSION,
    });
    if (body.kind === 'km') syncKmHeader(db, quoteId, built.snapshot);
    touch(db, quoteId);
    return id;
  });
}

/** IVA, retención y origen/destino de la cotización siguen a la partida por km más reciente. */
function syncKmHeader(db: DB, quoteId: number, snap: any) {
  run(db, 'UPDATE quotes SET tax_pct = ?, retention_pct = ?, origin_label = ?, destination_label = ? WHERE id = ?', snap.input.pricing.taxPct, snap.input.pricing.retentionPct, placeLabel(snap.places.origin), placeLabel(snap.places.destination), quoteId);
}

function reviseItem(db: DB, quoteId: number, item: Row, userId: number, unitSubtotal: number, snapshot: any, engine: string, description?: string) {
  tx(db, () => {
    insert(db, 'quote_item_revisions', { item_id: item.id, unit_subtotal: item.unit_subtotal, snapshot: item.snapshot, engine_version: item.engine_version, replaced_by: userId });
    run(db, 'UPDATE quote_items SET unit_subtotal = ?, snapshot = ?, engine_version = ?, description = COALESCE(?, description) WHERE id = ?', unitSubtotal, JSON.stringify(snapshot), engine, description ?? null, item.id);
    if (snapshot.kind === 'km') syncKmHeader(db, quoteId, snapshot);
    touch(db, quoteId);
  });
}

function loadItem(db: DB, companyId: number, quoteId: number, itemId: number) {
  getQuote(db, companyId, quoteId);
  const item = one(db, 'SELECT * FROM quote_items WHERE id = ? AND quote_id = ?', itemId, quoteId);
  if (!item) throw new HttpError(404, 'Partida no encontrada.');
  return item;
}

/** Reemplaza una partida por km editada en el asistente; la versión anterior queda en el historial. */
export function replaceKmItem(db: DB, companyId: number, quoteId: number, itemId: number, userId: number, body: Record<string, unknown>) {
  const item = loadItem(db, companyId, quoteId, itemId);
  if (item.kind !== 'km') throw new HttpError(400, 'Sólo las partidas por km se editan en el asistente.');
  const vehicleId = Number(body.vehicleId ?? item.vehicle_id);
  const vehicle = one(db, 'SELECT name FROM vehicles WHERE id = ? AND company_id = ?', vehicleId, companyId);
  if (!vehicle) throw new HttpError(404, 'Vehículo no encontrado.');
  const built = kmSnapshot(db, companyId, vehicleId, { ...(body.input as object), selectedScenarioId: body.selectedScenarioId });
  run(db, 'UPDATE quote_items SET vehicle_id = ? WHERE id = ?', vehicleId, itemId);
  reviseItem(db, quoteId, item, userId, built.unitSubtotal, built.snapshot, KM_ENGINE_VERSION, describeKm(built.snapshot, vehicle.name));
}

/** Elige otra alternativa ya calculada (sin recalcular costos). */
export function selectKmScenario(db: DB, companyId: number, quoteId: number, itemId: number, userId: number, scenarioId: string) {
  const item = loadItem(db, companyId, quoteId, itemId);
  const snap = JSON.parse(item.snapshot);
  if (snap.kind !== 'km') throw new HttpError(400, 'La partida no tiene alternativas.');
  const sc = snap.result.scenarios.find((x: any) => x.id === scenarioId);
  if (!sc || sc.warnings.some((w: any) => w.code === 'imposible')) throw new HttpError(400, 'Alternativa inválida.');
  reviseItem(db, quoteId, item, userId, sc.subtotal / 100, { ...snap, selectedScenarioId: scenarioId }, item.engine_version);
}

/** Copia una cotización con folio nuevo, en borrador, conservando los snapshots de sus partidas. */
export function duplicateQuote(db: DB, companyId: number, quoteId: number, userId: number) {
  const q = getQuote(db, companyId, quoteId);
  const prefs = getPreferences(db, companyId);
  const today = civilToday();
  return tx(db, () => {
    const id = insert(db, 'quotes', {
      company_id: companyId,
      folio: nextFolio(db, companyId, Number(today.slice(0, 4))),
      client_id: q.client_id,
      issued_on: today,
      valid_until: addDays(today, prefs.validityDays),
      tax_pct: q.tax_pct,
      retention_pct: q.retention_pct,
      notes: q.notes,
      terms: q.terms,
      origin_label: q.origin_label,
      destination_label: q.destination_label,
      created_by: userId,
    });
    for (const it of q.items) {
      insert(db, 'quote_items', { quote_id: id, position: it.position, kind: it.kind, description: it.description, quantity: it.quantity, unit_subtotal: it.unit_subtotal, vehicle_id: it.vehicle_id, saved_route_id: it.saved_route_id, snapshot: JSON.stringify(it.snapshot), engine_version: it.engine_version });
    }
    return id;
  });
}

/** Recalcula una partida con parámetros vigentes. Conserva entradas comerciales y guarda la versión anterior. */
export function recalcItem(db: DB, companyId: number, quoteId: number, itemId: number, userId: number) {
  const item = loadItem(db, companyId, quoteId, itemId);
  if (item.vehicle_id == null) throw new HttpError(409, 'El vehículo de esta partida ya no existe; no se puede recalcular.');
  const old = JSON.parse(item.snapshot);
  if (old.kind === 'km') {
    // Recalcular: diésel, rendimientos y costos por km vuelven a los valores vigentes; viaje, cargos y alternativas se conservan.
    const d = kmDefaults(db, companyId, item.vehicle_id);
    const input = { ...old.input, route: old.places, unit: { ...old.input.unit, kmPerLiterLoaded: d.unit.kmPerLiterLoaded, kmPerLiterEmpty: d.unit.kmPerLiterEmpty }, costs: { ...old.input.costs, dieselPerLiter: d.costs.dieselPerLiter, perKmCosts: d.costs.perKmCosts } };
    const built = kmSnapshot(db, companyId, item.vehicle_id, { ...input, selectedScenarioId: old.selectedScenarioId });
    reviseItem(db, quoteId, item, userId, built.unitSubtotal, built.snapshot, KM_ENGINE_VERSION);
    return { before: item.unit_subtotal, after: built.unitSubtotal };
  }
  // Al recalcular se descartan sobrescrituras de combustible/rendimiento para usar los valores vigentes del perfil.
  const input = old.kind === 'freight' ? { ...old.input, fuelPricePerLiter: null, kmPerLiterLoaded: null, kmPerLiterEmpty: null, breakCost: null } : { ...old.input, fuelPricePerLiter: null, kmPerLiter: null };
  const built = old.kind === 'freight' ? freightSnapshot(db, companyId, item.vehicle_id, old.route, input) : rentalSnapshot(db, companyId, item.vehicle_id, input);
  tx(db, () => {
    insert(db, 'quote_item_revisions', { item_id: itemId, unit_subtotal: item.unit_subtotal, snapshot: item.snapshot, engine_version: item.engine_version, replaced_by: userId });
    run(db, 'UPDATE quote_items SET unit_subtotal = ?, snapshot = ?, engine_version = ? WHERE id = ?', built.unitSubtotal, JSON.stringify(built.snapshot), ENGINE_VERSION, itemId);
    touch(db, quoteId);
  });
  return { before: item.unit_subtotal, after: built.unitSubtotal };
}

const touch = (db: DB, quoteId: number) => run(db, 'UPDATE quotes SET updated_at = ? WHERE id = ?', new Date().toISOString(), quoteId);

/** Estado efectivo: una cotización enviada o en borrador con vigencia pasada se reporta como vencida. */
export function effectiveStatus(status: string, validUntil: string | null, today = civilToday()) {
  if ((status === 'draft' || status === 'sent') && validUntil && validUntil < today) return 'expired';
  return status;
}
