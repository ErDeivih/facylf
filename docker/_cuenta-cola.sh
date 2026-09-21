#!/usr/bin/env bash
# Resumen corto de una cola que está en el volumen: temporada más alta, actas pendientes y pendientes totales.
# Uso (dentro de un contenedor con el volumen en /app/datos): bash /d/_cuenta-cola.sh canarias ceuta prueba-10gb
set -eu
for f in "$@"; do
  cola="/app/datos/descargas-$f/recolector-local/cola-v2.sqlite"
  if [ ! -f "$cola" ]; then echo "  $f: sin cola"; continue; fi
  node -e '
const { DatabaseSync } = require("node:sqlite");
const [cola, nombre] = process.argv.slice(1);
const db = new DatabaseSync(cola, { readOnly: true });
const uno = (sql, ...p) => db.prepare(sql).get(...p)?.n ?? 0;
const t = db.prepare("select max(cast(codigo as integer)) t from temporadas").get()?.t;
const actas = uno("select count(*) n from trabajos where estado=? and tipo=? and cast(temporada as integer)=?", "pendiente", "acta", t);
const total = uno("select count(*) n from trabajos where estado=?", "pendiente");
const vencidos = uno("select count(*) n from trabajos where estado=? and (siguiente_intento is null or siguiente_intento <= ?)", "pendiente", new Date().toISOString());
console.log(`  ${nombre.padEnd(14)} temporada ${t} · actas pendientes ${String(actas).padStart(5)} · pendientes ${String(total).padStart(6)} · vencidos ${String(vencidos).padStart(5)}`);
db.close();
' "$cola" "$f"
done
