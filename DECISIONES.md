# Decisiones del agente

Registro de las decisiones de **Nivel 2** del [protocolo de autonomía](F:\EspacioCodigo\_flujo-dsh\PROTOCOLO-AUTONOMIA.md):
las que el agente toma solo y deja escritas aquí con su motivo, para que David las revise cuando quiera.
Las de Nivel 3 (alcance, datos, credenciales, dinero, ramas) no se deciden aquí: se marcan y se para.

---

## 2026-11-04 · Sesión 1 — pruebas en verde y pantalla 2 (Competición)

### 1. Las pruebas se arreglan en las PRUEBAS, no en el código de la plataforma

- **Qué se hizo**: `pnpm test` fallaba por tres motivos distintos —el canónico estaba apagado, dos
  suites limpiaban con un `NOT IN` cuadrático sobre 2,28 M de personas y la limpieza no borraba los
  agregados de `analytics` (FK desde `0005`)—. Los tres se arreglan en `packages/canonico/test/`.
- **Por qué**: ninguna aserción de negocio fallaba (593 asserts en verde). Tocar código de la
  plataforma para arreglar una prueba habría escondido el problema real. Detalle en
  [`INFORME-PRUEBAS.md`](INFORME-PRUEBAS.md).
- **Nivel**: 1.

### 2. La pantalla 2 vive en una ruta nueva: `/explorar/competicion/[id]`

- **Qué se hizo**: la pantalla nueva se monta en `apps/web/src/app/explorar/competicion/[id]`, con
  `id` = `core.phase_group.id`.
- **Por qué**: `/competicion/[slug]` ya existe y la web vieja la usa (lee las colas locales con slug);
  el encargo de la web dice que **las rutas nuevas conviven con las viejas** hasta W9 y que no se
  rompa la web vieja. Next no permite dos segmentos dinámicos distintos al mismo nivel (`[slug]` y
  `[id]`), así que la pantalla nueva va bajo el prefijo de la sección del prototipo («Explorar»).
- **Alternativas descartadas**: reescribir `/competicion/[slug]` (rompe la web vieja y sus pruebas);
  `/liga/[id]` (no es el vocabulario del prototipo).
- **Nivel**: 2.

### 3. Se reutilizan las consultas del canónico; sólo se añaden las que faltaban

- **Qué se hizo**: se usan las consultas ya existentes `rachas-del-grupo`, `zonas-del-grupo`,
  `ranking-goleadores` y `partidos-de-grupo`, y se añaden cuatro
  en `apps/web/src/consultas/competiciones.ts`: `grupo-por-id`, `grupos-de-la-edición`,
  `ediciones-de-la-competición` y `clasificación-de-la-pantalla`. Todas con contrato, `presupuestoMs`,
  `plan: 'indexado'`, `LIMIT` y parámetros de ejemplo.
- **Por qué**: la capa de datos ya estaba hecha y probada (66 consultas con contrato). Duplicarla
  habría creado dos definiciones de lo mismo. La clasificación sí necesitaba consulta propia porque la
  existente devuelve las dos tablas (oficial y reconstruida) a propósito, para la página que las
  compara; la pantalla nueva enseña **una** y dice cuál es.
- **Nivel**: 2.

### 4. Clasificación: manda la oficial; si no publica goles, se enseñan los reconstruidos y se dice

- **Qué se encontró**: en el grupo real de CyL (797, Liga Nacional Juvenil 2025-26) la tabla **oficial**
  trae `goles_favor = goles_contra = 0` en las 16 filas —la federación no publicó los goles— mientras
  que la **reconstruida** trae los goles reales (67:29, 56:31…). Enseñar «0:0» en todas las filas
  habría sido un dato falso con pinta de dato.
- **Qué se decidió**: la tabla es la oficial (posición, puntos, PJ, G-E-P); los goles salen de la
  reconstrucción **sólo cuando la oficial no los publica**, con una nota al pie que lo dice
  («Los goles no vienen en la tabla oficial: se enseñan los reconstruidos…»). Regla en
  `lib/pantalla-competicion.ts` (`publicaGoles`, `golesDeLaFila`), probada.
- **Por qué**: la regla del proyecto es «desconocido ≠ 0»; la reconstrucción no inventa nada, se
  calcula con los resultados publicados. Lo que no se hace es mezclar orígenes sin decirlo.
- **Nivel**: 2 (decisión de presentación dentro del sistema ya establecido).

### 5. Nombres de menores: se ocultan incluso en goleadores

- **Qué se hizo**: los goleadores pasan por `nombreVisible(es_menor, nombre)`
  (`apps/web/src/lib/menores.ts`): si es menor, la pantalla dice «Jugador menor de edad»; si no hay
  nombre publicado, «Nombre no publicado». Probado.
- **Por qué**: invariante de `CLAUDE.md` y `SEGURIDAD-OPERACION.md` §5. En el grupo real **los ocho
  primeros goleadores son menores**, así que la tarjeta se ve sin nombres: es correcto, no un fallo.
- **Nivel**: 1 (cumplimiento de una invariante).

### 6. Lo que no está, se apaga en vez de fingirse

- **Casa / Fuera**: el conmutador se enseña como el prototipo pero desactivado: `analytics` sólo tiene
  `jugados_casa`/`jugados_fuera`, no el G-E-P por condición, y agregarlo desde `core.match` choca con
  la regla «ninguna página agrega hechos de más de un partido». Queda como hueco de la proyección
  (migración nueva, 0051+), anotado en `BACKLOG.md`.
- **Pestañas Jornadas/Goleadores/Disciplina/Equipos**: desactivadas con `aria-disabled` y un `title`;
  no hay pantalla todavía y un enlace a «en obras» sin decirlo es peor que uno apagado.
- **Zonas**: sólo se pinta la leyenda de las franjas que existen; sin zonas fijadas no se pinta
  ninguna y se dice. En el grupo real sólo hay descensos (2), y la leyenda lo refleja.
- **Nivel**: 2.

### 7. Se añade un token, no un color a mano

- **Qué se hizo**: `--radius-tarjeta: 14px` en `apps/web/src/app/tokens.css`, con su comentario.
- **Por qué**: las tarjetas del prototipo tienen 14 px de radio y la escala existente sólo llegaba a
  10 px. La regla del sistema de diseño es «si un valor no tiene token, primero se crea el token».
- **Nivel**: 1 (higiene del sistema de diseño).

### 8. Grupo de referencia de Castilla y León: 797 (Liga Nacional Juvenil 2025-26)

- **Qué se hizo**: la prueba contra el canónico real usa el grupo 797 (16 equipos, 30 jornadas,
  clasificación oficial publicada, zonas y proyección). No está escrito en la página: la pantalla va
  por id de URL y la prueba es la única que lo fija.
- **Por qué**: es el equivalente real de la pantalla del prototipo («Liga Nacional Juvenil · Grupo»)
  con datos completos de CyL.
- **Nivel**: 1 (elección de dato de prueba).

---

### 9. David decidió el 2026-11-04 (coordinación): el diseño manda, la lógica de datos se conserva

- **Decisión de David** (en `ESPECIFICACION.md`, commit `6744b8d`): «El diseño manda: la capa visual se
  rehace contra el prototipo y el sistema de diseño. Lo que sí se reutiliza: contratos de API,
  consultas, la ingesta y todo lo que no sea presentación. Se decide componente a componente».
- **Cómo casa con lo hecho**: exactamente lo implementado. La pantalla 2 es una capa de presentación
  nueva (`apps/web/src/app/explorar/...` y `componentes/competicion/`) sobre las consultas existentes
  del canónico; no se copia ningún componente de la interfaz vieja. La web vieja sigue en pie hasta W9.
- **Nivel**: 2 (ejecución de una decisión de David).

---

## 2026-11-04 · Sesión 2 — la pantalla 2 contra el prototipo y la cabecera común

Contrato de la tarea: [`docs/plataforma-web/SPEC-PANTALLA-2.md`](docs/plataforma-web/SPEC-PANTALLA-2.md).
Sigue la decisión de David del 04/11 (decisión 9): el diseño manda, se reutilizan consultas y no se
arrastra la interfaz vieja.

### 10. La cabecera común del sitio se rehace ahora, no se espera a W1

- **Qué se hizo**: `componentes/cabecera/CabeceraSitio.tsx` (pieza pura), `CabeceraSitioActiva.tsx`
  (`usePathname`) y `activo.ts`, según `Cabecera.dc.html`: barra oscura de 64 px, marca, navegación
  Explorar/Rankings/Ojeo/Comparar, buscador global, estrella, avisos y cuenta. En móvil el buscador
  baja a su propia fila. El buscador viejo se **adapta** (misma lógica: `/api/buscar`, 2 letras,
  250 ms, cancelable), no se reescribe.
- **Por qué**: la pantalla 2 incluye la cabecera en el prototipo y era la pieza que más la separaba de
  él (estaba en `BACKLOG.md` como la primera diferencia). Esperar a W1 habría dejado la pantalla a
  medias. Afecta a todas las rutas, también a las viejas, que siguen funcionando dentro del mismo
  `<main>`.
- **Lo que no se finge**: Rankings/Ojeo/Comparar no tienen pantalla → `<span aria-disabled>` con
  motivo; avisos y cuenta no existen → botones desactivados sin contador ni iniciales inventadas (el
  «3» y el «DP» del prototipo son datos ficticios del diseño y no se copian).
- **Nivel**: 2.

### 11. Tokens nuevos en vez de valores sueltos

- **Qué se hizo** en `apps/web/src/app/tokens.css`: `--fondo-fuerte`, `--fondo-fuerte-suave`,
  `--texto-fuerte`, `--texto-fuerte-suave`, `--borde-fuerte-tema` (la cabecera y la insignia del
  marcador); `--zona-ascenso / -fase-ascenso / -permanencia / -descenso` con su `--color-azul-600`
  crudo; escala tipográfica corta (`text-etiqueta`, `text-nota`, `text-tabla`, `text-cuerpo`,
  `text-bloque`, `text-dato`, `text-titulo`); `--radius-control: 8px`; `--fila-densa` (42 px cómoda,
  32 compacta); `--sombra-segmento`. En tema oscuro las superficies se separan por luminosidad
  (fondo 0.18 < cabecera 0.24 < tarjeta 0.28 < relleno 0.32) para que la pastilla activa siga
  viéndose.
- **Por qué**: la regla de `DESIGN.md` es «si un valor no tiene token, se crea el token», y la pantalla
  usaba tamaños y colores a mano. Nada de colores literales en los componentes nuevos.
- **Nivel**: 1.

### 12. Inter Variable, autoalojada, para no incumplir la tipografía del sistema

- **Qué se hizo**: dependencia `@fontsource-variable/inter` en `@facylf/web`, importada en
  `layout.tsx` antes de `globals.css`. `document.fonts.check('16px "Inter Variable"')` = `true` y
  ninguna hoja externa.
- **Por qué**: el sistema de diseño pide una Inter variable con `display: swap` y **prohíbe** una hoja
  externa de Google Fonts. Hasta ahora `--font-sans` nombraba una fuente que no existía y el producto
  caía a la del sistema; el prototipo está compuesto en Inter. La dependencia es pequeña, va en el
  paquete y no añade una petición a otro dominio en la ruta crítica.
- **Nivel**: 2 (dependencia nueva pequeña y justificada).

### 13. Los goles reconstruidos tienen que ser de la MISMA jornada (fallo real corregido)

- **Qué se encontró**: en el grupo 3769 la tabla oficial es de la jornada 2 (`PJ = 2`) y la consulta
  cogía los goles reconstruidos de la **jornada 4**: Burgos aparecía con `PJ 2` y `14:2` (sus goles de
  cuatro partidos). Suma de goles de la reconstrucción: 135 en la jornada 4 frente a 71 en la 2.
- **Qué se hizo**: el lateral de `CLASIFICACION_DE_LA_PANTALLA` filtra `sr.matchday_id = s.matchday_id`;
  si esa jornada no tiene reconstrucción, `null` y la tabla enseña «—». La nota al pie distingue tres
  casos (reconstrucción completa, incompleta y ausente) y dice la jornada. Pruebas de integración
  contra 3769 (jornada 2) y 797 (jornada 30).
- **Por qué**: mezclar dos fotos distintas en la misma fila es exactamente la clase de dato falso con
  pinta de dato que el proyecto prohíbe; y en esta pantalla el prototipo mezcla goles y PJ en la misma
  fila, así que el error se lee como si fuera real.
- **Nivel**: 2 (presentación y honestidad del dato, sin cambiar el alcance).

### 14. La hora de un partido sólo se enseña si la federación la publicó

- **Qué se encontró**: `core.match.hora_confirmada` es un **booleano** y `fecha_prevista` una fecha;
  no hay columna de hora. La hora vive en `played_at`, que el importador rellena con fecha+hora sólo
  cuando la fuente la publica.
- **Qué se hizo**: `hora` en `PARTIDOS_DE_GRUPO` = `case when hora_confirmada then to_char(played_at at
  time zone 'UTC','HH24:MI') end`; si no está confirmada es `null` y la tarjeta pinta «—» con su texto
  accesible, nunca un 00:00 inventado.
- **Nivel**: 2.

### 15. El escudo es un marcador de posición determinista, no la identidad del club

- **Qué se hizo**: `componentes/Escudo.tsx` con las iniciales del nombre publicado sobre un tono
  derivado del id del equipo (ángulo áureo, L=0,42, C=0,07). Mismo id → mismo color; 16 equipos → 16
  colores; contraste ≥4,5 con el texto; 22×24 fijo para no saltar el layout. `aria-hidden` porque el
  nombre del equipo va al lado.
- **Por qué**: `SISTEMA-DISENO` §5 lo define así. En el canónico no hay color de club ni escudo para
  estos 16 equipos (sólo 1 de 16 tiene imagen en `core.club_asset`), y pintar colores inventados de
  club sería un dato falso. El distintivo es estable para seguir una fila al desplazar la tabla.
- **Nivel**: 2.

### 16. Lo que no está, se apaga con su motivo accesible

- **Casa/Fuera**: sigue desactivado con `disabled` y el motivo en `sr-only` (falta la proyección por
  condición, migración 0051+).
- **Pestañas Jornadas/Goleadores/Disciplina/Equipos**: desactivadas con `aria-disabled` y motivo.
- **«Ver todos» de goleadores**: gris y desactivado con título; el ranking completo no tiene pantalla.
- **Flechas de jornada**: cuando no hay jornada anterior/siguiente, se apagan con borde discontinuo y
  texto accesible. Se distingue lo desactivado con forma (borde discontinuo) y no con un gris
  ilegible: `--texto-tenue` (3,94:1) no se usa para texto visible nuevo.
- **Nivel**: 2.

### 17. Pruebas nuevas y cómo se ejecutan

- **Playwright**: `apps/web/e2e/pantalla-2.spec.ts`, 11 pruebas × 2 proyectos (móvil 360 y escritorio
  1280) = **22**. Cubre carga real con datos del canónico, cabecera, migas, goles y forma de la misma
  jornada, nombre de 61 caracteres a 400 px, buscador sin menores con axe abierto, cifras tabulares,
  400 px con columna fija, 404 y axe.
- **Cómo se ejecuta**: `pnpm --filter @facylf/web exec playwright test e2e/pantalla-2.spec.ts`. Si ya
  hay un `next dev` en :3000, se le apunta con `PLAYWRIGHT_BASE_URL=http://localhost:3000` y no se
  arranca otro: Next 16 no permite dos servidores de desarrollo en el mismo directorio. Se usa
  `localhost` y no `127.0.0.1`: Next bloquea los recursos de desarrollo (y por tanto la hidratación
  del buscador) cuando el origen no coincide.
- **vitest**: 55 pruebas en `apps/web/test/competicion-pantalla.test.ts` (contratos, goles y forma por
  jornada, hora, escudo, estados vacíos y esqueleto renderizados, subtítulo, temporadas), 8 en
  `cabecera-sitio.test.ts` y 9 en `sugerencias.test.ts`.
- **Nivel**: 1.

### 18. Los recorridos e2e antiguos (`recorridos.spec.ts`) siguen en rojo, y no es de esta tarea

- **Qué pasa**: la web vieja con slug (`/competicion/[slug]`, `/jugadores`) **no compila en `next dev`
  con Turbopack**: `@facylf/ingesta` exporta imports `.js` que Turbopack no resuelve a `.ts` (el build
  de webpack sí, y es el que usa el despliegue). Medido el 04/11/2026: `/federaciones` y las rutas con
  slug devuelven 500 en dev, y esos 7 recorridos fallan desde antes de esta sesión.
- **Qué se hizo**: no se tocan (prueban la web vieja que se retira en W9); se documenta y queda en
  `BACKLOG.md` como tarea aparte. La suite nueva de la pantalla 2 se ejecuta aparte y pasa entera.
- **Por qué**: arreglar la resolución de la web vieja en dev o retirar sus recorridos es un cambio de
  otra tarea; fingir que la suite entera está verde sería peor.
- **Nivel**: 1 (deuda documentada).

### 19. El tema oscuro se comprueba, pero el sitio todavía no tiene interruptor

- **Qué pasa**: `tokens.css` define `[data-tema="oscuro"]`, pero **ninguna pantalla escribe
  `data-tema`** (deuda anterior a esta sesión). La pantalla 2 se midió en oscuro y compacta forzando
  el atributo (`tmp/qa.mjs`), y axe no encuentra nada; pero un usuario no puede cambiar de tema.
- **Qué se hizo**: no se implementa el interruptor (es una pieza de producto/cabecera que afecta a
  todas las pantallas y merece su tarea); se anota en `BACKLOG.md` con el criterio del sistema.
- **Nivel**: 3 en la parte de producto (¿entra el tema en esta tanda?); la medición, 1.

### 20. Revisión adversarial independiente: la primera entrega NO era apta, y esto es lo que se corrigió

- **Qué pasó**: un QA independiente revisó la entrega con datos reales y veredicto **NO APTA**
  (informe interno en `tmp/QA-PANTALLA-2.md`, no versionado porque cita identificadores y nombres de
  personas). Se corrigió todo lo bloqueante e importante antes de dar la tarea por terminada:
  - **B1 (bloqueante, invariante del proyecto)**: el buscador de la cabecera publicaba nombres de
    menores. La consulta ya traía `es_menor`, pero `/api/buscar` lo descartaba. Ahora la ruta usa
    `resultadoDeSugerencia` (`lib/sugerencias.ts`) con `nombreVisible`: los menores salen como
    «Jugador menor de edad» y los adultos conservan su nombre publicado. Probado con `es_menor`
    true/false/null y verificado en vivo contra el canónico.
  - **I1**: con un nombre real de 61 caracteres (grupo 17863) a 400 px el nombre no se podía leer y la
    celda fija del equipo tapaba el puesto. Ahora la columna fija está acotada en móvil, con elipsis y
    `title` con el nombre completo; a partir de 768 px se ve entero. Añadida prueba e2e con ese grupo.
  - **I2**: la columna Forma mezclaba la tabla oficial de la jornada 2 con resultados de la jornada 4
    (4 insignias con `PJ=2`). Ahora la forma se calcula con `formaHasta` sobre los partidos del grupo
    **hasta la misma jornada de la tabla**, con su nota al pie y su prueba (nº de insignias ≤ PJ).
  - **I3**: el estado de error reutilizaba el `SinCanonico` viejo con colores literales (en oscuro era
    una caja blanca). Restilizado con tokens y en un solo bloque, sin cambiar su API ni su texto.
    Sigue **sin captura en ejecución**: provocarlo exige parar el canónico y eso está prohibido; la
    evidencia es revisión de código y `tsc`, y así se declara.
  - **I4**: `tabular-nums` ausente en Goleadores y marcadores de Jornada. Añadido y comprobado por
    estilo computado.
  - **I5**: el esqueleto tenía 10 filas fijas frente a 16 reales (salto de ~450 px). Ahora `filas` sale
    de `grupo.equipos`, y jornada y goleadores pintan 8.
  - **I6**: el placeholder prometía «equipo, competición, árbitro» y el endpoint sólo devuelve club y
    jugador. Vuelve a «Buscar jugador o club…».
  - **I7**: axe serio con el buscador abierto por el color de «identidad nominal» (`--texto-tenue`,
    3,93:1). Pasa a `--texto-suave`; axe con el panel abierto en 0 serias/críticas y la e2e ahora lo
    mide abierto.
  - **I9**: el desplegable de temporada ofrecía 2013-14 en adelante mientras el pie declara publicar
    desde 2023-24. `temporadasPublicables` filtra en la página, sin cambiar la consulta.
  - **C1/C2**: cabecera y contenido no compartían borde. Cabecera, `main` y pie pasan a
    `max-w-[1240px] px-5`: a 1440 todo empieza en x=120 y mide 1200, como el prototipo.
  - **C5**: el anillo de foco de la pestaña activa se recortaba; la nav de pestañas gana aire vertical.
  - **C6/C7/C9**: favicon (`app/icon.svg`), título por página con `generateMetadata` y `cache()`, y
    extremos de la barra con `coalesce(played_at, fecha_prevista)` (el grupo 75252 ya enseña fechas).
- **Lo que se acepta a propósito, con motivo**:
  - **Acento más oscuro** que el `#0B7285` del prototipo: `--accion` (acento-700) es el mínimo que da
    contraste AA para texto sobre blanco; aclararlo por fidelidad rompería la accesibilidad. Manda el
    contraste, y el prototipo no es un valor normativo de token.
  - **Tabla a 13 px** (prototipo 14): es la escala «texto en tabla densa» del sistema; el prototipo no
    define tokens.
  - **Fila de 43 px** frente a 42: el borde superior suma 1 px; la altura de contenido es 42.
  - **Estado de error sin captura**: ver I3, no se para el canónico para una captura.
- **Segunda ronda de QA (misma sesión)**: veredicto **APTA CON RESERVAS**. Volvió a comprobar con
  evidencia nueva todos los bloqueantes e importantes (B1 y I1-I9 cerrados; batería de 16 pasadas por 6
  grupos y 3 modos sin axe serio/crítico, sin scroll horizontal y sin errores de consola). De las
  reservas, se corrigieron dos en el mismo cambio:
  - **R2-1** (axe seria en oscuro con el buscador abierto, «Ver los N resultados» a 4,1:1): el enlace
    del pie del panel pasa a `--texto` con subrayado de acento; la e2e ahora mide axe **también en
    oscuro** con el panel abierto.
  - **R2-3** (esqueleto ~220 px más bajo que el contenido): se añaden al esqueleto la cabecera de
    columnas, la leyenda y la nota al pie. Sigue existiendo una diferencia menor; se acepta.
  - **Reservas que se aceptan y quedan escritas**: la miga enlaza a `/federaciones`, que en `next dev`
    con Turbopack da 500 pero en el build de webpack (el que se despliega) funciona (R2-2, decisión 18);
    el nombre de 61 caracteres se recorta con `title` en móvil y no hay tooltip táctil (R2-4, el texto
    completo sigue en el DOM para lectores de pantalla); quedan tamaños sueltos en insignias y cabecera
    heredados del prototipo (R2-5, ver C4); `/buscar` viejo sigue publicando menores (R2-6, tarea de
    auditoría en `BACKLOG.md`); el estado de error sólo está revisado por código (R2-7, no se para el
    canónico para una captura).
- **Nivel**: 1 (cumplimiento de invariantes) y 2 (presentación).

### 21. Lo que el QA destapó fuera de esta pantalla (tarea aparte, anotada)

- **`/buscar` (página vieja) también pinta `f.nombre` sin `nombreVisible`**. Misma regla, otra
  superficie. Se corrige sólo el endpoint compartido (`/api/buscar`) en esta tarea; la página queda en
  `BACKLOG.md` como auditoría obligatoria de todas las superficies de búsqueda.
- **La web vieja no compila en `next dev` con Turbopack** (confirmado de nuevo por el QA): los
  recorridos e2e antiguos siguen en rojo por eso, no por la pantalla 2. Ya estaba anotado en la
  decisión 18 y en `BACKLOG.md`.
- **El p95 de 800 ms no se puede medir en dev**: el QA lo declara no concluyente y la consulta de
  clasificación tarda 17 ms en PostgreSQL. La medición de p95 real exige build de producción y queda
  para la tarea de despliegue.

## 2026-11-04 · Sesión 3 — métricas para el panel, V-E-D y tema claro/oscuro

Decisiones de David del 04/11/2026 (tarde) en `ESPECIFICACION.md`. Contrato de esta sesión en
[`docs/plataforma-web/SPEC-METRICAS-VED-TEMA.md`](docs/plataforma-web/SPEC-METRICAS-VED-TEMA.md).

### 22. `metricas-facylf.json`: qué mide el proyecto para que el panel no calcule

- **Qué se hizo**: `scripts/metricas-facylf.mjs` genera en la raíz el JSON con la forma exacta pedida
  (`cyl`, `temporadas`, `ritmo`). Lógica pura en `scripts/lib/metricas-facylf.mjs` (9 pruebas) y un
  sondeo **en memoria** para el servidor (`scripts/lib/metricas-servidor-remoto.mjs`, por SSH a
  `docker exec -i facylf-monitor node -`; no se instala nada allí). Semántica completa en
  [`docs/plataforma-web/METRICAS-PANEL.md`](docs/plataforma-web/METRICAS-PANEL.md).
- **Qué es una competición**: una **edición de competición** (una liga/división en una temporada). Es
  la unidad que ya usa el proyecto para decidir si una competición está terminada y la que aparece en
  la tabla de cobertura por temporada.
- **Cuándo está completa**: cuando **todos sus grupos** tienen `ops.coverage_checkpoint.visibility_state
  = 'completa'`. `parcial_privada` no cuenta: la fuente publica menos, pero falta dato. Es el criterio
  estricto de «todas las jornadas, todos los resultados y todas las actas» que ya usa el proyecto.
- **Total**: unión de las competiciones que conocen las colas de CyL del PC y del servidor y las que ya
  están en el canónico, sin duplicar por `(temporada, código)`. Así no se pierden las que sólo conoce
  una máquina ni las históricas que sólo están importadas.
- **Rol de lectura**: se lee el canónico con `DATABASE_URL_PUBLICADOR`, no con el rol de la web. El rol
  `facylf_lector` tiene una política RLS restrictiva (`web_sin_la_preferente`) que esconde 34 ediciones
  de La Preferente en CyL; el panel mide la **ingesta**, no la oferta pública de la web, y tiene que
  verlas. Sólo se hacen `SELECT`.
- **Ritmo**: peticiones de los últimos **5 minutos**, expresadas por minuto (90 en 5 min = 18/min), en
  cada máquina y para todas las federaciones. No es la media histórica. Una ventana de 60 s daba ceros
  y picos de ráfaga que no describían la máquina; 5 min sigue siendo «ahora» para un panel que se
  refresca cada minuto. PC se mide en las colas locales; servidor, por SSH leyendo sus colas.
- **Fallo**: si falla una fuente (SSH, canónico o una cola ilegible) **no se escribe nada**: se conserva
  el JSON anterior y se sale con error. Mejor un dato viejo con su `medido` que un cero falso.
- **Publicado el 04/11/2026**: 889 competiciones, 133 completas (85 % por hacer), 15 temporadas,
  ritmo del momento 0/min en el PC y ~18/min en el servidor. El fichero se versiona como foto; el
  script lo regenera.
- **Refresco**: David autorizó el 04/11/2026 una tarea programada **cada 5 minutos** (no cada minuto:
  es suficiente y no carga la máquina). `scripts/registrar-tarea-metricas.ps1` la crea como «FACyLF
  metricas panel» (instancia única, ventana oculta, `-Quitar` la borra). La escritura es **atómica**
  (temporal propio del proceso + `rename`), para que el panel nunca lea un JSON a medias. La primera
  vuelta se ejecutó a mano y dejó el fichero actualizado.
- **Nivel**: 2 (medición) y 3 (la programación, ya autorizada).

### 23. V-E-D en toda la aplicación, sin tocar el dato

- **Qué se hizo**: `apps/web/src/lib/forma-equipo.ts` es la **única** traducción (`G→V`, `E→E`,
  `P→D`, y `Victoria/Empate/Derrota` como palabra accesible). Se aplica en la clasificación (cabecera
  `V-E-D`, insignias V/E/D, título y `aria-label` con la palabra), `Racha`, la ficha de equipo y las
  actuaciones de jugador.
- **Qué NO se cambia**: el `Signo` del dominio (`packages/dominio`), el SQL de rachas y los mapas
  `G/E/P` del repositorio local. Cambiar el dato para un cambio de presentación habría roto contratos y
  pruebas sin necesidad.
- **Recuentos**: las columnas numéricas de ganados/empatados/perdidos (p. ej. `G`, `E`, `P`, `GF`) y las
  tarjetas «Ganados/Perdidos» **siguen como estaban**: son recuentos, no la forma del equipo. La forma
  es la racha de últimos resultados.
- **Nivel**: 2 (decisión de David).

### 24. Tema claro/oscuro de verdad: cookie, servidor y control (sólo en las rutas migradas)

- **Qué se hizo**: `layout.tsx` lee la cookie `tema` con `cookies()` (Next 16, asíncrono) y escribe
  `<html data-tema="claro|oscuro">`; el primer HTML ya sale con el tema correcto, sin `useEffect` ni
  parpadeo. Cookie ausente o inválida → claro. Botón `BotonTema` en la cabecera (44×44, icono sol/luna,
  nombre accesible «Cambiar a tema…», 365 días, `SameSite=Lax`) que cambia `data-tema` al instante sin
  recargar y persiste al recargar. Tokens de `tokens.css` ya estaban.
- **Sólo donde la presentación está migrada**: `apps/web/src/proxy.ts` (convención de Next 16; sustituye
  a `middleware.ts`) deja la ruta en `x-pathname`; el layout aplica el tema sólo en `/explorar…`. En las
  páginas viejas se fuerza `data-tema="claro"` y **no se pinta el botón**. Sin esto, el oscuro dejaba
  `/canonico` con 1.785 nodos de contraste serios y los KPI a 1,15:1, porque esas páginas usan colores
  literales (deuda previa de `DESIGN.md` §2); ahora se quedan en sus 401 nodos preexistentes de claro,
  que se retiran al migrarlas (W9).
- **Navegación cliente**: `CabeceraSitioActiva` recalcula el permiso con `usePathname` y, sólo al cambiar
  de ruta, sincroniza el atributo y el botón (cookie en migrada, claro en vieja); el primer render no se
  toca porque el servidor ya lo dejó bien.
- **Orden de foco**: el botón va **después de la `<nav>` en el DOM** (los iconos pendientes están
  desactivados), de modo que Tab sigue el orden visual: logo → Explorar → tema → buscador, en 1280 y en
  400 (en móvil nav y tema comparten fila).
- **Coste asumido**: `cookies()`/`headers()` en el layout raíz hacen dinámicas todas las rutas. Es el
  precio de resolver el tema en el servidor; se documenta para la etapa de rendimiento.
- **Nivel**: 2 (pantalla ya especificada y sistema de diseño existente).

### 25. `resumen:` en `ESTADO-AGENTE.md`

- **Qué se hizo**: se añade un campo `resumen:` en llano al bloque de estado (lo lee el mismo panel). No
  sustituye a los campos del protocolo: los acompaña con una frase que se entiende sin contexto.
- **Nivel**: 1.

### 26. La proyección de lectura deja de proyectar la federación `pruebas`

- **Qué pasó**: la suite completa falló una vez al borrar `team_entry` de la federación de pruebas
  porque la proyección (tarea del PC cada 15 min) había vuelto a insertar agregados de `analytics`
  para esos grupos entre la limpieza y el borrado. Es el punto 5 de la deuda de `INFORME-PRUEBAS.md`,
  convertido en fallo intermitente real.
- **Qué se hizo**: `scripts/proyectar-lectura.mjs` excluye `f.codigo = 'pruebas'` en el `FILTRO`. Es
  una federación de laboratorio: sus grupos los crean y borran las suites del importador, no se
  publica. Sin este filtro, cualquier pasada de la proyección puede pisar una limpieza en curso.
- **Qué no se toca**: el código de la proyección ni sus migraciones; sólo el filtro de selección.
- **Nivel**: 1 (deuda de pruebas que hacía fallar la suite de forma intermitente).

### 27. Primera tanda de la web: **cuatro pantallas**, no veintidós

- **Decisión de David (04/11/2026, noche)**: la primera tanda son las cuatro pantallas que necesita
  CyL para ser útil: **clasificación, jornada, acta del partido y ficha de equipo**. El resto se añade
  después, con la misma base. El prototipo entero es la referencia, no la primera entrega.
- **Consecuencia para el backlog**: no se abren 22 frentes. La clasificación ya está terminada (pantalla
  2); las siguientes son la **jornada** (pestaña Jornadas y detalle de una jornada), el **acta del
  partido** (pantalla 3) y la **ficha de equipo** (pantalla 4). Cada una se hará como la 2: contra el
  prototipo, sobre el sistema de diseño, con datos reales de CyL, pruebas y capturas, y decidiendo
  componente a componente si se adapta o se rehace.
- **Nivel**: 3 (alcance) → ejecutado como planificación.

### 28. Revisión de la pantalla 2 por David (05/11/2026)

David revisó la pantalla 2 y dejó siete correcciones; las siete van también a
`DOCTRINA-CALIDAD.md` §8 y §9.

- **Escudos de club**: los clubes/equipos tienen escudo y ya se guardaba en `core.club_asset`; hay que
  enseñarlo en clasificación, fichas y jornadas, con el marcador determinista como respaldo si no hay
  imagen. No se inventan escudos.
- **Escudo de federación en la competición**: en la cabecera se pone el escudo de la federación, no las
  siglas de la competición («LN»). Hay que recolectarlo del portal oficial, guardarlo con su
  procedencia (`fuente_url`, `fuente_descripcion`) y servirlo desde el proyecto; si una federación no
  lo publica, queda el respaldo con sus siglas y color, nunca un escudo inventado.
- **Zonas de clasificación**: la Liga Nacional Juvenil de CyL descienden **3**, no 2. Se fija el
  reglamento en `core.reglamento_grupo` (migración 0055) para que la vista lo use por delante de lo
  aprendido: **1 asciende** (campeón a División de Honor, Normas LNJ RFEF art. 9) y **3 descienden**
  (bases de la RFCYLF, confirmado por David). La fase de ascenso/promoción no se inventa: cuando las
  bases digan cuántos puestos la juegan, se añade otra fila. Se prueba con el grupo real 797/3769.
- **Fuera los textos que no le importan al cliente** (`DOCTRINA-CALIDAD.md` §8): «zonas según lo
  ocurrido en las últimas temporadas», «cómo se ha calculado», el desplegable «Sobre estos datos», la
  explicación del estado vacío y el pie de página con política de temporadas. Regla: de cada texto,
  ¿sirve para decidir o actuar? Si no, se borra; no se sustituye por otro.
- **Menores** (`DOCTRINA-CALIDAD.md` §9): la federación tiene consentimiento de tratamiento, así que
  **el nombre se publica** igual que el de un adulto (buscador, goleadores, plantillas, actas). Las
  **fotos** de personas, y en particular de menores, **no se publican** de momento. Se actualizan
  `CLAUDE.md`, `AGENTS.md` y `SEGURIDAD-OPERACION.md` §5.
- **Siguen las páginas del prototipo**, una a una, con el prototipo delante.
- **Registro de usuarios**: diseño preparado (pantalla de entrada/creación de cuenta y acceso desde la
  cabecera) para recordar clubes, equipos y jugadores favoritos y tener accesos rápidos a horarios,
  resultados y avisos. El registro real (backend) vendrá después; no se finge que funciona.

**Nivel**: 2/3 según la pieza. Implementado en la misma sesión salvo lo que se indica como pendiente.

---

## Preguntas de Nivel 3 que quedan abiertas (no bloquean el trabajo)


1. ~~**¿Se reutiliza `apps/web` (Next) o se rehace contra el diseño?**~~ **DECIDIDA por David el
   2026-11-04**: el diseño manda y la presentación se rehace contra el prototipo; se conservan
   consultas, contratos, ingesta y todo lo que no sea presentación (ver decisión 9 arriba).
2. **¿Cuántas de las 22 pantallas entran en la primera tanda?** Mientras no se decida, se hace una cada
   vez; la 2 ya tiene primera versión.
3. **¿`V-E-D` o `G-E-P`?** La pantalla 2 usa `G-E-P`, que es lo que enseña el prototipo en esa pantalla.
   Si se elige `V-E-D`, se cambia en la cabecera de la tabla y en la consulta de rachas.
