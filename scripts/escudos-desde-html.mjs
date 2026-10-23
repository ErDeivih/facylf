#!/usr/bin/env node
/*
 * Recupera escudos desde HTML YA archivado por los recolectores. No vuelve a pedir calendarios ni
 * jornadas: localiza la pareja Codigo_Equipo + <img>, resuelve el club canónico y descarga cada imagen
 * desconocida una sola vez, en serie y con pausa. Así puede ejecutarse al cerrar una tanda de ingesta.
 *
 *   node scripts/escudos-desde-html.mjs --federacion castilla-leon --grupo 24218968
 *   node scripts/escudos-desde-html.mjs --federacion castilla-leon --grupo 24218968 --seco
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(RAIZ, '.env')); } catch { /* comprobado debajo */ }
const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const federacion = arg('federacion');
const grupo = arg('grupo');
const seco = argv.includes('--seco');
const esperaMs = Math.max(500, Number(arg('espera-ms', 1500)));
if (!federacion || !grupo) {
  console.error('uso: node scripts/escudos-desde-html.mjs --federacion <codigo> --grupo <codigo> [--seco]');
  process.exit(2);
}

const carpetaFed = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const base = join(RAIZ, carpetaFed, 'recolector-local');
const archivos = [];
function recorre(carpeta, dentroDelGrupo = carpeta.includes(`grupo-${grupo}`)) {
  for (const e of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) {
      if (dentroDelGrupo || e.name.includes(`grupo-${grupo}`) || !/grupo-/.test(ruta)) {
        recorre(ruta, dentroDelGrupo || e.name.includes(`grupo-${grupo}`));
      }
    } else if (/\.(?:html|html\.gz)$/i.test(e.name) && ruta.includes(`grupo-${grupo}`)) archivos.push(ruta);
  }
}
if (!existsSync(base)) throw new Error(`No existe ${base}`);
recorre(base);

const ORIGENES = {
  'castilla-leon': 'https://www.rfcylf.es', navarra: 'https://www.futnavarra.es',
  euskadi: 'https://www.euskadifutbol.eus', 'castilla-la-mancha': 'https://www.ffcm.es',
  andalucia: 'https://www.rfaf.es', murcia: 'https://www.ffrm.es',
  canarias: 'https://www.federacioncanariafutbol.es', ceuta: 'https://www.rffce.es',
  aragon: 'https://www.futbolaragon.com', cantabria: 'https://www.rfcf.es',
  galicia: 'https://www.futgal.es', extremadura: 'https://www.fexfutbol.com',
};
export function extraeEscudos(html, origen = ORIGENES[federacion]) {
  const encontrados = new Map();
  for (const bloque of html.split(/class=["'][^"']*wrapper_widget/i).slice(1)) {
    const trozo = bloque.slice(0, 2200);
    const codigo = /Codigo_Equipo=(\d+)/i.exec(trozo)?.[1];
    const src = /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(trozo)?.[1]?.replace(/&amp;/g, '&');
    if (!codigo || !src) continue;
    let url;
    try { url = new URL(src, origen).href; } catch { continue; }
    if (/escudo_sm_resultados_|\/x\.png(?:\?|$)|sin[-_ ]escudo|default/i.test(url)) continue;
    if (!encontrados.has(codigo)) encontrados.set(codigo, url);
  }
  return encontrados;
}

const candidatos = new Map();
for (const ruta of archivos) {
  const bytes = readFileSync(ruta);
  const html = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8');
  for (const [codigo, url] of extraeEscudos(html)) if (!candidatos.has(codigo)) candidatos.set(codigo, url);
}
console.log(`HTML: ${archivos.length} · equipos con escudo: ${candidatos.size}`);
if (seco || candidatos.size === 0) {
  console.log(JSON.stringify([...candidatos].slice(0, 25).map(([codigo, url]) => ({ codigo, url })), null, 2));
  process.exit(0);
}

const dbUrl = process.env.DATABASE_URL_PUBLICADOR;
if (!dbUrl) throw new Error('Falta DATABASE_URL_PUBLICADOR en .env.');
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');
const db = new Client({ connectionString: dbUrl, application_name: 'facylf-escudos-html' });
await db.connect();
const filas = await db.query(`select distinct te.codigo_externo as codigo, cl.id as club_id, cl.nombre_canonico
  from core.team_entry te
  join core.team_season ts on ts.id=te.team_season_id
  join core.club cl on cl.id=ts.club_id
  join core.federation f on f.id=cl.federation_id
  where f.codigo=$1 and te.codigo_externo=any($2)`, [federacion, [...candidatos.keys()]]);
const vigentes = await db.query(`select club_id, fuente_url from core.club_asset where tipo='escudo' and vigente`);
const urlVigente = new Map(vigentes.rows.map((x) => [String(x.club_id), x.fuente_url]));
let guardados = 0;
let yaEstaban = 0;
for (const fila of filas.rows) {
  const fuenteUrl = candidatos.get(fila.codigo);
  if (urlVigente.get(String(fila.club_id)) === fuenteUrl) {
    yaEstaban += 1;
    continue;
  }
  try {
    const respuesta = await fetch(fuenteUrl, { headers: { 'user-agent': 'FACyLF archivo personal de escudos/1.0' }, signal: AbortSignal.timeout(20_000) });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const contenido = Buffer.from(await respuesta.arrayBuffer());
    if (contenido.length < 200 || contenido.length > 2_000_000) throw new Error(`tamaño no admitido: ${contenido.length}`);
    const tipo = respuesta.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    const mime = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(tipo) ? tipo : null;
    if (!mime) throw new Error(`tipo no admitido: ${tipo ?? 'desconocido'}`);
    const sha = createHash('sha256').update(contenido).digest('hex');
    await db.query('begin');
    await db.query(`update core.club_asset set vigente=false where club_id=$1 and tipo='escudo' and vigente and sha256<>$2`, [fila.club_id, sha]);
    await db.query(`insert into core.club_asset(club_id,tipo,mime_type,sha256,contenido,fuente_url,fuente_descripcion,vigente)
      values($1,'escudo',$2,$3,$4,$5,'extraído de HTML archivado por el recolector',true)
      on conflict(club_id,tipo,sha256) do update set fuente_url=excluded.fuente_url, observado_en=now(), vigente=true`,
    [fila.club_id, mime, sha, contenido, fuenteUrl]);
    await db.query('commit');
    guardados += 1;
    console.log(`  ✓ ${fila.nombre_canonico}`);
  } catch (error) {
    await db.query('rollback').catch(() => {});
    console.warn(`  ! ${fila.nombre_canonico}: ${error.message}`);
  }
  await new Promise((r) => setTimeout(r, esperaMs));
}
await db.end();
console.log(`Escudos guardados o actualizados: ${guardados} · ya vigentes: ${yaEstaban}`);
