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

El worker arrancó a las 19:07 con las guardias ya en 0,0 s (`competiciones-sin-datos`, `ambito-actas`,
`actas-sin-trabajo`, `aplaza-futuro`), reservó la plaza de la federación y **empezó a recoger actas de 2014-15**:

```
→ acta|14|6471|21060|1|3769667   ✓ acta adulta guardada y analizada; 6-0, 22 titulares...
→ acta|14|6471|21060|1|3767775   ✓ acta adulta guardada y analizada; 2-0, ...
```

Trabajos pendientes: 42.535 → 42.528. Peticiones: 200.716 → 200.723. La rotación funciona.
