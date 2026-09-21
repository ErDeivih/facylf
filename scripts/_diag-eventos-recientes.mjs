import { DatabaseSync } from 'node:sqlite';

for (const ruta of process.argv.slice(2)) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  console.log(`\n${ruta}`);
  console.log(db.prepare(`select creado_en,tipo,detalle from eventos
    where tipo='reparacion_parser_isquad'
    order by rowid desc limit 12`).all());
  db.close();
}
