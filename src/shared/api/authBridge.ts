/**
 * Punto de unión entre la capa de datos y el módulo de sesión (features/auth), sin que `shared`
 * dependa de `features`: la sesión registra aquí cómo obtener el token de acceso vigente, y las
 * implementaciones de FlightsApi lo leen en cada petición con sesión. Las rutas públicas no lo usan.
 */
type TokenProvider = () => string | undefined;

let provider: TokenProvider = () => undefined;

export function setAccessTokenProvider(next: TokenProvider): void {
  provider = next;
}

export function currentAccessToken(): string | undefined {
  return provider();
}
