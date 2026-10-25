// Cotización por km: configuración por tipo de unidad, valores por defecto, validación y snapshot.
import { vehicleTireCostPerKm } from '../../shared/costing/index.ts';
import { computeKmQuote, defaultScenarios, type Charge, type KmQuoteInput, type OperatingCostConfig, type PricingConfig, type ScenarioSpec, type UnitType } from '../../shared/pricing/kmquote.ts';
import { HttpError } from '../auth.ts';
import { one, run, type DB } from '../db.ts';
import { loadParams } from './params.ts';
import { isoDate, n, oneOf, s } from './validate.ts';

export const KM_ENGINE_VERSION = 'km-1';

export interface UnitTypeConfig {
  pricing: Omit<PricingConfig, 'taxPct' | 'retentionPct' | 'tollsTaxable'>;
  operator: Pick<OperatingCostConfig, 'operatorModel' | 'operatorFixed' | 'operatorPct' | 'operatorPerKm' | 'operatorPerDiem'>;
  fixedCosts: { name: string; amount: number }[];
  extraPerKmCosts: { name: string; perKm: number }[];
  includeDepreciation: boolean;
}

export interface KmConfig {
  units: Record<UnitType, UnitTypeConfig>;
  taxPct: number;
  retentionPct: number;
  tollsTaxable: boolean;
  contingencyPct: number;
  commissionPct: number;
  /** null = usar el precio del perfil del vehículo. */
  dieselPerLiter: number | null;
  chargeCatalog: Omit<Charge, 'id'>[];
  terms: string;
  messages: { whatsapp: string; emailSubject: string; emailBody: string };
  showInternalToClient: boolean;
}

// Valores por defecto. Tarifas $60–$65/km son las del requerimiento de CARMAG; el resto son ejemplos editables.
const unitDefaults = (): UnitTypeConfig => ({
  pricing: { minRate: 6000, maxRate: 6500, targetRate: 6200, minTripPrice: 0, targetMarginPct: 25, minProfit: 0, rounding: 10000, roundingMode: 'ninguno' },
  operator: { operatorModel: 'por_km', operatorFixed: 0, operatorPct: 0, operatorPerKm: 0, operatorPerDiem: 0 },
  fixedCosts: [
    { name: 'Seguros', amount: 0 },
    { name: 'Administración', amount: 0 },
    { name: 'Gastos de carga', amount: 0 },
    { name: 'Pensión', amount: 0 },
  ],
  extraPerKmCosts: [],
  includeDepreciation: true,
});

export const DEFAULT_KM_CONFIG = (): KmConfig => ({
  units: { plataforma: unitDefaults(), caja_seca: unitDefaults() },
  taxPct: 16,
  retentionPct: 0,
  tollsTaxable: true,
  contingencyPct: 0,
  commissionPct: 0,
  dieselPerLiter: null,
  chargeCatalog: [
    { name: 'Maniobras de carga', type: 'fijo', value: 0, base: 'flete', classification: 'comercial', taxable: true, billToClient: true },
    { name: 'Maniobras de descarga', type: 'fijo', value: 0, base: 'flete', classification: 'comercial', taxable: true, billToClient: true },
    { name: 'Enlonado', type: 'fijo', value: 0, base: 'flete', classification: 'comercial', taxable: true, billToClient: true },
    { name: 'Amarres', type: 'fijo', value: 0, base: 'flete', classification: 'comercial', taxable: true, billToClient: true },
    { name: 'Estadías', type: 'fijo', value: 0, base: 'flete', classification: 'comercial', taxable: true, billToClient: true },
    { name: 'Custodia', type: 'fijo', value: 0, base: 'flete', classification: 'costo', taxable: true, billToClient: true },
    { name: 'Seguro adicional', type: 'porcentaje', value: 0, base: 'flete', classification: 'comercial', taxable: true, billToClient: true },
    { name: 'Comisión de agente', type: 'porcentaje', value: 0, base: 'flete', classification: 'costo', taxable: false, billToClient: false },
  ],
  terms: 'Precios en MXN. Vigencia indicada en la cotización. Sujeto a disponibilidad de unidad. Maniobras, estadías y cargos no incluidos se cotizan por separado.',
  messages: {
    whatsapp: 'Hola {cliente}, le comparto la cotización {folio} de {empresa}:\n{origen} → {destino}\n{unidad} · {carga}\n{opciones}\nVigencia: {vigencia}. Quedo atento.',
    emailSubject: 'Cotización {folio} · {origen} → {destino}',
    emailBody: 'Estimado(a) {cliente}:\n\nPor medio del presente compartimos la cotización {folio} para el servicio de transporte:\n\nOrigen: {origen}\nDestino: {destino}\nUnidad: {unidad}\nCarga: {carga}\n\n{opciones}\n\nVigencia: {vigencia}.\n\n{condiciones}\n\nQuedamos a sus órdenes.\n{empresa}\n{contacto}',
  },
  showInternalToClient: false,
});

export function getKmConfig(db: DB, companyId: number): KmConfig {
  const row = one(db, 'SELECT preferences FROM companies WHERE id = ?', companyId);
  const saved = (row ? JSON.parse(row.preferences) : {}).kmPricing ?? {};
  const d = DEFAULT_KM_CONFIG();
  return {
    ...d,
    ...saved,
    units: {
      plataforma: { ...d.units.plataforma, ...saved.units?.plataforma, pricing: { ...d.units.plataforma.pricing, ...saved.units?.plataforma?.pricing }, operator: { ...d.units.plataforma.operator, ...saved.units?.plataforma?.operator } },
      caja_seca: { ...d.units.caja_seca, ...saved.units?.caja_seca, pricing: { ...d.units.caja_seca.pricing, ...saved.units?.caja_seca?.pricing }, operator: { ...d.units.caja_seca.operator, ...saved.units?.caja_seca?.operator } },
    },
    messages: { ...d.messages, ...saved.messages },
  };
}

const cents = (x: unknown, field: string, max = 1e12) => Math.round(n(x, field, { min: 0, max, def: 0 }));
const arr = (x: unknown) => (Array.isArray(x) ? x : []);
const obj = (x: unknown): Record<string, any> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as any) : {});

function parseUnitConfig(x: unknown, d: UnitTypeConfig): UnitTypeConfig {
  const o = obj(x);
  const p = obj(o.pricing);
  const op = obj(o.operator);
  const pricing = {
    minRate: cents(p.minRate ?? d.pricing.minRate, 'tarifa mínima'),
    maxRate: cents(p.maxRate ?? d.pricing.maxRate, 'tarifa máxima'),
    targetRate: cents(p.targetRate ?? d.pricing.targetRate, 'tarifa objetivo'),
    minTripPrice: cents(p.minTripPrice ?? d.pricing.minTripPrice, 'precio mínimo por viaje'),
    targetMarginPct: n(p.targetMarginPct ?? d.pricing.targetMarginPct, 'margen objetivo', { min: 0, max: 99 }),
    minProfit: cents(p.minProfit ?? d.pricing.minProfit, 'ganancia mínima'),
    rounding: cents(p.rounding ?? d.pricing.rounding, 'redondeo'),
    roundingMode: oneOf(p.roundingMode, 'modo de redondeo', ['ninguno', 'cercano', 'arriba'] as const, d.pricing.roundingMode),
  };
  if (pricing.maxRate < pricing.minRate) throw new HttpError(400, 'La tarifa máxima debe ser mayor o igual a la mínima.');
  return {
    pricing,
    operator: {
      operatorModel: oneOf(op.operatorModel, 'modelo de pago', ['fijo', 'porcentaje', 'por_km'] as const, d.operator.operatorModel),
      operatorFixed: cents(op.operatorFixed ?? d.operator.operatorFixed, 'sueldo fijo'),
      operatorPct: n(op.operatorPct ?? d.operator.operatorPct, '% operador', { min: 0, max: 100 }),
      operatorPerKm: cents(op.operatorPerKm ?? d.operator.operatorPerKm, 'pago por km'),
      operatorPerDiem: cents(op.operatorPerDiem ?? d.operator.operatorPerDiem, 'viáticos'),
    },
    fixedCosts: arr(o.fixedCosts ?? d.fixedCosts).slice(0, 30).map((c: any, i) => ({ name: s(c?.name, `costo fijo ${i + 1}`, { required: true, max: 100 })!, amount: cents(c?.amount, 'costo fijo') })),
    extraPerKmCosts: arr(o.extraPerKmCosts ?? d.extraPerKmCosts).slice(0, 30).map((c: any, i) => ({ name: s(c?.name, `costo por km ${i + 1}`, { required: true, max: 100 })!, perKm: cents(c?.perKm, 'costo por km') })),
    includeDepreciation: o.includeDepreciation === undefined ? d.includeDepreciation : !!o.includeDepreciation,
  };
}

function parseCharge(c: any, i: number): Charge {
  const type = oneOf(c?.type, 'tipo de cargo', ['fijo', 'porcentaje'] as const, 'fijo');
  return {
    id: s(c?.id, 'id', { max: 40 }) ?? `c${i + 1}`,
    name: s(c?.name, `cargo ${i + 1}`, { required: true, max: 100 })!,
    type,
    value: type === 'fijo' ? cents(c?.value, 'importe del cargo') : n(c?.value, 'porcentaje del cargo', { min: 0, max: 100, def: 0 }),
    base: oneOf(c?.base, 'base del cargo', ['flete', 'costo_operativo'] as const, 'flete'),
    classification: oneOf(c?.classification, 'clasificación', ['costo', 'comercial'] as const, 'comercial'),
    taxable: c?.taxable === undefined ? true : !!c.taxable,
    billToClient: c?.billToClient === undefined ? true : !!c.billToClient,
    description: s(c?.description, 'descripción', { max: 300 }) ?? undefined,
  };
}

export function parseKmConfig(x: unknown, cur: KmConfig): KmConfig {
  const o = obj(x);
  const m = obj(o.messages);
  return {
    units: { plataforma: parseUnitConfig(obj(o.units).plataforma ?? cur.units.plataforma, cur.units.plataforma), caja_seca: parseUnitConfig(obj(o.units).caja_seca ?? cur.units.caja_seca, cur.units.caja_seca) },
    taxPct: n(o.taxPct ?? cur.taxPct, 'IVA', { min: 0, max: 100 }),
    retentionPct: n(o.retentionPct ?? cur.retentionPct, 'retención', { min: 0, max: 100 }),
    tollsTaxable: o.tollsTaxable === undefined ? cur.tollsTaxable : !!o.tollsTaxable,
    contingencyPct: n(o.contingencyPct ?? cur.contingencyPct, 'imprevistos', { min: 0, max: 100 }),
    commissionPct: n(o.commissionPct ?? cur.commissionPct, 'comisiones', { min: 0, max: 100 }),
    dieselPerLiter: o.dieselPerLiter === null || o.dieselPerLiter === '' ? null : o.dieselPerLiter === undefined ? cur.dieselPerLiter : cents(o.dieselPerLiter, 'diésel', 100000),
    chargeCatalog: arr(o.chargeCatalog ?? cur.chargeCatalog).slice(0, 50).map((c, i) => { const { id, ...rest } = parseCharge(c, i); return rest; }),
    terms: s(o.terms ?? cur.terms, 'condiciones', { max: 3000 }) ?? '',
    messages: {
      whatsapp: s(m.whatsapp ?? cur.messages.whatsapp, 'plantilla WhatsApp', { max: 3000, required: true })!,
      emailSubject: s(m.emailSubject ?? cur.messages.emailSubject, 'asunto', { max: 300, required: true })!,
      emailBody: s(m.emailBody ?? cur.messages.emailBody, 'cuerpo del correo', { max: 6000, required: true })!,
    },
    showInternalToClient: o.showInternalToClient === undefined ? cur.showInternalToClient : !!o.showInternalToClient,
  };
}

export function saveKmConfig(db: DB, companyId: number, cfg: KmConfig) {
  const row = one(db, 'SELECT preferences FROM companies WHERE id = ?', companyId)!;
  const prefs = JSON.parse(row.preferences);
  prefs.kmPricing = cfg;
  run(db, 'UPDATE companies SET preferences = ? WHERE id = ?', JSON.stringify(prefs), companyId);
}

/** Valores iniciales de una cotización por km a partir del perfil del vehículo y la configuración. */
export function kmDefaults(db: DB, companyId: number, vehicleId: number) {
  const params = loadParams(db, companyId, vehicleId);
  const v = one(db, 'SELECT unit_type, length_ft, max_pallets, axles, tons_capacity FROM vehicles WHERE id = ?', vehicleId)!;
  const cfg = getKmConfig(db, companyId);
  const unitType: UnitType = v.unit_type ?? 'plataforma';
  const u = cfg.units[unitType];
  const veh = params.vehicle;
  const maintPerKm = veh.maintenanceIntervalKm > 0 ? veh.maintenanceCost / veh.maintenanceIntervalKm : 0;
  const depPerKm = [{ value: veh.value, lifeKm: veh.lifeKm }, ...veh.assets].reduce((sum, a) => sum + (a.lifeKm > 0 ? (a.value * (1 - veh.salvagePct / 100)) / a.lifeKm : 0), 0);
  const perKmCosts = [
    { name: 'Llantas y desgaste', perKm: Math.round(vehicleTireCostPerKm(veh) * 100) },
    { name: 'Mantenimiento', perKm: Math.round(maintPerKm * 100) },
    ...(u.includeDepreciation ? [{ name: 'Depreciación', perKm: Math.round(depPerKm * 100) }] : []),
    ...u.extraPerKmCosts,
  ];
  const pricing: PricingConfig = { ...u.pricing, taxPct: cfg.taxPct, retentionPct: cfg.retentionPct, tollsTaxable: cfg.tollsTaxable };
  const dieselFromProfile = cfg.dieselPerLiter == null;
  return {
    unit: { name: veh.name, unitType, lengthFt: v.length_ft, maxWeightTons: v.tons_capacity, maxPallets: v.max_pallets, kmPerLiterLoaded: veh.kmPerLiterLoaded, kmPerLiterEmpty: veh.kmPerLiterEmpty, axles: v.axles },
    costs: {
      dieselPerLiter: dieselFromProfile ? Math.round(veh.fuelPricePerLiter * 100) : cfg.dieselPerLiter!,
      ...u.operator,
      operatorPerKm: u.operator.operatorModel === 'por_km' && !u.operator.operatorPerKm ? Math.round(veh.driverPayPerKmLoaded * 100) : u.operator.operatorPerKm,
      perKmCosts,
      fixedCosts: u.fixedCosts,
      contingencyPct: cfg.contingencyPct,
      commissionPct: cfg.commissionPct,
    } satisfies OperatingCostConfig,
    pricing,
    scenarios: defaultScenarios(pricing),
    chargeCatalog: cfg.chargeCatalog,
    sources: {
      diesel: dieselFromProfile ? 'Precio por litro del perfil del vehículo (dato configurado; actualízalo).' : 'Precio de diésel de la configuración de tarifas.',
      perKm: 'Llantas, mantenimiento y depreciación derivados del perfil del vehículo.',
      rates: 'Banda de tarifas y margen objetivo de Configuración → Tarifas por km.',
      tolls: 'Casetas: captura manual o del catálogo propio; no hay consulta automática.',
    },
    warnings: params.warnings,
  };
}

export interface PlaceInput {
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  references?: string | null;
  lat?: number | null;
  lon?: number | null;
}

function parsePlace(x: unknown, field: string, required: boolean): PlaceInput | null {
  const o = obj(x);
  const address = s(o.address, `dirección de ${field}`, { max: 300, required });
  if (!address) return null;
  const lat = o.lat === null || o.lat === undefined || o.lat === '' ? null : n(o.lat, 'latitud', { min: -90, max: 90 });
  const lon = o.lon === null || o.lon === undefined || o.lon === '' ? null : n(o.lon, 'longitud', { min: -180, max: 180 });
  return { address, city: s(o.city, 'ciudad', { max: 100 }), state: s(o.state, 'estado', { max: 100 }), zip: s(o.zip, 'código postal', { max: 10 }), references: s(o.references, 'referencias', { max: 300 }), lat, lon };
}

export function parseKmRequest(x: unknown, defaults: ReturnType<typeof kmDefaults>) {
  const o = obj(x);
  const t = obj(o.trip);
  const c = obj(o.cargo);
  const co = obj(o.costs);
  const p = obj(o.pricing);
  const u = obj(o.unit);
  const tripType = oneOf(t.tripType, 'tipo de viaje', ['sencillo', 'redondo'] as const, 'sencillo');
  const outboundKm = n(t.outboundKm, 'km de ida', { min: 0, max: 20000 });
  const input: KmQuoteInput = {
    unit: {
      ...defaults.unit,
      lengthFt: n(u.lengthFt ?? defaults.unit.lengthFt, 'largo de la unidad', { min: 0, max: 80 }),
      maxWeightTons: n(u.maxWeightTons ?? defaults.unit.maxWeightTons, 'capacidad', { min: 0, max: 200 }),
      maxPallets: n(u.maxPallets ?? defaults.unit.maxPallets, 'capacidad de pallets', { min: 0, max: 100 }),
      kmPerLiterLoaded: n(u.kmPerLiterLoaded ?? defaults.unit.kmPerLiterLoaded, 'rendimiento cargado', { min: 0, max: 100 }),
      kmPerLiterEmpty: n(u.kmPerLiterEmpty ?? defaults.unit.kmPerLiterEmpty, 'rendimiento vacío', { min: 0, max: 100 }),
    },
    trip: {
      outboundKm,
      distanceSource: oneOf(t.distanceSource, 'origen de la distancia', ['manual', 'proveedor'] as const, 'manual'),
      tripType,
      returnMode: oneOf(t.returnMode, 'regreso', ['vacio', 'cargado'] as const, 'vacio'),
      returnKm: n(t.returnKm ?? outboundKm, 'km de regreso', { min: 0, max: 20000 }),
      returnBillable: tripType === 'redondo' && !!t.returnBillable,
      repositioningKm: n(t.repositioningKm, 'km de reposicionamiento', { min: 0, max: 20000, def: 0 }),
      extraKm: n(t.extraKm, 'km adicionales', { min: 0, max: 20000, def: 0 }),
      extraKmBillable: !!t.extraKmBillable,
      evaluateEmptyReturn: tripType === 'sencillo' && !!t.evaluateEmptyReturn,
      tollsOutbound: cents(t.tollsOutbound, 'casetas de ida'),
      tollsReturn: cents(t.tollsReturn, 'casetas de regreso'),
      tollsBilling: oneOf(t.tollsBilling, 'cobro de casetas', ['incluidas', 'aparte'] as const, 'incluidas'),
    },
    cargo: {
      pallets: n(c.pallets, 'pallets', { min: 0, max: 1000, def: 0 }),
      weightTons: n(c.weightTons, 'peso', { min: 0, max: 1000, def: 0 }),
      goods: s(c.goods, 'tipo de mercancía', { max: 200 }) ?? '',
      lengthM: c.lengthM ? n(c.lengthM, 'largo de carga', { min: 0, max: 100 }) : null,
      widthM: c.widthM ? n(c.widthM, 'ancho de carga', { min: 0, max: 10 }) : null,
      heightM: c.heightM ? n(c.heightM, 'alto de carga', { min: 0, max: 10 }) : null,
      loadDate: isoDate(c.loadDate, 'fecha de carga'),
      deliveryDate: isoDate(c.deliveryDate, 'fecha de entrega'),
      tarp: !!c.tarp,
      straps: !!c.straps,
      handling: oneOf(c.handling, 'maniobras', ['cliente', 'transportista'] as const, 'cliente'),
      notes: s(c.notes, 'observaciones', { max: 1000 }) ?? '',
    },
    costs: {
      dieselPerLiter: cents(co.dieselPerLiter ?? defaults.costs.dieselPerLiter, 'diésel', 100000),
      operatorModel: oneOf(co.operatorModel, 'modelo de pago', ['fijo', 'porcentaje', 'por_km'] as const, defaults.costs.operatorModel),
      operatorFixed: cents(co.operatorFixed ?? defaults.costs.operatorFixed, 'sueldo fijo'),
      operatorPct: n(co.operatorPct ?? defaults.costs.operatorPct, '% operador', { min: 0, max: 100 }),
      operatorPerKm: cents(co.operatorPerKm ?? defaults.costs.operatorPerKm, 'pago por km'),
      operatorPerDiem: cents(co.operatorPerDiem ?? defaults.costs.operatorPerDiem, 'viáticos'),
      perKmCosts: arr(co.perKmCosts ?? defaults.costs.perKmCosts).slice(0, 30).map((x: any, i) => ({ name: s(x?.name, `costo por km ${i + 1}`, { max: 100 }) ?? `Costo ${i + 1}`, perKm: cents(x?.perKm, 'costo por km', 1e7) })),
      fixedCosts: arr(co.fixedCosts ?? defaults.costs.fixedCosts).slice(0, 30).map((x: any, i) => ({ name: s(x?.name, `costo fijo ${i + 1}`, { max: 100 }) ?? `Costo ${i + 1}`, amount: cents(x?.amount, 'costo fijo') })),
      contingencyPct: n(co.contingencyPct ?? defaults.costs.contingencyPct, 'imprevistos', { min: 0, max: 100 }),
      commissionPct: n(co.commissionPct ?? defaults.costs.commissionPct, 'comisiones', { min: 0, max: 100 }),
    },
    charges: arr(o.charges).slice(0, 30).map(parseCharge),
    pricing: {
      minRate: cents(p.minRate ?? defaults.pricing.minRate, 'tarifa mínima'),
      maxRate: cents(p.maxRate ?? defaults.pricing.maxRate, 'tarifa máxima'),
      targetRate: cents(p.targetRate ?? defaults.pricing.targetRate, 'tarifa objetivo'),
      minTripPrice: cents(p.minTripPrice ?? defaults.pricing.minTripPrice, 'precio mínimo'),
      targetMarginPct: n(p.targetMarginPct ?? defaults.pricing.targetMarginPct, 'margen objetivo', { min: 0, max: 99 }),
      minProfit: cents(p.minProfit ?? defaults.pricing.minProfit, 'ganancia mínima'),
      rounding: cents(p.rounding ?? defaults.pricing.rounding, 'redondeo'),
      roundingMode: oneOf(p.roundingMode, 'redondeo', ['ninguno', 'cercano', 'arriba'] as const, defaults.pricing.roundingMode),
      taxPct: n(p.taxPct ?? defaults.pricing.taxPct, 'IVA', { min: 0, max: 100 }),
      retentionPct: n(p.retentionPct ?? defaults.pricing.retentionPct, 'retención', { min: 0, max: 100 }),
      tollsTaxable: p.tollsTaxable === undefined ? defaults.pricing.tollsTaxable : !!p.tollsTaxable,
    },
    scenarios: arr(o.scenarios ?? defaults.scenarios).slice(0, 12).map((x: any, i): ScenarioSpec => {
      const id = s(x?.id, 'id', { max: 40 }) ?? `s${i + 1}`;
      const label = s(x?.label, `alternativa ${i + 1}`, { max: 60 }) ?? `Alternativa ${i + 1}`;
      const kind = oneOf(x?.kind, 'tipo de alternativa', ['tarifa', 'precio', 'margen'] as const);
      if (kind === 'tarifa') return { id, label, kind, rate: cents(x.rate, 'tarifa por km', 1e6) };
      if (kind === 'precio') return { id, label, kind, freight: cents(x.freight, 'precio del flete') };
      return { id, label, kind, marginPct: n(x.marginPct, 'margen', { min: 0, max: 99 }) };
    }),
  };
  if (!input.scenarios.length) throw new HttpError(400, 'Define al menos una alternativa.');
  if (new Set(input.scenarios.map((x) => x.id)).size !== input.scenarios.length) throw new HttpError(400, 'Los identificadores de alternativas deben ser únicos.');
  const route = obj(o.route);
  const places = {
    origin: parsePlace(route.origin, 'origen', true)!,
    destination: parsePlace(route.destination, 'destino', true)!,
    waypoints: arr(route.waypoints).slice(0, 10).map((w, i) => parsePlace(w, `punto ${i + 1}`, false)).filter(Boolean) as PlaceInput[],
    provider: s(route.provider, 'proveedor', { max: 40 }),
  };
  return { input, places };
}

export function kmSnapshot(db: DB, companyId: number, vehicleId: number, body: Record<string, unknown>) {
  const defaults = kmDefaults(db, companyId, vehicleId);
  const { input, places } = parseKmRequest(body, defaults);
  const result = computeKmQuote(input);
  const selected = s(body.selectedScenarioId, 'alternativa elegida', { max: 40 }) ?? result.recommendedId;
  const chosen = result.scenarios.find((x) => x.id === selected);
  if (!chosen || chosen.warnings.some((w) => w.code === 'imposible')) throw new HttpError(400, 'Elige una alternativa válida.');
  return {
    snapshot: { kind: 'km', engine: KM_ENGINE_VERSION, computedAt: new Date().toISOString(), input, places, result, selectedScenarioId: chosen.id, sources: defaults.sources },
    unitSubtotal: chosen.subtotal / 100,
  };
}

export const placeLabel = (p: PlaceInput) => [p.city, p.state].filter(Boolean).join(', ') || p.address;

export function describeKm(snapshot: any, vehicleName: string) {
  const t = snapshot.input.trip;
  const kind = t.tripType === 'redondo' ? 'viaje redondo' : 'viaje sencillo';
  return `Flete ${kind} ${placeLabel(snapshot.places.origin)} → ${placeLabel(snapshot.places.destination)} · ${vehicleName}`;
}
