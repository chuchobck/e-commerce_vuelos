import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../../..');
const schemaText = fs.readFileSync(path.join(root, 'contracts/bff-schema.graphql'), 'utf8');
const provenance = fs.readFileSync(path.join(root, 'contracts/PROCEDENCIA.md'), 'utf8');

describe('copia del esquema del BFF (contracts/bff-schema.graphql)', () => {
  it('no se editó a mano: su SHA-256 es el anotado en PROCEDENCIA.md', () => {
    const sha = createHash('sha256').update(schemaText).digest('hex');
    expect(provenance).toContain(sha);
  });

  it('es un esquema válido con las tres lecturas públicas', () => {
    const schema = buildSchema(schemaText);
    expect(Object.keys(schema.getQueryType()?.getFields() ?? {}).sort()).toEqual(['flightStatus', 'searchFlights', 'seatMap']);
  });
});
