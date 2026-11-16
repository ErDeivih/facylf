# Modelo de predicción: plan de mejora (16/11/2026)

Punto de partida, validación temporal (entrenar hasta 2023-24, validar 2024-25 y 2025-26):

| Modelo | Log-loss | Brier | Acierto |
|---|---:|---:|---:|
| ML con variables (HistGradientBoosting) | 0,9377 | 0,5653 | 54,2 % |
| Frecuencias 1-X-2 | 0,9756 | 0,5964 | 47,6 % |
| Elo + Poisson | 0,9860 | 0,6009 | 47,6 % |
| Poisson + Dixon-Coles | 1,0214 | 0,6202 | 48,4 % |

El ML saca 0,038 de log-loss a la línea base. En fútbol de este nivel, con marcadores ruidosos y pocas
variables previas al partido, **cada variable nueva buena vale entre 0,001 y 0,005**; un paquete entero
de variables bien hecho, entre 0,010 y 0,020. Ese es el orden de magnitud con el que hay que juzgar todo
lo que sigue. Nada de esto se ha ejecutado: son fórmulas y criterios, no resultados.

## 0. Antes de añadir nada: cuatro fugas que arreglar

Están descritas en `informes/PREDICCION-IMPORTANCIA-CLAUDE.md` y siguen abiertas. Mientras existan, una
mejora medida puede ser mentira.

1. **Lo validado no es lo publicado.** `eval_modelos.py` y `04-modelo.py` usan listas de variables
   distintas. Una sola lista en un módulo (`scripts/prediccion/variables.py`) que importen los dos.
2. **`lh/la` de entrenamiento se calculan con los partidos que predicen.** Calcularlas «fuera de
   pliegue»: para la temporada T, sólo con partidos anteriores a cada partido (acumulado), nunca con
   la temporada completa.
3. **`cambio_entrenador_*` lee el acta del propio partido.** Usar el entrenador del partido anterior
   del equipo (ver §3.8).
4. **`impacto_*` desconocido vale 0.** Debe ser `NaN` (el HGB lo trata como rama propia) y la media de
   referencia sólo con temporadas de entrenamiento.

5. **El tamaño de la validación no cuadra.** `pruebas/prediccion/evaluacion.json` dice 354.964 partidos
   de entrenamiento y **667.727 de validación** en dos temporadas, más que los 567.634 partidos de
   Castilla y León de todas las temporadas juntas. O la evaluación incluye otras federaciones, o hay
   filas duplicadas (un partido por cada lado, o por cada fuente). Hay que saber cuál antes de comparar
   nada: si son otras federaciones, el 0,9377 no es el número de Castilla y León.

Y una de método: **parada temprana con un 10 % aleatorio**. Sustituir por un corte temporal fijo (la
última temporada de entrenamiento como validación interna) para que dos variantes paren con el mismo
criterio.

## 1. Matriz de marcadores

Hoy el 1-X-2 sale del ML y la matriz de `analytics.poisson_partido`, y no cuadran entre sí: la matriz
puede dar 46 % al local cuando la ficha dice 52 %.

**Qué publicar por partido** (ya en pantalla: `MatrizMarcadores.tsx` pinta 0-0 a 4-4 y los cinco más
probables; falta que el dato sea coherente):

1. λ_local y λ_visitante del Poisson (media de liga × ataque × defensa), con corrección Dixon-Coles
   sólo en las cuatro celdas bajas: τ(0,0)=1−λμρ, τ(0,1)=1+λρ, τ(1,0)=1+μρ, τ(1,1)=1−ρ. En fútbol
   aficionado ρ suele quedar entre −0,05 y −0,15; estimarlo por categoría, no global.
2. **Conciliar la matriz con el 1-X-2 del ML.** Sea M la matriz Poisson y (p1, pX, p2) el ML. Se
   reescala por regiones: cada celda con local > visitante se multiplica por p1 / Σ_M(local gana), y lo
   mismo para empate y visitante. La matriz conserva la forma del Poisson (qué marcadores son
   plausibles) y sus sumas por región coinciden con el 1-X-2 publicado. Coste: una pasada, sin
   reentrenar.
3. Guardar la rejilla 0-0…7-7 (64 celdas) en fútbol base y sala, donde 0-5 no alcanza: la media de
   toda la federación en 2026-27 es 6,92 goles por partido (pantalla de estadísticas), empujada por
   esas categorías. Medir qué masa deja fuera la rejilla 0-5 por categoría antes de decidir el
   tamaño. La pantalla sigue enseñando hasta 4-4 y suma el resto en «cinco o más».
4. Marcador más probable: el de mayor celda tras conciliar. Advertencia que debe ir en la ficha del
   modelo: con λ≈1,4/1,1 el marcador más probable ronda el 11-13 %; acertar el exacto uno de cada ocho
   es lo esperable, no un fallo.

**Aceptación:** |Σ región − p_ML| < 0,1 puntos en todos los partidos; masa fuera de rejilla < 2 %.
Métrica nueva en validación: log-loss del marcador exacto (clase «otros» para lo que cae fuera) y
RPS sobre la diferencia de goles.

## 2. Mejorar el ML

**Familias a probar, en este orden** (cada una contra la misma partición y la misma lista de variables):

| Familia | Rejilla | Qué se espera |
|---|---|---|
| HGB actual, más regularizado | `max_leaf_nodes` 15/31/63 · `min_samples_leaf` 200/500/1000 · `l2_regularization` 0/1/10 · `learning_rate` 0,03/0,06 · `max_iter` hasta 800 con parada temporal | −0,001 a −0,003. Con ~355.000 partidos de entrenamiento, hojas de 500+ evitan aprender equipos concretos |
| LightGBM / XGBoost multiclase | `num_leaves` 31-127 · `feature_fraction` 0,6-0,9 · `lambda_l2` 1-20 · `min_data_in_leaf` 300-1000 · restricciones monótonas en `elo_diff` | Parecido al HGB; gana si se usan las restricciones monótonas (más Elo local nunca baja p1) |
| Dos regresiones de goles (Poisson/Tweedie boosting) → matriz → 1-X-2 | objetivo `poisson`, mismas variables | Suele perder 0,002-0,005 en 1-X-2 frente al clasificador, pero da la matriz gratis. Vale como miembro del apilado |
| Regresión logística multinomial sobre Elo, forma y descanso | C 0,1-10 | Línea base seria; si queda a menos de 0,005 del HGB, el HGB está sobreajustando |

**Calibración.** Isotónica por clase sobre predicciones fuera de muestra y renormalizar a suma 1; con
más de 50.000 partidos de calibración la isotónica no sobreajusta. Alternativa más estable:
escalado de temperatura (un parámetro). Elegir por ECE y log-loss en la temporada de validación
interna. Ganancia típica: 0,001-0,004 si el modelo está sobreconfiado en los extremos.

**Apilado con Elo y Poisson.** Meta-modelo logístico multinomial con nueve entradas (logits de ML, Elo
y Poisson) entrenado sobre predicciones fuera de pliegue. Los tres modelos fallan en sitios distintos
(Elo al principio de temporada, Poisson con pocos partidos), así que el apilado suele dar −0,002 a
−0,006. La «banda» de la ficha deja de ser el mínimo/máximo de tres modelos y pasa a ser la dispersión
entre pliegues del propio apilado.

**Validación en cascada (origen móvil).** Cinco pliegues, siempre hacia delante:

| Pliegue | Entrena hasta | Valida |
|---|---|---|
| 1 | 2020-21 | 2021-22 |
| 2 | 2021-22 | 2022-23 |
| 3 | 2022-23 | 2023-24 |
| 4 | 2023-24 | 2024-25 |
| 5 | 2024-25 | 2025-26 |

Hiperparámetros y calibración se eligen con los pliegues 1-3; los pliegues 4-5 no se tocan hasta el
final y son los que se publican. Una mejora cuenta si baja el log-loss medio **y** no empeora en más
de un pliegue. El error típico del log-loss por pliegue es ≈ 0,45/√n (0,0015 con 90.000 partidos, 0,0006 con
600.000): una diferencia menor que dos errores típicos es ruido salvo que aparezca en los cinco
pliegues.

## 3. Variables nuevas

Todas se calculan con lo conocido **antes** del partido. Notación: t = fecha del partido, Δd = días
entre un partido pasado y t, s ∈ {1; 0,5; 0} el resultado del equipo (victoria, empate, derrota).

### 3.1 Forma con decaimiento temporal

    forma_τ = Σ_i w_i · (s_i − e_i) / Σ_i w_i ,   w_i = exp(−Δd_i / τ)

con e_i la expectativa Elo de ese partido (así ganar al colista suma poco). Tres escalas, τ = 21, 60 y
180 días, y lo mismo para goles a favor y en contra por partido. Si Σw < 1,5 (menos de dos partidos
«efectivos»), `NaN`. Sustituye a «puntos de los últimos 5».

### 3.2 Contra los de arriba y contra los de abajo

Con la tabla anterior a cada partido, el rival es «de arriba» si estaba en el tercio alto, «de abajo»
en el tercio bajo.

    rend_arriba = Σ(s_i − e_i | rival arriba) / n_arriba        (y `rend_abajo` igual)

Encogido hacia 0 con k = 4 partidos: rend · n/(n+4). En el partido a predecir se usa la que
corresponde al tercio del rival de hoy. Mínimo 3 partidos en el tramo o `NaN`.

### 3.3 Sanciones y ausencias

Por jugador j y equipo, sobre la temporada en curso hasta t:

    peso_j = minutos_j / minutos_posibles_equipo            (0..1; con minutos no fiables, titularidades / PJ)
    ausente_j = 1 si lleva ≥ 2 convocatorias seguidas sin aparecer habiendo aparecido en ≥ 50 % de las anteriores
    sancionado_j = 1 si vio roja o ciclo de amarillas en el partido anterior (cumple en éste)

    ausencia_equipo = Σ_j peso_j · max(ausente_j, sancionado_j)
    ausencia_gol    = Σ_j (goles_j / goles_equipo) · max(ausente_j, sancionado_j)

Las ausencias no se conocen antes del partido; lo que sí se conoce es que «faltó a los dos últimos» y
«vio roja en el anterior». Eso es lo que entra. Orden de magnitud: `ausencia_equipo` > 0,15 (falta el
equivalente a un titular y medio) debería mover el 1-X-2 entre 1 y 3 puntos.

### 3.4 Árbitro

Con encogido hacia la media de su categoría (k = 10 partidos):

    arb_tarjetas  = (Σ amarillas + k·media_cat) / (n + k)
    arb_rojas     = ídem con rojas
    arb_penaltis  = ídem con goles de penalti (los penaltis fallados no constan en acta)
    arb_local     = (victorias locales + k·p1_cat) / (n + k) − p1_cat        (sesgo de casa del árbitro)
    arb_equipo    = Σ(s_i − e_i | ese árbitro, ese club) · n/(n+5)            (historial con el equipo)

`arb_equipo` es la que David pide («si nos condiciona un árbitro»). Hay que ser honesto con ella:
con 3-6 partidos por pareja árbitro-club es casi todo ruido; el encogido con k = 5 la deja cerca de 0
salvo historiales largos. Se mide y, si su importancia por permutación no sale de cero, se documenta
y se retira. El árbitro sólo se conoce si la designación se publica antes; si no, la variable sólo
vale para explicar partidos jugados, no para predecir.

### 3.5 Campo y horario

    campo_propio      = 1 si el campo es el habitual del local (≥ 60 % de sus partidos en casa)
    rend_campo        = Σ(s_i − e_i | local, ese campo) · n/(n+6)
    superficie_cambio = 1 si el visitante juega habitualmente en otra superficie (cuando conste)
    hora_bloque       = mañana / mediodía / tarde / noche
    hora_inusual      = |hora − hora_habitual_local| en horas
    distancia_km      = entre los campos habituales de ambos (cuando haya coordenadas)

El tiempo meteorológico queda fuera: exige una fuente externa por campo y hora, y en la literatura
aporta menos que el descanso.

### 3.6 Cohesión: años juntos

Para el once probable (los 11 con más minutos en los últimos 5 partidos):

    cohesion = media sobre pares (a,b) de  min(partidos_juntos_ab, 60) / 60
    continuidad = minutos de la temporada pasada que siguen en el equipo / minutos totales de la temporada pasada
    cohesion_tecnico = media sobre jugadores de  min(partidos_con_este_entrenador, 60) / 60

`continuidad` es la variable fuerte de principio de temporada, cuando el Elo del club todavía no sabe
que el equipo ha cambiado medio once. Las tres salen de `core.match_participant` con un autojoin por
partido; es caro una vez (pares × partidos) y barato de mantener si se guarda incremental en
`analytics.pareja_jugadores (person_a, person_b, partidos_juntos, ultimo)`.

Expectativa realista: décimas. Se construye, se mide con importancia por permutación y, si no aporta,
queda escrito que no aporta.

### 3.7 Rival concreto

    h2h = Σ_i w_i (s_i − e_i),  w_i = exp(−Δd_i / 730),  encogido con k = 4

Sólo enfrentamientos entre los dos mismos clubes en la misma categoría de edad. Igual que `arb_equipo`:
poco dato por pareja, se mide antes de creérsela.

### 3.8 Entrenador, remontadas, puesto y trayectoria

    dias_con_entrenador   = días desde el primer partido del entrenador actual con el equipo (del partido anterior)
    entrenador_nuevo      = 1 si lleva ≤ 3 partidos
    rend_entrenador       = Σ(s_i − e_i) del entrenador en toda su carrera, encogido con k = 20
    remontadas            = puntos ganados tras ir perdiendo / partidos en que fue perdiendo   (k = 5)
    se_deja_remontar      = puntos perdidos tras ir ganando / partidos en que fue ganando       (k = 5)
    puesto_rel            = (puesto − 1) / (equipos − 1), antes del partido, para los dos
    distancia_objetivo    = puntos hasta el corte de ascenso y hasta el de descenso, / puntos en juego
    tendencia_club        = Elo de hoy − Elo de hace 365 días
    recien_ascendido / recien_descendido = según la división de la temporada anterior

`remontadas` necesita el minuto de los goles: sólo en partidos con acta que lo publique; en el resto,
`NaN`.

## 4. Ponderación

Ya se midió y se descartó ponderar por resultado (Fase 1, commit a51b649): quitar peso a las goleadas
enseña al modelo que el favorito gana menos de lo que gana. La regla que se mantiene: **el peso sólo
depende de lo que se sabía antes del partido.**

    w = w_reciente · w_igualdad · w_decisivo · w_cobertura,   recortado a [0,25; 4] y normalizado a media 1 por temporada

    w_reciente  = exp(−años_desde_el_partido / 4)
    w_igualdad  = 1 + 0,5 · exp(−(d/200)²)          d = Elo_local + ventaja − Elo_visitante  (rivales directos: hasta ×1,5)
    w_decisivo  = 1 + 0,5 · max(stake_local, stake_visitante)   stake ∈ [0,1], alto si el corte de ascenso o descenso está a ≤ 2 partidos y quedan ≤ 8 jornadas
    w_cobertura = 0,5 si el grupo tiene < 60 % de actas; 1 en otro caso

Un partido muy desigual (|d| > 400) queda en w_igualdad ≈ 1,0: no se le quita peso, sólo no se le da
de más. Con el recorte y la normalización, el tamaño efectivo de muestra (Σw)²/Σw² no debe bajar del
70 % del real; si baja, los exponentes son demasiado agresivos. Control obligatorio: la frecuencia
ponderada de 1-X-2 no puede desviarse más de 0,5 puntos de la real, o el modelo aprende otra liga.

## 5. Registro de aciertos

`analytics.prediccion_emitida` y `prediccion_resultado` (0064) ya congelan la predicción. Falta guardar,
por partido emitido:

- versión del modelo, huella de la lista de variables y fecha de corte de los datos;
- las tres probabilidades **antes y después** de calibrar, y las de Elo y Poisson (para atribuir un
  fallo a un miembro del apilado);
- λ_local, λ_visitante y la matriz conciliada;
- categoría, división, jornada, días desde el último dato del grupo (frescura) y cuántas variables
  llegaron como `NaN`;
- cuándo se emitió respecto al partido (horas de antelación).

**Qué vigilar cada semana** (una fila por jornada en `analytics.prediccion_semana`):

| Métrica | Umbral de aviso |
|---|---|
| Log-loss de la semana frente a la media móvil de 8 semanas | sube > 0,03 dos semanas seguidas |
| ECE por clase (10 tramos) | > 4 % en cualquiera de las tres |
| Pendiente de calibración (regresión de aciertos sobre probabilidad) | fuera de 0,9-1,1 |
| Frecuencia real de 1-X-2 frente a la prevista | diferencia > 3 puntos |
| PSI de cada variable frente al entrenamiento | > 0,2 |
| Partidos emitidos con > 30 % de variables `NaN` | > 15 % de la jornada |
| Log-loss por categoría (aficionados, juvenil, base, sala) | una categoría > 0,05 peor que su media |

**La métrica principal es el log-loss semanal frente a la línea base de frecuencias de esa misma
semana** (la «habilidad» = 1 − LL_modelo/LL_base). El acierto bruto engaña: sube solo en semanas con
muchos favoritos claros.

## 6. Los tres experimentos primero

| # | Experimento | Coste | Criterio de aceptación |
|---|---|---|---|
| 1 | **Limpieza**: una sola lista de variables, `lh/la` fuera de pliegue, entrenador del partido anterior, `NaN` en lo desconocido, parada temporal, cascada de 5 pliegues | 1-2 días | El log-loss puede **subir** (se quita fuga): se acepta el número que salga como nueva referencia. Condición: las listas de `eval` y `04-modelo` son idénticas y hay prueba que lo comprueba |
| 2 | **Calibración + apilado** con Elo y Poisson, y conciliación de la matriz | 1 día | Log-loss medio de los pliegues 4-5 baja ≥ 0,003 y no empeora en ninguno; ECE < 2 % en las tres clases; |Σ región − p| < 0,1 |
| 3 | **Paquete de variables de equipo**: forma con decaimiento (3.1), arriba/abajo (3.2), ausencias (3.3), continuidad y cohesión (3.6), entrenador (3.8) | 3-4 días | Baja ≥ 0,005 en la media de los cinco pliegues y mejora en al menos cuatro; cada variable nueva con importancia por permutación > 0 en ≥ 3 pliegues, o se retira |

Árbitro (3.4), campo (3.5) y rival (3.7) van después: dependen de datos con menos cobertura y su
efecto esperado es menor. Si tras el experimento 3 el total queda en torno a 0,920-0,925, es un buen
resultado para este nivel; por debajo de 0,91 habría que sospechar de una fuga antes de celebrarlo.

## 7. Clasificación final

Corregido hoy: `03-simulacion.mjs` simulaba sólo los partidos pendientes con fila en el calendario
(tres aplazados en un grupo con 24 jornadas por jugar) y por eso daba 100 % al puesto actual de cada
equipo. Ahora deduce el calendario que falta en ligas a una o dos vueltas. Siguiente paso, cuando
exista el apilado: simular con sus probabilidades en vez de con el Poisson solo, y añadir el orden de
desempates real del reglamento (`dominio-futbol`), que hoy es puntos / diferencia / goles a favor.
