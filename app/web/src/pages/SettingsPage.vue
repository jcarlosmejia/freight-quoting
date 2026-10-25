<script setup lang="ts">
import { Download, Save, Upload } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import NumField from '../components/NumField.vue';
import KmSettings from '../components/km/KmSettings.vue';
import { api, download } from '../lib/api.ts';
import { can, fail, loadSession, toast } from '../lib/session.ts';

const section = ref<'empresa' | 'numeracion' | 'tarifas' | 'integraciones' | 'preferencias' | 'respaldo'>('empresa');
const company = ref<any>(null);
const prefs = ref<any>(null);
const integ = ref<any>(null);
const events = ref<any[]>([]);
const smtp = ref<any>({ host: '', port: 587, secure: false, user: '', password: '', from: '' });
const logoUrl = ref('');

async function load() {
  if (can('ver:empresa')) {
    company.value = await api.get('/company');
    prefs.value = { ...company.value.preferences, cargoTypes: company.value.preferences.cargoTypes.map((c: any) => ({ ...c })) };
    logoUrl.value = company.value.logo_path ? `/api/company/logo?t=${Date.now()}` : '';
  }
  if (can('ver:integracion')) {
    integ.value = await api.get('/integrations');
    events.value = await api.get('/integrations/events');
    const cfg = integ.value.channels.find((c: any) => c.kind === 'smtp')?.config;
    if (cfg) smtp.value = { ...cfg, password: '' };
  }
}
onMounted(() => load().catch(fail));

const wrap = (fn: () => Promise<unknown>, ok: string) => async () => {
  try {
    await fn();
    toast(ok);
    await load();
  } catch (e) {
    fail(e);
  }
};
const saveCompany = wrap(async () => {
  const { name, legal_name, rfc, website, email, phone, address } = company.value;
  await api.patch('/company', { name, legal_name, rfc, website, email, phone, address });
  await loadSession();
}, 'Empresa guardada');
const saveNumbering = wrap(() => api.patch('/company/numbering', { folio_prefix: company.value.folio_prefix, folio_digits: company.value.folio_digits, folio_include_year: !!company.value.folio_include_year }), 'Numeración guardada');
const savePrefs = wrap(() => api.patch('/company/preferences', prefs.value), 'Preferencias guardadas');
const saveSmtp = wrap(() => api.put('/integrations/smtp', smtp.value), 'SMTP guardado (cifrado)');
const removeSmtp = wrap(() => api.del('/integrations/smtp'), 'SMTP desconectado');
async function uploadLogo(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const fd = new FormData();
  fd.append('file', f);
  await wrap(() => api.post('/company/logo', fd), 'Logo actualizado')();
}
const folioExample = () => `${company.value.folio_prefix}-${company.value.folio_include_year ? `${new Date().getFullYear()}-` : ''}${'1'.padStart(company.value.folio_digits, '0')}`;
const sections = [
  ['empresa', 'Empresa', 'Datos fiscales, logo y contacto que aparecen en tus cotizaciones.'],
  ['numeracion', 'Numeración', 'Prefijo y formato del número de cotización.'],
  ['tarifas', 'Tarifas por km', 'Tarifas, costos, cargos y mensajes para plataforma y caja seca.'],
  ['integraciones', 'Integraciones', 'Canales y proveedores externos, con su estado real.'],
  ['preferencias', 'Preferencias', 'IVA por defecto, utilidad sugerida y otras preferencias.'],
  ['respaldo', 'Respaldo', 'Exporta toda la información de tu empresa.'],
] as const;
</script>

<template>
  <div class="grid gap-4 p-3 md:p-6 lg:grid-cols-[18rem_1fr]">
    <nav class="space-y-1">
      <button v-for="[k, l, d] in sections" :key="k" class="w-full rounded-md p-3 text-left hover:bg-muted" :class="section === k ? 'bg-muted' : ''" @click="section = k">
        <div class="font-medium text-text-highlighted">{{ l }}</div><div class="text-xs text-text-muted">{{ d }}</div>
      </button>
    </nav>

    <section v-if="section === 'empresa' && company" class="card space-y-3 p-4">
      <div class="flex items-center gap-3">
        <img v-if="logoUrl" :src="logoUrl" alt="Logo de la empresa" class="size-16 rounded object-contain" />
        <div v-else class="flex size-16 items-center justify-center rounded bg-muted text-xs text-text-dimmed">SIN LOGO</div>
        <label v-if="can('modificar:empresa')" class="btn-soft cursor-pointer"><Upload class="size-4" />Subir logo<input type="file" accept="image/png,image/jpeg" class="hidden" @change="uploadLogo" /></label>
        <span class="text-xs text-text-dimmed">PNG o JPG, máx. 5 MB.</span>
      </div>
      <fieldset :disabled="!can('modificar:empresa')" class="grid gap-3 md:grid-cols-2">
        <label class="field"><span>Nombre comercial *</span><input v-model="company.name" class="input" /></label>
        <label class="field"><span>Razón social</span><input v-model="company.legal_name" class="input" /></label>
        <label class="field"><span>RFC</span><input v-model="company.rfc" class="input" /></label>
        <label class="field"><span>Sitio web</span><input v-model="company.website" class="input" /></label>
        <label class="field"><span>Correo electrónico</span><input v-model="company.email" class="input" /></label>
        <label class="field"><span>Teléfono</span><input v-model="company.phone" class="input" /></label>
        <label class="field md:col-span-2"><span>Dirección</span><textarea v-model="company.address" class="input" rows="2" /></label>
        <p class="text-xs text-text-dimmed md:col-span-2">País: {{ company.country_code }} (MXN, IVA 16% por defecto). El país no se cambia desde la aplicación para no mezclar monedas.</p>
      </fieldset>
      <button v-if="can('modificar:empresa')" class="btn-primary" @click="saveCompany"><Save class="size-4" />Guardar cambios</button>
    </section>

    <section v-if="section === 'tarifas'"><KmSettings /></section>

    <section v-if="section === 'numeracion' && company" class="card space-y-3 p-4">
      <fieldset :disabled="!can('modificar:numeracion')" class="grid gap-3 md:grid-cols-3">
        <label class="field"><span>Prefijo</span><input v-model="company.folio_prefix" class="input" /></label>
        <NumField v-model="company.folio_digits" label="Dígitos del consecutivo" :min="1" :max="8" />
        <label class="flex items-center gap-2 pt-6"><input v-model="company.folio_include_year" type="checkbox" :true-value="1" :false-value="0" />Incluir año</label>
      </fieldset>
      <p class="text-sm">Ejemplo: <code class="text-primary">{{ folioExample() }}</code>. El consecutivo se reserva en una transacción; los folios no se repiten.</p>
      <button v-if="can('modificar:numeracion')" class="btn-primary" @click="saveNumbering"><Save class="size-4" />Guardar</button>
    </section>

    <section v-if="section === 'preferencias' && prefs" class="card space-y-3 p-4">
      <fieldset :disabled="!can('modificar:preferencias')" class="space-y-3">
        <div class="grid gap-3 md:grid-cols-4">
          <NumField v-model="prefs.profitPct" label="Utilidad sugerida %" /><NumField v-model="prefs.financingPct" label="Financiamiento %" />
          <NumField v-model="prefs.taxPct" label="IVA %" /><NumField v-model="prefs.validityDays" label="Vigencia (días)" />
        </div>
        <label class="field w-64"><span>Pago al operador por defecto</span>
          <select v-model="prefs.driverPayMethod" class="input"><option value="none">Sin pago variable</option><option value="per_km">Por kilómetro</option><option value="per_hour">Por hora</option><option value="percent_net">Comisión sobre neto</option><option value="percentage">Comisión sobre utilidad</option></select></label>
        <label class="flex items-center gap-2"><input v-model="prefs.driverPayApplyMargin" type="checkbox" />Aplicar utilidad sobre el pago al operador</label>
        <label class="field w-64"><span>Color de identidad en documentos</span><input v-model="prefs.brandColor" type="color" class="input h-9 p-1" /></label>
        <div class="grid gap-1 md:grid-cols-3">
          <label v-for="[k, l] in [['profitEditable', 'Usuarios pueden cambiar utilidad'], ['taxEditable', 'Usuarios pueden cambiar IVA'], ['financingEditable', 'Usuarios pueden cambiar financiamiento'], ['driverPayEditable', 'Usuarios pueden cambiar pago al operador'], ['cargoTypeEditable', 'Usuarios pueden cambiar tipo de carga']]" :key="k" class="flex items-center gap-2 text-sm"><input v-model="prefs[k]" type="checkbox" />{{ l }}</label>
        </div>
        <div><div class="mb-1 text-sm text-text-muted">Tipos de carga y aumento</div>
          <div v-for="(c, i) in prefs.cargoTypes" :key="i" class="mb-1 grid grid-cols-[1fr_8rem_auto] gap-2"><input v-model="c.name" class="input" /><NumField v-model="c.surchargePct" suffix="%" /><button class="btn-danger px-2" @click="prefs.cargoTypes.splice(i, 1)">×</button></div>
          <button class="btn-ghost px-2 py-0.5 text-primary" @click="prefs.cargoTypes.push({ name: '', surchargePct: 0 })">+ Tipo de carga</button></div>
      </fieldset>
      <p class="text-xs text-text-dimmed">Las restricciones de edición se aplican en la interfaz a usuarios no administradores; el servidor valida rangos en cada cálculo.</p>
      <button v-if="can('modificar:preferencias')" class="btn-primary" @click="savePrefs"><Save class="size-4" />Guardar</button>
    </section>

    <section v-if="section === 'integraciones' && integ" class="space-y-3">
      <div class="card divide-y divide-line">
        <div v-for="c in integ.channels" :key="c.kind" class="flex items-start gap-3 p-3">
          <span class="badge mt-0.5" :class="c.status === 'configurado' ? 'bg-success/15 text-success' : c.status === 'no_disponible' ? 'bg-muted text-text-dimmed' : 'bg-warning/15 text-warning'">{{ c.status.replace('_', ' ') }}</span>
          <div><div class="font-medium text-text-highlighted">{{ c.label }}</div><div class="text-xs text-text-muted">{{ c.detail }}</div></div>
        </div>
      </div>
      <div v-if="can('configurar:integracion')" class="card space-y-2 p-3">
        <h3 class="font-semibold text-text-highlighted">SMTP propio</h3>
        <p v-if="!integ.secretKeyConfigured" class="text-xs text-warning">Define APP_SECRET en app/.env para poder guardar la contraseña cifrada.</p>
        <div class="grid gap-2 md:grid-cols-3">
          <label class="field"><span>Servidor</span><input v-model="smtp.host" class="input" /></label><NumField v-model="smtp.port" label="Puerto" />
          <label class="flex items-center gap-2 pt-6"><input v-model="smtp.secure" type="checkbox" />TLS directo</label>
          <label class="field"><span>Usuario</span><input v-model="smtp.user" class="input" autocomplete="off" /></label>
          <label class="field"><span>Contraseña {{ smtp.hasPassword ? '(guardada; vacío = conservar)' : '' }}</span><input v-model="smtp.password" type="password" class="input" autocomplete="new-password" /></label>
          <label class="field"><span>Remitente</span><input v-model="smtp.from" class="input" /></label>
        </div>
        <div class="flex gap-2"><button class="btn-primary" @click="saveSmtp">Guardar</button><button class="btn-danger" @click="removeSmtp">Desconectar</button></div>
      </div>
      <div class="card p-3">
        <h3 class="mb-2 font-semibold text-text-highlighted">Proveedores de rutas</h3>
        <div v-for="p in integ.routing" :key="p.id" class="py-1 text-sm"><span class="badge mr-2" :class="p.configured ? 'bg-success/15 text-success' : 'bg-muted text-text-dimmed'">{{ p.configured ? 'disponible' : 'sin configurar' }}</span><b>{{ p.label }}</b> — <span class="text-text-muted">{{ p.detail }}</span></div>
      </div>
      <div class="card p-3">
        <h3 class="mb-2 font-semibold text-text-highlighted">Historial</h3>
        <div v-for="e in events" :key="e.id" class="text-xs text-text-muted">{{ new Date(e.created_at).toLocaleString('es-MX') }} · {{ e.kind }} · {{ e.event }} {{ e.detail ?? '' }} · {{ e.user_name }}</div>
        <p v-if="!events.length" class="text-xs text-text-dimmed">Sin eventos.</p>
      </div>
    </section>

    <section v-if="section === 'respaldo'" class="card space-y-2 p-4">
      <p class="text-sm">Descarga un archivo JSON con todos los datos de la empresa (sin contraseñas ni secretos). La restauración automática aún no está implementada; el archivo de la base completa está en <code>app/data/</code>.</p>
      <button v-if="can('exportar:respaldo')" class="btn-primary" @click="download('/backup', 'respaldo.json').catch(fail)"><Download class="size-4" />Exportar respaldo</button>
      <p v-else class="text-sm text-text-dimmed">Tu rol no puede exportar respaldos.</p>
    </section>
  </div>
</template>
