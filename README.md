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

## 1. Estado actual (2026-10-06, cierre de F1)

- Repositorio git con `main` y la rama `feat/f1-orden`. 125 archivos en `src`, unas 9.600 líneas de TypeScript.
- 101 pruebas en verde; lint, typecheck y build sin errores.
- Todo funciona contra una **API simulada** (mock). Todavía no hay conexión con la API real (F2).
- Navegación nueva (sección 4) aplicada: menú por momento del viajero, rutas centralizadas en `src/app/routes.ts`, rutas protegidas con `RequireAuth` y redirecciones desde las rutas viejas.
- Compra: los 3 pasos tienen pantalla, indicador, resumen y temporizador; la selección del paso 1 sobrevive a ingresar y a refrescar. Faltan el formulario de pasajeros, el asiento y el pago (F4).
- Mis viajes: lista, detalle con estado del vuelo, check-in por viaje (ventana 48 h / 60 min) y cancelación. Pases, equipaje y cambio de fecha son pantallas de espera (F6).
- Ofertas y Mi perfil son pantallas iniciales (F7 y F3).

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

### Variables de entorno

Están descritas en `.env.example`. Nunca se sube un `.env` al repositorio.

- **URL de la API real.** Vacía = se usa la API simulada y se ven las pistas "Para probar". Con valor = se usa la API real y las pistas desaparecen. (Hasta F2 la implementación HTTP no existe: con valor se ocultan las pistas pero los datos siguen viniendo del mock, y en desarrollo la consola lo avisa.)
- **Frecuencia de errores simulados.** Solo afecta al mock; sirve para diseñar y probar los estados de error.

Todas las variables que empiezan con `VITE_` quedan visibles en el navegador: **no se ponen secretos ahí**.

---

## 3. Arquitectura

```
src/
├─ main.tsx, index.css        arranque y tokens de diseño (claro y oscuro)
├─ app/
│  ├─ routes.ts               tabla única de rutas (paths, routes.trip(id), returnTo, redirecciones)
│  ├─ routeTable.tsx          qué página atiende cada ruta; router.tsx la monta
│  ├─ RequireAuth.tsx         rutas con sesión (manda a /ingresar?volver=…)
│  ├─ providers/              tema y sesión del usuario
│  └─ layout/                 header, menú móvil, footer, plantilla de página, página de error
├─ pages/                     una página por ruta; solo arma piezas, sin lógica de negocio
├─ features/                  una carpeta por módulo; cada uno expone solo lo de su index.ts
│  ├─ home/  search/  results/
│  ├─ auth/  checkout/  seats/
│  ├─ trips/  checkin/  aftersale/
│  └─ flight-status/  offers/
└─ shared/
   ├─ api/                    contrato FlightsApi + implementaciones (mock y real)
   ├─ i18n/                   todos los textos en español
   ├─ lib/                    fechas, formatos, validadores, esquemas, ventana de check-in, hooks
   └─ ui/                     componentes base (incluye el resumen de viaje y MockOnly)
```

Reglas de dependencia (para no perderse). Las de los puntos 1 a 3 las revisa `npm run lint`:

1. `pages` usa `app`, `features` y `shared`. `features` usa `shared` y, como única excepción, `app/routes.ts` (no importa nada) para enlazar sin escribir rutas sueltas. `shared` no usa a nadie.
2. Un módulo de `features` no importa de otro módulo de `features`, y desde fuera se importa solo por su `index.ts` (`@/features/trips`, nunca `@/features/trips/Archivo`). Lo común sube a `shared`.
3. **Solo `shared/api` habla con la red.** `fetch`, `XMLHttpRequest` y axios están prohibidos fuera de ahí.
4. Ningún texto visible va escrito en el componente: todo sale de `shared/i18n`.
5. Ningún color fuera de los tokens de `index.css`.
6. Un componente por archivo. Componentes de presentación sin lógica de negocio.
7. Ninguna ruta se escribe como texto: se usa `routes.*` o `paths.*` de `app/routes.ts`.

### Módulos objetivo

| Módulo (`features/`) | Responsabilidad | Estado |
|---|---|---|
| `home` | Inicio | Hecho |
| `search` | Buscador | Hecho |
| `results` | Resultados y tarifas | Hecho |
| `auth` | Validaciones de ingreso y registro (la sesión y `RequireAuth` viven en `app/`) | Parcial (mock) |
| `checkout` | Compra en 3 pasos: selección, hold, cuenta, resumen | Parcial (faltan pasajeros y pago) |
| `seats` | Mapa de asientos (avión) | Planificado (carpeta creada) |
| `trips` | Mis viajes y detalle del viaje | Parcial (mock) |
| `checkin` | Check-in dentro del viaje y pases de abordar | Parcial (check-in por viaje; pases en F6) |
| `aftersale` | Equipaje, cambio de fecha, cancelación | Parcial (cancelación en la página del viaje) |
| `flight-status` | Estado de vuelo (público y dentro del viaje) | Hecho (mock) |
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
| `/` | Inicio con buscador | Público | `POST /search` | Hecho |
| `/resultados` | Vuelos y tarifas (paso 1) | Público | `POST /search` | Hecho |
| `/ofertas` | Precios más bajos por destino | Público | `POST /search` | Pantalla de espera (F7) |
| `/compra/datos` | Cuenta y pasajeros (paso 2) | Sesión dentro del paso | hold, `/auth/*`, mapa de asientos | Parcial: cuenta, hold, temporizador y resumen; pasajeros en F4 |
| `/compra/pago` | Pago (paso 3) | Sesión dentro del paso | `POST /bookings` | Parcial: resumen y temporizador; pago en F4 |
| `/compra/confirmacion/:id` | Compra lista | Sesión | `GET /bookings/{id}` | Hecho (mock); se llega a ella en F4 |
| `/mis-viajes` | Lista de viajes | Sesión | `GET /bookings` | Hecho (mock) |
| `/mis-viajes/:id` | Detalle del viaje (centro de postventa) | Sesión | detalle, boletos, estado | Hecho (mock), con estado del vuelo |
| `/mis-viajes/:id/check-in` | Check-in | Sesión | `POST .../check-in` | Hecho (mock) |
| `/mis-viajes/:id/pases` | Pases de abordar | Sesión | `GET .../boarding-passes` | Pantalla de espera (F6) |
| `/mis-viajes/:id/equipaje` | Agregar equipaje | Sesión | `baggage-options`, `baggage` | Pantalla de espera (F6) |
| `/mis-viajes/:id/cambiar-fecha` | Cambio de fecha | Sesión | `date-change` | Pantalla de espera (F6) |
| `/mis-viajes/:id/cancelar` | Cancelación | Sesión | `cancellation-quote`, `cancel` | Parcial (sin cotización) |
| `/estado-vuelo` | Estado de un vuelo | Público | `GET /flights/{n}/status` | Hecho (mock) |
| `/ingresar`, `/registrarse` | Cuenta (vuelven a `?volver=`) | Público | `/auth/*` | Hecho (mock) |
| `/perfil` | Mis datos | Sesión | `GET /auth/me` | Parcial: muestra la sesión actual |
| `/ayuda` | Ayuda y textos legales | Público | Ninguna | Hecho |
| `/componentes` | Catálogo interno | Solo desarrollo (404 en producción) | Ninguna | Hecho |

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
- Con sesión iniciada, el bloque de cuenta se reduce a "Compras como María" y el paso 2 empieza en pasajeros. El indicador siempre muestra 3 pasos.
- Los datos de la cuenta se precargan en el primer pasajero. No se pide dos veces el mismo dato.
- El registro dentro de la compra pide lo mínimo.
- El asiento es opcional. Si no se elige, se asigna solo.
- Si la oferta venció mientras el usuario se registraba, se vuelve a buscar y se avisa si el precio cambió.
- El temporizador avisa cuando quedan 2 minutos. Si el hold vence, se explica qué pasó y se ofrece buscar de nuevo, sin perder los datos de los pasajeros.
- El botón de pagar se desactiva mientras se procesa. Un reintento usa la misma clave de idempotencia para no cobrar dos veces.
- Se puede volver al paso anterior sin perder lo escrito.

Pago simulado: la pantalla lo dice de forma visible. Los datos de tarjeta no salen del navegador ni se guardan; a la API solo se envía una referencia de pago.

---

## 6. Reglas de la API que el frontend respeta

- **Rutas públicas:** búsqueda, mapa de asientos y estado de vuelo. Todo lo demás exige sesión.
- **Sesión:** token de acceso de 15 minutos y token de renovación de 7 días que rota en cada uso. Reutilizar un token de renovación viejo cierra todas las sesiones, así que la renovación se hace una sola vez a la vez, nunca en paralelo.
- **Hold:** dura 15 minutos y aparta cupo real. Si el usuario abandona la compra, se libera.
- **Reservas:** solo las ve su dueño. Una reserva ajena responde 404.
- **Pago simulado por prefijo de la referencia:** `PAY-OK-` aprobado (201), `PAY-PEND-` pendiente (202), `PAY-REJ-` rechazado (422).
- **Check-in:** abre 48 horas antes de la salida y cierra 60 minutos antes.
- **Errores:** llegan en formato ProblemDetails. Se manejan 400, 401, 403, 404, 409, 422, 429 (demasiadas peticiones) y 503 (con `Retry-After`). Cada uno tiene un mensaje en lenguaje simple que dice qué pasó y qué hacer.
- **Arranque en frío:** el plan gratuito de Render duerme tras 15 minutos sin tráfico; la primera petición puede tardar cerca de un minuto. La interfaz lo explica en vez de parecer colgada.
- **CORS:** el origen del frontend (por ejemplo `http://localhost:5173` y el dominio publicado) debe estar en `CORS_ORIGINS` del backend.
- Ante la duda, manda el contrato. Las diferencias conocidas están en `docs/DISCREPANCIAS-CONTRATO.md` del backend.

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
| Correo | Formato válido, máximo 100 caracteres |
| Teléfono | +593 y 9 dígitos |
| Fecha de nacimiento | Coherente con el tipo de pasajero (adulto, niño de 2 a 11, infante menor de 2) |
| Tarjeta (simulada) | Luhn, vencimiento futuro, CVV de 3 o 4 dígitos |
| Búsqueda | Origen distinto de destino, fechas no pasadas, máximo 9 pasajeros |

Se valida al salir del campo y al enviar, sin borrar lo que el usuario escribió. Si el contrato define un límite, se usa exactamente ese.

---

## 8. Pruebas

- **Hoy:** 101 pruebas con Vitest: validadores, esquemas, buscador, tabla de rutas y redirecciones, `RequireAuth`, selección de compra, ventana de check-in, check-in del mock y pistas solo con mock.
- **Por agregar:** pruebas de extremo a extremo del flujo de compra y revisión automática de accesibilidad en cada ruta.
- Al cerrar cada fase: lint, typecheck, build, pruebas, recorrido solo con teclado, 320 px, zoom al 200 % y modo oscuro.

---

## 9. Plan de fases

| Fase | Qué | Estado |
|---|---|---|
| F0 | Fundación: diseño, layout, rutas, mock, inicio | Hecha |
| F1 | Orden: repositorio git, navegación y rutas nuevas, limpieza | Hecha (rama `feat/f1-orden`, por fusionar) |
| F2 | Contrato: tipos generados desde el OpenAPI, `FlightsApi` alineada, API real en lo público (búsqueda, asientos, estado) | Siguiente |
| F3 | Cuenta: ingreso, registro, renovación de sesión y rutas protegidas contra la API real | Pendiente |
| F4 | Compra en 3 pasos completa | Pendiente |
| F5 | Mapa de asientos en forma de avión | Pendiente |
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
