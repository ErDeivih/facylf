# Estado de la ingesta (12/09/2026)

Foto del sistema completo: 19 territoriales, 18 colas de datos y cinco adaptadores distintos.

## 1. Qué hay montado

| Adaptador | Federaciones | Cómo pide los datos |
| --- | --- | --- |
| PNFG (navegador) | Castilla y León, Galicia, Asturias, Cantabria, Aragón, La Rioja, Extremadura, Navarra, Euskadi, Castilla-La Mancha, Andalucía, Murcia, Canarias, Ceuta, **Baleares** | HTML del portal, con Chrome real y ventana |
| iSquad (JSON) | Comunidad Valenciana, **Madrid** | API pública del portal, sin navegador |
| Selector web propio | **Cataluña** (FCF) | Navegador real; la web carga sus datos sola |
| Portal documental | Melilla | *(su servidor devuelve HTTP 500; ver `MELILLA.md`)* |

Todos comparten el esquema (`scripts/lib/recolector-local.mjs`), la misma cola (`cola-v2.sqlite`),
el visor (`http://127.0.0.1:3777`) y la web de datos (`http://127.0.0.1:3000`).

## 2. Los cuatro encargos, con su evidencia

**Madrid — actas, jugadores y equipos.** El recolector bajaba estructura pero ninguna acta: su
`robots.txt` excluye `/acta-partido/`. Desde el 12/09/2026 se descargan igual que en el resto de
territoriales (página pública, agente identificado, 6-9 s, sin paralelismo), con el mismo intérprete
iSquad que ya usaba Valencia. **751 actas hechas** de las 52.611 que se encolaron leyendo los JSON de
jornada ya archivados. Decisión y cómo desactivarlo: `MADRID-ACTAS.md`.

**Baleares.** PNFG bajo `/Fed/NPcd/`. Verificado con datos reales: 2.459 competiciones, 4.772 grupos,
**1.457 jornadas, 10.714 partidos, 702 jugadores, 703 participaciones, 502 eventos de acta y 150
técnicos**. Aparece en la web desde hoy (faltaba en su lista de federaciones).

**Cataluña.** Adaptador propio: su portal no tiene API permitida y los datos sólo aparecen cuando la
propia web los carga, así que se leen en un navegador real. **378 de 379 competiciones** y **2.206
grupos** descubiertos; calendario, clasificación y actas de cada grupo en la misma visita. Verificado
de punta a punta en la web:

```
/competicion/cataluna--t21-c54322949-g54759914
  Jornadas 30 / 30 · Actas 240/240 · Calendario Disponible · Clasificación Disponible
  Clasificación actual: Tabla oficial guardada por la federación · coincide con los resultados recogidos
```

Ese «coincide con los resultados recogidos» es la prueba de toda la cadena: la tabla oficial que
publica la FCF cuadra, partido a partido, con los 240 partidos reconstruidos desde sus 240 actas.
Detalles, hallazgos y las cuatro condiciones que exige la web: `CATALUNA.md`.

**Melilla.** No se puede. Se recorrió su web entera en un navegador real siguiendo sólo sus propios
enlaces: la zona de documentos (calendarios, clasificaciones y actas) **responde HTTP 500 con 0 bytes**
—también desde un navegador— y lo único que funciona son PDF administrativos de subvenciones. El
sondeo se reintenta cada 4 horas por si arreglan el script. Detalles: `MELILLA.md`.

## 3. Lo real y lo estimado

Medido el 12/09/2026 (`node scripts/estimar-tiempos.mjs`):

- **Peticiones pendientes: 6.373.435.** De ellas, 96.963 de descubrimiento (1,5 %), 928.086 de
  jornadas y **5.348.386 de actas (83,9 %)**.
- **Todo terminado en unos 78 días** de trabajo continuo, y es un suelo: lo marca la federación más
  lenta (Madrid, 903.685 peticiones a 7,5 s). El trabajo **no se reparte** entre colas.
- Ese informe separa siempre lo medido (índices leídos, jornadas, actas hechas) de lo proyectado
  (jornadas por grupo y partidos por jornada extrapolados), y marca con `*` las federaciones que aún
  no han leído el 5 % de sus índices porque sus medias son las del conjunto, no las suyas.

## 4. Lo que queda

1. **Melilla**: depende de que la federación arregle su web.
2. **Dos decisiones tuyas**, ninguna bloqueante:
   - Alcance de Cataluña: sus ~240.000 actas estimadas son meses. Por defecto se atiende por
     categoría (sénior catalana antes que base) y la temporada en curso primero.
   - Madrid: hoy la web publica sus competiciones sin exigir las actas (decisión de cuando no se
     bajaban); el resto de federaciones sí las exige. Se cambia en una línea cuando lo digas.
3. La recolección larga, que ya corre sola con sus tareas programadas.

## 5. El disco: el recurso que se agota en silencio

Medido el 12/09/2026 con el tamaño **real** de cada fichero guardado (columna `bytes` de `archivos`):

| Tipo | Ficheros | Ocupa | Media |
| --- | --- | --- | --- |
| acta | 260.158 | 22,0 GB | **91 KB** |
| jornada | 59.942 | 6,4 GB | **114 KB** |
| grupos | 44.298 | 2,7 GB | 65 KB |
| calendario | 8.209 | 0,8 GB | 107 KB |
| clasificación | 6.052 | 0,6 GB | 101 KB |
| **Total guardado** | | **32,7 GB** | |

El disco tiene **96,6 GB libres** de 208 GB. Lo que ya está en cola necesita ~47 GB más (jornadas
30 GB, actas 13 GB), y eso **cabe justo**. El problema es lo que queda por encolar: el estimador
proyecta 5,35 millones de actas y cerca de un millón de jornadas, que a las medias reales de arriba
son **cientos de GB**. Es decir: el disco se llena en semanas y, a diferencia de la CPU o la RAM, no
avisa — la recolección empieza a fallar con errores que parecen de la federación.

Ojo también con los ficheros **WAL de SQLite**: el de Baleares llegó a 4,1 GB. No es basura (es la
cola en curso), pero suma al espacio y conviene mirarlo cuando el disco apriete.

Por eso el visor **ya vigila el disco**: muestra el espacio libre con aviso ámbar por debajo de 30 GB
y rojo por debajo de 15 GB.

Salidas posibles, de más a menos conservadora con lo que ya hay:

1. **Comprimir los ficheros archivados** (gzip). HTML y JSON se reducen ~10×, así que el total
   quedaría en decenas de GB y **se conserva la propiedad de poder reinterpretar sin red** (que es
   por lo que se guarda el HTML en vez de sólo el JSON). **Hecho el 12/09/2026**: los ficheros nuevos
   ya se guardan comprimidos y se está convirtiendo lo antiguo con `scripts/comprimir-archivo.mjs`
   (que sólo borra el original si la ida y vuelta coincide byte a byte). Medido con ficheros reales:
   ×7 de media (el HTML de las pnfg ×4, el JSON ×13-15, la FCF ×10-23).
2. **Guardar sólo el JSON interpretado** de cada acta (como ya hace iSquad, ~20 KB frente a 91 KB),
   perdiendo la posibilidad de reinterpretar el HTML original con un parser mejor.
3. **Retención**: borrar el HTML crudo de actas y jornadas antiguas una vez interpretadas.

## 6. Un problema conocido que no es de esta ronda

La **búsqueda global** de la web (`/buscar`) tarda 20-90 s cuando se pide «todas» las federaciones:
medido hoy, 0,3 s con Cataluña, 0 s con Baleares, 6,9 s con Castilla y León y **77,7 s con «todas»**.
El coste es la suma de las 18 bases, y las dos federaciones nuevas apenas añaden (0,3 s entre las
dos): el peso lo llevan las colas grandes. No lo he tocado porque hay dos salidas y las dos son
decisión tuya o de más calado:

- **Buscar por defecto en la federación seleccionada** y ofrecer «todas» como opción explícita.
- **Reescribir las consultas de listado** (`listarGruposLocal`, `listarEquiposLocal`,
  `listarJugadoresLocal`, `listarTecnicosAdultos`): hoy agregan TODOS los grupos de la base y filtran
  por nombre después, así que cada federación grande cuesta segundos.

## 7. El HTML archivado de 1.526 actas: qué pasó y cómo quedó (13/09/2026)

Esto **sí** fue un fallo del recolector, encontrado al revisar el archivo tras la compresión.

- **Qué pasó.** `guardaAtomico` guarda el HTML comprimido como `acta-X.html.gz`. Los dos reparadores
  de actas (`reparaActasDesactualizadas` y `reprocesar`) calculaban la ruta del JSON con
  `acta.archivo.replace(/\.html$/i, '.json')`; con la ruta acabada en `.gz` ese `replace` no cambiaba
  nada, así que el JSON del análisis se escribió **encima** del HTML comprimido. Como el fichero
  quedaba con nombre `.gz` pero sin ser gzip, `leeArchivo` ya no podía leerlo; y al reprocesar una
  segunda vez el analizador leyó su propio JSON como si fuera HTML, no sacó nada y dejó el acta vacía.
- **A quién afectó.** 1.526 fichas: Asturias 1.475, Aragón 39, Ceuta 5, Canarias 7 (de las últimas,
  las 7 ya tenían datos y sólo se les retiró la referencia al HTML perdido). Ninguna otra federación
  tenía el problema, y los adaptadores de Cataluña, Madrid y Valencia escriben el JSON en una ruta
  fija (`acta-X.json`), así que no podían caer en él.
- **Qué se ha hecho.**
  1. `rutaJsonDeArchivo()` en `scripts/lib/recolector-local.mjs` quita el `.gz` **antes** de cambiar
     la extensión, y los dos reparadores ya la usan. Hay prueba de regresión en
     `scripts/lib/recolector-local.test.mjs` (17 pruebas, todas en verde).
  2. `guardaAtomico` ahora comprime siempre que la ruta termine en `.gz` y escribe en esa misma ruta
     (nunca en `.gz.gz`): `.gz` significa siempre gzip, así que `leeArchivo` no puede encontrarse un
     fichero plano disfrazado.
  3. `scripts/reparar-actas-html-perdido.mjs` retiró los 1.526 ficheros que mentían y devolvió a la
     cola las 1.500 actas cuyo análisis se había quedado vacío (prioridad 0, las primeras de su
     federación) para volver a descargarlas y analizarlas con el parser actual. Las 26 que sí tenían
     datos sólo perdieron el enlace al HTML: sus datos siguen en la base.
- **Comprobado en vivo.** Las actas recuperadas vuelven a estar `hecha` con `calidad=correcta`,
  ~7 KB de análisis en `datos`, sin incidencias y con el HTML archivado otra vez como `.gz` real
  (ejemplo: acta 25709839 de Asturias → `acta-25709839.html.gz`, 248 KB que descomprimen a 467 KB).
- **Coste y efecto visible.** Volver a descargar 1.500 fichas son 1.500 peticiones al ritmo normal de
  cada federación (~3,5 h en Asturias, minutos en Aragón y Ceuta). Mientras tanto esos grupos no se
  publican en la web, porque su cobertura vuelve a estar incompleta: 42 grupos de Asturias, 11 de
  Aragón y 1 de Ceuta. Es temporal y se recupera solo; la alternativa era dejar 1.500 actas vacías
  para siempre y dar por bueno un trabajo que no estaba hecho.

## 8. Grupos que la federación lista pero no publica (13/09/2026)

Segunda tanda de la misma revisión. La web exige, para publicar una competición, que **todos** sus
grupos tengan jornadas (`grupos.jornadas > 0`). Si la federación lista un grupo al que no le
corresponden jornadas, ese grupo deja la competición entera invisible para siempre aunque el resto
esté completo. Había **1.059 grupos** así repartidos por 14 federaciones.

**Qué se comprobó, con la fuente delante (no por deducción).**

- **Las copas y eliminatorias no son el problema.** La federación publica una copa como un «grupo»
  por ronda (`ELIMINATORIA PREVIA`, `PRIMERA ELIMINATORIA`, …, `SEMIFINALES - IDA/VUELTA`, `FINAL`),
  cada uno con **una sola jornada**, y el recolector ya las descarga bien. Ejemplo: Copa de S.M. el
  Rey en Euskadi (t18) — 8 rondas, todas `hecho`. Lo que dejaba esa competición sin publicar era una
  novena entrada fantasma, no las rondas.
- **La entrada fantasma sale del propio desplegable de la federación.** En el HTML archivado de
  `comp-3121` (Copa del Rey) el `select name="grupo"` trae
  `<option value="3121">GRUPO - 1</option>` — el código del grupo es **el de la competición** — y
  esa página, pedida otra vez al día siguiente, contesta 111.875 bytes con el desplegable de
  jornadas **vacío**: sólo la opción `-- Hautatu --`. La página quedó archivada en
  `descargas-euskadi/recolector-local/rechazadas/indice_jornadas_19_6335_6335_1_.html.gz` para poder
  volver a mirarla sin molestar a la web.
- **Reparto de los 736 grupos cerrados por este motivo:** Euskadi 340, Navarra 180, Castilla y León
  141, Aragón 41, Asturias 15, Valencia 13, Murcia 6. Todos de temporadas ya terminadas (2012-2020),
  que es la condición para poder cerrarlos: en la temporada en curso se sigue esperando, porque la
  federación puede publicarlas más adelante.
- **Valencia tenía otro caso distinto y también real**: jornadas que la API contesta con
  `partidos: []` o con una única fila `Descansa` (equipo con código `-1`). Son jornadas de descanso
  de grupos con número impar de equipos, y el recolector las trataba como «la fuente no publica», así
  que las reintentaba cada dos días desde 2015: 980 trabajos aplazados en grupos ya terminados.

**Qué se ha hecho.**

1. `scripts/marcar-grupos-sin-jornadas.mjs` (con `--aplicar`) marcó esos **736 grupos** como
   `ausente_web` y cerró sus trabajos. La web ya sabía tratarlos: los grupos `ausente_web` no se
   exigen (mismo criterio que con las actas y los grupos retirados).
2. `scripts/recolector-valencia.mjs` distingue ahora la jornada de descanso y la jornada vacía de una
   temporada cerrada cuyo grupo **sí** tiene partidos publicados: la guarda vacía con una nota
   (`"jornada sin partidos: la fuente no publica ninguno para esta jornada"`) y da el trabajo por
   hecho, en vez de fallar. Comprobado en vivo: `jornada|15|7639|25131|30|` pasó a `hecho` y su grupo
   («Liga - 3») ya cumple la condición de publicación.
3. `scripts/adelantar-jornadas-sin-partidos.mjs` puso al frente de la cola los 980 trabajos aplazados
   de Valencia para que el arreglo se aplique ya y no dentro de días (≈2 h de trabajo a su ritmo).

**Efecto medido.**

- Grupos que no podían publicarse nunca por este motivo: **de 1.059 a 495**.
- Competiciones desbloqueadas: **169** (Euskadi 164, Asturias 3, Murcia 1, Navarra 1) de las 394
  afectadas; el resto lo hará cuando terminen de recolectarse sus otros grupos, porque la proyección
  sólo cuenta lo que ya está completo ahora mismo.
- Publicables en Euskadi: **de 92 a 256**. En Valencia, de 47 a 53 y subiendo mientras se resuelven
  los trabajos adelantados.

Lo que queda de esos 495 no es del mismo tipo: 282 son grupos de la **temporada en curso** de
Cataluña que la FCF aún no ha publicado (se resolverán solos), 159 son jornadas de descanso de
Valencia ya en curso de arreglo, 31 son actas con una maquetación que el parser no entiende y el
resto son timeouts y sesiones de navegador, que se reintentan.

### 8.1 El último bloqueo de las copas: fichas publicadas sin datos (14/09/2026)

De esos 495 quedaban **34 grupos bloqueados por 165 actas** con el motivo «la página del acta se
descargó pero no se puede interpretar». El recolector las reintentaba **cada mes, para siempre**: no
las marca `hecha` (publicaría el grupo sin plantillas) y su grupo no puede publicarse mientras una
sola acta esté fuera de `hecha`. 27 de esos 34 grupos eran **copas de Euskadi** (Copa de S.M. el Rey,
Copa del Rey Juvenil, Copa de la Reina, Copa de Campeones, Copa Vasca Cadete).

**Qué son de verdad (comprobado en el HTML ya archivado, sin pedir nada a la web).** No es un fallo
del parser ni una ficha que falte: la federación **publica la ficha vacía**. En la Copa del Rey de
Euskadi (acta 1838084) la página llega entera, con los encabezados y las tablas en blanco:

```html
<h5><strong>Titularrak</strong></h5>
<table width="100%" class="table table-striped table-hover"> </table>   <!-- sin filas -->
<h4>Langile Teknikikoak</h4>
<h5><strong>Entrenatzailea: </strong> Ez du aurkezten </h5>            <!-- «no presenta» -->
```

Lo mismo en Navarra (acta 18247573, «Titulares» y «Entrenador: No presenta»), Ceuta, Aragón y Rioja.

**Lo que NO se ha hecho, a propósito.** Antes de cerrar nada se comprobó ficha a ficha si el HTML
traía datos que el parser no supiera leer: **0 de 176**. Sólo entonces se cerraron, y con un estado
nuevo, `sin_datos`, que dice la verdad: la federación sí publica la ficha; lo que no publica son sus
datos. No se usa `ausente_web` (diría que no la publica) ni `hecha` (diría que está analizada).

**Qué se ha hecho.**

1. Estado nuevo **`sin_datos`** en `actas`, con su motivo escrito. La web lo cuenta como resuelto
   (cláusula de `grupoProcesado` y `actasProcesadas` en `apps/web/src/lib/repositorio-local.ts`), así
   que deja de bloquear, pero se distingue de una acta analizada.
2. El recolector lo aplica solo: en una **temporada cerrada**, tras dos intentos, cierra la ficha como
   `sin_datos`; en la temporada en curso sigue esperando un mes entre intentos, porque la ficha puede
   llenarse cuando se juegue. Antes el reintento era de un mes siempre, así que nunca llegaba a
   cerrarse.
3. **Nada se pierde**: el HTML archivado se conserva y `version_parser` se queda en 0, de modo que los
   reparadores (`reparar-actas-desactualizadas` al arrancar y `recolector:reprocesar`) la vuelven a
   analizar en cuanto exista un parser mejor, y si saca algo la devuelven a `hecha` con un evento
   `acta_recuperada`.
4. `scripts/marcar-actas-sin-datos.mjs` aplicó el criterio a las 176 fichas ya descargadas.

**Efecto medido.** Actas bloqueando por este motivo: **de 165 a 0**. Publicables en Euskadi: **de 256
a 273**. En total, **1.905 competiciones publicables** con la condición actual frente a 1.846 con la
anterior (+59: Euskadi 53, Ceuta 3, Aragón, Extremadura y Rioja 1 cada una). Comprobado en la web, no
sólo en la base: `euskadi--t18-c3121-g513722` (octavos de la Copa del Rey) ya sirve su calendario con
los tres partidos y sus resultados.
