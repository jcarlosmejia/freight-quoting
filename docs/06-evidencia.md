# Método, evidencia y límites

Fecha de investigación: 25 de octubre de 2026, referencia del usuario en America/Mexico_City. Los manifests conservan sus fechas reales de captura en UTC; no se cambian para ajustarlas a la fecha de la conversación.

## Recorrido realizado

1. Lectura del sitio comercial y separación del host de la aplicación.
2. Búsqueda web de documentación y fuentes; búsqueda GitHub por Fletcot. No apareció un repositorio original verificable; esto no demuestra que no exista uno privado o sin indexar.
3. Recuperación HTML de la web y de la SPA; seguimiento de JavaScript/CSS e imágenes enlazadas.
4. Dos pasadas de captura. La primera produjo candidatos incorrectos `assets/assets/`; se corrigió el resolvedor y se repitió la captura. La primera lista queda conservada como registro de intentos, no como inventario de éxito.
5. Inspección estática de entradas, rutas, composables, documentación, geometría y llamadas de datos. No se ejecutó el código descargado localmente.
6. Inspección visual de acceso y registro, y de una captura pública del cotizador.
7. Inspección de términos y aviso de privacidad públicos. Ambos contienen algunos textos pendientes de completar; se registra como observación documental, sin concluir nada sobre la seguridad técnica del producto.
8. Preparación de repositorio local, documentos e instrumentos reproducibles.

## Resultado de captura corregida

215 candidatos solicitados; 180 respuestas 200 y 35 respuestas 404. Varios candidatos 404 eran nombres internos de bibliotecas incluidos como cadenas en bundles, no recursos desplegados separados. El recolector no distingue todos esos casos semánticamente. Ninguno se cuenta como recurso obtenido.

Los 180 correctos: 138 JS, 14 CSS, 22 WebP, 2 PNG y 4 HTML. Cada respuesta tiene hash SHA-256 en `manifest.json`. El archivo previo no se suma a estos totales.

No se guardaron videos ni se siguieron dominios externos de Google/Mapbox para la captura. No se usaron credenciales públicas encontradas para consumir servicios de terceros.

## Índices y su significado

| Archivo | Uso | Límite |
|---|---|---|
| `manifest.json` | Trazabilidad de URL, resultado, fecha, hash y archivo | Contiene también intentos fallidos |
| `manifest-first-pass.json` | Auditoría de primera captura | No representa cobertura final |
| `routes.json` y `routes.csv` | 50 registros de router | Padres y redirecciones incluidos |
| `endpoints.json` | 160 referencias con archivo y posición | Extracción léxica, no contrato probado |
| `dependencies.json` | Importaciones de 138 JS correctos y señal de ofuscación | No recupera proyecto original |
| `docs-extracted.txt` | 347 fragmentos seleccionados | Puede cortar interpolaciones; consultar original |
| `raw/` | Respuestas originales | Sin licencia de redistribución concedida por esta captura |
| `register-screen.png` | Evidencia de formulario público | No acredita cuenta creada |

Los documentos de análisis son redacción propia. Los originales y el texto extraído quedan excluidos de Git para conservarlos localmente sin incorporarlos a una futura publicación del repositorio.

## Herramientas y alternativas

- Navegación web y descargas HTTP públicas.
- Chrome DevTools MCP falló en dos intentos por conflicto de un perfil Chrome ocupado; no se mataron procesos ni se modificó el perfil.
- Navegador integrado usado para inspección pública. La opción Google no produjo un diálogo visible tras el clic autorizado; se probó Chrome como alternativa y abrió el selector. La elección de identidad sigue pendiente.
- Python y curl para captura y análisis. Sin nuevas dependencias de aplicación.
- Engram no estaba expuesto como herramienta MCP y el primer intento de lectura CLI encontró una base de memoria de solo lectura bajo el sandbox. El repositorio conserva los hallazgos. Posteriormente se guardó un resumen en la memoria local mediante la CLI autorizada.

## Qué no está demostrado

- Registro o sesión autenticada completados; revisión de funcionalidades privadas.
- Disponibilidad del backend fuente, base de datos, migraciones, jobs y secretos.
- Reproducción exacta del cálculo, redondeo y casos límite.
- Cumplimiento real de restricciones de camión y actualización/exactitud de tarifas.
- Aislamiento de empresas, autorización del servidor y gestión de credenciales.
- Proveedor real de tráfico/IA/pagos o arquitectura interna de infraestructura.
- Condiciones finales, precio y contenido efectivo de la licencia única.

No se sortearon autenticación, permisos, CAPTCHA ni protecciones del servicio. Una cuenta normal solo habilitaría sus propios datos y funciones autorizadas; no da acceso al código del servidor ni a empresas ajenas.
