# Producto: fundamentos y funciones

## Qué resuelve

Fletcot transforma el costo de operar una unidad y una ruta en una propuesta comercial. No basta con multiplicar kilómetros por una tarifa fija: dos rutas de distancia similar pueden tener distintos peajes, esperas, regresos vacíos y costos de unidad.

El flujo principal es **configurar empresa y flota → definir servicio → calcular → guardar → documentar → enviar → consultar historial**. Existe un segundo flujo de **renta/disposición**, donde se vende disponibilidad durante un periodo y un uso estimado.

Niveles de evidencia: **observado** significa visible en archivos públicos o pantalla; **documentado** significa declarado por el producto, sin ejecución autenticada; **propuesto** significa diseño para el reemplazo. La presencia de una pantalla o endpoint no demuestra que la función opere correctamente.

## Mapa de capacidades

| Área | Capacidades recuperadas | Ruta / evidencia principal |
|---|---|---|
| Acceso | Email/contraseña, Google, confirmación de correo, recuperación, vencimiento de prueba | `/auth/*`, `useAuth-8KYdCYdB.js` |
| Inicio y aprendizaje | Inicio, guía inicial, documentación por secciones | `/admin/home`, `/admin/primeros-pasos`, `/admin/docs` |
| Cotizador | Flete y renta; vehículo; paradas; carga/vacío; espera y ralentí; ruta y desglose | `/admin/quotes`, `QuotePage-MlzOT24K.js` |
| Mapa | Bases y ubicaciones, itinerario, opciones de trazado, casetas, incidencias y denuncias | Componentes `QMyBasesModal`, `QItineraryPanel`, `QTollsPanel`, `QRouteRiskPanel` |
| Cotizaciones | Folio, cliente, vigencia, estados, partidas, detalle, exportación y envío | `/admin/quotations/freight`, `/admin/quotations/detail/:id` |
| Clientes | Datos fiscales/comerciales, contactos, notas internas, archivo/restauración, Excel | `/admin/quotations/clients`, `useClients-Sq_M_Pxm.js` |
| Vehículos | Perfiles de costo, plantillas, edición por rubro, PDF de perfil | `/admin/vehicles`, `useVehicles-VTEtuCKG.js` |
| Gastos | Gastos generales y específicos; anualización y segmentación de flota | `/admin/bills/fixed-expenses`, subruta `data-analysis` |
| Equipamiento | Catálogo, precio unitario, asignación a unidad, cantidad y reposición | `/admin/board-equipment` |
| Tarifarios | Matriz ruta × vehículo, fijación histórica, recálculo actual | `/admin/price-list`, `PriceListPage-BS0hukqg.js` |
| Documentos | Plantillas Word por tipo, variables, versión predeterminada, PDF, compartir | `/admin/templates`, `useQuoteTemplates-BDZcRMeJ.js` |
| Envíos | Email/Gmail/SMTP y WhatsApp; historial | `/admin/sent`, `SentDocumentsPage-Dtt1ejt8.js` |
| Organización | Empresa, logo, folios, preferencias, usuarios, roles/permisos | `/admin/settings`, `/admin/users`, `/admin/roles` |
| Asistente | Telegram por usuario; captura documental, consultas y confirmación de cambios | Documentación embebida y `/telegram/*` referenciado |
| Soporte | Tickets, mensajes, adjuntos; bandeja de administración | `/admin/support`, `/admin/support-inbox` |
| Comercial SaaS | Prueba, facturación, checkout, portal y solicitudes de factura | `/admin/billing`, `useBilling-BfTUUOAp.js` |
| Operación de plataforma | Empresas, pagos, combustible, casetas duplicadas, coordenadas y carriles | Rutas con `requiredRoles:["superadmin"]` |

Las funciones de superadministrador pertenecen al operador del servicio; no debe esperarse obtenerlas con una cuenta normal de prueba.

## Perfil de la unidad

La documentación identifica: nombre y clase; dimensiones y peso; capacidad; valor de adquisición; vida útil por km y años; rescate y tasa anual de capital; llantas de dirección, motrices y arrastre; rendimientos con/sin carga; precio, capacidad de tanque y tiempo de recarga; consumo en ralentí; intervalos, duración y costo de descanso; mantenimiento; remolques/activos; categoría de uso; gastos propios; equipo y reposición; esquema y cantidad de operadores.

Las plantillas de referencia se atribuyen al IMT (PT838 2024). Son valores iniciales ajustables, no datos medidos de una empresa. No se ha obtenido el catálogo completo de plantillas del backend.

## Cotización por ruta

1. Seleccionar unidad y tipo de carga.
2. Ordenar origen, paradas y destino. La bandera de carga de una parada aplica al tramo que sale de ella.
3. Definir esperas, consumo detenido y opciones del trazado.
4. Obtener distancias y tiempos por tramo; detectar casetas según clase vehicular.
5. Revisar costo por rubro, vacío que se recupera, rubros con utilidad, operador y otros gastos.
6. Aplicar utilidad, financiamiento opcional, recargo de carga e impuesto.
7. Guardar cliente, folio, vigencia y copia del cálculo.
8. Exportar y enviar; registrar el envío.

Estados documentados: borrador, enviada, aceptada, rechazada y vencida. Las transiciones reales y sus permisos quedan por probar.

## Renta y tarifarios

La renta distingue disponibilidad fija y uso variable. Permite hora, jornada, día, semana, mes o precio cerrado, responsables de combustible/casetas, cantidad de operadores, límite de kilometraje y excedentes. Un mes representa 1/12 del año operativo, no necesariamente 30 días naturales.

El tarifario calcula combinaciones de rutas guardadas y unidades. Antes de guardar es una vista con datos actuales; después conserva valores históricos. Recalcular debe mantener la estrategia comercial y usar parámetros frescos. La difusión de ajustes a todas las filas conserva el rendimiento de cada unidad y no propaga gastos particulares de un viaje.

## Alcance geográfico y diferencias

La web anuncia México y República Dominicana, distintas configuraciones vehiculares y datos de impuestos/moneda por país. Denuncias por municipio se anuncian para México, con ventanas de 3, 6 y 12 meses. Las incidencias de tráfico se anuncian solo para suscripción, excluidas de la prueba.

Fuentes: [sitio comercial](https://fletcot.com/), `evidence/routes.json`, `DocsPage-DU8KY3Vh.js` y los módulos nombrados. Las capturas promocionales muestran el producto, no una sesión probada por esta investigación.
