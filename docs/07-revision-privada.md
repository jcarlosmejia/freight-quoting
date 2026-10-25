# Revisión autenticada: pendiente

El usuario autorizó crear una cuenta de prueba y después autorizó expresamente registro con Google, compartiendo nombre y correo con Fletcot. La autorización para investigar no equivale a aceptar automáticamente acuerdos legales o a obtener permisos de superadministrador.

No introducir contraseñas, cookies, OTP, claves o datos reales de clientes en este repositorio.

## Estado de acceso

- Formulario público de registro confirmado: empresa, nombre, correo, contraseña y repetición, alternativa Google, prueba anunciada de 10 días.
- Primer intento Google detenido por revisión automática por faltar autorización específica; el usuario la concedió después.
- Clic Google autorizado en navegador integrado sin diálogo visible; Chrome sí abrió el selector con cuatro identidades.
- La selección de una identidad se detuvo por revisión automática: falta que el usuario elija cuál de las cuatro autoriza. No se seleccionó ni transmitió una identidad específica.
- Cuenta y sesión autenticada todavía no verificadas. Este estado debe actualizarse al observar éxito real.

## Checklist de recorrido

| Módulo | Observación necesaria | Evidencia a conservar |
|---|---|---|
| Registro | Identidad elegida, empresa, términos, prueba y correo | Captura de éxito sin secretos |
| Bienvenida | Datos iniciales y opciones de ejemplo | Decisiones y valores sintéticos |
| Vehículo | Campos, unidades, defaults, validaciones y cambios | Perfil de prueba y PDF |
| Gastos/equipo | Periodos, anualización y categoría | Entradas y salida de recuperación |
| Cliente | Alta, validación fiscal, notas privadas y archivo | Cliente ficticio |
| Flete | Ruta, paradas, vacío, esperas, retorno y casetas | JSON sanitizado de entradas/salidas |
| Costeo | Cada rubro, utilidad, operador e impuestos | Casos de referencia comparables |
| Historial | Guardado, estados, edición y recálculo | Folio y snapshot sanitizados |
| Renta | Periodos, km, responsables y excedentes | Comparación con uso cero y con ruta |
| Tarifario | Matriz, guardar, recalcular y propagación | Filas antes/después |
| Documentos | Plantilla, variables, Word y PDF | Documentos de prueba |
| Roles | Capacidades visibles de la cuenta propia | Matriz de permisos observados |
| Integraciones | Configuración y estado sin conectar cuentas adicionales | Campos; no enviar mensajes sin autorización |
| Operación | Exportaciones y recuperación de datos propios | Formatos y límites |

Las funciones de administración global no forman parte del alcance de una cuenta normal. No probar resets, borrados permanentes, compras, envíos o cambios de permisos durante una exploración de lectura.
