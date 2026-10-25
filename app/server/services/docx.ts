// Plantillas Word propias con marcadores ${variable}. Las filas que contienen ${item_*}
// se repiten por partida (equivalente a "cloneRow" descrito en la interfaz de Fletcot).
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Envuelve en ${#items}…${/items} cada fila de tabla que use marcadores de partida. */
export function expandItemRows(xml: string, loopVar = 'items', marker = '${item_'): string {
  return xml.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (row) => {
    const text = row.replace(/<[^>]+>/g, '');
    if (!text.includes(marker) || text.includes(`\${#${loopVar}}`)) return row;
    const m = /<w:p(?=[ >])[^>]*>(\s*<w:pPr>[\s\S]*?<\/w:pPr>)?/.exec(row);
    const lastPClose = row.lastIndexOf('</w:p>');
    if (!m || lastPClose < 0) return row;
    const openEnd = m.index + m[0].length;
    const open = `<w:r><w:t>\${#${loopVar}}</w:t></w:r>`;
    const close = `<w:r><w:t>\${/${loopVar}}</w:t></w:r>`;
    return row.slice(0, openEnd) + open + row.slice(openEnd, lastPClose) + close + row.slice(lastPClose);
  });
}

/**
 * Sustituye la imagen cuyo texto alternativo o título sea ${empresa_logo} por el logo de la empresa.
 * Se reemplaza el archivo de medios referenciado; Word conserva tamaño y posición de la imagen de la plantilla.
 */
export function replaceLogo(zip: PizZip, logo: { buffer: Buffer; ext: 'png' | 'jpeg' }) {
  const docXml = zip.file('word/document.xml')?.asText();
  const rels = zip.file('word/_rels/document.xml.rels')?.asText();
  if (!docXml || !rels) return false;
  const drawing = [...docXml.matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g)].map((m) => m[0]).find((d) => /<wp:docPr[^>]*(descr|title|name)="\$\{empresa_logo\}"/.test(d));
  const rid = drawing && /r:embed="([^"]+)"/.exec(drawing)?.[1];
  const target = rid && new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
  if (!target) return false;
  const path = `word/${target.replace(/^\.?\//, '')}`;
  const newPath = path.replace(/\.[a-z]+$/i, logo.ext === 'png' ? '.png' : '.jpeg');
  zip.remove(path);
  zip.file(newPath, logo.buffer);
  zip.file('word/_rels/document.xml.rels', rels.replace(`Target="${target}"`, `Target="${newPath.slice(5)}"`));
  const ct = zip.file('[Content_Types].xml')!.asText();
  const ext = logo.ext === 'png' ? 'png' : 'jpeg';
  if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) zip.file('[Content_Types].xml', ct.replace('</Types>', `<Default Extension="${ext}" ContentType="image/${ext}"/></Types>`));
  return true;
}

export function renderDocx(template: Buffer, data: Record<string, unknown>, logo?: { buffer: Buffer; ext: 'png' | 'jpeg' } | null): Buffer {
  const zip = new PizZip(template);
  if (logo) replaceLogo(zip, logo);
  for (const name of Object.keys(zip.files)) {
    if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) zip.file(name, expandItemRows(zip.file(name)!.asText()));
  }
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '${', end: '}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Lista los marcadores usados en una plantilla (para validar archivos subidos). */
export function templateTags(template: Buffer): string[] {
  const zip = new PizZip(template);
  const xml = zip.file('word/document.xml')?.asText();
  if (!xml) throw new Error('El archivo no es un documento Word (.docx) válido.');
  const text = xml.replace(/<[^>]+>/g, '');
  return [...new Set([...text.matchAll(/\$\{([#/]?[a-z_]+)\}/g)].map((m) => m[1]))];
}

// ---- Plantilla predeterminada (diseño propio) ----
const p = (text: string, opts: { bold?: boolean; size?: number; align?: string } = {}) =>
  `<w:p>${opts.align ? `<w:pPr><w:jc w:val="${opts.align}"/></w:pPr>` : ''}<w:r><w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.size ? `<w:sz w:val="${opts.size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
const cell = (text: string, width: number, opts: { bold?: boolean; align?: string; shade?: boolean } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${opts.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="1F2937"/>' : ''}</w:tcPr><w:p>${opts.align ? `<w:pPr><w:jc w:val="${opts.align}"/></w:pPr>` : ''}<w:r><w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.shade ? '<w:color w:val="FFFFFF"/>' : ''}<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`;
const row = (cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`;
const table = (rows: string[], widths: number[]) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;

function buildDocx(body: string): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function defaultQuoteTemplate(): Buffer {
  const w = [700, 5000, 1100, 1600, 1680];
  return buildDocx(
    [
      p('${empresa_nombre}', { bold: true, size: 32 }),
      p('${empresa_legal_name} · RFC ${empresa_rfc}'),
      p('${empresa_direccion}'),
      p('${empresa_telefono} · ${empresa_email} · ${empresa_website}'),
      p(''),
      p('COTIZACIÓN ${cotizacion_numero}', { bold: true, size: 28 }),
      p('Fecha: ${cotizacion_fecha}    Vigencia: ${cotizacion_vigencia}'),
      p(''),
      p('Cliente: ${cliente_nombre}', { bold: true }),
      p('RFC: ${cliente_rfc} · Contacto: ${cliente_contacto} · ${cliente_telefono} · ${cliente_email}'),
      p('${cliente_direccion}'),
      p(''),
      table(
        [
          row([cell('#', w[0], { bold: true, shade: true }), cell('Descripción', w[1], { bold: true, shade: true }), cell('Cant.', w[2], { bold: true, shade: true, align: 'right' }), cell('Unitario', w[3], { bold: true, shade: true, align: 'right' }), cell('Importe', w[4], { bold: true, shade: true, align: 'right' })]),
          row([cell('${item_n}', w[0]), cell('${item_descripcion}', w[1]), cell('${item_cantidad}', w[2], { align: 'right' }), cell('${item_unitario}', w[3], { align: 'right' }), cell('${item_importe}', w[4], { align: 'right' })]),
        ],
        w,
      ),
      p(''),
      p('Subtotal: ${subtotal}', { align: 'right' }),
      p('IVA (${iva_pct}): ${iva_monto}', { align: 'right' }),
      p('Total: ${total}', { bold: true, size: 26, align: 'right' }),
      p(''),
      p('Notas: ${notas}'),
    ].join(''),
  );
}

export function defaultPriceListTemplate(): Buffer {
  const w = [3800, 2600, 1100, 1300, 1280];
  return buildDocx(
    [
      p('${empresa_nombre}', { bold: true, size: 32 }),
      p('LISTA DE PRECIOS: ${lista_nombre}', { bold: true, size: 28 }),
      p('Cliente: ${cliente_nombre}    Fecha: ${lista_fecha}'),
      p(''),
      table(
        [
          row([cell('Destino', w[0], { bold: true, shade: true }), cell('Vehículo', w[1], { bold: true, shade: true }), cell('Km', w[2], { bold: true, shade: true, align: 'right' }), cell('Precio s/IVA', w[3], { bold: true, shade: true, align: 'right' }), cell('Precio c/IVA', w[4], { bold: true, shade: true, align: 'right' })]),
          row([cell('${item_destino}', w[0]), cell('${item_vehiculo}', w[1]), cell('${item_km}', w[2], { align: 'right' }), cell('${item_precio}', w[3], { align: 'right' }), cell('${item_precio_iva}', w[4], { align: 'right' })]),
        ],
        w,
      ),
      p(''),
      p('IVA aplicado: ${iva_pct}. Precios calculados con costos vigentes a la fecha de la lista.'),
    ].join(''),
  );
}

/** Texto visible de un .docx (para comprobar contenido en pruebas). */
export function docxText(buf: Buffer): string {
  const xml = new PizZip(buf).file('word/document.xml')!.asText();
  return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
