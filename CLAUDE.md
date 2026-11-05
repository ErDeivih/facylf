# Plataforma privada de fútbol federado

El estado y las decisiones vigentes están en `docs/plataforma-web/`. Para trabajo de plataforma usa
primero `.claude/skills/plataforma-web-futbol/SKILL.md`; esa skill conduce sólo a los documentos
necesarios para cada tarea. `PROYECTO.md` conserva contexto histórico y no prevalece sobre la
arquitectura actual.

## Invariantes

- Trabaja en español y no inventes datos ausentes. Desconocido, no publicado y pendiente son estados
  distintos; nunca los conviertas en cero.
- Una identidad externa siempre incluye federación y contexto. Nombre igual no implica persona igual.
- Club, equipo-temporada e inscripción en una competición son entidades diferentes.
- Las SQLite y los archivos comprimidos son evidencia de ingesta. La web objetivo consulta el
  PostgreSQL canónico mediante un rol de sólo lectura.
- La instancia es privada. Los nombres de menores **se publican** porque la federación tiene
  consentimiento de tratamiento (decisión de David, 05/11/2026, `DOCTRINA-CALIDAD.md` §9); las
  **fotos** de personas, y en particular de menores, **no se publican**. No abras datos a Internet sin
  una decisión explícita y una revisión de `docs/plataforma-web/SEGURIDAD-OPERACION.md`.
- Conserva los límites, pausas, reintentos e idempotencia de los recolectores. No dupliques workers ni
  cambies su ritmo como efecto lateral de una tarea web.
- No edites una migración de `infra/migraciones/` que ya haya sido aplicada: añade otra.
- Un valor de la cola fuera del vocabulario documentado detiene el lote; no existe un destino `otro`.

## Trabajo en curso

El encargo aprobado es `docs/plataforma-web/ENCARGO-IMPORTADOR.md`: el importador incremental de
SQLite a PostgreSQL. Es autosuficiente y no requiere contexto previo. No se construyen pantallas
nuevas hasta que exista.

## Comprobaciones mínimas

```bash
pnpm test
pnpm lint
pnpm --filter @facylf/web exec tsc --noEmit
```

Las pruebas pesadas de PostgreSQL, Playwright y carga se ejecutan cuando no compitan con los workers
o en otra máquina. Que una prueba esté descrita en el plan no significa que ya esté implementada.
