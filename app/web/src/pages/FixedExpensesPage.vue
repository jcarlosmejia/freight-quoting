<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { money, num } from '../../../shared/format.ts';
import CrudTable from '../components/CrudTable.vue';
import { api } from '../lib/api.ts';
import { fail } from '../lib/session.ts';

const summary = ref<any>(null);
const load = () => api.get('/fleet-summary').then((s) => (summary.value = s)).catch(fail);
onMounted(load);
const periods = ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual'].map((p) => ({ label: p, value: p }));
</script>

<template>
  <div class="space-y-4 p-6">
    <section v-if="summary" class="card p-4">
      <h2 class="mb-3 font-semibold text-text-highlighted">Tarifa de recuperación</h2>
      <div class="grid gap-3 md:grid-cols-4">
        <div><div class="text-xs uppercase text-text-muted">Gastos fijos anuales</div><div class="num text-xl text-text-highlighted">{{ money(summary.annualExpenses) }}</div><div class="text-xs text-text-dimmed">Suma anualizada del catálogo (Mensual ×12, Bimestral ×6…)</div></div>
        <div><div class="text-xs uppercase text-text-muted">Vehículos</div><div class="num text-xl text-text-highlighted">{{ summary.vehicles }}</div><div class="text-xs text-text-dimmed">Total de la flota</div></div>
        <div><div class="text-xs uppercase text-text-muted">Horas facturables / año</div><div class="num text-xl text-text-highlighted">{{ num(summary.billableHours, 0) }}</div><div class="text-xs text-text-dimmed">Σ (días × horas × vehículos)</div></div>
        <div><div class="text-xs uppercase text-text-muted">Tarifa de recuperación / hora</div><div class="num text-xl text-primary">{{ money(summary.hourlyRecovery) }}</div><div class="text-xs text-text-dimmed">{{ money(summary.annualExpenses) }} ÷ {{ num(summary.billableHours, 0) }} h</div></div>
      </div>
      <p class="mt-3 text-xs text-text-dimmed">Usa horas realmente facturables, no las horas que la unidad está disponible. Sobrestimarlas baja la tarifa y hace que subrecuperes gastos fijos.</p>
    </section>
    <CrudTable
      endpoint="/fleet-categories"
      title="Categorías de vehículo (tiempo efectivo)"
      :perms="{ create: 'agregar:gasto_fijo', update: 'modificar:gasto_fijo', remove: 'eliminar:gasto_fijo' }"
      :defaults="{ vehicles: 0, days_per_year: 312, hours_per_day: 8 }"
      :columns="[
        { key: 'name', label: 'Categoría', required: true },
        { key: 'vehicles', label: 'Vehículos', type: 'number' },
        { key: 'days_per_year', label: 'Días / año', type: 'number' },
        { key: 'hours_per_day', label: 'Horas / día', type: 'number' },
        { key: 'total', label: 'Total horas / año', readonly: true, format: (r) => num(r.vehicles * r.days_per_year * r.hours_per_day, 0) },
      ]"
      @changed="load"
    />
    <CrudTable
      endpoint="/general-expenses"
      title="Gastos fijos generales"
      :perms="{ create: 'agregar:gasto_fijo', update: 'modificar:gasto_fijo', remove: 'eliminar:gasto_fijo' }"
      :defaults="{ period: 'Mensual' }"
      :columns="[
        { key: 'name', label: 'Concepto', required: true },
        { key: 'period', label: 'Periodicidad', type: 'select', options: periods },
        { key: 'amount', label: 'Monto (sin IVA)', type: 'money', required: true },
        { key: 'notes', label: 'Notas', type: 'textarea' },
      ]"
      @changed="load"
    />
  </div>
</template>
