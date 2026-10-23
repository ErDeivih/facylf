#!/usr/bin/env bash
# ── FOTO DEL SERVIDOR PARA REVISARLA DESDE EL PC ─────────────────────────────────────────────────────────────
#
# Lo lanza `trae-estado-servidor.ps1` desde Windows (scp a /tmp + ssh). Reúne en un único texto lo que hace
# falta para saber si la ingesta del servidor va bien: máquina, contenedores, tabla del monitor, última línea de
# cada federación, arranques con error, importador y recuento del canónico con el rol de SÓLO LECTURA.
#
# SÓLO LEE. No toca colas, contenedores ni ritmo. No copia SQLite en marcha.
set -uo pipefail
RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

echo "════ $(hostname) · $(date '+%F %T %Z') ════"
uptime
free -m
df -h / /srv/data /srv/ssd 2>/dev/null

echo; echo "════ CONTENEDORES ════"
docker ps -a --format '{{.Names}}\t{{.Status}}' | sort

echo; echo "════ MONITOR (últimas líneas) ════"
docker logs --tail 70 facylf-monitor 2>&1

echo; echo "════ ÚLTIMA LÍNEA DE CADA FEDERACIÓN ════"
for f in "$RAIZ"/descargas-*/recolector-local/worker-programado.log; do
  [ -f "$f" ] || continue
  fed=${f#*/descargas-}; fed=${fed%%/*}
  printf '%-20s %s  %s\n' "$fed" "$(date -r "$f" '+%m-%d %H:%M')" "$(tail -n 1 "$f" | cut -c1-170)"
done

echo; echo "════ ÚLTIMA ESCRITURA EN CADA COLA (WAL) ════"
for w in /srv/ssd/facylf/*/cola-v2.sqlite-wal "$RAIZ"/descargas-*/recolector-local/cola-v2.sqlite-wal; do
  [ -f "$w" ] || continue
  printf '%s  %s\n' "$(date -r "$w" '+%m-%d %H:%M')" "$w"
done | sort -u

echo
[ -f "$RAIZ/scripts/servidor/revisa-salud-flota.sh" ] && bash "$RAIZ/scripts/servidor/revisa-salud-flota.sh" 300 2>&1 | head -40

echo; echo "════ IMPORTADOR ════"
docker logs --tail 25 facylf-importador 2>&1
for j in "$RAIZ"/estado/importacion-resumen.json; do [ -f "$j" ] && { date -r "$j" '+modificado %F %T'; head -c 3000 "$j"; echo; }; done

echo; echo "════ IMPORTADOR · RITMO Y FALLOS (8 h) ════"
docker logs --since 8h facylf-importador 2>&1 > /tmp/imp.log
echo "-- hechos por hora:"; grep -E '  hecho ' /tmp/imp.log | cut -c1-13 | sort | uniq -c | tail -10
echo "-- fallos por federación y temporada:"; grep -oE '  fallo [a-z-]+\|[0-9-]+' /tmp/imp.log | sort | uniq -c | sort -rn | head -15
echo "-- motivos (líneas de error, agrupadas):"
grep -E 'Error|error:|ERROR|rechaz|no coincide|≠' /tmp/imp.log | grep -v ERR_PNPM | sed -E 's/[0-9]{5,}/N/g' | cut -c1-200 | sort | uniq -c | sort -rn | head -15
echo "-- el fallo más reciente, completo:"
ultimo=$(grep -nE '  fallo ' /tmp/imp.log | tail -1 | cut -d: -f1)
[ -n "$ultimo" ] && sed -n "$((ultimo>40?ultimo-40:1)),$((ultimo+3))p" /tmp/imp.log | cut -c1-250

echo; echo "════ PLAZAS DE NAVEGADOR ════"
[ -f "$RAIZ/scripts/servidor/estado-plazas.sh" ] && bash "$RAIZ/scripts/servidor/estado-plazas.sh" 2>&1 | head -30

echo; echo "════ CANÓNICO (rol de sólo lectura) ════"
if [ -f "$RAIZ/scripts/servidor/psql-canonico.sh" ]; then
  bash "$RAIZ/scripts/servidor/psql-canonico.sh" <<'SQL' 2>&1 | head -40
select f.codigo federacion, count(m.id) partidos,
       count(m.id) filter (where m.goles_local is not null) con_resultado
from core.match m
join core.phase_group pg on pg.id = m.phase_group_id
join core.competition_edition ce on ce.id = pg.competition_edition_id
join core.federation f on f.id = ce.federation_id
group by 1 order by 2 desc;
-- Ediciones marcadas como fútbol sala sólo porque el nombre contiene «sala» dentro de otra palabra
-- (Salamanca…). Ver corrige-modalidad-sala.sh.
select f.codigo federacion, count(*) ediciones_mal_marcadas, min(ce.nombre_publicado) ejemplo
from core.competition_edition ce join core.federation f on f.id = ce.federation_id
where ce.modalidad = 'sala'
  and lower(ce.nombre_publicado) !~ 'f[uú]tbol\s*sala|futsal|aret?o\s*futbol|(^|[^a-z0-9áéíóúàèòïüñç])sala($|[^a-z0-9áéíóúàèòïüñç])'
group by 1 order by 2 desc;
SQL
fi
echo "════ FIN ════"
