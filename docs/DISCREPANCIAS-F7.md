# F7 «Ofertas y pulido del inicio»: discrepancias y verificación pendiente

Estado a 2026-10-10. **La F7 se construyó y probó solo contra el mock.** El backend local (`http://localhost:3010/flights/v1`) no responde
desde la sesión de trabajo (conexión rechazada; tampoco hay nada escuchando en el 5432 de la base), así que **ninguna petición de las ofertas se
ha visto contra la API real**. Los pasos para hacerlo están en el README, sección «Verificación F7 contra API real».

Reglas de esta verificación (las mismas de `CLAUDE.md`): solo contra el backend **local**, nunca contra Render ni con la cuenta de
administrador sembrada, sin `./db/reset.sh` y sin tocar el repositorio del backend.

---

## 1. Lo que la API NO tiene (por eso una «oferta» no es un descuento)

| Tema | Lo que hay | Qué hace la interfaz |
|---|---|---|
| Promociones, precio anterior, porcentaje de descuento | **Nada**: `contracts/vuelos-openapi.yaml` no tiene endpoint ni campo | Una «oferta» es **la tarifa económica más baja que devolvió una búsqueda real** de una ruta y fecha: «Desde $X». No hay tachados, porcentajes, contadores ni escasez inventada. El pie de la sección lo dice («no descuentos») y una prueba falla si aparece `%`, `descuento`, `últimos`… en la tarjeta |
| Asientos que quedan | `availableSeats` (entero) en cada `CabinPricing` | Se muestra «Quedan N asientos en esta tarifa» **solo cuando la API informa 9 o menos**; con más no se menciona. **Suposición sin verificar:** se lee como asientos libres de esa familia tarifaria (el contrato no lo describe) |
| Moneda | `currency` en cada monto de la respuesta | Se toma de la respuesta (`formatMoney`); si la respuesta mezclara monedas, solo se comparan las de la primera. El mock y la API real hoy dan USD |
| Precio de ida y vuelta | Una búsqueda de ida devuelve un itinerario por oferta | Las ofertas son de **solo ida, 1 adulto, economía** (el precio por persona es el `pricePerAdult` de la familia más barata); «Ver vuelo» abre esa misma búsqueda |

## 2. Cómo se cuida el límite de la API (20 búsquedas por minuto por IP)

Todo en `features/offers` y contado por pruebas (`loadOffers.test.ts`, `useOffers.test.tsx`, `OffersLazy.test.tsx`):

- **Máximo 8 búsquedas HTTP por carga del inicio, 2 a la vez.** Cada ruta recibe su primera búsqueda antes de que ninguna reciba la segunda
  (cola en rondas). Lo que está en caché no cuenta; «esta fecha no tiene vuelos» también se guarda.
- **Una sola petición por búsqueda:** `SearchOptions.retry: false` desactiva el reintento de lecturas del cliente HTTP (que de otro modo
  repetiría un 503 o un corte de red y podría pasar de 8 peticiones reales).
- **429 detiene todo** y se muestra la espera del `Retry-After` (si no vino, 10 s); «Reintentar» queda desactivado hasta entonces. Otro error
  marca esa ruta como fallida y sigue con las demás. Nunca hay bucles de reintentos.
- **Se pide solo si se ve:** la sección carga su código y sus búsquedas cuando está a punto de entrar en pantalla (`IntersectionObserver`,
  300 px de adelanto); sin `IntersectionObserver` espera a que el navegador quede libre. Al salir de la página se cancela lo que esté en vuelo
  (`AbortSignal`; el cliente HTTP lanza `ABORTED`, que nunca se reintenta ni se muestra). El doble montaje de StrictMode no envía nada.
- Con el mock, las ofertas son búsquedas «de fondo» (`SearchOptions.background`): no reciben errores aleatorios (`VITE_MOCK_ERROR_RATE`), para que el inicio se
  vea completo sin API; los casos de error se piden con `?escenario=` (README, sección 5e). La API real trata `background` como cualquier búsqueda.
- Caché de 10 min en memoria y `sessionStorage` (con `try/catch`: sin almacenamiento la página funciona igual), clave ruta + fecha.
- **Decisión sobre «visible o inactivo»:** el encargo decía «cuando la sección entra en pantalla o el navegador está libre». Se eligió **solo
  al verse**: cargar al quedar libre gastaría búsquedas (hasta 8 de las 20 por minuto) en quien solo mira el título.

## 3. Lo que se leyó del backend (solo lectura, sin ejecutarlo) y corrigió textos de la Ayuda

Al escribir las preguntas frecuentes del inicio solo con reglas documentadas, se comprobó el código del backend (`chuchobck/backend_vuelos`) y se
encontraron **dos afirmaciones falsas que ya estaban en la página de Ayuda** (desde antes de la F7):

| Texto de la Ayuda | Lo que hace el backend | Qué se hizo |
|---|---|---|
| «Si no eliges asiento, te asignamos uno automáticamente sin costo **al hacer el check-in**» | El asiento se asigna **al crear la reserva**: el primero libre de la cabina, por fila y letra (`ops/reserva/asientos-reserva.ts`). El check-in **no asigna** nada: falla con 422 `CHECK_IN_FAILED` si un pasajero no tiene asiento en el vuelo (`ops/checkin/checkin.service.ts`) | Corregido: «te asignamos uno **al confirmar tu reserva**». Una prueba vigila que no vuelva a hablar del check-in |
| «Puedes cancelar sin costo dentro de las 24 horas siguientes a la compra si faltan más de 7 días para el vuelo» y «la tasa de ingreso a Galápagos se paga en el aeropuerto» | **No existe** regla de 24 h ni de 7 días: la penalidad depende de la familia tarifaria (Basic 100 %, Classic 35 %, Flex 10 %, Business Flex 0 %) y no hay tope de horas antes de la salida; nada habla de tasas de Galápagos | Quitado. «Términos» remite a la tarifa elegida, a la cotización de cancelación y a que los cargos por cambio no se devuelven. Una prueba impide que vuelvan `24 horas`, `7 días` o `tasa de ingreso` |
| «tipografía Atkinson Hyperlegible» (declaración de accesibilidad) | La interfaz usa Plus Jakarta Sans y Fraunces | Quitado |

Lo que SÍ dicen las preguntas del inicio (todo documentado en el README, sección 6 y `docs/DISCREPANCIAS-F6.md`, sección 0): equipaje por familia y maletas
extra con precio visible antes de pagar; Basic no admite cambios, Classic los cobra y Flex no, y nunca se devuelve la diferencia si el vuelo nuevo
es más barato; la cancelación muestra reembolso y penalidad antes de confirmar (Basic no devuelve dinero) con cotización de 15 min; check-in de 48 h a 60 min
antes (por vuelo); hold de 15 min con avisos a los 5 y 2 minutos.

## 4. Pendiente de verificación con la API real

| # | Qué se espera | Dónde mirar |
|---|---|---|
| 1 | Una carga del inicio hace **≤ 8** `POST /search` (esperado 6 con todas las rutas con vuelos en hoy + 3 días) y **cero** si se recarga dentro de 10 min | Red del navegador, filtro `search` |
| 2 | «Desde $X» coincide con la familia económica más barata de la misma búsqueda en `/resultados` (mismo origen, destino, fecha, 1 adulto, economía) | Tarjeta vs. resultados al hacer clic |
| 3 | Las 6 rutas tienen vuelos en hoy + 3 días (`DESTINATIONS_FROM` de `shared/api/airports.ts` se verificó el 2026-10-07 para «al menos una de 7 fechas»): **LOH → CUE** es la menos segura: en el mock sale con escala y solo los días en que vuela el tramo a Quito; en la API real no se ha comprobado si es directo ni cada cuántos días | Si una ruta no tiene vuelos, la interfaz prueba el día siguiente (hasta 3 fechas) |
| 4 | Ningún 429 en uso normal; si aparece, el `Retry-After` y su cuenta regresiva se ven y «Reintentar» se habilita al terminar | Cargar el inicio varias veces seguidas (más de 20 búsquedas en un minuto) |
| 5 | `availableSeats` = asientos libres de esa familia (solo en el aviso «Quedan N…») | Comparar con el mapa de asientos del vuelo |
| 6 | La latencia real de una búsqueda y el arranque en frío (el aviso aparece a los 8 s) | Solo en Render, que **no** se usa para esto |
| 7 | El 429 de la API real trae `Retry-After` (README, sección 6: «un 429 trae `Retry-After`») | Respuesta del 429 |

## 5. Medición de rendimiento (modo mock, compilación de producción)

Lighthouse 13 (móvil, estrangulación por defecto: 4G lenta y CPU ×4) sobre `vite preview` del build con `VITE_API_URL` vacía, 3 corridas cada una.
**No se llegó a la meta de LCP < 2,5 s.** Cifras reales en el README, sección 5e. Lo que más pesa: el SPA descarga y ejecuta unos 237 kB comprimidos de
JavaScript antes del primer pintado (el elemento LCP es el texto del inicio). Lo que no se hizo y haría falta para bajar de 2,5 s: generar el HTML del inicio
al compilar (prerender) o cargar el buscador después de pintar el título.

## 6. Decisiones donde el encargo era ambiguo

- **FAQ con `<details>` nativo y no con un acordeón de Radix:** `@radix-ui/react-accordion` no está instalado y el encargo pedía no sumar dependencias
  salvo que fuera esencial. El disclosure nativo ya se usaba en Ayuda, funciona con teclado y lectores de pantalla y no necesita JavaScript.
- **Orden de los chips de origen:** el de las rutas populares (Quito, Guayaquil, Loja…), no el del precio, para que no se muevan al recargar.
- **«Ver vuelo» no reutiliza la respuesta ya cargada:** abre `/resultados` con la misma búsqueda y esa pantalla la pide otra vez (una petición más). Sembrar su
  caché con lo de las ofertas ahorraría esa petición, pero acoplaría dos módulos; se prefirió la URL como única fuente.
- **Imágenes:** no hay imágenes bajo el pliegue (el arte es SVG en línea). Las dos que hay (marca del encabezado y del inicio) están sobre el pliegue y llevan `width`/`height`
  y `decoding="async"`; `loading="lazy"` en ellas empeoraría el LCP.
- **Open Graph:** `og:title` y `og:description` se actualizan por ruta; `og:image` y `og:url` piden la dirección pública definitiva (F8). Los rastreadores que no
  ejecutan JavaScript leen lo de `index.html` (la descripción del inicio).
- **`lang="es"`** (el encargo lo pedía así; antes era `es-EC`). Los formatos de fecha y moneda siguen usando `es-EC` en el código.
- **E2E / axe:** el repositorio tiene un solo script E2E (`e2e/seats-demo.mjs`, del selector de asientos) y ninguna revisión automática de accesibilidad,
  así que no se agregó el inicio (sería infraestructura nueva: F8). Se midió con Lighthouse (accesibilidad 100) fuera del repositorio.
