# CLAUDE.md — reglas de trabajo en Quinde (frontend)

`README.md` es la fuente de verdad de producto, navegación, flujo de compra y reglas de la API.
Este archivo resume cómo trabajar en el código. Si algo choca con el README, manda el README
y se corrige uno de los dos en el mismo commit.

## Stack

React 18 + TypeScript (strict) + Vite 5, React Router 6, Tailwind 3 con tokens en `src/index.css`,
Radix UI, react-hook-form + zod, date-fns, Vitest (+ jsdom y Testing Library para componentes),
ESLint 9 (typescript-eslint, react-hooks, jsx-a11y, import-x).

## Arquitectura (la revisa `npm run lint`)

- `app/`: rutas, layout, proveedores. `pages/`: una página por ruta, solo arma piezas.
  `features/<módulo>/`: un módulo funcional. `shared/`: api, i18n, lib, ui.
- `pages` usa `app`, `features` y `shared`. `features` usa `shared` y solo `app/routes.ts` de `app`.
  `shared` no importa de nadie.
- Un módulo de `features` no importa de otro. Lo común sube a `shared`.
- Desde fuera, un módulo se importa por su `index.ts` (`@/features/trips`), nunca por rutas internas.
  Dentro del módulo se usan imports relativos.
- Solo `src/shared/api` habla con la red (`fetch`, `XMLHttpRequest`, axios prohibidos fuera); el único
  `fetch` real está en `shared/api/http/client.ts`. La UI conoce solo la interfaz `FlightsApi`;
  nunca se inventan endpoints.

## Contrato y API real (desde F2)

- Fuente de las formas: `contracts/vuelos-openapi.yaml` → `npm run api:types` → `src/shared/api/generated/`
  (versionado, no se edita a mano). `shared/api/contract.ts` solo les pone nombre.
- Si la UI necesita otra forma, la conversión es una función pura en `shared/api/mapping.ts` con prueba.
  Mock y API real pasan por el mismo mapeo; el mock está tipado contra los tipos generados.
- Dinero: centavos enteros (`shared/lib/money.ts`), nunca flotantes para sumar; un solo formato
  de presentación (`formatMoney`). Horas: la API da UTC; se muestran en hora local del aeropuerto.
- Si la API real y el contrato discrepan, manda lo que responde la API (verificarlo) y se anota en el
  README (sección 6).
- Con la API real no se inventan datos (textos, rutas, duraciones, precios): salen de las respuestas.
- Modos: `VITE_API_URL` vacía = mock completo; con valor = API real. No se mezclan. Lo que aún no está
  conectado lanza `NotYetConnectedError` y la UI lo explica.
- Reintentos automáticos solo en lecturas (una vez: red, tiempo agotado o 503, con Retry-After ≤ 10 s);
  nunca en escrituras.
- El detalle técnico de un error (`detail`) nunca se muestra: se mapea a mensajes de `shared/i18n`.
- El catálogo de aeropuertos y la tabla de pares con vuelos son estáticos (`shared/api/airports.ts`):
  mantenerlos sincronizados con la semilla del backend; sus pruebas lo vigilan.
- Límite de la API: 20 búsquedas por minuto por IP. No disparar búsquedas en ráfaga (usar caché).
- Rutas: nunca como texto suelto. Patrones en `paths`, enlaces con `routes.*` (`routes.trip(id)`),
  todo en `src/app/routes.ts`. Rutas con sesión van bajo `RequireAuth` en `routeTable.tsx`.
- `/compra/*` no exige sesión: el ingreso ocurre dentro del paso 2. La selección del paso 1 vive
  en `sessionStorage` (`features/checkout/selection.ts`) y el hold se crea en el paso 2 con sesión.
- Textos: todos en `src/shared/i18n/es.ts` (español de Ecuador). Colores: solo tokens.
- Pistas de prueba del mock ("Para probar…", cuenta demo): siempre dentro de `<MockOnly>`.
- Un componente por archivo. Al quitar o reemplazar algo, borrar todo lo que quede sin uso
  (textos, exportaciones, componentes, assets).

## Cuenta y sesión (desde F3)

- `/auth/*` no está en `vuelos-openapi.yaml`: sus tipos salen de `contracts/backend-openapi.json`
  (`/api/docs-json` del backend) → `generated/backend.ts`. Las reglas de correo y contraseña son las
  de los DTO del backend (`shared/lib/credentials.ts`); no se inventan reglas propias.
- Toda la sesión vive en `features/auth` (`SessionManager` + `AuthProvider`/`useAuth`). Las páginas
  usan `useAuth()`; las llamadas con sesión van envueltas en `authorized(() => flightsApi.…())`.
- Access token solo en memoria; refresh token en `sessionStorage` (o `localStorage` con "Mantener mi
  sesión iniciada"). Nunca cookies propias, el token en la URL ni en logs. El cliente HTTP solo envía
  Bearer en llamadas `auth: true`; las rutas públicas van sin token.
- Una sola renovación a la vez (promesa compartida + Web Locks + BroadcastChannel). Nunca llamar a
  `api.refresh` fuera de `SessionManager`: un refresh token rotado que se reusa revoca la sesión.
- El vencimiento se calcula con `expires_in` (relativo), no con el `exp` del JWT: un reloj desfasado
  no debe provocar renovaciones en bucle.
- El frontend nunca envía un rol. La cuenta es solo correo y contraseña; Mi perfil es de solo lectura.
- `npm run test:api` crea usuarios `@example.test` **solo contra el backend local**; nunca contra
  Render ni con la cuenta de administrador sembrada. Esperar un minuto entre corridas (ingreso 5/min).
- Modelo de seguridad y contrapartida XSS: sección 6 del README. F8 debe agregar una CSP estricta.

## Compra (desde F4a)

- La lógica es una máquina de estados pura (`features/checkout/machine.ts`) que ejecuta `flow.ts`;
  las páginas solo llaman a `checkout.*` y leen `useCheckout()`. Nada de lógica de compra en páginas.
- Hold una sola vez por selección; refrescar lo verifica con `GET`. El tiempo restante sale del
  servidor (`remainingSeconds` desde `receivedAt`); nunca comparar `expiresAt` con la hora local.
- Toda escritura de compra lleva `Idempotency-Key` de `idempotency.ts` (una por intención). Un
  reintento reenvía el mismo cuerpo con la misma clave; nunca una clave con otro cuerpo.
- Tarjetas: solo en `shared/payments` y en el formulario; nunca en almacenamiento, logs ni hacia la
  API de vuelos (solo viaja `paymentReference`). Las tarjetas de prueba solo con el mock o en desarrollo.
- Pantallas de la compra (F4b): `CheckoutLayout` (dos columnas) + `CheckoutAside` (temporizador, resumen,
  cancelar). El panel nunca es una barra fija sobre los campos. La cuenta incrustada recibe `LoginForm` y
  `RegisterForm` desde la página (un módulo de `features` no importa de otro). Las reglas de pasajero viven en
  `passengers.ts` y siguen el DTO del backend; la nacionalidad reservable es `BOOKABLE_COUNTRIES` (hoy, Ecuador).
- Asientos (F5): el selector es opcional y va plegado en el paso 2 (no suma clics). La página lo compone
  con `PassengersForm` (`seats`); la elección es `passengerId → segmentId → asiento` y viaja como
  `assignedSeats` por tramo (`toAssignedSeats`), omitido si no hay elección; los infantes nunca llevan.
  Un error de asiento (`bookingError` en la máquina) vuelve al paso 2: nunca borrarlo antes de que el
  usuario lo revise (el paso 3 no debe marcar los datos como listos mientras exista).
  El 409 no dice qué asiento falló y el `detail` no se interpreta: se compara contra un mapa nuevo.
- Mensajes de compra: catálogo único `es.purchaseErrors`, elegido por `features/checkout/messages.ts`.
- `npm run test:api` crea holds y reservas **solo contra el backend local**; nunca contra Render.
  Límites: 30 holds y 10 reservas por minuto por IP.

## Accesibilidad: WCAG 2.2 AA

HTML semántico, un solo `h1` por página, "Saltar al contenido", foco siempre visible y nunca tapado,
objetivos de 44 × 44 px (usamos 48), contraste 4.5:1 en texto y 3:1 en componentes, nada solo por color,
320 px sin scroll horizontal, zoom 200 %, modo oscuro y menos movimiento, errores con `role="alert"`,
cambios dinámicos con `aria-live`, ayuda en el mismo lugar, contraseñas pegables, no pedir dos veces
el mismo dato. Las excepciones a jsx-a11y se justifican en línea, nunca se apaga la regla.

## Validaciones

zod en todos los formularios con las reglas de la sección 7 del README (cédula módulo 10, pasaporte,
nombres, correo, teléfono +593, fechas por tipo de pasajero, tarjeta con Luhn, búsqueda).
Se valida al salir del campo y al enviar, sin borrar lo escrito. Si el contrato define un límite, se usa ese.

## Reglas de la API que no se negocian

Check-in por `bookingId`, solo dueño con sesión, ventana de 48 h a 60 min antes de la salida
(`shared/lib/checkin.ts`). Reserva ajena = 404. Hold de 15 minutos. Refresh token de un solo uso.
Detalle en la sección 6 del README.

## Flujo Git

- Una rama por fase (`feat/fN-nombre`) desde `main` actualizado.
- Un commit por paso, Conventional Commits en español. `git status` antes de cada commit.
- Nunca subir `.env` (solo `.env.example`), secretos ni archivos temporales.
- No hacer push, tags ni fusiones salvo que el dueño lo pida: la fusión a `main` la hace él
  en local con `--no-ff` y tag `fase-N`.

## Al cerrar cada fase

1. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` en verde, y `npm run test:api`
   contra la API real cuando la fase toque la API (local y Render).
2. `npm run dev` arranca sin errores en consola, en modo mock y en modo real; no dejar procesos corriendo.
3. Recorrido solo con teclado (header, menú móvil, páginas nuevas), 320 px, zoom 200 %, modo oscuro.
4. Actualizar el README: sección 1 "Estado actual", columnas "Estado" y cualquier diferencia con el código.
5. Reporte: qué se hizo, commits, verificaciones, diferencias README/código, decisiones tomadas y qué no se verificó.
