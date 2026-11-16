# Predicción de partidos y clasificación final · 16/11/2026

## 1. Datos y referencia histórica

La [auditoría](AUDITORIA-DATOS.md) mide cobertura por temporada y enlaza las consultas exactas. La evaluación guardada incluye varias federaciones. En la copia local, Castilla y León aportó 65.033 de las 667.728 filas en el primer recuento. Cada fila tenía un `match_id` distinto. Cuatro cruces repetían la combinación grupo, jornada y equipos, todos fuera de Castilla y León.

Al reejecutar el código del commit `a51b649`, el HGB histórico reprodujo **0,93767 de log-loss y 0,56528 de Brier** a cinco decimales. La base activa tenía ya 667.729 partidos de validación. En la ejecución integral posterior entraron otras dos filas y el resultado fue 0,93767 y 0,56527. Las tablas completas se guardan en `historico/evaluacion.json`. El resultado histórico usa variables distintas de las del publicador y deja que el acta propia indique un cambio de entrenador. También calcula fuerzas de equipo para ejemplos de entrenamiento incorporando resultados de ese mismo entrenamiento. Sirve como referencia histórica multifederación.

## 2. Método

La evaluación nueva usa partidos jugados con fecha en Castilla y León. Al comenzar cada día civil de Madrid, lee el estado para todo el lote de partidos de ese día y sólo después incorpora sus resultados y actas. Esto evita que el orden de IDs resuelva resultados simultáneos y deja margen cuando el canónico sólo conserva el día. Los partidos repetidos con el mismo marcador y fecha se reducen a una fila por cruce y jornada. Se excluyen los cruces contradictorios y los resultados administrativos. La reconstrucción usa la fecha deportiva como aproximación a la disponibilidad del dato. El canónico guarda actas corregidas y nuevas importaciones, por lo que no permite reconstruir exactamente qué revisión veía un usuario histórico en cada fecha.

El entrenamiento de cada pliegue usa temporadas previas y fechas anteriores al 1 de julio de la temporada de validación. El conjunto de desarrollo es 2021-22 a 2023-24. 2024-25 y 2025-26 quedan reservadas para la prueba. La línea HGB comparable usa Elo por identidad exacta de equipo y categoría, fuerzas de gol acumuladas hasta el corte, jornada y metadatos de competición. La parada temprana aleatoria se desactiva. Se comparan hojas, regularización y número de iteraciones en desarrollo. La isotónica ajusta las tres clases con predicciones de pliegues anteriores y luego renormaliza. El apilado se ajusta sobre predicciones fuera de muestra, con el árbol, Elo y Poisson como entradas. [Calibración en scikit-learn](https://scikit-learn.org/stable/modules/calibration.html), [parámetros de HistGradientBoosting](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingClassifier.html), [LightGBM multiclase](https://lightgbm.readthedocs.io/en/stable/pythonapi/lightgbm.LGBMClassifier.html).

Un árbitro de partido futuro necesitaría una designación con fecha de publicación previa. `core.match_official` acredita la presencia en acta y no ofrece ese sello. El horario se ensaya como hábito de los cinco partidos anteriores. El historial de ausencias usa convocatorias y titularidades verificadas. Una roja anterior queda como observación disciplinaria, con independencia de la decisión oficial sobre la sanción. Cohesión mide temporadas en que los pares de titulares del último once observado ya habían coincidido con el mismo equipo contextualizado.

## 3. Reproducir y actualizar

Con Python 3.12, las [dependencias fijadas](../../scripts/prediccion/requirements.txt) y el `DATABASE_URL_LECTOR` del entorno o del `.env`, desde la raíz del repositorio:

```powershell
python -B scripts/prediccion/mejora.py --calendario-archivado
```

El comando guarda `auditoria.json`, `historico/evaluacion.json`, `modelos.json`, `partidos.json`, `clasificacion.json` y `registro.json` en `tmp/prediccion`. La reproducción histórica necesita el commit `a51b649`. Los recuentos y el error pueden variar con nuevas importaciones o rectificaciones del canónico. `--calendario-archivado` requiere Node y las dependencias del repositorio. Usa `core.calendario_previsto` para los grupos disponibles y consulta los HTML ya descargados para los demás. Para inscripciones sin código en el HTML, exige coincidencias únicas por nombre de fuente dentro del grupo correcto y valida el calendario con los cruces ya jugados. Las fechas archivadas corresponden a jornadas. El programa conserva una antelación de dos días para esos cruces.

Para actualizar después de una jornada con el mismo plan seleccionado:

```powershell
python -B scripts/prediccion/mejora.py --semanal --calendario-archivado
```

`registro.sqlite` conserva la primera probabilidad 1-X-2 y el sello de emisión de cada cruce. Las revisiones de un resultado actualizan su evaluación. La jornada y ambas inscripciones identifican el cruce dentro del grupo. Sólo se puntúan resultados en fechas posteriores a la emisión. El JSON informa del acierto, log-loss, Brier y calibración acumulados por temporada y versión, además del desglose por grupo y jornada. Un aumento de más de 0,05 de log-loss en las últimas cinco jornadas cerradas frente a las anteriores activa la alerta cuando ya hay otras cinco jornadas puntuadas. El umbral se configura con `--umbral-deriva`. El programa escribe los artefactos en el PC con una conexión de sólo lectura al canónico.

## 4. Ablación y comparación de modelos

| Bloque añadido | Log-loss antes | Log-loss después | Pliegues que mejoran | Veredicto |
|---|---:|---:|---:|---|
| Forma con decaimiento | 0,77663 | 0,76865 | 3/3 | Conservar |
| Contra el tercio alto | 0,76865 | 0,76775 | 3/3 | Conservar |
| Contra el tercio bajo | 0,76775 | 0,76777 | 1/3 | Descartar |
| Descanso | 0,76775 | 0,76759 | 2/3 | Conservar |
| Horario habitual | 0,76759 | 0,76753 | 1/3 | Descartar |
| Cambio e historial del entrenador | 0,76759 | 0,76757 | 1/3 | Descartar |
| Remontadas y ventajas perdidas | 0,76759 | 0,76622 | 3/3 | Conservar |
| Goles por minuto en superioridad o inferioridad | 0,76622 | 0,76814 | 1/3 | Descartar |
| Ausencias y rojas observadas | 0,76622 | 0,76680 | 1/3 | Descartar |
| Temporadas juntos de los titulares | 0,76622 | 0,76615 | 2/3 | Conservar |

La ablación usa la media no ponderada de los tres pliegues de desarrollo. Se conserva un bloque cuando baja el promedio y el error sube en uno o ningún pliegue. Las ventanas de 21, 60 y 180 días dieron 0,77309, 0,77007 y 0,76867 respectivamente. Las tres combinadas dieron 0,76865 y se conservaron.

Se ensayó también el peso de temporadas anteriores con factores 0,75, 0,85 y 0,95. La variante ponderada más favorable en los tres pliegues usó 0,85. Las métricas de prueba incluyen la versión del árbol sin ponderación y la ponderada.

El ajuste de modelo y calibración quedó cerrado en desarrollo. La tabla usa idénticos partidos en 2024-25 y 2025-26 para todas las filas. Brier suma los errores cuadrados de las tres clases. ECE promedia las diferencias ponderadas de cinco tramos para cada clase. La referencia de frecuencias 1-X-2 agrupa por categoría, modalidad y género en el conjunto de entrenamiento.

| Modelo | N | Log-loss | Brier | Acierto | ECE |
|---|---:|---:|---:|---:|---:|
| lightgbm_hojas_63 | 65.033 | 0,74778 | 0,43219 | 67,91 % | 0,36 % |
| **lightgbm (elegido en desarrollo)** | 65.033 | 0,74796 | 0,43232 | 67,87 % | 0,42 % |
| hgb | 65.033 | 0,74830 | 0,43256 | 67,78 % | 0,43 % |
| arbol_decaimiento | 65.033 | 0,74839 | 0,43248 | 67,89 % | 0,42 % |
| apilado | 65.033 | 0,74848 | 0,43256 | 67,91 % | 0,62 % |
| hgb_hojas_15 | 65.033 | 0,74895 | 0,43297 | 67,86 % | 0,47 % |
| hgb_regularizado | 65.033 | 0,74926 | 0,43297 | 67,90 % | 0,37 % |
| isotonica | 65.033 | 0,74934 | 0,43271 | 67,86 % | 0,78 % |
| hgb_base_causal | 65.033 | 0,75923 | 0,43995 | 67,29 % | 0,92 % |
| logistica_C_0.1 | 65.033 | 0,76718 | 0,44194 | 67,54 % | 1,16 % |
| logistica_C_1 | 65.033 | 0,76719 | 0,44194 | 67,54 % | 1,17 % |
| elo | 65.033 | 0,79535 | 0,46094 | 65,99 % | 0,90 % |
| poisson | 65.033 | 0,90300 | 0,52640 | 60,86 % | 4,96 % |
| frecuencias | 65.033 | 0,94330 | 0,58171 | 48,95 % | 0,31 % |
| siempre_local | 65.033 | 14,10591 | 1,02102 | 48,95 % | 34,03 % |

El modelo elegido en desarrollo fue `lightgbm`. Frente al HGB de referencia causal, el log-loss bajó **0,01126** y el Brier **0,00763** con 65.033 partidos. La variante `lightgbm_hojas_63` obtuvo el menor log-loss en prueba. La selección queda fijada por los pliegues anteriores.

La isotónica llevó el ECE de `lightgbm` de 0,424 % a 0,784 % y el log-loss de 0,74796 a 0,74934. El apilado quedó por detrás del elegido en log-loss y Brier. Las tres líneas base obligatorias quedaron por detrás.

## 5. Resultados por temporada y categoría

| Temporada | N | Log-loss | Brier | Acierto | ECE |
|---|---:|---:|---:|---:|---:|
| 2024-25 | 36.522 | 0,75214 | 0,43442 | 67,59 % | 0,55 % |
| 2025-26 | 28.511 | 0,74261 | 0,42964 | 68,24 % | 0,40 % |

| Categoría | N | Log-loss | Brier | Acierto | ECE |
|---|---:|---:|---:|---:|---:|
| Otros aficionados | 61 | 1,02974 | 0,60890 | 52,46 % | 7,34 % |
| Tercera RFEF | 914 | 1,02700 | 0,61705 | 48,91 % | 2,60 % |
| Regional aficionados | 1.216 | 0,96361 | 0,57217 | 54,85 % | 2,95 % |
| Provinciales aficionados | 6.366 | 0,87156 | 0,50905 | 61,84 % | 1,16 % |
| Juvenil | 6.836 | 0,86630 | 0,50789 | 61,44 % | 0,50 % |
| Desconocida | 1.012 | 0,82351 | 0,48092 | 62,35 % | 2,83 % |
| Cadete | 7.984 | 0,81391 | 0,47274 | 64,53 % | 0,42 % |
| Infantil | 8.880 | 0,76329 | 0,44031 | 67,12 % | 0,96 % |
| Benjamín | 11.140 | 0,68692 | 0,39321 | 71,46 % | 0,46 % |
| Alevín | 14.091 | 0,64220 | 0,36609 | 73,38 % | 0,45 % |
| Prebenjamín | 6.533 | 0,64096 | 0,36675 | 73,66 % | 1,12 % |

Tercera RFEF y Regional aficionados tienen el mayor error entre las categorías con más de 100 partidos. En categorías de base con más goles el modelo acierta con más frecuencia. El Brier y el ECE deben leerse en cada categoría además del agregado.

| Signo | Probabilidad | N | Media predicha | Frecuencia real |
|---|---|---:|---:|---:|
| Local | 0%–20% | 11.667 | 10,01 % | 9,56 % |
| Local | 20%–40% | 14.124 | 30,52 % | 30,49 % |
| Local | 40%–60% | 15.472 | 49,78 % | 49,39 % |
| Local | 60%–80% | 12.779 | 69,50 % | 68,96 % |
| Local | 80%–100% | 10.991 | 89,69 % | 90,61 % |
| Empate | 0%–20% | 60.699 | 9,85 % | 9,68 % |
| Empate | 20%–40% | 4.332 | 22,80 % | 20,43 % |
| Empate | 40%–60% | 2 | 42,64 % | 0,00 % |
| Visitante | 0%–20% | 18.415 | 9,70 % | 9,61 % |
| Visitante | 20%–40% | 17.065 | 29,91 % | 30,97 % |
| Visitante | 40%–60% | 13.444 | 49,32 % | 49,72 % |
| Visitante | 60%–80% | 8.849 | 69,41 % | 69,99 % |
| Visitante | 80%–100% | 7.260 | 89,30 % | 89,67 % |

El empate entre 20 % y 40 % se sobreestima en 2,37 puntos porcentuales. El tramo siguiente contiene dos partidos. La [evaluación completa](../../pruebas/prediccion/evaluacion-castilla-leon-2026-11-16.json) incluye cada pliegue, las tasas de cobertura y el cruce de categoría por temporada.

## 6. Clasificación final

La simulación usa 6.000 trayectorias y separa el marcador aleatorio de la incertidumbre en ataque y defensa. En cada trayectoria sortea una fuerza Gamma-Poisson por equipo y la mantiene para todos sus cruces. Parte de las medias previas de goles del grupo y contrae la fuerza de cada equipo con el equivalente a ocho partidos. El desempate simulado aplica puntos, diferencia de goles y goles a favor. Resuelve los empates exactos al azar. Los reglamentos que usan enfrentamientos directos o ajustes de puntos pueden producir puestos oficiales distintos.

Para el backtest se corta el día siguiente a la última fecha de juego de la jornada 10 y se usan los partidos anteriores al corte. La jornada tiene un margen máximo de diez días entre su primer y último encuentro. Se comprueba el cierre de la liga y se compara con la última clasificación oficial completa. El calendario futuro entra si se había observado antes del corte. Para reconstruir cruces faltantes, el número de jornadas y el plantel deben corresponder a una liga a una o dos vueltas. En los cruces inferidos a una vuelta se usa campo neutral porque se desconoce la localía.

| Temporada | Grupos | Equipos | Método | Log-loss de puesto | MAE de puesto | MAE de puntos | Brier de campeón |
|---|---:|---:|---|---:|---:|---:|---:|
| 2024-25 | 25 | 361 | Poisson fijo | 1,69631 | 1,29479 | 5,41708 | 0,43804 |
| 2024-25 | 25 | 361 | Gamma-Poisson | **1,65386** | **1,29245** | 5,46033 | **0,43036** |
| 2025-26 | 101 | 1.419 | Poisson fijo | 1,61820 | **1,12469** | **4,96502** | 0,49413 |
| 2025-26 | 101 | 1.419 | Gamma-Poisson | **1,58472** | 1,13747 | 5,03989 | **0,49238** |

Gamma-Poisson mejora el log-loss del puesto y el Brier de campeón en las dos temporadas. Su MAE de puntos empeora 0,04 y 0,07 puntos respectivamente. El MAE del puesto mejora 0,002 puestos en 2024-25 y empeora 0,013 en 2025-26.

| Simulaciones | Diferencia media por celda frente a 6.000 | Mayor diferencia observada |
|---:|---:|---:|
| 500 | 0,535 puntos porcentuales | 6,95 puntos porcentuales |
| 1.500 | 0,279 puntos porcentuales | 3,73 puntos porcentuales |
| 3.000 | 0,159 puntos porcentuales | 2,00 puntos porcentuales |

La comparación usa prefijos de la misma muestra. Se mantienen 6.000 trayectorias para reducir el ruido en las celdas con mayor variación. En la copia del 16/11 se estimaron 131 ligas actuales y 17.357 cruces pendientes. El calendario archivado aportó la identidad y orientación de 12.046 cruces y se dedujeron los otros 5.311. En la prueba histórica el calendario archivado actual queda fuera por su fecha de observación.

## 7. Verificación

La primera pasada semanal congeló **1.036 predicciones** en 182 grupos para jornadas fechadas entre el 21 y el 23 de noviembre. Las tres probabilidades exportadas coinciden con las almacenadas para cada cruce. Los 1.036 partidos esperan resultado. Para continuar ese registro concreto:

```powershell
python -B scripts/prediccion/mejora.py --semanal --calendario-archivado --salida tmp/prediccion/entrega-activa
```

Pasaron las ocho pruebas específicas de corte temporal, calendario, simulación, probabilidades, congelación y deriva. Pasaron `pnpm lint` y la comprobación de tipos de la web. La ejecución general de Vitest pasó 1.416 pruebas y falló durante la limpieza de la federación sintética de `lote.test.ts`. La repetición aislada también falló durante esa limpieza por la clave foránea entre partido y evento.
