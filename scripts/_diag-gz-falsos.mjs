#!/usr/bin/env node
/**
 * Localiza los ficheros `.gz` que NO son gzip (contienen el JSON del análisis encima del HTML
 * archivado) y dice en qué estado están sus actas y si su trabajo está hecho o pendiente.
 * Sólo lectura.
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync, openSync, readSync, closeSync } from 'node:fs';

const raiz = process.cwd();
const federaciones = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(raiz).filter((d) => d.startsWith('descargas-')).map((d) => d.replace('descargas-', ''));

const cabecera = (ruta) => {
  const fd = openSync(ruta, 'r');
  try {
    const b = Buffer.alloc(2);
    readSync(fd, b, 0, 2, 0);
    return b;
  } finally {
    closeSync(fd);
  }
};

for (const fed of federaciones) {
  const rutaDb = `${raiz}/descargas-${fed}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(rutaDb)) continue;
  const db = new DatabaseSync(rutaDb, { readOnly: true });
  const filas = db.prepare(`select ruta, tipo, bytes from archivos where ruta like '%.gz'`).all();
  const malos = [];
  for (const f of filas) {
    if (!existsSync(f.ruta)) continue;
    let cab;
    try { cab = cabecera(f.ruta); } catch { continue; }
    if (cab[0] === 0x1f && cab[1] === 0x8b) continue;
    malos.push(f);
  }
  if (!malos.length) { db.close(); continue; }
  console.log(`\n===== ${fed}: ${malos.length} ficheros .gz que no son gzip (tipo ${[...new Set(malos.map((m) => m.tipo))].join(',')})`);
  const porEstado = new Map();
  const porTrabajo = new Map();
  let sinActa = 0;
  for (const m of malos) {
    const a = db.prepare(`select estado, calidad, incidencias from actas where archivo=?`).get(m.ruta);
    if (!a) { sinActa++; continue; }
    porEstado.set(a.estado, (porEstado.get(a.estado) ?? 0) + 1);
    const t = db.prepare(`select estado from trabajos where tipo='acta' and acta=? limit 1`)
      .get(m.ruta.match(/acta-(\d+)\./)?.[1] ?? '');
    const clave = t?.estado ?? 'sin trabajo';
    porTrabajo.set(clave, (porTrabajo.get(clave) ?? 0) + 1);
  }
  console.log(`  estado del acta: ${[...porEstado.entries()].map(([k, v]) => `${k}=${v}`).join(' · ') || '-'} · sin fila de acta: ${sinActa}`);
  console.log(`  trabajo de cola: ${[...porTrabajo.entries()].map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  db.close();
}
