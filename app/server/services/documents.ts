// Exportación de cotizaciones y listas de precios a Word y PDF. Todo se genera localmente.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { civilDate, money, num, STATUS_LABELS } from '../../shared/format.ts';
import { HttpError } from '../auth.ts';
import { all, insert, one, type DB, type Row } from '../db.ts';
import { renderDocx } from './docx.ts';
import { getQuote } from './quotes.ts';

export interface Generated {
  buffer: Buffer;
  fileName: string;
  mime: string;
  templateId: number | null;
}

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
} as const;

function companyLogo(db: DB, companyId: number, dataDir: string) {
  const c = one(db, 'SELECT logo_path FROM companies WHERE id = ?', companyId);
  if (!c?.logo_path || !existsSync(join(dataDir, c.logo_path))) return null;
  return { buffer: readFileSync(join(dataDir, c.logo_path)), ext: (c.logo_path.endsWith('.png') ? 'png' : 'jpeg') as 'png' | 'jpeg' };
}

export function companyData(db: DB, companyId: number) {
  const c = one(db, 'SELECT * FROM companies WHERE id = ?', companyId)!;
  return {
    row: c,
    vars: {
      empresa_nombre: c.name ?? '',
      empresa_legal_name: c.legal_name ?? '',
      empresa_rfc: c.rfc ?? '',
      empresa_telefono: c.phone ?? '',
      empresa_email: c.email ?? '',
      empresa_website: c.website ?? '',
      empresa_direccion: c.address ?? '',
    },
  };
}

export function clientVars(c: Row | undefined) {
  return {
    cliente_nombre: c ? c.trade_name || c.legal_name : '',
    cliente_rfc: c?.rfc ?? '',
    cliente_contacto: c?.contact_name ?? '',
    cliente_email: c?.email ?? '',
    cliente_telefono: c?.phone ?? '',
    cliente_direccion: c?.address ?? '',
  };
}

function pickTemplate(db: DB, companyId: number, kind: 'quote' | 'price_list', dataDir: string, templateId?: number | null) {
  const t = templateId
    ? one(db, 'SELECT * FROM templates WHERE id = ? AND company_id = ? AND kind = ?', templateId, companyId, kind)
    : one(db, 'SELECT * FROM templates WHERE company_id = ? AND kind = ? ORDER BY is_default DESC, id LIMIT 1', companyId, kind);
  if (!t) throw new HttpError(409, 'No hay plantilla Word configurada para este documento.');
  const file = join(dataDir, t.file_path);
  if (!existsSync(file)) throw new HttpError(500, 'El archivo de la plantilla no existe en el almacenamiento local.');
  return { t, buf: readFileSync(file) };
}

export function quoteDocumentData(db: DB, companyId: number, quoteId: number) {
  const q = getQuote(db, companyId, quoteId);
  const client = q.client_id ? one(db, 'SELECT * FROM clients WHERE id = ? AND company_id = ?', q.client_id, companyId) : undefined;
  const { vars, row: company } = companyData(db, companyId);
  const items = q.items.map((i: any, idx: number) => {
    const r = i.snapshot.result ?? {};
    return {
      item_n: String(idx + 1),
      item_descripcion: i.description,
      item_cantidad: num(i.quantity, i.quantity % 1 ? 2 : 0),
      item_unitario: money(i.unit_subtotal),
      item_importe: money(i.quantity * i.unit_subtotal),
      item_aumento_pct: `${num(r.cargoSurchargePct ?? 0, 2)}%`,
      item_aumento_monto: money(r.cargoSurcharge ?? 0),
      item_vacio_no_cobrado: money(r.emptyNotCharged ?? 0),
    };
  });
  return {
    q,
    client,
    company,
    data: {
      ...vars,
      ...clientVars(client),
      cotizacion_numero: q.folio,
      cotizacion_fecha: civilDate(q.issued_on),
      cotizacion_vigencia: civilDate(q.valid_until),
      cotizacion_estado: STATUS_LABELS[q.status] ?? q.status,
      notas: q.notes ?? '',
      items,
      subtotal: money(q.totals.subtotal),
      iva_pct: `${num(q.totals.taxPct, q.totals.taxPct % 1 ? 2 : 0)}%`,
      iva_monto: money(q.totals.tax),
      total: money(q.totals.total),
    },
  };
}

export function quoteDocx(db: DB, companyId: number, quoteId: number, dataDir: string, templateId?: number | null): Generated {
  const { q, data } = quoteDocumentData(db, companyId, quoteId);
  const { t, buf } = pickTemplate(db, companyId, 'quote', dataDir, templateId);
  return { buffer: renderDocx(buf, data, companyLogo(db, companyId, dataDir)), fileName: `${q.folio}.docx`, mime: MIME.docx, templateId: t.id };
}

export function pdfBuffer(build: (doc: PDFKit.PDFDocument) => void, meta: { title: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: meta.title, Producer: 'Fletcot local', Creator: 'Fletcot local' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

export function header(doc: PDFKit.PDFDocument, company: Row, dataDir: string, title: string, subtitle: string) {
  const logo = company.logo_path ? join(dataDir, company.logo_path) : null;
  if (logo && existsSync(logo)) {
    try {
      doc.image(logo, 48, 40, { fit: [72, 72] });
    } catch {
      /* logo ilegible: se omite sin bloquear el documento */
    }
  }
  const x = logo && existsSync(logo) ? 132 : 48;
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text(company.name ?? '', x, 44);
  doc.font('Helvetica').fontSize(9).fillColor('#4B5563');
  for (const line of [company.legal_name && `${company.legal_name}${company.rfc ? ` · RFC ${company.rfc}` : ''}`, company.address, [company.phone, company.email, company.website].filter(Boolean).join(' · ')]) {
    if (line) doc.text(line, x);
  }
  const brand = (() => { try { return JSON.parse(company.preferences ?? '{}').brandColor ?? '#1D4ED8'; } catch { return '#1D4ED8'; } })();
  doc.font('Helvetica-Bold').fontSize(14).fillColor(brand).text(title, 48, 44, { align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#4B5563').text(subtitle, { align: 'right' });
  doc.moveDown(2);
  doc.y = Math.max(doc.y, 124);
}

export function tableRows(doc: PDFKit.PDFDocument, cols: { label: string; width: number; align?: 'left' | 'right' }[], rows: string[][]) {
  const x0 = 48;
  const drawRow = (cells: string[], bold: boolean, fill?: string) => {
    const h = Math.max(...cells.map((c, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).heightOfString(c, { width: cols[i].width - 8 }))) + 8;
    if (doc.y + h > doc.page.height - 60) doc.addPage();
    const y = doc.y;
    if (fill) doc.rect(x0, y, cols.reduce((s, c) => s + c.width, 0), h).fill(fill);
    let x = x0;
    cells.forEach((c, i) => {
      doc.fillColor(fill ? '#FFFFFF' : '#111827').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(c, x + 4, y + 4, { width: cols[i].width - 8, align: cols[i].align ?? 'left' });
      x += cols[i].width;
    });
    doc.y = y + h;
    doc.moveTo(x0, doc.y).lineTo(x, doc.y).strokeColor('#E5E7EB').stroke();
  };
  drawRow(cols.map((c) => c.label), true, '#1F2937');
  rows.forEach((r) => drawRow(r, false));
}

export function totalsBlock(doc: PDFKit.PDFDocument, lines: [string, string, boolean?][]) {
  doc.moveDown();
  for (const [label, value, strong] of lines) {
    const y = doc.y;
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 12 : 10).fillColor('#111827');
    doc.text(label, 320, y, { width: 130, align: 'right' });
    doc.text(value, 450, y, { width: 114, align: 'right' });
    doc.moveDown(0.3);
  }
}

export async function quotePdf(db: DB, companyId: number, quoteId: number, dataDir: string, detailed = false): Promise<Generated> {
  const { q, client, company, data } = quoteDocumentData(db, companyId, quoteId);
  const buffer = await pdfBuffer(
    (doc) => {
      header(doc, company, dataDir, `COTIZACIÓN ${q.folio}`, `Fecha: ${data.cotizacion_fecha} · Vigencia: ${data.cotizacion_vigencia}`);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(`Cliente: ${data.cliente_nombre || '—'}`, 48);
      doc.font('Helvetica').fontSize(9).fillColor('#4B5563');
      const cl = [client?.rfc && `RFC ${client.rfc}`, client?.contact_name, client?.phone, client?.email].filter(Boolean).join(' · ');
      if (cl) doc.text(cl);
      if (client?.address) doc.text(client.address);
      doc.moveDown();
      tableRows(
        doc,
        [{ label: '#', width: 28 }, { label: 'Descripción', width: 290 }, { label: 'Cant.', width: 50, align: 'right' }, { label: 'Unitario', width: 74, align: 'right' }, { label: 'Importe', width: 74, align: 'right' }],
        data.items.map((i: any) => [i.item_n, i.item_descripcion, i.item_cantidad, i.item_unitario, i.item_importe]),
      );
      totalsBlock(doc, [['Subtotal', data.subtotal], [`IVA (${data.iva_pct})`, data.iva_monto], ['Total', data.total, true]]);
      if (q.notes) {
        doc.moveDown().font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Notas', 48);
        doc.font('Helvetica').text(q.notes, { width: 516 });
      }
      if (detailed) for (const item of q.items) detailPage(doc, item);
    },
    { title: q.folio },
  );
  return { buffer, fileName: `${q.folio}${detailed ? '-desglose' : ''}.pdf`, mime: MIME.pdf, templateId: null };
}

/** Desglose interno de costos (no pensado para el cliente). */
function detailPage(doc: PDFKit.PDFDocument, item: any) {
  const s = item.snapshot;
  const r = s.result;
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(`Desglose · ${item.description}`, 48, 48);
  doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text(`Motor ${s.engine} · calculado ${s.computedAt} · vehículo ${s.params.vehicle.name}`);
  doc.moveDown();
  const lines: [string, number][] =
    s.kind === 'freight'
      ? [
          ['Combustible (cargado + ralentí)', r.loaded.combustible],
          ['Neumáticos (cargado)', r.loaded.neumaticos],
          ['Mantenimiento (cargado)', r.loaded.mantenimiento],
          ['Depreciación (cargado)', r.loaded.depreciacion],
          ['Descanso operador', r.loaded.descanso],
          ['Gastos fijos generales', r.loaded.fijosGenerales],
          ['Gastos fijos específicos', r.loaded.fijosEspecificos],
          ['Equipamiento', r.loaded.equipamiento],
          ['Costo de capital', r.loaded.capital],
          ['Tramos vacíos cobrados', r.emptyCharged],
          ['Pago al operador', r.driverPay.inCost],
          ['Peajes', r.tolls],
          ['Otros gastos', r.otherExpenses],
          ['Costo total del viaje', r.tripCost],
          [`Utilidad (${r.profitPct}%)`, r.profit],
          [`Financiamiento (${r.financingPct}%)`, r.financing],
          [`Aumento por carga (${r.cargoSurchargePct}%)`, r.cargoSurcharge],
          ['Subtotal', r.subtotal],
        ]
      : [
          ['Gastos fijos generales', r.availability.general.amount],
          ['Gastos fijos específicos', r.availability.specific.amount],
          ['Equipamiento', r.availability.equipment.amount],
          ['Depreciación', r.availability.depreciationTotal],
          ['Costo de capital', r.availability.capitalCost],
          ['Operador', r.availability.operatorCost],
          ['Uso (combustible, llantas, mantenimiento)', r.usage.total],
          ['Peajes', r.tolls],
          ['Otros gastos', r.otherExpenses],
          [`Utilidad (${r.profitPct}%)`, r.profit],
          ['Subtotal del periodo', r.periodSubtotal],
        ];
  tableRows(doc, [{ label: 'Rubro', width: 380 }, { label: 'Importe', width: 136, align: 'right' }], lines.map(([l, v]) => [l, money(v)]));
}

export async function priceListPdf(db: DB, companyId: number, listId: number, dataDir: string): Promise<Generated> {
  const { list, rows, data, company } = priceListData(db, companyId, listId);
  const buffer = await pdfBuffer(
    (doc) => {
      header(doc, company, dataDir, 'LISTA DE PRECIOS', `${list.name} · ${data.lista_fecha}`);
      doc.font('Helvetica').fontSize(10).fillColor('#111827').text(`Cliente: ${data.cliente_nombre || '—'}`, 48);
      doc.moveDown();
      tableRows(
        doc,
        [{ label: 'Destino', width: 190 }, { label: 'Vehículo', width: 140 }, { label: 'Km', width: 50, align: 'right' }, { label: 'Precio s/IVA', width: 68, align: 'right' }, { label: 'Precio c/IVA', width: 68, align: 'right' }],
        rows.map((r) => [r.item_destino, r.item_vehiculo, r.item_km, r.item_precio, r.item_precio_iva]),
      );
      doc.moveDown().font('Helvetica').fontSize(8).fillColor('#6B7280').text(`IVA aplicado: ${data.iva_pct}. Precios calculados con costos vigentes a la fecha de cálculo de cada fila.`, 48);
    },
    { title: list.name },
  );
  return { buffer, fileName: `lista-${listId}.pdf`, mime: MIME.pdf, templateId: null };
}

export function priceListData(db: DB, companyId: number, listId: number) {
  const list = one(db, 'SELECT * FROM price_lists WHERE id = ? AND company_id = ?', listId, companyId);
  if (!list) throw new HttpError(404, 'Lista de precios no encontrada.');
  const client = list.client_id ? one(db, 'SELECT * FROM clients WHERE id = ? AND company_id = ?', list.client_id, companyId) : undefined;
  const { vars, row: company } = companyData(db, companyId);
  const rows = all(db, 'SELECT * FROM price_list_rows WHERE price_list_id = ? ORDER BY route_name, vehicle_name', listId).map((r) => ({
    item_destino: r.route_name,
    item_vehiculo: r.vehicle_name,
    item_km: num(r.distance_meters / 1000, 1),
    item_precio: money(r.unit_subtotal),
    item_precio_iva: money(r.price_with_tax),
  }));
  return { list, rows, company, data: { ...vars, ...clientVars(client), lista_nombre: list.name, lista_fecha: civilDate(list.updated_at.slice(0, 10)), iva_pct: `${num(list.tax_pct, 0)}%`, items: rows } };
}

export function priceListDocx(db: DB, companyId: number, listId: number, dataDir: string, templateId?: number | null): Generated {
  const { data } = priceListData(db, companyId, listId);
  const { t, buf } = pickTemplate(db, companyId, 'price_list', dataDir, templateId);
  return { buffer: renderDocx(buf, data, companyLogo(db, companyId, dataDir)), fileName: `lista-${listId}.docx`, mime: MIME.docx, templateId: t.id };
}

/** Registra la exportación en el historial (huella SHA-256 del archivo entregado). */
export function recordDocument(db: DB, companyId: number, userId: number, sourceKind: 'quote' | 'price_list', sourceId: number, format: 'docx' | 'pdf', g: Generated, channel = 'descarga', recipient: string | null = null, status = 'generado') {
  return insert(db, 'documents', {
    company_id: companyId,
    source_kind: sourceKind,
    source_id: sourceId,
    format,
    channel,
    recipient,
    status,
    file_name: g.fileName,
    sha256: createHash('sha256').update(g.buffer).digest('hex'),
    bytes: g.buffer.length,
    template_id: g.templateId,
    created_by: userId,
  });
}
