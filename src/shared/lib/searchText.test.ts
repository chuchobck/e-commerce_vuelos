import { describe, expect, it } from 'vitest';
import { normalizeSearch, rankMatches, splitMatch } from './searchText';

const CITIES = [
  { label: 'Quito (UIO)', keywords: ['UIO', 'Mariscal Sucre', 'Andes'] },
  { label: 'Guayaquil (GYE)', keywords: ['GYE', 'Costa'] },
  { label: 'Cuenca (CUE)', keywords: ['CUE', 'Andes'] },
  { label: 'San Cristóbal (SCY)', keywords: ['SCY', 'Galápagos'] },
  { label: 'Baltra (GPS)', keywords: ['GPS', 'Galápagos', 'Santa Cruz'] },
];

describe('búsqueda mientras se escribe', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizeSearch('  CUÉNCA ')).toBe('cuenca');
    expect(rankMatches(CITIES, 'cristobal').map((c) => c.label)).toEqual(['San Cristóbal (SCY)']);
  });

  it('sin texto devuelve todo en su orden', () => {
    expect(rankMatches(CITIES, '')).toHaveLength(5);
  });

  it('lo que empieza con lo escrito va primero; después palabras sueltas, claves y coincidencias internas', () => {
    expect(rankMatches(CITIES, 'c').map((c) => c.label)).toEqual(['Cuenca (CUE)', 'San Cristóbal (SCY)', 'Guayaquil (GYE)', 'Quito (UIO)', 'Baltra (GPS)']);
    expect(rankMatches(CITIES, 'cristo')[0].label).toBe('San Cristóbal (SCY)');
  });

  it('encuentra por código, aeropuerto, región o apodo', () => {
    expect(rankMatches(CITIES, 'uio')[0].label).toBe('Quito (UIO)');
    expect(rankMatches(CITIES, 'mariscal').map((c) => c.label)).toEqual(['Quito (UIO)']);
    expect(rankMatches(CITIES, 'galapagos').map((c) => c.label)).toEqual(['San Cristóbal (SCY)', 'Baltra (GPS)']);
    expect(rankMatches(CITIES, 'santa cruz').map((c) => c.label)).toEqual(['Baltra (GPS)']);
  });

  it('sin coincidencias devuelve vacío', () => {
    expect(rankMatches(CITIES, 'xyz')).toEqual([]);
  });

  it('resalta lo escrito sin perder tildes ni mayúsculas del texto original', () => {
    expect(splitMatch('San Cristóbal (SCY)', 'cristo')).toEqual(['San ', 'Cristó', 'bal (SCY)']);
    expect(splitMatch('Quito (UIO)', 'zz')).toEqual(['Quito (UIO)', '', '']);
    expect(splitMatch('Quito', '')).toEqual(['Quito', '', '']);
  });
});
