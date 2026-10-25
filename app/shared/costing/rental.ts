// Motor de renta/disposición: disponibilidad fija + uso variable. Implementación propia.
import { averageCapital, tireCostPerKm } from './freight.ts';
import type { CostParams } from './types.ts';

export type RentalUnit = 'hour' | 'shift' | 'day' | 'week' | 'month' | 'flat';

export interface RentalInput {
  unit: RentalUnit;
  quantity: number;
  hoursPerShift: number;
  /** Renta fija: 'monthly' = precio por mes × cantidad; 'contract' = monto total del contrato. */
  flatMode: 'monthly' | 'contract';
  flatPrice: number;
  fuelMode: 'client' | 'included';
  tollsMode: 'client' | 'included';
  /** Km por día operado (manual o derivado de una ruta representativa). */
  kmPerDay: number;
  /** Casetas por km de la ruta representativa. */
  tollsPerKm: number;
  fuelPricePerLiter?: number | null;
  kmPerLiter?: number | null;
  operatorMonthly: number;
  operatorCount: number;
  workDaysPerYear: number;
  billableHoursPerDay: number;
  kmCapEnabled: boolean;
  kmIncludedPerMonth: number;
  excessSurchargePct: number;
  salvagePct: number;
  interestPct: number;
  profitPct: number;
  taxPct: number;
  otherExpenses: number;
  /** Peajes capturados manualmente; si es null se estiman con tollsPerKm × km del periodo. */
  tollsOverride?: number | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function rentalSpan(i: Pick<RentalInput, 'unit' | 'quantity' | 'hoursPerShift' | 'workDaysPerYear' | 'billableHoursPerDay'>) {
  const h = num(i.billableHoursPerDay) || 8;
  const d = num(i.workDaysPerYear) || 312;
  const q = Math.max(0, num(i.quantity));
  switch (i.unit) {
    case 'hour':
      return { billableHours: q, operatingDays: q / h };
    case 'shift': {
      const hours = q * (num(i.hoursPerShift) || 12);
      return { billableHours: hours, operatingDays: hours / h };
    }
    case 'day':
      return { billableHours: q * h, operatingDays: q };
    case 'week': {
      const days = q * (d / 52);
      return { billableHours: days * h, operatingDays: days };
    }
    case 'month':
    case 'flat': {
      // Un mes es 1/12 del año operativo, no 30 días naturales.
      const days = q * (d / 12);
      return { billableHours: days * h, operatingDays: days };
    }
    default:
      return { billableHours: 0, operatingDays: 0 };
  }
}

export interface RentalDepreciationItem {
  name: string;
  value: number;
  salvage: number;
  depreciable: number;
  lifeYears: number;
  lifeKm: number;
  annual: number;
  calendar: number;
  perKm: number;
  byKm: number;
  amount: number;
  basis: 'calendario' | 'km';
}

export function computeRental(params: CostParams, i: RentalInput) {
  const v = params.vehicle;
  const r = params.rates;
  const span = rentalSpan(i);
  const workDays = num(i.workDaysPerYear) || 312;
  const periodFactor = span.operatingDays / workDays;

  const kmEstimated = num(i.kmPerDay) * span.operatingDays;
  const kmIncluded = num(i.kmIncludedPerMonth) * (span.operatingDays / (workDays / 12));
  const kmPeriod = i.kmCapEnabled ? kmIncluded : kmEstimated;

  const annualHours =
    r.daysPerYear > 0 && r.hoursPerDay > 0 ? r.daysPerYear * r.hoursPerDay : workDays * (num(i.billableHoursPerDay) || 8);
  const block = (perHour: number) => ({ perHour, annual: perHour * annualHours, amount: perHour * annualHours * periodFactor });
  const general = block(r.generalPerHour);
  const specific = block(r.specificPerHour);
  const equipment = block(r.equipmentPerHour);
  const structure = general.amount + specific.amount + equipment.amount;

  const salvagePct = Math.max(0, Math.min(100, num(i.salvagePct)));
  const assets = [
    { name: 'Vehículo', value: v.value, lifeYears: v.lifeYears, lifeKm: v.lifeKm },
    ...v.assets.map((a) => ({ name: a.name, value: a.value, lifeYears: a.lifeYears, lifeKm: a.lifeKm })),
  ].filter((a) => num(a.value) > 0);
  const depreciation: RentalDepreciationItem[] = [];
  for (const a of assets) {
    const salvage = a.value * (salvagePct / 100);
    const depreciable = a.value - salvage;
    const annual = a.lifeYears > 0 ? depreciable / a.lifeYears : 0;
    const calendar = annual * periodFactor;
    const perKm = a.lifeKm > 0 ? depreciable / a.lifeKm : 0;
    const byKm = perKm * kmPeriod;
    // Se cobra lo que ocurra primero: desgaste por tiempo o por kilometraje.
    const amount = Math.max(calendar, byKm);
    if (amount <= 0) continue;
    depreciation.push({ ...a, salvage, depreciable, annual, calendar, perKm, byKm, amount, basis: byKm > calendar ? 'km' : 'calendario' });
  }
  const depreciationTotal = depreciation.reduce((s, d) => s + d.amount, 0);
  const capitalBase = averageCapital(v, salvagePct);
  const capitalCost = capitalBase * (Math.max(0, num(i.interestPct)) / 100) * periodFactor;
  const operators = Math.max(1, num(i.operatorCount) || 1);
  const operatorCost = num(i.operatorMonthly) * operators * 12 * periodFactor;
  const availability = structure + depreciationTotal + capitalCost + operatorCost;

  const fuelPrice = i.fuelPricePerLiter ?? v.fuelPricePerLiter;
  const kml = i.kmPerLiter ?? v.kmPerLiterLoaded;
  const liters = kml > 0 ? kmPeriod / kml : 0;
  const fuelPerKm = i.fuelMode === 'client' || kml <= 0 ? 0 : fuelPrice / kml;
  const axles = [
    { name: 'Dirección', ...v.tires.steer },
    { name: 'Tracción', ...v.tires.drive },
    { name: 'Arrastre', ...v.tires.trailer },
  ].map((a) => ({ ...a, costPerKm: tireCostPerKm(a) }));
  const tiresPerKm = axles.reduce((s, a) => s + a.costPerKm, 0);
  const maintPerKm = v.maintenanceIntervalKm > 0 ? v.maintenanceCost / v.maintenanceIntervalKm : 0;
  const usage = {
    kmPeriod,
    kmEstimated,
    kmIncluded,
    capOn: i.kmCapEnabled,
    kmPerLiter: kml,
    fuelPrice,
    liters,
    fuelPerKm,
    fuel: fuelPerKm * kmPeriod,
    axles,
    tiresPerKm,
    tires: tiresPerKm * kmPeriod,
    maintPerKm,
    maintenance: maintPerKm * kmPeriod,
    perKm: fuelPerKm + tiresPerKm + maintPerKm,
    total: (fuelPerKm + tiresPerKm + maintPerKm) * kmPeriod,
  };

  const costBase = availability + usage.total;
  const tollsEstimate = num(i.tollsPerKm) * kmPeriod;
  const tolls = i.tollsMode === 'client' ? 0 : i.tollsOverride ?? tollsEstimate;
  const other = num(i.otherExpenses);
  const qty = Math.max(0, num(i.quantity));
  const costWithExtras = costBase + tolls + other;
  const profitPct = num(i.profitPct);
  // La utilidad se calcula sólo sobre el costo base (disponibilidad + uso), no sobre casetas ni otros gastos.
  const profit = costBase * (profitPct / 100);
  const isFlat = i.unit === 'flat';
  const periodSubtotal = isFlat
    ? i.flatMode === 'contract'
      ? num(i.flatPrice)
      : num(i.flatPrice) * qty
    : costWithExtras + profit;
  const unitSubtotal = qty > 0 ? periodSubtotal / qty : periodSubtotal;
  const suggestedFlatPrice = i.flatMode === 'contract' ? costWithExtras + profit : qty > 0 ? (costWithExtras + profit) / qty : costWithExtras + profit;
  const taxPct = Math.max(0, Math.min(100, num(i.taxPct)));
  const tax = periodSubtotal * (taxPct / 100);
  const surcharge = 1 + Math.max(0, num(i.excessSurchargePct)) / 100;
  const baseKm = kmIncluded > 0 ? periodSubtotal / kmIncluded : 0;
  const baseHour = span.billableHours > 0 ? periodSubtotal / span.billableHours : 0;
  const kmExcessExpected = Math.max(0, kmEstimated - kmIncluded);
  return {
    span,
    periodFactor,
    availability: {
      general,
      specific,
      equipment,
      structure,
      depreciation,
      depreciationTotal,
      capitalBase,
      capitalCost,
      operatorCost,
      total: availability,
    },
    usage,
    costBase,
    tolls,
    tollsEstimate,
    otherExpenses: other,
    profitPct,
    profit,
    isFlat,
    periodSubtotal,
    unitSubtotal,
    suggestedFlatPrice,
    flatMargin: periodSubtotal - costWithExtras,
    taxPct,
    tax,
    total: periodSubtotal + tax,
    excess: {
      enabled: i.kmCapEnabled,
      surchargePct: Math.max(0, num(i.excessSurchargePct)),
      baseKm,
      baseHour,
      perKm: baseKm * surcharge,
      perHour: baseHour * surcharge,
      kmExcessExpected,
      expectedCharge: kmExcessExpected * baseKm * surcharge,
    },
  };
}

export type RentalResult = ReturnType<typeof computeRental>;

export const defaultRentalInput = (params: CostParams): RentalInput => ({
  unit: 'month',
  quantity: 1,
  hoursPerShift: 12,
  flatMode: 'monthly',
  flatPrice: 0,
  fuelMode: 'client',
  tollsMode: 'client',
  kmPerDay: 0,
  tollsPerKm: 0,
  operatorMonthly: params.vehicle.driverPayMonthly,
  operatorCount: 1,
  workDaysPerYear: params.rates.daysPerYear || 312,
  billableHoursPerDay: params.rates.hoursPerDay || 8,
  kmCapEnabled: false,
  kmIncludedPerMonth: 3000,
  excessSurchargePct: 50,
  salvagePct: params.vehicle.salvagePct,
  interestPct: params.vehicle.capitalRatePct,
  profitPct: 20,
  taxPct: 16,
  otherExpenses: 0,
  tollsOverride: null,
});
