# ADR-0001 — SQLite como staging y PostgreSQL como consulta

- Estado: aceptada
- Fecha: 2026-09-13

## Contexto

Los recolectores necesitan colas independientes, reanudables y cercanas a sus archivos. La web,
sin embargo, necesita relaciones globales, búsqueda e índices sobre millones de filas.

## Decisión

Conservar SQLite y los originales como staging/evidencia. Publicar incrementalmente a una única
base PostgreSQL canónica que será la fuente de lectura de la web objetivo.

## Consecuencias

Hay que construir y validar un publicador idempotente. A cambio, la web deja de abrir 18 archivos,
los workers no se acoplan al tráfico y puede reconstruirse todo desde la evidencia.

## Reversión

El contrato de consultas admite un adaptador SQLite temporal; PostgreSQL no elimina las fuentes.
