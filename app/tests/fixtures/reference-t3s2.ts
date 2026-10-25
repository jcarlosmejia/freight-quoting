// Parámetros numéricos observados en la cuenta de evaluación (2026-10-25) para el perfil T3-S2.
// Son hechos medidos para comparar el motor; no son datos de una empresa real.
import { computeRates } from '../../shared/costing/index.ts';
import type { CostParams, VehicleProfile } from '../../shared/costing/index.ts';

const tire = (qty: number, lifeKm: number) => ({ qty, unitPrice: 3345, lifeKm });

export const t3s2: VehicleProfile = {
  name: 'Tractocamión plataforma (T3-S2)',
  value: 1299534,
  lifeKm: 700000,
  lifeYears: 8,
  salvagePct: 20,
  capitalRatePct: 10,
  kmPerLiterLoaded: 2,
  kmPerLiterEmpty: 2.5,
  // El perfil observado almacena 23.40999984741211 (float32) y muestra 23.41; ambos dan los mismos importes.
  fuelPricePerLiter: 23.41,
  tankLiters: 600,
  refillMinutes: 20,
  idleLitersPerHour: 3,
  breakEveryHours: 8,
  breakDurationHours: 8,
  breakCost: 800,
  maintenanceIntervalKm: 25000,
  maintenanceCost: 9000,
  tires: { steer: tire(2, 120000), drive: tire(8, 150000), trailer: tire(8, 120000) },
  assets: [{ name: 'Semirremolque plataforma', value: 500000, lifeKm: 1000000, lifeYears: 15 }],
  driverPayPerKmLoaded: 3,
  driverPayPerKmEmpty: 0,
  driverPayPerHour: 0,
  driverPayRoutePct: 0,
  driverPayMonthly: 0,
  tonsCapacity: 0,
};

// 23 gastos mensuales que suman $710,500 y 3 anuales de $78,000 → $8,604,000/año (observado).
export const generalExpenses = [
  { name: 'Gastos mensuales agregados', amount: 710500, period: 'Mensual' as const },
  { name: 'Gastos anuales agregados', amount: 78000, period: 'Anual' as const },
];

export const categories = [
  { name: 'Grandes', vehicles: 10, daysPerYear: 312, hoursPerDay: 8 },
  { name: 'Medianos', vehicles: 20, daysPerYear: 312, hoursPerDay: 8 },
  { name: 'Pequeños', vehicles: 10, daysPerYear: 312, hoursPerDay: 8 },
];

export const specificExpenses = [
  { name: 'Seguro', amount: 6000, period: 'monthly' as const },
  { name: 'GPS', amount: 600, period: 'monthly' as const },
  { name: 'Cámaras', amount: 350, period: 'monthly' as const },
  { name: 'Verificación', amount: 1800, period: 'annual' as const },
  { name: 'Tenencia', amount: 5000, period: 'annual' as const },
  { name: 'Placas', amount: 4018, period: 'annual' as const },
];

// (cantidad, precio, años) de los 22 artículos asignados al perfil; suman $17,161.67/año.
const eq: [number, number, number][] = [
  [1, 210, 1], [1, 45, 1], [1, 350, 1], [1, 750, 1], [1, 120, 1], [2, 650, 1], [1, 350, 2], [1, 750, 5],
  [1, 250, 3], [1, 1500, 5], [1, 350, 5], [1, 1200, 5], [1, 150, 2], [6, 650, 3], [6, 350, 3], [8, 1200, 2],
  [4, 320, 2], [6, 1590, 2], [1, 1500, 2], [1, 200, 2], [1, 300, 3], [1, 400, 3],
];
export const equipment = eq.map(([qty, unitPrice, years], i) => ({ name: `Artículo ${i + 1}`, qty, unitPrice, years, months: 0 }));

export const params: CostParams = {
  vehicle: t3s2,
  rates: computeRates({ generalExpenses, categories, category: categories[0], specificExpenses, equipment }),
};
