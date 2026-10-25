<script setup lang="ts">
import { Download, Star, Trash2, Upload } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { api, download } from '../lib/api.ts';
import { can, fail, toast } from '../lib/session.ts';

const rows = ref<any[]>([]);
const vars = ref<any>(null);
const kind = ref<'quote' | 'price_list'>('quote');
const name = ref('');
const file = ref<File | null>(null);
const load = async () => {
  [rows.value, vars.value] = await Promise.all([api.get('/templates'), api.get('/templates/variables')]);
};
onMounted(() => load().catch(fail));

async function upload() {
  if (!file.value) return;
  const fd = new FormData();
  fd.append('kind', kind.value);
  fd.append('name', name.value || file.value.name.replace(/\.docx$/i, ''));
  fd.append('file', file.value);
  try {
    const res = await api.post('/templates', fd);
    toast(res.unknown.length ? `Subida. Marcadores no reconocidos: ${res.unknown.join(', ')}` : 'Plantilla subida', res.unknown.length ? 'error' : 'ok');
    file.value = null;
    name.value = '';
    await load();
  } catch (e) {
    fail(e);
  }
}
async function makeDefault(id: number) {
  await api.patch(`/templates/${id}`, { is_default: true }).catch(fail);
  load();
}
async function remove(id: number) {
  if (!confirm('¿Eliminar plantilla?')) return;
  await api.del(`/templates/${id}`).catch(fail);
  load();
}
const copy = (v: string) => navigator.clipboard?.writeText(`\${${v}}`).then(() => toast(`Copiado \${${v}}`));
</script>

<template>
  <div class="grid gap-4 p-6 lg:grid-cols-[1fr_22rem]">
    <div class="space-y-4">
      <section v-if="can('agregar:plantilla')" class="card flex flex-wrap items-end gap-2 p-3">
        <label class="field"><span>Tipo</span><select v-model="kind" class="input"><option value="quote">Cotización</option><option value="price_list">Lista de precios</option></select></label>
        <label class="field"><span>Nombre</span><input v-model="name" class="input" /></label>
        <label class="field"><span>Archivo .docx</span><input class="input" type="file" accept=".docx" @change="(e) => (file = (e.target as HTMLInputElement).files?.[0] ?? null)" /></label>
        <button class="btn-primary" :disabled="!file" @click="upload"><Upload class="size-4" />Subir plantilla</button>
      </section>
      <section class="card">
        <table class="table">
          <thead><tr><th>Plantilla</th><th>Tipo</th><th>Creada</th><th></th></tr></thead>
          <tbody>
            <tr v-for="t in rows" :key="t.id">
              <td>{{ t.name }} <span v-if="t.is_default" class="badge bg-primary/15 text-primary">Predeterminada</span><div class="text-xs text-text-dimmed">{{ t.description }}</div></td>
              <td>{{ t.kind === 'quote' ? 'Cotización' : 'Lista de precios' }}</td>
              <td class="text-xs">{{ new Date(t.created_at).toLocaleDateString('es-MX') }}</td>
              <td class="whitespace-nowrap text-right">
                <button class="btn-ghost px-1.5" aria-label="Descargar" @click="download(`/templates/${t.id}/download`, `${t.name}.docx`).catch(fail)"><Download class="size-4" /></button>
                <button v-if="can('modificar:plantilla') && !t.is_default" class="btn-ghost px-1.5" aria-label="Hacer predeterminada" @click="makeDefault(t.id)"><Star class="size-4" /></button>
                <button v-if="can('eliminar:plantilla') && !t.is_default" class="btn-danger px-1.5" aria-label="Eliminar" @click="remove(t.id)"><Trash2 class="size-4" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
    <aside v-if="vars" class="card p-3 text-sm">
      <h3 class="font-semibold text-text-highlighted">Variables disponibles</h3>
      <p class="mb-2 text-xs text-text-dimmed">Escríbelas en Word como <code>${variable}</code>. Diseña UNA fila de tabla con marcadores <code>${item_…}</code>: se repite por partida.</p>
      <template v-for="(groups, k) in vars" :key="k">
        <div v-if="k === kind" class="space-y-2">
          <div v-for="(list, g) in groups" :key="g"><div class="text-xs uppercase text-text-muted">{{ g }}</div>
            <button v-for="v in list" :key="v" class="mr-1 mt-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-accented" @click="copy(v)">${{ '{' }}{{ v }}{{ '}' }}</button></div>
        </div>
      </template>
      <p class="mt-3 text-xs text-warning">El logo dentro de Word no se sustituye en esta versión; el PDF sí usa el logo de la empresa.</p>
    </aside>
  </div>
</template>
