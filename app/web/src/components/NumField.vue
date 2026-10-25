<script setup lang="ts">
// Campo numérico con etiqueta, prefijo/sufijo y ayuda opcional.
defineProps<{ label?: string; prefix?: string; suffix?: string; step?: number | string; min?: number; max?: number; hint?: string; disabled?: boolean; id?: string }>();
const model = defineModel<number | null>();
function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  model.value = v === '' ? null : Number(v);
}
</script>

<template>
  <label class="field">
    <span v-if="label">{{ label }}</span>
    <div class="relative flex items-center">
      <span v-if="prefix" class="pointer-events-none absolute left-2.5 text-sm text-text-dimmed">{{ prefix }}</span>
      <input :id="id" class="input num" :class="[prefix ? 'pl-6' : '', suffix ? 'pr-12' : '']" type="number" :step="step ?? 'any'" :min="min" :max="max" :value="model ?? ''" :disabled="disabled" @input="onInput" />
      <span v-if="suffix" class="pointer-events-none absolute right-2.5 text-xs text-text-dimmed">{{ suffix }}</span>
    </div>
    <small v-if="hint" class="text-xs text-text-dimmed">{{ hint }}</small>
  </label>
</template>
