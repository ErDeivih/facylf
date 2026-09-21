#!/usr/bin/env node
/**
 * Diagnóstico de SÓLO LECTURA sobre la cola SQLite de Castilla y León.
 *
 * Pregunta: ¿de dónde salen los 5 partidos del grupo 11379752 (Tercera Fed. 2024-25) con el equipo
 * mal asignado? Se compara lo que dice la cola (`partidos.local/visitante`, `equipos.codigo/nombre`)
 * con lo que acabó en el canónico.
 *
 * Uso: node scripts/_diag-partidos-cl-mal.mjs [temporada] [competicion] [grupo]
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const [temporada = '20', competicion = '11379751', grupo = '11379752'] = process.argv.slice(2);
const ruta = resolve(import.meta.dirname, '..', 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite');
const db = new DatabaseSync(ruta, { readOnly: true });

console.log(`cola: ${ruta} · temporada ${temporada} · competición ${competicion} · grupo ${grupo}\n`);

/* 1. Los partidos del grupo, tal cual los tiene la cola. */
const partidos = db.prepare(`select jornada, orden, codigo_acta, equipo_local_codigo, equipo_visitante_codigo,
    local, visitante, goles_local, goles_visitante
  from partidos where temporada = ? and competicion = ? and grupo = ? order by jornada, orden`)
  .all(temporada, competicion, grupo);
console.log(`partidos en la cola: ${partidos.length}`);

/* 2. Los equipos de la temporada, agrupados por código: ¿algún código con DOS nombres distintos? */
const porCodigo = new Map();
for (const e of db.prepare('select codigo, nombre, primera_jornada from equipos where temporada = ? order by codigo, nombre').all(temporada)) {
  if (!porCodigo.has(e.codigo)) porCodigo.set(e.codigo, []);
  porCodigo.get(e.codigo).push(e.nombre);
}
const colisiones = [...porCodigo.entries()].filter(([, nombres]) => new Set(nombres).size > 1);
console.log(`equipos de la temporada: ${porCodigo.size} códigos · con más de un nombre: ${colisiones.length}`);
for (const [codigo, nombres] of colisiones.slice(0, 30)) {
  console.log(`  cod ${codigo}: ${nombres.map((n) => `«${n}»`).join(' · ')}`);
}

/* 3. Los códigos que citan los partidos de ESTE grupo y qué nombres tiene cada uno. */
const citados = new Set();
for (const p of partidos) { if (p.equipo_local_codigo) citados.add(p.equipo_local_codigo); if (p.equipo_visitante_codigo) citados.add(p.equipo_visitante_codigo); }
console.log(`\ncódigos citados por los partidos del grupo: ${citados.size}`);
const problematicos = [...citados].filter((c) => (porCodigo.get(c) ?? []).length !== 1);
console.log(`códigos citados con nombre ambiguo o inexistente: ${problematicos.length}`);
for (const c of problematicos) console.log(`  cod ${c}: ${JSON.stringify(porCodigo.get(c) ?? null)}`);

/* 4. Cuadre por equipo: jornadas jugadas según la cola, usando el nombre que la propia fila publica. */
const cuenta = new Map();
for (const p of partidos) {
  for (const [nombre, codigo] of [[p.local, p.equipo_local_codigo], [p.visitante, p.equipo_visitante_codigo]]) {
    const clave = `${codigo ?? '—'} · ${nombre}`;
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
}
console.log('\npartidos por equipo (según el nombre de la propia fila de partido):');
for (const [clave, n] of [...cuenta.entries()].sort((a, b) => a[1] - b[1])) {
  console.log(`  ${String(n).padStart(3)}  ${clave}`);
}

/* 5. Jornadas en las que cada equipo NO aparece, según el nombre publicado. */
const jornadas = [...new Set(partidos.map((p) => p.jornada))].sort((a, b) => a - b);
console.log(`\njornadas: ${jornadas.length} (${jornadas[0]}..${jornadas.at(-1)})`);
const equipos = [...new Set(partidos.flatMap((p) => [p.local, p.visitante]))].sort();
for (const eq of equipos) {
  const sin = jornadas.filter((j) => !partidos.some((p) => p.jornada === j && (p.local === eq || p.visitante === eq)));
  if (sin.length !== 2) console.log(`  ${eq}: juega ${jornadas.length - sin.length}, descansa en ${JSON.stringify(sin)}`);
}

/* 6. ¿Alguna jornada con un equipo repetido o con menos/más partidos de 9? */
console.log('\npor jornada:');
for (const j of jornadas) {
  const deLa = partidos.filter((p) => p.jornada === j);
  const nombres = deLa.flatMap((p) => [p.local, p.visitante]);
  const repetidos = nombres.filter((n, i) => nombres.indexOf(n) !== i);
  console.log(`  J${String(j).padStart(2)}: ${deLa.length} partidos · ${new Set(nombres).size} equipos distintos${repetidos.length ? ` · REPETIDOS: ${[...new Set(repetidos)].join(', ')}` : ''}`);
}

db.close();
