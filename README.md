# Quinde — e-commerce de vuelos (frontend)

Tienda web para comprar vuelos dentro de Ecuador: buscar, elegir tarifa, pagar y administrar el viaje.
Consume la API de vuelos del proyecto (GDS Flight Core API v1.5.0.0). Es un proyecto académico: **los pagos son simulados**.

| Recurso | Dónde |
|---|---|
| API en producción | https://quinde-vuelos-api.onrender.com/flights/v1 |
| Swagger de la API | https://quinde-vuelos-api.onrender.com/api/docs |
| Repositorio del backend | https://github.com/chuchobck/backend_vuelos |
| Contrato OpenAPI | `contracts/vuelos-openapi.yaml` del backend |

Alcance: **solo vuelos**. Alojamientos, autos y atracciones los llevan otros equipos y no viven en este repositorio.

---

## 1. Estado actual (2026-10-09, F6 hecha en mock y pendiente de verificación real)

- Repositorio en GitHub (`chuchobck/e-commerce_vuelos`), `main` con las fases 1 a 5; la F6 está en la rama `fase-6-viajes` (PR abierto, sin fusionar). 298 archivos en `src`, unas 27.400 líneas de TypeScript (sin contar los tipos generados).
- 621 pruebas en verde con `npm run test` y 22 de integración con `npm run test:api` (9 de lectura, contra el backend local y Render; 8 de cuenta y 5 de compra, solo contra el backend local). Lint, typecheck y build sin errores.
- **Dos modos sin mezclas** (sección 2): mock completo, o API real. Con la API real funcionan **búsqueda, resultados, "Escápate", estado de vuelo, la cuenta** (registro, ingreso, renovación de sesión, cierre de sesión, Mi perfil y rutas protegidas) **y la compra** (hold, reserva, pago simulado y confirmación); el mapa de asientos tiene cliente y pruebas (la pantalla es de F5).
- Las formas de datos salen de los contratos (`contracts/vuelos-openapi.yaml` y, para `/auth/*`, `contracts/backend-openapi.json` → tipos generados) y el mock produce exactamente esa forma.
- **Sesión** (sección 6, "Modelo de seguridad de la sesión"): access token solo en memoria, renovación única entre pestañas, cierre de sesión que se propaga a las demás pestañas, restauración al recargar sin parpadeo.
- **Compra (F4a y F4b, sección 5):** máquina de estados pura (`features/checkout/machine.ts`), hold una sola vez por selección, tiempo del servidor, claves de idempotencia por intención, pago simulado reemplazable (`shared/payments`), seguimiento de reservas en proceso y, desde F4b, las pantallas finales: cuenta incrustada, un bloque por pasajero, panel lateral con temporizador y resumen, tarjeta simulada y confirmación con el código de reserva copiable.
- **Nacionalidad:** la lista de países sale en español, pero la API solo conoce **Ecuador** (su tabla `pais` solo trae `EC`; otro código da 422). Los demás países se ven como "(aún no disponible)" hasta que el backend los cargue (`BOOKABLE_COUNTRIES` en `shared/lib/countries.ts`).
- **Mis viajes y la postventa (F6, sección 5c) están hechos con el mock y NO se han verificado contra la API real** (el backend local no respondió durante la fase). El cliente real (`RealFlightsApi`) ya está escrito con las formas del contrato y probado contra un cliente HTTP falso; lo que falta es recorrerlo contra el backend con los pasos de «Verificación F6 contra API real» (sección 5c). Lo asumido y lo pendiente está en `docs/DISCREPANCIAS-F6.md`.
- Navegación (sección 4): menú por momento del viajero, rutas centralizadas en `src/app/routes.ts`, rutas protegidas con `RequireAuth` (espera a que la sesión se restaure y conserva `?volver=`).
- Camino feliz con sesión: **3 clics** desde "Elegir tarifa" hasta la confirmación (Elegir, Continuar al pago, Pagar), más escribir los datos del pasajero y de la tarjeta. Sin sesión se suman los de la cuenta.
- Mis viajes (`/viajes`): lista con pestañas y paginación, detalle con acciones según el estado y el estado del vuelo en vivo, boletos, check-in (ventana 48 h / 60 min), pases de abordar con QR e impresión, equipaje extra, cambio de fecha y cancelación con cotización. Las escrituras llevan `Idempotency-Key` por intento y distinguen 200/201 (hecho), 202 (en proceso, se puede actualizar) y 422 (pago rechazado: se reintenta con otro pago sin perder lo elegido).
- Ofertas es una pantalla inicial (F7). Mi perfil muestra los datos reales de la cuenta, solo lectura: la API no permite editarlos.
- **Asientos (F5, secciones 5b y 6):** el selector (`features/seats`) está dentro del paso 2 como un bloque **opcional y plegado** ("Asignaremos tus asientos automáticamente. Elegir asientos (opcional)"): sin abrirlo no se pide ningún mapa y el camino sigue en 3 clics. Elige un asiento por pasajero en **cada tramo** (ida, vuelta y escalas) y viaja como `assignedSeats`; el panel lateral, la revisión del pago y la confirmación muestran los asientos de cada pasajero. Verificado con la API real (sección 6, "Lo que aprendimos de asientos").

> Regla de mantenimiento: al cerrar cada fase se actualiza esta sección y las columnas "Estado" de las tablas. Si este README y el código no coinciden, se corrige el README en el mismo commit.

---

## 2. Cómo arrancarlo

Requisitos: Node 22 LTS o superior y npm.

```bash
npm install
cp .env.example .env      # en Windows: copy .env.example .env
npm run dev               # http://localhost:5173
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compila para producción |
| `npm run test` | Pruebas (Vitest) |
| `npm run typecheck` | Revisión de tipos |
| `npm run lint` | ESLint: accesibilidad (jsx-a11y) y reglas de arquitectura de la sección 3 |
| `npm run api:types` | Regenera los tipos del contrato en `src/shared/api/generated/` |
| `npm run test:api` | Integración contra la API real: búsqueda, asientos, estado y errores validados contra el contrato con Ajv y, **solo con un backend local**, la cuenta y la compra (crea un usuario `@example.test`, holds y reservas). No es parte de `npm run test` |

### Contrato y tipos generados

- `contracts/vuelos-openapi.yaml` es una copia del contrato del backend; su origen y fecha están en `contracts/PROCEDENCIA.md`. Ese contrato no describe `/auth/*`: para la cuenta se usa `contracts/backend-openapi.json`, el documento que el backend publica en `/api/docs-json` (mismo `PROCEDENCIA.md`).
- `npm run api:types` genera `src/shared/api/generated/vuelos.ts` y `generated/backend.ts` con `openapi-typescript`. Ese archivo **se versiona** y no se edita a mano: es el único lugar que define las formas del contrato.
- Si el contrato cambia: descargar el YAML nuevo, actualizar `PROCEDENCIA.md`, correr `npm run api:types` y después `npm run typecheck`. El mock está tipado contra esos tipos, así que cualquier diferencia hace fallar la compilación hasta que se corrija.

### Variables de entorno

Están descritas en `.env.example`. Nunca se sube un `.env` al repositorio.

- **`VITE_API_URL`** elige el modo, sin mezclas:
  - **Vacía → mock completo.** Todo funciona sin backend y se ven las pistas "Para probar".
  - **Con valor → API real.** Todo va a la API, incluidos Mis viajes y la postventa de F6 (escritos con las formas del contrato pero **aún sin verificar contra el backend**: pasos en la sección 5c). Las pistas "Para probar" (incluida la cuenta demo del mock) no se ven; las tarjetas de prueba del pago simulado se ven con el mock o en desarrollo.
- **`VITE_LAST_FLIGHT_DATE`**: último día con salidas de la semilla del backend (la semilla genera 90 días desde su carga y esa ventana es fija). El buscador no deja elegir fechas posteriores; vacía = hoy + 89 días.
- **`VITE_MOCK_ERROR_RATE`**: frecuencia de errores simulados. Solo afecta al mock; sirve para diseñar los estados de error.

#### A qué API apuntar

| Backend | URL | Para qué |
|---|---|---|
| Local (recomendado en desarrollo) | `http://localhost:3010/flights/v1` | Navegador y `npm run test:api` (incluidas la cuenta y la compra). El backend debe tener `CORS_ORIGINS=http://localhost:5173`. Con el backend en WSL, desde Windows funciona `localhost` (no `127.0.0.1`). |
| Render | `https://quinde-vuelos-api.onrender.com/flights/v1` | Solo verificación de lectura con `npm run test:api` (corre en Node, no necesita CORS); las suites de cuenta y compra se omiten solas porque escriben. **No se crean usuarios, holds ni reservas en Render.** Su CORS no incluye `localhost`. Duerme tras 15 min: la primera petición tarda cerca de un minuto. |

`npm run test:api` toma la URL de `API_TEST_URL` o, si no está, de `VITE_API_URL` del `.env`. Ejemplo contra Render: `API_TEST_URL=https://quinde-vuelos-api.onrender.com/flights/v1 npm run test:api`.

Todas las variables que empiezan con `VITE_` quedan visibles en el navegador: **no se ponen secretos ahí**.

---

## 3. Arquitectura

```
src/
├─ main.tsx, index.css        arranque y tokens de diseño (claro y oscuro)
├─ app/
│  ├─ routes.ts               tabla única de rutas (paths, routes.trip(id), returnTo, redirecciones)
│  ├─ routeTable.tsx          qué página atiende cada ruta; router.tsx la monta
│  ├─ RequireAuth.tsx         rutas con sesión (espera la restauración; manda a /ingresar?volver=…)
│  ├─ providers/              tema
│  └─ layout/                 header, menú móvil, footer, avisos de sesión, plantilla de página, página de error
├─ pages/                     una página por ruta; solo arma piezas, sin lógica de negocio
├─ features/                  una carpeta por módulo; cada uno expone solo lo de su index.ts
│  ├─ home/  search/  results/
│  ├─ auth/  checkout/  seats/
│  ├─ trips/  checkin/  aftersale/
│  └─ flight-status/  offers/
└─ shared/
   ├─ api/                    FlightsApi, contract.ts (nombres de los tipos generados), mapping.ts (contrato → interfaz),
   │                          http/ (cliente: único lugar con fetch), RealFlightsApi, mock/, airports.ts (catálogo estático)
   ├─ payments/               pago simulado (PaymentProvider reemplazable por la Payment API real)
   ├─ i18n/                   todos los textos en español
   ├─ lib/                    fechas, dinero en centavos, formatos, validadores, esquemas, caché, ventana de check-in, hooks
   └─ ui/                     componentes base (incluye el resumen de viaje y MockOnly)
```

Reglas de dependencia (para no perderse). Las de los puntos 1 a 3 las revisa `npm run lint`:

1. `pages` usa `app`, `features` y `shared`. `features` usa `shared` y, como única excepción, `app/routes.ts` (no importa nada) para enlazar sin escribir rutas sueltas. `shared` no usa a nadie.
2. Un módulo de `features` no importa de otro módulo de `features`, y desde fuera se importa solo por su `index.ts` (`@/features/trips`, nunca `@/features/trips/Archivo`). Lo común sube a `shared`.
3. **Solo `shared/api` habla con la red** (en la práctica, `shared/api/http/client.ts`). `fetch`, `XMLHttpRequest` y axios están prohibidos fuera de ahí.
8. **Las formas de datos salen del contrato.** Los tipos se generan (`npm run api:types`) y nunca se copian a mano; si la interfaz necesita otra forma (dinero en centavos, hora local), la conversión vive en `shared/api/mapping.ts` con pruebas. Con la API real no se inventa ningún dato: textos, rutas, duraciones y precios salen de las respuestas.
4. Ningún texto visible va escrito en el componente: todo sale de `shared/i18n`.
5. Ningún color fuera de los tokens de `index.css`.
6. Un componente por archivo. Componentes de presentación sin lógica de negocio.
7. Ninguna ruta se escribe como texto: se usa `routes.*` o `paths.*` de `app/routes.ts`.

### Módulos objetivo

| Módulo (`features/`) | Responsabilidad | Estado |
|---|---|---|
| `home` | Inicio y "Escápate" (precios reales con caché de 10 min) | Hecho (mock y API real) |
| `search` | Buscador (solo pares con vuelos y fechas dentro de la ventana) | Hecho (mock y API real) |
| `results` | Resultados y familias tarifarias reales | Hecho (mock y API real) |
| `auth` | Sesión (`SessionManager`: tokens, renovación, pestañas, restauración), `AuthProvider`/`useAuth`, formularios de ingreso y registro (`RequireAuth` vive en `app/`) | Hecho (mock y API real) |
| `checkout` | Compra en 3 pasos: selección, máquina de estados (`machine.ts` + `flow.ts`), claves de idempotencia, hold con tiempo del servidor, pasajeros, pago, seguimiento de la reserva | Hecho (mock y API real) |
| `seats` | Selector de asientos (mapa en forma de avión, lista alternativa, filtros, recomendación, conflictos 409/422) | Hecho (mock y API real); dentro del paso 2 como bloque opcional (sección 5b) |
| `trips` | Mis viajes: lista (filtros, paginación), detalle, acciones según el estado, boletos | Hecho en mock; sin verificar con la API real (F6) |
| `checkin` | Check-in dentro del viaje y pases de abordar con QR | Hecho en mock; sin verificar con la API real (F6) |
| `aftersale` | Equipaje, cambio de fecha, cancelación con cotización, pago simulado de postventa, 200/202/422 | Hecho en mock; sin verificar con la API real (F6) |
| `flight-status` | Estado de vuelo (público y dentro del viaje, con insignia de retraso) | Hecho (mock y API real) |
| `offers` | Ofertas por destino | Planificado (carpeta creada) |

---

## 4. Navegación y rutas

Criterio: se ordena por el **momento del viajero**.

- Antes de comprar (público): buscar, comparar, ver ofertas.
- Después de comprar (con sesión): todo lo del viaje.
- En cualquier momento (público): estado de un vuelo y ayuda.

Menú principal: **Vuelos · Ofertas · Mis viajes · Estado de vuelo** (Mis viajes lleva a `/viajes`). A la derecha: Ayuda, tema claro/oscuro y el menú del usuario (Mis viajes, Mi perfil, Cerrar sesión).

| Ruta | Página | Acceso | API | Estado |
|---|---|---|---|---|
| `/` | Inicio con buscador | Público | `POST /search` | Hecho (mock y API real) |
| `/resultados` | Vuelos y tarifas (paso 1) | Público | `POST /search` | Hecho (mock y API real) |
| `/ofertas` | Precios más bajos por destino | Público | `POST /search` | Pantalla de espera (F7) |
| `/compra/datos` | Cuenta y pasajeros (paso 2) | Sesión dentro del paso | `/auth/*`, `POST`/`GET`/`DELETE /offers/hold`, `GET /offers/{id}/seatmap` | Hecho (mock y API real); asientos opcionales por tramo |
| `/compra/pago` | Pago (paso 3) | Sesión dentro del paso | `POST /bookings`, `GET /offers/hold/{id}` | Hecho (mock y API real) |
| `/compra/confirmacion/:id` | Confirmada, en proceso o fallida | Sesión | `GET /bookings/{id}` | Hecho (mock y API real) |
| `/viajes` | Lista de viajes (Próximos, Pasados, Cancelados) | Sesión | `GET /bookings` | Hecho en mock; sin verificar con la API real |
| `/viajes/:id` | Detalle del viaje (centro de postventa) | Sesión | `GET /bookings/{id}`, `GET .../tickets`, `GET /flights/{n}/status` | Hecho en mock; sin verificar con la API real |
| `/viajes/:id/boletos` | Boletos electrónicos | Sesión | `GET .../tickets`, `GET .../tickets/{ticketId}` | Hecho en mock; sin verificar con la API real |
| `/viajes/:id/check-in` | Check-in | Sesión | `POST .../check-in` | Hecho en mock; sin verificar con la API real |
| `/viajes/:id/pases` | Pases de abordar con QR | Sesión | `GET .../boarding-passes` | Hecho en mock; sin verificar con la API real |
| `/viajes/:id/equipaje` | Agregar equipaje | Sesión | `GET .../baggage-options`, `POST .../baggage` | Hecho en mock; sin verificar con la API real |
| `/viajes/:id/cambiar-fecha` | Cambio de fecha | Sesión | `POST .../date-change/search`, `POST .../date-change` | Hecho en mock; sin verificar con la API real |
| `/viajes/:id/cancelar` | Cancelación | Sesión | `GET .../cancellation-quote`, `POST .../cancel` | Hecho en mock; sin verificar con la API real |
| `/estado-vuelo` | Estado de un vuelo | Público | `GET /flights/{n}/status` | Hecho (mock y API real) |
| `/ingresar`, `/registrarse` | Cuenta (vuelven a `?volver=`) | Público | `POST /auth/login`, `POST /auth/register` | Hecho (mock y API real) |
| `/perfil` | Mis datos (solo lectura) y cerrar sesión | Sesión | `GET /auth/me`, `POST /auth/logout` | Hecho (mock y API real) |
| `/ayuda` | Ayuda y textos legales | Público | Ninguna | Hecho |
| `/componentes` | Catálogo interno | Solo desarrollo (404 en producción) | Ninguna | Hecho |
| `/componentes/asientos` | Demo del selector de asientos (1 adulto, familia con niño y bebé, escala, ATR) | Solo desarrollo (404 en producción) | `GET /offers/{id}/seatmap` | Hecho (F5) |

Rutas viejas que redirigen: `/mis-viajes` y `/mis-viajes/*` → `/viajes` y `/viajes/*` (hasta F5 se llamaban así), `/mis-reservas` → `/viajes`, `/reserva/:id` → `/viajes/:id`, `/check-in` → `/viajes`, `/compra` → `/compra/datos`.

Por qué el check-in no es una sección del menú: en la API el check-in se hace por `bookingId` y solo el dueño de la reserva puede hacerlo. No existe búsqueda por código de reserva y apellido, así que un check-in sin cuenta no puede funcionar. Vive dentro de cada viaje. Pendiente: que el inicio muestre un aviso cuando un viaje entra en la ventana de check-in.

---

## 5. La compra en 3 pasos

| Paso | Pantalla | Qué hace el usuario | Qué pasa por detrás |
|---|---|---|---|
| 1. Elige tu vuelo | `/resultados` | Elige vuelo y tarifa (Light, Classic o Flex) | La selección se guarda; aún no hay hold |
| 2. Tu cuenta y pasajeros | `/compra/datos` | Si no tiene sesión: ingresa o crea su cuenta. Luego confirma los datos de quienes viajan y, si quiere, elige asiento | Con sesión se crea el **hold** y arranca el temporizador de 15 minutos |
| 3. Paga y listo | `/compra/pago` | Revisa el resumen y paga | Se crea la reserva con clave de idempotencia y se emiten los boletos |

Después viene la confirmación (`/compra/confirmacion/:id`) con el código de reserva y el acceso a "Mis viajes". No cuenta como paso.

Reglas del flujo:

- **El ingreso ocurre dentro del paso 2**, no antes. Buscar y comparar es público; la cuenta se pide recién cuando hay algo que apartar.
- Ingresar o registrarse **nunca pierde la selección** del paso 1: al terminar, el usuario sigue en el mismo vuelo y tarifa.
- Con sesión iniciada, el bloque de cuenta se reduce a "Compras como ana@correo.ec" (la cuenta solo tiene correo) y el paso 2 empieza en pasajeros. El indicador siempre muestra 3 pasos.
- Los datos de la cuenta se precargan en el primer pasajero. No se pide dos veces el mismo dato.
- El registro dentro de la compra pide lo mínimo.
- El asiento es opcional. Si no se elige, se asigna solo.
- Si la oferta venció o se quedó sin cupo mientras el usuario se registraba (409 al apartar), se explica y se ofrece volver a los resultados con la búsqueda intacta, donde se ve el precio actual.
- El temporizador avisa cuando quedan 2 minutos. Si el hold vence, se explica qué pasó y se ofrece buscar de nuevo, sin perder los datos de los pasajeros.
- El botón de pagar se desactiva mientras se procesa. Un reintento usa la misma clave de idempotencia para no cobrar dos veces.
- Se puede volver al paso anterior sin perder lo escrito.

Pago simulado: la pantalla lo dice de forma visible. Los datos de tarjeta no salen del navegador ni se guardan; a la API solo se envía una referencia de pago.

### Las pantallas (F4b)

- **Paso 2, `/compra/datos`.** Sin sesión, arriba aparecen "Ya tengo cuenta" y "Crear cuenta" (por defecto, crear) con `LoginForm` y `RegisterForm` incrustados: sin salir de la página y sin perder la selección. Al entrar, el bloque se reduce a "Compras como <correo>" (la cuenta solo guarda correo) y se aparta el precio. Con sesión empieza directo en pasajeros.
- **Un `fieldset` por pasajero**, numerado por tipo ("Adulto 1", "Niño 1", "Infante 1"), con los campos de `PassengerItem`: nombres, apellidos, documento (cédula con módulo 10 solo con nacionalidad Ecuador; pasaporte con vencimiento posterior al último vuelo), nacionalidad, nacimiento (con la regla de edad de su tipo a la vista), sexo y contacto. Cada infante elige el adulto que lo lleva (un infante por adulto). "Usar este contacto para todos" copia el contacto del primer pasajero. El correo de la cuenta precarga el contacto: no se pide dos veces.
- **Teclear y pegar:** la cédula y el celular solo aceptan dígitos (con su máximo); el pasaporte, letras y números sin espacios ni guiones. Validación al salir del campo y al enviar, sin borrar lo escrito; error bajo cada campo (`role="alert"`), resumen al inicio y foco al primer campo con error.
- **Borrador:** se guarda solo (con una pausa corta tras escribir y al salir) en sessionStorage; sobrevive a refrescar, al botón Atrás, a un hold vencido y a buscar de nuevo, y se borra al confirmar o cancelar.
- **Panel lateral** (columna fija desde 1024 px; arriba en móvil): temporizador con el tiempo del servidor y avisos a los 5 minutos (cortés) y a los 2 (asertivo, con "Necesito más tiempo"), resumen del viaje, pasajeros, tarifa y precio congelado con su desglose de tarifa base e impuestos (lo da la API), "Asiento: asignación automática" y "Cancelar compra" (con confirmación y liberación del hold). En móvil el resumen se pliega y deja el total a la vista.
- **Paso 3, `/compra/pago`.** Revisión compacta con enlaces para editar (los datos se conservan) y tarjeta simulada: número con espacios visuales, nombre, vencimiento MM/AA futuro, CVV de 3 o 4 dígitos, `autocomplete="cc-*"`, rotulada "Pago simulado – no se hace ningún cargo real". El botón "Pagar $X" queda en "procesando" y no admite doble envío. Los errores (pago rechazado, hold vencido, sin cupo, red, 429 con cuenta regresiva) tienen su aviso y su salida.
- **Confirmación, `/compra/confirmacion/:id`.** Código de reserva grande y copiable, resumen del viaje, boletos, y dos acciones: "Ver mis viajes" y "Buscar otro vuelo". En proceso es una región viva que explica que la compra queda en Mis viajes si se cierra la página; fallida dice qué hacer. Se abre por URL directa; una reserva ajena o inexistente (404) da un mensaje amable.
- **Navegación:** el indicador de 3 pasos (`aria-current="step"`) está en las tres pantallas; la confirmación es el final aparte. Cada pantalla pone el título "Paso N de 3: …" y, al cambiar de paso, el foco cae en el `h1`, que anuncia el paso.
- **Accesibilidad verificada:** sin desborde horizontal a 320 y 640 px (≈ zoom 200 %), claro y oscuro, objetivos de al menos 48 px y foco de 3 px; el panel lateral es una columna, nunca una barra fija sobre los campos.
- **Camino feliz con sesión: 3 clics** (Elegir tarifa, Continuar al pago, Pagar). Una prueba de la ruta completa los cuenta y falla si pasan de 3.

### Cómo funciona por dentro (F4a)

- **Máquina de estados** (`features/checkout/machine.ts`, pura y probada): sin selección → selección guardada → creando hold → hold activo → pasajeros completos → pagando → confirmada | en proceso | pago rechazado | hold vencido | sin cupo | error. `flow.ts` ejecuta los efectos y `useCheckout()` es el adaptador de React.
- **Hold una sola vez por selección.** Se crea al entrar al paso 2 con sesión; su id queda en la selección (sessionStorage). Refrescar o volver lo verifica con `GET` en vez de crear otro; si venció, se informa.
- **Tiempo del servidor.** El temporizador cuenta `remainingSeconds` desde que llegó la respuesta y se resincroniza con `GET` cada minuto y al volver a la pestaña. Al llegar a cero se pregunta al servidor antes de dar el hold por vencido.
- **Claves de idempotencia por intención** (`idempotency.ts`): la del hold se liga a la selección; la de la reserva al hold más pasajeros y referencia de pago. Mismo contenido = misma clave (un reintento o doble clic no duplica nada); contenido nuevo = clave nueva. Se guarda solo una huella del contenido. Las claves caducan al terminar la intención (hold vencido, liberado o usado) o la compra.
- **Reintentar un pago** tras un error de red reenvía exactamente el mismo pedido con la misma clave. Si la página se recarga con el pago en curso, el hold aparece `CONSUMED`: se reenvía el último pedido (hold y referencia guardados, nunca la tarjeta) con la misma clave y la API devuelve la reserva que sí se creó.
- **Pago rechazado (422):** se verifica con `GET` que el hold sigue vivo (la API lo deja `HELD`) y se vuelve a pagar con otra tarjeta (otra referencia, otra clave).
- **En proceso (202):** `GET /bookings/{id}` a 2, 4, 8, 16 s y luego cada 30 s, con tope de 2 minutos; pasado el tope: "Seguimos procesando tu compra; la verás en Mis viajes", sin reintentar la compra.
- **Liberar el hold:** al pulsar "Cancelar" y al salir del flujo a otra sección (el hold se libera; la selección y lo escrito se conservan). Un 404/409 al liberar no se muestra. **No** se libera en `pagehide`: el navegador no distingue una recarga de un cierre, y recargar debe reutilizar el hold; si se cierra la pestaña, el hold vence solo en ≤ 15 minutos.
- **Pasajeros** como borrador en sessionStorage: sobreviven a refrescar, a un hold vencido y a buscar de nuevo; se borran al confirmar o cancelar.
- **Tarjetas de prueba** (ficticias, Luhn válido; se muestran solo con el mock o en desarrollo): `4111111111111111` aprobada, `4000000000000002` rechazada, `4000000000003220` pago pendiente; cualquier otra válida se aprueba. Cualquier vencimiento futuro y CVV de 3 dígitos.

---

## 5b. Selector de asientos (F5)

Módulo independiente `src/features/seats`, sin ninguna dependencia del estado del checkout. Se ve y se prueba en `/componentes/asientos` (solo desarrollo, con el mock).

### Cómo se enchufa

```tsx
import { SeatSelector, seatSegmentsFromLegs, toAssignedSeats, type SeatAssignments } from '@/features/seats';

const segments = seatSegmentsFromLegs(outbound, inbound);       // SelectedLeg del paso 1 (cabina = la de la tarifa)
const passengers = [{ id: 'p1', name: 'Ana', type: 'ADULT' }];  // type: ADULT | YOUTH | CHILD | INFANT
const [seats, setSeats] = useState<SeatAssignments>({});        // {} = todo automático

<SeatSelector
  offerId={hold.offerId}
  segments={segments}
  passengers={passengers}
  value={seats}
  onChange={setSeats}
  onConflict={(c) => { /* informativo: el asiento ya se quitó de `value` */ }}
  serverError={bookingError}   // el ApiError de POST /bookings; null si no hay
/>
```

| Prop | Qué es |
|---|---|
| `offerId` | `offerId` de la oferta (el mapa se pide con `GET /offers/{offerId}/seatmap?segmentId=…`, público) |
| `segments` | `SeatSegment[]`: `id` (= `segmentId`), vuelo, origen, destino, `cabin` de la tarifa, `leg` (`outbound`/`inbound`) e `indexInLeg`/`legSize` para rotular "Ida, tramo 1 de 2". `seatSegmentsFromLegs(outbound, inbound?)` los arma desde la selección |
| `passengers` | `{ id, name, type }`. El `id` debe ser el `passengerId` que irá en `PassengerItem`. Los `INFANT` se muestran pero no ocupan asiento |
| `value` / `onChange` | Componente controlado. Formato: `Record<passengerId, Record<segmentId, seatNumber>>`, p. ej. `{ p1: { 'seg-1': '12A' } }`. Sin entradas = "asignar automáticamente" (camino feliz: no hay que tocar nada) |
| `onConflict` | Avisa un asiento elegido que dejó de servir (`SEAT_TAKEN` o `CABIN_MISMATCH`) con `segmentId`, `passengerId`, `seatNumber` y `alternative` (el libre más cercano de la cabina correcta). Llega **después** de que `onChange` entregó el valor sin ese asiento |
| `serverError` | El error de la reserva. Con `SEAT_TAKEN` (409) o `SEAT_CABIN_MISMATCH` (422) el selector vuelve a pedir los mapas de los tramos con asientos elegidos, quita lo que ya no sirve, conserva lo demás y lo explica. Cualquier otro error se ignora. Se procesa al cambiar la referencia del objeto |

**Mapeo a `PassengerItem`:** `toAssignedSeats(value, passengerId, segments)` devuelve `{ segmentId, seatNumber }[]`, exactamente `PassengerItem.assignedSeats` (una prueba lo comprueba contra los tipos generados). Si queda vacío, **omitir el campo**. Los bebés nunca tienen entrada. La compra (`features/checkout`) ya lo usa así: `BookingPassenger.seats` es `assignedSeats` por tramo y el formulario guarda la elección como `passengerId → segmentId → asiento`.

### Qué hace

- Un mapa por tramo (pestañas Ida / Vuelta / escalas), generado desde las filas y letras del contrato: pasillo, alas (solo referencia visual), salidas de emergencia, filas con espacio extra y baños (decoración: la API no manda baños ni alas).
- Chips por pasajero: se elige quién, luego el asiento, y pasa solo al siguiente sin asiento. Elegir de nuevo el propio asiento lo quita.
- Filtros (ventana, pasillo, juntos, más espacio), "Recomiéndame" (sienta al grupo junto si puede), "Asignar automáticamente" y alternativa en lista (tabla) siempre disponible.
- Estados con icono, patrón y texto: libre (letra), ocupado (rayado y X), elegido (relleno, visto y número del pasajero), salida (puerta), espacio extra (flecha vertical), otra cabina (punteado y candado).
- Accesibilidad: cuadrícula ARIA con roving tabindex (flechas, Inicio/Fin, Ctrl+Inicio/Fin, RePág/AvPág, Enter/Espacio), `aria-label` por asiento ("Asiento 12A, ventana, espacio extra, disponible"), anuncios con `aria-live`/`role="alert"`, zoom con botones (100 a 200 %), asientos de 44 px, scroll solo dentro del contenedor del mapa, menos movimiento respetado.
- Al volver a la pestaña del navegador el mapa se refresca (mínimo 3 s entre peticiones); mapas en memoria 20 s para no gastar el límite de 60 consultas/minuto al cambiar de pestaña.

### Decisiones y diferencias

- **Cabina:** solo se pueden elegir asientos de la cabina de la tarifa (el contrato lo dice); los de otra cabina se ven, pero bloqueados. La lista solo muestra los de la cabina elegible.
- **`isAvailable`** es `false` si el asiento está asignado o su cabina no tiene stock; solo `true` cuenta como libre (todos los campos del contrato son opcionales y se toleran faltantes). No existe "retenido".
- **"Más espacio"** incluye `EXTRA_LEGROOM` y `EMERGENCY_EXIT`. **"Juntos"** busca tiras de asientos libres seguidas, sin cruzar el pasillo, para el total de pasajeros con asiento.
- **Reglas de salida de emergencia:** el contrato no define restricciones. La interfaz no inventa ninguna; solo evita recomendar una salida si viaja un niño y avisa en la leyenda. Hay que confirmar con la aerolínea/API si debe bloquearse.
- **409 y 422 no dicen qué asiento falló.** Por eso el selector compara lo elegido con un mapa recién pedido; si no encuentra nada, muestra un aviso general. El `detail` técnico nunca se muestra ni se interpreta.
- **Mock:** el diseño de cabinas es el de la semilla (A320, A319, ATR72), igual que la API. Desde la integración (F5) el mapa nace **todo libre** y solo ocupan las reservas hechas en el propio mock, como la API real; `shared/api/mock/seatSimulation.ts` (asientos ocupados simulados y errores 409/422) sigue sirviendo a la demo y a las pruebas.
- **Textos:** viven en `shared/i18n/seats.ts` (se incluye como `es.seats`) para no chocar con F4 en `es.ts`; se pueden mover a `es.ts` al fusionar.
- Fuera de esta fase: copiar la elección de un tramo al siguiente y bloquear por tipo de pasajero.

### Pruebas

- `src/features/seats/model/*.test.ts`: generación del mapa (A320, A319, ATR72), selección, filtros, recomendación, revisión contra mapa nuevo y compatibilidad con `assignedSeats`.
- `src/features/seats/components/SeatSelector.test.tsx`: teclado, `aria-label`, selección y avance, zoom, lista, estados de carga/vacío/error, refresco al volver a la pestaña, 409 y 422.
- `e2e/seats-demo.mjs`: recorrido con Playwright sobre la demo (mock) a 320, 768 y 1280 px, con capturas. No es parte de `npm run test` ni agrega dependencias (ver el encabezado del archivo).

---

## 5c. Mis viajes y postventa (F6)

> **Estado:** hecha y probada con el mock. **No se ha verificado ninguna llamada contra la API real** (el backend local no respondió
> durante la fase). Lo que se asume y lo que falta comprobar está en `docs/DISCREPANCIAS-F6.md`, en «Pendiente de verificación real».

Todo cuelga de `/viajes` (sesión obligatoria, bajo `RequireAuth`). Las pantallas solo arman piezas; la lógica vive en `features/trips`,
`features/checkin`, `features/aftersale` y `features/flight-status`, y todo pasa por `FlightsApi`.

### Qué hace cada pantalla

| Ruta | Qué hace | Cómo maneja los estados |
|---|---|---|
| `/viajes` | Lista paginada por cursor («Cargar más viajes», 10 por página) con Próximos, Pasados y Cancelados y su cantidad | Próximos: el más cercano primero. Si falla «Cargar más», lo ya cargado sigue a la vista. Sin reservas: invita a buscar vuelos |
| `/viajes/:id` | Resumen, estado del vuelo en vivo (con aviso de retraso), pasajeros, boletos y los trámites | Un trámite que no se puede usar se ve desactivado y dice por qué (el check-in dice cuándo abre) |
| `/viajes/:id/boletos` | Boletos electrónicos por pasajero y sus tramos (cupones) | Un infante tiene su boleto pero no pase propio |
| `/viajes/:id/check-in` | Check-in de todos los pasajeros | Ventana de 48 h a 60 min antes de la salida; `Idempotency-Key` por intento; lleva a los pases |
| `/viajes/:id/pases` | Pase por pasajero y tramo con QR, asiento, grupo y posición; «Imprimir / Guardar PDF» | Antes del check-in explica que aún no hay pases y lleva al check-in. El QR es SVG negro sobre blanco, también en modo oscuro |
| `/viajes/:id/equipaje` | Cantidades por pasajero e itinerario, total en vivo, revisión y pago simulado | 200 «Equipaje agregado»; 202 «Pago en proceso» con «Actualizar ahora»; 422 «El pago fue rechazado» y se conserva lo elegido |
| `/viajes/:id/cambiar-fecha` | Nueva fecha → alternativas con la diferencia de tarifa → antes y después + pago si hay algo que pagar | 200 hecho; 202 `CHANGE_PENDING`; 422 se conserva la elección; 410 oferta vencida vuelve a la búsqueda |
| `/viajes/:id/cancelar` | Cotización (total, penalidad, reembolso) → diálogo con «Entiendo que esta acción no se puede deshacer» | 200 cancelada; 202 `CANCELLATION_PENDING`; cotización vencida pide otra; la reserva pasa a Cancelados |

### Qué trámites se ofrecen (`features/trips/bookingActions.ts`)

| Estado de la reserva | Check-in | Pases | Equipaje | Cambio de fecha | Cancelar |
|---|---|---|---|---|---|
| `CONFIRMED` antes de la salida | Solo dentro de la ventana | Sí | Sí | Sí, si todas las tarifas son cambiables (Basic no) | Sí |
| `CONFIRMED` con el vuelo ya salido | No | Sí | No | No | No |
| `PENDING`, `PENDING_PAYMENT`, `TICKET_ISSUING` | No (confirmar primero) | No | No | No | No |
| `CHANGE_PENDING`, `CANCELLATION_PENDING` | No (trámite en proceso) | No | No | No | No |
| `CANCELLED`, `FAILED` | Ninguno se ofrece | | | | |

Una reserva con solo infantes no ofrece equipaje (el infante viaja en brazos y no ocupa asiento).

### Reglas que no se negocian

- **`Idempotency-Key`:** un UUID por intento del usuario (`shared/lib/attemptKeys.ts`). El mismo contenido (reintento tras un error de red, 202, doble clic) reenvía la **misma** clave; si cambia el pago o la cantidad, la clave es **nueva**; al terminar bien se olvida. Solo se guarda la huella del contenido, en `sessionStorage`. Nunca se reintenta una escritura sola.
- **200/201, 202 y 422:** `PostSaleOutcome` = hecho | pendiente. Cualquier 2xx distinto de 202 es «hecho». El 422 de pago rechazado deja la selección intacta y cambia la referencia por una nueva (es otro pago: otra clave).
- **Varias maletas son varias peticiones:** la API acepta un pasajero y un itinerario por petición; cada una con su referencia (`PAY-OK-ABC`, `PAY-OK-ABC2`…) y su clave. Si una falla, se detiene y no se cobra el resto.
- **Permiso (403):** muestra «Tu cuenta no tiene permiso para esta acción…», nunca «pago rechazado».
- **Pago simulado:** la referencia `PAY-OK-…`, `PAY-PEND-…` o `PAY-REJ-…`; nunca datos de tarjeta. Los botones «Aprobar / Dejar pendiente / Rechazar» están dentro de `<MockOnly>`.
- **QR en el cliente:** `qrcode-generator` (22 kB, 8 kB comprimido, sin dependencias), cargado solo al abrir los pases (`lazy`); dibuja un SVG sin `innerHTML` con el texto `barcode` tal cual lo da la API.
- **Impresión:** los pases usan variantes `print:` de Tailwind: se oculta el menú, las pestañas y los botones y cada pase no se parte entre páginas.
- **Accesibilidad:** foco al encabezado al cambiar de ruta, diálogo de cancelación con el foco inicial en la opción segura, resultados anunciados con `aria-live` (éxito y proceso `polite`; rechazo y error `assertive`), contadores de equipaje con nombre accesible, sin elementos clicables que no sean enlaces o botones.

### Cómo probar con el mock (`VITE_API_URL` vacía)

Ingresa con la cuenta demo (`demo@quinde.ec`, la contraseña está en las pistas «Para probar» de `/ingresar`). Las reservas de demostración se regeneran cada día:

| Código | Qué sirve para probar |
|---|---|
| `QD7K2M` | Dentro de la ventana de check-in (si hay un vuelo UIO → GYE en las próximas horas): check-in 200 y luego pases |
| `QG4P9X` | A 21 días, Flex: fuera de ventana (el check-in está desactivado con su motivo), cambio de fecha y cancelación con reembolso |
| `QR2V6W` | A 3 días, Classic, con un infante y un vuelo **retrasado 45 minutos** (insignia y aviso) |
| `QW8M3K` | A 11 días, Flex: su cancelación responde **202** y queda «en proceso» |
| `QB5T1N` | Basic: el cambio de fecha no está disponible y la cancelación no devuelve dinero |
| `QP1A5B` | Ya viajó (pestaña Pasados): solo los pases siguen disponibles |
| `QC9S4Z` | Cancelada (pestaña Cancelados) |

En equipaje y cambio de fecha, los botones «Para probar» ponen una referencia `PAY-OK-` (200), `PAY-PEND-` (202; a los 20 s el siguiente «Actualizar» ya lo ve terminado) o `PAY-REJ-` (422).
Las reglas del mock siguen lo que **dice el código del backend** (leído, no ejecutado; ver `docs/DISCREPANCIAS-F6.md`, sección 0): maletas extra por familia (Basic 2, Classic 2, Flex 3, Business Flex 4; el infante, 0), cargo por cambio Classic = 20 % de la tarifa base de un adulto por pasajero con asiento (Flex 0; Basic no cambia), total del cambio = `max(0, tarifa + impuestos) + cargo` (nunca devuelve dinero), oferta de cambio y cotización de 15 min, penalidad de cancelación Basic 100 % / Classic 35 % / Flex 10 % / Business Flex 0 %, check-in por vuelo, pases PDF417 (económica) o AZTEC y un trabajo pendiente que se resuelve a los 20 s (el real, cada 30 s).
Los errores aleatorios del mock se apagan con `VITE_MOCK_ERROR_RATE=0`.

### Verificación F6 contra API real

Pasos exactos para recorrer la F6 contra el backend **local**. Nunca contra Render, nunca con la cuenta de administrador sembrada, nunca con `./db/reset.sh`.

1. **Preparar.** Con el backend corriendo en `http://localhost:3010` y `CORS_ORIGINS=http://localhost:5173`, crea `.env.local` (no se sube a git) con `VITE_API_URL=http://localhost:3010/flights/v1` y arranca `npm run dev`. En la consola del navegador no debe haber errores de CORS. No pegues tokens ni contraseñas en capturas, chats ni registros.
2. **Cuenta y una reserva.** Regístrate con una cuenta de prueba nueva y compra un vuelo con `PAY-OK-…` (flujo de la sección 5). Para el check-in elige un vuelo que salga **entre 60 minutos y 48 horas** desde ahora; para el resto, uno más lejano (Classic o Flex: Basic no admite cambio de fecha). Compra una segunda reserva solo para cancelar, así no pierdes la primera.
3. **Lista (`/viajes`).** La reserva aparece en Próximos con ruta, fecha, estado y total. Cambia de pestaña. Con más de 10 reservas, «Cargar más viajes» pide la página siguiente sin repetir. *Anota:* orden, estado exacto, si `departureDate` coincide con la fecha local del aeropuerto.
4. **Detalle y boletos.** Abre la reserva: estado del vuelo, pasajeros y, en `/boletos`, un boleto por pasajero con su número. *Anota:* estados de boleto, número de 13 dígitos.
5. **Check-in.** Fuera de ventana, la página no ofrece el botón y explica cuándo abre (para ver el 409 `CHECK_IN_NOT_AVAILABLE` real usa el Swagger del backend local en `/api/docs`). Dentro de la ventana: «Hacer check-in» → 200 con asiento por tramo. Repite el clic: no debe hacer dos check-in. *Anota:* qué responde al repetir; en una ida y vuelta con solo la ida abierta debe dar 200 `IN_PROGRESS` y la pantalla debe decir «Listo para los vuelos que ya estaban abiertos» (no un error).
6. **Pases.** Antes del check-in, `/pases` explica que aún no hay pases (la API responde 200 con la lista vacía) y no ofrece imprimir. Después, un pase por pasajero con asiento y QR. Escanea el QR con otro dispositivo y compara con el «Texto del código». Prueba «Imprimir / Guardar PDF». *Anota:* `barcodeType` (la API real nunca manda QR: PDF417 en económica o AZTEC en las demás; la pantalla lo dibuja como QR con el mismo texto y lo avisa, así que **compara el texto, no esperes que un lector de aeropuerto lo acepte**) y qué trae `boardingGroup`/`boardingPosition`.
7. **Equipaje, tres veces** (cada intento usa una referencia nueva; los botones «Para probar» no aparecen con la API real: escribe la referencia en el campo):
   - `PAY-OK-` + 8 letras o números → 200 «Equipaje agregado»; recarga y comprueba «Ya compraste 1».
   - `PAY-PEND-…` → 202 «Pago en proceso»; espera 20–30 s y pulsa «Actualizar ahora» hasta ver «Listo».
   - `PAY-REJ-…` → «El pago fue rechazado», **la selección sigue ahí**; escribe `PAY-OK-…` y paga de nuevo.
   - Intenta pasar el máximo y comprueba el 409. *Anota:* si el rechazo llega como 422 `PAYMENT_NOT_AUTHORIZED` (el contrato no lo declara aquí).
8. **Cambio de fecha.** Elige una fecha con vuelos y otra sin vuelos (debe dar «No hay vuelos»). Confirma con `PAY-OK-…` y revisa la nueva fecha en el detalle; repite con `PAY-REJ-…` (la oferta se conserva) y `PAY-PEND-…` (queda `CHANGE_PENDING` y luego confirmada). Si alguna alternativa cuesta 0, comprueba que no pide pago; la API nunca devuelve dinero en un cambio (si el nuevo vuelo cuesta menos, la pantalla avisa que esa diferencia no se devuelve). *Anota:* qué pasa con los asientos, la vigencia de la oferta y la moneda de los importes.
9. **Cancelación (al final).** Abre `/cancelar` de la segunda reserva: cotización con total, penalidad y reembolso (comprueba que sumen). Marca «Entiendo…», confirma → 200 o 202 y la reserva sale en Cancelados. *Anota:* reembolso por familia, vigencia de la cotización, el cuerpo del 200 y si hay 202.
10. **Permisos y ajenos.** Con un token sin `flights:cancel` (si puedes crearlo) el intento debe mostrar el mensaje de permiso. Con otra cuenta, abrir la URL de una reserva ajena debe mostrar «No encontramos este viaje» (404).
11. **Reportar.** Por cada paso anota ✅ o ❌ y la diferencia en `docs/DISCREPANCIAS-F6.md` (sección 1): lo que se confirme se pasa a «Lo que aprendimos de la API real» de la sección 6 de este README y se ajusta el código marcado con `// DISCREPANCIA:`.

---

## 6. Reglas de la API que el frontend respeta

- **Rutas públicas:** búsqueda, mapa de asientos y estado de vuelo. Todo lo demás exige sesión.
- **Sesión:** token de acceso de 15 minutos y token de renovación de 7 días que rota en cada uso. Reutilizar un token de renovación viejo cierra la sesión (toda su familia de tokens), así que la renovación se hace una sola vez a la vez, nunca en paralelo, ni siquiera entre pestañas.
- **Hold:** dura 15 minutos y aparta cupo real. Si el usuario cancela o sale del flujo, se libera.
- **Reservas:** solo las ve su dueño. Una reserva ajena responde 404.
- **Pago simulado por prefijo de la referencia:** `PAY-OK-` aprobado (201), `PAY-PEND-` pendiente (202), `PAY-REJ-` rechazado (422).
- **Check-in:** abre 48 horas antes de la salida y cierra 60 minutos antes.
- **Errores:** llegan en formato ProblemDetails. Se manejan 400, 401, 403, 404, 409, 422, 429 (demasiadas peticiones) y 503 (con `Retry-After`). Cada uno tiene un mensaje en lenguaje simple que dice qué pasó y qué hacer.
- **Arranque en frío:** el plan gratuito de Render duerme tras 15 minutos sin tráfico; la primera petición puede tardar cerca de un minuto. La interfaz lo explica en vez de parecer colgada.
- **CORS:** el origen del frontend (por ejemplo `http://localhost:5173` y el dominio publicado) debe estar en `CORS_ORIGINS` del backend.
- Ante la duda, manda el contrato. Las diferencias conocidas están en `docs/DISCREPANCIAS-CONTRATO.md` del backend.

### Lo que aprendimos de la API real (F2)

Verificado con curl, búsquedas reales y `npm run test:api` contra el backend local y contra Render:

- **Ida y vuelta es UNA búsqueda** con dos tramos en `itineraries`. Cada oferta es una combinación ida + vuelta de la misma aerolínea; `grandTotal` es la combinación más barata para todos los pasajeros. La interfaz agrupa las ofertas por ida para conservar "elige ida, luego vuelta", y guarda el `offerId` de la combinación elegida (lo pide el hold en F4).
- **No se filtra por cabina** (`cabin` en el cuerpo es 400): cada itinerario trae todas sus familias (`ECONOMY`: `BASIC`, `CLASSIC`, `FLEX`; `BUSINESS`: `BUSINESS_FLEX`) y la interfaz muestra las de la cabina elegida. La API da el código de la familia, no el nombre.
- **Dinero como texto** (`"94.38"`): se convierte a centavos enteros y se suma en enteros. Los precios son por pasajero de cada tipo (`ADULT`, `YOUTH`, `CHILD`, `INFANT`; el contrato los deja como texto libre).
- **Horas siempre en UTC** (`…Z`); la interfaz las muestra en la hora local del aeropuerto (UTC−5 continente, UTC−6 Galápagos).
- **`X-Device-Fingerprint` es obligatoria** en `POST /search` (8 a 128 caracteres `A-Za-z0-9._:+/=-`): se envía un identificador aleatorio guardado en el navegador.
- **Número de vuelo** con prefijo de aerolínea (`LA1400`, `AV1500`), no `QD…`.
- **Límites de tasa** por IP: 100 por minuto en toda la API, 20 búsquedas por minuto, 60 consultas por minuto de mapa de asientos y de estado de vuelo. Cada respuesta trae `X-RateLimit-*` y un 429 trae `Retry-After`.
- **Ventana de salidas**: la semilla genera 90 días **desde su carga** y no se recorre. Medido: local del 2026-10-08 al **2027-01-05**; Render hasta el **2027-01-04** (se cargaron con un día de diferencia). Fuera de la ventana la búsqueda responde **200 sin ofertas** (la interfaz lo muestra como "sin vuelos esa fecha"); una fecha pasada es 400.
- **Arranque en frío** de Render medido: **51,8 s** hasta responder `/health`. Supera el timeout de 45 s, por eso las lecturas que agotan el tiempo se reintentan una vez.
- **CORS**: el backend local acepta `http://localhost:5173`; Render no (por eso Render solo se usa desde Node con `test:api`).

Diferencias con el contrato encontradas en esta fase (además de las de `docs/DISCREPANCIAS-CONTRATO.md` del backend):

| Contrato | API real |
|---|---|
| `pricePerPassengerType[].passengerType` es texto libre | Siempre `ADULT`, `YOUTH`, `CHILD` o `INFANT` |
| 404 sin código propio en la lista de `code` | Llega con `code: VALIDATION_FAILED` (es la discrepancia 2.1 del backend) |
| `X-Device-Fingerprint` sin formato | Exige 8–128 caracteres (3.2 del backend) |
| Horas `date-time` sin zona definida | Siempre UTC (4.10 del backend) |

Las respuestas de búsqueda, mapa de asientos, estado de vuelo y los ProblemDetails de 400 y 404 **cumplen los esquemas del contrato** (Ajv, local y Render).

### Lo que aprendimos de `/auth/*` (F3)

Verificado con curl y `npm run test:api` contra el **backend local** (en Render no se crean usuarios):

- **El registro no inicia sesión.** `POST /auth/register` responde 201 con el usuario y **sin tokens**; el frontend ingresa justo después con `POST /auth/login`. Si ese ingreso falla (por ejemplo, un 429), la cuenta ya existe y la pantalla lo dice así, sin anunciar que el registro falló.
- **La cuenta es solo correo y contraseña.** No hay nombre, teléfono ni documento, y no hay endpoint para editar: Mi perfil es de solo lectura (`GET /auth/me`: correo, fecha de alta, roles y permisos).
- **El rol lo decide el backend:** todo registro queda como `cliente`. El frontend nunca envía un rol.
- **Reglas de los datos** (las mismas que los DTO del backend, en `shared/lib/credentials.ts`): el correo se recorta, se normaliza (NFC) y va en minúsculas, máximo 254 caracteres, con dominio y TLD, sin IP, sin nombre visible, sin caracteres de control, invisibles ni etiquetas HTML. La contraseña tiene de 12 a 128 caracteres medidos tras NFKC, **sin recortar** y sin reglas de composición (una frase sirve).
- **Tokens:** el access token es un JWT (`expires_in` 900); el refresh token es opaco (43 caracteres base64url). Los campos van en snake_case (`access_token`, `refresh_token`, `expires_in`).
- **Rotación:** cada `POST /auth/refresh` devuelve un refresh token nuevo y el anterior deja de servir. Reusar el anterior responde **401** (`code: VALIDATION_FAILED`, "The refresh token is invalid or expired") **y revoca toda la familia**: el token vigente también deja de servir.
- **`POST /auth/logout` exige Bearer** además del `refresh_token` en el cuerpo; responde 204 y revoca ese refresh token.
- **Errores:** credenciales incorrectas = 401 genérico (no dice si el correo existe); correo ya registrado = **409 con `code: VALIDATION_FAILED`** (no hay un código propio); datos inválidos = 400.
- **Límites por IP:** ingreso 5 por minuto (los fallidos cuentan), registro 10 cada 10 minutos, renovación 30 por minuto. El 429 trae `Retry-After` (60 s medidos en el ingreso) y la pantalla dice cuánto esperar.
- Las rutas públicas ignoran un `Authorization` inválido, pero el frontend igual **no envía el token** en ellas.

### Lo que aprendimos de hold y reserva (F4a)

Verificado contra el **backend local** el 2026-10-07 (en Render no se crean holds ni reservas):

| Caso | Respuesta real |
|---|---|
| `POST /offers/hold` | 201 `HoldResponse` (`HELD`, `expiresAt`, `ttlMinutes: 15`, `lockedPrice` con `baseFare` y `taxes`) |
| Misma `Idempotency-Key` y mismo cuerpo | 201 con **el mismo hold** y la cabecera `Idempotent-Replayed: true` (la respuesta original, aunque haya pasado tiempo) |
| Misma clave, cuerpo distinto | 422 `VALIDATION_FAILED`, `invalidParams: Idempotency-Key` |
| Sin `Idempotency-Key` (o no es UUID) | 400 `VALIDATION_FAILED` |
| Oferta inexistente o vencida, tarifa sin cupo | 409 `OFFER_NO_LONGER_AVAILABLE` |
| `GET /offers/hold/{id}` | 200 `HoldStatusResponse` con `remainingSeconds` (calculado por el servidor). No repite el `holdId`. Ajeno o inexistente: 404 |
| `DELETE` de un hold vivo, vencido o ya liberado | 204 (liberar dos veces no es error) |
| `DELETE` de un hold usado en una reserva | **409** (fuera del contrato) |
| `POST /bookings` con `PAY-OK-…` | 201 `CONFIRMED` con un boleto `ISSUED` por pasajero y número de 13 dígitos |
| Con `PAY-PEND-…` | 202 `PENDING_PAYMENT`, boletos `PENDING`; a los ~20 s `GET /bookings/{id}` ya da `CONFIRMED` (el proceso de emisión corre cada 30 s) |
| Con `PAY-REJ-…` | 422 `PAYMENT_NOT_AUTHORIZED`; **el hold sigue `HELD`** con el mismo tiempo: se puede pagar otra vez |
| Referencia que no es `PAY-(OK\|PEND\|REJ)-…` | 422 `PAYMENT_REFERENCE_INVALID` |
| Referencia ya usada en otra reserva | 409 `PAYMENT_REFERENCE_INVALID` (cada intento de pago necesita una referencia nueva) |
| Reserva repetida con la misma clave y cuerpo | 201 con **la misma reserva** e `Idempotent-Replayed: true` |
| Hold ya usado, con otra clave | 409 `OFFER_NO_LONGER_AVAILABLE` |
| Hold vencido o liberado | 410 `OFFER_NO_LONGER_AVAILABLE` |
| Hold inexistente o ajeno | 422 `VALIDATION_FAILED` (`invalidParams: holdId`), no 404 |
| Límites por IP | 30 holds y **10 reservas por minuto** (además del global de 100); el 429 trae `Retry-After` |

- La reserva devuelve la familia vendida **sin precios por tipo** (`pricePerPassengerType: []`) y el `grandTotal` congelado del hold; los pasajeros vuelven con su documento y contacto.
- Reglas del pasajero (las del DTO del backend): nombre con letras, espacios, `'`, `.` y `-` (hasta 60); documento de 5 a 20 letras o dígitos; cédula ecuatoriana con módulo 10; pasaporte con vencimiento obligatorio y posterior al último vuelo; nacionalidad ISO alfa-2; teléfono de 7 a 15 dígitos con `+` opcional; **edad el día del primer vuelo: infante < 2, niño 2–11, joven 12–17, adulto ≥ 18**; cada infante va con un adulto distinto (`associatedAdultId`).
- **Nacionalidad:** la tabla `pais` del backend solo trae Ecuador (`db/semilla_vuelos.sql`). Con cualquier otro código la reserva responde 422 `VALIDATION_FAILED` con `invalidParams: passengers[n].nationality` "is not a country this API knows" (comprobado con CO, PE, US, ES, AR, BR y JP, y con un documento válido). Por eso el formulario solo deja elegir Ecuador y marca el resto como no disponible.
- **Reloj:** durante la prueba el reloj de este equipo iba ~5 minutos adelantado al del backend. Por eso el temporizador nunca compara `expiresAt` con la hora local: usa `remainingSeconds` (o `ttlMinutes` al crear) contado desde que llegó la respuesta, y se vuelve a sincronizar con `GET` del hold.

### Lo que aprendimos de asientos (F5)

Verificado contra el **backend local** el 2026-10-07 (en Render no se crean reservas). Con ida y vuelta con escala (4 tramos, 2 adultos) y con el selector del navegador:

- **Forma real de `SeatMapResponse`:** `{ segmentId, cabins: [{ cabinClass, rows: [{ rowNumber, seats: [{ seatNumber, isAvailable, characteristics }] }] }] }`. Todos los campos vienen siempre; sin precios; `characteristics` ⊂ `WINDOW`, `AISLE`, `EXTRA_LEGROOM`, `EMERGENCY_EXIT`. Cada mapa trae **todas las cabinas del avión**, con `isAvailable` también en las que no son la tuya.
- **Aviones:** A320 (negocios filas 1–3 `ACDF`; economía filas 10–30 `ABCDEF`, salidas 12 y 13, espacio extra en la 10), A319 (1–2 y 7–26) y ATR72 (1–18 `ACDF`, salidas 9 y 10, espacio extra en la 1). El mock tiene el mismo diseño.
- **`isAvailable`:** `false` solo en los asientos de reservas hechas (verificado: tras reservar 11A y 11B, el mapa pasó de 126 a 124 libres). **No hay ocupación inventada**: un vuelo sin reservas viene todo libre.
- **Asignación automática:** sin elegir nada, la API da el primer asiento libre de la cabina por fila y letra (`10A`, el de espacio extra) en **cada** tramo; el infante queda con `assignedSeats: []`.
- **Errores al reservar con asientos** (el hold sigue `HELD` en todos y la referencia de pago se puede reusar):

| Caso | Respuesta real |
|---|---|
| Asiento ocupado | **409** `SEAT_TAKEN`, `detail` "Seat 11A is already taken on this flight", **sin `invalidParams`**. La interfaz no interpreta el `detail`: compara contra un mapa nuevo |
| Asiento de otra cabina | **422** `SEAT_CABIN_MISMATCH`, `invalidParams: passengers[n].assignedSeats` (sin decir el asiento) |
| Asiento que no existe (`99Z`) | 422 `VALIDATION_FAILED`, `passengers[n].assignedSeats` |
| Tramo que no es del hold | 422 `VALIDATION_FAILED`, `passengers[n].assignedSeats[m].segmentId` |
| El mismo asiento para dos pasajeros | 400 `VALIDATION_FAILED`, `passengers[1].assignedSeats[0].seatNumber` |
| Formato inválido (`12`) | 400 `VALIDATION_FAILED`, `...seatNumber` |
| Infante con asiento | 422 `INFANT_SEAT_NOT_ALLOWED`, `passengers[n].assignedSeats` |

- **Cómo lo maneja el paso 2:** ante `SEAT_TAKEN`, `SEAT_CABIN_MISMATCH` o cualquier rechazo de `assignedSeats`, el paso 3 devuelve al paso 2 con el bloque de asientos abierto y un aviso ("Revisa tus asientos"); el selector pide mapas nuevos de los tramos con asientos elegidos, quita solo lo que ya no sirve y **conserva el resto**; el hold no se toca y el pago siguiente es un pedido nuevo (otra clave y otra referencia). Se comprobó en el navegador: otra sesión reservó el 26A del primer tramo mientras se pagaba, y las otras 7 elecciones se conservaron. El 422 de cabina se comprobó con la respuesta real interceptada una vez.
- **Límites:** cada consulta del mapa cuesta del límite global (100 por minuto por IP). Abrir el selector de un viaje de 4 tramos pide 4 mapas; tras un error de asiento, otros 4.
- **Nacionalidad** (F4b): la API solo conoce Ecuador; ver "Lo que aprendimos de hold y reserva".

**Diferencias entre el mock y la API real encontradas en esta fase** (todas corregidas en el mock):

| Qué | Mock antes | API real / mock ahora |
|---|---|---|
| Ocupación | ~35 % de asientos ocupados al azar | Todo libre; solo ocupan las reservas hechas |
| Asignación automática | `free[i]` de cualquier cabina | Primer libre de **la cabina de la tarifa**, por fila y letra |
| Asientos elegidos | Se aceptaban sin validar | 400/422/409 con los códigos de la tabla |
| `SEAT_TAKEN` | Solo por la simulación de la demo | También por una reserva anterior del mismo asiento |

### Lo que aprendimos de la postventa (F6)

Fuente: lo que probó el dueño contra el backend local (pases) y la lectura del código del backend (**no ejecutado**: cada fila espera su verificación en marcha, ver `docs/DISCREPANCIAS-F6.md`).

| Caso | Respuesta real |
|---|---|
| `GET .../boarding-passes` antes del check-in o con la reserva no confirmada | **200 con `boardingPasses: []`** (no 409). Confirmado por el dueño |
| `barcodeType` de un pase | Nunca `QR`: `PDF417` en económica, `AZTEC` en las demás cabinas |
| Ventana de check-in | Por vuelo (48 h a 60 min); un vuelo en ventana y otro no = 200 `IN_PROGRESS`; el estado del pasajero es `NOT_CHECKED_IN` si falta cualquier vuelo |
| `GET .../baggage-options` | Una fila por pasajero e itinerario; el infante con `maxAllowed: 0` |
| `totalToPay` de un cambio de fecha | `max(0, fareDifference + taxDifference) + changeFee`: nunca negativo; no hay reembolso |
| Cancelación | Penalidad por familia (Basic 100 %, Classic 35 %, Flex 10 %, Business Flex 0 %); cotización de 15 min; `reason` hasta 500 sin HTML ni saltos de línea |
| Errores sin código propio | `code: VALIDATION_FAILED` y solo el estado HTTP los distingue: 409 = reserva no confirmada, oferta ya usada o trámite en curso; 422 con `changeOfferId`/`quoteId` = oferta o cotización vencida y ya borrada |
| 401 por token vencido | `code: VALIDATION_FAILED`, `detail: The access token expired` (sin código propio); el cliente renueva y reintenta una vez |

### Modelo de seguridad de la sesión

| Qué | Dónde | Por qué |
|---|---|---|
| Access token | **Solo en memoria** (`SessionManager`) | No queda en ningún almacén que un script pueda leer más tarde. Nunca en cookies propias, en la URL ni en logs. |
| Refresh token | `sessionStorage` por defecto; `localStorage` solo con "Mantener mi sesión iniciada" | Recargar la página no cierra la sesión. Sin la casilla, cerrar la pestaña la termina. |
| Huellas de tokens ya rotados | `localStorage` (`quinde.auth.rotated`, hash FNV-1a, nunca el token) | Una pestaña duplicada con una copia vieja en su `sessionStorage` no la envía (evita que la API lo tome por un robo). |
| Tokens nuevos tras renovar | `BroadcastChannel` entre pestañas del mismo origen | Las demás pestañas adoptan el token rotado en vez de renovar otra vez. |

- **Una sola renovación a la vez:** una promesa compartida dentro de la pestaña y Web Locks (`quinde-auth-refresh`) entre pestañas; con el candado tomado se vuelve a leer el almacén por si otra pestaña ya renovó. Sin Web Locks se usa un candado local.
- **Proactiva y reactiva:** se renueva poco antes de vencer (con el `expires_in` relativo, para que un reloj desfasado no provoque renovaciones en bucle) y, ante un 401, se renueva una vez y se reintenta la petición una vez; un segundo 401 cierra la sesión.
- **Si la renovación es rechazada** (401/403): se borra todo, se avisa "Tu sesión se cerró por seguridad. Ingresa de nuevo." y se va a `/ingresar?volver=…`. La selección de compra no se pierde.
- **Si la restauración falla por conexión** (sin red, tiempo agotado, 503), la sesión no se da por cerrada: el token sigue guardado y las rutas con sesión muestran "No pudimos recuperar tu sesión" con "Intentar de nuevo" (respeta `Retry-After`), en vez de mandar a ingresar.
- **Cerrar sesión** llama a `POST /auth/logout`, borra los tokens y avisa a las demás pestañas; si la llamada falla, la sesión se cierra igual en el navegador.
- **Contrapartida aceptada:** un script inyectado (XSS) podría leer el refresh token de `sessionStorage`/`localStorage` mientras la página está abierta. Lo mitigan React (no se inserta HTML sin escapar), la ausencia de `dangerouslySetInnerHTML` y que no se cargan scripts de terceros. **F8 debe agregar una Content-Security-Policy estricta** al publicar (`script-src 'self'`, `connect-src` limitado a la API, sin `unsafe-inline`). Una cookie `HttpOnly` sería mejor, pero la API no la ofrece.

### Aeropuertos y rutas (verificado contra la API el 2026-10-07)

La API pública no tiene endpoint de aeropuertos: la lista del buscador es **estática** (`src/shared/api/airports.ts`), sale de la semilla del backend y **hay que mantenerla sincronizada a mano** si el backend cambia su red. Una prueba la compara con los códigos de la semilla y otra comprueba que el mock tiene exactamente la misma red que la tabla.

Aeropuertos: UIO Quito, GYE Guayaquil, CUE Cuenca, LOH Loja, MEC Manta, ESM Esmeraldas, LGQ Nueva Loja (Lago Agrio), OCC Coca, GPS Baltra y SCY San Cristóbal. Latacunga (LTX) y Macas (XMS) **no existen** en la API y se quitaron.

No todos los pares tienen vuelos. El buscador solo ofrece como destino los que devolvieron ofertas en al menos una de 7 fechas consecutivas (búsquedas reales, 90 pares, 389 consultas):

| Desde | Destinos con vuelos |
|---|---|
| UIO | GYE, CUE, LOH, MEC, ESM, LGQ, OCC, GPS, SCY |
| GYE | UIO, CUE, MEC, ESM, OCC, GPS, SCY |
| CUE | UIO, GYE, GPS, SCY |
| LOH | UIO, GYE, CUE, MEC, ESM |
| MEC | UIO, GYE |
| ESM | UIO, GYE, CUE, OCC |
| LGQ | UIO, GYE, CUE, MEC, OCC |
| OCC | UIO, GYE, LOH, MEC, ESM |
| GPS | UIO, GYE |
| SCY | UIO, GYE |

Hay rutas de un solo sentido por los horarios de conexión (por ejemplo CUE→GPS existe, GPS→CUE no).

---

## 7. Diseño, accesibilidad y validaciones

**Diseño.** Los tokens (colores, tipografías, espaciados, modo claro y oscuro) viven en `src/index.css` y se conectan a Tailwind en `tailwind.config.ts`. Esa es la única fuente de verdad. Composición simétrica, espaciado en múltiplos de 8 px.

**Accesibilidad: WCAG 2.2 nivel AA.**

- HTML semántico, enlace "Saltar al contenido", un solo `h1` por página.
- Foco siempre visible y nunca tapado por barras fijas.
- Botones y enlaces de al menos 44 × 44 px.
- Contraste mínimo 4.5:1 en texto y 3:1 en componentes. Nada depende solo del color.
- Funciona a 320 px de ancho sin scroll horizontal y con zoom al 200 %.
- Respeta el modo oscuro y la preferencia de menos movimiento.
- Todo lo que se arrastra o se amplía tiene alternativa con botones.
- Errores con `role="alert"`; cambios dinámicos (temporizador, resultados) anunciados con `aria-live`.
- No se pide dos veces el mismo dato. Las contraseñas se pueden pegar.
- La ayuda está en el mismo lugar en todas las páginas.

**Heurísticas de Nielsen.** Estado del sistema visible, lenguaje del usuario, salida de emergencia, consistencia, prevención de errores, reconocer en vez de recordar, atajos, minimalismo, errores útiles y ayuda breve.

**Validaciones (zod en todos los formularios).**

| Campo | Regla |
|---|---|
| Numéricos | Solo dígitos al teclear y al pegar, con longitud máxima |
| Nombres y apellidos | Como el backend: empieza con letra; letras (con tildes), espacios, apóstrofe, punto y guion; hasta 60 caracteres |
| Cédula | 10 dígitos con verificación de módulo 10 |
| Pasaporte (y documento extranjero) | 5 a 20 letras o dígitos, sin espacios ni guiones (se quitan); el pasaporte vence después del último vuelo |
| Correo | Como el backend: se recorta, NFC y minúsculas; máximo 254 caracteres, con dominio y TLD, sin IP, nombre visible, caracteres de control, invisibles ni etiquetas HTML |
| Contraseña | 12 a 128 caracteres medidos tras NFKC, sin recortar y sin reglas de composición; se puede pegar y mostrar |
| Teléfono | +593 y 9 dígitos |
| Fecha de nacimiento | Como el backend, el día del primer vuelo: adulto ≥ 18, joven 12–17, niño 2–11, infante < 2 (y aún < 2 el día del último vuelo) |
| Nacionalidad | Código ISO de 2 letras (EC); la cédula se valida con módulo 10 solo con nacionalidad EC |
| Tarjeta (simulada) | Luhn, vencimiento futuro, CVV de 3 o 4 dígitos |
| Búsqueda | Origen distinto de destino y con vuelos entre ambos, fechas no pasadas y dentro de la ventana de la semilla, máximo 9 pasajeros, infantes ≤ adultos |
| Número de vuelo | Como la API: aerolínea (2 caracteres) y número sin ceros a la izquierda, por ejemplo `LA1400` |

Se valida al salir del campo y al enviar, sin borrar lo que el usuario escribió. Si el contrato define un límite, se usa exactamente ese.

---

## 8. Pruebas

- **Hoy:** 621 pruebas con Vitest (`npm run test`): validadores, esquemas, buscador, rutas, `RequireAuth` con la sesión real, selección de compra, ventana de check-in, cliente HTTP (ProblemDetails, Retry-After, timeout, reintentos), mapeo y dinero contra respuestas reales, mock contra la API, catálogo, caché, componentes de resultados y estado de vuelo y, desde F3, la sesión (almacén, renovación única entre pestañas, reutilización, reloj desfasado, cierre en otra pestaña) y los formularios de cuenta (errores por campo, foco, doble envío, 401/409/429). Desde F4a, la compra: máquina de estados (todas las transiciones y errores), claves de idempotencia, temporizador con el tiempo del servidor y el reloj del equipo desfasado, seguimiento con espera creciente, pago simulado (prefijos, nada persistido), catálogo de mensajes, reglas de pasajeros, mapeo con respuestas reales y el mock de hold y reserva. Desde F4b, las pantallas: formulario de pasajeros por tipo, temporizador con avisos a 5 y 2 minutos, tarjeta, y la ruta completa de la compra con sesión, que cuenta los clics y falla si pasan de 3 (no hay Playwright instalado: es una prueba de componentes de las cuatro pantallas), con la cuenta incrustada, volver atrás, los errores del pago y los estados de la confirmación. Desde F6, la postventa: las reglas del mock con los mismos códigos del contrato (lista por cursor, boletos, check-in, pases, equipaje, cambio de fecha, cancelación), `RealFlightsApi` contra un cliente HTTP falso (rutas, cabeceras, 200/201/202 y dinero en centavos), las acciones habilitadas por estado, los filtros de la lista, los totales de equipaje, la compra de equipaje con 200/201/202/422, las claves de idempotencia (generación, reutilización y clave nueva al cambiar el pago), los hooks de check-in y cambio de fecha, el QR y las pantallas de lista, pases, equipaje y cancelación.
- **Integración:** `npm run test:api` contra la API real, con las respuestas validadas contra el contrato. La suite de cuenta corre solo contra un backend local: registro, 409, ingreso, `/auth/me`, **5 llamadas a la vez con el token vencido → 1 sola renovación y sin reutilización**, 401 reactivo, rotación y reutilización, cierre de sesión y 429. La de compra, también solo local: búsqueda real, hold y `GET`, `PAY-OK` 201 con boletos y el mismo envío dos veces con la misma clave = **una sola reserva** (`Idempotent-Replayed: true`), `PAY-REJ` 422 con el hold aún `HELD`, `PAY-PEND` 202 seguido hasta `CONFIRMED`, y liberar el hold. Respeta los límites de tasa: entre dos corridas seguidas hay que esperar un minuto (ingreso 5 y reservas 10 por minuto).
- **E2E:** `e2e/seats-demo.mjs` (selector de asientos, mock, 320/768/1280 px).
- **Por agregar:** pruebas de extremo a extremo del flujo de compra y revisión automática de accesibilidad en cada ruta.
- Al cerrar cada fase: lint, typecheck, build, pruebas, recorrido solo con teclado, 320 px, zoom al 200 % y modo oscuro.

---

## 9. Plan de fases

| Fase | Qué | Estado |
|---|---|---|
| F0 | Fundación: diseño, layout, rutas, mock, inicio | Hecha |
| F1 | Orden: repositorio git, navegación y rutas nuevas, limpieza | Hecha (tag `fase-1`) |
| F2 | Contrato: tipos generados desde el OpenAPI, `FlightsApi` alineada, API real en lo público (búsqueda, asientos, estado) | Hecha (tag `fase-2`) |
| F3 | Cuenta: ingreso, registro, renovación de sesión y rutas protegidas contra la API real | Hecha (tag `fase-3`) |
| F4a | Núcleo de la compra: hold, reserva, pago simulado, máquina de estados, idempotencia | Hecha (tag `fase-4a`) |
| F4b | Pantallas finales de la compra (cuenta incrustada, pasajeros, pago, confirmación) | Hecha (tag `fase-4b`) |
| F5 | Selector de asientos (mapa en forma de avión, lista, filtros, conflictos 409/422), integrado en el paso 2 y verificado con la API real | Hecha (tag `fase-5`) |
| F6 | Mis viajes: lista, detalle, boletos, check-in, pases con QR, equipaje, cambio de fecha, cancelación | Hecha en mock (rama `fase-6-viajes`); **sin verificar con la API real** |
| F7 | Ofertas y pulido del inicio | Pendiente |
| F8 | Calidad y entrega: pruebas de extremo a extremo, accesibilidad, despliegue | Pendiente |

Desde F2, cada fase se cierra funcionando **con el mock y con la API real**.

---

## 10. Forma de trabajo

- Una rama por fase (`feat/fN-nombre`) desde `main` actualizado.
- Un commit por paso, con Conventional Commits en español.
- `git status` antes de cada commit. Nada de archivos temporales ni secretos.
- La fusión a `main` se hace en local con `--no-ff` y un tag `fase-N`.
- Las reglas completas para el asistente de código están en `CLAUDE.md`.

## 11. Fuera de alcance

- Alojamientos, autos y atracciones.
- Panel de administración del catálogo (la API lo tiene; aquí no hay interfaz).
- Gestión de webhooks (es para integraciones entre sistemas).
- Pagos reales.
