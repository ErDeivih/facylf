/*
 * separa-titulares.mjs — arregla el aviso de alineación en las actas YA guardadas
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * El detector juntaba dos casos incompatibles bajo el mismo nombre: «un equipo con MÁS titulares de los
 * posibles» (anomalía real) y «la ficha publica MENOS de los esperados» (alineación incompleta). Sumados daban
 * esos porcentajes inútiles: murcia 27 %, ceuta 26,5 %, euskadi 17,4 % de las actas de adultos.
 *
 * El detector ya está separado, pero eso sólo arregla lo que se recoja a partir de ahora. Lo ya guardado
 * conserva la palabra vieja, así que las cifras siguen mezcladas hasta que se recalculen.
 *
 * ── CÓMO SE RECALCULA SIN PEDIRLE NADA A NADIE ───────────────────────────────────────────────────────────
 *
 * No hace falta releer ninguna ficha: el propio aviso guardado lleva los números dentro, con la forma
 * `titulares_atipicos:10/11;esperados:11`. Así que basta con interpretarlo:
 *
 *   · si ALGÚN equipo pasa de los esperados  → se queda como `titulares_atipicos`   (anomalía de verdad);
 *   · si los dos están POR DEBAJO            → pasa a `titulares_incompletos`       (hueco de la fuente).
 *
 * Un aviso que no encaje en ese formato se deja INTACTO y se cuenta aparte: mejor no tocarlo que estropearlo.
 *
 * Uso:
 *   node scripts/servidor/separa-titulares.mjs <raíz>              (sólo informa)
 *   node scripts/servidor/separa-titulares.mjs <raíz> --aplicar    (lo escribe)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.argv[2];
const aplicar = process.argv.includes('--aplicar');
if (!raiz) {
  console.error('uso: separa-titulares.mjs <raíz> [--aplicar]');
  process.exit(2);
}
const n = (x) => Number(x ?? 0).toLocaleString('es-ES');
const PATRON = /^titulares_atipicos:(\d+)\/(\d+);esperados:(\d+)$/;

const federaciones = readdirSync(raiz)
  .filter((d) => d.startsWith('descargas-') && existsSync(join(raiz, d, 'recolector-local', 'cola-v2.sqlite')))
  .map((d) => d.replace('descargas-', ''))
  .sort();

console.log(`══ separar «titulares atípicos» de «titulares incompletos»${aplicar ? ' · APLICANDO' : ' · sólo informe'} ══\n`);
let totalCambiadas = 0;

for (const fed of federaciones) {
  const db = new DatabaseSync(join(raiz, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite'),
    { readOnly: !aplicar, timeout: 120_000 });

  const filas = db.prepare(`select temporada, competicion, grupo, jornada, codigo, incidencias
    from actas where incidencias like '%titulares_atipicos:%'`).all();
  if (!filas.length) { db.close(); continue; }

  let aIncompletos = 0;
  let siguenAtipicos = 0;
  let raros = 0;
  const cambios = [];

  for (const f of filas) {
    let lista;
    try { lista = JSON.parse(f.incidencias); } catch { raros++; continue; }
    if (!Array.isArray(lista)) { raros++; continue; }
    let tocado = false;
    const nueva = lista.map((texto) => {
      const m = PATRON.exec(String(texto).trim());
      if (!m) return texto;
      const [, l, v, e] = m.map(Number);
      if (l > e || v > e) { siguenAtipicos++; return texto; }      // se queda como anomalía
      if (l < e || v < e) { aIncompletos++; tocado = true; return `titulares_incompletos:${l}/${v};esperados:${e}`; }
      return texto;                                                // iguales: no debería estar aquí
    });
    if (tocado) cambios.push({ ...f, incidencias: JSON.stringify(nueva) });
  }

  console.log(`── ${fed}`);
  console.log(`   ${n(filas.length)} actas con el aviso: ${n(aIncompletos)} pasan a «incompletos»`
    + ` · ${n(siguenAtipicos)} siguen siendo anomalía real${raros ? ` · ${n(raros)} con formato raro (intactas)` : ''}`);

  if (aplicar && cambios.length) {
    db.exec('begin immediate');
    try {
      const actualiza = db.prepare(`update actas set incidencias=? where temporada=? and competicion=?
        and grupo=? and jornada=? and codigo=?`);
      for (const c of cambios) {
        actualiza.run(c.incidencias, c.temporada, c.competicion, c.grupo, c.jornada, c.codigo);
      }
      db.exec('commit');
      totalCambiadas += cambios.length;
    } catch (e) { db.exec('rollback'); throw e; }
  }
  db.close();
}

console.log(`\n  actas reclasificadas: ${n(totalCambiadas)}`);
console.log('  (las que siguen como `titulares_atipicos` son las de verdad: más titulares de los posibles)');
