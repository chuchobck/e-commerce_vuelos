# F6 «Mis viajes»: discrepancias y verificación pendiente

Estado a 2026-10-09. **La F6 se construyó y probó solo contra el mock** (después se leyó el código del backend: sección 0). El backend local (`http://localhost:3010`) no
respondió desde la sesión de trabajo (conexión rechazada, comprobado dos veces), así que **ningún endpoint de la F6 se ha
verificado contra la API real**. Todo lo que sigue es lo que se espera según `contracts/vuelos-openapi.yaml` (GDS Flight
Core API v1.5.0.0) y los tipos generados en `src/shared/api/generated/vuelos.ts`.

Las suposiciones están marcadas en el código con `// DISCREPANCIA:` (lista en la sección 3). Los pasos para verificar
todo contra el backend local están en el README, sección «Verificación F6 contra API real».

Reglas de esta verificación (las mismas de `CLAUDE.md`): solo contra el backend **local**, nunca contra Render ni con la
cuenta de administrador sembrada, y sin `./db/reset.sh`. No se toca el repositorio del backend.

---

## 0. Lectura del código del backend (2026-10-10): lo asumido frente a lo que hace

Después de cerrar la F6 se leyó el código del backend (`chuchobck/backend_vuelos`, solo lectura, **sin ejecutarlo**) y el dueño probó
compra, lista, detalle y pases contra el backend local. Lo que sigue sale de **leer el código y sus pruebas**, no de ejecutar la API: sirve para
corregir lo que se sabe erróneo, pero cada fila sigue necesitando la verificación en marcha de la sección 1.
Evidencia: archivo del backend entre paréntesis (`ops/` = `src/modules/vuelos/operaciones/`).

| Tema | Lo que asumía la F6 | Lo que hace el backend (leído) | Qué se hizo |
|---|---|---|---|
| Pases antes del check-in | 409 `BOARDING_PASS_NOT_AVAILABLE` | **200 con lista vacía** (también con la reserva no confirmada) (`ops/pase-abordar/pase-abordar.service.ts`) | Corregido (confirmado también por el dueño): estado «aún no hay pases», sin botón de imprimir; el mock responde igual |
| Tipo de código del pase | `QR` | Nunca QR: **PDF417 en económica, AZTEC en las demás**; el texto es `BP1\|PNR\|boleto\|vuelo\|aaaammdd\|ORIGDEST\|asiento\|orden\|firma` (`ops/pase-abordar/codigo-pase.ts`) | La pantalla dibuja siempre un QR con ese texto y lo dice («Código tipo PDF417, dibujado aquí como QR…»). **Un lector de aeropuerto puede no reconocerlo**: pendiente decidir si se agrega un generador de PDF417/AZTEC. El mock ya devuelve PDF417/AZTEC |
| Ventana de check-in | Una sola, la de la primera salida | **Por vuelo** (48 h a 60 min antes de cada salida); solo con el vuelo `PROGRAMADO` o `DEMORADO` (`ops/checkin/checkin.service.ts`) | Corregido: hay check-in si algún vuelo está en ventana; si no, se dice cuándo abre el próximo (`shared/lib/checkinStatus.ts`) |
| Resultado del check-in | `status` del pasajero | Es **200 `IN_PROGRESS`**, no un error, si un vuelo está en ventana y otro no. El `status` del pasajero es `NOT_CHECKED_IN`/`FAILED` si **falta cualquier vuelo**, aunque otro esté `CHECKED_IN`. El `status` global solo es `COMPLETED` o `IN_PROGRESS` | Corregido: se cuenta por `segments[].status` (`checkInProgress`); la pantalla distingue «todo listo» (va a pases), «listo para los vuelos abiertos» y «ninguno quedó» |
| Check-in: errores | 409 y un 422 sin causa conocida | 409 `CHECK_IN_NOT_AVAILABLE` sin vuelo en ventana ni registrado, o con la reserva no confirmada (**nunca** `ALREADY_CANCELLED`); 422 `CHECK_IN_FAILED` (pasajero con asiento faltante o pasaporte que vence antes de la salida; rechaza toda la reserva y trae `invalidParams`) | El mensaje de `CHECK_IN_FAILED` ya existía. Repetir devuelve 200 con el estado actual |
| Check-in: `Idempotency-Key` | La enviaba aunque no se declara | Se ignora (no se lee) | Sin cambios (no estorba) |
| Infante en el check-in | Sin vuelos | Aparece con `seat: null` y `CHECKED_IN` en cada vuelo | Mock alineado; `checkInProgress` cuenta sus vuelos como los de los demás |
| Opciones de equipaje | Solo pasajeros con asiento | **Una fila por pasajero e itinerario, el infante con `maxAllowed: 0`**; el máximo sale de la familia: BASIC 2, CLASSIC 2, FLEX 3, BUSINESS_FLEX 4 (`db/semilla_vuelos.sql`) | La pantalla oculta las filas con máximo 0; el mock devuelve las mismas |
| Equipaje: respuestas | 422 sin confirmar | **202 trae cuerpo** (`{passengerId, itineraryId, totalBaggage}`); el **422 `PAYMENT_NOT_AUTHORIZED` sí existe** para `PAY-REJ-…` (también en cambio de fecha); referencia ya usada: 409; `quantity` de 1 a 10 (400); orden: reserva (404) → no confirmada (409) → itinerario ajeno (422) → vuelo salido (409 `FLIGHT_ALREADY_DEPARTED`) → pasajero ajeno (422) → máximo (409 `BAGGAGE_LIMIT_EXCEEDED`) → cobro (`ops/equipaje/equipaje.service.ts`) | Mock alineado. Comprar maletas son N peticiones (pasajeros × itinerarios) y el límite es **10/min por IP**: una compra grande puede dar 429 |
| Referencia de pago | 4 a 50 letras o números | Además el DTO exige 8 a 64 caracteres `[A-Za-z0-9_.:-]`; `PAY-OK-ABC` (sufijo de 3) cae en 422 | Las referencias que genera la pantalla (`PAY-OK-` + 16) cumplen; la que se escribe a mano se valida con 4+ |
| Cambio de fecha: precio | `totalToPay` negativo = reembolso | **Nunca es negativo**: `max(0, fareDifference + taxDifference) + changeFee`; si el nuevo vuelo cuesta menos, la diferencia no se devuelve; `fare + tax + fee ≠ total` en ese caso (`ops/cambio-fecha/cambio-fecha.service.ts`) | Corregido: se quitó el reembolso de la pantalla (`DateChangePrice`) y se avisa «esa diferencia no se devuelve» |
| Cambio de fecha: cargo | 25 USD fijos en CLASSIC | `tarifa_cabecera.cargo_cambio`: **20 % de la tarifa base de un adulto, por pasajero con asiento**, en CLASSIC; FLEX y BUSINESS_FLEX 0; BASIC no cambiable | Mock alineado |
| Cambio de fecha: errores | 410 oferta vencida | 410 `CHANGE_OFFER_EXPIRED` solo en la ventana entre vencer y la purga; después la oferta **no existe: 422 `VALIDATION_FAILED` con `invalidParams: changeOfferId`**; oferta usada o reserva no confirmada: 409 `VALIDATION_FAILED`; falta `payment` con total > 0: 422; con total 0 el pago se ignora; `FARE_NOT_CHANGEABLE` también sale en la búsqueda; **no existe `CUTOFF_PASSED`** | Corregido: `classifyPaymentError` y `errorMessage` tratan el 422 con `changeOfferId`/`quoteId` como «vencida» y el 409 genérico como «la reserva ya no permite esto»; el mock se alineó |
| Cambio de fecha: resultado | Reserva en la nueva fecha | `itineraryId` **nuevo**, boletos viejos `VOIDED` y boletos nuevos `ISSUED` (**dos boletos por pasajero**); `grandTotal` suma cargo y diferencia; en el 202 el detalle sigue mostrando lo viejo hasta el siguiente ciclo del trabajo (cada 30 s). Los asientos se **reasignan** siempre (el texto de la pantalla es correcto) | `TicketList` muestra todos con su estado. Deducido del código, sin probar: las maletas ya compradas quedan atadas al itinerario viejo (`alreadyPurchased` vuelve a 0 en el nuevo) |
| Cancelación: reembolso | 10 % de penalidad, «reembolsable» por tarifa | Penalidad **por familia: BASIC 100 %, CLASSIC 35 %, FLEX 10 %, BUSINESS_FLEX 0 %** (por itinerario); el reembolso suma tarifa + impuestos + maletas aprobadas (los cargos por cambio **no** se reembolsan) y se redondea hacia arriba; `penalty = total − refund`; `isRefundable = refund > 0` | Mock alineado (BASIC da `isRefundable: false` y no es un error) |
| Cancelación: vigencia y errores | 10 min; `ALREADY_CANCELLED` en la cotización | Cotización de **15 min**, cada GET crea una nueva; la cotización de una reserva no confirmada (cancelada incluida) es **409 `VALIDATION_FAILED`**; `ALREADY_CANCELLED` solo al cancelar; vuelo salido: 409 `FLIGHT_ALREADY_DEPARTED`; no hay tope de horas antes de la salida | Mock alineado |
| Cancelación: cuerpo | `reason` hasta 200 | **Hasta 500**, recortado, no vacío, **sin caracteres de control ni etiquetas HTML** (si no, 400); el 200 trae un `BookingDetail` `CANCELLED` y el 202 uno `CANCELLATION_PENDING` | Corregido: la pantalla admite 500 y no deja escribir `<`, `>` ni saltos de línea |
| Errores con código | `BOOKING_NOT_CONFIRMED`, `CUTOFF_PASSED`, `ALREADY_CANCELLED` por todas partes | Casi todo error sin código propio es **`VALIDATION_FAILED`** y solo el estado HTTP lo distingue (`src/common/errores/codigo-error.ts`); `BOOKING_NOT_CONFIRMED` y `CUTOFF_PASSED` no se emiten | Corregido (ver arriba). Los mensajes por esos códigos quedan por si el contrato cambia |
| 401 por token vencido | — | 401 con `code: VALIDATION_FAILED`, `title: Unauthorized`, `detail: The access token expired` (también «invalid» y «a bearer access token is required»); el token de acceso dura 15 min; **no hay un código propio para «vencido»** | El cliente ya renueva y reintenta una vez ante cualquier 401 (sección 6 del README); no hay que distinguir el motivo |
| 403 por permiso | Sin código | `code: VALIDATION_FAILED`, `detail: Missing required scopes: flights:cancel` (lista los que faltan); se evalúa antes que la validación y el 404; el rol `cliente` tiene read, hold, book, cancel y webhooks, así que **un usuario normal no recibe 403 aquí** | El mensaje de permiso ya existía |
| Cabeceras en el navegador | — | `Idempotent-Replayed` y `WWW-Authenticate` **no están expuestas por CORS**: el navegador no las puede leer (`src/config/seguridad.ts`) | El cliente no depende de ellas |
| Límites 429 | — | check-in 20/min, baggage 10/min, date-change/search 20/min, date-change 10/min, cancel 10/min (por IP y ruta), resto 100/min global; con `Retry-After` | Ya se muestra «espera N segundos» |
| Trabajo pendiente (202) | ~20 s | Un trabajo lo completa **cada 30 s** (`POSTSALE_JOB_INTERVAL_SECONDS`); `PAY-PEND-…` siempre termina aprobado en la pasada siguiente | Los textos dicen «unos segundos»; la verificación debe esperar hasta ~30 s |
| Lista | Orden y `departureDate` | `fecha_creacion DESC, id DESC`; `departureDate` es la fecha local del **primer itinerario** (la ida); ocho estados (`PENDING`, `PENDING_PAYMENT`, `TICKET_ISSUING`, `CONFIRMED`, `FAILED`, `CHANGE_PENDING`, `CANCELLATION_PENDING`, `CANCELLED`); `grandTotal` trae `baseFare`, `taxes` y `total` y el total **incluye maletas y cargos**, así que `baseFare + taxes ≠ total` tras la postventa | Sin cambios: la pantalla usa `total` |

### Cómo ver la reserva en la base de datos (solo lectura)

Base `booking_db`, esquema **`vuelos`** (no `public`). Reemplaza `XXXXXX` por el código de reserva (PNR):

```sql
SET search_path TO vuelos;
SELECT rc.pnr, rc.estado, u.correo, vt.total,
       p.codigo_pasajero, p.tipo_pasajero, p.nombres, p.apellidos,
       b.numero_boleto, b.estado AS estado_boleto, bd.numero_cupon,
       vv.codigo_vuelo, mad.numero_fila || a.letra AS asiento,
       ck.estado AS checkin, pa.tipo_codigo_barras, pa.codigo_barras
FROM reserva_cabecera rc
JOIN retencion_cabecera rt ON rt.id = rc.retencion_id
LEFT JOIN usuario u ON u.id::text = rt.id_propietario
JOIN vista_reserva_total vt ON vt.reserva_id = rc.id
JOIN reserva_detalle_pasajero p ON p.reserva_id = rc.id
LEFT JOIN boleto_cabecera b ON b.pasajero_id = p.id
LEFT JOIN boleto_detalle bd ON bd.boleto_id = b.id
LEFT JOIN vista_vuelo_programado vv ON vv.vuelo_programado_id = bd.vuelo_programado_id
LEFT JOIN reserva_detalle_asiento ra ON ra.pasajero_id = p.id AND ra.vuelo_programado_id = bd.vuelo_programado_id AND ra.fecha_liberacion IS NULL
LEFT JOIN asiento a ON a.id = ra.asiento_id
LEFT JOIN mapa_asientos_detalle mad ON mad.id = a.mapa_asientos_detalle_id
LEFT JOIN checkin ck ON ck.pasajero_id = p.id AND ck.vuelo_programado_id = bd.vuelo_programado_id AND ck.estado = 'REGISTRADO'
LEFT JOIN pase_abordar pa ON pa.checkin_id = ck.id
WHERE rc.pnr = 'XXXXXX'
ORDER BY p.id, b.fecha_creacion, bd.numero_cupon;

-- Pagos (compra, maletas y cambios) y maletas compradas de esa reserva:
SELECT referencia_pago, concepto, estado, fecha_registro
FROM reserva_detalle_pago WHERE reserva_id = (SELECT id FROM reserva_cabecera WHERE pnr = 'XXXXXX');
SELECT p.codigo_pasajero, e.cantidad, e.precio_unitario, g.referencia_pago
FROM reserva_detalle_equipaje e
JOIN reserva_detalle_pasajero p ON p.id = e.pasajero_id
JOIN reserva_detalle_pago g ON g.id = e.pago_id
WHERE p.reserva_id = (SELECT id FROM reserva_cabecera WHERE pnr = 'XXXXXX');
```

---

## 1. Pendiente de verificación real

> Donde esta sección contradiga a la 0 (que sale de leer el código del backend), manda la 0: aquí se conservó el pedido original de cada endpoint y lo que falta **comprobar en marcha**.

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
- **Hallazgo (confirmado con la API real por el dueño y en `pase-abordar.service.ts` del backend, leído, no ejecutado):** antes del check-in, o con la reserva ya no `CONFIRMED`, responde **200 con `boardingPasses: []`**, no 409. El primer diseño asumía 409 y mostraba un botón «Imprimir» sin pases; ya se corrigió (lista vacía = «aún no hay pases», sin botón de imprimir) y el mock responde igual que la API.
- **Verificar:** que tras el check-in la lista traiga un pase por pasajero con asiento (el infante no lleva); un 404 solo para reserva ajena o inexistente;
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
