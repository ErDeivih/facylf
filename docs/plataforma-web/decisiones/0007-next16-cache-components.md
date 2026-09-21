# ADR-0007 — Migrar a Next.js 16 y activar Cache Components antes de construir

- Estado: aceptada
- Fecha: 2026-09-14

## Contexto

La aplicación está en Next 15.1 con App Router y unas 25 rutas. Hoy `repositorio-local.ts` llama
`noStore()`, así que el `revalidate = 60` de las páginas no produce caché real. Las fases 3 a 5 del
plan añaden más de veinte pantallas nuevas.

Next 16 sustituye `dynamic`, `revalidate` y `fetchCache` por la directiva `use cache` con
`cacheLife` y `cacheTag`, incorpora el prerenderizado parcial que antes era experimental y valida en
desarrollo qué rutas no renderizan de forma instantánea.

## Decisión

Migrar a Next 16 y activar `cacheComponents` en una rama propia, antes de escribir las pantallas
nuevas y antes de conectar el repositorio PostgreSQL.

## Alternativas consideradas

- **Quedarse en Next 15** y montar la invalidación por etiquetas sobre `unstable_cache`: funciona,
  pero es exactamente la API que Next 16 reemplaza, y habría que migrar cuarenta y tantas rutas en
  vez de veinticinco.
- **Migrar al final, cuando el producto esté hecho**: multiplica el coste y arriesga una migración
  grande sobre una base sin pruebas E2E todavía consolidadas.

## Consecuencias

- `cacheTag('edicion:{id}')` + `revalidateTag` pasa a ser el mecanismo nativo de invalidación del
  publicador, sin capa propia.
- Obliga a envolver `params`, `searchParams`, `cookies()` y `headers()` en `<Suspense>`, lo que
  empuja el diseño hacia shell estático + streaming; es la arquitectura que el proyecto quiere.
- Rompe: `generateStaticParams` no puede devolver `[]`, `dynamicParams` desaparece,
  `runtime = 'edge'` no está soportado, y `new Date()` o `Math.random()` durante el prerenderizado
  fallan el build.
- El estado de los componentes sobrevive a la navegación: los reseteos pasan a ser explícitos.

## Cómo revertirla

La rama se mantiene separada hasta que pasen las pruebas E2E y los presupuestos. Si la migración
degrada tiempos o bloquea rutas, se descarta la rama y se continúa en Next 15 con `unstable_cache`,
manteniendo el mismo contrato de etiquetas para poder reintentarlo más adelante.
