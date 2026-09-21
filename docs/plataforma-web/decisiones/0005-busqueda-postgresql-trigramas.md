# ADR-0005 — Búsqueda inicial en PostgreSQL con trigramas

- Estado: aceptada
- Fecha: 2026-09-13

## Contexto

Se necesitan tildes tolerantes, erratas, apodos, homónimos y facetas, pero no está demostrado que
haga falta operar otro motor.

## Decisión

Crear una proyección `search_entity` y usar B-tree para facetas y GIN `pg_trgm` para similitud.

## Consecuencias

Menos infraestructura y consistencia transaccional. Se reconsiderará un motor externo sólo si las
mediciones de relevancia, latencia o volumen lo justifican.
