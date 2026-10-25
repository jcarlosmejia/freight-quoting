<script setup lang="ts">
import { Plus, Save, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { api } from '../lib/api.ts';
import { can, fail, toast } from '../lib/session.ts';

const roles = ref<any[]>([]);
const groups = ref<any[]>([]);
const selected = ref<any>(null);
const perms = ref<Set<string>>(new Set());
const load = async () => {
  [roles.value, groups.value] = await Promise.all([api.get('/roles'), api.get('/permissions')]);
  if (!selected.value && roles.value.length) pick(roles.value[0]);
};
onMounted(() => load().catch(fail));

function pick(r: any) {
  selected.value = r;
  perms.value = new Set(r.permissions);
}
const editable = computed(() => selected.value && !selected.value.is_system && can('asignar:permiso'));
const toggle = (c: string) => (perms.value.has(c) ? perms.value.delete(c) : perms.value.add(c));
function toggleGroup(g: any) {
  const all = g.permissions.every((p: any) => perms.value.has(p.code));
  g.permissions.forEach((p: any) => (all ? perms.value.delete(p.code) : perms.value.add(p.code)));
}
async function save() {
  try {
    await api.patch(`/roles/${selected.value.id}`, { permissions: [...perms.value] });
    toast('Permisos guardados');
    selected.value = null;
    await load();
  } catch (e) {
    fail(e);
  }
}
async function create() {
  const name = prompt('Nombre del rol');
  if (!name) return;
  try {
    const { id } = await api.post('/roles', { name, permissions: [] });
    await load();
    pick(roles.value.find((r) => r.id === id));
  } catch (e) {
    fail(e);
  }
}
async function remove() {
  if (!confirm(`¿Eliminar el rol ${selected.value.name}?`)) return;
  try {
    await api.del(`/roles/${selected.value.id}`);
    selected.value = null;
    load();
  } catch (e) {
    fail(e);
  }
}
</script>

<template>
  <div class="grid gap-4 p-6 lg:grid-cols-[16rem_1fr]">
    <aside class="card">
      <div class="flex items-center border-b border-line p-3"><h2 class="text-sm font-semibold uppercase text-text-muted">Roles</h2>
        <button v-if="can('agregar:rol')" class="btn-primary ml-auto px-2" @click="create"><Plus class="size-4" />Nuevo rol</button></div>
      <button v-for="r in roles" :key="r.id" class="flex w-full items-center gap-2 border-b border-line/60 px-3 py-2 text-left hover:bg-muted" :class="selected?.id === r.id ? 'bg-muted' : ''" @click="pick(r)">
        <span>{{ r.name }}</span><span v-if="r.is_system" class="badge ml-auto bg-muted text-text-muted">Sistema</span>
      </button>
    </aside>
    <section v-if="selected" class="card p-3">
      <div class="mb-3 flex items-center gap-2">
        <h2 class="font-semibold text-text-highlighted">{{ selected.name }}</h2>
        <span class="text-xs text-text-muted">{{ perms.size }} permisos seleccionados</span>
        <span v-if="selected.is_system" class="text-xs text-text-dimmed">Rol del sistema: sus permisos no se pueden editar. Crea un rol propio para personalizar.</span>
        <div class="ml-auto flex gap-2">
          <button v-if="editable" class="btn-primary" @click="save"><Save class="size-4" />Guardar</button>
          <button v-if="!selected.is_system && can('eliminar:rol')" class="btn-danger" @click="remove"><Trash2 class="size-4" /></button>
        </div>
      </div>
      <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="g in groups" :key="g.key" class="rounded-md border border-line p-2">
          <label class="flex items-center gap-2 font-medium"><input type="checkbox" :disabled="!editable" :checked="g.permissions.every((p: any) => perms.has(p.code))" @change="toggleGroup(g)" />{{ g.label }}
            <span class="ml-auto text-xs text-text-dimmed">{{ g.permissions.filter((p: any) => perms.has(p.code)).length }}/{{ g.permissions.length }}</span></label>
          <label v-for="p in g.permissions" :key="p.code" class="ml-5 flex items-center gap-2 py-0.5 text-[13px] text-text-muted">
            <input type="checkbox" :disabled="!editable" :checked="perms.has(p.code)" @change="toggle(p.code)" />{{ p.label }} <code class="text-[11px] text-text-dimmed">{{ p.code }}</code>
          </label>
        </div>
      </div>
    </section>
  </div>
</template>
