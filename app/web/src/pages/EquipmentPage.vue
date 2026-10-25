<script setup lang="ts">
import CrudTable from '../components/CrudTable.vue';
</script>

<template>
  <div class="p-6">
    <CrudTable
      endpoint="/equipment"
      title="Equipamiento de a bordo"
      :perms="{ create: 'agregar:equipo', update: 'modificar:equipo', remove: 'eliminar:equipo' }"
      :columns="[
        { key: 'name', label: 'Nombre', required: true },
        { key: 'description', label: 'Descripción', type: 'textarea' },
        { key: 'unit_price', label: 'Precio unitario', type: 'money', hint: 'Sin IVA. La cantidad y el tiempo de reposición se asignan en cada vehículo.' },
      ]"
      :defaults="{ unit_price: 0 }"
    />
  </div>
</template>
