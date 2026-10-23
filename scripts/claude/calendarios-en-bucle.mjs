#!/usr/bin/env node
/*
 * calendarios-en-bucle.mjs — SÓLO LEE. Trabajos que se repiten muchas veces sin éxito (intentos altos):
 * cuántos, de qué tipo y temporada, con el error completo de unos ejemplos y la URL que se pidió.
 * Uso: node calendarios-en-bucle.mjs <cola-v2.sqlite> [intentos-mínimos=20] [n-ejemplos=4]
 */
import { DatabaseSync } from 'node:sqlite';
const [, , ruta, minimo = '20', nEj = '4'] = process.argv;
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 120000 });
const et = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [String(t.codigo), t.etiqueta]));
const cols = db.prepare('pragma table_info(trabajos)').all().map((c) => c.name);
console.log('columnas de trabajos:', cols.join(','));
for (const r of db.prepare(`select tipo, temporada, count(*) n, sum(intentos) suma, max(intentos) imax
    from trabajos where estado in ('pendiente','bloqueado') and intentos >= ? group by 1,2 order by 3 desc`).all(Number(minimo))) {
  console.log(`  ${r.tipo.padEnd(14)} ${et.get(String(r.temporada)) ?? r.temporada}: ${r.n} trabajos · ${r.suma} intentos en total · máx ${r.imax}`);
}
const extra = ['url', 'clave', 'grupo', 'competicion'].filter((c) => cols.includes(c));
for (const r of db.prepare(`select tipo, intentos, siguiente_intento, ultimo_error ${extra.map((c) => ',' + c).join('')}
    from trabajos where estado in ('pendiente','bloqueado') and intentos >= ? order by intentos desc limit ?`).all(Number(minimo), Number(nEj))) {
  console.log(`\n  ── ${r.tipo} intentos=${r.intentos} siguiente=${r.siguiente_intento} ${extra.map((c) => `${c}=${r[c]}`).join(' ')}`);
  console.log(`     ${String(r.ultimo_error).slice(0, 900)}`);
}
db.close();
