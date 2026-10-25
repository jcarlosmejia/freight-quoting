#!/usr/bin/env node
// Desofusca los chunks públicos capturados con webcrack instalado FUERA del repositorio.
// Uso: node scripts/deobfuscate_public.mjs <carpeta-con-node_modules/webcrack>
// No ejecuta la aplicación: webcrack sólo evalúa el decodificador de cadenas en un aislamiento V8.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const tools = process.argv[2];
if (!tools) throw new Error('Indica la carpeta donde se instaló webcrack.');
const { webcrack } = await import(createRequire(join(resolve(tools), 'x.js')).resolve('webcrack'));
const root = resolve(import.meta.dirname, '..');
const assets = join(root, 'evidence/raw/app.fletcot.com/assets');
const out = join(root, 'evidence/deobfuscated');
mkdirSync(out, { recursive: true });
for (const stem of ['useQuoteCalculation-CmDae2MV', 'useRentalCalculation-DBYKgVCg', 'useFrozenRecalc-DAdud4PD', 'PriceListPage-BS0hukqg']) {
  const r = await webcrack(readFileSync(join(assets, `${stem}.js`), 'utf8'), { deobfuscate: true, unminify: true, mangle: false, jsx: false, unpack: false });
  writeFileSync(join(out, `${stem}.deob.js`), r.code);
  console.log(stem, r.code.length);
}
