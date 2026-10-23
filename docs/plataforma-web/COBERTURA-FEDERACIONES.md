# Qué datos tiene cada federación y cómo se muestran

> Medido el 22/10/2026 por Claude con `scripts/claude/matriz-datos.mjs` (sólo cifras, ningún nombre) sobre
> las colas del PC (Andalucía, Araba, Bizkaia, Castilla y León, Cataluña, Gipuzkoa, Las Palmas, Madrid,
> Tenerife, Valencia) y los paquetes `_traspaso` del servidor (Canarias, Ceuta, Euskadi, Castilla y León,
> Melilla, Navarra, Rioja). Las 8 del servidor (Aragón, Asturias, Baleares,
> Cantabria, Castilla-La Mancha, Extremadura, Galicia y Murcia) se midieron el 23/10/2026 por peticiones de sólo
> lectura, y sus huecos se comprobaron contra el HTML guardado (§2, notas).
> Además de las colas, se miraron muestras de los ficheros crudos (posición, capitán, sistema, fotos).

> **Corrección del 22/10/2026, 17:00 (otra sesión de Claude, `CATALUNA.md`):** lo de Cataluña era **nuestro**.
> La FCF sí publica tarjetas, cambios, código de jugador y capitán: el lector no leía los iconos de cada fila.
> Arreglado en el recolector desde las 16:24; las actas nuevas traen ~38 jugadores con código, 3-8 tarjetas y
> 9-14 cambios. Las ~40.000 ya bajadas siguen sin esos datos hasta releerlas (~120 h; decisión de David).
> Por eso los avisos de la web salen de lo **medido en cada competición** (0032, 0036, 0038) y no de la federación:
> al reimportar, desaparecen solos. La fila de Cataluña de la tabla de abajo describe lo bajado hasta el 22/10.

## 1. La conclusión en cinco líneas

1. **Ninguna federación es igual a otra, y dentro de una misma federación tampoco**: conviven ligas con acta
   completa y ligas de base que sólo dan resultado y alineación. Por eso la capacidad se mide **por
   competición y temporada** (`analytics.edicion_capacidad`, migración 0032), no por federación.
2. **Los cambios son lo que más falta**: en Andalucía sólo el 2 % de las actas con alineación trae cambios
   (casi todo es fútbol base), en Ceuta el 6 %, Melilla el 12 %, Madrid y Valencia el 22 %. Sin cambios, los
   minutos no se pueden calcular: se enseñan partidos y titularidades, y nunca «titular = 90 minutos».
3. **El minuto del gol** falta en Canarias 2024-25 (0 %), Araba (27 %), Las Palmas (29 %) y Tenerife (45 %):
   ahí no hay «goles por tramo».
4. **Tarjetas**: en lo bajado de Cataluña hasta el 22/10 no hay ninguna (ni cambios) por un fallo de nuestro lector,
   ya corregido; Castilla y León 2016-17 y 2018-19 tampoco. Ahí no hay disciplina ni sanciones hasta releer.
5. **Lo que sólo tienen algunas**: posición (Valencia ~85 % desde 2025-26, Madrid ~10 %), sistema de juego
   (Valencia y Madrid), capitán (Valencia, Madrid, Cataluña), foto del jugador en el acta (Castilla y León
   ~37 por acta, Andalucía ~25), varios árbitros por partido (Valencia, Madrid, Cataluña).

## 2. La matriz (temporada de referencia: 2024-25 o, si no hay, 2025-26 o la cola entera)

% sobre partidos (resultado, árbitro, campo), sobre partidos con resultado (actas), sobre actas (alineación)
y sobre actas con alineación (cambios, tarjetas). «Minuto de gol» y «código» sobre goles y sobre filas de
alineación.

| Federación | Temporada | Partidos | Resultado | Acta | Alineación | Cambios | Tarjetas | Minuto de gol | Código de jugador | Árbitro | Campo | Técnicos | Actas de menores |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Andalucía | 2025-26 | 64.581 | 92 % | 86 % | 100 % | **2 %** | 12 % | 100 % | 100 % | 91 % | 92 % | 100 % | 96 % |
| Araba | cola entera | 36.585 | 22 % | 35 % | 69 % | 30 % | 80 % | **27 %** | 99 % | 11 % | 22 % | 61 % | 29 % |
| Aragón | 2024-25 | 32.754 | 98 % | 96 % | 100 % | 36 % | 56 % | 100 % | 87 % | 98 % | 98 % | 90 % | 75 % |
| Asturias | 2024-25 | 23.843 | 92 % | 98 % | 100 % | 48 % | 50 % | 100 % | 100 % | 90 % | 92 % | 100 % | 83 % |
| Baleares | 2024-25 | 29.157 | 94 % | 98 % | 100 % | 31 % | 40 % | 100 % | 97 % | 92 % | 93 % | 100 % | 86 % |
| Bizkaia | cola entera | 31.896 | 35 % | 50 % | 91 % | 75 % | 96 % | 96 % | 100 % | 27 % | 34 % | 91 % | 15 % |
| Canarias | 2024-25 | 638 | 99 % | 48 % | 100 % | 100 % | 91 % | **0 %** | 100 % | 48 % | 87 % | 100 % | 100 % |
| Cantabria | 2024-25 | 16.912 | 99 % | 87 % | 100 % | 48 % | 46 % | 100 % | 99 % | 87 % | 88 % | 97 % | 83 % |
| Castilla y León (PC) | 2025-26 | 24.360 | 98 % | 96 % | 100 % | 57 % | 53 % | 100 % | 100 % | 98 % | 98 % | 100 % | 84 % |
| Castilla y León (servidor) | 2024-25 | 28.762 | 98 % | 97 % | 100 % | 46 % | 43 % | 100 % | 100 % | 98 % | 98 % | 100 % | 86 % |
| Castilla-La Mancha | 2024-25 | 21.410 | 98 % | 81 % | 100 % | 46 % | 61 % | 100 % | 100 % | 80 % | 84 % | 80 % | 55 % |
| Cataluña | 2025-26 | 143.058 | 92 % | 17 % | 81 % | **0 %** | **0 %** | 100 % | **0 %** | 12 % | 12 % | 89 % | 88 % |
| Ceuta | 2024-25 | 3.024 | 99 % | 95 % | 100 % | **6 %** | 28 % | 100 % | 100 % | 95 % | 95 % | 94 % | 88 % |
| Euskadi | 2024-25 | 4.130 | 38 % | 53 % | 94 % | 77 % | 94 % | 100 % | 100 % | 22 % | 34 % | 94 % | 51 % |
| Extremadura | 2024-25 | 23.965 | 96 % | 87 % | 100 % | **24 %** | 39 % | 100 % | 42 % | 84 % | 86 % | 100 % | 83 % |
| Galicia | 2024-25 | 37.067 | 98 % | 100 % | 92 % | **9 %** | **23 %** | 100 % | 74 % | 98 % | 98 % | 99 % | 88 % |
| Gipuzkoa | cola entera | 31.067 | 32 % | 53 % | 92 % | 62 % | 81 % | 100 % | 81 % | 27 % | 32 % | 91 % | 59 % |
| Las Palmas | cola entera | 29.490 | 37 % | 64 % | 100 % | 60 % | 69 % | **29 %** | 100 % | 33 % | 36 % | 99 % | 68 % |
| Madrid | 2025-26 | 94.827 | 99 % | 70 % | 99 % | 23 % | 67 % | 100 % | 100 % | 98 % | 99 % | 99 % | 97 % |
| Melilla | 2024-25 | 3.453 | 100 % | 100 % | 100 % | **12 %** | 30 % | 100 % | 59 % | 100 % | 100 % | 97 % | 96 % |
| Murcia | 2024-25 | 30.513 | 95 % | 103 % | 100 % | 38 % | 57 % | 100 % | 35 % | 94 % | 95 % | 98 % | 86 % |
| Navarra | 2024-25 | 16.116 | 90 % | 70 % | 97 % | 59 % | 81 % | 100 % | 89 % | 58 % | 90 % | 94 % | 70 % |
| Rioja | 2024-25 | 7.415 | 89 % | 59 % | 100 % | 47 % | 65 % | 100 % | 100 % | 59 % | 67 % | 100 % | 76 % |
| Tenerife | cola entera | 32.398 | 93 % | 56 % | 99 % | 62 % | 63 % | **45 %** | 100 % | 82 % | 91 % | 98 % | 68 % |
| Valencia | 2025-26 | 71.272 | 98 % | 99 % | 98 % | 23 % | 49 % | 100 % | 100 % | 98 % | 100 % | 98 % | 79 % |

Notas para leerla:
- **Las 8 del servidor (medidas el 23/10/2026, 2024-25) y la prueba del crudo**: con
  `scripts/claude/crudo-vs-cola.mjs` (40 actas por caso, sólo cifras) se comparó el HTML guardado con la cola en 14
  federación-temporada. **En todos los casos la cola tiene exactamente lo que trae la web**: los huecos son de la
  fuente, no del lector. En concreto:
  - **Código de jugador**: Extremadura (42 %) y Murcia (35 %) sólo enlazan a la ficha de ~4 de cada 10 jugadores
    (Extremadura 2024-25: 477 enlaces para 1.022 filas; 2016-17: 122 para 779); Galicia ~3 de cada 4. Ahí la
    identidad de los demás es nominal (por equipo), nunca por nombre en toda la federación.
  - **Cambios y tarjetas bajos** en Galicia (9 % / 23 %) y Extremadura (24 % / 39 %): las actas de base no los
    apuntan; las que los traen se leen todas.
  - **Castilla y León 2016-17 y 2018-19**: 0 tarjetas en la web (confirmado en el crudo); los cambios sí están.
  - **Euskadi 2019-20**: sin sección de cambios en la web (tarjetas sí). Igual que las forales antiguas (Araba
    2011-14: sin «Sustituciones»).
  - Murcia: 2 códigos de 1.000 que están en el HTML y no en la cola (0,2 %): filas repetidas; sin importancia.
- Un % bajo de **resultado** en las forales vascas, Las Palmas y Araba es porque sus colas incluyen la
  temporada en curso y calendarios futuros (cola entera, no una temporada cerrada).
- **Cataluña «Acta 17 %»**: la API de la FCF sólo da acta de una parte; el resto, resultado.
- **Madrid** tiene un 12 % de filas «convocados» sin decir si fue titular o suplente: cuentan como
  convocatoria, no como partido jugado, salvo que haya un evento suyo (gol, cambio).
- **Árbitros unidos con « / »** en el 5 % de los partidos de Madrid y Valencia y el 25 % de los de Cataluña
  (0029 usa sólo el principal).

### 2.1 Evolución por temporada (cambios · tarjetas · partidos con acta, en %)

| Federación | Lo que se ve |
|---|---|
| Euskadi | **0 % de cambios de 2016-17 a 2022-23**; desde 2023-24, 75-85 %. Tarjetas 83-95 % salvo 2021-22 (1 %). |
| Rioja | Cambios 47-65 % (82 % en 2020-21), tarjetas 65-88 %; actas 33-64 % según temporada. |
| Ceuta | Cambios 0-8 % todas las temporadas (29 % en 2020-21): **minutos no calculables** casi siempre. |
| Melilla | Cambios 7-12 %, tarjetas 21-38 %. |
| Castilla y León (servidor) | **Tarjetas 0 % en 2016-17 y 2018-19**, 42-51 % desde 2020-21; cambios 44-64 %. |
| Navarra | Cambios 58-72 %, tarjetas 80-87 %. |
| Canarias | Cambios 92-100 %, tarjetas 89-92 %; minuto de gol 0 % en 2024-25. |

## 3. Lo que sólo está en los ficheros crudos (muestras de 40-80 actas por plataforma)

| Dato | Dónde | Cobertura | Estado |
|---|---|---|---|
| Posición del jugador | Valencia (FFCV) | ~85 % desde 2025-26, 0 % antes | 0029 + `rellena-posiciones.mjs` |
| | Madrid (RFFM) | ~10 % desde 2025-26 | ídem |
| Sistema de juego (1-4-3-3) | Valencia, Madrid | ~85 % / ~80 % de las actas | ídem |
| Capitán | Valencia, Madrid (campo `capitan`), Cataluña («Capità») | ~1 por equipo | Valencia/Madrid sí; Cataluña sin código de jugador |
| Foto del jugador (base64 en el acta) | Castilla y León (~37 por acta), Andalucía (~25 por acta) | 100 % de la muestra | sólo para identidad en el PC (fase E); nunca se publica |
| Foto del jugador | Bizkaia, Gipuzkoa, Araba, Tenerife, Las Palmas | 0 % | — |
| Árbitros asistentes y código de árbitro | Valencia, Madrid (`arbitros_partido`) | cuando los hay | PLAN §5.3 |
| Fecha de nacimiento, posición en Fénix | ninguna | 0 % | la edad sale de las categorías |

## 3b. Valencia por dentro (22/10/2026, 72 competiciones de 2025-26, 8 actas de cada una; sólo recuentos)

- **De infantil para arriba, el 100 % de las actas trae cambios** (Tercera FFCV Juvenil, Segona y Primera FFCV,
  Lliga Preferent Cadet e Infantil, Liga Nacional Juvenil, Tercera Federación, copas…), con minuto y código de
  quien entra y sale (≈ 8,5 cambios por partido). **Alevín, benjamín y prebenjamín no apuntan cambios** (0 %) y
  apenas tarjetas. Como son muchísimas actas, la media de la federación baja al 23 %: por eso los minutos se
  calculan y enseñan **por competición**, nunca «Valencia sí/no».
- Posición del jugador en el 89-91 % de las filas, también en menores; capitán, portero y dorsal siempre.
- **Campos que el importador aún no lee** (anotados para la fase D): tanda de penaltis (`hay_penaltis`,
  `penaltis_casa`, `penaltis_fuera`: 33 tandas en 339 actas de copa de Valencia y 151 en 1.129 de Madrid,
  ≈ 1 de cada 8 partidos de copa → migración 0040), código y tipo de árbitro (`cod_arbitro`, `tipo_arbitro`,
  1,9 colegiados por partido), código del campo (`codigo_campo`), segundo entrenador y otros técnicos con código,
  delegados, y `segunda_amarilla` como dato explícito (hoy se deduce).

## 4. Cómo se muestra cada cosa según lo que haya

La web pregunta a `analytics.edicion_capacidad` (por competición) y decide. Regla: **se enseña lo que hay,
se dice lo que falta, nunca se rellena**.

| Si la competición… | Se enseña | Se oculta o cambia |
|---|---|---|
| `nivel = completo` | todo: minutos, % de minutos, cambios en el acta, disciplina, sanciones | — |
| `registra_cambios = false` | partidos, titularidades, suplencias, goles, tarjetas | minutos, % de minutos y min/gol → «La competición no apunta los cambios: no se pueden calcular minutos». El ojeo usa titularidades en vez de minutos para esa temporada |
| `registra_tarjetas = false` | — | disciplina, sanciones, tarjetas del árbitro → «La competición no apunta tarjetas» |
| `registra_minuto_gol = false` | goles y goleadores | goles por tramo, cronología con minutos (el acta lista los goles sin minuto) |
| `registra_posiciones = true` | filtro por posición, posición habitual, sistema del partido | (si es false, no hay filtro de posición; el portero sí) |
| `nivel = resultados` | clasificación, resultados, calendario | plantilla, goleadores, minutos: «Esta competición publica sólo resultados» |
| `nivel = calendario` | calendario | todo lo demás |

En la ficha de la **federación** (y en la de cada competición) va una tarjeta «Qué datos hay» con los
porcentajes de `analytics.federacion_capacidad`, para que nadie compare a ciegas una liga completa con una
de base.

**Comparaciones entre ligas o jugadores**: sólo se comparan minutos si las dos ediciones registran cambios;
si no, se compara por partidos y titularidades y se avisa.

## 5. Para terminar el estudio (DeepSeek, servidor) — HECHO por Claude el 23/10/2026

Las 8 se midieron por peticiones de sólo lectura (201-204: `matriz-datos.mjs` con `--temporada` de 2024-25) y el
crudo se comprobó con `crudo-vs-cola.mjs` (205). Lo de abajo queda como receta para repetirlo.

```bash
# una federación cada vez, en el servidor, con el monitor:
for f in aragon asturias baleares cantabria castilla-la-mancha extremadura galicia murcia; do
  docker exec -e FACYLF_RAIZ=/app facylf-monitor node --no-warnings /app/scripts/claude/matriz-datos.mjs \
    /app/descargas-$f/recolector-local/cola-v2.sqlite --nombre $f --temporada 20 --salida /app/tmp/claude/matriz/$f-20.json
done
```
(`--temporada` = código de 2024-25 en esa cola: mirarlo con `lista-temporadas-cola.mjs`. Requiere Node ≥ 22.13
en el contenedor por `node:sqlite`; si no, ejecutarlo en el PC sobre el paquete traído con
`trae-federacion-servidor.ps1`.) Traer los JSON al PC, añadir sus filas a la tabla del §2 y, si alguna
plataforma nueva aparece (no Fénix), anotarlo aquí.
Y en la base real, tras proyectar: `select * from analytics.federacion_capacidad order by federacion, orden;`
sustituye a esta tabla (es la misma medida, sobre lo importado).
