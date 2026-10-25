<script setup lang="ts">
import { ChevronDown, ChevronLeft, ChevronRight, Plus, RotateCcw, Route, Save, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { computeKmQuote, defaultScenarios, type Charge, type KmQuoteInput, type ScenarioSpec } from '../../../shared/pricing/kmquote.ts';
import { money, num } from '../../../shared/format.ts';
import CentsField from '../components/km/CentsField.vue';
import KmComparison from '../components/km/KmComparison.vue';
import MapPanel from '../components/km/MapPanel.vue';
import PlaceFields from '../components/km/PlaceFields.vue';
import { blankPlace, type Place } from '../components/km/types.ts';
import NumField from '../components/NumField.vue';
import { api } from '../lib/api.ts';
import { can, fail, toast } from '../lib/session.ts';

const DRAFT_KEY = 'km-quote-draft-v1';
const route = useRoute();
const router = useRouter();
const editQuote = route.query.quote ? Number(route.query.quote) : null;
const editItem = route.query.item ? Number(route.query.item) : null;

const steps = ['Origen y destino', 'Unidad y carga', 'Costos y adicionales', 'Tarifas y márgenes', 'Comparación', 'Guardar y compartir'];
const step = ref(0);
const quick = ref(!editItem);
const visibleSteps = computed(() => (quick.value ? [0, 1, 4, 5] : [0, 1, 2, 3, 4, 5]));

const vehicles = ref<any[]>([]);
const locations = ref<any[]>([]);
const kmRoutes = ref<any[]>([]);
const clients = ref<any[]>([]);
const mapCfg = ref<any>({ tilesUrl: null, geocoder: false, routing: [] });
const defaults = ref<any>(null);
const catalog = ref<Omit<Charge, 'id'>[]>([]);
const geometry = ref<[number, number][] | null>(null);
const activePoint = ref<string | null>(null);
const summaryOpen = ref(false);
const loaded = ref(false);

const form = reactive<any>({
  vehicleId: null as number | null,
  clientId: null as number | null,
  route: { origin: blankPlace(), destination: blankPlace(), waypoints: [] as Place[], provider: null as string | null },
  trip: { outboundKm: 0, distanceSource: 'manual', tripType: 'sencillo', returnMode: 'vacio', returnKm: 0, returnBillable: false, repositioningKm: 0, extraKm: 0, extraKmBillable: false, evaluateEmptyReturn: true, tollsOutbound: 0, tollsReturn: 0, tollsBilling: 'incluidas' },
  cargo: { pallets: 0, weightTons: 0, goods: '', lengthM: null, widthM: null, heightM: null, loadDate: '', deliveryDate: '', tarp: false, straps: false, handling: 'cliente', notes: '' },
  unit: null as any,
  costs: null as any,
  pricing: null as any,
  charges: [] as Charge[],
  scenarios: [] as ScenarioSpec[],
  selectedScenarioId: null as string | null,
});

const input = computed<KmQuoteInput | null>(() =>
  form.unit && form.costs && form.pricing ? { unit: form.unit, trip: { ...form.trip, returnKm: form.trip.returnKm || form.trip.outboundKm }, cargo: form.cargo, costs: form.costs, charges: form.charges, pricing: form.pricing, scenarios: form.scenarios } : null,
);
const result = computed(() => (input.value ? computeKmQuote(input.value) : null));
const selected = computed(() => result.value?.scenarios.find((s) => s.id === (form.selectedScenarioId ?? result.value?.recommendedId)) ?? null);
const c = (x: number) => money(x / 100);
// Copia profunda de datos planos (structuredClone no acepta proxies reactivos).
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

async function applyDefaults(vehicleId: number, keepScenarios = false) {
  defaults.value = await api.get(`/km-quotes/defaults?vehicleId=${vehicleId}`);
  form.unit = { ...defaults.value.unit };
  form.costs = clone(defaults.value.costs);
  form.pricing = { ...defaults.value.pricing };
  if (!keepScenarios) form.scenarios = clone(defaults.value.scenarios);
  catalog.value = defaults.value.chargeCatalog;
}

onMounted(async () => {
  try {
    [vehicles.value, locations.value, kmRoutes.value, mapCfg.value] = await Promise.all([api.get('/vehicles'), api.get('/locations'), api.get('/km-routes'), api.get('/map-config')]);
    if (can('ver:cliente')) clients.value = (await api.get('/clients')).filter((x: any) => !x.archived_at);
    if (editQuote && editItem) {
      const q = await api.get(`/quotes/${editQuote}`);
      const it = q.items.find((i: any) => i.id === editItem);
      if (!it || it.kind !== 'km') throw new Error('Partida no encontrada.');
      const snap = it.snapshot;
      form.vehicleId = it.vehicle_id;
      form.clientId = q.client_id;
      await applyDefaults(it.vehicle_id, true);
      Object.assign(form, { route: { ...snap.places, waypoints: snap.places.waypoints ?? [] }, trip: snap.input.trip, cargo: { ...form.cargo, ...snap.input.cargo }, unit: snap.input.unit, costs: snap.input.costs, pricing: snap.input.pricing, charges: snap.input.charges, scenarios: snap.input.scenarios, selectedScenarioId: snap.selectedScenarioId });
    } else {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        Object.assign(form, JSON.parse(draft));
        toast('Se restauró el borrador guardado en este equipo.');
        if (form.vehicleId && !form.unit) await applyDefaults(form.vehicleId);
      } else if (vehicles.value.length) {
        form.vehicleId = vehicles.value[0].id;
        await applyDefaults(form.vehicleId);
      }
    }
  } catch (e) {
    fail(e);
  }
  loaded.value = true;
});

// Autoguardado local del borrador (no aplica al editar una partida guardada).
let timer: ReturnType<typeof setTimeout> | undefined;
watch(form, () => {
  if (!loaded.value || editItem) return;
  clearTimeout(timer);
  timer = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(form)), 400);
}, { deep: true });
function discardDraft() {
  localStorage.removeItem(DRAFT_KEY);
  router.go(0);
}

async function changeVehicle(id: number) {
  form.vehicleId = id;
  try {
    await applyDefaults(id);
    form.selectedScenarioId = null;
  } catch (e) {
    fail(e);
  }
}

const points = computed(() => [
  { key: 'origin', label: 'Origen', place: form.route.origin },
  ...form.route.waypoints.map((p: Place, i: number) => ({ key: `w${i}`, label: `Punto ${i + 1}`, place: p })),
  { key: 'destination', label: 'Destino', place: form.route.destination },
]);
function onPicked(key: string, lat: number, lon: number) {
  const p = points.value.find((x) => x.key === key)?.place;
  if (p) Object.assign(p, { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 });
  activePoint.value = null;
}
const routingProviders = computed(() => (mapCfg.value.routing ?? []).filter((p: any) => p.id !== 'manual' && p.configured));
const provider = ref('');
async function calcDistance() {
  if (points.value.some((p) => p.place.lat == null)) return fail(new Error('Origen, destino y puntos intermedios necesitan coordenadas.'));
  try {
    const v = await api.get(`/vehicles/${form.vehicleId}`);
    const res = await api.post('/routing/plan', { provider: provider.value, coords: points.value.map((p) => [p.place.lon, p.place.lat]), truck: { heightM: v.height_m, widthM: v.width_m, lengthM: v.length_m, weightTons: v.weight_tons } });
    form.trip.outboundKm = Math.round(res.legMeters.reduce((a: number, b: number) => a + b, 0) / 100) / 10;
    form.trip.distanceSource = 'proveedor';
    form.route.provider = res.provider;
    geometry.value = res.geometry;
    toast(`Distancia calculada con ${res.provider}: ${num(form.trip.outboundKm, 1)} km. ${res.attribution}`);
  } catch (e) {
    fail(e);
  }
}
function loadKmRoute(e: Event) {
  const r = kmRoutes.value.find((x) => x.id === Number((e.target as HTMLSelectElement).value));
  (e.target as HTMLSelectElement).value = '';
  if (!r) return;
  form.route.origin = { ...blankPlace(), ...r.origin };
  form.route.destination = { ...blankPlace(), ...r.destination };
  form.route.waypoints = r.waypoints.map((w: any) => ({ ...blankPlace(), ...w }));
  Object.assign(form.trip, { outboundKm: r.outbound_km, returnKm: r.return_km ?? r.outbound_km, distanceSource: r.distance_source, tollsOutbound: Math.round(r.tolls_outbound * 100), tollsReturn: Math.round(r.tolls_return * 100) });
  if (r.distance_note) toast(r.distance_note);
}
async function saveKmRoute() {
  const name = prompt('Nombre de la ruta frecuente');
  if (!name) return;
  try {
    await api.post('/km-routes', { name, origin: form.route.origin, destination: form.route.destination, waypoints: form.route.waypoints, outbound_km: form.trip.outboundKm, return_km: form.trip.returnKm || null, distance_source: form.trip.distanceSource, tolls_outbound: form.trip.tollsOutbound / 100, tolls_return: form.trip.tollsReturn / 100 });
    kmRoutes.value = await api.get('/km-routes');
    toast('Ruta frecuente guardada');
  } catch (e) {
    fail(e);
  }
}
function reverseRoute() {
  [form.route.origin, form.route.destination] = [form.route.destination, form.route.origin];
  form.route.waypoints.reverse();
}

let seq = 0;
const newId = (p: string) => `${p}${Date.now().toString(36)}${seq++}`;
function addCharge(tpl?: Omit<Charge, 'id'>) {
  form.charges.push({ id: newId('c'), ...(tpl ?? { name: 'Cargo', type: 'fijo', value: 0, base: 'flete', classification: 'comercial', taxable: true, billToClient: true }) });
}
function addScenario(kind: ScenarioSpec['kind']) {
  const id = newId('s');
  if (kind === 'tarifa') form.scenarios.push({ id, label: 'Tarifa personalizada', kind, rate: form.pricing.targetRate });
  else if (kind === 'precio') form.scenarios.push({ id, label: 'Precio personalizado', kind, freight: selected.value?.freight ?? 0 });
  else form.scenarios.push({ id, label: `Margen ${form.pricing.targetMarginPct}%`, kind, marginPct: form.pricing.targetMarginPct });
}
function duplicateScenario(s: ScenarioSpec) {
  form.scenarios.push({ ...s, id: newId('s'), label: `${s.label} (copia)` });
}
const regenerate = () => (form.scenarios = defaultScenarios(form.pricing));

const routeReady = computed(() => form.route.origin.address.trim() && form.route.destination.address.trim() && form.trip.outboundKm > 0);
const unitOptions = computed(() => vehicles.value.filter((v) => v.unit_type));
const otherVehicles = computed(() => vehicles.value.filter((v) => !v.unit_type));

const saving = ref(false);
async function save() {
  if (!routeReady.value || !selected.value) return fail(new Error('Completa origen, destino y km, y elige una alternativa.'));
  saving.value = true;
  const body = { kind: 'km', vehicleId: form.vehicleId, selectedScenarioId: selected.value.id, input: { route: form.route, trip: input.value!.trip, cargo: { ...form.cargo, loadDate: form.cargo.loadDate || null, deliveryDate: form.cargo.deliveryDate || null }, unit: form.unit, costs: form.costs, charges: form.charges, pricing: form.pricing, scenarios: form.scenarios } };
  try {
    if (editQuote && editItem) {
      await api.put(`/quotes/${editQuote}/items/${editItem}/km`, body);
      toast('Partida actualizada; la versión anterior quedó en el historial.');
      router.push(`/admin/quotations/detail/${editQuote}`);
    } else {
      const q = await api.post('/quotes', { clientId: form.clientId, item: body });
      localStorage.removeItem(DRAFT_KEY);
      toast(`Cotización ${q.folio} guardada`);
      router.push(`/admin/quotations/detail/${q.id}?share=1`);
    }
  } catch (e) {
    fail(e);
  } finally {
    saving.value = false;
  }
}
const pos = computed(() => visibleSteps.value.indexOf(step.value));
const go = (d: number) => (step.value = visibleSteps.value[Math.min(visibleSteps.value.length - 1, Math.max(0, pos.value + d))]);
watch(quick, () => {
  if (!visibleSteps.value.includes(step.value)) step.value = 0;
});
</script>

<template>
  <div class="mx-auto max-w-[1500px] p-3 pb-28 md:p-5 lg:pb-5">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <h2 class="text-lg font-semibold text-text-highlighted">{{ editItem ? 'Editar cotización por km' : 'Nueva cotización por km' }}</h2>
      <div class="ml-auto flex items-center gap-2">
        <div class="flex rounded-md bg-muted p-0.5 text-sm" role="group" aria-label="Modo">
          <button class="rounded px-3 py-1" :class="quick ? 'bg-primary-strong text-white' : 'text-text-muted'" :aria-pressed="quick" @click="quick = true">Rápida</button>
          <button class="rounded px-3 py-1" :class="!quick ? 'bg-primary-strong text-white' : 'text-text-muted'" :aria-pressed="!quick" @click="quick = false">Avanzada</button>
        </div>
        <button v-if="!editItem" class="btn-ghost text-xs" title="Descartar borrador local" @click="discardDraft"><RotateCcw class="size-4" />Nuevo</button>
      </div>
    </div>

    <nav class="mb-4 flex gap-1 overflow-x-auto" aria-label="Pasos">
      <button v-for="(i, k) in visibleSteps" :key="i" class="flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm" :class="step === i ? 'bg-primary-strong text-white' : k < pos ? 'bg-muted text-text' : 'text-text-muted hover:bg-muted'" :aria-current="step === i ? 'step' : undefined" @click="step = i">
        <span class="flex size-5 items-center justify-center rounded-full bg-black/20 text-xs">{{ k + 1 }}</span>{{ steps[i] }}
      </button>
    </nav>

    <div class="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section class="min-w-0 space-y-3">
        <!-- Paso 1 -->
        <template v-if="step === 0">
          <div class="card space-y-3 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <select v-if="kmRoutes.length" class="input w-auto py-1 text-sm" aria-label="Ruta frecuente" @change="loadKmRoute"><option value="">Cargar ruta frecuente…</option><option v-for="r in kmRoutes" :key="r.id" :value="r.id">{{ r.name }} · {{ num(r.outbound_km, 0) }} km</option></select>
              <button class="btn-ghost text-xs" type="button" @click="reverseRoute">Invertir origen y destino</button>
              <button v-if="can('agregar:ruta')" class="btn-ghost text-xs" type="button" :disabled="!routeReady" @click="saveKmRoute"><Save class="size-3.5" />Guardar como frecuente</button>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
              <PlaceFields label="Origen" :place="form.route.origin" :locations="locations" :geocoder="mapCfg.geocoder" :active="activePoint === 'origin'" @pick="activePoint = 'origin'" />
              <PlaceFields label="Destino" :place="form.route.destination" :locations="locations" :geocoder="mapCfg.geocoder" :active="activePoint === 'destination'" @pick="activePoint = 'destination'" />
            </div>
            <div v-for="(w, i) in form.route.waypoints" :key="i" class="relative">
              <PlaceFields :label="`Punto intermedio ${i + 1}`" :place="w" :locations="locations" :geocoder="mapCfg.geocoder" :active="activePoint === `w${i}`" @pick="activePoint = `w${i}`" />
              <button class="btn-danger absolute right-2 top-2 px-1.5" type="button" aria-label="Quitar punto" @click="form.route.waypoints.splice(i, 1)"><Trash2 class="size-4" /></button>
            </div>
            <button class="btn-ghost text-xs" type="button" @click="form.route.waypoints.push(blankPlace())"><Plus class="size-3.5" />Punto intermedio</button>
          </div>

          <div class="card space-y-2 p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-2">Mapa y distancia</h3>
            <MapPanel v-if="mapCfg.tilesUrl" :tiles-url="mapCfg.tilesUrl" :attribution="mapCfg.attribution" :points="points" :active-key="activePoint" :geometry="geometry" @picked="onPicked" />
            <p v-else class="text-xs text-text-dimmed">Mapa no configurado (MAP_TILES_URL). Captura las direcciones y los km manualmente.</p>
            <p v-if="activePoint && mapCfg.tilesUrl" class="text-xs text-primary">Haz clic en el mapa para colocar: {{ points.find((p) => p.key === activePoint)?.label }}. También puedes arrastrar los marcadores.</p>
            <div class="grid items-end gap-2 sm:grid-cols-[1fr_auto_auto]">
              <NumField v-model="form.trip.outboundKm" label="Km de ida que se usarán para cotizar *" :min="0" @update:model-value="form.trip.distanceSource = 'manual'" />
              <span class="badge mb-1.5" :class="form.trip.distanceSource === 'manual' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'">{{ form.trip.distanceSource === 'manual' ? 'Captura manual' : `Proveedor: ${form.route.provider}` }}</span>
              <div v-if="routingProviders.length" class="flex gap-1">
                <select v-model="provider" class="input py-1 text-sm" aria-label="Proveedor de rutas"><option value="">Proveedor…</option><option v-for="p in routingProviders" :key="p.id" :value="p.id">{{ p.label }}</option></select>
                <button class="btn-soft" type="button" :disabled="!provider" @click="calcDistance"><Route class="size-4" />Calcular</button>
              </div>
            </div>
            <p v-if="!routingProviders.length" class="text-xs text-text-dimmed">Sin proveedor de rutas configurado: los km no se calculan automáticamente ni se inventan.</p>
          </div>

          <div class="card space-y-2 p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-2">Tipo de viaje</h3>
            <div class="flex flex-wrap gap-2">
              <label class="flex items-center gap-1.5 text-sm"><input v-model="form.trip.tripType" type="radio" value="sencillo" />Sencillo (sólo ida)</label>
              <label class="flex items-center gap-1.5 text-sm"><input v-model="form.trip.tripType" type="radio" value="redondo" />Redondo (ida y vuelta)</label>
            </div>
            <div v-if="form.trip.tripType === 'redondo'" class="grid gap-2 sm:grid-cols-3">
              <label class="field"><span>Regreso</span><select v-model="form.trip.returnMode" class="input"><option value="vacio">Vacío</option><option value="cargado">Con carga</option></select></label>
              <NumField v-model="form.trip.returnKm" label="Km de regreso" hint="Vacío = igual a la ida (ruta invertida)." />
              <label class="flex items-center gap-2 pt-6 text-sm"><input v-model="form.trip.returnBillable" type="checkbox" />El cliente paga el regreso</label>
            </div>
            <label v-else class="flex items-center gap-2 text-sm"><input v-model="form.trip.evaluateEmptyReturn" type="checkbox" />Evaluar internamente el costo de regresar vacío (no se cobra)</label>
            <div class="grid gap-2 sm:grid-cols-3">
              <NumField v-model="form.trip.repositioningKm" label="Km de reposicionamiento" hint="Para llegar al punto de carga; no facturables." />
              <NumField v-model="form.trip.extraKm" label="Km adicionales" />
              <label class="flex items-center gap-2 pt-6 text-sm"><input v-model="form.trip.extraKmBillable" type="checkbox" />Km adicionales facturables</label>
            </div>
            <div class="grid gap-2 sm:grid-cols-3">
              <CentsField v-model="form.trip.tollsOutbound" label="Casetas de ida" hint="Captura manual o de tu catálogo." />
              <CentsField v-model="form.trip.tollsReturn" label="Casetas de regreso" :disabled="form.trip.tripType === 'sencillo' && !form.trip.evaluateEmptyReturn" />
              <label class="field"><span>Casetas al cliente</span><select v-model="form.trip.tollsBilling" class="input"><option value="incluidas">Incluidas en el flete</option><option value="aparte">Se cobran aparte</option></select></label>
            </div>
          </div>
        </template>

        <!-- Paso 2 -->
        <template v-if="step === 1 && form.unit">
          <div class="card space-y-3 p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-2">Unidad</h3>
            <label class="field"><span>Unidad</span>
              <select :value="form.vehicleId" class="input" @change="changeVehicle(Number(($event.target as HTMLSelectElement).value))">
                <optgroup label="Plataformas y cajas secas"><option v-for="v in unitOptions" :key="v.id" :value="v.id">{{ v.name }} · {{ v.unit_type === 'plataforma' ? 'Plataforma' : 'Caja seca' }}{{ v.length_ft ? ` ${v.length_ft} ft` : '' }}</option></optgroup>
                <optgroup v-if="otherVehicles.length" label="Otros perfiles (se cotizan con valores de plataforma)"><option v-for="v in otherVehicles" :key="v.id" :value="v.id">{{ v.name }}</option></optgroup>
              </select>
            </label>
            <div class="grid gap-2 sm:grid-cols-4">
              <label class="field"><span>Largo</span><select v-model.number="form.unit.lengthFt" class="input"><option :value="40">40 pies</option><option :value="48">48 pies</option><option :value="53">53 pies</option><option v-if="![40, 48, 53].includes(form.unit.lengthFt)" :value="form.unit.lengthFt">{{ form.unit.lengthFt }} pies</option></select></label>
              <NumField v-model="form.unit.maxWeightTons" label="Capacidad (t)" />
              <NumField v-model="form.unit.maxPallets" label="Capacidad (pallets)" />
              <span class="self-end pb-1.5 text-xs text-text-dimmed">Tipo: {{ form.unit.unitType === 'plataforma' ? 'Plataforma / plana' : 'Caja seca' }}</span>
            </div>
          </div>
          <div class="card space-y-3 p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-2">Carga</h3>
            <div class="grid gap-2 sm:grid-cols-3">
              <NumField v-model="form.cargo.weightTons" label="Peso total (t)" :min="0" />
              <NumField v-model="form.cargo.pallets" label="Pallets" :min="0" :step="1" />
              <label class="field"><span>Tipo de mercancía</span><input v-model="form.cargo.goods" class="input" /></label>
            </div>
            <details class="rounded-md border border-line p-2" :open="!quick">
              <summary class="cursor-pointer text-sm text-text-muted">Dimensiones, fechas y requerimientos</summary>
              <div class="mt-2 grid gap-2 sm:grid-cols-3">
                <NumField v-model="form.cargo.lengthM" label="Largo (m)" /><NumField v-model="form.cargo.widthM" label="Ancho (m)" /><NumField v-model="form.cargo.heightM" label="Alto (m)" />
                <label class="field"><span>Fecha estimada de carga</span><input v-model="form.cargo.loadDate" type="date" class="input" /></label>
                <label class="field"><span>Fecha estimada de entrega</span><input v-model="form.cargo.deliveryDate" type="date" class="input" /></label>
                <label class="field"><span>Carga y descarga por cuenta del</span><select v-model="form.cargo.handling" class="input"><option value="cliente">Cliente</option><option value="transportista">Transportista</option></select></label>
                <label class="flex items-center gap-2 text-sm"><input v-model="form.cargo.tarp" type="checkbox" />Requiere lona</label>
                <label class="flex items-center gap-2 text-sm"><input v-model="form.cargo.straps" type="checkbox" />Requiere amarres</label>
              </div>
              <label class="field mt-2"><span>Observaciones</span><textarea v-model="form.cargo.notes" class="input" rows="2" /></label>
            </details>
          </div>
        </template>

        <!-- Paso 3 -->
        <template v-if="step === 2 && form.costs">
          <div class="card space-y-3 p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-2">Combustible</h3>
            <div class="grid gap-2 sm:grid-cols-3">
              <CentsField v-model="form.costs.dieselPerLiter" label="Diésel por litro" :hint="defaults?.sources.diesel" />
              <NumField v-model="form.unit.kmPerLiterLoaded" label="Rendimiento cargado (km/L)" />
              <NumField v-model="form.unit.kmPerLiterEmpty" label="Rendimiento vacío (km/L)" />
            </div>
          </div>
          <div class="card space-y-3 p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-2">Operador</h3>
            <div class="grid gap-2 sm:grid-cols-3">
              <label class="field"><span>Modelo de pago</span><select v-model="form.costs.operatorModel" class="input"><option value="por_km">Pago por km recorrido</option><option value="fijo">Sueldo fijo por viaje</option><option value="porcentaje">% sobre el flete</option></select></label>
              <CentsField v-if="form.costs.operatorModel === 'por_km'" v-model="form.costs.operatorPerKm" label="Pago por km" />
              <CentsField v-if="form.costs.operatorModel === 'fijo'" v-model="form.costs.operatorFixed" label="Sueldo del viaje" />
              <NumField v-if="form.costs.operatorModel === 'porcentaje'" v-model="form.costs.operatorPct" label="% del flete" suffix="%" />
              <CentsField v-model="form.costs.operatorPerDiem" label="Viáticos" />
            </div>
          </div>
          <div class="card space-y-2 p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-2">Otros costos operativos</h3>
            <p class="text-xs text-text-dimmed">{{ defaults?.sources.perKm }}</p>
            <div v-for="(x, i) in form.costs.perKmCosts" :key="`k${i}`" class="grid grid-cols-[1fr_9rem_auto] items-end gap-2">
              <label class="field"><span>Concepto por km</span><input v-model="x.name" class="input" /></label><CentsField v-model="x.perKm" suffix="/km" />
              <button class="btn-danger px-2" type="button" aria-label="Quitar" @click="form.costs.perKmCosts.splice(i, 1)"><Trash2 class="size-4" /></button>
            </div>
            <button class="btn-ghost text-xs" type="button" @click="form.costs.perKmCosts.push({ name: 'Costo por km', perKm: 0 })"><Plus class="size-3.5" />Costo por km</button>
            <div v-for="(x, i) in form.costs.fixedCosts" :key="`f${i}`" class="grid grid-cols-[1fr_9rem_auto] items-end gap-2">
              <label class="field"><span>Costo fijo del viaje</span><input v-model="x.name" class="input" /></label><CentsField v-model="x.amount" />
              <button class="btn-danger px-2" type="button" aria-label="Quitar" @click="form.costs.fixedCosts.splice(i, 1)"><Trash2 class="size-4" /></button>
            </div>
            <button class="btn-ghost text-xs" type="button" @click="form.costs.fixedCosts.push({ name: 'Costo fijo', amount: 0 })"><Plus class="size-3.5" />Costo fijo</button>
            <div class="grid gap-2 sm:grid-cols-2">
              <NumField v-model="form.costs.contingencyPct" label="Imprevistos (% del costo directo)" suffix="%" />
              <NumField v-model="form.costs.commissionPct" label="Comisiones sobre el flete" suffix="%" />
            </div>
          </div>
          <div class="card space-y-2 p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-2">Cargos opcionales</h3>
            <div v-for="(ch, i) in form.charges" :key="ch.id" class="space-y-2 rounded-md border border-line p-2">
              <div class="grid gap-2 sm:grid-cols-[1fr_8rem_9rem_auto]">
                <input v-model="ch.name" class="input" aria-label="Nombre del cargo" />
                <select v-model="ch.type" class="input" aria-label="Tipo"><option value="fijo">Importe fijo</option><option value="porcentaje">Porcentaje</option></select>
                <CentsField v-if="ch.type === 'fijo'" v-model="ch.value" /><NumField v-else v-model="ch.value" suffix="%" />
                <button class="btn-danger px-2" type="button" aria-label="Quitar cargo" @click="form.charges.splice(i, 1)"><Trash2 class="size-4" /></button>
              </div>
              <div class="flex flex-wrap gap-3 text-xs">
                <label v-if="ch.type === 'porcentaje'" class="flex items-center gap-1">Base <select v-model="ch.base" class="input w-auto py-0.5 text-xs"><option value="flete">Flete base</option><option value="costo_operativo">Costo operativo</option></select></label>
                <label class="flex items-center gap-1">Clasificación <select v-model="ch.classification" class="input w-auto py-0.5 text-xs"><option value="comercial">Cargo comercial</option><option value="costo">Costo (pago a tercero)</option></select></label>
                <label class="flex items-center gap-1"><input v-model="ch.billToClient" type="checkbox" />Cobrar al cliente</label>
                <label class="flex items-center gap-1"><input v-model="ch.taxable" type="checkbox" />Aplica IVA</label>
                <span v-if="selected" class="text-text-muted">= {{ c(selected.charges.find((x) => x.id === ch.id)?.amount ?? 0) }}<template v-if="ch.type === 'porcentaje'"> ({{ ch.value }}% de {{ c(selected.charges.find((x) => x.id === ch.id)?.baseAmount ?? 0) }})</template></span>
              </div>
            </div>
            <div class="flex flex-wrap gap-1">
              <button v-for="t in catalog" :key="t.name" class="btn-soft px-2 py-0.5 text-xs" type="button" @click="addCharge(t)">+ {{ t.name }}</button>
              <button class="btn-ghost px-2 py-0.5 text-xs" type="button" @click="addCharge()">+ Personalizado</button>
            </div>
          </div>
        </template>

        <!-- Paso 4 -->
        <template v-if="step === 3 && form.pricing">
          <div class="card space-y-3 p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-2">Tarifas y objetivos ({{ form.unit.unitType === 'plataforma' ? 'plataforma' : 'caja seca' }})</h3>
            <p class="text-xs text-text-dimmed">{{ defaults?.sources.rates }}</p>
            <div class="grid gap-2 sm:grid-cols-3">
              <CentsField v-model="form.pricing.minRate" label="Tarifa mínima" suffix="/km" /><CentsField v-model="form.pricing.targetRate" label="Tarifa objetivo" suffix="/km" /><CentsField v-model="form.pricing.maxRate" label="Tarifa máxima" suffix="/km" />
              <NumField v-model="form.pricing.targetMarginPct" label="Margen objetivo (sobre venta)" suffix="%" /><CentsField v-model="form.pricing.minProfit" label="Ganancia mínima esperada" /><CentsField v-model="form.pricing.minTripPrice" label="Precio mínimo por viaje" />
              <label class="field"><span>Redondeo comercial</span><select v-model="form.pricing.roundingMode" class="input"><option value="ninguno">Sin redondeo</option><option value="cercano">Al más cercano</option><option value="arriba">Hacia arriba</option></select></label>
              <CentsField v-model="form.pricing.rounding" label="Múltiplo de redondeo" :disabled="form.pricing.roundingMode === 'ninguno'" />
              <div class="grid grid-cols-2 gap-2"><NumField v-model="form.pricing.taxPct" label="IVA" suffix="%" /><NumField v-model="form.pricing.retentionPct" label="Retención IVA" suffix="%" hint="4% si el cliente retiene." /></div>
            </div>
          </div>
          <div class="card space-y-2 p-3">
            <div class="card-head -mx-3 -mt-3 mb-2">Alternativas <button class="btn-ghost ml-auto px-2 py-0.5 text-xs" type="button" @click="regenerate">Regenerar desde la banda</button></div>
            <div v-for="(s, i) in form.scenarios" :key="s.id" class="grid items-end gap-2 sm:grid-cols-[1fr_9rem_10rem_auto_auto]">
              <label class="field"><span>Nombre</span><input v-model="s.label" class="input" /></label>
              <label class="field"><span>Tipo</span><select :value="s.kind" class="input" @change="(e) => { const k = (e.target as HTMLSelectElement).value as ScenarioSpec['kind']; form.scenarios[i] = k === 'tarifa' ? { id: s.id, label: s.label, kind: k, rate: form.pricing.targetRate } : k === 'precio' ? { id: s.id, label: s.label, kind: k, freight: 0 } : { id: s.id, label: s.label, kind: k, marginPct: form.pricing.targetMarginPct }; }"><option value="tarifa">Tarifa por km</option><option value="precio">Precio fijo del flete</option><option value="margen">Margen objetivo</option></select></label>
              <CentsField v-if="s.kind === 'tarifa'" v-model="s.rate" suffix="/km" />
              <CentsField v-else-if="s.kind === 'precio'" v-model="s.freight" />
              <NumField v-else v-model="s.marginPct" suffix="%" />
              <button class="btn-ghost px-2 text-xs" type="button" @click="duplicateScenario(s)">Duplicar</button>
              <button class="btn-danger px-2" type="button" aria-label="Quitar alternativa" :disabled="form.scenarios.length <= 1" @click="form.scenarios.splice(i, 1)"><Trash2 class="size-4" /></button>
            </div>
            <div class="flex flex-wrap gap-1">
              <button class="btn-soft px-2 py-0.5 text-xs" type="button" @click="addScenario('tarifa')">+ Por tarifa</button>
              <button class="btn-soft px-2 py-0.5 text-xs" type="button" @click="addScenario('precio')">+ Precio fijo</button>
              <button class="btn-soft px-2 py-0.5 text-xs" type="button" @click="addScenario('margen')">+ Por margen</button>
            </div>
          </div>
        </template>

        <!-- Paso 5 -->
        <template v-if="step === 4">
          <div v-if="result" class="card p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-3">Comparación y recomendación</h3>
            <KmComparison :result="result" :selected-id="selected?.id ?? null" selectable @select="(id) => (form.selectedScenarioId = id)" />
          </div>
          <div v-if="quick && form.pricing" class="card grid gap-2 p-3 sm:grid-cols-3">
            <NumField v-model="form.pricing.targetMarginPct" label="Margen objetivo" suffix="%" />
            <CentsField v-model="form.costs.dieselPerLiter" label="Diésel por litro" />
            <CentsField v-if="form.costs.operatorModel === 'por_km'" v-model="form.costs.operatorPerKm" label="Pago operador por km" />
            <NumField v-else-if="form.costs.operatorModel === 'porcentaje'" v-model="form.costs.operatorPct" label="% operador" suffix="%" />
          </div>
        </template>

        <!-- Paso 6 -->
        <template v-if="step === 5">
          <div class="card space-y-3 p-3">
            <h3 class="card-head -mx-3 -mt-3 mb-2">Guardar</h3>
            <label v-if="!editItem" class="field"><span>Cliente</span><select v-model="form.clientId" class="input"><option :value="null">Sin cliente</option><option v-for="cl in clients" :key="cl.id" :value="cl.id">{{ cl.legal_name }}</option></select></label>
            <p class="text-sm">Alternativa elegida: <b class="text-text-highlighted">{{ selected?.label ?? '—' }}</b> · {{ selected ? c(selected.subtotal) : '' }} + IVA</p>
            <p class="text-xs text-text-dimmed">Se guardan todas las alternativas y los valores usados (diésel, tarifas, costos). Cambios posteriores en la configuración no alteran esta cotización. Después podrás exportar PDF individual o comparativo y preparar WhatsApp o correo.</p>
            <button class="btn-primary" :disabled="saving || !routeReady || !selected || !can(editItem ? 'modificar:cotizacion' : 'agregar:cotizacion')" @click="save"><Save class="size-4" />{{ editItem ? 'Guardar cambios' : 'Guardar cotización' }}</button>
            <p v-if="!routeReady" class="text-xs text-warning">Falta dirección de origen, destino o km de ida.</p>
          </div>
        </template>

        <div class="flex justify-between">
          <button class="btn-soft" :disabled="pos === 0" @click="go(-1)"><ChevronLeft class="size-4" />Anterior</button>
          <button v-if="pos < visibleSteps.length - 1" class="btn-primary" @click="go(1)">Siguiente<ChevronRight class="size-4" /></button>
        </div>
      </section>

      <!-- Resumen en vivo -->
      <aside class="fixed inset-x-0 bottom-0 z-30 max-h-[75vh] overflow-y-auto border-t border-line bg-elevated p-3 shadow-2xl lg:static lg:z-auto lg:max-h-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" aria-label="Resumen">
        <button class="flex w-full items-center justify-between lg:hidden" :aria-expanded="summaryOpen" @click="summaryOpen = !summaryOpen">
          <span class="text-sm text-text-muted">{{ selected?.label ?? 'Resumen' }}</span>
          <span class="num font-semibold text-primary">{{ selected ? c(selected.total) : '—' }}</span>
          <ChevronDown class="size-4 transition" :class="summaryOpen ? 'rotate-180' : ''" />
        </button>
        <div class="card mt-2 space-y-1 p-3 text-[13px] lg:sticky lg:top-4 lg:mt-0" :class="summaryOpen ? '' : 'hidden lg:block'">
          <h3 class="mb-1 font-semibold text-text-highlighted">Resumen · {{ selected?.label ?? '—' }}</h3>
          <template v-if="result">
            <div class="kv"><span>Km de ida</span><span>{{ num(result.km.outbound, 1) }}</span></div>
            <div class="kv"><span>Km de regreso</span><span>{{ num(result.km.return, 1) }}</span></div>
            <div class="kv"><span>Km de reposicionamiento</span><span>{{ num(result.km.repositioning, 1) }}</span></div>
            <div class="kv"><span>Km recorridos</span><span>{{ num(result.km.driven, 1) }}</span></div>
            <div class="kv font-semibold"><span>Km facturables</span><span>{{ num(result.km.billable, 1) }}</span></div>
          </template>
          <template v-if="selected">
            <div class="kv border-t border-line pt-1"><span>Tarifa por km</span><span>{{ c(selected.effectiveRate) }}</span></div>
            <div class="kv"><span>Flete base</span><span>{{ c(selected.freight) }}</span></div>
            <div class="kv"><span>Cargos facturables</span><span>{{ c(selected.subtotal - selected.freight) }}</span></div>
            <div class="kv font-semibold"><span>Precio sin IVA</span><span>{{ c(selected.subtotal) }}</span></div>
            <div class="kv"><span>IVA</span><span>{{ c(selected.tax) }}</span></div>
            <div v-if="selected.retention" class="kv"><span>Retención IVA</span><span>−{{ c(selected.retention) }}</span></div>
            <div class="kv text-base font-semibold"><span>Total</span><span class="text-primary">{{ c(selected.total) }}</span></div>
            <div class="mt-2 text-xs uppercase text-text-dimmed">Interno</div>
            <div class="kv"><span>Combustible</span><span>{{ c(selected.costs.fuel) }}</span></div>
            <div class="kv"><span>Casetas</span><span>{{ c(selected.costs.tolls) }}</span></div>
            <div class="kv"><span>Operador</span><span>{{ c(selected.costs.operator) }}</span></div>
            <div class="kv"><span>Otros costos</span><span>{{ c(selected.costs.total - selected.costs.fuel - selected.costs.tolls - selected.costs.operator) }}</span></div>
            <div class="kv font-semibold"><span>Costo operativo total</span><span>{{ c(selected.costs.total) }}</span></div>
            <div class="kv" :class="selected.surplus < 0 ? 'text-error' : 'text-success'"><span>Excedente operativo</span><span>{{ c(selected.surplus) }}</span></div>
            <div class="kv"><span>Margen / markup</span><span>{{ num(selected.marginPct, 1) }}% / {{ num(selected.markupPct, 1) }}%</span></div>
            <div v-if="selected.emptyReturn" class="kv text-warning"><span>Si regresa vacío ({{ num(selected.emptyReturn.km, 0) }} km)</span><span>{{ c(selected.emptyReturn.surplusAfter) }} · {{ num(selected.emptyReturn.marginAfterPct, 1) }}%</span></div>
          </template>
          <ul v-if="result?.warnings.length" class="mt-2 space-y-1 text-xs text-warning">
            <li v-for="w in result.warnings" :key="w.code">⚠ {{ w.message }}</li>
          </ul>
          <ul v-if="selected?.warnings.length" class="space-y-1 text-xs text-warning">
            <li v-for="w in selected.warnings" :key="w.code">⚠ {{ w.message }}</li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>
