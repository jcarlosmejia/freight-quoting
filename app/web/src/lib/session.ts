import { reactive } from 'vue';
import { api } from './api.ts';

export interface Me {
  user: { id: number; email: string; name: string; role: string; isAdmin: boolean; permissions: string[] };
  company: { id: number; name: string; country: string; hasLogo: boolean };
}

export const session = reactive<{ me: Me | null; loaded: boolean }>({ me: null, loaded: false });

export async function loadSession() {
  try {
    session.me = await api.get<Me>('/auth/me');
  } catch {
    session.me = null;
  }
  session.loaded = true;
  return session.me;
}

/** Sólo controla la visibilidad en la interfaz; el servidor vuelve a validar cada permiso. */
export const can = (code: string) => !!session.me && (session.me.user.isAdmin || session.me.user.permissions.includes(code));

// Notificaciones breves.
export const toasts = reactive<{ id: number; text: string; tone: 'ok' | 'error' }[]>([]);
let seq = 0;
export function toast(text: string, tone: 'ok' | 'error' = 'ok') {
  const id = ++seq;
  toasts.push({ id, text, tone });
  setTimeout(() => toasts.splice(toasts.findIndex((t) => t.id === id), 1), tone === 'error' ? 6000 : 3000);
}
export const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error');
