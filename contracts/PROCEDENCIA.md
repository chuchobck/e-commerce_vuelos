# Procedencia del contrato

`vuelos-openapi.yaml` es una copia sin cambios del contrato del backend.

| Dato | Valor |
|---|---|
| Fuente | https://raw.githubusercontent.com/chuchobck/backend_vuelos/main/contracts/vuelos-openapi.yaml |
| Repositorio | https://github.com/chuchobck/backend_vuelos |
| Commit del contrato | `bba68bfe7ebe46a1f1815d43c6c72244ec0d16e1` (2026-10-06) |
| Copiado | 2026-10-07 |
| Versión (`info.version`) | 1.5.0.0 |

Diferencias conocidas entre la API real y el contrato: `docs/DISCREPANCIAS-CONTRATO.md` del backend,
más las que encontramos en el frontend (README, sección 6).

Para actualizarlo: descargar de nuevo el archivo, actualizar esta tabla y correr `npm run api:types`.

## OpenAPI del backend (`backend-openapi.json`)

El contrato del equipo no trae la cuenta (`/auth/*`). Sus formas salen del documento que publica el
propio backend (NestJS/Swagger), copiado sin cambios:

| Dato | Valor |
|---|---|
| Fuente | `GET http://localhost:3010/api/docs-json` (backend local) |
| Versión (`info.version`) | 1.0.0 |
| Copiado | 2026-10-07 |

`npm run api:types` genera `src/shared/api/generated/backend.ts`; `src/shared/api/contract.ts` solo
les pone nombre (`RegisterRequestDto`, `TokenResponseDto`, `UserResponseDto`…).

## Esquema GraphQL del BFF (`bff-schema.graphql`)

Desde el Reto 2, las tres lecturas públicas (búsqueda, mapa de asientos y estado de vuelo) pueden
pedirse al BFF por GraphQL. `bff-schema.graphql` es una copia **exacta** de su `schema.graphql`; es
la fuente de las consultas de `src/shared/api/graphql` (una prueba las valida contra este archivo
con graphql-js).

| Dato | Valor |
|---|---|
| Repositorio | https://github.com/chuchobck/bff_vuelos |
| Rama | `feat/r2-bff` (`main` aún no trae `src/graphql/schema.graphql`; al fusionarse, cambiar la fuente a `main`) |
| Archivo | `src/graphql/schema.graphql` |
| Commit | `2bee8a28734ae5debb2baf0e76783e42baea9726` (2026-10-15) |
| SHA-256 de la copia | `0e501f1afaf0fef6b468dce2e4a2e8b47b7bd20a4c4717509ef33ad99e90d276` |
| Copiado | 2026-10-15 |

`npm run schema:sync` vuelve a descargarlo y avisa si cambió; `npm run schema:check` solo compara
(sale con código 1 si difiere) y sirve de aviso en CI o antes de empezar a trabajar. Una prueba
(`src/shared/api/graphql/schemaCopy.test.ts`) comprueba que la copia local no se editó a mano: su
SHA-256 debe ser el de esta tabla. Si el esquema cambia: `npm run schema:sync`, revisar las consultas,
actualizar commit y SHA-256 aquí y correr `npm test`.
