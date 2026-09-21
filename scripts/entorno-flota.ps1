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
$env:FACYLF_MEMORIA_GB = '3'
$env:FACYLF_TURNO_PLAZA_MIN = '20'
$env:FACYLF_RESERVA_GB = '1'
$env:FACYLF_CHROME_HEADLESS = '1'

# ── TRASPASO AL SERVIDOR: FEDERACIONES QUE YA NO GESTIONA EL PC ─────────────────────────────────────────────
#
# Lista separada por comas. Cuando una federación pasa a recolectarse en el servidor, se copia su cola, se
# arranca su contenedor allí y **se añade aquí**: a partir de ese momento el supervisor del PC no la lanza, así
# que no hay dos flotas pidiendo a la misma federación (peticiones duplicadas) y su memoria queda libre.
#
# El traspaso se hace de una en una a propósito: la memoria se libera poco a poco y se puede comprobar cada
# federación antes de seguir. Cuando estén las 19, esta línea las tendrá todas y el supervisor del PC no
# arrancará nada.
$env:FACYLF_EXCLUIR = 'melilla,andalucia,aragon,asturias,baleares,canarias,cantabria'

# ── TOPE DE RECICLADO DEL NAVEGADOR: SE DEJA EN 900 ──────────────────────────────────────────────────────────
#
# Se probó a bajarlo a 500 MB el 21/09/2026 y no compensa: el navegador ya se queda en ~480-630 MB en cuanto
# carga unas páginas (medido con el A/B de `scripts/prueba-banderas-chrome.mjs`), así que un tope de 500 MB
# reciclaría casi en cada trabajo —más arranques de Chrome— sin bajar el consumo. El recolector admite
# `FACYLF_TOPE_NAVEGADOR_MB` para ajustarlo por máquina, pero aquí no se declara: manda el valor de siempre.
