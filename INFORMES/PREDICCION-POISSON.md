# Predicción de marcadores por Poisson

**Qué es.** Un modelo sencillo y auditable que, con los partidos que ya están en el canónico, estima la
probabilidad de cada marcador de un partido (0-0 a 5-5), los porcentajes **1-X-2** y el marcador más
probable. No es una apuesta ni un dato de la federación: es un **dato derivado** que la web enseña como
expectativa, con su método a la vista.

**Fecha.** 16/11/2026. Paso 1 del encargo de predicción. Los pasos 2 y 3 (parámetros y matrices) se
calculan con los scripts `scripts/prediccion/01-parametros.mjs` y `scripts/prediccion/02-predicciones.mjs`.

---

## 1 · De dónde salen los datos (fuentes)

Todo sale del PostgreSQL canónico del PC (`facylf`, esquema `core`), no de una fuente externa ni de una
tabla escrita a mano:

| Pieza | Tabla / columna | Qué aporta |
|---|---|---|
| Partido y marcador | `core.match.goles_local`, `core.match.goles_visitante` | Los goles reales. Un partido sin marcador **no cuenta** (desconocido ≠ 0). |
| Liga del partido | `core.match.phase_group_id` → `core.phase_group.competition_edition_id` → `core.competition_edition` | La edición (federación + temporada + competición) es la unidad de «liga». |
| Equipo | `core.match.home_team_entry_id` / `away_team_entry_id` → `core.team_entry.team_season_id` → `core.team_season.club_id` | La inscripción identifica al equipo en esa liga; el club permite enlazar la misma entidad entre temporadas. |
| Temporada | `core.season.etiqueta` | Ventana del cálculo (2025-26 y 2026-27). |
| Federación | `core.federation.codigo` | Sólo para nombrar y agrupar en los informes. |

Medida el 16/11/2026 con `select count(*), count(goles_local) from core.match`:
**2.593.653 partidos**, de ellos **2.201.804 con marcador**. La temporada en curso (2026-27) tiene
**290.186 partidos** y **58.355 con resultado**; la anterior (2025-26), **488.423** y **462.885**.

No se usan cuotas de casas de apuestas, ni rankings, ni datos de terceros. Si un partido no tiene
marcador, no entra en la estimación; si un equipo no tiene partidos, su fuerza es la media (1,00), no cero.

## 2 · El modelo, en una frase

Cada equipo tiene una **fuerza de ataque** y una **fuerza de defensa** relativas a la media de su liga; la
liga tiene una **media de goles** y una **ventaja de jugar en casa**. Los goles de cada lado se modelan como
dos Poisson independientes con esas medias.

### 2.1 Parámetros de la liga (edición de competición)

Para una edición *e* con partidos con marcador:

```
media_local(e)     = Σ goles_local     / n(e)
media_visitante(e) = Σ goles_visitante / n(e)
media_total(e)     = media_local(e) + media_visitante(e)
ventaja_casa(e)    = media_local(e) / media_visitante(e)
```

`ventaja_casa = 1,00` significa que el local no marca más que el visitante; `1,15`, que marca un 15 % más.
La media por **equipo** y partido (la que se usa para las fuerzas) es `media_equipo(e) = media_total(e)/2`.

Las ediciones con pocos partidos se estabilizan con la media de su federación y temporada, con `k_liga = 20`
partidos equivalentes:

```
media_local(e)     = (Σ goles_local     + k_liga · media_local_fed)     / (n(e) + k_liga)
media_visitante(e) = (Σ goles_visitante + k_liga · media_visitante_fed) / (n(e) + k_liga)
```

### 2.2 Fuerza de ataque y defensa por equipo

Para un equipo *i* de la edición *e*, con `n_i` partidos, `GF_i` goles a favor y `GC_i` en contra:

```
ataque(i)  = (GF_i + k · media_equipo(e)) / ((n_i + k) · media_equipo(e))
defensa(i) = (GC_i + k · media_equipo(e)) / ((n_i + k) · media_equipo(e))
```

- `ataque = 1,00` es un equipo que marca lo que la media de su liga; `1,30`, un 30 % más.
- `defensa = 1,00` es un equipo que encaja lo que la media; **más alto = peor defensa**.
- `k = 6` partidos equivalentes de encogido: con un solo partido, el dato no dispara la fuerza; con 30,
  pesa casi entero. Es la misma idea que un prior bayesiano débil y evita publicar 5,00 por un 5-0 aislado.
- Sin partidos: `ataque = defensa = 1,00` exactamente (la media), nunca 0.

Cuando el equipo tiene datos de la **temporada anterior** del mismo club, se mezclan con peso `0,5` por
partido (la temporada pasada informa, pero la actual manda):

```
ataque(i) = (GF_act + 0,5·GF_ant + k·media_equipo) / ((n_act + 0,5·n_ant + k)·media_equipo)
```

### 2.3 Goles esperados del partido

Para el partido entre local *h* y visitante *a* en la edición *e*:

```
λ_local     = media_local(e)     · ataque(h)  · defensa(a)
λ_visitante = media_visitante(e) · ataque(a)  · defensa(h)
```

Así la ventaja de casa entra por `media_local`/`media_visitante` y no se duplica en las fuerzas.

### 2.4 Matriz de marcadores (0-0 a 5-5)

Con dos Poisson independientes:

```
P(local = i, visitante = j) = e^(-λ_local) · λ_local^i / i!  ·  e^(-λ_visitante) · λ_visitante^j / j!
```

para `i, j ∈ {0,1,2,3,4,5}`: **36 celdas**, de 0-0 a 5-5. La probabilidad de un marcador con más de 5
goles en un lado queda fuera de la rejilla (con λ ≈ 1,4 es ≈ 0,02 % por lado); para que los porcentajes
sumen 100 se **normaliza sobre las 36 celdas** (la cola se reparte proporcionalmente). La matriz se guarda
sin redondear en `analytics.poisson_partido.matriz` y los porcentajes se publican con dos decimales.

### 2.5 De la matriz a 1-X-2 y al marcador más probable

```
P(1) = Σ P(i,j) con i > j
P(X) = Σ P(i,j) con i = j
P(2) = Σ P(i,j) con i < j
marcador_probable = argmax P(i,j)
```

Los tres porcentajes se publican redondeados a dos decimales y se ajusta el residuo en el mayor para que
sumen 100,00. El marcador más probable es el `i-j` de mayor probabilidad; si hay empate, gana el de más
goles totales (y luego el local), que es una regla explícita, no un desempate oculto.

## 3 · Ventana y alcance

- **Ventana de estimación:** temporada en curso (2026-27) + temporada anterior (2025-26), esta última con
  peso 0,5 por partido. Los partidos de 2026-27 sin marcador no cuentan.
- **Alcance de publicación:** los **290.186 partidos de 2026-27** (jugados y pendientes). Para un partido
  ya jugado la predicción es la expectativa *previa* del modelo, no una explicación del resultado; la ficha
  lo dice.
- **Ligas sin datos suficientes:** si una edición no tiene ningún partido con marcador ni media de su
  federación, no se publica predicción (se enseña «sin datos suficientes»), no un 33/33/33 inventado.

## 4 · Lo que el modelo NO hace (límites dichos)

- **No usa Dixon-Coles ni corrección de marcadores bajos.** Dos Poisson independientes sobreestiman algo
  los empates 0-0 y 1-1 y no capturan la correlación entre los goles de ambos equipos. Es una aproximación
  conocida y suficiente para una expectativa; no se presenta como probabilidad calibrada.
- **No conoce lesiones, sanciones, viajes, árbitro ni motivación.** Sólo goles y liga.
- **No ajusta por calidad del rival más allá de la liga.** Un equipo que sube de categoría arrastra su
  fuerza de la temporada anterior con peso 0,5; si el salto es grande, el modelo tarda en corregirlo.
- **No es una apuesta.** No hay cuotas ni dinero; es información para el aficionado.
- **No sustituye al marcador real.** Cuando el partido termina, manda el acta; la predicción se queda como
  expectativa previa y así se etiqueta en la ficha.

## 5 · Reproducirlo

```bash
# 1) migración (sólo añade tablas derivadas en analytics; no toca core)
node scripts/migrar-canonico.mjs

# 2) parámetros por liga y por equipo, y predicciones de la temporada en curso
node scripts/prediccion/01-parametros.mjs --temporada 2026-27
node scripts/prediccion/02-predicciones.mjs --temporada 2026-27

# 3) comprobación: cuántas filas y qué porcentajes medios salen
node scripts/prediccion/03-informe.mjs --temporada 2026-27
```

Las tablas son `analytics.poisson_liga`, `analytics.poisson_equipo` y `analytics.poisson_partido`
(migración `0061-prediccion-poisson.sql`). Son derivadas y reversibles: se pueden borrar y recalcular sin
tocar ningún dato canónico.

## 6 · Pruebas

`node --test scripts/lib/poisson.test.mjs` comprueba que la Poisson suma 1, que la matriz tiene 36 celdas,
que 1-X-2 suma 100, que local y visitante son simétricos sin ventaja de casa, que un equipo sin partidos
vale 1,00 (no 0) y que el encogido se comporta con pocos y con muchos partidos. La pantalla tiene su
prueba en `apps/web/test/` (los tres porcentajes y la línea de explicación).
