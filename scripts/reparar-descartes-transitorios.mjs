// Sólo recupera descartes cuya última causa es HTTP 5xx o fallo explícito del renderer.
// Conserva la fila anterior en metadatos dentro de la misma transacción.
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
const aplicar = process.argv.includes('--aplicar');
for (const fed of ['madrid', 'valencia', 'cataluna']) {
  const db = new DatabaseSync(resolve(`descargas-${fed}/recolector-local/cola-v2.sqlite`), { readOnly: !aplicar });
  db.exec('pragma busy_timeout=5000');
  const filas = db.prepare(`select * from trabajos where estado='cancelado'
    and (ultimo_error like '%HTTP 5__ %'
      or ultimo_error like '%Timed out receiving message from renderer%'
      or ultimo_error like 'Wait timed out after%'
      or ultimo_error like 'script timeout%'
      or (?='cataluna' and tipo='calendario' and ultimo_error='el calendario no muestra ninguna jornada'))`).all(fed);
  const obsoletas = fed === 'cataluna'
    ? db.prepare(`select * from trabajos where tipo='jornada' and estado in ('pendiente','bloqueado','en_curso')`).all()
    : [];
  console.log(`${fed}: ${filas.length} descartes transitorios${aplicar ? ' a recuperar' : ' (simulación)'}`
    + (obsoletas.length ? `; ${obsoletas.length} jornadas FCF obsoletas` : ''));
  if (aplicar && (filas.length || obsoletas.length)) {
    db.exec('begin immediate');
    try {
      for (const fila of filas) {
        const fresca = db.prepare('select * from trabajos where clave=?').get(fila.clave);
        if (fresca.estado !== 'cancelado' || fresca.ultimo_error !== fila.ultimo_error) continue;
        const clave = `reparacion-transitorio:2026-09-19-v2:${fila.clave}`;
        db.prepare('insert into metadatos(clave,valor) values(?,?) on conflict(clave) do nothing')
          .run(clave, JSON.stringify(fresca));
        db.prepare(`update trabajos set estado='pendiente',intentos=0,siguiente_intento=?,actualizado_en=? where clave=?`)
          .run(new Date(Date.now()+3600_000).toISOString(), new Date().toISOString(), fila.clave);
      }
      for (const fila of obsoletas) {
        const fresca = db.prepare('select * from trabajos where clave=?').get(fila.clave);
        if (!['pendiente', 'bloqueado', 'en_curso'].includes(fresca.estado)) continue;
        const clave = `reparacion-jornada-fcf-obsoleta:2026-09-19:${fila.clave}`;
        db.prepare('insert into metadatos(clave,valor) values(?,?) on conflict(clave) do nothing')
          .run(clave, JSON.stringify(fresca));
        db.prepare(`update trabajos set estado='cancelado',
          ultimo_error='obsoleto: Cataluña repasa el calendario completo del grupo', siguiente_intento=null,
          actualizado_en=? where clave=?`).run(new Date().toISOString(), fila.clave);
      }
      db.exec('commit');
    } catch (error) { db.exec('rollback'); throw error; }
  }
  db.close();
}
