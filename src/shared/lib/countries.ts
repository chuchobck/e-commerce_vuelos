/**
 * Países para la nacionalidad del pasajero (ISO 3166-1 alfa-2, como pide la API). Los nombres salen
 * del navegador en español (Intl.DisplayNames): no se mantiene una tabla de nombres a mano.
 * Ecuador va primero; el resto, en orden alfabético.
 */
const CODES =
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');

export interface Country {
  code: string;
  name: string;
}

export const HOME_COUNTRY = 'EC';

/**
 * Nacionalidades que la API acepta hoy: su tabla `pais` solo trae Ecuador (db/semilla_vuelos.sql del
 * backend); cualquier otro código da 422 "is not a country this API knows". Es un catálogo ESTÁTICO,
 * como los aeropuertos: si el backend carga más países, se agregan aquí (y el mock los acepta).
 */
export const BOOKABLE_COUNTRIES: readonly string[] = ['EC'];

export function isBookableCountry(code: string): boolean {
  return BOOKABLE_COUNTRIES.includes(code);
}

let cached: Country[] | null = null;

/** Lista de países ordenada (Ecuador primero), con el nombre en español. */
export function countries(): Country[] {
  if (cached) return cached;
  const names = new Intl.DisplayNames(['es'], { type: 'region' });
  const list = CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const home = list.findIndex((c) => c.code === HOME_COUNTRY);
  cached = [list[home], ...list.slice(0, home), ...list.slice(home + 1)];
  return cached;
}

export function isCountryCode(value: string): boolean {
  return CODES.includes(value);
}
