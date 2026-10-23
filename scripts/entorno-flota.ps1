# Presupuesto de la flota en ESTE PC. El límite duro del servidor se configura en facylf.slice.
#
# ── POR QUÉ AQUÍ NO SE USAN LOS NÚMEROS DEL SERVIDOR (medido el 20/09/2026) ──────────────────────────────────
#
# El PC no es el servidor y no tiene su RAM para esto: es un equipo de trabajo donde conviven otros programas
# (medido ese día: tres procesos de Python y un ffmpeg consumiendo más CPU que la flota entera, y 10,2 GB sólo en
# las máquinas de Docker). Con el presupuesto de 10 GB y una reserva de 2 GB, la recolección llegaba a doce
# navegadores y 8,75 GB privados, y dejaba el PC sin aire.
#
# Estos valores son para el PC y NO viajan al servidor (allí manda `docker/compose.yml` con su `env`):
#
#   · FACYLF_MEMORIA_GB = 5   → 5 plazas (cada navegador son ~540 MB medidos, más lo que el gobernador
#                               conserva para supervisores y operaciones locales) → la flota en ~3 GB.
#   · FACYLF_RESERVA_GB = 4   → si al PC le quedan menos de 4 GB libres, los workers NO abren navegador.
#
# ── POR QUÉ 4 Y NO 6 (medido el domingo 20/09/2026 a las 23:51) ──────────────────────────────────────────────
#
# Con la reserva en 6 GB la flota se quedó con **0 navegadores** y 12 federaciones esperando: al PC le quedaban
# 1,28 GB porque lo llenaban **Python (9,2 GB)**, las dos máquinas de WSL (9,0 GB) y el propio arnés del agente
# (3,7 GB) — no el proyecto, que estaba en ~1-3 GB. Una reserva tan alta no protege al usuario de nada que no
# esté ya protegido (él ve el PC porque la flota cede) y en cambio deja la recolección parada, incluidas las
# pasadas automáticas como la del fin de semana de las 07:30.
#
# Con 4 GB el equipo conserva margen para trabajar y la flota puede usar sus ~3 GB. Si se quiere aún más
# margen para el usuario, se sube; si se quiere recolectar más, se baja. Y si el PC va muy cargado, lo que hay
# que mirar es lo que llena la memoria (Python y las máquinas virtuales), no estos números.
# ── VENTANA DE VERIFICACION: CERRADA (21/09/2026) ───────────────────────────────────────────────────────────
#
# La reserva de 4 GB y el presupuesto de 5 GB venían de cuando la flota en el PC costaba ~4,5 GB: 19 cadenas
# de wscript+powershell+cmd (1,1 GB solo en lanzar), 19 recolectores y los navegadores. Con el supervisor
# único ese pegamento desapareció (medido: 37 procesos y 1,5 GB privados -> 1 proceso y 0,07 GB), así que el
# proyecto entero son ahora ~2,3 GB y los números viejos sólo conseguían que la flota NO recolectara: con el
# PC al 96 % de memoria, una reserva de 4 GB no deja abrir ni un navegador y las 19 federaciones se quedaban
# esperando.
#
# Estos valores están medidos contra el PC tal y como está hoy (VoiceStudio del usuario con 3,7 GB residentes,
# Brave con 4,1 GB, el arnés del agente con 3,7 GB):
#
#   · FACYLF_MEMORIA_GB = 3  → 2 plazas de navegador (cada una ~480-630 MB medidos con
#                              `scripts/prueba-banderas-chrome.mjs`), o sea ~1 GB de flota.
#   · FACYLF_RESERVA_GB = 1  → se deja de abrir navegador cuando al PC le quedan menos de 1 GB. Es bajo a
#                              propósito: la flota entera cabe en 1 GB, así que no puede ahogar al equipo.
#
# SI SE LIBERA MEMORIA, ESTO ES LO QUE SE GANA (medido, no estimado): con 10 GB declarados el reparto da 11
# plazas y con 16 GB entran las 19 federaciones a la vez. Basta subir FACYLF_MEMORIA_GB y reiniciar el
# supervisor; la tabla de plazas por presupuesto está en `docs/plataforma-web/RECOLECCION-10GB.md`.
# 16/10/2026: 6 GB → 6 plazas (la reservada de CyL + 5 compartidas), para que Andalucía y Tenerife no esperen
# turno con el PC a 11 GB libres. Y la reserva sube a 3 GB: cuando a David le queden menos de 3 GB libres, las
# federaciones dejan de abrir navegadores nuevos (CyL sigue, con 1 GB). El margen para trabajar lo da la reserva.
# 20/10/2026: 6 -> 8 GB (8 plazas). En el PC hay 8 federaciones con navegador (CyL, Andalucia, Cataluna y las cinco
# provinciales) y con 6 plazas Andalucia, la de mas trabajo (307.000 pendientes), se quedaba en ~3.600 peticiones/dia
# esperando turno. Cada una pide a su propia web, asi que ninguna web recibe mas que antes. La reserva de 3 GB sigue
# mandando: si a David le quedan menos de 3 GB libres no se abren navegadores nuevos.
$env:FACYLF_MEMORIA_GB = '8'
# Turno de 60 min (antes 20): cada cesión obliga a la siguiente sesión a prepararse otra vez, y en las colas
# de 2 GB eso son 5-20 min parados (16/10/2026). Con turnos de una hora se rota igual y se pierde mucho menos.
$env:FACYLF_TURNO_PLAZA_MIN = '60'
$env:FACYLF_RESERVA_GB = '3'
$env:FACYLF_CHROME_HEADLESS = '1'

# ── QUÉ FEDERACIONES SE RECOGEN EN ESTE PC ──────────────────────────────────────────────────────────────────
#
# Lista separada por comas de las federaciones de las que ESTE PC no se ocupa. El supervisor del PC no las lanza,
# así que no hay dos flotas pidiendo a la misma federación (peticiones duplicadas, y riesgo de que el portal nos
# corte) y su memoria no se ocupa con ellas.
#
# ── EL 24/09/2026 LA DIRECCIÓN SE INVIERTE PARA TRES ────────────────────────────────────────────────────────
#
# Durante el traspaso al servidor esta lista fue creciendo de una en una, hasta quedarse el PC con ocho
# federaciones. Ese día el responsable decide que **Valencia, Madrid y Cataluña vuelvan al PC** y el servidor se
# quede con las otras dieciséis: son las tres más pesadas y las que peor encajaban con el techo de CPU del
# servidor (medido en `docs/plataforma-web/RITMO-MEDIDO.md`). Así que aquí van las otras dieciséis y NO estas tres.
#
# Por eso la lista ya no es «lo que se ha ido al servidor», sino «lo que NO se recoge aquí». Es la misma variable
# con el mismo significado —«de estas no me ocupo yo»—, sólo que el reparto ha cambiado. En el servidor se usa
# igual: `docker/compose.yml` y `docker/web.yml` leen `FACYLF_EXCLUIR` con estas tres, para que el repaso del fin
# de semana no les abra jornadas y para que la web no enseñe unos datos que allí ya se quedan atrás.
#
# Es importante que esta línea y la del servidor sean COMPLEMENTARIAS: ninguna federación puede estar en las dos
# flotas (se pediría dos veces) ni en ninguna (no se recogería).
#
# ── 24/09/2026: `federacion` SALE DE ESTA LISTA, PORQUE NO LA RECOGÍA NADIE ────────────────────────────────
#
# La regla de arriba tiene dos mitades y la segunda se estaba incumpliendo: `federacion` (Castilla y León) estaba
# excluida aquí **y** el servidor que debía recogerla no contesta. Medido el 24/09/2026: `Test-Connection
# 192.168.1.138` falla y el puerto 22 no acepta conexión, y su cola local llevaba **sin avanzar desde el
# 21/09/2026 ~21:35** —la última línea de `registros/supervisor-flota.log` antes del reinicio de hoy es de esa
# hora—. Es decir: no era «la recoge el servidor», era «no la recoge nadie».
#
# Eso importa más de lo que parece: la cola de Castilla y León que alimenta el canónico de ESTE PC es la de este
# PC (`descargas-federacion/recolector-local/cola-v2.sqlite`). Aunque el servidor volviera, su recolección no
# llega a esta base. Y es la federación del equipo que se está siguiendo: sin recolector, su jornada se queda sin
# actas, su clasificación no se puede reconstruir y ningún informe de la plantilla se puede actualizar.
#
# Así que este PC la asume mientras el servidor no esté. **Para devolvérsela, basta con volver a poner
# `federacion` en la lista de abajo y reiniciar el supervisor.** Y hay que hacerlo en cuanto el servidor vuelva:
# si las dos flotas la piden a la vez, se duplican las peticiones a rfcylf.es.
# ── DEVUELTA AL SERVIDOR (24/09/2026, 17:00) — Y AHORA TOCA EL REPARTO POR TEMPORADAS ────────────────────
#
# Otro trabajo de este mismo PC la asumió «mientras el servidor no esté», y su propio comentario fijaba la
# condición para devolverla: «hay que hacerlo en cuanto el servidor vuelva, porque si las dos flotas la piden a
# la vez se duplican las peticiones a rfcylf.es». Esa condición se ha cumplido: medido a las 17:00, el servidor
# tiene sus 16 recolectores en marcha **incluida `federacion`**, y aquí estaba corriendo a la vez desde las 16:37.
# Así que se vuelve a excluir para cortar la duplicación.
#
# Y no se queda así: el responsable quiere esta federación recogida en LAS DOS máquinas a la vez, pero **repartida
# por temporadas** —una temporada completa para cada una, sin solaparse—, que es la única forma de que las dos
# pidan a rfcylf.es sin pedir lo mismo. El filtro ya está hecho y probado (`scripts/lib/temporadas-asignadas.mjs`,
# con `FACYLF_TEMPORADAS=2025-26`), así que el paso siguiente es asignar una temporada a cada máquina y volver a
# quitar `federacion` de esta lista.
# ── ENCENDIDA OTRA VEZ, PERO YA REPARTIDA POR TEMPORADAS (24/09/2026) ──────────────────────────────────────
#
# El responsable quiere esta federación recogida en LAS DOS máquinas a la vez, y la única forma de que las dos
# pidan a rfcylf.es sin pedir LO MISMO es que cada una se quede una temporada completa. Eso ya está montado:
#
#     PC        →  2025-26   (fichero `descargas-federacion/recolector-local/temporadas-asignadas.txt`)
#     servidor  →  2026-27   (el mismo fichero, en su copia de la carpeta)
#
# El filtro lo aplica `scripts/lib/temporadas-asignadas.mjs`, que lee ese fichero **al abrir la cola**: la
# asignación viaja con los datos de la federación, no en el entorno, porque en este PC conviven cuatro
# federaciones y una variable global habría restringido también a Valencia, Madrid y Cataluña sin dar ningún error.
#
# Por eso `federacion` YA NO está en esta lista: se recoge aquí, pero sólo la temporada que le toca. Si algún día
# hay que pararla del todo en el PC, lo que se hace es volver a meterla en la lista, NO borrar su fichero de
# asignación (borrarlo la dejaría trabajando todas las temporadas y duplicaría con el servidor).
$env:FACYLF_EXCLUIR = 'melilla,aragon,asturias,baleares,canarias,cantabria,castilla-la-mancha,ceuta,euskadi,extremadura,galicia,murcia,navarra,rioja'

# ── SE RETOMA EL HISTÓRICO: EL SUELO BAJA DE 2023-24 A 2010-11 (06/10/2026) ───────────────────────────────
#
# El 14/09/2026 se decidió recoger sólo de 2023-24 en adelante, y lo anterior quedó **aplazado**, no borrado:
# `aplazaTemporadasViejas` le puso la fecha centinela `2099-01-01`, que en este proyecto significa «nunca». Esa
# decisión era temporal y su propio código lo dice: `lib/temporada-minima.mjs` tiene una función
# `reactivaTemporadasViejas` «para cuando se retome el histórico», y el suelo se puede cambiar **sin tocar
# código** con esta variable.
#
# Se retoma ahora, y por una razón medida: las federaciones del servidor hacían 1.769 peticiones por hora entre
# las dieciséis, cuando su capacidad (una cada 5-8 s cada una) ronda las 8.000. Es decir, **pasaban la mayor
# parte del tiempo sin trabajo vencido que hacer**. El histórico no le quita el turno al presente: **llena el
# hueco**. El orden lo sigue mandando la prioridad de siempre —competición primero, y dentro de ella la
# temporada más nueva—, así que la temporada en curso se sirve antes que ninguna otra cosa.
#
# NO hace falta un carril para el histórico, y conviene no añadirlo: un carril ADELANTA, y adelantar 285.000
# trabajos por delante del presente sí le quitaría el turno. Bajar el suelo sólo los hace **elegibles**.
#
# OJO CON UNA TRAMPA, ya pagada: `temporadas-asignadas.txt` NO sirve para esto. Ese fichero **restringe** la
# recolección a las temporadas que lista (`lib/recolector-local.mjs:831`), y está pensado sólo para el reparto de
# Castilla y León entre las dos máquinas. Usarlo aquí dejó a Madrid y Valencia encerradas en ocho temporadas
# viejas y fuera de la temporada en curso, sin ningún error que lo dijera.
$env:FACYLF_TEMPORADA_MINIMA = '2010-11'

# ── TOPE DE RECICLADO DEL NAVEGADOR: SE DEJA EN 900 ──────────────────────────────────────────────────────────
#
# Se probó a bajarlo a 500 MB el 21/09/2026 y no compensa: el navegador ya se queda en ~480-630 MB en cuanto
# carga unas páginas (medido con el A/B de `scripts/prueba-banderas-chrome.mjs`), así que un tope de 500 MB
# reciclaría casi en cada trabajo —más arranques de Chrome— sin bajar el consumo. El recolector admite
# `FACYLF_TOPE_NAVEGADOR_MB` para ajustarlo por máquina, pero aquí no se declara: manda el valor de siempre.

# â”€â”€ POR QUÃ‰ 4,5 GB Y NO 3 (28/09/2026) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Con 3 GB salen 2 plazas de navegador: plazas = (memoria - 1,5) / 0,75. El PC recoge CUATRO federaciones,
# asÃ­ que dos se quedaban esperando turno y se turnaban cada 20 minutos. Medido en Madrid: 119 de 360
# minutos sin pedir nada, con 40.120 trabajos disponibles en su cola. Con 4,5 GB salen 4 plazas y ninguna
# federaciÃ³n tiene que ceder el turno. El PC tiene 32 GB de memoria; esto es presupuesto del gobernador,
# no una reserva real.