# Reparto de temporadas para terminar CyL (12/11/2026)

Objetivo: terminar de ingerir Castilla y León **cuanto antes**, con las dos máquinas trabajando **temporadas
distintas** para no pedir dos veces las mismas páginas.

## 1 · Cuánto queda

Trabajo **distinto** por temporada (máximo de las dos colas: las dos parten del mismo plan, así que sumarlas
contaría dos veces lo mismo):

| Temporada | Trabajos | Temporada | Trabajos |
|---|---:|---|---:|
| 2026-27 | 5.417 | 2019-20 | 4.517 |
| 2025-26 | 2.393 | 2018-19 | 4.430 |
| 2024-25 | 5.787 | 2017-18 | 3.877 |
| 2023-24 | 4.085 | 2016-17 | 4.024 |
| 2022-23 | 5.796 | 2015-16 | 4.157 |
| 2021-22 | 4.763 | 2014-15 | 735 |
| 2020-21 | 2.320 | 2013-14 | 1.147 |
| | | 2012-13 | 275 |

**Total distinto: 53.723 trabajos.** Las dos colas suman 72.140 (PC 40.880 + servidor 31.260), así que hay
**~18.400 trabajos duplicados** entre las dos máquinas: hasta hoy las dos pedían las mismas temporadas.
Por tipo: jornada 33.431, acta 3.849, clasificación 1.537, calendario 1.424, índice de jornadas 519, grupos 120.

## 2 · Reparto aplicado (12/11, 00:15)

| Máquina | Temporadas | Trabajo | Ritmo medido | Días |
|---|---|---:|---|---:|
| **PC** | 2026-27, 2025-26, 2024-25, 2023-24, 2022-23, 2021-22, 2020-21, 2019-20, 2016-17, 2014-15 | 39.837 | ~3.000/día (10 h encendido) | **13,3** |
| **Servidor** | 2018-19, 2017-18, 2015-16, 2013-14, 2012-13 | 13.886 | ~1.200/día (24 h, plaza rotando) | **11,6** |

La temporada en curso (2026-27) se queda en el **PC**, que es más rápido, para que la web no dependa del servidor.

Ficheros tocados (con copia de seguridad al lado):

- `/srv/data/facylf/descargas-federacion/recolector-local/temporadas-asignadas.txt` (servidor) → las cinco de arriba.
- `E:\facylf-datos\descargas-federacion\recolector-local\temporadas-asignadas.txt` (PC) → las diez restantes.

## 3 · Plazos

| Escenario | Días para los 53.723 |
|---|---:|
| PC encendido 10 h/día + servidor a plena plaza (12 h) | **~13 días** |
| PC encendido 24 h + servidor | ~6-7 días |
| Solo el PC, 10 h/día | ~18 días |
| Solo el PC, 24 h | ~7-8 días |

## 4 · Se está repitiendo trabajo: esto es lo que se pierde

- **Duplicación entre máquinas**: ~18.400 trabajos en las dos colas. El reparto de hoy la elimina.
- **Bucles de reintento en el servidor**: `2026-27 · clasificación`: **190 trabajos con 4.674 intentos** (uno
  llegó a **99**); `2018-19 · calendario`: **4 trabajos con 573 intentos** (máximo 164); `indice_jornadas` de
  2012-13, 2014-15, 2016-17 y 2018-19: 147 trabajos con 5 intentos cada uno. Son páginas que fallan siempre y se
  reintentan en cada sesión: **~6.600 peticiones gastadas**.
- **PC**: `2026-27 · clasificación`: 35 trabajos con 259 intentos (máximo 13); `indice_jornadas` de 2017-18,
  2019-20 y 2013-14: 30 trabajos × 5 intentos.
- **Aplazados al futuro**: 2.756 en el PC y 4.549 en el servidor (trabajos con `siguiente_intento` por delante);
  algunos son jornadas futuras legítimas, pero muchos son reintentos con espera.
- **Peticiones inútiles (7 días, PC)**: de 7.000 peticiones, 44 `sin_datos`, 30 `sin_publicar` y 19
  `error_navegador` (**1,3 %**). URLs repetidas: 76 (153 peticiones, **94 de más**).
- **No hay claves duplicadas** dentro de una cola (0): la duplicación es entre máquinas, no dentro de cada una.

## 5 · Qué queda por verificar mañana

1. Que el servidor deje de pedir `acta|22` (2026-27): su plan de actas parece no pasar por el filtro de
   temporadas asignadas. Si sigue, hay que aplicar el filtro también a esa consulta.
2. Que el PC prepare el plan con sus diez temporadas (el arranque de hoy dijo «4 temporadas y 269 competiciones»).
3. Volver a medir el ritmo y recalcular el plazo con las dos máquinas ya repartidas.

## Segundo reparto (00:45 del 12/11): la mayoría al servidor

El PC no está siempre encendido, así que el peso va al servidor:

| Máquina | Temporadas | Trabajo | Ritmo | Días |
|---|---|---:|---|---:|
| **Servidor** | 2024-25, 2023-24, 2022-23, 2021-22, 2020-21, 2019-20, 2018-19, 2017-18, 2016-17, 2015-16 | **43.756** | ~1.224/día | **~36** |
| **PC** | 2026-27, 2025-26, 2014-15, 2013-14, 2012-13 | **9.967** | ~3.000/día (10 h) | ~3,3 |

Como la mayor parte está en el servidor, **el plazo lo marca el servidor: ~36 días** a 1.224 trabajos/día. El PC,
cuando está encendido, quita de en medio sus 9.967 en tres o cuatro días de trabajo, pero no acorta el trozo del
servidor. Para bajar de un mes: (a) el PC tendría que llevarse más temporadas (y está apagado a ratos), o
(b) dar más plazas de navegador al servidor, que hoy comparte 5 entre 20 contenedores.

**Pendiente de arreglar**: el servidor sigue pidiendo `acta|22` (2026-27) aunque esa temporada ya no está en su
lista. Su plan de actas no pasa por el filtro de temporadas asignadas; mientras siga así, esa temporada se pide
dos veces.

## El resto de la ingesta (medido a las 00:45)

Federaciones PNFG en la copia del PC del 30/10 (pendientes y último trabajo):

| Federación | Pendientes | Último trabajo |
|---|---:|---|
| Andalucía | 334.962 | 9/11 16:30 |
| Madrid | 137.517 | **11/11 22:09** |
| Valencia | 130.719 | **11/11 23:22** |
| Cataluña | 128.666 | 9/11 14:16 |
| Bizkaia | 57.137 | 9/11 13:46 |
| Gipuzkoa | 34.502 | 9/11 13:35 |
| Tenerife | 23.206 | 9/11 13:55 |
| Las Palmas | 20.623 | 9/11 13:54 |
| Araba | 5.424 | 9/11 16:52 |

Solo **Madrid y Valencia** estaban recolectando en la madrugada del 11 al 12; las demás llevan paradas desde el
**9/11**. Las colas «vivas» del servidor (\`/srv/data/facylf/descargas-*\`) están casi vacías: el trabajo real de
esas federaciones está en la copia del PC y en el PC.

Multideporte (La Preferente y otros deportes), todo con peticiones del **11/11**:

| Portal | Pendientes | Hechas | Registros |
|---|---:|---:|---:|
| **La Preferente** | **688.214** | 0 | 2.610.624 |
| isquad-balonmano | 11.551 | 7.331 | 37.500 |
| gesdeportiva | 6.832 | 0 | 118.149 |
| isquad-voleibol | 6.723 | 11.758 | 43.288 |
| fmvoley | 3.806 | 0 | 16.854 |
| serversports | 3.178 | 92.511 | 161.943 |
| owbasket | 1.126 | 7.327 | 206.308 |
| isquad-tenis | 686 | 2.616 | 119.416 |
| febauto | 578 | 42.553 | 933.937 |
| feb | 556 | 11.154 | 22.842 |
| totalfutbol | 551 | 8.620 | 33.801 |
| mygol | 482 | 4.301 | 147.058 |
| siguetuliga | 420 | 0 | 26.279 |
| portalrivas | 272 | 0 | 18.453 |
| apuntamelo | 198 | 12 | 26.918 |
| playooz | 181 | 4 | 6.818 |
| vistahermosa | 128 | 0 | 7.238 |
| mytorneo | 62 | 10 | 112 |

Los 18 portales están activos (peticiones del 11/11) y suman **~4,9 millones de registros**. La Preferente es la
que más tiene por delante: **688.214 páginas**.
