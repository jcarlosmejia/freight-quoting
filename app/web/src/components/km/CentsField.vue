<script setup lang="ts">
// Captura en pesos; el modelo guarda centavos enteros.
import { computed } from 'vue';
const props = defineProps<{ label?: string; hint?: string; suffix?: string; disabled?: boolean; id?: string }>();
const model = defineModel<number>({ required: true });
const shown = computed(() => (Number.isFinite(model.value) ? model.value / 100 : ''));
function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  model.value = v === '' ? 0 : Math.round(Number(v) * 100);
}
void props;
</script>

<template>
  <label class="field">
    <span v-if="label">{{ label }}</span>
    <div class="relative flex items-center">
      <span class="pointer-events-none absolute left-2.5 text-sm text-text-dimmed">$</span>
      <input :id="id" class="input num pl-6" :class="suffix ? 'pr-14' : ''" type="number" step="0.01" min="0" inputmode="decimal" :value="shown" :disabled="disabled" @input="onInput" />
      <span v-if="suffix" class="pointer-events-none absolute right-2.5 text-xs text-text-dimmed">{{ suffix }}</span>
    </div>
    <small v-if="hint" class="text-xs text-text-dimmed">{{ hint }}</small>
  </label>
</template>
