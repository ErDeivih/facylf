#!/usr/bin/env bash
# ── VIGILANTE DE LA INGESTA ──────────────────────────────────────────────────────────────────────────────
#
# Mira cada 10 minutos que los tres navegadores y el importador sigan trabajando, y reinicia lo que se haya
# quedado clavado. Sale de lo que pasó el 21/11/2026: fed2 y fed3 se quedaron 12 minutos sin pedir nada
# porque la base estaba bloqueada por un borrado grande, y nadie se enteró hasta que David lo vio en el
# panel. Un servicio «activo» no significa que esté trabajando: hay que mirar la última petición.
#
# Qué considera atascado:
#   · un navegador sin ninguna petición en 10 minutos;
#   · el importador sin escribir en su registro en 60 minutos.
# Los reinicia y lo apunta en /var/log/facylf-vigilante.log.
set -u

LOG=/var/log/facylf-vigilante.log
MIN_NAVEGADOR=10
MIN_IMPORTADOR=60
ahora=$(date +%s)

apunta() { echo "$(date '+%F %T') $*" >> "$LOG"; }

# ── Navegadores ──────────────────────────────────────────────────────────────────────────────────────────
for par in "facylf-federacion-1:/app/descargas-federacion" \
           "facylf-federacion2-1:/app/descargas-federacion-2" \
           "facylf-federacion3-1:/app/descargas-federacion-3"; do
  cont="${par%%:*}"; cola="${par##*:}"
  ultima=$(timeout 45 docker exec "$cont" node -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1] + "/recolector-local/cola-v2.sqlite", { readOnly: true });
    const r = db.prepare("select max(iniciada_en) u from peticiones").get();
    process.stdout.write(String(r.u ?? ""));
  ' "$cola" 2>/dev/null | tr -d "\r\n")
  if [ -z "$ultima" ]; then
    apunta "AVISO $cont: no se pudo leer la última petición; no se toca"
    continue
  fi
  # Las fechas se guardan en ISO con milisegundos y Z.
  seg=$(( ahora - $(date -u -d "$ultima" +%s 2>/dev/null || echo "$ahora") ))
  if [ "$seg" -gt $(( MIN_NAVEGADOR * 60 )) ]; then
    apunta "ATASCO $cont: $(( seg / 60 )) minutos sin peticiones. Reiniciando."
    docker restart "$cont" >/dev/null 2>&1 && apunta "  $cont reiniciado"
  fi
done

# ── Importador ──────────────────────────────────────────────────────────────────────────────────────────
ultimo_log=$(timeout 30 docker logs --tail 1 --timestamps facylf-importador 2>/dev/null | cut -c1-25)
if [ -n "$ultimo_log" ]; then
  seg=$(( ahora - $(date -u -d "$ultimo_log" +%s 2>/dev/null || echo "$ahora") ))
  if [ "$seg" -gt $(( MIN_IMPORTADOR * 60 )) ]; then
    apunta "ATASCO importador: $(( seg / 60 )) minutos sin escribir. Reiniciando."
    docker restart facylf-importador >/dev/null 2>&1 && apunta "  importador reiniciado"
  fi
fi
