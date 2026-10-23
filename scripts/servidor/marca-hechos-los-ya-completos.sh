#!/bin/bash
# ── LOS QUE YA ESTÁN DENTRO NO SE REPITEN ───────────────────────────────────────────────────────────────
#
# Medido el 01/10/2026: de las 173 unidades marcadas como fallo, **23 están YA COMPLETAS en el canónico**
# (`visibility_state = 'completa'`, con todos sus partidos, actas y apariciones). El importador las da por
# hechas, las escribe... y acto seguido las marca como fallo y las repite, hasta tres veces. La unidad
# `baleares|2025-26|22628072` estuvo **dos horas** girando sobre un grupo que ya estaba terminado.
#
# A 60 minutos por intento, esas 23 unidades pueden costar más de veinte horas de servidor **para no cambiar
# nada**: la importación es idempotente y vuelve a dar «0 filas insertadas».
#
# Qué hace este guion: mueve de la lista `fallos` a la lista `hechos` SÓLO las unidades cuya cobertura en el
# canónico ya dice `completa`. Nada más:
#   · NO toca las que fallan de verdad (las otras 150): ésas necesitan que se arregle su motivo, no que se
#     callen. Se quedan donde están y su motivo sigue visible en el registro.
#   · NO vacía la lista de fallos entera (eso es `limpia-fallos-importador.sh`, y volvería a encolar 150
#     unidades que fallan por datos).
#   · guarda un respaldo del estado antes de tocarlo, y enseña el resultado después.
#
# Uso:  bash marca-hechos-los-ya-completos.sh
set -uo pipefail

RAIZ=/srv/data/facylf
C=facylf-importador
ESTADO="$RAIZ/estado/importacion.json"
[ -f "$ESTADO" ] || { echo "no encuentro $ESTADO"; exit 1; }

echo "=== 1 · la lista de fallos, a un fichero ==="
# Las claves del estado son `federacion|temporada|grupo`, que es también el formato que quiere el cruce de SQL.
cat > /tmp/lee-claves.mjs <<'JS'
import { readFileSync } from 'node:fs';
const e = JSON.parse(readFileSync('/estado/importacion.json', 'utf8'));
for (const k of Object.keys(e.fallos ?? {})) console.log(k);
JS
docker run --rm -v "$RAIZ/estado:/estado:ro" -v /tmp/lee-claves.mjs:/lee.mjs:ro \
  node:22-alpine node /lee.mjs > /tmp/fallos.txt
echo "  unidades en «fallos»: $(grep -c . /tmp/fallos.txt || echo 0)"

echo
echo "=== 2 · cuáles de ellas ya están COMPLETAS en el canónico ==="
awk -F'|' '{print $1","$2","$3}' /tmp/fallos.txt > /tmp/fallos.csv
docker cp /tmp/fallos.csv facylf-postgres:/tmp/fallos.csv >/dev/null
docker exec -i facylf-postgres psql -U facylf_admin -d facylf -X -q -t -A <<'SQL' > /tmp/ya-completas.txt
create temp table f(fed text, temp text, grupo text);
\copy f from '/tmp/fallos.csv' with (format csv)
select distinct u.fed || '|' || u.temp || '|' || u.grupo
from f u
where exists (
  select 1
  from core.federation fed
  join core.competition_edition ce on ce.federation_id = fed.id
  join core.season s on s.id = ce.season_id
  join core.phase_group pg on pg.competition_edition_id = ce.id
  join ops.coverage_checkpoint cp on cp.phase_group_id = pg.id
  where fed.codigo = u.fed and s.etiqueta = u.temp and pg.codigo_externo = u.grupo
    and cp.visibility_state = 'completa'
);
SQL
total=$(grep -c . /tmp/ya-completas.txt || true)
echo "  ya completas: $total"
head -6 /tmp/ya-completas.txt | sed 's/^/    /'
[ "$total" -eq 0 ] && { echo "  nada que mover"; exit 0; }

echo
echo "=== 3 · paro el importador para no pelearme con su estado ==="
docker stop -t 30 "$C" >/dev/null 2>&1 && echo "  parado"

echo
echo "=== 4 · respaldo y traslado de «fallos» a «hechos» ==="
cp "$ESTADO" "$ESTADO.antes-de-marcar-completos-$(date +%Y%m%d-%H%M)" && echo "  respaldo guardado"
cp /tmp/ya-completas.txt "$RAIZ/estado/ya-completas.txt"
cat > /tmp/marca.mjs <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const ruta = '/estado/importacion.json';
const e = JSON.parse(readFileSync(ruta, 'utf8'));
const claves = readFileSync('/ya.txt', 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
let movidas = 0;
for (const c of claves) {
  if (e.fallos?.[c]) {
    e.hechos[c] = {
      cuando: new Date().toISOString(),
      filas: 0,
      segundos: 0,
      nota: 'marcada como hecha sin reimportar: su cobertura en el canónico ya dice «completa»',
    };
    delete e.fallos[c];
    movidas += 1;
  }
}
writeFileSync(ruta, JSON.stringify(e, null, 2));
console.log(`  movidas de «fallos» a «hechos»: ${movidas}`);
console.log(`  quedan en «fallos»: ${Object.keys(e.fallos ?? {}).length}`);
console.log(`  hay en «hechos»: ${Object.keys(e.hechos ?? {}).length}`);
JS
docker run --rm -v "$RAIZ/estado:/estado" -v /tmp/ya-completas.txt:/ya.txt:ro -v /tmp/marca.mjs:/marca.mjs:ro \
  node:22-alpine node /marca.mjs 2>&1

echo
echo "=== 5 · arranco el importador ==="
docker start "$C" >/dev/null 2>&1 && echo "  arrancado"
sleep 35
docker inspect -f '  estado: {{.State.Status}}' "$C" 2>/dev/null
echo
echo "=== 6 · qué dice ahora ==="
docker logs "$C" --tail 5 2>&1 | cut -c1-170
