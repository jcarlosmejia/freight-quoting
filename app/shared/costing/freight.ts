// Motor de flete. Reproduce las reglas observadas en el comportamiento de Fletcot
// (ver docs/09-recuperacion-codigo.md); implementación y nombres propios.
import { EMPTY_KEYS } from './types.ts';
import type { CostParams, EmptyKey, FreightInput, RouteInput, TireAxle, VehicleProfile } from './types.ts';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const tireCostPerKm = (t: TireAxle | undefined): number =>
  !t || !num(t.lifeKm) ? 0 : (num(t.unitPrice) * num(t.qty)) / num(t.lifeKm);

export const vehicleTireCostPerKm = (v: VehicleProfile): number =>
  tireCostPerKm(v.tires.steer) + tireCostPerKm(v.tires.drive) + tireCostPerKm(v.tires.trailer);

/** Capital promedio: (valor + rescate) / 2 por cada activo, con el % de rescate del vehículo. */
export function averageCapital(v: VehicleProfile, salvagePct = v.salvagePct): number {
  const s = clamp(num(salvagePct), 0, 100) / 100;
  const avg = (value: number) => (value + value * s) / 2;
  return v.assets.reduce((sum, a) => sum + avg(num(a.value)), avg(num(v.value)));
}

export interface TimeBreakdown {
  drivingSeconds: number;
  waitSeconds: number;
  refuelSeconds: number;
  restSeconds: number;
  refuels: number;
  rests: number;
  kmLoaded: number;
  kmEmpty: number;
  kmTotal: number;
  litersLoaded: number;
  litersEmpty: number;
  idleHours: number;
  idleLiters: number;
  hoursLoadedDriving: number;
  hoursEmptyDriving: number;
  waitHours: number;
  restHours: number;
  refuelHours: number;
  /** Horas atribuidas al cliente: manejo cargado + esperas + descansos + recargas. */
  clientHours: number;
  /** Horas sin utilidad: manejo vacío. */
  emptyHours: number;
  serviceHours: number;
}

export function timeAndDistance(params: CostParams, route: RouteInput, input: FreightInput): TimeBreakdown {
  const v = params.vehicle;
  const stops = route.stops ?? [];
  const legs = route.legMeters ?? [];
  const drivingSeconds = num(route.drivingSeconds);
  const waitSeconds = stops.reduce((s, st) => s + num(st.waitMinutes) * 60, 0);
  let kmLoaded = 0;
  let kmEmpty = 0;
  stops.forEach((st, i) => {
    const km = num(legs[i]) / 1000;
    if (st.loaded) kmLoaded += km;
    else kmEmpty += km;
  });
  const kmlLoaded = input.kmPerLiterLoaded ?? v.kmPerLiterLoaded;
  const kmlEmpty = input.kmPerLiterEmpty ?? v.kmPerLiterEmpty;
  const litersLoaded = kmlLoaded > 0 ? kmLoaded / kmlLoaded : 0;
  const litersEmpty = kmlEmpty > 0 ? kmEmpty / kmlEmpty : 0;
  const refuels = v.tankLiters > 0 ? Math.floor((litersLoaded + litersEmpty) / v.tankLiters) : 0;
  const refuelSeconds = refuels * num(v.refillMinutes) * 60;
  const idleHours = stops.reduce((s, st) => s + num(st.idleMinutes) / 60, 0);
  const idleLiters = idleHours * num(v.idleLitersPerHour);
  const drivingHours = drivingSeconds / 3600;
  const rests = v.breakEveryHours > 0 ? Math.floor(drivingHours / v.breakEveryHours) : 0;
  const restSeconds = rests * num(v.breakDurationHours) * 3600;
  const kmTotal = kmLoaded + kmEmpty;
  // El tiempo de manejo se reparte entre tramos cargados y vacíos en proporción a sus km.
  const hoursLoadedDriving = kmTotal > 0 ? (kmLoaded / kmTotal) * drivingHours : 0;
  const hoursEmptyDriving = kmTotal > 0 ? (kmEmpty / kmTotal) * drivingHours : 0;
  const waitHours = waitSeconds / 3600;
  const restHours = restSeconds / 3600;
  const refuelHours = refuelSeconds / 3600;
  return {
    drivingSeconds,
    waitSeconds,
    refuelSeconds,
    restSeconds,
    refuels,
    rests,
    kmLoaded,
    kmEmpty,
    kmTotal,
    litersLoaded,
    litersEmpty,
    idleHours,
    idleLiters,
    hoursLoadedDriving,
    hoursEmptyDriving,
    waitHours,
    restHours,
    refuelHours,
    clientHours: hoursLoadedDriving + waitHours + restHours + refuelHours,
    emptyHours: hoursEmptyDriving,
    serviceHours: (drivingSeconds + waitSeconds + refuelSeconds + restSeconds) / 3600,
  };
}

export type ComponentSet = Record<EmptyKey, number>;

export interface DepreciationItem {
  name: string;
  value: number;
  salvage: number;
  depreciable: number;
  lifeKm: number;
  perKm: number;
  loaded: number;
  empty: number;
}

export interface DriverPayResult {
  perKmLoaded: number;
  perKmEmpty: number;
  perHourLoaded: number;
  perHourEmpty: number;
  loaded: number;
  empty: number;
  base: number;
  percentage: number;
  percentNet: number;
  operators: number;
  netCommission: number;
  /** Pago que entra al costo: base + comisión sobre neto. */
  inCost: number;
  /** Comisión sobre utilidad: se informa y se paga de la utilidad; no aumenta el precio. */
  profitCommission: number;
}

export interface FreightResult {
  time: TimeBreakdown;
  fuelPrice: number;
  tirePerKm: number;
  capitalAnnual: number;
  capitalPerHour: number;
  capitalBase: number;
  depreciation: { items: DepreciationItem[]; loaded: number; empty: number; total: number };
  loaded: ComponentSet & { descanso: number; total: number };
  empty: ComponentSet & { total: number };
  driverPay: DriverPayResult;
  emptyCharged: number;
  emptyChargedWithProfit: number;
  emptyNotCharged: number;
  loadedCostBase: number;
  emptyCostNoProfit: number;
  tolls: number;
  otherExpenses: number;
  otherExpensesWithProfit: number;
  tripCost: number;
  totalExpense: number;
  profitPct: number;
  profit: number;
  financingPct: number;
  financing: number;
  cargoSurchargePct: number;
  cargoSurcharge: number;
  subtotal: number;
  taxPct: number;
  tax: number;
  total: number;
  pricePerKm: number;
  pricePerTon: number;
}

export function computeFreight(params: CostParams, route: RouteInput, input: FreightInput): FreightResult {
  const v = params.vehicle;
  const r = params.rates;
  const t = timeAndDistance(params, route, input);
  const fuelPrice = input.fuelPricePerLiter ?? v.fuelPricePerLiter;
  const tirePerKm = vehicleTireCostPerKm(v);
  const maintPerKm = v.maintenanceIntervalKm > 0 ? v.maintenanceCost / v.maintenanceIntervalKm : 0;

  const salvage = clamp(num(v.salvagePct), 0, 100);
  const depItems: DepreciationItem[] = [
    { name: 'Vehículo', value: v.value, lifeKm: v.lifeKm },
    ...v.assets.map((a) => ({ name: a.name, value: a.value, lifeKm: a.lifeKm })),
  ].map((a) => {
    const salvageAmount = num(a.value) * (salvage / 100);
    const depreciable = num(a.value) - salvageAmount;
    const perKm = a.lifeKm > 0 ? depreciable / a.lifeKm : 0;
    return {
      name: a.name,
      value: num(a.value),
      salvage: salvageAmount,
      depreciable,
      lifeKm: num(a.lifeKm),
      perKm,
      loaded: perKm * t.kmLoaded,
      empty: perKm * t.kmEmpty,
    };
  });
  const depLoaded = depItems.reduce((s, d) => s + d.loaded, 0);
  const depEmpty = depItems.reduce((s, d) => s + d.empty, 0);

  const capitalBase = averageCapital(v);
  const capitalAnnual = capitalBase * (Math.max(0, num(v.capitalRatePct)) / 100);
  const capitalPerHour = r.unitAnnualHours > 0 ? capitalAnnual / r.unitAnnualHours : 0;

  const restCost = (input.breakCost ?? v.breakCost) * t.rests;
  const loadedParts = {
    combustible: fuelPrice * (t.litersLoaded + t.idleLiters),
    neumaticos: tirePerKm * t.kmLoaded,
    mantenimiento: maintPerKm * t.kmLoaded,
    depreciacion: depLoaded,
    fijosGenerales: r.generalPerHour * t.clientHours,
    fijosEspecificos: r.specificPerHour * t.clientHours,
    equipamiento: r.equipmentPerHour * t.clientHours,
    capital: capitalPerHour * t.clientHours,
  };
  const loaded = {
    ...loadedParts,
    descanso: restCost,
    total: Object.values(loadedParts).reduce((s, x) => s + x, 0) + restCost,
  };
  const emptyParts = {
    combustible: fuelPrice * t.litersEmpty,
    neumaticos: tirePerKm * t.kmEmpty,
    mantenimiento: maintPerKm * t.kmEmpty,
    depreciacion: depEmpty,
    fijosGenerales: r.generalPerHour * t.emptyHours,
    fijosEspecificos: r.specificPerHour * t.emptyHours,
    equipamiento: r.equipmentPerHour * t.emptyHours,
    capital: capitalPerHour * t.emptyHours,
  };
  const empty = { ...emptyParts, total: Object.values(emptyParts).reduce((s, x) => s + x, 0) };

  let emptyCharged = 0;
  let emptyChargedWithProfit = 0;
  for (const k of EMPTY_KEYS) {
    if (input.chargeEmpty[k] === false) continue;
    emptyCharged += empty[k];
    if (input.profitOnEmpty[k]) emptyChargedWithProfit += empty[k];
  }

  const dp = input.driverPay;
  const operators = Math.max(1, Math.floor(num(dp.operators) || 1));
  const m = dp.method;
  const perKmLoaded = m === 'per_km' ? num(dp.perKmLoaded) * t.kmLoaded * operators : 0;
  const perKmEmpty = m === 'per_km' ? num(dp.perKmEmpty) * t.kmEmpty * operators : 0;
  const perHourLoaded = m === 'per_hour' ? num(dp.perHourLoaded) * t.clientHours * operators : 0;
  const perHourEmpty = m === 'per_hour' ? num(dp.perHourEmpty) * t.emptyHours * operators : 0;
  const percentage = m === 'percentage' ? num(dp.percentage) : 0;
  const percentNet = m === 'percent_net' ? num(dp.percentNet) : 0;
  const base = perKmLoaded + perKmEmpty + perHourLoaded + perHourEmpty;
  const netCommission = (loaded.total + emptyCharged) * (percentNet / 100) * operators;
  const driverInCost = base + netCommission;

  const driverWithProfit = dp.applyMargin ? driverInCost : 0;
  const driverNoProfit = dp.applyMargin ? 0 : driverInCost;
  const loadedCostBase = loaded.total + emptyChargedWithProfit + driverWithProfit;
  const emptyCostNoProfit = emptyCharged - emptyChargedWithProfit + driverNoProfit;

  const otherExpenses = input.otherExpenses.reduce((s, e) => s + num(e.amount), 0);
  const otherExpensesWithProfit = input.otherExpenses.reduce((s, e) => s + (e.applyMargin ? num(e.amount) : 0), 0);
  const tolls = num(route.tollsCash);
  const profitPct = num(input.profitPct);
  const profit = (loadedCostBase + otherExpensesWithProfit) * (profitPct / 100);
  const profitCommission = profit * (percentage / 100) * operators;

  const tripCost = loadedCostBase + emptyCostNoProfit + tolls;
  const totalExpense = tripCost + otherExpenses;
  const financingPct = clamp(num(input.financingPct), 0, 100);
  const financing = totalExpense * (financingPct / 100);
  const beforeSurcharge = totalExpense + profit + financing;
  const cargoSurchargePct = Math.max(0, num(input.cargoSurchargePct));
  const cargoSurcharge = beforeSurcharge * (cargoSurchargePct / 100);
  const subtotal = beforeSurcharge + cargoSurcharge;
  const taxPct = clamp(num(input.taxPct), 0, 100);
  const tax = subtotal * (taxPct / 100);
  const total = subtotal + tax;
  const km = route.legMeters.reduce((s, x) => s + num(x), 0) / 1000;
  const tons = num(input.tons);

  return {
    time: t,
    fuelPrice,
    tirePerKm,
    capitalAnnual,
    capitalPerHour,
    capitalBase,
    depreciation: { items: depItems, loaded: depLoaded, empty: depEmpty, total: depLoaded + depEmpty },
    loaded,
    empty,
    driverPay: {
      perKmLoaded,
      perKmEmpty,
      perHourLoaded,
      perHourEmpty,
      loaded: perKmLoaded + perHourLoaded,
      empty: perKmEmpty + perHourEmpty,
      base,
      percentage,
      percentNet,
      operators,
      netCommission,
      inCost: driverInCost,
      profitCommission,
    },
    emptyCharged,
    emptyChargedWithProfit,
    emptyNotCharged: empty.total - emptyCharged,
    loadedCostBase,
    emptyCostNoProfit,
    tolls,
    otherExpenses,
    otherExpensesWithProfit,
    tripCost,
    totalExpense,
    profitPct,
    profit,
    financingPct,
    financing,
    cargoSurchargePct,
    cargoSurcharge,
    subtotal,
    taxPct,
    tax,
    total,
    pricePerKm: km > 0 ? total / km : 0,
    pricePerTon: tons > 0 ? total / tons : 0,
  };
}

export const defaultFreightInput = (v: VehicleProfile): FreightInput => ({
  driverPay: {
    method: 'per_km',
    perKmLoaded: v.driverPayPerKmLoaded,
    perKmEmpty: v.driverPayPerKmEmpty,
    perHourLoaded: v.driverPayPerHour,
    perHourEmpty: v.driverPayPerHour,
    percentage: v.driverPayRoutePct,
    percentNet: 0,
    applyMargin: true,
    operators: 1,
  },
  chargeEmpty: Object.fromEntries(EMPTY_KEYS.map((k) => [k, true])) as Record<EmptyKey, boolean>,
  profitOnEmpty: Object.fromEntries(EMPTY_KEYS.map((k) => [k, false])) as Record<EmptyKey, boolean>,
  otherExpenses: [],
  profitPct: 20,
  financingPct: 0,
  cargoSurchargePct: 0,
  taxPct: 16,
  cargoType: 'Carga General',
  tons: 0,
});
