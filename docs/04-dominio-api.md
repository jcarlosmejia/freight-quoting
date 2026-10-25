# Dominio y API: base para un equivalente

## Modelo conceptual propuesto

Este es un modelo de reconstrucción, no un esquema SQL obtenido de Fletcot.

| Entidad | Datos centrales | Relaciones / invariantes |
|---|---|---|
| Empresa | Identidad, país, moneda, logo, preferencias, numeración | Aísla todos los datos operativos |
| Usuario y rol | Identidad, verificación, permisos, estado | Acceso según empresa y capacidad |
| Perfil de país | Moneda, impuesto, identificador fiscal, unidades, teléfono, zona, mapa | Evitar reglas nacionales dispersas |
| Categoría de flota | Unidades, días/año, horas/día | Denominador de recuperación de gastos |
| Vehículo | Clase, dimensiones, capacidad, combustible, capital, vida útil | Llantas, activos, equipo y gastos específicos |
| Gasto fijo | Nombre, monto, periodicidad, notas | Conversión anual reproducible |
| Equipo | Nombre, precio unitario, descripción | Asignación con cantidad y vida útil |
| Cliente | Razón social, fiscal, contacto, dirección, notas, archivo | Notas privadas fuera de documentos |
| Ubicación/base | Nombre, coordenadas, tipo | Paradas reutilizables |
| Ruta y tramo | Orden de paradas, geometría, distancia, duración, carga, espera | Carga procede de la parada de salida |
| Peaje y pasada | Plaza/carril/sentido, clase, tarifa, vigencia | Una plaza puede cobrarse varias veces |
| Cotización y partida | Folio, cliente, vigencia, estado, flete/renta, importes | Snapshot y versión de cálculo inmutables |
| Tarifario y fila | Ruta × vehículo, estrategia y precio fijado | Recálculo explícito, no silencioso |
| Plantilla | Tipo, archivo, variables, versión, predeterminada | Documento reproducible |
| Envío | Destinatario, canal, fecha, estado y documento | Evidencia de intento y resultado |
| Vinculación | Empresa/usuario, canal, configuración protegida | Secretos fuera de snapshots |
| Soporte | Ticket, mensajes y adjuntos | Alcance propio o administrativo |

El perfil de país sí tiene evidencia directa: `useCountryProfile-xZ6rAWQQ.js` expone moneda, locale, impuesto, identificador fiscal, teléfono, zona horaria, centro/zoom del mapa, unidad de combustible y deducibilidad. El frontend tiene un perfil de respaldo; esto no acredita el catálogo completo del servidor.

## API observada estáticamente

Base compilada: `https://api.fletcot.com/`. Tabla abreviada de llamadas visibles. **Esta tabla procede del código cliente; no valida todos los contratos. Posteriormente se ejecutaron registro, consultas y altas sintéticas mediante la UI, según el informe autenticado.**

| Grupo | Ejemplos de operación | Fuente |
|---|---|---|
| Sesión | POST `/auth/login`, `/auth/register`, `/auth/google`, `/auth/google/register`; GET `/auth/me` | `useAuth-8KYdCYdB.js`, entrada principal |
| Empresa | GET/PATCH `/companies/me`; PATCH `/companies/me/numbering`, `/preferences` | `useCompany-C8qpOI3s.js` |
| Vehículo | GET `/vehicle/catalogs`, `/vehicle/templates`, `/vehicle/options`, `/vehicle/{id}`; POST `/vehicle`, `/vehicle/datatable`; PUT `/vehicle/{id}` | `useVehicles-VTEtuCKG.js` |
| Partes de vehículo | PATCH `/vehicle/{id}/tires`, `/fixed-costs`, `/equipment`; GET `/vehicle/{id}/profile-pdf` | Mismo composable |
| Clientes | GET `/clients`; POST `/clients`; PATCH/DELETE `/clients/{id}`; PATCH `/clients/{id}/restore`; importación/exportación | `useClients-Sq_M_Pxm.js` |
| Gastos | POST `/fixed-expenses`; PATCH `/fixed-expenses/cell`; DELETE `/fixed-expenses/{id}`; importación/exportación | `useFixedExpenses-4zUaW9hc.js` |
| Segmentación | GET `/fixed-cost-segmentation/company`; PUT `/fixed-cost-segmentation/{id}` | Mismo composable |
| Plantillas | GET/POST `/quote-templates`; variables, reemplazo de archivo, predeterminada y descarga | `useQuoteTemplates-BDZcRMeJ.js` |
| Cotizaciones | `/quotes`, `/quotes/datatable`, `/quotes/{id}/items`, recálculo, exportación, compartir, envío | Detalle y listado |
| Riesgo y tráfico | `/route-risk/along-route`, `/road-incidents?cells=...` | Cotizador y `roadIncidentMatching-CEDJgMHz.js` |
| Combustible | `/fuel-prices/nearby/...`, `/fuel-prices/in-bounds?...` | Código de mapas |
| Email | GET `/auth/email-integrations`; PUT `/gmail`, `/smtp`; test y desconexión | `useWhatsappIntegration-CdGYeOmy.js` |
| WhatsApp | GET `/whatsapp/status`; POST `/whatsapp/connect`, `/whatsapp/test`; DELETE `/whatsapp/disconnect` | Mismo chunk |
| Telegram | `/telegram/status`, `/telegram/link-code`, `/telegram/link` | Configuración |
| Facturación | `/billing/overview`, `/checkout`, `/checkout/confirm`, `/portal`, `/fiscal-data` | `useBilling-BfTUUOAp.js` |
| Administración | `/platform/*`, `/users/*`, soporte administrativo | `usePlatform-Ca9_Mfrs.js` y páginas |

El inventario automático usa expresiones regulares: `nearby_method_hint` es solo una pista de método cercano y algunas plantillas quedan fragmentadas por interpolación. No es OpenAPI ni debe convertirse automáticamente en un cliente de producción.

## Requisitos propios que faltan definir

- Esquemas de solicitud/respuesta, nulabilidad, decimales y unidades.
- Paginación, búsqueda, orden y filtros por recurso.
- Errores de validación por campo, conflictos y mensajes recuperables.
- Alcance de empresa en cada consulta, autorización de servidor y auditoría.
- Concurrencia de folios y edición; idempotencia al guardar o enviar.
- Reintentos sin duplicar cotizaciones o mensajes.
- Versionado de parámetros, tarifas, documentos y motor.

No se observó un esquema OpenAPI enlazado en los recursos capturados. No se hicieron barridos de endpoints internos o de repositorios ocultos.
