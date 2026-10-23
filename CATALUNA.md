# Cataluña (FCF) — estado y plan

## Por qué necesita un adaptador propio

La FCF no usa PNFG ni iSquad. Su portal de competiciones (`https://www.fcf.cat/ca/competicio`) es una
aplicación Next.js cuyo HTML inicial **no trae los datos**: son los cuatro desplegables (temporada,
disciplina, competición, grupo) los que van revelando los identificadores, y los datos aparecen
después, cuando la propia página los pide. Su `robots.txt` lo confirma:

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /_next/
Disallow: /*/cerca
```

Regla que se respeta: **no se fabrican llamadas a `/api/`**. Lo que se hace es abrir páginas
permitidas en un navegador real y dejar que la propia web cargue sus subrecursos, como haría
cualquier persona.

## Estado real (12/09/2026, 19:15)

| Métrica | Valor |
| --- | --- |
| Temporadas | 2 (2025-26 y 2026-27) |
| Disciplinas | 10 |
| Competiciones catalogadas | 379 |
| Competiciones con identificador | 266 |
| Grupos descubiertos | 2.107 |
| **Grupos con identificador y HTML** | **1.555** |
| Incidencias | 2 (históricas, ya corregidas) |

El descubrimiento corre en la tarea `FACyLF catalogo cataluna` (06:45) y en una sesión larga
permanente, a 8-12 s por acción. Guarda progreso después de cada selección, así que se puede
interrumpir sin perder nada.

### Error corregido en esta sesión

Durante horas el catálogo se quedó en **0 grupos con identificador**. La causa era de diseño, no de
la web:

1. `resuelveCompeticiones()` resolvía el identificador de cada competición y dejaba los grupos para
   una fase posterior;
2. esa fase (`resuelveGrupos`) casi nunca llegaba a ejecutarse, porque el presupuesto de acciones de
   cada sesión se agotaba resolviendo competiciones;
3. y cualquier fallo en un grupo tumbaba la sesión entera, con lo que el siguiente intento volvía a
   empezar por el mismo punto.

Ahora los grupos se resuelven **en la misma pasada** que su competición (la lista ya está abierta, no
hay recarga extra), el desplegable se reabre con su rótulo real —cambia de «Grup» al nombre del grupo
elegido, y eso rompía la búsqueda anterior—, se espera a que el `grupId` **cambie** respecto al
anterior y cada fallo se contabiliza por grupo (`fallos`) sin tumbar la sesión. Resultado medido: de
0 a 1.555 grupos con identificador, sin una sola incidencia nueva.

## Volumen: lo que costará Cataluña

Es, con diferencia, la federación más grande. Un grupo de fútbol 11 tiene ~30 jornadas:

- **Calendario completo de un grupo**: la vista `CALENDARI` trae las 30 jornadas con su fecha, pero
  los partidos sólo se pintan al desplegar cada jornada (30 acciones por grupo, ~9,5 s cada una).
  La vista `CLASSIFICACIÓ` sí trae la tabla completa de una vez, y `GOLS` la tabla de goleadores.
- **Actas**: cada partido jugado enlaza a `/ca/competicio/acta/<codacta>`. Con ~16 equipos por grupo
  son ~240 partidos por grupo y temporada; con 2.107 grupos descubiertos eso son **cientos de miles
  de fichas**.

Traducido al ritmo respetuoso de 8-12 s por acción: completar el calendario de todos los grupos
descubiertos son **semanas** de trabajo continuo, y sus actas, **meses**. Es la misma cuenta que ya
sale para el conjunto del proyecto (5,3 millones de peticiones pendientes, 81,6 % de ellas actas, y
la federación más lenta a 64 días).

Por eso Cataluña está **en fase de descubrimiento**: primero el catálogo completo (competiciones,
grupos y su HTML), y sólo después los datos, por orden de prioridad, empezando por la temporada en
curso y las categorías sénior.

## Cola común (esquema estándar)

`scripts/recolector-cataluna-datos.mjs` vuelca el catálogo descubierto a la **misma** cola SQLite que
el resto de federaciones, para que la web y el visor vean Cataluña como a las demás:

```
node scripts/recolector-cataluna-datos.mjs preparar   # sin abrir la red
node scripts/recolector-cataluna-datos.mjs arrancar   # calendario, clasificación y actas
node scripts/recolector-cataluna-datos.mjs reparar    # reinterpreta sin red
node scripts/recolector-cataluna-datos.mjs estado
```

### Las cuatro condiciones que la web exige y que había que cumplir a mano

Las tres primeras no dependen de las actas, así que un fallo en cualquiera de ellas habría dejado
semanas de recolección sin ningún resultado visible. Las tres se encontraron auditando la cadena, no
porque algo fallara a la vista.

1. **La federación tiene que existir en la web.** `apps/web/src/lib/repositorio-local.ts` reconoce las
   federaciones por código; Cataluña y Baleares **no estaban en la lista**, de modo que al pedir
   `cataluna--…` la web caía a la federación por defecto y servía un 404 contra la base de Castilla y
   León. Ya están las dos (18 federaciones en total).

2. **Los ficheros de cada grupo van bajo `recolector-local/`.** El resto de adaptadores guardan ahí el
   calendario y la clasificación, y la web construye la ruta desde ese directorio. Este adaptador los
   escribía un nivel por encima (`descargas-cataluna/t21-2025-26/…`), así que la web no encontraba ni
   el calendario ni la tabla oficial. Se movieron las carpetas y se corrigieron las 1.397 rutas ya
   guardadas en `archivos`, `actas` y `jornadas`.

3. **`competiciones.grupos_comprobados_en`**: la web sólo publica una competición que tenga esa fecha,
   porque es su forma de saber que ya se conocen TODOS sus grupos. En las federaciones pnfg lo marca
   el trabajo `grupos`; en Cataluña no lo marcaba nadie, así que sus competiciones estaban al **0 %**.
   Ahora lo marca el volcado del catálogo, y sólo cuando **todos** los grupos de esa competición
   tienen identificador (si faltara uno, la web publicaría la competición creyendo que está entera).

4. **Formato de `clasificacion.json`**: la web lee ese fichero y espera un **array** de filas con los
   campos oficiales (posición, equipo, puntos, jugados, ganados, empatados, perdidos, últimos,
   sanción). Si no es un array, lo ignora y calcula la tabla por su cuenta. Antes se guardaba como
   objeto `{filas, html}`, así que la clasificación oficial de la FCF no llegaba a usarse nunca.

### Verificación final en la web

Con las cuatro condiciones cumplidas, la primera competición catalana completa (LLIGA NACIONAL
JUVENIL, GRUP 7) se ve ya en `http://127.0.0.1:3000/competicion/cataluna--t21-c54322949-g54759914`:

```
Jornadas 30 / 30 · Actas 240/240 · Calendario Disponible · Clasificación Disponible
Clasificación actual: Tabla oficial guardada por la federación · coincide con los resultados recogidos
1 BARCELONA, F.C. B   30  19  7  4   64  18  +46  64
```

Ese «coincide con los resultados recogidos» es la mejor prueba de toda la cadena: la tabla oficial que
desciframos de la web de la FCF cuadra, partido a partido, con los 240 partidos reconstruidos a partir
de sus 240 actas. Y las fichas de acta se sirven con sus alineaciones: 37 jugadores con dorsal y
portero, goles con minuto y lado, tarjetas y árbitros.

### La tabla de la FCF y cómo se descifra

La federación pinta en **una sola celda** las cifras de casa y de fuera pegadas: «1515» son 15 y 15,
«107» son 10 y 7, «98» son 9 y 8. Las columnas de goles (F y C) van como total. Se dedujo comparando
tres filas de la misma tabla con la aritmética de la competición.

El intérprete no adivina: prueba todas las formas de partir cada cifra y acepta la que respeta
`victorias + empates + derrotas = jugados`, prefiriendo además la que cuadra con los puntos oficiales
(`3×victorias + empates`). Cuando ninguna cuadra con los puntos, se queda la que respeta la aritmética
de los partidos: eso es una **sanción** (en el grupo 54322941 hay dos equipos con un punto menos de lo
que les correspondería, y la propia columna «Sanció» de la federación no lo refleja). Si ninguna
partición es coherente, la fila se descarta y se informa en el registro en vez de inventar números.

Verificado con datos reales: 16 equipos por grupo, todos con `G+E+P = 30` y puntos oficiales
correctos (por ejemplo, ARGENTONA: 58 puntos, 17-7-6).

Estado tras el primer volcado (12/09/2026):

```
2 temporadas · 267 competiciones · 1.570 grupos  →  3.409 trabajos
  catalogo_temporada  0/2      calendario    0/1570
  grupos              0/267    clasificacion 0/1570
```

Ya aparece en el visor (`http://127.0.0.1:3777`) con su reparto por temporada: 1.904 trabajos de
2025/26 y 1.505 de 2026/27.

## Lo que publica cada vista (medido, no supuesto)

| Vista | Qué trae | Coste |
| --- | --- | --- |
| `RESULTATS` | los partidos de **una** jornada con marcador y el aviso «ACTA TANCADA»; sin enlace al acta. Selector de jornadas en `data-jornada="1..N"` | 1 acción por jornada |
| `CALENDARI` | temporada entera con las 30 jornadas y sus fechas, pero **los partidos sólo se pintan al desplegar** cada jornada; incluye el enlace `/ca/competicio/acta/<codacta>` («VEURE ACTA») | 1 acción por jornada |
| `CLASSIFICACIÓ` | la tabla oficial completa (16 equipos) en una sola petición | 1 acción por grupo |
| `GOLS` | la tabla de goleadores (50 filas) en una sola petición | 1 acción por grupo |

Dos hechos que condicionan el diseño y que costó comprobarlos:

- El HTML que se guarda **justo después** de seleccionar el grupo todavía dice «Carregant dades…»:
  los datos llegan en una petición posterior que hace la propia página. Hay que esperar a que pinte.
- La ficha de acta **no** se puede pedir con `fetch` normal: responde `202` con un desafío
  («JavaScript is disabled… verify that you're not a robot»). Necesita navegador real, que es lo que
  ya usa este adaptador.

## Cadena de datos verificada con datos reales (12/09/2026)
`scripts/recolector-cataluna-datos.mjs arrancar` ya baja los datos y los deja en las mismas tablas
que el resto de federaciones. Lo medido en ejecuciones reales:

```
→ calendario|21|54322949|54759914||
  ✓ calendario: 30 jornadas, 240 partidos, 240 actas encoladas
→ acta|21|54322949|54759914|1|3783666
  ✓ acta 3783666: 1-1, 22 titulares, 38 jugadores, 2 eventos, 8 técnicos
```

Con eso la ficha queda utilizable de verdad: marcador, alineaciones con dorsal, portero, goles con
minuto y lado, tarjetas, cambios, árbitros, cuerpo técnico y clasificación del grupo. Además cada
equipo queda identificado con el código de club que publica la web (`equipos`), así que los partidos
se pueden enlazar con su equipo igual que en el resto de federaciones.

### Calidad medida, no supuesta

`node scripts/_diag-calidad-cataluna.mjs` compara el marcador (dato independiente que publica la
ficha) con la lista de goles interpretada. Sobre las primeras 77 actas:

```
marcador y goles cuadran: 76
descuadran:                1   (3783726: la ficha dice 2-1 y lista goles para 1-2)
titulares distintos de 22: 0
```

Ese caso no se corrige por nuestra cuenta: la web se contradice a sí misma en la misma página
(probablemente el marcador se ajustó después por una alineación indebida). Se guarda el marcador
oficial y el acta queda marcada **`revisar`** con la incidencia anotada, que es lo que ve el visor.

### La fuente se contradice a sí misma en ~4 actas de cada 100

Con 680 actas analizadas, en **28** la lista de goleadores no suma lo que dice el marcador del
cabecero. Ejemplo real (acta 3783769):

```
marcador del cabecero: 1 - 3
lista de goles:        0-1, 0-2, 0-3, 0-4   (los cuatro del visitante)
```

Los dos datos son de la propia ficha: la lista de goles es internamente coherente y el marcador
también, pero no coinciden entre sí (aquí, un gol que la federación acabó adjudicando al otro equipo
sin corregir la lista). No es un fallo del intérprete: en los 28 casos la lista cuadra consigo misma y
lo que falla es la coherencia de la web.

Consecuencia práctica: **manda el marcador del cabecero** (es el resultado oficial y es lo que usan
las clasificaciones) y esas actas quedan en `revisar`, así que un goleador puede salir con un gol de
más o de menos. Verificado que esto no afecta a las tablas: la clasificación del grupo donde aparecen
estos descuadres sigue coincidiendo con la oficial, porque ambas se calculan desde el marcador.

Otro fallo real que apareció en ese control: cuando un partido acaba **sin goles**, la sección de
goles no viene vacía, trae una fila de relleno («No hi ha gols registrats») que se estaba guardando
como si fuera un gol de un jugador inexistente.

Tres detalles más que costó averiguar y que están escritos en el código:

- **Una carga de página por grupo, no una por vista**: cambiar de pestaña y desplegar las 30 jornadas
  no genera tráfico (medido con las marcas de rendimiento del navegador), así que el calendario y la
  clasificación completa de un grupo se leen en una sola visita.
- **El lado de cada gol se deduce del marcador acumulado**, no del escudo: «0 - 1» significa que
  marcó el visitante. El escudo sólo se usa como último recurso y, si falla, el nombre del jugador se
  busca en las alineaciones ya leídas.
- **El cuerpo técnico tiene roles de dos palabras** («DELEGAT CAMP», «DELEGAT EQUIP», «A.T.S.»): si se
  corta por el primer espacio, el rol se come un apellido. Los roles están listados en el propio
  diccionario de la web.

### Orden de trabajo adaptado a los nombres catalanes

La función común de prioridades reconoce «alevín»/«benjamín» (con n final) y no las formas catalanas
(«ALEVÍ S11», «BENJAMÍ S9»), y como casi todas las competiciones de base se llaman «Promoció ascens …»
acababan todas en el primer nivel por delante de las ligas sénior. Para la FCF se corrige sólo aquí:
las categorías de base bajan a 80, y «PRIMERA CATALANA», «SEGONA CATALANA» y «TERCERA CATALANA» se
reconocen como 60, 70 y 90 en vez de caer todas al mismo cajón. El efecto se ve en la cola: lo primero
que se atiende son los calendarios de PRIMERA CATALANA.

Las actas se archivan con el JSON ya interpretado y `version_parser`. Al corregir el intérprete se
sube esa versión y `reparar` las vuelve a interpretar **desde el fichero guardado, sin pedir nada**;
por eso las correcciones de goles, cuerpo técnico y calidad no costaron ni una petición.

## La ficha del acta por dentro (22/10/2026)

- **Estado** del partido entre el local y el marcador: «Pendent» (sin jugar), «Acta Tancada», «SUSPÈS». Con
  «Pendent» la ficha va vacía: no se da por hecha, se vuelve a pedir el día siguiente al partido.
- **Tarjetas, cambios y goles** NO van en secciones: son iconos al lado del minuto, en la fila de cada jugador
  (amarilla `#FFEB3B`, roja `#F30000`, sale = flecha roja `M4 12H20`, entra = flecha azul `M20 12H4`, gol = balón).
  Un icono desconocido se guarda con su «firma» en el JSON y sale en el log como «ICONOS DESCONOCIDOS».
- **Código de jugador**, titular, capitán y portero: en la prop `player` del componente del nombre (React).
- **Descansos**: el equipo que libra tiene código de acta; la ficha es «TBD - equipo», siempre vacía. No se pide.
- En el **calendario**, cada partido trae `isClosed` y `status`: un texto («Acta Tancada») o, si no se ha jugado,
  su fecha y hora propias («29/10/2026 20:30»), que no tienen por qué ser las de la jornada.
- **Relecturas**: lo leído antes del 22/10 (16:24) se vuelve a pedir para tener tarjetas, cambios y códigos
  (2026-27 con prioridad normal; 2025-26 detrás de todo). Una relectura sin alineaciones no borra las guardadas.
- Si el panel del navegador está oculto, la ficha se queda en «Carregant acta…» (React no hace el cambio sin
  pintar). El recolector va sin cabeza y no le pasa; para probar a mano, leer de `document.body`.

## Tareas programadas

| Tarea | Cuándo | Qué hace |
| --- | --- | --- |
| `FACyLF catalogo cataluna` | 06:45 y al iniciar sesión | descubre temporadas, disciplinas, competiciones y grupos; al terminar vuelca el catálogo a la cola |
| `FACyLF recolector cataluna` | al iniciar sesión y a diario (supervisor) | bucle continuo: vuelca el catálogo a la cola y captura calendario, clasificación y actas por tandas de 400 trabajos |

El supervisor espera 20 s entre tandas cuando queda trabajo y media hora cuando la cola está vacía, y
lleva un mutex para que no se dupliquen dos supervisores.

## Siguientes pasos

1. Terminar el catálogo (283/379 competiciones resueltas; siguen 2025-26 y 2026-27).
2. Dejar correr la captura: 1.720 grupos con identificador y sus calendarios por delante.
3. Decidir el alcance de las actas (son cientos de miles en Cataluña) o dejar que salgan por
   prioridad, empezando por la temporada en curso y las categorías sénior.
