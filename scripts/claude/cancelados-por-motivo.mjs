#!/usr/bin/env node
/*
 * cancelados-por-motivo.mjs — SÓLO LEE. Trabajos CANCELADOS de una cola, por temporada, tipo, motivo y fechas, y
 * unas muestras con la última petición que hizo cada uno (21/10/2026). Sirve para distinguir «la web de verdad no
 * lo publica» de «se canceló mientras la web nos bloqueaba o fallaba».
 *
 * Uso: node cancelados-por-motivo.mjs <federación> [muestras]      (FACYLF_RAIZ=/app por defecto)
 */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const [fed, muestrasTxt] = process.argv.slice(2);
const carpeta = fed === 'castilla-leon' ? 'descargas-federacion' : `descargas-${fed}`;
const db = new DatabaseSync(join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true, timeout: 60000 });
const et = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [t.codigo, t.etiqueta]));
const filas = db.prepare(`select temporada, tipo, substr(coalesce(ultimo_error,''),1,80) e, substr(min(actualizado_en),1,16) desde,
    substr(max(actualizado_en),1,16) hasta, count(*) n from trabajos where estado='cancelado' group by 1,2,3 order by n desc limit 30`).all();
console.log(`${fed}: cancelados por temporada/tipo/motivo`);
for (const f of filas) console.log(`  ${et.get(f.temporada) ?? f.temporada} ${f.tipo} ×${f.n}  ${f.desde} → ${f.hasta}  «${f.e}»`);
const n = Number(muestrasTxt ?? 4);
const muestras = db.prepare(`select clave, temporada, tipo, url, actualizado_en, ultimo_error from trabajos where estado='cancelado' and tipo in ('jornada','indice_jornadas')
  order by random() limit ?`).all(n);
for (const m of muestras) {
  const p = db.prepare('select iniciada_en, resultado, substr(coalesce(detalle,\'\'),1,200) d, url from peticiones where trabajo=? order by id desc limit 2').all(m.clave);
  console.log(`\n  ${m.clave} (${et.get(m.temporada)}) cancelado ${m.actualizado_en}\n    url ${m.url}\n    motivo ${String(m.ultimo_error).slice(0, 160)}`);
  for (const x of p) console.log(`    petición ${x.iniciada_en} ${x.resultado} ${x.d} ${x.url}`);
}
const porDia = db.prepare(`select substr(iniciada_en,1,10) d, resultado, count(*) n from peticiones where id > (select max(id) - 60000 from peticiones)
  group by 1,2 order by 1 desc limit 40`).all();
console.log('\n  peticiones por día (últimas ~60.000):');
for (const x of porDia) console.log(`    ${x.d} ${x.resultado} ${x.n}`);
