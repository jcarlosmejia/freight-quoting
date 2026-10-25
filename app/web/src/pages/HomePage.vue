<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { money, STATUS_LABELS, STATUS_TONE } from '../../../shared/format.ts';
import { api } from '../lib/api.ts';
import { can, fail, session } from '../lib/session.ts';

const month = ref(new Date().toISOString().slice(0, 7));
const data = ref<any>(null);
const followUps = ref<any[]>([]);
const load = () => (can('ver:cotizacion') ? Promise.all([api.get(`/dashboard?month=${month.value}`), api.get('/follow-ups')]).then(([d, f]) => { data.value = d; followUps.value = f; }).catch(fail) : null);
onMounted(load);
</script>

<template>
  <div class="space-y-4 p-6">
    <div class="flex items-center gap-3">
      <h2 class="text-lg font-semibold text-text-highlighted">Hola, {{ session.me?.user.name }}</h2>
      <input v-if="can('ver:cotizacion')" v-model="month" type="month" class="input ml-auto w-44" aria-label="Mes" @change="load" />
    </div>
    <div v-if="data" class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <div class="card p-3"><div class="text-xs text-text-muted">Cotizaciones del mes</div><div class="num text-2xl font-semibold text-text-highlighted">{{ data.total }}</div></div>
      <div v-for="(l, k) in STATUS_LABELS" :key="k" class="card p-3">
        <div class="text-xs"><span class="badge" :class="STATUS_TONE[k]">{{ l }}</span></div>
        <div class="num mt-1 text-xl text-text-highlighted">{{ data.byStatus[k]?.count ?? 0 }}</div>
        <div class="num text-xs text-text-dimmed">{{ money(data.byStatus[k]?.amount ?? 0) }} sin IVA</div>
      </div>
    </div>
    <div v-if="data" class="card p-3 text-sm">Tasa de cierre (aceptadas / decididas): <b>{{ data.closeRate == null ? 'Sin datos' : `${(data.closeRate * 100).toFixed(1)}%` }}</b>. Los montos cotizados no representan cobros realizados.</div>
    <div v-if="followUps.length" class="card p-3">
      <h3 class="mb-2 font-semibold text-text-highlighted">Seguimientos (próximos 7 días o vencidos)</h3>
      <RouterLink v-for="f in followUps" :key="f.id" :to="`/admin/quotations/detail/${f.id}`" class="flex flex-wrap gap-2 border-b border-line/50 py-1 text-sm hover:text-primary">
        <span class="font-mono">{{ f.folio }}</span><span>{{ f.client_name ?? 'Sin cliente' }}</span><span class="badge" :class="STATUS_TONE[f.status]">{{ STATUS_LABELS[f.status] }}</span><span class="ml-auto text-xs text-text-muted">{{ f.follow_up_on }}</span>
      </RouterLink>
    </div>
    <div class="grid gap-3 md:grid-cols-3">
      <RouterLink v-if="can('agregar:cotizacion')" to="/admin/km-quote" class="card p-4 hover:border-primary"><div class="font-semibold text-primary">Cotizar por km</div><p class="text-sm text-text-muted">Plataforma o caja seca: alternativas por tarifa, margen y costo, PDF y WhatsApp.</p></RouterLink>
      <RouterLink v-if="can('agregar:cotizacion')" to="/admin/quotes" class="card p-4 hover:border-primary"><div class="font-semibold text-primary">Cotizar por costos</div><p class="text-sm text-text-muted">Flete por ruta con costeo detallado o renta por periodo.</p></RouterLink>
      <RouterLink v-if="can('ver:vehiculo')" to="/admin/vehicles" class="card p-4 hover:border-primary"><div class="font-semibold text-primary">Perfiles de costo</div><p class="text-sm text-text-muted">Valor, llantas, combustible, gastos y equipo por unidad.</p></RouterLink>
      <RouterLink v-if="can('ver:gasto_fijo')" to="/admin/bills/fixed-expenses" class="card p-4 hover:border-primary"><div class="font-semibold text-primary">Gastos fijos</div><p class="text-sm text-text-muted">Tarifa de recuperación por hora de la flota.</p></RouterLink>
    </div>
  </div>
</template>
