import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { all, one, run, type DB } from './db.ts';

export const SESSION_COOKIE = 'fl_session';
const SESSION_DAYS = 7;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

export function createSession(db: DB, userId: number): string {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  run(db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', tokenHash(token), userId, expires);
  return token;
}

export const destroySession = (db: DB, token: string) => run(db, 'DELETE FROM sessions WHERE token_hash = ?', tokenHash(token));

export interface SessionUser {
  id: number;
  companyId: number;
  email: string;
  name: string;
  roleId: number;
  roleName: string;
  isAdmin: boolean;
  permissions: Set<string>;
}

export function loadSession(db: DB, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = one(
    db,
    `SELECT u.id, u.company_id, u.email, u.name, u.role_id, r.name AS role_name, r.is_system
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    tokenHash(token),
    new Date().toISOString(),
  );
  if (!row) return null;
  const perms = all(db, 'SELECT permission FROM role_permissions WHERE role_id = ?', row.role_id).map((r) => String(r.permission));
  return {
    id: row.id,
    companyId: row.company_id,
    email: row.email,
    name: row.name,
    roleId: row.role_id,
    roleName: row.role_name,
    isAdmin: row.role_name === 'admin' && row.is_system === 1,
    permissions: new Set(perms),
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function currentUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw new HttpError(401, 'Inicia sesión para continuar.');
  return req.user;
}

/** Autorización en servidor: el administrador de sistema tiene todo; los demás según su rol. */
export function requirePerm(req: FastifyRequest, ...codes: string[]): SessionUser {
  const u = currentUser(req);
  if (u.isAdmin) return u;
  const missing = codes.filter((c) => !u.permissions.has(c));
  if (missing.length) throw new HttpError(403, `No tienes permiso: ${missing.join(', ')}.`);
  return u;
}

export const can = (u: SessionUser, code: string) => u.isAdmin || u.permissions.has(code);

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean) {
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure, path: '/', maxAge: SESSION_DAYS * 86400 });
}
