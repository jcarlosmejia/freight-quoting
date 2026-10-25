// Catálogo de permisos. Los códigos marcados `observed` aparecen en el bundle público de Fletcot;
// el resto completa los conteos por grupo vistos en la pantalla de roles y es reconstrucción propia.
export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { code: string; label: string; observed: boolean }[];
}

const p = (code: string, label: string, observed = true) => ({ code, label, observed });

export const PERMISSION_GROUPS: PermissionGroup[] = [
  { key: 'cotizacion', label: 'Cotizaciones', permissions: [p('ver:cotizacion', 'Ver'), p('agregar:cotizacion', 'Crear'), p('modificar:cotizacion', 'Modificar'), p('eliminar:cotizacion', 'Eliminar'), p('exportar:cotizacion', 'Exportar'), p('enviar:cotizacion', 'Enviar')] },
  { key: 'lista_precios', label: 'Listas de precios', permissions: [p('ver:lista_precios', 'Ver'), p('agregar:lista_precios', 'Crear'), p('modificar:lista_precios', 'Modificar'), p('eliminar:lista_precios', 'Eliminar'), p('exportar:lista_precios', 'Exportar'), p('enviar:lista_precios', 'Enviar')] },
  { key: 'cliente', label: 'Clientes', permissions: [p('ver:cliente', 'Ver'), p('agregar:cliente', 'Crear'), p('modificar:cliente', 'Modificar'), p('archivar:cliente', 'Archivar'), p('importar:cliente', 'Importar'), p('exportar:cliente', 'Exportar')] },
  { key: 'vehiculo', label: 'Vehículos', permissions: [p('ver:vehiculo', 'Ver'), p('agregar:vehiculo', 'Crear'), p('modificar:vehiculo', 'Modificar'), p('eliminar:vehiculo', 'Eliminar')] },
  { key: 'equipo', label: 'Equipos de a bordo', permissions: [p('ver:equipo', 'Ver'), p('agregar:equipo', 'Crear'), p('modificar:equipo', 'Modificar', false), p('eliminar:equipo', 'Eliminar'), p('importar:equipo', 'Importar'), p('exportar:equipo', 'Exportar')] },
  { key: 'gasto_fijo', label: 'Gastos fijos', permissions: [p('ver:gasto_fijo', 'Ver'), p('agregar:gasto_fijo', 'Crear'), p('modificar:gasto_fijo', 'Modificar', false), p('eliminar:gasto_fijo', 'Eliminar'), p('importar:gasto_fijo', 'Importar'), p('exportar:gasto_fijo', 'Exportar')] },
  { key: 'ruta', label: 'Rutas guardadas', permissions: [p('ver:ruta', 'Ver', false), p('agregar:ruta', 'Crear', false), p('eliminar:ruta', 'Eliminar', false)] },
  { key: 'plantilla', label: 'Plantillas de documentos', permissions: [p('ver:plantilla', 'Ver'), p('agregar:plantilla', 'Crear'), p('modificar:plantilla', 'Modificar'), p('eliminar:plantilla', 'Eliminar')] },
  { key: 'envio', label: 'Archivo de envíos', permissions: [p('ver:envio', 'Ver')] },
  { key: 'empresa', label: 'Empresa', permissions: [p('ver:empresa', 'Ver', false), p('modificar:empresa', 'Modificar')] },
  { key: 'numeracion', label: 'Numeración de folios', permissions: [p('modificar:numeracion', 'Modificar')] },
  { key: 'preferencias', label: 'Preferencias de cotización', permissions: [p('modificar:preferencias', 'Modificar')] },
  { key: 'respaldo', label: 'Respaldo de datos', permissions: [p('exportar:respaldo', 'Exportar'), p('importar:respaldo', 'Importar')] },
  { key: 'integracion', label: 'Integraciones de correo', permissions: [p('ver:integracion', 'Ver'), p('configurar:integracion', 'Configurar')] },
  { key: 'usuario', label: 'Usuarios', permissions: [p('lista:usuarios', 'Ver'), p('agregar:usuario', 'Crear'), p('modificar:usuario', 'Modificar', false), p('baja:usuario', 'Dar de baja'), p('rol:usuario', 'Asignar rol', false)] },
  { key: 'rol', label: 'Roles y permisos', permissions: [p('ver:rol', 'Ver', false), p('agregar:rol', 'Crear', false), p('modificar:rol', 'Modificar', false), p('eliminar:rol', 'Eliminar', false), p('asignar:permiso', 'Asignar permisos', false)] },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((x) => x.code));

/** Rol de sistema "usuario": todo excepto administración (observado: sin facturación, numeración,
 * preferencias, respaldo, usuarios ni roles; empresa sólo lectura). */
export const USER_ROLE_PERMISSIONS = ALL_PERMISSIONS.filter(
  (c) => !/^(modificar:empresa|modificar:numeracion|modificar:preferencias|exportar:respaldo|importar:respaldo)$/.test(c) && !/:(usuario|usuarios|rol|permiso)$/.test(c),
);
