#!/usr/bin/env node
/**
 * Sincroniza contracts/bff-schema.graphql con el esquema del BFF (fuente del contrato GraphQL).
 *
 *   npm run schema:sync            descarga el esquema, lo guarda y AVISA si cambió
 *   npm run schema:sync -- --check solo compara: no escribe y termina con código 1 si difiere
 *
 * La fuente se puede cambiar con BFF_SCHEMA_URL (por ejemplo, otra rama). Tras un cambio hay que
 * revisar las consultas de src/shared/api/graphql, correr las pruebas y actualizar contracts/PROCEDENCIA.md.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'https://raw.githubusercontent.com/chuchobck/bff_vuelos/feat/r2-bff/src/graphql/schema.graphql';
const url = process.env.BFF_SCHEMA_URL || DEFAULT_URL;
const target = fileURLToPath(new URL('../contracts/bff-schema.graphql', import.meta.url));
const checkOnly = process.argv.includes('--check');

const sha = (text) => createHash('sha256').update(text).digest('hex');

const response = await fetch(url);
if (!response.ok) {
  console.error(`No se pudo descargar el esquema (${response.status}) desde ${url}`);
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
