/* Limpieza: actas marcadas como hechas pero SIN ninguna participación guardada.
 *
 * Son actas cuya página se descargó y no se pudo interpretar (el caso de Euskadi antes del arreglo).
 * Dejarlas como 'hecha' publica el grupo sin plantillas y da por hecho un trabajo que no se ha
 * hecho; se devuelven a la cola para que se reprocesen cuando haya parser.
 *
 * Uso: node scripts/_diag-limpiar-actas-vacias.mjs <ruta-cola.sqlite> [--aplicar]
 */
import { DatabaseSync } from 'node:sqlite';

const ruta = process.argv[2];
const aplicar = process.argv.includes('--aplicar');
if (!ruta) { console.error('Falta la ruta de la cola.'); process.exit(2); }

const db = new DatabaseSync(ruta);
const vacias = db.prepare(`
  select a.codigo, a.temporada, a.competicion, a.grupo, a.jornada
  from actas a
  where a.estado = 'hecha'
    and not exists (select 1 from participaciones p
      where p.temporada=a.temporada and p.competicion=a.competicion
        and p.grupo=a.grupo and p.jornada=a.jornada and p.acta=a.codigo)
`).all();

console.log(`${ruta}`);
console.log(`actas 'hecha' sin ninguna participación: ${vacias.length}`);
for (const v of vacias.slice(0, 5)) console.log(`   t${v.temporada} c${v.competicion} g${v.grupo} j${v.jornada} acta ${v.codigo}`);

if (!vacia(vacias)) {
  if (!aplicar) { console.log('\n(modo consulta: añade --aplicar para cambiarlo)'); db.close(); process.exit(0); }
  db.exec('begin immediate');
  let actas = 0; let trabajos = 0;
  for (const v of vacias) {
    const r1 = db.prepare(`update actas set estado='pendiente', archivo=null, hash=null, datos=null,
      calidad=null, incidencias=null where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`)
      .run(v.temporada, v.competicion, v.grupo, v.jornada, v.codigo);
    actas += Number(r1.changes ?? 0);
    const r2 = db.prepare(`update trabajos set estado='pendiente', intentos=0, ultimo_error=null,
      siguiente_intento=null where tipo='acta' and temporada=? and competicion=? and grupo=? and jornada=? and acta=?`)
      .run(v.temporada, v.competicion, v.grupo, v.jornada, v.codigo);
    trabajos += Number(r2.changes ?? 0);
  }
  db.exec('commit');
  console.log(`\nactas devueltas a pendiente: ${actas} · trabajos reencolados: ${trabajos}`);
} else {
  console.log('\nNinguna: todo lo marcado como hecho tiene sus participaciones.');
}
db.close();

function vacia(lista) { return !lista || lista.length === 0; }
