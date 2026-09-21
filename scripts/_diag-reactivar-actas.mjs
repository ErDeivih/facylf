/* Devuelve a la cola los trabajos de acta que quedaron aparcados por "acta ilegible".
 *
 * Ahora que el parser entiende esa maquetación, el aparcamiento de un mes ya no tiene sentido: hay
 * que volver a intentarlos. Uso:
 *   node scripts/_diag-reactivar-actas.mjs <ruta-cola.sqlite> [--dias N] [--aplicar]
 */
import { DatabaseSync } from 'node:sqlite';

const ruta = process.argv[2];
const aplicar = process.argv.includes('--aplicar');
const iDias = process.argv.indexOf('--dias');
const dias = iDias >= 0 ? Number(process.argv[iDias + 1]) : 30;
if (!ruta) { console.error('Falta la ruta de la cola.'); process.exit(2); }

const db = new DatabaseSync(ruta);
const limite = new Date(Date.now() + dias * 24 * 3600_000).toISOString();
const pendientes = db.prepare(`
  select clave, ultimo_error, siguiente_intento from trabajos
  where tipo='acta' and estado='pendiente' and siguiente_intento is not null and siguiente_intento > ?
`).all(limite);

console.log(`${ruta}`);
console.log(`trabajos de acta aparcados más de ${dias} días: ${pendientes.length}`);
for (const p of pendientes.slice(0, 3)) console.log(`   ${p.clave}  hasta ${p.siguiente_intento}  ${String(p.ultimo_error ?? '').slice(0, 60)}`);

if (pendientes.length && aplicar) {
  const r = db.prepare(`update trabajos set siguiente_intento=null, intentos=0, actualizado_en=?
    where tipo='acta' and estado='pendiente' and siguiente_intento is not null and siguiente_intento > ?`)
    .run(new Date().toISOString(), limite);
  console.log(`devueltos a la cola: ${Number(r.changes ?? 0)}`);
} else if (pendientes.length) {
  console.log('(modo consulta: añade --aplicar)');
}
db.close();
