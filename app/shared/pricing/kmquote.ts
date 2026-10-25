// Cotización por kilómetro con escenarios comerciales. Funciones puras; dinero en centavos enteros
// (cada renglón se redondea una sola vez y los totales son sumas exactas de enteros).

export type UnitType = 'plataforma' | 'caja_seca';
export type Cents = number;

export interface UnitSpec {
  name: string;
  unitType: UnitType;
  lengthFt: number;
  maxWeightTons: number;
  maxPallets: number;
  kmPerLiterLoaded: number;
  kmPerLiterEmpty: number;
  axles: number;
}

export interface TripInput {
  outboundKm: number;
  distanceSource: 'manual' | 'proveedor';
  tripType: 'sencillo' | 'redondo';
  returnMode: 'vacio' | 'cargado';
  /** Km del regreso (por defecto igual a la ida, origen y destino invertidos). */
  returnKm: number;
  /** El cliente paga el regreso. Nunca se activa solo. */
  returnBillable: boolean;
  /** Km sin carga para llegar al punto de carga; no facturables. */
  repositioningKm: number;
  extraKm: number;
  extraKmBillable: boolean;
  /** En viaje sencillo, calcular internamente cuánto cuesta regresar vacío (no se cobra). */
  evaluateEmptyReturn: boolean;
  tollsOutbound: Cents;
  tollsReturn: Cents;
  tollsBilling: 'incluidas' | 'aparte';
}

export interface CargoInput {
  pallets: number;
  weightTons: number;
  goods: string;
  lengthM?: number | null;
  widthM?: number | null;
  heightM?: number | null;
  loadDate?: string | null;
  deliveryDate?: string | null;
  tarp: boolean;
  straps: boolean;
  handling: 'cliente' | 'transportista';
  notes?: string;
}

export interface OperatingCostConfig {
  dieselPerLiter: Cents;
  operatorModel: 'fijo' | 'porcentaje' | 'por_km';
  operatorFixed: Cents;
  /** % del flete base. */
  operatorPct: number;
  operatorPerKm: Cents;
  operatorPerDiem: Cents;
  perKmCosts: { name: string; perKm: Cents }[];
  fixedCosts: { name: string; amount: Cents }[];
  /** Imprevistos como % del costo directo. */
  contingencyPct: number;
  /** Comisiones de venta como % del flete base. */
  commissionPct: number;
}

export interface Charge {
  id: string;
  name: string;
  type: 'fijo' | 'porcentaje';
  /** Centavos si es fijo; porcentaje si es porcentual. */
  value: number;
  base: 'flete' | 'costo_operativo';
  classification: 'costo' | 'comercial';
  taxable: boolean;
  billToClient: boolean;
  description?: string;
}

export interface PricingConfig {
  minRate: Cents;
  maxRate: Cents;
  targetRate: Cents;
  minTripPrice: Cents;
  targetMarginPct: number;
  minProfit: Cents;
  rounding: Cents;
  roundingMode: 'ninguno' | 'cercano' | 'arriba';
  taxPct: number;
  /** Retención de IVA al autotransporte (persona moral); 0 si no aplica. */
  retentionPct: number;
  tollsTaxable: boolean;
}

export type ScenarioSpec =
  | { id: string; label: string; kind: 'tarifa'; rate: Cents }
  | { id: string; label: string; kind: 'precio'; freight: Cents }
  | { id: string; label: string; kind: 'margen'; marginPct: number };

export interface KmQuoteInput {
  unit: UnitSpec;
  trip: TripInput;
  cargo: CargoInput;
  costs: OperatingCostConfig;
  charges: Charge[];
  pricing: PricingConfig;
  scenarios: ScenarioSpec[];
}

export interface Warning {
  code: string;
  message: string;
}

const r = (x: number) => Math.round(x);
const pct = (c: Cents, p: number) => r((c * p) / 100);
const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);

export function roundCommercial(c: Cents, step: Cents, mode: PricingConfig['roundingMode']): Cents {
  if (mode === 'ninguno' || step <= 0) return c;
  return mode === 'arriba' ? Math.ceil(c / step) * step : Math.round(c / step) * step;
}

export function kmBreakdown(t: TripInput) {
  const outbound = Math.max(0, n(t.outboundKm));
  const ret = t.tripType === 'redondo' ? Math.max(0, n(t.returnKm)) : 0;
  const repositioning = Math.max(0, n(t.repositioningKm));
  const extra = Math.max(0, n(t.extraKm));
  const driven = outbound + ret + repositioning + extra;
  const billable = outbound + (t.tripType === 'redondo' && t.returnBillable ? ret : 0) + (t.extraKmBillable ? extra : 0);
  const loaded = outbound + (t.tripType === 'redondo' && t.returnMode === 'cargado' ? ret : 0) + (t.extraKmBillable ? extra : 0);
  return { outbound, return: ret, repositioning, extra, driven, billable, loaded, empty: driven - loaded };
}

/** Costos que no dependen del precio. */
export function directCosts(i: KmQuoteInput) {
  const km = kmBreakdown(i.trip);
  const c = i.costs;
  const fuelLoaded = i.unit.kmPerLiterLoaded > 0 ? r((km.loaded / i.unit.kmPerLiterLoaded) * c.dieselPerLiter) : 0;
  const fuelEmpty = i.unit.kmPerLiterEmpty > 0 ? r((km.empty / i.unit.kmPerLiterEmpty) * c.dieselPerLiter) : 0;
  const tolls = n(i.trip.tollsOutbound) + (i.trip.tripType === 'redondo' ? n(i.trip.tollsReturn) : 0);
  const perKm = c.perKmCosts.map((x) => ({ name: x.name, amount: r(km.driven * x.perKm) }));
  const fixed = c.fixedCosts.map((x) => ({ name: x.name, amount: r(x.amount) }));
  const operatorBase = c.operatorModel === 'fijo' ? r(c.operatorFixed) : c.operatorModel === 'por_km' ? r(km.driven * c.operatorPerKm) : 0;
  return { km, fuelLoaded, fuelEmpty, fuel: fuelLoaded + fuelEmpty, tolls, perKm, fixed, operatorBase, perDiem: r(c.operatorPerDiem) };
}

const sum = (xs: { amount: Cents }[]) => xs.reduce((s, x) => s + x.amount, 0);

/** Evalúa precio, costos y rentabilidad para un flete base dado. */
export function evaluate(i: KmQuoteInput, freight: Cents) {
  const d = directCosts(i);
  const c = i.costs;
  const operatorPct = c.operatorModel === 'porcentaje' ? pct(freight, c.operatorPct) : 0;
  const operator = d.operatorBase + operatorPct + d.perDiem;
  const commission = pct(freight, c.commissionPct);
  const directNoContingency = d.fuel + d.tolls + operator + sum(d.perKm) + sum(d.fixed) + commission;
  const contingency = pct(directNoContingency, c.contingencyPct);
  const operating = directNoContingency + contingency;

  const charges = i.charges.map((ch) => {
    const base = ch.base === 'flete' ? freight : operating;
    const amount = ch.type === 'fijo' ? r(ch.value) : pct(base, ch.value);
    return { ...ch, amount, baseAmount: ch.type === 'porcentaje' ? base : null };
  });
  const costCharges = charges.filter((ch) => ch.classification === 'costo').reduce((s, ch) => s + ch.amount, 0);
  const billed = charges.filter((ch) => ch.billToClient);
  const tollsLine = i.trip.tollsBilling === 'aparte' && d.tolls > 0 ? [{ name: 'Casetas', amount: d.tolls, taxable: i.pricing.tollsTaxable }] : [];
  const clientLines = [
    { name: 'Flete', amount: freight, taxable: true },
    ...billed.map((ch) => ({ name: ch.name, amount: ch.amount, taxable: ch.taxable })),
    ...tollsLine,
  ];
  const subtotal = clientLines.reduce((s, l) => s + l.amount, 0);
  const taxableBase = clientLines.filter((l) => l.taxable).reduce((s, l) => s + l.amount, 0);
  const tax = pct(taxableBase, i.pricing.taxPct);
  const retention = pct(taxableBase, i.pricing.retentionPct);
  const total = subtotal + tax - retention;
  const cost = operating + costCharges;
  const surplus = subtotal - cost;
  const km = d.km;

  // Análisis interno: costo de regresar vacío en un viaje sencillo (no se cobra).
  let emptyReturn: { km: number; cost: Cents; surplusAfter: Cents; marginAfterPct: number } | null = null;
  if (i.trip.tripType === 'sencillo' && i.trip.evaluateEmptyReturn) {
    const backKm = n(i.trip.returnKm) || km.outbound;
    const fuel = i.unit.kmPerLiterEmpty > 0 ? r((backKm / i.unit.kmPerLiterEmpty) * c.dieselPerLiter) : 0;
    const perKm = c.perKmCosts.reduce((s, x) => s + r(backKm * x.perKm), 0);
    const op = c.operatorModel === 'por_km' ? r(backKm * c.operatorPerKm) : 0;
    const back = fuel + perKm + op + n(i.trip.tollsReturn);
    emptyReturn = { km: backKm, cost: back, surplusAfter: surplus - back, marginAfterPct: subtotal > 0 ? ((surplus - back) / subtotal) * 100 : 0 };
  }

  return {
    freight,
    effectiveRate: km.billable > 0 ? r(freight / km.billable) : 0,
    clientLines,
    charges,
    subtotal,
    taxableBase,
    tax,
    retention,
    total,
    costs: {
      fuel: d.fuel,
      fuelLoaded: d.fuelLoaded,
      fuelEmpty: d.fuelEmpty,
      tolls: d.tolls,
      operator,
      operatorBase: d.operatorBase,
      operatorPct,
      perDiem: d.perDiem,
      perKm: d.perKm,
      fixed: d.fixed,
      commission,
      contingency,
      operating,
      costCharges,
      total: cost,
    },
    surplus,
    marginPct: subtotal > 0 ? (surplus / subtotal) * 100 : 0,
    markupPct: cost > 0 ? (surplus / cost) * 100 : 0,
    costToIncomePct: subtotal > 0 ? (cost / subtotal) * 100 : 0,
    operatorToIncomePct: subtotal > 0 ? (operator / subtotal) * 100 : 0,
    emptyReturn,
  };
}

export type Evaluation = ReturnType<typeof evaluate>;

/** Flete base que logra un margen sobre venta. Ingreso y costo son lineales en el flete. */
export function freightForMargin(i: KmQuoteInput, marginPct: number): Cents | null {
  const m = marginPct / 100;
  if (m >= 1) return null;
  const f1 = 1_000_000_00;
  const e0 = evaluate(i, 0);
  const e1 = evaluate(i, f1);
  const a = e0.subtotal, b = (e1.subtotal - e0.subtotal) / f1;
  const c = e0.costs.total, d = (e1.costs.total - e0.costs.total) / f1;
  const den = b * (1 - m) - d;
  if (den <= 0) return null;
  let f = Math.ceil((c - a * (1 - m)) / den);
  if (f < 0) f = 0;
  // Ajuste por redondeos de centavos.
  while (evaluate(i, f).marginPct < marginPct - 1e-9 && f < 1e12) f += 1;
  while (f > 0 && evaluate(i, f - 1).marginPct >= marginPct - 1e-9) f -= 1;
  return f;
}

export interface ScenarioResult extends Evaluation {
  id: string;
  label: string;
  kind: ScenarioSpec['kind'];
  requested: number;
  warnings: Warning[];
  meetsObjectives: boolean;
}

function freightFor(i: KmQuoteInput, s: ScenarioSpec): { freight: Cents | null; requested: number } {
  const p = i.pricing;
  const km = kmBreakdown(i.trip);
  if (s.kind === 'precio') return { freight: r(s.freight), requested: s.freight };
  let f: Cents | null;
  if (s.kind === 'tarifa') f = r(km.billable * s.rate);
  else f = freightForMargin(i, s.marginPct);
  if (f == null) return { freight: null, requested: s.kind === 'tarifa' ? s.rate : s.marginPct };
  f = roundCommercial(f, p.rounding, s.kind === 'margen' && p.roundingMode === 'cercano' ? 'arriba' : p.roundingMode);
  return { freight: Math.max(f, r(p.minTripPrice)), requested: s.kind === 'tarifa' ? s.rate : s.marginPct };
}

export function capacityWarnings(unit: UnitSpec, cargo: CargoInput): Warning[] {
  const w: Warning[] = [];
  if (unit.maxWeightTons > 0 && cargo.weightTons > unit.maxWeightTons) w.push({ code: 'peso', message: `El peso (${cargo.weightTons} t) excede la capacidad registrada de la unidad (${unit.maxWeightTons} t).` });
  if (unit.maxPallets > 0 && cargo.pallets > unit.maxPallets) w.push({ code: 'pallets', message: `Los pallets (${cargo.pallets}) exceden la capacidad registrada (${unit.maxPallets}).` });
  const lengthM = unit.lengthFt * 0.3048;
  if (cargo.lengthM && lengthM > 0 && cargo.lengthM > lengthM) w.push({ code: 'largo', message: `El largo de la carga (${cargo.lengthM} m) excede la unidad de ${unit.lengthFt} pies (${lengthM.toFixed(2)} m).` });
  if (unit.unitType === 'caja_seca' && cargo.tarp) w.push({ code: 'lona', message: 'La lona suele aplicar a plataforma; revisa el requerimiento para caja seca.' });
  return w;
}

export function computeKmQuote(i: KmQuoteInput) {
  const km = kmBreakdown(i.trip);
  const p = i.pricing;
  const global: Warning[] = [...capacityWarnings(i.unit, i.cargo)];
  if (km.outbound <= 0) global.push({ code: 'km', message: 'Captura los km de ida; no se inventan distancias.' });
  if (i.costs.dieselPerLiter <= 0) global.push({ code: 'diesel', message: 'Falta el precio del diésel; el combustible va en $0.' });
  if (i.unit.kmPerLiterLoaded <= 0) global.push({ code: 'rendimiento', message: 'Falta el rendimiento (km/L) de la unidad.' });
  if (!i.costs.fixedCosts.some((c) => c.amount > 0)) global.push({ code: 'fijos', message: 'No hay costos fijos por viaje capturados (seguros, administración, pensión…): el excedente puede estar sobreestimado.' });
  if (i.charges.some((c) => c.classification === 'comercial' && !c.billToClient)) global.push({ code: 'cargo', message: 'Hay cargos comerciales que no se cobran al cliente: no afectan el cálculo.' });

  const scenarios: ScenarioResult[] = i.scenarios.map((s) => {
    const { freight, requested } = freightFor(i, s);
    if (freight == null) {
      const e = evaluate(i, 0);
      return { ...e, id: s.id, label: s.label, kind: s.kind, requested, meetsObjectives: false, warnings: [{ code: 'imposible', message: 'No existe un precio que alcance ese margen con los costos proporcionales configurados.' }] };
    }
    const e = evaluate(i, freight);
    const w: Warning[] = [];
    if (e.surplus < 0) w.push({ code: 'perdida', message: `Pérdida estimada: el costo supera al ingreso por ${((-e.surplus) / 100).toFixed(2)} MXN.` });
    else if (e.marginPct < p.targetMarginPct) w.push({ code: 'margen', message: `Margen ${e.marginPct.toFixed(1)}% menor al objetivo de ${p.targetMarginPct}%.` });
    if (e.surplus < p.minProfit) w.push({ code: 'minimo', message: `Excedente menor a la ganancia mínima de ${(p.minProfit / 100).toFixed(2)} MXN.` });
    if (km.billable > 0 && e.effectiveRate < p.minRate) w.push({ code: 'tarifa_baja', message: `Tarifa efectiva ${(e.effectiveRate / 100).toFixed(2)}/km por debajo de la mínima ${(p.minRate / 100).toFixed(2)}/km.` });
    if (km.billable > 0 && e.effectiveRate > p.maxRate) w.push({ code: 'tarifa_alta', message: `Tarifa efectiva ${(e.effectiveRate / 100).toFixed(2)}/km por arriba de la máxima ${(p.maxRate / 100).toFixed(2)}/km.` });
    if (freight === r(p.minTripPrice) && p.minTripPrice > 0) w.push({ code: 'minimo_viaje', message: 'Se aplicó el precio mínimo por viaje.' });
    const meetsObjectives = e.surplus >= 0 && e.marginPct >= p.targetMarginPct && e.surplus >= p.minProfit && !w.some((x) => x.code === 'tarifa_baja' || x.code === 'tarifa_alta');
    return { ...e, id: s.id, label: s.label, kind: s.kind, requested, warnings: w, meetsObjectives };
  });

  const valid = scenarios.filter((s) => !s.warnings.some((w) => w.code === 'imposible'));
  const cheapest = valid.reduce<ScenarioResult | null>((a, s) => (!a || s.subtotal < a.subtotal ? s : a), null);
  const bestMargin = valid.reduce<ScenarioResult | null>((a, s) => (!a || s.marginPct > a.marginPct ? s : a), null);
  const meeting = valid.filter((s) => s.meetsObjectives);
  // Recomendación: la alternativa más competitiva que cumple margen, ganancia mínima y banda de tarifas.
  const recommended = km.billable > 0 ? meeting.reduce<ScenarioResult | null>((a, s) => (!a || s.subtotal < a.subtotal ? s : a), null) : null;
  const reason = km.billable <= 0
    ? 'Sin kilómetros facturables no hay recomendación: captura la distancia.'
    : recommended
    ? `Es la alternativa de menor precio que cumple el margen objetivo (${p.targetMarginPct}%), la ganancia mínima y la banda de tarifas ${(p.minRate / 100).toFixed(2)}–${(p.maxRate / 100).toFixed(2)}/km.`
    : 'Ninguna alternativa cumple todos los objetivos; revisa costos, tarifa o margen. Se muestra la de mayor margen como referencia.';
  return {
    km,
    warnings: global,
    scenarios,
    cheapestId: cheapest?.id ?? null,
    bestMarginId: bestMargin?.id ?? null,
    recommendedId: km.billable > 0 ? ((recommended ?? bestMargin)?.id ?? null) : null,
    recommendationMeetsObjectives: !!recommended,
    recommendationReason: reason,
  };
}

export type KmQuoteResult = ReturnType<typeof computeKmQuote>;

/** Escenarios por defecto: tarifas de la banda configurada + uno por margen objetivo. */
export function defaultScenarios(p: PricingConfig): ScenarioSpec[] {
  const labels = ['Competitiva', 'Opción 2', 'Opción 3', 'Opción 4', 'Premium'];
  const span = p.maxRate - p.minRate;
  const rates = span > 0 ? [0, 0.2, 0.4, 0.6, 1].map((f) => p.minRate + Math.round((span * f) / 100) * 100) : [p.minRate];
  const uniq = [...new Set(rates)];
  return [
    ...uniq.map((rate, k) => ({ id: `t${k + 1}`, label: labels[k] ?? `Tarifa ${k + 1}`, kind: 'tarifa' as const, rate })),
    { id: 'm1', label: `Margen ${p.targetMarginPct}%`, kind: 'margen' as const, marginPct: p.targetMarginPct },
  ];
}
