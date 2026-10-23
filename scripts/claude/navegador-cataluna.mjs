#!/usr/bin/env node
/** Sólo lectura: qué error hay detrás de «Chrome dejó de responder» en Cataluña y qué grupos lo provocan. */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('descargas-cataluna/recolector-local/cola-v2.sqlite', { readOnly: true });
db.exec('pragma busy_timeout = 15000');
const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
console.log('peticiones 24 h por resultado:', db.prepare(`select resultado, count(*) n from peticiones where iniciada_en > ? group by 1`).all(desde));
for (const p of db.prepare(`select trabajo, iniciada_en, duracion_ms, substr(detalle,1,300) d from peticiones where resultado='error_navegador' order by id desc limit 6`).all()) console.log(p);
console.log('trabajos que lo provocan:', db.prepare(`select trabajo, count(*) n, max(iniciada_en) ult from peticiones where resultado='error_navegador' and iniciada_en > ? group by 1 order by 2 desc limit 12`).all(desde));
for (const t of db.prepare(`select t.clave, t.estado, t.intentos, t.siguiente_intento, t.url, c.estado cal_estado, c.siguiente_intento cal_sig
  from trabajos t left join trabajos c on c.tipo='calendario' and c.temporada=t.temporada and c.competicion=t.competicion and c.grupo=t.grupo
  where t.clave in (select trabajo from peticiones where resultado='error_navegador' and iniciada_en > ? group by 1 order by count(*) desc limit 6)`).all(desde)) console.log(t);
