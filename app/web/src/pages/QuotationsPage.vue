<script setup lang="ts">
import { Download, Plus, Route } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { civilDate, money, STATUS_LABELS, STATUS_TONE } from '../../../shared/format.ts';
import { api, download } from '../lib/api.ts';
import { can, fail } from '../lib/session.ts';

const rows = ref<any[]>([]);
const f = reactive({ q: '', status: '', from: '', to: '', archived: false });
const sort = ref<{ key: string; dir: 1 | -1 }>({ key: 'issued_on', dir: -1 });
const router = useRouter();
const query = () => new URLSearchParams(Object.entries({ q: f.q, status: f.status, from: f.from, to: f.to, archived: f.archived ? '1' : '' }).filter(([, v]) => v) as [string, string][]).toString();
let t: ReturnType<typeof setTimeout> | undefined;
const load = () => api.get(`/quotes?${query()}`).then((r) => (rows.value = r)).catch(fail);
onMounted(load);
watch(f, () => {
  clearTimeout(t);
  t = setTimeout(load, 250);
});

const visible = computed(() => [...rows.value].sort((a, b) => (a[sort.value.key] > b[sort.value.key] ? 1 : a[sort.value.key] < b[sort.value.key] ? -1 : 0) * sort.value.dir));
const by = (key: string) => (sort.value = { key, dir: sort.value.key === key ? (-sort.value.dir as 1 | -1) : 1 });
async function create() {
  try {
    const qn = await api.post('/quotes', {});
    router.push(`/admin/quotations/detail/${qn.id}`);
  } catch (e) {
    fail(e);
  }
}
const cols = [['folio', 'Folio'], ['issued_on', 'Fecha'], ['valid_until', 'Vigencia'], ['client_name', 'Cliente'], ['origin_label', 'Origen → destino'], ['status', 'Estado'], ['total', 'Total']];
</script>

<template>
  <div class="p-3 md:p-6">
    <div class="card">
      <div class="flex flex-wrap items-end gap-2 border-b border-line p-3">
        <label class="field grow sm:grow-0"><span>Buscar</span><input v-model="f.q" class="input sm:w-64" placeholder="Folio, cliente, origen o destino" /></label>
        <label class="field"><span>Estado</span><select v-model="f.status" class="input w-44"><option value="">Todos</option><option v-for="(l, k) in STATUS_LABELS" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="field"><span>Desde</span><input v-model="f.from" type="date" class="input" /></label>
        <label class="field"><span>Hasta</span><input v-model="f.to" type="date" class="input" /></label>
        <label class="flex items-center gap-1.5 pb-2 text-sm"><input v-model="f.archived" type="checkbox" />Archivadas</label>
        <div class="ml-auto flex flex-wrap gap-2">
          <button v-if="can('exportar:cotizacion')" class="btn-soft" @click="download(`/quotes-export.csv?${query()}`, 'cotizaciones.csv').catch(fail)"><Download class="size-4" />CSV</button>
          <button v-if="can('agregar:cotizacion')" class="btn-soft" @click="create"><Plus class="size-4" />En blanco</button>
          <RouterLink v-if="can('agregar:cotizacion')" to="/admin/km-quote" class="btn-primary"><Route class="size-4" />Cotizar por km</RouterLink>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="table min-w-[48rem]">
          <thead><tr><th v-for="[k, l] in cols" :key="k" class="cursor-pointer select-none" :class="k === 'total' ? 'text-right' : ''" @click="by(k)">{{ l }}{{ sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : '' }}</th></tr></thead>
          <tbody>
            <tr v-for="r in visible" :key="r.id" class="cursor-pointer" @click="router.push(`/admin/quotations/detail/${r.id}`)">
              <td class="font-mono text-primary">{{ r.folio }}</td>
              <td>{{ civilDate(r.issued_on, 'short') }}</td>
              <td>{{ civilDate(r.valid_until, 'short') }}</td>
              <td>{{ r.client_name ?? '—' }}</td>
              <td class="text-xs">{{ r.origin_label ? `${r.origin_label} → ${r.destination_label}` : '—' }}</td>
              <td><span class="badge" :class="STATUS_TONE[r.status]">{{ STATUS_LABELS[r.status] }}</span><span v-if="r.final_amount != null" class="ml-1 text-xs text-success">final {{ money(r.final_amount) }}</span></td>
              <td class="num text-right">{{ money(r.total) }}</td>
            </tr>
            <tr v-if="!visible.length"><td :colspan="cols.length" class="py-6 text-center text-text-dimmed">Sin cotizaciones con estos filtros.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="p-3 text-xs text-text-dimmed">{{ visible.length }} cotizaciones</div>
    </div>
  </div>
</template>
