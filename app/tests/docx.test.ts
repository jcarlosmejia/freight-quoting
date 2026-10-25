import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { renderDocx } from '../server/services/docx.ts';

function templateWithImage() {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.gif"/></Relationships>');
  zip.file('word/media/image1.gif', Buffer.from('GIF89a'));
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Imagen 1" descr="${empresa_logo}"/><a:graphic><a:graphicData><a:blip r:embed="rId5"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:p><w:r><w:t>${empresa_nombre}</w:t></w:r></w:p></w:body></w:document>',
  );
  return zip.generate({ type: 'nodebuffer' });
}

describe('logo en plantillas Word', () => {
  it('sustituye la imagen marcada con ${empresa_logo} y registra el tipo de contenido', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const out = new PizZip(renderDocx(templateWithImage(), { empresa_nombre: 'CARMAG TRANSPORTS' }, { buffer: png, ext: 'png' }));
    expect(out.file('word/media/image1.gif')).toBeNull();
    expect(Buffer.from(out.file('word/media/image1.png')!.asUint8Array()).equals(png)).toBe(true);
    expect(out.file('word/_rels/document.xml.rels')!.asText()).toContain('Target="media/image1.png"');
    expect(out.file('[Content_Types].xml')!.asText()).toContain('Extension="png"');
    expect(out.file('word/document.xml')!.asText()).toContain('CARMAG TRANSPORTS');
  });
  it('sin imagen marcada, la plantilla queda igual', () => {
    const out = new PizZip(renderDocx(templateWithImage(), { empresa_nombre: 'X' }, null));
    expect(out.file('word/media/image1.gif')).not.toBeNull();
  });
});
