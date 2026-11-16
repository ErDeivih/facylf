Leídos ambos documentos. **Los rangos siguientes son propuestas para validar; no hay resultados medidos todavía.** El plan prevé minutos y cambios, pero exige auditar su cobertura antes de utilizarlos.

**A) `sample_weight`**

Para respetar el corte temporal incluso en los pesos, propongo:

\[
u_i=\delta^{S_*-S_i}\;R_i\;
\operatorname{clip}\left[(1+\alpha C_i+\beta D_i)(1-\gamma B_i),\,0.5,\,2\right]
\qquad
w_i=\frac{u_i}{\operatorname{media}_{train}(u)}
\]

Una fila por partido, con estos componentes:

| Componente | Cálculo |
|---|---|
| Antigüedad | \(S_*\): última temporada de entrenamiento; \(\delta\in\{0.75,0.80,0.85,1\}\). |
| Igualdad \(C_i\) | \(1-\frac{|p_1-p_2|}{p_1+p_2}\). Probabilidades de un baseline Poisson/Elo reconstruido **antes de ese partido**. Cercano a 1 cuando ambos equipos tienen opciones similares. |
| Riesgo de goleada \(B_i\) | Probabilidad Poisson, previa al partido, de que el favorito gane por **≥4 goles**. Usa únicamente marcadores anteriores, rival y localía. |
| Trascendencia \(D_i\) | \(r_i\max_{e,b}\exp(-|P_e-P_b|/s)\): \(r_i\) es la fracción de calendario transcurrida; \(P_b\), puntos de la frontera actual de ascenso/playoff/permanencia; \(s\in\{3,6,9\}\). Considerar solo objetivos matemáticamente abiertos y reglas conocidas. |
| Fiabilidad \(R_i\) | \(r_0+(1-r_0)c_i\), con \(r_0\in\{0.75,0.9,1\}\) y \(c_i\) cobertura histórica de los datos utilizados, disponible antes del partido. |

**Inicio razonable:** \(\alpha=0.25,\;\beta=0.5,\;\gamma=0.5\). Explorar \(\alpha\in[0,0.5]\), \(\beta\in[0,0.75]\), \(\gamma\in[0,0.7]\), incluyendo siempre cero para poder eliminar cada efecto.

Precisiones:

- \(D_i\) es una **aproximación a trascendencia**, no una probabilidad de ascenso. Sin reglas/fronteras fiables, desactivar ese componente y registrar el motivo.
- Cobertura desconocida se estima con un prior del entrenamiento y un indicador de ausencia; **no se convierte en cero**. No penalizar por faltar campos que el modelo no utiliza.
- El decaimiento corto del plan —0.85–0.92 por partido— lo aplicaría a las **features de forma**. No castigaría además las primeras jornadas de todas las temporadas por su número de jornada.

**Goleada prevista frente a goleada real.** La fórmula anterior reduce el peso de enfrentamientos propensos a goleadas, también si finalmente terminan ajustados. Si se quiere penalizar exclusivamente goleadas históricas reales, probar aparte:

\[
B_i^{real}=
\mathbf1(\text{favorito previo gana por ≥4})
\operatorname{clip}\left(\frac{q_i-0.5}{0.4},0,1\right),
\quad
q_i=\frac{|p_1-p_2|}{p_1+p_2}
\]

Usar el resultado **solo para ponderar filas de entrenamiento** no constituye por sí mismo fuga hacia las features, pero introduce selección dependiente del resultado y puede empeorar la calibración. No sería mi primera opción para predecir 1-X-2; la mantendría como experimento separado.

**Cómo demostrar que mejora:**

1. Cascada histórica: entrenar hasta T−2, seleccionar parámetros en T−1 y evaluar una sola vez en T; repetir con varias T. La temporada actual permanece como test en vivo. Las particiones aleatorias no respetan esta dependencia temporal. [Documentación de validación temporal](https://scikit-learn.org/stable/modules/cross_validation.html#cross-validation-of-time-series-data).
2. Comparar: modelo sin ponderación; solo antigüedad; después igualdad, trascendencia, goleadas y fiabilidad por separado; finalmente combinación.
3. Métrica principal: **log-loss sin estos pesos**, sobre exactamente los mismos partidos:
   \[
   LL=-\frac1N\sum_i\log p_i(y_i)
   \]
   Evaluar también Brier, calibración y segmentos: igualados, decisivos, desequilibrados y categorías. La API permite calcular log-loss sin `sample_weight`. [Definición de log-loss](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.log_loss.html).
4. Criterio propuesto, fijado antes de mirar resultados: reducción relativa de LL **≥0.5 %**, mejora en al menos **2 de 3 temporadas**, e intervalo del 95 % de la diferencia pareada que excluya cero. Estimarlo mediante bootstrap por bloques de jornadas dentro de competición y temporada. Sin deterioro material de calibración ni de categorías relevantes.
5. Si solo mejora la métrica ponderada, **descartar los pesos**.

**B) Grafo jugador–compañeros–entrenador**

Empezaría con **aristas dispersas y agregados**, como plantea el documento, sin embeddings.

Para jugadores \(p,q\):

\[
W_{pq}(t)=\sum_{m:\,fin_m<t}d(t,m)\,
\left|I_{p,m}\cap I_{q,m}\right|
\]

\(I_{p,m}\) contiene sus intervalos reales en campo; \(d(t,m)\) aplica decaimiento temporal. Para jugador–entrenador:

\[
W_{pc}(t)=\sum_{m:\,fin_m<t}d(t,m)\,
minutos_{p,m}\,\mathbf1(c\text{ dirigía su equipo})
\]

Guardar también \(W_{pqc}\): minutos juntos de esa pareja **bajo ese entrenador**.

**No usar `min(minutos_p,minutos_q)` como minutos juntos:** dos jugadores pueden disputar 45 minutos cada uno sin coincidir. Sin cambios/intervalos fiables, utilizar coapariciones como feature distinta, con cobertura explícita.

Features iniciales por equipo, agregadas sobre jugadores disponibles/probables:

| Feature | Cálculo |
|---|---|
| Familiaridad del bloque | Media ponderada de \(W_{pq}/(W_{pq}+\kappa)\), con \(\kappa\in\{300,600,900\}\) minutos. |
| Parejas consolidadas | Proporción ponderada de parejas con ≥450 minutos juntos; probar 300/450/900. |
| Familiaridad con entrenador | Media ponderada de \(W_{pc}/(W_{pc}+\kappa)\). |
| Bloque bajo entrenador actual | Agregado equivalente usando \(W_{pqc}\). |
| Continuidad esperada | Fracción esperada del once que repite respecto al último partido. |

Los pesos de agregación proceden de probabilidades de participación calculadas previamente; para parejas, idealmente probabilidad conjunta de coincidir. Obtener valores local, visitante y su diferencia. Añadir cobertura y soporte observado.

**Cálculo `as-of`:**

- Solo partidos terminados y datos conocidos antes de emitir la predicción; actualizar el grafo después del partido.
- Nunca usar la alineación, minutos o entrenador del acta futura. Si la alineación oficial aún no estaba publicada, utilizar la estimación disponible entonces.
- Identidades verificadas con federación y contexto; conservar historial de otros equipos únicamente cuando la identidad esté resuelta.
- Distinguir ausencia conocida de experiencia compartida de historial incompleto. Para este último, prior aprendido en entrenamiento e indicador de incertidumbre.
- Desconocido el entrenador actual, no inferirlo del acta posterior.

**Permutación y decisión:**

- Comparar contra el modelo que ya contiene calidad individual, Elo, forma, categoría y antigüedad del entrenador.
- En validación futura, modelo congelado, calcular:
  \[
  PI_G=LL(\text{bloque grafo permutado})-LL(\text{original})
  \]
- Repetir **30–50 veces**, permutando conjuntamente las variables relacionadas y conservando coherencia entre local, visitante y diferencias. Restringir intercambios a competición, temporada, periodos próximos y bandas comparables de fuerza/cobertura.
- Medir primero todo el bloque y después subbloques. La permutación individual puede ocultar utilidad cuando las variables están correlacionadas. [Documentación de importancia por permutación](https://scikit-learn.org/stable/modules/permutation_importance.html).
- **Entrar:** importancia positiva estable y mejora al reentrenar con el bloque según el criterio anterior de LL. La ablación —quitar el bloque y reentrenar— confirma aportación incremental.
- **Descartar:** mejora solo en entrenamiento, desaparece al controlar calidad/continuidad, depende de una temporada o carece de cobertura suficiente. Importancia positiva por sí sola no demuestra sinergia causal.

No he editado archivos.