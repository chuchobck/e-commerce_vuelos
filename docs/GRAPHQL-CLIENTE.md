# Cliente GraphQL (Reto 2, semana 7)

Desde el Reto 2 el marketplace puede pedir las **tres lecturas públicas** —búsqueda de vuelos, mapa de
asientos y estado de vuelo— al BFF (`bff_vuelos`) por GraphQL, sin cambiar nada de lo demás. Este
documento explica los modos, qué va por dónde, en qué se diferencian las respuestas, cómo se tratan los
errores y cómo verificarlo.

## 1. Modos

| `VITE_API_URL` | `VITE_GRAPHQL_URL` | Modo | Implementación |
|---|---|---|---|
| vacía | (se ignora) | Mock completo | `MockFlightsApi` |
| con valor | vacía | Todo por REST al core. **Es el respaldo**: igual que antes del Reto 2 | `RealFlightsApi` |
| con valor | con valor (`http://localhost:4000/graphql`) | Las 3 lecturas por GraphQL; el resto por REST | `GraphqlFlightsApi` |

- El mock y lo real nunca se mezclan: con la API vacía, `VITE_GRAPHQL_URL` no tiene efecto
  (`apiConfig.graphqlUrl` queda vacía). Lo decide `apiModeFor` en `src/shared/api/select.ts`.
- `GraphqlFlightsApi` **extiende** `RealFlightsApi` y solo reemplaza `search`, `getSeatMap` y
  `getFlightStatus`. Todo lo demás es el código REST de siempre, sin tocar.
- El BFF debe tener `CORS_ORIGINS=http://localhost:5173` (permite `content-type`, `x-request-id` y
  `x-device-fingerprint`, y expone `x-request-id` y `retry-after`).

## 2. Qué se queda en REST y por qué

Cuenta (`/auth/*`), compra (hold, reserva, pago) y postventa (check-in, equipaje, cambio de fecha,
cancelación, boletos, pases) siguen **directo al core por REST**, con `Authorization: Bearer` e
`Idempotency-Key`. Razones (las mismas del BFF, `docs/GRAPHQL.md`): son escrituras con efectos (cupo,
dinero, boletos) que dependen de `Idempotency-Key` y de un token con alcances; el HTTP significa algo
(`201`, `202` pendiente, `409`, `422` pago rechazado) y GraphQL lo esconde bajo un `200` con `errors`; y
reintentar una escritura con seguridad es más difícil que repetir un `POST` idempotente. Por eso el BFF
solo expone lecturas públicas y el cliente **nunca** manda `Authorization` a `/graphql`.

## 3. Diferencias REST ↔ GraphQL (y qué hace el cliente)

1. **`null` frente a ausente.** REST omite `layoverMinutes`, `baseFare`, `taxes`, `extraCheckedBaggagePrice`; GraphQL siempre trae la
   clave, con `null`. El mapeo borra la clave si es `null` donde el contrato REST la omite. Donde el contrato REST admite `null`
   (`aircraft`, `durationMinutes`, `terminal`, `estimatedAt`, `actualAt`) se conserva.
2. **Dinero.** Es texto decimal en los dos (`"420.42"`, `"40.00"`) y `MoneyAmount` tiene la misma forma. Va tal cual a `parseMoney`:
   centavos enteros, nunca flotantes.
3. **Enums.** Los mismos valores y sin prefijo. Un valor que el BFF no reconoce llega como `null` donde el contrato lo permite y como
   error donde no; el cliente no inventa valores.
4. **Fechas.** `Date` es `YYYY-MM-DD` y `DateTime` es UTC con `Z`, igual que REST. La conversión a hora local del aeropuerto sigue en
   `toAirportLocalIso` (`mapping.ts`).
5. **Entrada de la búsqueda.** `SearchInput` tiene la forma del cuerpo de `POST /search`: se reutiliza `toSearchRequest` como variable
   `$input`.
6. **Mapa de asientos.** REST: `GET /offers/{id}/seatmap?segmentId=` con todos los campos opcionales. GraphQL: `seatMap(offerId, segmentId)`
   con campos no nulos. No se pide `FlightSegment.seatMap` en la búsqueda: el mapa se pide aparte, solo cuando el usuario abre el selector.
7. **Estado de vuelo.** `flightStatus(flightNumber, date: Date!)` → `FlightStatusDetail`, con los campos del DTO REST.
8. **Errores.** REST usa el estado HTTP y un ProblemDetails; GraphQL responde `200` con `errors[]` y `extensions` (`code`, `problemCode`,
   `status`, `requestId`, `retryAfter`, `invalidParams`). Excepciones: el `429` del BFF lleva estado HTTP y `Retry-After`.
9. **Cabeceras.** Solo `Content-Type`, `X-Request-Id` (uuid por petición) y, **solo en la búsqueda**, `X-Device-Fingerprint` (sin ella:
   `BAD_USER_INPUT`). Ni `Accept` ni `Authorization`.
10. **Límites.** Profundidad máxima 8 (la búsqueda más honda de la app llega a 6), 10 llamadas al core por consulta, 20/60/60 por minuto
    por IP (búsqueda / mapa / estado), sin lotes.

## 4. Errores

`extensions.code` → `ApiError` que la interfaz ya entiende (`src/shared/api/http/graphqlErrors.ts`). No se tocó la interfaz ni
`es.ts`: el mensaje sale de `errorMessage` según el estado y el código, igual que con REST. El `message` de GraphQL **nunca** se muestra
(va a `detail`, solo para la consola de desarrollo); `extensions.requestId` solo va al registro de desarrollo.

| `extensions.code` | `ApiError` | Lo que ve el usuario |
|---|---|---|
| `NOT_FOUND` | 404 (`code` = `problemCode`) | Mensaje de «no encontrado» (en el estado de vuelo: «No encontramos ese vuelo») |
| `BAD_USER_INPUT` | 400, con `invalidParams` como `fieldErrors` | Mensaje de petición inválida (y los de campo de la búsqueda) |
| `TOO_MANY_REQUESTS` | 429 con `retryAfter` (`extensions` o `Retry-After`) | Mensaje de límite de peticiones, con los segundos de espera |
| `SERVICE_UNAVAILABLE` | 503 con `retryAfter` | Mensaje de servicio no disponible (antes, un reintento) |
| `GATEWAY_TIMEOUT` | `TIMEOUT` | Mensaje de tiempo agotado (antes, un reintento) |
| `QUERY_TOO_EXPENSIVE`, `QUERY_TOO_DEEP`, `GRAPHQL_*_FAILED` | 400 (error del cliente) | Mensaje de petición inválida |
| `INTERNAL_SERVER_ERROR` y desconocidos | 500 | Mensaje de error del servidor |
| sin respuesta / red caída | `NETWORK` | Mensaje de sin conexión |
| cancelada por quien la pidió | `ABORTED` | Nada (no se muestra ni se reintenta) |

## 5. El cliente (`src/shared/api/http/graphqlClient.ts`)

Un solo `POST` con `fetch` (sin Apollo, urql ni graphql-request; **cero dependencias de runtime nuevas**). Junto al cliente REST es el
otro único lugar con `fetch`; la regla de ESLint de `src/shared/api/**` no se apagó ni se cambió.

- Máximo 45 s, `AbortSignal`, un reintento de lecturas (red, tiempo agotado o `503`) esperando `retryAfter` con tope de 10 s; `retry: false`
  la envía una sola vez (las ofertas del inicio lo usan).
- `HTTP 200` con `errors` es un error; manda el primero.
- Lecturas idénticas en vuelo y sin señal comparten una sola petición (StrictMode, doble clic), como en REST.
- Marca «servidor despertando» si tarda más de 3 s (`watchSlow`, compartido con el cliente REST).

## 6. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Esquema del BFF (copia exacta) y su origen | `contracts/bff-schema.graphql`, `contracts/PROCEDENCIA.md` |
| Sincronizar y avisar si cambió | `npm run schema:sync` / `npm run schema:check` |
| Consultas (una por archivo, constantes) | `src/shared/api/graphql/{searchFlights,seatMap,flightStatus}.ts` |
| Forma de `data` y mapeo a los DTO de REST | `src/shared/api/graphql/{types,mapping}.ts` |
| Implementación de `FlightsApi` | `src/shared/api/GraphqlFlightsApi.ts` |
| Cliente y errores | `src/shared/api/http/{graphqlClient,graphqlErrors}.ts` |
| Selector de modos | `src/shared/api/{config,select}.ts` |

Las consultas piden **solo los campos que usa el mapeo** (más `totalOffers` y `operatingCarrier`, que el DTO de REST exige) y las variables
son tipadas (`SearchInput!`, `ID!`, `Date!`): nada se interpola en el texto de la consulta.

## 7. Pruebas (Vitest, sin red)

- **Contrato del cliente** (`queries.contract.test.ts`): cada consulta se valida contra `contracts/bff-schema.graphql` con graphql-js
  (devDependency); además, solo variables tipadas, profundidad ≤ 8 y la búsqueda no pide `seatMap`.
- **Paridad** (`GraphqlFlightsApi.test.ts`, la más importante): a partir de las respuestas REST reales de `__fixtures__` se arma la
  respuesta equivalente del BFF y un BFF de prueba **ejecuta la consulta con graphql-js** (solo devuelve lo seleccionado y valida
  enums, variables y nulabilidad). El resultado de dominio por REST y por GraphQL debe ser `toEqual`: búsqueda de ida y vuelta con
  escala, mapa de asientos, estado de vuelo (a tiempo y con retraso).
- **Cliente** (`graphqlClient.test.ts`): cabeceras exactas (huella solo en la búsqueda, nunca `Authorization`), un reintento, `retryAfter`
  con tope, cancelación, `200` con `errors`, `429`, tiempo agotado.
- **Errores** (`graphqlErrors.test.ts`): una prueba por cada `extensions.code`.
- **Modos** (`select.test.ts`): las tres combinaciones eligen la implementación correcta y la lectura de las variables de entorno.
- **Copia del esquema** (`schemaCopy.test.ts`): el SHA-256 de `bff-schema.graphql` es el anotado en `PROCEDENCIA.md`.

Se rompió cada cosa a propósito y la prueba falló (2026-10-15): quitar la huella de la búsqueda, ponerla en el estado de vuelo, cambiar un
enum del esquema, pedir un campo inexistente, dejar de pedir uno que el mapeo usa, pedir `FlightSegment.seatMap` en la búsqueda,
declarar `$date: String!`, convertir el dinero a número, no pasar `null` a ausente, quitar `X-Request-Id`, mandar `Authorization`, quitar el
tope de 10 s, reintentar un 404, ignorar `errors` con HTTP 200, ignorar la cancelación durante la espera, perder el `retryAfter` del 429,
tratar `GATEWAY_TIMEOUT` como 503, y mezclar el mock con GraphQL en los dos puntos del selector.

## 8. Cómo verificarlo contra el BFF real (solo local)

Nunca contra Render ni con usuarios, holds o reservas en Render.

1. Core y base: `docs/VERIFICACION-LOCAL.md` del BFF (core `backend_vuelos` con su PostgreSQL; `CORS_ORIGINS=http://localhost:5173`).
2. BFF (`bff_vuelos`, rama `feat/r2-bff`): `NODE_ENV=development CORE_TRANSPORT=grpc CORE_GRPC_URL=localhost:50051 PORT=4000 CORS_ORIGINS=http://localhost:5173 node dist/main.js`
   (o `CORE_TRANSPORT=rest CORE_REST_URL=http://localhost:3010`).
3. Frontend: `VITE_API_URL=http://localhost:3010/flights/v1 VITE_GRAPHQL_URL=http://localhost:4000/graphql npm run dev`.
4. En la pestaña Red del navegador:
   - Una búsqueda real = **un** `POST /graphql` (`SearchFlights`) con `x-device-fingerprint`. (Al cargar el inicio, las ofertas de F7
     hacen otras búsquedas de fondo, cada una un POST; el clic en «Buscar vuelos» agrega solo una.)
   - Abrir «Elegir asientos» = **un** `POST` (`SeatMap`), sin huella, y solo en ese momento.
   - Estado de vuelo = un `POST` (`FlightStatus`).
   - Sin errores de CORS en la consola.
   - Cuenta, hold y el resto siguen yendo a `:3010` con `Authorization`.
5. Respaldo: repetir sin `VITE_GRAPHQL_URL` → cero peticiones a `:4000`, todo por REST a `:3010`.

### Lo que se verificó (2026-10-15)

- Core real (clon local de `backend_vuelos` en `main`, 3a74b17) con su esquema y semilla oficiales, **sobre PostgreSQL 16** (no 18: no hay Docker en este entorno; el
  esquema declara que corre sin cambios en 16) y BFF `feat/r2-bff` (2bee8a2) con **`CORE_TRANSPORT=rest`** contra ese core (no gRPC: la rama
  gRPC del core no se levantó).
- Navegador (Chromium, `npm run dev`): búsqueda UIO→GYE con 8 ofertas reales; clic en «Buscar vuelos» = 1 `POST /graphql`
  (`SearchFlights`, cabeceras `content-type`, `x-device-fingerprint`, `x-request-id`); el selector de asientos pidió un `SeatMap`
  (`content-type`, `x-request-id`) solo al abrirse y dibujó el mapa; el estado de vuelo pidió un `FlightStatus`; un vuelo inexistente mostró
  «No encontramos ese vuelo» (NOT_FOUND → 404). Login, refresh, `/auth/me`, hold y reservas siguieron por REST con `Authorization`.
  Ningún error de CORS.
- Respaldo (sin `VITE_GRAPHQL_URL`): 0 peticiones al BFF; búsqueda, asientos y estado por REST; mismo mensaje de error.
- Formas reales de error contrastadas con el mapeo: `BAD_USER_INPUT` sin huella, IATA inválido y fecha pasada (con `invalidParams` con los mismos
  nombres de campo que REST), `NOT_FOUND` de oferta vencida, `TOO_MANY_REQUESTS` (`Retry-After: 55` y `extensions.retryAfter`) y
  `SERVICE_UNAVAILABLE` con el core detenido (`retryAfter: 5`).

### Lo que NO se verificó

- El BFF con gRPC y la rama gRPC del core; PostgreSQL 18 con Docker.
- `GATEWAY_TIMEOUT`, `QUERY_TOO_EXPENSIVE` y `QUERY_TOO_DEEP` contra el BFF real (se probaron con las formas documentadas del BFF).
- El BFF desplegado (Render/Azure): no se tocó; Render no admite `localhost` en su CORS.
- Rendimiento comparado REST vs GraphQL: no se midió.
- El `warmUpServer` solo despierta el core (`GET /health`), no el BFF.
