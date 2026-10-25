<script setup lang="ts">
// Renta/disposición: disponibilidad fija + uso variable, con el motor compartido.
import { computed } from 'vue';
import { computeRental, type CostParams, type RentalInput } from '../../../shared/costing/index.ts';
import { money, num } from '../../../shared/format.ts';
import NumField from './NumField.vue';

const props = defineProps<{ params: CostParams; routeKm: number; routeTolls: number; routeHours: number }>();
const input = defineModel<RentalInput>('input', { required: true });
const trips = defineModel<{ useRoute: boolean; value: number; unit: 'day' | 'week' | 'month' }>('trips', { required: true });

// Km por día derivados del recorrido representativo: viajes por día limitados por las horas facturables.
const derived = computed(() => {
  const days = input.value.workDaysPerYear || 312;
  const perDay = trips.value.unit === 'day' ? trips.value.value : trips.value.unit === 'week' ? trips.value.value / (days / 52) : trips.value.value / (days / 12);
  const requested = props.routeKm * perDay;
  const capacity = props.routeHours > 0 ? props.routeKm * ((input.value.billableHoursPerDay || 8) / props.routeHours) : Infinity;
  return { kmPerDay: Math.min(requested, capacity), limited: Number.isFinite(capacity) && requested > capacity + 0.5, tollsPerKm: props.routeKm > 0 ? props.routeTolls / props.routeKm : 0 };
});
const effective = computed<RentalInput>(() =>
  trips.value.useRoute && props.routeKm > 0 ? { ...input.value, kmPerDay: derived.value.kmPerDay, tollsPerKm: derived.value.tollsPerKm } : { ...input.value, tollsPerKm: 0 },
);
const r = computed(() => computeRental(props.params, effective.value));
const unitWord = computed(() => ({ hour: 'hora', shift: 'jornada', day: 'día', week: 'semana', month: 'mes', flat: 'mes' })[input.value.unit]);
defineExpose({ result: r, effective });
</script>

<template>
  <div class="grid gap-3 text-[13px] xl:grid-cols-[18rem_1fr_1fr]">
    <section class="card space-y-2 p-3">
      <h3 class="card-head -mx-3 -mt-3 mb-2">Modo de cobro</h3>
      <div class="grid grid-cols-2 gap-2">
        <select v-model="input.unit" class="input" aria-label="Modo de cobro">
          <option value="hour">Por hora</option><option value="shift">Jornada</option><option value="day">Día</option><option value="week">Semana</option><option value="month">Mensual</option><option value="flat">Renta fija</option>
        </select>
        <NumField v-model="input.quantity" :min="0" suffix="u" />
      </div>
      <NumField v-if="input.unit === 'shift'" v-model="input.hoursPerShift" label="Horas por jornada" />
      <template v-if="input.unit === 'flat'">
        <select v-model="input.flatMode" class="input" aria-label="Tipo de renta fija"><option value="monthly">Por mes</option><option value="contract">Por contrato</option></select>
        <NumField v-model="input.flatPrice" :label="input.flatMode === 'contract' ? 'Monto del contrato' : 'Precio por mes'" prefix="$" hint="Precio cerrado; el sistema calcula el margen contra el costo." />
        <button type="button" class="btn-ghost px-2 py-0.5 text-primary" @click="input.flatPrice = Math.round(r.suggestedFlatPrice * 100) / 100">Usar precio sugerido ({{ money(r.suggestedFlatPrice) }})</button>
      </template>
      <p class="text-xs text-text-dimmed">{{ num(r.span.operatingDays, 1) }} días operativos · {{ num(r.span.billableHours, 0) }} h facturables ({{ input.billableHoursPerDay }} h/día, {{ input.workDaysPerYear }} días/año).</p>
      <h4 class="pt-2 text-xs uppercase text-text-muted">Recorrido representativo</h4>
      <label class="flex items-center gap-2"><input v-model="trips.useRoute" type="checkbox" :disabled="!routeKm" />Km/día de la ruta del flete ({{ num(routeKm, 1) }} km)</label>
      <div v-if="trips.useRoute && routeKm" class="grid grid-cols-2 gap-2">
        <NumField v-model="trips.value" label="Frecuencia (viajes)" :min="0" />
        <label class="field"><span>&nbsp;</span><select v-model="trips.unit" class="input"><option value="day">por día</option><option value="week">por semana</option><option value="month">por mes</option></select></label>
        <p class="col-span-2 text-xs" :class="derived.limited ? 'text-warning' : 'text-text-dimmed'">{{ num(derived.kmPerDay, 1) }} km/día{{ derived.limited ? ' (limitado por horas facturables)' : '' }}</p>
      </div>
      <NumField v-else v-model="input.kmPerDay" label="Km por día operado" :min="0" />
      <label class="flex items-center gap-2"><input v-model="input.kmCapEnabled" type="checkbox" />Tope de km incluidos (km/mes)</label>
      <div v-if="input.kmCapEnabled" class="grid grid-cols-2 gap-2"><NumField v-model="input.kmIncludedPerMonth" label="Km incluidos/mes" /><NumField v-model="input.excessSurchargePct" label="Recargo excedente" suffix="%" /></div>
      <label class="field"><span>Combustible</span><select v-model="input.fuelMode" class="input"><option value="client">Cliente pone diésel</option><option value="included">Incluye combustible</option></select></label>
      <label class="field"><span>Casetas</span><select v-model="input.tollsMode" class="input"><option value="client">Cliente paga</option><option value="included">Incluidas</option></select></label>
      <NumField v-model="input.operatorMonthly" label="Sueldo operador / mes" prefix="$" />
      <NumField v-model="input.operatorCount" label="Operadores (turnos)" :min="1" />
    </section>

    <section class="card p-3">
      <h3 class="card-head -mx-3 -mt-3 mb-2">Disponibilidad (fijo)</h3>
      <div class="text-xs uppercase text-text-dimmed">Estructura (calendario) · {{ num(r.periodFactor * 100) }}% del año</div>
      <div class="kv"><span>Gastos fijos generales <small>({{ money(r.availability.general.annual) }}/año)</small></span><span>{{ money(r.availability.general.amount) }}</span></div>
      <div class="kv"><span>Gastos fijos específicos <small>({{ money(r.availability.specific.annual) }}/año)</small></span><span>{{ money(r.availability.specific.amount) }}</span></div>
      <div class="kv"><span>Equipamiento <small>({{ money(r.availability.equipment.annual) }}/año)</small></span><span>{{ money(r.availability.equipment.amount) }}</span></div>
      <div class="kv font-semibold"><span>Subtotal estructura</span><span>{{ money(r.availability.structure) }}</span></div>
      <div class="mt-2 text-xs uppercase text-text-dimmed">Depreciación · lo que ocurra primero (calendario o km)</div>
      <div class="grid grid-cols-2 gap-2 py-1"><NumField v-model="input.salvagePct" label="Rescate" suffix="%" /><NumField v-model="input.interestPct" label="Tasa de capital" suffix="% anual" /></div>
      <div v-for="d in r.availability.depreciation" :key="d.name" class="kv">
        <span>{{ d.name }} <small class="uppercase">{{ d.basis }}</small><br /><small class="text-text-dimmed">{{ money(d.depreciable) }} (−{{ input.salvagePct }}% resc.) · {{ d.lifeYears }} años · {{ money(d.annual) }}/año</small></span>
        <span>{{ money(d.amount) }}</span>
      </div>
      <div class="kv"><span>Costo de capital <br /><small class="text-text-dimmed">Capital prom. {{ money(r.availability.capitalBase) }} × {{ input.interestPct }}%/año × {{ num(r.periodFactor * 100) }}% del año</small></span><span>{{ money(r.availability.capitalCost) }}</span></div>
      <div class="kv"><span>Operador</span><span>{{ money(r.availability.operatorCost) }}</span></div>
      <div class="kv border-t border-line pt-1 font-semibold"><span>Total disponibilidad</span><span>{{ money(r.availability.total) }}</span></div>
    </section>

    <div class="space-y-3">
      <section class="card p-3">
        <h3 class="card-head -mx-3 -mt-3 mb-2">Uso ({{ num(r.usage.kmPeriod, 0) }} km {{ r.usage.capOn ? 'incluidos' : 'estimados' }})</h3>
        <div class="kv"><span>Combustible {{ input.fuelMode === 'client' ? '(lo pone el cliente)' : '' }}<br /><small class="text-text-dimmed">{{ num(r.usage.kmPeriod, 0) }} km · {{ num(r.usage.kmPerLiter) }} km/L · {{ money(r.usage.fuelPrice) }}/L · {{ num(r.usage.liters, 0) }} L</small></span><span>{{ money(r.usage.fuel) }}</span></div>
        <div v-for="a in r.usage.axles" :key="a.name" class="kv"><span>{{ a.name }} <small class="text-text-dimmed">{{ a.qty }} u · {{ money(a.unitPrice) }} · VU {{ num(a.lifeKm, 0) }} km</small></span><span>{{ money(a.costPerKm) }}/km</span></div>
        <div class="kv"><span>Llantas ({{ money(r.usage.tiresPerKm) }}/km × {{ num(r.usage.kmPeriod, 0) }} km)</span><span>{{ money(r.usage.tires) }}</span></div>
        <div class="kv"><span>Mantenimiento</span><span>{{ money(r.usage.maintenance) }}</span></div>
        <div class="kv border-t border-line pt-1 font-semibold"><span>Total uso</span><span>{{ money(r.usage.total) }}</span></div>
      </section>
      <section class="card p-3">
        <h3 class="card-head -mx-3 -mt-3 mb-2">Precio</h3>
        <div class="kv"><span>Costo base (disponibilidad + uso)</span><span>{{ money(r.costBase) }}</span></div>
        <div v-if="input.unit !== 'flat'" class="grid grid-cols-2 items-end gap-2"><NumField v-model="input.profitPct" label="Utilidad" suffix="%" /><div class="kv"><span></span><span>{{ money(r.profit) }}</span></div></div>
        <div class="kv"><span>Peajes</span><span>{{ input.tollsMode === 'client' ? 'Las paga el cliente' : money(r.tolls) }}</span></div>
        <NumField v-model="input.otherExpenses" label="Otros gastos" prefix="$" />
        <div v-if="input.unit === 'flat'" class="kv" :class="r.flatMargin >= 0 ? 'text-success' : 'text-error'"><span>Margen del periodo</span><span>{{ money(r.flatMargin) }}</span></div>
        <div class="kv font-semibold"><span>Subtotal ({{ input.quantity }} {{ unitWord }})</span><span>{{ money(r.periodSubtotal) }}</span></div>
        <NumField v-model="input.taxPct" label="IVA %" suffix="%" />
        <div class="kv"><span>IVA</span><span>{{ money(r.tax) }}</span></div>
        <div class="mt-1 flex items-center justify-between border-t border-line pt-2 text-base font-semibold"><span>Total con IVA</span><span class="num text-primary">{{ money(r.total) }}</span></div>
        <div class="kv text-xs"><span>Por {{ unitWord }}</span><span>{{ money(r.unitSubtotal) }}</span></div>
        <template v-if="input.kmCapEnabled">
          <div class="kv text-xs"><span>Km excedente (+{{ r.excess.surchargePct }}%)</span><span>{{ money(r.excess.perKm) }}/km</span></div>
          <div class="kv text-xs"><span>Excedente esperado ({{ num(r.excess.kmExcessExpected, 0) }} km)</span><span>{{ money(r.excess.expectedCharge) }}</span></div>
        </template>
      </section>
    </div>
  </div>
</template>
