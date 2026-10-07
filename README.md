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

## 1. Estado actual (2026-10-07, cierre de F3; F5 en rama aparte)

- Repositorio en GitHub (`chuchobck/e-commerce_vuelos`), `main` con las fases 1 a 3. 171 archivos en `src`, unas 13.300 líneas de TypeScript (sin contar los tipos generados).
- 262 pruebas en verde con `npm run test` y 17 de integración con `npm run test:api` (9 de lectura, contra el backend local y Render; 8 de cuenta, solo contra el backend local). Lint, typecheck y build sin errores.
- **Dos modos sin mezclas** (sección 2): mock completo, o API real. Con la API real funcionan **búsqueda, resultados, "Escápate", estado de vuelo y la cuenta** (registro, ingreso, renovación de sesión, cierre de sesión, Mi perfil y rutas protegidas); el mapa de asientos tiene cliente y pruebas (la pantalla es de F5).
- Las formas de datos salen de los contratos (`contracts/vuelos-openapi.yaml` y, para `/auth/*`, `contracts/backend-openapi.json` → tipos generados) y el mock produce exactamente esa forma.
- **Sesión** (sección 6, "Modelo de seguridad de la sesión"): access token solo en memoria, renovación única entre pestañas, cierre de sesión que se propaga a las demás pestañas, restauración al recargar sin parpadeo.
- Compra y postventa siguen en el mock; con la API real muestran "se conecta en una fase posterior" (F4 y F6). El bloque de cuenta del paso 2 ya usa la sesión real.
- Navegación (sección 4): menú por momento del viajero, rutas centralizadas en `src/app/routes.ts`, rutas protegidas con `RequireAuth` (espera a que la sesión se restaure y conserva `?volver=`).
- Compra: los 3 pasos tienen pantalla, indicador, resumen y temporizador; la selección del paso 1 sobrevive a ingresar, a refrescar y a un cierre de sesión por seguridad. Faltan el formulario de pasajeros, el asiento y el pago (F4).
- Mis viajes: lista, detalle con estado del vuelo, check-in por viaje (ventana 48 h / 60 min) y cancelación (mock). Pases, equipaje y cambio de fecha son pantallas de espera (F6).
- Ofertas es una pantalla inicial (F7). Mi perfil muestra los datos reales de la cuenta, solo lectura: la API no permite editarlos.
- **F5 (rama `fase-5-asientos`, sin fusionar):** selector de asientos como módulo independiente (`features/seats`) con demo en `/componentes/asientos`. Aún no está en el paso 2 y no se verificó con la API real (sección 5b). 306 pruebas en verde.

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
| `npm run test:api` | Integración contra la API real: búsqueda, asientos, estado y errores validados contra el contrato con Ajv y, **solo con un backend local**, la cuenta (crea un usuario `@example.test`). No es parte de `npm run test` |

### Contrato y tipos generados

- `contracts/vuelos-openapi.yaml` es una copia del contrato del backend; su origen y fecha están en `contracts/PROCEDENCIA.md`. Ese contrato no describe `/auth/*`: para la cuenta se usa `contracts/backend-openapi.json`, el documento que el backend publica en `/api/docs-json` (mismo `PROCEDENCIA.md`).
- `npm run api:types` genera `src/shared/api/generated/vuelos.ts` y `generated/backend.ts` con `openapi-typescript`. Ese archivo **se versiona** y no se edita a mano: es el único lugar que define las formas del contrato.
- Si el contrato cambia: descargar el YAML nuevo, actualizar `PROCEDENCIA.md`, correr `npm run api:types` y después `npm run typecheck`. El mock está tipado contra esos tipos, así que cualquier diferencia hace fallar la compilación hasta que se corrija.

### Variables de entorno

Están descritas en `.env.example`. Nunca se sube un `.env` al repositorio.

- **`VITE_API_URL`** elige el modo, sin mezclas:
  - **Vacía → mock completo.** Todo funciona sin backend y se ven las pistas "Para probar".
  - **Con valor → API real.** Búsqueda, mapa de asientos, estado de vuelo y cuenta van a la API; compra y postventa muestran "se conecta en una fase posterior" hasta F4 y F6. Las pistas "Para probar" (incluida la cuenta demo del mock) no se ven.
- **`VITE_LAST_FLIGHT_DATE`**: último día con salidas de la semilla del backend (la semilla genera 90 días desde su carga y esa ventana es fija). El buscador no deja elegir fechas posteriores; vacía = hoy + 89 días.
- **`VITE_MOCK_ERROR_RATE`**: frecuencia de errores simulados. Solo afecta al mock; sirve para diseñar los estados de error.

#### A qué API apuntar

| Backend | URL | Para qué |
|---|---|---|
| Local (recomendado en desarrollo) | `http://localhost:3010/flights/v1` | Navegador y `npm run test:api` (incluida la cuenta). El backend debe tener `CORS_ORIGINS=http://localhost:5173`. Con el backend en WSL, desde Windows funciona `localhost` (no `127.0.0.1`). |
| Render | `https://quinde-vuelos-api.onrender.com/flights/v1` | Solo verificación de lectura con `npm run test:api` (corre en Node, no necesita CORS); la suite de cuenta se omite sola porque escribe. **No se crean usuarios en Render.** Su CORS no incluye `localhost`. Duerme tras 15 min: la primera petición tarda cerca de un minuto. |

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
| `checkout` | Compra en 3 pasos: selección, hold, cuenta, resumen | Parcial (faltan pasajeros y pago) |
| `seats` | Selector de asientos (mapa en forma de avión, lista alternativa, filtros, recomendación, conflictos 409/422) | Hecho como módulo independiente (F5, rama `fase-5-asientos`); se enchufa al paso 2 en F4 (ver sección 5b) |
| `trips` | Mis viajes y detalle del viaje | Parcial (mock) |
| `checkin` | Check-in dentro del viaje y pases de abordar | Parcial (check-in por viaje; pases en F6) |
| `aftersale` | Equipaje, cambio de fecha, cancelación | Parcial (cancelación en la página del viaje) |
| `flight-status` | Estado de vuelo (público y dentro del viaje) | Hecho (mock y API real) |
| `offers` | Ofertas por destino | Planificado (carpeta creada) |

---

## 4. Navegación y rutas

Criterio: se ordena por el **momento del viajero**.

- Antes de comprar (público): buscar, comparar, ver ofertas.
- Después de comprar (con sesión): todo lo del viaje.
- En cualquier momento (público): estado de un vuelo y ayuda.

Menú principal: **Vuelos · Ofertas · Mis viajes · Estado de vuelo**. A la derecha: Ayuda, tema claro/oscuro y el menú del usuario (Mis viajes, Mi perfil, Cerrar sesión).

| Ruta | Página | Acceso | API | Estado |
|---|---|---|---|---|
| `/` | Inicio con buscador | Público | `POST /search` | Hecho (mock y API real) |
| `/resultados` | Vuelos y tarifas (paso 1) | Público | `POST /search` | Hecho (mock y API real) |
| `/ofertas` | Precios más bajos por destino | Público | `POST /search` | Pantalla de espera (F7) |
| `/compra/datos` | Cuenta y pasajeros (paso 2) | Sesión dentro del paso | hold, `/auth/*`, mapa de asientos | Parcial: cuenta con la sesión real; hold, temporizador y resumen en el mock; pasajeros en F4 |
| `/compra/pago` | Pago (paso 3) | Sesión dentro del paso | `POST /bookings` | Parcial: resumen y temporizador; pago en F4 |
| `/compra/confirmacion/:id` | Compra lista | Sesión | `GET /bookings/{id}` | Hecho (mock); se llega a ella en F4 |
| `/mis-viajes` | Lista de viajes | Sesión | `GET /bookings` | Hecho (mock) |
| `/mis-viajes/:id` | Detalle del viaje (centro de postventa) | Sesión | detalle, boletos, estado | Hecho (mock), con estado del vuelo |
| `/mis-viajes/:id/check-in` | Check-in | Sesión | `POST .../check-in` | Hecho (mock) |
| `/mis-viajes/:id/pases` | Pases de abordar | Sesión | `GET .../boarding-passes` | Pantalla de espera (F6) |
| `/mis-viajes/:id/equipaje` | Agregar equipaje | Sesión | `baggage-options`, `baggage` | Pantalla de espera (F6) |
| `/mis-viajes/:id/cambiar-fecha` | Cambio de fecha | Sesión | `date-change` | Pantalla de espera (F6) |
| `/mis-viajes/:id/cancelar` | Cancelación | Sesión | `cancellation-quote`, `cancel` | Parcial (sin cotización) |
| `/estado-vuelo` | Estado de un vuelo | Público | `GET /flights/{n}/status` | Hecho (mock y API real) |
| `/ingresar`, `/registrarse` | Cuenta (vuelven a `?volver=`) | Público | `POST /auth/login`, `POST /auth/register` | Hecho (mock y API real) |
| `/perfil` | Mis datos (solo lectura) y cerrar sesión | Sesión | `GET /auth/me`, `POST /auth/logout` | Hecho (mock y API real) |
| `/ayuda` | Ayuda y textos legales | Público | Ninguna | Hecho |
| `/componentes` | Catálogo interno | Solo desarrollo (404 en producción) | Ninguna | Hecho |
| `/componentes/asientos` | Demo del selector de asientos (1 adulto, familia con niño y bebé, escala, ATR) | Solo desarrollo (404 en producción) | `GET /offers/{id}/seatmap` | Hecho (F5) |

Rutas viejas que redirigen: `/mis-reservas` → `/mis-viajes`, `/reserva/:id` → `/mis-viajes/:id`, `/check-in` → `/mis-viajes`, `/compra` → `/compra/datos`.

Por qué el check-in no es una sección del menú: en la API el check-in se hace por `bookingId` y solo el dueño de la reserva puede hacerlo. No existe búsqueda por código de reserva y apellido, así que un check-in sin cuenta no puede funcionar. Vive dentro de cada viaje. Pendiente (F6): que el inicio muestre un aviso cuando un viaje entra en la ventana de check-in.

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
- Si la oferta venció mientras el usuario se registraba, se vuelve a buscar y se avisa si el precio cambió.
- El temporizador avisa cuando quedan 2 minutos. Si el hold vence, se explica qué pasó y se ofrece buscar de nuevo, sin perder los datos de los pasajeros.
- El botón de pagar se desactiva mientras se procesa. Un reintento usa la misma clave de idempotencia para no cobrar dos veces.
- Se puede volver al paso anterior sin perder lo escrito.

Pago simulado: la pantalla lo dice de forma visible. Los datos de tarjeta no salen del navegador ni se guardan; a la API solo se envía una referencia de pago.

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

**Mapeo a `PassengerItem`:** `toAssignedSeats(value, passengerId, segments)` devuelve `{ segmentId, seatNumber }[]`, exactamente `PassengerItem.assignedSeats` (una prueba lo comprueba contra los tipos generados). Si queda vacío, **omitir el campo**. Los bebés nunca tienen entrada. Cuidado: el `PassengerData.seatId` del mock actual guarda un solo asiento (solo el primer tramo); F4 debe pasar a `assignedSeats` por tramo.

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
- **Mock:** ya existía `getSeatMap` en `FlightsApi` y el diseño de cabinas de la semilla (A320, A319, ATR72). Su ocupación es determinista pero con semilla por vuelo y fecha (no por `offerId`+`segmentId`): el mismo vuelo muestra la misma ocupación aunque cambie la oferta, como en un avión real. Se agregó `shared/api/mock/seatSimulation.ts` (asientos ocupados simulados y los errores 409/422) y los botones de la demo lo usan.
- **Textos:** viven en `shared/i18n/seats.ts` (se incluye como `es.seats`) para no chocar con F4 en `es.ts`; se pueden mover a `es.ts` al fusionar.
- Fuera de esta fase: copiar la elección de un tramo al siguiente y bloquear por tipo de pasajero.

### Pruebas

- `src/features/seats/model/*.test.ts`: generación del mapa (A320, A319, ATR72), selección, filtros, recomendación, revisión contra mapa nuevo y compatibilidad con `assignedSeats`.
- `src/features/seats/components/SeatSelector.test.tsx`: teclado, `aria-label`, selección y avance, zoom, lista, estados de carga/vacío/error, refresco al volver a la pestaña, 409 y 422.
- `e2e/seats-demo.mjs`: recorrido con Playwright sobre la demo (mock) a 320, 768 y 1280 px, con capturas. No es parte de `npm run test` ni agrega dependencias (ver el encabezado del archivo).

---

## 6. Reglas de la API que el frontend respeta

- **Rutas públicas:** búsqueda, mapa de asientos y estado de vuelo. Todo lo demás exige sesión.
- **Sesión:** token de acceso de 15 minutos y token de renovación de 7 días que rota en cada uso. Reutilizar un token de renovación viejo cierra la sesión (toda su familia de tokens), así que la renovación se hace una sola vez a la vez, nunca en paralelo, ni siquiera entre pestañas.
- **Hold:** dura 15 minutos y aparta cupo real. Si el usuario abandona la compra, se libera.
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
| Nombres y apellidos | Letras, tildes, espacios, apóstrofe y guion; 2 a 40 caracteres |
| Cédula | 10 dígitos con verificación de módulo 10 |
| Pasaporte | Alfanumérico, 6 a 12 caracteres |
| Correo | Como el backend: se recorta, NFC y minúsculas; máximo 254 caracteres, con dominio y TLD, sin IP, nombre visible, caracteres de control, invisibles ni etiquetas HTML |
| Contraseña | 12 a 128 caracteres medidos tras NFKC, sin recortar y sin reglas de composición; se puede pegar y mostrar |
| Teléfono | +593 y 9 dígitos |
| Fecha de nacimiento | Coherente con el tipo de pasajero (adulto, niño de 2 a 11, infante menor de 2) |
| Tarjeta (simulada) | Luhn, vencimiento futuro, CVV de 3 o 4 dígitos |
| Búsqueda | Origen distinto de destino y con vuelos entre ambos, fechas no pasadas y dentro de la ventana de la semilla, máximo 9 pasajeros, infantes ≤ adultos |
| Número de vuelo | Como la API: aerolínea (2 caracteres) y número sin ceros a la izquierda, por ejemplo `LA1400` |

Se valida al salir del campo y al enviar, sin borrar lo que el usuario escribió. Si el contrato define un límite, se usa exactamente ese.

---

## 8. Pruebas

- **Hoy:** 306 pruebas con Vitest (262 hasta F3, más 44 del selector de asientos) (`npm run test`): validadores, esquemas, buscador, rutas, `RequireAuth` con la sesión real, selección de compra, ventana de check-in, cliente HTTP (ProblemDetails, Retry-After, timeout, reintentos), mapeo y dinero contra respuestas reales, mock contra la API, catálogo, caché, componentes de resultados y estado de vuelo y, desde F3, la sesión (almacén, renovación única entre pestañas, reutilización, reloj desfasado, cierre en otra pestaña) y los formularios de cuenta (errores por campo, foco, doble envío, 401/409/429).
- **Integración:** `npm run test:api` contra la API real, con las respuestas validadas contra el contrato. La suite de cuenta corre solo contra un backend local: registro, 409, ingreso, `/auth/me`, **5 llamadas a la vez con el token vencido → 1 sola renovación y sin reutilización**, 401 reactivo, rotación y reutilización, cierre de sesión y 429. Respeta los límites de tasa: entre dos corridas seguidas hay que esperar un minuto (ingreso 5 por minuto).
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
| F4 | Compra en 3 pasos completa | Siguiente |
| F5 | Mapa de asientos en forma de avión | Hecha en la rama `fase-5-asientos` como módulo independiente; falta verificarla con la API real y enchufarla al paso 2 |
| F6 | Mis viajes: detalle, check-in, pases, equipaje, cambio de fecha, cancelación | Pendiente |
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
