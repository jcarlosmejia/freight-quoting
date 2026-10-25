<script setup lang="ts">
import { ArchiveRestore, Download } from 'lucide-vue-next';
import CrudTable from '../components/CrudTable.vue';
import { api, download } from '../lib/api.ts';
import { can, fail, toast } from '../lib/session.ts';

async function restore(row: any, reload: () => Promise<void>) {
  try {
    await api.patch(`/clients/${row.id}/restore`, {});
    toast('Cliente restaurado');
    await reload();
  } catch (e) {
    fail(e);
  }
}
</script>

<template>
  <div class="space-y-3 p-6">
    <div class="flex justify-end">
      <button v-if="can('exportar:cliente')" class="btn-soft" @click="download('/clients-export.csv', 'clientes.csv').catch(fail)"><Download class="size-4" />Exportar CSV</button>
    </div>
    <CrudTable
      endpoint="/clients"
      title="Clientes"
      remove-label="Archivar"
      :row-class="(r) => (r.archived_at ? 'opacity-50' : '')"
      :perms="{ create: 'agregar:cliente', update: 'modificar:cliente', remove: 'archivar:cliente' }"
      :columns="[
        { key: 'legal_name', label: 'Razón social', required: true },
        { key: 'trade_name', label: 'Nombre comercial' },
        { key: 'rfc', label: 'RFC', hint: '12 caracteres (moral) o 13 (física).' },
        { key: 'contact_name', label: 'Persona de contacto' },
        { key: 'phone', label: 'Teléfono', hint: 'Código de país + 10 dígitos.' },
        { key: 'email', label: 'Correo electrónico' },
        { key: 'address', label: 'Dirección', type: 'textarea', hideInTable: true },
        { key: 'notes', label: 'Notas internas', type: 'textarea', hideInTable: true, hint: 'Solo visibles para tu equipo; no aparecen en la cotización.' },
        { key: 'archived_at', label: 'Estado', readonly: true, format: (r) => (r.archived_at ? 'Archivado' : 'Activo') },
      ]"
    >
      <template #actions="{ row, reload }">
        <button v-if="row.archived_at && can('archivar:cliente')" class="btn-ghost px-1.5" title="Restaurar" @click="restore(row, reload)"><ArchiveRestore class="size-4" /></button>
      </template>
    </CrudTable>
  </div>
</template>
