<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { civilDate, money, num } from '../../../shared/format.ts';
import CrudTable from '../components/CrudTable.vue';
import ModalDialog from '../components/ModalDialog.vue';
import NumField from '../components/NumField.vue';
import { api } from '../lib/api.ts';
import { can, fail, toast } from '../lib/session.ts';

const plazas = ref<any[]>([]);
const routes = ref<any[]>([]);
const plazaOpen = ref(false);
const plaza = ref<any>({ name: '', highway: '', source: '', notes: '' });
const rateFor = ref<any>(null);
const rate = ref<any>({ vehicle_class: '', direction: 'ambos', amount: 0, effective_from: new Date().toISOString().slice(0, 10), source: '' });

const load = async () => {
  [plazas.value, routes.value] = await Promise.all([api.get('/tolls'), api.get('/saved-routes')]);
};
onMounted(() => load().catch(fail));

async function savePlaza() {
  try {
    await api.post('/tolls', plaza.value);
    plazaOpen.value = false;
    plaza.value = { name: '', highway: '', source: '', notes: '' };
    await load();
  } catch (e) {
    fail(e);
  }
}
async function saveRate() {
  try {
    await api.post(`/tolls/${rateFor.value.id}/rates`, rate.value);
    rateFor.value = null;
    toast('Tarifa agregada');
    await load();
  } catch (e) {
    fail(e);
  }
}
async function del(url: string) {
  if (!confirm('¿Eliminar?')) return;
  await api.del(url).catch(fail);
  load();
}
</script>

<template>
  <div class="space-y-4 p-6">
    <div class="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
      Las casetas y tarifas de esta instalación las captura tu equipo con su fuente y vigencia. No se incluye un catálogo oficial de SCT/CAPUFE; los datos de ejemplo son sintéticos. Verifica clase vehicular, sentido y vigencia antes de cotizar a clientes.
    </div>
    <section class="card">
      <div class="flex items-center border-b border-line p-3"><h2 class="font-semibold text-text-highlighted">Casetas</h2>
        <button v-if="can('agregar:ruta')" class="btn-primary ml-auto" @click="plazaOpen = true"><Plus class="size-4" />Caseta</button></div>
      <table class="table">
        <thead><tr><th>Caseta</th><th>Carretera</th><th>Tarifas (clase · sentido · monto · vigencia · fuente)</th><th>Fuente</th><th></th></tr></thead>
        <tbody>
          <tr v-for="p in plazas" :key="p.id">
            <td>{{ p.name }}</td><td>{{ p.highway ?? '—' }}</td>
            <td><div v-for="r in p.rates" :key="r.id" class="text-xs">{{ r.vehicle_class }} · {{ r.direction }} · <b>{{ money(r.amount) }}</b> · desde {{ civilDate(r.effective_from, 'short') }} · {{ r.source }}</div>
              <button v-if="can('agregar:ruta')" class="btn-ghost mt-1 px-2 py-0.5 text-xs text-primary" @click="rateFor = p">+ Tarifa</button></td>
            <td class="text-xs text-text-muted">{{ p.source }}</td>
            <td><button v-if="can('eliminar:ruta')" class="btn-danger px-1.5" aria-label="Eliminar caseta" @click="del(`/tolls/${p.id}`)"><Trash2 class="size-4" /></button></td>
          </tr>
        </tbody>
      </table>
    </section>
    <CrudTable
      endpoint="/locations"
      title="Bases y ubicaciones"
      :perms="{ create: 'agregar:ruta', update: 'agregar:ruta', remove: 'eliminar:ruta' }"
      :defaults="{ kind: 'ubicacion' }"
      :columns="[
        { key: 'name', label: 'Nombre', required: true },
        { key: 'kind', label: 'Tipo', type: 'select', options: [{ label: 'Base', value: 'base' }, { label: 'Ubicación', value: 'ubicacion' }] },
        { key: 'address', label: 'Dirección' },
        { key: 'lat', label: 'Latitud', type: 'number', hint: 'Opcional; necesaria para calcular rutas con un proveedor.' },
        { key: 'lon', label: 'Longitud', type: 'number' },
      ]"
    />
    <section class="card">
      <div class="border-b border-line p-3"><h2 class="font-semibold text-text-highlighted">Rutas guardadas</h2></div>
      <table class="table">
        <thead><tr><th>Nombre</th><th>Paradas</th><th class="text-right">Km</th><th class="text-right">Manejo</th><th class="text-right">Casetas</th><th>Origen de datos</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in routes" :key="r.id">
            <td>{{ r.name }}</td><td class="text-xs">{{ r.route.stops.map((s: any) => `${s.label}${s.loaded ? '' : ' (vacío)'}`).join(' → ') }}</td>
            <td class="num text-right">{{ num(r.route.legMeters.reduce((a: number, b: number) => a + b, 0) / 1000, 1) }}</td>
            <td class="num text-right">{{ num(r.route.drivingSeconds / 60, 0) }} min</td>
            <td class="num text-right">{{ money(r.route.tollsCash) }}</td>
            <td>{{ r.routing_source }}</td>
            <td><button v-if="can('eliminar:ruta')" class="btn-danger px-1.5" aria-label="Eliminar ruta" @click="del(`/saved-routes/${r.id}`)"><Trash2 class="size-4" /></button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <ModalDialog v-model:open="plazaOpen" title="Nueva caseta">
      <div class="grid gap-2">
        <label class="field"><span>Nombre *</span><input v-model="plaza.name" class="input" /></label>
        <label class="field"><span>Carretera</span><input v-model="plaza.highway" class="input" /></label>
        <label class="field"><span>Fuente *</span><input v-model="plaza.source" class="input" placeholder="Publicación oficial, ticket, fecha de consulta…" /></label>
        <label class="field"><span>Notas</span><textarea v-model="plaza.notes" class="input" /></label>
      </div>
      <template #footer><button class="btn-primary" @click="savePlaza">Guardar</button></template>
    </ModalDialog>
    <ModalDialog :open="!!rateFor" :title="`Tarifa · ${rateFor?.name ?? ''}`" @update:open="(v) => !v && (rateFor = null)">
      <div class="grid grid-cols-2 gap-2">
        <label class="field"><span>Clase vehicular *</span><input v-model="rate.vehicle_class" class="input" placeholder="T3-S2" /></label>
        <label class="field"><span>Sentido</span><input v-model="rate.direction" class="input" placeholder="ambos / A→B" /></label>
        <NumField v-model="rate.amount" label="Monto" prefix="$" />
        <label class="field"><span>Vigente desde</span><input v-model="rate.effective_from" type="date" class="input" /></label>
        <label class="field col-span-2"><span>Fuente *</span><input v-model="rate.source" class="input" /></label>
      </div>
      <template #footer><button class="btn-primary" @click="saveRate">Agregar</button></template>
    </ModalDialog>
  </div>
</template>
