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
  `x-device-fingerprint`, y expone `x-request-id` y `retry-after`). Detrás del gateway, el CORS lo pone el gateway.
- En los dos modos reales la cuenta va a identity (fase 6c): `VITE_IDENTITY_URL` o, si está vacía, la derivada de `VITE_API_URL`
  (`/flights/v1` → `/identity/v1`); con la API vacía (mock) se ignora. GraphQL no cambia eso.

## 2. Qué se queda en REST y por qué

La cuenta (`/auth/*`, que desde la fase 6c sirve **identity**), la compra (hold, reserva, pago) y la postventa
(check-in, equipaje, cambio de fecha, cancelación, boletos, pases, que sirve el **core**) **no pasan por el BFF**: van por
REST, con `Authorization: Bearer` e `Idempotency-Key`. Razones (las mismas del BFF, `docs/GRAPHQL.md`): son escrituras con efectos (cupo,
dinero, boletos) que dependen de `Idempotency-Key` y de un token con alcances; el HTTP significa algo
(`201`, `202` pendiente, `409`, `422` pago rechazado) y GraphQL lo esconde bajo un `200` con `errors`; y
reintentar una escritura con seguridad es más difícil que repetir un `POST` idempotente. Por eso el BFF
solo expone lecturas públicas y el cliente **nunca** manda `Authorization` a `/graphql`.

### Qué ruta va a qué servicio (detrás del gateway)

| Qué | Ruta | Servicio | Cliente |
|---|---|---|---|
| `register`, `login`, `refresh`, `logout`, `me` | `/identity/v1/auth/*` (`VITE_IDENTITY_URL`) | identity | REST; `logout` y `me` con Bearer |
| `searchFlights`, `seatMap`, `flightStatus` | `/graphql` (`VITE_GRAPHQL_URL`) | BFF → core | GraphQL; `X-Device-Fingerprint` solo en la búsqueda |
| Hold y reserva | `/flights/v1/offers/hold`, `/flights/v1/bookings` (`VITE_API_URL`) | core | REST con Bearer e `Idempotency-Key` |
| Postventa | `/flights/v1/bookings/**` | core | REST con Bearer (escrituras con `Idempotency-Key`) |
| Respaldo de las lecturas | `/flights/v1/search`, `/offers/{id}/seatmap`, `/flights/{n}/status` | core | REST (sin `VITE_GRAPHQL_URL`) |

El gateway (`gateway_vuelos`) es la única entrada pública: `/flights/v1/**` → core, `/identity/v1/**` y `/oauth2/token` → identity,
`/graphql` → BFF. Un token de identity sirve igual para el core: el gateway lo valida en el borde (401 si falta o es inválido, 403
si falta un scope) y el core lo vuelve a verificar con el JWKS de identity.

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
| Sincronizar y avisar si cambió | `npm run schema:sync` / `npm run schema:check` (fuente con `BFF_SCHEMA_REF`, ver 6.1) |
| Consultas (una por archivo, constantes) | `src/shared/api/graphql/{searchFlights,seatMap,flightStatus}.ts` |
| Forma de `data` y mapeo a los DTO de REST | `src/shared/api/graphql/{types,mapping}.ts` |
| Implementación de `FlightsApi` | `src/shared/api/GraphqlFlightsApi.ts` |
| Cliente y errores | `src/shared/api/http/{graphqlClient,graphqlErrors}.ts` |
| Selector de modos | `src/shared/api/{config,select}.ts` |

### 6.1 Sincronizar el esquema con el BFF (`BFF_SCHEMA_REF`)

`npm run schema:sync` descarga `src/graphql/schema.graphql` del repositorio `chuchobck/bff_vuelos` y lo guarda en
`contracts/bff-schema.graphql`; `npm run schema:check` solo compara. La referencia del BFF sale de la variable
**`BFF_SCHEMA_REF`** (rama, etiqueta o commit) y por defecto es **`main`**. `BFF_SCHEMA_URL` reemplaza la URL completa.

**Estado hoy:** el PR del BFF ya está fusionado en `main` (commit `faa703f243d23101a198553cdf2a56d297fb7ede`). La copia es idéntica al esquema de
`main` (SHA-256 `0e501f1a…d276`; el último commit que lo cambió es `2bee8a28734ae5debb2baf0e76783e42baea9726`, ya dentro de `main`) y
`BFF_SCHEMA_REF=main npm run schema:sync` lo confirmó el 2026-10-15 sin cambiar el archivo. `contracts/PROCEDENCIA.md` apunta a `main`.

**Para volver a sincronizar** (por ejemplo, cuando el BFF agregue campos):

1. `npm run schema:check` (sin variable: lee `main`). Código 0: el esquema es idéntico y solo falta, si cambió el commit de `main`, el paso 4.
   Código 1: el esquema cambió. Código 2: no se pudo descargar (por ejemplo, la referencia no tiene el archivo).
2. Si cambió: `npm run schema:sync` y revisar `git diff contracts/bff-schema.graphql`. El BFF nunca quita ni renombra: agrega y marca
   `@deprecated`, así que lo normal es que las consultas actuales sigan válidas; si no, la prueba de contrato lo dirá.
3. Si hay cambios que importan, ajustar consultas y mapeos (la prueba de paridad REST↔GraphQL debe seguir en verde).
4. Actualizar la tabla de `contracts/PROCEDENCIA.md`: rama `main`, el commit de `main` que trae el archivo
   (`git ls-remote https://github.com/chuchobck/bff_vuelos main`, o `git log -1 -- src/graphql/schema.graphql` en el BFF), el SHA-256
   (`sha256sum contracts/bff-schema.graphql`) y la fecha. La prueba `schemaCopy.test.ts` falla si el SHA-256 anotado no es el del archivo.
5. `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` en verde, y un commit
   `chore(contratos): esquema del BFF desde main`.

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

### Por el gateway: cuenta en identity (fase 6c, 2026-10-16)

- Los cinco servicios (identity, core con `AUTH_MODE=external`, notifier, BFF) y el gateway, todos en `main`, con `scripts/e2e-local.sh` del
  gateway (PostgreSQL 16 local): su recorrido de 13 pasos terminó en «todo bien». **Ojo:** el script solo mira su primer argumento; para dejar
  los servicios arriba hay que llamarlo solo con `--dejar-arriba` (con `--preparar --dejar-arriba` los apaga al terminar).
- `API_TEST_URL=http://localhost:8080/flights/v1 API_TEST_GRAPHQL_URL=http://localhost:8080/graphql npm run test:api`: **26 pruebas en 4 archivos**
  (contrato 9, GraphQL 3, cuenta 9, compra 5). En los logs del gateway: registro, ingreso, renovación, cierre de sesión y `me` con `upstream: identity`,
  ninguna llamada a `/flights/v1/auth`, las lecturas por `/graphql` y ninguna contraseña en los registros de los seis procesos.
- Chromium con `npm run dev` (`VITE_API_URL=http://localhost:8080/flights/v1`, `VITE_GRAPHQL_URL=http://localhost:8080/graphql`, identity derivada):
  registrarse (201, ingreso y `me` por identity), buscar (un `POST /graphql` `SearchFlights` por clic), mapa de asientos (un `SeatMap` solo al abrirlo),
  retención (`POST /flights/v1/offers/hold` con Bearer e `Idempotency-Key`), reserva (`POST /flights/v1/bookings`, código de reserva y boleto en
  pantalla), Mis viajes (la reserva «Confirmada»), cerrar sesión (`POST /identity/v1/auth/logout` 204) e ingresar de nuevo. Sin errores ni avisos en la
  consola y sin errores de CORS. En modo mock, la cuenta demo ingresa sin ninguna petición externa.
- Un token de acceso inválido en una ruta del core: 401 del gateway (en el borde, 1 ms), una sola renovación en identity y un solo reintento.

### Lo que NO se verificó

- El BFF con gRPC y la rama gRPC del core (salvo el gRPC que usa el script del gateway entre BFF y core); PostgreSQL 18 con Docker.
- El gateway y los servicios desplegados (solo se probó en local).
- `GATEWAY_TIMEOUT`, `QUERY_TOO_EXPENSIVE` y `QUERY_TOO_DEEP` contra el BFF real (se probaron con las formas documentadas del BFF).
- El BFF desplegado (Render/Azure): no se tocó; Render no admite `localhost` en su CORS.
- Rendimiento comparado REST vs GraphQL: no se midió.
- El `warmUpServer` despierta el core y identity (`GET /health` a cada uno), no el BFF.
