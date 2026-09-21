#!/usr/bin/env bash
# Instrumento de PRUEBA: hace que una federación tenga trabajo disponible AHORA.
#
# Sirve para probar la rotación y el reclamo de plazas cuando las colas de prueba están vacías (Canarias y Ceuta
# tienen todo aplazado y sus workers salen sin abrir navegador: sin demanda de plaza no se puede probar el
# semáforo). Quita la fecha de aplazamiento a los primeros trabajos pendientes de la copia que está en el
# volumen; nunca se usa sobre una cola real.
#
# Uso (dentro de un contenedor con el volumen en /app/datos): bash /d/_haz-trabajo.sh <federacion> [cuantos=5]
set -eu
fed="${1:?falta la federación}"
cuantos="${2:-5}"
cola="/app/datos/descargas-$fed/recolector-local/cola-v2.sqlite"
[ -f "$cola" ] || { echo "  no existe $cola"; exit 1; }
node -e '
const { DatabaseSync } = require("node:sqlite");
const [cola, cuantos] = process.argv.slice(1);
const db = new DatabaseSync(cola);
// OJO con la temporada Y con el tipo: el planificador no crea trabajo por debajo del suelo (2023-24), y al
// arrancar vuelve a aplazar las jornadas de la temporada en curso que aún no se han jugado (`aplazaFuturoTemporadaActual`).
// Además, una federación puede no tener NINGUNA acta pendiente (Canarias, por ejemplo, las tiene todas hechas),
// así que si no hay actas se busca cualquier otro trabajo de la temporada en curso; y si tampoco, se CREA un
// trabajo de catálogo, que es una petición real y barata al portal y basta para que el worker pida plaza.
const temporada = db.prepare("select max(cast(codigo as integer)) t from temporadas").get()?.t;
const busca = (tipo) => db.prepare("select clave from trabajos where estado=? and tipo=? and cast(temporada as integer) = ? order by prioridad limit ?")
  .all("pendiente", tipo, temporada, Number(cuantos));
let filas = busca("acta");
let via = "acta";
if (!filas.length) { filas = db.prepare("select clave from trabajos where estado=? and cast(temporada as integer) = ? order by prioridad limit ?")
  .all("pendiente", temporada, Number(cuantos)); via = "cualquiera de la temporada"; }
if (!filas.length) {
  const ahora = new Date().toISOString();
  for (let i = 0; i < Number(cuantos); i++) {
    const clave = `catalogo_temporada|${temporada}||||`;
    db.prepare(`insert into trabajos(clave,tipo,temporada,competicion,grupo,jornada,acta,url,prioridad,creado_en,actualizado_en,estado)
      values(?,?,?,?,?,?,?,?,?,?,?,?) on conflict(clave) do nothing`)
      .run(clave, "catalogo_temporada", String(temporada), null, null, null, null, null, 1, ahora, ahora, "pendiente");
    filas.push({ clave });
  }
  via = "catálogo (creado para la prueba)";
}
const pon = db.prepare("update trabajos set siguiente_intento = null, actualizado_en = ? where clave = ?");
for (const f of filas) pon.run(new Date().toISOString(), f.clave);
console.log(`  ${filas.length} trabajo(s) [${via}] quedan disponibles ahora en ${cola}`);
db.close();
' "$cola" "$cuantos"
