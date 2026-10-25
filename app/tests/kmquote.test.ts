import { describe, expect, it } from 'vitest';
import { computeKmQuote, defaultScenarios, evaluate, freightForMargin, kmBreakdown, roundCommercial, type KmQuoteInput } from '../shared/pricing/kmquote.ts';

// Valores de prueba (no son costos reales): rendimiento y diésel elegidos para cuentas fáciles.
const base = (): KmQuoteInput => ({
  unit: { name: 'Plataforma 40', unitType: 'plataforma', lengthFt: 40, maxWeightTons: 30, maxPallets: 24, kmPerLiterLoaded: 2, kmPerLiterEmpty: 2.5, axles: 5 },
  trip: { outboundKm: 815, distanceSource: 'manual', tripType: 'sencillo', returnMode: 'vacio', returnKm: 815, returnBillable: false, repositioningKm: 0, extraKm: 0, extraKmBillable: false, evaluateEmptyReturn: false, tollsOutbound: 0, tollsReturn: 0, tollsBilling: 'incluidas' },
  cargo: { pallets: 16, weightTons: 16, goods: 'Carga general', tarp: false, straps: false, handling: 'cliente' },
  costs: { dieselPerLiter: 2000, operatorModel: 'por_km', operatorFixed: 0, operatorPct: 0, operatorPerKm: 0, operatorPerDiem: 0, perKmCosts: [], fixedCosts: [], contingencyPct: 0, commissionPct: 0 },
  charges: [],
  pricing: { minRate: 6000, maxRate: 6500, targetRate: 6200, minTripPrice: 0, targetMarginPct: 25, minProfit: 0, rounding: 0, roundingMode: 'ninguno', taxPct: 16, retentionPct: 0, tollsTaxable: true },
  scenarios: [],
});

describe('kilómetros', () => {
  it('sencillo: el regreso no se recorre ni se cobra', () => {
    expect(kmBreakdown(base().trip)).toMatchObject({ outbound: 815, return: 0, driven: 815, billable: 815 });
  });
  it('redondo vacío: se recorre pero no se factura salvo que se indique', () => {
    const t = { ...base().trip, tripType: 'redondo' as const };
    expect(kmBreakdown(t)).toMatchObject({ driven: 1630, billable: 815, loaded: 815, empty: 815 });
    expect(kmBreakdown({ ...t, returnBillable: true })).toMatchObject({ billable: 1630 });
  });
  it('reposicionamiento suma recorrido, no facturación', () => {
    expect(kmBreakdown({ ...base().trip, repositioningKm: 40 })).toMatchObject({ driven: 855, billable: 815, empty: 40 });
  });
});

describe('costos y precio', () => {
  it('combustible = km / rendimiento × precio; cargado y vacío por separado', () => {
    const i = base();
    i.trip.tripType = 'redondo';
    const e = evaluate(i, 0);
    expect(e.costs.fuelLoaded).toBe(815_000); // 815/2 × $20
    expect(e.costs.fuelEmpty).toBe(652_000); // 815/2.5 × $20
  });

  it('tarifas por km generan el flete exacto en centavos', () => {
    const i = base();
    i.scenarios = defaultScenarios(i.pricing);
    const q = computeKmQuote(i);
    expect(q.scenarios.filter((s) => s.kind === 'tarifa').map((s) => s.freight / 100)).toEqual([48_900, 49_715, 50_530, 51_345, 52_975]);
  });

  it('cargos fijos y porcentuales: base explícita, costo vs comercial, IVA', () => {
    const i = base();
    i.charges = [
      { id: 'a', name: 'Maniobras', type: 'fijo', value: 250_000, base: 'flete', classification: 'comercial', taxable: true, billToClient: true },
      { id: 'b', name: 'Custodia', type: 'fijo', value: 300_000, base: 'flete', classification: 'costo', taxable: true, billToClient: true },
      { id: 'c', name: 'Comisión agente', type: 'porcentaje', value: 5, base: 'flete', classification: 'costo', taxable: false, billToClient: false },
      { id: 'd', name: 'Seguro adicional', type: 'porcentaje', value: 1, base: 'flete', classification: 'comercial', taxable: false, billToClient: true },
    ];
    const e = evaluate(i, 5_000_000);
    expect(e.subtotal).toBe(5_000_000 + 250_000 + 300_000 + 50_000);
    expect(e.taxableBase).toBe(5_550_000);
    expect(e.tax).toBe(888_000);
    expect(e.costs.costCharges).toBe(300_000 + 250_000);
    expect(e.total).toBe(e.subtotal + e.tax);
  });

  it('operador por porcentaje del flete y viáticos', () => {
    const i = base();
    i.costs = { ...i.costs, operatorModel: 'porcentaje', operatorPct: 12, operatorPerDiem: 80_000 };
    const e = evaluate(i, 5_200_000);
    expect(e.costs.operator).toBe(624_000 + 80_000);
  });

  it('margen sobre venta y markup sobre costo (ejemplo del requerimiento)', () => {
    const i = base();
    i.costs = { ...i.costs, dieselPerLiter: 0, fixedCosts: [{ name: 'Costo operativo de ejemplo', amount: 3_000_000 }] };
    const e = evaluate(i, 5_200_000);
    expect(e.surplus).toBe(2_200_000);
    expect(e.marginPct).toBeCloseTo(42.3077, 3);
    expect(e.markupPct).toBeCloseTo(73.3333, 3);
  });

  it('retención de IVA reduce el total a pagar', () => {
    const i = base();
    i.pricing.retentionPct = 4;
    const e = evaluate(i, 5_200_000);
    expect(e.tax).toBe(832_000);
    expect(e.retention).toBe(208_000);
    expect(e.total).toBe(5_200_000 + 832_000 - 208_000);
  });

  it('redondeo comercial', () => {
    expect(roundCommercial(4_971_500, 10_000, 'cercano')).toBe(4_970_000);
    expect(roundCommercial(4_971_500, 10_000, 'arriba')).toBe(4_980_000);
    expect(roundCommercial(4_971_500, 10_000, 'ninguno')).toBe(4_971_500);
  });

  it('margen objetivo resuelto aunque el operador cobre un % del flete (sin circularidad)', () => {
    const i = base();
    i.costs = { ...i.costs, operatorModel: 'porcentaje', operatorPct: 10, commissionPct: 2 };
    const f = freightForMargin(i, 30)!;
    expect(evaluate(i, f).marginPct).toBeGreaterThanOrEqual(30);
    expect(evaluate(i, f - 1).marginPct).toBeLessThan(30);
  });

  it('margen imposible cuando los costos proporcionales absorben todo', () => {
    const i = base();
    i.costs = { ...i.costs, operatorModel: 'porcentaje', operatorPct: 80 };
    expect(freightForMargin(i, 30)).toBeNull();
  });

  it('regreso vacío en viaje sencillo: análisis interno sin cobrarlo', () => {
    const i = base();
    i.trip.evaluateEmptyReturn = true;
    const e = evaluate(i, 5_200_000);
    expect(e.subtotal).toBe(5_200_000);
    expect(e.emptyReturn!.cost).toBe(652_000);
    expect(e.emptyReturn!.surplusAfter).toBe(e.surplus - 652_000);
  });
});

describe('escenarios y recomendación', () => {
  it('sin rentabilidad: advertencia de pérdida y sin recomendación válida', () => {
    const i = base();
    i.costs.fixedCosts = [{ name: 'Costo alto', amount: 10_000_000 }];
    i.scenarios = defaultScenarios(i.pricing).filter((s) => s.kind === 'tarifa');
    const q = computeKmQuote(i);
    expect(q.scenarios.every((s) => s.warnings.some((w) => w.code === 'perdida'))).toBe(true);
    expect(q.recommendationMeetsObjectives).toBe(false);
  });

  it('recomienda la más competitiva que cumple objetivos, no la más cara', () => {
    const i = base();
    // Costo total 34,800 (8,150 de diésel + 26,650 fijo): a $60/km no llega al 30%, a $61/km sí.
    i.costs.fixedCosts = [{ name: 'Costo', amount: 2_665_000 }];
    i.pricing.targetMarginPct = 30;
    i.scenarios = defaultScenarios(i.pricing).filter((s) => s.kind === 'tarifa');
    const q = computeKmQuote(i);
    const rec = q.scenarios.find((s) => s.id === q.recommendedId)!;
    expect(rec.meetsObjectives).toBe(true);
    expect(q.scenarios.filter((s) => s.meetsObjectives).every((s) => s.subtotal >= rec.subtotal)).toBe(true);
    expect(q.bestMarginId).toBe('t5');
    expect(q.cheapestId).toBe('t1');
    expect(rec.id).toBe('t2');
  });

  it('precio fijo de referencia ($52,000 + IVA) y su tarifa efectiva', () => {
    const i = base();
    i.scenarios = [{ id: 'ref', label: 'Referencia', kind: 'precio', freight: 5_200_000 }];
    const s = computeKmQuote(i).scenarios[0];
    expect(s.subtotal).toBe(5_200_000);
    expect(s.tax).toBe(832_000);
    expect(s.effectiveRate).toBe(6380);
  });

  it('sin km facturables no hay recomendación', () => {
    const i = base();
    i.trip.outboundKm = 0;
    i.scenarios = defaultScenarios(i.pricing);
    const q = computeKmQuote(i);
    expect(q.recommendedId).toBeNull();
    expect(q.warnings.map((w) => w.code)).toContain('km');
  });

  it('advierte capacidad excedida', () => {
    const i = base();
    i.cargo.weightTons = 35;
    i.cargo.pallets = 30;
    const codes = computeKmQuote(i).warnings.map((w) => w.code);
    expect(codes).toContain('peso');
    expect(codes).toContain('pallets');
  });
});
