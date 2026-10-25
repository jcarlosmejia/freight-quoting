import type { FastifyInstance } from 'fastify';
import { createSession, currentUser, destroySession, HttpError, SESSION_COOKIE, setSessionCookie, verifyPassword } from '../auth.ts';
import { one } from '../db.ts';
import type { AppContext } from '../app.ts';
import { body } from './crud.ts';

// Limita intentos por correo para frenar fuerza bruta en una instalación expuesta en red.
const attempts = new Map<string, { n: number; until: number }>();

export function registerAuth(app: FastifyInstance, { db, secureCookies }: AppContext) {
  app.post('/api/auth/login', async (req, reply) => {
    const b = body(req.body);
    const email = String(b.email ?? '').trim().toLowerCase();
    const password = String(b.password ?? '');
    const a = attempts.get(email);
    if (a && a.n >= 5 && a.until > Date.now()) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
    const user = one(db, 'SELECT id, password_hash, active FROM users WHERE email = ?', email);
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      attempts.set(email, { n: (a?.n ?? 0) + 1, until: Date.now() + 5 * 60_000 });
      throw new HttpError(401, 'Correo o contraseña incorrectos.');
    }
    attempts.delete(email);
    setSessionCookie(reply, createSession(db, user.id), secureCookies);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) destroySession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    const u = currentUser(req);
    const c = one(db, 'SELECT id, name, country_code, logo_path FROM companies WHERE id = ?', u.companyId)!;
    return {
      user: { id: u.id, email: u.email, name: u.name, role: u.roleName, isAdmin: u.isAdmin, permissions: u.isAdmin ? ['*'] : [...u.permissions] },
      company: { id: c.id, name: c.name, country: c.country_code, hasLogo: !!c.logo_path },
    };
  });
}
