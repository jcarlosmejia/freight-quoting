<template>
  <article class="mx-auto max-w-3xl space-y-4 p-6 text-sm leading-relaxed">
    <h2 class="text-lg font-semibold text-text-highlighted">Cómo calcula esta instalación</h2>
    <p>Flujo: perfil de costos → gastos fijos y categorías → ruta → cálculo → cotización guardada → documento. Cada partida guarda una copia completa de parámetros, entradas y resultado; cambiar costos después no altera cotizaciones existentes. “Recalcular” es una acción explícita que conserva la versión anterior.</p>
    <h3 class="font-semibold text-text-highlighted">Reglas principales</h3>
    <ul class="list-disc space-y-1 pl-5 text-text-muted">
      <li>La bandera de carga de una parada aplica al tramo que sale de ella. El tiempo de manejo se reparte entre tramos cargados y vacíos en proporción a sus km.</li>
      <li>Horas con cliente = manejo cargado + esperas + descansos + recargas. Gastos generales, específicos, equipamiento y capital se recuperan por hora; llantas, mantenimiento y depreciación por km.</li>
      <li>Gastos generales: anualizados (Mensual ×12, Bimestral ×6, Trimestral ×4, Semestral ×2) ÷ horas facturables de la flota. Se redondean a centavos por hora, igual que en los casos observados.</li>
      <li>Capital: (valor + rescate)/2 por cada activo × tasa anual ÷ horas anuales de la categoría.</li>
      <li>Descansos: uno por cada bloque completo de horas de manejo igual a la frecuencia del perfil.</li>
      <li>Vacío: se cobra a costo por defecto; cada rubro puede dejar de cobrarse o llevar utilidad. Su costo físico no cambia.</li>
      <li>Utilidad sobre rubros cargados + vacíos marcados + pago al operador (si se indica) + otros gastos marcados. Peajes sin utilidad. Financiamiento sobre el gasto total; aumento por carga sobre gasto + utilidad + financiamiento; IVA al final.</li>
      <li>Comisión sobre utilidad: informativa, se paga de la utilidad y no cambia el precio. Comisión sobre neto: entra al costo.</li>
      <li>Renta: mes = 1/12 del año operativo. Depreciación por lo que ocurra primero entre calendario y km. Utilidad sólo sobre disponibilidad + uso.</li>
    </ul>
    <h3 class="font-semibold text-text-highlighted">Datos externos</h3>
    <p class="text-text-muted">No se incluyen catálogos oficiales de casetas, combustible, rutas ni denuncias. Distancias, tiempos y casetas se capturan con su fuente, o se calculan con un proveedor de rutas configurado con credenciales propias.</p>
    <p class="text-text-muted">Documentación técnica completa: <code>docs/09-recuperacion-codigo.md</code>, <code>docs/10-paridad.md</code> y <code>app/README.md</code> en el repositorio.</p>
  </article>
</template>
