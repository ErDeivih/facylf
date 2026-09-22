#!/usr/bin/env bash
# ── COMPRUEBA LA INTEGRIDAD DE LAS COLAS DEL SERVIDOR ──────────────────────────────────────────────────
#
# Por qué existe: al copiar una cola por `scp` encima de una carpeta donde el contenedor ya había estado
# corriendo pueden quedar un `cola-v2.sqlite-wal` y un `-shm` de la base ANTERIOR. SQLite, al abrir, intenta
# aplicar ese diario a un fichero que no es el suyo, y el resultado es
#
#     Error: database disk image is malformed
#     errcode: 11
#
# medido en el servidor el 21/09/2026 con la cola de Galicia recién copiada (el tamaño cuadraba, así que la
# comprobación de tamaño decía «verificada»). Para cada federación se mira qué ficheros de diario hay y qué dice
# la comprobación de SQLite, abriendo la base DENTRO de la imagen del recolector: mismo motor y misma versión
# que la van a abrir después.
#
# Uso:
#   bash scripts/servidor/verifica-integridad-colas.sh                    # todas, con `quick_check`
#   bash scripts/servidor/verifica-integridad-colas.sh galicia madrid    # sólo esas
#   bash scripts/servidor/verifica-integridad-colas.sh --completa         # integridad entera (lenta y cara)
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
IMAGEN=${FACYLF_IMAGEN:-facylf-recolectores:local}

# `quick_check` detecta las páginas ilegibles —el caso real— y cuesta una fracción de `integrity_check`, que
# además verifica el orden de todos los índices. En un servidor de 4 núcleos con la flota dentro, esa diferencia
# decide si esto se puede ejecutar a diario o hay que pedir permiso para hacerlo.
PRAGMA=quick_check
if [ "${1:-}" = "--completa" ]; then PRAGMA=integrity_check; shift; fi

if [ "$#" -gt 0 ]; then
  FEDERACIONES=("$@")
else
  FEDERACIONES=(andalucia aragon asturias baleares canarias cantabria castilla-la-mancha cataluna \
    ceuta euskadi extremadura federacion galicia madrid melilla murcia navarra rioja valencia)
fi

# El programa va en un fichero temporal porque meterlo con `-e` entre comillas dentro de un `docker run` es
# justo el sitio donde el intérprete de fuera se come las comillas.
PROGRAMA=$(mktemp /tmp/integridad-XXXXXX.mjs)
cat > "$PROGRAMA" <<JS
import { DatabaseSync } from 'node:sqlite';
const ruta = \`/datos/descargas-\${process.argv[2]}/recolector-local/cola-v2.sqlite\`;
try {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const integridad = db.prepare('pragma ${PRAGMA}').get();
  const valor = Object.values(integridad)[0];
  const peticiones = db.prepare('select count(*) n from peticiones').get().n;
  const pendientes = db.prepare("select count(*) n from trabajos where estado in ('pendiente','bloqueado')").get().n;
  console.log(\`integridad=\${valor}  peticiones=\${peticiones}  pendientes=\${pendientes}\`);
  db.close();
  process.exit(valor === 'ok' ? 0 : 4);
} catch (error) {
  console.log(\`NO ABRE: \${error.message}\`);
  process.exit(3);
}
JS

fallos=0
echo "comprobación: $PRAGMA · ${#FEDERACIONES[@]} federación(es)"
for f in "${FEDERACIONES[@]}"; do
  printf '══ %-22s' "$f"
  carpeta="$RAIZ/descargas-$f/recolector-local"
  if [ ! -d "$carpeta" ]; then echo " (no existe la carpeta)"; continue; fi
  # Ficheros de diario: son la causa conocida de «malformed», así que se informa de ellos siempre.
  sueltos=""
  for sufijo in '-wal' '-shm'; do
    [ -f "$carpeta/cola-v2.sqlite$sufijo" ] && sueltos="$sueltos cola-v2.sqlite$sufijo($(stat -c %s "$carpeta/cola-v2.sqlite$sufijo")B)"
  done
  [ -n "$sueltos" ] && printf ' diarios:%s\n' "$sueltos" || echo
  printf '   '
  salida=$(timeout 600 docker run --rm -v "$RAIZ:/datos" -v "$PROGRAMA:/comprueba.mjs:ro" \
    --entrypoint node "$IMAGEN" /comprueba.mjs "$f" 2>&1 | tail -1)
  echo "$salida"
  case "$salida" in
    *integridad=ok*) ;;
    *) fallos=$((fallos + 1)) ;;
  esac
done

rm -f "$PROGRAMA"
echo
if [ "$fallos" = "0" ]; then echo "todas las colas abren y están íntegras"; else echo "AVISO: $fallos cola(s) con problemas"; fi
exit "$fallos"
