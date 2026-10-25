// Envío de cotizaciones por SMTP propio. Sólo se ejecuta por acción explícita del usuario.
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { HttpError } from '../auth.ts';
import { insert, one, type DB } from '../db.ts';
import { recordDocument, type Generated } from './documents.ts';
import { decrypt } from './secrets.ts';

export type TransportFactory = (cfg: { host: string; port: number; secure: boolean; auth?: { user: string; pass: string } }) => Transporter;
export const defaultTransport: TransportFactory = (cfg) => nodemailer.createTransport(cfg);

export function smtpConfig(db: DB, companyId: number, env: Record<string, string | undefined>) {
  const row = one(db, "SELECT config FROM integrations WHERE company_id = ? AND kind = 'smtp'", companyId);
  if (!row) throw new HttpError(409, 'Configura SMTP en Configuración → Integraciones para enviar correos.');
  const cfg = JSON.parse(row.config);
  if (cfg.password && !env.APP_SECRET) throw new HttpError(409, 'Falta APP_SECRET para descifrar la contraseña SMTP.');
  return { host: cfg.host as string, port: cfg.port as number, secure: !!cfg.secure, from: cfg.from as string, auth: cfg.user ? { user: cfg.user as string, pass: cfg.password ? decrypt(env.APP_SECRET!, cfg.password) : '' } : undefined };
}

export async function sendQuoteEmail(
  db: DB,
  o: { companyId: number; userId: number; quoteId: number; to: string; subject: string; body: string; scenarioIds: string[]; attachment: Generated | null; env: Record<string, string | undefined>; transport?: TransportFactory },
) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.to)) throw new HttpError(400, 'Correo del destinatario inválido.');
  const cfg = smtpConfig(db, o.companyId, o.env);
  const transporter = (o.transport ?? defaultTransport)({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.auth });
  let status: 'enviado' | 'fallido' = 'enviado';
  let detail: string | null = null;
  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to: o.to,
      subject: o.subject,
      text: o.body,
      attachments: o.attachment ? [{ filename: o.attachment.fileName, content: o.attachment.buffer, contentType: o.attachment.mime }] : [],
    });
    detail = `messageId ${info.messageId ?? '—'}; aceptados: ${(info.accepted ?? []).join(', ') || '—'}`;
  } catch (e: any) {
    status = 'fallido';
    detail = String(e?.message ?? e).slice(0, 500);
  }
  const docId = o.attachment ? recordDocument(db, o.companyId, o.userId, 'quote', o.quoteId, 'pdf', o.attachment, 'correo', o.to, status) : null;
  insert(db, 'communications', { company_id: o.companyId, quote_id: o.quoteId, channel: 'correo', status, recipient: o.to, subject: o.subject, body: o.body, scenario_ids: JSON.stringify(o.scenarioIds), document_id: docId, detail, created_by: o.userId });
  if (status === 'fallido') throw new HttpError(502, `El servidor SMTP rechazó el envío: ${detail}`);
  return { status, detail };
}
