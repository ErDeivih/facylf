#!/usr/bin/env bash
# Prueba mínima: abrir la cola de una federación dentro de la imagen y decir qué pasa, con código de salida.
# Uso: bash /tmp/prueba-cola.sh galicia
set -uo pipefail
RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
FED=${1:?falta la federación}
echo "── ficheros de la cola de $FED ──"
ls -la "$RAIZ/descargas-$FED/recolector-local/" | grep -E 'cola-v2|total' || true

cat > /tmp/abre-cola.mjs <<'JS'
import { DatabaseSync } from 'node:sqlite';
const fed = process.argv[2];
const ruta = `/datos/descargas-${fed}/recolector-local/cola-v2.sqlite`;
console.log(`abriendo ${ruta}`);
try {
  const db = new DatabaseSync(ruta, { readOnly: true });
  console.log('abierta');
  const filas = db.prepare('pragma integrity_check').all();
  console.log('integridad:', JSON.stringify(filas).slice(0, 300));
  db.close();
} catch (error) {
  console.log(`ERROR: ${error.message}`);
  console.log(error.stack?.split('\n').slice(0, 4).join('\n'));
  process.exit(3);
}
JS

echo "── abriendo dentro del contenedor ──"
timeout 120 docker run --rm \
  -v "$RAIZ:/datos" -v /tmp/abre-cola.mjs:/comprueba.mjs:ro \
  --entrypoint node facylf-recolectores:local /comprueba.mjs "$FED"
echo "código de salida: $?"
