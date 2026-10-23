# Cierre de temporada: cuándo se puede decir «esta temporada está completa»

Regla de David (06/10/2026): **una temporada sólo se da por cerrada cuando está entera recogida e importada, sin
que falte un partido ni una competición**, porque una vez cerrada no se vuelve a mirar.

Hasta hoy no había nada que lo midiera. Una cola «sin trabajo» podía estar terminada, esperando su turno o
aparcada (los 285.000 trabajos del año 2099 de `APARCADO-2099-Y-OPERACION.md`), y las tres se ven igual desde fuera.

## La herramienta

    node scripts/claude/cierre-temporada.mjs <federación> [temporada…] [--canonico] [--detalle N] [--json]

Sólo lee. `FACYLF_RAIZ` = raíz del repositorio (`/app` en los contenedores; `F:\EspacioCodigo\facylf` en el PC).
`castilla-leon` y `federacion` son la misma cola. Para cada temporada mira, en la cola:

| # | pregunta | si no es cero |
|---|---|---|
| 1 | ¿hay competiciones cuyos grupos no se han listado nunca? | faltan competiciones enteras |
| 2 | ¿hay grupos sin índice de jornadas ni partidos? | faltan ligas enteras (el fallo del 05/10) |
| 3 | ¿hay jornadas registradas sin leer? | faltan calendarios y resultados |
| 4 | ¿hay partidos con código de acta cuya acta falta o está pendiente? | faltan actas (jugadores) |
| 5 | ¿hay trabajos abiertos de la temporada (de cualquier tipo, también aparcados a 2099)? | queda trabajo |
| 6 | ¿hay partidos jugados sin código de acta? | **reserva**: puede que la federación no la publique; separa los 3-0/0-3 (probable resultado administrativo) y enseña una muestra para comprobar en la web |
| 4b | ¿hay partidos cuyo código de acta ya está guardado con otra jornada o grupo? | **reserva**: fila de calendario repetida; no falta el dato (Cataluña 2025-26: 27.294) |
| 7 | (`--canonico`) ¿hay grupos con menos actas en el canónico que en la cola? | falta importar |

Y además: si la temporada tiene partidos sin resultado con fecha de la última semana o futura, es **EN JUEGO**.

Veredictos:

- **EN JUEGO** — se sigue jugando; no se cierra.
- **ABIERTA** — alguna de 1-5 (o 7) no es cero. El detalle dice cuál y con ejemplos.
- **CERRADA CON RESERVAS** — 1-5 en cero, pero hay partidos sin código de acta, actas que la fuente no sirve o
  partidos pasados sin resultado. Se cierra sólo después de mirar una muestra en la web y apuntar la conclusión.
- **CERRADA** — todo en cero.

## Cómo se usa

- Antes de dar una temporada por terminada, o de dejar de vigilarla: `cierre-temporada.mjs <fed> <temporada> --canonico`
  (en el PC para CyL; en el servidor sin `--canonico` hasta que su canónico esté al día con su cola).
- Cada lunes, tras la pasada del fin de semana, una vuelta por todas (`--detalle 0` da la tabla).
- Una temporada CERRADA no se borra ni se deja de revisar automáticamente: el recolector la sigue revisitando a su
  ritmo. Lo que cambia es que se puede **afirmar** que está completa.

## Primera medición (06/10/2026, colas del PC; el servidor no contestaba por SSH y el Docker del PC estaba parado)

**Ninguna temporada de ninguna federación del PC se puede dar por cerrada hoy.** Todas salen ABIERTA (las pasadas)
o EN JUEGO (2026-27). Lo que falta, por cola:

| cola | temporada | lo que la deja abierta |
|---|---|---|
| CyL | 2025-26 | 0 grupos sin índice (el arreglo del índice ya actuó: eran 108), pero 2.575 jornadas sin leer en 145 grupos y 505 actas pendientes |
| CyL | 2023-24 · 2021-22 · 2019-20 · 2017-18 · 2015-16 | 2.600-4.500 jornadas sin leer y 640-5.100 actas pendientes cada una (historia recién desaparcada) |
| CyL | 2026-27, 2024-25, 2022-23… | son del **servidor** (reparto de temporadas): la copia del PC no cuenta, hay que medirlas allí |
| Madrid | 2025-26 | 48.551 actas pendientes, 2.927 jornadas sin leer |
| Madrid | 2024-25 · 2023-24 | ~16.000 jornadas sin leer cada una |
| Madrid | 2022-23 → 2015-16 | casi todos los grupos sin índice (795/879 … 275/275): recién desaparcadas, sin empezar |
| Madrid | 2021-22 | además 437 partidos con código y sin acta (medido antes de separar las filas repetidas: volver a medir) |
| Valencia | 2025-26 | 4.798 jornadas sin leer, 390 actas pendientes |
| Valencia | 2024-25 | 15.607 jornadas sin leer y **0 partidos**: toda la temporada por leer |
| Valencia | 2023-24 y anteriores | 460-1.120 grupos sin índice cada una |
| Cataluña | 2025-26 | 3 grupos sin índice y 12 trabajos; los «27.294 partidos sin acta» son filas repetidas del calendario (el acta está guardada con otra clave) |

Partidos jugados sin código de acta en CyL: 0-11 por temporada (≈ 0 %) y casi todos 3-0/0-3. El 31-45 % de
Euskadi, Canarias, La Rioja y Navarra está en el servidor: la petición `93/95-cierre-temporadas-servidor.sh` lo
mide con muestra y separando los 3-0/0-3 en cuanto el servidor vuelva a contestar.

## Medición del servidor (07/10/2026, 00:14, recién reiniciado) — petición 98

- **CERRADAS CON RESERVAS** (todo recogido; sólo quedan partidos sin acta publicada): 2023-24, 2024-25 y 2025-26 de
  Aragón, Asturias, Baleares, Cantabria, Extremadura, Murcia, Navarra, La Rioja y Melilla; 2023-24 de CLM; Ceuta de
  2018-19 a 2024-25; Euskadi y Canarias 2024-25 y 2025-26.
- **ABIERTAS con ligas sin empezar** (grupos sin índice): Andalucía (1.001 en 2025-26, 1.304 en 2024-25, 1.237 en
  2023-24), Galicia (143 / 752 / 694), CyL en el servidor (62 en 2026-27, 95 en 2024-25, 80 en 2022-23).
- Todo lo anterior a 2023-24 sigue ABIERTO en todas: es el historial desaparcado el 06/10, en curso.

### El arreglo del índice NO está desplegado en el servidor

En los contenedores `federacion`, `andalucia` y `galicia`, `/app/scripts/recolector-local.mjs` es del 23/09 y del
29/09 y no contiene el cambio; los índices pendientes siguen con prioridad positiva (80-150 millones) y el servidor
sirve actas de 2018-19 y 2016-17 antes que el índice de 2025-26. Lo desplegado fue `scripts/lib/`; el cambio está en
`scripts/recolector-local.mjs` (el guion principal), que hay que llevar a la imagen o al volumen de los 16.

### El 31-45 % de partidos sin acta queda explicado (petición 100)

Agrupado por competición, prácticamente todo son competiciones cuya acta **no la publica el portal autonómico**:

| tipo | ejemplos | federaciones |
|---|---|---|
| Nacionales de la RFEF que el portal enseña con resultado | Primera y Segunda Federación (masc. y fem.), División de Honor Juvenil (fútbol y sala), Segunda B y Primera de sala, Copa del Rey/Reina, Tercera Federación grupo XII | Euskadi (100 %), La Rioja, Cantabria, CLM, Extremadura, Canarias (306 de 329) |
| Fútbol 8 de base de los Juegos Deportivos | Fútbol 8 Alevín y Benjamín y sus 2ª fases | Navarra (≈ 5.000 de 5.091) |
| Ligas educativas / municipales | Liga Educativa F7 Diputación de Málaga, JJDDMM Córdoba, torneos universitarios | Andalucía, Cantabria |

En las competiciones propias de cada federación el porcentaje sin acta es del 0-4 %. Conclusión: **no es un fallo
de recogida**. Las actas de las competiciones nacionales (con muchos juveniles de División de Honor) están en el
sistema de la RFEF: si se quieren, es una fuente nueva, no un arreglo.

## CyL contra el canónico del PC (07/10/2026, 10:04) — petición 102

El canónico del PC va **muy** por detrás de la cola en las temporadas que recoge el PC:

| temporada | actas en la cola | actas en el canónico | grupos atrasados |
|---|---:|---:|---:|
| 2025-26 | 23.318 | 16.035 | 49 |
| 2023-24 | 17.679 | 15.218 | 47 |
| 2021-22 | 14.130 | 368 | 129 |
| 2019-20 | 7.239 | 0 | 87 |
| 2017-18 | 5.770 | 0 | 40 |
| 2015-16 | 5.486 | 0 | 42 |

Es decir: aunque la cola tenga los datos, un informe no los ve hasta que se importan. Ejemplos de 2025-26 con la
cola completa y el canónico vacío: grupos 22911146-22911149 (156, 240, 240 y 112 actas). Hace falta pasar
`pnpm importar:todo` (o `importar-temporada.ps1` por temporada) ahora que el Docker del PC funciona.
