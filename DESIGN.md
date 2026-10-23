---
name: facylf
description: Contrato visual de una pantalla de la plataforma privada de fútbol federado
version: 1
updated: 2026-09-23
tokens: apps/web/src/app/tokens.css
spec: docs/plataforma-web/SISTEMA-DISENO.md
ux: docs/plataforma-web/PRODUCTO-UX.md
copy: docs/plataforma-web/CONTENIDO-MICROCOPIA.md
frontend: docs/plataforma-web/FRONTEND.md
a11y: docs/plataforma-web/CALIDAD-PRUEBAS.md
themes: [claro, oscuro]
densities: [comoda, compacta]
breakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280}
wcag: "2.2 AA"
---

# Contrato visual

Esto no sustituye a la especificación: es lo mínimo que hay que cumplir antes de escribir una vista,
en una página que cualquier persona o agente puede leer entera. Los **valores** viven en
`apps/web/src/app/tokens.css`, que es la fuente única de verdad; la **especificación completa**, en
`SISTEMA-DISENO.md`. Si algo de aquí contradice al fichero de tokens, manda el fichero.

## Qué es este producto

Una herramienta **privada** de consulta y scouting sobre fútbol federado. No es un escaparate de
métricas ni un chat. Responde preguntas de fútbol sobre datos que **casi nunca están completos**, y
la mitad del trabajo de interfaz consiste en decir con precisión qué falta y por qué.

Las cinco cosas que definen una pantalla:

1. **Aire o denso, nunca al azar.** Si el usuario va a comparar filas, denso; si va a orientarse,
   aire. Ninguna pantalla es sólo una cosa, y las dos no se mezclan dentro del mismo bloque.
2. **Cada cifra lleva su procedencia y su cobertura.** Un número sin denominador ni etiqueta de
   cobertura no se muestra.
3. **El estado vive en la URL.** Federación, temporada, facetas, orden, cursor y pestaña.
4. **Se diseña primero vacío**, después parcial, y sólo al final completo.
5. **Marca neutra.** El color de un club no es el color del producto: va en su escudo y en su franja
   de identidad, nunca en el cromo global.

## Color

Prohibido el color literal en un componente: si un valor no tiene token, **se crea el token**. Los
componentes usan **roles semánticos**, no la escala cruda.

| Rol | Para qué |
|---|---|
| `--fondo`, `--fondo-elevado`, `--fondo-sutil` | superficies, de menos a más elevada |
| `--borde`, `--borde-fuerte` | separación; la jerarquía se hace con borde, no con sombra |
| `--texto`, `--texto-suave`, `--texto-tenue` | tres niveles, y no hay un cuarto |
| `--accion`, `--accion-suave` | **sólo** acciones y enlaces; nunca "bueno" |
| `--foco` | anillo de foco, único para todo lo interactivo |
| `--victoria`, `--empate`, `--derrota`, `--amarilla`, `--roja` | resultado y disciplina |
| `--cobertura-completa`, `--cobertura-parcial`, `--cobertura-nula`, `--revision` | calidad del dato |
| `--texto-inverso` | texto sobre superficie fuerte |
| `--calor-0` … `--calor-3` | intensidad en mapas de calor; derivada del rojo semántico |

Reglas duras:

- **Nunca sólo color.** Victoria, derrota, tarjeta y cobertura llevan letra, texto o forma. Un
  daltónico y una impresión en blanco y negro dan la misma lectura.
- Contraste ≥ 4.5:1 en texto y ≥ 3:1 en bordes de control y elementos gráficos informativos, en los
  **dos** temas.
- El rojo es derrota y tarjeta roja. Un error del sistema usa `--revision` o un patrón de borde, para
  no confundir "has perdido 0-3" con "algo ha fallado".
- Un token nunca se define **sólo** dentro de `[data-tema="oscuro"]` o de una media query: siempre
  existe en `:root`.

## Tipografía

Una sola familia variable, con `next/font` y `display: swap`. Nunca una hoja externa de Google Fonts.

| Uso | Tamaño | Peso | Interlineado |
|---|---|---|---|
| Título de página | 1.5 rem / 1.75 rem en ≥md | 600 | 1.2 |
| Título de bloque | 1.05 rem | 600 | 1.3 |
| Texto | 0.9375 rem | 400 | 1.55 |
| Texto en tabla densa | 0.8125 rem | 400 | 1.35 |
| Etiqueta / encabezado de columna | 0.6875 rem, versalita, `tracking .06em` | 600 | 1.2 |
| Dato destacado | 1.75–2.25 rem | 600, `tabular-nums` | 1.1 |

- **Todo número que se compara en vertical lleva `tabular-nums`.** Sin eso una columna de goles no
  se lee.
- Nada por debajo de 0.75 rem salvo etiquetas en versalita, y nunca para un dato.
- Los nombres propios se muestran con el literal original de la fuente. La versión sin tildes es
  clave de búsqueda, no texto visible.
- No se recorta un nombre en una tabla sin dejarlo accesible.

## Composición

Escala base 4 px. Contenedor máximo 1280 px. Rejilla de 12 columnas: contenido principal 8, contexto
4, colapsando a una columna por debajo de `lg` con el contexto **después** del contenido.

La cabecera de ficha va a ancho completo. Una sola dueña del ancho máximo (`Cascara`).

## Elevación y capas

El producto es **plano por defecto**. La sombra existe sólo para lo que flota de verdad sobre el
contenido y puede taparlo; nunca para "destacar" una tarjeta en flujo, ni una tarjeta con sombra
dentro de otra. En oscuro la sombra no informa: los niveles se distinguen además con `--borde-fuerte`.

| Nivel | Uso |
|---|---|
| 0 | todo el contenido en flujo: borde y fondo, sin sombra |
| 1 (`--sombra-1`) | panel flotante anclado: sugerencias del buscador, menú |
| 2 (`--sombra-2`) | modal y hoja lateral |

Capas, sin números sueltos por el código: contenido 0, pegajoso 10, flotante 30, velo 40, modal 50,
aviso 60.

## Foco, formas e iconos

- Anillo único: `outline: 2px solid var(--foco)` con `outline-offset: 2px`. **Nunca** `outline: none`
  sin una alternativa visible en el mismo selector, y el anillo no se recorta dentro de un
  contenedor con `overflow: hidden`.
- Radios: `--radius-sm` 4 px para controles, `--radius-md` 6 px para superficies, `--radius-lg` 10 px
  para paneles flotantes. Nada completamente redondeado.
- Una sola familia de iconos, de trazo, en `currentColor`: 16 px junto a texto de tabla, 20 px en
  navegación y acciones. El icono **nunca** es la única señal de nada; si lleva significado propio,
  tiene nombre accesible; si es decorativo, `aria-hidden="true"`.
- Sin emoji en la interfaz.

## Movimiento

Transiciones de 120–180 ms sólo en color, opacidad y transformación. Nunca se anima la altura ni la
posición de contenido ya visible, y todo se reduce a cero bajo `prefers-reduced-motion: reduce`.

## Qué no se hace aquí

- **No hay interfaz conversacional ni «generative UI».** Ningún modelo está en el camino de la
  petición: los presupuestos de rendimiento son aserciones que fallan el build (sugerencias 200 ms
  p95, competición 800 ms) y una respuesta generada no tiene procedencia ni fecha.
- **No se copia el sistema visual de otro producto.** Se puede mirar cómo resuelve otro una tabla
  densa o un estado vacío, nunca importar paletas, tipografías ni densidad ajenas.
- **No se colapsa una tabla a tarjetas en móvil.** Se fija la primera columna y se desplaza el resto
  dentro del contenedor; el documento nunca se desplaza en horizontal.
- **No se usa el acento para decir "bueno"**, ni una sombra para decir "importante", ni el rojo para
  decir "error del sistema".
- **No se inventa una redacción** para un caso que ya tiene texto canónico en `CONTENIDO-MICROCOPIA.md`.
- **No se crea una página especial por federación.**

## Antes de dar por terminada una pantalla

1. 360 px de ancho sin desplazamiento horizontal del documento.
2. Correcta en tema claro y oscuro, y en densidad cómoda y compacta.
3. `axe` sin incidencias serias ni críticas.
4. Recorrible entera con teclado, con foco siempre visible.
5. Vistos sus estados **vacío, parcial, error y carga**.
6. Ningún número sin `tabular-nums` si comparte columna.
7. **Ningún dato ausente mostrado como cero.**
8. Un nombre de 45 caracteres no rompe ninguna tabla.

La lista completa, con los presupuestos de rendimiento y las pruebas, está en
[CALIDAD-PRUEBAS.md](docs/plataforma-web/CALIDAD-PRUEBAS.md).
