# Rendimiento web · medición del 18/11/2026

Medición sobre la demo pública, Chromium headless, caché fría por contexto, `networkidle`, viewport
390×900 y 1280×900. `LCP` es la última entrada de `largest-contentful-paint`.

| Página | 390 ancho total | LCP 390 | 1280 total | LCP 1280 |
|---|---:|---:|---:|---:|
| Inicio | 1.497 ms | 764 ms | 1.209 ms | 508 ms |
| Competición 44 | 1.050 ms | 400 ms | 1.189 ms | 416 ms |
| Previa 93926 | 1.308 ms | 556 ms | 874 ms | 300 ms |

Presupuesto propuesto: LCP < 2.500 ms en 4G, CLS < 0,1, sin scroll horizontal, HTML inicial < 120 KB
sin imágenes. Las tres páginas están por debajo en esta medición local; la red real y el TTFB del VPS
son la variable que falta.

## Qué se revisa antes de abrir

1. **Consultas**: `EXPLAIN (ANALYZE, BUFFERS)` de portada, competición, jornada, previa, goleadores y
   equipo. Índices nuevos sólo en migración nueva.
2. **Conexiones**: PgBouncer delante de PostgreSQL; el web no abre una conexión por visita.
3. **Caché**: `revalidate` y `revalidateTag`; no cachear datos de cuenta.
4. **Imágenes**: escudos/fotos estáticos con caché; no leer binarios de la base por visita.
5. **Bundle**: `next build` no debe subir de forma no justificada; revisar imports de componentes
   pesados en páginas que no los usan.
6. **Móvil**: cabecera 168 px, tablas con scroll explícito y objetivos táctiles ≥ 44 px.
7. **Repetición**: medir con Lighthouse en el VPS y con red 4G simulada; no confundir local con
   producción.

## Comandos

```bash
# local
pnpm --filter @facylf/web build
pnpm --filter @facylf/web start
# consola del navegador o Playwright:
# performance.getEntriesByType('largest-contentful-paint')
```

No se ha ejecutado Lighthouse ni WebPageTest en esta ronda; las cifras de arriba son Playwright, no
Lighthouse. Se anota la diferencia para no vender una métrica como otra.


## Consultas medidas con pg_stat_statements

Las consultas de la web (rol `facylf_lector`) con más tiempo medio en la base local:

| Consulta | Media | Llamadas | Lectura |
|---|---:|---:|---|
| Eventos de acta | 1.660 ms | 319 | La más pesada de una página pública; candidata a índice/cache por partido |
| Convocatorias de acta | 1.242 ms | 319 | Se puede cargar junto con los eventos |
| Catálogo de grupos | 221 ms | 1.544 | Aceptable; cacheado |
| Grupos del selector | 4,25 ms | 44.586 | Bien |
| Diagnóstico de salud | 12.432 ms | 39 | **No es una página pública**; mantener fuera de la navegación normal |
| Diagnóstico de cobertura | 34.800 ms | 2 | **No público**; no debe ejecutarse en cada visita |

Acción: revisar el plan de eventos de acta y convocatorias (`EXPLAIN ANALYZE`) y añadir índice o cache
por `match_id`; no tocar las consultas de diagnóstico, que son de administración y no del recorrido del
usuario.
