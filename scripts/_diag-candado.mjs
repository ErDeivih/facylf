/* ¿Hay una transacción de escritura abierta y atascada en las colas que no avanzan?
 * Si `begin immediate` falla con SQLITE_BUSY, otro proceso tiene el candado de escritura cogido. */
import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';

for (const fed of ['extremadura', 'asturias', 'navarra', 'murcia']) {
  const ruta = `descargas-${fed}/recolector-local/cola-v2.sqlite`;
  console.log(`\n=== ${fed} ===`);
  for (const sufijo of ['', '-wal', '-shm']) {
    try { console.log(`   ${sufijo || 'base'}: ${(statSync(ruta + sufijo).size / 1024).toFixed(0)} KB`); }
    catch { console.log(`   ${sufijo || 'base'}: (no existe)`); }
  }
  const db = new DatabaseSync(ruta);
  db.exec('pragma busy_timeout = 1500');
  const t = Date.now();
  try {
    db.exec('begin immediate');
    db.exec('commit');
    console.log(`   candado de escritura: LIBRE (${Date.now() - t} ms)`);
  } catch (e) {
    console.log(`   candado de escritura: OCUPADO tras ${Date.now() - t} ms -> ${e.message}`);
  }
  const ult = db.prepare('select iniciada_en, resultado from peticiones order by id desc limit 1').get();
  console.log(`   última petición anotada: ${ult?.iniciada_en ?? '—'} (${ult?.resultado ?? '-'})`);
  const curso = db.prepare("select count(*) n from trabajos where estado='en_curso'").get().n;
  console.log(`   trabajos en curso: ${curso}`);
  db.close();
}
