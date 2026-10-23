#!/usr/bin/env node
/*
 * LA BITÁCORA DE LOS RECOLECTORES: qué decidió NO recoger cada cola, y cuántas veces.
 *
 * Por qué importa para los informes. Hay TRES ausencias distintas y hasta ahora sólo se distinguían dos:
 *
 *   · no publicado      · la federación no lo publica (p. ej. la tabla oficial de algunas)
 *   · no recolectado    · el recolector aún no ha llegado (trabajo pendiente, se mide con `importar:estado`)
 *   · NO SE RECOGE      · el recolector decidió NO pedirlo, y lo dejó escrito en la tabla `eventos`
 *
 * La tercera es la peor de leer: una consulta que busque las actas de una categoría protegida no encuentra
 * nada y parece que la federación no las publica. La bitácora dice la verdad: «Las actas de 22/48465911/48908427
 * no se encolarán: categoría …». Es privacidad de menores, es deliberado, y quien lea el hueco tiene que poder
 * saberlo.
 *
 * Es de SÓLO LECTURA y no toca la red. Uso:
 *   node scripts/mide-bitacora-de-colas.mjs                 · resumen por tipo, con ejemplos
 *   node scripts/mide-bitacora-de-colas.mjs --federacion galicia
 *   node scripts/mide-bitacora-de-colas.mjs --tipo privacidad --ejemplos 10
 *   node scripts/mide-bitacora-de-colas.mjs --json
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const { DatabaseSync } = requerir('node:sqlite');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const filtro = arg('federacion');
const filtroTipo = arg('tipo');
const ejemplos = Number(arg('ejemplos') ?? 3);
const soloJson = argumentos.includes('--json');

const colas = [];
for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  if (entrada.name === 'descargas-federacion-sondeo' || entrada.name === 'descargas-prueba-10gb') continue;
  const ruta = join(RAIZ, entrada.name, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  if (existsSync(join(RAIZ, entrada.name, '.PRUEBA'))) continue;
  const federacion = entrada.name === 'descargas-federacion' ? 'castilla-leon' : entrada.name.replace('descargas-', '');
  if (filtro && federacion !== filtro) continue;
  colas.push({ federacion, ruta });
}

/** tipo → { filas, federaciones:Set, ejemplos:[] }. */
const porTipo = new Map();
/** El detalle se agrupa por su primera parte, sin los códigos ni la fecha: «no se encolarán: categoría …». */
const porDetalle = new Map();
/*
 * Y los grupos de MENORES cuya acta no se encola a propósito, contados por su código y no por suceso: el
 * recolector escribe un aviso cada vez que comprueba la lista de grupos de una competición, así que el mismo
 * grupo sale muchas veces. Lo que importa para leer un hueco es cuántos GRUPOS son, y si alguno tiene actas
 * de todos modos (se recogieron cuando el interruptor estaba encendido).
 */
const menores = new Map();
for (const { federacion, ruta } of colas) {
  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 10_000 });
  try {
    const existe = db.prepare("select 1 as x from sqlite_master where type = 'table' and name = 'eventos'").get();
    if (existe === undefined) continue;
    const filas = db.prepare(`select nivel, tipo, detalle from eventos
        ${filtroTipo ? 'where tipo = ?' : ''}`).all(...(filtroTipo ? [filtroTipo] : []));
    for (const f of filas) {
      const t = porTipo.get(f.tipo) ?? { tipo: f.tipo, filas: 0, federaciones: new Set(), niveles: new Set(), ejemplos: [] };
      t.filas += 1;
      t.federaciones.add(federacion);
      t.niveles.add(f.nivel);
      if (t.ejemplos.length < ejemplos) t.ejemplos.push(`${federacion}: ${f.detalle}`);
      porTipo.set(f.tipo, t);
      const d = String(f.detalle).replace(/\d+/g, 'N').replace(/[A-Z]:\\[^\s]+/g, '<ruta>').slice(0, 110);
      porDetalle.set(d, (porDetalle.get(d) ?? 0) + 1);
      if (f.tipo !== 'privacidad') continue;
      const partes = String(f.detalle).match(/(\d+)\/(\d+)\/(\d+)/);
      if (partes === null) continue;
      const clave = `${federacion}|${partes[1]}|${partes[2]}|${partes[3]}`;
      const suyo = menores.get(clave) ?? { federacion, temporada: partes[1], competicion: partes[2], grupo: partes[3], avisos: 0, actas: null, partidosConResultado: null, actasDeMas: 0 };
      suyo.avisos += 1;
      menores.set(clave, suyo);
    }
    /*
     * Y de esos grupos, cuántas actas hay de todos modos y cuántos partidos con resultado tienen: un partido
     * con marcador es, exactamente, un acta que existiría y no se va a pedir. Es la forma de decir CUÁNTO
     * falta por una decisión de configuración y no por trabajo pendiente.
     */
    for (const suyo of menores.values()) {
      if (suyo.federacion !== federacion || suyo.partidosConResultado !== null) continue;
      try {
        suyo.actas = Number(db.prepare(`select count(*) as n from actas
          where temporada = ? and competicion = ? and grupo = ? and estado = 'hecha'`)
          .get(suyo.temporada, suyo.competicion, suyo.grupo).n);
        suyo.partidosConResultado = Number(db.prepare(`select count(*) as n from partidos
          where temporada = ? and competicion = ? and grupo = ? and goles_local is not null`)
          .get(suyo.temporada, suyo.competicion, suyo.grupo).n);
        suyo.actasDeMas = Number(db.prepare(`select count(*) as n from actas
          where temporada = ? and competicion = ? and grupo = ?`)
          .get(suyo.temporada, suyo.competicion, suyo.grupo).n);
      } catch { /* una cola sin esa tabla no invalida el resto */ }
    }
  } catch (error) {
    console.error(`  ${federacion}: no se pudo leer la bitácora (${error.message})`);
  } finally {
    db.close();
  }
}

const tipos = [...porTipo.values()].map((t) => ({ tipo: t.tipo, filas: t.filas,
  federaciones: [...t.federaciones].sort(), niveles: [...t.niveles].sort(), ejemplos: t.ejemplos }))
  .sort((a, b) => b.filas - a.filas);

if (soloJson) {
  console.log(JSON.stringify({
    tipos,
    detalles: [...porDetalle].sort((a, b) => b[1] - a[1]).slice(0, 60),
    gruposDeMenores: {
      grupos: menores.size,
      sinNingunaActa: [...menores.values()].filter((m) => (m.actas ?? 0) === 0).length,
      partidosSinActa: [...menores.values()].filter((m) => (m.actas ?? 0) === 0)
        .reduce((n, m) => n + (m.partidosConResultado ?? 0), 0),
      conActas: [...menores.values()].filter((m) => (m.actas ?? 0) > 0).length,
      actasHechas: [...menores.values()].reduce((n, m) => n + (m.actas ?? 0), 0),
      avisos: [...menores.values()].reduce((n, m) => n + m.avisos, 0),
    },
  }, null, 2));
  process.exit(0);
}

console.log(`═══ bitácora de los recolectores · ${colas.length} cola(s)`);
const total = tipos.reduce((n, t) => n + t.filas, 0);
console.log(`    ${total} suceso(s) anotado(s) por los recolectores`);
console.log('');
for (const t of tipos) {
  console.log(`  ${String(t.filas).padStart(7)} × ${t.tipo} (${t.niveles.join(', ')}) · en ${t.federaciones.length} federación(es)`);
  for (const e of t.ejemplos) console.log(`          ${e}`);
}
if (menores.size > 0) {
  const conActas = [...menores.values()].filter((m) => (m.actas ?? 0) > 0);
  const porFederacion = new Map();
  for (const m of menores.values()) porFederacion.set(m.federacion, (porFederacion.get(m.federacion) ?? 0) + 1);
  const partidos = [...menores.values()].reduce((n, m) => n + (m.partidosConResultado ?? 0), 0);
  const sinNinguna = [...menores.values()].filter((m) => (m.actas ?? 0) === 0);
  const partidosSinActa = sinNinguna.reduce((n, m) => n + (m.partidosConResultado ?? 0), 0);
  const actasHechas = [...menores.values()].reduce((n, m) => n + (m.actas ?? 0), 0);
  console.log('');
  console.log(`  DE MENORES, sin recoger a propósito: ${menores.size} grupo(s) distintos, en `
    + `${porFederacion.size} federación(es)`);
  console.log(`    ${[...porFederacion].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')}`);
  console.log(`    de ellos, ${sinNinguna.length} NO tienen ni un acta, y suman `
    + `${partidosSinActa.toLocaleString('es-ES')} partido(s) con resultado: son otras tantas actas que existirían `
    + 'y no se van a pedir mientras el alcance siga así');
  console.log(`    los otros ${menores.size - sinNinguna.length} sí tienen actas descargadas `
    + `(${actasHechas.toLocaleString('es-ES')} en total, de ${partidos.toLocaleString('es-ES')} partidos con resultado): `
    + 'se recogieron antes de que el alcance las dejara fuera');
  if (conActas.length > 0) {
    console.log(`    p. ej. ${conActas.slice(0, 3).map((m) => `${m.federacion} t${m.temporada} c${m.competicion} g${m.grupo} (${m.actas} actas hechas de ${m.actasDeMas})`).join(' · ')}`);
  }
  console.log('    (los avisos de la tabla de arriba son más que grupos: se escribe uno por cada comprobación '
    + 'de la lista de grupos de una competición)');
}
console.log('\n  lo que más se repite (detalle sin códigos):');
for (const [d, n] of [...porDetalle].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(7)} × ${d}`);
}
