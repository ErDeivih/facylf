#!/usr/bin/env bash
# empaqueta-colas-para-el-pc.sh — sólo las COLAS, que es lo que el PC necesita para continuar
#
# ── POR QUÉ SÓLO LAS COLAS Y NO LOS ÁRBOLES ENTEROS (24/09/2026) ─────────────────────────────────────────
#
# El primer intento empaquetó los tres árboles completos (3.206 MB) y fue inviable: tardaba 28 MB cada seis
# minutos. La causa no es el tamaño, son los ficheros pequeños —las carpetas `t<nn>-<temporada>` tienen miles de
# HTML y JSON de acta— leídos al azar de un disco DURO que en ese momento están machacando dieciséis
# recolectores. A ese paso eran ocho horas.
#
# Y no hacen falta. Para CONTINUAR recogiendo, lo único imprescindible es la cola: dice qué actas están hechas y
# cuáles no, así que el PC no vuelve a pedir 47.000 actas ya descargadas. El archivo de HTML y JSON sirve para
# IMPORTAR al canónico, y ya está en el servidor, que es donde se hará la unión cuando el PC termine.
#
# Lo que esto implica, dicho claro para que nadie se lleve una sorpresa: en el PC la cola dirá que hay actas
# hechas cuyo HTML no está allí. Eso no rompe la recolección (la cola manda), pero significa que **el PC no puede
# importar por su cuenta la parte que hizo el servidor**: la unión se hace trayendo al servidor lo que el PC
# añada, no al revés. Es justo el plan acordado.
#
# Las colas son tres ficheros grandes: lectura secuencial, sin miles de búsquedas de disco.
#
# Se incluye SIEMPRE el `-wal`: si tiene transacciones confirmadas sin consolidar, tirarlo pierde trabajo.
#
# Uso:  bash scripts/servidor/empaqueta-colas-para-el-pc.sh
set -uo pipefail
export LC_ALL=C

DESTINO=/srv/data/traspaso-colas-24sep.tar
SSD=/srv/ssd/facylf

# `-h` dereferencia los enlaces: la cola de Cataluña vive en el SSD (`/srv/ssd/facylf/cataluna/`) y en su ruta de
# siempre hay un enlace; sin `-h` el PC recibiría un enlace roto y se quedaría sin cola.
rutas=()
for fed in valencia madrid cataluna; do
  base="/srv/data/facylf/descargas-${fed}/recolector-local"
  for f in cola-v2.sqlite cola-v2.sqlite-wal; do
    [ -f "$base/$f" ] && rutas+=("$base/$f")
  done
done
# La cola de Cataluña, además, en su sitio real del SSD (por si el enlace no estuviera).
[ -f "$SSD/cataluna/cola-v2.sqlite" ] && rutas+=("$SSD/cataluna/cola-v2.sqlite")

echo "── ficheros a empaquetar ──"
for r in "${rutas[@]}"; do printf '  %8s MB  %s\n' "$(du -m "$r" | cut -f1)" "$r"; done
echo
echo "── empaquetando (con -h) ──"
rm -f "$DESTINO"
tar -h -cf "$DESTINO" "${rutas[@]}" || { echo 'ERROR al empaquetar'; exit 1; }

echo
ls -la --block-size=M "$DESTINO"
echo "huella para verificar la copia en el PC:"
sha256sum "$DESTINO" | sed 's/^/  /'
echo
echo "── contenido (para ver a qué ruta corresponde cada cola) ──"
tar -tvf "$DESTINO" | sed 's/^/  /'
