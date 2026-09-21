# Plataforma local de inteligencia deportiva

> **Documento histórico de transición.** La especificación vigente de la web profesional comienza
> en [`docs/plataforma-web/ARQUITECTURA.md`](docs/plataforma-web/ARQUITECTURA.md). Este archivo
> conserva hallazgos útiles, pero sus estados de federaciones y decisiones de infraestructura pueden
> estar desactualizados.

## Objetivo

Una sola interfaz para preparar rivales y estudiar posibles incorporaciones a partir de los
datos que publica cada federación. La herramienta sigue siendo local. Una competición y todas
sus entidades relacionadas permanecen fuera de la zona de consulta hasta que termina por
completo; al cerrarse, aparecen automáticamente en filtros, fichas y estadísticas.

## Regla estructural principal

Todo identificador externo se interpreta dentro de este contexto:

`federación → temporada → competición → grupo → jornada → partido/acta`

Los códigos de competición, grupo, equipo, acta o jugador no se consideran globales. Los enlaces
de la web incorporan la federación; así un código `1234` de Galicia nunca puede abrir por error el
`1234` de Castilla y León.

## Recorrido de consulta

1. **Federaciones.** Estado del descubrimiento y volumen útil de cada territorio.
2. **Competiciones.** Filtros por federación, temporada, categoría, ámbito, provincia/zona,
   modalidad y género.
3. **Competición-grupo.** Cobertura, clasificación oficial, jornadas, calendario, gráficas y
   ranking de jugadores.
4. **Jornada y partido.** Marcador, campo, árbitro y acceso al acta.
5. **Equipo de esa temporada.** Forma, evolución en la tabla, rendimiento casa/fuera, plantilla
   exacta y calendario.
6. **Club.** Equipos inscritos, categorías, campos e histórico conservador por nombre federativo.
7. **Jugador.** Trayectoria por temporada y, dentro de ella, por equipo, competición y grupo.

## Identidad de jugadores

- La clave segura es `federación + código de jugador`.
- Un mismo código puede aparecer en varios equipos de la misma temporada: se conserva cada
  contexto y luego se suma sólo en el resumen de esa temporada.
- Para relacionar códigos distintos entre temporadas se generan **candidatos**, nunca fusiones
  ciegas. La puntuación usa, en este orden: nombre completo normalizado, territorio, continuidad
  de club y continuidad de equipo/categoría.
- Los nombres cortos, apodos y homónimos no se unen automáticamente. Una propuesta ambigua queda
  pendiente de revisión.
- No se inventa un nombre completo cuando la fuente sólo muestra un apodo.

## Métricas disponibles y siguientes capas

### Equipo / rival

Ya disponibles: puntos y posición por jornada, racha, balance G/E/P, goles a favor y en contra,
porterías a cero, partidos sin marcar, ambos marcan, rendimiento casa/fuera y plantilla utilizada.

Siguientes métricas cuando la cobertura lo permita: goles por tramo, frecuencia de encajar primero,
capacidad de remontada, cambios habituales, once más repetido, jugadores más sustituidos, disciplina
por tramo y rendimiento contra equipos de la zona alta/media/baja.

### Jugador / fichaje

Ya disponibles: convocatorias separadas de partidos jugados, titularidades, minutos estimados,
goles normales/de penalti/en propia, tarjetas, equipos utilizados en la temporada y trayectoria.

Siguientes métricas: participación en el once, minutos por aparición, goles por 90 estimados,
regularidad, salto de categoría, polivalencia entre equipos, disciplina por 90 y evolución móvil de
cinco partidos. No se crearán asistencias, posiciones ni edades si el acta no las publica.

## Publicación, cobertura y calidad

La unidad de publicación es la competición completa, no el grupo. Para publicarla deben estar
descubiertos todos sus grupos y terminados, en cada uno, el calendario, la clasificación, el
índice de jornadas, todas las jornadas previstas y todas las actas localizadas. Un acceso directo
a una acta, jugador, equipo o club aplica la misma regla, por lo que no permite saltarse el filtro.
La web consulta las bases sin caché y detecta los cambios de SQLite mientras está abierta.

Cada competición tiene cuatro estados visibles: calendario, jornadas, actas localizadas y actas
analizadas. La tabla oficial guardada prevalece para la posición y los puntos; la reconstrucción
desde resultados sirve de contraste y permite detectar sanciones o ajustes administrativos.

Las actas se etiquetan como `correcta`, `administrativa` o `revisar`. `Revisar` no se descarta:
conserva la fuente, la incidencia concreta y permite reprocesarla localmente cuando mejora el parser,
sin volver a solicitar la página.

## Federaciones conectadas

Castilla y León, Galicia, Asturias, Cantabria, Aragón, La Rioja, Extremadura, Navarra, Euskadi,
Castilla-La Mancha, Andalucía, Murcia, Canarias, Ceuta y **Comunidad Valenciana**. Cada una tiene
una cola SQLite, un registro y una tarea programada independientes; las pnfg añaden además un
perfil de navegador propio. La web las consulta mediante el mismo modelo, pero no mezcla sus
entidades. El listado oficial de 19 territoriales deja cuatro integraciones pendientes: Madrid,
Baleares, Cataluña y Melilla. Su inventario técnico vive en `config/federaciones-espana.json`.

La estructura de catálogo de Madrid está verificada y dispone de un descubridor reanudable; sigue
fuera de las vistas de datos hasta completar su capa de jornadas y partidos. Cataluña sólo se
explorará mediante sus páginas HTML permitidas; Baleares y Melilla conservan su estado explícito en
el inventario para no presentar una cobertura ficticia.

### Estado real de las cinco pendientes

| Territorial | Descubrimiento | Qué permite su `robots.txt` | Qué falta |
| --- | --- | --- | --- |
| Madrid | 12 temporadas, 1.557 competiciones, 8.024 grupos | permite el portal; prohíbe `/acta-partido/`, `/fichaequipo/` y `/fichajugador/` | jornadas, partidos y clasificaciones (las actas quedan excluidas por decisión propia, no por falta de acceso) |
| Comunidad Valenciana | 12 temporadas, 1.372 competiciones, 8.830 grupos | `robots.txt` inexistente: sin restricciones | **ya recolecta**: jornadas, partidos, clasificaciones y actas |
| Cataluña | inventario de páginas públicas | permite el HTML, prohíbe `/api/` y `/_next/` | todo: las competiciones no vienen en el HTML, se cargan por JavaScript |
| Baleares | sin inventario | `Disallow: /` | todo: no se rastrea |
| Melilla | inventario de 72 enlaces | sin `robots.txt`, sin restricciones | la web devuelve HTTP 500 en calendarios, clasificaciones y actas; el fallo es del servidor de la federación y se reintenta a diario |

Los dos catálogos se recorren sin repetir temporadas ya completas: la tarea programada diaria
comprueba si hay trabajo nuevo antes de abrir el navegador y sólo entonces lo hace. Los grupos de
Madrid no se publican en la web hasta que su capa de jornadas esté terminada, porque un grupo sin
partidos daría una cobertura aparente que no existe.

### Comunidad Valenciana: adaptador por API JSON

Valencia no usa la plataforma `/pnfg/` como Castilla y León y otras trece territoriales, sino
**iSquad**, que publica los mismos datos como API JSON. Eso permite un adaptador que **no abre
navegador**: cada petición cuesta 60-330 ms en lugar de arrastrar un Chrome con ventana real, así
que el ritmo respetuoso (4-6 s configurados, mínimo duro 4 s) se mantiene mientras el rendimiento
es mucho mayor.

`scripts/recolector-valencia.mjs` escribe **exactamente las mismas tablas** que el recolector pnfg:
comparte el esquema `abreBase`, la escritura de actas `guardaActaEstructura` y la pausa global de
`scripts/lib/recolector-local.mjs`. La web y el visor no necesitan saber de qué plataforma viene el
dato; sólo se añadió `valencia` al listado de federaciones locales y el caso de la clasificación
oficial, que iSquad entrega en JSON en lugar de HTML.

Códigos de la fuente deducidos con actas reales, no supuestos:

| Campo | Código | Significado | Cómo se comprobó |
| --- | --- | --- | --- |
| `codigo_tipo_amonestacion` | 100 | amarilla | las tres tarjetas con `segunda_amarilla=1` de 153 leídas llevaban 100 |
| `codigo_tipo_amonestacion` | 101 | roja | nunca aparece con `segunda_amarilla`, así que no es doble amarilla |
| `tipo_gol` | 100 | gol normal | es el mayoritario y siempre cuadra con el marcador |
| `tipo_gol` | 101 | gol de penalti | deducido por eliminación una vez fijados 100 y 102 |
| `tipo_gol` | 102 | gol en propia puerta | la única acta de 45 que descuadraba (2-1 con listas 1 y 2) tenía un 102 en el lado que sumaba de más |

Si alguna vez aparece un acta que contradiga el 101, se corrige en la constante del recolector y se
sube `VERSION_PARSER`: el JSON original queda guardado junto a cada acta, así que se puede
reprocesar sin volver a pedir nada.
