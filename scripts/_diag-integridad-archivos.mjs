#!/usr/bin/env node
/**
 * Comprueba que TODO archivo registrado en cada cola existe de verdad y que lo que se llama `.gz`
 * es gzip de verdad. Detecta el caso peligroso: un fichero `.html.gz` que en realidad contiene el
 * JSON del análisis (el HTML archivado se habría perdido).
 *
 * Sólo lectura. Uso: node scripts/_diag-integridad-archivos.mjs [federacion ...]
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';

const raiz = process.cwd();
const solo = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const minimo = Number((process.argv.find((a) => a.startsWith('--min=')) ?? '--min=1').slice(6));

const federaciones = readdirSync(raiz)
  .filter((d) => d.startsWith('descargas-'))
  .map((d) => d.replace('descargas-', ''))
  .filter((f) => solo.length === 0 || solo.includes(f))
  .sort();

function cabecera(ruta) {
  const fd = openSync(ruta, 'r');
  try {
    const b = Buffer.alloc(4);
    const n = readSync(fd, b, 0, 4, 0);
    return b.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

const esGzip = (b) => b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b;
const pareceJson = (b) => b.length >= 1 && (b[0] === 0x7b || b[0] === 0x5b);
const pareceHtml = (b) => b.length >= 1 && b[0] === 0x3c;

let totalGlobal = 0;
let malosGlobal = 0;
const resumen = [];

for (const fed of federaciones) {
  const ruta = `${raiz}/descargas-${fed}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  let filas;
  try {
    filas = db.prepare(`select ruta, tipo, bytes from archivos`).all();
  } catch {
    db.close();
    continue;
  }
  const faltan = [];
  const staleGz = [];
  const perdidos = [];
  const falsosGz = [];
  const porTipo = new Map();
  for (const f of filas) {
    totalGlobal++;
    if (!existsSync(f.ruta)) {
      // Una fila que apunta a una ruta plana cuyo `.gz` sí existe no es una pérdida: es una fila
      // vieja que `leeArchivo` resuelve igual. Lo grave es que no exista ninguno de los dos.
      if (existsSync(`${f.ruta}.gz`)) { staleGz.push(f); continue; }
      faltan.push(f);
      perdidos.push(f);
      continue;
    }
    if (!f.ruta.toLowerCase().endsWith('.gz')) continue;
    let cab;
    try {
      cab = cabecera(f.ruta);
    } catch {
      faltan.push(f);
      continue;
    }
    if (esGzip(cab)) continue;
    falsosGz.push({ ...f, clase: pareceJson(cab) ? 'JSON' : pareceHtml(cab) ? 'HTML' : 'otro' });
    porTipo.set(f.tipo, (porTipo.get(f.tipo) ?? 0) + 1);
  }

  const actasHechas = db.prepare(`select count(*) n from actas where estado='hecha'`).get().n;
  const actasSinArchivo = db
    .prepare(`select count(*) n from actas where estado='hecha' and (archivo is null or archivo='')`)
    .get().n;
  const actasArchivoRoto = db
    .prepare(`select count(*) n from actas where estado='hecha' and archivo is not null
      and archivo not in (select ruta from archivos)`)
    .get().n;

  malosGlobal += faltan.length + falsosGz.length;
  resumen.push({
    fed,
    filas: filas.length,
    staleGz: staleGz.length,
    faltan: faltan.length,
    falsosGz: falsosGz.length,
    porTipo: [...porTipo.entries()].map(([t, n]) => `${t}:${n}`).join(', ') || '-',
    actasHechas,
    actasSinArchivo,
    actasArchivoRoto,
    ejemploFaltan: faltan[0]?.ruta ?? '',
    ejemploFalso: falsosGz[0] ? `${falsosGz[0].clase} · ${falsosGz[0].ruta}` : '',
    faltanTipos: [...new Set(perdidos.map((f) => f.tipo))].join(', '),
  });
  db.close();
}

console.log('INTEGRIDAD DE ARCHIVOS REGISTRADOS EN LAS COLAS');
console.log('federación            filas  fila_vieja  perdidos  no-gz  actas  sin_arch  roto  no-gz por tipo');
for (const r of resumen) {
  if (r.faltan + r.falsosGz + r.staleGz < minimo) continue;
  console.log(
    `${r.fed.padEnd(21)} ${String(r.filas).padStart(6)} ${String(r.staleGz).padStart(11)} ${String(r.faltan).padStart(9)} ${String(r.falsosGz).padStart(6)} ${String(r.actasHechas).padStart(6)} ${String(r.actasSinArchivo).padStart(9)} ${String(r.actasArchivoRoto).padStart(5)}  ${r.porTipo}`,
  );
}
console.log(`\nTOTAL ${totalGlobal} rutas registradas · ${malosGlobal} perdidas de verdad (fila_vieja = el .gz existe, no es pérdida)`);
for (const r of resumen) {
  if (r.ejemploFaltan) console.log(`  PERDIDO · ${r.fed} (${r.faltanTipos || 'tipo ?'}): ${r.ejemploFaltan}`);
  if (r.ejemploFalso) console.log(`  no-gz · ${r.fed}: ${r.ejemploFalso}`);
}
