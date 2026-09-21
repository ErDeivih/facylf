/*
 * Lee, pone o quita el cupo diario de una cola (`metadatos.diario_max`).
 *
 * Existe para las pruebas y el mantenimiento: subirlo un rato y dejarlo como estaba desde un guion de PowerShell
 * obligaba a escribir SQL con comillas dentro de comillas, y eso se rompe siempre. Esto lo hace en un sitio y se
 * lee de un vistazo.
 *
 * Uso:
 *   node scripts/_cupo-diario.mjs <cola.sqlite> leer
 *   node scripts/_cupo-diario.mjs <cola.sqlite> poner 500
 *   node scripts/_cupo-diario.mjs <cola.sqlite> quitar
 */
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [ruta, orden, valor] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) { console.error(`no hay cola en ${ruta}`); process.exit(2); }

const db = new DatabaseSync(ruta);
try {
  db.exec('pragma busy_timeout = 15000;');
  if (orden === 'poner') {
    if (!Number.isFinite(Number(valor))) { console.error('falta el número del cupo'); process.exit(2); }
    db.prepare("insert into metadatos(clave,valor) values('diario_max',?) on conflict(clave) do update set valor=excluded.valor")
      .run(String(valor));
  } else if (orden === 'quitar') {
    db.prepare("delete from metadatos where clave='diario_max'").run();
  }
  const actual = db.prepare("select valor from metadatos where clave='diario_max'").get()?.valor ?? '';
  console.log(actual);
} finally {
  db.close();
}
