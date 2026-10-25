<script setup lang="ts">
import { Download, FilePlus2, Plus, RefreshCw, Trash2 } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { money, num } from '../../../shared/format.ts';
import ModalDialog from '../components/ModalDialog.vue';
import NumField from '../components/NumField.vue';
import { api, download } from '../lib/api.ts';
import { can, fail, toast } from '../lib/session.ts';

const router = useRouter();
const lists = ref<any[]>([]);
const current = ref<any>(null);
const routes = ref<any[]>([]);
const vehicles = ref<any[]>([]);
const clients = ref<any[]>([]);
const selected = ref<Set<number>>(new Set());
const createOpen = ref(false);
const form = ref<any>({ name: '', clientId: null, routeIds: [], vehicleIds: [], profitPct: 20, financingPct: 0, taxPct: 16 });

const loadLists = () => api.get('/price-lists').then((r) => (lists.value = r));
onMounted(async () => {
  try {
    await loadLists();
    const prefs = await api.get('/preferences');
    Object.assign(form.value, { profitPct: prefs.profitPct, financingPct: prefs.financingPct, taxPct: prefs.taxPct });
    [routes.value, vehicles.value, clients.value] = await Promise.all([api.get('/saved-routes'), api.get('/vehicles'), can('ver:cliente') ? api.get('/clients') : []]);
  } catch (e) {
    fail(e);
  }
});
async function open(id: number) {
  current.value = await api.get(`/price-lists/${id}`).catch(fail);
  selected.value = new Set();
}
async function create() {
  try {
    current.value = await api.post('/price-lists', form.value);
    createOpen.value = false;
    await loadLists();
    toast('Lista calculada y guardada con valores fijados');
  } catch (e) {
    fail(e);
  }
}
async function recalc() {
  if (!confirm('Recalcular todas las filas con costos vigentes, conservando utilidad, financiamiento e IVA de la lista.')) return;
  try {
    current.value = await api.post(`/price-lists/${current.value.id}/recalculate`, {});
    toast('Lista recalculada');
  } catch (e) {
    fail(e);
  }
}
async function toQuote() {
  try {
    const q = await api.post(`/price-lists/${current.value.id}/to-quote`, { rowIds: [...selected.value] });
    router.push(`/admin/quotations/detail/${q.id}`);
  } catch (e) {
    fail(e);
  }
}
async function remove() {
  if (!confirm('¿Eliminar la lista?')) return;
  await api.del(`/price-lists/${current.value.id}`).catch(fail);
  current.value = null;
  loadLists();
}
const toggle = (id: number) => (selected.value.has(id) ? selected.value.delete(id) : selected.value.add(id));
</script>

<template>
  <div class="grid gap-4 p-6 lg:grid-cols-[18rem_1fr]">
    <aside class="card">
      <div class="flex items-center border-b border-line p-3"><h2 class="font-semibold text-text-highlighted">Listas</h2>
        <button v-if="can('agregar:lista_precios')" class="btn-primary ml-auto px-2" @click="createOpen = true"><Plus class="size-4" />Nueva</button></div>
      <button v-for="l in lists" :key="l.id" class="block w-full border-b border-line/60 px-3 py-2 text-left hover:bg-muted" :class="current?.id === l.id ? 'bg-muted' : ''" @click="open(l.id)">
        <div class="text-text-highlighted">{{ l.name }}</div><div class="text-xs text-text-dimmed">{{ l.row_count }} filas · {{ l.client_name ?? 'Sin cliente' }}</div>
      </button>
      <p v-if="!lists.length" class="p-3 text-sm text-text-dimmed">Sin listas. Necesitas rutas guardadas y vehículos.</p>
    </aside>
    <section v-if="current" class="card">
      <div class="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <h2 class="font-semibold text-text-highlighted">{{ current.name }}</h2>
        <span class="text-xs text-text-muted">Utilidad {{ current.profit_pct }}% · Financiamiento {{ current.financing_pct }}% · IVA {{ current.tax_pct }}%</span>
        <div class="ml-auto flex gap-2">
          <button v-if="can('agregar:cotizacion')" class="btn-soft" :disabled="!selected.size" @click="toQuote"><FilePlus2 class="size-4" />Cotizar selección</button>
          <button v-if="can('modificar:lista_precios')" class="btn-soft" @click="recalc"><RefreshCw class="size-4" />Recalcular</button>
          <button v-if="can('exportar:lista_precios')" class="btn-soft" @click="download(`/price-lists/${current.id}/export?format=pdf`, 'lista.pdf').catch(fail)"><Download class="size-4" />PDF</button>
          <button v-if="can('exportar:lista_precios')" class="btn-soft" @click="download(`/price-lists/${current.id}/export?format=docx`, 'lista.docx').catch(fail)"><Download class="size-4" />Word</button>
          <button v-if="can('eliminar:lista_precios')" class="btn-danger px-2" aria-label="Eliminar lista" @click="remove"><Trash2 class="size-4" /></button>
        </div>
      </div>
      <table class="table">
        <thead><tr><th class="w-8"></th><th>Destino</th><th>Vehículo</th><th class="text-right">KM</th><th class="text-right">Casetas</th><th class="text-right">Precio s/IVA</th><th class="text-right">Precio c/IVA</th><th>Calculado</th></tr></thead>
        <tbody>
          <tr v-for="r in current.rows" :key="r.id">
            <td><input type="checkbox" :checked="selected.has(r.id)" :aria-label="`Seleccionar ${r.route_name}`" @change="toggle(r.id)" /></td>
            <td>{{ r.route_name }}</td><td>{{ r.vehicle_name }}</td>
            <td class="num text-right">{{ num(r.distance_meters / 1000, 1) }}</td>
            <td class="num text-right">{{ money(r.tolls) }}</td>
            <td class="num text-right">{{ money(r.unit_subtotal) }}</td>
            <td class="num text-right font-semibold">{{ money(r.price_with_tax) }}</td>
            <td class="text-xs text-text-dimmed">{{ new Date(r.computed_at).toLocaleString('es-MX') }}</td>
          </tr>
        </tbody>
      </table>
      <p class="p-3 text-xs text-text-dimmed">Los precios quedan fijados al calcular. Cambios de costos no los alteran hasta usar “Recalcular”. “Cotizar selección” copia los valores fijados.</p>
    </section>
    <section v-else class="card p-6 text-sm text-text-muted">Selecciona o crea una lista de precios (matriz ruta guardada × vehículo).</section>

    <ModalDialog v-model:open="createOpen" title="Nueva lista de precios" wide>
      <div class="grid gap-3 md:grid-cols-2">
        <label class="field"><span>Nombre *</span><input v-model="form.name" class="input" /></label>
        <label class="field"><span>Cliente</span><select v-model="form.clientId" class="input"><option :value="null">Sin cliente</option><option v-for="c in clients" :key="c.id" :value="c.id">{{ c.legal_name }}</option></select></label>
        <div><div class="mb-1 text-sm text-text-muted">Rutas guardadas</div>
          <label v-for="r in routes" :key="r.id" class="flex items-center gap-2 py-0.5 text-sm"><input v-model="form.routeIds" type="checkbox" :value="r.id" />{{ r.name }}</label>
          <p v-if="!routes.length" class="text-xs text-warning">Guarda rutas desde el cotizador o en Casetas y rutas.</p></div>
        <div><div class="mb-1 text-sm text-text-muted">Vehículos</div>
          <label v-for="v in vehicles" :key="v.id" class="flex items-center gap-2 py-0.5 text-sm"><input v-model="form.vehicleIds" type="checkbox" :value="v.id" />{{ v.name }}</label></div>
        <div class="grid grid-cols-3 gap-2 md:col-span-2"><NumField v-model="form.profitPct" label="Utilidad %" /><NumField v-model="form.financingPct" label="Financiamiento %" /><NumField v-model="form.taxPct" label="IVA %" /></div>
      </div>
      <template #footer><button class="btn-soft" @click="createOpen = false">Cancelar</button><button class="btn-primary" :disabled="!form.name || !form.routeIds.length || !form.vehicleIds.length" @click="create">Calcular y guardar</button></template>
    </ModalDialog>
  </div>
</template>
