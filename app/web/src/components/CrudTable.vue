<script setup lang="ts">
// Tabla con alta/edición/baja contra un recurso REST del backend local.
import { Pencil, Plus, Search, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { money } from '../../../shared/format.ts';
import { api } from '../lib/api.ts';
import { can, fail, toast } from '../lib/session.ts';
import ModalDialog from './ModalDialog.vue';

export interface Column {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'money' | 'textarea' | 'select';
  options?: { label: string; value: string | number }[];
  required?: boolean;
  hideInTable?: boolean;
  /** Sólo se muestra en la tabla; no se edita ni se envía. */
  readonly?: boolean;
  hint?: string;
  format?: (row: any) => string;
}

const props = defineProps<{
  endpoint: string;
  columns: Column[];
  perms: { create: string; update: string; remove: string };
  title: string;
  defaults?: Record<string, unknown>;
  removeLabel?: string;
  rowClass?: (row: any) => string;
}>();
const emit = defineEmits<{ changed: [] }>();

const rows = ref<any[]>([]);
const q = ref('');
const editing = ref<Record<string, any> | null>(null);
const open = ref(false);

async function load() {
  rows.value = await api.get(props.endpoint);
}
onMounted(() => load().catch(fail));
defineExpose({ load, rows });

const visible = computed(() => {
  const t = q.value.trim().toLowerCase();
  return t ? rows.value.filter((r) => props.columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(t))) : rows.value;
});

function startNew() {
  editing.value = { ...(props.defaults ?? {}) };
  open.value = true;
}
function startEdit(row: any) {
  editing.value = { ...row };
  open.value = true;
}
async function save() {
  const e = editing.value!;
  const payload = Object.fromEntries(props.columns.filter((c) => !c.readonly).map((c) => [c.key, c.type === 'number' || c.type === 'money' ? (e[c.key] === '' || e[c.key] == null ? null : Number(e[c.key])) : e[c.key]]));
  try {
    if (e.id) await api.patch(`${props.endpoint}/${e.id}`, payload);
    else await api.post(props.endpoint, payload);
    open.value = false;
    toast('Guardado');
    await load();
    emit('changed');
  } catch (err) {
    fail(err);
  }
}
async function remove(row: any) {
  if (!confirm(`¿${props.removeLabel ?? 'Eliminar'} este registro?`)) return;
  try {
    await api.del(`${props.endpoint}/${row.id}`);
    await load();
    emit('changed');
  } catch (err) {
    fail(err);
  }
}
const show = (row: any, c: Column) => (c.format ? c.format(row) : c.type === 'money' ? money(row[c.key]) : c.type === 'select' ? (c.options?.find((o) => o.value === row[c.key])?.label ?? row[c.key] ?? '—') : (row[c.key] ?? '—'));
</script>

<template>
  <div class="card">
    <div class="flex items-center gap-2 border-b border-line p-3">
      <h2 class="font-semibold text-text-highlighted">{{ title }}</h2>
      <span class="text-xs text-text-dimmed">{{ rows.length }} registros</span>
      <div class="relative ml-auto">
        <Search class="pointer-events-none absolute left-2 top-2 size-4 text-text-dimmed" />
        <input v-model="q" class="input w-56 pl-8" placeholder="Buscar…" aria-label="Buscar" />
      </div>
      <button v-if="can(perms.create)" class="btn-primary" @click="startNew"><Plus class="size-4" />Agregar</button>
    </div>
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th v-for="c in columns.filter((x) => !x.hideInTable)" :key="c.key">{{ c.label }}</th>
            <th class="w-20"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in visible" :key="r.id" :class="rowClass?.(r)">
            <td v-for="c in columns.filter((x) => !x.hideInTable)" :key="c.key" :class="c.type === 'money' || c.type === 'number' ? 'num text-right' : ''">{{ show(r, c) }}</td>
            <td class="whitespace-nowrap text-right">
              <slot name="actions" :row="r" :reload="load" />
              <button v-if="can(perms.update)" class="btn-ghost px-1.5" aria-label="Editar" @click="startEdit(r)"><Pencil class="size-4" /></button>
              <button v-if="can(perms.remove)" class="btn-danger px-1.5" :aria-label="removeLabel ?? 'Eliminar'" @click="remove(r)"><Trash2 class="size-4" /></button>
            </td>
          </tr>
          <tr v-if="!visible.length"><td :colspan="columns.length + 1" class="py-6 text-center text-text-dimmed">Sin registros.</td></tr>
        </tbody>
      </table>
    </div>
    <ModalDialog v-model:open="open" :title="editing?.id ? `Editar · ${title}` : `Agregar · ${title}`">
      <form v-if="editing" id="crud-form" class="grid gap-3" @submit.prevent="save">
        <label v-for="c in columns.filter((x) => !x.readonly)" :key="c.key" class="field">
          <span>{{ c.label }}<template v-if="c.required"> *</template></span>
          <textarea v-if="c.type === 'textarea'" v-model="editing[c.key]" class="input" rows="3" />
          <select v-else-if="c.type === 'select'" v-model="editing[c.key]" class="input" :required="c.required">
            <option v-for="o in c.options" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <input v-else v-model="editing[c.key]" class="input" :type="c.type === 'number' || c.type === 'money' ? 'number' : 'text'" step="any" :required="c.required" />
          <small v-if="c.hint" class="text-xs text-text-dimmed">{{ c.hint }}</small>
        </label>
      </form>
      <template #footer>
        <button class="btn-soft" @click="open = false">Cancelar</button>
        <button class="btn-primary" form="crud-form">Guardar</button>
      </template>
    </ModalDialog>
  </div>
</template>
