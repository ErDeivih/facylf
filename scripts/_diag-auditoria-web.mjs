#!/usr/bin/env node
/**
 * Auditoría de la cadena completa hacia la web, grupo a grupo.
 *
 *  Se evalúa cada condición que exige la web para publicar una competición y se cuenta qué le falta a
 *  cada grupo. Sirve para detectar bloqueos silenciosos (cosas que no dependen de las actas) antes de
 *  que pasen semanas recolectando datos que nunca se verían.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const federacion = process.argv[2] ?? 'cataluna';
const dir = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const ruta = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) { console.log(`sin cola de ${federacion}`); process.exit(0); }
const db = new DatabaseSync(ruta, { readOnly: true });

const grupos = db.prepare(`select g.temporada, g.competicion, g.codigo, g.nombre, coalesce(g.jornadas,0) jornadas,
  c.grupos_comprobados_en, c.nombre competicionNombre
  from grupos g join competiciones c on c.temporada=g.temporada and c.codigo=g.competicion
  where g.estado<>'ausente_web'`).all();

const faltas = new Map();
const suma = (clave) => faltas.set(clave, (faltas.get(clave) ?? 0) + 1);
let sinNada = 0;
for (const g of grupos) {
  const problemas = [];
  if (!g.grupos_comprobados_en) problemas.push('competición sin grupos comprobados');
  if (!(g.jornadas > 0)) problemas.push('grupo sin jornadas');
  const conArchivo = db.prepare(`select count(*) n from jornadas where temporada=? and competicion=?
    and grupo=? and archivo is not null`).get(g.temporada, g.competicion, g.codigo).n;
  if (conArchivo < g.jornadas) problemas.push(`jornadas con archivo ${conArchivo}/${g.jornadas}`);
  const partidos = db.prepare(`select count(*) n, sum(codigo_acta is not null) conActa,
    sum(goles_local is not null) conMarcador from partidos where temporada=? and competicion=? and grupo=?`)
    .get(g.temporada, g.competicion, g.codigo);
  if (!partidos.n) problemas.push('sin partidos');
  for (const tipo of ['calendario', 'clasificacion']) {
    const hecho = db.prepare(`select count(*) n from trabajos where temporada=? and competicion=?
      and grupo=? and tipo=? and estado='hecho'`).get(g.temporada, g.competicion, g.codigo, tipo).n;
    if (!hecho) problemas.push(`sin ${tipo} hecho`);
  }
  const vivos = db.prepare(`select tipo from trabajos where temporada=? and competicion=? and grupo=?
    and tipo in ('indice_jornadas','calendario','clasificacion','jornada','acta')
    and estado not in ('hecho','cancelado') group by tipo`).all(g.temporada, g.competicion, g.codigo)
    .map((t) => t.tipo);
  // Las actas pendientes son el trabajo normal, así que se cuentan aparte.
  const noActas = vivos.filter((t) => t !== 'acta');
  if (noActas.length) problemas.push(`trabajos vivos: ${noActas.join(',')}`);
  const actasSin = db.prepare(`select count(*) n from actas where temporada=? and competicion=? and grupo=?
    and estado not in ('hecha','ausente_web','sin_datos')`).get(g.temporada, g.competicion, g.codigo).n;
  const soloActas = problemas.length === 0 && (vivos.includes('acta') || actasSin > 0);
  if (problemas.length) { for (const p of problemas) suma(p.replace(/\d+\/\d+/, 'n/m')); }
  else if (soloActas) sinNada += 1;
  else suma('LISTO');
}
console.log(`${federacion}: ${grupos.length} grupos`);
console.log(`  listos salvo las actas (sólo falta bajarlas): ${sinNada}`);
console.log('  otros bloqueos:');
for (const [clave, n] of [...faltas].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(5)}  ${clave}`);
db.close();
