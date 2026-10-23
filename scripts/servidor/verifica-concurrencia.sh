#!/bin/bash
# ¿Cuántas federaciones piden A LA VEZ? El servidor tiene 5 plazas de navegador, así que no deberían ser más.
#
# Esto verifica las cifras por otro camino: si 9 federaciones hacen ~600 peticiones/hora cada una (5.400/h) y
# sólo caben 5 navegadores a la vez, algo no cuadra — el máximo con 5 plazas y 6 s por petición son 3.000/h.
# Se mide la concurrencia de verdad: quién tiene ficha de plaza, quién tiene navegador abierto y quién ha
# pedido en los últimos minutos.
echo "=== FICHAS DE PLAZA OCUPADAS (y de quién son) ==="
docker exec facylf-murcia-1 sh -c 'for f in /app/.estado-workers/slots-chrome/slot-*.lock; do [ -f "$f" ] && echo "$(basename $f): $(cat $f 2>/dev/null)"; done' 2>&1 | sed 's/^/  /'
echo
echo "=== NAVEGADORES ABIERTOS, POR CONTENEDOR ==="
activos=0
for fed in andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja; do
  n=$(docker exec "facylf-$fed-1" sh -c 'pgrep -c chrome 2>/dev/null || echo 0' 2>/dev/null)
  if [ "${n:-0}" -gt 0 ]; then
    printf '  %-22s %s procesos de navegador\n' "$fed" "$n"
    activos=$((activos+1))
  fi
done
echo "  --- $activos federaciones con navegador abierto AHORA ---"
echo
echo "=== QUIÉN HA PEDIDO EN LOS ÚLTIMOS 10 MINUTOS (de sus colas) ==="
pidiendo=0
for fed in andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja; do
  ruta="/srv/ssd/facylf/$fed/cola-v2.sqlite"
  [ -f "$ruta" ] || ruta="/srv/data/facylf/descargas-$fed/recolector-local/cola-v2.sqlite"
  [ -f "$ruta" ] || continue
  n=$(docker run --rm -v /srv:/srv:ro node:22-alpine node -e "
    const {DatabaseSync}=require('node:sqlite');
    try{const db=new DatabaseSync('$ruta',{readOnly:true});
    console.log(db.prepare(\"select count(*) as n from peticiones where iniciada_en >= datetime('now','-10 minutes')\").get().n);db.close();}catch(e){console.log(0);}
  " 2>/dev/null)
  if [ "${n:-0}" -gt 0 ]; then
    printf '  %-22s %s peticiones en 10 min\n' "$fed" "$n"
    pidiendo=$((pidiendo+1))
  fi
done
echo "  --- $pidiendo federaciones pidiendo a la vez ---"
echo
echo "=== RESUMEN DE LA CUENTA ==="
echo "  plazas que reparte el gobernador: (FACYLF_MEMORIA_GB - 1,5) / 0,75"
docker exec facylf-murcia-1 printenv FACYLF_MEMORIA_GB 2>/dev/null | sed 's/^/    FACYLF_MEMORIA_GB=/'
uptime
