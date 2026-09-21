# ADR-0004 — Cobertura precalculada y versionada

- Estado: aceptada
- Fecha: 2026-09-13

## Contexto

Calcular si una competición está completa mediante subconsultas a la cola en cada página es caro y
no expresa la temporada activa.

## Decisión

El publicador mantiene checkpoints con recuentos, calidad, última jornada completa y estado de
visibilidad. La web sólo los lee.

## Consecuencias

La publicación es rápida y auditable. El publicador debe actualizar el checkpoint en la misma
versión lógica que los datos afectados.
