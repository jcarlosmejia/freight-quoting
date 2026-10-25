<script setup lang="ts">
import { Plus, Save, Trash2, X } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { annualizeSpecific, averageCapital, equipmentAnnual, round2, SPECIFIC_PERIOD_LABELS } from '../../../shared/costing/index.ts';
import { money } from '../../../shared/format.ts';
import NumField from '../components/NumField.vue';
import { api } from '../lib/api.ts';
import { can, fail, toast } from '../lib/session.ts';

const route = useRoute();
const router = useRouter();
const id = computed(() => (route.params.id ? Number(route.params.id) : null));
const v = ref<any>({
  name: '', class_code: '', description: '', category_id: null, value: 0, life_km: 0, life_years: 0, salvage_pct: 0, capital_rate_pct: 0,
  tires_steer_qty: 2, tires_steer_life_km: 0, tires_steer_price: 0, tires_drive_qty: 0, tires_drive_life_km: 0, tires_drive_price: 0, tires_trailer_qty: 0, tires_trailer_life_km: 0, tires_trailer_price: 0,
  km_per_liter_loaded: 0, km_per_liter_empty: 0, fuel_price: 0, tank_liters: 0, refill_minutes: 0, idle_lph: 0, break_every_hours: 0, break_duration_hours: 0, break_cost: 0,
  unit_type: null, length_ft: 0, max_pallets: 0, axles: 0,
  maintenance_interval_km: 0, maintenance_cost: 0, driver_pay_km_loaded: 0, driver_pay_km_empty: 0, driver_pay_hour: 0, driver_pay_route_pct: 0, driver_pay_monthly: 0,
  height_m: null, width_m: null, length_m: null, weight_tons: null, tons_capacity: 0,
  assets: [], expenses: [], equipment: [],
});
const categories = ref<any[]>([]);
const catalog = ref<any[]>([]);
const summary = ref<any>(null);
const pickEquipment = ref<number | null>(null);
const readOnly = computed(() => !can(id.value ? 'modificar:vehiculo' : 'agregar:vehiculo'));

onMounted(async () => {
  try {
    [categories.value, catalog.value, summary.value] = await Promise.all([api.get('/fleet-categories'), api.get('/equipment'), api.get('/fleet-summary')]);
    if (id.value) v.value = await api.get(`/vehicles/${id.value}`);
  } catch (e) {
    fail(e);
  }
});

const cat = computed(() => categories.value.find((c) => c.id === v.value.category_id));
const unitHours = computed(() => (cat.value ? cat.value.days_per_year * cat.value.hours_per_day : 0));
const specificAnnual = computed(() => v.value.expenses.reduce((s: number, e: any) => s + annualizeSpecific(Number(e.amount) || 0, e.period, cat.value?.days_per_year ?? 0), 0));
const specificPerHour = computed(() => (unitHours.value ? round2(specificAnnual.value / unitHours.value) : 0));
const eqAnnual = computed(() => v.value.equipment.reduce((s: number, e: any) => s + equipmentAnnual(Number(e.qty) || 0, Number(e.unit_price) || 0, Number(e.life_years) || 0, Number(e.life_months) || 0), 0));
const capital = computed(() => {
  const profile: any = { value: Number(v.value.value) || 0, salvagePct: Number(v.value.salvage_pct) || 0, assets: [] };
  const avg = averageCapital(profile);
  return { salvage: profile.value * (profile.salvagePct / 100), depreciable: profile.value * (1 - profile.salvagePct / 100), avg, annual: avg * ((Number(v.value.capital_rate_pct) || 0) / 100) };
});

function addEquipment() {
  const e = catalog.value.find((x) => x.id === pickEquipment.value);
  if (!e) return;
  v.value.equipment.push({ equipment_id: e.id, name: e.name, unit_price: e.unit_price, qty: 1, life_years: 1, life_months: 0 });
  pickEquipment.value = null;
}

async function save() {
  try {
    const { id: _i, created_at, updated_at, company_id, archived, ...payload } = v.value;
    const saved = id.value ? await api.patch(`/vehicles/${id.value}`, payload) : await api.post('/vehicles', payload);
    toast('Perfil guardado');
    if (!id.value) router.replace(`/admin/vehicles/${saved.id}/edit`);
    else v.value = saved;
  } catch (e) {
    fail(e);
  }
}

const tireRows = [
  { label: 'Direccionales', k: 'steer' },
  { label: 'Motrices', k: 'drive' },
  { label: 'Arrastre', k: 'trailer' },
];
</script>

<template>
  <div class="p-4">
    <div class="mb-3 flex items-center gap-2">
      <RouterLink to="/admin/vehicles" class="btn-ghost">Listado</RouterLink>
      <div class="ml-auto flex gap-2">
        <RouterLink to="/admin/vehicles" class="btn-soft">Cancelar</RouterLink>
        <button v-if="!readOnly" class="btn-primary" @click="save"><Save class="size-4" />{{ id ? 'Guardar edición' : 'Guardar perfil' }}</button>
      </div>
    </div>
    <fieldset :disabled="readOnly" class="grid gap-3 xl:grid-cols-[2fr_1fr_1fr]">
      <div class="space-y-3">
        <div class="grid gap-3 md:grid-cols-3">
          <label class="field md:col-span-1"><span>Nombre *</span><input v-model="v.name" class="input" required /></label>
          <label class="field"><span>Clase vehicular (casetas)</span><input v-model="v.class_code" class="input" placeholder="T3-S2" /></label>
          <label class="field"><span>Descripción</span><input v-model="v.description" class="input" /></label>
        </div>
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-3">Cotización por km</h3>
          <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
            <label class="field"><span>Tipo de unidad</span><select v-model="v.unit_type" class="input"><option :value="null">No aplica</option><option value="plataforma">Plataforma / plana</option><option value="caja_seca">Caja seca</option></select></label>
            <NumField v-model="v.length_ft" label="Largo (pies)" />
            <NumField v-model="v.max_pallets" label="Capacidad (pallets)" />
            <NumField v-model="v.axles" label="Ejes" />
          </div>
          <p class="mt-1 text-xs text-text-dimmed">La capacidad en toneladas es “Capacidad de carga”. Las tarifas por km de cada tipo se configuran en Configuración → Tarifas por km.</p>
        </section>
        <div class="grid gap-3 md:grid-cols-2">
          <section class="card p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-3">Dimensiones y peso</h3>
            <div class="grid grid-cols-2 gap-2">
              <NumField v-model="v.height_m" label="Alto (m)" /><NumField v-model="v.width_m" label="Ancho (m)" />
              <NumField v-model="v.length_m" label="Largo (m)" /><NumField v-model="v.weight_tons" label="Peso (ton)" />
              <NumField v-model="v.tons_capacity" label="Capacidad de carga (ton)" suffix="ton" />
            </div>
          </section>
          <section class="card p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-3">Valor del vehículo</h3>
            <div class="grid grid-cols-2 gap-2">
              <NumField v-model="v.value" label="Valor ($)" prefix="$" class="col-span-2" />
              <NumField v-model="v.life_km" label="Vida útil (km)" /><NumField v-model="v.life_years" label="Vida útil (años)" suffix="años" />
              <NumField v-model="v.salvage_pct" label="Valor de rescate" suffix="%" /><NumField v-model="v.capital_rate_pct" label="Tasa de capital" suffix="% anual" />
            </div>
            <p class="mt-2 text-xs text-text-muted">Base depreciable: <b class="text-text">{{ money(capital.depreciable) }}</b> — se descuenta {{ money(capital.salvage) }} de rescate</p>
            <p class="text-xs text-text-muted">Costo de capital: <b class="text-text">{{ money(capital.annual) }}</b> / año — sobre un capital promedio de {{ money(capital.avg) }} (sin activos)</p>
          </section>
        </div>
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-3">Gestión de neumáticos</h3>
          <div class="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 text-xs uppercase text-text-muted"><span>Categoría</span><span>Cantidad</span><span>Vida útil (km)</span><span>Precio / unidad</span></div>
          <div v-for="t in tireRows" :key="t.k" class="mt-2 grid grid-cols-[1fr_1fr_1fr_1fr] items-center gap-2">
            <span>{{ t.label }}</span>
            <NumField v-model="v[`tires_${t.k}_qty`]" /><NumField v-model="v[`tires_${t.k}_life_km`]" /><NumField v-model="v[`tires_${t.k}_price`]" prefix="$" />
          </div>
        </section>
        <div class="grid gap-3 md:grid-cols-3">
          <section class="card p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-3">Combustible</h3>
            <div class="grid grid-cols-2 gap-2">
              <NumField v-model="v.km_per_liter_empty" label="Km/L vacío" /><NumField v-model="v.km_per_liter_loaded" label="Km/L cargado" />
              <NumField v-model="v.fuel_price" label="Precio/L ($)" prefix="$" /><NumField v-model="v.tank_liters" label="Tanque (L)" />
              <NumField v-model="v.refill_minutes" label="Recarga (min)" /><NumField v-model="v.idle_lph" label="Ralentí (L/h)" />
            </div>
          </section>
          <section class="card p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-3">Descanso del operador</h3>
            <div class="grid gap-2">
              <NumField v-model="v.break_every_hours" label="Frecuencia (h de manejo)" suffix="h" />
              <NumField v-model="v.break_duration_hours" label="Duración del descanso" suffix="h" />
              <NumField v-model="v.break_cost" label="Costo por descanso" prefix="$" />
            </div>
          </section>
          <section class="card p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-3">Mantenimiento</h3>
            <div class="grid gap-2"><NumField v-model="v.maintenance_interval_km" label="Intervalo (km)" /><NumField v-model="v.maintenance_cost" label="Costo por servicio" prefix="$" /></div>
          </section>
        </div>
        <section class="card p-3">
          <h3 class="card-head -mx-3 -mt-3 mb-3">Pago al operador (valores por defecto al cotizar)</h3>
          <div class="grid grid-cols-2 gap-2 md:grid-cols-5">
            <NumField v-model="v.driver_pay_km_loaded" label="Por km cargado" prefix="$" /><NumField v-model="v.driver_pay_km_empty" label="Por km vacío" prefix="$" />
            <NumField v-model="v.driver_pay_hour" label="Por hora" prefix="$" /><NumField v-model="v.driver_pay_route_pct" label="Comisión" suffix="%" />
            <NumField v-model="v.driver_pay_monthly" label="Sueldo mensual (renta)" prefix="$" hint="Nómina garantizada va en gastos fijos." />
          </div>
        </section>
        <section class="card p-3">
          <div class="card-head -mx-3 -mt-3 mb-3">Activos requeridos <button v-if="!readOnly" type="button" class="btn-ghost ml-auto px-2 py-0.5" @click="v.assets.push({ name: '', value: 0, life_km: 0, life_years: 0 })"><Plus class="size-4" />Agregar</button></div>
          <div v-for="(a, i) in v.assets" :key="i" class="mb-2 grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-end gap-2">
            <label class="field"><span>Activo</span><input v-model="a.name" class="input" placeholder="Semirremolque" /></label>
            <NumField v-model="a.value" label="Valor ($)" prefix="$" /><NumField v-model="a.life_km" label="Vida útil (km)" /><NumField v-model="a.life_years" label="Vida útil (años)" />
            <button type="button" class="btn-danger px-2" aria-label="Quitar activo" @click="v.assets.splice(i, 1)"><Trash2 class="size-4" /></button>
          </div>
          <p v-if="!v.assets.length" class="text-xs text-text-dimmed">Sin activos adicionales (remolques, equipo de refrigeración, etc.).</p>
        </section>
      </div>

      <section class="card p-3">
        <h3 class="card-head -mx-3 -mt-3 mb-3">Gastos fijos</h3>
        <label class="field"><span>Categoría de vehículo</span>
          <select v-model="v.category_id" class="input"><option :value="null">Sin categoría</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select>
        </label>
        <div class="mt-3 rounded-md border border-line p-3 text-sm">
          <div class="text-text-muted">Tiempo efectivo / año</div>
          <div class="num text-lg text-primary">{{ unitHours.toLocaleString('es-MX') }} hrs</div>
          <div v-if="cat" class="text-xs text-text-dimmed">{{ cat.days_per_year }} días × {{ cat.hours_per_day }} hr/día por vehículo</div>
          <div class="kv mt-2 border-t border-line pt-2"><span>Impacto general / hr</span><span>{{ money(summary?.hourlyRecovery ?? 0) }}</span></div>
          <div class="kv"><span>Costos directos / hr</span><span>{{ money(specificPerHour) }}</span></div>
          <div class="kv font-semibold"><span>Total fijo / hr</span><span class="text-primary">{{ money((summary?.hourlyRecovery ?? 0) + specificPerHour) }}</span></div>
        </div>
        <div class="mt-3 flex items-center justify-between"><span class="text-xs uppercase text-text-muted">Costos fijos directos del vehículo</span>
          <button v-if="!readOnly" type="button" class="btn-ghost px-2 py-0.5 text-primary" @click="v.expenses.unshift({ name: '', amount: 0, period: 'monthly' })"><Plus class="size-4" />Agregar</button></div>
        <div class="mt-2 grid grid-cols-2 gap-2 rounded-md border border-line p-2 text-sm">
          <div><div class="text-xs text-text-muted">Por día</div><div class="num text-primary">{{ money(cat ? specificAnnual / cat.days_per_year : 0) }}</div></div>
          <div><div class="text-xs text-text-muted">Por hora</div><div class="num text-primary">{{ money(specificPerHour) }}</div></div>
        </div>
        <div v-for="(e, i) in v.expenses" :key="i" class="mt-2 space-y-1.5 rounded-md border border-line p-2">
          <div class="flex gap-2"><input v-model="e.name" class="input" placeholder="Seguro de la unidad" /><button type="button" class="btn-danger px-2" aria-label="Quitar gasto" @click="v.expenses.splice(i, 1)"><Trash2 class="size-4" /></button></div>
          <div class="grid grid-cols-2 gap-2"><NumField v-model="e.amount" prefix="$" />
            <select v-model="e.period" class="input"><option v-for="(l, k) in SPECIFIC_PERIOD_LABELS" :key="k" :value="k">{{ l }}</option></select></div>
        </div>
      </section>

      <section class="card p-3">
        <h3 class="card-head -mx-3 -mt-3 mb-3">Equipamiento</h3>
        <div v-if="!readOnly" class="flex gap-2">
          <select v-model="pickEquipment" class="input"><option :value="null">Selecciona un equipo…</option><option v-for="e in catalog" :key="e.id" :value="e.id">{{ e.name }} · {{ money(e.unit_price) }}</option></select>
          <button type="button" class="btn-soft" :disabled="!pickEquipment" @click="addEquipment"><Plus class="size-4" /></button>
        </div>
        <div class="mt-2 grid grid-cols-2 gap-2 rounded-md border border-line p-2 text-sm">
          <div><div class="text-xs text-text-muted">Por día</div><div class="num text-primary">{{ money(cat ? eqAnnual / cat.days_per_year : 0) }}</div></div>
          <div><div class="text-xs text-text-muted">Por hora</div><div class="num text-primary">{{ money(unitHours ? eqAnnual / unitHours : 0) }}</div></div>
        </div>
        <div v-for="(e, i) in v.equipment" :key="i" class="mt-2 rounded-md border border-line p-2">
          <div class="flex items-start justify-between gap-2"><span class="text-sm">{{ e.name }}</span><button type="button" class="btn-ghost px-1" aria-label="Quitar equipo" @click="v.equipment.splice(i, 1)"><X class="size-4" /></button></div>
          <div class="mt-1 grid grid-cols-3 gap-1.5"><NumField v-model="e.qty" label="Cant." /><NumField v-model="e.life_years" label="Años" /><NumField v-model="e.life_months" label="Meses" /></div>
          <div class="mt-1 text-xs text-text-dimmed">{{ money(e.unit_price) }} c/u · reposición cada {{ e.life_years }}a {{ e.life_months }}m</div>
        </div>
      </section>
    </fieldset>
  </div>
</template>
