<script setup lang="ts">
import { Archive, ArchiveRestore, ArrowLeft, ChevronDown, Copy, Download, FileText, History, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { civilDate, duration, money, num, STATUS_LABELS, STATUS_TONE } from '../../../shared/format.ts';
import { api, download } from '../lib/api.ts';
import { can, fail, toast } from '../lib/session.ts';
import KmComparison from '../components/km/KmComparison.vue';
import SharePanel from '../components/km/SharePanel.vue';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);
const q = ref<any>(null);
const form = ref<any>({});
const clients = ref<any[]>([]);
const templates = ref<any[]>([]);
const expanded = ref<number | null>(null);
const revisions = ref<Record<number, any[]>>({});
const editable = computed(() => can('modificar:cotizacion'));

async function load() {
  q.value = await api.get(`/quotes/${id}`);
  form.value = Object.fromEntries(FIELDS.map((k) => [k, q.value[k] ?? (k === 'notes' || k === 'terms' ? '' : null)]));
  const km = q.value.items.find((i: any) => i.kind === 'km');
  if (km && !checked.value.length) checked.value = [km.snapshot.selectedScenarioId];
}
const FIELDS = ['client_id', 'status', 'valid_until', 'tax_pct', 'retention_pct', 'notes', 'terms', 'follow_up_on', 'final_amount', 'final_rate_per_km'];
const checked = ref<string[]>([]);
const internalPdf = ref(false);
const smtpReady = ref(false);
const comms = ref<any[]>([]);
const loadComms = async () => (comms.value = await api.get(`/quotes/${id}/communications`).catch(() => []));
const kmItem = computed(() => q.value?.items.find((i: any) => i.kind === 'km') ?? null);
async function selectScenario(scenarioId: string) {
  try {
    q.value = await api.post(`/quotes/${id}/items/${kmItem.value.id}/select`, { scenarioId });
    toast('Alternativa elegida; la anterior quedó en el historial.');
  } catch (e) {
    fail(e);
  }
}
async function kmPdf(ids: string[]) {
  try {
    const res = await download(`/quotes/${id}/km-pdf?scenarios=${ids.join(',')}${internalPdf.value ? '&internal=1' : ''}`, `${q.value.folio}.pdf`);
    toast(`Descargado ${res.name} (${num(res.bytes / 1024, 1)} KB)`);
  } catch (e) {
    fail(e);
  }
}
async function duplicate() {
  try {
    const d = await api.post(`/quotes/${id}/duplicate`);
    toast(`Duplicada como ${d.folio}`);
    router.push(`/admin/quotations/detail/${d.id}`);
  } catch (e) {
    fail(e);
  }
}
async function archive(v: boolean) {
  try {
    q.value = await api.patch(`/quotes/${id}`, { archived: v });
    toast(v ? 'Cotización archivada' : 'Cotización restaurada');
  } catch (e) {
    fail(e);
  }
}
onMounted(async () => {
  try {
    await load();
    [clients.value, templates.value] = await Promise.all([can('ver:cliente') ? api.get('/clients') : [], can('ver:plantilla') ? api.get('/templates') : []]);
    if (can('ver:integracion')) smtpReady.value = (await api.get('/integrations')).channels.some((c: any) => c.kind === 'smtp' && c.status === 'configurado');
    await loadComms();
  } catch (e) {
    fail(e);
  }
});

const dirty = computed(() => q.value && FIELDS.some((k) => (form.value[k] ?? '') !== (q.value[k] ?? '')));
async function saveHeader() {
  try {
    const num0 = (v: unknown) => (v === '' || v == null ? null : Number(v));
    q.value = await api.patch(`/quotes/${id}`, { ...form.value, tax_pct: Number(form.value.tax_pct), retention_pct: Number(form.value.retention_pct) || 0, final_amount: num0(form.value.final_amount), final_rate_per_km: num0(form.value.final_rate_per_km), follow_up_on: form.value.follow_up_on || null });
    toast('Cotización guardada');
  } catch (e) {
    fail(e);
  }
}
async function removeItem(itemId: number) {
  if (!confirm('¿Quitar esta partida?')) return;
  q.value = await api.del(`/quotes/${id}/items/${itemId}`).catch(fail);
}
async function recalc(item: any) {
  if (!confirm('Recalcular con los costos vigentes del vehículo. El cálculo actual se conservará en el historial. ¿Continuar?')) return;
  try {
    const res = await api.post(`/quotes/${id}/items/${item.id}/recalculate`);
    q.value = res.quote;
    revisions.value[item.id] = await api.get(`/quotes/${id}/items/${item.id}/revisions`);
    toast(`Recalculado: ${money(res.change.before)} → ${money(res.change.after)}`);
  } catch (e) {
    fail(e);
  }
}
async function toggle(item: any) {
  expanded.value = expanded.value === item.id ? null : item.id;
  if (expanded.value) revisions.value[item.id] = await api.get(`/quotes/${id}/items/${item.id}/revisions`).catch(() => []);
}
const exportOpen = ref(false);
async function exportAs(format: 'docx' | 'pdf', extra = '') {
  exportOpen.value = false;
  try {
    const res = await download(`/quotes/${id}/export?format=${format}${extra}`, `${q.value.folio}.${format}`);
    toast(`Descargado ${res.name} (${num(res.bytes / 1024, 1)} KB)`);
  } catch (e) {
    fail(e);
  }
}
async function removeQuote() {
  if (!confirm(`¿Eliminar ${q.value.folio}? Esta acción no se puede deshacer.`)) return;
  await api.del(`/quotes/${id}`).catch(fail);
  router.push('/admin/quotations/freight');
}
const margin = computed(() => (q.value && q.value.totals.subtotal > 0 ? (q.value.totals.profit / (q.value.totals.subtotal - q.value.totals.profit)) * 100 : 0));
const isReturn = (item: any) => item.kind === 'freight' && item.snapshot.result.time.kmEmpty > 0;
</script>

<template>
  <div v-if="q" class="mx-auto max-w-6xl space-y-3 p-6">
    <div class="flex flex-wrap items-center gap-3">
      <button class="btn-ghost px-1.5" aria-label="Volver" @click="router.push('/admin/quotations/freight')"><ArrowLeft class="size-5" /></button>
      <h2 class="font-mono text-xl font-bold text-text-highlighted">{{ q.folio }}</h2>
      <span class="badge" :class="STATUS_TONE[q.effective_status]">{{ STATUS_LABELS[q.effective_status] }}</span>
      <span class="text-sm text-text-muted">Emitida {{ civilDate(q.issued_on) }} · Vence {{ civilDate(q.valid_until) }}</span>
      <span v-if="q.archived_at" class="badge bg-muted text-text-muted">Archivada</span>
      <div class="relative ml-auto flex flex-wrap gap-2">
        <RouterLink v-if="editable && kmItem" :to="`/admin/km-quote?quote=${q.id}&item=${kmItem.id}`" class="btn-soft"><Pencil class="size-4" />Editar en asistente</RouterLink>
        <RouterLink v-if="editable" to="/admin/quotes" class="btn-soft"><Plus class="size-4" />Flete / renta</RouterLink>
        <button v-if="can('agregar:cotizacion')" class="btn-soft" @click="duplicate"><Copy class="size-4" />Duplicar</button>
        <button v-if="editable" class="btn-soft" @click="archive(!q.archived_at)"><component :is="q.archived_at ? ArchiveRestore : Archive" class="size-4" />{{ q.archived_at ? 'Restaurar' : 'Archivar' }}</button>
        <button v-if="can('exportar:cotizacion')" class="btn-soft" :disabled="!q.items.length" @click="exportOpen = !exportOpen"><Download class="size-4" />Descargar<ChevronDown class="size-4" /></button>
        <div v-if="exportOpen" class="absolute right-10 top-10 z-10 w-64 rounded-md border border-line bg-elevated p-1 shadow-xl">
          <button class="btn-ghost w-full justify-start" @click="exportAs('pdf')"><FileText class="size-4" />PDF para el cliente</button>
          <button class="btn-ghost w-full justify-start" @click="exportAs('pdf', '&detail=1')"><FileText class="size-4" />PDF con desglose interno</button>
          <template v-for="t in templates.filter((x) => x.kind === 'quote')" :key="t.id">
            <button class="btn-ghost w-full justify-start" @click="exportAs('docx', `&template=${t.id}`)"><FileText class="size-4" />Word · {{ t.name }}{{ t.is_default ? ' (pred.)' : '' }}</button>
          </template>
          <button v-if="!templates.length" class="btn-ghost w-full justify-start" @click="exportAs('docx')"><FileText class="size-4" />Word (plantilla predeterminada)</button>
        </div>
        <button v-if="can('eliminar:cotizacion')" class="btn-danger px-2" aria-label="Eliminar cotización" @click="removeQuote"><Trash2 class="size-4" /></button>
      </div>
    </div>

    <section class="card p-3">
      <h3 class="mb-2 font-semibold text-text-highlighted">Datos generales</h3>
      <fieldset :disabled="!editable" class="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
        <label class="field"><span>Cliente</span><select v-model="form.client_id" class="input"><option :value="null">Sin cliente</option><option v-for="c in clients" :key="c.id" :value="c.id">{{ c.legal_name }}{{ c.archived_at ? ' (archivado)' : '' }}</option></select></label>
        <label class="field"><span>Estado</span><select v-model="form.status" class="input"><option v-for="(l, k) in STATUS_LABELS" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="field"><span>Vigencia</span><input v-model="form.valid_until" class="input" type="date" /></label>
        <label class="field"><span>IVA %</span><input v-model="form.tax_pct" class="input" type="number" min="0" max="100" step="any" /></label>
        <label class="field md:col-span-2"><span>Notas / observaciones</span><input v-model="form.notes" class="input" /></label>
        <label class="field"><span>Retención IVA %</span><input v-model="form.retention_pct" class="input" type="number" min="0" max="100" step="any" /></label>
        <label class="field"><span>Seguimiento</span><input v-model="form.follow_up_on" class="input" type="date" /></label>
        <label class="field"><span>Monto final negociado (sin IVA)</span><input v-model="form.final_amount" class="input" type="number" min="0" step="0.01" /></label>
        <label class="field"><span>Tarifa final negociada ($/km)</span><input v-model="form.final_rate_per_km" class="input" type="number" min="0" step="0.01" /></label>
        <label class="field md:col-span-3"><span>Condiciones (aparecen en el PDF)</span><textarea v-model="form.terms" class="input" rows="2" placeholder="Si se deja vacío se usan las condiciones de la configuración." /></label>
      </fieldset>
      <div class="mt-2 flex justify-end"><button v-if="editable" class="btn-primary" :disabled="!dirty" @click="saveHeader"><Save class="size-4" />Guardar</button></div>
    </section>

    <section v-if="kmItem" class="card space-y-3 p-3">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="font-semibold text-text-highlighted">Alternativas de precio</h3>
        <span class="text-xs text-text-muted">{{ kmItem.snapshot.places.origin.city || kmItem.snapshot.places.origin.address }} → {{ kmItem.snapshot.places.destination.city || kmItem.snapshot.places.destination.address }} · {{ num(kmItem.snapshot.input.trip.outboundKm, 0) }} km ({{ kmItem.snapshot.input.trip.distanceSource === 'manual' ? 'captura manual' : 'proveedor' }})</span>
      </div>
      <KmComparison v-model:checked="checked" :result="kmItem.snapshot.result" :selected-id="kmItem.snapshot.selectedScenarioId" :selectable="editable" @select="selectScenario" />
      <div v-if="can('exportar:cotizacion')" class="flex flex-wrap items-center gap-2 border-t border-line pt-2">
        <button class="btn-primary" @click="kmPdf([kmItem.snapshot.selectedScenarioId])"><FileText class="size-4" />PDF de la elegida</button>
        <button class="btn-soft" :disabled="checked.length < 2" @click="kmPdf(checked)"><FileText class="size-4" />PDF comparativo ({{ checked.length }})</button>
        <button v-for="sid in checked.filter((x) => x !== kmItem.snapshot.selectedScenarioId)" :key="sid" class="btn-ghost text-xs" @click="kmPdf([sid])">PDF · {{ kmItem.snapshot.result.scenarios.find((x: any) => x.id === sid)?.label }}</button>
        <label v-if="editable" class="ml-auto flex items-center gap-2 text-xs text-warning"><input v-model="internalPdf" type="checkbox" />Incluir hoja interna con costos y margen (no enviar al cliente)</label>
      </div>
    </section>

    <section v-if="kmItem" class="space-y-2">
      <h3 class="font-semibold text-text-highlighted" :id="route.query.share ? 'compartir' : undefined">Compartir ({{ checked.length > 1 ? `${checked.length} alternativas` : 'alternativa marcada' }})</h3>
      <SharePanel :quote-id="q.id" :scenario-ids="checked.length ? checked : [kmItem.snapshot.selectedScenarioId]" :smtp-ready="smtpReady" @logged="loadComms" />
      <div class="card p-3 text-xs">
        <h4 class="mb-1 font-semibold text-text-highlighted">Historial de comunicaciones</h4>
        <div v-for="cm in comms" :key="cm.id" class="flex flex-wrap gap-2 border-b border-line/50 py-1 text-text-muted">
          <span>{{ new Date(cm.created_at).toLocaleString('es-MX') }}</span><span class="uppercase">{{ cm.channel }}</span>
          <span class="badge" :class="cm.status === 'enviado' ? 'bg-success/15 text-success' : cm.status === 'fallido' ? 'bg-error/15 text-error' : 'bg-muted text-text-muted'">{{ cm.status }}</span>
          <span>{{ cm.recipient || '—' }}</span><span>{{ cm.detail }}</span><span>{{ cm.user_name }}</span>
        </div>
        <p v-if="!comms.length" class="text-text-dimmed">Sin comunicaciones registradas.</p>
      </div>
    </section>

    <div class="grid gap-3 lg:grid-cols-[2fr_1fr]">
      <section class="card">
        <div class="flex items-center gap-2 border-b border-line p-3"><h3 class="font-semibold text-text-highlighted">Items ({{ q.items.length }})</h3></div>
        <div v-for="(item, i) in q.items" :key="item.id" class="border-b border-line/60 p-3">
          <div class="flex items-start gap-2">
            <span class="text-xs text-text-dimmed">#{{ i + 1 }}</span>
            <div class="flex-1">
              <div class="text-text-highlighted">{{ item.description }} <span v-if="isReturn(item)" class="badge bg-warning/15 text-warning">Con regreso vacío</span><span v-else-if="item.kind === 'freight'" class="badge bg-warning/10 text-warning">Solo ida</span><span v-else-if="item.kind === 'km'" class="badge bg-primary/15 text-primary">Por km · {{ item.snapshot.result.scenarios.find((x: any) => x.id === item.snapshot.selectedScenarioId)?.label }}</span><span v-else class="badge bg-info/15 text-info">Renta</span></div>
              <div class="text-xs text-text-muted">{{ item.quantity }} × {{ money(item.unit_subtotal) }} · motor {{ item.engine_version }} · calculado {{ new Date(item.snapshot.computedAt).toLocaleString('es-MX') }}</div>
            </div>
            <span class="num font-semibold text-primary">{{ money(item.quantity * item.unit_subtotal) }}</span>
            <button class="btn-ghost px-1" :aria-label="expanded === item.id ? 'Contraer' : 'Expandir'" @click="toggle(item)"><ChevronDown class="size-4" :class="expanded === item.id ? 'rotate-180' : ''" /></button>
            <button v-if="editable" class="btn-danger px-1" aria-label="Quitar partida" @click="removeItem(item.id)"><Trash2 class="size-4" /></button>
          </div>
          <div v-if="expanded === item.id" class="mt-2 grid gap-2 rounded-md bg-muted/30 p-2 text-[13px] md:grid-cols-2">
            <template v-if="item.kind === 'freight'">
              <div>
                <div class="kv"><span>Ruta</span><span>{{ item.snapshot.route.stops.map((s: any) => s.label).join(' → ') }}</span></div>
                <div class="kv"><span>Km cargado / vacío</span><span>{{ num(item.snapshot.result.time.kmLoaded) }} / {{ num(item.snapshot.result.time.kmEmpty) }}</span></div>
                <div class="kv"><span>Servicio</span><span>{{ duration(item.snapshot.result.time.serviceHours * 3600) }}</span></div>
                <div class="kv"><span>Combustible usado</span><span>{{ money(item.snapshot.params.vehicle.fuelPricePerLiter) }}/L</span></div>
              </div>
              <div>
                <div class="kv"><span>Costo total del viaje</span><span>{{ money(item.snapshot.result.tripCost) }}</span></div>
                <div class="kv"><span>Utilidad ({{ item.snapshot.result.profitPct }}%)</span><span>{{ money(item.snapshot.result.profit) }}</span></div>
                <div class="kv"><span>Peajes</span><span>{{ money(item.snapshot.result.tolls) }}</span></div>
                <div class="kv"><span>Vacío no cobrado</span><span>{{ money(item.snapshot.result.emptyNotCharged) }}</span></div>
              </div>
            </template>
            <template v-else-if="item.kind === 'km'">
              <div class="md:col-span-2 text-xs text-text-muted">Detalle completo en “Alternativas de precio”.</div>
            </template>
            <template v-else>
              <div>
                <div class="kv"><span>Periodo</span><span>{{ num(item.snapshot.result.span.operatingDays, 1) }} días · {{ num(item.snapshot.result.span.billableHours, 0) }} h</span></div>
                <div class="kv"><span>Disponibilidad</span><span>{{ money(item.snapshot.result.availability.total) }}</span></div>
                <div class="kv"><span>Uso</span><span>{{ money(item.snapshot.result.usage.total) }}</span></div>
              </div>
              <div>
                <div class="kv"><span>Utilidad</span><span>{{ money(item.snapshot.result.profit) }}</span></div>
                <div class="kv"><span>Subtotal del periodo</span><span>{{ money(item.snapshot.result.periodSubtotal) }}</span></div>
              </div>
            </template>
            <div class="flex items-center gap-2 md:col-span-2">
              <button v-if="editable" class="btn-soft" @click="recalc(item)"><RefreshCw class="size-4" />Recalcular con costos actuales</button>
              <span class="text-xs text-text-dimmed"><History class="inline size-3.5" /> {{ revisions[item.id]?.length ?? 0 }} versiones anteriores</span>
              <span v-for="rv in revisions[item.id] ?? []" :key="rv.id" class="badge bg-muted text-text-muted">{{ money(rv.unit_subtotal) }} · {{ new Date(rv.replaced_at).toLocaleDateString('es-MX') }}</span>
            </div>
          </div>
        </div>
        <p v-if="!q.items.length" class="p-6 text-center text-sm text-text-dimmed">Sin partidas. Usa “Flete / renta” para agregar.</p>
      </section>
      <section class="card p-3">
        <h3 class="mb-2 font-semibold text-text-highlighted">Totales</h3>
        <div class="kv"><span>Subtotal</span><span>{{ money(q.totals.subtotal) }}</span></div>
        <div class="kv text-xs"><span>{{ kmItem ? 'Excedente operativo estimado' : 'Incluye utilidad' }} (markup ≈{{ num(margin, 1) }}%)</span><span>{{ money(q.totals.profit) }}</span></div>
        <div class="kv border-t border-line pt-1"><span>IVA ({{ q.totals.taxPct }}%)</span><span>{{ money(q.totals.tax) }}</span></div>
        <div v-if="q.totals.retention" class="kv"><span>Retención IVA ({{ q.totals.retentionPct }}%)</span><span>−{{ money(q.totals.retention) }}</span></div>
        <div v-if="q.final_amount != null" class="kv text-success"><span>Monto final negociado</span><span>{{ money(q.final_amount) }}</span></div>
        <div class="mt-1 flex justify-between text-lg font-semibold"><span class="text-primary">Total</span><span class="num text-primary">{{ money(q.totals.total) }}</span></div>
        <p class="mt-2 text-xs text-text-dimmed">El IVA de la cotización se aplica sobre el subtotal; el IVA capturado en el cotizador sólo se usa como vista previa.</p>
      </section>
    </div>
  </div>
</template>
