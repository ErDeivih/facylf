# ADR-0006 — Infraestructura añadida sólo por evidencia

- Estado: aceptada
- Fecha: 2026-09-13

## Contexto

Redis, particiones, microservicios y motores de búsqueda pueden ayudar a gran escala, pero también
añaden fallos, coste y mantenimiento.

## Decisión

Comenzar con Next.js Node, PostgreSQL, publicador y almacenamiento privado. Añadir componentes sólo
cuando un presupuesto medido no se cumpla y la alternativa resuelva ese cuello concreto.

## Consecuencias

La arquitectura permanece comprensible. Cada ampliación futura necesita una ADR con métrica,
alternativas y plan de reversión.
