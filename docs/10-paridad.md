# Matriz de paridad de la implementación local

Fecha: 25 de octubre de 2026. Estado de `app/` frente a lo observado en Fletcot. **No es una copia exacta de Fletcot**: reproduce el motor de cálculo en los casos verificados y los flujos principales, con diferencias declaradas abajo.

Estados: **Implementado y probado** (prueba automática o verificación en navegador) · **Implementado** (funciona, sin prueba automática dedicada) · **Parcial** · **Pendiente** · **No disponible** (requiere proveedor/credenciales que no existen).

## Módulos

| Módulo | Estado | Evidencia | Diferencias / límites |
|---|---|---|---|
| Autenticación local (correo/contraseña, sesión) | Implementado y probado | `tests/api.test.ts` (cookie HttpOnly + SameSite=Strict, 401, CSRF 403) | Sin Google, confirmación de correo, recuperación por correo ni periodo de prueba. Contraseñas con scrypt. |
| Empresa, logo, país | Implementado | UI Configuración | Sólo México/MXN. República Dominicana pendiente: falta perfil de país (moneda, impuesto, unidades). |
| Usuarios y roles con permisos en servidor | Implementado y probado | Rol `usuario` recibe 403 en numeración, usuarios, roles, respaldo; rol personalizado sin `ver:cotizacion` recibe 403; techo de privilegios: un no-admin no asigna el rol admin, no modifica admins ni usuarios con más permisos, no otorga permisos que no tiene ni edita su propio rol; cambio de contraseña/rol/baja cierra sesiones | Catálogo de 60 permisos: los observados en el bundle más códigos propios para completar los grupos (`observed: false` en `shared/permissions.ts`). |
| Aislamiento entre empresas | Implementado y probado | Otra empresa obtiene 404 al leer/modificar recursos ajenos; folios independientes | — |
| Categorías de flota y gastos generales | Implementado y probado | Tarifa 86.18/h con 8,604,000 / 99,840 | Sin importación/exportación Excel. |
| Equipamiento y asignación por vehículo | Implementado y probado | 17,161.67/año, 6.88/h, 55.01/día | Sin importación Excel. |
| Perfiles de costo (vehículos) | Implementado y probado | Caso T3-S2 reproduce los 15 importes | Sin plantillas IMT completas ni "Copiar de…" entre perfiles (sí duplicar). Sin PDF de perfil. |
| Clientes | Implementado | UI + API; archivar/restaurar; CSV | Sin validación de RFC contra SAT; sin importación Excel. |
| Bases, ubicaciones y rutas guardadas | Implementado | UI Casetas y rutas | Sin mapa ni geocodificación. Coordenadas manuales. |
| Ruteo (km/tiempo) | Parcial | Captura manual por tramo; adaptadores openrouteservice (hgv) y OSRM | Adaptadores **no probados con un servicio real** (no hay credenciales propias). Sin mapa, alternativas, tráfico, incidencias ni denuncias. |
| Peajes por clase y sentido | Parcial | Catálogo propio con clase, sentido, vigencia y fuente; pasadas por tramo; ida y vuelta cuenta dos pasadas (`tests/api.test.ts`) | **No incluye datos SCT/CAPUFE.** Sin detección automática de casetas por geometría. |
| Flete: cargado | Implementado y probado | CDMX → Puebla: 1,524.32 … 5,168.22 (también en navegador) | — |
| Flete: vacío, retorno, cobro/utilidad por rubro | Implementado y probado (reglas) | `tests/costing.rules.test.ts` | Reglas tomadas del código compilado; **sin caso numérico observado en sesión**. |
| Esperas, ralentí, recargas, descansos | Implementado y probado (reglas) | Umbral exacto; caso público fletcot.com confirma que 2 descansos suman 16 h con cliente | Sin caso con espera observado en sesión. |
| Pago al operador: km, hora, comisión sobre neto, sobre utilidad | Implementado y probado (reglas) | `tests/costing.rules.test.ts` | Sólo "por km" observado en sesión. La comisión sobre utilidad no aumenta el precio (comportamiento del código, pendiente de confirmar en sesión). |
| Utilidad, financiamiento, aumento por carga, IVA | Implementado y probado | Variante 30% reproduce 5,472.85; orden de aplicación probado | Financiamiento y aumento sin caso observado en sesión. |
| Precisión y redondeo | Implementado y probado | Precisión completa; redondeo al guardar `unit_subtotal`; diferencia de 1 centavo explicada | — |
| Cotización: folios, estados, vigencia | Implementado y probado | Folios consecutivos únicos en transacción; estados; vencida derivada de vigencia | Fechas sin el desfase de un día de Fletcot (diferencia intencional). |
| Cotizaciones históricas y recálculo | Implementado y probado | Cambiar combustible no altera la partida; recalcular cambia y guarda revisión | Recálculo incluye capital vacío (Fletcot lo omite en su recálculo; ver docs/09). |
| Renta: hora, jornada, día, semana, mes | Implementado y probado | Mes: 68,565.63 y cifras anuales idénticas en navegador | Sólo mensual observado en sesión. |
| Renta: km, tope, excedentes, precio cerrado | Implementado y probado (reglas) | `tests/costing.rules.test.ts` | Sin caso observado en sesión. |
| Tarifarios | Implementado y probado | Fija valores; recálculo explícito; "Cotizar selección" copia valores fijados; Word | Sin Excel; sin compartir por enlace. |
| Plantillas Word | Implementado y probado | Marcadores `${…}`, fila repetida por partida, carga validada | Logo dentro de Word no se sustituye. |
| Exportación PDF | Implementado y probado | Texto extraído contiene folio, fechas, partidas y totales; PDF con desglose interno | Diseño propio, no el de Fletcot. |
| Historial de documentos | Implementado y probado | SHA-256 y tamaño por exportación | Sólo descargas: no hay envíos. |
| Envío por correo (SMTP/Gmail) | Parcial / No disponible | SMTP: configuración cifrada (AES-256-GCM con `APP_SECRET`) e historial | **El envío no está implementado.** Gmail no implementado. |
| WhatsApp, Telegram | No disponible | Se muestran como no implementados | Requieren proveedor/bot propios. |
| Preferencias (IVA, utilidad, vigencia, tipos de carga, bloqueos) | Implementado | Bloqueos aplicados en interfaz | Los bloqueos de edición no se imponen en servidor (sí los rangos). |
| Tablero | Implementado | Conteos y montos por estado; tasa de cierre | Sin gráficas ni alertas de precio. |
| Respaldo | Parcial | Exporta JSON sin contraseñas ni secretos | Sin restauración. |
| Soporte, facturación SaaS, plataforma, asistente | Pendiente (fuera de alcance) | — | Funciones del operador del servicio. |

## Verificaciones mínimas pedidas

| Verificación | Resultado |
|---|---|
| Capturas comparables | Cotizador, detalle de cotización y renta reproducen estructura, rótulos e importes de las capturas privadas; tema y tipografía son propios (no se copiaron estilos de Fletcot). |
| Casos numéricos de flete y renta | 15/15 importes de flete, variante 30% y renta mensual: iguales al centavo. |
| Vacío, ida/vuelta, esperas, descansos | Probados contra reglas del código compilado; sin casos observados en sesión. |
| Impuestos, precisión, redondeo | Probados. |
| Persistencia tras reiniciar | SQLite en archivo: prueba de reapertura; el servidor se reinició y conservó datos y sesión. |
| Cotizaciones históricas intactas | Probado. |
| Folios únicos y permisos en servidor | Probado. |
| Word/PDF con contenido comprobado | Probado (texto extraído) en pruebas y contra el servidor en marcha. |
| Instalación desde checkout limpio | `npm ci` + `npm run setup` + 72 pruebas en una copia sin `node_modules`, `data` ni `dist`. |
| Arranque con un comando | `npm run local` (migra, crea datos, compila y arranca). |
| Sin solicitudes a dominios de Fletcot | Red del navegador durante el recorrido: sólo `localhost:5180`. Prueba estática `tests/independence.test.ts` sin referencias a fletcot.com, Mapbox, Geoapify ni bunny CDN. |

## Dependencias externas legítimas

Ninguna es necesaria para operar. Opcionales con credenciales propias: openrouteservice u OSRM (rutas). Fuentes de datos que el usuario debe mantener: tarifas de casetas, precios de combustible y gastos.

## Pendiente de verificar en la cuenta de evaluación

Requiere una sesión activa de Fletcot en el navegador integrado:

1. Flete con regreso vacío y rubros vacíos no cobrados / con utilidad.
2. Esperas y ralentí; descanso en el umbral exacto.
3. Pago por hora, comisión sobre neto y sobre utilidad (¿cambia el precio?).
4. Financiamiento y aumento por carga distintos de 0.
5. Renta con km, tope y excedente; renta fija por contrato.
6. Recálculo de una cotización con vacío cobrado (capital).
7. JSON real de `valid_until` para confirmar el desfase de fecha.
8. Tarifario guardado y exportaciones Word/PDF descargadas.

## Funciones de la suscripción más alta de Fletcot

Lista pública del plan "Suscripción" en fletcot.com, contrastada con la app local (25-oct-2026).

| Función anunciada | Estado local | Nota |
|---|---|---|
| Cotizaciones, vehículos y usuarios ilimitados | Implementado | Sin límites en la instalación |
| Usuarios con roles y permisos a la medida | Implementado y probado | Permisos en servidor y techo de privilegios |
| Peajes por tipo de unidad | Parcial | Catálogo propio por clase y sentido; sin datos SCT/CAPUFE ni detección automática por geometría |
| Avisos de accidentes, cierres, obras | No disponible | Requiere un proveedor de tráfico de pago con credenciales propias |
| Plantillas Word y PDF con logo | Implementado y probado | Logo en PDF y en Word (imagen con texto alternativo `${empresa_logo}`); color de identidad configurable |
| Envío por WhatsApp y correo con historial | Parcial | WhatsApp: mensaje listo y apertura de `wa.me` (envío manual). Correo: SMTP propio con PDF adjunto e historial (probado con transporte simulado) |
| Tarifarios y rutas guardadas | Implementado y probado | Tarifarios ruta × vehículo; rutas guardadas y rutas frecuentes por km |
| Asistente por Telegram | No disponible | Requiere bot propio y extracción de documentos |
| Denuncias de robo por municipio (SESNSP) | No disponible | Requiere importar datos oficiales y geometrías municipales |
| Actualizaciones y soporte | No aplica | Instalación propia |

Funciones adicionales del requerimiento de CARMAG: cotización por km con alternativas y recomendación, cargos fijos/porcentuales, margen y markup, PDF comparativo, estados de negociación, seguimiento, duplicado, archivo, CSV y mapa opcional. Detalle en [docs/12](12-carmag-cotizacion-km.md).
