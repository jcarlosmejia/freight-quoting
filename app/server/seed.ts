// Datos de ejemplo sintéticos. Ningún dato corresponde a una empresa, persona o tarifa oficial real.
// El perfil "Referencia T3-S2" replica los parámetros numéricos observados en la cuenta de evaluación
// para poder reproducir en la interfaz el caso de referencia documentado en docs/08.
import { ALL_PERMISSIONS, USER_ROLE_PERMISSIONS } from '../shared/permissions.ts';
import { hashPassword } from './auth.ts';
import { insert, one, run, tx, type DB } from './db.ts';
import { defaultPriceListTemplate, defaultQuoteTemplate } from './services/docx.ts';
import { DEFAULT_PREFERENCES } from './services/quotes.ts';
import { storeTemplate } from './routes/templates.ts';

export interface SeedOptions {
  companyName?: string;
  adminEmail: string;
  adminPassword: string;
  userEmail: string;
  userPassword: string;
  dataDir: string;
}

export function ensureSystemRoles(db: DB, companyId: number) {
  const admin = insert(db, 'roles', { company_id: companyId, name: 'admin', description: 'Acceso total a la empresa.', is_system: 1 });
  for (const p of ALL_PERMISSIONS) run(db, 'INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)', admin, p);
  const user = insert(db, 'roles', { company_id: companyId, name: 'usuario', description: 'Operación diaria sin administración.', is_system: 1 });
  for (const p of USER_ROLE_PERMISSIONS) run(db, 'INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)', user, p);
  return { admin, user };
}

export function seed(db: DB, o: SeedOptions): { created: boolean; companyId: number } {
  const existing = one(db, 'SELECT company_id FROM users WHERE email = ?', o.adminEmail);
  if (existing) return { created: false, companyId: existing.company_id };
  return tx(db, () => {
    const companyId = insert(db, 'companies', {
      // Razón social, RFC y contacto quedan vacíos: los captura la empresa en Configuración.
      name: o.companyName ?? 'CARMAG TRANSPORTS',
      preferences: JSON.stringify(DEFAULT_PREFERENCES),
    });
    const roles = ensureSystemRoles(db, companyId);
    insert(db, 'users', { company_id: companyId, email: o.adminEmail, name: 'Administración Demo', password_hash: hashPassword(o.adminPassword), role_id: roles.admin });
    insert(db, 'users', { company_id: companyId, email: o.userEmail, name: 'Usuario Demo', password_hash: hashPassword(o.userPassword), role_id: roles.user });

    const cat = (name: string, vehicles: number) => insert(db, 'fleet_categories', { company_id: companyId, name, vehicles, days_per_year: 312, hours_per_day: 8 });
    const grandes = cat('Grandes', 10);
    const medianos = cat('Medianos', 20);
    cat('Pequeños', 10);

    // Montos sintéticos elegidos para sumar $8,604,000/año (mismo total que el caso de referencia).
    const ge = (name: string, period: string, amount: number, notes: string) => insert(db, 'general_expenses', { company_id: companyId, name, period, amount, notes });
    ge('Renta de oficina y patio', 'Mensual', 60000, 'Dato sintético.');
    ge('Nómina administrativa', 'Mensual', 180000, 'Dato sintético.');
    ge('Nómina base de operadores', 'Mensual', 300000, 'Pago garantizado; el variable por viaje va aparte.');
    ge('Cargas sociales', 'Mensual', 120000, 'Dato sintético.');
    ge('Servicios, software y comunicaciones', 'Mensual', 50500, 'Dato sintético.');
    ge('Membresías y permisos anuales', 'Anual', 42000, 'Dato sintético.');
    ge('Predial', 'Anual', 36000, 'Dato sintético.');

    const eq = (name: string, unit_price: number) => insert(db, 'equipment', { company_id: companyId, name, unit_price, description: 'Artículo de ejemplo' });
    const equipmentIds = [
      eq('Casco', 210), eq('Lentes de seguridad', 45), eq('Guantes', 350), eq('Botas de seguridad', 750), eq('Chaleco reflejante', 120), eq('Overol', 650),
      eq('Botiquín', 350), eq('Extintor', 750), eq('Triángulos reflejantes', 250), eq('Gato hidráulico', 1500), eq('Llave de cruz', 350), eq('Caja de herramienta', 1200),
      eq('Lámpara', 150), eq('Cadena con ganchos', 650), eq('Tensor de cadena', 350), eq('Banda con matraca', 1200), eq('Eslinga', 320), eq('Pulpo de acero', 1590),
      eq('Lona', 1500), eq('Esquineros', 200), eq('Conos', 300), eq('Cuñas', 400),
    ];
    const assignments: [number, number][] = [[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [2, 1], [1, 2], [1, 5], [1, 3], [1, 5], [1, 5], [1, 5], [1, 2], [6, 3], [6, 3], [8, 2], [4, 2], [6, 2], [1, 2], [1, 2], [1, 3], [1, 3]];

    const vehicle = (fields: Record<string, any>) => insert(db, 'vehicles', { company_id: companyId, ...fields });
    const ref = vehicle({
      name: 'Referencia T3-S2 (valores de evaluación)', class_code: 'T3-S2', description: 'Tractocamión 5 ejes; parámetros del caso de referencia', category_id: grandes,
      unit_type: 'plataforma', length_ft: 40, max_pallets: 20, axles: 5,
      height_m: 4.25, width_m: 2.6, length_m: 20, weight_tons: 15.5, tons_capacity: 30,
      value: 1299534, life_km: 700000, life_years: 8, salvage_pct: 20, capital_rate_pct: 10,
      tires_steer_qty: 2, tires_steer_life_km: 120000, tires_steer_price: 3345,
      tires_drive_qty: 8, tires_drive_life_km: 150000, tires_drive_price: 3345,
      tires_trailer_qty: 8, tires_trailer_life_km: 120000, tires_trailer_price: 3345,
      km_per_liter_loaded: 2, km_per_liter_empty: 2.5, fuel_price: 23.41, tank_liters: 600, refill_minutes: 20, idle_lph: 3,
      break_every_hours: 8, break_duration_hours: 8, break_cost: 800, maintenance_interval_km: 25000, maintenance_cost: 9000,
      driver_pay_km_loaded: 3, driver_pay_km_empty: 0, driver_pay_hour: 0, driver_pay_route_pct: 0, driver_pay_monthly: 0,
    });
    insert(db, 'vehicle_assets', { vehicle_id: ref, name: 'Semirremolque plataforma', value: 500000, life_km: 1000000, life_years: 15 });
    for (const [name, amount, period] of [['Seguro de la unidad', 6000, 'monthly'], ['Rastreo satelital', 600, 'monthly'], ['Cámaras', 350, 'monthly'], ['Verificación', 1800, 'annual'], ['Tenencia', 5000, 'annual'], ['Placas', 4018, 'annual']] as const) {
      insert(db, 'vehicle_expenses', { vehicle_id: ref, name, amount, period });
    }
    equipmentIds.forEach((id, i) => insert(db, 'vehicle_equipment', { vehicle_id: ref, equipment_id: id, qty: assignments[i][0], life_years: assignments[i][1], life_months: 0 }));

    // Caja seca de ejemplo: mismos costos que la referencia; capacidad y largo son valores de ejemplo a verificar.
    const dry = vehicle({
      name: 'Caja seca 53 pies (ejemplo)', class_code: 'T3-S2', description: 'Valores de ejemplo: verifica capacidad, rendimiento y costos', category_id: grandes,
      unit_type: 'caja_seca', length_ft: 53, max_pallets: 26, axles: 5, tons_capacity: 30,
      height_m: 4.1, width_m: 2.6, length_m: 16.15, weight_tons: 14,
      value: 1299534, life_km: 700000, life_years: 8, salvage_pct: 20, capital_rate_pct: 10,
      tires_steer_qty: 2, tires_steer_life_km: 120000, tires_steer_price: 3345,
      tires_drive_qty: 8, tires_drive_life_km: 150000, tires_drive_price: 3345,
      tires_trailer_qty: 8, tires_trailer_life_km: 120000, tires_trailer_price: 3345,
      km_per_liter_loaded: 2, km_per_liter_empty: 2.5, fuel_price: 23.41, tank_liters: 600, refill_minutes: 20, idle_lph: 3,
      break_every_hours: 8, break_duration_hours: 8, break_cost: 800, maintenance_interval_km: 25000, maintenance_cost: 9000,
      driver_pay_km_loaded: 3,
    });
    insert(db, 'vehicle_assets', { vehicle_id: dry, name: 'Caja seca 53 pies', value: 650000, life_km: 1000000, life_years: 15 });

    vehicle({
      name: 'Torton C3 (ejemplo)', class_code: 'C3', description: 'Camión unitario 3 ejes, datos sintéticos', category_id: medianos,
      value: 1450000, life_km: 600000, life_years: 10, salvage_pct: 15, capital_rate_pct: 10,
      tires_steer_qty: 2, tires_steer_life_km: 100000, tires_steer_price: 4200, tires_drive_qty: 8, tires_drive_life_km: 120000, tires_drive_price: 4200,
      km_per_liter_loaded: 3, km_per_liter_empty: 3.8, fuel_price: 24.5, tank_liters: 400, refill_minutes: 15, idle_lph: 2.5,
      break_every_hours: 8, break_duration_hours: 8, break_cost: 600, maintenance_interval_km: 20000, maintenance_cost: 7000,
      driver_pay_km_loaded: 2.5, driver_pay_km_empty: 1.5, driver_pay_hour: 120, driver_pay_monthly: 12000, tons_capacity: 14,
    });

    insert(db, 'clients', { company_id: companyId, legal_name: 'Cliente Sintético Uno S.A. de C.V.', trade_name: 'Cliente Uno', rfc: 'CSU010101AA1', contact_name: 'Contacto de prueba', email: 'contacto@cliente-uno.test', phone: '+52 55 1111 1111', notes: 'Registro ficticio para pruebas.' });
    insert(db, 'clients', { company_id: companyId, legal_name: 'Distribuidora Ficticia del Centro', contact_name: 'Compras', email: 'compras@ficticia.test' });

    insert(db, 'locations', { company_id: companyId, name: 'Base CDMX (ejemplo)', kind: 'base', lat: 19.4326, lon: -99.1332 });
    // Origen y destino del caso de prueba de CARMAG (direcciones del requerimiento; coordenadas no verificadas, se dejan vacías).
    insert(db, 'locations', { company_id: companyId, name: 'Parque Empresarial Tesistán', kind: 'ubicacion', address: 'Av. Juan Gil Preciado #9200, int. 1, Parque Empresarial Tesistán', city: 'Zapopan', state: 'Jalisco', zip: '45200' });
    insert(db, 'locations', { company_id: companyId, name: 'Col. Francisco Medrano, Altamira', kind: 'ubicacion', address: 'Calle Gonzálo Peña #303, Col. Francisco Medrano', city: 'Altamira', state: 'Tamaulipas', zip: '89602' });
    insert(db, 'km_routes', {
      company_id: companyId,
      name: 'Zapopan (Tesistán) → Altamira',
      origin: JSON.stringify({ address: 'Av. Juan Gil Preciado #9200, int. 1, Parque Empresarial Tesistán', city: 'Zapopan', state: 'Jalisco', zip: '45200' }),
      destination: JSON.stringify({ address: 'Calle Gonzálo Peña #303, Col. Francisco Medrano', city: 'Altamira', state: 'Tamaulipas', zip: '89602' }),
      outbound_km: 815,
      distance_source: 'manual',
      distance_note: 'Distancia provisional del requerimiento; pendiente de validar con un proveedor de rutas.',
    });
    insert(db, 'locations', { company_id: companyId, name: 'Puebla centro (ejemplo)', kind: 'ubicacion', lat: 19.0414, lon: -98.2063 });

    const plaza = insert(db, 'toll_plazas', { company_id: companyId, name: 'Caseta de prueba A', highway: 'Autopista ficticia', source: 'Dato sintético de prueba, no es tarifa oficial', notes: 'Reemplazar por tarifas verificadas antes de cotizar a clientes.' });
    for (const [cls, amount] of [['C3', 410], ['T3-S2', 652]] as const) {
      insert(db, 'toll_rates', { plaza_id: plaza, vehicle_class: cls, direction: 'ambos', amount, effective_from: '2026-01-01', source: 'Sintético' });
    }

    insert(db, 'saved_routes', {
      company_id: companyId,
      name: 'Referencia CDMX – Puebla (observada 2026-10-25)',
      routing_source: 'manual',
      route: JSON.stringify({
        stops: [
          { label: 'Ciudad de México', loaded: true, waitMinutes: 0, idleMinutes: 0, lat: 19.4326, lon: -99.1332 },
          { label: 'Puebla', loaded: true, waitMinutes: 0, idleMinutes: 0, lat: 19.0414, lon: -98.2063 },
        ],
        legMeters: [130228.35],
        drivingSeconds: 7429.15,
        tollsCash: 1304,
        tollPasses: [{ legIndex: 0, plazaId: null, name: 'Total de casetas observado para T3-S2 (no es tarifa oficial verificada)', amount: 1304 }],
      }),
    });

    storeTemplate(db, o.dataDir, companyId, 'quote', 'plantilla-cotizacion-predeterminada', 'Plantilla propia de ejemplo. Puedes descargarla, editarla en Word y subirla.', defaultQuoteTemplate(), true);
    storeTemplate(db, o.dataDir, companyId, 'price_list', 'plantilla-lista-precios-predeterminada', 'Plantilla propia de ejemplo para tarifarios.', defaultPriceListTemplate(), true);
    return { created: true, companyId };
  });
}
