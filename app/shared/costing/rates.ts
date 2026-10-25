// Tarifas de recuperación por hora. En Fletcot las calcula el servidor; aquí se reconstruyen
// a partir de casos observados (docs/09-recuperacion-codigo.md, sección "Parámetros del servidor").
import type { RecoveryRates } from './types.ts';

export type GeneralPeriod = 'Mensual' | 'Bimestral' | 'Trimestral' | 'Semestral' | 'Anual';
export const GENERAL_PERIODS: Record<GeneralPeriod, number> = { Mensual: 12, Bimestral: 6, Trimestral: 4, Semestral: 2, Anual: 1 };

export type SpecificPeriod = 'daily' | 'weekly' | 'monthly' | 'annual';
export const SPECIFIC_PERIOD_LABELS: Record<SpecificPeriod, string> = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual', annual: 'Anual' };

export interface FleetCategory {
  id?: number;
  name: string;
  vehicles: number;
  daysPerYear: number;
  hoursPerDay: number;
}

export const round2 = (x: number) => Math.round(x * 100) / 100;

export const annualizeGeneral = (amount: number, period: GeneralPeriod) => amount * (GENERAL_PERIODS[period] ?? 0);

export function annualizeSpecific(amount: number, period: SpecificPeriod, daysPerYear: number) {
  switch (period) {
    case 'daily':
      return amount * daysPerYear;
    case 'weekly':
      return amount * 52;
    case 'monthly':
      return amount * 12;
    default:
      return amount;
  }
}

export const fleetBillableHours = (cats: FleetCategory[]) =>
  cats.reduce((s, c) => s + Math.max(0, c.vehicles) * Math.max(0, c.daysPerYear) * Math.max(0, c.hoursPerDay), 0);

export const equipmentAnnual = (qty: number, unitPrice: number, years: number, months: number) => {
  const life = years + months / 12;
  return life > 0 ? (qty * unitPrice) / life : 0;
};

export interface RatesInput {
  generalExpenses: { name: string; amount: number; period: GeneralPeriod }[];
  categories: FleetCategory[];
  category: FleetCategory | null;
  specificExpenses: { name: string; amount: number; period: SpecificPeriod }[];
  equipment: { name: string; qty: number; unitPrice: number; years: number; months: number }[];
}

/**
 * Observado: la tarifa general y la de gastos específicos llegan redondeadas a centavos
 * ($86.18 y $37.75 reproducen la renta mensual); la de equipamiento no ($6.8757… reproduce $1,430.14).
 */
export function computeRates(i: RatesInput): RecoveryRates {
  const generalItems = i.generalExpenses.map((e) => ({ name: e.name, annual: annualizeGeneral(e.amount, e.period) }));
  const generalAnnual = generalItems.reduce((s, e) => s + e.annual, 0);
  const fleetHours = fleetBillableHours(i.categories);
  const days = i.category?.daysPerYear ?? 0;
  const hours = i.category?.hoursPerDay ?? 0;
  const unitAnnualHours = days > 0 && hours > 0 ? days * hours : 0;
  const specificItems = i.specificExpenses.map((e) => ({ name: e.name, annual: annualizeSpecific(e.amount, e.period, days) }));
  const specificAnnual = specificItems.reduce((s, e) => s + e.annual, 0);
  const equipmentItems = i.equipment.map((e) => ({ name: e.name, annual: equipmentAnnual(e.qty, e.unitPrice, e.years, e.months) }));
  const equipmentAnnualTotal = equipmentItems.reduce((s, e) => s + e.annual, 0);
  return {
    generalPerHour: fleetHours > 0 ? round2(generalAnnual / fleetHours) : 0,
    specificPerHour: unitAnnualHours > 0 ? round2(specificAnnual / unitAnnualHours) : 0,
    equipmentPerHour: unitAnnualHours > 0 ? equipmentAnnualTotal / unitAnnualHours : 0,
    equipmentPerDay: days > 0 ? equipmentAnnualTotal / days : 0,
    unitAnnualHours,
    daysPerYear: days,
    hoursPerDay: hours,
    generalAnnual,
    specificAnnual,
    equipmentAnnual: equipmentAnnualTotal,
    generalItems,
    specificItems,
    equipmentItems,
  };
}
