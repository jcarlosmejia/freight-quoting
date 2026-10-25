import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFreight, computeRental, defaultFreightInput, defaultRentalInput, round2 } from '../shared/costing/index.ts';
import type { RouteInput } from '../shared/costing/index.ts';
import { params, t3s2 } from './fixtures/reference-t3s2.ts';

const observed = JSON.parse(readFileSync(new URL('../../fixtures/observed-calculations.json', import.meta.url), 'utf8'));
const money = (x: number) => round2(x).toFixed(2);

// Fletcot mostró 130.228 km y 2 h 3 min; no se capturaron metros/segundos exactos.
// Una búsqueda en la rejilla 130227.5–130228.5 m × 7380–7440 s encontró 15 combinaciones que reproducen los 15 importes;
// se usa una de ellas. Comprueba consistencia del modelo, no los valores exactos del proveedor de rutas.
const route: RouteInput = {
  stops: [
    { label: 'Ciudad de México', loaded: true, waitMinutes: 0, idleMinutes: 0 },
    { label: 'Puebla', loaded: true, waitMinutes: 0, idleMinutes: 0 },
  ],
  legMeters: [130228.35],
  drivingSeconds: 7429.15,
  tollsCash: 1304,
};

describe('parámetros de recuperación', () => {
  it('reproduce tarifas por hora observadas', () => {
    expect(params.rates.generalAnnual).toBe(8604000);
    expect(params.rates.generalPerHour).toBe(Number(observed.fleet.displayed_hourly_recovery));
    expect(params.rates.specificPerHour).toBe(37.75);
    expect(money(params.rates.equipmentPerHour)).toBe('6.88');
    expect(money(params.rates.equipmentPerDay)).toBe('55.01');
    expect(params.rates.unitAnnualHours).toBe(2496);
  });
});

describe('flete CDMX → Puebla (caso observado)', () => {
  const f = observed.freight;
  const r = computeFreight(params, route, defaultFreightInput(t3s2));

  it('rubros cargados', () => {
    expect(money(r.loaded.combustible)).toBe(f.fuel);
    expect(money(r.loaded.neumaticos)).toBe(f.tires);
    expect(money(r.loaded.mantenimiento)).toBe(f.maintenance);
    expect(money(r.loaded.depreciacion)).toBe(f.depreciation);
    expect(money(r.loaded.descanso)).toBe(f.rest);
    expect(money(r.loaded.fijosGenerales)).toBe(f.general_fixed);
    expect(money(r.loaded.fijosEspecificos)).toBe(f.specific_fixed);
    expect(money(r.loaded.equipamiento)).toBe(f.equipment);
    expect(money(r.loaded.capital)).toBe(f.capital);
    expect(money(r.loaded.total)).toBe(f.loaded_components_subtotal);
  });

  it('operador, peajes y totales', () => {
    expect(money(r.driverPay.inCost)).toBe(f.driver);
    expect(money(r.tolls)).toBe(f.tolls);
    expect(money(r.tripCost)).toBe(f.trip_cost);
    expect(money(r.profit)).toBe(f.profit);
    expect(money(r.subtotal)).toBe(f.subtotal);
    expect(money(r.tax)).toBe(f.tax);
    expect(money(r.total)).toBe(f.total);
    // Los importes visibles no suman exactamente: el subtotal usa precisión completa.
    expect(money(round2(r.tripCost) + round2(r.profit))).toBe('4455.37');
  });

  it('variante con utilidad 30%', () => {
    const v = f.profit_30_variant;
    const r30 = computeFreight(params, route, { ...defaultFreightInput(t3s2), profitPct: 30 });
    expect(money(r30.profit)).toBe(v.profit);
    expect(money(r30.subtotal)).toBe(v.subtotal);
    expect(money(r30.tax)).toBe(v.tax);
    expect(money(r30.total)).toBe(v.total);
  });

  it('precio por km usa la distancia total', () => {
    expect(money(r.pricePerKm)).toBe('39.69');
  });
});

describe('renta mensual sin recorrido (caso observado)', () => {
  const o = observed.rental;
  const r = computeRental(params, { ...defaultRentalInput(params), unit: 'month', quantity: 1 });
  it('periodo y bloques', () => {
    expect(r.span.operatingDays).toBe(26);
    expect(r.span.billableHours).toBe(208);
    expect(money(r.availability.general.amount)).toBe('17925.44');
    expect(money(r.availability.specific.amount)).toBe('7852.00');
    expect(money(r.availability.equipment.amount)).toBe('1430.14');
    expect(money(r.availability.structure)).toBe('27207.58');
    expect(r.availability.depreciation.map((d) => money(d.amount))).toEqual(['10829.45', '2222.22']);
    expect(money(r.availability.capitalCost)).toBe('8997.67');
  });
  it('precio', () => {
    expect(money(r.costBase)).toBe(o.availability_cost);
    expect(money(r.usage.total)).toBe(o.usage_cost);
    expect(money(r.profit)).toBe(o.profit);
    expect(money(r.periodSubtotal)).toBe(o.subtotal);
    expect(money(r.tax)).toBe(o.tax);
    expect(money(r.total)).toBe(o.total);
  });
});

describe('caso público de fletcot.com (parcial)', () => {
  const pub = observed.public_marketing_case;
  it('dos descansos de 8 h suman horas con cliente y reproducen los rubros por hora', () => {
    const drivingSeconds = 18.6201 * 3600;
    const r = computeFreight(params, { stops: [{ label: 'A', loaded: true, waitMinutes: 0, idleMinutes: 0 }, { label: 'B', loaded: true, waitMinutes: 0, idleMinutes: 0 }], legMeters: [966300], drivingSeconds, tollsCash: 0 }, defaultFreightInput(t3s2));
    expect(r.time.rests).toBe(2);
    expect(money(r.loaded.descanso)).toBe(pub.rest);
    expect(money(r.loaded.fijosGenerales)).toBe(pub.general_fixed);
    expect(money(r.loaded.fijosEspecificos)).toBe(pub.specific_fixed);
    expect(money(r.loaded.equipamiento)).toBe(pub.equipment);
  });
});
