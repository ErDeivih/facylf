#!/usr/bin/env node
/*
 * extrae-temporada-cola.mjs — SÓLO LEE la cola de origen. Copia a un SQLite NUEVO las filas de una temporada
 * (o de unos grupos de ella): temporadas, competiciones, grupos, jornadas, partidos, equipos, actas,
 * participaciones, técnicos, eventos y las personas que aparecen. No copia `trabajos` ni `peticiones`:
 * el fichero sirve para llevar datos de una máquina a otra, no trabajo.
 *
 * Por qué: Castilla y León se recoge en dos máquinas con temporadas disjuntas (REPARTO-TEMPORADAS.md). Los
 * informes se generan en el PC, y las temporadas del servidor (2026-27, la que está en curso) sólo llegan al
 * PC si alguien las trae. Esto hace el paquete; `fusiona-temporada-cola.mjs` lo mete en la cola del PC.
 *
 * Uso: node extrae-temporada-cola.mjs <cola-origen.sqlite> <destino.sqlite> <etiqueta-temporada> [grupo…]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';

const [, , origen, destino, etiqueta, ...grupos] = process.argv;
if (!origen || !destino || !etiqueta) { console.error('uso: extrae-temporada-cola.mjs <origen> <destino> <temporada> [grupo…]'); process.exit(2); }
if (existsSync(destino)) { console.error(`ya existe ${destino}; no se sobrescribe`); process.exit(2); }

const src = new DatabaseSync(origen, { readOnly: true, timeout: 120_000 });
const t = src.prepare('select codigo from temporadas where etiqueta = ?').get(etiqueta);
if (!t) { console.error(`la cola no tiene la temporada ${etiqueta}`); process.exit(1); }
const cod = String(t.codigo);

const dst = new DatabaseSync(destino);
dst.exec('pragma journal_mode = off; pragma synchronous = off;');
// Mismo esquema que el origen (las tablas que se copian), creado con sus propias sentencias.
const TABLAS = ['metadatos', 'temporadas', 'competiciones', 'grupos', 'jornadas', 'equipos', 'partidos', 'actas',
  'participaciones', 'tecnicos_acta', 'eventos_acta', 'personas'];
for (const nombre of TABLAS) {
  const fila = src.prepare("select sql from sqlite_master where type='table' and name=?").get(nombre);
  if (fila?.sql) dst.exec(fila.sql);
}
const filtroGrupo = grupos.length ? ` and grupo in (${grupos.map((g) => `'${String(g).replace(/\D/g, '')}'`).join(',')})` : '';
const filtroGrupoG = grupos.length ? ` and codigo in (${grupos.map((g) => `'${String(g).replace(/\D/g, '')}'`).join(',')})` : '';
const copia = (tabla, where) => {
  const cols = src.prepare(`pragma table_info(${tabla})`).all().map((c) => c.name);
  if (!cols.length) return 0;
  const lista = cols.join(',');
  const ins = dst.prepare(`insert or ignore into ${tabla} (${lista}) values (${cols.map(() => '?').join(',')})`);
  let n = 0;
  for (const fila of src.prepare(`select ${lista} from ${tabla} ${where}`).iterate()) {
    ins.run(...cols.map((c) => fila[c])); n++;
  }
  return n;
};
dst.exec('begin');
const cuentas = {
  metadatos: copia('metadatos', ''),
  temporadas: copia('temporadas', `where codigo = '${cod}'`),
  competiciones: copia('competiciones', `where temporada = '${cod}'`),
  grupos: copia('grupos', `where temporada = '${cod}'${filtroGrupoG}`),
  jornadas: copia('jornadas', `where temporada = '${cod}'${filtroGrupo}`),
  equipos: copia('equipos', `where temporada = '${cod}'`),
  partidos: copia('partidos', `where temporada = '${cod}'${filtroGrupo}`),
  actas: copia('actas', `where temporada = '${cod}'${filtroGrupo}`),
  participaciones: copia('participaciones', `where temporada = '${cod}'${filtroGrupo}`),
  tecnicos_acta: copia('tecnicos_acta', `where temporada = '${cod}'${filtroGrupo}`),
  eventos_acta: copia('eventos_acta', `where temporada = '${cod}'${filtroGrupo}`),
};
cuentas.personas = copia('personas', `where codigo in (select jugador_codigo from participaciones where temporada = '${cod}'${filtroGrupo} and jugador_codigo is not null)`);
dst.exec('commit');
const hechas = dst.prepare("select count(*) n, max(comprobada_en) ult from actas where estado='hecha'").get();
const porJ = dst.prepare(`select max(fecha) f from partidos where goles_local is not null`).get();
console.log(`extraído ${etiqueta} (código ${cod})${grupos.length ? ` grupos ${grupos.join(',')}` : ''} → ${destino}`);
console.log(Object.entries(cuentas).map(([k, v]) => `${k}=${v}`).join(' · '));
console.log(`actas hechas ${hechas.n} · última comprobada ${hechas.ult} · último partido con resultado ${porJ.f}`);
dst.close(); src.close();
console.log(`tamaño ${(statSync(destino).size / 1e6).toFixed(1)} MB`);
