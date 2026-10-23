#!/usr/bin/env node
/* Recupera, sin red, la foto que publica cada acta para cada jugador y temporada. */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

// FACYLF_RAIZ permite ejecutarlo desde /tmp dentro de un contenedor (scripts/claude/fotos-equipo.ps1).
const RAIZ = process.env.FACYLF_RAIZ ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(RAIZ, '.env')); } catch { /* se valida debajo */ }
const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const equipo = Number(arg('equipo'));
const federacion = arg('federacion', 'castilla-leon');
const slug = arg('slug');
const desde = arg('desde-temporada', '2021-22');
/*
 * Fotos de temporadas que recoge OTRA máquina (07/10/2026). Con el reparto de temporadas de CyL, las actas de
 * 2026-27, 2024-25, 2022-23… están archivadas en el servidor, no en el PC, y su foto no se puede sacar aquí.
 *   --exporta-faltantes <json>   (en el PC) apunta en un JSON los jugador/temporada cuya foto no se ha encontrado.
 *   --desde-faltantes <json>     (en el servidor) no consulta el canónico: toma esos objetivos del JSON y busca
 *   --salida <carpeta>           las actas en SU cola; deja las fotos en <carpeta> con el mismo nombre de fichero.
 * `scripts/claude/fotos-equipo.ps1` encadena los dos pasos.
 */
const exportaFaltantes = arg('exporta-faltantes');
const desdeFaltantes = arg('desde-faltantes');
const salida = arg('salida');
if (!slug || (!desdeFaltantes && !Number.isInteger(equipo))) {
  console.error('uso: node scripts/fotos-historicas-equipo.mjs --equipo <id> --slug <slug> [--federacion castilla-leon] [--exporta-faltantes <json>]\n'
    + '     node scripts/fotos-historicas-equipo.mjs --desde-faltantes <json> --slug <slug> --salida <carpeta> [--federacion castilla-leon]');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
let objetivos;
if (desdeFaltantes) {
  objetivos = JSON.parse(readFileSync(desdeFaltantes, 'utf8'));
} else {
const url = process.env.DATABASE_URL_LECTOR;
if (!url) throw new Error('Falta DATABASE_URL_LECTOR.');
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');
const pg = new Client({ connectionString: url, statement_timeout: 120_000 });
await pg.connect();
({ rows: objetivos } = await pg.query(`with personas as (
  select person_id from core.current_squad_member where team_entry_id=$1 and role='player' and person_id is not null
  union select distinct person_id from core.appearance where team_entry_id=$1
)
select distinct p.id person_id,p.nombre_mostrado nombre,psi.codigo_externo codigo,
       s.etiqueta temporada,pg.codigo_externo grupo
from personas x join core.person p on p.id=x.person_id
join core.appearance a on a.person_id=p.id
join core.team_entry te on te.id=a.team_entry_id
join core.team_season ts on ts.id=te.team_season_id
join core.season s on s.id=ts.season_id
join core.phase_group pg on pg.id=te.phase_group_id
join core.competition_edition ce on ce.id=pg.competition_edition_id
join core.federation f on f.id=ce.federation_id and f.codigo=$2
join core.person_source_identity psi on psi.person_id=p.id and psi.federation_id=f.id
where s.etiqueta >= $3 and pg.codigo_externo is not null and psi.codigo_externo is not null
order by s.etiqueta desc,p.nombre_mostrado`, [equipo, federacion, desde]));
await pg.end();
}

const carpetaCola = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const rutaCola = join(RAIZ, carpetaCola, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(rutaCola)) throw new Error(`No existe ${rutaCola}.`);
const sqlite = new DatabaseSync(rutaCola, { readOnly: true });
const grupos = [...new Set(objetivos.map((x) => String(x.grupo)))];
const actasPorGrupo = new Map(grupos.map((g) => [g, sqlite.prepare(
  `select archivo from actas where grupo=? and estado='hecha' and archivo is not null order by jornada`,
).all(g)]));
sqlite.close();

function fotosDelActa(html) {
  const fotos = new Map();
  for (const trozo of html.split(/<tr\b/i).slice(1)) {
    const fin = trozo.search(/<\/tr>/i);
    const fila = trozo.slice(0, fin < 0 ? trozo.length : fin);
    const codigo = /jugador=(\d+)/i.exec(fila)?.[1];
    const foto = /<img[^>]+src="data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)"/i.exec(fila);
    if (codigo && foto) fotos.set(codigo, Buffer.from(foto[2], 'base64'));
  }
  return fotos;
}
function extension(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) return 'png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'webp';
  return null;
}
const codigosNecesarios = new Map();
for (const o of objetivos) {
  if (!codigosNecesarios.has(String(o.grupo))) codigosNecesarios.set(String(o.grupo), new Set());
  codigosNecesarios.get(String(o.grupo)).add(String(o.codigo));
}
const catalogos = new Map();
let leidas = 0;
for (const grupo of grupos) {
  const pendientes = new Set(codigosNecesarios.get(grupo));
  const catalogo = new Map();
  for (const acta of actasPorGrupo.get(grupo) ?? []) {
    const ruta = [acta.archivo, `${acta.archivo}.gz`].find(existsSync);
    if (!ruta) continue;
    try {
      const bytes = readFileSync(ruta);
      const html = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8');
      leidas += 1;
      for (const [codigo, foto] of fotosDelActa(html)) {
        if (pendientes.has(codigo) && !catalogo.has(codigo)) catalogo.set(codigo, foto);
      }
      if ([...pendientes].every((c) => catalogo.has(c))) break;
    } catch { /* un archivo dañado no impide probar las siguientes actas */ }
  }
  catalogos.set(grupo, catalogo);
}

const destino = salida ? resolve(salida) : join(RAIZ, 'informes', 'fotos');
mkdirSync(destino, { recursive: true });
let guardadas = 0;
const vistas = new Set();
for (const o of objetivos) {
  const clave = `${o.person_id}:${o.temporada}`;
  if (vistas.has(clave)) continue;
  const foto = catalogos.get(String(o.grupo))?.get(String(o.codigo));
  const ext = foto ? extension(foto) : null;
  if (!foto || !ext) continue;
  writeFileSync(join(destino, `${slug}-${o.person_id}-${o.temporada}.${ext}`), foto);
  vistas.add(clave);
  guardadas += 1;
}
// Lo que no se ha encontrado aquí (y no tiene ya foto guardada de otra pasada): para buscarlo en la otra máquina.
const faltantes = [];
const yaVistos = new Set();
for (const o of objetivos) {
  const clave = `${o.person_id}:${o.temporada}`;
  if (vistas.has(clave) || yaVistos.has(clave)) continue;
  yaVistos.add(clave);
  const yaGuardada = ['jpg', 'png', 'webp'].some((e) => existsSync(join(destino, `${slug}-${o.person_id}-${o.temporada}.${e}`)));
  if (!yaGuardada) faltantes.push(o);
}
if (exportaFaltantes) writeFileSync(exportaFaltantes, JSON.stringify(faltantes));
console.log(JSON.stringify({ equipo: equipo || null, personas: new Set(objetivos.map((x) => x.person_id)).size,
  grupos: grupos.length, actasLeidas: leidas, fotosPorTemporada: guardadas, sinFoto: faltantes.length,
  sinFotoPorTemporada: Object.fromEntries([...new Set(faltantes.map((f) => f.temporada))].map((t) => [t, faltantes.filter((f) => f.temporada === t).length])) }, null, 2));
