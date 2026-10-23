# Programa para recolectar con 10 GB

> **Reparto de temporadas y actas sin trabajo.** Cuando una federación se recoge desde dos máquinas a la vez
> (Castilla y León: PC y servidor), el reparto vive en `temporadas-asignadas.txt` y tiene tres puertas que hay
> que abrir, no una. Y antes de creerse cualquier porcentaje de temporada hay que comprobar que las actas
> pendientes **tienen un trabajo que las pida**: el 29/09/2026 aparecieron 27.000 que no lo tenían. Está todo en
> [`REPARTO-TEMPORADAS.md`](REPARTO-TEMPORADAS.md).

Encargo: el día que esto corra en un servidor con **10 GB para todo** (los recolectores, sus navegadores y lo
que quede), tiene que funcionar **sin acumular basura y sin bloquearse**. Hoy corre en una máquina de 32 GB
compartida con el escritorio del usuario, y todos los problemas de esta jornada vienen de ahí: la basura de
Chrome se comía la memoria que necesitaban los recolectores que esperaban, y el círculo se cerraba con
sesiones de navegador que morían a mitad de trabajo.

## Lo medido el 17/09/2026, que es la base del presupuesto

| qué | cuánto | cómo se midió |
|---|---|---|
| un recolector con su Chrome abierto | **~450-600 MB** | 17 recolectores con navegador ≈ 9-10 GB entre `node` y `chrome` |
| el navegador solo, ya cargado | **250-646 MB** (hasta 930 MB) | medido perfil a perfil a las 23:20, con 7-9 procesos Chrome cada uno |
| un `node` de recolector solo (sin navegador) | ~80-150 MB | 30 procesos `node` ≈ 4,6 GB, y ahí iba incluida la web del agente (3,5 GB) |
| basura que deja un reciclado | **~5 procesos Chrome por navegador** | 103 huérfanos / ~17 reciclados ≈ 5-6 cada uno, 8,5 GB |
| lo que costó no limpiarla | 63 `error_navegador` en media hora y 5 federaciones paradas | peticiones con `invalid session id` y workers en «esperando memoria» |

De ahí sale el número que gobierna el diseño: **un recolector con su navegador cuesta entre 0,35 y 1,0 GB, y
0,75 GB de media**, que es lo que reserva el gobernador por plaza. Con 10 GB caben **11 plazas** (8,5 GB útiles
÷ 0,75), y en este PC de 32 GB, **19** sin declarar presupuesto. Un servidor de 10 GB no puede llevar los 18 a
la vez como están escritos hoy: tiene que elegir, y elegir es lo que hace el reparto.

## Lo que ya está hecho y sirve igual en 10 GB

1. **Cada worker limpia su propio perfil** al reciclar el navegador y al cerrar la sesión
   (`recolector-local.mjs`, `limpiaChromeHuerfanoDeEstePerfil`). Es lo que corta la fuga en el origen.
2. **Barrido externo con candado** (`limpiar-chrome-huerfano.ps1`): mata sólo Chrome/chromedriver **huérfanos**
   (sin ningún `node` vivo por encima) y **sólo de las colas de este proyecto**; excluye explícitamente
   cualquier cosa del arnés del agente.
3. **Umbrales de memoria alcanzables**: Cataluña esperaba 6,5 GB (imposible) y ahora espera 2,5 GB, como el
   resto. Un umbral que no se puede cumplir no protege: bloquea para siempre.

## Lo construido, con su evidencia (17/09/2026)

Los ocho puntos están hechos y probados. Lo que sigue no es un plan: es lo que corre.

| punto | dónde | cómo se comprueba |
|---|---|---|
| 1 · **gobernador de memoria** con presupuesto repartido | `scripts/lib/presupuesto-memoria.mjs` (`repartePlazas`, `cabeOtroNavegador`) + `adquiereSlotChrome` en `recolector-local.mjs` | 13 pruebas. Con `FACYLF_MEMORIA_GB=10` sobre la flota real: **11 plazas** (coste medido 0,75 GB), 9-12 ocupadas; sin la variable, 19 |
| 2 · **reciclado por consumo** | `tocaReciclar` (puro) + `TOPE_NAVEGADOR_MB = 900` y `medir-navegador-perfil.ps1` | 8 pruebas. Si no se puede medir, NO se recicla, y sólo cuenta la medición **recién hecha**: así no se recicla dos veces con el dato de un navegador que ya no existe |
| 3 · **limpieza al arrancar** | `limpiaChromeHuerfanoDeEstePerfil()` en las tres redes: arranque, reciclado y cierre de sesión | medido: tres barridos manuales liberaron 4,07 + 0,75 + 4,83 GB de huérfanos reales |
| 4 · **esperas con tope y salida limpia** | `decideEsperaDePlaza` (puro, con el reloj inyectado) + tope configurable `FACYLF_TOPE_ESPERA_MS` | 4 pruebas, incluido el caso exacto del bloqueo: 1 plaza, 1 ocupada → 15 min → sale limpio |
| 5 · **estado legible por federación** | `scripts/estado-recoleccion.mjs` (+ `medir-memoria-proyecto.ps1`) → JSON y Markdown | informa de 18 federaciones con estado y motivo, peticiones, cobertura, pendientes disponibles frente a aplazados **y por qué está aplazado cada uno** |
| 6 · **una sesión de navegador caída no es culpa de la fuente** | manejador `sesionCaida` en `recolector-local.mjs` | reconoce `ECONNREFUSED 127.0.0.1:<puerto>`, `invalid session id`, `no such session`, `tab crashed`, `no such window`, renderer caído o sin respuesta: **recrea la sesión y sigue** en vez de contar cinco fallos y poner la federación en pausa. Con tope: a la séptima caída termina la sesión en limpio |
| 7 · **la limpieza no puede fallar en silencio** | `limpiaChromeHuerfanoDeEstePerfil()` | usaba `spawnSync('powershell')`: si el PATH no lleva `System32\WindowsPowerShell\v1.0`, `spawnSync` **no lanza excepción**, devuelve `.error` y `stdout` vacío; `Number('')` daba 0 y la red quedaba con un agujero mudo. Ahora usa la ruta completa y avisa cuando no arranca |
| 8 · **ninguna espera sin tope (Cataluña)** | `esperaMemoriaParaChrome()` en `recolector-cataluna-datos.mjs` | el reciclado tenía su propia copia del umbral con **6,5 GB escritos a mano**, sin tope y sin mensaje: media hora sin una línea con 3.708 trabajos disponibles. Ahora comparte umbral (2,5 GB) y tope (15 min) con el arranque |

**311 pruebas en verde** en todo `packages/*/test`, más los identificadores comprobados contra sus imports.

## Las cuatro pruebas

| prueba | resultado |
|---|---|
| 1 · presupuesto simulado de 10 GB | ✅ **verificada sobre la flota real**: 11 plazas con 10 GB frente a 19 sin declararlo |
| 2 · una hora sin que crezcan los huérfanos | ✅ **superada**: 90 → 52 huérfanos en 10 min = **−219/hora**, con los 18 workers limpiando su propio perfil |
| 3 · matar un worker y comprobar que limpia y sigue | ✅ **superada** el 17/09/2026 con una federación de prueba propia (`prueba-10gb`: cola, carpeta, perfil de Chrome y mutex suyos; mismo código y mismo supervisor que producción, 40 peticiones al día de tope): se mata el worker a mitad de sesión y **vuelve otro** (17 s con trabajo disponible; 297 s en la vuelta en que lo disponible ya se había consumido, que es el supervisor esperando a lo siguiente, no un fallo); la limpieza se lleva **los 7 procesos** del perfil muerto y deja **0** (unas veces por la red del worker al arrancar —3 procesos—, otras por la del supervisor justo antes de relanzar —7—: las dos están y ninguna sobra); **sigue recolectando** (31 → 37 peticiones) y **ninguna de las 15 federaciones con recolector se queda sin él**. Evidencia: `pruebas/reconstruccion/prueba-3-worker-muerto.json` + `scripts/_prueba-3-worker-muerto.ps1` (repetible; deja su cola fuera de los informes con una marca `.PRUEBA`) |
| 4 · presupuesto agotado sin bloqueo | ✅ **superada** de forma determinista: espera antes del tope, sale al cumplirlo, no abre navegador |

## El incidente del 17/09/2026, contado entero

Merece estar escrito porque **el daño lo hizo la propia prueba 3 en su primera versión** y de ahí salieron dos
arreglos de verdad.

La preparación de la prueba quería «empezar limpia» y mataba todos los `chromedriver` del equipo. Un
`chromedriver` **no lleva la ruta del perfil en su línea de órdenes**, así que no se puede atribuir a una
federación: lo que hizo fue tumbarlo todo. A las **20:11:55** nueve federaciones perdieron su navegador a la
vez (`ECONNREFUSED 127.0.0.1:<puerto>`), cada una encadenó cinco fallos seguidos y se puso en **pausa
preventiva una hora** (Madrid, seis) teniendo 10.000-30.000 trabajos disponibles cada una. Ocho volvieron
solas al vencer su pausa (~21:12) y Madrid se reanudó a mano a las 21:43
(`scripts/_reanuda-tras-pausa.mjs`, con la pausa anterior y su motivo guardados en
`pruebas/reconstruccion/reanudacion-tras-pausa.json`). A las 22:00 la flota estaba en **15 federaciones
trabajando, 297 peticiones en 10 minutos** y 18 colas informadas.

Lo que se arregló a raíz de eso, y es lo que importa para el servidor de 10 GB:

1. la prueba **no mata ni un `chromedriver`** (la función que los contaba devuelve una lista vacía y lo
   explica en su comentario);
2. un conductor muerto **ya no se cuenta como fallo de la federación**: se recrea la sesión y se sigue
   (punto 6 de la tabla). En un servidor cargado, los navegadores se caen; castigar a la fuente por eso era
   dejar la federación parada una hora por un problema de casa.
3. **la pausa preventiva del recolector iSquad (Valencia y Madrid) baja de 6 h a 1 h**, con el mismo
   criterio que ya se aplicó hoy en el recolector PNFG: a Madrid le costó **5 h 20 min parada** (hasta las
   02:12) por unos fallos de casa, con 30.000 trabajos disponibles en la cola. Una hora da el mismo respiro y
   si el problema persiste la pausa se vuelve a poner sola.

Y tres trampas de método que costaron tiempo hoy:

1. **`@(funcion).Count`, no `(funcion).Count`.** PowerShell desenrolla un array de un solo elemento al
   devolverlo de una función, y `.Count` sobre un objeto suelto devuelve **vacío**, no 1: un guardia
   `(f).Count -ne 1` abortaba la prueba teniendo el worker delante.
2. **Un U+FFFD no se puede convertir, hay que reconstruirlo.** El ciclo «leer y escribir» con PowerShell 5.1
   dejó 22 líneas con marcas de reemplazo en `recolector-local.mjs`; el byte original ya no está. Se
   reconstruyeron una a una (`scripts/_repara-marcas-recolector-local.mjs`) con los mismos mensajes intactos
   de `recolector-valencia.mjs` y, cuando no existían, por el vocabulario del fichero y los registros de
   producción. El fichero quedó con **0 marcas**.
3. **Un `.ps1` con acentos necesita BOM.** Los cuatro supervisores estaban escritos casi sin acentos y el de
   Cataluña, que sí los tiene, escribía su registro doble-codificado («La captura terminÃ³ con cÃ³digo -1»).
   Se les ha puesto la marca de orden de bytes (`scripts/_pon-bom-ps1.mjs`) para que PowerShell 5.1 los lea
   como UTF-8.

## El freno del reciclado: por qué iba a un tercio del ritmo (medido a las 23:20)

El encargo pedía que no se acumulara basura; el reciclado por consumo resolvió eso y trajo otro problema, que
se vio al mirar el ritmo de verdad: **1,4-2,4 peticiones por minuto** por federación donde la pausa configurada
permite unas 8, con un hueco mediano entre peticiones de **21-35 s** en vez de 6-8 s.

El ciclo real, leído línea a línea del registro de Andalucía con su tiempo:

```
→ jornada|21|44788581|46734744|20|
+ 4.965 ms   ✓ 7 partidos; 7 actas enlazadas
+     0 ms   · reciclado de Chrome tras 144 trabajos (el navegador va por 655 MB (tope 450 MB))
+18.848 ms   · limpieza del navegador: 1 proceso(s) de su propio perfil, 11 MB liberados
+ 2.857 ms   → jornada|21|44788581|46734744|21|        ← y otra vez: 145, 146, 147, 148…
```

Tres causas, y las tres están corregidas:

1. **El tope (450 MB) estaba por debajo de lo que ocupa el navegador cargado** (250-646 MB medidos, hasta 930 MB
   con páginas pesadas): la medición lo superaba siempre, así que la regla de consumo se disparaba en cada
   comprobación. Es el mismo error de forma que el umbral de 6,5 GB de Cataluña: **un umbral inalcanzable no
   protege, bloquea**. Ahora son **900 MB**.
2. **La medición vieja se seguía usando después de reciclar**: el número del navegador que se acababa de cerrar
   volvía a disparar la regla en el trabajo siguiente (de ahí los reciclados en 144, 145, 146, 147…). Ahora
   **sólo cuenta la medición recién hecha** y se borra al reciclar; el resto del tiempo manda el suelo por
   trabajos, que pasa de 10 a **40** (20 en Castilla y León, que es la cola prioritaria).
3. **Cada reciclado cuesta 15-25 s**: cerrar el navegador, limpiar su perfil (un PowerShell que recorre los
   ~120 procesos Chrome de la máquina: 8-19 s) y volver a abrirlo. Con el reciclado en cada trabajo, eso era el
   80 % del tiempo del worker.

**Comprobado en la cola de prueba y luego en la flota** (mismo portal, mismo ritmo de 6-8 s, código nuevo):

| medida | antes | después |
|---|---|---|
| hueco mediano entre peticiones (una federación) | 21-35 s | **7,1-7,8 s** |
| peticiones por minuto y federación | 1,4-2,4 | **3,7-4,9** |
| reciclados de Chrome | uno por trabajo | uno cada ~20-40 trabajos, y por un motivo real (993 MB ≥ 900) |
| coste de un reciclado en el ciclo | 15-25 s (8-19 s sólo la limpieza) | 3-8 s |
| plazas en un servidor de 10 GB | 14 (con coste 0,6 GB) | **11** (con el coste medido, 0,75 GB) |

El worker vuelve a ir **al ritmo que tiene configurado**: la mediana del hueco (7,5 s) es ya la pausa respetuosa
del portal. Lo que queda por encima de eso no es el navegador: el mantenimiento local cada 25 trabajos (~40 s,
reinterpretar cinco actas archivadas) y la medición de memoria cada 10 (~2-4 s). Se aplicó a los **12
recolectores PNFG** reiniciándolos a las 23:52 —sus supervisores los volvieron a levantar en 20-25 s, con la
cola intacta— porque un worker sólo estrena el código al cambiar de sesión.

## Turnos, capacidad y rotación: caber 18 federaciones en 11 plazas (18/09/2026)

En un servidor de 10 GB caben **11 recolectores con navegador** y hay **18 federaciones**. Eso obliga a que la
plaza circule: sin rotación, la que consigue plaza la conserva sesión tras sesión y las que no entran **no
entran nunca**. Es un problema que no se ve en una máquina de escritorio (donde caben todas) y que aparece el
primer día que esto corre 24/7.

Lo que se hizo, y lo que se encontró al medirlo:

| qué | antes | ahora |
|---|---|---|
| **turno de plaza** | no existía: la plaza se tenía mientras durase la sesión | **150 min** (`FACYLF_TURNO_PLAZA_MIN`) y sólo caduca **si hay federaciones esperando**; al ceder, la sesión termina en limpio y su supervisor la relanza, entrando por el final de la cola |
| **plaza de un worker vivo** | se borraba a los **60 min** por una caducidad pensada para los identificadores de Windows: nueve navegadores trabajando con sólo **tres** fichas de plaza, y el gobernador contando dieciséis huecos que no existían | cada worker **late su ficha** (~1 vez por trabajo) y una plaza sólo se da por abandonada si su dueño **ya no existe** o lleva 15 min sin señales |
| **orden de llegada** | bastaba con que hubiera alguien esperando —aunque esperara **memoria**, no plaza— para que un worker con sitio de sobra se quedara fuera 15 min | la antigüedad manda **sólo cuando no hay plaza libre** |
| **reserva de memoria** | dos criterios distintos: el reparto decidía con 1,5 GB y el worker exigía **2,5 GB** antes de abrir Chrome (y Cataluña, 2,5 GB por su cuenta); y con presupuesto declarado, la reserva se contaba **dos veces** (una en la aritmética de plazas y otra en cada apertura) | el reparto descuenta la reserva **una vez** (1,5 GB de 10 → 8,5 GB → 11 plazas) y los **tres recolectores** (PNFG, iSquad y Cataluña) aplican la misma política: sin presupuesto declarado piden la reserva completa, y con presupuesto (el servidor) sólo un **suelo de emergencia de 0,25 GB**, porque si no, con once navegadores dentro del presupuesto el sistema nunca tendría 1,5 GB libres y nadie abriría nunca. En Docker se mide la memoria **del contenedor** (cgroups), no la del host |

Verificado el 18/09/2026 con una federación de prueba y una federación «esperando» de verdad: el worker cede su
plaza al cumplirse el turno —

```
· reciclado de Chrome tras 10 trabajos (el navegador va por 905 MB (tope 900 MB)).
· turno agotado tras 1 min con federaciones esperando: se libera la plaza.
Sesión terminada: 10/60 trabajos.
```

— y la ficha de plaza desaparece del volumen compartido en el mismo instante.

**Lo que se llevó por delante el fallo de las plazas, medido a las 10:00:** nueve navegadores abiertos y
trabajando, **tres** fichas de plaza y el gobernador creyendo que había dieciséis huecos libres. Con las 18
federaciones en marcha eso se traduce en más navegadores de los que caben: exactamente el problema que este
programa existe para evitar.

## La ingesta del fin de semana, en todas las federaciones (`scripts/ingesta-fin-de-semana.mjs`)

Desde el lunes, lo que hay que asegurar es que **los partidos del sábado y el domingo están recogidos en las
dieciocho federaciones**. El programa:

1. calcula la ventana del último fin de semana (sábado 00:00 → domingo 23:59, hora de Madrid);
2. **reabre sólo lo que falta**: una jornada sin comprobar desde que empezó el fin de semana, o con actas en
   `pendiente`/`sin_datos`. Reabrir el fin de semana entero cada día costaría una vuelta completa de peticiones
   por trabajo ya hecho, y el ritmo respetuoso no se gasta en eso;
3. deja el informe, que es lo que se mira el lunes.

Medido para el fin de semana del **12-13 de septiembre** (primera pasada, 18/09/2026): **17 federaciones** con
jornadas, **250 jornadas** (233 comprobadas), **1.735 partidos** y **1.563 actas** de las que **1.421 estaban
hechas y 142 pendientes**; **39 jornadas** necesitaban repaso y se reabrieron. Las que iban más atrasadas:
Asturias (2 de 10 jornadas comprobadas), Castilla-La Mancha (6 de 15) y Extremadura (13 de 24).

Se ejecuta:
* en el PC, con la tarea programada **`FACyLF ingesta fin de semana`** (todos los días a las 07:30, idempotente);
* en Docker, con el servicio `fin-de-semana` (`docker/entrada-fin-de-semana.sh`, que duerme hasta su hora sin
  necesidad de cron).

## Los recolectores en Docker, para el servidor Debian de 10 GB

Está en `docker/`: `Dockerfile` (Node 24 + Chromium y su conductor sobre Debian), `entrada-recolector.sh` (el
supervisor de una federación, en Linux), `entrada-fin-de-semana.sh`, `compose.yml` (una federación por servicio)
y `README.md` con la puesta en marcha. Lo esencial:

* **La memoria se limita dos veces**: por dentro, el gobernador reparte `FACYLF_MEMORIA_GB` (10) en 11 plazas,
  con las fichas en un volumen compartido por todos los contenedores; por fuera, todos los servicios cuelgan de
  `facylf.slice`, a la que se le pone `MemoryMax=10G` en el servidor. Así el tope es del conjunto, no de cada
  contenedor por su cuenta.
* **Chrome va sin cabeza** (`--headless=new --no-sandbox --disable-dev-shm-usage`), activado por
  `FACYLF_CHROME_HEADLESS=1`, que es lo que pone el compose. En el PC la ventana sigue abriéndose fuera de la
  vista, que es lo que está probado allí.
* **Probado de verdad**: imagen construida y una federación corriendo en un contenedor Debian, recolectando del
  portal real con Chromium sin cabeza —

```
Supervisor en contenedor iniciado para prueba-10gb (script recolector-local.mjs).
Plan local preparado: 3 temporadas y 90 competiciones candidatas.
→ jornada|21|22879239|22879331|7|
  ✓ 10 partidos; 0 actas enlazadas
```

* Lo que **no** entra en la imagen: las colas y los perfiles de Chrome (son datos, van en volúmenes), la web, los
  `node_modules` del PC y 1,5 GB de perfiles de sondeo que sólo servían para el descubrimiento.

### Probado el conjunto, no sólo la imagen

El 18/09/2026, con el compose de verdad (`docker compose -f docker/compose.yml up -d prueba-10gb`):

| qué se probó | resultado |
|---|---|
| el compose | **válido**, 20 servicios (18 federaciones + la de prueba + la pasada del finde) |
| el contenedor arranca y recolecta | `→ jornada\|21\|22619982\|22619983\|7\|` → `✓ 9 partidos` → `Sesión terminada: 6/6 trabajos` |
| los límites que se le piden a Docker | `mem_limit=1600 MB` y `cgroup_parent=facylf.slice` aplicados, comprobados con `docker inspect` |
| el semáforo entre contenedores | la ficha de plaza aparece en el volumen compartido `docker_plazas` con el identificador del worker |
| soltar la plaza al parar | `docker stop` → **0 fichas** en el volumen |
| la memoria del contenedor | el worker lee `/sys/fs/cgroup/memory.max` y `memory.current` (cgroups v2), no la memoria del host |

Y un fallo real que salió de esta prueba, que no se habría visto en el servidor hasta que doliera: al compartir
la carpeta de la cola entre el PC y el contenedor, un `SingletonLock` que había dejado el Chrome del PC impide
arrancar el Chromium del contenedor (`SessionNotCreatedError: Chrome instance exited`) y el worker muere en
bucle cada 20 s. El guion de entrada retira ahora esos ficheros antes de abrir el navegador.

**Y la rotación, probada entre contenedores** (18/09/2026): tres contenedores —la federación de prueba, Canarias
y Ceuta— con `FACYLF_MEMORIA_GB=2` (o sea **una sola plaza** para los tres) y turno de un minuto. Resultado
medido: la ficha de plaza aparece una sola vez en el volumen compartido, **7 turnos concedidos y 1 cedido** en el
primero, **2 esperas** contabilizadas, y los tres siguieron recolectando por turnos. Es exactamente el
comportamiento que hace falta cuando 18 federaciones se reparten 11 plazas.

**Y a escala, que es la prueba que importa** (mismo día): **seis federaciones de prueba** (`prueba-a` a
`prueba-f`, copias con su propio perfil y su propia cola, creadas con `scripts/_prepara-federaciones-de-prueba.mjs`)
compitiendo por **dos plazas** (presupuesto de 3 GB) con turno de un minuto. Medido en cinco minutos:

| federación | turnos concedidos | veces esperando | trabajos hechos |
|---|---|---|---|
| prueba-a | 4 | 4 | 26 |
| prueba-b | 3 | 3 | 24 |
| prueba-c | 2 | 3 | 12 |
| prueba-d | 2 | 3 | 12 |
| prueba-e | 2 | 2 | 18 |
| prueba-f | — (entró sin esperar) | 1 | 6 |

**Las seis entraron y las seis trabajaron**, con 98 trabajos repartidos entre dos plazas y cola de espera visible
en el volumen (`espera-pnfg-210.ficha`). Eso es lo que significa «rotación»: no que todas quepan a la vez —no
caben— sino que ninguna se queda fuera.

**Lo que no se puede probar en el PC y sí en el servidor**: Docker Desktop comparte las carpetas de Windows por
9p/virtiofs y SQLite no abre ahí una cola en WAL (`disk I/O error` con la base en uso; la misma cola dentro de un
volumen, que es filesystem Linux, funciona a la primera). Por eso el compose monta las colas del host —correcto
en el servidor, donde son ext4— y las pruebas en el PC van con copias dentro de un volumen; los guiones de
`docker/_*.sh` hacen justo eso.

### La prueba de aceptación: 9 de 9 (`scripts/prueba-aceptacion-docker.mjs`)

Es lo que se ejecuta antes de dar por bueno el despliegue, y sirve igual en el servidor (allí sin
`--volumen-datos`, con las colas montadas de verdad). Medido el 18/09/2026 con tres federaciones y un
presupuesto de 2 GB (**una sola plaza** para las tres, a propósito, para forzar la contención):

| comprobación | resultado |
|---|---|
| el compose es válido y tiene un servicio por federación | ✓ 20 servicios |
| los tres contenedores están vivos y **coherentes** (trabajando, o diciendo que no hay nada que pedir) | ✓ |
| hay **una** ficha de plaza en el volumen compartido | ✓ 1 |
| **no se conceden más plazas de las del presupuesto** | ✓ 1 ≤ 1 |
| el conjunto se queda dentro del presupuesto | ✓ **472 MB** de 2.048 MB |
| la pasada del fin de semana corre dentro del contenedor | ✓ |
| al parar no quedan plazas fantasma | ✓ 0 |

La prueba **se prepara su propio escenario** (volumen de plazas propio y vacío, presupuesto diario a cero y
trabajo real inyectado en las copias) porque las tres primeras versiones daban falsos negativos por depender del
estado que dejaban otros experimentos: heredaba fichas de plazas ajenas, heredaba el presupuesto diario gastado
—con lo que los contenedores hacían lo correcto, no abrir nada— y exigía peticiones a una federación que
legítimamente no tiene nada que pedir. Una prueba de aceptación que se equivoca es peor que no tenerla.

Y un número que importa para el servidor: **un contenedor que está esperando plaza consume 3 MB** (sólo el
supervisor; el navegador no se abre hasta que la tiene) frente a los ~527 MB del que la tiene. Con 18
contenedores y 11 plazas, los siete que esperan no suman ni 100 MB.

Además de la foto, hay una **prueba de fondo** en marcha (tres contenedores, una plaza, turno de dos minutos,
dejada corriendo horas) para ver que la rotación se repite sin fugas ni bloqueos.

### La flota encoje sola cuando el servidor tiene otras cosas que hacer

En el servidor de 10 GB no vive sólo la recolección: están PostgreSQL, la web y el sistema. Y con el tiempo, según
se vaya ingiriendo lo pedido, este trabajo tendrá **menos** que hacer y dejará sitio a lo demás. Eso no se resuelve
apagando federaciones a mano: se resuelve con una **reserva del sistema** (`FACYLF_RESERVA_GB`, 1,5 GB por
defecto) que se comprueba **antes de abrir cada navegador**, además del reparto de plazas y de la memoria del
propio contenedor:

| condición | qué decide |
|---|---|
| reparto de plazas | cuántos navegadores caben en el presupuesto (11 con 10 GB) |
| memoria del contenedor (cgroups) | que quepa el Chrome que se va a abrir en ESTE contenedor (0,25 GB de suelo) |
| **memoria libre del sistema contra la reserva** | que al resto del servidor le quede su sitio |

Cuando la tercera falla, los recolectores **dejan de abrir navegadores nuevos**: los que están siguen trabajando,
y al terminar su sesión el hueco no se vuelve a ocupar. No hay que apagar nada: la flota se apaga sola por partes
y vuelve a crecer cuando el sistema tiene aire otra vez. Medido con la reserva puesta a un valor imposible
(`FACYLF_RESERVA_GB=20` en una prueba): el worker no abre navegador y su registro dice exactamente por qué —
«cabe por reparto (19/19) pero al SISTEMA le quedan X GB y su reserva es 20 GB: se deja sitio a lo demás»— y sale
en limpio para reintentarlo más tarde.

### Cabe de sobra: la cuenta con números medidos
Con lo medido en los contenedores el 18/09/2026 —**~527 MB** un recolector con su navegador abierto y **~3 MB**
uno que está esperando plaza—, la flota en el servidor de 10 GB queda así:

| | cuántos | cada uno | total |
|---|---|---|---|
| federaciones con navegador | **11** (las plazas del presupuesto) | ~527 MB | **~5,7 GB** |
| federaciones esperando turno | 7 | ~3 MB | ~0,02 GB |
| PostgreSQL canónico y el sistema | — | — | ~1,5 GB |
| **total** | | | **~7,2 GB de 10 GB** |

Es decir: no hace falta que nadie se quede fuera por memoria, y el tope duro de la rebanada (`facylf.slice`, en
`docker/servidor/`) está para el día que un navegador se desmadre, no para el funcionamiento normal.

### El informe del fin de semana también cuenta cuando no escribe

`ingesta-fin-de-semana.mjs --informe` no toca nada, y hasta ahora tampoco contaba lo que faltaba: el informe de un
fin de semana **por jugar** decía «0 por repasar» teniendo 659 jornadas sin comprobar, que es justo el número que
se mira el lunes. Ya lo cuenta siempre (una consulta por jornada, sin escribir): para el fin de semana del
19-20/09, **659 jornadas por repasar en 17 federaciones**; para el del 12-13/09, 250 jornadas con 245
comprobadas y **141 actas pendientes**.

### El semáforo de plazas dentro de Docker: el identificador de proceso no basta

Un fallo que sólo existe cuando la flota va en contenedores, y que encontró esta prueba (18/09/2026): las fichas
de plaza guardaban el **identificador del proceso**, y `process.kill(pid, 0)` responde por el espacio de
identificadores **de mi propio contenedor**. Como cada contenedor tiene el suyo, el PID 13 de una federación
puede ser perfectamente otro proceso dentro del contenedor de al lado: una plaza muerta parece viva, el reparto
cree que hay un navegador menos de los que hay y **abre uno de más** — justo lo que el presupuesto de 10 GB no
puede permitirse.

La ficha guarda ahora `pid contenedor` (el `hostname` que pone Docker es único por contenedor):

* si la escribió **mi** contenedor, se comprueba el proceso (rápido y exacto);
* si la escribió **otro**, no se puede comprobar: manda el **latido** que el worker refresca con cada trabajo;
* en los dos casos, un latido viejo libera la plaza. El plazo de latido bajó de 15 a **5 minutos**, porque el
  worker late cada 10-20 s y cinco minutos ya son veinte latidos perdidos.

**Verificado matando un contenedor de golpe** (`docker kill`, que no deja limpiar) mientras tenía la plaza: la
ficha se queda huérfana, y al pedir plaza otro contenedor —

```
· plaza slot-1.lock liberada (sin señales desde hace 9 min).
→ acta|21|21876095|21876096|4|39867
```

— la reclama y se pone a recolectar. Es el caso del reinicio del servidor o de un proceso que se lleva por delante
el `OOM killer`, y sin esto serían plazas fantasma acumulándose en cada reinicio.

### Lo que encontró la prueba de fondo: sesiones que abrían Chrome para nada

Doce minutos de prueba de fondo (tres contenedores, una plaza) dejaron un número raro: **24 sesiones en el
contenedor de prueba, cinco trabajos hechos y ningún navegador haciendo nada útil**. La causa estaba en el orden
de las comprobaciones: el **presupuesto diario de peticiones** (200 en la federación de prueba) se comprobaba
dentro de `ritmo.antes()`, o sea en el primer trabajo… después de haber pedido plaza de navegador, tenerla y
haber arrancado Chrome. Cada sesión: plaza, Chrome, «presupuesto diario agotado (200/200)», a la calle. Y el
supervisor la relanzaba cada 20 s, porque `proximo-trabajo.mjs` sólo miraba si había trabajo pendiente.

Arreglado en los dos lados: el worker comprueba el presupuesto diario **antes de abrir nada**, y deja el tope
escrito en la cola (`metadatos.diario_max`) para que el supervisor lo sepa. Medido después del arreglo, en un
contenedor limpio sobre esa misma cola:

```
Presupuesto diario agotado (200/200) y no hay nada más que hacer hoy. No se abre el navegador: la cola queda intacta para la próxima sesión.
El worker termino con codigo 0; siguiente intento en 3600 s.
```

Cero procesos de Chrome (antes: uno por sesión) y la espera pasa de 20 s a una hora. No es un problema de
memoria: es no gastar plaza y arranques de navegador en jornadas que ya no se pueden pedir.

### El presupuesto diario costaba 150 ms por petición

`peticionesHoy` es lo primero que mira el ritmo respetuoso **antes de cada petición** (decide si queda presupuesto
para hoy), y leía la tabla `peticiones` **entera** para filtrarla en JavaScript. Medido sobre las colas reales: de
**103 a 162 ms** por comprobación en colas de 20.000-37.000 peticiones… y el coste crece con la tabla, así que en
una cola de cientos de miles eran segundos por petición. Ahora es un `count` con un índice de expresión sobre
`substr(iniciada_en, 1, 10)`, que es justo la comparación que se hace:

| federación | peticiones | antes | ahora | veces más rápido |
|---|---|---|---|---|
| Euskadi | 27.644 | 141 ms | **0,055 ms** | 2.579× |
| Galicia | 29.132 | 149 ms | **0,055 ms** | 2.699× |
| Madrid | 19.498 | 103 ms | 0,108 ms | 954× |
| Valencia | 36.709 | 162 ms | **0,060 ms** | 2.696× |

El índice (`peticiones_dia`) está declarado en el esquema —una cola nueva lo tiene sola— y se creó en las 19
colas existentes con un guion de mantenimiento (de 6 a 480 ms cada una). La medición está en
`scripts/_mide-peticiones-hoy.mjs`.

**Actualización del 19/09/2026:** el índice pasó a ser sobre la columna `peticiones.dia_madrid` (el día civil de
Madrid, ver más abajo) y se crea/rehace solo en cada arranque del recolector; quien quiera adelantarlo tiene
`node scripts/migrar-colas-dia-madrid.mjs` (idempotente, informa de lo que rellenó y de si el índice se usa). El
guion que creaba el índice de la expresión anterior ya no existe: indexaba una consulta que ya no se hace.



Deja una línea por vuelta en `pruebas/reconstruccion/vigilancia-flota.jsonl` con el ritmo de cada federación, las
plazas ocupadas y quién las tiene, los navegadores vivos, la memoria libre, las pausas y dos banderas que
distinguen «atascada» (tiene navegador y no lo usa) de «entre sesiones» (sin navegador, esperando trabajo). Con
`--informe` resume el fichero: mínimos, máximos, tendencia de navegadores y qué federación se quedó atascada y
cuánto tiempo. Se lanza así:

```bash
node scripts/vigilar-flota.mjs --cada-min 10 --duracion-min 480     # ocho horas de vigilancia
node scripts/vigilar-flota.mjs --informe                            # el resumen de lo vigilado
```



### El aplazamiento de Euskadi: no era una avería, era una decisión

Durante la jornada se anotó aquí que Euskadi tenía «2.658 trabajos pendientes y ninguno disponible, repartidos
a ~15 al día, unos tres meses». **Eso era una lectura equivocada** y se corrigió midiendo la cola por partes
(`scripts/_diag-euskadi-ritmo.mjs`, 17/09/2026). Las 2.658 se reparten en tres causas que no se parecen en
nada, y suman exactamente el total:

| causa | trabajos | qué es |
|---|---|---|
| **aparcados** | **1.818** | 1.450 jornadas y 368 actas de temporadas anteriores a 2023-24, con fecha centinela 2099: **no se recogen por decisión del cliente** (`scripts/lib/temporada-minima.mjs`, `TEMPORADA_MINIMA = '2023-24'`, 14/09/2026). No se borran: vuelven con `reactivaTemporadasViejas` o `FACYLF_TEMPORADA_MINIMA` |
| **reintentos** | **352** | actas de la temporada en curso con vencimiento el 18-19/09: reintentos normales del día |
| **calendario** | **488** | jornadas y clasificaciones de la temporada en curso aplazadas hasta el día siguiente a su partido: es el diseño, no se puede pedir una jornada que no se ha jugado |

«Disponible ahora: 0» era, por tanto, **correcto**. Lo que faltaba era que el programa lo dijera: el informe de
estado ahora separa las tres causas en todas las federaciones
(`pruebas/reconstruccion/estado-recoleccion.md`). En la flota entera, medido el 17/09 a las **19:58Z** (18
federaciones, 15 trabajando): **6.299 en reintento, 25.080 por calendario y 290.727 aparcados** por esa
decisión. Sin esa separación, un operador ve «290.727 aplazados y 0 disponibles» y cree que el programa está
roto.

### Cataluña: dos horas parada por el bucle viejo, reanudada y verificada

El arreglo del punto 8 está en el código, pero **su worker llevaba desde las 19:44 del 17/09 dentro del bucle
viejo de 6,5 GB** y el supervisor no lo relanzaba porque el proceso nunca terminaba: un arreglo que no llega a
ejecutarse no arregla nada. Con autorización expresa se paró **solo ese proceso** (PID 26596, comprobado antes
por su línea de órdenes) a las 22:00:34 y el supervisor hizo el resto:

| qué | medida |
|---|---|
| relanzamiento | **22 s** (PID 12204) |
| restos de la sesión muerta | **7 procesos** Chrome retirados por la red del supervisor |
| vuelta a recolectar | 11.487 → **11.501 peticiones** en 2 minutos (última: 20:03:34Z) |
| memoria con la que abrió | **3,46 GB libres** (por encima del umbral de 2,5 GB: no tuvo que esperar) |

Es además la comprobación de que el arreglo sirve: el umbral y el tope que antes no existían son los que
deciden ahora si se abre el navegador o se sale en limpio avisando.

### El ritmo del trabajo histórico

Cuando se decida retomar el histórico (las temporadas anteriores a 2023-24 que hoy están aparcadas), lo que el
programa de 10 GB garantiza es que ese trabajo **se reparta sin bloquearse y sin acumular basura**: 11
recolectores a la vez en un servidor de 10 GB, cada uno con su plaza, su rotación, su limpieza y su tope de espera.

### Las dos decisiones que quedan (con los números para decidirlas)

**1 · El ritmo por federación.** Hoy cada recolector PNFG pide una página cada 6-8 s (los iSquad, cada 4-6 s) y
espera entre una y otra lo que diga el portal: es una decisión de **respeto a la fuente**, no técnica. Con eso, la
flota de 11 plazas hace del orden de **60.000 peticiones al día** (medido: 4-5 peticiones por minuto y federación
en marcha, 11 a la vez). Para ponerlo en perspectiva con lo que hay pendiente:

| trabajo | peticiones estimadas | con 11 plazas |
|---|---|---|
| los ~208.000 trabajos disponibles hoy en la flota | ~1,4 por trabajo (algunos se piden dos veces) ≈ **290.000** | **~5 días** a jornada completa |
| un fin de semana entero (1.612 partidos y ~1.500 actas) | ≈ **4.000-5.000** | **menos de 2 horas** |

Es decir: **el fin de semana cabe de sobra**; lo que tarda días es el atraso acumulado, y la palanca para eso no es
la memoria ni el número de recolectores —que ya caben— sino el ritmo que se le quiera pedir a las federaciones.

**2 · Probar en una máquina Linux de verdad.** Todo lo que se puede comprobar en un PC de Windows está
comprobado (la prueba de aceptación entera en verde —9 comprobaciones con tres federaciones y 7 con una—, la rotación, la memoria dentro de los contenedores, el navegador sin
cabeza contra los portales reales, el reclamo de plazas huérfanas). Lo que **no** se puede medir aquí es el tope
duro de 10 GB de la rebanada de cgroup: Docker Desktop comparte el kernel de una máquina virtual de Windows y sus
números no son los del servidor. Con un Debian de pruebas (o una máquina virtual de 10 GB) se cierra el último
cabo: `systemctl show facylf.slice -p MemoryMax` y `docker stats` con la flota entera.

## Los guiones, uno a uno (para operar esto)

Todo lo que hace falta para mirar, arreglar y probar la recolección, sin tener que leer el código:

| para qué | guion |
|---|---|
| ¿cómo va la flota? (JSON + informe legible, por federación) | `node scripts/estado-recoleccion.mjs` |
| la foto completa: plazas, turnos, quién espera, ritmos y estimaciones | `node scripts/auditar-capacidad.mjs` → `pruebas/reconstruccion/auditoria-capacidad.md` |
| ¿quién tiene la plaza y cuánto le queda de turno? | `node scripts/_diag-plazas.mjs 30` |
| ¿qué se ha trabajado en los últimos minutos? | `node scripts/_diag-ultimos-minutos.mjs 15` |
| ¿va al ritmo que tiene configurado? (hueco real entre peticiones) | `node scripts/_diag-ritmo-real.mjs 30` |
| ¿por qué está en pausa esta federación? | `node scripts/_diag-pausa.mjs <federación>` |
| ¿qué está fallando y de qué tipo? | `node scripts/_diag-fallos-recientes.mjs 60` |
| ¿hay trabajo imposible que se reintenta para siempre? | `node scripts/_diag-trabajo-imposible.mjs <federación>` |
| vigilancia larga del PC (una línea por vuelta, con `--informe`) | `node scripts/vigilar-flota.mjs --cada-min 10 --duracion-min 480` |
| vigilancia de contenedores (memoria por cgroups, reinicios, plazas) | `node scripts/vigilar-docker.mjs --cada-min 15 --duracion-min 480` |
| la pasada del fin de semana (con `--informe` no escribe nada) | `node scripts/ingesta-fin-de-semana.mjs [--informe] [--fin-semana AAAA-MM-DD]` |
| probar el despliegue de Docker antes de tocarlo | `node scripts/prueba-aceptacion-docker.mjs --federaciones prueba-10gb` |
| comprobar que un contenedor se cura solo (worker y contenedor) | `node scripts/prueba-autorrecuperacion-docker.mjs --federacion prueba-a` |
| comprobar los turnos (todos entran, nadie ocupa de más) | `node scripts/prueba-turnos-docker.mjs --federaciones prueba-a,prueba-b,prueba-c --volumen-datos facylf-datos-prueba --memoria-gb 2 --turno-min 1` |
| comprobar que la limpieza de Chrome no toca a los vivos | `powershell -NoProfile -File scripts/_prueba-limpieza-respeta-vivos.ps1` |
| que la flota suelte capacidad según terminan las federaciones | `node scripts/ajustar-flota.mjs [--aplicar] [--solo <fed>]` |
| pruebas de los guiones (colas, decisión de flota, compose) | `pnpm recolector:test` |
| reanudar una federación en pausa, dejando constancia | `node scripts/_reanuda-tras-pausa.mjs <federación> --nota "por qué"` |
| lanzar **una** sesión de una federación (pruebas y reanudaciones) | `node scripts/_lanza-worker.mjs <federación> [--max N]` |
| dar trabajo real a una cola de prueba (sólo copias, nunca producción) | `bash docker/_haz-trabajo.sh <federación>` (dentro de un contenedor) |
| comprobar que el índice del presupuesto diario se usa | `node scripts/_explain-presupuesto.mjs <federación>` |
| adelantar el día de Madrid en las colas (idempotente; el recolector lo hace solo) | `node scripts/migrar-colas-dia-madrid.mjs [federación...]` |
| cuánto cuesta comprobar el presupuesto diario, antes y después | `node scripts/_mide-peticiones-hoy.mjs` |

Y las **tareas programadas** (en el PC; en el servidor, su equivalente en `cron` y en el compose):
`FACyLF recolector*` (un supervisor por federación), `FACyLF ingesta fin de semana` (07:30 diario),
`FACyLF vigilar flota` (una vuelta por hora) y `FACyLF-LimpiarChrome` (barrido de huérfanos cada 5 minutos).

## 19/09/2026 · La víspera del servidor: autocuración, dos fallos de datos y la flota que suelta capacidad

Repaso a fondo de lo que se deja montado, con la pregunta de siempre: **¿funciona esto solo cuando nadie mira?** Lo
que salió de las pruebas fueron tres cosas buenas y dos fallos que habrían dado la cara el primer día en Debian.

### 1 · Autocuración: 10 de 10, y en los dos niveles que importan

`script scripts/prueba-autorrecuperacion-docker.mjs` (federación de prueba, cola y plaza propias) mata primero al
**worker** y después al **contenedor**, y comprueba que cada nivel lo levanta quien tiene que levantarlo:

| comprobación | medida del 19/09/2026 |
|---|---|
| el contenedor trabaja antes del corte | 71 → 82 peticiones |
| **el supervisor de dentro relanza al worker** | 82 → 88 peticiones (línea «Arrancando o reanudando» en su registro) |
| **Docker lo levanta solo** (política de reinicio) | estado `running · 1 · 0` (en marcha, **1 reinicio**, código de salida del anterior: 0) y **PID nuevo** |
| sigue recolectando donde lo dejó | 82 → 99 peticiones |
| ningún trabajo se queda a medias | `en_curso = 1`, **abandonados = 0** (la fila se está tocando ahora) |
| lo que quedó a medias vuelve a la cola | **1 trabajo devuelto a `pendiente`** por la sesión nueva |
| no se pierde trabajo | 599 → 722 trabajos |
| no hay escrituras a medias | **0** ficheros `.tmp` |
| las actas no se duplican | 808 → 850 actas |

Dos cosas que costó aprender y quedan escritas en el guion, porque la primera prueba daba un falso «aprobado»:

- **`docker kill` no vale para simular un corte**: Docker lo interpreta como una parada a propósito y **no aplica**
  la política de reinicio (se queda `exited`). Lo que sí la aplica es una salida no intencionada;
- **`kill -9 1` tampoco**: el proceso 1 de un espacio de nombres no muere por señales que no maneja, así que el
  contenedor seguía vivo y la prueba «pasaba» sin haber matado nada. Lo que se mata es **al supervisor**, y `tini`
  sale detrás.

Y el trabajo a medias se recupera de verdad: la sesión nueva devuelve a `pendiente` lo que quedó `en_curso` y lo
deja dicho en su registro (`· N trabajo(s) que quedaron a medias en una sesión anterior vuelven a la cola.`). Está
antes de la comprobación de cupo y de la de «no hay trabajo ahora», así que también se recupera si la federación
está en pausa.

### 1-bis · La prueba de aceptación tenía dos fallos propios (y ya no)

Una prueba que se equivoca es peor que no tenerla, así que se apuntan los dos que aparecieron al repetirla el
19/09/2026 con tres federaciones y una sola plaza:

- contaba como **plazas** todo lo que había en la carpeta, incluidas las fichas de **espera**
  (`espera-pnfg-*.ficha`), que son justo lo que debe pasar cuando hay más federaciones que plazas: con tres
  contenedores y una plaza, dos están esperando turno. El resultado era un informe en rojo —«2 ≤ 1» y «1 ficha
  fantasma»— con el reparto funcionando bien. Ahora cuenta `slot-*.lock` y dice aparte cuántas esperan;
- hacía `docker compose down -v` del proyecto **entero** al empezar: lanzarla en el servidor con la recolección en
  marcha tumbaba toda la flota y borraba el volumen de plazas que estaban usando los contenedores vivos (se llevó
  por delante, de hecho, el contenedor de la federación de prueba recién levantado). Ahora retira sólo sus propios
  contenedores `aceptacion-*` y su propio volumen de plazas: se puede lanzar sin miedo con la flota trabajando.

Con los dos arreglos, la misma pasada da **9 de 9** (se comprobó dos veces seguidas) y el estado del conjunto es el
mismo que antes: 1 plaza concedida de 1, 451-549 MB de 2.048 MB, 0 plazas sin dueño al parar.

### 2 · FALLO: una cola nueva se quedaba sin tablas (habría roto la primera federación del servidor)
Al escribir las pruebas del ajuste de flota, `abreBase` falló sobre una cola recién creada. La causa estaba en el
esquema: el índice del cupo diario se creaba **antes** que la tabla a la que indexa

```sql
create index if not exists peticiones_dia on peticiones(substr(iniciada_en, 1, 10));
create table if not exists peticiones ( … );       -- nunca llegaba a ejecutarse
```

y `db.exec` corta la lista entera en el primer error. Medido en una cola nueva: se creaban **13 tablas** y faltaban
`peticiones`, `archivos`, `eventos` y todo lo que venía detrás (17 en total después del arreglo). En el PC no se
notó **porque las colas son de antes de que existiera ese índice**; en un servidor nuevo, la primera federación que
arranca se queda sin tabla de peticiones. Arreglado (la tabla va antes que su índice) y con prueba que lo fija.

### 3 · FALLO: el cupo diario se contaba por día UTC, no por día de Madrid

Había una prueba **en rojo** en `scripts/lib/recolector-local.test.mjs` («el presupuesto diario usa el día civil de
Madrid, no el día UTC») que describía justo lo que no se cumplía: la marca de tiempo se guarda en UTC y el cupo se
contaba comparando la fecha de **Madrid** contra `substr(iniciada_en, 1, 10)`. En enero, una petición de las 23:30
UTC del 31 (00:30 del 1 en Madrid) contaba para el 31: **el cupo se renovaba a medianoche UTC**, una o dos horas
después de la medianoche de Madrid, y en ese hueco se podían pedir peticiones de más. (Y no pasaba nada por tener
la prueba en rojo porque `pnpm test` sólo ejecuta `packages/*/test` y `apps/*/test`: los guiones se prueban con
`pnpm recolector:test`.)

Arreglado en la cola: cada petición guarda su **día de Madrid** (`peticiones.dia_madrid`) y el cupo es una igualdad
contra un índice. La columna se añade sola a las colas que ya existían y sus peticiones se rellenan —medido en la
cola de Andalucía: **4,7 s con 29.239 peticiones**—, así que en el servidor no hay que migrar nada a mano: lo hace
el propio recolector la primera vez que abre cada cola. El día de Madrid se calcula en un solo sitio
(`lib/dia-madrid.mjs`), que antes estaba copiado en tres guiones.

### 3-bis · FALLO: el relleno no se podía reanudar y dejaba días sin contar

El relleno de esa columna se hacía «sólo la primera vez»: si la columna se acababa de crear. Medido el mismo día en
las 19 colas reales: la de **`federacion` tenía la columna puesta y 36.768 peticiones sin rellenar** — el relleno se
cortó a medias (una sesión que muere, un bloqueo de otra escritura) y nadie volvía a mirarlo, así que esas
peticiones no se contarían nunca en su día. Ahora el relleno se **reintenta en cada arranque** mientras queden
filas sin día, deja constancia de lo que hizo (`metadatos.dia_madrid_relleno`) y, si falla, no impide que el
recolector arranque. Medido después del arreglo, en las 19 colas: **0 filas sin día** (y las tres que todavía no
tenían la columna —cataluña, Madrid y Valencia, con 14.335, 20.849 y 38.123 peticiones— la reciben y se rellenan en
3,1 s, 5,1 s y 9,6 s, una sola vez).

### 4 · La flota suelta capacidad según acaba (`scripts/ajustar-flota.mjs`)

Es lo que faltaba para el final del encargo: cuando las federaciones van terminando, la recolección tiene que
**devolver** capacidad, no quedarse con diecisiete contenedores despiertos por si acaso. El guion lee las colas con
el mismo criterio que el supervisor, decide federación a federación y (con `--aplicar`) para las que no tienen nada
que hacer y levanta las que vuelven a tener trabajo. Sin `--aplicar` sólo informa.

Medido el 19/09/2026 con las colas de verdad (18 federaciones): **16 con trabajo disponible ahora**, y las dos que
no lo tienen **se paran y se levantan cuando toca** —

| federación | decisión | por qué |
|---|---|---|
| canarias | `abajo` | 190 trabajos aplazados hasta el **21/09 06:00** |
| euskadi | `abajo` | 529 trabajos aplazados hasta el **19/09 13:42** |
| ceuta | `arriba` | 2 trabajos, el siguiente **dentro del horizonte de 2 h** (no compensa parar y levantar) |

Tres reglas que lo hacen seguro: una federación **terminada** no se vuelve a levantar sola (su plan dice
`reanudarEn: null`, pero el trabajo sigue en la cola); una federación cuya **cola no se puede leer no se toca**
(desconocido no es cero); y si **el demonio de Docker no responde no se actúa** — comprobado el mismo día, con el
disco del PC lleno y el motor colgado: el informe llegó a decir «0 contenedores en marcha» y dieciséis federaciones
«sin contenedor creado», que era falso. Ahora avisa de que no sabe el estado y `--aplicar` sale con código 3 sin
tocar nada.

Y el ciclo entero, probado en vivo con el contenedor de la federación de prueba (no sobre una federación real, para
no duplicar trabajadores con las tareas del PC):

| paso | medida del 19/09/2026 |
|---|---|
| con trabajo disponible | decisión `arriba` · 100 trabajos ahora · contenedor en marcha |
| se le pone una pausa de 6 h (deja de tener nada que hacer) | decisión `abajo` · «227 trabajos aplazados hasta 20:09: se para y se levanta entonces» · 542 MB |
| `--aplicar` | **parados 1: prueba-10gb** · el contenedor queda parado · **0 plazas fantasma** en el volumen compartido |
| se quita la pausa | decisión `arriba` |
| `--aplicar` | **levantados 1: prueba-10gb** · el contenedor vuelve a estar en marcha a los 8 s |

En el servidor va en el `cron` cada quince minutos (`*/15 * * * * node scripts/ajustar-flota.mjs --aplicar`), y la
federación de prueba se ha sacado del arranque normal con un perfil de Compose (`prueba-10gb` sólo se levanta si se
nombra), para que un `up -d` no ponga a recolectar una federación que no existe. Ese perfil obligó a arreglar la
prueba de aceptación, que contaba los servicios del compose sin perfiles y daba «faltan: prueba-10gb»: ahora los
pide con `--profile '*'` (y sigue dando 9 de 9 con tres federaciones y una sola plaza).

### 4-bis · FALLO: las fichas de espera no se podían juzgar (turnos fantasma en Docker)

Cuando hay más federaciones que plazas, cada worker escribe una **ficha de espera** para pedir el turno, y el orden
lo decide la antigüedad de esa ficha. Esa ficha guardaba **sólo el identificador de proceso**, y dentro de Docker el
pid no significa lo mismo en un contenedor que en otro: la ficha que dejaba un contenedor muerto (un `kill -9`, un
OOM, un reinicio) podía parecer viva —el pid 42 existe en todos los contenedores— y los vivos cedían su turno por
un fantasma, además de creer que había federaciones por delante que no existían. El mismo problema ya se había
arreglado en las fichas de **plaza** (que llevan `pid contenedor`), pero no en las de espera.

Arreglado así:

- la ficha de espera pasa a ser `pid contenedor hora`, con el mismo criterio que la de plaza: en mi contenedor
  manda el proceso; en otro, el **latido** (sin señales durante `SIN_LATIDO_MS` = 5 min, se da por abandonada);
- la ficha se refresca como latido mientras se espera, para que a nadie le quiten el sitio por esperar mucho;
- y la **hora de llegada va dentro del fichero**, no en su fecha: si el latido fuese también el orden, refrescar la
  propia ficha pondría a su dueño el último de la cola (la primera versión de este arreglo hacía exactamente eso).

Comprobado el 19/09/2026 en la prueba de turnos (tres federaciones, **una** plaza, turno de un minuto, seis minutos
de observación):

| qué se mide | medida |
|---|---|
| plazas ocupadas en todo momento | **1** (el presupuesto permite 1): nunca una de más |
| los tres contenedores vivos al terminar | ✓ `running` |
| el reparto se ejercita de verdad | 4, 4 y 3 esperas de turno en los registros |
| **todas las federaciones entran** | **10, 7 y 11 turnos** concedidos en seis minutos |
| al parar | **0** plazas sin dueño |
| una ficha de espera de un contenedor parado | **se recoge** («1 → 0 ficha(s) de espera») |

Esa última es justo la que antes no pasaba nunca: sin la comprobación por contenedor, esa ficha se quedaba ahí para
siempre haciendo que los vivos cedieran su turno por un fantasma. La prueba queda como guion
(`scripts/prueba-turnos-docker.mjs`), con las dos medidas que importan en el servidor: **nadie ocupa una plaza de
más** y **todas las federaciones entran a lo largo del día** aunque haya más federaciones que plazas.

### 4-ter · FALLO GORDO: la limpieza de Chrome daba por huérfano TODO (mataba navegadores vivos)

El informe de la flota decía «71 navegadores huérfanos · 6,9 GB». Al mirarlo de cerca, la cuenta no cuadraba: en el
PC había 78 procesos de Chrome con 11 perfiles en uso, es decir, justo lo que ocupan **once recolectores
trabajando** (un navegador son ~7 procesos). Los «huérfanos» eran los navegadores vivos.

La causa, en `limpiar-chrome-huerfano.ps1`: el diccionario de procesos estaba indexado por enteros

```powershell
foreach ($p in Get-CimInstance Win32_Process) { $procesos[[int]$p.ProcessId] = $p }
```

y se consultaba con `$p.ProcessId`, que en WMI es un entero **sin signo**: dos tipos distintos no son la misma
clave en un diccionario de .NET, así que **ninguna** búsqueda encontraba nada y la función «¿tiene un `node` vivo
por encima?» contestaba siempre que no. Con eso, la herramienta clasificaba como huérfano todo lo que veía
(medido: **72 de 72**, incluidos los que tenían `chrome ← chromedriver ← node.exe ← cmd ← powershell` enteros y
vivos) y la tarea programada `FACyLF-LimpiarChrome`, que la llama **cada cinco minutos**, estaba matando los
navegadores de los recolectores que estaban trabajando: ~7 GB por pasada y, en las colas,
`error_navegador: invalid session id: session deleted as the browser has closed the connection`.

Arreglado indexando y consultando por TEXTO (`[string][int]$pid`), que no admite dos tipos distintos. Y con prueba
que lo fija en las dos direcciones, porque una limpieza que no limpia nada también es un fallo
(`scripts/_prueba-limpieza-respeta-vivos.ps1`, con `-Listar` en la herramienta para poder mirar sin matar):

| comprobación | antes del arreglo | después |
|---|---|---|
| un navegador vivo (8 procesos) colgando de un `node` | **aparecía como huérfano** ✗ | no aparece ✓ |
| ese navegador sobrevive a una limpieza de verdad | **0 procesos: lo mataba** ✗ | 8 procesos en pie ✓ |
| cuando el worker muere, su navegador sí es un huérfano | — | aparece en la lista ✓ |
| y la limpieza se lo lleva | — | 0 procesos ✓ |
| el PC entero, ahora | «71 huérfanos» (falso) | **«no hay Chrome huérfano de recolector: nada que limpiar»** ✓ |

Ese último dato es el que cierra el caso: no había basura acumulada; lo que había era una herramienta a punto de
matar, cada cinco minutos, los navegadores de la flota.

Y se nota en las colas, medido **en la flota de verdad** con la ventana de 10 minutos siguiente al arreglo:

| ventana | `error_navegador` («invalid session id») |
|---|---|
| 30 minutos antes (con la limpieza matando cada 5 min) | 4-6 por federación y ventana, en 11 federaciones |
| 10 minutos después | **0 en todas** (y 49, 46, 45, 63, 50, 44, 85, 39, 34, 48, 92 peticiones correctas) |

Queda una observación aparte, de otra cosa: **Navarra** devuelve 68 páginas de acta seguidas que se descargan pero
no se pueden interpretar («maquetación distinta») sin una sola lectura correcta en esos diez minutos. No es de este
arreglo —venía de antes— y resultó ser otra cosa: está contado en la sección siguiente.

### 4-ter-bis · Navarra, Euskadi y Murcia: fichas de acta VACÍAS de partidos antiguos (19/09/2026)

Aquello de «Navarra no interpreta sus actas» resultó ser otra cosa, y la medición lo dejó claro. En 24 horas,
Navarra hizo **1.910 peticiones** que acabaron en «la página del acta se descargó pero no se puede interpretar»
frente a 1.332 correctas. Mirando el HTML **ya archivado** en la cola con el mismo inspector que usa el recolector:

| | ficha que NO se interpreta | ficha que SÍ (control) |
|---|---|---|
| tamaño | 102 KB | 123-125 KB |
| `<table>` / `<tr>` | **7 / 9** | 18-21 / 71-74 |
| alineaciones, goles, tarjetas, cambios, árbitro | **0 en todo** | los tiene |

Es decir: no es una maquetación distinta, es una **ficha vacía**. Y los partidos eran de **mayo de 2024** (temporada
2023-24): la federación ya no sirve esas actas. Es el mismo caso que Murcia, que para fichas antiguas devuelve una
página de 39 bytes —y que ya estaba contemplado en el código—.

Lo que faltaba era el atajo: el recolector gastaba **tres intentos repartidos en días** antes de descartar la ficha,
así que cada acta inexistente costaba tres peticiones. Ahora, si la página viene **vacía** (sin alineaciones, goles,
tarjetas, cambios ni árbitro) y el partido tiene **más de 60 días**, el trabajo se descarta **a la primera** y el
acta queda `ausente_web` —igual que antes, pero sin los otros dos intentos—, y **no cuenta como fallo seguido** (una
racha de estas cortaba la sesión entera). Con partidos recientes NO se aplica: ahí sí puede ser que la federación
publique en unos días, y se sigue reintentando.

Medido sobre las colas de verdad, todas las actas pendientes por este motivo son de partidos antiguos, así que el
atajo aplica a todas:

| federación | pendientes con «no se puede interpretar» | de partidos de hace más de 60 días |
|---|---|---|
| Navarra | 929 | **929** |
| Euskadi | 53 | **53** |
| Murcia | 5 | **5** |

Para Navarra eso son del orden de **1.900 peticiones que ya no se hacen** (las dos terceras partes de su tráfico de
un día), gastadas en fichas que la fuente ya no publica.

### 4-quater · FALLO: Cataluña descartaba clasificaciones de grupos que aún no habían jugado (19/09/2026)

Cataluña era la única federación con errores de ingesta de verdad: **30 fallos frente a 31 aciertos** en la ventana
de media hora, y sólo **245 de 2.776 clasificaciones** hechas. El mensaje era siempre el mismo —«la clasificación no
trae tabla»— y venía de que la pestaña `CLASSIFICACIÓ` del portal de la FCF **no pinta tabla cuando no hay nada que
clasificar**: en la temporada recién empezada hay muchos grupos cuyo primer partido todavía no se ha jugado.

El problema no era el mensaje, era lo que se hacía con él: se trataba como error de maquetación, se reintentaba a
las 6 y a las 24 horas y, **al tercer intento, el trabajo quedaba descartado** (`cancelado`). Es decir, esos grupos
no iban a volver a pedir su clasificación nunca. Medido sobre los 169 trabajos que habían fallado así:

| qué es en realidad | cuántos | qué se hace ahora |
|---|---|---|
| el grupo tiene calendario y **ningún partido jugado** | **141** | se trata como *publicación pendiente*: se reintenta a los 2 días, no se descarta |
| todavía **no se ha leído** su calendario | **25** | se reintenta sin llamarlo error; en la vuelta siguiente la respuesta es de verdad |
| el grupo **sí ha jugado** y no hay tabla | **3** | sigue siendo un error, y se ve en los avisos: eso hay que mirarlo |

La decisión vive en `scripts/lib/clasificacion-cataluna.mjs` con sus cuatro pruebas (`node --test`), y se apoya en el
calendario que el propio recolector ya tiene en su cola: no hace ninguna petición de más para decidir. Además, los
**69 trabajos ya descartados** por este motivo se han devuelto a la cola con
`node scripts/_reactiva-clasificaciones-cataluna.mjs --aplicar` (informa primero, y sólo devuelve los que la decisión
nueva dice que no eran error: los 3 de formato real se quedan como están).

Y en el mismo sitio se arregló una carrera: la tabla se extraía **nada más pulsar la pestaña**, cuando el área
principal todavía mostraba el calendario —`esperaDatos` da por buena la página en cuanto hay texto—. Ahora se
sondea el DOM ya cargado hasta 20 s, sin pedir nada al servidor, así que una tabla que tarda un poco más se
aprovecha en vez de contarse como fallo.

Los 3 grupos de formato real quedan pendientes de confirmar en una sesión de verdad (el recolector de Cataluña está
esperando memoria en el PC, ver más abajo) y sus grupos ya tienen partidos jugados con URL completa, así que puede
ser cosa de la propia fuente.

Y la vigilancia larga de la flota —480 minutos, 09:14Z a 17:13Z, una vuelta cada diez— deja una lección que no es
del programa sino de cómo se vigila:

- sus últimas vueltas decían **`plazas 0/19` con 60-98 procesos de Chrome vivos**, que es imposible si el semáforo
  funciona. No era del programa: era del **vigilante**, que llevaba desde las 09:14Z ejecutando el código que
  cargó al arrancar. Yo cambié `vigilar-flota.mjs` a las 09:50Z (para leer el formato nuevo de ficha, `pid
  contenedor`) y las fichas empezaron a escribirse así cuando los workers fueron reiniciando con la versión nueva:
  medido, entre las 10:15Z y las 10:25Z el vigilante viejo dejó de entenderlas (leía el identificador de proceso
  de una cadena que ya traía el contenedor al lado → `NaN` → «muerta») y contó cero durante siete horas;
- una vuelta **nueva** del mismo guion, dos veces y en los dos contextos (primer plano y trabajo de fondo), da lo
  correcto: **8 de 19 plazas** con 65-77 navegadores y **0 huérfanos**.

Dos cosas que quedan escritas para el servidor: **una federación no puede estar trabajando sin plaza**, así que ese
par de números juntos es siempre un síntoma; y **un vigilante de larga duración hay que reiniciarlo cuando cambia
su código o el formato de lo que lee** — si no, informa de un mundo que ya no existe (y encima con toda la
apariencia de estar midiendo).

### 5 · La reserva de máquina, comprobada en vivo
`FACYLF_RESERVA_GB` es la memoria que la recolección **deja libre** para el resto del servidor (la web, el
importador, la base de datos). Con la reserva puesta en 20 GB, un contenedor con trabajo disponible y plaza libre
escribió en su registro

```
· esperando para abrir Chrome: cabe por reparto (1/11) pero al SISTEMA le quedan 17,35 GB y su reserva es 20 GB:
  se deja sitio a lo demás
```

y abrió **0 procesos** de Chrome. Es la diferencia entre «cabe en el presupuesto» y «cabe sin quedarse con la
máquina».

### 6 · Una incidencia real que sirvió de prueba

El 19/09 el disco del PC se llenó y el motor de Docker dejó de responder durante unos 40 minutos. `wsl --terminate
docker-desktop` no lo recuperó; reiniciar Docker Desktop sí, y al arrancar el motor **el canónico y el worker del
importador volvieron solos** por su política de reinicio (`facylf-postgres` y `factucore-worker`, en marcha). Es la
misma propiedad que se comprueba en la prueba de autocuración, vista de verdad y sin prepararla.

## 20/09/2026 · Los navegadores crecían a 23 procesos cada uno (y dejaron el PC sin memoria)

**El síntoma**: el PC quedó inutilizable —**322 procesos de Chrome del proyecto**, 0,68 GB libres de 31,9 GB y la CPU
al 100 %— con la flota aparentemente normal. El barrido de huérfanos decía que no había nada que limpiar, y tenía
razón: no eran restos sin dueño, eran **árboles vivos de más**.

**El diagnóstico** (medido, no supuesto): había **11 navegadores** (uno por plaza: el semáforo funcionando) pero
**256 procesos**, es decir **23 procesos por navegador** donde lo sano son 6-10. Desglosado, uno de ellos tenía
**36 renderers**: Chrome estaba aislando cada dominio (publicidad, widgets y marcos de los portales) en su propio
proceso, y el navegador de UN worker llegaba a **3.279 MB**. Con once navegadores a la vez, esa es la memoria del
equipo entero.

**El arreglo**, en las opciones de Chrome de los dos recolectores que usan navegador (`recolector-local.mjs` para las
PNFG y `recolector-cataluna-datos.mjs`):

```
--disable-site-isolation-trials
--disable-features=IsolateOrigins,site-per-process
--process-per-site
```

No cambia ni una petición ni un byte de lo que se guarda: sólo en cuántos procesos se pinta la misma página.

**Comprobado después del arreglo** (reinicio de la flota y barrido de restos):

| | antes | después |
|---|---|---|
| procesos de Chrome del proyecto | 322 | **21** (11 navegadores × 7) |
| procesos por navegador | 23 (36 renderers en uno) | **7,0** |
| memoria libre del PC | 0,68 GB | **10,25 GB** |
| peticiones por 10 min | 382 | **884-1.092** |
| huérfanos | 0 | 0 |

O sea: el mismo trabajo, **2,3-2,9 veces más rápido** y con la memoria del PC de vuelta. La limpieza de restos que ya
existía **no bastaba** (los navegadores tenían dueño vivo), así que el orden que funciona es **reiniciar la flota y
después barrer**: el propio supervisor retira los navegadores de los workers que se han cortado.

**Y para que no vuelva a pasar en silencio**, el vigilante (`vigilar-flota.mjs`) informa ahora de la proporción, que
era el número que faltaba:

```
17:19Z · pet/10min 1032 · plazas 11/19 sin declarar · navegadores 11 raíz / 72 procesos (huérfanos 0) · libre 6.20 GB
```

Con más de 12 procesos por navegador añade `← N POR NAVEGADOR, REVISAR`. Ese día, con la métrica a la vista, se
habría visto en la primera vuelta en lugar de después de dejar el equipo sin aire. (También dice si el presupuesto de
plazas está *sin declarar* en ese entorno: el vigilante se lanza a mano y no lleva las variables de
`entorno-flota.ps1`, así que su «11/19» sale de la mitad de la máquina, no del presupuesto de 10 GB que sí usan los
recolectores.)

*(Aparte: la CPU sigue alta —859 % de 1.114 % en 12 núcleos, casi todo de los navegadores— pero eso es la flota
trabajando: once peticiones por segundo sobre portales con mucho JavaScript. La palanca para eso es el ritmo, que es
una decisión de producto, no un defecto.)*

## 20/09/2026 (bis) · Cada página se pedía DOS veces por el aviso de cookies

**El síntoma**: la mitad de las peticiones de casi todas las federaciones salían con `requiere_cookie` —44 y 44 en
media hora en Andalucía, 76 y 75 en Murcia— y el ritmo útil estaba a la mitad de lo que debía.

**El diagnóstico**: mirando las filas de la cola, una por una, se veía el patrón: por **cada** navegación había
**dos** filas con la **misma URL**, una `requiere_cookie` de 2-7 s y otra `ok` de 12-58 s. El código trataba
cualquier cartel de consentimiento como un muro —`/cmpbox|consentimiento para cookies|aceptar todo/`— y, al
encontrarlo, intentaba aceptarlo y **volvía a pedir la página entera**. Pero el cartel viaja **dentro** de la
página: los portales PNFG sirven el acta o la jornada completa (200-230 KB en Andalucía, 111-115 KB en Murcia) con
el aviso dentro del HTML, y el intérprete lo lee sin problema. La federación pagaba dos peticiones y hasta sesenta
segundos por el mismo dato.

**El arreglo**: distinguir por **tamaño**. Un muro de verdad devuelve una página vacía o de cortesía (Melilla: 117
bytes; el aviso de «no se ha aceptado el cookie»: menos de 3 KB); una página de decenas de KB ya trae el contenido.
El caso de Melilla se sigue resolviendo igual y los demás no pagan dos veces por lo mismo.

**Comprobado** (10 minutos después de reiniciar la flota):

| | antes | después |
|---|---|---|
| fallos por federación y 10 min | 17-101 (`requiere_cookie`) | **0** en casi todas |
| peticiones útiles / min | ~35 (la mitad eran repetidas) | **76** |
| intervalo inicio→inicio | — | **13 de 15 federaciones entre el 80 % y el 120 %** de lo configurado |

Y de paso quedó una herramienta para mirar esto cada día sin volver a leer colas a mano:
`node scripts/ritmo-por-federacion.mjs [--minutos 30]` compara, federación a federación, el intervalo configurado
con el medido y dice por qué no pide la que no pide. **Ojo con la métrica**: lo que se compara con el intervalo es
el hueco **inicio→inicio** (lo que el recolector garantiza), no la pausa tras la página, que se acorta sola cuando
el portal tarda y hace sacar la conclusión contraria.

## 20/09/2026 (ter) · La flota en el PC: que quepa en un equipo de trabajo

**La queja, con razón**: el PC quedaba sin CPU ni memoria para nada más. Medido antes de tocar nada:

| quién | memoria privada | CPU |
|---|---|---|
| **proyecto** (12 navegadores + 19 supervisores + workers) | **8,75 GB** | 801 % de 1.114 % (12 núcleos) |
| **Docker** (sus dos máquinas: `vmmemWSL` + `vmmem`) | **10,2 GB** | — |
| **programas del usuario** (python ×3, ffmpeg, navegador, Taskmgr…) | — | el resto |
| PC | **2,36 GB libres**, 93 % en uso | |

Es decir: el proyecto era una parte grande del problema, pero no la única — y la parte que sí controlo se podía
reducir mucho, porque en el PC estaba corriendo la configuración **del servidor**.

**Cuatro frenos**, todos en la dirección correcta también para el servidor:

1. **Presupuesto del PC a 6 GB** (`scripts/entorno-flota.ps1`) → **7 plazas en vez de 11**: cada navegador son
   ~540 MB medidos.
2. **Reserva de máquina a 8 GB**: si al PC le quedan menos de 8 GB libres, los workers **no abren navegador** y
   esperan. Es el freno que protege al usuario: la recolección cede antes que dejar sin memoria a lo demás.
3. **Publicidad y rastreadores bloqueados** en el navegador (`scripts/lib/bloqueo-terceros.mjs`, con
   `Network.setBlockedURLs` por el protocolo de depuración): no se piden, no se ejecutan, no se pintan. Son los
   que se comían el procesador; el contenido que se guarda es exactamente el mismo.
4. **Tope de CPU por contenedor en el compose** (`cpus: 0.5`, ajustable con `FACYLF_CPUS_POR_RECOLECTOR`): en el
   servidor, con un procesador peor y la web viviendo en la misma máquina, es lo que impide que la recolección
   deje al resto sin CPU.

**Medido después** (siete minutos tras reiniciar):

| | antes | después |
|---|---|---|
| memoria privada del proyecto | 8,75 GB | **4,95 GB** |
| procesos de Chrome del proyecto | 86 | **41** (≈6 navegadores) |
| CPU del proyecto (de 1.114 %) | 801 % | **329 %** |
| memoria libre del PC | 2,36 GB | **8,96 GB** |
| PC en uso | 93 % | **72 %** |

Y la recollección **no pierde trabajo útil**: sigue haciendo ~730 peticiones por 10 minutos. Cuando el PC vuelve a
estar justo, seis federaciones se quedan esperando memoria en lugar de abrir navegadores: eso es el freno 2
haciendo su trabajo, y es reversible (termina la sesión, la plaza se libera y el supervisor la reintenta).

**«La memoria siempre crece»: por qué pasa y qué se ha hecho.** Eran tres cosas sumadas:
1. los navegadores **se acumulaban** (23 procesos cada uno por el aislamiento de sitios de Chrome; arreglado ese
   mismo día, ver arriba);
2. **nada protegía al usuario**: la reserva era de 2 GB y el presupuesto, el del servidor; ahora la flota se
   detiene sola cuando el PC baja de 8 GB;
3. y el resto es **Docker** (10,2 GB en sus dos máquinas) y los programas del propio usuario: en la medición, tres
   procesos de Python y un ffmpeg sumaban más CPU que la flota entera. Bajar la memoria de Docker Desktop en su
   configuración es lo que más aliviaría el equipo, y no es cosa del proyecto.

**Para el servidor**, con su procesador peor, las palancas por orden de efecto: el **tope de CPU por contenedor**
(ya puesto, 0,5), el **presupuesto** (6 GB → 7 plazas, ya probado en el PC), el **bloqueo de publicidad** (ya en el
código) y, si aún va justo, **alargar la pausa entre peticiones** (de 6-8 s a 15-20 s reduce la CPU a la mitad),
que es la decisión de producto que sigue pendiente.

## 20/09/2026 (quater) · Las actas por HTTP: probado y **descartado** (con la prueba hecha)

La idea era buena y se midió en serio: las actas son el grueso del trabajo (miles de fichas por federación) y hoy
se piden con navegador. Si se pudieran pedir por HTTP —como hacen Valencia y Madrid, que resuelven sus fichas en
0,3-2 s— el ahorro de tiempo y de CPU sería enorme.

**Lo que se comprobó** (`scripts/prueba-actas-por-http.mjs`, que rehace por HTTP actas ya hechas y compara el
resultado con lo que guardó el navegador):

- el portal **sí entrega el acta por HTTP**, y rápido: **382-642 ms** frente a 897-2.498 ms del navegador;
- la sesión anónima se abre **una sola vez** por sesión (`/pnfg/` → `NLogin?NSess=1`, que redirige de vuelta), y esa
  cookie sirve después para todas las actas: de 4 peticiones por ficha se pasa a **1**;
- marcador, goles, tarjetas y técnicos **coinciden exactamente** con los del navegador;
- **pero la alineación no**: los dos HTML tienen las mismas 24 filas de jugadores y el intérprete saca **18** de la
  página HTTP (local 5+6, visitante 4+3) frente a **24** de la del navegador (7+6 y 7+4), y el **árbitro** no
  aparece. Es la página **sin el JavaScript** del portal: el navegador la completa antes de que se lea.

Conclusión: **por HTTP se perderían datos de las actas** (seis jugadores y el árbitro en la muestra), así que la
palanca queda descartada: las actas siguen yendo por navegador. La prueba se queda en el repositorio para que nadie
tenga que repetir el camino —y para volver a intentarlo si algún día se afina el intérprete para la página plana—.

Lo que **sí** ha mejorado los tiempos de petición este día, medido: el bloqueo de publicidad y rastreadores
(páginas de 4-15 s a **0,6-1,5 s**, de 4 a 27 veces más rápidas) y quitar la segunda navegación por el aviso de
cookies (la mitad del tráfico y hasta 60 s por ficha). Las peticiones útiles por minuto casi se han duplicado y el
registro ya no tiene avisos que parecían fallos sin serlo.

## 20/09/2026 (quinquies) · Docker y WSL: 10 GB en máquinas virtuales con 470 MB de contenedores

Medido: dentro de Docker sólo había **dos contenedores y 470 MB** (PostgreSQL 403 MB + el importador 69 MB), pero
las máquinas virtuales de WSL comprometían **6,2 GB (`vmmemWSL`) + 4,1 GB (`vmmem`, el Ubuntu del usuario)** porque
`C:\Users\David\.wslconfig` permitía hasta **20 GB** y reservaba **6 de los 12 núcleos**. No era cosa del proyecto,
pero se comía el equipo igual.

Arreglado en el `.wslconfig`: **`memory=8GB`** (sobra para esos dos contenedores y para compilar) y
**`processors=4`** (el PC se queda 8 núcleos). Después de `wsl --shutdown` y volver a levantar Docker Desktop:
`vmmemWSL` de 6,2 GB a **0** y el PC de 6,7 GB a **8,1 GB libres**; el canónico y el importador volvieron solos por
su política de reinicio. La VM de Ubuntu queda **parada** hasta que se use (es la otra mitad del consumo).

## 21/09/2026 · El ritmo de cada worker, medido: cada uno va al que tiene puesto

La pregunta era si cada recolector va de verdad al ritmo que tiene configurado o se queda por el camino. Se mide
con `node scripts/ritmo-por-federacion.mjs --minutos 30`, que compara la mediana del hueco **INICIO→INICIO** con
`ritmo.intervaloMinSeg`/`intervaloMaxSeg` de `recolector.<federación>.config.json`, y dice también **por qué no
pide** cuando no pide (no es lo mismo «esperando memoria» que «averiada»).

**Los que están pidiendo van al ritmo puesto, o más despacio por culpa del portal —nunca más deprisa.** Ventana de
30 min a las 09:13Z, seis federaciones pidiendo a la vez:

| federación | configurado | inicio→inicio | % de lo configurado | página | pet | pet/min | techo |
|---|---|---|---|---|---|---|---|
| navarra | 6-8 s | 7,1 s | 101 % | 1 401 ms | 38 | 1,27 | 7,14 |
| euskadi | 6-8 s | 7,1 s | 102 % | 2 353 ms | 4 | 0,13 | 6,42 |
| valencia | 4-6 s | 5,2 s | 103 % | 797 ms | 226 | 7,53 | 10,35 |
| federación | 6-8 s | 7,9 s | 112 % | 1 821 ms | 25 | 0,83 | 6,80 |
| andalucía | 6-8 s | 7,9 s | 113 % | 981 ms | 16 | 0,53 | 7,52 |
| cataluña | 6-8 s | 17,0 s | 243 % | 15 318 ms | 84 | 2,80 | 2,69 |

**Cinco de seis dentro del 80-120 %** del intervalo configurado, que es lo que resume el propio guion («intervalo
inicio→inicio en el rango configurado: 5 de 6»). Las pet/min sólo dicen algo con ventanas largas: las que acaban de
arrancar salen con 4-38 peticiones y por eso su columna es baja. Cataluña no es una anomalía del programa: su
página tarda 15 s de media (fcf.cat), así que el suelo configurado queda por debajo del tiempo de la propia página
y el intervalo lo marca el portal. El **techo** de cada una es `60 / (intervalo + página)`, y ahí se ve que el
ritmo configurado es alcanzable: valencia va a 7,53 de un techo de 10,35.

**El cupo diario no es el límite**: está en 200 000 peticiones por federación y hoy (a las 09:00 de Madrid) vamos
por 1 128 en valencia, 838 en madrid y 565 en cataluña — el **0 %**. Con el ritmo configurado, una federación de
6-8 s no pasa de **514 pet/h** (44 400 al día) aunque estuviera 24 h pidiendo: el cupo nunca llega a apretar.

**Lo que de verdad frena a la flota es la memoria del PC, no el ritmo.** En esa misma ventana sólo 6 de 20
federaciones pidieron (393 peticiones = 13,1 pet/min frente al techo de 40,9 de esas seis); las demás estaban
«esperando memoria» o «esperando turno». Medido a las 09:00 con el equipo al 96-99 %:

| quién | comprometida | **residente** (lo que se recupera al cerrarlo) | qué es |
|---|---|---|---|
| Brave (tu navegador, 26 proc) | 2,85 GB | **4,09 GB** | aquí vive la propia interfaz del agente |
| DSH Harness (esta sesión) | 3,93 GB | 3,66 GB | el agente con el que se trabaja: no se toca |
| python PID 34892 | 8,36 GB | **3,66 GB** | **VoiceStudio**: `uvicorn --port 3900`, narrando audiolibros |
| ChatGPT/Codex + Claude + Edge WebView | 4,19 GB | 5,72 GB | apps de escritorio del usuario |
| `vmmemWSL` | 3,06 GB | 3,01 GB | la VM de Docker (con 470 MB dentro) |
| PROYECTO navegadores | 2,01 GB | 2,52 GB | nuestro, con los flags de Chrome nuevos |
| Apps varias (Warp, Epic, Spotify, Adobe…) | 2,97 GB | 3,11 GB | del usuario |
| PROYECTO supervisores + recolectores | 2,46 GB | 2,06 GB | nuestro |
| `vmmem` (Ubuntu) | 4,01 GB | **0,58 GB** | la VM de Ubuntu del usuario |

**Comprometida no es residente, y la diferencia importa**: VoiceStudio tiene 8,36 GB comprometidos (por eso el
Administrador de tareas dice «8 GB») pero sólo **3,66 GB residentes**; el resto es reserva de PyTorch/CUDA que no
está en RAM ahora mismo. Para saber cuánta RAM devuelve cerrar algo hay que mirar la columna **residente**; para
saber cuánta presión quita al archivo de paginación hay que mirar la comprometida. Cerrarlo, por tanto, devuelve
3,7 GB de RAM y además libera 8,4 GB de compromiso.

**`vmmem` (la VM de Ubuntu) no está ociosa y no se cierra «sin más»** (comprobado el 21/09/2026): todas las
`wsl.exe` de esa distro son hijas de `com.docker.backend.exe`, o sea que **la mantiene abierta la integración WSL
de Docker Desktop** (el proceso `docker-desktop-user-distro proxy --distro-name Ubuntu`) — por eso reapareció sola
segundos después del `wsl --shutdown`. Y dentro hay cosas del usuario: un **PostgreSQL 16 nativo** con las bases
`audioworld` y `commerce` (puerto 5434) y un Redis con 4 claves, sin ninguna conexión abierta en ese momento.
Cerrarla de verdad exige apagar esa integración en Docker Desktop y luego `wsl --terminate Ubuntu`; el premio son
**0,58 GB**, poco para lo que rompe. Lo que sí conviene saber es que **sus 4 GB son compromiso, no RAM**.

De ahí las plazas de navegador que se conceden y las que no: con `FACYLF_RESERVA_GB=4` y el equipo por encima del
96 %, el gobernador **no reparte** navegador y las federaciones se quedan paradas con trabajo disponible. No se
toca nada del usuario: se informa y él decide (cerrar el motor de voz devuelve 3,7 GB de RAM y libera 8,4 GB de
compromiso; cerrar ChatGPT y Claude, otros 5,7 GB residentes).

### La VM de Ubuntu, cerrada (21/09/2026)

El usuario confirmó que las bases que había dentro (`audioworld`, `commerce`) no las usa, así que se apagó. **No
basta con `wsl --terminate Ubuntu`**: la levantaba Docker Desktop otra vez en segundos (todas las `wsl.exe` de esa
distro eran hijas de `com.docker.backend.exe`, por la integración con la distro por defecto de WSL). El ajuste
quedó así:

- `C:\Users\David\AppData\Roaming\Docker\settings-store.json` → **`"IntegratedWslDistros": []`** (con copia de
  seguridad en `settings-store.json.bak-20260921`). La clave `EnableIntegrationWithDefaultWslDistro: false` **no
  la respeta** esta versión (Docker Desktop 4.37.1, motor 27.4.0): con ella puesta, Ubuntu volvía a arrancar.
- Con la lista vacía: `Ubuntu → Stopped` de forma estable, `docker-desktop → Running`, y los dos contenedores
  (`facylf-postgres` healthy + `factucore-worker`) arriba por política de reinicio. Se recupera desde la interfaz
  (Settings → Resources → WSL Integration).

**Cuidado al reiniciar Docker en este PC**: matar sólo los procesos de `Docker Desktop` deja vivo el
`com.docker.backend` viejo, que se queda esperando su máquina virtual y **el motor deja de responder** (`docker info`
se cuelga). El reinicio que funciona es bajar también `com.docker.backend`, `com.docker.build` y
`com.docker.dev-envs`, luego `wsl --shutdown` y arrancar Docker Desktop.

### De qué se compone el peso de un recolector (y por dónde se puede aligerar)

Medido el 21/09/2026 con la flota en marcha: **~770 MB residentes por federación activa**, que es justo lo que el
gobernador presupuesta (0,75 GB por plaza: el modelo está bien calibrado).

| componente de una federación | residente | privada |
|---|---|---|
| Chrome: 2 renderers (154 MB cada uno) | 308 MB | 206 MB |
| Chrome: proceso raíz | 196 MB | 114 MB |
| Chrome: `utility` (2 procesos) | 60 MB | 26 MB |
| Chrome: `gpu-process` | 57 MB | 20 MB |
| Chrome: `crashpad-handler` | 10 MB | 2 MB |
| node del recolector | 66-131 MB | 96 MB |
| **cadena de supervisor** (`wscript` → `powershell` → `cmd`) | **~70 MB** | ~80 MB |

Con eso, las palancas para que quepan más federaciones **en el mismo espacio**, por orden de rentabilidad:

1. **Un solo supervisor en Node para las 19 federaciones**, en vez de 19 cadenas de `wscript`+`powershell`+`cmd`:
   medido, esa cadena cuesta 18 procesos `wscript` (464 MB) + 20 `powershell` (671 MB residentes / 1 454 MB
   privados) ≈ **1,1 GB para lanzar la flota**. Un único proceso Node que lance y relance los 19 recolectores con
   el mismo entorno y las mismas reglas de turno (que ya están en `lib/presupuesto-memoria.mjs`) dejaría eso en
   ~80 MB. La lógica de espera, turno y reciclado no se toca: sólo quién lanza a quién.
2. **Recortar el navegador** (es el 81 % del coste de una plaza): `--js-flags="--max-old-space-size=128"` para
   limitar el montón de V8, evitar procesos `utility` que no se usan (`--disable-features=AudioServiceOutOfProcess…`)
   y **bajar el tope de reciclado** de `tocaReciclar` para que ningún navegador pase de ~350-400 MB. Estimado
   −80/150 MB por plaza (10-20 %), con verificación contra el HTML archivado.
3. **Probar `chrome-headless-shell`** (el binario headless puro, sin proceso GPU ni interfaz): es la única palanca
   que puede recortar a la mitad (de ~630 a ~250-300 MB por navegador). Es un **experimento**, no un supuesto: hay
   que comprobar que los portales (fcf.cat, PNFG) se leen igual comparando el parseo con el HTML ya archivado.
4. **Un navegador para varias federaciones**: ahorraría ~400 MB por navegador evitado, pero rompe el aislamiento
   por perfil y complica el semáforo de plazas. **No se recomienda.**

Y la advertencia que ordena todo lo anterior: mientras al PC le queden menos de 4 GB libres, **ninguna de estas
palancas arranca la flota** — el gobernador no reparte navegador. Los recortes sirven para que, con la misma RAM
libre, entren más plazas; la RAM libre hay que sacarla de lo que ocupa el equipo (medido: el proyecto entero son
~4,5 GB: 2,5 de navegadores, 1,1 de supervisores y 0,8 de recolectores).

## 21/09/2026 (bis) · Las 19 cadenas de Windows, sustituidas por un solo proceso

### Lo que costaba lanzar la flota (medido antes de tocar nada)

En el PC cada federación la sostenía su propia cadena: Programador de tareas → `wscript` (oculta la ventana) →
`powershell` (el bucle) → `cmd` → `node` (el worker). Con las 19 federaciones en marcha, esa capa eran **18
`wscript` (464 MB residentes) + 20 `powershell` (671 MB residentes, 1 454 MB privados) + 19 `cmd`**: **más de un
giga para arrancar la flota**, más que todos los navegadores juntos y sin recolectar nada. Dentro de un
contenedor esto no existe, pero en el PC es donde se desarrolla y donde se recoge casi todo.

### Lo que hay ahora

- `scripts/lib/plan-flota.mjs` — el plan de las 19 federaciones (qué guion, con qué argumentos, qué cola, qué
  limpieza previa y qué ventana de espera) y las decisiones puras: worker ajeno, limpieza de huérfanos,
  entorno de los hijos, línea de registro. **Probado sin abrir un navegador** (`plan-flota.test.mjs`, 12 casos).
- `scripts/supervisor-flota.mjs` — un solo proceso que mantiene las 19 federaciones: comprueba que no haya un
  worker ajeno, limpia los navegadores huérfanos y las cachés de SU perfil, lanza el worker, calcula la espera
  con los mismos guiones (`proximo-trabajo.mjs`, `contar-pendientes.mjs`) y lo vuelve a lanzar.
- `scripts/ejecutar-oculto-nodo.vbs` + `scripts/registrar-tarea-flota.ps1` — la tarea `FACyLF flota`, con los
  mismos disparadores que tenían las 19 (al iniciar sesión y una vez al día).

**Lo que NO cambia, y es lo importante**: cada federación sigue con su guion, sus argumentos, su cola y su
carpeta; sigue habiendo una sola instancia viva por federación; la limpieza es la misma; las ventanas de espera
son las mismas (incluido el tope de 5 min de Madrid, que no era de 1 h como el de las demás); los registros van
a los mismos `worker-programado.log` y con el mismo formato; y el entorno se lee de `scripts/entorno-flota.ps1`.

| medido el 21/09/2026 | antes | ahora |
|---|---|---|
| procesos para lanzar la flota | 37 (`wscript`+`powershell`+`cmd`) | **1** (`node`) |
| memoria residente de esa capa | ~1,1 GB (1,5 GB privados) | **0,06 GB** |
| proyecto entero en el PC | ~4,5 GB | **2,22 GB** |
| peticiones de la flota | 13,1 pet/min | **19,1 pet/min** |
| federaciones pidieron en 25 min | 6 de 20 | 5 de 20 (las que caben con la RAM que hay) |

Los 19 workers siguen ahí, uno por federación y **sin duplicados** (comprobado por línea de órdenes), y las
federaciones que consiguen plaza van al **98-103 %** de su intervalo configurado.

### Dos lecciones de la migración (para no repetirlas)

1. **El registro de cada federación no se puede abrir dos veces.** Mientras el worker corre, `cmd` mantenía
   abierto el `worker-programado.log` para redirigir ahí su salida, así que cualquier intento de añadir una línea
   desde fuera fallaba con `EBUSY`. El supervisor ahora abre el fichero **una vez** por federación y usa el mismo
   descriptor para sus líneas y para la salida del hijo; y si el registro está en uso, espera y reintenta en vez
   de forzar.
2. **La guarda de migración importa.** Mientras las tareas antiguas sigan vivas (o si alguien las vuelve a
   arrancar), el supervisor único espera en vez de lanzar su copia: se comprueba por federación que no quede
   ningún supervisor de PowerShell suyo. La primera versión emparejaba por nombre de guion y confundía el de
   Madrid con el de Navarra; lo cazó una prueba.

### Las otras dos palancas: probadas y DESCARTADAS con medición

Se construyó `scripts/prueba-banderas-chrome.mjs` para no volver a decidir esto «porque suena razonable»: carga
**la misma URL dos veces** (alternando el orden, para que la caché no favorezca a ninguno), mide procesos,
memoria residente y privada, y compara una **huella del contenido** (tablas, filas, celdas, longitud del texto y
resumen del texto de las celdas). Si la huella cambia, la palanca está cambiando lo que se ve.

| palanca | medición (2 actas reales de Navarra) | veredicto |
|---|---|---|
| **Banderas de Chrome** (techo del montón de V8 a 128 MB, apagar audio fuera de proceso, traducción, router de medios, renderer de repuesto, `--disable-component-update`) | 4 MB residentes y 2 MB privados de diferencia: **ruido**. Mismos 7 procesos, mismos 2 renderers, contenido idéntico | **revertida** |
| **Bajar el tope de reciclado a 500 MB** | el navegador ya se queda en ~480-630 MB al cargar unas páginas: reciclaría casi en cada trabajo | **revertida** |
| **`chrome-headless-shell`** (binario sin cabeza aparte, 153.0.8010.52) | **678 MB frente a 481 MB**: 197 MB MÁS, 9 procesos frente a 7 y 3 renderers frente a 2 (no acepta igual las banderas de aislamiento). Contenido idéntico | **descartada** |

Lo único que sigue en pie de todo esto es la refactorización: las banderas viven ahora en
`lib/banderas-chrome.mjs` (una sola lista para los dos recolectores que abren navegador, con su prueba), y el
tope de reciclado admite `FACYLF_TOPE_NAVEGADOR_MB` sin cambiar el valor de siempre cuando no se declara. Los
números del A/B quedan guardados en `pruebas/reconstruccion/banderas-chrome.json` y
`pruebas/reconstruccion/binario-headless-shell.json`.

### Y los números de la flota en el PC, otra vez a la realidad

Con la capa de supervisores fuera, los valores del PC volvieron a lo que el equipo aguanta hoy
(`scripts/entorno-flota.ps1`): **`FACYLF_MEMORIA_GB=3`** (2 plazas de ~480-630 MB) y **`FACYLF_RESERVA_GB=1`**
(la flota entera cabe en 1 GB, así que no puede ahogar al equipo). Con la reserva en 4 GB y el PC al 96 %, las
19 federaciones se quedaban paradas sin abrir un solo navegador: proteger de más también es no recolectar.

**Si se libera memoria, esto es lo que se gana** (tabla de plazas del propio gobernador): con 10 GB declarados
son 11 plazas y con 16 GB entran las 19 federaciones a la vez; medido hoy, el PC tiene 3,7 GB residentes del motor
de voz del usuario y 4,1 GB de su navegador, que es de donde saldrían.

En el `.wslconfig` se bajó además a **`memory=3GB`** y **`processors=2`** (los dos contenedores usan 470 MB; el PC
se queda 29 GB y 10 núcleos). Tras reiniciar WSL y Docker Desktop los contenedores volvieron solos por política de
reinicio y el PC pasó de **0,48 GB a 2,42 GB libres**.

**Defecto de informe corregido**: el contador de fallos sumaba como error todo lo que no fuera `ok`, y en Cataluña
eso daba «61 mal» de 63 peticiones cuando el único error real era 1. Las 175 de dos horas eran `sin_publicar`
—grupos que existen pero aún no tienen calendario, una respuesta legítima del portal—. Ahora la tabla separa
`err` (sólo `resultado` que empieza por `error`) de `sinpub`.



