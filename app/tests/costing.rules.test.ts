// Reglas recuperadas del código compilado (docs/09). No están verificadas contra la sesión del proveedor
// salvo donde se indica; estas pruebas fijan el comportamiento local para evitar regresiones.
import { describe, expect, it } from 'vitest';
import { computeFreight, computeRental, defaultFreightInput, defaultRentalInput, EMPTY_KEYS, round2 } from '../shared/costing/index.ts';
import type { RouteInput } from '../shared/costing/index.ts';
import { params, t3s2 } from './fixtures/reference-t3s2.ts';

const stop = (label: string, loaded: boolean, waitMinutes = 0, idleMinutes = 0) => ({ label, loaded, waitMinutes, idleMinutes });
const base = defaultFreightInput(t3s2);

describe('ida con regreso vacío', () => {
  const route: RouteInput = { stops: [stop('A', true), stop('B', false), stop('A', false)], legMeters: [100000, 100000], drivingSeconds: 7200, tollsCash: 0 };
  const r = computeFreight(params, route, base);

  it('separa km y horas por estado de carga de la parada de salida', () => {
    expect(r.time.kmLoaded).toBe(100);
    expect(r.time.kmEmpty).toBe(100);
    expect(r.time.hoursLoadedDriving).toBe(1);
    expect(r.time.emptyHours).toBe(1);
    expect(r.empty.combustible).toBeCloseTo((100 / 2.5) * t3s2.fuelPricePerLiter, 9);
  });

  it('el vacío se cobra a costo por defecto, sin utilidad', () => {
    expect(r.emptyCharged).toBeCloseTo(r.empty.total, 9);
    expect(r.emptyChargedWithProfit).toBe(0);
    expect(r.profit).toBeCloseTo((r.loaded.total + r.driverPay.inCost) * 0.2, 9);
  });

  it('no cobrar un rubro vacío no cambia su costo físico, sólo lo que se cobra', () => {
    const chargeEmpty = { ...base.chargeEmpty, combustible: false };
    const r2 = computeFreight(params, route, { ...base, chargeEmpty });
    expect(r2.empty.total).toBeCloseTo(r.empty.total, 9);
    expect(r2.emptyNotCharged).toBeCloseTo(r.empty.combustible, 9);
    expect(r2.tripCost).toBeCloseTo(r.tripCost - r.empty.combustible, 9);
  });

  it('un rubro vacío con utilidad entra a la base de utilidad', () => {
    const profitOnEmpty = Object.fromEntries(EMPTY_KEYS.map((k) => [k, true])) as typeof base.profitOnEmpty;
    const r2 = computeFreight(params, route, { ...base, profitOnEmpty });
    expect(r2.profit).toBeCloseTo((r.loaded.total + r.empty.total + r.driverPay.inCost) * 0.2, 9);
  });
});

describe('esperas, ralentí, recargas y descansos', () => {
  it('la espera suma horas al cliente sin aumentar km; el ralentí consume combustible', () => {
    const route: RouteInput = { stops: [stop('A', true, 120, 60), stop('B', true)], legMeters: [50000], drivingSeconds: 3600, tollsCash: 0 };
    const r = computeFreight(params, route, base);
    expect(r.time.kmTotal).toBe(50);
    expect(r.time.clientHours).toBe(3);
    expect(r.time.idleLiters).toBe(3);
    expect(r.loaded.combustible).toBeCloseTo((25 + 3) * t3s2.fuelPricePerLiter, 9);
  });

  it('el descanso se genera al llegar exactamente a la frecuencia', () => {
    const at = (s: number) => computeFreight(params, { stops: [stop('A', true), stop('B', true)], legMeters: [500000], drivingSeconds: s, tollsCash: 0 }, base);
    expect(at(8 * 3600 - 1).time.rests).toBe(0);
    expect(at(8 * 3600).time.rests).toBe(1);
    expect(at(8 * 3600).loaded.descanso).toBe(800);
    expect(at(8 * 3600).time.restHours).toBe(8);
  });

  it('recargas por tanque completo', () => {
    const r = computeFreight(params, { stops: [stop('A', true), stop('B', true)], legMeters: [1300000], drivingSeconds: 3600, tollsCash: 0 }, base);
    expect(r.time.refuels).toBe(1);
    expect(r.time.refuelHours).toBeCloseTo(20 / 60, 9);
  });
});

describe('pago al operador', () => {
  const route: RouteInput = { stops: [stop('A', true), stop('B', false), stop('C', false)], legMeters: [100000, 50000], drivingSeconds: 3 * 3600, tollsCash: 500 };
  const withPay = (dp: Partial<typeof base.driverPay>) => computeFreight(params, route, { ...base, driverPay: { ...base.driverPay, ...dp } });

  it('por km: cargado y vacío por operador', () => {
    const r = withPay({ method: 'per_km', perKmLoaded: 3, perKmEmpty: 2, operators: 2 });
    expect(r.driverPay.inCost).toBeCloseTo((3 * 100 + 2 * 50) * 2, 9);
  });

  it('por hora: horas con cliente y horas vacías', () => {
    const r = withPay({ method: 'per_hour', perHourLoaded: 100, perHourEmpty: 50 });
    expect(r.driverPay.inCost).toBeCloseTo(100 * 2 + 50 * 1, 9);
  });

  it('comisión sobre neto: % del costo cargado + vacío cobrado, entra al costo', () => {
    const r = withPay({ method: 'percent_net', percentNet: 10 });
    expect(r.driverPay.inCost).toBeCloseTo((r.loaded.total + r.emptyCharged) * 0.1, 9);
  });

  it('comisión sobre utilidad: se informa y no aumenta el precio', () => {
    const r = withPay({ method: 'percentage', percentage: 25 });
    const none = withPay({ method: 'none' });
    expect(r.driverPay.profitCommission).toBeCloseTo(r.profit * 0.25, 9);
    expect(r.total).toBeCloseTo(none.total, 9);
  });

  it('sin utilidad sobre el pago: se suma a costo', () => {
    const a = withPay({ method: 'per_km', perKmLoaded: 3, applyMargin: true });
    const b = withPay({ method: 'per_km', perKmLoaded: 3, applyMargin: false });
    expect(b.tripCost).toBeCloseTo(a.tripCost, 9);
    expect(a.profit - b.profit).toBeCloseTo(300 * 0.2, 9);
  });
});

describe('orden de precio', () => {
  it('utilidad → financiamiento sobre gasto → recargo sobre ambos → IVA; peajes sin margen', () => {
    const route: RouteInput = { stops: [stop('A', true), stop('B', true)], legMeters: [100000], drivingSeconds: 3600, tollsCash: 1000 };
    const r = computeFreight(params, route, {
      ...base,
      financingPct: 5,
      cargoSurchargePct: 10,
      otherExpenses: [{ name: 'Maniobra', amount: 200, applyMargin: true }, { name: 'Pensión', amount: 100, applyMargin: false }],
    });
    const gasto = r.loadedCostBase + r.emptyCostNoProfit + 1000 + 300;
    expect(r.totalExpense).toBeCloseTo(gasto, 9);
    expect(r.profit).toBeCloseTo((r.loadedCostBase + 200) * 0.2, 9);
    expect(r.financing).toBeCloseTo(gasto * 0.05, 9);
    expect(r.cargoSurcharge).toBeCloseTo((gasto + r.profit + r.financing) * 0.1, 9);
    expect(r.total).toBeCloseTo(r.subtotal * 1.16, 9);
  });
});

describe('renta', () => {
  const cfg = defaultRentalInput(params);
  it('semana = 312/52 días; jornada = horas por jornada', () => {
    expect(computeRental(params, { ...cfg, unit: 'week', quantity: 1 }).span.operatingDays).toBe(6);
    expect(computeRental(params, { ...cfg, unit: 'shift', quantity: 2 }).span.billableHours).toBe(24);
  });

  it('depreciación: lo que ocurra primero entre calendario y km', () => {
    const low = computeRental(params, { ...cfg, kmPerDay: 10 });
    const high = computeRental(params, { ...cfg, kmPerDay: 1000 });
    expect(low.availability.depreciation[0].basis).toBe('calendario');
    expect(high.availability.depreciation[0].basis).toBe('km');
    expect(high.availability.depreciation[0].amount).toBeCloseTo(high.availability.depreciation[0].perKm * 26000, 6);
  });

  it('tope de km: el uso se calcula con km incluidos y el excedente se cotiza con recargo', () => {
    const r = computeRental(params, { ...cfg, kmPerDay: 200, kmCapEnabled: true, kmIncludedPerMonth: 3000, fuelMode: 'included' });
    expect(r.usage.kmPeriod).toBe(3000);
    expect(r.excess.kmExcessExpected).toBe(5200 - 3000);
    expect(r.excess.perKm).toBeCloseTo((r.periodSubtotal / 3000) * 1.5, 9);
  });

  it('precio cerrado por contrato ignora el cálculo y reporta margen', () => {
    const r = computeRental(params, { ...cfg, unit: 'flat', quantity: 3, flatMode: 'contract', flatPrice: 100000 });
    expect(r.periodSubtotal).toBe(100000);
    expect(round2(r.unitSubtotal)).toBe(33333.33);
    expect(r.flatMargin).toBeCloseTo(100000 - r.costBase, 6);
  });

  it('casetas incluidas: por km de la ruta representativa; utilidad no las incluye', () => {
    const r = computeRental(params, { ...cfg, kmPerDay: 100, tollsMode: 'included', tollsPerKm: 2 });
    expect(r.tolls).toBe(5200);
    expect(r.profit).toBeCloseTo(r.costBase * 0.2, 9);
  });
});
