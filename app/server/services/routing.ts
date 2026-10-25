// Proveedores de ruteo. Por defecto no hay ninguno: las distancias y tiempos se capturan a mano
// para no inventar datos. Con credenciales/servidor propios se habilita un proveedor real.
import { HttpError } from '../auth.ts';

export interface RoutingStatus {
  id: string;
  label: string;
  configured: boolean;
  truckAware: boolean;
  detail: string;
}

export interface PlannedRoute {
  provider: string;
  legMeters: number[];
  drivingSeconds: number;
  geometry: [number, number][] | null;
  attribution: string;
}

type Env = Record<string, string | undefined>;

export function routingProviders(env: Env): RoutingStatus[] {
  return [
    { id: 'manual', label: 'Captura manual', configured: true, truckAware: false, detail: 'Km y tiempo por tramo capturados por el usuario. Reproducible; sin servicios externos.' },
    {
      id: 'ors',
      label: 'openrouteservice (perfil driving-hgv)',
      configured: !!env.ORS_API_KEY,
      truckAware: true,
      detail: env.ORS_API_KEY ? `Configurado con clave propia (${env.ORS_BASE_URL ?? 'https://api.openrouteservice.org'}). Verifica restricciones de camión con rutas conocidas.` : 'Requiere ORS_API_KEY propia en .env.',
    },
    {
      id: 'osrm',
      label: 'OSRM autoalojado',
      configured: !!env.OSRM_URL,
      truckAware: false,
      detail: env.OSRM_URL ? `Servidor ${env.OSRM_URL}. El perfil depende de cómo se compiló; no garantiza restricciones de camión.` : 'Requiere OSRM_URL de un servidor propio.',
    },
  ];
}

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new HttpError(502, `El proveedor de rutas respondió ${res.status}${body?.error?.message ? `: ${body.error.message}` : ''}.`);
  return body;
}

export async function planRoute(env: Env, provider: string, coords: [number, number][], truck?: { heightM?: number; widthM?: number; lengthM?: number; weightTons?: number }): Promise<PlannedRoute> {
  if (coords.length < 2) throw new HttpError(400, 'Se necesitan al menos dos paradas con coordenadas.');
  if (provider === 'ors') {
    if (!env.ORS_API_KEY) throw new HttpError(409, 'openrouteservice no está configurado (ORS_API_KEY).');
    const base = env.ORS_BASE_URL ?? 'https://api.openrouteservice.org';
    const restrictions = truck ? { height: truck.heightM, width: truck.widthM, length: truck.lengthM, weight: truck.weightTons } : undefined;
    const body = await fetchJson(`${base}/v2/directions/driving-hgv/geojson`, {
      method: 'POST',
      headers: { Authorization: env.ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: coords, options: restrictions ? { vehicle_type: 'hgv', profile_params: { restrictions } } : undefined }),
    });
    const f = body?.features?.[0];
    if (!f) throw new HttpError(502, 'Respuesta de ruta vacía.');
    return {
      provider: 'ors',
      legMeters: (f.properties.segments ?? []).map((s: any) => Number(s.distance) || 0),
      drivingSeconds: Number(f.properties.summary?.duration) || 0,
      geometry: f.geometry?.coordinates ?? null,
      attribution: '© openrouteservice.org | © OpenStreetMap contributors',
    };
  }
  if (provider === 'osrm') {
    if (!env.OSRM_URL) throw new HttpError(409, 'OSRM no está configurado (OSRM_URL).');
    const path = coords.map(([lon, lat]) => `${lon},${lat}`).join(';');
    const body = await fetchJson(`${env.OSRM_URL.replace(/\/$/, '')}/route/v1/driving/${path}?overview=full&geometries=geojson`, { method: 'GET' });
    const r = body?.routes?.[0];
    if (!r) throw new HttpError(502, 'Respuesta de ruta vacía.');
    return { provider: 'osrm', legMeters: r.legs.map((l: any) => Number(l.distance) || 0), drivingSeconds: Number(r.duration) || 0, geometry: r.geometry?.coordinates ?? null, attribution: '© OpenStreetMap contributors' };
  }
  throw new HttpError(400, 'Proveedor de rutas desconocido.');
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/** Búsqueda de direcciones con un servidor Nominatim configurado (propio o público respetando su política de uso). */
export async function geocode(env: Env, q: string): Promise<GeocodeResult[]> {
  if (!env.NOMINATIM_URL) throw new HttpError(409, 'La búsqueda de direcciones no está configurada (NOMINATIM_URL).');
  const url = `${env.NOMINATIM_URL.replace(/\/$/, '')}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=mx&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': `fletcot-local/1.0 (${env.GEOCODER_CONTACT ?? 'sin contacto configurado'})`, 'Accept-Language': 'es' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new HttpError(502, `El servicio de direcciones respondió ${res.status}.`);
  const data = (await res.json()) as any[];
  return data.map((d) => ({
    label: d.display_name,
    lat: Number(d.lat),
    lon: Number(d.lon),
    city: d.address?.city ?? d.address?.town ?? d.address?.village ?? d.address?.municipality ?? null,
    state: d.address?.state ?? null,
    zip: d.address?.postcode ?? null,
  }));
}

export const mapConfig = (env: Env) => ({
  tilesUrl: env.MAP_TILES_URL || null,
  attribution: env.MAP_TILES_ATTRIBUTION || '© OpenStreetMap contributors',
  geocoder: !!env.NOMINATIM_URL,
  routing: routingProviders(env),
});
