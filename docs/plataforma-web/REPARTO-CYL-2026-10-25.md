# CyL: cuánto falta y cómo se reparte entre PC y servidor (25/10/2026, 00:30)

> Escrito por Claude para David y DeepSeek. Supuesto de David: **el PC está encendido ~10 h al día de media, o menos**.
> Datos: cruce por jornada de las dos colas (peticiones 210/212 del servidor y exportación del PC, `~/q/cruza-cyl.py` y
> `~/q/resumen-cyl.py` en la VM), vigía de las dos máquinas (`estado/vigia/*.json`) y petición 215 (energía del PC).
> **Nada de esto está aplicado.** Los ficheros de temporadas siguen como estaban.

## 1. Lo que falta, por temporada (unión de las dos colas)

«Ocultas» = actas que esconden las jornadas aún no leídas, estimadas con la media de partidos de su grupo. En 2019-20 se
quitan las 668 jornadas posteriores al 14/03/2020 (COVID: no se jugaron).

| Temporada | Máquina | Jornadas sin leer | Actas conocidas sin pedir | Actas ocultas | **Peticiones** | Actas hechas |
|---|---|---:|---:|---:|---:|---:|
| 2012-13 | servidor | 233 | 0 | 0 | 233 | 100 % (la web no da resultados) |
| 2013-14 | PC | 1.490 | 468 | 6.962 | **8.920** | 53 % |
| 2014-15 | servidor | 743 | 199 | 3.700 | **4.642** | 87 % |
| 2015-16 | PC | 1.783 | 7.675 | 9.061 | **18.519** | 47 % |
| 2016-17 | servidor | 1.038 | 1.127 | 5.136 | **7.301** | 80 % |
| 2017-18 | PC | 1.205 | 1.142 | 6.054 | **8.401** | 74 % |
| 2018-19 | servidor | 1.147 | 1.243 | 6.185 | **8.575** | 76 % |
| 2019-20 | PC | 1.457 | 1.221 | 7.950 | **10.628** | 60 % |
| 2020-21 | servidor | 1.101 | 903 | 3.171 | **5.175** | 56 % |
| 2021-22 | PC | 2.005 | 1.228 | 9.817 | **13.050** | 65 % |
| 2022-23 | servidor | 970 | 5.417 | 4.489 | **10.876** | 73 % |
| 2023-24 | PC | 2.672 | 1.231 | 13.900 | **17.803** | 59 % |
| 2024-25 | servidor | 1.085 | 837 | 4.901 | **6.823** | 85 % |
| 2025-26 | PC | 2.575 | 764 | 12.993 | **16.332** | 63 % |
| 2026-27 | servidor | 0 (4.982 futuras) | 255 | — | 255 + la temporada en curso | al día |
| **PC** | | 13.187 | 13.729 | 66.737 | **≈ 93.700** | 123.298 hechas |
| **Servidor** | | 6.317 | 9.981 | 27.582 | **≈ 43.900** | 143.268 hechas |

- En total, **~137.600 peticiones** (~150.000 con un 10 % de reintentos y relecturas). CyL va por el **~69 %** de sus actas.
- **No hay trabajo duplicado:** ninguna jornada sin leer en una máquina está leída en la otra dentro de SUS temporadas.
  Los «repetidos» del cruce son todos de temporadas de la otra máquina, y esas no se piden.
- Las jornadas sin leer se reparten por toda la temporada, de septiembre a junio: no son jornadas vacías del final.

## 2. Ritmos medidos (vigía, 24/10)

- **Servidor:** ~7.000 peticiones al día de CyL los días enteros (6.994-7.028). Va al tope de la pausa (10-13 s: una
  petición cada ~12 s), no al de la máquina. Unas ~500 al día se van en la temporada en curso (2026-27), así que quedan
  **~6.500 al día para lo atrasado**.
- **PC:** 3.761 de mediana en 24 h encendido (157 a la hora; el mejor día, 208). Con **10 h: 1.500-2.000 al día**.
  Y cada encendido le cuesta a CyL **20-25 min de preparación** antes de la primera petición (medido esta noche:
  de 23:53 a pasadas las 00:16 sin pedir nada; la cola tiene 2,2 GB).
- Esta noche **el PC estuvo suspendido de 16:31 a 21:57** (petición 215: Kernel-Power, S3) y la flota se reinició
  tres veces (22:53, 23:23 y 23:53). No fue un fallo del código: la tarea de cada 30 min la levantaba tras cada parada.

## 3. Cuándo se termina, según lo que se haga

| Opción | Qué se hace | Fin estimado de CyL (todas las temporadas cerradas) |
|---|---|---|
| **0. Nada** | El servidor acaba las suyas hacia el **1/11** y se queda sólo con la temporada en curso. El PC sigue solo con ~94.000 a 1.500-2.000 al día. | PC: **finales de diciembre** (con 6 h al día, febrero). |
| **A. Recomendada** | Hacia el **30/10-1/11**, cuando el servidor se quede sin trabajo en sus temporadas, la cola del PC pasa al servidor (§4). El PC se queda sólo con la temporada que tenga a medias, para terminarla. | **12-14/11** a 10-13 s; **~9-10/11** si el recolector nuevo va a 6-8 s (paso 5). |
| B. Más rápida | Lo mismo que A pero **ya**, con dos recolectores de CyL a la vez en el servidor (cada uno a 12-16 s: juntos, una petición cada ~7 s a rfcylf.es). | **~10-11/11**. Gana 3-4 días pero **duplica la carga sobre la web de la FCyLF**. Decide David. |

Con A, la carga sobre rfcylf.es es la de hoy (un recolector del servidor a 10-13 s, más el PC cuando está encendido).
Por eso es la recomendada: cumple «5-8 s por sitio» con margen y no hay que vigilar dos recolectores a la vez.

## 4. El cambio de temporadas, pensado (para hacerlo hacia el 30/10-1/11)

### Por qué NO basta con cambiar `temporadas-asignadas*.txt`
Cada máquina tiene su propia cola. Si el servidor «coge» la 2015-16 en su cola, **vuelve a pedir lo que el PC ya leyó**
en esa temporada: el cruce dice entre 1.200 y 3.600 jornadas por temporada, más sus actas (~20.000 peticiones
repetidas por temporada). Eso es justo lo que el proyecto prohíbe. Lo que se mueve no es la etiqueta: **es la cola**.

### Cómo: la cola del PC viaja al servidor como una carpeta aparte
Es el mismo tipo de traspaso que el del 21/09 y el 13/10 (las rutas del PC ya se resuelven solas en el servidor:
`rutaEnEstaCola`). No se mezclan colas.

1. **Antes:** desplegar el código al servidor (T2, `scripts\claude\despliega-codigo-servidor.ps1`): el arreglo de los 0-0 y lo de hoy.
2. **PC — parar CyL:** añadir `federacion` a `$env:FACYLF_EXCLUIR` en `scripts/entorno-flota.ps1` (línea 126, la lista
   «las recolecta el servidor») y reiniciar la flota. Comprobar que no queda ningún `recolector-local.mjs arrancar`
   sin `--perfil` (petición de sólo lectura como la 215).
3. **PC — cerrar la cola:** `pragma wal_checkpoint(TRUNCATE)` con el recolector parado; el `-wal` tiene que quedar en 0 bytes.
4. **Copiar** `descargas-federacion/recolector-local/` entera (cola, carpetas `t*`, catálogos,
   `temporadas-asignadas.txt`) a `/srv/data/facylf/descargas-federacion-pc/recolector-local/` en el servidor.
   La cola del PC **se queda donde está**, intacta, como copia de seguridad (no se borra).
5. **Servidor — recolector nuevo** para esa carpeta: mismo perfil de CyL, Chrome sin cabeza, su propio perfil de
   Chrome. **Pausa de 6-8 s** (como las demás federaciones), y no de 10-13 s: el 10-13 s de CyL existe sólo porque
   hoy la piden dos máquinas a la vez. Con una sola, 6-8 s cumple la regla de 5-8 s por sitio y va ~1,6 veces más rápido
   (`FUENTES-ALTERNATIVAS-2026-10-25.md` §3). Temporadas, en este orden:
   ```
   # temporadas-asignadas.txt de descargas-federacion-pc (servidor), desde el traspaso
   2023-24
   2021-22
   2019-20
   2017-18
   2015-16
   2013-14
   ```
   (Sin la que el PC tenga a medias: ver el paso 6.)
6. **PC — se queda con UNA temporada**, la que tenga más avanzada en ese momento (probablemente 2025-26). Su
   `temporadas-asignadas.txt` pasa a tener sólo esa, se quita `federacion` de las excluidas y se reinicia la flota.
   Cuando la termine, CyL sale del PC para siempre (excluida otra vez).
7. **Vigía y guardia de energía:** añadir `federacion-pc` al vigía del servidor y tratarla como CyL en la guardia de
   energía (E4 no la para).
8. **Importación al canónico:** las temporadas movidas se traen de `descargas-federacion-pc` en vez del PC
   (`scripts\claude\trae-federacion-servidor.ps1` necesita poder apuntar a esa carpeta).
9. **Comprobar a las 24 h:** ~7.000 peticiones al día en el recolector nuevo, 0 jornadas pedidas que ya estuvieran
   leídas (el vigía las vería como relecturas), y el recolector de siempre del servidor sólo con 2026-27.

### Cuándo hacerlo
Cuando el servidor deje de tener trabajo en sus temporadas: el vigía avisará con `ritmo_bajo` en `servidor/federacion`,
o en la medida diaria (`peticionesPorDia7` de `estado/vigia/servidor.json`) bajará de ~7.000 a ~500. Calculado:
**30/10-1/11**. Si ese día no hay nadie, no se pierde nada: el PC sigue con lo suyo; sólo se pierden los días de servidor parado.

### Lo que NO cambia
- Las temporadas del servidor y la 2026-27 se quedan en su cola de siempre.
- La 2027-28, cuando salga, va al servidor (cola de siempre).
- Ninguna máquina pide una temporada que tenga la otra.

## 5. Otras cosas de CyL que siguen abiertas
- **0-0 de las primeras temporadas:** arreglado en el PC (8.248 partidos corregidos con los goles de su acta; 0 pendientes,
  petición 214). En el **servidor faltan 18.116 en 2014-15**: se arreglan solos al desplegar (T2). Luego, reimportar.
- **Resultado de la jornada distinto de los goles del acta:** 3.050 partidos en 2022-23 (servidor), 861 en 2017-18 (PC) y
  516 en 2018-19 (servidor). Sin investigar: pueden ser actas con goles a medias. No se corrige nada hasta mirarlo.
- **2012-13:** la web publica las jornadas sin resultados (se abrió a mano). No hay más que sacar.
