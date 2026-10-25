<script setup lang="ts">
// Preparar WhatsApp y correo con texto editable. Abrir WhatsApp/correo no envía nada: el usuario envía.
// El envío por SMTP sólo ocurre al confirmar, con la integración configurada.
import { Copy, Mail, MessageCircle, Send } from 'lucide-vue-next';
import { onMounted, ref, watch } from 'vue';
import { api } from '../../lib/api.ts';
import { can, fail, toast } from '../../lib/session.ts';
import ModalDialog from '../ModalDialog.vue';

const props = defineProps<{ quoteId: number; scenarioIds: string[]; smtpReady: boolean }>();
const emit = defineEmits<{ logged: [] }>();
const msg = ref<any>(null);
const wa = ref('');
const phone = ref('');
const email = ref({ to: '', subject: '', body: '' });
const confirmOpen = ref(false);
const attach = ref(true);
const sending = ref(false);

async function load() {
  try {
    msg.value = await api.get(`/quotes/${props.quoteId}/messages?scenarios=${props.scenarioIds.join(',')}`);
    wa.value = msg.value.whatsapp;
    phone.value = msg.value.clientPhone ?? '';
    email.value = { to: msg.value.email.to, subject: msg.value.email.subject, body: msg.value.email.body };
  } catch (e) {
    fail(e);
  }
}
onMounted(load);
watch(() => props.scenarioIds.join(','), load);

const log = (channel: 'whatsapp' | 'correo', detail: string, recipient: string, body: string, subject?: string) =>
  api.post(`/quotes/${props.quoteId}/communications`, { channel, recipient, subject, body, scenarioIds: props.scenarioIds, detail }).then(() => emit('logged')).catch(fail);

async function copy(text: string, channel: 'whatsapp' | 'correo') {
  await navigator.clipboard.writeText(text);
  toast('Mensaje copiado');
  if (can('enviar:cotizacion')) log(channel, 'copiado', channel === 'whatsapp' ? phone.value : email.value.to, text, channel === 'correo' ? email.value.subject : undefined);
}
function openWhatsApp() {
  const digits = phone.value.replace(/\D/g, '');
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(wa.value)}`, '_blank', 'noopener');
  if (can('enviar:cotizacion')) log('whatsapp', 'abierto en WhatsApp (envío lo confirma el usuario)', digits, wa.value);
}
function openMail() {
  window.location.href = `mailto:${encodeURIComponent(email.value.to)}?subject=${encodeURIComponent(email.value.subject)}&body=${encodeURIComponent(email.value.body)}`;
  if (can('enviar:cotizacion')) log('correo', 'abierto en el cliente de correo (sin adjunto)', email.value.to, email.value.body, email.value.subject);
}
async function sendSmtp() {
  sending.value = true;
  try {
    const r = await api.post(`/quotes/${props.quoteId}/email`, { ...email.value, scenarioIds: props.scenarioIds, attach: attach.value, confirm: true });
    toast(`Correo enviado. ${r.detail ?? ''}`);
    confirmOpen.value = false;
    emit('logged');
  } catch (e) {
    fail(e);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div v-if="msg" class="grid gap-3 lg:grid-cols-2">
    <section class="card space-y-2 p-3">
      <h3 class="flex items-center gap-2 font-semibold text-text-highlighted"><MessageCircle class="size-4 text-success" />WhatsApp</h3>
      <label class="field"><span>Teléfono (con lada de país, p. ej. 52…)</span><input v-model="phone" class="input" inputmode="tel" /></label>
      <label class="field"><span>Mensaje</span><textarea v-model="wa" class="input" rows="8" /></label>
      <div class="flex flex-wrap gap-2">
        <button class="btn-soft" type="button" @click="copy(wa, 'whatsapp')"><Copy class="size-4" />Copiar</button>
        <button class="btn-primary" type="button" @click="openWhatsApp"><MessageCircle class="size-4" />Abrir WhatsApp</button>
      </div>
      <p class="text-xs text-text-dimmed">Se abre WhatsApp con el texto; tú revisas y envías. El PDF no se adjunta automáticamente: descárgalo y adjúntalo en WhatsApp.</p>
    </section>
    <section class="card space-y-2 p-3">
      <h3 class="flex items-center gap-2 font-semibold text-text-highlighted"><Mail class="size-4 text-info" />Correo electrónico</h3>
      <label class="field"><span>Para</span><input v-model="email.to" class="input" type="email" /></label>
      <label class="field"><span>Asunto</span><input v-model="email.subject" class="input" /></label>
      <label class="field"><span>Mensaje</span><textarea v-model="email.body" class="input" rows="8" /></label>
      <div class="flex flex-wrap gap-2">
        <button class="btn-soft" type="button" @click="copy(email.body, 'correo')"><Copy class="size-4" />Copiar</button>
        <button class="btn-soft" type="button" @click="openMail"><Mail class="size-4" />Abrir en mi correo</button>
        <button v-if="smtpReady && can('enviar:cotizacion')" class="btn-primary" type="button" :disabled="!email.to" @click="confirmOpen = true"><Send class="size-4" />Enviar con PDF</button>
      </div>
      <p class="text-xs text-text-dimmed">{{ smtpReady ? '“Enviar con PDF” usa tu SMTP configurado y adjunta el PDF de las alternativas elegidas.' : 'Abrir en tu correo no adjunta el PDF. Configura SMTP para enviarlo adjunto desde aquí.' }}</p>
    </section>
    <ModalDialog v-model:open="confirmOpen" title="Confirmar envío por correo">
      <p class="text-sm">Se enviará a <b>{{ email.to }}</b> con el asunto “{{ email.subject }}”.</p>
      <label class="mt-2 flex items-center gap-2 text-sm"><input v-model="attach" type="checkbox" />Adjuntar PDF ({{ scenarioIds.length > 1 ? 'comparativo' : 'individual' }}, sin datos internos)</label>
      <template #footer><button class="btn-soft" @click="confirmOpen = false">Cancelar</button><button class="btn-primary" :disabled="sending" @click="sendSmtp"><Send class="size-4" />Enviar</button></template>
    </ModalDialog>
  </div>
</template>
