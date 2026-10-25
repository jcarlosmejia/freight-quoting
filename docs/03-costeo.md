# Motor económico: reglas y especificación inicial

Este documento separa **reglas documentadas de Fletcot** de **fórmulas propuestas para una implementación propia**. No certifica equivalencia numérica con el motor ofuscado.

## Reglas recuperadas

- Cada tramo hereda carga/vacío de la parada inicial.
- El rendimiento cambia con la carga. El ralentí también consume combustible.
- Tiempo de servicio = manejo + esperas + recargas + descansos.
- Esperas y descansos se atribuyen al servicio del cliente; solo conducir vacío se clasifica como tiempo sin utilidad por defecto.
- Gastos fijos, equipo y capital se recuperan por tiempo; neumáticos y mantenimiento, por kilometraje.
- La depreciación excluye el rescate y contempla unidad y activos.
- El vacío tiene controles independientes de recuperación y utilidad. El costo físico total no cambia al decidir cuánto cobrar.
- Peajes se trasladan sin margen según la documentación. Deben contarse las pasadas: ida y vuelta pueden pagar la misma caseta dos veces.
- Otros gastos admiten utilidad configurable.
- Pago variable del operador puede combinar km, horas y comisión. La UI autenticada distingue comisión sobre neto y sobre utilidad; no se probaron esas modalidades. La documentación pública describe una comisión sobre ganancia, por lo que no basta para especificar ambas.
- La nómina garantizada del operador pertenece a gastos fijos para evitar duplicación.
- Una tasa de capital puede duplicar intereses ya incluidos en una mensualidad registrada como gasto fijo.

Fuentes independientes dentro del artefacto: `DocsPage-DU8KY3Vh.js`, campos/paneles de `QuotePage-MlzOT24K.js`, `CreateVehiclePage-DYl81BVN.js`, `useCountryProfile-xZ6rAWQQ.js`. El nombre de un campo no confirma su fórmula efectiva.

## Variables y fórmulas candidatas

| Concepto | Especificación candidata | Validación pendiente |
|---|---|---|
| Combustible | `(km_cargados / rendimiento_cargado + km_vacíos / rendimiento_vacío + horas_ralentí × consumo_hora) × precio_unidad` | Redondeo, impuesto deducible, ralentí por parada |
| Neumáticos | `km × suma(cantidad × precio / vida_km)` por tipo de eje | Excepciones de cantidad cero y activos |
| Mantenimiento | `km × costo_servicio / intervalo_km` | Costos extraordinarios y redondeo |
| Horas facturables de flota | `suma(unidades_categoria × días_año × horas_día)` | Categorías sin actividad |
| Recuperación general | `gastos_generales_anualizados / horas_facturables_flota` | Periodicidades y divisiones por cero |
| Gasto específico | `gasto_unidad_anual / horas_operativas_unidad` | Gastos por día/semana/mes/año |
| Equipo | `cantidad × precio / vida_años / horas_anuales_unidad` | Vida en años + meses, asignaciones por viaje |
| Capital | `capital_promedio × tasa_anual / horas_anuales × horas_servicio` | En el caso observado, promedio = (valor + rescate) / 2; faltan otros casos |
| Depreciación | Recuperar `valor − rescate` por vida de uso/tiempo | Elección exacta entre base temporal y kilométrica |
| Descansos | Conteo de descansos × costo, más duración en tiempo de servicio | Umbral exacto y manejo continuo entre tramos |
| Peajes | Suma por pasada × tarifa de clase/pago | Carril, sentido, discrepancias y vigencia |

Estas fórmulas se derivan del significado económico y la documentación. No son transcripción certificada del código de cálculo.

## Del costo al precio

Mantener separadas tres cantidades: **costo operativo real**, **costo recuperado al cliente** y **base de utilidad**. Quitar el retorno del cobro no elimina lo que cuesta recorrerlo.

Especificación propuesta:

1. Calcular todos los rubros por tramo y tiempo.
2. Aplicar controles de recuperación a los vacíos.
3. Determinar base de utilidad según rubros y decisiones.
4. Agregar pago variable del operador y gastos de viaje según configuración.
5. Calcular utilidad y financiamiento opcional.
6. Aplicar recargo de carga e impuesto según el perfil de país.
7. Redondear siguiendo una política explícita y guardar versión del cálculo.

La precedencia exacta entre financiamiento, recargo de carga y otras bases requiere casos de comparación. No usar esta lista como fórmula fiscal ni asumir que un porcentaje de utilidad sobre costo equivale a margen sobre venta.

## Renta

Disponibilidad: recuperación de gastos, equipo, depreciación temporal, capital y operadores. Uso variable: combustible si lo proporciona el transportista, llantas y mantenimiento. No duplicar depreciación en ambos bloques.

Mes = 1/12 del año operativo. Jornada, días operativos y cantidad de operadores afectan el precio. Hay uso estimado con ruta representativa, responsable de combustible/casetas y límite de km; el exceso documenta recargo por defecto del 50%. Las reglas de cierre por tiempo o km deben confirmarse en sesión.

## Pruebas de equivalencia que faltan

| Caso | Qué debe demostrar |
|---|---|
| Mismos km, carga distinta | Cambio de consumo y bases comerciales |
| Viaje redondo | Dos pasadas de caseta cuando corresponde |
| Tramo completamente vacío | Costo existente y cobro configurable |
| Ruta sin casetas | Total coherente sin cargos inventados |
| Espera sin movimiento | Tiempo y ralentí sin aumentar km |
| Umbral de descanso exacto | Regla inequívoca en frontera y tramos consecutivos |
| Categoría no configurada | Advertencia clara; no ocultar gastos en cero |
| Rescate y crédito | Sin doble recuperación de capital/interés |
| Cambio de combustible | Cotización histórica intacta y recálculo explícito |
| MX y RD | Moneda, impuesto, unidades y formatos correctos |
| Renta sin uso | Disponibilidad positiva con km cero |
| Redondeo | Suma de partidas, impuestos y total consistente |

Se completó acceso y se registraron casos de flete cargado, variación 20%→30% de utilidad y renta mensual con km cero. Ver [Resultados autenticados](08-resultados-autenticados.md). El resto de esta matriz sigue pendiente; los casos no prueban equivalencia completa.
