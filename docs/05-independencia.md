# Cómo conseguir independencia real

## Dos caminos concretos

| Camino | Lo que entrega | Lo que debe resolverse |
|---|---|---|
| Licencia de código de Fletcot | La oferta anuncia fuentes completas, documentación e instalación propia | Confirmar alcance, derechos de modificación, catálogos, herramientas de build y operación sin licencia remota |
| Implementación propia | Control sobre reglas, datos, interfaz y despliegue | Construir y validar costos, mapas, peajes, documentos, autenticación y operación |

La captura pública sirve como referencia y evidencia. No sustituye ninguno de esos caminos: el frontend descargado aún depende del servidor y de servicios de terceros.

## Entrega a exigir si se adquiere la licencia

Antes de dar por conseguida la independencia, verificar en una máquina limpia:

1. Fuentes originales frontend/backend, manifiestos, versiones y lockfiles; instrucciones para compilar.
2. Migraciones y esquema; catálogos de clases vehiculares, casetas/carriles/tarifas, perfiles de país y datos iniciales necesarios.
3. Instrucciones de actualización de combustible, peajes y datos municipales; procedencia y permisos de uso de cada conjunto.
4. Variables de entorno documentadas y credenciales nuevas del comprador; ninguna dependencia de claves o cuentas del vendedor.
5. Plantillas y generación Word/PDF, almacenamiento, correo, WhatsApp y Telegram con configuración propia.
6. Procesos programados, workers, colas y conversiones, si existen; respaldo y restauración completos.
7. Pruebas del motor con resultados esperados, incluida renta, vacío, rescate, impuestos y snapshots.
8. Despliegue de prueba sin llamadas a dominios de Fletcot. Explicar y reemplazar cualquier activación remota necesaria.
9. Condiciones de modificación, número de instalaciones/empresas, distribución interna y mantenimiento por el equipo comprador, por escrito.

La página comercial no permite confirmar estos detalles contractuales ni la calidad de la entrega. No se contactó a ventas ni se realizó compra.

## Alcance de reconstrucción propuesto

**Primera entrega operativa:** empresa/usuarios, perfiles de costo, clientes, gastos y categorías; ruta con carga/vacío; peajes verificados; desglose; cotización histórica y documento PDF. Una empresa puede operar con esto mientras se desarrolla el resto.

**Paridad posterior:** renta, tarifarios, DOCX configurable, importación Excel, integraciones y mensajería, asistente, incidencias y denuncias, multiempresa ampliada, soporte y herramientas del operador.

Esto ordena el trabajo; no declara implementada la primera entrega ni elimina del objetivo final las funciones investigadas.

## Estructura candidata del proyecto propio

```text
apps/web/             interfaz y composición de pantallas
apps/api/             autenticación, autorización y persistencia
packages/costing/     cálculo puro, versionado y pruebas de referencia
packages/contracts/   solicitudes y respuestas validadas
packages/countries/   perfiles nacionales
adapters/             rutas, peajes, documentos y canales externos
docs/                 reglas, arquitectura y operación
```

Es una propuesta independiente de la estructura original. Primero decidir si se parte de la licencia; no crear un monorepo ejecutable ficticio con conectores vacíos.

## Orden de construcción y aceptación

| Fase | Resultado verificable |
|---|---|
| Descubrimiento autenticado | Capturas y casos con entradas/salidas por módulo, solo datos propios/sintéticos |
| Motor independiente | Pruebas deterministas, versión explícita y equivalencia frente a casos de referencia |
| Datos y aislamiento | Usuarios/empresa, catálogos, respaldos; pruebas de acceso cruzado bloqueado |
| Rutas y peajes | Casos por clase, dirección, ida/vuelta y tarifas con fecha de vigencia |
| Venta | Folio concurrente único; documento; envío con estado e idempotencia |
| Historial | Abrir precio original tras cambiar todos los costos; recalcular como acción separada |
| Operación | Restaurar respaldo en equipo limpio y operar sin dominios del proveedor |
| Paridad ampliada | Renta, tarifarios, canales y asistentes validados con sus propios criterios |

## Dependencias que siguen existiendo

Independencia de Fletcot no equivale a ausencia de proveedores. Mapas, geocodificación, ruteo apto para camiones, tráfico, correo y mensajería necesitan infraestructura o contratos propios. No se reutilizan claves públicas recuperadas del bundle para operar el reemplazo.

Los catálogos de peaje y su actualización son una parte sustancial del producto. Un mapa visualmente similar puede producir precios incorrectos si clasifica mal casetas, sentido o eje. Esa calidad debe probarse antes de usar una cotización con clientes reales.
