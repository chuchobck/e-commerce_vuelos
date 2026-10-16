# Cambios

Formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Antes del Reto 2 el historial por fases está en la
sección 1 del `README.md`; este archivo empieza con el Reto 2.

## [Sin publicar]

### Añadido (Reto 2, fase 6c: la cuenta en identity detrás del gateway)

- `VITE_IDENTITY_URL`: base de identity, donde van `register`, `login`, `refresh`, `logout` y `me` (`{base}/auth/*`). Vacía, se deriva de
  `VITE_API_URL` cambiando el sufijo `/flights/v1` por `/identity/v1` (`identityUrlFor`, `src/shared/api/urls.ts`); si la API no termina en
  `/flights/v1`, la cuenta queda en la API (login propio del core). Con la API vacía (mock) se ignora: la cuenta también es del mock.
- `RequestOptions.base` en el cliente HTTP: una base distinta por llamada con la misma lógica de errores, reintentos y Bearer; la clave de
  deduplicación la incluye.
- `contracts/identity-openapi.json` (copia exacta del contrato de identity; origen y SHA-256 en `contracts/PROCEDENCIA.md`) y
  `generated/identity.ts` con el mismo `npm run api:types`.
- Pruebas: derivación de la URL, rutas de cada servicio (la cuenta a identity; compra y postventa al core con su Bearer e
  `Idempotency-Key`), contrato de identity, un 401 de una ruta del core con token de identity (una sola renovación y un reintento, sin bucle) y que
  ningún token ni contraseña llegue a la consola.
- `npm run test:api` corre por el gateway: la cuenta en identity (`API_TEST_IDENTITY_URL`), una suite nueva de las lecturas por GraphQL
  (`API_TEST_GRAPHQL_URL`) y un caso del 401 de una ruta del core.
- `.env.example`, README (sección «Qué ruta va a qué servicio»), `CLAUDE.md` y `docs/GRAPHQL-CLIENTE.md` al día.

### Cambiado

- La cuenta ya no va a `{VITE_API_URL}/auth/*`: va a `{identity}/auth/*`. Compra, postventa, check-in, equipaje y el respaldo REST de las
  lecturas siguen en `VITE_API_URL`; las lecturas por GraphQL, en `VITE_GRAPHQL_URL`. Las pantallas, el estado de sesión y el mock no cambian.
- El calentamiento (`warmUp`) despierta también identity.
- Los tipos de la cuenta salen del contrato de identity (misma forma que tenían en el core: el mapeo no cambió).

### Eliminado

- `contracts/backend-openapi.json` y `src/shared/api/generated/backend.ts` (el contrato del login propio del core), sin uso.

## Reto 2, semana 7 (PR #5): lecturas públicas por GraphQL

### Añadido

- `VITE_GRAPHQL_URL`: búsqueda, mapa de asientos y estado de vuelo por GraphQL a través del BFF; cuenta, compra y postventa siguen por REST.
  Con solo `VITE_API_URL` todo va por REST (el respaldo); con la API vacía, mock completo.
- Cliente GraphQL propio (`http/graphqlClient.ts`, un `POST` con `fetch`, sin librerías), consultas como constantes, mapeo a los mismos DTO
  de REST y mapeo de `extensions.code` a `ApiError`.
- `contracts/bff-schema.graphql` (copia exacta del esquema del BFF, desde `main`), `npm run schema:sync` / `schema:check` y `BFF_SCHEMA_REF`.
- Pruebas de contrato de las consultas (graphql-js), de paridad REST↔GraphQL, del cliente, de errores y de los modos.
- `docs/GRAPHQL-CLIENTE.md`.

### Corregido

- `TripDateChangePage`: la fecha sugerida ya está en el primer render (antes se ponía en un efecto y la prueba fallaba de vez en cuando).
