#!/usr/bin/env bash
# Instrumento de PRUEBA: deja a cero las peticiones de HOY en una cola de prueba.
#
# Hace falta porque las federaciones de prueba son copias de otra: arrastran su presupuesto diario ya gastado
# (200/200) y sus workers salen sin abrir navegador, así que no se puede medir el reparto de plazas. Nunca se usa
# sobre una cola real: sólo sobre copias dentro del volumen.
#
# Uso (dentro de un contenedor con el volumen en /app/datos): bash /d/_limpia-peticiones-hoy.sh prueba-a prueba-b
set -eu
hoy="$(date +%F)"
for f in "$@"; do
  cola="/app/datos/descargas-$f/recolector-local/cola-v2.sqlite"
  [ -f "$cola" ] || { echo "  $f: sin cola"; continue; }
  node -e '
const { DatabaseSync } = require("node:sqlite");
const [cola, hoy, nombre] = process.argv.slice(1);
const db = new DatabaseSync(cola);
db.exec("pragma busy_timeout = 20000;");
const r = db.prepare("delete from peticiones where substr(iniciada_en, 1, 10) = ?").run(hoy);
console.log(`  ${nombre}: ${r.changes} peticiones de hoy borradas (presupuesto diario a cero)`);
db.close();
' "$cola" "$hoy" "$f"
done
