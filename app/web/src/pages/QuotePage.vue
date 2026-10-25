<script setup lang="ts">
import { ArrowDown, ArrowUp, FilePlus2, Plus, Repeat, Route, Save, Trash2, Truck } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { defaultFreightInput, defaultRentalInput, type CostParams, type FreightInput, type RentalInput, type RouteInput } from '../../../shared/costing/index.ts';
import { money, num } from '../../../shared/format.ts';
import FreightDetail from '../components/FreightDetail.vue';
import ModalDialog from '../components/ModalDialog.vue';
import NumField from '../components/NumField.vue';
import RentalDetail from '../components/RentalDetail.vue';
import { api } from '../lib/api.ts';
import { can, fail, session, toast } from '../lib/session.ts';

interface StopForm { label: string; loaded: boolean; waitMinutes: number; idleMinutes: number; lat: number | null; lon: number | null }
interface LegForm { km: number | null; minutes: number | null; tolls: { plazaId: number | null; name: string; amount: number }[] }

const router = useRouter();
const mode = ref<'freight' | 'rental'>('freight');
const vehicles = ref<any[]>([]);
const vehicleId = ref<number | null>(null);
const params = ref<(CostParams & { warnings: string[] }) | null>(null);
const prefs = ref<any>(null);
const locations = ref<any[]>([]);
const savedRoutes = ref<any[]>([]);
const tollRates = ref<any[]>([]);
const providers = ref<any[]>([]);
const stops = ref<StopForm[]>([blankStop('', true), blankStop('', true)]);
const legs = ref<LegForm[]>([blankLeg()]);
const freight = ref<FreightInput | null>(null);
const rental = ref<RentalInput | null>(null);
const trips = ref<{ useRoute: boolean; value: number; unit: 'day' | 'week' | 'month' }>({ useRoute: false, value: 5, unit: 'week' });
const rentalRef = ref<InstanceType<typeof RentalDetail> | null>(null);

function blankStop(label: string, loaded: boolean): StopForm {
  return { label, loaded, waitMinutes: 0, idleMinutes: 0, lat: null, lon: null };
}
function blankLeg(): LegForm {
  return { km: null, minutes: null, tolls: [] };
}

onMounted(async () => {
  try {
    [vehicles.value, prefs.value, locations.value, savedRoutes.value, providers.value] = await Promise.all([
      api.get('/vehicles'), api.get('/preferences'), api.get('/locations'), api.get('/saved-routes'), api.get('/routing/providers'),
    ]);
    if (vehicles.value.length) vehicleId.value = vehicles.value[0].id;
  } catch (e) {
    fail(e);
  }
});

watch(vehicleId, async (id) => {
  if (!id) return;
  try {
    params.value = await api.get(`/vehicles/${id}/params`);
    const v = vehicles.value.find((x) => x.id === id);
    tollRates.value = v?.class_code ? await api.get(`/tolls/quote?vehicle_class=${encodeURIComponent(v.class_code)}`) : [];
    const p = params.value!;
    const f = defaultFreightInput(p.vehicle);
    const pr = prefs.value ?? {};
    freight.value = {
      ...f,
      fuelPricePerLiter: p.vehicle.fuelPricePerLiter,
      kmPerLiterLoaded: p.vehicle.kmPerLiterLoaded,
      kmPerLiterEmpty: p.vehicle.kmPerLiterEmpty,
      breakCost: p.vehicle.breakCost,
      profitPct: pr.profitPct ?? 20,
      financingPct: pr.financingPct ?? 0,
      taxPct: pr.taxPct ?? 16,
      cargoType: pr.cargoTypes?.[0]?.name ?? f.cargoType,
      cargoSurchargePct: pr.cargoTypes?.[0]?.surchargePct ?? 0,
      driverPay: { ...f.driverPay, method: pr.driverPayMethod ?? 'per_km', applyMargin: pr.driverPayApplyMargin ?? true },
    };
    rental.value = { ...defaultRentalInput(p), profitPct: pr.profitPct ?? 20, taxPct: pr.taxPct ?? 16 };
  } catch (e) {
    fail(e);
  }
});

const route = computed<RouteInput>(() => ({
  stops: stops.value.map((s) => ({ ...s, label: s.label || '(sin nombre)' })),
  legMeters: legs.value.map((l) => Math.max(0, Number(l.km) || 0) * 1000),
  drivingSeconds: legs.value.reduce((s, l) => s + Math.max(0, Number(l.minutes) || 0) * 60, 0),
  tollsCash: legs.value.reduce((s, l) => s + l.tolls.reduce((a, t) => a + (Number(t.amount) || 0), 0), 0),
  tollPasses: legs.value.flatMap((l, i) => l.tolls.map((t) => ({ legIndex: i, plazaId: t.plazaId, name: t.name || 'Caseta', amount: Number(t.amount) || 0 }))),
}));
const routeReady = computed(() => stops.value.every((s) => s.label.trim()) && legs.value.every((l) => (Number(l.km) || 0) > 0 && (Number(l.minutes) || 0) > 0));

function addStop(i: number) {
  stops.value.splice(i + 1, 0, blankStop('', stops.value[i].loaded));
  legs.value.splice(i, 0, blankLeg());
}
function removeStop(i: number) {
  if (stops.value.length <= 2) return;
  stops.value.splice(i, 1);
  legs.value.splice(Math.min(i, legs.value.length - 1), 1);
}
function move(i: number, d: -1 | 1) {
  const j = i + d;
  if (j < 0 || j >= stops.value.length) return;
  [stops.value[i], stops.value[j]] = [stops.value[j], stops.value[i]];
}
/** Agrega el regreso vacío a la primera parada, repitiendo distancias, tiempos y casetas en orden inverso. */
function addReturn() {
  const origin = stops.value[0];
  const back = [...legs.value].reverse().map((l) => ({ km: l.km, minutes: l.minutes, tolls: l.tolls.map((t) => ({ ...t })) }));
  stops.value[stops.value.length - 1].loaded = false;
  const midStops = stops.value.slice(1, -1).reverse().map((s) => ({ ...blankStop(s.label, false), lat: s.lat, lon: s.lon }));
  stops.value.push(...midStops, { ...blankStop(origin.label, false), lat: origin.lat, lon: origin.lon });
  legs.value.push(...back);
}
function pickLocation(i: number) {
  const loc = locations.value.find((l) => l.name === stops.value[i].label);
  if (loc) Object.assign(stops.value[i], { lat: loc.lat, lon: loc.lon });
}

const loadRouteId = ref<number | null>(null);
function loadSaved() {
  const sr = savedRoutes.value.find((r) => r.id === loadRouteId.value);
  if (!sr) return;
  const r = sr.route as RouteInput;
  stops.value = r.stops.map((s) => ({ label: s.label, loaded: s.loaded, waitMinutes: s.waitMinutes, idleMinutes: s.idleMinutes, lat: s.lat ?? null, lon: s.lon ?? null }));
  const totalKm = r.legMeters.reduce((a, b) => a + b, 0) || 1;
  legs.value = r.legMeters.map((m, i) => ({
    km: m / 1000,
    // El tiempo guardado es total; se reparte por tramo en proporción a la distancia.
    minutes: (r.drivingSeconds * (m / totalKm)) / 60,
    tolls: (r.tollPasses ?? []).filter((t) => t.legIndex === i).map((t) => ({ plazaId: t.plazaId, name: t.name, amount: t.amount })),
  }));
}
async function saveRoute() {
  const name = prompt('Nombre de la ruta guardada');
  if (!name) return;
  try {
    await api.post('/saved-routes', { name, route: route.value, routing_source: 'manual' });
    savedRoutes.value = await api.get('/saved-routes');
    toast('Ruta guardada');
  } catch (e) {
    fail(e);
  }
}

const providerId = ref('');
const configuredProviders = computed(() => providers.value.filter((p) => p.id !== 'manual' && p.configured));
async function planWithProvider() {
  if (stops.value.some((s) => s.lat == null || s.lon == null)) return fail(new Error('Todas las paradas necesitan coordenadas (elige ubicaciones guardadas con lat/lon).'));
  try {
    const v = await api.get(`/vehicles/${vehicleId.value}`);
    const res = await api.post('/routing/plan', { provider: providerId.value, coords: stops.value.map((s) => [s.lon, s.lat]), truck: { heightM: v.height_m, widthM: v.width_m, lengthM: v.length_m, weightTons: v.weight_tons } });
    const total = res.legMeters.reduce((a: number, b: number) => a + b, 0) || 1;
    legs.value = res.legMeters.map((m: number, i: number) => ({ km: m / 1000, minutes: (res.drivingSeconds * (m / total)) / 60, tolls: legs.value[i]?.tolls ?? [] }));
    toast(`Ruta calculada con ${res.provider}. ${res.attribution}`);
  } catch (e) {
    fail(e);
  }
}

// ---- Guardar en cotización ----
const saveOpen = ref(false);
const drafts = ref<any[]>([]);
const clients = ref<any[]>([]);
const target = ref<'new' | number>('new');
const clientId = ref<number | null>(null);
const description = ref('');
async function openSave() {
  try {
    [drafts.value, clients.value] = await Promise.all([api.get('/quotes?status=draft'), can('ver:cliente') ? api.get('/clients') : Promise.resolve([])]);
    saveOpen.value = true;
  } catch (e) {
    fail(e);
  }
}
async function save() {
  const item =
    mode.value === 'freight'
      ? { kind: 'freight', vehicleId: vehicleId.value, route: route.value, input: freight.value, description: description.value || undefined }
      : { kind: 'rental', vehicleId: vehicleId.value, input: rentalRef.value?.effective, description: description.value || undefined };
  try {
    const q = target.value === 'new' ? await api.post('/quotes', { clientId: clientId.value, item }) : await api.post(`/quotes/${target.value}/items`, item);
    toast(`Guardado en ${q.folio}`);
    router.push(`/admin/quotations/detail/${q.id}`);
  } catch (e) {
    fail(e);
  }
}

const routeKm = computed(() => route.value.legMeters.reduce((a, b) => a + b, 0) / 1000);
</script>

<template>
  <div class="grid min-h-full gap-4 p-4 xl:grid-cols-[24rem_1fr]">
    <aside class="space-y-3">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-semibold text-text-highlighted">Nuevo viaje</h2>
        <div class="ml-auto flex rounded-md bg-muted p-0.5 text-sm">
          <button class="rounded px-3 py-1" :class="mode === 'freight' ? 'bg-primary-strong text-white' : 'text-text-muted'" @click="mode = 'freight'"><Route class="inline size-4" /> Flete</button>
          <button class="rounded px-3 py-1" :class="mode === 'rental' ? 'bg-primary-strong text-white' : 'text-text-muted'" @click="mode = 'rental'"><Truck class="inline size-4" /> Renta</button>
        </div>
      </div>
      <label class="field"><span>Vehículo</span>
        <select v-model="vehicleId" class="input"><option v-for="v in vehicles" :key="v.id" :value="v.id">{{ v.name }}{{ v.class_code ? ` · ${v.class_code}` : '' }}</option></select>
      </label>
      <p v-if="!vehicles.length" class="text-sm text-warning">Registra un perfil de vehículo para cotizar.</p>

      <section class="card p-3" :class="mode === 'rental' ? 'opacity-80' : ''">
        <div class="card-head -mx-3 -mt-3 mb-2">{{ mode === 'rental' ? 'Recorrido representativo (opcional)' : 'Itinerario' }}</div>
        <div class="mb-2 flex gap-2">
          <select v-model="loadRouteId" class="input" aria-label="Ruta guardada"><option :value="null">Cargar ruta guardada…</option><option v-for="r in savedRoutes" :key="r.id" :value="r.id">{{ r.name }}</option></select>
          <button class="btn-soft" :disabled="!loadRouteId" @click="loadSaved">Cargar</button>
        </div>
        <datalist id="locations"><option v-for="l in locations" :key="l.id" :value="l.name" /></datalist>
        <div v-for="(s, i) in stops" :key="i">
          <div class="rounded-md border border-line p-2">
            <div class="flex items-center gap-1.5">
              <span class="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold" :class="i === 0 ? 'bg-success/20 text-success' : i === stops.length - 1 ? 'bg-error/20 text-error' : 'bg-muted'">{{ i + 1 }}</span>
              <input v-model="s.label" class="input" list="locations" :placeholder="i === 0 ? 'Origen' : i === stops.length - 1 ? 'Destino' : 'Parada'" :aria-label="`Parada ${i + 1}`" @change="pickLocation(i)" />
              <button class="btn-ghost px-1" aria-label="Subir" @click="move(i, -1)"><ArrowUp class="size-3.5" /></button>
              <button class="btn-ghost px-1" aria-label="Bajar" @click="move(i, 1)"><ArrowDown class="size-3.5" /></button>
              <button class="btn-danger px-1" aria-label="Quitar parada" :disabled="stops.length <= 2" @click="removeStop(i)"><Trash2 class="size-3.5" /></button>
            </div>
            <div class="mt-1.5 grid grid-cols-3 items-end gap-1.5">
              <label v-if="i < stops.length - 1" class="flex items-center gap-1 text-xs"><input v-model="s.loaded" type="checkbox" />Sale con carga</label><span v-else></span>
              <NumField v-model="s.waitMinutes" label="Espera (min)" :min="0" />
              <NumField v-model="s.idleMinutes" label="Ralentí (min)" :min="0" />
            </div>
          </div>
          <div v-if="i < stops.length - 1" class="my-1 ml-3 border-l-2 pl-3" :class="s.loaded ? 'border-primary' : 'border-dashed border-text-dimmed'">
            <div class="grid grid-cols-2 gap-1.5">
              <NumField v-model="legs[i].km" label="Km del tramo" :min="0" />
              <NumField v-model="legs[i].minutes" label="Manejo (min)" :min="0" />
            </div>
            <div v-for="(t, k) in legs[i].tolls" :key="k" class="mt-1 grid grid-cols-[1fr_6rem_auto] gap-1">
              <input v-model="t.name" class="input" aria-label="Caseta" />
              <NumField v-model="t.amount" prefix="$" />
              <button class="btn-danger px-1" aria-label="Quitar caseta" @click="legs[i].tolls.splice(k, 1)">×</button>
            </div>
            <div class="mt-1 flex flex-wrap gap-1">
              <select class="input w-auto py-0.5 text-xs" aria-label="Agregar caseta del catálogo" @change="(e) => { const r = tollRates.find((x) => x.plaza_id === Number((e.target as HTMLSelectElement).value)); if (r) legs[i].tolls.push({ plazaId: r.plaza_id, name: `${r.name} (${r.direction})`, amount: r.amount }); (e.target as HTMLSelectElement).value = ''; }">
                <option value="">+ Caseta del catálogo…</option><option v-for="r in tollRates" :key="r.plaza_id + r.direction" :value="r.plaza_id">{{ r.name }} · {{ r.direction }} · {{ money(r.amount) }}</option>
              </select>
              <button class="btn-ghost px-2 py-0.5 text-xs" @click="legs[i].tolls.push({ plazaId: null, name: 'Caseta capturada', amount: 0 })">+ Monto manual</button>
              <button class="btn-ghost px-2 py-0.5 text-xs" @click="addStop(i)"><Plus class="size-3" />Parada</button>
            </div>
          </div>
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn-soft" @click="addReturn"><Repeat class="size-4" />Agregar regreso vacío</button>
          <button v-if="can('agregar:ruta')" class="btn-soft" :disabled="!routeReady" @click="saveRoute"><Save class="size-4" />Guardar ruta</button>
        </div>
        <div v-if="configuredProviders.length" class="mt-2 flex gap-2">
          <select v-model="providerId" class="input"><option value="">Calcular km/tiempo con…</option><option v-for="p in configuredProviders" :key="p.id" :value="p.id">{{ p.label }}</option></select>
          <button class="btn-soft" :disabled="!providerId" @click="planWithProvider">Calcular</button>
        </div>
        <p v-else class="mt-2 text-xs text-text-dimmed">Km, tiempos y casetas se capturan manualmente. Para calcularlos con un proveedor de rutas configura credenciales propias (Configuración → Integraciones).</p>
        <div class="mt-2 text-xs text-text-muted">Total: {{ num(routeKm, 1) }} km · {{ num(route.drivingSeconds / 60, 0) }} min · casetas {{ money(route.tollsCash) }}</div>
      </section>
    </aside>

    <section class="min-w-0">
      <div class="mb-3 flex items-center gap-2 rounded-t-lg bg-primary-strong/90 px-3 py-2 text-white">
        <span class="font-semibold">{{ mode === 'freight' ? 'Detalle del viaje' : 'Detalle de renta' }}</span>
        <button class="ml-auto inline-flex items-center gap-1 rounded-md bg-success/90 px-3 py-1 text-sm font-medium text-black disabled:opacity-50" :disabled="!params || (mode === 'freight' && !routeReady) || !can('agregar:cotizacion')" @click="openSave"><FilePlus2 class="size-4" />Cotización</button>
      </div>
      <p v-if="mode === 'freight' && !routeReady" class="mb-3 rounded-md border border-line p-3 text-sm text-text-muted">Captura nombre de cada parada y km y minutos de cada tramo para obtener el desglose. No se inventan distancias ni tiempos.</p>
      <FreightDetail v-if="mode === 'freight' && params && freight && routeReady" v-model:input="freight" :params="params" :route="route" :cargo-types="prefs?.cargoTypes ?? []" :prefs="prefs" :is-admin="session.me?.user.isAdmin" />
      <RentalDetail v-if="mode === 'rental' && params && rental" ref="rentalRef" v-model:input="rental" v-model:trips="trips" :params="params" :route-km="routeReady ? routeKm : 0" :route-tolls="routeReady ? route.tollsCash : 0" :route-hours="route.drivingSeconds / 3600" />
    </section>

    <ModalDialog v-model:open="saveOpen" title="Guardar en cotización">
      <div class="grid gap-3">
        <label class="field"><span>Cotización</span>
          <select v-model="target" class="input"><option value="new">Nueva cotización</option><option v-for="d in drafts" :key="d.id" :value="d.id">{{ d.folio }} · {{ d.client_name ?? 'Sin cliente' }}</option></select>
        </label>
        <label v-if="target === 'new'" class="field"><span>Cliente</span>
          <select v-model="clientId" class="input"><option :value="null">Sin cliente</option><option v-for="c in clients.filter((x) => !x.archived_at)" :key="c.id" :value="c.id">{{ c.legal_name }}</option></select>
        </label>
        <label class="field"><span>Descripción de la partida (opcional)</span><input v-model="description" class="input" placeholder="Se genera automáticamente si se deja vacío" /></label>
        <p class="text-xs text-text-dimmed">El servidor recalcula con los parámetros vigentes del vehículo y guarda una copia completa del cálculo. Cambios posteriores de costos no alteran esta partida.</p>
      </div>
      <template #footer><button class="btn-soft" @click="saveOpen = false">Cancelar</button><button class="btn-primary" @click="save">Guardar</button></template>
    </ModalDialog>
  </div>
</template>
