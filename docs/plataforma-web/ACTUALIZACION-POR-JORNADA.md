# Actualización automática cuando la jornada está completa

**Fecha:** 14/11/2026. Sustituye la idea de «actualización semanal a mano»: **cada hora** se comprueba si la
extracción ha dejado una jornada completa y, sólo entonces, se importa al canónico y se republica la demo.

## 1 · Qué hay registrado

| Pieza | Valor |
|---|---|
| Tarea programada | **`FACyLF actualizacion por jornada`**, cada **1 hora** (Windows Task Scheduler) |
| Comando que ejecuta | `powershell -NoProfile -ExecutionPolicy Bypass -File F:\\Proyectos\\facylf\\scripts\\actualizacion-por-jornada.ps1` |
| Script | [`scripts/actualizacion-por-jornada.ps1`](../../scripts/actualizacion-por-jornada.ps1) |
| Registro | `estado/actualizacion-jornada.log` (una línea por paso) |
| Marca de idempotencia | `estado/actualizacion-jornada.json` (`{temporada, listos, importado_en}`) |

Cuando no hay nada nuevo termina en **< 1 s** y no escribe en la base: primero mira la cola SQLite
(`estado-rotacion.mjs`, sólo lectura) y compara con la marca.

## 2 · Qué hace cada paso, con el comando exacto

| Paso | Comando | Qué comprueba |
|---|---|---|
| 0. Preflight | `docker inspect -f '{{.State.Running}}' facylf-postgres` | que la base está viva; si no, sale con código 2 sin tocar nada |
| 1. ¿Hay jornada completa? | `node scripts\claude\estado-rotacion.mjs --temporada 2026-27` | grupos con **calendario + partidos + todas las actas hechas** en la cola; el número sale de «listos para probar importación» |
| 2. ¿Es nuevo? | leer `estado\actualizacion-jornada.json` | si los «listos» no han subido y han pasado menos de 6 h, no hace nada |
| 3. Importar al canónico | `powershell -File scripts\ciclo-diario-cyl.ps1 -SinServidor` | reutiliza el ciclo diario: `importar-masivo` por tandas + codificación + cobertura. **No duplica**: cada trabajo se importa por su clave natural |
| 4. Republicar la demo | `powershell -File tmp\publica-demo.ps1` | mirror + render con Chrome + `git push` a `fondo-popular-demo` |
| 5. Marca | escribe `{temporada, listos, importado_en}` | sólo si la importación terminó bien |

**La base de la app** no es una copia: la app lee el canónico, así que queda al día en el paso 3. Lo que se
republica aparte es la **foto estática** (la demo de GitHub Pages), que necesita el paso 4. Si la app no está
levantada en `http://127.0.0.1:3002`, el paso 4 avisa (`AVISO: la publicacion devolvio N`) y deja el canónico ya
importado; la siguiente hora lo reintenta.

## 3 · Cómo se comprueba que NO ha duplicado nada

1. **Recuentos antes/después** (los imprime el propio script en el registro):
   ```sql
   select (select count(*) from core.match) || '|' ||
          (select count(*) from core.match_report) || '|' ||
          (select count(*) from core.appearance);
   ```
2. **Segunda pasada**: `-ComprobarIdempotencia` vuelve a medir tras importar y exige los mismos tres números.
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\actualizacion-por-jornada.ps1 -ComprobarIdempotencia
   ```
3. **Claves naturales**: `core.match` tiene clave por federación/competición/grupo/jornada/equipos y
   `core.appearance` por partido/persona; el importador hace *upsert* por esas claves, no `insert` ciego.
4. **Repetir la comprobación de cola**: dos ejecuciones seguidas de `estado-rotacion.mjs` deben dar el mismo
   número de «listos» (si baja es que se importaron; si sube, que el recolector hizo actas nuevas, no que se
   duplicó nada).

## 4 · Modo simulación y parada

```powershell
# no escribe nada: dice qué haría y por qué
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\actualizacion-por-jornada.ps1 -Simular

# parar la automatización (no desinstala nada del proyecto)
schtasks /Change /TN "FACyLF actualizacion por jornada" /DISABLE
```

## 5 · Lo que NO hace

- No cambia pausas, workers ni la rotación de temporadas.
- No sube nada al servidor ni toca la ingesta.
- No importa si la cola no tiene todos los partidos con acta: espera a la siguiente hora.
