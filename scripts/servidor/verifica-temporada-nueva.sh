#!/bin/bash
# Verificación de la temporada nueva de CyL en el servidor.
echo "=== TEMPORADAS ASIGNADAS EN EL SERVIDOR ==="
grep -v '^#' /srv/data/facylf/descargas-federacion/recolector-local/temporadas-asignadas.txt | grep -v '^$' | while read -r t; do echo "  $t"; done
echo
echo "=== ESTADO DEL RECOLECTOR DE CYL ==="
docker inspect -f '  {{.Name}} {{.State.Status}} desde {{.State.StartedAt}}' facylf-federacion-1 2>&1
echo
echo "=== LO QUE DICE AL ARRANCAR (busca la reactivación de temporadas) ==="
docker logs --tail 40 facylf-federacion-1 2>&1 | grep -iE 'temporada|reactiv|asignad|sesión|trabajo' | tail -10
echo
echo "=== ¿APARECEN TRABAJOS DE LA TEMPORADA NUEVA (2013-14 = t9)? ==="
docker run --rm -v /srv:/srv:ro node:22-alpine node -e "
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync('/srv/ssd/facylf/federacion/cola-v2.sqlite',{readOnly:true});
  const t=db.prepare('select temporada, estado, count(*) as n from trabajos group by 1,2 order by 1 desc, 3 desc limit 24').all();
  for (const f of t) console.log('  t'+f.temporada+' '+f.estado+': '+f.n);
  const nuevas=db.prepare(\"select count(*) as n from trabajos where temporada='9'\").get().n;
  console.log('  --- trabajos de la temporada 9 (2013-14): '+nuevas);
  db.close();
" 2>&1 | grep -v Experimental | grep -v trace-warnings
