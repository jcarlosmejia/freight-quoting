# Resultados de la investigación dentro de la aplicación

Fecha: 25 de octubre de 2026. Se utilizó exclusivamente la empresa propia de evaluación, con datos de ejemplo del producto y un cliente sintético. Estos resultados amplían y, donde corresponde, reemplazan los límites de la primera investigación pública.

## 1. Preparación y datos iniciales

La bienvenida tiene cuatro pasos: bienvenida, país, modo de inicio y finalización. Ofrece México y República Dominicana. Avisa que el país no puede cambiarse desde la aplicación una vez elegido para evitar mezclar monedas.

Con México y datos de prueba carga plantillas de cotización y tarifario, gastos, equipo, seis perfiles de costo y una flota de referencia. El tablero aclara que los montos cotizados no representan cobros realizados.

Perfiles observados: F-350 A2, Rabón C2, Tortón C3, tractocamión plataforma T3-S2, tractocamión caja seca T3-S3 y doble semirremolque T3-S2-R4. El listado de equipamiento contiene **35 artículos**.

Evidencia: `01-home`, `02-vehicles`, `03-vehicle-profile`, `13-equipment` bajo `evidence/authenticated/`.

## 2. Recuperación de gastos de la flota

| Variable | Valor observado |
|---|---:|
| Gastos fijos anuales | $8,604,000.00 |
| Grandes | 10 unidades × 312 días × 8 h = 24,960 h |
| Medianos | 20 × 312 × 8 = 49,920 h |
| Pequeños | 10 × 312 × 8 = 24,960 h |
| Flota | 40 unidades, 99,840 h/año |
| Recuperación general | $86.18/h mostrados |

La fórmula `8,604,000 / 99,840` reproduce el valor mostrado al redondear a centavos. Esto valida un caso; no prueba anualización de todas las periodicidades ni comportamiento con horas cero.

## 3. Perfil de referencia T3-S2

| Parámetro | Valor observado |
|---|---:|
| Valor del vehículo | $1,299,534 |
| Vida | 700,000 km / 8 años |
| Rescate | 20% = $259,906.80 |
| Base depreciable | $1,039,627.20 |
| Capital promedio del vehículo | $779,720.40 |
| Tasa de capital | 10% anual |
| Costo anual de capital del vehículo | $77,972.04 |
| Semirremolque | $500,000; 1,000,000 km; 15 años |
| Rendimiento cargado / vacío | 2 / 2.5 km/L |
| Diésel | $23.41/L mostrado |
| Tanque / recarga | 600 L / 20 min |
| Ralentí | 3 L/h |
| Descanso | Cada 8 h; duración 8 h; costo $800 |
| Mantenimiento | $9,000 cada 25,000 km |
| Horas anuales de la unidad | 2,496 |
| Gasto específico | $37.75/h mostrado |
| Equipo | $6.88/h mostrado |

En este caso, `capital_promedio = (valor + rescate_monetario) / 2` reproduce la pantalla. Al sumar el activo de $500,000 con rescate del 20%, el capital promedio combinado mostrado en el cotizador es $1,079,720.40 y el costo anual $107,972.04. Esto precisa la fórmula candidata de capital de la primera versión del análisis; aún requiere otros casos.

## 4. Flete real de prueba: CDMX → Puebla

Origen buscado como Ciudad de México, destino Puebla (Puebla, México); T3-S2, con tráfico, un tramo cargado, sin retorno, sin espera ni descanso. La aplicación solicita ejecutar la búsqueda con su botón de lupa; no bastó con escribir el nombre.

La ruta principal mostró **130.2 km y 2 h 3 min**. El detalle mostró **130.228 km cargados**. Hubo una alternativa de 157.5 km/2 h 30 min. Peajes: **$1,304** para la unidad elegida. El mapa indicó 109.3 km en zonas altas de denuncias; no se contrastó ese indicador con los datos originales ni se interpretó como probabilidad de robo.

| Rubro | Valor mostrado |
|---|---:|
| Combustible | $1,524.32 |
| Neumáticos | $59.53 |
| Mantenimiento | $46.88 |
| Depreciación vehículo + semirremolque | $245.50 |
| Descansos | $0 |
| Gastos generales | $177.85 |
| Gastos específicos | $77.90 |
| Equipamiento | $14.19 |
| Capital | $89.27 |
| Subtotal de rubros cargados | $2,235.45 |
| Pago variable al operador | $390.69 (1 operador, $3/km cargado) |
| Peajes | $1,304.00 |
| Costo total del viaje | $3,930.14 |
| Utilidad al 20% | $525.23 |
| Financiamiento y aumento de carga | $0 |
| Subtotal de venta | $4,455.36 |
| IVA 16% | $712.86 |
| Total | **$5,168.22** |

El aumento de utilidad al 30%, sin cambiar ruta/unidad, mostró utilidad de $787.84, subtotal $4,717.98 e IVA $754.88, para un total de **$5,472.85**. Después se restauró el 20% para guardar la prueba.

La base de utilidad observada es consistente con rubros cargados más pago al operador, excluyendo peajes. No se ha validado la regla en rutas con vacío ni con comisiones activas.

### Precisión y redondeo

No reconstruir los totales sumando exclusivamente cifras mostradas: $3,930.14 + $525.23 da $4,455.37, pero la pantalla muestra $4,455.36. El cálculo conserva más precisión interna o tiene otra política de redondeo; la causa no se inspeccionó. La especificación de un equivalente debe documentar el orden y momento de redondeo.

También se observan en accesibilidad representaciones binarias de números capturados (por ejemplo, 23.40999984741211), mientras la pantalla presenta 23.41. Esto no basta para identificar el tipo de columna en la base de datos.

### Pago al operador: precisión adicional

La UI ofrece por separado **por kilómetro**, **por hora**, **comisión sobre neto** y **comisión sobre utilidad**. Solo se ejecutó el caso por km. La descripción pública de una comisión sobre ganancia no cubre todos los modos visibles: no asumir que ambos tipos de comisión comparten fórmula.

## 5. Guardado y documentos

Se creó el cliente sintético y la cotización **COT-2026-0001** en estado **Borrador**, con una partida de prueba y total persistido de **$5,168.22**. El detalle muestra cantidad, precio unitario, subtotal e impuesto; ofrece precio justificable, añadir flete/renta y botones de descargar/enviar.

La cotización y el cliente siguen disponibles para continuar pruebas. No se enviaron documentos a nadie.

El selector de exportación contiene PDF y Word. Se ejecutó PDF, pero la herramienta no confirmó el archivo descargado antes de agotar su espera. La página siguió accesible. **Esto es una exportación no acreditada; no prueba que el backend haya fallado.** Después apareció un aviso de conexión a reCAPTCHA, cuya relación con la descarga no se estableció.

En Plantillas se cargó `plantilla-cotizacion-default`. Se confirmaron variables de empresa, cliente, folio, fechas, notas, partidas e importes, incluido costo vacío no cobrado. La interfaz indica repetir filas con `cloneRow`. No se infiere el framework del backend solo por ese texto.

## 6. Renta mensual sin recorrido

Misma unidad; modo Mensual, cantidad 1; sin mapa ni kilometraje; diésel y casetas a cargo del cliente; sueldo mensual adicional del operador en cero; un operador; utilidad 20%, IVA 16%.

| Bloque | Valor mostrado |
|---|---:|
| Periodo | 1 mes, 26 días, 208 h facturables |
| Gastos generales | $17,925.44 |
| Gastos específicos | $7,852.00 |
| Equipamiento | $1,430.14 |
| Subtotal estructura | $27,207.58 |
| Depreciación vehículo | $10,829.45 |
| Depreciación semirremolque | $2,222.22 |
| Capital | $8,997.67 |
| Operador | $0 |
| Disponibilidad/costo base | $49,256.92 |
| Uso, combustible y casetas cobradas | $0 |
| Utilidad | $9,851.38 |
| Subtotal | $59,108.31 |
| IVA | $9,457.33 |
| Total | **$68,565.63** |

No se guardó una cotización de renta. El caso acredita que el sistema calcula disponibilidad sin ruta. No acredita límites de km ni excedentes.

## 7. Gobierno y operación

Los roles iniciales son `admin` y `usuario`, ambos de sistema y no editables. El rol usuario muestra 49 permisos directos: incluye cotizaciones, tarifas, clientes, vehículos, equipo, gastos, rutas, plantillas y canales; excluye facturación, numeración, preferencias, respaldo, usuarios y roles. Empresa aparece parcialmente habilitada. Son permisos mostrados, sin pruebas negativas en backend.

La configuración expone empresa, numeración, integraciones y preferencias. **Respaldo está deshabilitado** en la sesión administrativa observada; no se conoce la razón. No se modificaron roles ni se otorgaron accesos.

El tarifario pide una ruta guardada y vehículos, con utilidad/financiamiento/IVA. Se inspeccionó su interfaz, pero no se generó matriz. Integraciones muestra Gmail, SMTP, WhatsApp Lite y Telegram sin conectar. Soporte permite nuevo mensaje y adjuntos; Envíos muestra filtros por usuario y cliente. No se ejecutaron comunicaciones, compras ni restauraciones.

## 8. Qué cambia para construir un equivalente

1. Ya hay dos casos numéricos de referencia y una variación de utilidad para comparar un motor propio.
2. Deben implementarse ambos modos de comisión visibles y comprobar sus bases antes de cerrar alcance.
3. Un snapshot debe guardar la precisión suficiente para reproducir el total, no solo los importes presentados.
4. Fechas civiles necesitan pruebas de zona horaria: el campo de vigencia muestra `2026-11-24` y encabezado/lista muestran 23 de noviembre. No se determinó si la discrepancia nace en presentación o servidor.
5. La migración no puede basarse por ahora en un respaldo completo de la cuenta: el acceso está deshabilitado.
6. Se mantiene el límite de fuentes: la cuenta normal no proporciona el código servidor. Los archivos descargados son de distribución y no forman un proyecto autónomo.
