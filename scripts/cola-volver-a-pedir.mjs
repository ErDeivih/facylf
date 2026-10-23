#!/usr/bin/env node
/*
 * DEVOLVER A LA COLA LAS ACTAS CUYO FICHERO ARCHIVADO SE PERDIÓ, para que el recolector las vuelva a
 * descargar y analizar. Es la herramienta del §4.4 del traspaso.
 *
 * Por qué. La auditoría (`pnpm cola:archivos-que-faltan`) midió el 26/09/2026 que 23.504 actas `hecha` tienen su
 * fichero archivado desaparecido del disco: 22.932 ya están en el canónico y 572 viven sólo en la cola. El dato
 * no falta —cero irrecoverables—, pero la EVIDENCIA de ingesta sí: esas actas no se podrán volver a analizar con
 * un parser mejor. Esto las devuelve a la cola para que se recuperen.
 *
 * ── LA DIFERENCIA CON `reparar-actas-html-perdido.mjs`, Y ES LA IMPORTANTE ────────────────────────────────
 *
 * Esa herramienta —hermana, para el incidente del 13/09/2026— pone `datos=null` al devolver el acta a la cola,
 * porque en SU incidente el análisis guardado era basura (el JSON se había escrito encima del HTML comprimido y
 * el analizador se leyó a sí mismo). Aquí eso sería DESTRUIR EL ÚNICO DATO que hay: de las 23.504, **572 no
 * están en el canónico y su análisis vive sólo en `actas.datos`**. Por eso esta herramienta NO toca `datos` ni
 * `calidad`: lo que se pierde es el fichero, no el análisis, y el análisis se conserva hasta que la nueva
 * descarga lo sustituya.
 *
 * ── Y NO SE LANZA A LO BRUTO ─────────────────────────────────────────────────────────────────────────────
 *
 * 23.504 actas a 180-300 s por petición y worker son DÍAS de flota, y a cambio se recupera evidencia, no datos.
 * Así que: simulacro por defecto (`--aplicar` para hacerlo de verdad), se puede acotar por federación, y
 * `--solo-sin-canonico` empieza por las 572 que son las únicas donde el análisis no tiene copia en PostgreSQL.
 * El ritmo y los turnos de los recolectores NO se tocan: esto sólo devuelve trabajo a la cola, y la flota lo
 * hace a su paso.
 *
 * Uso:
 *   node scripts/cola-volver-a-pedir.mjs                        · simulacro: dice qué haría, sin tocar nada
 *   node scripts/cola-volver-a-pedir.mjs --federacion galicia   · sólo una federación
 *   node scripts/cola-volver-a-pedir.mjs --solo-sin-canonico    · sólo las que no están en el canónico (572)
 *   node scripts/cola-volver-a-pedir.mjs --aplicar              · lo hace
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = join(RAIZ, 'pruebas', 'reconstruccion', 'archivos-que-faltan.json');
const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const { DatabaseSync } = requerir('node:sqlite');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const aplicar = argumentos.includes('--aplicar');
const soloSinCanonico = argumentos.includes('--solo-sin-canonico');
const filtro = arg('federacion');

if (!existsSync(ENTRADA)) {
  console.error(`Falta ${ENTRADA.replace(`${RAIZ}\\`, '')}: ejecuta antes \`pnpm cola:archivos-que-faltan\`.`);
  process.exit(1);
}
const parte = JSON.parse(readFileSync(ENTRADA, 'utf8'));
const INCIDENCIA = 'fichero archivado perdido: se vuelve a descargar y analizar';
const ERROR_COLA = 'fichero archivado perdido: se descarga otra vez';

/** Las actas que hay que volver a pedir, agrupadas por federación. */
const porFederacion = new Map();
for (const a of parte.faltan ?? []) {
  if (filtro !== null && a.federacion !== filtro) continue;
  if (soloSinCanonico && a.enElCanonico === true) continue;
  const suyas = porFederacion.get(a.federacion) ?? [];
  suyas.push(a);
  porFederacion.set(a.federacion, suyas);
}
if (porFederacion.size === 0) {
  console.error('No hay ninguna acta que devolver con esos filtros.');
  process.exit(0);
}

let devueltas = 0;
let conDatos = 0;
let sinFila = 0;
for (const [federacion, actas] of [...porFederacion].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
  const rutaCola = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(rutaCola)) {
    console.log(`  ${federacion}: SIN COLA en ${rutaCola.replace(`${RAIZ}\\`, '')} (¿está en Docker?)`);
    continue;
  }
  // En simulacro se abre en sólo lectura: así ni un descuido puede escribir.
  const db = new DatabaseSync(rutaCola, { readOnly: !aplicar, timeout: 15_000 });
  const suyas = { devueltas: 0, conDatos: 0, sinFila: 0 };
  try {
    const devuelveACola = db.prepare(`update actas set estado='pendiente',archivo=null,hash=null,
      incidencias=?,version_parser=0,comprobada_en=null
      where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`);
    const reabreTrabajo = db.prepare(`update trabajos set estado='pendiente',intentos=0,siguiente_intento=null,
      prioridad=0,ultimo_error=?,actualizado_en=? where tipo='acta' and clave=?`);
    const mira = db.prepare(`select estado, datos, archivo from actas
      where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`);
    if (aplicar) db.exec('begin immediate');
    for (const a of actas) {
      const p = [a.temporada, a.competicion, a.grupo, a.jornada, a.codigo];
      const fila = mira.get(...p);
      if (fila === undefined) { suyas.sinFila += 1; continue; }
      const tieneDatos = fila.datos !== null && String(fila.datos).trim() !== '';
      if (tieneDatos) suyas.conDatos += 1;
      if (!aplicar) { suyas.devueltas += 1; continue; }
      const ahora = new Date().toISOString();
      devuelveACola.run(JSON.stringify([INCIDENCIA]), ...p);
      reabreTrabajo.run(ERROR_COLA, ahora, `acta|${a.temporada}|${a.competicion}|${a.grupo}|${a.jornada}|${a.codigo}`);
      suyas.devueltas += 1;
    }
    if (aplicar) db.exec('commit');
  } catch (error) {
    if (aplicar) { try { db.exec('rollback'); } catch { /* ya estaba cerrada */ } }
    console.error(`  ${federacion}: no se pudo (${error.message}); no se ha tocado nada de esa cola.`);
  } finally {
    db.close();
  }
  devueltas += suyas.devueltas;
  conDatos += suyas.conDatos;
  sinFila += suyas.sinFila;
  console.log(`  ${federacion.padEnd(20)} ${String(suyas.devueltas).padStart(6)} acta(s) `
    + `· ${String(suyas.conDatos).padStart(4)} con análisis en la cola`
    + (suyas.sinFila > 0 ? ` · ${suyas.sinFila} ya no están en la cola` : ''));
}

console.log('');
console.log(`  ${aplicar ? 'DEVUELTAS A LA COLA' : 'SE DEVOLVERÍAN'}: ${devueltas} acta(s) en ${porFederacion.size} federación(es)`);
console.log(`  de ésas, ${conDatos} tienen su análisis en la cola (las que no están en el canónico: no se toca)`);
if (!aplicar) {
  console.log('');
  console.log('  SIMULACRO: no se ha escrito nada. Añade --aplicar para devolverlas de verdad.');
  console.log('  Y antes de lanzarlo: son días de flota a 180-300 s por petición y worker. Se recupera');
  console.log('  EVIDENCIA de ingesta, no datos: los 23.504 no pierden ningún dato, ya está medido.');
} else {
  console.log('');
  console.log('  Hecho. La flota las bajará a su ritmo; el plan lo reexamina solo. Vuelve a medir con');
  console.log('  `pnpm cola:archivos-que-faltan` dentro de unos días para ver cómo baja el número.');
}
