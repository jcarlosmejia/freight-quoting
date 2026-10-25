// Construye los parámetros vigentes de cálculo de un vehículo desde la base de datos.
import { computeRates, type CostParams, type VehicleProfile } from '../../shared/costing/index.ts';
import { HttpError } from '../auth.ts';
import { all, one, type DB, type Row } from '../db.ts';

export function vehicleFromRow(v: Row, assets: Row[]): VehicleProfile {
  return {
    id: v.id,
    name: v.name,
    value: v.value,
    lifeKm: v.life_km,
    lifeYears: v.life_years,
    salvagePct: v.salvage_pct,
    capitalRatePct: v.capital_rate_pct,
    kmPerLiterLoaded: v.km_per_liter_loaded,
    kmPerLiterEmpty: v.km_per_liter_empty,
    fuelPricePerLiter: v.fuel_price,
    tankLiters: v.tank_liters,
    refillMinutes: v.refill_minutes,
    idleLitersPerHour: v.idle_lph,
    breakEveryHours: v.break_every_hours,
    breakDurationHours: v.break_duration_hours,
    breakCost: v.break_cost,
    maintenanceIntervalKm: v.maintenance_interval_km,
    maintenanceCost: v.maintenance_cost,
    tires: {
      steer: { qty: v.tires_steer_qty, unitPrice: v.tires_steer_price, lifeKm: v.tires_steer_life_km },
      drive: { qty: v.tires_drive_qty, unitPrice: v.tires_drive_price, lifeKm: v.tires_drive_life_km },
      trailer: { qty: v.tires_trailer_qty, unitPrice: v.tires_trailer_price, lifeKm: v.tires_trailer_life_km },
    },
    assets: assets.map((a) => ({ name: a.name, value: a.value, lifeKm: a.life_km, lifeYears: a.life_years })),
    driverPayPerKmLoaded: v.driver_pay_km_loaded,
    driverPayPerKmEmpty: v.driver_pay_km_empty,
    driverPayPerHour: v.driver_pay_hour,
    driverPayRoutePct: v.driver_pay_route_pct,
    driverPayMonthly: v.driver_pay_monthly,
    tonsCapacity: v.tons_capacity,
  };
}

export function loadParams(db: DB, companyId: number, vehicleId: number): CostParams & { warnings: string[] } {
  const v = one(db, 'SELECT * FROM vehicles WHERE id = ? AND company_id = ?', vehicleId, companyId);
  if (!v) throw new HttpError(404, 'Vehículo no encontrado.');
  const assets = all(db, 'SELECT * FROM vehicle_assets WHERE vehicle_id = ? ORDER BY id', vehicleId);
  const categories = all(db, 'SELECT * FROM fleet_categories WHERE company_id = ? ORDER BY id', companyId);
  const cat = categories.find((c) => c.id === v.category_id) ?? null;
  const toCat = (c: Row) => ({ id: c.id, name: c.name, vehicles: c.vehicles, daysPerYear: c.days_per_year, hoursPerDay: c.hours_per_day });
  const rates = computeRates({
    generalExpenses: all(db, 'SELECT name, amount, period FROM general_expenses WHERE company_id = ?', companyId) as any,
    categories: categories.map(toCat),
    category: cat ? toCat(cat) : null,
    specificExpenses: all(db, 'SELECT name, amount, period FROM vehicle_expenses WHERE vehicle_id = ? ORDER BY id', vehicleId) as any,
    equipment: all(
      db,
      `SELECT e.name, ve.qty, e.unit_price AS unitPrice, ve.life_years AS years, ve.life_months AS months
         FROM vehicle_equipment ve JOIN equipment e ON e.id = ve.equipment_id WHERE ve.vehicle_id = ? ORDER BY ve.id`,
      vehicleId,
    ) as any,
  });
  const warnings: string[] = [];
  if (rates.generalAnnual <= 0) warnings.push('No hay gastos fijos generales capturados; ese rubro va en $0.00.');
  else if (rates.generalPerHour <= 0) warnings.push('Falta la cantidad de vehículos por categoría; los gastos generales van en $0.00.');
  if (!cat) warnings.push('El vehículo no tiene categoría (tiempo efectivo); gastos específicos, equipamiento y capital por hora van en $0.00.');
  if (v.fuel_price <= 0) warnings.push('Falta el precio del combustible en el perfil.');
  if (v.km_per_liter_loaded <= 0) warnings.push('Falta el rendimiento cargado (km/L) en el perfil.');
  return { vehicle: vehicleFromRow(v, assets), rates, warnings };
}
