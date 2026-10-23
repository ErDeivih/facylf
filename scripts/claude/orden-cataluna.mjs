#!/usr/bin/env node
/** Sólo lectura: cuántos trabajos disponibles van por delante de la primera acta en la cola de Cataluña. */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('descargas-cataluna/recolector-local/cola-v2.sqlite', { readOnly: true });
db.exec('pragma busy_timeout = 15000');
const ahora = new Date().toISOString();
const disp = `estado in ('pendiente','bloqueado') and (siguiente_intento is null or siguiente_intento <= '${ahora}')`;
const acta = db.prepare(`select min(prioridad) p, count(*) n from trabajos where tipo='acta' and ${disp}`).get();
console.log('actas disponibles:', acta.n, '· prioridad de la primera:', acta.p);
console.log('por delante de la primera acta:', db.prepare(`select tipo, temporada, cast(prioridad/1000000 as int) cat, count(*) n
  from trabajos where tipo<>'acta' and ${disp} and prioridad < ? group by 1,2,3 order by 3,2`).all(acta.p));
console.log('actas disponibles por categoría y temporada:', db.prepare(`select temporada, cast(prioridad/1000000 as int) cat, count(*) n
  from trabajos where tipo='acta' and ${disp} group by 1,2 order by 2,1`).all());
console.log('hecho en la última hora:', db.prepare(`select tipo, count(*) n from trabajos where estado='hecho' and actualizado_en > ? group by 1`)
  .all(new Date(Date.now() - 3600_000).toISOString()));
console.log('en_curso:', db.prepare(`select count(*) n from trabajos where estado='en_curso'`).get().n);
