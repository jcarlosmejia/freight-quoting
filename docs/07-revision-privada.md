# Revisión autenticada: acceso completado y recorrido realizado

El usuario autorizó el registro con su cuenta Google seleccionada y confirmó expresamente la creación y aceptación de condiciones. La cuenta se creó el 25 de octubre de 2026 con empresa **Evaluación Juan Carlos Mejía** y prueba visible de 10 días. Se eligió México/MXN y datos de ejemplo. El usuario inicial aparece como administrador de su empresa.

Las capturas y árboles de accesibilidad quedan en `evidence/authenticated/`, excluidos de Git porque contienen identidad y contexto de la cuenta. El análisis y casos normalizados están en [Resultados autenticados](08-resultados-autenticados.md) y `fixtures/observed-calculations.json`.

## Cobertura real

| Módulo | Resultado observado | Pendiente |
|---|---|---|
| Registro y bienvenida | Cuenta creada, acceso privado, país, carga de ejemplos | RD y cambio de país no probados |
| Inicio | Tablero mensual, estados, tasa de cierre y pendientes | Evolución con cotizaciones comerciales |
| Vehículos | Seis perfiles; detalle completo de tractocamión T3-S2 | Guardado de modificaciones y límites de validación |
| Gastos y flota | Gastos de ejemplo, tres categorías, 40 unidades y recuperación por hora | Edición/importación de gastos |
| Equipamiento | 35 artículos con nombre, descripción, precio y edición de tabla | Importación/exportación |
| Clientes | Alta y consulta de un registro sintético; notas privadas | Validación fiscal y archivo/restauración |
| Flete | Ruta CDMX–Puebla, alternativas, clase, peajes, desglose y cambio de utilidad | Retorno/vacío, esperas y descansos largos |
| Cotización | COT-2026-0001 creada en borrador, una partida; lista y detalle con total persistido | Transiciones de estado y recálculo histórico |
| Renta | Un mes sin ruta: estructura, depreciación, capital, 208 h, precio | Excedentes, precio cerrado y renta con ruta |
| Tarifario | Interfaz, selección de ruta/unidades y porcentajes | No se generó/guardó matriz: falta ruta guardada |
| Plantillas | Plantilla predeterminada y variables de Word cargadas desde servidor | Archivo exportado y documento renderizado |
| PDF de cotización | Opción ejecutada; espera de descarga agotada | Descarga no acreditada; no concluir fallo del backend |
| Roles | Roles de sistema y 49 permisos directos del rol usuario | Pruebas negativas de autorización |
| Usuarios | Directorio propio: un administrador | Altas/invitaciones y permisos no modificados |
| Configuración | Empresa, numeración, preferencias e integraciones visibles | Inspección profunda de numeración/preferencias |
| Integraciones | Gmail, SMTP, WhatsApp y Telegram sin conectar | No se conectaron servicios adicionales ni se enviaron mensajes |
| Respaldo | Sección visible pero botón deshabilitado | Portabilidad completa no demostrada |
| Soporte y envíos | Páginas accesibles; formulario/canales identificados | No se enviaron tickets ni documentos |

## Registros creados

- Cuenta y empresa de evaluación con ejemplos suministrados por el producto.
- Cliente sintético: `Cliente de prueba - evaluación técnica`, sin correo ni teléfono.
- Cotización `COT-2026-0001`, borrador, descripción `PRUEBA TÉCNICA — CDMX a Puebla — sin envío`, con aviso de que no representa oferta comercial.

No se compró una suscripción ni se conectaron cuentas adicionales. El acceso privado no entrega fuentes del servidor ni acceso a empresas ajenas. No se solicitó ni se consiguió superadministración de plataforma.

## Historial de acceso

Antes de esta sesión faltaban la identidad específica y la aceptación final. El usuario resolvió ambas. Chrome permitió Google; la alternativa del navegador integrado no había producido un diálogo visible. Estos bloqueos anteriores están resueltos y ya no impiden la revisión privada.
