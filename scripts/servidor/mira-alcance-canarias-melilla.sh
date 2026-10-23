#!/bin/bash
# ¿Se puede ampliar el alcance de canarias y melilla? Dos preguntas:
#   1. qué año de inicio declaran y qué temporadas tienen YA en su catálogo;
#   2. si su federación publica competiciones más antiguas que lo que ya tienen.
#
# La segunda no se puede contestar desde la cola: hay que mirar el catálogo de la federación. El recolector
# tiene un subcomando `preparar` que lo rearma desde la fuente, y `estado` que resume la cola sin tocar nada.
for fed in canarias melilla; do
  cont="facylf-$fed-1"
  echo "════════════════════════════ $fed ════════════════════════════════"
  echo "  --- su configuración ---"
  docker exec "$cont" sh -c 'ls -1 /app/recolector.*.config.json 2>/dev/null' 2>/dev/null | sed 's/^/    fichero: /'
  for f in $(docker exec "$cont" sh -c 'ls -1 /app/recolector.*.config.json 2>/dev/null' 2>/dev/null); do
    echo -n "    $f -> desdeAnio="
    docker exec "$cont" sh -c "grep -o '\"desdeAnio\": *[0-9]*' $f 2>/dev/null | head -1 | grep -o '[0-9]*'" 2>/dev/null
  done
  echo "  --- estado de su cola (lo que dice el propio recolector) ---"
  docker exec "$cont" sh -c 'cd /app && node scripts/$(ls scripts | grep -m1 "^recolector-$1" ) ' 2>/dev/null >/dev/null
  docker logs --tail 3 "$cont" 2>&1 | sed 's/^/    /'
  echo "  --- temporadas en su cola, con su etiqueta ---"
  ruta="/srv/ssd/facylf/$fed/cola-v2.sqlite"
  [ -f "$ruta" ] || ruta="/srv/data/facylf/descargas-$fed/recolector-local/cola-v2.sqlite"
  docker run --rm -v /srv:/srv:ro node:22-alpine node -e "
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync('$ruta',{readOnly:true});
    try {
      const t=db.prepare('select codigo, etiqueta, anio_inicio from temporadas order by codigo').all();
      console.log('    ' + t.map(x=>'t'+x.codigo+'='+(x.etiqueta||x.anio_inicio)).join('  '));
    } catch (e) { console.log('    (sin tabla temporadas: ' + e.message + ')'); }
    db.close();
  " 2>/dev/null
  echo
done
