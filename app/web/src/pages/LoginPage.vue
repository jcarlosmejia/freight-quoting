<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../lib/api.ts';
import { loadSession } from '../lib/session.ts';

const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
const router = useRouter();
const route = useRoute();

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await api.post('/auth/login', { email: email.value, password: password.value });
    await loadSession();
    const next = String(route.query.next ?? '');
    router.push(next.startsWith('/admin') ? next : '/admin/home');
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-6">
    <form class="card w-full max-w-sm space-y-4 p-6" @submit.prevent="submit">
      <div>
        <h1 class="text-xl font-semibold text-text-highlighted">Bienvenido</h1>
        <p class="text-sm text-text-muted">Ingresa tus credenciales para acceder a tu cuenta</p>
      </div>
      <label class="field"><span>Correo electrónico</span><input id="email" v-model="email" class="input" type="email" autocomplete="username" required /></label>
      <label class="field"><span>Contraseña</span><input id="password" v-model="password" class="input" type="password" autocomplete="current-password" required /></label>
      <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      <button class="btn-primary w-full" :disabled="busy">Iniciar sesión</button>
      <p class="text-xs text-text-dimmed">Instalación local: la autenticación y los datos se guardan en este equipo. Las cuentas las crea un administrador en Usuarios.</p>
    </form>
  </div>
</template>
