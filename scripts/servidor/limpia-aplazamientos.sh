#!/usr/bin/env bash
# ── APLAZAMIENTOS IMPOSIBLES: SE LIMPIAN SOLOS ────────────────────────────────────────────────────────────
#
# El 23/11/2026 fed2 estuvo 10 horas sin trabajar. La causa: 7.443 trabajos tenían el «siguiente intento»
# puesto en una fecha de septiembre (pasada). El recolector miraba el más antiguo, lo veía aplazado y salía
# sin abrir el navegador. El vigilante lo reiniciaba cada 10 minutos, pero volvía a salir por lo mismo.
#
# Esto limpia esos aplazamientos en las tres colas: si un trabajo pendiente tiene fecha de próximo intento
# en el pasado, se pone a nulo (o sea, «toca ya»). Se ejecuta cada hora; es barato y no toca nada más.
#
# Idea de Claude (23/11/2026): «un aplazamiento con fecha pasada no puede dejar el sistema parado».
set -u

LOG=/var/log/facylf-aplazamientos.log
apunta() { echo "$(date '+%F %T') $*" >> "$LOG"; }

for par in "facylf-federacion-1:/app/descargas-federacion" \
           "facylf-federacion2-1:/app/descargas-federacion-2" \
           "facylf-federacion3-1:/app/descargas-federacion-3"; do
  cont="${par%%:*}"; cola="${par##*:}"
  res=$(timeout 60 docker exec "$cont" node -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1] + "/recolector-local/cola-v2.sqlite", { timeout: 20000 });
    const ahora = new Date().toISOString();
    const r = db.prepare("update trabajos set siguiente_intento = null where estado = ? and siguiente_intento is not null and siguiente_intento < ?").run("pendiente", ahora);
    const quedan = db.prepare("select count(*) n from trabajos where estado = ?").get("pendiente").n;
    process.stdout.write(`${r.changes} de ${quedan}`);
  ' "$cola" 2>/dev/null | tr -d "\r\n")
  apunta "$cont: aplazamientos pasados limpiados = ${res:-no se pudo leer}"
done
