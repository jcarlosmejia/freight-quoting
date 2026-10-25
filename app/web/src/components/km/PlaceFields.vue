<script setup lang="ts">
// Dirección de origen, destino o punto intermedio, con atajo a ubicaciones frecuentes.
import { MapPin, Search } from 'lucide-vue-next';
import { ref } from 'vue';
import { api } from '../../lib/api.ts';
import { fail } from '../../lib/session.ts';

import type { Place } from './types.ts';
const props = defineProps<{ label: string; place: Place; locations: any[]; geocoder: boolean; active?: boolean }>();
const emit = defineEmits<{ pick: [] }>();
const results = ref<any[]>([]);
const busy = ref(false);

function fromLocation(e: Event) {
  const loc = props.locations.find((l) => l.id === Number((e.target as HTMLSelectElement).value));
  (e.target as HTMLSelectElement).value = '';
  if (!loc) return;
  Object.assign(props.place, { address: loc.address ?? loc.name, city: loc.city ?? '', state: loc.state ?? '', zip: loc.zip ?? '', references: loc.ref_notes ?? '', lat: loc.lat, lon: loc.lon });
}
async function search() {
  const q = [props.place.address, props.place.city, props.place.state, props.place.zip].filter(Boolean).join(', ');
  busy.value = true;
  try {
    results.value = await api.get(`/geocode?q=${encodeURIComponent(q)}`);
    if (!results.value.length) fail(new Error('Sin resultados para esa dirección.'));
  } catch (e) {
    fail(e);
  } finally {
    busy.value = false;
  }
}
function choose(r: any) {
  Object.assign(props.place, { lat: r.lat, lon: r.lon, city: props.place.city || r.city || '', state: props.place.state || r.state || '', zip: props.place.zip || r.zip || '' });
  results.value = [];
}
</script>

<template>
  <fieldset class="rounded-md border p-3" :class="active ? 'border-primary' : 'border-line'">
    <legend class="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{{ label }}</legend>
    <select v-if="locations.length" class="input mb-2 py-1 text-xs" :aria-label="`${label}: ubicación frecuente`" @change="fromLocation">
      <option value="">Ubicación frecuente…</option>
      <option v-for="l in locations" :key="l.id" :value="l.id">{{ l.name }}{{ l.city ? ` · ${l.city}` : '' }}</option>
    </select>
    <label class="field"><span>Dirección completa *</span><input v-model="place.address" class="input" autocomplete="street-address" /></label>
    <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_6rem]">
      <label class="field"><span>Ciudad</span><input v-model="place.city" class="input" /></label>
      <label class="field"><span>Estado</span><input v-model="place.state" class="input" /></label>
      <label class="field"><span>CP</span><input v-model="place.zip" class="input" inputmode="numeric" maxlength="5" /></label>
    </div>
    <label class="field mt-2"><span>Referencias</span><input v-model="place.references" class="input" /></label>
    <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
      <MapPin class="size-3.5" />
      <span v-if="place.lat != null">{{ place.lat.toFixed(5) }}, {{ place.lon?.toFixed(5) }}</span>
      <span v-else>Sin coordenadas</span>
      <button v-if="geocoder" type="button" class="btn-ghost px-2 py-0.5 text-xs" :disabled="busy || place.address.length < 3" @click="search"><Search class="size-3.5" />Buscar dirección</button>
      <button type="button" class="btn-ghost px-2 py-0.5 text-xs" @click="emit('pick')">Elegir en mapa</button>
      <button v-if="place.lat != null" type="button" class="btn-ghost px-2 py-0.5 text-xs" @click="place.lat = null; place.lon = null">Quitar</button>
    </div>
    <ul v-if="results.length" class="mt-2 max-h-40 overflow-y-auto rounded-md border border-line text-xs">
      <li v-for="r in results" :key="`${r.lat},${r.lon}`"><button type="button" class="w-full px-2 py-1.5 text-left hover:bg-muted" @click="choose(r)">{{ r.label }}</button></li>
    </ul>
  </fieldset>
</template>
