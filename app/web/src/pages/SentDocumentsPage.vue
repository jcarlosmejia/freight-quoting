<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { num } from '../../../shared/format.ts';
import { api } from '../lib/api.ts';
import { fail } from '../lib/session.ts';

const rows = ref<any[]>([]);
const user = ref('');
onMounted(() => api.get('/documents').then((r) => (rows.value = r)).catch(fail));
const users = computed(() => [...new Set(rows.value.map((r) => r.user_name))]);
const visible = computed(() => rows.value.filter((r) => !user.value || r.user_name === user.value));
</script>

<template>
  <div class="p-6">
    <div class="card">
      <div class="flex items-center gap-2 border-b border-line p-3">
        <h2 class="font-semibold text-text-highlighted">Documentos generados</h2>
        <select v-model="user" class="input ml-auto w-48" aria-label="Usuario"><option value="">Todos los usuarios</option><option v-for="u in users" :key="u">{{ u }}</option></select>
      </div>
      <table class="table">
        <thead><tr><th>Fecha</th><th>Documento</th><th>Formato</th><th>Canal</th><th>Estado</th><th>Usuario</th><th class="text-right">Tamaño</th><th>SHA-256</th></tr></thead>
        <tbody>
          <tr v-for="d in visible" :key="d.id">
            <td class="text-xs">{{ new Date(d.created_at).toLocaleString('es-MX') }}</td>
            <td>{{ d.source_label ?? `#${d.source_id}` }} <span class="text-xs text-text-dimmed">{{ d.file_name }}</span></td>
            <td class="uppercase">{{ d.format }}</td><td>{{ d.channel }}</td><td>{{ d.status }}</td><td>{{ d.user_name }}</td>
            <td class="num text-right">{{ num(d.bytes / 1024, 1) }} KB</td>
            <td class="font-mono text-xs text-text-dimmed">{{ d.sha256.slice(0, 12) }}…</td>
          </tr>
          <tr v-if="!visible.length"><td colspan="8" class="py-6 text-center text-text-dimmed">Sin documentos.</td></tr>
        </tbody>
      </table>
      <p class="p-3 text-xs text-text-dimmed">Esta instalación registra descargas Word/PDF. El envío por correo, WhatsApp o Telegram no está implementado.</p>
    </div>
  </div>
</template>
