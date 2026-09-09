// Assembles the two Office Scripts from logic.ts plus their Excel glue.
//
// Office Scripts accept neither import nor export, so the shared file is
// inlined below each glue with its `export` keywords removed. Output, per
// script: dist/<name>.osts (the file Excel reads from OneDrive's "Scripts
// Office" folder) and dist/<name>.ts (the same body, to paste into the script
// editor when preferred). CI rebuilds and fails on any difference.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const logic = readFileSync(join(here, 'logic.ts'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/^export (?=(const|function|type|interface)\b)/gm, '');

const SCRIPTS = [
  {
    name: 'CRA - Importer VSA Ext',
    glue: 'main-import.ts',
    description: "Importe dans cet onglet le bloc copié depuis l'extension VSA Ext (cellule I23).",
  },
  {
    name: 'CRA - Initialiser import VSA Ext',
    glue: 'main-init.ts',
    description: 'Ajoute la colonne Source et la cellule de collage I23 sur chaque onglet de saisie. À exécuter une fois.',
  },
];

mkdirSync(join(here, 'dist'), { recursive: true });
for (const s of SCRIPTS) {
  const glue = readFileSync(join(here, s.glue), 'utf8').replace(/\r\n/g, '\n');
  const body =
    `${glue.trimEnd()}\n\n` +
    `// ---- Shared logic, generated from logic.ts by build.mjs: edit there, not here ----\n\n` +
    `${logic.trimEnd()}\n`;
  const osts = {
    version: '0.3.0',
    body,
    description: s.description,
    parameterInfo: JSON.stringify({ parameterSchema: { type: 'object', properties: {} }, returnSchema: {} }),
    apiInfo: JSON.stringify({ apiName: 'ExcelApi', apiVersion: '1.1' }),
  };
  writeFileSync(join(here, 'dist', `${s.name}.osts`), JSON.stringify(osts, null, 2) + '\n');
  writeFileSync(join(here, 'dist', `${s.name}.ts`), body);
  console.log(`  built dist/${s.name}.osts (${body.length} chars)`);
}
