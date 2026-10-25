<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import ModalDialog from '../components/ModalDialog.vue';
import { api } from '../lib/api.ts';
import { can, fail, session, toast } from '../lib/session.ts';

const rows = ref<any[]>([]);
const roles = ref<any[]>([]);
const open = ref(false);
const form = ref<any>({ name: '', email: '', password: '', role_id: null });
const load = async () => {
  rows.value = await api.get('/users');
  if (can('ver:rol')) roles.value = await api.get('/roles');
};
onMounted(() => load().catch(fail));

async function create() {
  try {
    await api.post('/users', form.value);
    open.value = false;
    toast('Usuario creado. Comparte la contraseña por un canal seguro.');
    load();
  } catch (e) {
    fail(e);
  }
}
async function patch(u: any, body: any) {
  try {
    await api.patch(`/users/${u.id}`, body);
    load();
  } catch (e) {
    fail(e);
  }
}
function resetPassword(u: any) {
  const p = prompt(`Nueva contraseña para ${u.email} (mínimo 10 caracteres)`);
  if (p) patch(u, { password: p });
}
</script>

<template>
  <div class="p-6">
    <div class="card">
      <div class="flex items-center border-b border-line p-3"><h2 class="font-semibold text-text-highlighted">Usuarios de la empresa</h2>
        <button v-if="can('agregar:usuario')" class="btn-primary ml-auto" @click="open = true"><Plus class="size-4" />Nuevo usuario</button></div>
      <table class="table">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in rows" :key="u.id">
            <td>{{ u.name }}</td><td>{{ u.email }}</td>
            <td>
              <select v-if="can('rol:usuario') && roles.length" class="input w-40 py-0.5" :value="u.role_id" @change="patch(u, { role_id: Number(($event.target as HTMLSelectElement).value) })"><option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option></select>
              <span v-else>{{ u.role_name }}</span>
            </td>
            <td><span class="badge" :class="u.active ? 'bg-success/15 text-success' : 'bg-muted text-text-muted'">{{ u.active ? 'Activo' : 'Baja' }}</span></td>
            <td class="whitespace-nowrap text-right">
              <button v-if="can('modificar:usuario')" class="btn-ghost text-xs" @click="resetPassword(u)">Cambiar contraseña</button>
              <button v-if="can('baja:usuario') && u.id !== session.me?.user.id" class="btn-ghost text-xs" @click="patch(u, { active: !u.active })">{{ u.active ? 'Dar de baja' : 'Reactivar' }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ModalDialog v-model:open="open" title="Nuevo usuario">
      <div class="grid gap-2">
        <label class="field"><span>Nombre</span><input v-model="form.name" class="input" /></label>
        <label class="field"><span>Correo</span><input v-model="form.email" class="input" type="email" autocomplete="off" /></label>
        <label class="field"><span>Contraseña inicial (mín. 10)</span><input v-model="form.password" class="input" type="password" autocomplete="new-password" /></label>
        <label class="field"><span>Rol</span><select v-model="form.role_id" class="input"><option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option></select></label>
      </div>
      <template #footer><button class="btn-primary" @click="create">Crear</button></template>
    </ModalDialog>
  </div>
</template>
