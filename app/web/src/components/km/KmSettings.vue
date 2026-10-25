<script setup lang="ts">
// Configuración global de la cotización por km. Valores distintos para plataforma y caja seca.
import { Plus, Save, Trash2 } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { api } from '../../lib/api.ts';
import { can, fail, toast } from '../../lib/session.ts';
import NumField from '../NumField.vue';
import CentsField from './CentsField.vue';

const cfg = ref<any>(null);
const tab = ref<'plataforma' | 'caja_seca'>('plataforma');
const editable = can('modificar:preferencias');
onMounted(() => api.get('/km-config').then((c) => (cfg.value = c)).catch(fail));
async function save() {
  try {
    cfg.value = await api.patch('/km-config', cfg.value);
    toast('Tarifas y mensajes guardados');
  } catch (e) {
    fail(e);
  }
}
const vars = '{cliente} {folio} {empresa} {origen} {destino} {unidad} {carga} {opciones} {vigencia} {condiciones} {contacto}';
</script>

<template>
  <fieldset v-if="cfg" :disabled="!editable" class="space-y-3">
    <section class="card space-y-3 p-4">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="font-semibold text-text-highlighted">Tarifas y costos por tipo de unidad</h3>
        <div class="ml-auto flex rounded-md bg-muted p-0.5 text-sm" role="tablist">
          <button v-for="[k, l] in [['plataforma', 'Plataforma'], ['caja_seca', 'Caja seca']]" :key="k" type="button" role="tab" class="rounded px-3 py-1" :aria-selected="tab === k" :class="tab === k ? 'bg-primary-strong text-white' : 'text-text-muted'" @click="tab = k as any">{{ l }}</button>
        </div>
      </div>
      <p class="text-xs text-text-dimmed">Las tarifas $60–$65/km vienen del requerimiento de CARMAG; margen y demás valores son ejemplos editables. Cada cotización guarda los valores que usó.</p>
      <template v-for="u in [cfg.units[tab]]" :key="tab">
        <div class="grid gap-2 sm:grid-cols-3">
          <CentsField v-model="u.pricing.minRate" label="Tarifa mínima" suffix="/km" />
          <CentsField v-model="u.pricing.targetRate" label="Tarifa objetivo" suffix="/km" />
          <CentsField v-model="u.pricing.maxRate" label="Tarifa máxima" suffix="/km" />
          <NumField v-model="u.pricing.targetMarginPct" label="Margen objetivo" suffix="%" />
          <CentsField v-model="u.pricing.minProfit" label="Ganancia mínima por viaje" />
          <CentsField v-model="u.pricing.minTripPrice" label="Precio mínimo por viaje" />
          <label class="field"><span>Redondeo comercial</span><select v-model="u.pricing.roundingMode" class="input"><option value="ninguno">Sin redondeo</option><option value="cercano">Al más cercano</option><option value="arriba">Hacia arriba</option></select></label>
          <CentsField v-model="u.pricing.rounding" label="Múltiplo" />
        </div>
        <div class="grid gap-2 sm:grid-cols-4">
          <label class="field"><span>Pago al operador</span><select v-model="u.operator.operatorModel" class="input"><option value="por_km">Por km recorrido</option><option value="fijo">Sueldo fijo por viaje</option><option value="porcentaje">% del flete</option></select></label>
          <CentsField v-model="u.operator.operatorPerKm" label="Pago por km" hint="0 = usar el del perfil del vehículo." />
          <CentsField v-model="u.operator.operatorFixed" label="Sueldo por viaje" />
          <NumField v-model="u.operator.operatorPct" label="% del flete" suffix="%" />
          <CentsField v-model="u.operator.operatorPerDiem" label="Viáticos por viaje" />
          <label class="flex items-center gap-2 pt-6 text-sm"><input v-model="u.includeDepreciation" type="checkbox" />Incluir depreciación por km</label>
        </div>
        <div class="text-xs uppercase text-text-muted">Costos fijos por viaje</div>
        <div v-for="(x, i) in u.fixedCosts" :key="i" class="grid grid-cols-[1fr_9rem_auto] gap-2"><input v-model="x.name" class="input" aria-label="Concepto" /><CentsField v-model="x.amount" /><button type="button" class="btn-danger px-2" aria-label="Quitar" @click="u.fixedCosts.splice(i, 1)"><Trash2 class="size-4" /></button></div>
        <button type="button" class="btn-ghost text-xs" @click="u.fixedCosts.push({ name: 'Costo fijo', amount: 0 })"><Plus class="size-3.5" />Costo fijo</button>
        <div class="text-xs uppercase text-text-muted">Costos adicionales por km</div>
        <div v-for="(x, i) in u.extraPerKmCosts" :key="`k${i}`" class="grid grid-cols-[1fr_9rem_auto] gap-2"><input v-model="x.name" class="input" aria-label="Concepto" /><CentsField v-model="x.perKm" suffix="/km" /><button type="button" class="btn-danger px-2" aria-label="Quitar" @click="u.extraPerKmCosts.splice(i, 1)"><Trash2 class="size-4" /></button></div>
        <button type="button" class="btn-ghost text-xs" @click="u.extraPerKmCosts.push({ name: 'Costo por km', perKm: 0 })"><Plus class="size-3.5" />Costo por km</button>
      </template>
    </section>

    <section class="card space-y-2 p-4">
      <h3 class="font-semibold text-text-highlighted">Impuestos y comunes</h3>
      <div class="grid gap-2 sm:grid-cols-3">
        <NumField v-model="cfg.taxPct" label="IVA" suffix="%" />
        <NumField v-model="cfg.retentionPct" label="Retención de IVA por defecto" suffix="%" hint="4% cuando el cliente persona moral retiene." />
        <label class="flex items-center gap-2 pt-6 text-sm"><input v-model="cfg.tollsTaxable" type="checkbox" />Casetas cobradas aparte llevan IVA</label>
        <NumField v-model="cfg.contingencyPct" label="Imprevistos" suffix="%" />
        <NumField v-model="cfg.commissionPct" label="Comisiones sobre el flete" suffix="%" />
        <label class="field"><span>Diésel por litro</span>
          <div class="flex gap-2">
            <select class="input" :value="cfg.dieselPerLiter == null ? 'perfil' : 'fijo'" @change="cfg.dieselPerLiter = ($event.target as HTMLSelectElement).value === 'perfil' ? null : 0"><option value="perfil">Del perfil del vehículo</option><option value="fijo">Precio global</option></select>
          </div>
        </label>
        <CentsField v-if="cfg.dieselPerLiter != null" v-model="cfg.dieselPerLiter" label="Precio global del diésel" hint="Valor capturado; no se consulta en línea." />
      </div>
      <label class="field"><span>Condiciones predeterminadas (PDF y correo)</span><textarea v-model="cfg.terms" class="input" rows="3" /></label>
    </section>

    <section class="card space-y-2 p-4">
      <h3 class="font-semibold text-text-highlighted">Cargos opcionales predefinidos</h3>
      <div v-for="(ch, i) in cfg.chargeCatalog" :key="i" class="grid gap-2 sm:grid-cols-[1fr_8rem_8rem_8rem_auto_auto_auto]">
        <input v-model="ch.name" class="input" aria-label="Nombre" />
        <select v-model="ch.type" class="input" aria-label="Tipo"><option value="fijo">Fijo</option><option value="porcentaje">%</option></select>
        <CentsField v-if="ch.type === 'fijo'" v-model="ch.value" /><NumField v-else v-model="ch.value" suffix="%" />
        <select v-model="ch.classification" class="input" aria-label="Clasificación"><option value="comercial">Comercial</option><option value="costo">Costo</option></select>
        <label class="flex items-center gap-1 text-xs"><input v-model="ch.billToClient" type="checkbox" />Cobrar</label>
        <label class="flex items-center gap-1 text-xs"><input v-model="ch.taxable" type="checkbox" />IVA</label>
        <button type="button" class="btn-danger px-2" aria-label="Quitar" @click="cfg.chargeCatalog.splice(i, 1)"><Trash2 class="size-4" /></button>
      </div>
      <button type="button" class="btn-ghost text-xs" @click="cfg.chargeCatalog.push({ name: 'Cargo', type: 'fijo', value: 0, base: 'flete', classification: 'comercial', taxable: true, billToClient: true })"><Plus class="size-3.5" />Cargo</button>
    </section>

    <section class="card space-y-2 p-4">
      <h3 class="font-semibold text-text-highlighted">Plantillas de mensajes</h3>
      <p class="text-xs text-text-dimmed">Variables: <code>{{ vars }}</code>. Nunca incluyen costos ni márgenes.</p>
      <label class="field"><span>WhatsApp</span><textarea v-model="cfg.messages.whatsapp" class="input" rows="5" /></label>
      <label class="field"><span>Asunto del correo</span><input v-model="cfg.messages.emailSubject" class="input" /></label>
      <label class="field"><span>Cuerpo del correo</span><textarea v-model="cfg.messages.emailBody" class="input" rows="8" /></label>
    </section>
    <button v-if="editable" class="btn-primary" type="button" @click="save"><Save class="size-4" />Guardar</button>
  </fieldset>
</template>
