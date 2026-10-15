#!/usr/bin/env node
/**
 * Sincroniza contracts/bff-schema.graphql con el esquema del BFF (fuente del contrato GraphQL).
 *
 *   npm run schema:sync            descarga el esquema, lo guarda y AVISA si cambió
 *   npm run schema:sync -- --check solo compara: no escribe y termina con código 1 si difiere
 *
 * La fuente es `src/graphql/schema.graphql` del repositorio del BFF en la rama, etiqueta o commit que diga
 * BFF_SCHEMA_REF (por defecto `main`). Mientras el PR del BFF no esté fusionado, `main` no trae el archivo:
 * usa BFF_SCHEMA_REF=feat/r2-bff. BFF_SCHEMA_URL reemplaza la URL completa (otro repositorio o un espejo).
 * Tras un cambio hay que revisar las consultas de src/shared/api/graphql, correr las pruebas y actualizar
 * contracts/PROCEDENCIA.md.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_REF = 'main';
const ref = process.env.BFF_SCHEMA_REF || DEFAULT_REF;
const url =
  process.env.BFF_SCHEMA_URL ||
  `https://raw.githubusercontent.com/chuchobck/bff_vuelos/${encodeURIComponent(ref).replaceAll('%2F', '/')}/src/graphql/schema.graphql`;
const target = fileURLToPath(new URL('../contracts/bff-schema.graphql', import.meta.url));
const checkOnly = process.argv.includes('--check');

const sha = (text) => createHash('sha256').update(text).digest('hex');

const response = await fetch(url);
if (!response.ok) {
  console.error(`No se pudo descargar el esquema (${response.status}) desde ${url}`);
  if (response.status === 404 && !process.env.BFF_SCHEMA_URL) {
    console.error(
      `La referencia "${ref}" del BFF no tiene src/graphql/schema.graphql. Si el PR del BFF aún no se fusionó, usa BFF_SCHEMA_REF=feat/r2-bff.`,
    );
  }
  process.exit(2);
}
const remote = await response.text();
if (!remote.includes('type Query')) {
  console.error(`Lo descargado de ${url} no parece un esquema GraphQL. No se escribió nada.`);
  process.exit(2);
}

let local = '';
try {
  local = await readFile(target, 'utf8');
} catch {
  // Sin copia local: se tratará como cambio.
}

if (local === remote) {
  console.log(`El esquema no cambió (sha256 ${sha(remote)}).`);
  process.exit(0);
}

console.warn('AVISO: el esquema del BFF cambió respecto a contracts/bff-schema.graphql.');
console.warn(`  local  sha256 ${local ? sha(local) : '(no existe)'}`);
console.warn(`  remoto sha256 ${sha(remote)}  (${url})`);

if (checkOnly) {
  console.warn('Corre `npm run schema:sync` para traerlo y luego revisa las consultas y las pruebas.');
  process.exit(1);
}

await writeFile(target, remote);
console.warn('Esquema actualizado. Ahora: revisa src/shared/api/graphql, corre `npm test` y anota el commit y el sha256 en contracts/PROCEDENCIA.md.');
