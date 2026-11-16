# Publicación semanal de predicción en Castilla y León · 17/11/2026

## Evaluación oficial

La ficha «Modelo» toma el resultado de la [evaluación temporal de Castilla y León](../../pruebas/prediccion/evaluacion-castilla-leon-2026-11-16.json). Los 65.033 partidos corresponden a la prueba de 2024-25 y 2025-26. El entrenamiento de cada pliegue finaliza antes del 1 de julio de la temporada de prueba. La forma, el descanso, la cohesión, el entrenador y las demás variables de acta se construyen con partidos de días anteriores. La selección en desarrollo conservó forma, tercio alto, descanso, remontadas y cohesión. El entrenador se evaluó y quedó fuera de las variables publicadas.

| Castilla y León | Log-loss | Brier | Acierto | ECE medio |
|---|---:|---:|---:|---:|
| HGB de referencia | 0,75923 | 0,43995 | 67,29 % | 0,92 % |
| LightGBM elegido | 0,74796 | 0,43232 | 67,87 % | 0,42 % |

La ficha muestra el resultado por temporada y categoría y las probabilidades por tramo junto a su frecuencia observada. El 0,93767 de log-loss y 0,56528 de Brier del HGB quedan identificados como referencia histórica multifederación. La reevaluación del HGB histórico sobre la copia actual midió ECE, log-loss, Brier y acierto para [19 federaciones con al menos 500 partidos](../../pruebas/prediccion/referencia-federaciones-2026-11-17.json). La validación causal del LightGBM publicado tiene ámbito Castilla y León. El [informe de selección](MODELO-MEJORA-2026-11-16.md) detalla el alcance temporal, los candidatos y las limitaciones de reconstruir estados pasados desde un canónico actualizado.

## Flujo, trazabilidad y calendario

```powershell
node scripts/prediccion/actualiza-semanal.mjs --solo-ml --backtest --simulaciones 3000
node scripts/prediccion/05-registro.mjs
```

La pasada semanal entrena LightGBM y HGB usando temporadas completas anteriores. Publica LightGBM. Sus bandas recogen el desacuerdo con HGB y Poisson. El marcador usa la distribución Poisson condicionada al signo de LightGBM. La versión incorpora la especificación, el código de variables y la huella de las filas de entrenamiento. Para evitar escrituras parciales se publica en una transacción y se serializan las escrituras con un candado de PostgreSQL.

Los calendarios HTML sin código de equipo se asocian sólo para el grupo, competición y temporada correspondientes. Se exige un nombre de inscripción de fuente único para cada equipo sin código, y el calendario tiene que corroborar al menos tres cruces canónicos anteriores y contener todos los observados. Se conserva la huella SHA-256 del documento por grupo. Para un cruce archivado, la fecha es la de su jornada. El programa reserva un día adicional de margen al congelar. No incorpora filas ficticias a `core.match`.

`analytics.prediccion_emitida_cruce` conserva la primera emisión por grupo, jornada e inscripciones. Cuando existe un único partido con esa identidad y fecha posterior al día de emisión, `analytics.prediccion_ml` toma la predicción, su banda, su marcador y su corte. Las filas antiguas de `prediccion_ml` sin corte permanecen como datos históricos. Los lectores de la web usan como ML las filas con corte acreditado. Por jornada y en el acumulado se publican signo, Brier, log-loss y acierto del marcador cuando hubo marcador pronosticado.

La primera pasada del 17/11 dejó 24.283 filas verificadas en `core.calendario_previsto`, que partía de 0. Congeló 1.036 predicciones de jornadas entre el 21 y el 23/11 de la versión `lightgbm-962d82ca60ec`. Las 1.036 tienen bandas, marcador y suma 1-X-2 de 100 %. Las jornadas aún no habían llegado al canónico como partidos vinculables. El registro y las nuevas filas causales de `analytics.prediccion_ml` tenían cero resultados en ese momento.

La segunda pasada conservó la versión y las 1.036 emisiones. Publicó cero filas nuevas de calendario y cero duplicados. La prueba transaccional de PostgreSQL reprodujo el enlace del cruce con el partido y verificó signo, log-loss, Brier, marcador e idempotencia, con `ROLLBACK` al final.

## Clasificación final

Se midieron 3.000 simulaciones por liga a partir de la jornada 10 en [126 ligas con clasificación oficial completa](../../pruebas/prediccion/simulacion-cyl-2026-11-17.json). El modelo de partido aplicado directamente a todas las jornadas pendientes empeoró el error. Se probó tras ver ese resultado una mezcla que conserva la fuerza de liga Gamma-Poisson en el 90 % de los sorteos de cada cruce y usa el signo de LightGBM en el 10 %. El posterior de fuerza se sortea por equipo y se mantiene dentro de cada trayectoria. El backtest sirve para comparar estas variantes y se usó para elegir la mezcla.

| Temporada | Método | Log-loss del puesto real | MAE de puntos |
|---|---|---:|---:|
| 2024-25 | Poisson fijo | 1,69893 | 5,41647 |
| 2024-25 | Gamma-Poisson | 1,65597 | 5,46417 |
| 2024-25 | LightGBM directo | 1,94484 | 6,83675 |
| 2024-25 | Mezcla publicada | **1,64904** | 5,46894 |
| 2025-26 | Poisson fijo | 1,61703 | 4,96329 |
| 2025-26 | Gamma-Poisson | 1,58609 | 5,03700 |
| 2025-26 | LightGBM directo | 1,85078 | 6,65247 |
| 2025-26 | Mezcla publicada | **1,58239** | 5,08815 |

La mezcla mejora el log-loss de puesto en ambos backtests y aumenta el MAE de puntos frente a Poisson fijo en 0,05 y 0,12 puntos respectivamente. Quedaron 131 grupos y 1.788 equipos publicados, con 17.357 cruces restantes. Se dedujeron 5.311 cruces a partir de formatos verificables. Se comprobó que las proyecciones publicadas corresponden a ligas regulares. La UI muestra posición media, puntos, tramo de puestos del 80 % y probabilidad por puesto. La distribución de un equipo fue unánime en la muestra. La UI indica más del 99 % para esas celdas para expresar la resolución finita de la simulación.

## Migraciones locales

- `0069-publicacion-prediccion-causal.sql`. Identidad de cruces por jornada, corte, bandas, versión de simulación y origen del calendario.
- `0070-registro-publicable-prediccion.sql`. Agregado del registro por jornada y modelo.

`node scripts/migrar-canonico.mjs --estado` se detuvo en la 0051 porque su huella aplicada difiere de la del repositorio. Se aplicaron únicamente 0069 y 0070, con `ON_ERROR_STOP` y el registro de cada huella en `ops.migracion` en la misma transacción. El historial 0001–0068 se conservó.

## Grafo de minutos compartidos

```powershell
python -B scripts/prediccion/grafo_minutos.py
```

El grafo se construye a partir del solape de los intervalos en campo de cada pareja. Se usan alineaciones, sustituciones y rojas de actas correctas con duración disponible y secuencia interpretable. Se obtuvieron 130.995 lados de partido con tramos reconstruidos. Para cada partido el grafo usa las actas anteriores a su día y el último once observado. La [prueba con minutos](../../pruebas/prediccion/grafo-minutos-2026-11-17.json) compara el mismo LightGBM y los mismos cortes con cuatro variables adicionales de solape. El grafo queda descartado para publicación.

| Modelo en los 65.033 partidos de prueba | Log-loss | Brier |
|---|---:|---:|
| LightGBM publicado | 0,74796 | 0,43232 |
| LightGBM con grafo | 0,74817 | 0,43244 |

## Comprobaciones y archivos

```powershell
python -B scripts/prediccion/eval_modelos.py --salida tmp/prediccion/referencia-federaciones
python -B -m unittest discover -s scripts/prediccion -p test_mejora.py
node --test scripts/prediccion/test_calendario_archivado.mjs
python -B tmp/prediccion/prueba-registro-postgres.py
pnpm.cmd exec vitest run apps/web/test/proximas.test.ts apps/web/test/prediccion-pantalla.test.ts apps/web/test/proyeccion.test.ts
pnpm.cmd lint
pnpm.cmd --filter @facylf/web exec tsc --noEmit
pnpm.cmd test
```

Pasaron 10 pruebas específicas del flujo de predicción, 15 de las pantallas afectadas, el lint y la comprobación de tipos. En dos lecturas con `EXPLAIN (ANALYZE, BUFFERS)`, la consulta de próximos cruces devolvió 1.036 filas en 2.645 ms en frío y 29 ms en caliente, frente a 1.200 ms de presupuesto. La proyección del grupo 2939 devolvió 14 filas en 254 y 0,44 ms. El informe de aciertos vacío tardó menos de 1 ms.

`pnpm.cmd test` terminó con 1.449 pruebas superadas, una omitida y dos fallos. `packages/canonico/test/inscripcion-sin-codigo.test.ts:570` cuenta toda la federación sintética y espera cuatro inscripciones. PostgreSQL devolvía cuatro del grupo de prueba 9001 y tres del 9002. `apps/web/test/cabecera-sitio.test.ts:109` aún espera `/explorar/rankings` tras el cambio de cabecera a `/explorar/goleadores`.

GitHub Pages construyó los commits `13de8e7` y `f9fbb5f` de `fondo-popular-demo`. Se verificaron el estado HTTP y el contenido servido de estas rutas.

| Ruta de la demo | HTTP | Contenido comprobado |
|---|---:|---|
| [Modelo](https://erdeivih.github.io/fondo-popular-demo/explorar/modelo/) | 200 | Métrica oficial 0,74796 y versión congelada |
| [Próximos partidos](https://erdeivih.github.io/fondo-popular-demo/explorar/proximas/) | 200 | Probabilidades del registro de cruces |
| [Clasificación final del grupo 2939](https://erdeivih.github.io/fondo-popular-demo/explorar/competicion/2939/proyeccion/) | 200 | Proyección de una liga con formato verificado |
| [Tercera Federación, grupo 44](https://erdeivih.github.io/fondo-popular-demo/explorar/competicion/44/proyeccion/) | 200 | Aviso de ausencia de proyección para el grupo clasificado como fase |

La foto pública se generó desde `pnpm.cmd --filter @facylf/web dev --webpack --hostname 127.0.0.1 --port 3002` con las fotos de personas desactivadas. Se renderizaron las rutas de la tabla con `python -B tmp/prediccion/exporta-demo-prediccion.py` y se enviaron con `git -C tmp/demo-prediccion-2026-11-16 push origin HEAD:main`. Se comprobó la compilación publicada con `gh api repos/ErDeivih/fondo-popular-demo/pages/builds/latest` y el contenido de cada URL con una petición HTTP.

Los commits `1845164`, `eb486ea`, `9d759d7`, `4dfef84`, `cd60bb8` y `ae8b29f` enumeran los archivos cambiados con `git show --stat`. Abarcan el flujo semanal, los scripts Python de inferencia y simulación, el registro SQL, las dos migraciones, las consultas de próximos partidos y previa, la ficha del modelo, la proyección y las evidencias JSON. `estado/prediccion-cyl` contiene la salida de la pasada local.
