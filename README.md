# Fletcot: investigación para operación independiente

Investigación pública y autenticada del 25 de octubre de 2026. Objetivo: entender el producto, conservar evidencia pública y definir cómo obtener o construir un sistema propio modificable.

**Resultado:** se recuperaron los archivos distribuidos al navegador, el mapa de navegación, referencias a la API y documentación funcional embebida. **No se obtuvo el proyecto fuente original, el backend ni una base de datos. Este repositorio no es una aplicación autónoma ejecutable.**

Fletcot anuncia una licencia única que incluye código completo, documentación e instalación en infraestructura propia, con precio a convenir: [oferta oficial](https://fletcot.com/#precios). Es una alternativa concreta a reconstruirlo, pendiente de verificar mediante una entrega y condiciones escritas.

## Leer en este orden

1. [Producto y módulos](docs/01-producto.md): fundamentos, pantallas, capacidades y flujos.
2. [Arquitectura observada](docs/02-arquitectura.md): frontend, sesiones, estado, API y mapas.
3. [Motor económico](docs/03-costeo.md): reglas recuperadas, fórmulas propuestas y pruebas necesarias.
4. [Dominio y API](docs/04-dominio-api.md): entidades candidatas y contratos visibles.
5. [Independencia y reconstrucción](docs/05-independencia.md): alternativas, fases y criterios de aceptación.
6. [Método, evidencia y límites](docs/06-evidencia.md): qué se hizo y qué falta.
7. [Cobertura de la revisión privada](docs/07-revision-privada.md): cuenta creada y recorrido por módulos.
8. [Resultados autenticados](docs/08-resultados-autenticados.md): casos reales de flete/renta, guardado, permisos y limitaciones.

La cuenta de prueba ya está creada. Se recorrieron los módulos propios, se creó un cliente sintético y la cotización COT-2026-0001, y se capturaron casos de flete y renta. Sus valores normalizados están en `fixtures/observed-calculations.json`; las capturas privadas están en `evidence/authenticated/` y no se incluyen en Git.

## Inventario comprobado

- 180 respuestas públicas correctas: 138 JavaScript, 14 CSS, 24 imágenes y 4 HTML.
- 50 registros de rutas; incluye padres, redirecciones, rutas parametrizadas y pantalla de error. No son 50 pantallas independientes.
- 160 referencias léxicas a rutas/endpoints; incluyen duplicados, rutas de UI, expresiones dinámicas y valores alternativos. No son 160 operaciones API confirmadas.
- 4 archivos con ofuscación visible, incluido el motor de costos.
- Ninguna referencia `sourceMappingURL` en los 138 JavaScript descargados. No demuestra que no existan mapas en otros lugares.
- 347 fragmentos de documentación seleccionados automáticamente; conservan posibles cortes y ruido de compilación.

## Archivos

`evidence/manifest.json` conserva URL, fecha UTC de captura, código HTTP, tamaño y SHA-256. `evidence/routes.json` y `.csv` describen la navegación. `evidence/endpoints.json` enumera referencias estáticas; `evidence/dependencies.json`, las importaciones.

Los originales están en `evidence/raw/`, excluidos de Git. La documentación extraída y las capturas también quedan locales: pueden contener contenido de terceros y configuración pública de sus servicios. No se asigna una licencia nueva al código de Fletcot ni se publican estos archivos.

## Repetir la captura y verificar

Requiere Python 3 y curl; no instala dependencias ni ejecuta el JavaScript descargado.

```sh
python3 scripts/collect_public.py --self-test
python3 scripts/collect_public.py
python3 scripts/analyze_public.py
python3 scripts/check_observed_cases.py
```

La captura realiza GET sin credenciales, con tres solicitudes simultáneas, límite de 450 candidatos y 12 MB por respuesta. Solo sigue candidatos de los dos hosts públicos. El análisis comprueba las huellas de las respuestas correctas y valida casos representativos del inventario.

No ejecutar una copia del frontend contra la API de producción para desarrollar el reemplazo. Un backend propio y credenciales propias forman parte del alcance pendiente.
