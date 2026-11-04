# Métricas para el panel — `metricas-facylf.json`

Lo lee el panel de proyectos. **El panel no calcula nada**: el proyecto mide y publica un fichero con
forma fija. Lo genera `scripts/metricas-facylf.mjs` (sólo lectura sobre las colas y el canónico; en el
servidor no instala nada).

## Forma (contrato cerrado con David, 2026-11-04)

```json
{"cyl": {"competiciones_total": 0, "completas": 0, "porcentaje": 0},
 "temporadas": [{"temporada": "2025-26", "hecho": 0, "total": 0}],
 "ritmo": {"pc_por_min": 0, "servidor_por_min": 0, "medido": "AAAA-MM-DDTHH:MM"}}
```

No se añaden claves: lo que no quepa se explica aquí, no dentro del JSON.

## Qué significa cada número (y qué NO significa)

- **`competiciones_total`** — competiciones (ediciones de competición: una liga/división en una
  temporada) que hay que terminar en Castilla y León. Es la **unión** de las que conocen las colas de
  CyL del PC y del servidor y las que ya están en el canónico, sin duplicar por `(temporada, código)`.
  Incluye las de La Preferente (el rol de lectura de la web las esconde; este fichero mide la ingesta,
  no la oferta pública).
- **`completas`** — ediciones cuyo **todos** sus grupos tienen cobertura `completa` en
  `ops.coverage_checkpoint`. Un grupo `parcial_privada` no cuenta: la fuente publica menos, pero falta
  dato. Es el criterio estricto de la cobertura que ya usa el proyecto (jornadas, resultados y actas).
- **`porcentaje`** — lo que **falta**, entero y redondeado: `100 − completas/total`. Si no hay
  competiciones es 0 (no hay nada que falte), nunca 100.
- **`temporadas[]`** — la misma cuenta por temporada, de la más reciente a la más antigua, incluyendo
  las que sólo están en las colas o sólo en el canónico. `hecho` = completas de esa temporada;
  `total` = competiciones conocidas de esa temporada. La suma de `total`/`hecho` cuadra con `cyl`.
- **`ritmo.pc_por_min` / `ritmo.servidor_por_min`** — peticiones HTTP por minuto de **cada máquina**,
  todas las federaciones, medidas sobre una **ventana de 5 minutos cerrada hace 1 minuto** y expresadas
  por minuto (90 peticiones en 5 min = 18/min), con un decimal. No es la media desde que arrancó la
  ingesta; es lo que está pidiendo ahora. Dos detalles medidos: la fila de `peticiones` se inserta al
  **terminar** la petición, así que contar hasta el segundo actual subestimaba un 20-30 % (de ahí el
  minuto de retardo); y no se cuenta «por minuto» con una foto de 60 s porque daba ceros y picos de
  ráfaga.
- **`ritmo.medido`** — marca local `AAAA-MM-DDTHH:MM` (Europe/Madrid) del momento de la medición. Si
  el fichero tiene una fecha vieja, el panel debe enseñarla tal cual: significa que la última medición
  no se pudo completar.
- **Precisión del ritmo**: el minuto de retardo reduce el sesgo de las peticiones en vuelo de un
  20-30 % a un **≈5-6 % residual** (medido el 04/11/2026 contra una relectura directa de la misma
  ventana). Sigue siendo una cota ligeramente inferior: una petición muy larga que empieza dentro de la
  ventana y termina después no se cuenta. Para el panel es aceptable y está dicho aquí; si alguna vez
  necesita exactitud absoluta, hay que contar por finalización, no por inicio.

## De dónde sale

| Dato | Fuente | Cómo |
|---|---|---|
| Catálogo de CyL (PC) | `descargas-federacion/recolector-local/cola-v2.sqlite` | tablas `temporadas` y `competiciones`, lectura |
| Catálogo de CyL (servidor) | misma cola en el servidor | por SSH, sondeo **en memoria** (`docker exec -i facylf-monitor node -`), no se instala nada |
| Completas | PostgreSQL canónico | `core.competition_edition` + `core.phase_group` + `ops.coverage_checkpoint`; rol `DATABASE_URL_PUBLICADOR` para ver también La Preferente |
| Ritmo | colas de las dos máquinas | `peticiones` con `iniciada_en` en la ventana, índice `peticiones_iniciada` |

## Fallos: mejor un dato viejo con fecha que un cero falso

Si falla una fuente (SSH al servidor, canónico, una cola ilegible —incluidas las del servidor— o una
cola local que no se pueda abrir), el script **no escribe**: deja el `metricas-facylf.json` anterior tal
cual y sale con código 1 y el motivo por stderr. El panel seguirá enseñando la última medición buena con
su `medido`; no se convierte «no se sabe» en 0.

En este PC las carpetas `descargas-*` de la raíz son **junctions** a `E:`. El generador las sigue con
`statSync` (`scripts/lib/colas-locales.mjs`), no con `Dirent.isDirectory()`, que las descartaría todas y
publicaría un ritmo de PC de 0 aunque estuviera pidiendo.

## Cómo se ejecuta

```powershell
node scripts/metricas-facylf.mjs            # escribe F:\Proyectos\facylf\metricas-facylf.json
node scripts/metricas-facylf.mjs --json     # además de escribirlo, imprime sólo el JSON por stdout
node scripts/metricas-facylf.mjs --salida tmp/metricas.json
```

El total incluye copas y categorías históricas: es todo lo que hay que terminar en CyL, no sólo las
ligas que se publican en la web.

Tarda ~3 s (una lectura de la cola de CyL, una ida y vuelta SSH y una consulta al canónico). No toca
datos: ni `UPDATE`, ni `DELETE`, ni escrituras en el servidor.

**Cadencia:** tarea programada **«FACyLF metricas panel»** cada **5 minutos** (decidido por David el
04/11/2026: es suficiente para el panel y no carga la máquina). Instancia única, ventana oculta y
**escritura atómica** (fichero temporal propio del proceso + `rename`): el panel nunca puede leer un
JSON a medias. Si una vuelta falla, el fichero anterior queda intacto con su `medido`. Se puede lanzar
a mano con `node scripts/metricas-facylf.mjs`; para quitarla,
`powershell ... -File scripts\registrar-tarea-metricas.ps1 -Quitar`.
