# Revisión operativa del 19 de septiembre de 2026

## Cambios ejecutados

- PNFG: corregida detección de acta vacía. Los arrays vacíos del parser no se evalúan como booleanos.
  Una estructura desconocida o una tarjeta/cambio/alineación presente no autoriza ausencia definitiva.
- PNFG: reconciliación de ámbito consulta sólo identificadores, estado, categoría y nombre de competición;
  deja de cargar todos los JSON de actas en RAM al arrancar. Mensajes de preparación local añadidos.
- Madrid/Valencia: todos los HTTP 5xx mantienen el trabajo pendiente con pausa; antes 504 podía cancelarlo.
- Cataluña: timeout del renderer provoca reciclado y aplazamiento de cinco minutos, sin descarte definitivo.
- Reinicio Windows: resuelve también supervisores desacoplados por ruta exacta y federación. Se comprobó el
  defecto al reiniciar: el supervisor antiguo mantenía el mutex y la tarea nueva terminaba sin sustituirlo.
- Los cuatro supervisores cargan `scripts/entorno-flota.ps1`: presupuesto 10 GiB, turnos de 20 minutos,
  reserva de máquina 2 GiB y Chrome headless. No cambia los intervalos HTTP.
- Dos trabajos cancelados recuperados (Valencia 1, Cataluña 1). Estado anterior conservado en metadatos
  con prefijo `reparacion-transitorio:2026-09-19:`. Segunda simulación: cero candidatos.
- Melilla: timeout de red, comprobación de raíz cuando desaparece la portada histórica, observación basada
  en respuesta actual y conservación del inventario incluso con `--max`. Conservadas 17 rutas históricas.

## Addenda: segunda pasada de verificación (misma fecha)

Lo de arriba es lo que se cambió. Esto es lo que se ha **comprobado después**, con medidas y con los datos
reales; donde algo no se sostenía, se ha corregido.

### El arreglo de «acta vacía» no llegaba a aplicarse (corregido)

La comprobación nueva exigía que la ficha **no trajera árbitro**. Medido con el HTML ya archivado en la cola de
Navarra y el mismo parser que usa el recolector, las tres fichas que la fuente no publica se leen así:

```
{"goles":0,"tarjetas":0,"cambios":0,"tecnicos":0,"locales":0,"arbitro":"sí"}
```

Es decir: **el árbitro sí viene**, porque se designa antes del partido. Con esa condición, `actaSinContenidoDeportivo`
devolvía `false` siempre y el atajo de «descártala a la primera» no se aplicaba nunca: los ~929 trabajos de Navarra
(y 53 de Euskadi, 5 de Murcia) seguían gastando sus tres intentos.

Arreglado en `scripts/lib/acta-vacia.mjs` (existencia del contenido deportivo, sin mirar el árbitro) y en el
recolector, que ahora distingue por la fecha del partido:

| caso | qué se hace |
|---|---|
| página vacía y partido de **más de 60 días** | se descarta a la primera y el acta queda `ausente_web` |
| página vacía y partido **reciente** | *publicación pendiente*: se reintenta cada 24 h, sin descartar ni marcar ausente |
| página con contenido pero ilegible (maqueta distinta) | sigue siendo error, con sus tres intentos |

Verificación con los ficheros archivados de verdad (no con estructuras inventadas): **6/6** — las 3 fichas vacías
se reconocen y las 3 actas completas del control no. Y la prueba del ayudante incluye el caso con árbitro
(4 pruebas nuevas), que era justo el que faltaba.

### El tope duro de 10 GB, probado en un Linux de verdad

Pendiente nº 1 de la lista de abajo: se ha ejecutado `node scripts/prueba-tope-10gb-docker.mjs`. Se reproduce la
rebanada del servidor (`memory.max = 10 GiB`, `memory.swap.max = 0`, igual que `facylf.slice`) **dentro del motor
Linux de Docker** (20,9 GB, cgroup v2), se mete dentro una flota de federaciones de prueba y se la empuja con
contenedores de lastre hasta el límite:

| comprobación | medida |
|---|---|
| la rebanada tiene tope de 10 GiB y sin swap | ✓ (`10737418240` y `0`) |
| el pico de la rebanada no pasa del tope | ✓ **10,00 GB** exactos, ni un byte más |
| los recolectores siguen en marcha con la rebanada llena | ✓ los tres `running` |
| el kernel se llevó por delante el lastre, no la recolección | ✓ `oom_kill=3`, los tres lastres `exited` |
| la flota sigue recolectando con la rebanada llena | ✓ 155→191, 118→154, 129→166 peticiones |

O sea: **el tope aguanta y la flota sobrevive a que alguien tenga que morir**. Dos matices que conviene no
perder de vista:

- no es un Debian, es el kernel Linux del motor de Docker: el mecanismo es el mismo (cgroup v2 + `MemoryMax`),
  pero la certificación final en el servidor sigue siendo deseable;
- la comprobación de **reserva de máquina** del gobernador mira la memoria libre del sistema, y dentro de un cgroup
  el sistema sigue siendo la máquina entera: si el servidor tuviera un tope de rebanada **menor** que su RAM, esa
  rama no lo vería. La rama del **contenedor** (que sí lee `memory.max − memory.current`) funciona, y es la que
  protege de verdad; en el servidor previsto (10 GB de RAM y rebanada de 10 GB) ambas coinciden.

### El descubrimiento, medido en vez de supuesto

| federación | competiciones sin verificar | qué son en realidad |
|---|---|---|
| Baleares | 236 | **en cola**, no perdidas: sus 235 trabajos `grupos` están listos, pero **20.928 trabajos de más prioridad por delante** (jornadas y actas de la competición en curso) |
| Cataluña | 19 → **0** | cerrado: el descubridor marcó las 379 competiciones a las 11:05, incluidas las 19 cuya lista de grupos viene vacía en el catálogo |
| Madrid | 5 | trabajos `grupos` pendientes (7 más aparcados porque la API no devuelve nada para esa competición) |
| Valencia | 13 | trabajos `grupos` pendientes y **listos para hoy** (0 intentos) |

Y un defecto real que sí se ha corregido: en `recolector-cataluna-datos.mjs` sólo se marcaban como verificadas las
competiciones con **algún** grupo, así que una competición cuya lista de grupos viene **vacía y explícita** en el
catálogo (fútbol playa, copas, ligas de base de fútbol sala) se quedaba sin verificar para siempre —y la web no la
publica—. Comprobado que el catálogo **siempre** trae la clave `grupos` (379 de 379, 19 con lista vacía), así que
ahora se marcan también esas y se sigue sin marcar si la clave faltara (volcado incompleto).

Queda una decisión, no un fallo: **la prioridad del descubrimiento frente a la recolección masiva**. Con Baleares,
los 235 trabajos de grupos están detrás de veinte mil de jornadas y actas; si se quiere cerrar la cobertura antes,
hay que subir la prioridad de la fase de descubrimiento (es una decisión de producto, no un arreglo).

## Evidencia

- Antes: 8,87 GiB de procesos del proyecto, 1,09 GiB libres, 19 plazas configuradas y 11 ocupadas.
- Después del reinicio: 18 tareas de recolector Running; 16 procesos worker en el instante de comprobación.
  Running confirma supervisión, no descarga continua. Las pausas de Madrid/Valencia y trabajos futuros siguen vigentes.
- 44 pruebas del recolector, 32 del gobernador y 3 nuevas de acta vacía superadas. Sintaxis de workers comprobada.
- No se ejecutó prueba de carga del servidor Linux. El presupuesto de plazas no es un límite duro de RAM.
  El límite duro existente depende de `facylf.slice` y su `MemoryMax`, descrito en `docker/README.md`.

## Descubrimiento aún incompleto

Medido sobre temporadas desde 2023-24: competiciones sin `grupos_comprobados_en`: Baleares 236, Cataluña 19,
Madrid 5, Valencia 13. Es falta de verificación, no prueba de pérdida de datos. Tareas de catálogo registradas,
última ejecución del 19/09 con salida 0. Hace falta contrastar sus catálogos y resultados para cerrar cobertura.
Existen 290.727 trabajos históricos aparcados por el suelo de temporada configurado; no están terminados.

Melilla: la portada histórica devuelve 404. La raíz redirige a `/pnfg/NLogin?NSess=1`, HTTP 200 de 117 bytes,
sin enlaces públicos extraídos. El texto anterior que afirmaba únicamente errores 500 estaba desactualizado.
Su descubrimiento sigue abierto. No se ha creado una ingesta fingiendo disponer de un catálogo público.

## Condiciones pendientes para traslado

1. ~~Prueba prolongada bajo el cgroup de 10 GiB del servidor, con medición de picos y ausencia de OOM.~~
   **Hecha el mismo día en el kernel Linux del motor de Docker** (`scripts/prueba-tope-10gb-docker.mjs`): pico
   exacto de 10,00 GB, sin swap, el kernel mató el lastre y la flota siguió recolectando. Queda como deseable
   repetirla en el Debian definitivo, con la rebanada del sistema y no una creada a mano.
2. Verificación de rotación de todas las federaciones bajo ese límite; comprobar también descubridores.
   (La rotación está probada con `scripts/prueba-turnos-docker.mjs` a presupuesto de 2 GB: 1 plaza y todos entran.
   Falta lo mismo con la flota completa y sus descubridores.)
3. Revisar catálogos pendientes y motivos de grupos sin jornadas. **Medido**: los huecos que quedan son de cola
   (Baleares 235 trabajos detrás de 20.928), no de pérdida; y la decisión de prioridad descubrimiento/recolección
   sigue abierta. No equiparar cola temporalmente vacía con cobertura completa.
4. Resolver el nuevo portal de Melilla y las incidencias deportivas que continúan marcadas `revisar`.

Estado: mejoras desplegadas en el PC, el tope de 10 GB probado en un Linux real y el falso «acta vacía» corregido;
**traslado todavía no certificado** (falta el Debian definitivo y las dos decisiones de producto).

## Addenda: tercera pasada y corrección del calendario de Cataluña

La decisión de prioridad ya no está pendiente: `catalogo_temporada` y `grupos` tienen carriles globales por
delante de calendarios, jornadas y actas en PNFG, iSquad y FCF. Dentro del carril se conserva el orden por
temporada y categoría. Medición posterior: Andalucía tiene 1.878 competiciones por descubrir, Baleares 135,
Madrid 12 y Valencia 13; todas están pendientes y delante de la ingesta masiva. El único grupo cancelado de
Baleares (temporada actual, cero intentos y sin error) se reactivó con copia de su estado en metadatos.

Se encontró un defecto de extracción que explicaba **723 calendarios catalanes falsamente vacíos**. La FCF
publica ahora la cabecera como `JORNADA 1 2025-09-20`, mientras el extractor exigía que terminase en
`JORNADA 1`. Además, el clic JavaScript en `CALENDARI` no cambiaba la pestaña en Chrome headless: el DOM seguía
en Resultados. Se corrigieron ambos puntos:

- intérprete probado para cabeceras nuevas y antiguas;
- navegación por las rutas oficiales `tab=calendari` y `tab=classificacio`, sin clic frágil;
- un calendario todavía vacío queda pendiente de publicación y nunca se descarta como cobertura cerrada;
- los fallos de calendario y clasificación se atribuyen al trabajo exacto, evitando marcar como hecha una
  clasificación que falló después de guardar el calendario;
- Cataluña ya no consume los trabajos `jornada` de PNFG: su unidad real es el calendario completo del grupo.
  Se apartaron 106 restos obsoletos con copia reversible y el planificador de fin de semana ya no los recrea;
- se recuperaron 749 descartes catalanes (723 falsos vacíos y 26 timeouts) con su estado anterior en metadatos.

Prueba real posterior al reinicio: el grupo `21/54322936/54322937`, antes guardado como vacío, produjo
**30 jornadas, 240 partidos, 240 actas enlazadas y 16 filas de clasificación**. Los ocho grupos siguientes
también se procesaron seguidos con calendario y clasificación, sin repetir el fallo.

La auditoría completa de las 18 colas terminó con integridad estructural correcta: cero JSON inválidos, cero
trabajos o participaciones duplicados, cero eventos sin lado y cero participaciones huérfanas. Encontró dos
minutos publicados fuera del rango ordinario (`120'+13` en Extremadura y `80'+81` en Galicia). El HTML confirma
que son valores literales de la fuente, no una suma inventada por el parser. Se conservan y ahora se marcan
`minuto_fuera_rango` para que no entren silenciosamente en estadísticas; las dos actas existentes se repararon
con copia reversible.

Estado de flota tras los cambios: las 18 tareas están registradas y `Running`; 12 federaciones estaban haciendo
peticiones, cuatro entre sesiones, Madrid en una pausa preventiva que ya venció y reanudó descubrimiento, y
Valencia reanudó a las 22:17. Se midieron 591 peticiones correctas en diez minutos. El proyecto ocupaba 9,64 GB,
por debajo de su presupuesto de 10 GB, con once plazas simultáneas; el resto rota por los supervisores. La poca
RAM libre del PC en esa medida procedía también de procesos ajenos (un servidor Node de 3,65 GB, VoiceStudio
3,24 GB y varios procesos de Brave), no de navegadores huérfanos: el recuento de huérfanos fue cero.

Siguen abiertos dos puntos antes de llamar al traslado «cerrado»: validar la misma flota en el Debian definitivo
y resolver el portal nuevo de Melilla, que todavía no expone un catálogo público utilizable al descubridor.

## Addenda: cuarta pasada · verificación independiente de la tercera

Comprobado con medidas propias, sobre los datos y no sobre lo que dice el informe.

**Cataluña, el arreglo del calendario.** Se ve en la cola, no en la intención:

| | antes | ahora |
|---|---|---|
| calendarios hechos | 389 | **446** |
| clasificaciones hechas | 245 | **296** |
| partidos | 74.934 | **81.093** |
| jornadas | 10.084 | **10.925** |

Y grupos completos de verdad: `21/54322932/54322933` con **30 jornadas · 240 partidos · 240 actas** (el hermano del
que cita el informe, `21/54322936/54322937`, con los mismos números). Los 723 «calendarios vacíos» eran falsos.

**Auditoría.** Repetida por mi cuenta sobre las 18 colas: integridad `ok` en **18/18**, **0** JSON inválidos
(muestra de 3.000 actas por cola), **0** trabajos duplicados, **0** participaciones duplicadas, **0** eventos sin
equipo, **0** participaciones huérfanas. Aviso para quien lo repita: `actas.calidad` es texto plano (`ok`/`revisar`),
no JSON; incluirlo en la comprobación de JSON da cientos de miles de «inválidos» que sólo son esa palabra.

**Minutos anómalos.** Verificados y bien identificados: Extremadura publica `120'+13` (que el parser guarda como
133) y Galicia `80'+81` (161); los dos están en `eventos_acta.minuto` y marcados `minuto_fuera_rango`. Madrid y
Valencia usan además el `999` como «sin minuto» (766 actas), también señaladas: 768 en total.

**Prioridad del descubrimiento.** Confirmada en los datos: los trabajos `grupos` pendientes tienen prioridad
**negativa** (−994.149.000 … −849.099.000 en Andalucía) y el resto va de +5.781.100 en adelante. El descubrimiento
va primero.

**Consumo: cuidado con la métrica.** Medido ahora, con la flota entera: **5,41 GB de memoria privada** (Chrome
4,20 GB en 84 procesos, node 1,34 GB en 18). La **suma de RSS da 7,90 GB** y otras medidas del proyecto llegan a
9,64 GB, porque **Chrome comparte memoria entre sus procesos**: esa cifra sobreestima unos 2,5 GB y, contra un
presupuesto de 10 GB, hace parecer que la flota está al 96 % cuando en realidad está en torno al 54 %. En el
servidor la medida buena será la del cgroup (`memory.current` de la rebanada), que no sobreestima.

**Y una cosa que sí merece una mirada** (no bloquea, pero es el mayor aviso de calidad): `descuadre_goles` son
56.787 actas y en federaciones como Baleares, Castilla-La Mancha, Extremadura o Valencia el 92-100 % de esos casos
son fichas **sin lista de goles publicada** (cosa de la fuente). Pero en Rioja (4 %), Canarias (9 %) o Cantabria
(27 %) el acta **sí trae lista de goles** y aun así no cuadra con el marcador: ahí hay algo que conviene entender
antes de dar los datos por definitivos, aunque la auditoría estructural esté limpia.

**Incidencia de entorno, anotada para no confundirla con un fallo de código**: a mitad de esta verificación el
motor de Docker dejó de responder (el disco tenía 48 GB libres, así que no era espacio) y las pruebas de
`packages/canonico` fallaron por no poder hablar con PostgreSQL. Reiniciado el motor, **531 pruebas del monorepo en
verde** (43 ficheros) y **48 de los guiones** con `pnpm recolector:test`.

## Addenda: quinta pasada · goles y pausa falsa de Madrid (20/09/2026)

La frase anterior sobre Rioja, Canarias y Cantabria tenía los porcentajes expresados al revés. La consulta
directa sobre `actas` y `eventos_acta` da que, entre sus descuadres, **sí hay lista de goles** en el 95,7 % de
Rioja, el 90,8 % de Canarias y el 74,2 % de Cantabria. Es precisamente por eso por lo que merecen revisión.

Una muestra real de Murcia (`21/22828815/23105083/2/540681`) descarta una inversión sencilla del parser: el
HTML publica 6-0 en la cabecera, pero su propia evolución de goles termina 2-5 y los goleadores pertenecen a los
equipos de esa evolución. Se conservan las dos evidencias y la ficha sigue `revisar`; no se sustituye un dato
oficial por otro inferido. En Rioja y Asturias aparecen además marcadores aparentemente limitados en categorías
de base y resultados administrativos. `descuadre_goles` debe leerse como **contradicción o detalle incompleto de
la fuente**, no como prueba automática de corrupción.

Se hizo explícita en `GolActa` la diferencia entre el equipo del autor y el equipo beneficiado. En un gol normal
coinciden; en propia puerta son contrarios. La cola ya guardaba correctamente `lado_beneficiado`, pero ahora el
contrato del parser también lo conserva y una prueba impide que una futura refactorización lo pierda.

Se corrigió una ralentización distinta en Madrid: una ficha Next existente pero sin objeto `game` se contaba
como fallo global. Cinco fichas aún vacías consecutivas imponían una pausa de una hora a toda la federación.
Ahora son ausencias individuales esperables: las vigentes se aplazan dos días, y una histórica se declara
`sin_datos` sólo tras dos comprobaciones. Nunca alimentan la pausa global. Además, las actas de partidos con
fecha futura se aplazan localmente hasta el día posterior al encuentro **sin hacer una petición**. Se retiró la
pausa creada por el defecto y se reinició el supervisor de Madrid con el código nuevo; volvió a pedir actas
inmediatamente.

Verificación de esta pasada: PostgreSQL `facylf-postgres` sano; **53/53 pruebas de recolectores** en verde,
17/17 pruebas del parser de actas en verde y TypeScript sin errores. Tras incorporar Melilla, las 19 tareas
programadas quedan registradas. Que no haya 19 navegadores simultáneos es deliberado: las federaciones rotan dentro de las once
plazas y, en este PC compartido, no se abre otra cuando quedan menos de 2 GB libres al sistema.

### Melilla deja de ser una excepción

El diagnóstico anterior era incompleto: `rfmf.es` sí ha migrado a PNFG Nova. Una petición sin jar de cookies
seguía la redirección a `NLogin` pero acababa en una página de 117 bytes; con una sesión anónima persistente, la
ruta pública de resultados expone el selector normal. El descubridor real midió **13 temporadas** y **197
competiciones** en las cinco temporadas con catálogo (15 + 43 + 51 + 36 + 52). Las anteriores siguen apareciendo
en el selector pero hoy devuelven cero competiciones; no se inventan para rellenar ese hueco.

Se añadió el perfil/configuración de Melilla, el arranque automático de Windows, su servicio y volumen en el
compose Debian, y la monta en el repaso de fin de semana. El worker quedó ejecutándose: completó los cuatro
catálogos dentro de la ventana activa (**15, 43, 51 y 36 competiciones**) y empezó a descubrir grupos; una muestra
real devolvió cinco grupos. Se reabrieron los 16 grupos que la primera sesión había aplazado por no tener aún la
cookie. El Chrome de Nova llegó a 2.086 MB en veinte páginas; para respetar el límite de 1.600 MB por contenedor,
Melilla recicla cada diez trabajos. El sondeo antiguo de portal se retiró del Programador de tareas para no
duplicar trabajo.

Estado medido después de incorporarla: **19 federaciones**, 14 trabajando, cuatro entre sesiones y Valencia en
la pausa de una hora que corresponde a un HTTP 503 explícito; 1.056 peticiones en diez minutos, 0 huérfanos,
9,09 GB contabilizados y 6,12 GB libres en la máquina. El compose reconoce 19 servicios federativos más el
repaso de fin de semana.

## 20/09 · El PC se quedó sin aire: el arreglo que faltaba en Chrome

Al dejar la sesión, el equipo quedó inservible: **322 procesos de Chrome del proyecto** (11 navegadores, uno por
plaza, pero **23 procesos cada uno** —36 renderers en uno solo— y **3.279 MB** por navegador), **0,68 GB libres** de
31,9 GB y la CPU al 100 %. No eran huérfanos: el barrido de restos lo dijo bien («nada que limpiar») porque cada
navegador tenía su worker vivo. Era el **aislamiento de sitios** de Chrome, que pone cada dominio (publicidad,
widgets y marcos de los portales) en su propio proceso.

Arreglado con tres banderas en los dos recolectores que usan navegador —`--disable-site-isolation-trials`,
`--disable-features=IsolateOrigins,site-per-process` y `--process-per-site`—, sin cambiar ni una petición ni un byte
de lo que se guarda. Después de reiniciar la flota y barrer los restos:

| | antes | después |
|---|---|---|
| procesos de Chrome del proyecto | 322 | **21** |
| procesos por navegador | 23 | **7,0** |
| memoria libre | 0,68 GB | **10,25 GB** |
| peticiones / 10 min | 382 | **884-1.092** |

Y el vigilante informa ya de esa proporción (`navegadores 11 raíz / 72 procesos`) con aviso a partir de 12, que es
el número que habría enseñado el problema en la primera vuelta. Detalle completo en
`docs/plataforma-web/RECOLECCION-10GB.md`.

**Melilla queda incorporada pero conviene decidirlo expresamente**: se ha resuelto su portal (era una cookie de
sesión anónima, no un muro) y ya recolecta con las demás, así que la flota pasa de 18 a 19 federaciones. Si no se
quiere esa federación en el alcance, hay que parar su tarea y su servicio del compose.

## Addenda: sexta pasada · catálogo de Ceuta, fin de semana y reinicio real (20/09/2026)

Ceuta no perdió sus 53 competiciones: el guardarraíl rechazó 4 respuestas parciales y conservó las 53 filas
anteriores. La comprobación por las cuatro agrupaciones oficiales confirmó que el portal sólo expone hoy cuatro
en esa temporada. El recolector archiva cada respuesta por agrupación, une por código y, si la unión sigue siendo
menor que la mitad del catálogo conocido, **no borra nada** y aplaza la siguiente comprobación siete días; ya no
repite la misma consulta cada hora.

La pasada del fin de semana del 19–20/09 se ejecutó de nuevo desde su tarea programada: detectó 660 jornadas en
17 federaciones, 67 ya comprobadas y **595 por repasar**. Las que ya estaban pendientes conservaron prioridad 2;
Cataluña reactivó 106 calendarios de grupo. La tarea terminó con código 0 y queda programada diariamente a las
07:30 para recoger resultados y actas que se publiquen con retraso.

Se corrigió el reiniciador: cortar sólo el proceso Node permitía que un supervisor antiguo lo relanzara con el
entorno anterior. Ahora resuelve el árbol exacto de cada federación y cierra hojas → raíz antes de arrancar la
tarea. Las 19 tareas se reiniciaron con el código vigente. En el PC usan 6 GB de presupuesto, seis plazas y una
reserva independiente de 6 GB para el usuario; el servidor mantiene el tope duro de 10 GB por cgroup.

También se corrigieron los diagnósticos para leer `entorno-flota.ps1`: antes podían anunciar 10 GB/11 plazas
cuando los procesos reales usaban 6 GB/seis plazas. La memoria atribuible se mide como privada, no sumando las
páginas compartidas de Chrome. Estado posterior al reinicio: seis trabajos activos, seis plazas ocupadas,
3,15 GB privados, 5,78 GB libres y cero navegadores huérfanos. En los tres minutos posteriores hubo 191
respuestas y **cero resultados inesperados**; `sin_publicar` sigue siendo un estado esperado de la fuente.

Verificación: 53/53 pruebas específicas de recolectores, 43 ficheros y 531 pruebas del monorepo en verde,
TypeScript limpio, compose válido con las 19 federaciones y la tarea de fin de semana.
