<script setup lang="ts">
import { Copy, Pencil, Plus, Trash2 } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { money } from '../../../shared/format.ts';
import { api } from '../lib/api.ts';
import { can, fail, toast } from '../lib/session.ts';

const rows = ref<any[]>([]);
const load = () => api.get('/vehicles').then((r) => (rows.value = r)).catch(fail);
onMounted(load);

async function duplicate(id: number) {
  try {
    await api.post(`/vehicles/${id}/duplicate`);
    toast('Perfil duplicado');
    load();
  } catch (e) {
    fail(e);
  }
}
async function archive(id: number) {
  if (!confirm('¿Archivar este perfil? Las cotizaciones guardadas conservan su cálculo.')) return;
  await api.del(`/vehicles/${id}`).catch(fail);
  load();
}
</script>

<template>
  <div class="p-6">
    <div class="card">
      <div class="flex items-center gap-2 border-b border-line p-3">
        <h2 class="font-semibold text-text-highlighted">Perfiles de costo</h2>
        <RouterLink v-if="can('agregar:vehiculo')" to="/admin/vehicles/new" class="btn-primary ml-auto"><Plus class="size-4" />Registro</RouterLink>
      </div>
      <table class="table">
        <thead><tr><th>Nombre</th><th>Clase</th><th>Categoría</th><th class="text-right">Valor</th><th class="text-right">km/L cargado · vacío</th><th class="text-right">Combustible</th><th></th></tr></thead>
        <tbody>
          <tr v-for="v in rows" :key="v.id">
            <td><RouterLink :to="`/admin/vehicles/${v.id}/edit`" class="text-primary hover:underline">{{ v.name }}</RouterLink><div class="text-xs text-text-dimmed">{{ v.description }}</div></td>
            <td>{{ v.class_code ?? '—' }}</td>
            <td>{{ v.category_name ?? 'Sin categoría' }}</td>
            <td class="num text-right">{{ money(v.value) }}</td>
            <td class="num text-right">{{ v.km_per_liter_loaded }} · {{ v.km_per_liter_empty }}</td>
            <td class="num text-right">{{ money(v.fuel_price) }}/L</td>
            <td class="whitespace-nowrap text-right">
              <RouterLink :to="`/admin/vehicles/${v.id}/edit`" class="btn-ghost px-1.5" aria-label="Editar"><Pencil class="size-4" /></RouterLink>
              <button v-if="can('agregar:vehiculo')" class="btn-ghost px-1.5" aria-label="Duplicar" @click="duplicate(v.id)"><Copy class="size-4" /></button>
              <button v-if="can('eliminar:vehiculo')" class="btn-danger px-1.5" aria-label="Archivar" @click="archive(v.id)"><Trash2 class="size-4" /></button>
            </td>
          </tr>
          <tr v-if="!rows.length"><td colspan="7" class="py-6 text-center text-text-dimmed">Sin perfiles.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
