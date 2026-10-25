<script setup lang="ts">
// Desglose del flete calculado en vivo con el mismo motor que usa el servidor.
import { AlertTriangle } from 'lucide-vue-next';
import { computed } from 'vue';
import { computeFreight, EMPTY_KEYS, type CostParams, type EmptyKey, type FreightInput, type RouteInput } from '../../../shared/costing/index.ts';
import { duration, money, num } from '../../../shared/format.ts';
import NumField from './NumField.vue';

const props = defineProps<{ params: CostParams & { warnings?: string[] }; route: RouteInput; cargoTypes: { name: string; surchargePct: number }[]; prefs?: any; isAdmin?: boolean }>();
const input = defineModel<FreightInput>('input', { required: true });
const r = computed(() => computeFreight(props.params, props.route, input.value));
const locked = (k: string) => !!props.prefs && !props.isAdmin && props.prefs[k] === false;

const EMPTY_LABELS: Record<EmptyKey, string> = {
  combustible: 'Combustible', neumaticos: 'Neumáticos', mantenimiento: 'Mantenimiento', depreciacion: 'Depreciación',
  fijosGenerales: 'Gastos fijos generales', fijosEspecificos: 'Gastos fijos específicos', equipamiento: 'Equipamiento', capital: 'Costo de capital',
};
function setCargo(name: string) {
  input.value.cargoType = name;
  input.value.cargoSurchargePct = props.cargoTypes.find((c) => c.name === name)?.surchargePct ?? 0;
}
defineExpose({ result: r });
</script>

<template>
  <div class="space-y-3 text-[13px]">
    <div class="flex flex-wrap items-center gap-4 rounded-md bg-muted/50 px-3 py-2">
      <span>Veh: <b class="text-text-highlighted">{{ params.vehicle.name }}</b></span>
      <span>Dist: <b class="text-text-highlighted">{{ num(r.time.kmTotal, 1) }} km</b></span>
      <span>T: <b class="text-text-highlighted">{{ duration(r.time.drivingSeconds) }}</b></span>
    </div>
    <div v-if="params.warnings?.length" class="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-warning">
      <div v-for="w in params.warnings" :key="w" class="flex gap-1.5"><AlertTriangle class="mt-0.5 size-3.5 shrink-0" />{{ w }}</div>
    </div>
    <div class="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      <div class="space-y-3">
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-2">Tiempo del servicio</h3>
          <div class="kv"><span>Manejando</span><span>{{ duration(r.time.drivingSeconds) }}</span></div>
          <div class="kv"><span>Paradas programadas</span><span>{{ duration(r.time.waitSeconds) }}</span></div>
          <div class="kv"><span>Descanso obligatorio ({{ r.time.rests }})</span><span>{{ duration(r.time.restSeconds) }}</span></div>
          <div class="kv"><span>Llenando combustible ({{ r.time.refuels }})</span><span>{{ duration(r.time.refuelSeconds) }}</span></div>
          <div class="kv border-t border-line pt-1 font-semibold"><span>Total servicio</span><span>{{ duration(r.time.serviceHours * 3600) }}</span></div>
        </section>
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-2">Combustible</h3>
          <div class="grid grid-cols-2 gap-2">
            <NumField v-model="input.kmPerLiterLoaded" label="Rendimiento cargado (km/L)" :min="0" />
            <NumField v-model="input.kmPerLiterEmpty" label="Rendimiento vacío (km/L)" :min="0" />
            <NumField v-model="input.fuelPricePerLiter" label="Precio por litro" prefix="$" class="col-span-2" :min="0" />
          </div>
          <div class="kv mt-2"><span>Km cargado / vacío</span><span>{{ num(r.time.kmLoaded) }} km / {{ num(r.time.kmEmpty) }} km</span></div>
          <div class="kv"><span>Litros cargado / vacío</span><span>{{ num(r.time.litersLoaded) }} L / {{ num(r.time.litersEmpty) }} L</span></div>
          <div class="kv"><span>Ralentí ({{ num(r.time.idleHours) }}h · {{ params.vehicle.idleLitersPerHour }} L/h)</span><span>{{ num(r.time.idleLiters) }} L</span></div>
          <div class="kv border-t border-line pt-1 font-semibold"><span>Costo combustible</span><span>{{ money(r.loaded.combustible + r.empty.combustible) }}</span></div>
        </section>
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-2">Neumáticos y mantenimiento</h3>
          <div v-for="[k, l] in [['steer', 'Dirección'], ['drive', 'Tracción'], ['trailer', 'Arrastre']]" :key="k" class="kv">
            <span>{{ l }} <small class="text-text-dimmed">{{ params.vehicle.tires[k as 'steer'].qty }} u · {{ money(params.vehicle.tires[k as 'steer'].unitPrice) }} · VU {{ num(params.vehicle.tires[k as 'steer'].lifeKm, 0) }} km</small></span>
          </div>
          <div class="kv"><span>Costo total por km</span><span>{{ money(r.tirePerKm) }}/km</span></div>
          <div class="kv font-semibold"><span>Neumáticos ruta</span><span>{{ money(r.loaded.neumaticos + r.empty.neumaticos) }}</span></div>
          <div class="kv mt-1 border-t border-line pt-1"><span>Mantenimiento ({{ money(params.vehicle.maintenanceCost) }} c/{{ num(params.vehicle.maintenanceIntervalKm, 0) }} km)</span><span>{{ money(r.loaded.mantenimiento + r.empty.mantenimiento) }}</span></div>
        </section>
      </div>

      <div class="space-y-3">
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-2">Con utilidad (cliente)</h3>
          <div class="kv"><span>Km cargados</span><span>{{ num(r.time.kmLoaded, 3) }} km</span></div>
          <div class="kv"><span>Horas con cliente</span><span>{{ num(r.time.clientHours) }} hr</span></div>
          <div class="kv"><span>Combustible (cargado + ralentí)</span><span>{{ money(r.loaded.combustible) }}</span></div>
          <div class="kv"><span>Neumáticos (cargado)</span><span>{{ money(r.loaded.neumaticos) }}</span></div>
          <div class="kv"><span>Mantenimiento (cargado)</span><span>{{ money(r.loaded.mantenimiento) }}</span></div>
          <div class="kv"><span>Depreciación (cargado)</span><span>{{ money(r.loaded.depreciacion) }}</span></div>
          <div class="kv"><span>Descanso operador</span><span>{{ money(r.loaded.descanso) }}</span></div>
          <div class="kv"><span>Gastos fijos generales</span><span>{{ money(r.loaded.fijosGenerales) }}</span></div>
          <div class="kv"><span>Gastos fijos específicos</span><span>{{ money(r.loaded.fijosEspecificos) }}</span></div>
          <div class="kv"><span>Equipamiento</span><span>{{ money(r.loaded.equipamiento) }}</span></div>
          <div class="kv"><span>Costo de capital</span><span>{{ money(r.loaded.capital) }}</span></div>
          <div class="kv border-t border-line pt-1 font-semibold"><span>Subtotal</span><span>{{ money(r.loaded.total) }}</span></div>
          <div class="kv"><span>Peajes <small class="text-text-dimmed">pass-through · sin utilidad</small></span><span>{{ money(r.tolls) }}</span></div>
        </section>
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-2">Pago al operador</h3>
          <div class="grid grid-cols-2 gap-2">
            <label class="field col-span-2"><span>Modalidad</span>
              <select v-model="input.driverPay.method" class="input" :disabled="locked('driverPayEditable')">
                <option value="none">Sin pago variable</option><option value="per_km">Por kilómetro</option><option value="per_hour">Por hora</option>
                <option value="percent_net">Comisión sobre neto</option><option value="percentage">Comisión sobre utilidad</option>
              </select>
            </label>
            <template v-if="input.driverPay.method === 'per_km'"><NumField v-model="input.driverPay.perKmLoaded" label="$/km cargado" prefix="$" /><NumField v-model="input.driverPay.perKmEmpty" label="$/km vacío" prefix="$" /></template>
            <template v-if="input.driverPay.method === 'per_hour'"><NumField v-model="input.driverPay.perHourLoaded" label="$/h con cliente" prefix="$" /><NumField v-model="input.driverPay.perHourEmpty" label="$/h vacío" prefix="$" /></template>
            <NumField v-if="input.driverPay.method === 'percent_net'" v-model="input.driverPay.percentNet" label="% sobre costo neto" suffix="%" />
            <NumField v-if="input.driverPay.method === 'percentage'" v-model="input.driverPay.percentage" label="% sobre utilidad" suffix="%" />
            <NumField v-model="input.driverPay.operators" label="Operadores" :min="1" :step="1" />
            <label class="col-span-2 flex items-center gap-2"><input v-model="input.driverPay.applyMargin" type="checkbox" :disabled="locked('driverPayEditable')" /> Aplicar utilidad sobre el pago al operador</label>
          </div>
          <div class="kv mt-2 font-semibold"><span>Pago en costo</span><span>{{ money(r.driverPay.inCost) }}</span></div>
          <p v-if="input.driverPay.method === 'percentage'" class="text-xs text-text-dimmed">Comisión estimada {{ money(r.driverPay.profitCommission) }}: se paga de la utilidad y no aumenta el precio.</p>
        </section>
      </div>

      <div class="space-y-3">
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-2">Tramos vacíos</h3>
          <div class="kv"><span>Km vacíos {{ num(r.time.kmEmpty) }} km</span><span>Horas vacío {{ num(r.time.emptyHours) }} hr</span></div>
          <div class="mb-1 flex gap-3 text-xs text-text-dimmed"><span>☑ Cobrar</span><span>☑ Utilidad</span></div>
          <div v-for="k in EMPTY_KEYS" :key="k" class="flex items-center gap-2 py-0.5">
            <input v-model="input.chargeEmpty[k]" type="checkbox" :aria-label="`Cobrar ${EMPTY_LABELS[k]} vacío`" />
            <input v-model="input.profitOnEmpty[k]" type="checkbox" :disabled="!input.chargeEmpty[k]" :aria-label="`Utilidad sobre ${EMPTY_LABELS[k]} vacío`" />
            <span class="flex-1 text-text-muted">{{ EMPTY_LABELS[k] }} (vacío)</span>
            <span class="num" :class="input.chargeEmpty[k] ? '' : 'text-text-dimmed line-through'">{{ money(r.empty[k]) }}</span>
          </div>
          <div class="kv border-t border-line pt-1 font-semibold"><span>Total tramos vacíos (a costo)</span><span>{{ money(r.empty.total) }}</span></div>
          <div v-if="r.emptyNotCharged > 0.005" class="kv text-warning"><span>Vacío no cobrado (lo absorbe la empresa)</span><span>{{ money(r.emptyNotCharged) }}</span></div>
        </section>
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-2">Carga y otros gastos</h3>
          <div class="grid grid-cols-3 gap-2">
            <label class="field col-span-2"><span>Tipo de carga</span>
              <select :value="input.cargoType" class="input" :disabled="locked('cargoTypeEditable')" @change="setCargo(($event.target as HTMLSelectElement).value)"><option v-for="c in cargoTypes" :key="c.name">{{ c.name }}</option></select>
            </label>
            <NumField v-model="input.cargoSurchargePct" label="Aumento" suffix="%" :min="0" />
            <NumField v-model="input.tons" label="Toneladas" :min="0" />
          </div>
          <div class="mt-2 text-xs uppercase text-text-muted">Otros gastos</div>
          <div v-for="(e, i) in input.otherExpenses" :key="i" class="mt-1 grid grid-cols-[1fr_7rem_auto_auto] items-center gap-1.5">
            <input v-model="e.name" class="input" placeholder="Maniobra, pensión…" />
            <NumField v-model="e.amount" prefix="$" />
            <label class="flex items-center gap-1 text-xs"><input v-model="e.applyMargin" type="checkbox" />Utilidad</label>
            <button type="button" class="btn-danger px-1.5" aria-label="Quitar gasto" @click="input.otherExpenses.splice(i, 1)">×</button>
          </div>
          <button type="button" class="btn-ghost mt-1 px-2 py-0.5 text-primary" @click="input.otherExpenses.push({ name: '', amount: 0, applyMargin: false })">+ Agregar gasto</button>
        </section>
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-2">Total</h3>
          <div class="kv"><span>Gasto total cargado</span><span>{{ money(r.loaded.total) }}</span></div>
          <div class="kv"><span>Gasto total vacío cobrado</span><span>{{ money(r.emptyCharged) }}</span></div>
          <div class="kv"><span>Peajes (pass-through)</span><span>{{ money(r.tolls) }}</span></div>
          <div class="kv"><span>Pago al operador</span><span>{{ money(r.driverPay.inCost) }}</span></div>
          <div class="kv border-t border-line pt-1 font-semibold"><span>Costo total del viaje</span><span>{{ money(r.tripCost) }}</span></div>
          <div class="kv"><span>Otros gastos</span><span>{{ money(r.otherExpenses) }}</span></div>
          <div class="kv font-semibold"><span>Gasto total</span><span>{{ money(r.totalExpense) }}</span></div>
          <div class="mt-2 grid grid-cols-3 gap-2">
            <NumField v-model="input.profitPct" label="Utilidad %" suffix="%" :disabled="locked('profitEditable')" />
            <NumField v-model="input.financingPct" label="Financiamiento %" suffix="%" :min="0" :max="100" :disabled="locked('financingEditable')" />
            <NumField v-model="input.taxPct" label="IVA %" suffix="%" :min="0" :max="100" :disabled="locked('taxEditable')" />
          </div>
          <div class="kv mt-2"><span>Utilidad $</span><span>{{ money(r.profit) }}</span></div>
          <div class="kv"><span>Financiamiento $</span><span>{{ money(r.financing) }}</span></div>
          <div class="kv"><span>Aumento por carga ({{ r.cargoSurchargePct }}%)</span><span>{{ money(r.cargoSurcharge) }}</span></div>
          <div class="kv font-semibold"><span>Subtotal cliente</span><span>{{ money(r.subtotal) }}</span></div>
          <div class="kv"><span>IVA $</span><span>{{ money(r.tax) }}</span></div>
          <div class="mt-1 flex items-center justify-between border-t border-line pt-2 text-base font-semibold"><span>Total con IVA</span><span class="num text-primary">{{ money(r.total) }}</span></div>
          <div class="kv text-xs"><span>Por tonelada: {{ money(r.pricePerTon) }}</span><span>Por km: {{ money(r.pricePerKm) }}</span></div>
        </section>
      </div>
    </div>
  </div>
</template>
