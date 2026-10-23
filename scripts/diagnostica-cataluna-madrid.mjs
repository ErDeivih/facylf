/*
 * Diagnóstico fino de Cataluña y Madrid: ¿en qué se les va el tiempo?
 *
 * Se miran cuatro cosas: qué tipos de trabajo tienen pendientes, cuáles han cerrado en la última hora, cuánto
 * tardan de verdad, y qué están procesando ahora mismo. Con eso se distingue «va lento porque le queda mucho»
 * de «va lento porque insiste en trabajos que no pueden salir».
 */
import { DatabaseSync } from 'node:sqlite';

for (const [nombre, ruta] of [
  ['cataluna', 'descargas-cataluna/recolector-local/cola-v2.sqlite'],
  ['madrid', 'descargas-madrid/recolector-local/cola-v2.sqlite'],
  ['valencia', 'descargas-valencia/recolector-local/cola-v2.sqlite'],
]) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  console.log(`\n════════ ${nombre.toUpperCase()} ════════`);

  console.log('  PENDIENTES POR TIPO');
  for (const f of db.prepare(`select tipo, count(*) as n,
      sum(case when siguiente_intento is null or siguiente_intento <= datetime('now') then 1 else 0 end) as listos
    from trabajos where estado='pendiente' group by 1 order by 2 desc limit 6`).all()) {
    console.log(`    ${String(f.tipo).padEnd(18)} ${String(f.n).padStart(7)} · ${String(f.listos).padStart(7)} listos`);
  }

  console.log('  CERRADOS EN LA ÚLTIMA HORA (por tipo y estado)');
  const cerrados = db.prepare(`select tipo, estado, count(*) as n from trabajos
    where estado in ('hecho','cancelado') and actualizado_en > datetime('now','-1 hour')
    group by 1,2 order by 3 desc limit 5`).all();
  if (!cerrados.length) console.log('    (ninguno)');
  for (const f of cerrados) console.log(`    ${String(f.tipo).padEnd(18)} ${String(f.estado).padEnd(11)} ${f.n}`);

  console.log('  LOS ÚLTIMOS 4 TRABAJOS TOCADOS');
  for (const t of db.prepare(`select tipo, estado, intentos, actualizado_en, substr(clave,1,40) as clave,
      substr(coalesce(ultimo_error,'(sin error)'),1,64) as err
    from trabajos order by actualizado_en desc limit 4`).all()) {
    console.log(`    ${t.actualizado_en} ${t.tipo}/${t.estado} int=${t.intentos} ${t.clave}`);
    console.log(`        ${t.err}`);
  }

  console.log('  EN CURSO AHORA');
  for (const t of db.prepare(`select tipo, clave, actualizado_en from trabajos where estado='en_curso' limit 3`).all()) {
    console.log(`    ${t.actualizado_en} ${t.tipo} ${t.clave}`);
  }
  db.close();
}
