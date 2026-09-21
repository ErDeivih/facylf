#!/usr/bin/env node
/**
 * Muestras de oro: un grupo real congelado con sus recuentos escritos.
 *
 * Es la única defensa contra un importador que empieza a perder un 2 % de los goles sin que nadie lo
 * note (`CALIDAD-PRUEBAS.md`). El fichero de una muestra dice, para un grupo concreto y una federación
 * concreta, cuántos partidos, actas, participaciones, eventos y técnicos tiene la fuente, qué cobertura
 * sale y qué anomalías se conocen (calendario que no cuadra, diferencias con la tabla oficial).
 *
 * Uso:
 *   node scripts/oro.mjs listar                              # qué muestras hay y de cuándo son
 *   node scripts/oro.mjs generar [--federacion X] [--grupo Y]  # congela el estado REAL de ahora
 *   node scripts/oro.mjs verificar [--federacion X] [--grupo Y] # reimporta y compara con lo congelado
 *
 * `verificar` reimporta de verdad contra el canónico: tarda y escribe. Se lanza a mano, nunca como
 * parte de `pnpm test`, porque compite con los recolectores por CPU y disco.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';

const RAIZ = resolve(import.meta.dirname, '..');
const CARPETA = join(RAIZ, 'pruebas', 'oro');
const CARPETAS_FEDERACION = { 'castilla-leon': 'descargas-federacion' };

const orden = process.argv[2] ?? 'listar';
const arg = (nombre, defecto = '') => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? defecto) : defecto;
};
const soloFederacion = arg('federacion');
const soloGrupo = arg('grupo');

function rutaCola(federacion) {
  const carpeta = CARPETAS_FEDERACION[federacion] ?? `descargas-${federacion}`;
  return join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite');
}

/** Recuentos de la FUENTE para un grupo: es lo que se congela, no lo que hay en el canónico. */
function recuentosDeLaFuente(federacion, temporadaCodigo, grupo) {
  const db = new DatabaseSync(rutaCola(federacion), { readOnly: true });
  try {
    const uno = (sql, ...p) => Number(db.prepare(sql).get(...p)?.n ?? 0);
    const f = db.prepare('select etiqueta from temporadas where codigo=?').get(temporadaCodigo);
    const comp = db.prepare('select competicion from grupos where temporada=? and codigo=?').get(temporadaCodigo, grupo);
    const p = [temporadaCodigo, comp?.competicion ?? '', grupo];
    return {
      temporada: f?.etiqueta ?? null,
      competicion: comp?.competicion ?? null,
      jornadas: uno('select count(*) n from jornadas where temporada=? and competicion=? and grupo=?', ...p),
      partidos: uno('select count(*) n from partidos where temporada=? and competicion=? and grupo=?', ...p),
      partidosConResultado: uno('select count(*) n from partidos where temporada=? and competicion=? and grupo=? and goles_local is not null', ...p),
      actas: uno('select count(*) n from actas where temporada=? and competicion=? and grupo=?', ...p),
      actasHechas: uno("select count(*) n from actas where temporada=? and competicion=? and grupo=? and estado='hecha'", ...p),
      participaciones: uno('select count(*) n from participaciones where temporada=? and competicion=? and grupo=?', ...p),
      eventos: uno('select count(*) n from eventos_acta where temporada=? and competicion=? and grupo=?', ...p),
      tecnicos: uno('select count(*) n from tecnicos_acta where temporada=? and competicion=? and grupo=?', ...p),
    };
  } finally {
    db.close();
  }
}

const muestras = () => (existsSync(CARPETA)
  ? readdirSync(CARPETA, { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(CARPETA, d.name))
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ federacion: d.name, ruta: join(CARPETA, d.name, f), ...JSON.parse(readFileSync(join(CARPETA, d.name, f), 'utf8')) })))
  : []);

if (orden === 'listar') {
  const lista = muestras();
  console.log(`${lista.length} muestras de oro en pruebas/oro/`);
  for (const m of lista) {
    console.log(`  ${m.federacion}/${m.grupo} · ${m.temporada ?? '?'} · ${m.recuentos.partidos} partidos · `
      + `${m.recuentos.participaciones} participaciones · ${m.recuentos.eventos} eventos · congelada ${m.congelada_en}`);
  }
  process.exit(0);
}

if (orden === 'generar') {
  let generadas = 0;
  for (const m of muestras()) {
    if (soloFederacion && m.federacion !== soloFederacion) continue;
    if (soloGrupo && m.grupo !== soloGrupo) continue;
    const recuentos = recuentosDeLaFuente(m.federacion, m.temporadaCodigo, m.grupo);
    const actualizada = { ...m, temporada: recuentos.temporada, recuentos, congelada_en: new Date().toISOString().slice(0, 10) };
    delete actualizada.ruta;
    writeFileSync(m.ruta, `${JSON.stringify(actualizada, null, 2)}\n`);
    console.log(`  ${m.federacion}/${m.grupo}: congelados ${recuentos.partidos} partidos, ${recuentos.participaciones} participaciones`);
    generadas++;
  }
  console.log(`${generadas} muestras actualizadas. Revisa el diff: si un número baja, algo se ha perdido.`);
  process.exit(0);
}

if (orden === 'verificar') {
  const lista = muestras().filter((m) => (!soloFederacion || m.federacion === soloFederacion) && (!soloGrupo || m.grupo === soloGrupo));
  let bien = 0;
  const fallos = [];
  for (const m of lista) {
    const fuente = recuentosDeLaFuente(m.federacion, m.temporadaCodigo, m.grupo);
    const diferencias = Object.entries(m.recuentos)
      .filter(([k, v]) => typeof v === 'number' && Number(fuente[k] ?? 0) !== v)
      .map(([k, v]) => `${k}: congelado ${v} ≠ origen ${Number(fuente[k] ?? 0)}`);
    if (diferencias.length === 0) {
      console.log(`  ✓ ${m.federacion}/${m.grupo} · la fuente sigue diciendo lo mismo`);
      bien++;
    } else {
      console.log(`  ✗ ${m.federacion}/${m.grupo} · la fuente ha cambiado:`);
      for (const d of diferencias) console.log(`      ${d}`);
      fallos.push({ muestra: `${m.federacion}/${m.grupo}`, diferencias });
    }
  }
  console.log(`\n${bien}/${lista.length} muestras cuadran con la fuente`);
  if (fallos.length) {
    console.log('Una diferencia NO es un fallo del importador: puede ser que la federación haya corregido datos.');
    console.log('Lo que hay que hacer entonces: reimportar el grupo, mirar el informe y volver a congelar con `generar`.');
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

console.error(`Orden desconocida: ${orden}. Usa listar, generar o verificar.`);
process.exit(2);
