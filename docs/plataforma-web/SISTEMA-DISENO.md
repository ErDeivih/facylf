# Sistema de diseño

Estado: decisión de diseño, 14 de septiembre de 2026. Define cómo se ve y cómo se compone la
plataforma. [PRODUCTO-UX.md](PRODUCTO-UX.md) decide *qué* pantallas existen y qué responden; este
documento decide *con qué piezas* se construyen. Los dos son obligatorios antes de escribir una
vista.

## 1. Dirección: híbrido

Dos modos conviven en el mismo producto y no se mezclan al azar:

| Modo | Dónde | Cómo se reconoce |
|---|---|---|
| **Aire** | portada, buscador, cabeceras de ficha, cobertura, navegación | tarjetas, jerarquía clara, espaciado generoso, un dato grande por bloque |
| **Denso** | clasificaciones, calendarios, actas, plantillas, rankings, resultados de búsqueda | tabla compacta, tipografía tabular, filas de 32-36 px, cero decoración |

La regla de decisión: **si el usuario va a comparar filas, es denso; si va a orientarse, es aire.**
Ninguna pantalla es sólo una cosa: la ficha de competición tiene cabecera con aire y clasificación
densa. El usuario puede además forzar la densidad (§6).

### La marca del producto es neutra

La web actual usa el rojiblanco del C.D. Munibar Pizarrales. Eso era correcto para un visor de un
club y es incorrecto para una herramienta que cubre diecinueve federaciones: teñir de rojo la
clasificación de un grupo catalán sugiere una pertenencia que no existe, y el rojo saturado compite
con los colores semánticos de victoria, derrota, tarjeta y aviso de cobertura.

Decisión: **paleta de producto neutra en grises fríos con un acento azul-verde**, y los colores de
club reservados a su propio contexto (escudo, franja de identidad en la ficha del club o del
equipo), nunca al cromo global.

## 2. Tokens

Fuente única de verdad: `apps/web/src/app/tokens.css`, importado por `globals.css`. Nada de colores
literales en componentes; si un valor no tiene token, primero se crea el token.

Tailwind v4 declara los tokens con `@theme`, que genera a la vez la variable CSS y las utilidades
(`bg-*`, `text-*`, `border-*`). Se usa `@theme` para la escala cruda y `:root` para los roles
semánticos, porque los roles cambian en modo oscuro y las utilidades no deben regenerarse.

```css
@import "tailwindcss";

/* Escala cruda: no se usa directamente en componentes. */
@theme {
  --color-tinta-950: oklch(0.18 0.012 250);
  --color-tinta-900: oklch(0.24 0.012 250);
  --color-tinta-800: oklch(0.32 0.011 250);
  --color-tinta-600: oklch(0.50 0.010 250);
  --color-tinta-500: oklch(0.60 0.009 250);
  --color-tinta-400: oklch(0.70 0.008 250);
  --color-tinta-300: oklch(0.82 0.006 250);
  --color-tinta-200: oklch(0.90 0.005 250);
  --color-tinta-100: oklch(0.95 0.004 250);
  --color-tinta-50:  oklch(0.98 0.003 250);

  --color-acento-700: oklch(0.45 0.105 215);
  --color-acento-600: oklch(0.55 0.115 215);
  --color-acento-500: oklch(0.65 0.110 215);
  --color-acento-100: oklch(0.94 0.030 215);

  --color-verde-600:  oklch(0.56 0.115 155);
  --color-ambar-600:  oklch(0.66 0.130 75);
  --color-rojo-600:   oklch(0.55 0.170 27);
  --color-violeta-600: oklch(0.55 0.130 300);

  --font-sans: 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-numero: 'Inter Variable', ui-monospace, 'SF Mono', monospace;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
}

/* Roles semánticos: esto es lo que usan los componentes. */
:root {
  color-scheme: light;
  --fondo:            var(--color-tinta-50);
  --fondo-elevado:    #ffffff;
  --fondo-sutil:      var(--color-tinta-100);
  --borde:            var(--color-tinta-200);
  --borde-fuerte:     var(--color-tinta-300);
  --texto:            var(--color-tinta-900);
  --texto-suave:      var(--color-tinta-600);
  --texto-tenue:      var(--color-tinta-500);
  --accion:           var(--color-acento-700);
  --accion-suave:     var(--color-acento-100);
  --foco:             var(--color-acento-600);

  --victoria:  var(--color-verde-600);
  --empate:    var(--color-tinta-500);
  --derrota:   var(--color-rojo-600);
  --amarilla:  var(--color-ambar-600);
  --roja:      var(--color-rojo-600);

  --cobertura-completa: var(--color-verde-600);
  --cobertura-parcial:  var(--color-ambar-600);
  --cobertura-nula:     var(--color-tinta-400);
  --revision:           var(--color-violeta-600);

  --fila: 2.25rem;          /* densidad cómoda */
  --celda-x: 0.75rem;
  --celda-y: 0.5rem;
}

:root[data-densidad="compacta"] {
  --fila: 1.75rem;
  --celda-x: 0.5rem;
  --celda-y: 0.25rem;
}

:root[data-tema="oscuro"] {
  color-scheme: dark;
  --fondo:         var(--color-tinta-950);
  --fondo-elevado: var(--color-tinta-900);
  --fondo-sutil:   var(--color-tinta-800);
  --borde:         var(--color-tinta-800);
  --borde-fuerte:  var(--color-tinta-600);
  --texto:         var(--color-tinta-100);
  --texto-suave:   var(--color-tinta-300);
  --texto-tenue:   var(--color-tinta-400);
  --accion:        var(--color-acento-500);
  --accion-suave:  oklch(0.30 0.055 215);
  --verde-600:     oklch(0.70 0.120 155);
  --rojo-600:      oklch(0.68 0.150 27);
  --ambar-600:     oklch(0.76 0.130 75);
}
```

Notas de implementación, no opinables:

- El tema se decide en el servidor a partir de una cookie y se escribe como `data-tema` en `<html>`;
  jamás se aplica desde un `useEffect`, que produce parpadeo. El patrón admitido para evitar ese
  parpadeo cuando el valor no puede resolverse en el servidor es un `<script>` en línea en `<head>`.
- `oklch` da pasos de luminosidad perceptualmente uniformes: una escala en `hex` ajustada a ojo se
  rompe al invertirla para modo oscuro.
- Un token de color nunca se define **sólo** dentro de `[data-tema="oscuro"]` o de una media query.
  Siempre existe en `:root`.

## 3. Tipografía

Una sola familia variable, cargada con `next/font` y `display: swap`, nunca desde una hoja externa
de Google Fonts (una petición bloqueante a otro dominio en la ruta crítica es precisamente lo que
mide mal el LCP).

| Uso | Tamaño | Peso | Interlineado |
|---|---|---|---|
| Título de página | 1.5 rem / 1.75 rem en ≥md | 600 | 1.2 |
| Título de bloque | 1.05 rem | 600 | 1.3 |
| Texto | 0.9375 rem | 400 | 1.55 |
| Texto en tabla densa | 0.8125 rem | 400 | 1.35 |
| Etiqueta / encabezado de columna | 0.6875 rem, versalita, `tracking .06em` | 600 | 1.2 |
| Dato destacado | 1.75-2.25 rem | 600, `tabular-nums` | 1.1 |

Reglas duras:

- **Todo número que se compara en vertical lleva `font-variant-numeric: tabular-nums`.** Sin eso,
  una columna de goles no se lee: los dígitos bailan.
- Nada por debajo de 0.75 rem salvo etiquetas en versalita; y nunca para un dato.
- Los nombres propios se muestran con el literal original de la fuente. La normalización sin tildes
  es clave de búsqueda interna, no texto visible.
- No se recorta un nombre con `text-overflow` en una tabla sin dejarlo accesible: se permite dos
  líneas o se ofrece el nombre completo en el enlace.

## 4. Espaciado y rejilla

Escala base 4 px. Contenedor máximo 1280 px con 16 px de margen lateral mínimo en móvil, 24 px desde
`md`. Puntos de ruptura los de Tailwind (`sm 640`, `md 768`, `lg 1024`, `xl 1280`).

Composición típica de una ficha: cabecera a ancho completo, después rejilla de 12 columnas donde el
contenido principal ocupa 8 y el contexto (cobertura, procedencia, enlaces) 4, colapsando a una
columna por debajo de `lg` con el contexto **después** del contenido.

## 5. Inventario de componentes

Todo componente vive en `apps/web/src/componentes/` y se escribe primero en su estado vacío. Los
marcados con ☐ no existen todavía.

### Estructura

- ☐ `Cascara` — cabecera, navegación, contenedor y pie; única dueña del ancho máximo.
- ☐ `BarraContexto` — federación y temporada activas; escribe en la URL, no en estado local.
- ☐ `Miga` — breadcrumb derivado de la ruta canónica, con la competición y el grupo resueltos.
- ☐ `NavInferior` — barra inferior móvil: Inicio, Buscar, Competiciones, Scouting, Más.
- ☐ `HojaFiltros` — panel lateral en móvil con resumen de filtros activos y botón de restablecer.

### Datos

- ☐ `Tabla` — cabecera fija, columnas alineadas (texto izquierda, números derecha), orden por
  `searchParams`, fila enlazable entera, `scope` en los `th`, `caption` siempre presente aunque sea
  visualmente oculta.
- ☐ `TablaResponsiva` — en móvil no colapsa a tarjetas: fija la primera columna (equipo o jugador) y
  desplaza las demás en horizontal dentro de su propio contenedor. Colapsar a tarjetas destruye la
  comparación entre filas, que es justamente para lo que existe la tabla.
- ☐ `Paginador` — cursor, no `offset`; conserva el resto de `searchParams`.
- ☐ `Chip` — filtro activo, eliminable, con `aria-label` que dice qué quita.
- ☐ `Faceta` — opción con recuento; se deshabilita, no se oculta, cuando su recuento es cero.

### Dominio

- ☐ `Marcador` — resultado con estado; si no hay marcador publicado muestra "sin resultado", nunca
  `0-0`.
- ☐ `Racha` — últimos partidos por fecha; cada elemento con letra **y** color, y título accesible.
- ☐ `LineaPartido` — cronología de goles, tarjetas y cambios; versión en tabla obligatoria.
- ☐ `Alineacion` — titulares, suplentes y convocados sin condición en tres bloques rotulados.
- ☐ `InsigniaCobertura` — completa / parcial / no publicada / a revisar, con texto y color.
- ☐ `Procedencia` — fuente, fecha de recogida y versión del parser, en lenguaje humano.
- ☐ `IdentidadPersona` — avisa cuando el enlace entre temporadas es probable pero no confirmado.
- ☐ `SinCapacidad` — bloque que explica que la federación no publica ese dato, con enlace a
  [FEDERACIONES-MATRIZ.md](FEDERACIONES-MATRIZ.md). **Este componente es obligatorio** en cualquier
  vista que pueda quedarse sin métricas individuales.
- ☐ `Escudo` — imagen de club con marcador de posición determinista (iniciales sobre color derivado
  del identificador); tamaño fijo para no provocar salto de layout.

### Estados

- ☐ `Esqueleto` — mismas dimensiones que el contenido real; nunca un spinner centrado que desplace
  la página al resolverse.
- ☐ `Vacio` — dice qué falta y ofrece la acción que lo arregla (quitar un filtro, cambiar de
  temporada).
- ☐ `ErrorRecuperable` — mensaje humano, identificador de incidencia y botón de reintento. Sin SQL,
  sin rutas, sin traza.

## 6. Densidad

Interruptor global cómoda/compacta, persistido en cookie (no en `localStorage`: el servidor debe
poder renderizar la densidad correcta en el primer HTML). Cambia sólo `--fila`, `--celda-x` y
`--celda-y`; ningún componente lee la preferencia.

En compacta se mantiene el objetivo táctil mínimo de 24×24 px de WCAG 2.2 para cualquier control
interactivo: la fila se comprime, el área pulsable no.

## 7. Color con significado

- **Nunca sólo color.** Victoria/empate/derrota llevan letra; tarjeta lleva forma; cobertura lleva
  texto. Un daltónico y una impresión en blanco y negro deben dar la misma lectura.
- Contraste mínimo 4.5:1 para texto y 3:1 para bordes de control y elementos gráficos portadores de
  información, en los dos temas. Se comprueba automáticamente (ver [CALIDAD-PRUEBAS.md](CALIDAD-PRUEBAS.md)).
- El acento (`--accion`) se reserva para acciones y enlaces. Si se usa también para "bueno", deja de
  señalar dónde se puede pulsar.
- El rojo es derrota y tarjeta roja. Un error del sistema usa `--revision` o un patrón de borde, no
  el mismo rojo, para no confundir "has perdido 0-3" con "algo ha fallado".

## 8. Gráficos

**Antes de escribir la primera línea de código de cualquier gráfico, carga la skill `dataviz`.**
Contiene la heurística de forma, la fórmula de color accesible con validador ejecutable y las reglas
de interacción; este documento sólo fija lo propio del proyecto:

- Los colores de serie salen de los tokens, no de la paleta por defecto de la librería.
- Todo gráfico tiene título que enuncia la conclusión o la pregunta, unidades, y **versión en tabla**
  accesible (un `<details>` con la tabla equivalente cumple).
- Todo gráfico declara su cobertura: un gráfico de goles por jornada con seis jornadas sin acta lo
  dice en el propio gráfico, no en un pie de página lejano.
- Nada de radar por defecto: mezcla escalas y dificulta justamente la comparación que se busca.
- Los gráficos son componentes cliente; el resto de la página no. Se cargan con `dynamic` para no
  meter la librería en el paquete inicial de rutas que no la usan.
- `prefers-reduced-motion` desactiva toda animación de entrada.

## 9. Movimiento

Transiciones de 120-180 ms sólo en color, opacidad y transformación. Nada de animar altura o
posición de contenido ya visible. Todo bajo `@media (prefers-reduced-motion: reduce)` se reduce a
cero.

## 10. Criterio de aceptación visual

Una pantalla no está terminada hasta que:

1. se ve correcta a 360 px de ancho sin desplazamiento horizontal del documento;
2. se ve correcta en tema claro y oscuro, y en densidad cómoda y compacta;
3. pasa `axe` sin incidencias serias o críticas;
4. es recorrible entera con teclado, con foco siempre visible;
5. existe y se ha mirado su estado vacío, parcial, de error y de carga;
6. ningún número se muestra sin `tabular-nums` si comparte columna con otros;
7. ningún dato ausente aparece como cero;
8. con un nombre de 45 caracteres no rompe ninguna tabla.
