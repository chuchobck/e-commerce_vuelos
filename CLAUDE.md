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
- Solo `src/shared/api` habla con la red (`fetch`, `XMLHttpRequest`, axios prohibidos fuera).
  La UI conoce solo la interfaz `FlightsApi`; nunca se inventan endpoints.
- Rutas: nunca como texto suelto. Patrones en `paths`, enlaces con `routes.*` (`routes.trip(id)`),
  todo en `src/app/routes.ts`. Rutas con sesión van bajo `RequireAuth` en `routeTable.tsx`.
- `/compra/*` no exige sesión: el ingreso ocurre dentro del paso 2. La selección del paso 1 vive
  en `sessionStorage` (`features/checkout/selection.ts`) y el hold se crea en el paso 2 con sesión.
- Textos: todos en `src/shared/i18n/es.ts` (español de Ecuador). Colores: solo tokens.
- Pistas de prueba del mock ("Para probar…", cuenta demo): siempre dentro de `<MockOnly>`.
- Un componente por archivo. Al quitar o reemplazar algo, borrar todo lo que quede sin uso
  (textos, exportaciones, componentes, assets).

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
(`shared/lib/checkin.ts`). Reserva ajena = 404. Hold de 15 minutos. Detalle en la sección 6 del README.

## Flujo Git

- Una rama por fase (`feat/fN-nombre`) desde `main` actualizado.
- Un commit por paso, Conventional Commits en español. `git status` antes de cada commit.
- Nunca subir `.env` (solo `.env.example`), secretos ni archivos temporales.
- No hacer push, tags ni fusiones salvo que el dueño lo pida: la fusión a `main` la hace él
  en local con `--no-ff` y tag `fase-N`.

## Al cerrar cada fase

1. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` en verde.
2. `npm run dev` arranca sin errores en consola; no dejar procesos corriendo.
3. Recorrido solo con teclado (header, menú móvil, páginas nuevas), 320 px, zoom 200 %, modo oscuro.
4. Actualizar el README: sección 1 "Estado actual", columnas "Estado" y cualquier diferencia con el código.
5. Reporte: qué se hizo, commits, verificaciones, diferencias README/código, decisiones tomadas y qué no se verificó.
