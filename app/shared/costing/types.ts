// Tipos del motor de costeo. Implementación propia: los nombres no provienen del código original.

export interface TireAxle {
  qty: number;
  unitPrice: number;
  lifeKm: number;
}

export interface Asset {
  name: string;
  value: number;
  lifeKm: number;
  lifeYears: number;
}

/** Perfil operativo de un vehículo tal como lo usa el cálculo. */
export interface VehicleProfile {
  id?: number | null;
  name: string;
  value: number;
  lifeKm: number;
  lifeYears: number;
  salvagePct: number;
  capitalRatePct: number;
  kmPerLiterLoaded: number;
  kmPerLiterEmpty: number;
  fuelPricePerLiter: number;
  tankLiters: number;
  refillMinutes: number;
  idleLitersPerHour: number;
  breakEveryHours: number;
  breakDurationHours: number;
  breakCost: number;
  maintenanceIntervalKm: number;
  maintenanceCost: number;
  tires: { steer: TireAxle; drive: TireAxle; trailer: TireAxle };
  assets: Asset[];
  driverPayPerKmLoaded: number;
  driverPayPerKmEmpty: number;
  driverPayPerHour: number;
  driverPayRoutePct: number;
  driverPayMonthly: number;
  tonsCapacity: number;
}

/** Tarifas de recuperación por hora/día de un vehículo (calculadas por el servidor). */
export interface RecoveryRates {
  generalPerHour: number;
  specificPerHour: number;
  equipmentPerHour: number;
  equipmentPerDay: number;
  /** Días/año × horas/día de la categoría del vehículo. 0 si no tiene categoría. */
  unitAnnualHours: number;
  daysPerYear: number;
  hoursPerDay: number;
  generalAnnual: number;
  specificAnnual: number;
  equipmentAnnual: number;
  generalItems: { name: string; annual: number }[];
  specificItems: { name: string; annual: number }[];
  equipmentItems: { name: string; annual: number }[];
}

export interface CostParams {
  vehicle: VehicleProfile;
  rates: RecoveryRates;
}

export interface RouteStop {
  label: string;
  /** La carga de la parada aplica al tramo que sale de ella. */
  loaded: boolean;
  waitMinutes: number;
  idleMinutes: number;
  lat?: number | null;
  lon?: number | null;
}

export interface RouteInput {
  stops: RouteStop[];
  /** Distancia de cada tramo i → i+1 en metros. */
  legMeters: number[];
  /** Tiempo de manejo total en segundos. */
  drivingSeconds: number;
  tollsCash: number;
  tollPasses?: TollPass[];
}

export interface TollPass {
  legIndex: number;
  plazaId: number | null;
  name: string;
  amount: number;
}

export type EmptyKey =
  | 'combustible'
  | 'neumaticos'
  | 'mantenimiento'
  | 'depreciacion'
  | 'fijosGenerales'
  | 'fijosEspecificos'
  | 'equipamiento'
  | 'capital';

export const EMPTY_KEYS: EmptyKey[] = [
  'combustible',
  'neumaticos',
  'mantenimiento',
  'depreciacion',
  'fijosGenerales',
  'fijosEspecificos',
  'equipamiento',
  'capital',
];

export type DriverPayMethod = 'none' | 'per_km' | 'per_hour' | 'percentage' | 'percent_net';

export interface DriverPayInput {
  method: DriverPayMethod;
  perKmLoaded: number;
  perKmEmpty: number;
  perHourLoaded: number;
  perHourEmpty: number;
  /** Comisión sobre utilidad (%). */
  percentage: number;
  /** Comisión sobre costo neto (%). */
  percentNet: number;
  /** Si el pago al operador forma parte de la base de utilidad. */
  applyMargin: boolean;
  operators: number;
}

export interface OtherExpense {
  name: string;
  amount: number;
  applyMargin: boolean;
}

export interface FreightInput {
  fuelPricePerLiter?: number | null;
  kmPerLiterLoaded?: number | null;
  kmPerLiterEmpty?: number | null;
  breakCost?: number | null;
  driverPay: DriverPayInput;
  /** Rubros vacíos que se cobran al cliente (por defecto todos). */
  chargeEmpty: Record<EmptyKey, boolean>;
  /** Rubros vacíos cobrados que además llevan utilidad (por defecto ninguno). */
  profitOnEmpty: Record<EmptyKey, boolean>;
  otherExpenses: OtherExpense[];
  profitPct: number;
  financingPct: number;
  cargoSurchargePct: number;
  taxPct: number;
  cargoType: string;
  tons: number;
}
