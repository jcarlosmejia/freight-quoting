// Comprueba que el código propio no depende de dominios de Fletcot ni de sus proveedores configurados.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const files = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)])) : [];

describe('independencia del proveedor original', () => {
  const sources = ['server', 'shared', 'web', 'dist'].flatMap((d) => files(join(ROOT, d))).filter((f) => /\.(ts|vue|js|html|css|sql)$/.test(f));
  it('no hay referencias a dominios ni claves de Fletcot o de sus servicios', () => {
    const banned = /fletcot\.com|api\.fletcot|b-cdn\.net|mapbox\.com|api\.geoapify|pk\.ey/i;
    const hits = sources.filter((f) => banned.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('las únicas URL externas del servidor son proveedores opcionales con credenciales propias', () => {
    const urls = new Set(files(join(ROOT, 'server')).flatMap((f) => readFileSync(f, 'utf8').match(/https?:\/\/[a-z0-9.-]+/gi) ?? []));
    expect([...urls].filter((u) => !/demo\.test|openxmlformats\.org|openrouteservice\.org|wa\.me/.test(u))).toEqual([]);
  });
});
