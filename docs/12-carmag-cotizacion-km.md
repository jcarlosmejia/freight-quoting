# CARMAG TRANSPORTS: cotización por kilómetro

Fecha: 25 de octubre de 2026. Módulo agregado a la app local (`app/`) para cotizar fletes con plataforma o caja seca por tarifa por kilómetro, comparar alternativas y compartirlas.

## Decisión de stack

El requerimiento sugería Next.js, Prisma y shadcn/ui. El repositorio ya tenía una aplicación funcional (Vue 3, Vite, Tailwind, Fastify, SQLite con migraciones y 46 pruebas). Se amplió esa base en lugar de reescribirla: se conservan el motor validado, la autenticación, los permisos en servidor y los documentos. Equivalencias: Route Handlers → rutas Fastify; Prisma → migraciones SQL versionadas en `server/migrations/`; Zod → validación en `server/services/validate.ts` y `kmquotes.ts`; React Hook Form → formularios Vue. Migrar a PostgreSQL implica reemplazar `server/db.ts` (SQL estándar salvo `strftime`).

## Reglas del motor (`shared/pricing/kmquote.ts`)

- **Dinero en centavos enteros.** Cada renglón se redondea una sola vez; subtotales y totales son sumas de enteros.
- **Kilómetros:** ida, regreso (sólo en redondo), reposicionamiento y adicionales. *Recorridos* = todos. *Facturables* = ida + regreso sólo si el cliente lo paga + adicionales marcados. El regreso nunca se cobra solo.
- **Regreso vacío en viaje sencillo:** análisis interno opcional (costo y excedente si la unidad regresa vacía); no se agrega al precio.
- **Combustible** = km cargados / rendimiento cargado × diésel + km vacíos / rendimiento vacío × diésel.
- **Casetas:** ida + regreso (si hay regreso). Incluidas en el flete o cobradas aparte (con o sin IVA).
- **Operador:** por km recorrido, sueldo fijo por viaje o % del flete, más viáticos.
- **Otros costos:** por km (llantas, mantenimiento y depreciación derivados del perfil del vehículo; adicionales configurables) y fijos por viaje (seguros, administración, gastos de carga, pensión…). Imprevistos = % del costo directo. Comisiones = % del flete.
- **Cargos:** fijos o porcentuales (base explícita: flete base o costo operativo, sin cargos). Clasificación *costo* (suma al costo) o *comercial*; *cobrar al cliente* los agrega al precio; IVA por cargo. Un cargo de costo cobrado al cliente es un traslado. No hay circularidad: ninguna base incluye cargos.
- **IVA** sobre renglones gravables; **retención de IVA** opcional (4% autotransporte cuando aplica).
- **Rentabilidad:** excedente operativo = precio sin IVA − costo. Margen = excedente / precio. Markup = excedente / costo. El excedente no es utilidad neta después de impuestos.
- **Alternativas:** por tarifa ($/km), por precio fijo del flete o por margen objetivo. El margen objetivo se resuelve exactamente aunque el operador o las comisiones dependan del flete (ingreso y costo son lineales en el flete).
- **Recomendación:** la alternativa de **menor precio que cumple** margen objetivo, ganancia mínima y banda de tarifas. Si ninguna cumple, se indica y se muestra la de mayor margen como referencia. Sin km facturables no hay recomendación.
- **Advertencias:** pérdida, margen bajo, ganancia mínima, tarifa fuera de banda, precio mínimo aplicado, capacidad de peso/pallets/largo excedida, falta de diésel o rendimiento, ausencia de costos fijos.

## Caso de prueba real

| Dato | Valor | Origen |
|---|---|---|
| Origen | Av. Juan Gil Preciado #9200, int. 1, Parque Empresarial Tesistán, Zapopan, Jalisco, CP 45200 | Requerimiento |
| Destino | Calle Gonzálo Peña #303, Col. Francisco Medrano, Altamira, Tamaulipas, CP 89602 | Requerimiento |
| Distancia | 815 km, **captura manual, pendiente de validar** con un proveedor de rutas | Requerimiento |
| Carga | 16 pallets / 16 t, sólo ida | Requerimiento |
| Tarifas | $60, $61, $62, $63 y $65 por km | Banda $60–$65 del requerimiento |
| Referencia | $52,000 + IVA = $60,320 | Requerimiento |
| Diésel | $23.41/L | Valor configurado en el perfil de ejemplo (observado en la cuenta de evaluación el 25-oct-2026); **no es precio vigente** |
| Rendimiento, llantas, mantenimiento, depreciación | 2.0/2.5 km/L y costos por km del perfil | Perfil de ejemplo |
| Costos fijos por viaje | $0 hasta que se capturen | La app lo advierte |

Resultado verificado (pruebas y navegador): fletes $48,900 · $49,715 · $50,530 · $51,345 · $52,975; referencia $52,000 + IVA $8,320 = $60,320. Con el perfil de caja seca de ejemplo el costo operativo estimado es $14,291.03 (diésel $9,539.58, operador $2,445.00 a $3/km, costos por km $2,306.45) y el excedente de la alternativa de $60/km es $34,608.97 (70.8%). **Ese margen es alto porque faltan costos fijos por viaje**: no debe usarse como dato comercial hasta capturarlos.

## Criterios de aceptación

| Criterio | Estado | Evidencia |
|---|---|---|
| Crear una cotización desde cero | Cumple | Asistente `/admin/km-quote`; prueba de API |
| Origen y destino manuales | Cumple | Paso 1; ubicaciones y rutas frecuentes |
| Puntos en mapa con proveedor configurado | Cumple con mapa configurado | Leaflet con `MAP_TILES_URL`; clic y arrastre de marcadores verificados con URL local. Sin teselas reales probadas |
| Km manuales | Cumple | Se indica si son manuales o del proveedor |
| Sencillo y redondo | Cumple | Pruebas de km recorridos/facturables |
| Plataforma y caja seca | Cumple | Tarifas y costos distintos por tipo (prueba de configuración) |
| Cargos fijos y porcentuales | Cumple | Pruebas de cargos, base, IVA, clasificación |
| Modificar margen objetivo | Cumple | Paso 4 y modo rápido |
| ≥ 5 alternativas | Cumple | 5 por tarifa + margen objetivo + personalizadas |
| Comparar beneficio por alternativa | Cumple | Tabla con costo, excedente, margen y markup; económica/recomendada/mejor margen |
| Editar y elegir propuesta final | Cumple | Elegir en el detalle; editar en el asistente con historial; monto y tarifa final negociados |
| PDF presentable | Cumple | Individual, comparativo y hoja interna opcional; sin datos internos por defecto (prueba) |
| Mensaje para WhatsApp | Cumple | Copiar o abrir `wa.me`; el usuario envía |
| Guardar y recuperar | Cumple | Historial con filtros, archivo, duplicado y CSV |
| Uso desde teléfono | Cumple en vista estrecha | Menú desplegable y barra de resumen inferior verificados en el panel del navegador; sin prueba en dispositivo físico |

## Correo y WhatsApp

- **WhatsApp:** texto editable, copiar y abrir WhatsApp con el mensaje. No adjunta el PDF; la app lo dice. WhatsApp Business Platform no está implementado.
- **Correo:** asunto y cuerpo editables, copiar o abrir el cliente de correo (sin adjunto). Con SMTP propio configurado: envío real con PDF adjunto tras confirmación explícita. Probado con un transporte en memoria; **no se envió ningún correo real**.
- **Historial:** cada mensaje preparado, enviado o fallido queda en `communications` con canal, destinatario y alternativas.
- **Seguimiento:** fecha de seguimiento por cotización; el inicio lista los pendientes de los próximos 7 días.

## Pendiente

- Validar los 815 km con un proveedor de rutas apto para tractocamión (openrouteservice `driving-hgv` u otro con credenciales propias).
- Capturar costos fijos reales por viaje, precio de diésel vigente y casetas por número de ejes.
- Integraciones no implementadas: WhatsApp Business Platform, proveedor transaccional de correo por API, recordatorios automáticos, consulta automática de casetas.
- Prueba en teléfono físico.
