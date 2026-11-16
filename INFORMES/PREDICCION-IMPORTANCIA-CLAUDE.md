No he editado nada. Revisé `scripts/prediccion/eval_modelos.py`, `04-modelo.py`, `pruebas/prediccion/evaluacion.json` y las migraciones 0002, 0003, 0004, 0005, 0026 y 0029. No he ejecutado ningún experimento, así que lo que sigue son fórmulas y criterios, no resultados.

Ese repaso deja cuatro problemas que conviene tener en cuenta antes de medir nada:

- **Lo validado no es lo publicado.** Las variables que dan 0,93767 (`features_ml` en `evaluacion.json`) no incluyen forma ni `fed_id`; esas dos sólo están en `04-modelo.py`. El modelo que se publica no se ha validado como tal.
- **`lh/la` del entrenamiento se calculan con los mismos partidos que predicen** (`eval_modelos.py:301`). En el entrenamiento son más informativas que en validación y el HGB se fía demasiado de ellas.
- **`cambio_entrenador_*` usa el acta del propio partido.** Es información posterior al momento de publicar la predicción.
- **`impacto_*` desconocido vale 0,0** en lugar de NaN, lo que choca con el invariante de no convertir lo desconocido en cero. Además `impacto_medio` se calcula con todas las temporadas, también las de validación.

Dos cosas más afectan a la parte A:

- **La parada temprana es aleatoria.** `early_stopping` aparta un 10 % aleatorio del entrenamiento, y con `sample_weight` esa parada también se pondera. Cada variante pararía en una iteración distinta y la comparación no sería justa.
- **El bloque `ml-ponderado` ya existe** (`eval_modelos.py:316-329`), pero su resultado no está en `evaluacion.json`. Sus pesos dependen del resultado (`gd`).

## A) Peso por importancia del partido

**Criterio principal: los pesos sólo pueden depender de lo que se sabía antes del partido.** Ponderar por goleada o por diferencia de un gol no es fuga temporal, pero cambia lo que el modelo aprende. Quitar peso a las goleadas del favorito le resta probabilidad de victoria, y dar más peso a |gd| ≤ 1 infla el empate. Esa variante se mide sólo como control (V_g) y se espera que empeore la calibración. La «goleada contra un rival muy inferior» se sustituye por el desajuste de Elo antes del partido.

Variables, todas disponibles antes del partido:
- `d = elo_h + 60 − elo_a`.
- `n_h`, `n_a`: partidos previos de cada club en el Elo. Hay que añadir un contador al bucle actual.
- `R`: jornadas que quedan, `coalesce(pg.jornadas_previstas, máx. numero del grupo) − jornada + 1`.
- `cov_ed`: `Σpartidos_cubiertos / Σpartidos_elegibles` de `analytics.team_edition_summary` del grupo.

**Cálculo de `stake` (lo que se juega cada equipo):**
- Se usa `core.standing_snapshot` de la jornada j−1 (primero `oficial`; si no hay, `reconstruida`).
- Las zonas salen de `analytics.zonas_de_grupo`: `ascensos` A, `promocion` P, `descensos` D y `promocion_permanencia` Q; N es el número de equipos.
- Hay dos líneas: arriba `L = A+P` y abajo `L = N−D−Q`.
- La distancia a cada línea, `gap(L)`, vale `pts − pts(L+1)` si el equipo está en la posición L o por encima, y `pts(L) − pts` si está por debajo.
- `c(L) = max(0, 1 − gap/(3R))`.
- Por equipo se toma el máximo de c en las líneas que existan, y para el partido el máximo de los dos equipos.
- `stake = max(stake_local, stake_visitante) · momento`.
- Si `pg.tipo` es `ascenso` o `fase`, `stake = 1`.
- Si no hay snapshot o `origen = 'ninguna'`, `stake` es NaN y su factor vale 1 (desconocido no es cero).
- **Posible fuga:** `zona_familia` aprende las zonas con todas las temporadas, también las de validación. Para el experimento hay que recalcularla con `anio < 2024` o usar sólo `origen = 'reglamento'`.

**Factores del peso:**

| Factor | Fórmula | Rango |
|---|---|---|
| `w_fiab` | 0 si `official_status ≠ 'played'`, `match_report.quality = 'administrative'` o `team_entry.retirado`; si no, `0,7 + 0,3·cov_ed` | 0 o [0,7; 1] |
| `w_imp` | `1 + 0,6·stake` | [1; 1,6] |
| `w_igual` | `1 + 0,25·exp(−(d/150)²)` | [1; 1,25] |
| `w_desc` | `1 − 0,4·σ((|d| − 300)/60)`, con σ la función sigmoide | [0,6; 1] |
| `w_mad` | `0,6 + 0,4·min(1, min(n_h, n_a)/15)` | [0,6; 1] |

El peso final es `w = clip(w_raw / media(w_raw), 0,4, 2,5)`, con `w_raw` el producto de los cinco factores, y después se vuelve a escalar para que la media sea 1.

`w_mad` existe porque el Elo arranca en frío en 2019. Las actas no cambian la fiabilidad del resultado sino la de las variables (impacto, entrenador). Por eso, para las categorías con menos actas, lo que más ayuda es tratar lo ausente como NaN; `w_fiab` es un complemento suave.

**Cómo medirlo sin fuga:**
1. Elegir `max_iter` en un hold-out temporal interno: entrenar hasta 2022-23 y validar en 2023-24 con log-loss sin ponderar. Después reentrenar con todo hasta 2023-24 y `early_stopping=False`.
2. Variantes a comparar: base, cada factor por separado, todos juntos y V_g.
3. Métrica: log-loss **sin ponderar** en 2024-25, en 2025-26 y en conjunto, más Brier y ECE con la función `calibracion()` que ya existe. Los subconjuntos `stake ≥ 0,5` y `|d| < 100` sólo sirven de diagnóstico.
4. Bootstrap pareado por `phase_group_id`, 1000 réplicas, sobre la diferencia de pérdida partido a partido.
5. Se adopta si se cumplen todas estas condiciones:
   - Δ ≤ −0,0005 con el extremo superior del IC95 por debajo de 0.
   - Mejora en las dos temporadas.
   - El ECE no empeora más de 0,003.
   - Ninguna federación con al menos 5000 partidos empeora más de 0,002.
6. Confirmar con walk-forward: entrenar hasta 2024-25 y validar en 2025-26.

Espero una mejora pequeña. Un peso que sólo depende de las variables no cambia lo que el modelo intenta predecir; sólo redistribuye su capacidad.

## B) Grafo jugador-compañeros-entrenador

**Regla as-of:** sólo partidos con `fecha < fecha_m` estricto. Nunca el XI ni el `match_staff` del partido que se predice, porque salen de su acta. `player_team_season_summary` sólo para temporadas ya terminadas, nunca la actual, porque acumula toda la temporada.

**Fuentes:**
- `core.appearance` con `condition` `starter` o `substitute`.
- `core.match` para la fecha (`coalesce(played_at, fecha_prevista)`).
- `team_entry → team_season.club_id`.
- `core.match_staff` filtrado por rol de entrenador.

**Definiciones:** XI_k son los titulares del k-ésimo partido previo. El núcleo Nu son los n jugadores con más titularidades en los 5 partidos previos, con n el tamaño habitual del XI (vale para fútbol 7 y 8).

Cada feature se calcula para local y visitante, y se prueba también la diferencia:

| Columna | Fórmula |
|---|---|
| `continuidad_once` | media de \|XI_k ∩ XI_{k+1}\| / n en los 3 pares previos |
| `estabilidad_nucleo` | Σ titularidades de Nu / (5n) |
| `cotitularidades_temp` | media, por pares de Nu, de partidos previos de esta temporada con ambos titulares, dividida entre los partidos previos |
| `anios_juntos` | Σ en las 3 temporadas previas de max_ts \|Nu ∩ R_ts\| / \|Nu\|, con R_ts los jugadores con `partidos_demostrados ≥ 3` en ese equipo-temporada. Recoge la generación que sube junta en base y evita la explosión de pares. |
| `solape_min_previo_cota` | Σ min(`minutos_estimados`) / `minutos_posibles` en la temporada anterior |
| `retencion` | minutos de la temporada anterior de jugadores ya vistos esta temporada / minutos totales de la temporada anterior |
| `entrenador_partidos_temp`, `entrenador_temporadas_club`, `nucleo_con_entrenador_previo` | con el entrenador del **último partido previo** |
| `cambio_entrenador_previo` | sustituye a la variable actual, que tiene fuga |
| `cobertura_acta_previa` | fracción de los 5 partidos previos con filas en `appearance` |

Sin datos, cada columna vale NaN, nunca 0; el HGB trata NaN de forma nativa.

**Los minutos exactos juntos no se pueden calcular con estas tablas.** Hacen falta `core.match_event` (entradas y salidas) y `analytics.minutos_partido`, que no están en la lista. Por eso `solape_min_previo_cota` es sólo una cota superior y lleva ese nombre.

**Importancia por permutación:**
- Se permuta por grupos, no columna a columna: G1 continuidad, G2 historia y G3 entrenador, con local, visitante y diferencia a la vez. Es un bucle propio, porque `permutation_importance` de sklearn no admite grupos.
- Las permutaciones se hacen dentro de cada estrato federación × temporada × tramo de cobertura, para que la importancia no mida sólo si hay acta o no.
- 20 repeticiones sobre la validación.
- Lo que decide es el reentrenamiento sin el grupo; la permutación sólo explica.

**Entra si se cumplen todas estas condiciones:**
- Reentrenando sin el grupo: Δ ≤ −0,0010 con el extremo superior del IC95 por debajo de 0 (bootstrap por grupo de competición) y mejora en las dos temporadas.
- La permutación tiene el extremo inferior de su IC por encima de 0.
- La mejora se mantiene en el estrato con `cobertura_acta_previa ≥ 0,8`.
- **Prueba del indicador:** si sólo con `cobertura_acta_previa` o con indicadores de NaN se gana lo mismo, se descarta el grafo y se queda sólo el indicador.
- El cálculo cabe en la ejecución semanal sin competir con los workers.

Si no cumple todo eso, se descarta.

Lo he dejado todo en `C:\Users\David\.claude\plans\contexto-fondo-popular-predice-async-catmull.md`. Antes de medir A o B convendría corregir los cuatro problemas del principio; si no, cualquier diferencia queda mezclada con esas fugas.
