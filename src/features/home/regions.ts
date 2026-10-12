import { AIRPORTS, type RegionId } from '@/shared/api';
import { es } from '@/shared/i18n';

const ORDER: RegionId[] = ['galapagos', 'costa', 'andes', 'amazonia'];

/**
 * Las cuatro regiones de Ecuador, de oeste a este (el mismo orden que la panorámica del inicio),
 * con los aeropuertos del catálogo (solo los que la API puede buscar).
 */
export const REGIONS = ORDER.map((id) => ({ id, airports: AIRPORTS.filter((a) => a.region === id).map((a) => a.code) }));

export function regionOf(code: string): RegionId | undefined {
  return AIRPORTS.find((a) => a.code === code)?.region;
}

/** Fondo de acento por región (clases fijas para que Tailwind las genere). */
export const REGION_BG: Record<RegionId, string> = {
  galapagos: 'bg-region-galapagos',
  costa: 'bg-region-costa',
  andes: 'bg-region-andes',
  amazonia: 'bg-region-amazonia',
};

/** Nombre visible de un destino en el inicio (textos de i18n; el código si no hay texto). */
export function cityLabel(code: string): string {
  return (es.home.cities as Record<string, string>)[code] ?? code;
}
