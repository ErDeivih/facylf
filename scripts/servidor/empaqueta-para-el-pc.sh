#!/usr/bin/env bash
# empaqueta-para-el-pc.sh — deja en un solo fichero lo que el PC necesita para seguir con las tres
#
# ── QUÉ SE EMPAQUETA Y QUÉ NO, Y POR QUÉ ────────────────────────────────────────────────────────────────
#
# Se empaquetan los árboles `descargas-valencia`, `descargas-madrid` y `descargas-cataluna` COMPLETOS, porque el
# PC tiene que poder continuar sin volver a descargar nada: la cola dice qué está hecho y qué no, y las carpetas
# `t<nn>-<temporada>` guardan el HTML y el JSON de cada acta ya descargada (que es lo que luego importa el
# canónico). Lo que se excluye tiene motivo, no es ahorro:
#
#   · `perfil-chrome` — es el perfil del navegador de CADA máquina, con su sesión y sus cookies. El PC ya tiene
#     el suyo funcionando y sobrescribirlo con el del servidor es la forma más fácil de dejar a Cataluña sin
#     poder navegar (además de arrastrar ficheros de sesión única que rompen el arranque de Chrome).
#
#   · `*.previo-*` — copias de seguridad que se hizo el servidor antes de algún cambio (493 MB sólo en
#     Valencia). No son datos de trabajo: son historia del servidor.
#
#   · NO se excluye `cola-v2.sqlite-wal`. Es tentador por limpieza y sería un error: si el WAL tiene
#     transacciones confirmadas que aún no se han consolidado en el fichero principal, tirarlo PIERDE trabajo
#     recién hecho. Se copia tal cual y SQLite lo reconstruye al abrir.
#
# Y se dereferencian los enlaces (`tar -h`): la cola de Cataluña vive en el SSD y en su ruta de siempre hay un
# enlace. Sin `-h` el PC recibiría un enlace roto y se quedaría sin cola.
#
# El paquete se deja FUERA del repositorio (`/srv/data/...`, no dentro de `/srv/data/facylf`): el repositorio es
# el contexto de construcción de las imágenes de Docker y meter ahí un fichero de 2,5 GB es meterlo en cada
# construcción.
#
# SÓLO LEE del repositorio; escribe un fichero nuevo fuera de él.
#
# Uso:  bash scripts/servidor/empaqueta-para-el-pc.sh
set -uo pipefail
export LC_ALL=C

REPO=/srv/data/facylf
DESTINO=/srv/data/traspaso-pc-24sep.tar
FEDERACIONES=(valencia madrid cataluna)

cd "$REPO" || exit 1
rm -f "$DESTINO"

echo "── empaquetando ${FEDERACIONES[*]} (con -h, sin perfiles ni copias previas) ──"
tar -h -cf "$DESTINO" \
    --exclude='perfil-chrome' \
    --exclude='*/perfil-chrome/*' \
    --exclude='*.previo-*' \
    "${FEDERACIONES[@]/#/descargas-}" || { echo 'ERROR al empaquetar'; exit 1; }

echo
echo "── resultado ──"
ls -la --block-size=M "$DESTINO"
echo "ficheros dentro: $(tar -tf "$DESTINO" | wc -l)"
echo
echo "── las tres colas van dentro y con tamaño (comprobación de que el enlace se siguió) ──"
tar -tvf "$DESTINO" | grep 'cola-v2.sqlite$' | sed 's/^/  /'
echo
echo "── huella para verificar la copia en el PC ──"
sha256sum "$DESTINO" | sed 's/^/  /'
