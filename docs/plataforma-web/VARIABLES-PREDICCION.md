# Variables de predicción · inventario y criterio

Documento de apoyo a [PORTFOLIO-PREDICCION.md](PORTFOLIO-PREDICCION.md). No todas las variables
mejoran; se conservan si son causales, medibles antes del partido y aportan en validación temporal.

## Fuerza y contexto

- Elo por club con ventaja de casa, margen de goles y actualización secuencial.
- Goles esperados (`lambda_local`, `lambda_visitante`) con media de liga y fuerza ofensiva/defensiva.
- Nivel, categoría, modalidad y género codificados; una provincial no se comporta como Tercera.

## Forma y calendario

- Forma a 21, 60 y 180 días con decaimiento.
- Descanso entre partidos.
- Momento de la temporada (jornada / jornadas totales).
- Horario habitual y horas conocidas.

## Jugadores y cohesión

- Impacto de plantilla: puntuación de ojeo ponderada por porcentaje de minutos, top 11 por club y temporada.
- Cohesión: parejas de jugadores que coinciden en convocatorias/titularidades y cuántos años llevan juntos.
- Ausencias y sanciones: jugadores no disponibles, roja anterior.
- No se usa el nombre como identidad: club + contexto.

## Cuerpo técnico

- Antigüedad del entrenador en el club.
- Número de cambios de entrenador.
- No se presupone que un cambio mejore; se deja que el modelo aprenda el signo.

## Rivales

- Rendimiento contra el tercio alto y contra el tercio bajo.
- Residual de Elo frente al rival: ganar al líder vale más que ganar al último.
- Grafo de resultados indirectos: la fuerza de un rival se propaga por sus resultados.

## Lo que se descartó

- Cuotas de apuestas (no hay fuente y no es el objetivo).
- Variables posteriores al partido (fuga).
- Goles de un partido para predecir ese mismo partido.
- Nombre del jugador como identificador único sin club/contexto.

## Cómo se comprueba

1. `python scripts/prediccion/eval_modelos.py --incremental`.
2. Comparar log-loss/Brier contra base; no elegir por acierto agregado.
3. Cortes J1/J5/J10/J14 con validación por fecha estricta.
4. Prueba de simulación: `python scripts/prediccion/test_mejora.py`.
