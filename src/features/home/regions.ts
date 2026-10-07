/** Las cuatro regiones de Ecuador, de oeste a este (el mismo orden que la panorámica del inicio). */
export const REGIONS = [
  { id: 'galapagos', airports: ['GPS', 'SCY'] },
  { id: 'costa', airports: ['GYE', 'MEC', 'ESM'] },
  { id: 'andes', airports: ['UIO', 'CUE', 'LOH', 'LTX'] },
  { id: 'amazonia', airports: ['OCC', 'LGQ', 'XMS'] },
] as const;

export type RegionId = (typeof REGIONS)[number]['id'];

export function regionOf(code: string): RegionId | undefined {
  return REGIONS.find((r) => (r.airports as readonly string[]).includes(code))?.id;
}

/** Ciudades de salida para "Escápate este fin de semana" y sus escapadas sugeridas. */
export const ESCAPES: Record<'UIO' | 'GYE' | 'CUE', string[]> = {
  UIO: ['GPS', 'CUE', 'MEC', 'OCC'],
  GYE: ['GPS', 'SCY', 'UIO', 'LOH'],
  CUE: ['GYE', 'UIO', 'GPS', 'MEC'],
};

export type EscapeOrigin = keyof typeof ESCAPES;

/** Fondo de acento por región (clases fijas para que Tailwind las genere). */
export const REGION_BG: Record<RegionId, string> = {
  galapagos: 'bg-region-galapagos',
  costa: 'bg-region-costa',
  andes: 'bg-region-andes',
  amazonia: 'bg-region-amazonia',
};
