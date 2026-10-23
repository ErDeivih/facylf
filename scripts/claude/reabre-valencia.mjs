#!/usr/bin/env node
// ESCRIBE en la cola de Valencia (decisión de David, 20/10/2026): quita las pausas y vetos del bloqueo de la FFCV para que
// el recolector vuelva a pedir con la ficha de página. Sin `--aplicar` sólo enseña lo que haría.
// Uso: node scripts/claude/reabre-valencia.mjs [--aplicar]      (con la flota de Valencia PARADA o entre sesiones)
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
const aplicar = process.argv.includes('--aplicar');
const ruta = join(resolve(import.meta.dirname, '..', '..'), 'descargas-valencia', 'recolector-local', 'cola-v2.sqlite');
const db = new DatabaseSync(ruta, { readOnly: !aplicar, timeout: 60000 });
const claves = ['pausa_global_hasta', 'pausa_global_motivo', 'bloqueo_declarado', 'tipo_vetado_por_bloqueo'];
for (const c of claves) console.log(`metadato ${c} = ${db.prepare('select valor from metadatos where clave=?').get(c)?.valor ?? '(no está)'}`);
const vetados = db.prepare(`select tipo, estado, count(*) n from trabajos where estado in ('pendiente','bloqueado')
  and (ultimo_error like '%403%' or ultimo_error like '%niega este tipo%') group by 1,2`).all();
for (const v of vetados) console.log(`trabajos aplazados por el bloqueo: ${v.tipo}/${v.estado} ${v.n}`);
if (!aplicar) { console.log('\n(sólo se enseña; con --aplicar se quitan las pausas y se devuelven esos trabajos a la cola)'); process.exit(0); }
db.exec('begin');
for (const c of claves) db.prepare(`update metadatos set valor='' where clave=?`).run(c);
const n = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=null
  where estado in ('pendiente','bloqueado') and (ultimo_error like '%403%' or ultimo_error like '%niega este tipo%')`).run().changes;
db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`).run(new Date().toISOString(), 'info', 'reapertura',
  `David decide seguir con la ficha de página de la FFCV (20/10/2026): pausas quitadas, ${n} trabajos devueltos a la cola`);
db.exec('commit');
console.log(`hecho: pausas quitadas y ${n} trabajos devueltos a la cola`);
