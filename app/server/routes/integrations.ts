// Integraciones: configuración con secretos cifrados, estado e historial. Respaldo de datos.
import type { FastifyInstance } from 'fastify';
import { HttpError, requirePerm } from '../auth.ts';
import { all, insert, one, run } from '../db.ts';
import type { AppContext } from '../app.ts';
import { routingProviders } from '../services/routing.ts';
import { encrypt } from '../services/secrets.ts';
import { n, s } from '../services/validate.ts';
import { body } from './crud.ts';

// Canales sin implementación local: se muestran como tales para no simular funciones.
const NOT_IMPLEMENTED = {
  gmail: 'Gmail (contraseña de aplicación). No implementado en esta versión local.',
  whatsapp: 'WhatsApp Business Platform no implementado. Disponible: mensaje listo, copiar y abrir WhatsApp (wa.me) para que tú lo envíes.',
  telegram: 'Asistente de Telegram. No implementado: requiere bot propio.',
};


const BACKUP_TABLES = [
  'companies', 'roles', 'users', 'fleet_categories', 'general_expenses', 'equipment', 'vehicles', 'clients', 'locations', 'toll_plazas', 'saved_routes', 'quotes', 'price_lists', 'templates', 'documents', 'integration_events',
];

export function registerIntegrations(app: FastifyInstance, { db, env }: AppContext) {
  app.get('/api/integrations', async (r) => {
    const u = requirePerm(r, 'ver:integracion');
    const smtp = one(db, "SELECT config, status, updated_at FROM integrations WHERE company_id = ? AND kind = 'smtp'", u.companyId);
    const smtpCfg = smtp ? JSON.parse(smtp.config) : null;
    return {
      channels: [
        {
          kind: 'smtp',
          label: 'SMTP',
          implemented: 'sí',
          status: smtp?.status ?? 'sin_configurar',
          detail: smtpCfg ? `${smtpCfg.host}:${smtpCfg.port} · remitente ${smtpCfg.from}. Contraseña cifrada. Envía cotizaciones con PDF adjunto desde el detalle, siempre con confirmación.` : 'Configura servidor y remitente propios para enviar cotizaciones con PDF adjunto.',
          config: smtpCfg ? { host: smtpCfg.host, port: smtpCfg.port, secure: smtpCfg.secure, user: smtpCfg.user, from: smtpCfg.from, hasPassword: !!smtpCfg.password } : null,
          updated_at: smtp?.updated_at ?? null,
        },
        ...Object.entries(NOT_IMPLEMENTED).map(([kind, detail]) => ({ kind, label: kind[0].toUpperCase() + kind.slice(1), implemented: 'no', status: 'no_disponible', detail, config: null, updated_at: null })),
      ],
      routing: routingProviders(env),
      secretKeyConfigured: !!env.APP_SECRET,
    };
  });

  app.put('/api/integrations/smtp', async (r) => {
    const u = requirePerm(r, 'configurar:integracion');
    if (!env.APP_SECRET) throw new HttpError(409, 'Define APP_SECRET en .env para guardar secretos cifrados.');
    const b = body(r.body);
    const prev = one(db, "SELECT config FROM integrations WHERE company_id = ? AND kind = 'smtp'", u.companyId);
    const prevCfg = prev ? JSON.parse(prev.config) : {};
    const cfg = {
      host: s(b.host, 'servidor', { required: true, max: 200 })!,
      port: n(b.port, 'puerto', { min: 1, max: 65535, def: 587 }),
      secure: !!b.secure,
      user: s(b.user, 'usuario', { max: 200 }),
      from: s(b.from, 'remitente', { required: true, max: 200 })!,
      password: typeof b.password === 'string' && b.password ? encrypt(env.APP_SECRET, b.password) : prevCfg.password ?? null,
    };
    run(db, "INSERT INTO integrations (company_id, kind, config, status, updated_at) VALUES (?, 'smtp', ?, 'configurado', ?) ON CONFLICT (company_id, kind) DO UPDATE SET config = excluded.config, status = excluded.status, updated_at = excluded.updated_at", u.companyId, JSON.stringify(cfg), new Date().toISOString());
    insert(db, 'integration_events', { company_id: u.companyId, kind: 'smtp', event: 'configurado', detail: `${cfg.host}:${cfg.port}`, user_id: u.id });
    return { ok: true };
  });

  app.delete('/api/integrations/smtp', async (r) => {
    const u = requirePerm(r, 'configurar:integracion');
    run(db, "DELETE FROM integrations WHERE company_id = ? AND kind = 'smtp'", u.companyId);
    insert(db, 'integration_events', { company_id: u.companyId, kind: 'smtp', event: 'desconectado', user_id: u.id });
    return { ok: true };
  });

  app.get('/api/integrations/events', async (r) => {
    const u = requirePerm(r, 'ver:integracion');
    return all(db, 'SELECT e.*, us.name AS user_name FROM integration_events e LEFT JOIN users us ON us.id = e.user_id WHERE e.company_id = ? ORDER BY e.id DESC LIMIT 200', u.companyId);
  });

  /** Respaldo JSON de la empresa. Excluye hashes de contraseña y secretos de integraciones. */
  app.get('/api/backup', async (r, reply) => {
    const u = requirePerm(r, 'exportar:respaldo');
    const out: Record<string, unknown> = { format: 'freight-quoting-backup', version: 1, exportedAt: new Date().toISOString() };
    for (const t of BACKUP_TABLES) {
      const col = t === 'companies' ? 'id' : 'company_id';
      out[t] = all(db, `SELECT * FROM ${t} WHERE ${col} = ?`, u.companyId).map((row) => {
        const { password_hash, ...rest } = row;
        return rest;
      });
    }
    const vehicleIds = (out.vehicles as any[]).map((v) => v.id);
    const quoteIds = (out.quotes as any[]).map((q) => q.id);
    const listIds = (out.price_lists as any[]).map((q) => q.id);
    const roleIds = (out.roles as any[]).map((q) => q.id);
    const plazaIds = (out.toll_plazas as any[]).map((q) => q.id);
    const inList = (ids: number[]) => (ids.length ? ids.join(',') : 'NULL');
    out.role_permissions = all(db, `SELECT * FROM role_permissions WHERE role_id IN (${inList(roleIds)})`);
    out.vehicle_assets = all(db, `SELECT * FROM vehicle_assets WHERE vehicle_id IN (${inList(vehicleIds)})`);
    out.vehicle_expenses = all(db, `SELECT * FROM vehicle_expenses WHERE vehicle_id IN (${inList(vehicleIds)})`);
    out.vehicle_equipment = all(db, `SELECT * FROM vehicle_equipment WHERE vehicle_id IN (${inList(vehicleIds)})`);
    out.quote_items = all(db, `SELECT * FROM quote_items WHERE quote_id IN (${inList(quoteIds)})`);
    out.price_list_rows = all(db, `SELECT * FROM price_list_rows WHERE price_list_id IN (${inList(listIds)})`);
    out.toll_rates = all(db, `SELECT * FROM toll_rates WHERE plaza_id IN (${inList(plazaIds)})`);
    reply.header('Content-Disposition', `attachment; filename="respaldo-${new Date().toISOString().slice(0, 10)}.json"`).type('application/json');
    return JSON.stringify(out, null, 1);
  });
}
