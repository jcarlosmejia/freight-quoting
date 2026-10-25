// Cálculo, cotizaciones, partidas y exportación.
import type { FastifyInstance } from 'fastify';
import { HttpError, requirePerm } from '../auth.ts';
import { all, one, run, tx, update } from '../db.ts';
import type { AppContext } from '../app.ts';
import { quoteDocx, quotePdf, recordDocument } from '../services/documents.ts';
import { addDays, addItem, civilToday, createQuote, effectiveStatus, freightSnapshot, getPreferences, getQuote, quoteTotals, recalcItem, rentalSnapshot } from '../services/quotes.ts';
import { isoDate, n, oneOf, s } from '../services/validate.ts';
import { body, idParam } from './crud.ts';

const STATUSES = ['draft', 'sent', 'negotiating', 'accepted', 'rejected', 'expired'] as const;

export function registerQuotes(app: FastifyInstance, { db, dataDir }: AppContext) {
  // Vista previa calculada en servidor (la interfaz también calcula en vivo con el mismo motor).
  app.post('/api/calculate/freight', async (r) => {
    const u = requirePerm(r, 'agregar:cotizacion');
    const b = body(r.body);
    return freightSnapshot(db, u.companyId, idParam(b.vehicleId), b.route, b.input).snapshot;
  });

  app.post('/api/calculate/rental', async (r) => {
    const u = requirePerm(r, 'agregar:cotizacion');
    const b = body(r.body);
    return rentalSnapshot(db, u.companyId, idParam(b.vehicleId), b.input).snapshot;
  });

  app.get('/api/preferences', async (r) => {
    const u = requirePerm(r, 'ver:cotizacion');
    return getPreferences(db, u.companyId);
  });

  /** Listado con filtros: texto (folio, cliente, origen, destino), estado, rango de fechas y archivo. */
  const listQuotes = (companyId: number, q: Record<string, string>) => {
    const like = q.q ? `%${String(q.q).toLowerCase()}%` : null;
    const from = isoDate(q.from, 'desde');
    const to = isoDate(q.to, 'hasta');
    const archived = q.archived === '1';
    const rows = all(
      db,
      `SELECT q.id, q.folio, q.status, q.issued_on, q.valid_until, q.tax_pct, q.retention_pct, q.client_id, c.legal_name AS client_name,
              q.origin_label, q.destination_label, q.follow_up_on, q.final_amount, q.archived_at
         FROM quotes q LEFT JOIN clients c ON c.id = q.client_id
        WHERE q.company_id = ? AND (q.archived_at IS NOT NULL) = ?
          AND (? IS NULL OR lower(q.folio || ' ' || COALESCE(c.legal_name,'') || ' ' || COALESCE(c.trade_name,'') || ' ' || COALESCE(q.origin_label,'') || ' ' || COALESCE(q.destination_label,'')) LIKE ?)
          AND (? IS NULL OR q.issued_on >= ?) AND (? IS NULL OR q.issued_on <= ?)
        ORDER BY q.issued_on DESC, q.id DESC`,
      companyId, archived ? 1 : 0, like, like, from, from, to, to,
    ).map((x) => {
      const items = all(db, 'SELECT quantity, unit_subtotal, snapshot FROM quote_items WHERE quote_id = ?', x.id).map((i) => ({ ...i, snapshot: JSON.parse(i.snapshot) }));
      const t = quoteTotals(items, x.tax_pct, x.retention_pct ?? 0);
      return { ...x, status: effectiveStatus(x.status, x.valid_until), subtotal: t.subtotal, total: t.total, items: items.length };
    });
    return q.status ? rows.filter((x) => x.status === q.status) : rows;
  };

  app.get('/api/quotes', async (r) => {
    const u = requirePerm(r, 'ver:cotizacion');
    return listQuotes(u.companyId, r.query as Record<string, string>);
  });

  app.get('/api/quotes-export.csv', async (r, reply) => {
    const u = requirePerm(r, 'exportar:cotizacion');
    const rows = listQuotes(u.companyId, r.query as Record<string, string>);
    const cell = (v: unknown) => {
      const t = String(v ?? '');
      const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const head = ['folio', 'fecha', 'vigencia', 'cliente', 'origen', 'destino', 'estado', 'subtotal', 'total', 'monto_final_negociado'];
    reply.header('Content-Disposition', 'attachment; filename="cotizaciones.csv"').type('text/csv; charset=utf-8');
    return '\uFEFF' + [head.join(','), ...rows.map((x) => [x.folio, x.issued_on, x.valid_until, x.client_name, x.origin_label, x.destination_label, x.status, x.subtotal, x.total, x.final_amount].map(cell).join(','))].join('\n');
  });

  app.get('/api/follow-ups', async (r) => {
    const u = requirePerm(r, 'ver:cotizacion');
    return all(
      db,
      `SELECT q.id, q.folio, q.status, q.follow_up_on, c.legal_name AS client_name FROM quotes q LEFT JOIN clients c ON c.id = q.client_id
        WHERE q.company_id = ? AND q.archived_at IS NULL AND q.follow_up_on IS NOT NULL AND q.follow_up_on <= ? AND q.status IN ('draft','sent','negotiating')
        ORDER BY q.follow_up_on LIMIT 50`,
      u.companyId,
      addDays(civilToday(), 7),
    );
  });

  app.post('/api/quotes', async (r, reply) => {
    const u = requirePerm(r, 'agregar:cotizacion');
    const b = body(r.body);
    // Atómico: si la partida es inválida no queda una cotización vacía ni se consume folio.
    const id = tx(db, () => {
      const id = createQuote(db, u.companyId, u.id, {
        clientId: b.clientId == null || b.clientId === '' ? null : n(b.clientId, 'cliente', { min: 1 }),
        notes: s(b.notes, 'notas', { max: 2000 }),
        validUntil: isoDate(b.validUntil, 'vigencia'),
      });
      if (b.item) addItem(db, u.companyId, id, body(b.item));
      return id;
    });
    reply.status(201);
    return getQuote(db, u.companyId, id);
  });

  app.get('/api/quotes/:id', async (r) => {
    const u = requirePerm(r, 'ver:cotizacion');
    return getQuote(db, u.companyId, idParam((r.params as any).id));
  });

  app.patch('/api/quotes/:id', async (r) => {
    const u = requirePerm(r, 'modificar:cotizacion');
    const id = idParam((r.params as any).id);
    getQuote(db, u.companyId, id);
    const b = body(r.body);
    if ('client_id' in b && b.client_id != null && !one(db, 'SELECT id FROM clients WHERE id = ? AND company_id = ?', Number(b.client_id), u.companyId)) {
      throw new HttpError(400, 'Cliente no encontrado.');
    }
    update(db, 'quotes', id, {
      client_id: 'client_id' in b ? (b.client_id == null ? null : Number(b.client_id)) : undefined,
      status: 'status' in b ? oneOf(b.status, 'estado', STATUSES) : undefined,
      valid_until: 'valid_until' in b ? isoDate(b.valid_until, 'vigencia') : undefined,
      tax_pct: 'tax_pct' in b ? n(b.tax_pct, 'IVA', { min: 0, max: 100 }) : undefined,
      notes: 'notes' in b ? s(b.notes, 'notas', { max: 2000 }) : undefined,
      terms: 'terms' in b ? s(b.terms, 'condiciones', { max: 3000 }) : undefined,
      retention_pct: 'retention_pct' in b ? n(b.retention_pct, 'retención', { min: 0, max: 100 }) : undefined,
      follow_up_on: 'follow_up_on' in b ? isoDate(b.follow_up_on, 'seguimiento') : undefined,
      final_amount: 'final_amount' in b ? (b.final_amount == null || b.final_amount === '' ? null : n(b.final_amount, 'monto final', { min: 0, max: 1e10 })) : undefined,
      final_rate_per_km: 'final_rate_per_km' in b ? (b.final_rate_per_km == null || b.final_rate_per_km === '' ? null : n(b.final_rate_per_km, 'tarifa final', { min: 0, max: 1e5 })) : undefined,
      archived_at: 'archived' in b ? (b.archived ? new Date().toISOString() : null) : undefined,
      updated_at: new Date().toISOString(),
    }, `AND company_id = ${u.companyId}`);
    return getQuote(db, u.companyId, id);
  });

  app.delete('/api/quotes/:id', async (r) => {
    const u = requirePerm(r, 'eliminar:cotizacion');
    const res = run(db, 'DELETE FROM quotes WHERE id = ? AND company_id = ?', idParam((r.params as any).id), u.companyId);
    if (!res.changes) throw new HttpError(404, 'Cotización no encontrada.');
    return { ok: true };
  });

  app.post('/api/quotes/:id/items', async (r, reply) => {
    const u = requirePerm(r, 'modificar:cotizacion');
    const id = idParam((r.params as any).id);
    addItem(db, u.companyId, id, body(r.body));
    reply.status(201);
    return getQuote(db, u.companyId, id);
  });

  app.patch('/api/quotes/:id/items/:itemId', async (r) => {
    const u = requirePerm(r, 'modificar:cotizacion');
    const id = idParam((r.params as any).id);
    const itemId = idParam((r.params as any).itemId);
    getQuote(db, u.companyId, id);
    const b = body(r.body);
    const res = run(
      db,
      'UPDATE quote_items SET description = COALESCE(?, description), quantity = COALESCE(?, quantity) WHERE id = ? AND quote_id = ?',
      s(b.description, 'descripción', { max: 500 }),
      b.quantity === undefined ? null : n(b.quantity, 'cantidad', { min: 0.01, max: 1e6 }),
      itemId,
      id,
    );
    if (!res.changes) throw new HttpError(404, 'Partida no encontrada.');
    return getQuote(db, u.companyId, id);
  });

  app.delete('/api/quotes/:id/items/:itemId', async (r) => {
    const u = requirePerm(r, 'modificar:cotizacion');
    const id = idParam((r.params as any).id);
    getQuote(db, u.companyId, id);
    tx(db, () => {
      const res = run(db, 'DELETE FROM quote_items WHERE id = ? AND quote_id = ?', idParam((r.params as any).itemId), id);
      if (!res.changes) throw new HttpError(404, 'Partida no encontrada.');
      // Renumera para que las posiciones sigan siendo consecutivas.
      all(db, 'SELECT id FROM quote_items WHERE quote_id = ? ORDER BY position', id).forEach((row, i) => run(db, 'UPDATE quote_items SET position = ? WHERE id = ?', i + 1, row.id));
    });
    return getQuote(db, u.companyId, id);
  });

  app.post('/api/quotes/:id/items/:itemId/recalculate', async (r) => {
    const u = requirePerm(r, 'modificar:cotizacion');
    const id = idParam((r.params as any).id);
    const change = recalcItem(db, u.companyId, id, idParam((r.params as any).itemId), u.id);
    return { change, quote: getQuote(db, u.companyId, id) };
  });

  app.get('/api/quotes/:id/items/:itemId/revisions', async (r) => {
    const u = requirePerm(r, 'ver:cotizacion');
    const id = idParam((r.params as any).id);
    getQuote(db, u.companyId, id);
    return all(
      db,
      'SELECT qr.id, qr.unit_subtotal, qr.engine_version, qr.replaced_at, qr.replaced_by FROM quote_item_revisions qr JOIN quote_items qi ON qi.id = qr.item_id WHERE qi.quote_id = ? AND qr.item_id = ? ORDER BY qr.id DESC',
      id,
      idParam((r.params as any).itemId),
    );
  });

  app.get('/api/quotes/:id/export', async (r, reply) => {
    const u = requirePerm(r, 'exportar:cotizacion');
    const id = idParam((r.params as any).id);
    const q = r.query as Record<string, string>;
    const format = oneOf(q.format, 'formato', ['docx', 'pdf'] as const);
    const g = format === 'docx' ? quoteDocx(db, u.companyId, id, dataDir, q.template ? idParam(q.template) : null) : await quotePdf(db, u.companyId, id, dataDir, q.detail === '1');
    recordDocument(db, u.companyId, u.id, 'quote', id, format, g);
    reply.header('Content-Disposition', `attachment; filename="${g.fileName}"`).type(g.mime);
    return g.buffer;
  });

  app.get('/api/documents', async (r) => {
    const u = requirePerm(r, 'ver:envio');
    return all(
      db,
      `SELECT d.*, us.name AS user_name,
              CASE d.source_kind WHEN 'quote' THEN (SELECT folio FROM quotes WHERE id = d.source_id) ELSE (SELECT name FROM price_lists WHERE id = d.source_id) END AS source_label
         FROM documents d LEFT JOIN users us ON us.id = d.created_by WHERE d.company_id = ? ORDER BY d.id DESC LIMIT 500`,
      u.companyId,
    );
  });

  app.get('/api/dashboard', async (r) => {
    const u = requirePerm(r, 'ver:cotizacion');
    const month = String((r.query as any).month ?? new Date().toISOString().slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Mes inválido.');
    const rows = all(
      db,
      `SELECT q.status, q.valid_until, q.tax_pct, COALESCE((SELECT SUM(i.quantity * i.unit_subtotal) FROM quote_items i WHERE i.quote_id = q.id), 0) AS subtotal
         FROM quotes q WHERE q.company_id = ? AND substr(q.issued_on, 1, 7) = ?`,
      u.companyId,
      month,
    );
    const by: Record<string, { count: number; amount: number }> = {};
    for (const x of rows) {
      const st = effectiveStatus(x.status, x.valid_until);
      by[st] ??= { count: 0, amount: 0 };
      by[st].count++;
      by[st].amount += x.subtotal;
    }
    const decided = (by.accepted?.count ?? 0) + (by.rejected?.count ?? 0);
    return { month, total: rows.length, byStatus: by, closeRate: decided ? (by.accepted?.count ?? 0) / decided : null };
  });
}
