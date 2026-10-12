/**
 * Única fuente de las rutas de la aplicación (README, sección 4).
 * Ningún componente escribe una ruta como texto: usa `paths` (patrones del router)
 * o `routes` (enlaces ya armados).
 *
 * Este archivo no importa nada a propósito: es la única pieza de `app/` que `features`
 * puede usar (ver eslint.config.js).
 */

/** Ancla del buscador en el inicio (atajo Alt + B y enlaces "Buscar vuelos"). */
export const SEARCH_ANCHOR_ID = 'buscador';

/** Parámetro de la URL que guarda a dónde volver después de ingresar o registrarse. */
export const RETURN_TO_PARAM = 'volver';

/** Prefijo de la compra en 3 pasos (/compra/datos, /compra/pago…). */
export const CHECKOUT_BASE = '/compra';

export const paths = {
  home: '/',
  results: '/resultados',
  offers: '/ofertas',
  checkoutDetails: `${CHECKOUT_BASE}/datos`,
  checkoutPayment: `${CHECKOUT_BASE}/pago`,
  checkoutConfirmation: `${CHECKOUT_BASE}/confirmacion/:id`,
  trips: '/viajes',
  trip: '/viajes/:id',
  tripTickets: '/viajes/:id/boletos',
  tripCheckIn: '/viajes/:id/check-in',
  tripPasses: '/viajes/:id/pases',
  tripBaggage: '/viajes/:id/equipaje',
  tripDateChange: '/viajes/:id/cambiar-fecha',
  tripCancel: '/viajes/:id/cancelar',
  flightStatus: '/estado-vuelo',
  login: '/ingresar',
  register: '/registrarse',
  profile: '/perfil',
  help: '/ayuda',
  uiKit: '/componentes',
  uiKitSeats: '/componentes/asientos',
} as const;

/** Secciones de la página de ayuda enlazables con #ancla. */
export type HelpSection = 'preguntas' | 'equipaje' | 'terminos' | 'privacidad' | 'accesibilidad';

/** Rellena el parámetro :id de un patrón. */
const withId = (pattern: string, id: string) => pattern.replace(':id', encodeURIComponent(id));
const trip = (id: string) => withId(paths.trip, id);

function withReturnTo(path: string, returnTo?: string) {
  return returnTo ? `${path}?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}` : path;
}

export const routes = {
  home: () => paths.home,
  /** Inicio con el foco en el buscador; `query` precarga campos (p. ej. "destino=GPS"). */
  search: (query?: string) => `${paths.home}${query ? `?${query}` : ''}#${SEARCH_ANCHOR_ID}`,
  results: (query: string) => `${paths.results}?${query}`,
  offers: () => paths.offers,
  checkoutDetails: () => paths.checkoutDetails,
  checkoutPayment: () => paths.checkoutPayment,
  checkoutConfirmation: (bookingId: string) => withId(paths.checkoutConfirmation, bookingId),
  trips: () => paths.trips,
  trip,
  tripTickets: (id: string) => withId(paths.tripTickets, id),
  tripCheckIn: (id: string) => withId(paths.tripCheckIn, id),
  tripPasses: (id: string) => withId(paths.tripPasses, id),
  tripBaggage: (id: string) => withId(paths.tripBaggage, id),
  tripDateChange: (id: string) => withId(paths.tripDateChange, id),
  tripCancel: (id: string) => withId(paths.tripCancel, id),
  flightStatus: () => paths.flightStatus,
  login: (returnTo?: string) => withReturnTo(paths.login, returnTo),
  register: (returnTo?: string) => withReturnTo(paths.register, returnTo),
  profile: () => paths.profile,
  help: (section?: HelpSection) => `${paths.help}${section ? `#${section}` : ''}`,
} as const;

/** Rutas viejas que redirigen a las nuevas para que ningún enlace guardado se rompa. */
export const legacyRedirects: { from: string; to: (params: { id?: string }) => string }[] = [
  { from: '/mis-reservas', to: () => routes.trips() },
  // Mis viajes se llamaba /mis-viajes hasta F5 (desde F6 es /viajes).
  { from: '/mis-viajes', to: () => routes.trips() },
  { from: '/mis-viajes/:id', to: ({ id = '' }) => routes.trip(id) },
  { from: '/mis-viajes/:id/check-in', to: ({ id = '' }) => routes.tripCheckIn(id) },
  { from: '/mis-viajes/:id/pases', to: ({ id = '' }) => routes.tripPasses(id) },
  { from: '/mis-viajes/:id/equipaje', to: ({ id = '' }) => routes.tripBaggage(id) },
  { from: '/mis-viajes/:id/cambiar-fecha', to: ({ id = '' }) => routes.tripDateChange(id) },
  { from: '/mis-viajes/:id/cancelar', to: ({ id = '' }) => routes.tripCancel(id) },
  { from: '/reserva/:id', to: ({ id = '' }) => routes.trip(id) },
  // El check-in ya no es público: vive dentro de cada viaje.
  { from: '/check-in', to: () => routes.trips() },
  { from: CHECKOUT_BASE, to: () => routes.checkoutDetails() },
];

/**
 * Valida el destino de `?volver=`: solo rutas internas de la aplicación.
 * Evita redirecciones abiertas a otros sitios (`//evil.com`, `https://…`).
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (value.startsWith(paths.login) || value.startsWith(paths.register)) return null;
  return value;
}
