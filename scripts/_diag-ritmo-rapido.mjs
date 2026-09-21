#!/usr/bin/env node
/** Ritmo real por federación en los últimos N minutos, leyendo cada cola. */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync } from 'node:fs';

const MIN = Number(process.argv[2] ?? 15);
const raiz = process.cwd();
const filas = [];
for (const d of readdirSync(raiz)) {
  if (!d.startsWith('descargas-')) continue;
  const ruta = `${d}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
  } catch {
    continue;
  }
  const q = (sql, ...a) => {
    try { return db.prepare(sql).get(...a); } catch { return null; }
  };
  const desde = new Date(Date.now() - MIN * 60_000).toISOString();
  const recientes = q(`select count(*) n from peticiones where iniciada_en > ?`, desde);
  const ultima = q(`select iniciada_en, resultado, detalle, duracion_ms from peticiones order by id desc limit 1`);
  const errores = q(
    `select count(*) n from peticiones where iniciada_en > ? and resultado not in ('ok','sin_publicar')`,
    desde,
  );
  const media = q(`select avg(duracion_ms) m from peticiones where iniciada_en > ? and duracion_ms is not null`, desde);
  const enCurso = q(`select count(*) n from trabajos where estado = 'en_curso'`);
  filas.push({
    federacion: d.replace('descargas-', ''),
    pet: recientes?.n ?? 0,
    porMin: ((recientes?.n ?? 0) / MIN).toFixed(1),
    err: errores?.n ?? 0,
    seg: media?.m ? (media.m / 1000).toFixed(1) : '-',
    enCurso: enCurso?.n ?? 0,
    ultima: ultima?.iniciada_en ?? '-',
    estadoUltima: ultima?.resultado ?? '-',
  });
  db.close();
}
filas.sort((a, b) => Number(b.porMin) - Number(a.porMin));
console.log(`Ritmo en los últimos ${MIN} minutos (hora local ${new Date().toLocaleString('es-ES')})`);
console.log('federación              pet   pet/min  err  s/pet  en_curso  última');
let total = 0;
for (const f of filas) {
  total += f.pet;
  console.log(
    `${f.federacion.padEnd(22)} ${String(f.pet).padStart(5)} ${f.porMin.padStart(8)} ${String(f.err).padStart(4)} ${String(f.seg).padStart(6)} ${String(f.enCurso).padStart(9)}  ${f.ultima} ${f.estadoUltima}`,
  );
}
console.log(`TOTAL ${total} peticiones en ${MIN} min = ${(total / MIN).toFixed(1)} pet/min`);
