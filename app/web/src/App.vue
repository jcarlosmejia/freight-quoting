<script setup lang="ts">
import { toasts } from './lib/session.ts';
</script>

<template>
  <RouterView />
  <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
    <div
      v-for="t in toasts"
      :key="t.id"
      class="pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-lg"
      :class="t.tone === 'error' ? 'border-error/40 bg-[#2a1515] text-error' : 'border-success/30 bg-[#12251a] text-success'"
      role="status"
    >
      {{ t.text }}
    </div>
  </div>
</template>
