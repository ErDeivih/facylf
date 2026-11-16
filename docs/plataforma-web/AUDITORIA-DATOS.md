# Auditoría de datos para predicción · 16/11/2026

Las [consultas SQL](../../scripts/prediccion/auditoria.sql) se ejecutaron en el PostgreSQL local, en una transacción de sólo lectura. El recuento de Castilla y León en esa copia era de **322.550 partidos** de 2012-13 a 2026-27. La cifra de 567.634 del encargo no tiene consulta ni fecha de corte asociadas en el material de partida.

## Alcance de la evaluación guardada

El evaluador aplica el filtro de marcador y temporada a todo `core.match`. Los JOIN de grupo, edición, temporada, jornada e inscripciones llegan a claves únicas. Los entrenamientos coinciden en 354.964 filas. El conjunto de prueba abarca varias federaciones y contiene las federaciones de prueba del canónico.

| Temporada | JSON histórico | Copia local | IDs distintos | Cruce por jornada distinto | Castilla y León | Resto |
|---|---:|---:|---:|---:|---:|---:|
| 2024-25 | 213.778 | 213.778 | 213.778 | 213.775 | 36.522 | 177.256 |
| 2025-26 | 453.949 | 453.950 | 453.950 | 453.949 | 28.511 | 425.439 |

De los **667.728** partidos con marcador de la copia, **65.033 (9,74 %)** son de Castilla y León. El cruce `(grupo, jornada, local, visitante)` tiene 4 filas adicionales respecto al número de claves distintas, 2 en Canarias, 1 en Galicia y 1 en Cataluña. Castilla y León no tiene cruces repetidos por esa clave en las dos temporadas. La diferencia de una fila con el JSON histórico se concentra en 2025-26. La consulta documenta dos estados distintos de la base. Sin el manifiesto de IDs de la ejecución original, el partido que cambió queda indeterminado.

## Cobertura de actas en Castilla y León

Los cocientes de goles, entradas y rojas usan los eventos registrados como denominador. Los partidos con acta correcta o árbitro principal se comparan con los que tienen marcador. El minuto de todos los goles se comprueba también contra el marcador por lado beneficiado en partidos con al menos un gol. Una ausencia de eventos puede significar que faltan datos del acta.

| Temporada | Partidos | Marcador | Actas correctas | Goles con minuto | Actas con marcador positivo reconstruible por minuto | Entradas con minuto | Rojas de jugador con minuto | Árbitro principal |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2012-13 | 2 | 1 | 1/1 (100,0 %) | Sin denominador | 0 | Sin denominador | Sin denominador | 1/1 (100,0 %) |
| 2013-14 | 12.876 | 12.808 | 232/12.808 (1,8 %) | 54.754/54.754 (100,0 %) | 11.719 | 76.001/76.001 (100,0 %) | Sin denominador | 3.637/12.808 (28,4 %) |
| 2014-15 | 27.081 | 26.993 | 1.179/26.993 (4,4 %) | 156.937/156.937 (100,0 %) | 25.574 | 82.938/82.938 (100,0 %) | Sin denominador | 3.557/26.993 (13,2 %) |
| 2015-16 | 22.866 | 22.760 | 3.306/22.760 (14,5 %) | 131.008/131.008 (100,0 %) | 21.554 | 78.647/78.647 (100,0 %) | Sin denominador | 3.587/22.760 (15,8 %) |
| 2016-17 | 28.194 | 28.072 | 3.425/28.072 (12,2 %) | 169.309/169.309 (100,0 %) | 26.826 | 87.998/87.998 (100,0 %) | Sin denominador | 3.696/28.072 (13,2 %) |
| 2017-18 | 21.670 | 21.581 | 3.174/21.581 (14,7 %) | 125.627/125.627 (100,0 %) | 19.600 | 74.798/74.798 (100,0 %) | Sin denominador | 3.878/21.581 (18,0 %) |
| 2018-19 | 27.469 | 27.380 | 3.102/27.380 (11,3 %) | 168.437/168.437 (100,0 %) | 26.100 | 93.454/93.454 (100,0 %) | Sin denominador | 3.162/27.380 (11,5 %) |
| 2019-20 | 14.935 | 14.881 | 2.300/14.881 (15,5 %) | 87.489/87.489 (100,0 %) | 14.128 | 54.369/54.369 (100,0 %) | Sin denominador | 2.697/14.881 (18,1 %) |
| 2020-21 | 9.029 | 8.740 | 107/8.740 (1,2 %) | 38.141/38.141 (100,0 %) | 6.631 | 34.805/34.805 (100,0 %) | 995/995 (100,0 %) | 0/8.740 (0,0 %) |
| 2021-22 | 21.745 | 20.656 | 3.131/20.656 (15,2 %) | 123.732/123.732 (100,0 %) | 20.256 | 86.875/86.875 (100,0 %) | 2.395/2.395 (100,0 %) | 132/20.656 (0,6 %) |
| 2022-23 | 34.707 | 33.312 | 24.947/33.312 (74,9 %) | 178.997/178.997 (100,0 %) | 29.226 | 123.993/123.993 (100,0 %) | 3.964/4.152 (95,5 %) | 32.925/33.312 (98,8 %) |
| 2023-24 | 26.360 | 26.179 | 25.129/26.179 (96,0 %) | 162.209/162.209 (100,0 %) | 25.674 | 99.814/99.814 (100,0 %) | 2.938/3.160 (93,0 %) | 26.175/26.179 (100,0 %) |
| 2024-25 | 37.510 | 36.522 | 34.769/36.522 (95,2 %) | 231.442/231.442 (100,0 %) | 35.857 | 141.731/141.731 (100,0 %) | 4.101/4.447 (92,2 %) | 36.477/36.522 (99,9 %) |
| 2025-26 | 29.213 | 28.511 | 27.537/28.511 (96,6 %) | 187.093/187.093 (100,0 %) | 28.104 | 106.917/106.917 (100,0 %) | 3.197/3.476 (92,0 %) | 28.511/28.511 (100,0 %) |
| 2026-27 | 8.893 | 8.525 | 8.006/8.525 (93,9 %) | 58.077/58.077 (100,0 %) | 8.268 | 35.262/35.262 (100,0 %) | 1.156/1.213 (95,3 %) | 8.511/8.525 (99,8 %) |

Si el árbitro sólo figura en el acta, se conoce retrospectivamente. `core.match_official` carece de fecha de publicación de la designación. Las rojas pueden corresponder al banquillo y hay actas que representan una expulsión con dos amarillas.

## Minutos e imágenes

Los minutos se derivan de alineaciones, eventos y duración reglamentaria. El denominador recoge pares persona-inscripción que tienen una fila en la proyección de minutos. Los escudos vigentes se cuentan por club inscrito en cada temporada. El denominador de fotos incluye personas distintas con al menos una convocatoria registrada en la temporada y exige que la foto conste con esa temporada. Se consultaron únicamente recuentos.

| Temporada | Minutos estimados | Minutos fiables según proyector | Clubes con escudo vigente | Jugadores convocados con foto de esa temporada |
|---|---:|---:|---:|---:|
| 2012-13 | 22/22 (100,0 %) | 22/22 (100,0 %) | 3/4 (75,0 %) | 0/22 (0,0 %) |
| 2013-14 | 27.068/29.750 (91,0 %) | 26.983/29.750 (90,7 %) | 228/430 (53,0 %) | 0/20.758 (0,0 %) |
| 2014-15 | 26.171/42.988 (60,9 %) | 25.982/42.988 (60,4 %) | 237/444 (53,4 %) | 9/30.458 (0,0 %) |
| 2015-16 | 24.675/37.171 (66,4 %) | 24.614/37.171 (66,2 %) | 241/428 (56,3 %) | 209/28.995 (0,7 %) |
| 2016-17 | 25.115/37.236 (67,4 %) | 25.060/37.236 (67,3 %) | 240/418 (57,4 %) | 0/29.723 (0,0 %) |
| 2017-18 | 23.361/32.678 (71,5 %) | 23.322/32.678 (71,4 %) | 237/399 (59,4 %) | 0/27.427 (0,0 %) |
| 2018-19 | 25.870/37.641 (68,7 %) | 25.790/37.641 (68,5 %) | 231/399 (57,9 %) | 0/30.338 (0,0 %) |
| 2019-20 | 21.856/31.544 (69,3 %) | 21.784/31.544 (69,1 %) | 230/404 (56,9 %) | 0/28.371 (0,0 %) |
| 2020-21 | 21.714/31.833 (68,2 %) | 21.657/31.833 (68,0 %) | 168/257 (65,4 %) | 0/24.244 (0,0 %) |
| 2021-22 | 28.234/44.757 (63,1 %) | 28.114/44.757 (62,8 %) | 222/389 (57,1 %) | 0/35.203 (0,0 %) |
| 2022-23 | 31.724/52.841 (60,0 %) | 31.404/52.841 (59,4 %) | 218/401 (54,4 %) | 0/42.035 (0,0 %) |
| 2023-24 | 30.329/51.119 (59,3 %) | 30.060/51.119 (58,8 %) | 212/446 (47,5 %) | 0/42.322 (0,0 %) |
| 2024-25 | 34.696/56.932 (60,9 %) | 34.300/56.932 (60,2 %) | 215/465 (46,2 %) | 0/45.843 (0,0 %) |
| 2025-26 | 32.189/51.738 (62,2 %) | 31.870/51.738 (61,6 %) | 206/432 (47,7 %) | 0/42.275 (0,0 %) |
| 2026-27 | 28.417/45.841 (62,0 %) | 28.342/45.841 (61,8 %) | 206/448 (46,0 %) | 0/42.264 (0,0 %) |
