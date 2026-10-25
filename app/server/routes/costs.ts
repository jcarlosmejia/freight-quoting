// Perfiles de costo: categorías de flota, gastos generales, equipamiento y vehículos.
import type { FastifyInstance } from 'fastify';
import { annualizeGeneral, fleetBillableHours, GENERAL_PERIODS, round2 } from '../../shared/costing/index.ts';
import { HttpError, requirePerm } from '../auth.ts';
import { all, insert, one, run, tx, update, type DB, type Row } from '../db.ts';
import type { AppContext } from '../app.ts';
import { loadParams } from '../services/params.ts';
import { n, oneOf, s } from '../services/validate.ts';
import { body, idParam, parseFields, registerCrud, type FieldParser } from './crud.ts';

const str = (label: string, max = 300, required = false): FieldParser => (v) => s(v, label, { max, required });
const req = (label: string, max = 200): FieldParser => (v) => s(v, label, { max, required: true });
const nonNeg = (label: string, max = 1e10): FieldParser => (v) => n(v, label, { min: 0, max, def: 0 });
const pct = (label: string): FieldParser => (v) => n(v, label, { min: 0, max: 100, def: 0 });

const VEHICLE_FIELDS: Record<string, FieldParser> = {
  name: req('nombre'),
  class_code: str('clase vehicular', 20),
  description: str('descripción'),
  height_m: nonNeg('alto', 10),
  width_m: nonNeg('ancho', 10),
  length_m: nonNeg('largo', 50),
  weight_tons: nonNeg('peso', 200),
  tons_capacity: nonNeg('capacidad', 500),
  value: nonNeg('valor'),
  life_km: nonNeg('vida útil km'),
  life_years: nonNeg('vida útil años', 100),
  salvage_pct: pct('rescate'),
  capital_rate_pct: nonNeg('tasa de capital', 1000),
  tires_steer_qty: nonNeg('llantas dirección', 50),
  tires_steer_life_km: nonNeg('vida llantas dirección'),
  tires_steer_price: nonNeg('precio llantas dirección'),
  tires_drive_qty: nonNeg('llantas tracción', 50),
  tires_drive_life_km: nonNeg('vida llantas tracción'),
  tires_drive_price: nonNeg('precio llantas tracción'),
  tires_trailer_qty: nonNeg('llantas arrastre', 50),
  tires_trailer_life_km: nonNeg('vida llantas arrastre'),
  tires_trailer_price: nonNeg('precio llantas arrastre'),
  km_per_liter_loaded: nonNeg('km/L cargado', 1000),
  km_per_liter_empty: nonNeg('km/L vacío', 1000),
  fuel_price: nonNeg('precio combustible', 1e5),
  tank_liters: nonNeg('tanque', 1e5),
  refill_minutes: nonNeg('recarga', 1e4),
  idle_lph: nonNeg('ralentí', 1e3),
  break_every_hours: nonNeg('frecuencia de descanso', 1e3),
  break_duration_hours: nonNeg('duración del descanso', 1e3),
  break_cost: nonNeg('costo por descanso'),
  maintenance_interval_km: nonNeg('intervalo de mantenimiento'),
  maintenance_cost: nonNeg('costo de mantenimiento'),
  driver_pay_km_loaded: nonNeg('pago por km cargado', 1e5),
  driver_pay_km_empty: nonNeg('pago por km vacío', 1e5),
  driver_pay_hour: nonNeg('pago por hora', 1e6),
  driver_pay_route_pct: pct('comisión'),
  driver_pay_monthly: nonNeg('sueldo mensual'),
  category_id: (v) => (v === null || v === undefined || v === '' ? null : n(v, 'categoría', { min: 1 })),
  unit_type: (v) => (v === null || v === undefined || v === '' ? null : oneOf(v, 'tipo de unidad', ['plataforma', 'caja_seca'] as const)),
  length_ft: nonNeg('largo (pies)', 80),
  max_pallets: nonNeg('pallets máximos', 100),
  axles: nonNeg('ejes', 12),
};

function vehicleDetail(db: DB, companyId: number, id: number) {
  const v = one(db, 'SELECT * FROM vehicles WHERE id = ? AND company_id = ?', id, companyId);
  if (!v) throw new HttpError(404, 'Vehículo no encontrado.');
  return {
    ...v,
    assets: all(db, 'SELECT * FROM vehicle_assets WHERE vehicle_id = ? ORDER BY id', id),
    expenses: all(db, 'SELECT * FROM vehicle_expenses WHERE vehicle_id = ? ORDER BY id', id),
    equipment: all(db, 'SELECT ve.*, e.name, e.unit_price FROM vehicle_equipment ve JOIN equipment e ON e.id = ve.equipment_id WHERE ve.vehicle_id = ? ORDER BY ve.id', id),
  };
}

function writeVehicleChildren(db: DB, companyId: number, vehicleId: number, b: Record<string, unknown>) {
  if (Array.isArray(b.assets)) {
    run(db, 'DELETE FROM vehicle_assets WHERE vehicle_id = ?', vehicleId);
    for (const a of b.assets as Row[]) {
      insert(db, 'vehicle_assets', { vehicle_id: vehicleId, name: s(a.name, 'activo', { required: true, max: 200 })!, value: n(a.value, 'valor del activo', { min: 0, def: 0 }), life_km: n(a.life_km, 'vida km del activo', { min: 0, def: 0 }), life_years: n(a.life_years, 'vida años del activo', { min: 0, max: 100, def: 0 }) });
    }
  }
  if (Array.isArray(b.expenses)) {
    run(db, 'DELETE FROM vehicle_expenses WHERE vehicle_id = ?', vehicleId);
    for (const e of b.expenses as Row[]) {
      insert(db, 'vehicle_expenses', { vehicle_id: vehicleId, name: s(e.name, 'gasto', { required: true, max: 200 })!, amount: n(e.amount, 'monto', { min: 0, def: 0 }), period: oneOf(e.period, 'periodicidad', ['daily', 'weekly', 'monthly', 'annual'] as const, 'monthly') });
    }
  }
  if (Array.isArray(b.equipment)) {
    run(db, 'DELETE FROM vehicle_equipment WHERE vehicle_id = ?', vehicleId);
    for (const e of b.equipment as Row[]) {
      const eqId = n(e.equipment_id, 'equipo', { min: 1 });
      if (!one(db, 'SELECT id FROM equipment WHERE id = ? AND company_id = ?', eqId, companyId)) throw new HttpError(400, 'Equipo no encontrado.');
      insert(db, 'vehicle_equipment', { vehicle_id: vehicleId, equipment_id: eqId, qty: n(e.qty, 'cantidad', { min: 0, def: 1 }), life_years: n(e.life_years, 'años de reposición', { min: 0, max: 100, def: 1 }), life_months: n(e.life_months, 'meses de reposición', { min: 0, max: 11, def: 0 }) });
    }
  }
}

const checkCategory = (db: DB, companyId: number, values: Record<string, unknown>) => {
  if (values.category_id != null && !one(db, 'SELECT id FROM fleet_categories WHERE id = ? AND company_id = ?', values.category_id as number, companyId)) {
    throw new HttpError(400, 'Categoría no encontrada.');
  }
};

export function registerCosts(app: FastifyInstance, { db }: AppContext) {
  registerCrud(app, db, {
    path: 'fleet-categories',
    table: 'fleet_categories',
    fields: { name: req('nombre', 80), vehicles: (v) => n(v, 'vehículos', { min: 0, max: 100000, def: 0 }), days_per_year: (v) => n(v, 'días/año', { min: 0, max: 366, def: 312 }), hours_per_day: (v) => n(v, 'horas/día', { min: 0, max: 24, def: 8 }) },
    perms: { list: 'ver:gasto_fijo', create: 'agregar:gasto_fijo', update: 'modificar:gasto_fijo', remove: 'eliminar:gasto_fijo' },
  });

  registerCrud(app, db, {
    path: 'general-expenses',
    table: 'general_expenses',
    fields: {
      name: req('nombre'),
      period: (v) => oneOf(v, 'periodicidad', Object.keys(GENERAL_PERIODS) as any, 'Mensual'),
      amount: (v) => n(v, 'monto', { min: 0.01, max: 1e10 }),
      notes: str('notas', 1000),
      updated_at: () => new Date().toISOString(),
    },
    perms: { list: 'ver:gasto_fijo', create: 'agregar:gasto_fijo', update: 'modificar:gasto_fijo', remove: 'eliminar:gasto_fijo' },
  });

  app.get('/api/fleet-summary', async (r) => {
    const u = requirePerm(r, 'ver:gasto_fijo');
    const exp = all(db, 'SELECT amount, period FROM general_expenses WHERE company_id = ?', u.companyId);
    const cats = all(db, 'SELECT * FROM fleet_categories WHERE company_id = ? ORDER BY id', u.companyId);
    const annual = exp.reduce((acc, e) => acc + annualizeGeneral(e.amount, e.period), 0);
    const hours = fleetBillableHours(cats.map((c) => ({ name: c.name, vehicles: c.vehicles, daysPerYear: c.days_per_year, hoursPerDay: c.hours_per_day })));
    return {
      annualExpenses: annual,
      vehicles: cats.reduce((acc, c) => acc + c.vehicles, 0),
      billableHours: hours,
      hourlyRecovery: hours > 0 ? round2(annual / hours) : 0,
      categories: cats.map((c) => ({ ...c, total_hours: c.vehicles * c.days_per_year * c.hours_per_day, per_vehicle_hours: c.days_per_year * c.hours_per_day })),
    };
  });

  registerCrud(app, db, {
    path: 'equipment',
    table: 'equipment',
    fields: { name: req('nombre'), description: str('descripción', 500), unit_price: nonNeg('precio unitario') },
    perms: { list: 'ver:equipo', create: 'agregar:equipo', update: 'modificar:equipo', remove: 'eliminar:equipo' },
    order: 'name',
  });

  app.get('/api/vehicles', async (r) => {
    const u = requirePerm(r, 'ver:vehiculo');
    return all(
      db,
      `SELECT v.id, v.name, v.class_code, v.description, v.unit_type, v.length_ft, v.tons_capacity, v.max_pallets, v.value, v.fuel_price, v.km_per_liter_loaded, v.km_per_liter_empty, v.category_id, c.name AS category_name, v.updated_at
         FROM vehicles v LEFT JOIN fleet_categories c ON c.id = v.category_id WHERE v.company_id = ? AND v.archived = 0 ORDER BY v.name`,
      u.companyId,
    );
  });

  app.get('/api/vehicles/:id', async (r) => {
    const u = requirePerm(r, 'ver:vehiculo');
    return vehicleDetail(db, u.companyId, idParam((r.params as any).id));
  });

  /** Parámetros vigentes de cálculo (equivalente funcional a /calculate/params de Fletcot). */
  app.get('/api/vehicles/:id/params', async (r) => {
    const u = requirePerm(r, 'ver:vehiculo');
    return loadParams(db, u.companyId, idParam((r.params as any).id));
  });

  app.post('/api/vehicles', async (r, reply) => {
    const u = requirePerm(r, 'agregar:vehiculo');
    const b = body(r.body);
    const values = parseFields(VEHICLE_FIELDS, b, false);
    checkCategory(db, u.companyId, values);
    const id = tx(db, () => {
      const id = insert(db, 'vehicles', { ...values, company_id: u.companyId });
      writeVehicleChildren(db, u.companyId, id, b);
      return id;
    });
    reply.status(201);
    return vehicleDetail(db, u.companyId, id);
  });

  app.patch('/api/vehicles/:id', async (r) => {
    const u = requirePerm(r, 'modificar:vehiculo');
    const id = idParam((r.params as any).id);
    vehicleDetail(db, u.companyId, id);
    const b = body(r.body);
    const values = parseFields(VEHICLE_FIELDS, b, true);
    checkCategory(db, u.companyId, values);
    tx(db, () => {
      update(db, 'vehicles', id, { ...values, updated_at: new Date().toISOString() });
      writeVehicleChildren(db, u.companyId, id, b);
    });
    return vehicleDetail(db, u.companyId, id);
  });

  app.post('/api/vehicles/:id/duplicate', async (r, reply) => {
    const u = requirePerm(r, 'agregar:vehiculo');
    const src = vehicleDetail(db, u.companyId, idParam((r.params as any).id));
    const { id: _id, created_at, updated_at, assets, expenses, equipment, ...rest } = src;
    const id = tx(db, () => {
      const id = insert(db, 'vehicles', { ...rest, name: `${rest.name} (copia)` });
      writeVehicleChildren(db, u.companyId, id, { assets, expenses, equipment });
      return id;
    });
    reply.status(201);
    return vehicleDetail(db, u.companyId, id);
  });

  // Se archiva para no romper cotizaciones históricas que lo referencian.
  app.delete('/api/vehicles/:id', async (r) => {
    const u = requirePerm(r, 'eliminar:vehiculo');
    const res = run(db, 'UPDATE vehicles SET archived = 1 WHERE id = ? AND company_id = ?', idParam((r.params as any).id), u.companyId);
    if (!res.changes) throw new HttpError(404, 'Vehículo no encontrado.');
    return { ok: true };
  });
}
