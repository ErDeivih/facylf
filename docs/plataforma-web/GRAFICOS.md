# Gráficos de facylf — qué gráfico para cada análisis y con qué colores

> Claude, 22/10/2026. Complementa `SISTEMA-DISENO.md` §7-8 (que pide usar una skill de visualización si la hay:
> se usó, y los colores de abajo están **validados con su script**, no elegidos a ojo). Prototipo: tablero
> «20 · Gráficos» del diseño.

## 1. Colores

### Series (identidad: «este es el equipo A, este el B»)
Verde, rojo y ámbar **no** son colores de serie en facylf: significan victoria, derrota y tarjeta/aviso.
Por eso la paleta de series sale del acento azul-verde del producto y de tres tonos que no chocan con ellos.

| Orden | Claro | Oscuro | Uso típico |
|---|---|---|---|
| 1 | `#1386b0` | `#1f8fbd` | el equipo/jugador principal; «equipo de ficha» |
| 2 | `#eb6834` | `#d95926` | segundo; «equipo superior» (B que sube al A) |
| 3 | `#6250d6` | `#8072e0` | tercero; «categoría inferior» |
| 4 | `#d55181` | `#d55181` | cuarto; «otro club» |

Validación (`dataviz/scripts/validate_palette.js`, 22/10/2026), sobre las superficies reales (`#ffffff` /
`#161d24`): claro y oscuro **pasan las seis comprobaciones** en pares adyacentes (peor ΔE con daltonismo 16,2
claro / 14,9 oscuro; objetivo ≥ 8). Pares todos-con-todos (dispersión): claro pasa con 3 series; **oscuro no**
(azul↔violeta 13,4 < 15). Regla: en dispersión, **resaltado** (un punto en color 1, el resto gris) o como mucho
2 series. Nunca más de 4 series de color: el resto, «Otros» o gráficos pequeños.

Los colores van **siempre en el mismo orden y siguen a la entidad**: si se filtra un equipo, los demás no
cambian de color.

### Magnitud (una sola escala, claro → oscuro)
Azul del orden 1: `#cde2fb → #86b6ef → #3987e5 → #1c5cab → #0d366b` (mapas de calor de goles por tramo,
mapa de minutos por jornada). Para marcas ordenadas sobre fondo claro, no más claro que `#86b6ef`.

### Por encima / por debajo (divergente)
Azul `#1386b0` ↔ naranja `#eb6834`, punto medio **gris** (`#e8ebee` / `#2c343c`). No verde/rojo (reservados).
Uso: diferencia de goles, minutos frente a lo esperado, «por encima de su edad».

### Significado (fijos, con letra o icono SIEMPRE)
Victoria `G` verde `#1e7a47`, empate `E` gris `#66717d`, derrota `P` rojo `#c8463b` (23/10: verde y gris oscurecidos
para que la letra blanca pase 4,5:1 en cuadros de 10-11 px; antes `#2f9e5e` 3,4:1 y `#8a96a3` 3,0:1), amarilla (rectángulo amarillo
`#e9b949`), roja (rectángulo rojo). Nunca sólo el color: la letra o la forma dicen lo mismo en blanco y negro.

## 2. Qué gráfico para cada análisis

| Pantalla | Pregunta | Forma | Consulta |
|---|---|---|---|
| Jugador | ¿Dónde jugó sus minutos? | **barra apilada horizontal** por temporada: ficha / superior / inferior / otro club (series 1-4), con 2 px de hueco entre tramos y etiqueta directa | `minutos-por-equipo` |
| Jugador | ¿Cuánto juega frente a lo posible? | **medidor** (% de minutos) con la media del puesto como marca | `minutos-por-equipo` |
| Jugador (ojeo) | ¿En qué destaca frente a su quinta? | **barras horizontales de percentil** 0-100 (una por métrica, un solo color, marca en 50) — **nunca radar** | `ojeo-jugadores` |
| Equipo | ¿Cómo va la temporada? | **línea** de puntos acumulados por jornada, el equipo en color 1 y el resto del grupo en gris (resaltado); bandas de zona de ascenso/descenso detrás | `curva-del-equipo`, `zonas-del-grupo` |
| Equipo | ¿Está en forma? | **tira de forma**: 5-10 cuadros G/E/P con letra; racha actual como cifra grande | `forma-del-equipo` |
| Equipo | ¿Cuándo marca y encaja? | **columnas divergentes** por tramo de 15': a favor hacia arriba (azul), en contra hacia abajo (naranja); «sin minuto» aparte, nunca repartido | `goles-por-tramo` |
| Equipo | ¿Depende de un goleador? | **barras + línea acumulada** (Pareto) de goles por jugador; el % de los 2 primeros como titular | `reparto-de-goles` |
| Equipo | Casa / fuera | **dos filas de barras apiladas G/E/P** (con letras), no tarta | `forma-del-equipo` |
| Competición | ¿Quién llega mejor? | **tabla con tira de forma** por equipo, ordenable (es comparación de filas: denso) | `rachas-del-grupo` |
| Competición | ¿Cuánto usa cada club su cantera? | **barras horizontales** ordenadas, un color | `uso-de-cantera` |
| Ligas | ¿Qué liga es más goleadora/dura? | **puntos con intervalo** (dot plot) por liga, una sola escala | `comparacion-de-ligas` |
| Árbitro | ¿Es más tarjetero que la media? | **barra divergente** frente a la media de su categoría | `arbitros` |
| Federación | ¿Qué datos publica? | **medidores** de % (resultado, alineación, cambios, tarjetas, minuto de gol) | `ficha-federacion` |
| Admin | ¿Va bien la plataforma? | **cifras grandes** con tendencia pequeña (stat tiles) y línea de p95 por hora | `admin-panel-resumen`, `ops.consulta_minuto` |

## 3. Reglas de dibujo (para todos)

- Un solo eje Y por gráfico. Dos medidas de escala distinta = dos gráficos.
- Barras finas con 4 px de redondeo en el extremo de datos, ancladas en la base; líneas de 2 px; puntos ≥ 8 px.
- Rejilla y ejes discretos (gris claro); los textos van en tinta, nunca del color de la serie.
- Con 2 o más series, leyenda siempre; con hasta 4, además etiqueta directa al final de cada serie.
- Al pasar el ratón (o tocar en móvil): en líneas, guía vertical con todos los valores de esa jornada; en
  barras, el valor de esa barra. Zona sensible mayor que la marca (44 px en móvil).
- Cada gráfico tiene su **tabla equivalente** (`<details>Ver como tabla</details>`) y un título que es la
  respuesta («Marca casi todo en la segunda parte»), no el nombre de la medida.
- **Cobertura en el propio gráfico**: si la competición no apunta minutos de gol o faltan actas, el gráfico lo
  dice dentro (aviso de `avisos-de-datos`) y no dibuja ceros donde no hay datos.
- Modo oscuro con sus propios tonos (tabla de arriba), no invertido. Sin animaciones con `prefers-reduced-motion`.
- Librería: la que ya use la web (si no hay, SVG propio para tiras, medidores y barras; una librería ligera sólo
  para líneas con interacción), cargada con `dynamic` sólo en las páginas que la usan.

## 4. Tokens (añadir a `apps/web/src/app/tokens.css`)

```css
:root {
  --serie-1: #1386b0; --serie-2: #eb6834; --serie-3: #6250d6; --serie-4: #d55181;
  --serie-gris: #b7c0c9;                       /* «el resto» en los resaltados */
  --div-pos: #1386b0; --div-neg: #eb6834; --div-medio: #e8ebee;
  --res-ganado: #1e7a47; --res-empate: #66717d; --res-perdido: #c8463b; --tarjeta-amarilla: #e9b949;
}
:root[data-theme="dark"], :root:not([data-theme="light"]) { /* dentro de @media (prefers-color-scheme: dark) */
  --serie-1: #1f8fbd; --serie-2: #d95926; --serie-3: #8072e0; --serie-4: #d55181;
  --serie-gris: #4a5561; --div-pos: #1f8fbd; --div-neg: #d95926; --div-medio: #2c343c;
}
```
