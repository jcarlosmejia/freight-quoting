// Validación en la frontera HTTP: convierte entradas del cliente en estructuras del motor
// rechazando valores fuera de rango en lugar de aceptarlos en silencio.
import { EMPTY_KEYS, type DriverPayMethod, type EmptyKey, type FreightInput, type RentalInput, type RouteInput } from '../../shared/costing/index.ts';
import { HttpError } from '../auth.ts';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);

export function n(x: unknown, field: string, opts: { min?: number; max?: number; def?: number } = {}): number {
  if (x === undefined || x === null || x === '') {
    if (opts.def !== undefined) return opts.def;
    throw new HttpError(400, `Falta el campo ${field}.`);
  }
  const v = Number(x);
  if (!Number.isFinite(v)) throw new HttpError(400, `${field} debe ser numérico.`);
  if (opts.min !== undefined && v < opts.min) throw new HttpError(400, `${field} debe ser ≥ ${opts.min}.`);
  if (opts.max !== undefined && v > opts.max) throw new HttpError(400, `${field} debe ser ≤ ${opts.max}.`);
  return v;
}

export const nullableN = (x: unknown, field: string, opts: { min?: number; max?: number } = {}) =>
  x === undefined || x === null || x === '' ? null : n(x, field, opts);

export function s(x: unknown, field: string, opts: { max?: number; required?: boolean } = {}): string | null {
  if (x === undefined || x === null || String(x).trim() === '') {
    if (opts.required) throw new HttpError(400, `Falta el campo ${field}.`);
    return null;
  }
  const v = String(x).trim();
  if (v.length > (opts.max ?? 500)) throw new HttpError(400, `${field} es demasiado largo.`);
  return v;
}

export function oneOf<T extends string>(x: unknown, field: string, values: readonly T[], def?: T): T {
  if ((x === undefined || x === null || x === '') && def !== undefined) return def;
  if (!values.includes(x as T)) throw new HttpError(400, `${field} inválido.`);
  return x as T;
}

export function parseRoute(x: unknown): RouteInput {
  if (!isObj(x)) throw new HttpError(400, 'Ruta inválida.');
  const stops = Array.isArray(x.stops) ? x.stops : [];
  if (stops.length < 2 || stops.length > 50) throw new HttpError(400, 'La ruta necesita entre 2 y 50 paradas.');
  const legs = Array.isArray(x.legMeters) ? x.legMeters : [];
  if (legs.length !== stops.length - 1) throw new HttpError(400, 'Debe haber un tramo por cada par de paradas.');
  const tollPasses = Array.isArray(x.tollPasses) ? x.tollPasses : [];
  const route: RouteInput = {
    stops: stops.map((st, i) => {
      if (!isObj(st)) throw new HttpError(400, `Parada ${i + 1} inválida.`);
      return {
        label: s(st.label, `parada ${i + 1}`, { required: true, max: 200 })!,
        loaded: !!st.loaded,
        waitMinutes: n(st.waitMinutes, 'espera', { min: 0, max: 100000, def: 0 }),
        idleMinutes: n(st.idleMinutes, 'ralentí', { min: 0, max: 100000, def: 0 }),
        lat: nullableN(st.lat, 'latitud', { min: -90, max: 90 }),
        lon: nullableN(st.lon, 'longitud', { min: -180, max: 180 }),
      };
    }),
    legMeters: legs.map((m, i) => n(m, `distancia del tramo ${i + 1}`, { min: 0, max: 1e8 })),
    drivingSeconds: n(x.drivingSeconds, 'tiempo de manejo', { min: 0, max: 1e8 }),
    tollsCash: 0,
    tollPasses: tollPasses.map((t, i) => {
      if (!isObj(t)) throw new HttpError(400, `Caseta ${i + 1} inválida.`);
      return {
        legIndex: n(t.legIndex, 'tramo de caseta', { min: 0, max: legs.length - 1 }),
        plazaId: nullableN(t.plazaId, 'caseta'),
        name: s(t.name, 'nombre de caseta', { required: true, max: 200 })!,
        amount: n(t.amount, 'monto de caseta', { min: 0, max: 1e6 }),
      };
    }),
  };
  // El total de casetas siempre se deriva de las pasadas: una plaza cruzada dos veces se cobra dos veces.
  route.tollsCash = route.tollPasses!.reduce((acc, t) => acc + t.amount, 0);
  return route;
}

const flags = (x: unknown, def: boolean): Record<EmptyKey, boolean> => {
  const o = isObj(x) ? x : {};
  return Object.fromEntries(EMPTY_KEYS.map((k) => [k, o[k] === undefined ? def : !!o[k]])) as Record<EmptyKey, boolean>;
};

export function parseFreightInput(x: unknown, defaults: FreightInput): FreightInput {
  const o = isObj(x) ? x : {};
  const dp = isObj(o.driverPay) ? o.driverPay : {};
  const d = defaults.driverPay;
  const other = Array.isArray(o.otherExpenses) ? o.otherExpenses : [];
  if (other.length > 50) throw new HttpError(400, 'Demasiados otros gastos.');
  return {
    fuelPricePerLiter: nullableN(o.fuelPricePerLiter, 'precio de combustible', { min: 0, max: 1e5 }),
    kmPerLiterLoaded: nullableN(o.kmPerLiterLoaded, 'rendimiento cargado', { min: 0, max: 1e3 }),
    kmPerLiterEmpty: nullableN(o.kmPerLiterEmpty, 'rendimiento vacío', { min: 0, max: 1e3 }),
    breakCost: nullableN(o.breakCost, 'costo de descanso', { min: 0, max: 1e6 }),
    driverPay: {
      method: oneOf<DriverPayMethod>(dp.method, 'modo de pago al operador', ['none', 'per_km', 'per_hour', 'percentage', 'percent_net'], d.method),
      perKmLoaded: n(dp.perKmLoaded, 'pago por km cargado', { min: 0, max: 1e5, def: d.perKmLoaded }),
      perKmEmpty: n(dp.perKmEmpty, 'pago por km vacío', { min: 0, max: 1e5, def: d.perKmEmpty }),
      perHourLoaded: n(dp.perHourLoaded, 'pago por hora', { min: 0, max: 1e6, def: d.perHourLoaded }),
      perHourEmpty: n(dp.perHourEmpty, 'pago por hora vacío', { min: 0, max: 1e6, def: d.perHourEmpty }),
      percentage: n(dp.percentage, 'comisión sobre utilidad', { min: 0, max: 100, def: d.percentage }),
      percentNet: n(dp.percentNet, 'comisión sobre neto', { min: 0, max: 100, def: d.percentNet }),
      applyMargin: dp.applyMargin === undefined ? d.applyMargin : !!dp.applyMargin,
      operators: n(dp.operators, 'operadores', { min: 1, max: 10, def: d.operators }),
    },
    chargeEmpty: flags(o.chargeEmpty, true),
    profitOnEmpty: flags(o.profitOnEmpty, false),
    otherExpenses: other.map((e, i) => {
      const eo = isObj(e) ? e : {};
      return { name: s(eo.name, `otro gasto ${i + 1}`, { max: 200 }) ?? '', amount: n(eo.amount, 'monto', { min: 0, max: 1e8, def: 0 }), applyMargin: !!eo.applyMargin };
    }),
    profitPct: n(o.profitPct, 'utilidad', { min: -100, max: 1000, def: defaults.profitPct }),
    financingPct: n(o.financingPct, 'financiamiento', { min: 0, max: 100, def: defaults.financingPct }),
    cargoSurchargePct: n(o.cargoSurchargePct, 'aumento por carga', { min: 0, max: 1000, def: defaults.cargoSurchargePct }),
    taxPct: n(o.taxPct, 'IVA', { min: 0, max: 100, def: defaults.taxPct }),
    cargoType: s(o.cargoType, 'tipo de carga', { max: 100 }) ?? defaults.cargoType,
    tons: n(o.tons, 'toneladas', { min: 0, max: 1e5, def: 0 }),
  };
}

export function parseRentalInput(x: unknown, d: RentalInput): RentalInput {
  const o = isObj(x) ? x : {};
  return {
    unit: oneOf(o.unit, 'modo de cobro', ['hour', 'shift', 'day', 'week', 'month', 'flat'] as const, d.unit),
    quantity: n(o.quantity, 'cantidad', { min: 0, max: 10000, def: d.quantity }),
    hoursPerShift: n(o.hoursPerShift, 'horas por jornada', { min: 1, max: 24, def: d.hoursPerShift }),
    flatMode: oneOf(o.flatMode, 'modo de renta fija', ['monthly', 'contract'] as const, d.flatMode),
    flatPrice: n(o.flatPrice, 'precio cerrado', { min: 0, max: 1e10, def: d.flatPrice }),
    fuelMode: oneOf(o.fuelMode, 'combustible', ['client', 'included'] as const, d.fuelMode),
    tollsMode: oneOf(o.tollsMode, 'casetas', ['client', 'included'] as const, d.tollsMode),
    kmPerDay: n(o.kmPerDay, 'km por día', { min: 0, max: 5000, def: d.kmPerDay }),
    tollsPerKm: n(o.tollsPerKm, 'casetas por km', { min: 0, max: 1e4, def: d.tollsPerKm }),
    fuelPricePerLiter: nullableN(o.fuelPricePerLiter, 'precio de combustible', { min: 0, max: 1e5 }),
    kmPerLiter: nullableN(o.kmPerLiter, 'rendimiento', { min: 0, max: 1e3 }),
    operatorMonthly: n(o.operatorMonthly, 'sueldo del operador', { min: 0, max: 1e8, def: d.operatorMonthly }),
    operatorCount: n(o.operatorCount, 'operadores', { min: 1, max: 10, def: d.operatorCount }),
    workDaysPerYear: n(o.workDaysPerYear, 'días operativos', { min: 1, max: 366, def: d.workDaysPerYear }),
    billableHoursPerDay: n(o.billableHoursPerDay, 'horas por día', { min: 1, max: 24, def: d.billableHoursPerDay }),
    kmCapEnabled: o.kmCapEnabled === undefined ? d.kmCapEnabled : !!o.kmCapEnabled,
    kmIncludedPerMonth: n(o.kmIncludedPerMonth, 'km incluidos', { min: 0, max: 1e7, def: d.kmIncludedPerMonth }),
    excessSurchargePct: n(o.excessSurchargePct, 'recargo por excedente', { min: 0, max: 1000, def: d.excessSurchargePct }),
    salvagePct: n(o.salvagePct, 'rescate', { min: 0, max: 100, def: d.salvagePct }),
    interestPct: n(o.interestPct, 'tasa de capital', { min: 0, max: 1000, def: d.interestPct }),
    profitPct: n(o.profitPct, 'utilidad', { min: -100, max: 1000, def: d.profitPct }),
    taxPct: n(o.taxPct, 'IVA', { min: 0, max: 100, def: d.taxPct }),
    otherExpenses: n(o.otherExpenses, 'otros gastos', { min: 0, max: 1e10, def: 0 }),
    tollsOverride: nullableN(o.tollsOverride, 'casetas', { min: 0, max: 1e10 }),
  };
}

export const isoDate = (x: unknown, field: string): string | null => {
  if (x === undefined || x === null || x === '') return null;
  const v = String(x);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new HttpError(400, `${field} debe ser AAAA-MM-DD.`);
  return v;
};
