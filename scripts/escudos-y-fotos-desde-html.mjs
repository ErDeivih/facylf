#!/usr/bin/env node
/*
 * ── ESCUDOS Y FOTOS DE JUGADOR DESDE EL HTML YA ARCHIVADO ──────────────────────────────────────────────
 *
 * Los dos recursos vienen DENTRO de las páginas que el recolector ya guardó:
 *
 *   · **escudos**: en el bloque de cada equipo, `Codigo_Equipo=<n>` y un `<img src="...">`. Los marcadores
 *     (`escudo_sm_resultados_`, `x.png`, `sin-escudo`, `default`) se descartan: no son escudos de club.
 *   · **fotos de jugador**: en cada fila de jugador, `NFG_EstadisticasJugador?cod_primaria=…&jugador=<n>` y
 *     un `<img class="fotojug">`. Cuando el jugador tiene foto viene **embebida en base64**
 *     (`data:image/jpeg;base64,…`); cuando no, es `retrato_licencia.jpg`, que es un marcador.
 *
 * Este programa NO pide nada al portal: lee los ficheros del disco. Y no guarda dos veces lo mismo: compara
 * la huella `sha256` con la que está vigente y sólo escribe si cambió.
 *
 * ── POR QUÉ LA FOTO VA POR (JUGADOR, TEMPORADA) ────────────────────────────────────────────────────────
 *
 * La foto de ficha de un chaval de alevín no es la misma que la de juvenil, y la federación la va
 * actualizando. `core.person_asset` guarda `season_id` y `sha256`, así que cada temporada conserva la suya
 * aunque después llegue otra; la marca `vigente` señala la última observada.
 *
 * Uso:
 *   node scripts/escudos-y-fotos-desde-html.mjs --federacion castilla-leon --seco
 *   node scripts/escudos-y-fotos-desde-html.mjs --federacion castilla-leon --limite 200
 *   node scripts/escudos-y-fotos-desde-html.mjs --federacion castilla-leon
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Las credenciales de la base viven en `.env` (nunca versionado). Sin cargarlo, el programa no encuentra
// `DATABASE_URL_PUBLICADOR` y se para después de haber leído medio disco.
try { process.loadEnvFile(join(RAIZ, '.env')); } catch { /* se comprueba al usarla */ }

/** Portales por federación, para resolver las rutas relativas de los escudos. */
const ORIGENES = {
  'castilla-leon': 'https://www.rfcylf.es',
  'castilla-la-mancha': 'https://www.ffcm.es',
  murcia: 'https://www.ffrm.es',
};

/** Quita lo que no es ni escudo ni foto: marcadores y genéricos del portal. */
const esMarcador = (url) =>
  /escudo_sm_resultados_|\/x\.png(?:\?|$)|sin[-_ ]escudo|default|retrato_licencia/i.test(url);

/**
 * Escudos de un HTML: `Map(codigoEquipo → urlAbsoluta)`.
 *
 * Se corta por el bloque del widget de equipo y se buscan sus dos datos juntos, como hace el extractor
 * original: buscar el código en todo el documento cruzaría equipos de distintos partidos.
 */
export function extraeEscudos(html, origen) {
  const encontrados = new Map();
  for (const bloque of String(html).split(/class=["'][^"']*wrapper_widget/i).slice(1)) {
    const trozo = bloque.slice(0, 2200);
    const codigo = /Codigo_Equipo=(\d+)/i.exec(trozo)?.[1];
    const src = /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(trozo)?.[1]?.replace(/&amp;/g, '&');
    if (!codigo || !src || esMarcador(src)) continue;
    try {
      encontrados.set(codigo, new URL(src, origen).href);
    } catch {
      /* una URL rota en el HTML no puede tumbar la pasada */
    }
  }
  return encontrados;
}

/** Decodifica `data:image/…;base64,…` a `{ mime, contenido }`. */
export function decodificaDataUri(uri) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(uri));
  if (!m) throw new Error('no es una imagen base64');
  return { mime: m[1].toLowerCase(), contenido: Buffer.from(m[2], 'base64') };
}

/**
 * Fotos de jugador de un HTML: `Map(codigoJugador → { mime, contenido })`.
 *
 * El código bueno es el parámetro `jugador=` (el `cod_primaria` es la licencia y no está en
 * `person_source_identity`). Se exige que la imagen esté embebida: si es una URL, es el marcador.
 */
export function extraeFotos(html) {
  const fotos = new Map();
  const texto = String(html);
  const re = /jugador=(\d+)[\s\S]{0,900}?<img\b[^>]*\bsrc=["'](data:image\/[a-z0-9.+-]+;base64,[^"']+)["']/gi;
  for (const m of texto.matchAll(re)) {
    const codigo = m[1];
    if (fotos.has(codigo)) continue;
    try {
      fotos.set(codigo, decodificaDataUri(m[2]));
    } catch {
      /* base64 corrupto: se salta esa foto, no la pasada */
    }
  }
  return fotos;
}

/** Recorre los HTML archivados de una federación. */
function archivosHtml(raiz, federacion) {
  const carpeta = join(raiz, federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`, 'recolector-local');
  const salida = [];
  const recorre = (dir) => {
    let entradas;
    try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) recorre(ruta);
      else if (/\.(?:html|html\.gz)$/i.test(e.name)) salida.push(ruta);
    }
  };
  if (existsSync(carpeta)) recorre(carpeta);
  return salida;
}

const argumentos = process.argv.slice(2);
const arg = (n, d = null) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };

async function principal() {
  const federacion = arg('federacion');
  const limite = Number(arg('limite', 0));
  const seco = argumentos.includes('--seco');
  const raiz = process.env.FACYLF_RAIZ ?? RAIZ;
  if (!federacion) {
    console.error('uso: node scripts/escudos-y-fotos-desde-html.mjs --federacion <codigo> [--limite N] [--seco]');
    process.exit(2);
  }
  const origen = ORIGENES[federacion] ?? `https://www.${federacion}.es`;

  let ficheros = archivosHtml(raiz, federacion);
  if (limite > 0) ficheros = ficheros.slice(0, limite);
  console.log(`HTML archivados de ${federacion}: ${ficheros.length}`);

  const escudos = new Map();
  const fotos = new Map(); // clave `${jugador}|${temporada}` → { mime, contenido }
  let sinTemporada = 0;
  for (const ruta of ficheros) {
    let html;
    try {
      const bytes = readFileSync(ruta);
      html = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8');
    } catch { continue; }
    for (const [codigo, url] of extraeEscudos(html, origen)) if (!escudos.has(codigo)) escudos.set(codigo, url);
    const temporada = /t\d+-(\d{4}-\d{2})/.exec(ruta)?.[1] ?? null;
    if (!temporada) sinTemporada += 1;
    for (const [jugador, foto] of extraeFotos(html)) {
      const clave = `${jugador}|${temporada ?? ''}`;
      if (!fotos.has(clave)) fotos.set(clave, { ...foto, jugador, temporada });
    }
  }
  console.log(`Escudos distintos: ${escudos.size} · fotos de jugador distintas: ${fotos.size}${sinTemporada ? ` (${sinTemporada} ficheros sin temporada en la ruta)` : ''}`);

  const url = process.env.DATABASE_URL_PUBLICADOR;
  if (!url) throw new Error('Falta DATABASE_URL_PUBLICADOR en .env.');
  const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');
  const db = new Client({ connectionString: url, application_name: 'facylf-escudos-fotos' });
  await db.connect();

  const federacionId = (await db.query('select id from core.federation where codigo=$1', [federacion])).rows[0]?.id;
  if (!federacionId) throw new Error(`federación desconocida: ${federacion}`);

  // ── ESCUDOS ─────────────────────────────────────────────────────────────────────────────────────────
  const clubes = await db.query(
    `select distinct te.codigo_externo as codigo, cl.id as club_id, cl.nombre_canonico
       from core.team_entry te
       join core.team_season ts on ts.id = te.team_season_id
       join core.club cl on cl.id = ts.club_id
      where cl.federation_id = $1 and te.codigo_externo = any($2)`,
    [federacionId, [...escudos.keys()]],
  );
  const vigentes = await db.query(
    `select club_id, fuente_url, sha256 from core.club_asset where tipo='escudo' and vigente`,
  );
  const urlVigente = new Map(vigentes.rows.map((r) => [String(r.club_id), r.fuente_url]));
  let escudosNuevos = 0;
  let escudosIguales = 0;
  let escudosFallidos = 0;
  for (const fila of clubes.rows) {
    const fuenteUrl = escudos.get(fila.codigo);
    if (urlVigente.get(String(fila.club_id)) === fuenteUrl) { escudosIguales += 1; continue; }
    if (seco) { escudosNuevos += 1; continue; }
    try {
      const respuesta = await fetch(fuenteUrl, {
        headers: { 'user-agent': 'FACyLF archivo personal de escudos/1.0' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const contenido = Buffer.from(await respuesta.arrayBuffer());
      if (contenido.length < 200 || contenido.length > 2_000_000) throw new Error(`tamaño ${contenido.length}`);
      const tipo = respuesta.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const mime = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(tipo) ? tipo : null;
      if (!mime) throw new Error(`tipo ${tipo ?? 'desconocido'}`);
      const sha = createHash('sha256').update(contenido).digest('hex');
      await db.query('begin');
      await db.query(`update core.club_asset set vigente=false where club_id=$1 and tipo='escudo' and vigente and sha256<>$2`, [fila.club_id, sha]);
      await db.query(
        `insert into core.club_asset(club_id,tipo,mime_type,sha256,contenido,fuente_url,fuente_descripcion,vigente)
         values($1,'escudo',$2,$3,$4,$5,'extraído de HTML archivado por el recolector',true)
         on conflict (club_id,tipo,sha256) do update set fuente_url=excluded.fuente_url, observado_en=now(), vigente=true`,
        [fila.club_id, mime, sha, contenido, fuenteUrl],
      );
      await db.query('commit');
      escudosNuevos += 1;
    } catch (error) {
      await db.query('rollback').catch(() => {});
      escudosFallidos += 1;
      console.log(`  ✗ escudo ${fila.nombre_canonico}: ${error.message}`);
    }
  }

  // ── FOTOS ───────────────────────────────────────────────────────────────────────────────────────────
  const personas = await db.query(
    `select distinct psi.codigo_externo as codigo, psi.person_id
       from core.person_source_identity psi
      where psi.federation_id = $1 and psi.codigo_externo = any($2)`,
    [federacionId, [...new Set([...fotos.values()].map((f) => f.jugador))]],
  );
  const personaDe = new Map(personas.rows.map((r) => [String(r.codigo), r.person_id]));
  const temporadas = await db.query('select id, etiqueta from core.season');
  const temporadaDe = new Map(temporadas.rows.map((r) => [r.etiqueta, r.id]));
  const fotosVigentes = await db.query(
    `select person_id, sha256 from core.person_asset where tipo='foto' and vigente`,
  );
  const shaVigente = new Map(fotosVigentes.rows.map((r) => [String(r.person_id), r.sha256]));

  let fotosNuevas = 0;
  let fotosDemasiadoGrandes = 0;
  let fotosIguales = 0;
  let fotosSinPersona = 0;
  for (const foto of fotos.values()) {
    const personId = personaDe.get(String(foto.jugador));
    if (!personId) { fotosSinPersona += 1; continue; }
    // La tabla admite hasta 512 KB por imagen (check de la migración 0066). Una foto mayor no puede
    // guardarse: se cuenta y se sigue, en vez de tumbar la pasada entera.
    if (foto.contenido.length < 1 || foto.contenido.length > 524288) { fotosDemasiadoGrandes += 1; continue; }
    const sha = createHash('sha256').update(foto.contenido).digest('hex');
    if (shaVigente.get(String(personId)) === sha) { fotosIguales += 1; continue; }
    if (seco) { fotosNuevas += 1; continue; }
    const seasonId = foto.temporada ? temporadaDe.get(foto.temporada) ?? null : null;
    await db.query('begin');
    await db.query(`update core.person_asset set vigente=false where person_id=$1 and tipo='foto' and vigente and sha256<>$2`, [personId, sha]);
    await db.query(
      `insert into core.person_asset(person_id,tipo,mime_type,sha256,contenido,fuente_url,season_id,vigente)
       values($1,'foto',$2,$3,$4,$5,$6,true)
       on conflict (person_id,tipo,sha256) do update set vigente=true, season_id=coalesce(excluded.season_id, core.person_asset.season_id), observado_en=now()`,
      [personId, foto.mime, sha, foto.contenido, null, seasonId],
    );
    await db.query('commit');
    fotosNuevas += 1;
  }

  // ── EQUIPOS SIN ESCUDO ─────────────────────────────────────────────────────────────────────────────
  const sinEscudo = await db.query(
    `select count(distinct cl.id) n
       from core.club cl
      where cl.federation_id = $1
        and not exists (select 1 from core.club_asset ca where ca.club_id = cl.id and ca.tipo='escudo' and ca.vigente)`,
    [federacionId],
  );

  console.log(JSON.stringify({
    federacion, ficheros: ficheros.length,
    escudos: { nuevos: escudosNuevos, iguales: escudosIguales, fallidos: escudosFallidos, clubes_en_html: clubes.rowCount },
    fotos: { nuevas: fotosNuevas, iguales: fotosIguales, sin_persona: fotosSinPersona, demasiado_grandes: fotosDemasiadoGrandes },
    clubes_sin_escudo: Number(sinEscudo.rows[0]?.n ?? 0),
    seco,
  }, null, 2));
  await db.end();
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('escudos-y-fotos-desde-html.mjs')) {
  principal().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
}
