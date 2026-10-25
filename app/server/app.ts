import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { HttpError, loadSession, SESSION_COOKIE } from './auth.ts';
import type { DB } from './db.ts';
import { registerAuth } from './routes/auth.ts';
import { registerCatalog } from './routes/catalog.ts';
import { registerCosts } from './routes/costs.ts';
import { registerIntegrations } from './routes/integrations.ts';
import { registerKmQuotes } from './routes/kmquotes.ts';
import type { TransportFactory } from './services/mailer.ts';
import { registerOrg } from './routes/org.ts';
import { registerPriceLists } from './routes/pricelists.ts';
import { registerQuotes } from './routes/quotes.ts';
import { registerTemplates } from './routes/templates.ts';

export interface AppContext {
  db: DB;
  dataDir: string;
  env: Record<string, string | undefined>;
  secureCookies: boolean;
  /** Sólo pruebas: transporte SMTP simulado. */
  mailTransport?: TransportFactory;
}

export async function buildApp(ctx: AppContext, opts: { webDir?: string; logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024 });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    // Protección CSRF: la cookie es SameSite=Strict y toda mutación exige una cabecera que un formulario ajeno no puede enviar.
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-requested-with'] !== 'freight-quoting') {
      throw new HttpError(403, 'Solicitud rechazada (falta cabecera X-Requested-With).');
    }
    req.user = loadSession(ctx.db, req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err.validation || err.statusCode === 400) return reply.status(400).send({ error: err.message });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.status(413).send({ error: 'Archivo demasiado grande (máx. 5 MB).' });
    if (String(err.message).includes('UNIQUE constraint failed')) return reply.status(409).send({ error: 'El registro ya existe.' });
    app.log.error(err);
    return reply.status(500).send({ error: 'Error interno del servidor local.' });
  });

  app.get('/api/health', async () => ({ ok: true }));
  registerAuth(app, ctx);
  registerOrg(app, ctx);
  registerCosts(app, ctx);
  registerCatalog(app, ctx);
  registerQuotes(app, ctx);
  registerKmQuotes(app, ctx);
  registerPriceLists(app, ctx);
  registerTemplates(app, ctx);
  registerIntegrations(app, ctx);

  app.all('/api/*', async () => {
    throw new HttpError(404, 'Ruta de API inexistente.');
  });

  const webDir = opts.webDir;
  if (webDir && existsSync(join(webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDir });
    // SPA: rutas de navegación devuelven index.html; un asset inexistente es 404 real.
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/assets/') ? reply.status(404).send({ error: 'No encontrado' }) : reply.type('text/html').sendFile('index.html'),
    );
  }
  return app;
}
