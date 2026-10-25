import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import { can, loadSession, session } from './lib/session.ts';
import './styles.css';

const page = (name: string) => () => import(`./pages/${name}.vue`);

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/admin/home' },
    { path: '/auth/login', component: page('LoginPage'), meta: { public: true, title: 'Iniciar sesión' } },
    {
      path: '/admin',
      component: () => import('./components/AppLayout.vue'),
      children: [
        { path: 'home', component: page('HomePage'), meta: { title: 'Home' } },
        { path: 'km-quote', component: page('KmQuotePage'), meta: { title: 'Cotizar por km', perm: 'agregar:cotizacion' } },
        { path: 'quotes', component: page('QuotePage'), meta: { title: 'Cotizar servicio', perm: 'agregar:cotizacion' } },
        { path: 'quotations/freight', component: page('QuotationsPage'), meta: { title: 'Cotizaciones', perm: 'ver:cotizacion' } },
        { path: 'quotations/detail/:id', component: page('QuoteDetailPage'), meta: { title: 'Detalle de cotización', perm: 'ver:cotizacion' } },
        { path: 'quotations/clients', component: page('ClientsPage'), meta: { title: 'Clientes', perm: 'ver:cliente' } },
        { path: 'vehicles', component: page('VehiclesPage'), meta: { title: 'Vehículos', perm: 'ver:vehiculo' } },
        { path: 'vehicles/new', component: page('VehicleEditPage'), meta: { title: 'Registrar perfil', perm: 'agregar:vehiculo' } },
        { path: 'vehicles/:id/edit', component: page('VehicleEditPage'), meta: { title: 'Editar perfil', perm: 'ver:vehiculo' } },
        { path: 'board-equipment', component: page('EquipmentPage'), meta: { title: 'Equipamientos', perm: 'ver:equipo' } },
        { path: 'bills/fixed-expenses', component: page('FixedExpensesPage'), meta: { title: 'Gastos fijos generales', perm: 'ver:gasto_fijo' } },
        { path: 'price-list', component: page('PriceListPage'), meta: { title: 'Lista de precios', perm: 'ver:lista_precios' } },
        { path: 'tolls', component: page('TollsPage'), meta: { title: 'Casetas, ubicaciones y rutas', perm: 'ver:ruta' } },
        { path: 'sent', component: page('SentDocumentsPage'), meta: { title: 'Envíos y documentos', perm: 'ver:envio' } },
        { path: 'templates', component: page('TemplatesPage'), meta: { title: 'Plantillas', perm: 'ver:plantilla' } },
        { path: 'users', component: page('UsersPage'), meta: { title: 'Usuarios', perm: 'lista:usuarios' } },
        { path: 'roles', component: page('RolesPage'), meta: { title: 'Roles y permisos', perm: 'ver:rol' } },
        { path: 'settings', component: page('SettingsPage'), meta: { title: 'Configuración' } },
        { path: 'docs', component: page('DocsPage'), meta: { title: 'Documentación' } },
      ],
    },
    { path: '/:pathMatch(.*)*', component: page('NotFoundPage'), meta: { public: true, title: 'No encontrado' } },
  ],
});

router.beforeEach(async (to) => {
  if (!session.loaded) await loadSession();
  if (to.meta.public) return true;
  if (!session.me) return { path: '/auth/login', query: { next: to.fullPath } };
  if (to.meta.perm && !can(String(to.meta.perm))) return { path: '/admin/home', query: { denied: String(to.meta.title) } };
  return true;
});
router.afterEach((to) => {
  document.title = `Freight Quoting | ${String(to.meta.title ?? '')}`;
});

window.addEventListener('session-expired', () => {
  session.me = null;
  if (!router.currentRoute.value.meta.public) router.push({ path: '/auth/login', query: { next: router.currentRoute.value.fullPath } });
});

createApp(App).use(router).mount('#app');
