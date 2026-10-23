#!/bin/bash
# ¿Qué alcance tiene cada federación del servidor y qué temporadas tiene ya recolectadas?
#
# Las que no tienen trabajo pendiente (canarias, ceuta, euskadi, melilla, rioja...) están así porque su
# catálogo no llega más atrás. Para que sigan hay que bajarles el año de inicio y volver a armar el catálogo.
echo "=== ALCANCE DECLARADO EN CADA RECOLECTOR ==="
for fed in canarias ceuta euskadi melilla rioja cantabria navarra andalucia galicia; do
  cont="facylf-$fed-1"
  cfg=$(docker exec "$cont" sh -c 'ls /app/recolector.*.config.json 2>/dev/null | head -1' 2>/dev/null)
  if [ -z "$cfg" ]; then printf '  %-16s (sin config visible)\n' "$fed"; continue; fi
  desde=$(docker exec "$cont" sh -c "grep -o '\"desdeAnio\": *[0-9]*' $cfg 2>/dev/null | head -1" 2>/dev/null)
  printf '  %-16s %s   (%s)\n' "$fed" "$cfg" "$desde"
done
echo
echo "=== TEMPORADAS QUE TIENE YA CADA COLA (las que aparecen en sus trabajos) ==="
for fed in canarias ceuta euskadi melilla rioja cantabria navarra; do
  ruta="/srv/ssd/facylf/$fed/cola-v2.sqlite"
  [ -f "$ruta" ] || ruta="/srv/data/facylf/descargas-$fed/recolector-local/cola-v2.sqlite"
  [ -f "$ruta" ] || continue
  echo -n "  $fed: "
  docker run --rm -v /srv:/srv:ro node:22-alpine node -e "
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync('$ruta',{readOnly:true});
    const t=db.prepare('select temporada, count(*) as n from trabajos group by 1 order by 1').all();
    console.log(t.map(x=>'t'+x.temporada+':'+x.n).join(' '));
    db.close();
  " 2>/dev/null || echo "(no se pudo leer)"
done
