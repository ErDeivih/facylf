# Muestras de oro

Un grupo real congelado, con los recuentos de la fuente escritos a mano y verificados. Es la única
defensa contra un importador que empieza a perder un 2 % de los goles sin que nadie lo note
([CALIDAD-PRUEBAS.md](../../docs/plataforma-web/CALIDAD-PRUEBAS.md)).

Cada fichero (`<federacion>/<grupo>.json`) dice, para ese grupo, qué publica hoy la fuente —jornadas,
partidos, partidos con resultado, actas, actas analizadas, participaciones, eventos y fichas de cuerpo
técnico— y qué caso cubre. Las muestras no son federaciones bonitas: son **tipos de problema**.

| muestra | qué caso cubre |
|---|---|
| `castilla-leon/11379752` | caso rico: temporada completa, 19 equipos, tabla oficial archivada, calendario que no cuadra |
| `castilla-leon/22911127` | temporada completa con otro reparto de grupos |
| `castilla-leon/24218933` | **grupo a medias**: la temporada en curso con dos jornadas jugadas |
| `canarias/903011009` | federación pequeña, 12 equipos, 22 jornadas |
| `cataluna/54322935` | federación **sin códigos de jugador**: todo el mundo es identidad nominal |
| `navarra/22198595` | roles de cuerpo técnico con variantes de texto libre |

## Cómo se usan

```bash
node scripts/oro.mjs listar       # qué muestras hay y de cuándo son
node scripts/oro.mjs verificar    # comprueba que la fuente sigue diciendo lo mismo
node scripts/oro.mjs generar      # vuelve a congelar con lo que dice la fuente AHORA
```

`verificar` **no** reimporta: compara lo congelado con lo que dice la cola. Si algo no cuadra, puede ser
que la federación haya corregido datos (normal) o que el recolector haya perdido páginas (no normal).
Por eso no se actualiza el fichero a ciegas: primero se reimporta el grupo, se mira el informe del lote
y después se vuelve a congelar con `generar`, revisando el diff.

En `pnpm test` se comprueba siempre que las muestras están completas y que sus números cuadran entre sí
(un grupo no puede tener más resultados que partidos, ni actas analizadas sin participaciones). Esa
prueba no toca la red ni PostgreSQL, así que corre en cualquier sitio.
