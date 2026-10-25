<script setup lang="ts">
import {
  BookOpen, Building2, Car, ChevronDown, ClipboardList, DollarSign, FileText, Globe, Home, LogOut, MapPinned, Menu, PanelLeft, Route, Send, Settings, Shield, User, Wrench, X,
} from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../lib/api.ts';
import { can, session } from '../lib/session.ts';

const route = useRoute();
const router = useRouter();
const collapsed = ref(false);
// Menú lateral desplegable en pantallas pequeñas.
const mobileOpen = ref(false);
watch(() => route.fullPath, () => (mobileOpen.value = false));
const quotesOpen = ref(true);

const nav = computed(() =>
  [
    { to: '/admin/home', label: 'Home', icon: Home },
    { to: '/admin/km-quote', label: 'Cotizar por km', icon: Route, perm: 'agregar:cotizacion' },
    { to: '/admin/quotes', label: 'Cotizar por costos', icon: Globe, perm: 'agregar:cotizacion' },
    { group: 'Cotizaciones', icon: ClipboardList, children: [
      { to: '/admin/quotations/freight', label: 'Fletes y rentas', perm: 'ver:cotizacion' },
      { to: '/admin/quotations/clients', label: 'Clientes', perm: 'ver:cliente' },
    ] },
    { to: '/admin/vehicles', label: 'Vehículos', icon: Car, perm: 'ver:vehiculo' },
    { to: '/admin/board-equipment', label: 'Equipamientos', icon: Wrench, perm: 'ver:equipo' },
    { to: '/admin/bills/fixed-expenses', label: 'Gastos fijos generales', icon: DollarSign, perm: 'ver:gasto_fijo' },
    { to: '/admin/price-list', label: 'Lista de precios', icon: ClipboardList, perm: 'ver:lista_precios' },
    { to: '/admin/tolls', label: 'Casetas y rutas', icon: MapPinned, perm: 'ver:ruta' },
    { to: '/admin/sent', label: 'Envíos', icon: Send, perm: 'ver:envio' },
    { to: '/admin/templates', label: 'Plantillas', icon: FileText, perm: 'ver:plantilla' },
    { to: '/admin/users', label: 'Usuarios', icon: User, perm: 'lista:usuarios' },
    { to: '/admin/roles', label: 'Roles y permisos', icon: Shield, perm: 'ver:rol' },
  ]
    .map((i: any) => (i.children ? { ...i, children: i.children.filter((c: any) => !c.perm || can(c.perm)) } : i))
    .filter((i: any) => (i.children ? i.children.length : !i.perm || can(i.perm))),
);

const active = (to: string) => route.path === to || route.path.startsWith(`${to}/`);

async function logout() {
  await api.post('/auth/logout');
  session.me = null;
  router.push('/auth/login');
}
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <div v-if="mobileOpen" class="fixed inset-0 z-40 bg-black/60 md:hidden" @click="mobileOpen = false" />
    <aside :class="[collapsed ? 'md:w-[72px]' : 'md:w-64', mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0']" class="fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-line bg-default transition-all md:static">
      <div class="flex h-16 items-center gap-2 border-b border-line px-4">
        <div class="flex size-8 items-center justify-center rounded-md bg-primary-strong/20 text-primary"><Building2 class="size-4" /></div>
        <span v-if="!collapsed" class="truncate font-semibold text-text-highlighted">{{ session.me?.company.name }}</span>
      </div>
      <nav class="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Principal">
        <template v-for="item in nav" :key="item.label ?? item.group">
          <div v-if="item.group">
            <button class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-text-muted hover:bg-muted hover:text-text" @click="quotesOpen = !quotesOpen">
              <component :is="item.icon" class="size-5 shrink-0" />
              <span v-if="!collapsed" class="flex-1">{{ item.group }}</span>
              <ChevronDown v-if="!collapsed" class="size-4 transition" :class="quotesOpen ? 'rotate-180' : ''" />
            </button>
            <div v-if="quotesOpen && !collapsed" class="ml-6 border-l border-line pl-2">
              <RouterLink v-for="c in item.children" :key="c.to" :to="c.to" class="block rounded-md px-3 py-1.5 text-sm hover:bg-muted" :class="active(c.to) ? 'text-primary' : 'text-text-muted'">{{ c.label }}</RouterLink>
            </div>
          </div>
          <RouterLink v-else :to="item.to" :title="item.label" class="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted" :class="active(item.to) ? 'bg-muted text-primary' : 'text-text-muted hover:text-text'">
            <component :is="item.icon" class="size-5 shrink-0" />
            <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
          </RouterLink>
        </template>
      </nav>
      <div class="space-y-0.5 border-t border-line p-2">
        <RouterLink to="/admin/settings" class="flex items-center gap-3 rounded-md px-3 py-2 text-text-muted hover:bg-muted hover:text-text" :class="active('/admin/settings') ? 'text-primary' : ''">
          <Settings class="size-5" /><span v-if="!collapsed">Configuración</span>
        </RouterLink>
        <RouterLink to="/admin/docs" class="flex items-center gap-3 rounded-md px-3 py-2 text-text-muted hover:bg-muted hover:text-text"><BookOpen class="size-5" /><span v-if="!collapsed">Documentación</span></RouterLink>
      </div>
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 md:h-16 md:px-4">
        <button class="btn-ghost px-2 md:hidden" :aria-label="mobileOpen ? 'Cerrar menú' : 'Abrir menú'" :aria-expanded="mobileOpen" @click="mobileOpen = !mobileOpen"><component :is="mobileOpen ? X : Menu" class="size-5" /></button>
        <button class="btn-ghost hidden px-2 md:inline-flex" aria-label="Contraer menú" @click="collapsed = !collapsed"><PanelLeft class="size-5" /></button>
        <h1 class="truncate text-base font-semibold text-text-highlighted">{{ route.meta.title }}</h1>
        <span class="badge ml-2 hidden bg-info/10 text-info sm:inline-flex">Instalación local</span>
        <div class="ml-auto flex items-center gap-3">
          <span class="hidden text-sm text-text-muted sm:inline">{{ session.me?.user.name }} · {{ session.me?.user.role }}</span>
          <button class="btn-ghost px-2" title="Cerrar sesión" aria-label="Cerrar sesión" @click="logout"><LogOut class="size-4" /></button>
        </div>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto">
        <div v-if="route.query.denied" class="m-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Tu rol no tiene acceso a “{{ route.query.denied }}”.</div>
        <RouterView :key="route.fullPath" />
      </main>
    </div>
  </div>
</template>
