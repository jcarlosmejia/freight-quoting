<script setup lang="ts">
// Comparación de alternativas: precio comercial vs. costo, excedente, margen y markup.
import { AlertTriangle, Award, BadgeDollarSign, Check, PiggyBank } from 'lucide-vue-next';
import { computed } from 'vue';
import type { KmQuoteResult } from '../../../../shared/pricing/kmquote.ts';
import { money, num } from '../../../../shared/format.ts';

const props = defineProps<{ result: KmQuoteResult; selectedId: string | null; selectable?: boolean; checked?: string[] }>();
const emit = defineEmits<{ select: [id: string]; 'update:checked': [ids: string[]] }>();
const c = (x: number) => money(x / 100);
const valid = computed(() => props.result.scenarios.filter((s) => !s.warnings.some((w) => w.code === 'imposible')));
const maxTotal = computed(() => Math.max(1, ...valid.value.map((s) => s.subtotal)));
const find = (id: string | null) => props.result.scenarios.find((s) => s.id === id);
const cards = computed(() => [
  { key: 'rec', title: 'Recomendada', icon: Award, s: find(props.result.recommendedId), tone: 'text-primary' },
  { key: 'cheap', title: 'Más económica', icon: BadgeDollarSign, s: find(props.result.cheapestId), tone: 'text-info' },
  { key: 'margin', title: 'Mejor margen', icon: PiggyBank, s: find(props.result.bestMarginId), tone: 'text-success' },
]);
function toggle(id: string) {
  const set = new Set(props.checked ?? []);
  set.has(id) ? set.delete(id) : set.add(id);
  emit('update:checked', [...set]);
}
</script>

<template>
  <div class="space-y-3">
    <div class="grid gap-2 sm:grid-cols-3">
      <div v-for="k in cards" :key="k.key" class="card p-3">
        <div class="flex items-center gap-1.5 text-xs uppercase text-text-muted"><component :is="k.icon" class="size-4" :class="k.tone" />{{ k.title }}</div>
        <template v-if="k.s">
          <div class="mt-1 font-semibold text-text-highlighted">{{ k.s.label }}</div>
          <div class="num text-lg" :class="k.tone">{{ c(k.s.subtotal) }} <span class="text-xs text-text-dimmed">+ IVA</span></div>
          <div class="num text-xs text-text-muted">Excedente {{ c(k.s.surplus) }} · margen {{ num(k.s.marginPct, 1) }}%</div>
        </template>
        <div v-else class="text-sm text-text-dimmed">—</div>
      </div>
    </div>
    <ul v-if="result.warnings.length" class="space-y-1 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-warning">
      <li v-for="w in result.warnings" :key="w.code" class="flex gap-1"><AlertTriangle class="mt-0.5 size-3 shrink-0" />{{ w.message }}</li>
    </ul>
    <p class="rounded-md border p-2 text-xs" :class="result.recommendationMeetsObjectives ? 'border-primary/30 bg-primary/5 text-primary' : 'border-warning/30 bg-warning/5 text-warning'">{{ result.recommendationReason }}</p>

    <div class="overflow-x-auto">
      <table class="table min-w-[56rem]">
        <thead>
          <tr>
            <th v-if="checked" class="w-8" aria-label="Incluir en documento"></th>
            <th>Alternativa</th><th class="text-right">$/km</th><th class="text-right">Flete</th><th class="text-right">Cargos</th><th class="text-right">Subtotal</th>
            <th class="text-right">Total c/IVA</th><th class="text-right">Costo</th><th class="text-right">Excedente</th><th class="text-right">Margen</th><th class="text-right">Markup</th><th class="w-24"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in result.scenarios" :key="s.id" :class="s.id === selectedId ? 'bg-primary/10' : ''">
            <td v-if="checked"><input type="checkbox" :checked="checked.includes(s.id)" :aria-label="`Incluir ${s.label}`" @change="toggle(s.id)" /></td>
            <td>
              <div class="flex flex-wrap items-center gap-1 font-medium text-text-highlighted">
                {{ s.label }}
                <span v-if="s.id === result.recommendedId" class="badge bg-primary/15 text-primary">Recomendada</span>
                <span v-if="s.id === result.cheapestId" class="badge bg-info/15 text-info">Económica</span>
                <span v-if="s.id === result.bestMarginId" class="badge bg-success/15 text-success">Mejor margen</span>
              </div>
              <div class="mt-1 h-1.5 w-full rounded bg-muted" aria-hidden="true">
                <div class="h-full rounded" :class="s.surplus < 0 ? 'bg-error' : s.meetsObjectives ? 'bg-success' : 'bg-warning'" :style="{ width: `${Math.max(2, (s.subtotal / maxTotal) * 100)}%` }" />
              </div>
              <ul v-if="s.warnings.length" class="mt-1 space-y-0.5">
                <li v-for="w in s.warnings" :key="w.code" class="flex gap-1 text-[11px] text-warning"><AlertTriangle class="mt-0.5 size-3 shrink-0" />{{ w.message }}</li>
              </ul>
            </td>
            <td class="num text-right">{{ s.effectiveRate ? c(s.effectiveRate) : '—' }}</td>
            <td class="num text-right">{{ c(s.freight) }}</td>
            <td class="num text-right">{{ c(s.subtotal - s.freight) }}</td>
            <td class="num text-right font-semibold">{{ c(s.subtotal) }}</td>
            <td class="num text-right">{{ c(s.total) }}</td>
            <td class="num text-right">{{ c(s.costs.total) }}</td>
            <td class="num text-right" :class="s.surplus < 0 ? 'text-error' : 'text-success'">{{ c(s.surplus) }}</td>
            <td class="num text-right">{{ num(s.marginPct, 1) }}%</td>
            <td class="num text-right">{{ num(s.markupPct, 1) }}%</td>
            <td class="text-right">
              <button v-if="selectable && s.id !== selectedId && !s.warnings.some((w) => w.code === 'imposible')" type="button" class="btn-soft px-2 py-0.5 text-xs" @click="emit('select', s.id)">Elegir</button>
              <span v-else-if="s.id === selectedId" class="inline-flex items-center gap-1 text-xs text-primary"><Check class="size-3.5" />Elegida</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-text-dimmed">Excedente operativo = precio sin IVA − costo operativo estimado. No es utilidad neta después de impuestos. Margen sobre venta = excedente / precio; markup = excedente / costo.</p>
  </div>
</template>
