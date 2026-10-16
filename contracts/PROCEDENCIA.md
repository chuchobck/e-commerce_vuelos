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

## OpenAPI de identity (`identity-openapi.json`)

El contrato del core no trae la cuenta. Desde la fase 6c del Reto 2 la cuenta (`/identity/v1/auth/*`) la sirve
identity, y sus formas salen de **su** contrato, copiado sin cambios. Reemplaza a `backend-openapi.json` (el
`/api/docs-json` del core, con `/flights/v1/auth/*`), que ya no se usa y se borró.

| Dato | Valor |
|---|---|
| Repositorio | https://github.com/chuchobck/identity_vuelos |
| Rama | `main` |
| Archivo | `contracts/identity-openapi.json` |
| Commit que lo cambió por última vez | `0a61de18038f0d7f7a10e3a9e61576b59ba143e2` (2026-10-16) |
| Commit de `main` al copiarlo | `e856f911790d31fca17e45fdd14aab86a7e70dfc` |
| Versión (`info.version`) | 0.2.0 |
| SHA-256 de la copia | `acd43cf2fd6620a927e7a7ccf26902bd9d72418993092f97ef4ba7c770b6cbb8` |
| Copiado | 2026-10-16 |

`npm run api:types` genera `src/shared/api/generated/identity.ts`; `src/shared/api/contract.ts` solo les pone
nombre (`RegisterRequestDto`, `TokenResponseDto`, `UserResponseDto`…). Frente al contrato anterior del core, los
cuerpos de `register`, `login`, `refresh` y `logout` y las respuestas de `register`, `login`, `refresh` y `me` son
idénticos campo por campo; solo cambia el texto de la descripción de `refresh_token`. Una prueba
(`src/shared/api/identityContract.test.ts`) valida lo que el cliente envía y las rutas contra este archivo y
comprueba que el SHA-256 de esta tabla es el de la copia. Para actualizarlo: copiar el archivo de identity, anotar
commit y SHA-256 aquí, correr `npm run api:types` y después `npm run typecheck`.

## Esquema GraphQL del BFF (`bff-schema.graphql`)

Desde el Reto 2, las tres lecturas públicas (búsqueda, mapa de asientos y estado de vuelo) pueden
pedirse al BFF por GraphQL. `bff-schema.graphql` es una copia **exacta** de su `schema.graphql`; es
la fuente de las consultas de `src/shared/api/graphql` (una prueba las valida contra este archivo
con graphql-js).

| Dato | Valor |
|---|---|
| Repositorio | https://github.com/chuchobck/bff_vuelos |
| Rama | `main` (el PR #1 de `feat/r2-bff` ya está fusionado) |
| Archivo | `src/graphql/schema.graphql` |
| Commit de `main` | `faa703f243d23101a198553cdf2a56d297fb7ede` (2026-10-15, fusión del PR #1) |
| Último commit que cambió el archivo | `2bee8a28734ae5debb2baf0e76783e42baea9726` (2026-10-15, ya dentro de `main`; es el commit del que se copió antes de la fusión) |
| SHA-256 de la copia | `0e501f1afaf0fef6b468dce2e4a2e8b47b7bd20a4c4717509ef33ad99e90d276` |
| Copiado | 2026-10-15 (desde `feat/r2-bff`, 2bee8a2) |
| Verificado contra `main` | 2026-10-15: `BFF_SCHEMA_REF=main npm run schema:sync` → «El esquema no cambió» (mismo SHA-256) |

`npm run schema:sync` vuelve a descargarlo y avisa si cambió; `npm run schema:check` solo compara
(sale con código 1 si difiere) y sirve de aviso en CI o antes de empezar a trabajar. La referencia del BFF
sale de `BFF_SCHEMA_REF` (rama, etiqueta o commit; por defecto `main`). Pasos para volver a
sincronizar: `docs/GRAPHQL-CLIENTE.md`, sección 6.1. Una prueba
(`src/shared/api/graphql/schemaCopy.test.ts`) comprueba que la copia local no se editó a mano: su
SHA-256 debe ser el de esta tabla. Si el esquema cambia: `npm run schema:sync`, revisar las consultas,
actualizar commit y SHA-256 aquí y correr `npm test`.
