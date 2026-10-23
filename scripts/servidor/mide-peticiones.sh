#!/bin/bash
# Ritmo REAL de peticiones por federación, leído de la tabla `peticiones` de cada cola (sólo lectura).
# Responde a dos preguntas que no se pueden contestar de memoria: cuántas peticiones hace cada federación
# por hora, y cuánto tarda cada petición (que es lo que decide si abrir más plazas sirve de algo).
BASES="/srv/data/facylf /srv/ssd/facylf"
SQL_HOY="select count(*) from peticiones where iniciada_en >= datetime('now','-1 hour')"
SQL_TOTAL="select count(*) from peticiones"
SQL_DUR="select round(avg(duracion_ms)/1000.0,1) from peticiones where duracion_ms is not null and iniciada_en >= datetime('now','-1 hour')"
SQL_MAL="select count(*) from peticiones where resultado is not null and resultado not in ('ok','hecho') and iniciada_en >= datetime('now','-1 hour') and detalle is not null"

printf '%-20s %10s %10s %8s %8s\n' federacion "ultima_h" "total" "seg/pet" "con_detalle"
for d in $BASES; do
  for ruta in "$d"/descargas-*/recolector-local/cola-v2.sqlite; do
    [ -e "$ruta" ] || continue
    fed=$(printf '%s' "$ruta" | sed 's|.*/descargas-||; s|/recolector-local.*||')
    ultima=$(sqlite3 -readonly "file:$ruta?mode=ro" "$SQL_HOY" 2>/dev/null)
    total=$(sqlite3 -readonly "file:$ruta?mode=ro" "$SQL_TOTAL" 2>/dev/null)
    dur=$(sqlite3 -readonly "file:$ruta?mode=ro" "$SQL_DUR" 2>/dev/null)
    mal=$(sqlite3 -readonly "file:$ruta?mode=ro" "$SQL_MAL" 2>/dev/null)
    [ -z "$total" ] && continue
    printf '%-20s %10s %10s %8s %8s\n' "$fed" "${ultima:--}" "$total" "${dur:--}" "${mal:--}"
  done
done
echo
echo "=== CUPO DIARIO: ¿hay límite de peticiones por federación? ==="
grep -rn "FACYLF_CUPO\|cupo" /srv/data/facylf/docker/compose.yml /srv/data/facylf/docker/.env 2>/dev/null | head -10
echo
echo "=== PLAZAS DECLARADAS ==="
docker exec facylf-murcia-1 printenv FACYLF_MEMORIA_GB 2>/dev/null | sed 's/^/FACYLF_MEMORIA_GB=/'
echo -n "memoria del servidor (GB): "; free -g | awk '/Mem:/ {print $2}'
