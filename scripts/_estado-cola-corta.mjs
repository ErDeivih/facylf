/*
 * Foto corta y de solo lectura de una cola, para las pruebas: peticiones, trabajo pendiente,
 * disponible y aplazado. Existe para que un guion de PowerShell no tenga que incrustar SQL en una
 * línea (que es donde se rompen las comillas).
 *
 * Uso: node scripts/_estado-cola-corta.mjs <ruta-cola.sqlite>   → JSON en una línea.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) {
  console.log(JSON.stringify({ error: 'sin-cola', ruta: ruta ?? null }));
  process.exit(0);
}

const ahora = new Date().toISOString();
const db = new DatabaseSync(ruta, { readOnly: true });
const uno = (sql, ...p) => db.prepare(sql).get(...p)?.n ?? 0;

const pendientes = uno("select count(*) n from trabajos where estado='pendiente'");
const aplazados = uno("select count(*) n from trabajos where estado='pendiente' and siguiente_intento > ?", ahora);
console.log(JSON.stringify({
  peticiones: uno('select count(*) n from peticiones'),
  ok: uno("select count(*) n from peticiones where resultado='ok'"),
  ultimaPeticion: db.prepare('select max(iniciada_en) m from peticiones').get()?.m ?? null,
  trabajosPendientes: pendientes,
  disponibles: pendientes - aplazados,
  aplazados,
  proximoAplazado: db.prepare("select min(siguiente_intento) m from trabajos where estado='pendiente' and siguiente_intento > ?").get(ahora)?.m ?? null,
}));
db.close();
