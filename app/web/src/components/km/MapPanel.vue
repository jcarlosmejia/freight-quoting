<script setup lang="ts">
// Mapa opcional con Leaflet. Sólo se carga si la instalación configuró un servicio de teselas propio.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Place } from './types.ts';

const props = defineProps<{ tilesUrl: string; attribution: string; points: { key: string; label: string; place: Place }[]; activeKey: string | null; geometry: [number, number][] | null }>();
const emit = defineEmits<{ picked: [key: string, lat: number, lon: number] }>();
const el = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let layer: L.LayerGroup | null = null;

const icon = (text: string, color: string) =>
  L.divIcon({ className: '', html: `<div style="background:${color};color:#fff;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font:600 12px sans-serif;border:2px solid #fff">${text}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

function draw() {
  if (!map || !layer) return;
  layer.clearLayers();
  const bounds: L.LatLngExpression[] = [];
  props.points.forEach((p, i) => {
    if (p.place.lat == null || p.place.lon == null) return;
    const color = i === 0 ? '#16a34a' : i === props.points.length - 1 ? '#dc2626' : '#2563eb';
    const m = L.marker([p.place.lat, p.place.lon], { icon: icon(String(i + 1), color), draggable: true, title: p.label, keyboard: true }).addTo(layer!);
    m.on('dragend', () => {
      const ll = m.getLatLng();
      emit('picked', p.key, ll.lat, ll.lng);
    });
    bounds.push([p.place.lat, p.place.lon]);
  });
  if (props.geometry?.length) L.polyline(props.geometry.map(([lon, lat]) => [lat, lon] as L.LatLngExpression), { color: '#3b82f6', weight: 4 }).addTo(layer);
  if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 12 });
}

onMounted(() => {
  map = L.map(el.value!, { center: [23.6, -102.5], zoom: 5 });
  L.tileLayer(props.tilesUrl, { attribution: props.attribution, maxZoom: 18 }).addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on('click', (e: L.LeafletMouseEvent) => {
    if (props.activeKey) emit('picked', props.activeKey, e.latlng.lat, e.latlng.lng);
  });
  draw();
});
onBeforeUnmount(() => map?.remove());
watch(() => [props.points.map((p) => [p.place.lat, p.place.lon]), props.geometry], draw, { deep: true });
</script>

<template>
  <div ref="el" class="h-72 w-full overflow-hidden rounded-md border border-line md:h-96" role="application" aria-label="Mapa de la ruta" />
</template>
