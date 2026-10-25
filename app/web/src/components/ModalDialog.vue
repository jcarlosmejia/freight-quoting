<script setup lang="ts">
import { X } from 'lucide-vue-next';
defineProps<{ title: string; wide?: boolean }>();
const open = defineModel<boolean>('open', { required: true });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-6" @mousedown.self="open = false">
      <div role="dialog" aria-modal="true" :aria-label="title" class="w-full rounded-lg border border-line bg-elevated shadow-2xl" :class="wide ? 'max-w-6xl' : 'max-w-lg'">
        <div class="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 class="font-semibold text-text-highlighted">{{ title }}</h2>
          <button class="btn-ghost px-1.5" aria-label="Cerrar" @click="open = false"><X class="size-4" /></button>
        </div>
        <div class="p-4"><slot /></div>
        <div v-if="$slots.footer" class="flex justify-end gap-2 border-t border-line px-4 py-3"><slot name="footer" /></div>
      </div>
    </div>
  </Teleport>
</template>
