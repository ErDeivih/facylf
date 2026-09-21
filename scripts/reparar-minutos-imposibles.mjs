import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const aplicar = process.argv.includes('--aplicar');
const raiz = resolve('.');
for (const nombre of readdirSync(raiz).filter((n) => n.startsWith('descargas-') && !n.includes('prueba'))) {
  const ruta = join(raiz, nombre, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: !aplicar });
  db.exec('pragma busy_timeout=10000');
  const eventos = db.prepare(`select temporada,competicion,grupo,jornada,acta,
    group_concat(distinct minuto) minutos from eventos_acta
    where minuto is not null and (minuto<0 or minuto>130)
    group by temporada,competicion,grupo,jornada,acta`).all();
  console.log(`${nombre.replace('descargas-', '')}: ${eventos.length} actas con minutos fuera de rango`
    + (aplicar ? ' a marcar' : ' (simulación)'));
  if (aplicar && eventos.length) {
    db.exec('begin immediate');
    try {
      const lee = db.prepare(`select calidad,incidencias from actas where temporada=? and competicion=?
        and grupo=? and jornada=? and codigo=?`);
      const actualiza = db.prepare(`update actas set calidad='revisar',incidencias=? where temporada=?
        and competicion=? and grupo=? and jornada=? and codigo=?`);
      for (const e of eventos) {
        const acta = lee.get(e.temporada, e.competicion, e.grupo, e.jornada, e.acta);
        if (!acta) continue;
        let incidencias;
        try { incidencias = JSON.parse(acta.incidencias || '[]'); } catch { incidencias = []; }
        const marca = `minuto_fuera_rango:${e.minutos}`;
        if (!incidencias.some((i) => String(i).startsWith('minuto_fuera_rango:'))) incidencias.push(marca);
        const clave = `reparacion-minuto-fuera-rango:2026-09-19:${e.temporada}|${e.competicion}|${e.grupo}|${e.jornada}|${e.acta}`;
        db.prepare('insert into metadatos(clave,valor) values(?,?) on conflict(clave) do nothing')
          .run(clave, JSON.stringify(acta));
        actualiza.run(JSON.stringify(incidencias), e.temporada, e.competicion, e.grupo, e.jornada, e.acta);
      }
      db.exec('commit');
    } catch (error) { db.exec('rollback'); throw error; }
  }
  db.close();
}
