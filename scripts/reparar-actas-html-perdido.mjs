#!/usr/bin/env node
/**
 * Repara las actas cuyo HTML archivado se perdió el 13/09/2026.
 *
 *  Qué pasó: `guardaAtomico` guarda el HTML comprimido como `acta-X.html.gz`, y los dos reparadores
 *  calculaban la ruta del JSON con `acta.archivo.replace(/\.html$/i, '.json')`. Con la ruta acabada en
 *  `.gz` ese `replace` no cambiaba nada, así que el JSON del análisis se escribió ENCIMA del HTML
 *  comprimido. Al reprocesar otra vez, el analizador leyó su propio JSON como si fuera HTML, no sacó
 *  nada y dejó el acta vacía. Resultado: 1.521 fichas con el HTML perdido y el análisis en blanco.
 *
 *  Qué hace esto: quitar el fichero que miente (`.html.gz` que no es gzip) y devolver el acta a la
 *  cola para que el recolector la vuelva a descargar y analizar con el parser actual. Las actas cuyo
 *  análisis SÍ tenía datos no se tocan: ahí sólo se retira la referencia al HTML perdido.
 *
 *  Sin `--aplicar` no toca nada: sólo informa.
 *
 * Uso: node scripts/reparar-actas-html-perdido.mjs [--aplicar] [--federacion asturias]
 */
import { readdirSync, existsSync, openSync, readSync, closeSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const aplicar = process.argv.includes('--aplicar');
const solo = (() => {
  const i = process.argv.indexOf('--federacion');
  return i >= 0 ? process.argv[i + 1] : null;
})();
const INCIDENCIA = 'html archivado perdido: se vuelve a descargar y analizar';
const ERROR_COLA = 'html archivado perdido (fallo del 13/09/2026): se descarga otra vez';

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

const directorios = readdirSync(RAIZ)
  .filter((d) => d.startsWith('descargas-'))
  .filter((d) => (solo ? d.includes(solo) : true))
  .sort();

const resumen = [];
let totalReabiertas = 0;
let totalConservadas = 0;
let totalHuerfanas = 0;
let totalAjenas = 0;

for (const dir of directorios) {
  const rutaDb = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(rutaDb)) continue;
  const db = new DatabaseSync(aplicar ? rutaDb : rutaDb, { readOnly: !aplicar });
  if (aplicar) db.exec('pragma busy_timeout=30000');

  const filas = db.prepare(`select ruta, tipo from archivos where ruta like '%.gz'`).all();
  const rotas = [];
  for (const f of filas) {
    if (!existsSync(f.ruta)) continue;
    let cab;
    try { cab = cabecera(f.ruta); } catch { continue; }
    if (cab[0] === 0x1f && cab[1] === 0x8b) continue;
    if (!/\.html\.gz$/i.test(f.ruta)) { totalAjenas++; continue; }
    rotas.push(f);
  }
  if (!rotas.length) { db.close(); continue; }

  const actaDe = db.prepare(`select codigo,temporada,competicion,grupo,jornada,estado,datos,incidencias
    from actas where archivo=?`);
  const reabrir = [];
  const conservar = [];
  const huerfanas = [];
  for (const f of rotas) {
    const a = actaDe.get(f.ruta);
    if (!a) { huerfanas.push(f); continue; }
    let datos = null;
    try { datos = JSON.parse(a.datos ?? 'null'); } catch { /* sin datos */ }
    const util = Boolean(datos) && (
      (datos.goles?.length ?? 0) > 0 ||
      (datos.lineups?.local?.titulares?.length ?? 0) +
        (datos.lineups?.local?.suplentes?.length ?? 0) +
        (datos.lineups?.visitante?.titulares?.length ?? 0) +
        (datos.lineups?.visitante?.suplentes?.length ?? 0) > 0 ||
      (datos.tecnicos?.length ?? 0) > 0
    );
    (util ? conservar : reabrir).push({ archivo: f, acta: a });
  }

  const grupos = new Set(reabrir.map((r) => `${r.acta.temporada}/${r.acta.competicion}/${r.acta.grupo}`));
  resumen.push({
    dir, rotas: rotas.length, reabrir: reabrir.length, conservar: conservar.length,
    huerfanas: huerfanas.length, grupos: grupos.size,
  });
  totalReabiertas += reabrir.length;
  totalConservadas += conservar.length;
  totalHuerfanas += huerfanas.length;

  if (!aplicar) { db.close(); continue; }

  const ahora = new Date().toISOString();
  const borraArchivo = db.prepare('delete from archivos where ruta=?');
  const limpiaActa = db.prepare(`update actas set archivo=null,hash=null where archivo=?`);
  const devuelveACola = db.prepare(`update actas set estado='pendiente',archivo=null,hash=null,datos=null,
    calidad=null,incidencias=?,version_parser=0,comprobada_en=null where archivo=?`);
  const reabreTrabajo = db.prepare(`update trabajos set estado='pendiente',intentos=0,siguiente_intento=null,
    prioridad=0,ultimo_error=?,actualizado_en=? where tipo='acta' and acta=?`);
  db.exec('begin immediate');
  try {
    for (const { archivo, acta } of reabrir) {
      rmSync(archivo.ruta, { force: true });
      borraArchivo.run(archivo.ruta);
      devuelveACola.run(JSON.stringify([INCIDENCIA]), archivo.ruta);
      reabreTrabajo.run(ERROR_COLA, ahora, acta.codigo);
    }
    for (const { archivo, acta } of conservar) {
      rmSync(archivo.ruta, { force: true });
      borraArchivo.run(archivo.ruta);
      limpiaActa.run(archivo.ruta);
      let incidencias = [];
      try { incidencias = JSON.parse(acta.incidencias ?? '[]'); } catch { incidencias = []; }
      if (!incidencias.includes(INCIDENCIA)) incidencias.push(INCIDENCIA);
      db.prepare(`update actas set incidencias=? where codigo=? and temporada=? and competicion=?
        and grupo=? and jornada=?`)
        .run(JSON.stringify(incidencias), acta.codigo, acta.temporada, acta.competicion, acta.grupo, acta.jornada);
    }
    for (const f of huerfanas) {
      rmSync(f.ruta, { force: true });
      borraArchivo.run(f.ruta);
    }
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    console.error(`  ${dir}: se abortó (${error instanceof Error ? error.message : String(error)})`);
  }
  db.close();
}

console.log('ACTAS CON EL HTML ARCHIVADO PERDIDO (JSON del análisis escrito encima del .html.gz)');
console.log('federación             fichas  a_descargar  sólo_quitar_ref  huérfanas  grupos_afectados');
for (const r of resumen) {
  console.log(`${r.dir.replace('descargas-', '').padEnd(21)} ${String(r.rotas).padStart(6)} ${String(r.reabrir).padStart(12)} ${String(r.conservar).padStart(16)} ${String(r.huerfanas).padStart(10)} ${String(r.grupos).padStart(17)}`);
}
console.log(`\nTOTAL ${totalReabiertas + totalConservadas + totalHuerfanas} fichas · se vuelven a descargar ${totalReabiertas} · sólo se retira la referencia ${totalConservadas} · huérfanas ${totalHuerfanas}`);
if (totalAjenas) console.log(`(además hay ${totalAjenas} rutas .gz que no son gzip y no son .html.gz: no se tocan)`);
if (!aplicar) console.log('\nModo consulta: añade --aplicar para reparar. Las actas que se reabren volverán a la cola con prioridad 0 (las primeras) y sus grupos no se publicarán hasta que se descarguen otra vez.');
