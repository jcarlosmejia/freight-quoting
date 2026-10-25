// Empresa, numeración, preferencias, usuarios y roles.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from '../../shared/permissions.ts';
import { hashPassword, HttpError, requirePerm, SESSION_COOKIE, type SessionUser } from '../auth.ts';
import { createHash } from 'node:crypto';
import { all, insert, one, run, tx, update } from '../db.ts';
import type { AppContext } from '../app.ts';
import { DEFAULT_PREFERENCES, getPreferences } from '../services/quotes.ts';
import { n, oneOf, s } from '../services/validate.ts';
import { body, idParam } from './crud.ts';

export function registerOrg(app: FastifyInstance, { db, dataDir }: AppContext) {
  app.get('/api/company', async (req) => {
    const u = requirePerm(req, 'ver:empresa');
    const c = one(db, 'SELECT * FROM companies WHERE id = ?', u.companyId)!;
    return { ...c, preferences: getPreferences(db, u.companyId) };
  });

  app.patch('/api/company', async (req) => {
    const u = requirePerm(req, 'modificar:empresa');
    const b = body(req.body);
    const name = 'name' in b ? s(b.name, 'nombre comercial', { required: true, max: 200 }) : undefined;
    const rfc = 'rfc' in b ? s(b.rfc, 'RFC', { max: 13 }) : undefined;
    if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfc)) throw new HttpError(400, 'RFC de 12 caracteres (moral) o 13 (física).');
    update(db, 'companies', u.companyId, {
      name: name ?? undefined,
      legal_name: 'legal_name' in b ? s(b.legal_name, 'razón social', { max: 300 }) : undefined,
      rfc: 'rfc' in b ? (rfc?.toUpperCase() ?? null) : undefined,
      website: 'website' in b ? s(b.website, 'sitio web', { max: 300 }) : undefined,
      email: 'email' in b ? s(b.email, 'correo', { max: 200 }) : undefined,
      phone: 'phone' in b ? s(b.phone, 'teléfono', { max: 40 }) : undefined,
      address: 'address' in b ? s(b.address, 'dirección', { max: 500 }) : undefined,
    });
    return one(db, 'SELECT * FROM companies WHERE id = ?', u.companyId);
  });

  app.post('/api/company/logo', async (req) => {
    const u = requirePerm(req, 'modificar:empresa');
    const file = await req.file();
    if (!file) throw new HttpError(400, 'Adjunta una imagen.');
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg' }[file.mimetype];
    if (!ext) throw new HttpError(400, 'El logo debe ser PNG o JPG.');
    const buf = await file.toBuffer();
    const rel = join('uploads', String(u.companyId), `logo-${randomUUID()}.${ext}`);
    mkdirSync(join(dataDir, 'uploads', String(u.companyId)), { recursive: true });
    writeFileSync(join(dataDir, rel), buf);
    run(db, 'UPDATE companies SET logo_path = ? WHERE id = ?', rel, u.companyId);
    return { ok: true };
  });

  app.get('/api/company/logo', async (req, reply) => {
    const u = requirePerm(req, 'ver:empresa');
    const c = one(db, 'SELECT logo_path FROM companies WHERE id = ?', u.companyId);
    if (!c?.logo_path) throw new HttpError(404, 'Sin logo.');
    return reply.type(c.logo_path.endsWith('png') ? 'image/png' : 'image/jpeg').send(readFileSync(join(dataDir, c.logo_path)));
  });

  app.patch('/api/company/numbering', async (req) => {
    const u = requirePerm(req, 'modificar:numeracion');
    const b = body(req.body);
    const prefix = s(b.folio_prefix, 'prefijo', { required: true, max: 10 })!;
    if (!/^[A-Z0-9-]+$/i.test(prefix)) throw new HttpError(400, 'El prefijo sólo admite letras, números y guiones.');
    update(db, 'companies', u.companyId, {
      folio_prefix: prefix.toUpperCase(),
      folio_digits: n(b.folio_digits, 'dígitos', { min: 1, max: 8, def: 4 }),
      folio_include_year: b.folio_include_year === undefined ? undefined : !!b.folio_include_year,
    });
    return one(db, 'SELECT folio_prefix, folio_digits, folio_include_year FROM companies WHERE id = ?', u.companyId);
  });

  app.patch('/api/company/preferences', async (req) => {
    const u = requirePerm(req, 'modificar:preferencias');
    const b = body(req.body);
    const cur = getPreferences(db, u.companyId);
    const cargo = Array.isArray(b.cargoTypes)
      ? b.cargoTypes.map((c: any, i: number) => ({ name: s(c?.name, `tipo de carga ${i + 1}`, { required: true, max: 80 })!, surchargePct: n(c?.surchargePct, 'aumento', { min: 0, max: 1000, def: 0 }) }))
      : cur.cargoTypes;
    const bool = (k: keyof typeof DEFAULT_PREFERENCES) => (b[k] === undefined ? (cur[k] as boolean) : !!b[k]);
    const prefs = {
      profitPct: n(b.profitPct, 'utilidad', { min: -100, max: 1000, def: cur.profitPct }),
      financingPct: n(b.financingPct, 'financiamiento', { min: 0, max: 100, def: cur.financingPct }),
      taxPct: n(b.taxPct, 'IVA', { min: 0, max: 100, def: cur.taxPct }),
      validityDays: n(b.validityDays, 'vigencia', { min: 1, max: 365, def: cur.validityDays }),
      cargoTypes: cargo,
      driverPayMethod: oneOf(b.driverPayMethod, 'pago al operador', ['none', 'per_km', 'per_hour', 'percentage', 'percent_net'] as const, cur.driverPayMethod),
      driverPayApplyMargin: bool('driverPayApplyMargin'),
      profitEditable: bool('profitEditable'),
      taxEditable: bool('taxEditable'),
      financingEditable: bool('financingEditable'),
      driverPayEditable: bool('driverPayEditable'),
      cargoTypeEditable: bool('cargoTypeEditable'),
      brandColor: b.brandColor === undefined ? cur.brandColor : /^#[0-9a-f]{6}$/i.test(String(b.brandColor)) ? String(b.brandColor) : (() => { throw new HttpError(400, 'Color inválido (usa #RRGGBB).'); })(),
    };
    run(db, 'UPDATE companies SET preferences = ? WHERE id = ?', JSON.stringify(prefs), u.companyId);
    return prefs;
  });

  // ---- Usuarios ----
  app.get('/api/users', async (req) => {
    const u = requirePerm(req, 'lista:usuarios');
    return all(db, 'SELECT u.id, u.email, u.name, u.active, u.role_id, r.name AS role_name, u.created_at FROM users u JOIN roles r ON r.id = u.role_id WHERE u.company_id = ? ORDER BY u.id', u.companyId);
  });

  const rolePerms = (roleId: number) => all(db, 'SELECT permission FROM role_permissions WHERE role_id = ?', roleId).map((p) => String(p.permission));
  const isAdminRole = (roleId: number) => !!one(db, "SELECT id FROM roles WHERE id = ? AND is_system = 1 AND name = 'admin'", roleId);

  /** Techo de privilegios: nadie que no sea admin puede otorgar permisos que no tiene. */
  const withinCeiling = (u: SessionUser, perms: string[]) => {
    if (u.isAdmin) return;
    const extra = perms.filter((p) => !u.permissions.has(p));
    if (extra.length) throw new HttpError(403, `No puedes otorgar permisos que no tienes: ${extra.join(', ')}.`);
  };

  const roleOfCompany = (u: SessionUser, roleId: unknown) => {
    const r = one(db, 'SELECT id FROM roles WHERE id = ? AND (company_id = ? OR company_id IS NULL)', Number(roleId), u.companyId);
    if (!r) throw new HttpError(400, 'Rol inválido.');
    if (!u.isAdmin && isAdminRole(r.id)) throw new HttpError(403, 'Sólo un administrador puede asignar el rol admin.');
    withinCeiling(u, rolePerms(r.id));
    return r.id as number;
  };

  app.post('/api/users', async (req, reply) => {
    const u = requirePerm(req, 'agregar:usuario');
    const b = body(req.body);
    const email = s(b.email, 'correo', { required: true, max: 200 })!.toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Correo inválido.');
    const password = String(b.password ?? '');
    if (password.length < 10) throw new HttpError(400, 'La contraseña debe tener al menos 10 caracteres.');
    const id = insert(db, 'users', {
      company_id: u.companyId,
      email,
      name: s(b.name, 'nombre', { required: true, max: 200 })!,
      password_hash: hashPassword(password),
      role_id: roleOfCompany(u, b.role_id),
    });
    reply.status(201);
    return { id };
  });

  app.patch('/api/users/:id', async (req) => {
    const u = requirePerm(req, 'modificar:usuario');
    const id = idParam((req.params as any).id);
    const target = one(db, 'SELECT id, role_id FROM users WHERE id = ? AND company_id = ?', id, u.companyId);
    if (!target) throw new HttpError(404, 'Usuario no encontrado.');
    const b = body(req.body);
    // Un no-admin no modifica administradores ni usuarios con más permisos que él.
    if (!u.isAdmin && id !== u.id) {
      if (isAdminRole(target.role_id)) throw new HttpError(403, 'Sólo un administrador puede modificar a otro administrador.');
      withinCeiling(u, rolePerms(target.role_id));
    }
    if ('role_id' in b) {
      requirePerm(req, 'rol:usuario');
      if (id === u.id && !u.isAdmin) throw new HttpError(403, 'No puedes cambiar tu propio rol.');
    }
    if ('active' in b && !b.active) {
      requirePerm(req, 'baja:usuario');
      if (id === u.id) throw new HttpError(400, 'No puedes darte de baja a ti mismo.');
    }
    if ('password' in b && String(b.password).length < 10) throw new HttpError(400, 'La contraseña debe tener al menos 10 caracteres.');
    update(db, 'users', id, {
      name: 'name' in b ? s(b.name, 'nombre', { required: true, max: 200 })! : undefined,
      role_id: 'role_id' in b ? roleOfCompany(u, b.role_id) : undefined,
      active: 'active' in b ? !!b.active : undefined,
      password_hash: 'password' in b ? hashPassword(String(b.password)) : undefined,
    });
    // Baja, cambio de rol o contraseña invalidan las sesiones del usuario (se conserva la sesión actual si es él mismo).
    if (('active' in b && !b.active) || 'role_id' in b || 'password' in b) {
      const current = req.cookies[SESSION_COOKIE];
      const keep = id === u.id && current ? createHash('sha256').update(current).digest('hex') : '';
      run(db, 'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', id, keep);
    }
    return { ok: true };
  });

  // ---- Roles ----
  app.get('/api/permissions', async (req) => {
    requirePerm(req, 'ver:rol');
    return PERMISSION_GROUPS;
  });

  app.get('/api/roles', async (req) => {
    const u = requirePerm(req, 'ver:rol');
    return all(db, 'SELECT * FROM roles WHERE company_id = ? OR company_id IS NULL ORDER BY is_system DESC, name', u.companyId).map((r) => ({
      ...r,
      permissions: all(db, 'SELECT permission FROM role_permissions WHERE role_id = ?', r.id).map((p) => p.permission),
    }));
  });

  const writePerms = (u: SessionUser, roleId: number, perms: unknown) => {
    if (!Array.isArray(perms)) throw new HttpError(400, 'Lista de permisos inválida.');
    const bad = perms.filter((p) => !ALL_PERMISSIONS.includes(String(p)));
    if (bad.length) throw new HttpError(400, `Permisos desconocidos: ${bad.join(', ')}`);
    if (!u.isAdmin && roleId === u.roleId) throw new HttpError(403, 'No puedes editar los permisos de tu propio rol.');
    withinCeiling(u, perms.map(String));
    run(db, 'DELETE FROM role_permissions WHERE role_id = ?', roleId);
    for (const p of new Set(perms.map(String))) run(db, 'INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)', roleId, p);
  };

  app.post('/api/roles', async (req, reply) => {
    const u = requirePerm(req, 'agregar:rol', 'asignar:permiso');
    const b = body(req.body);
    const id = tx(db, () => {
      const id = insert(db, 'roles', { company_id: u.companyId, name: s(b.name, 'nombre', { required: true, max: 80 })!, description: s(b.description, 'descripción', { max: 300 }) });
      writePerms(u, id, b.permissions ?? []);
      return id;
    });
    reply.status(201);
    return { id };
  });

  app.patch('/api/roles/:id', async (req) => {
    const u = requirePerm(req, 'modificar:rol');
    const id = idParam((req.params as any).id);
    const r = one(db, 'SELECT * FROM roles WHERE id = ? AND company_id = ?', id, u.companyId);
    if (!r) throw new HttpError(404, 'Rol no encontrado.');
    if (r.is_system) throw new HttpError(403, 'Los roles del sistema no se pueden editar.');
    // Editar un rol con más permisos que los propios equivale a otorgarlos.
    withinCeiling(u, rolePerms(id));
    const b = body(req.body);
    tx(db, () => {
      update(db, 'roles', id, { name: 'name' in b ? s(b.name, 'nombre', { required: true, max: 80 })! : undefined, description: 'description' in b ? s(b.description, 'descripción', { max: 300 }) : undefined });
      if ('permissions' in b) {
        requirePerm(req, 'asignar:permiso');
        writePerms(u, id, b.permissions);
      }
    });
    return { ok: true };
  });

  app.delete('/api/roles/:id', async (req) => {
    const u = requirePerm(req, 'eliminar:rol');
    const id = idParam((req.params as any).id);
    const r = one(db, 'SELECT * FROM roles WHERE id = ? AND company_id = ?', id, u.companyId);
    if (!r) throw new HttpError(404, 'Rol no encontrado.');
    if (r.is_system) throw new HttpError(403, 'Los roles del sistema no se pueden eliminar.');
    if (one(db, 'SELECT id FROM users WHERE role_id = ?', id)) throw new HttpError(409, 'Hay usuarios con este rol.');
    run(db, 'DELETE FROM roles WHERE id = ?', id);
    return { ok: true };
  });
}
