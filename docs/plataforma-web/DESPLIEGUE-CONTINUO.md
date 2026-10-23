# Integración y despliegue continuo de la plataforma web

> Claude, 22/10/2026. Para los recolectores sigue valiendo `DESPLIEGUE-CODIGO.md` (código montado de sólo
> lectura en el servidor). Esto es para la **plataforma web y su base** (fase C en adelante).

## 1. Integración continua: cada cambio pasa cuatro comprobaciones

`.github/workflows/test.yml`, en cada push y pull request:

| Trabajo | Qué comprueba | Tiempo |
|---|---|---|
| `test` | pruebas de la aplicación (`pnpm test`, vitest) | ~2 min |
| `sql` | las 180 comprobaciones de `pruebas/sql/m29-m38` sobre PostgreSQL embebido | ~8 min |
| `migraciones` | aplicar **todas** las migraciones en orden sobre un **PostgreSQL 18 real** vacío, otra vez las nuevas (no rompen si se repiten) y una prueba de humo | ~2 min |
| `rendimiento` (lunes y a mano) | base de volumen inventada + `EXPLAIN` de las 55 consultas; falla si alguna se queda sin índice | ~20 min |

Encontrado al montarlo: si la extensión `pg_stat_statements` existe pero no está precargada, **todos** los
chequeos de salud de 0030 fallaban (la vigilancia se quedaba ciega en el servidor). Arreglado en 0035.

## 2. Despliegue continuo en el PC: `scripts/despliega-plataforma.mjs`

Azul/verde con carpetas, sin tocar la copia de trabajo del repositorio:

```
F:\facylf-web\versiones\<commit>\   una carpeta por versión (git worktree)
F:\facylf-web\actual                 unión → la que sirve la tarea «FACyLF web»
```

1. Guardias: ≥ 3 GiB libres; nunca sábado ni domingo de 9 a 21 h (hay partidos y avisos).
2. ¿Hay commit nuevo en `origin/main`? ¿Están **las cuatro** comprobaciones en verde para ese commit (`gh api`)?
   Si no, no se despliega.
3. Construye la versión en su carpeta (`pnpm install --frozen-lockfile`, `pnpm --filter web build`).
4. **Copia de seguridad comprobada**; si falla, para (no se migra sin copia).
5. Migraciones desde la versión nueva. Por regla del repositorio sólo añaden (nunca borran ni renombran
   columnas que la versión anterior use), así que volver atrás no exige deshacerlas.
6. Cambia `actual`, reinicia la web y pide `/api/salud` hasta un minuto.
7. Si no responde «ok», **vuelve sola a la versión anterior** y avisa por Telegram/ntfy (evento en
   `ops.evento_app`). Probado el 22/10 con una web falsa: despliega, y con la salud rota vuelve en 60 s.
8. Guarda las 5 últimas versiones para poder volver (`--volver`).

```
node scripts/despliega-plataforma.mjs                  # simula: dice lo que haría
node scripts/despliega-plataforma.mjs --de-verdad      # despliega
node scripts/despliega-plataforma.mjs --volver         # vuelve a la anterior
```

Montaje (una vez, cuando la fase C tenga la web lista; **decide David**):
- Tarea «FACyLF web» que arranca `node F:\facylf-web\actual\apps\web\.next\standalone\server.js` con el
  `.env` de la web (puerto 3000, sólo 127.0.0.1 o la red de casa).
- `gh auth login` en el PC (para leer el estado de la integración continua).
- Opcional: tarea diaria a las 5:45 con `--de-verdad` (después de copia y mantenimiento). Hasta entonces, a mano.

## 3. Métricas del despliegue (en el panel, área Procesos)

- Último despliegue y su commit, despliegues fallidos y vueltas atrás: `ops.evento_app` tipo `despliegue`.
- Tiempo desde el commit hasta que está en marcha (objetivo: < 1 día).
- Tras cada despliegue, la vigilancia compara el p95 de las consultas con la hora anterior
  (`ops.consulta_minuto`): si una consulta empeora más de ×2, alerta `p95_sobre_presupuesto`.

## 4. Qué no hace (a propósito)

- No despliega en el servidor de recolección (otro mecanismo, otra máquina, otros riesgos).
- No ejecuta `docker compose up -d` ni toca contenedores: la web corre como proceso de Node en el PC.
- No borra datos ni migraciones; no aplica nada sin copia comprobada.
