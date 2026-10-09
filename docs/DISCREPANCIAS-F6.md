# F6 «Mis viajes»: discrepancias y verificación pendiente

Estado a 2026-10-09. **La F6 se construyó y probó solo contra el mock.** El backend local (`http://localhost:3010`) no
respondió desde la sesión de trabajo (conexión rechazada, comprobado dos veces), así que **ningún endpoint de la F6 se ha
verificado contra la API real**. Todo lo que sigue es lo que se espera según `contracts/vuelos-openapi.yaml` (GDS Flight
Core API v1.5.0.0) y los tipos generados en `src/shared/api/generated/vuelos.ts`.

Las suposiciones están marcadas en el código con `// DISCREPANCIA:` (lista en la sección 3). Los pasos para verificar
todo contra el backend local están en el README, sección «Verificación F6 contra API real».

Reglas de esta verificación (las mismas de `CLAUDE.md`): solo contra el backend **local**, nunca contra Render ni con la
cuenta de administrador sembrada, y sin `./db/reset.sh`. No se toca el repositorio del backend.

---

## 1. Pendiente de verificación real

Todas las rutas cuelgan de `{VITE_API_URL}` (`http://localhost:3010/flights/v1`) y exigen `Authorization: Bearer`.
Dinero: texto decimal en la API (`"25.00"`), centavos enteros en el frontend (`shared/lib/money.ts`).
`Idempotency-Key`: un UUID por intento del usuario (`shared/lib/attemptKeys.ts`); el mismo intento reenvía la misma clave
y el mismo cuerpo; si cambia el pago o la cantidad, la clave es nueva.

| # | Endpoint | Permiso | Cliente |
|---|---|---|---|
| 1 | `GET /bookings` | `flights:read` | `RealFlightsApi.listBookings` |
| 2 | `GET /bookings/{id}` | `flights:read` | `getBooking` (ya verificado en F4) |
| 3 | `GET /bookings/{id}/tickets` y `/tickets/{ticketId}` | `flights:read` | `getTickets`, `getTicket` |
| 4 | `POST /bookings/{id}/check-in` | `flights:book` | `checkIn` |
| 5 | `GET /bookings/{id}/boarding-passes` | `flights:read` | `getBoardingPasses` |
| 6 | `GET /bookings/{id}/baggage-options` | `flights:read` | `getBaggageOptions` |
| 7 | `POST /bookings/{id}/baggage` | `flights:book` | `addBaggage` |
| 8 | `POST /bookings/{id}/date-change/search` | `flights:read` | `searchDateChange` |
| 9 | `POST /bookings/{id}/date-change` | `flights:book` | `confirmDateChange` |
| 10 | `GET /bookings/{id}/cancellation-quote` | `flights:read` | `getCancellationQuote` |
| 11 | `POST /bookings/{id}/cancel` | `flights:cancel` | `cancelBooking` |

El estado del vuelo en vivo (`GET /flights/{n}/status`) ya estaba verificado desde F2.

### 1.1 `GET /bookings?limit=10&cursor=…`

- **Request:** query `limit` (1–50) y `cursor` opcionales. El frontend no usa `pnr`, `status`, `createdFrom` ni `createdTo`.
- **Respuesta esperada (200):** `{ nextCursor?: string, items: [{ bookingId, pnr, status, origin, destination, departureDate (yyyy-MM-dd), grandTotal: { currency, total } }] }`.
- **Verificar:** que `nextCursor` falte o sea `null` en la última página; el orden (el mock devuelve las más recientes primero);
  que `departureDate` sea la fecha **local del aeropuerto de salida**; qué `status` puede venir (el contrato lo deja como texto
  libre: un estado desconocido se muestra como «En revisión» y cae en Próximos o Pasados según la fecha); que una cuenta sin
  reservas dé `items: []`; `limit=500` y cursor inválido → 400.

### 1.2 `GET /bookings/{id}/tickets` y `/tickets/{ticketId}`

- **Respuesta esperada (200):** `{ bookingId, tickets: [{ ticketId, bookingId, passengerId, eTicketNumber?, status, issuedAt?, segments?: [{ segmentId, status, couponNumber? }], failureReason? }] }`; el detalle devuelve un `Ticket`.
- **Verificar:** un boleto por pasajero, también para el infante; `eTicketNumber` de 13 dígitos tras `ISSUED`; estados que aparecen
  (`PENDING`, `ISSUING`, `ISSUED`, `FAILED`, `VOIDED`, `REFUNDED`); 404 en reserva ajena o inexistente. `failureReason` nunca se muestra tal cual.

### 1.3 `POST /bookings/{id}/check-in`

- **Request:** sin cuerpo. El frontend envía `Idempotency-Key` aunque el contrato **no la declara** en esta operación.
- **Respuesta esperada (200):** `{ bookingId, status (AVAILABLE|NOT_ELIGIBLE|IN_PROGRESS|COMPLETED|FAILED), checkedInPassengers: [{ passengerId, status (CHECKED_IN|NOT_CHECKED_IN|FAILED), segments?: [{ segmentId, seat?, status }] }] }`.
- **Errores esperados:** 409 `CHECK_IN_NOT_AVAILABLE` fuera de la ventana (48 h a 60 min antes) o con la reserva sin confirmar;
  409 `ALREADY_CANCELLED`; 404 en reserva ajena; 422 (declarado en el contrato, **sin causa documentada**); 403 si el token no tiene `flights:book`.
- **Verificar:** que la API acepte la cabecera extra; qué pasa al repetir el check-in (el mock devuelve lo mismo con 200);
  si el infante aparece en `checkedInPassengers` y con qué `segments`; el significado del 422; si un check-in parcial devuelve 200 con `FAILED` por pasajero o un error.

### 1.4 `GET /bookings/{id}/boarding-passes`

- **Respuesta esperada (200):** `{ bookingId, boardingPasses: [{ passengerId, segmentId, seat, boardingGroup?, boardingPosition?, barcode, barcodeType (AZTEC|PDF417|QR) }] }`.
- **Verificar:** antes del check-in, 409 `BOARDING_PASS_NOT_AVAILABLE` (el frontend también trata 404 como «aún no hay pases»);
  que `barcode` sea texto que un lector pueda leer como QR (el frontend dibuja siempre un QR con ese texto, también si `barcodeType` es `AZTEC` o `PDF417`);
  que no traiga puerta ni hora de embarque (el contrato no las define; la pantalla no las muestra); un pase por pasajero con asiento y por tramo.

### 1.5 `GET /bookings/{id}/baggage-options`

- **Respuesta esperada (200):** arreglo de `{ passengerId, itineraryId, price: { currency, total }, maxAllowed, alreadyPurchased }`.
- **Verificar:** que no haya opciones para el infante; `maxAllowed` es el total permitido (no lo que queda): el frontend calcula
  `maxAllowed − alreadyPurchased`; ida y vuelta como itinerarios distintos; el contrato **no trae el peso** de la maleta (no se muestra).

### 1.6 `POST /bookings/{id}/baggage`

- **Request:** `Idempotency-Key: <uuid>`; cuerpo `{ "passengerId": "PAX1", "itineraryId": "<id>", "quantity": 2, "payment": { "paymentReference": "PAY-OK-…" } }`.
  La API acepta **un pasajero y un itinerario por petición**; una compra de varias líneas son varias peticiones, cada una con su referencia (`PAY-OK-ABC`, `PAY-OK-ABC2`, …) y su clave.
- **Respuesta esperada:** 200 `{ passengerId, itineraryId, totalBaggage }` (hecho), 202 (pago pendiente, quizá sin cuerpo), 409 `BAGGAGE_LIMIT_EXCEEDED` / `BOOKING_NOT_CONFIRMED` / `ALREADY_CANCELLED` / `CUTOFF_PASSED` / `FLIGHT_ALREADY_DEPARTED`.
- **Verificar (los tres pagos):**
  - `PAY-OK-…` → 200 (el contrato declara 200; el enunciado de la fase decía 201, y el cliente toma cualquier 2xx distinto de 202 como hecho).
  - `PAY-PEND-…` → 202; tras ~20–30 s `GET baggage-options` debe mostrar `alreadyPurchased` actualizado.
  - `PAY-REJ-…` → **422 `PAYMENT_NOT_AUTHORIZED`**. El contrato **no declara el 422 en esta operación** (solo 200/202/409): se asume igual que en `POST /bookings`. Si la API responde otro código, hay que ajustar `features/aftersale/outcome.ts`.
  - Reusar una referencia ya cobrada → 409/422 `PAYMENT_REFERENCE_INVALID`. Misma clave con otro cuerpo → 422.
  - Otra cuenta o reserva ajena → 404. Superar el máximo → 409 `BAGGAGE_LIMIT_EXCEEDED`.

### 1.7 `POST /bookings/{id}/date-change/search`

- **Request:** `{ "changes": [{ "itineraryId": "<id>", "newDepartureDate": "2026-11-21" }] }` (lectura: el cliente puede reintentar una vez).
- **Respuesta esperada (200):** arreglo de `{ changeOfferId, expiresAt, segments: FlightSegment[], priceDifference: { fareDifference, taxDifference, changeFee, totalToPay } }`. Los importes son texto sin moneda.
- **Verificar:** que sin vuelos esa fecha dé `[]` y no un error; 409 `FARE_NOT_CHANGEABLE` con familia Basic (el frontend ya la
  desactiva antes de llamar si `changeable` es falso); que `totalToPay` **negativo** signifique reembolso y que `fare + tax + fee = total`;
  la moneda (se asume `USD`).

### 1.8 `POST /bookings/{id}/date-change`

- **Request:** `Idempotency-Key: <uuid>`; cuerpo `{ "changeOfferId": "…", "payment": { "paymentReference": "PAY-OK-…" } }`. `payment` solo se envía si hay algo que pagar (`totalToPay > 0`); la pantalla no manda `assignedSeats` (el cliente sabe enviarlos, pero la interfaz no los pide) y avisa «Tus asientos se reasignan automáticamente en el nuevo vuelo».
- **Respuesta esperada:** 200 `BookingDetail` en la nueva fecha; 202 (la reserva queda `CHANGE_PENDING`); 409 `FARE_NOT_CHANGEABLE` / `FLIGHT_ALREADY_DEPARTED` / `CUTOFF_PASSED`; 410 `CHANGE_OFFER_EXPIRED`.
- **Verificar:** `PAY-OK` (200 y la reserva con la fecha nueva), `PAY-PEND` (202 y luego `CONFIRMED`), `PAY-REJ` (422 `PAYMENT_NOT_AUTHORIZED`, **no declarado en el contrato**: se conserva la oferta para reintentar con otro pago);
  si con total 0 o negativo la API acepta la petición sin `payment`; cuánto dura la oferta (el mock: 15 minutos); qué pasa con los asientos ya elegidos tras el cambio (la pantalla afirma que se reasignan; hay que confirmarlo).

### 1.9 `GET /bookings/{id}/cancellation-quote`

- **Respuesta esperada (200):** `{ quoteId, isRefundable, refundAmount, penaltyAmount, currency, expiresAt }`.
- **Verificar:** reembolso y penalidad por familia (Basic, Classic, Flex); que `refund + penalty = total pagado`; vigencia de la cotización (el mock: 10 minutos);
  la cotización de una reserva ya cancelada (409 `ALREADY_CANCELLED`).

### 1.10 `POST /bookings/{id}/cancel`

- **Request:** `Idempotency-Key: <uuid>`; cuerpo `{ "quoteId": "…", "reason": "opcional, máx. 200" }`.
- **Respuesta esperada:** 200 (el contrato **no define el cuerpo**; el frontend no lo lee y vuelve a pedir la reserva), 202 (queda `CANCELLATION_PENDING`), 409 `QUOTE_EXPIRED` / `ALREADY_CANCELLED` / `CUTOFF_PASSED` / `FLIGHT_ALREADY_DEPARTED`; 403 si el token no tiene `flights:cancel`.
- **Verificar:** que la reserva pase a `CANCELLED` y salga en «Cancelados»; el 202 y cuánto tarda en resolverse; repetir con la misma clave y cuerpo repite la respuesta (`Idempotent-Replayed: true`); una cotización vencida (409) y que pedir otra funcione;
  que una cotización de otra reserva sea 422.

### 1.11 Errores transversales

- **403 de permiso (scope):** el cliente lo muestra como «Tu cuenta no tiene permiso para esta acción…» (`es.errors.forbidden403`) y **no** como rechazo de pago. El contrato no define un código para el 403, así que se decide solo por el estado HTTP. Verificar con un token sin `flights:cancel` o `flights:book`.
- **404 en reserva ajena** (se muestra «No encontramos este viaje», igual que si no existiera).
- **429:** los límites por IP de las escrituras de venta (10 reservas por minuto); la F6 no dispara ráfagas.

---

## 2. Diferencias entre el enunciado de la fase y el contrato (se siguió el contrato)

| Enunciado | Contrato | Qué hace el frontend |
|---|---|---|
| Equipaje: éxito 201 | 200 | Cualquier 2xx distinto de 202 es «hecho» |
| Opciones de equipaje con peso | Sin peso | No se muestra peso |
| Pase de abordar con puerta y hora de embarque | Solo asiento, grupo, posición y `barcode`/`barcodeType` | Se muestra solo eso |
| `Idempotency-Key` en el check-in | No declarada | Se envía igual |
| 422 de pago rechazado en equipaje y cambio de fecha | Solo declarado en `POST /bookings` | Se asume igual (sección 1.6 y 1.8) |
| Lista con número de vuelo y hora | Solo `origin`, `destination`, `departureDate`, total y estado | Se pide el detalle de las reservas a la vista, de a 3, una vez cada una; si falla, la tarjeta se muestra sin esos datos |
| Rutas `/mis-viajes` | — | La principal es `/viajes`; `/mis-viajes` y `/mis-viajes/*` redirigen |

## 3. Suposiciones del código marcadas con `// DISCREPANCIA:`

| Dónde | Qué se asume |
|---|---|
| `shared/api/RealFlightsApi.ts` (`CURRENCY`) | Los importes de postventa llegan sin moneda y se toman como `USD` (toda la API vende en dólares) |
| `shared/api/RealFlightsApi.ts` (`checkIn`) | La cabecera `Idempotency-Key` extra no estorba |
| `shared/api/mapping.ts` (`mapDateChangeOptions`) | `totalToPay` negativo es reembolso |
| `features/trips/bookingActions.ts` | La API no dice qué acciones son válidas; se derivan del estado, de la salida y de `changeable`. «Pases» queda siempre disponible porque la API no dice si el check-in ya se hizo |
| `shared/lib/checkinStatus.ts` | El check-in se habilita con la reserva `CONFIRMED` y dentro de 48 h a 60 min antes de la primera salida del viaje |
| `features/trips/tripFilters.ts` | `FAILED` se agrupa con «Cancelados»; las reservas sin fecha o con un estado desconocido van a «Próximos» |
| `features/trips/useTripDetails.ts` | El número de vuelo y la hora de la tarjeta salen del detalle, no de la lista |
| `shared/api/mock/aftersale.ts` | Reglas **del mock** que la API real puede tener distintas: tope de 3 maletas por pasajero e itinerario, cargo por cambio (Classic 25 USD, Flex 0, por pasajero con asiento), oferta de cambio 15 min, cotización 10 min, penalidad de cancelación 10 % si la tarifa es reembolsable (si no, no hay reembolso), orden de la lista (más recientes primero), `departureDate` en fecha local, el resultado «pendiente» a los 20 s |

## 4. Observaciones y posibles errores del backend

- **Precio sospechoso (solo se reporta):** el enunciado de la fase indica un vuelo de prueba `AV3432` (LOH → CUE, 2026-10-08, solo Económica)
  cuya tarifa Flex tiene un precio sospechoso de `4128.00` USD. **No lo vi: el backend no estuvo accesible**, así que no se pudo confirmar. No se corrige en el frontend;
  hay que reportarlo al equipo del backend. Además, esa fecha (2026-10-08) ya pasó a 2026-10-09: sirve para probar un viaje pasado, no el check-in.
- **422 de `check-in`:** el contrato lo declara sin decir cuándo ocurre.
- **Sin código para 403:** el esquema `ProblemDetails.code` no tiene un valor para permisos insuficientes.
- **Cuerpo del 200 de `cancel`:** sin esquema en el contrato.
- **Moneda de `priceDifference`:** los importes son texto sin moneda.

## 5. Qué sí se verificó (en mock)

Ver el informe de la fase y la sección 8 del README: 597 pruebas con Vitest, entre ellas las reglas del mock contra los mismos códigos del contrato,
`RealFlightsApi` contra un cliente HTTP falso (rutas, cabeceras, 200/201/202, importes en centavos) y las pantallas de lista, pases, equipaje y cancelación.
Eso demuestra que el cliente **arma y lee** lo que el contrato describe; no demuestra que la API real responda así.
