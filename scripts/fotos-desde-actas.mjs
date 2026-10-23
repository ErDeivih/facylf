#!/usr/bin/env node
/*
 * SACA LA FOTO DE CADA JUGADOR DE LAS ACTAS ARCHIVADAS Y LA DEJA PUESTA PARA EL INFORME.
 *
 * Lo dijo el entrenador y tenía razón: la foto **no está en la ficha del jugador** —ahí el hueco sale vacío—,
 * está en el **acta**, en la fila de cada jugador, incrustada en la propia página como imagen en base64. En el
 * acta del juvenil del Ciudad Rodrigo hay **37 fotos de jugador**, y la ficha no tiene ninguna.
 *
 * Esto no pide nada a la red: el recolector ya guardó el HTML de cada acta en la carpeta del grupo, dentro de
 * `descargas-<federación>/recolector-local/t<temp>/comp-<c>/grupo-<g>/`, con el nombre
 * `acta-<código>.html.gz`, así que se lee de ahí.
 *
 * Cada foto se guarda como `informes/fotos/<slug>-<person_id>.<ext>`, que es el nombre que el informe busca
 * solo. El emparejamiento se hace **por código federativo**, no por nombre: el acta trae `jugador=<código>` en
 * su `onclick` y el canónico sabe qué persona es ese código en esa federación. Emparejar por nombre juntaría a
 * dos chavales que se llaman igual.
 *
 *   node scripts/fotos-desde-actas.mjs --federacion castilla-leon --grupo 24218968 --slug ciudad-rodrigo-juvenil-2026-27
 *   node scripts/fotos-desde-actas.mjs --federacion castilla-leon --grupo 24218968 --slug … --personas 8873
 *
 * `--personas <team_entry_id>` limita a los jugadores de ese equipo: se usa para no guardar la foto de los
 * rivales, que también salen en el acta.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* sin .env no se puede emparejar */ }
}
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const federacion = arg('federacion');
const grupo = arg('grupo');
const slug = arg('slug');
const equipo = arg('personas') ? Number(arg('personas')) : null;

if (!federacion || !grupo || !slug) {
  console.error('uso: node scripts/fotos-desde-actas.mjs --federacion <fed> --grupo <código> --slug <slug> [--personas <team_entry_id>]');
  process.exit(2);
}

const carpetaCola = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const rutaCola = join(RAIZ, carpetaCola, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(rutaCola)) { console.error(`No hay cola en ${rutaCola}`); process.exit(1); }

/*
 * ── LAS FOTOS DE UN ACTA ────────────────────────────────────────────────────────────────────────────────
 *
 * Cada jugador va en una `<tr>` cuyo `onclick` lleva `jugador=<código>`, con la foto incrustada
 * (`<img src="data:image/png;base64,…">`) y el nombre en la celda de al lado. Se parte el HTML por filas y se
 * mira sólo las que tienen código de jugador.
 */
function fotosDelActa(html) {
  const salida = new Map();
  for (const trozo of html.split(/<tr\b/i).slice(1)) {
    const fila = trozo.slice(0, trozo.search(/<\/tr>/i) === -1 ? trozo.length : trozo.search(/<\/tr>/i));
    // El enlace viene como `NFG_EstadisticasJugador?cod_primaria=…&amp;jugador=9124014&amp;codacta=…`: ojo con
    // exigir `?` o `&` delante de `jugador=`, que delante va el `&amp;` y no coincide.
    const codigo = /jugador=(\d+)/i.exec(fila)?.[1];
    if (!codigo) continue;
    const foto = /<img[^>]+src="data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)"/i.exec(fila);
    if (!foto) continue;                       // sin imagen incrustada: la fuente pone el retrato genérico
    // El nombre: la primera celda que parece un nombre de persona (MAYÚSCULAS con coma).
    const celdas = [...fila.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    const nombre = celdas.find((c) => /^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ ,.'\-]{5,}$/.test(c) && c.includes(','));
    salida.set(codigo, {
      codigo,
      nombre: nombre ?? null,
      mime: foto[1].toLowerCase(),
      bytes: Buffer.from(foto[2], 'base64'),
    });
  }
  return salida;
}

/**
 * La extensión se saca de los BYTES, no de lo que declare la página.
 *
 * Medido el 24/09/2026: el acta incrusta estas fotos como `data:image/png;base64,…` y por dentro son **JPEG**
 * (empiezan por `FF D8 FF`). Fiarse del `mime` escribía ficheros `.png` que eran JPEG.
 */
function extensionReal(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) return 'png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'webp';
  return null;   // formato que no se reconoce: mejor no guardarlo con una extensión inventada
}

const db = new DatabaseSync(rutaCola, { readOnly: true });
const actas = db.prepare(`select codigo, jornada, archivo from actas
   where grupo = ? and estado = 'hecha' and archivo is not null order by jornada`).all(grupo);
db.close();
console.log(`actas del grupo ${grupo}: ${actas.length}`);

const catalogo = new Map();
let leidas = 0;
for (const acta of actas) {
  // La ruta guardada apunta al `.html`, y el fichero está comprimido: `.html.gz`.
  const candidatas = [acta.archivo, `${acta.archivo}.gz`];
  const ruta = candidatas.find((c) => existsSync(c));
  if (!ruta) continue;
  let html;
  try {
    const bytes = readFileSync(ruta);
    html = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8');
  } catch { continue; }
  leidas += 1;
  for (const [codigo, foto] of fotosDelActa(html)) {
    // La primera acta que trae la foto de un jugador manda: son la misma imagen.
    if (!catalogo.has(codigo)) catalogo.set(codigo, foto);
  }
}
console.log(`actas leídas: ${leidas} · jugadores con foto incrustada: ${catalogo.size}`);

/* ── Emparejar con el canónico POR CÓDIGO FEDERATIVO ─────────────────────────────────────────────────── */
const url = (process.env.DATABASE_URL_LECTOR ?? '').trim();
if (url === '') { console.error('Falta DATABASE_URL_LECTOR: sin él no se puede saber qué persona es cada código.'); process.exit(1); }
const cliente = new Client({ connectionString: url, statement_timeout: 120_000 });
await cliente.connect();
let filas;
if (equipo !== null) {
  ({
    rows: filas,
  } = await cliente.query(
    `select distinct p.id as person_id, p.nombre_mostrado as nombre, psi.codigo_externo as codigo
       from core.appearance a
       join core.person p on p.id = a.person_id
       join core.person_source_identity psi on psi.person_id = p.id
       join core.federation f on f.id = psi.federation_id
      where a.team_entry_id = $1 and f.codigo = $2`,
    [equipo, federacion],
  ));
} else {
  ({
    rows: filas,
  } = await cliente.query(
    `select distinct p.id as person_id, p.nombre_mostrado as nombre, psi.codigo_externo as codigo
       from core.person_source_identity psi
       join core.person p on p.id = psi.person_id
       join core.federation f on f.id = psi.federation_id
      where f.codigo = $1 and psi.codigo_externo = any($2)`,
    [federacion, [...catalogo.keys()]],
  ));
}
await cliente.end();

const destino = join(RAIZ, 'informes', 'fotos');
mkdirSync(destino, { recursive: true });
let guardadas = 0;
const sinPersona = [];
const conPersona = new Set();
for (const fila of filas) {
  const foto = catalogo.get(String(fila.codigo));
  if (!foto) continue;
  conPersona.add(String(fila.codigo));
  const ext = extensionReal(foto.bytes);
  if (ext === null) continue;      // una imagen que no se reconoce no se guarda con extensión inventada
  writeFileSync(join(destino, `${slug}-${fila.person_id}.${ext}`), foto.bytes);
  guardadas += 1;
  console.log(`  ✓ ${fila.nombre} → ${slug}-${fila.person_id}.${ext} (${Math.round(foto.bytes.length / 1024)} KB)`);
}
for (const codigo of catalogo.keys()) {
  if (!conPersona.has(codigo)) sinPersona.push(codigo);
}
console.log(`\nfotos guardadas: ${guardadas} en informes/fotos/`);
if (sinPersona.length > 0) {
  console.log(`  ${sinPersona.length} códigos del acta no son de esta plantilla (rivales, cuerpo técnico…) y no se han guardado`);
}
if (guardadas === 0) {
  console.log('  (ninguna: ¿es el grupo correcto? ¿están las actas descargadas?)');
} else {
  console.log('  el informe las coge al regenerarlo: `pnpm informe:juvenil`');
}
