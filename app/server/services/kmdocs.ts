// Documentos y mensajes comerciales de cotizaciones por km. Sólo datos públicos para el cliente:
// los costos internos, margen y pago al operador se incluyen únicamente si se pide `internal`.
import { civilDate, money, num } from '../../shared/format.ts';
import { HttpError } from '../auth.ts';
import { one, type DB } from '../db.ts';
import { clientVars, companyData, header, pdfBuffer, tableRows, totalsBlock, type Generated } from './documents.ts';
import { getKmConfig, placeLabel, type PlaceInput } from './kmquotes.ts';
import { getQuote } from './quotes.ts';

const UNIT_LABEL: Record<string, string> = { plataforma: 'Plataforma', caja_seca: 'Caja seca' };
const c2 = (cents: number) => money(cents / 100);
const fullPlace = (p: PlaceInput) => [p.address, [p.city, p.state].filter(Boolean).join(', '), p.zip && `CP ${p.zip}`].filter(Boolean).join(' · ');

export function kmContext(db: DB, companyId: number, quoteId: number, scenarioIds?: string[]) {
  const q = getQuote(db, companyId, quoteId);
  const item = q.items.find((i: any) => i.kind === 'km');
  if (!item) throw new HttpError(409, 'La cotización no tiene una partida por km.');
  const snap = item.snapshot;
  const ids = scenarioIds?.length ? scenarioIds : [snap.selectedScenarioId];
  const scenarios = ids.map((id) => snap.result.scenarios.find((s: any) => s.id === id)).filter(Boolean);
  if (!scenarios.length) throw new HttpError(400, 'Alternativas no encontradas.');
  if (scenarios.some((s: any) => s.warnings.some((w: any) => w.code === 'imposible'))) throw new HttpError(400, 'Hay alternativas sin precio válido.');
  const client = q.client_id ? one(db, 'SELECT * FROM clients WHERE id = ? AND company_id = ?', q.client_id, companyId) : undefined;
  const { row: company, vars } = companyData(db, companyId);
  const cfg = getKmConfig(db, companyId);
  const i = snap.input;
  const unit = `${UNIT_LABEL[i.unit.unitType] ?? i.unit.unitType}${i.unit.lengthFt ? ` de ${i.unit.lengthFt} pies` : ''}`;
  const cargo = [i.cargo.pallets ? `${i.cargo.pallets} pallets` : null, i.cargo.weightTons ? `${num(i.cargo.weightTons, i.cargo.weightTons % 1 ? 2 : 0)} t` : null, i.cargo.goods || null].filter(Boolean).join(' / ');
  return { q, item, snap, scenarios, client, company, vars, cfg, unit, cargo };
}

/** Texto de alternativas para mensajes: sólo precio comercial. */
function optionsText(ctx: ReturnType<typeof kmContext>) {
  const tax = ctx.snap.input.pricing.taxPct;
  return ctx.scenarios
    .map((s: any) => `• ${ctx.scenarios.length > 1 ? `${s.label}: ` : 'Precio: '}${c2(s.subtotal)} + IVA (${tax}%)${s.retention ? `, retención ${c2(s.retention)}` : ''} = ${c2(s.total)}`)
    .join('\n');
}

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

export function kmMessages(db: DB, companyId: number, quoteId: number, scenarioIds?: string[]) {
  const ctx = kmContext(db, companyId, quoteId, scenarioIds);
  const v: Record<string, string> = {
    cliente: ctx.client ? ctx.client.contact_name || ctx.client.trade_name || ctx.client.legal_name : 'cliente',
    folio: ctx.q.folio,
    empresa: ctx.company.name ?? '',
    origen: placeLabel(ctx.snap.places.origin),
    destino: placeLabel(ctx.snap.places.destination),
    unidad: ctx.unit,
    carga: ctx.cargo || 'carga general',
    opciones: optionsText(ctx),
    vigencia: civilDate(ctx.q.valid_until),
    condiciones: ctx.q.terms || ctx.cfg.terms,
    contacto: [ctx.company.phone, ctx.company.email].filter(Boolean).join(' · '),
  };
  const phone = (ctx.client?.phone ?? '').replace(/\D/g, '');
  const whatsapp = fill(ctx.cfg.messages.whatsapp, v);
  const subject = fill(ctx.cfg.messages.emailSubject, v);
  const body = fill(ctx.cfg.messages.emailBody, v);
  return {
    whatsapp,
    // wa.me abre WhatsApp con el texto; el usuario revisa y envía. No adjunta archivos.
    whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(whatsapp)}`,
    clientPhone: phone || null,
    email: { to: ctx.client?.email ?? '', subject, body, mailto: `mailto:${encodeURIComponent(ctx.client?.email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` },
    scenarioIds: ctx.scenarios.map((s: any) => s.id),
  };
}

export async function kmPdf(db: DB, companyId: number, quoteId: number, dataDir: string, scenarioIds: string[] | undefined, internal: boolean): Promise<Generated> {
  const ctx = kmContext(db, companyId, quoteId, scenarioIds);
  const { q, snap, scenarios, client, company } = ctx;
  const i = snap.input;
  const comparative = scenarios.length > 1;
  const cv = clientVars(client);
  const buffer = await pdfBuffer(
    (doc) => {
      header(doc, company, dataDir, comparative ? `COTIZACIÓN ${q.folio} · ALTERNATIVAS` : `COTIZACIÓN ${q.folio}`, `Emisión: ${civilDate(q.issued_on)} · Vigencia: ${civilDate(q.valid_until)}`);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(`Cliente: ${cv.cliente_nombre || '—'}`, 48);
      doc.font('Helvetica').fontSize(9).fillColor('#4B5563');
      const cl = [cv.cliente_rfc && `RFC ${cv.cliente_rfc}`, cv.cliente_contacto, cv.cliente_telefono, cv.cliente_email].filter(Boolean).join(' · ');
      if (cl) doc.text(cl);
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Servicio', 48);
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      const lines: [string, string][] = [
        ['Origen', fullPlace(snap.places.origin)],
        ...snap.places.waypoints.map((w: PlaceInput, k: number) => [`Punto ${k + 1}`, fullPlace(w)] as [string, string]),
        ['Destino', fullPlace(snap.places.destination)],
        ['Tipo de viaje', i.trip.tripType === 'redondo' ? `Redondo (${i.trip.returnMode === 'cargado' ? 'regreso con carga' : 'regreso vacío'})` : 'Sencillo (sólo ida)'],
        ['Distancia', `${num(i.trip.outboundKm, 0)} km de ida${i.trip.tripType === 'redondo' ? ` · ${num(i.trip.returnKm, 0)} km de regreso` : ''} (${i.trip.distanceSource === 'manual' ? 'captura manual' : 'proveedor de rutas'})`],
        ['Unidad', ctx.unit],
        ['Carga', ctx.cargo || '—'],
        ['Requerimientos', [i.cargo.tarp && 'lona', i.cargo.straps && 'amarres', `maniobras por cuenta del ${i.cargo.handling}`].filter(Boolean).join(', ')],
      ];
      if (i.cargo.loadDate || i.cargo.deliveryDate) lines.push(['Fechas', `Carga ${civilDate(i.cargo.loadDate)} · Entrega ${civilDate(i.cargo.deliveryDate)}`]);
      for (const [k, v] of lines) doc.text(`${k}: ${v}`, 48, undefined, { width: 516 });
      doc.moveDown(0.8);
      if (comparative) {
        tableRows(
          doc,
          [{ label: 'Alternativa', width: 150 }, { label: 'Tarifa equivalente', width: 96, align: 'right' }, { label: 'Subtotal', width: 90, align: 'right' }, { label: `IVA ${i.pricing.taxPct}%`, width: 84, align: 'right' }, { label: 'Total', width: 96, align: 'right' }],
          scenarios.map((s: any) => [s.label, s.effectiveRate ? `${c2(s.effectiveRate)}/km` : '—', c2(s.subtotal), c2(s.tax - s.retention), c2(s.total)]),
        );
        doc.moveDown(0.3).font('Helvetica').fontSize(8).fillColor('#6B7280').text('Cada alternativa incluye el flete y los cargos facturables indicados. Elija una para confirmar el servicio.', 48);
      } else {
        const s = scenarios[0];
        tableRows(doc, [{ label: 'Concepto', width: 380 }, { label: 'Importe', width: 136, align: 'right' }], s.clientLines.map((l: any) => [l.name + (l.taxable ? '' : ' (no gravable)'), c2(l.amount)]));
        totalsBlock(doc, [
          ['Subtotal', c2(s.subtotal)],
          [`IVA (${i.pricing.taxPct}%)`, c2(s.tax)],
          ...(s.retention ? [[`Retención IVA (${i.pricing.retentionPct}%)`, `−${c2(s.retention)}`] as [string, string]] : []),
          ['Total', c2(s.total), true],
        ]);
      }
      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Condiciones', 48);
      doc.font('Helvetica').fontSize(8.5).fillColor('#374151').text(q.terms || ctx.cfg.terms, { width: 516 });
      if (q.notes) doc.moveDown(0.4).text(`Observaciones: ${q.notes}`, { width: 516 });
      if (i.cargo.notes) doc.text(`Notas de la carga: ${i.cargo.notes}`, { width: 516 });
      const contact = [company.phone, company.email, company.website].filter(Boolean).join(' · ');
      if (contact) doc.moveDown(0.5).fillColor('#6B7280').text(`Contacto: ${contact}`, { width: 516 });

      if (internal) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#B91C1C').text('USO INTERNO — NO ENVIAR AL CLIENTE', 48, 48);
        doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text(`Motor ${snap.engine} · ${snap.computedAt}`);
        doc.moveDown();
        tableRows(
          doc,
          [{ label: 'Alternativa', width: 110 }, { label: 'Ingreso', width: 80, align: 'right' }, { label: 'Costo', width: 80, align: 'right' }, { label: 'Excedente', width: 80, align: 'right' }, { label: 'Margen', width: 56, align: 'right' }, { label: 'Markup', width: 56, align: 'right' }, { label: 'Operador', width: 54, align: 'right' }],
          scenarios.map((s: any) => [s.label, c2(s.subtotal), c2(s.costs.total), c2(s.surplus), `${num(s.marginPct, 1)}%`, `${num(s.markupPct, 1)}%`, c2(s.costs.operator)]),
        );
        const s = scenarios[0];
        doc.moveDown();
        tableRows(
          doc,
          [{ label: `Costos (${s.label})`, width: 380 }, { label: 'Importe', width: 136, align: 'right' }],
          [
            ['Combustible', s.costs.fuel], ['Casetas', s.costs.tolls], ['Operador', s.costs.operator],
            ...s.costs.perKm.map((x: any) => [x.name, x.amount]), ...s.costs.fixed.map((x: any) => [x.name, x.amount]),
            ['Comisiones', s.costs.commission], ['Imprevistos', s.costs.contingency], ['Cargos clasificados como costo', s.costs.costCharges], ['Costo total', s.costs.total],
          ].map(([l, v]: any) => [l, c2(v)]),
        );
      }
    },
    { title: q.folio },
  );
  const suffix = comparative ? '-alternativas' : scenarioIds?.length ? `-${scenarios[0].id}` : '';
  return { buffer, fileName: `${q.folio}${suffix}${internal ? '-interno' : ''}.pdf`, mime: 'application/pdf', templateId: null };
}
