# Predicción de resultados y clasificación final · Fondo Popular

Documento de portfolio: qué se predice, con qué datos, cómo se valida y qué se puede y no se puede afirmar.
No es una promesa de acierto; es un sistema medido y reproducible.

## 1 · Problema

Dos salidas distintas:

1. **Resultado de un partido**: probabilidad de 1 (local), X (empate) y 2 (visitante).
2. **Clasificación final**: simulación de lo que resta de liga con esas probabilidades, para estimar
   puesto, puntos y probabilidad de ascenso/descenso/play-off.

El fútbol no profesional tiene pocos datos por equipo, calendarios irregulares y plantillas que cambian.
Por eso el modelo no se presenta como «oráculo»: se presenta con **log-loss, Brier, acierto y
calibración** y con una línea base clara.

## 2 · Datos

- Fuente: base canónica PostgreSQL de Fondo Popular, fútbol federado español.
- Entrenamiento: temporadas hasta **2023-24** (`n_train = 354.964`).
- Validación temporal: **2024-25 y 2025-26**, nunca usadas para ajustar (`n_valid = 667.727`).
- Solo partidos jugados, con marcador y equipos distintos; se eliminan duplicados y cruces ambiguos.
- La validación es **out-of-time**: el modelo de cada temporada solo ve el pasado.

## 3 · Variables

El modelo principal es de *gradient boosting* multiclase (LightGBM / HistGradientBoosting según
configuración). Variables construidas **antes del partido**:

| Bloque | Variables | Por qué |
|---|---|---|
| Fuerza | `elo_local`, `elo_visitante`, `elo_diff` | Estado relativo acumulado, con ajuste por rival |
| Goles esperados | `lambda_local`, `lambda_visitante` | Ritmo anotador/encajador suavizado |
| Forma | `forma_21`, `forma_60`, `forma_180` | Ventanas de 21, 60 y 180 días; captura rachas sin mirar el futuro |
| Contexto | `jornada`, `nivel`, `categoria_id`, `modalidad_id`, `genero_id` | La competición no se comporta igual en Tercera que en provincial |
| Descanso | `descanso` | Días desde el partido anterior |
| Horario | `hora_media`, `horas_conocidas` | Rutina de juego |
| Entrenador | `tecnico_antiguedad`, `tecnico_cambios` | Estabilidad del banquillo |
| Remontadas | `remontadas`, `pierde_ventaja` | Carácter competitivo |
| Disciplina | `superior_gf/ga`, `inferior_gf/ga`, `ausencia`, `roja_anterior` | Superioridad numérica y bajas |
| Cohesión | `cohesion` | Continuidad de la plantilla |

Cada bloque entra en los dos lados (local/visitante). No se usan variables posteriores al partido ni
el marcador para construir la entrada.

## 4 · Modelos comparados

Se comparan cinco familias con la misma partición temporal:

- **Base de frecuencias**: probabilidades históricas de 1/X/2.
- **Poisson Dixon-Coles**: goles esperados y correlación de marcadores.
- **Elo**: diferencia de fuerza.
- **ML de variables**: gradient boosting con todos los bloques.
- **ML ponderado**: igual, con peso temporal.

## 5 · Resultados de validación

| Modelo | Log-loss | Brier | Acierto |
|---|---:|---:|---:|
| Base de frecuencias | 0,97563 | 0,59641 | 47,63 % |
| Poisson Dixon-Coles | 1,02137 | 0,62022 | 48,39 % |
| Elo | 0,98603 | 0,60091 | 47,63 % |
| **ML de variables** | **0,93767** | **0,56528** | **54,24 %** |
| ML ponderado | 0,94224 | 0,56784 | 54,27 % |

Lectura correcta:

- El **ML de variables gana en log-loss y Brier**, que son las métricas propias de probabilidad.
- El ML ponderado acierta una milésima más, pero pierde en log-loss y Brier; no se elige por una
  diferencia que no es estable.
- El **acierto del 54,2 %** no significa «acierta 54 de cada 100 partidos en cualquier liga»: es el
  agregado de la validación, con clases desbalanceadas y muchos empates difíciles.

Por temporada:

| Temporada | ML log-loss | ML Brier | ML acierto |
|---|---:|---:|---:|
| 2024-25 | 0,92309 | 0,55548 | 55,45 % |
| 2025-26 | 0,94453 | 0,56989 | 53,68 % |

La caída de 2025-26 es esperable: más partidos y más colas largas. No se oculta.


### Por jornada: el modelo mejora cuando hay más datos

La misma validación, cortada por el número de jornada, confirma la intuición: en la jornada 1 hay poca
información y el modelo apenas supera la línea base; a partir de la jornada 6 y, sobre todo, en la 14-20,
la ventaja es clara.

| Tramo | n | ML log-loss | ML acierto | Base log-loss |
|---|---:|---:|---:|---:|
| J1 | 54.437 | 0,97976 | 50,10 % | 0,98292 |
| J2-J5 | 129.275 | 0,95295 | 52,71 % | 0,97270 |
| J6-J10 | 138.690 | 0,93664 | 54,33 % | 0,97263 |
| J11-J15 | 114.225 | 0,93054 | 55,12 % | 0,97572 |
| J16-J20 | 95.366 | 0,92397 | 55,66 % | 0,97535 |
| J21+ | 135.736 | 0,92532 | 55,44 % | 0,97867 |

Por eso la clasificación se recalcula **en cada jornada**: el corte de la jornada 5 no usa la información
de la 14, y el de la 14 no se presenta como si fuera el de la 1. El sistema debe guardar la fecha de corte
y no mezclar predicciones de momentos distintos.


### Reentrenamiento dentro de la temporada

El modelo se reentrena con los partidos anteriores al corte (incluida la temporada en curso) y se
compara con una base entrenada solo con temporadas completas anteriores, usando las mismas variables.
No se usan resultados posteriores al corte. En 2025-26:

| Corte | Partidos train | Partidos valid | Log-loss incremental | Log-loss base | Acierto incremental | Acierto base |
|---|---:|---:|---:|---:|---:|---:|
| J1 | 568.748 | 111.408 | 0,9510 | 0,9524 | 52,8 % | 52,8 % |
| J5 | 576.115 | 97.224 | 0,9361 | 0,9378 | 54,6 % | 54,4 % |
| J10 | 629.811 | 78.560 | 0,9264 | 0,9322 | 55,5 % | 54,8 % |
| J14 | 609.022 | 66.218 | 0,9290 | 0,9321 | 55,2 % | 54,9 % |

La ganancia es pequeña pero consistente en los cuatro cortes; no se presenta como una revolución. Lo
importante es que el corte es causal: cada fila de validación es posterior al entrenamiento, y la base
no ve la temporada en curso. El sistema puede reentrenar en cada jornada sin fuga.

## 6 · Calibración

El mejor modelo se evalúa por bins de probabilidad. El error de calibración esperado (ECE) es
**0,0121** para local y **0,019** para empate. En la franja 0,4-0,5 el modelo predice 45,31 % y ocurre
45,37 %: está bien centrado. En los extremos (0,8-0,9) tiende a infravalorar al favorito, un sesgo
conocido que se documenta y no se corrige a mano sin una validación nueva.

## 7 · Clasificación final

La clasificación no se «predice» con una sola etiqueta: se **simula**. Para cada grupo:

1. Se estiman las probabilidades de los partidos que quedan.
2. Se juegan miles de temporadas completas (Monte Carlo) con esas probabilidades.
3. Se aplican las reglas de zonas: ascenso, play-off, permanencia y descenso.
4. Se agregan puesto, puntos y probabilidad de cada escenario.

La simulación es tan buena como las probabilidades y las reglas. Si falta el reglamento o un arrastre,
la web lo dice y no rellena con un cero.

## 8 · Reproducibilidad

```bash
python scripts/prediccion/eval_modelos.py   # escribe pruebas/prediccion/evaluacion.json
python scripts/prediccion/04-modelo.py --seco
python scripts/prediccion/03-simulacion.mjs
```

- La partición temporal está fijada en código.
- La huella del modelo incluye especificación, muestra, variables y algoritmos.
- No se publica un modelo nuevo si no mejora log-loss **y** Brier en la misma validación.

## 9 · Limitaciones y decisiones

- **Empates**: es la clase más difícil; el modelo no fuerza un empate «porque toca».
- **Datos**: la cobertura no es uniforme entre federaciones y categorías; el desglose por federación
  existe para detectarlo, no para esconderlo.
- **Filiales**: el nombre no basta para separar primer equipo y filial; se usa club + nombre exacto.
- **Arrastres**: dependen de movimientos oficiales; sin ellos, el sistema muestra «pendiente».
- **Deducciones de puntos**: cuando existe tabla oficial de la temporada en curso, la simulación parte de sus puntos (incluidas sanciones). En temporadas históricas sin snapshot oficial se reconstruyen desde los marcadores; esa diferencia se documenta y no se convierte en cero.
- **No es un sistema de apuestas**: no hay cuotas, ni value betting, ni recomendación económica.

## 10 · Qué demuestra este proyecto

- Diseño de variables temporales sin fuga de información.
- Validación out-of-time y comparación contra baselines.
- Métricas probabilísticas, no solo acierto.
- Simulación de clasificación final con reglas deportivas.
- Trazabilidad: cada número sale de un fichero reproducible, no de una captura.

Los datos y el código están en el repositorio; las cifras de este documento proceden de
`pruebas/prediccion/evaluacion.json` (generado el 16/11/2026).
