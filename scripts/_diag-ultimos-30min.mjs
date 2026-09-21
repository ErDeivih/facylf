/*
 * Qué ha pasado en los ÚLTIMOS 30 MINUTOS, federación a federación.
 * Sólo lee. Uso: node scripts/_diag-ultimos-30min.mjs [minutos]
 */
import { createRequire } from 'node:module';
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const minutos = Number(process.argv[2] ?? 30);
const desde = new Date(Date.now() - minutos * 60000).toISOString();

let totalOk = 0; let totalMal = 0; let totalJornadas = 0;
console.log(`últimos ${minutos} min · federación      peticiones  ok  incidencias  jornadas  registro`);
const incidencias = new Map();
const filas = [];
for (const carpeta of readdirSync(raiz).filter((n) => n.startsWith('descargas-')).sort()) {
  const base = join(raiz, carpeta, 'recolector-local');
  if (!existsSync(join(base, 'cola-v2.sqlite'))) continue;
  const federacion = carpeta.replace('descargas-', '');
  const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });
  const uno = (sql) => db.prepare(sql).get()?.n ?? 0;
  const pet = uno(`select count(*) n from peticiones where iniciada_en >= '${desde}'`);
  const ok = uno(`select count(*) n from peticiones where iniciada_en >= '${desde}' and resultado = 'ok'`);
  const jornadas = uno(`select count(*) n from jornadas where comprobada_en >= '${desde}'`);
  for (const e of db.prepare(`select resultado, count(*) n from peticiones where iniciada_en >= '${desde}' and resultado <> 'ok' group by resultado`).all()) {
    incidencias.set(e.resultado, (incidencias.get(e.resultado) ?? 0) + e.n);
  }
  db.close();
  totalOk += ok; totalMal += pet - ok; totalJornadas += jornadas;
  const registro = join(base, 'worker-programado.log');
  const edad = existsSync(registro) ? Math.round((Date.now() - statSync(registro).mtime.getTime()) / 60000) : null;
  filas.push({ federacion, pet, ok, mal: pet - ok, jornadas, edad });
}
for (const f of filas) {
  console.log(`  ${f.federacion.padEnd(18)} ${String(f.pet).padStart(6)} ${String(f.ok).padStart(5)} ${String(f.mal).padStart(9)} ${String(f.jornadas).padStart(9)}   hace ${f.edad ?? '—'} min`);
}
console.log(`\nTOTAL: ${totalOk + totalMal} peticiones (${totalOk} correctas, ${totalMal} con incidencia) · ${totalJornadas} jornadas comprobadas · ` +
  `ritmo ${Math.round((totalOk + totalMal) * (60 / minutos))}/hora · acierto ${totalOk + totalMal ? Math.round(totalOk / (totalOk + totalMal) * 100) : 0} %`);
console.log(`incidencias: ${[...incidencias.entries()].map(([k, n]) => `${k}=${n}`).join(' · ') || 'ninguna'}`);

const log = join(raiz, 'descargas-euskadi', 'recolector-local', 'worker-programado.log');
void log;
console.log(`\nmemoria libre ahora: ${(await import('node:os')).freemem() / 1073741824 >= 0 ? ((await import('node:os')).freemem() / 1073741824).toFixed(2) : '?'} GB`);
void readFileSync;
