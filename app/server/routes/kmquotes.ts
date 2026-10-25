// Cotización por km: configuración, cálculo, edición, alternativas, duplicado, mensajes y envío.
import type { FastifyInstance } from 'fastify';
import { computeKmQuote } from '../../shared/pricing/kmquote.ts';
import { HttpError, requirePerm } from '../auth.ts';
import { all, insert } from '../db.ts';
import type { AppContext } from '../app.ts';
import { recordDocument } from '../services/documents.ts';
import { kmMessages, kmPdf } from '../services/kmdocs.ts';
import { getKmConfig, kmDefaults, parseKmConfig, parseKmRequest, saveKmConfig } from '../services/kmquotes.ts';
import { sendQuoteEmail } from '../services/mailer.ts';
import { duplicateQuote, getQuote, replaceKmItem, selectKmScenario } from '../services/quotes.ts';
import { oneOf, s } from '../services/validate.ts';
import { body, idParam } from './crud.ts';

const ids = (x: unknown): string[] =>
  (Array.isArray(x) ? x : typeof x === 'string' && x ? x.split(',') : []).map(String).filter((v) => /^[\w-]{1,40}$/.test(v)).slice(0, 12);

export function registerKmQuotes(app: FastifyInstance, ctx: AppContext) {
  const { db, dataDir, env } = ctx;

  app.get('/api/km-config', async (r) => {
    const u = requirePerm(r, 'ver:cotizacion');
    return getKmConfig(db, u.companyId);
  });

  app.patch('/api/km-config', async (r) => {
    const u = requirePerm(r, 'modificar:preferencias');
    const cfg = parseKmConfig(body(r.body), getKmConfig(db, u.companyId));
    saveKmConfig(db, u.companyId, cfg);
    return cfg;
  });

  app.get('/api/km-quotes/defaults', async (r) => {
    const u = requirePerm(r, 'agregar:cotizacion');
    return kmDefaults(db, u.companyId, idParam((r.query as any).vehicleId));
  });

  /** Cálculo de servidor (la interfaz calcula en vivo con el mismo motor; al guardar manda el servidor). */
  app.post('/api/calculate/km', async (r) => {
    const u = requirePerm(r, 'agregar:cotizacion');
    const b = body(r.body);
    const defaults = kmDefaults(db, u.companyId, idParam(b.vehicleId));
    const { input } = parseKmRequest(b.input, defaults);
    return computeKmQuote(input);
  });

  app.put('/api/quotes/:id/items/:itemId/km', async (r) => {
    const u = requirePerm(r, 'modificar:cotizacion');
    const id = idParam((r.params as any).id);
    replaceKmItem(db, u.companyId, id, idParam((r.params as any).itemId), u.id, body(r.body));
    return getQuote(db, u.companyId, id);
  });

  app.post('/api/quotes/:id/items/:itemId/select', async (r) => {
    const u = requirePerm(r, 'modificar:cotizacion');
    const id = idParam((r.params as any).id);
    const scenarioId = s(body(r.body).scenarioId, 'alternativa', { required: true, max: 40 })!;
    selectKmScenario(db, u.companyId, id, idParam((r.params as any).itemId), u.id, scenarioId);
    return getQuote(db, u.companyId, id);
  });

  app.post('/api/quotes/:id/duplicate', async (r, reply) => {
    const u = requirePerm(r, 'agregar:cotizacion');
    const newId = duplicateQuote(db, u.companyId, idParam((r.params as any).id), u.id);
    reply.status(201);
    return getQuote(db, u.companyId, newId);
  });

  app.get('/api/quotes/:id/messages', async (r) => {
    const u = requirePerm(r, 'ver:cotizacion');
    return kmMessages(db, u.companyId, idParam((r.params as any).id), ids((r.query as any).scenarios));
  });

  app.get('/api/quotes/:id/communications', async (r) => {
    const u = requirePerm(r, 'ver:cotizacion');
    const id = idParam((r.params as any).id);
    getQuote(db, u.companyId, id);
    return all(db, 'SELECT c.*, us.name AS user_name FROM communications c LEFT JOIN users us ON us.id = c.created_by WHERE c.company_id = ? AND c.quote_id = ? ORDER BY c.id DESC', u.companyId, id);
  });

  /** Registra que el usuario preparó un mensaje (copió o abrió WhatsApp/correo). No es un envío confirmado. */
  app.post('/api/quotes/:id/communications', async (r, reply) => {
    const u = requirePerm(r, 'enviar:cotizacion');
    const id = idParam((r.params as any).id);
    getQuote(db, u.companyId, id);
    const b = body(r.body);
    const cid = insert(db, 'communications', {
      company_id: u.companyId,
      quote_id: id,
      channel: oneOf(b.channel, 'canal', ['whatsapp', 'correo'] as const),
      status: 'preparado',
      recipient: s(b.recipient, 'destinatario', { max: 200 }),
      subject: s(b.subject, 'asunto', { max: 300 }),
      body: s(b.body, 'mensaje', { required: true, max: 6000 })!,
      scenario_ids: JSON.stringify(ids(b.scenarioIds)),
      detail: s(b.detail, 'detalle', { max: 300 }),
      created_by: u.id,
    });
    reply.status(201);
    return { id: cid };
  });

  app.post('/api/quotes/:id/email', async (r) => {
    const u = requirePerm(r, 'enviar:cotizacion');
    const id = idParam((r.params as any).id);
    const b = body(r.body);
    if (b.confirm !== true) throw new HttpError(400, 'Confirma el envío explícitamente.');
    const scenarioIds = ids(b.scenarioIds);
    const attachment = b.attach === false ? null : await kmPdf(db, u.companyId, id, dataDir, scenarioIds, false);
    return sendQuoteEmail(db, {
      companyId: u.companyId,
      userId: u.id,
      quoteId: id,
      to: s(b.to, 'destinatario', { required: true, max: 200 })!,
      subject: s(b.subject, 'asunto', { required: true, max: 300 })!,
      body: s(b.body, 'mensaje', { required: true, max: 6000 })!,
      scenarioIds,
      attachment,
      env,
      transport: ctx.mailTransport,
    });
  });

  app.get('/api/quotes/:id/km-pdf', async (r, reply) => {
    const u = requirePerm(r, 'exportar:cotizacion');
    const id = idParam((r.params as any).id);
    const q = r.query as Record<string, string>;
    const internal = q.internal === '1';
    if (internal) requirePerm(r, 'modificar:cotizacion');
    const g = await kmPdf(db, u.companyId, id, dataDir, ids(q.scenarios), internal);
    recordDocument(db, u.companyId, u.id, 'quote', id, 'pdf', g, internal ? 'descarga interna' : 'descarga');
    reply.header('Content-Disposition', `attachment; filename="${g.fileName}"`).type(g.mime);
    return g.buffer;
  });
}
