# Recuperación de código y comportamiento

Fecha: 25 de octubre de 2026. Esta fase buscó fuentes originales disponibles legítimamente y, a falta de ellas, analizó los recursos públicos ya capturados para reconstruir el comportamiento. Todo se hizo con recursos públicos y sin credenciales.

## Clasificación usada

| Clase | Significado |
|---|---|
| Fuente original recuperada | Código fuente del autor (Vue/TS, backend, migraciones) obtenido de una fuente legítima. |
| Código compilado recuperado | Archivos de distribución descargados públicamente, incluidos los desofuscados o formateados. |
| Código reconstruido | Implementación propia de este repositorio (`app/`). |
| Comportamiento inferido | Regla deducida del código compilado o de casos observados, sin confirmación en una sesión del proveedor. |
| Pendiente de verificar | Sin evidencia suficiente. |

**Resultado global: no se recuperó ninguna fuente original.** Lo recuperado es código compilado. La aplicación de `app/` es código reconstruido.

## Registro por técnica

| # | Técnica | Resultado | Clase |
|---|---|---|---|
| 1 | Inspección de recursos públicos (HTML, JS, CSS, importaciones, manifiestos) | Se confirmó que los archivos reales están en `evidence/raw/app.fletcot.com/assets/`; `assets/assets/` contiene 146 páginas 404 de nginx de la primera pasada, no código. El `index.html` público actual es idéntico byte a byte al capturado. | Código compilado recuperado |
| 2 | Sesión en navegador / DevTools | El navegador integrado no tiene sesión de Fletcot (redirige a `/auth/login`). La sesión anterior vivía en Chrome del usuario y no está accesible desde esta herramienta. No se reutilizaron cookies ni se intentó iniciar sesión. | Pendiente de verificar |
| 3 | Repositorios, paquetes y documentación pública | GitHub API: 0 repositorios para "fletcot". npm: 0 paquetes. Buscador: sólo el sitio, la app y publicaciones del autor en grupos de Facebook (anuncian el producto, datos SESNSP para denuncias y un "SaaS para cotizar fletes"). `api.fletcot.com/`, `/docs`, `/openapi.json` devuelven 404 JSON. Sin OpenAPI público. | Sin fuente original |
| 4 | Mapas de fuente | GET a `<chunk>.js.map` para la entrada y los seis módulos clave: 404. `.vite/manifest.json`, `manifest.webmanifest`, `package.json` y `sw.js` devuelven el `index.html` de la SPA (fallback), no archivos reales. | Sin fuente original |
| 5 | Formateo y desofuscación estática | Los 4 chunks ofuscados usan un patrón tipo obfuscator.io (arreglo de cadenas rotado + RC4). Se procesaron con `webcrack` en un directorio aislado (fuera del repositorio), sin red y sin ejecutar la aplicación: sólo se evalúa el decodificador de cadenas dentro de un aislamiento V8. Resultado legible en `evidence/deobfuscated/` (excluido de Git). Otros 29 chunks se formatearon en `evidence/pretty/`. Hashes en `evidence/recovery-inventory.json`. | Código compilado recuperado |
| 6 | Llamadas API de la interfaz | Sin sesión no se observaron respuestas. Del código: `GET /calculate/params/{vehículo}` entrega los parámetros de cálculo; `/tarifarios`, `/tarifarios/bootstrap`, `/dashboard/price-check`, `/dashboard/layout`. `api.fletcot.com/auth/me` sin cookie responde 401 con CORS restringido a `app.fletcot.com`. | Comportamiento inferido |
| 7 | Capturas y estados | Se reutilizaron las capturas autenticadas existentes (privadas, excluidas de Git) como referencia visual de la nueva interfaz. | Evidencia privada |

Licencia: la página de precios anuncia "Licencia única… el código fuente y la documentación pasan a tu equipo… instalación en tu infraestructura… precio a convenir". No publica términos de modificación, número de instalaciones, catálogos incluidos ni soporte. No se contactó a ventas ni se aceptó ningún acuerdo.

Los nombres de variables del código desofuscado son los del compilador (`k`, `W`, `_0`) o propiedades que el propio código conserva (`costoSinUtilidad`, `tramosVaciosCobrar`). No se presentan nombres reconstruidos como originales. El código de `app/` es redacción propia; no copia los archivos de Fletcot.

## Motor de cálculo recuperado (comportamiento inferido del código compilado)

Archivos: `useQuoteCalculation` (costos por rubro), `QRouteDetailModal` (precio en vivo), `useFrozenRecalc` (recálculo de snapshots), `useRentalCalculation` (renta), `PriceListPage` (tarifario).

### Tiempo y distancia

- Km cargados/vacíos: cada tramo `i` toma la bandera `withLoad` de la parada `i`.
- Litros = km / rendimiento (cargado o vacío). Recargas = `floor(litros totales / tanque)` × minutos de recarga.
- Ralentí: suma de horas+minutos por parada × L/h.
- Descansos = `floor(horas de manejo / frecuencia)`; cada uno suma su duración y su costo. Un descanso se genera exactamente al llegar a la frecuencia.
- El tiempo de manejo se reparte entre cargado y vacío en proporción a km.
- Horas con cliente = manejo cargado + esperas + descansos + recargas. Horas sin utilidad = manejo vacío.

### Rubros

- Combustible cargado incluye ralentí. Neumáticos: Σ cantidad × precio / vida km por eje. Mantenimiento: costo / intervalo × km.
- Depreciación en flete: (valor − rescate) / vida km por cada activo, con el % de rescate del vehículo para todos los activos.
- Capital: Σ (valor + valor × rescate%) / 2 × tasa anual ÷ (días/año × horas/día de la categoría) × horas.
- Gastos generales, específicos y equipamiento: tarifa por hora × horas (con cliente o vacías).

### Precio (en vivo)

1. `vacío cobrado` = Σ rubros vacíos marcados "cobrar" (por defecto todos); `vacío con utilidad` = los marcados además con utilidad (por defecto ninguno).
2. Comisión sobre neto = (total cargado + vacío cobrado) × % × operadores; pago al operador en costo = km/hora + esa comisión.
3. Base de utilidad = total cargado + vacío con utilidad + pago al operador (si "aplicar utilidad") + otros gastos marcados.
4. Costo del viaje = base + vacío sin utilidad + pago sin utilidad + peajes. Gasto total = costo del viaje + otros gastos.
5. Financiamiento = gasto total × %. Aumento por carga = (gasto + utilidad + financiamiento) × %. IVA sobre el subtotal resultante.
6. Comisión sobre utilidad = utilidad × % × operadores: se guarda en el snapshot pero **no** se suma al precio; el tablero de "price-check" la suma al costo al comparar.

### Renta

- Periodo: hora, jornada (12 h por defecto), día, semana (`días/52`), mes y renta fija (`días/12`). Valores por defecto 312 días y 8 h.
- Disponibilidad = tarifas/hora × horas anuales de la categoría × fracción del año + depreciación + capital + operador (`sueldo × operadores × 12 × fracción`).
- Depreciación en renta: `max(calendario, por km)` por activo ("lo que ocurra primero").
- Uso = (combustible si lo incluye + llantas + mantenimiento) por km del periodo. Con tope activo se usa km incluidos.
- Utilidad sólo sobre disponibilidad + uso. Peajes = casetas/km de la ruta representativa × km si están incluidas.
- Excedente por km = subtotal / km incluidos × (1 + recargo); 50% por defecto.

### Parámetros que calcula el servidor (reconstruidos)

`/calculate/params` no se pudo leer. Se reconstruyó con los casos observados:

| Valor | Regla | Comprobación |
|---|---|---|
| Tarifa general/hora | Σ gastos anualizados ÷ Σ (vehículos × días × horas), **redondeada a centavos** | 8,604,000 / 99,840 = 86.1779 → 86.18; con 86.18 la renta da 17,925.44 (con 86.1779 daría 17,925.00) |
| Específicos/hora | Σ anualizados (Diario × días, Semanal × 52, Mensual × 12) ÷ horas de la unidad, **redondeada** | 94,218 / 2,496 = 37.7476 → 37.75; la renta da 7,852.00 sólo con 37.75 |
| Equipamiento/hora | Σ cantidad × precio / (años + meses/12) ÷ horas, **sin redondear** | 17,161.67 / 2,496 = 6.8757; la renta da 1,430.14 sólo sin redondear |

Periodicidades de gastos generales confirmadas en el código: Mensual ×12, Bimestral ×6, Trimestral ×4, Semestral ×2, Anual ×1.

## Discrepancias investigadas

### Centavos

En el caso CDMX → Puebla, 3,930.14 + 525.23 = 4,455.37 pero la pantalla muestra 4,455.36. El código no redondea pasos intermedios; sólo formatea. Se buscó en la rejilla 130,227.5–130,228.5 m × 7,380–7,440 s qué entradas reproducen los 15 importes mostrados con el motor local: hay 15 combinaciones (p. ej. 130,228.35 m y 7,429.15 s). **Conclusión:** la diferencia es redondeo de presentación de importes calculados con precisión completa. Los metros/segundos exactos del proveedor de rutas siguen sin conocerse.

### Fechas

Vigencia `2026-11-24` aparecía como 23 de noviembre en encabezado y lista; la emisión del 25 de octubre aparecía como 24. El código de lista y detalle formatea con `new Date(valor).toLocaleDateString('es-MX')`. Un texto `AAAA-MM-DD` se interpreta como medianoche UTC; en America/Mexico_City (UTC−6) cae en el día anterior. El tablero sí agrega `T12:00:00` y no tiene el problema. **Conclusión:** comportamiento inferido con alta confianza: error de presentación en el navegador, no del servidor. Falta ver la respuesta JSON real para confirmar que el servidor entrega sólo la fecha. La implementación local formatea fechas civiles sin conversión de zona.

### Recálculo de vacíos

El recálculo de snapshots (`useFrozenRecalc`) omite `capital` de los rubros vacíos cobrables, mientras la vista en vivo lo incluye. Una cotización recalculada con capital vacío cobrado podría cambiar. La implementación local usa la regla en vivo en ambos casos. **Pendiente de verificar** en sesión.

### Duración

`2h 3min` para ≈7,429 s implica minutos truncados, no redondeados. La implementación local trunca.

## Datos externos que no se recuperan

Catálogos de casetas por clase y sentido (SCT/CAPUFE), carriles, precios de combustible, denuncias SESNSP, incidentes de tráfico y plantillas IMT completas viven en el servidor o en proveedores. No están en los recursos públicos. La implementación local no los inventa: el usuario los captura con fuente y vigencia.

## Reproducir

```sh
mkdir -p "$TMPDIR/tools" && (cd "$TMPDIR/tools" && npm init -y && npm i webcrack)
node scripts/deobfuscate_public.mjs "$TMPDIR/tools"
```

La salida queda en `evidence/deobfuscated/` (excluida de Git, no se publica). Los hashes de entrada y salida están en `evidence/recovery-inventory.json`.
