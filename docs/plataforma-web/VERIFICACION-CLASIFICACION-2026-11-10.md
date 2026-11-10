# Verificación de la clasificación · 10/11/2026, 23:15

Comprobación pedida para el caso BI: **la tabla que publica la web se recalcula desde los partidos y cuadra con
ellos**, en las tres competiciones principales de la demo y el portfolio.

## Método

1. Se recalcula la tabla desde `core.match` para cada grupo: partidos jugados (PJ), victorias-empatadas-derrotas
   (V-E-D), goles a favor y en contra y puntos (3 por victoria, 1 por empate, 0 por derrota).
2. Se compara **equipo a equipo** con la tabla que enseña la web (página de la competición, DOM renderizado).
3. Se comprueba además el cuadre agregado, que es lo que detecta un error de fondo: **Σ PJ = 2 × partidos con
   resultado** y **Σ goles a favor = Σ goles en contra**.

## Resultado

| Grupo | Competición | Partidos | Con resultado | Equipos | Σ PJ | Σ Pts | Σ GF | Σ GC | ¿Cuadra? |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 44 | Tercera Federación | 90 | 89 | 18 | **178 = 2×89** | 242 | 218 | 218 | **SÍ** |
| 2939 | 1ª Div. Provincial Juveniles · Primera-Salamanca | 49 | 48 | 14 | **96 = 2×48** | 137 | 233 | 233 | **SÍ** |
| 3947 | 1ª Div. Provincial Juveniles · Primera-Valladolid | 49 | 49 | 14 | **98 = 2×49** | 140 | 239 | 239 | **SÍ** |

En los tres casos, cada equipo de la web tiene exactamente los PJ, V-E-D, goles y puntos calculados (0 equipos con
diferencias). Se verificó también la página **publicada** de la demo: las tres responden 200, con la tabla completa,
la línea de frescura y el aviso de tabla oficial desfasada.

## Por qué antes no cuadraba

La web publicaba la **última tabla OFICIAL guardada**, que en CyL se publica a saltos. En el grupo 2939 la oficial era
la de la **jornada 1** (PJ = 1 para todos) mientras la misma página enseñaba ya un Villamayor 10-0 Alba de la
**jornada 7**; en el 44, la oficial era de la jornada 3 y los resultados iban por la 10. Ahora se publica la tabla
calculada y, si la oficial no coincide, se avisa en la propia línea («clasificación calculada con los resultados; la
tabla oficial publicada está desfasada»).

## Cómo repetirlo

Las consultas están en `tmp/calc-tres-equipos.sql` y `tmp/verifica-clasificaciones.sql` (solo lectura), y la
comprobación de la foto en `tmp/verifica-tres-definitivo.mjs`. No modifican nada.

## Ficha de equipo

En la **demo estática** no se publican fichas de equipo: los nombres de equipo son texto (0 enlaces a
`/explorar/equipo/…` en las tres páginas verificadas), y desde la competición se navega por **jornadas y
clasificación**. En la **app real** las fichas existen y responden 200, así que allí el enlace se mantiene.
