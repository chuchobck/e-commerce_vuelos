# Perfil de viajero en el backend (propuesta B)

Estado a 2026-10-12. **Es solo una propuesta**: hoy el perfil es local (README, sección 5f). Este texto es para cuando se quiera moverlo al backend. No se tocó el backend.

## Por qué

El perfil local vive solo en un navegador: no sigue a la persona entre dispositivos, se pierde al limpiar los datos del navegador y deja documento, fecha de nacimiento y contacto en
claro en un almacén que un script (XSS) o quien comparta el equipo puede leer. Un perfil en el backend arregla las tres cosas, a cambio de guardar datos personales en un servidor.

## Contrato propuesto

Todo bajo `/auth/me/profile` (la cuenta ya es `/auth/me`), con sesión y sin permisos nuevos al principio (cada persona solo ve y cambia el suyo; una reserva ajena sigue siendo 404 y un perfil ajeno no existe).

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/auth/me/profile` | El perfil del usuario de la sesión. `404` si todavía no tiene |
| `PUT` | `/auth/me/profile` | Crea o reemplaza el perfil completo (idempotente: el mismo cuerpo, el mismo resultado). `422` con `invalidParams` por campo |
| `DELETE` | `/auth/me/profile` | Borra el perfil (derecho de supresión). `204`, y repetirlo también es `204` |

Cuerpo (los mismos nombres del pasajero de la reserva, `PassengerItem`, para no inventar otro vocabulario):
`firstName`, `lastName`, `documentType` (`NATIONAL_ID` | `PASSPORT`), `documentNumber`, `nationality` (ISO 3166-1 alfa-2, un país que la API conozca), `gender` (`F` | `M` | `X`), `birthDate` (`yyyy-MM-dd`),
`documentExpiryDate` (`yyyy-MM-dd`, solo con pasaporte), `contact.email` y `contact.phone` (+593 y 9 dígitos).
Mismas validaciones que el DTO de la reserva (nombres solo letras, cédula con módulo 10, pasaporte de 5 a 20 caracteres, adulto de 18 años o más) para que **el perfil nunca dé lo que la reserva rechazaría**.

## Base de datos

Una tabla `perfil_viajero` con `usuario_id` como llave primaria y foránea (uno por usuario, `ON DELETE CASCADE`), los campos de arriba, `creado_en` y `actualizado_en`. El número de documento
y la fecha de nacimiento, cifrados en reposo (o al menos con acceso restringido y sin salir en logs ni en errores). Migración nueva en `db/`; la semilla no crea perfiles.

## Qué cambia en el frontend

- `shared/profile/perfilViajero.ts` es el único lugar que toca el almacenamiento: se cambia su implementación sin tocar los componentes. Hoy es síncrono; contra el backend sería asíncrono (`read`/`save`/`remove`
  devuelven promesas, `usePerfilViajero` pasa a tener estado de carga), y las pantallas que lo leen (el paso 2 y el aviso) deben tolerar «cargando».
- Las llamadas van por `FlightsApi` (mock y real) con `authorized(...)`; el mock guarda en su base en memoria. Los tipos salen del contrato regenerado (`npm run api:types`), no se escriben a mano.
- **Migración:** el perfil local existente se ofrece subir una sola vez, con el consentimiento de la persona («Guardar mis datos en tu cuenta»), y después el local queda como caché o se borra. Si el
  backend ya tiene perfil y el local es distinto, gana el del backend y se avisa.
- El registro seguiría mandando solo `{ email, password }` y el `PUT` iría después del ingreso (con sesión); si el `PUT` falla, la cuenta ya existe y se reintenta desde Mi perfil.
- Se retira el aviso «se guarda solo en este dispositivo» y se cambia por una política de privacidad real: qué se guarda, para qué, cuánto tiempo y cómo borrarlo.

## Pendiente de decidir (no son del frontend)

- Base legal y consentimiento para guardar datos personales (en Ecuador rige la Ley Orgánica de Protección de Datos Personales): quién es el responsable, plazo de conservación y cómo se atienden los pedidos de acceso, corrección y supresión.
- Si el perfil debe poder tener varios viajeros frecuentes (familia) y no solo el titular: el modelo de una fila por usuario no alcanza y habría que pasar a una lista.
- Límite de tasa de los nuevos endpoints y si necesitan un permiso (`scope`) propio.
- Cómo se comparte con la Payment API real (si algún día pide datos del titular): fuera de este alcance.
