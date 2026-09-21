# ADR-0008 — PostgreSQL canónico en contenedor local, sin proveedor gestionado

- Estado: aceptada
- Fecha: 2026-09-14

## Contexto

ADR-0001 fija PostgreSQL como base de consulta canónica pero deja el alojamiento sin decidir. El
repositorio conserva scripts `supabase db push` de una etapa anterior y hay un proyecto Supabase
accesible. Los datos incluyen nombres de menores y el volumen objetivo son millones de actas
(32,7 GB de evidencia ya guardada y 5,35 millones de actas proyectadas).

## Decisión

El canónico se desarrolla y se opera sobre PostgreSQL 18 en contenedor, en el equipo del proyecto y
después en un servidor privado. Escucha sólo en `127.0.0.1`. Ningún proveedor gestionado está en el
camino crítico.

## Alternativas consideradas

- **Supabase como canónico**: buenas herramientas y tipos generados, pero saca datos personales de
  menores del equipo, y el volumen objetivo no encaja en un plan asequible.
- **Supabase sólo como entorno de demostración**: posible más adelante, con una competición pequeña
  y datos sintéticos. No se descarta, pero no condiciona el esquema.

## Consecuencias

- Las migraciones son SQL plano numerado, aplicables tanto en local como en el servidor; no dependen
  de la CLI de ningún proveedor.
- Los scripts `db:migrar` y `db:tipos` basados en Supabase quedan obsoletos y se sustituyen.
- El coste de disco del canónico recae en el mismo equipo que ya sostiene diecisiete recolectores:
  se mide por federación antes de cargar, y el volumen del contenedor va, si es posible, a otra
  partición que `descargas-*`.
- Los tipos TypeScript se generan desde el esquema propio, no desde un servicio.

## Cómo revertirla

El esquema es PostgreSQL estándar y no usa extensiones exclusivas de ningún proveedor salvo
`pg_trgm` y `pg_stat_statements`, disponibles en cualquier PostgreSQL gestionado. Trasladar la base
es volcar y restaurar.
