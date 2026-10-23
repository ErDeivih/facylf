#!/usr/bin/env node
/** Sólo lectura: los últimos errores completos de la cola de Cataluña (diagnóstico del 02/10/2026). */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('descargas-cataluna/recolector-local/cola-v2.sqlite', { readOnly: true });
db.exec('pragma busy_timeout = 15000');
for (const f of db.prepare(`select clave, tipo, estado, actualizado_en, ultimo_error from trabajos
  where ultimo_error like '%no muestra ninguna jornada%' order by actualizado_en desc limit 3`).all()) {
  console.log(f.clave, f.tipo, f.estado, f.actualizado_en, '\n', String(f.ultimo_error).slice(0, 1500), '\n');
}
console.log(db.prepare(`select tipo, estado, count(*) n, max(actualizado_en) ult from trabajos where temporada in ('2026-27','2025-26') group by 1,2`).all());
console.log('actas hechas por día:', db.prepare(`select substr(actualizado_en,1,10) d, count(*) n from trabajos where tipo='acta' and estado='hecho' group by 1 order by 1 desc limit 8`).all());
console.log('últimas peticiones:', db.prepare(`select * from peticiones order by id desc limit 3`).all().map((p) => JSON.stringify(p).slice(0, 400)));
