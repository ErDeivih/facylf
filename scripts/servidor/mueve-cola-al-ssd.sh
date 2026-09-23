#!/usr/bin/env bash
# ── MUEVE LA COLA DE UNA FEDERACIÓN AL SSD, DEJANDO UN ENLACE EN SU SITIO ────────────────────────────────
#
# El disco DURO es el cuello: medido el 23/09/2026, la máquina pasa el 37,8 % del tiempo esperando a disco, y
# el trabajo que más lo castiga es el de la cola SQLite (cientos de `insert` por acta sobre una base de 400 MB
# que lee páginas al azar). El SSD del sistema tiene 170 GB libres y la cola son unos cientos de MB.
#
# ── POR QUÉ SE MUEVE CON UN ENLACE Y NO CAMBIANDO RUTAS ──────────────────────────────────────────────────
#
# La cola la leen TRES cosas: el recolector de su federación, el IMPORTADOR (las 19) y el MONITOR. Cambiar la
# ruta obligaría a tocar los tres, y cualquier sitio que se olvidara dejaría de ver la cola en silencio.
# Con un enlace simbólico en la ruta de siempre, **ningún consumidor se entera**: todos siguen abriendo
# `/app/descargas-<fed>/recolector-local/cola-v2.sqlite`.
#
# ── POR QUÉ HAY QUE PARAR EL CONTENEDOR ──────────────────────────────────────────────────────────────────
#
# Copiar una cola SQLite que se está escribiendo deja un fichero corrupto (es una de las reglas del servidor, y
# ya pasó). Así que se para el contenedor, se copia, se comprueba que la copia abre, y sólo entonces se pone el
# enlace. Si algo falla, se deja todo como estaba: **la copia no se borra hasta que la nueva funciona**.
#
# Uso: sudo bash scripts/servidor/mueve-cola-al-ssd.sh <federación>
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
SSD=${FACYLF_SSD:-/srv/ssd/facylf}
FED=${1:?falta la federación, por ejemplo: mueve-cola-al-ssd.sh andalucia}

# La carpeta del SSD es de `david`, igual que los datos: así la escribe tanto este guion como los contenedores
# (que van como root) y las copias desde el PC no se encuentran un directorio ajeno.
if [ ! -d "$SSD" ]; then
  sudo mkdir -p "$SSD"
  sudo chown 1000:1000 "$SSD"
fi

ORIGEN="$RAIZ/descargas-$FED/recolector-local"
DESTINO="$SSD/$FED"
CONTENEDOR="facylf-$FED-1"

[ -d "$ORIGEN" ] || { echo "no existe $ORIGEN"; exit 1; }
[ -f "$ORIGEN/cola-v2.sqlite" ] || { echo "no hay cola en $ORIGEN"; exit 1; }

# Si ya hay un enlace, se avisa y no se hace nada: mejor no pisar una migración a medias.
if [ -L "$ORIGEN/cola-v2.sqlite" ]; then
  echo "  $FED ya tiene la cola enlazada a $(readlink "$ORIGEN/cola-v2.sqlite"); no se toca."
  exit 0
fi

mkdir -p "$DESTINO"

echo "── 1. parando $CONTENEDOR para copiar una cola quieta ──"
docker stop "$CONTENEDOR" >/dev/null 2>&1 || echo "  (no estaba en marcha)"

echo "── 2. copiando la cola al SSD ──"
tamano=$(du -sm "$ORIGEN"/cola-v2.sqlite* 2>/dev/null | awk '{ s += $1 } END { print s + 0 }')
echo "  origen: $ORIGEN/cola-v2.sqlite* ($tamano MB)"
cp -a "$ORIGEN"/cola-v2.sqlite "$DESTINO"/ 2>/dev/null || { echo "  ✗ no se pudo copiar"; docker start "$CONTENEDOR" >/dev/null; exit 1; }
# El WAL y el SHM van con la base: separarlos deja la base sin las últimas confirmaciones.
for sufijo in -wal -shm; do
  [ -f "$ORIGEN/cola-v2.sqlite$sufijo" ] && cp -a "$ORIGEN/cola-v2.sqlite$sufijo" "$DESTINO/" 2>/dev/null
done
ls -la "$DESTINO" | sed 's/^/  /'

echo "── 3. comprobando que la copia ABRE y está bien (antes de tocar el original) ──"
comprobacion=$(docker run --rm -v "$SSD/$FED:/ssd:ro" --entrypoint node facylf-recolectores:local -e "
  const { DatabaseSync } = require('node:sqlite');
  try {
    const d = new DatabaseSync('/ssd/cola-v2.sqlite', { readOnly: true });
    const t = d.prepare('select count(*) n from trabajos').get().n;
    const p = d.prepare('select count(*) n from peticiones').get().n;
    const chequeo = Object.values(d.prepare('pragma quick_check').get())[0];
    d.close();
    console.log('trabajos=' + t + ' peticiones=' + p + ' quick_check=' + chequeo);
  } catch (e) { console.log('ERROR ' + e.message); }
" 2>&1)

echo "  $comprobacion"
# OJO con el patrón: la salida es «trabajos=N peticiones=N quick_check=ok», así que hay que buscar
# `quick_check=ok` y no «ok» a secas. La primera versión de este guion buscaba `*ok*trabajos=*`, no casaba
# nunca y abortaba una migración que estaba perfecta (23/09/2026).
case "$comprobacion" in
  *quick_check=ok*) : ;;
  *) echo "  ✗ la copia no está bien; se deja el original y no se cambia nada"; docker start "$CONTENEDOR" >/dev/null; exit 1 ;;
esac

echo "── 4. poniendo el enlace en la ruta de siempre ──"
# La ruta del enlace tiene que verse IGUAL desde los tres contenedores: se usa la ruta absoluta del host que se
# monta en todos ellos (el monitor y el importador la reciben del compose).
mv "$ORIGEN/cola-v2.sqlite" "$ORIGEN/cola-v2.sqlite.envuelta-en-ssd" 2>/dev/null
rm -f "$ORIGEN"/cola-v2.sqlite-wal "$ORIGEN"/cola-v2.sqlite-shm
ln -s "$SSD/$FED/cola-v2.sqlite" "$ORIGEN/cola-v2.sqlite"
ls -la "$ORIGEN/cola-v2.sqlite" | sed 's/^/  /'
echo "  (el original se conserva como cola-v2.sqlite.envuelta-en-ssd por si hay que volver atrás)"

echo
echo "── hecho. FALTA: montar $SSD en los contenedores y recrear ──"
echo "   Sin el montaje, el enlace apunta a una ruta que no existe dentro del contenedor."
