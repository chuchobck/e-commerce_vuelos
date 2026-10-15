import { Kind, parse, print, type FieldNode, type SelectionSetNode } from 'graphql';
import { describe, expect, it } from 'vitest';
import { FLIGHT_STATUS_OPERATION, FLIGHT_STATUS_QUERY } from './flightStatus';
import { SEARCH_FLIGHTS_OPERATION, SEARCH_FLIGHTS_QUERY } from './searchFlights';
import { SEAT_MAP_OPERATION, SEAT_MAP_QUERY } from './seatMap';
import { operationOf, validateQuery } from './__testing__/bffSimulator';

const QUERIES = [
  { name: SEARCH_FLIGHTS_OPERATION, query: SEARCH_FLIGHTS_QUERY, variables: { input: 'SearchInput!' } },
  { name: SEAT_MAP_OPERATION, query: SEAT_MAP_QUERY, variables: { offerId: 'ID!', segmentId: 'ID!' } },
  { name: FLIGHT_STATUS_OPERATION, query: FLIGHT_STATUS_QUERY, variables: { flightNumber: 'String!', date: 'Date!' } },
];

/** Profundidad como la cuenta el BFF: los campos hoja no cuentan; máximo 8 niveles. */
function depth(selection: SelectionSetNode): number {
  let max = 0;
  for (const sel of selection.selections) {
    const field = sel as FieldNode;
    if (field.selectionSet) max = Math.max(max, 1 + depth(field.selectionSet));
  }
  return max;
}

function fieldPaths(selection: SelectionSetNode, prefix = ''): string[] {
  return selection.selections.flatMap((sel) => {
    const field = sel as FieldNode;
    const path = `${prefix}${field.name.value}`;
    return field.selectionSet ? fieldPaths(field.selectionSet, `${path}.`) : [path];
  });
}

describe.each(QUERIES)('consulta $name contra contracts/bff-schema.graphql', ({ name, query, variables }) => {
  it('es válida según el esquema del BFF (graphql-js)', () => {
    expect(validateQuery(query).map((e) => e.message)).toEqual([]);
  });

  it('se llama como su constante y es una sola operación de lectura', () => {
    const definitions = parse(query).definitions;
    expect(definitions).toHaveLength(1);
    const op = operationOf(query);
    expect(op.operation).toBe('query');
    expect(op.name?.value).toBe(name);
  });

  it('solo usa variables tipadas, con los tipos del esquema: ningún valor interpolado', () => {
    const op = operationOf(query);
    const declared = Object.fromEntries((op.variableDefinitions ?? []).map((v) => [v.variable.name.value, print(v.type)]));
    expect(declared).toEqual(variables);
    const literals: string[] = [];
    const walk = (node: SelectionSetNode) => {
      for (const sel of node.selections) {
        const field = sel as FieldNode;
        for (const arg of field.arguments ?? []) if (arg.value.kind !== Kind.VARIABLE) literals.push(`${field.name.value}.${arg.name.value}`);
        if (field.selectionSet) walk(field.selectionSet);
      }
    };
    walk(op.selectionSet);
    expect(literals).toEqual([]);
  });

  it('no pasa de 8 niveles (QUERY_TOO_DEEP)', () => {
    expect(depth(operationOf(query).selectionSet)).toBeLessThanOrEqual(8);
  });
});

describe('qué pide cada consulta', () => {
  it('la búsqueda NO pide FlightSegment.seatMap (el mapa se pide aparte, al abrirlo)', () => {
    const paths = fieldPaths(operationOf(SEARCH_FLIGHTS_QUERY).selectionSet);
    expect(paths.filter((p) => /seatMap/i.test(p))).toEqual([]);
    expect(SEARCH_FLIGHTS_QUERY).not.toMatch(/seatMap/);
  });

  it('la búsqueda no pide lo que el mapeo no usa (estado del segmento, terminales, desglose de impuestos)', () => {
    const paths = fieldPaths(operationOf(SEARCH_FLIGHTS_QUERY).selectionSet);
    expect(paths.some((p) => /\.status$|terminal|baseFare|taxes/.test(p))).toBe(false);
  });

  it('la consulta del mapa de asientos pide el mapa del segmento, sin la búsqueda', () => {
    const op = operationOf(SEAT_MAP_QUERY);
    expect((op.selectionSet.selections[0] as FieldNode).name.value).toBe('seatMap');
    expect(SEAT_MAP_QUERY).not.toMatch(/searchFlights/);
  });

  it('el control: una consulta con un campo que el esquema no tiene SÍ falla la validación', () => {
    const roto = SEAT_MAP_QUERY.replace('isAvailable', 'isFree');
    expect(validateQuery(roto).map((e) => e.message).join()).toMatch(/isFree/);
  });
});
