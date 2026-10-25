# Fletcot local · CARMAG TRANSPORTS

Implementación propia y local de un cotizador de fletes y rentas equivalente en lo verificado a Fletcot, con el módulo de **cotización por kilómetro** de CARMAG TRANSPORTS (plataforma y caja seca, alternativas de precio, márgenes, PDF y WhatsApp/correo: [`../docs/12-carmag-cotizacion-km.md`](../docs/12-carmag-cotizacion-km.md)). No usa código, claves ni servidores de Fletcot. Estado y diferencias: [`../docs/10-paridad.md`](../docs/10-paridad.md). Origen de las reglas: [`../docs/09-recuperacion-codigo.md`](../docs/09-recuperacion-codigo.md).

## Requisitos

- Node.js 24 o superior (usa `node:sqlite` y ejecuta TypeScript sin compilar).
- Sin base de datos externa: SQLite en `app/data/`.

## Instalar y arrancar

```bash
cd app && npm ci && cp .env.example .env && npm run local
```

Abre http://127.0.0.1:5180 e inicia sesión con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` de `.env` (por defecto `admin@demo.test` / `cambia-esta-clave-admin`; también existe `usuario@demo.test` con rol de operación). Cambia las contraseñas en Usuarios.

`npm run local` aplica migraciones, crea los datos de ejemplo sólo si no existen, compila la interfaz y arranca el servidor. Los siguientes arranques pueden usar `npm start`.

## Comandos

| Comando | Uso |
|---|---|
| `npm run dev` | API con recarga + Vite en http://127.0.0.1:5173 |
| `npm run migrate` | Aplica migraciones pendientes de `server/migrations/` |
| `npm run seed` | Crea la empresa de ejemplo (idempotente) |
| `npm run build` | Compila la interfaz a `dist/` |
| `npm start` | Sirve API + interfaz compilada |
| `npm test` | Pruebas del motor, cotización por km, API, documentos, correo simulado e independencia |
| `npm run typecheck` | Tipos de servidor, motor y pruebas |

## Cotizar por km (uso diario)

1. **Cotizar por km** → Origen y destino (manual, ubicación o ruta frecuente; mapa si está configurado) y km de ida.
2. Unidad y carga (plataforma o caja seca, 40/53 pies, peso, pallets).
3. Costos y cargos (modo avanzado): diésel, operador, costos por km y fijos, cargos fijos o porcentuales.
4. Tarifas y márgenes (modo avanzado): banda $/km, margen objetivo, ganancia mínima, redondeo, IVA y retención; alternativas por tarifa, precio o margen.
5. Comparación: económica, recomendada y mejor margen, con advertencias.
6. Guardar: después, en el detalle, elegir alternativa, PDF individual o comparativo, WhatsApp, correo, negociación y seguimiento.

El borrador se autoguarda en el navegador. Las tarifas y costos predeterminados por tipo de unidad están en Configuración → Tarifas por km.

## Estructura

```text
shared/costing/   motor puro de flete, renta y tarifas por hora (lo usan servidor e interfaz)
shared/pricing/   motor de cotización por km en centavos: km, costos, cargos, alternativas y recomendación
shared/           permisos y formatos
server/           Fastify + SQLite: autenticación, permisos, API, documentos, adaptadores de ruteo
server/migrations esquema SQL versionado
web/              Vue 3 + Vite + Tailwind
tests/            pruebas (Vitest)
data/             base SQLite, plantillas y logos (no se versiona)
```

El servidor recalcula cada partida al guardarla y almacena una copia completa de parámetros, entradas y resultado (snapshot). La interfaz usa el mismo motor para la vista previa.

## Datos de ejemplo

Todos son sintéticos. El perfil "Referencia T3-S2" y la ruta "Referencia CDMX – Puebla" replican los valores numéricos observados en la cuenta de evaluación para comprobar el motor en pantalla; el monto de casetas de esa ruta es el total observado, no una tarifa oficial. La "Caseta de prueba A" es ficticia.

## Datos que debes cargar tú

- Casetas: nombre, clase vehicular, sentido, monto, vigencia y fuente.
- Distancias y tiempos por tramo, o un proveedor de rutas propio.
- Precios de combustible y costos reales de tu operación.

## Integraciones

| Integración | Estado |
|---|---|
| openrouteservice (`ORS_API_KEY`) | Adaptador para perfil de camión; no probado con un servicio real |
| OSRM (`OSRM_URL`) | Adaptador para servidor propio; no probado con un servicio real |
| SMTP | Envío de cotizaciones con PDF adjunto tras confirmación; contraseña cifrada con `APP_SECRET` |
| WhatsApp | Mensaje listo, copiar y abrir `wa.me` (el usuario envía). WhatsApp Business Platform no implementado |
| Mapa (`MAP_TILES_URL`) | Leaflet con teselas XYZ que tengas derecho a usar; sin valor no se muestra mapa |
| Direcciones (`NOMINATIM_URL`, `GEOCODER_CONTACT`) | Búsqueda con un servidor Nominatim propio o con permiso de uso |
| Gmail, Telegram | No implementados |

## Seguridad

Cookie de sesión HttpOnly y SameSite=Strict; las mutaciones exigen la cabecera `X-Requested-With: fletcot-local`; permisos y alcance por empresa se validan en el servidor; límite de intentos de acceso por correo. Por defecto escucha sólo en `127.0.0.1`. Para exponerla en red usa HTTPS y `SECURE_COOKIES=true`.

## Respaldo

Copia `app/data/` con el servidor detenido, o exporta JSON desde Configuración → Respaldo (no incluye contraseñas ni secretos).
