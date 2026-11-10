# Rotación de temporadas del worker de CyL en el PC · 10/11/2026 (tarde)

El fichero `temporadas-asignadas.txt` **no añade** temporadas: restringe la recolección a las que lista. Como el
worker elige siempre la temporada más reciente con trabajo, con las 15 asignadas nunca llega a las antiguas. Para
cerrar CyL hay que rotar: unos días solo las antiguas.

## Estado anterior (copia)

Copia del fichero de 15 temporadas justo antes de esta rotación:
`tmp/temporadas-asignadas.15-antes-rotacion-2026-11-10-tarde.txt`.

## Rotación aplicada (10/11/2026, ~19:00)

Temporadas asignadas ahora (las que tienen más actas y calendarios pendientes de las antiguas):

```
2018-19
2014-15
2012-13
2016-17
2019-20
2015-16
2013-14
```

Trabajo ejecutable en la cola al aplicarla: 2018-19 (5.796, de ellos 1.926 actas), 2014-15 (5.428, 998 actas),
2012-13 (4.944, 920 actas), 2016-17 (2.320, 254 actas), 2019-20 (2.192), 2015-16 (2.213), 2013-14 (1.319).

## Cómo devolver la temporada viva (cuando toque; no más de uno o dos días)

1. Copiar el fichero actual a `tmp/temporadas-asignadas.antiguas-<fecha>.txt`.
2. Escribir las 15, **2026-27 primero**: `2026-27`, `2025-26`, `2024-25`, `2023-24`, `2022-23`, `2021-22`, `2020-21`,
   `2019-20`, `2018-19`, `2017-18`, `2016-17`, `2015-16`, `2014-15`, `2013-14`, `2012-13`.
3. Parar el `node.exe` de `recolector-local.mjs arrancar` y dejar que el supervisor lo relance.
4. Verificar en `worker-programado.log` que la primera obra es de 2026-27 y que queda **un solo** worker.

## Por qué no se toca el ritmo

La rotación cambia **qué** temporada se recoge, no **cada cuánto**: las pausas de 7-13 s siguen igual.

## Verificación (19:30)
### Cuidado con el código de temporada de la cola (medido el 10/11/2026)

Los códigos de `trabajos.temporada` **no coinciden con el año**: en esta cola, `14` es **2018-19**, no 2014-15.
La tabla `temporadas` de la cola es la que manda:

| Código | Etiqueta | | Código | Etiqueta |
|---:|---|---|---:|---|
| 8 | 2012-13 | | 16 | 2020-21 |
| 9 | 2013-14 | | 17 | 2021-22 |
| 10 | 2014-15 | | 18 | 2022-23 |
| 11 | 2015-16 | | 19 | 2023-24 |
| 12 | 2016-17 | | 20 | 2024-25 |
| 13 | 2017-18 | | 21 | 2025-26 |
| 14 | 2018-19 | | 22 | 2026-27 |
| 15 | 2019-20 | | | |

Por eso, cuando el registro del worker dice `→ acta|14|...`, está recogiendo **2018-19** (que es la temporada más
reciente de las asignadas en la rotación y por eso empieza por ella). No se debe leer el código como un año.


El worker arrancó a las 19:07 con las guardias ya en 0,0 s (`competiciones-sin-datos`, `ambito-actas`,
`actas-sin-trabajo`, `aplaza-futuro`), reservó la plaza de la federación y **empezó a recoger actas de 2018-19**
(el código 14 de la cola; ver el aviso de arriba):

```
→ acta|14|6471|21060|1|3769667  (14 = 2018-19)   ✓ acta adulta guardada y analizada; 6-0, 22 titulares...
→ acta|14|6471|21060|1|3767775   ✓ acta adulta guardada y analizada; 2-0, ...
```

Trabajos pendientes: 42.535 → 42.528. Peticiones: 200.716 → 200.723. La rotación funciona.

## Cuánto queda y cuánto tarda (medido el 10/11, 19:45)

Estado de la cola en las siete temporadas asignadas (código de temporada entre paréntesis):

| Temporada | Trabajos pendientes | Actas ya hechas | Comentario |
|---|---:|---:|---|
| 2018-19 (14) | 5.398 | 32 | la que se está recogiendo ahora |
| 2016-17 (12) | 4.944 | 0 | siguiente |
| 2019-20 (15) | 2.221 | 14.405 | ya tenía casi todo |
| 2015-16 (11) | 1.910 | 21.919 | ya tenía casi todo |
| 2013-14 (9) | 1.147 | 12.036 | ya tenía casi todo |
| 2014-15 (10) | 58 | 0 | **sin catálogo en la cola**: primero hay que descubrirlo |
| 2012-13 (8) | 22 | 0 | igual que 2014-15 |

En total, ~15.700 trabajos pendientes en las temporadas de la rotación. Al ritmo respetuoso actual (un trabajo cada
~40-60 s con las pausas de 7-13 s), eso son **del orden de 10-12 días de recolección continua**, no un rato. Y como
2026-27 no puede cerrarse todavía, no hay prisa por volver a ella: lo que aporta cobertura es esto.

Recomendación (para David): **mantener la rotación más de uno o dos días**, porque con 5.398 trabajos por delante en
2018-19 sola no da tiempo a nada; y dejar 2014-15 y 2012-13 para el final (o para cuando se descubra su catálogo),
que ahora no aportan nada. Si se prefiere volver antes a la temporada viva, el coste es que el cierre de las antiguas
se alarga en la misma proporción.

## Cómo saber si un grupo está listo (y su límite)

`scripts/claude/estado-rotacion.mjs` (solo lectura de la cola) enseña, por temporada, cuántos grupos tienen datos,
si el calendario está completo y cuántas actas llevan. Se usa así:

```powershell
node scripts\claude\estado-rotacion.mjs --temporada 2018-19
```

Medido el 10/11 a las 19:55:

| Temporada | Grupos con datos | Calendario completo | Con todas las actas conocidas hechas |
|---|---:|---:|---:|
| 2018-19 | 216 | 216 | **4** |
| 2016-17 | 200 | 200 | 0 |

**Límite importante:** esto mide la **cola**, no el canónico. Que un grupo tenga «calendario completo» en la cola
significa que la cola conoce sus jornadas, no que tenga tantos partidos como el canónico (de hecho muchos grupos
enseñan 5-9 partidos mientras el canónico tiene decenas o cientos, porque el canónico viene del paquete del
servidor). Por eso el script sirve para ver **avance**, no como luz verde: la luz verde la da la validación del
importador, que compara origen contra canónico en todos los contadores. Cuando un grupo tenga en la cola al menos lo
que el canónico ya tiene, se podrá importar.

## Por qué el servidor no ayuda a recolectar (medido el 10/11, 20:15)

El objetivo habla de recolección en PC **y** servidor, pero el servidor no puede con el portal de Castilla y León.
Medido ahora, tres intentos seguidos:

| Origen | Código HTTP | Tiempo |
|---|---:|---:|
| Servidor (por SSH, `curl` al portal) | **000** (sin conexión) | ~3 s y corta |
| PC de David | 302 / 200 | **330-580 ms** |

El servidor no llega al portal (conexión fallida), así que su recolector de CyL sigue parado y **el PC es el único
que recoge**. Eso explica el ritmo del cierre: no lo limita la federación (responde en medio segundo al PC) sino
nuestras pausas de 7-13 s, que son deliberadas. Por eso los ~15.700 trabajos pendientes son del orden de 10-12 días.

Si algún día se quiere acelerar, la palanca sería subir el paralelismo con más máquinas **respetando** el portal (o
resolver el acceso desde el servidor), nunca bajar las pausas: eso está prohibido por la regla del proyecto.

## Chequeo de salud en un comando

Para las rondas de seguimiento (y para David) hay un solo comando, de solo lectura, que dice si todo está en pie:

```powershell
node scripts\claude\salud-cyl.mjs
```

Comprueba: que el registro del worker se haya movido en los últimos 10 minutos, trabajos pendientes y apartados de
la cola, actas hechas y pendientes de la temporada en rotación, último trabajo terminado, espacio libre en E: y F:, y
que respondan la demo pública (`/` y `/explorar`) y la app real por el túnel (`/` y un acta). Sale con código 1 si
algo falla. Medido el 10/11 a las 20:20: **todo en orden** (44 actas hechas de 2018-19, 954 pendientes, 339,6 GB
libres en E:, 138,6 en F:, demo y app 200).
