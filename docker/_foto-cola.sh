#!/usr/bin/env bash
# Foto de una cola que está en el volumen, para comparar antes y después de un corte: trabajos por estado,
# actas por estado, ficheros temporales de escritura a medias, peticiones de hoy y trabajos «a medias».
#
# Uso (dentro de un contenedor con el volumen en /app/datos): bash /d/_foto-cola.sh prueba-a
#
# El guion de node va en un fichero temporal y no en `node -e '...'` porque dentro de las comillas simples de
# bash no caben las comillas simples del SQL (`estado='en_curso'` se comía la mitad del guion; costó un rato
# entender por qué la foto salía vacía).
set -eu
fed="${1:?falta la federación}"
cola="/app/datos/descargas-$fed/recolector-local/cola-v2.sqlite"
[ -f "$cola" ] || { echo "{}"; exit 1; }

guion="$(mktemp)"
trap 'rm -f "$guion"' EXIT
cat > "$guion" <<'JS'
const { DatabaseSync } = require("node:sqlite");
const { readdirSync } = require("node:fs");
const cola = process.argv[2];
const db = new DatabaseSync(cola, { readOnly: true });
const por = (sql) => Object.fromEntries(db.prepare(sql).all().map((f) => [f.k, f.n]));
const trabajos = por("select estado k, count(*) n from trabajos group by estado");
const actas = por("select estado k, count(*) n from actas group by estado");
const peticiones = db.prepare("select count(*) n from peticiones").get().n;
// Un trabajo `en_curso` es normal si el worker está con él AHORA (su fila se acaba de tocar). Lo que no puede
// pasar es que se quede ahí para siempre porque el proceso que lo cogió murió: eso es un abandono.
const enCursoFilas = db.prepare("select clave, actualizado_en from trabajos where estado='en_curso'").all();
const ahora = Date.now();
const enCurso = {
  n: enCursoFilas.length,
  viejo: enCursoFilas.filter((f) => {
    const t = Date.parse(f.actualizado_en ?? '');
    return !Number.isFinite(t) || ahora - t > 5 * 60_000;
  }).length,
  claves: enCursoFilas.map((f) => f.clave),
};
db.close();
const carpeta = cola.replace(/\/cola-v2\.sqlite$/, "");
let temporales = 0;
try { temporales = readdirSync(carpeta).filter((f) => f.endsWith(".tmp")).length; } catch { /* sin carpeta */ }
console.log(JSON.stringify({ trabajos, actas, peticiones, temporales, enCurso }));
JS

node "$guion" "$cola"
