# Registro de avances, decisiones y obstáculos

## 25 de octubre de 2026

**Avances**

- Se confirmó que `evidence/raw/app.fletcot.com/assets/assets/` son 404 de la primera pasada; los 138 JS reales están un nivel arriba.
- Búsqueda de fuentes: sin repositorios, paquetes, mapas de fuente ni OpenAPI públicos (docs/09).
- Desofuscación estática de los 4 chunks ofuscados; el motor de flete, renta, recálculo y tarifario quedó legible.
- Reconstrucción de las tarifas por hora del servidor y explicación de las discrepancias de centavos y fechas.
- App local en `app/`: motor compartido, API Fastify + SQLite, interfaz Vue. 46 pruebas automáticas.
- Verificación en navegador: cotizador, detalle y renta reproducen los importes de las capturas; red sólo a `localhost`.
- Instalación desde copia limpia comprobada.

**Decisiones**

- Implementación propia en lugar de reutilizar archivos de Fletcot: no hay licencia publicada que permita copiar su código.
- Node 24 con `node:sqlite` y TypeScript sin compilación: cero dependencias nativas, un solo proceso.
- El servidor recalcula y guarda un snapshot completo por partida; recalcular es explícito y deja revisión.
- Ruteo y casetas por captura manual por defecto: no se inventan distancias, tiempos ni tarifas. Adaptadores opcionales con credenciales propias.
- Fechas civiles sin conversión de zona (no se replica el desfase de un día de Fletcot).
- Recálculo con la regla de vacíos de la vista en vivo (incluye capital), no la del recálculo de Fletcot.
- Tarifas general y específica redondeadas a centavos; equipamiento sin redondear: es lo que reproduce los casos.
- Envíos (correo, WhatsApp, Telegram) no se simulan: se muestran como no implementados.

**Obstáculos**

- Sin sesión de Fletcot en el navegador integrado: no se ampliaron los casos autenticados (lista en docs/10, "Pendiente de verificar"). Iniciar sesión con Google requiere al usuario.
- La herramienta de búsqueda web falló; se usó DuckDuckGo desde el navegador integrado y las API de GitHub y npm.
- El sandbox de comandos impide abrir puertos y conectar a `127.0.0.1`; el servidor se probó con el panel de vista previa y una petición local autorizada.
- Una transacción anidada y la entrega de assets tras recompilar fallaron en la primera ejecución; corregidos (SAVEPOINT; `@fastify/static` con comodín).
- Bug encontrado por las pruebas: crear una cotización con una partida inválida consumía folio. Ahora es atómico.
- Revisión de seguridad automática: un no-admin con `rol:usuario` o `asignar:permiso` podía escalar a admin. Se agregó techo de privilegios e invalidación de sesiones, con pruebas.

## 25 de octubre de 2026 (tarde): CARMAG TRANSPORTS

- Motor de cotización por km en centavos (`shared/pricing/kmquote.ts`), migración 002, API, asistente de 6 pasos con modo rápido, comparación de alternativas, PDF individual/comparativo, WhatsApp/correo (SMTP real con PDF), historial con filtros, seguimiento, mapa opcional con Leaflet y búsqueda de direcciones Nominatim configurable, logo en Word.
- Decisión: ampliar la app existente en vez de reescribir en Next.js/Prisma (docs/12).
- Corregido durante la verificación: `structuredClone` sobre objetos reactivos; redondeo comercial activo por defecto alteraba la tarifa exacta; recomendación con 0 km.
- Obstáculo: el sandbox no permite escribir `app/.env`; el mapa se probó con un servidor temporal y `--env-file` en scratch.
