#!/usr/bin/env node
/**
 * RELLENA POSICIÓN, CAPITÁN Y SISTEMA DE JUEGO DESDE LAS ACTAS YA ARCHIVADAS (sin pedir nada a la red).
 *
 * Qué hay en los datos (medido el 21/10/2026 sobre muestras de cada federación):
 *   · Valencia (FFCV, JSON Novanet): demarcación en ~85 % de los jugadores desde 2025-26 (antes, 0 %), capitán
 *     y sistema («1-4-3-3») en ~85 % de las actas.
 *   · Madrid (RFFM, JSON Novanet): demarcación en ~10 % (2025-26 en adelante), capitán, sistema en ~80 %.
 *   · Cataluña (FCF, JSON del acta): sólo el capitán («Capità» en la columna de posición).
 *   · El resto (plataforma Fénix/pnfg): sólo el portero, que ya está en core.appearance.portero.
 * El importador NO guardaba nada de esto (participaciones no tiene columna). Este script lo recupera de
 * los JSON crudos que el recolector guardó en descargas-<fed>/recolector-local/…/acta-*.json(.gz).
 *
 * Emparejamiento (nunca por nombre): acta → core.match_source (federación + código de acta); jugador →
 * core.person_source_identity (federación + código federativo `codjugador`); aparición → (partido, persona).
 * Si algo no empareja, se cuenta y se sigue (sale en el informe final).
 *
 * Uso (desde la raíz del repo, en el PC donde están las colas):
 *   node scripts/rellena-posiciones.mjs --federacion valencia                 SÓLO CUENTA (por defecto)
 *   node scripts/rellena-posiciones.mjs --federacion valencia --aplicar [--temporada 2025-26] [--limite 5000]
 * Necesita Node ≥ 22.13 (node:sqlite) y DATABASE_URL_PUBLICADOR. La cola se abre en sólo lectura.
 * Después: `pnpm lectura:proyectar` NO lo detecta solo (no cambia la cobertura): lanza
 * `node scripts/proyectar-lectura.mjs --temporadas-todo` o reproyecta esa federación con --federacion
 * tras subir analytics.version_metricas (ya lo hace la 0029 la primera vez).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

try { process.loadEnvFile('.env'); } catch { /* entorno externo */ }
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { console.error('✗ Hace falta Node ≥ 22.13 (node:sqlite).'); process.exit(2); }

const args = process.argv.slice(2);
const valor = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const fed = valor('--federacion', null);
const temporada = valor('--temporada', null);
const limite = Number(valor('--limite', 0)) || Infinity;
const aplicar = args.includes('--aplicar');
// Código de federación en core.federation para cada carpeta descargas-<x>.
const CODIGO = { valencia: 'valencia', madrid: 'madrid', cataluna: 'cataluna' };
if (!fed || !CODIGO[fed]) { console.error('Uso: --federacion valencia|madrid|cataluna [--aplicar] [--temporada AAAA-AA] [--limite N]'); process.exit(2); }
const url = (process.env.DATABASE_URL_PUBLICADOR ?? '').trim();
if (!url || /facylf_admin/.test(url)) { console.error('✗ Falta DATABASE_URL_PUBLICADOR (y no puede ser admin).'); process.exit(2); }

const colaRuta = join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
const cola = new DatabaseSync(colaRuta, { readOnly: true });
const pg = new Client({ connectionString: url, application_name: 'rellena-posiciones' });
await pg.connect();
const { rows: [f] } = await pg.query('select id from core.federation where codigo = $1', [CODIGO[fed]]);
if (!f) { console.error(`✗ La federación ${CODIGO[fed]} no está en core.federation`); process.exit(2); }

const abrir = (ruta) => {
  // Las rutas guardadas son de Windows (F:\…); se rehacen relativas a la raíz si hace falta.
  let r = ruta;
  if (!existsSync(r)) { const i = ruta.replace(/\\/g, '/').indexOf(`descargas-${fed}/`); if (i >= 0) r = join(RAIZ, ruta.replace(/\\/g, '/').slice(i)); }
  if (!existsSync(r)) return null;
  const b = readFileSync(r);
  return JSON.parse((r.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8'));
};

/** Devuelve [{ codjugador, posicionAbrev, posicionLiteral, capitan }] y { local, visitante } de esquema. */
function extrae(d) {
  const jugadores = [], esquema = {};
  if (d?.jugadores_equipo_local || d?.jugadores_equipo_visitante) {           // Novanet (Madrid, Valencia)
    for (const [k, lado] of [['jugadores_equipo_local', 'local'], ['jugadores_equipo_visitante', 'visitante']]) {
      for (const j of d[k] ?? []) {
        jugadores.push({ lado, codigo: String(j.codjugador ?? '').trim(), abrev: j.posicion_jugador_abreviatura || null,
          literal: j.posicion || null, capitan: String(j.capitan) === '1' ? true : String(j.capitan) === '0' ? false : null });
      }
    }
    if (/^1(-[1-6]){2,5}$/.test(d.esquema_local ?? '')) esquema.local = d.esquema_local;
    if (/^1(-[1-6]){2,5}$/.test(d.esquema_visitante ?? '')) esquema.visitante = d.esquema_visitante;
  } else if (Array.isArray(d?.secciones)) {                                       // FCF: sólo capitán
    for (const s of d.secciones) {
      if (!/Alineacions|Suplents/i.test(s.titulo ?? '')) continue;
      for (const fila of s.filas ?? []) {
        // La FCF no da código de jugador en el JSON: sin código no se empareja (nunca por nombre).
        if (fila.codigo || fila.codjugador) {
          jugadores.push({ lado: null, codigo: String(fila.codigo ?? fila.codjugador), abrev: null, literal: null,
            capitan: /capit/i.test(fila.posicion ?? '') ? true : null });
        }
      }
    }
  }
  return { jugadores, esquema };
}

const filtroTemporada = temporada ? `and temporada = (select codigo from temporadas where etiqueta = ?)` : '';
const consulta = cola.prepare(`select codigo, archivo from actas where archivo is not null and archivo like '%.json%' ${filtroTemporada}`);
const filas = temporada ? consulta.all(temporada) : consulta.all();
const n = { actas: 0, sin_fichero: 0, sin_partido: 0, jugadores: 0, con_posicion: 0, con_capitan: 0, sin_persona: 0,
  sin_aparicion: 0, escritos: 0, esquemas: 0, posiciones_desconocidas: {} };

for (const fila of filas) {
  if (n.actas >= limite) break;
  n.actas++;
  const d = abrir(fila.archivo);
  if (!d) { n.sin_fichero++; continue; }
  const { jugadores, esquema } = extrae(d);
  if (jugadores.length === 0 && !esquema.local && !esquema.visitante) continue;
  const { rows: [m] } = await pg.query('select match_id from core.match_source where federation_id = $1 and codigo_acta = $2 limit 1', [f.id, String(fila.codigo)]);
  if (!m) { n.sin_partido++; continue; }
  if (aplicar) await pg.query('begin');
  try {
    for (const j of jugadores) {
      n.jugadores++;
      if (!j.codigo) { n.sin_persona++; continue; }
      if (j.abrev || j.literal) n.con_posicion++;
      if (j.capitan) n.con_capitan++;
      if (!j.abrev && !j.literal && j.capitan === null) continue;
      const { rows: aps } = await pg.query(
        `select a.id from core.appearance a
           join core.person_source_identity psi on psi.person_id = a.person_id and psi.federation_id = $2 and psi.codigo_externo = $3
          where a.match_id = $1`, [m.match_id, f.id, j.codigo]);
      if (aps.length === 0) { n.sin_aparicion++; continue; }
      const { rows: [pn] } = await pg.query('select core.posicion_normalizada($1, $2) as p', [j.abrev, j.literal]);
      if ((j.abrev || j.literal) && !pn.p) n.posiciones_desconocidas[`${j.abrev}|${j.literal}`] = (n.posiciones_desconocidas[`${j.abrev}|${j.literal}`] ?? 0) + 1;
      if (aplicar) {
        for (const a of aps) {
          await pg.query(`insert into core.appearance_detalle (appearance_id, posicion, posicion_literal, capitan) values ($1,$2,$3,$4)
            on conflict (appearance_id) do update set posicion = excluded.posicion, posicion_literal = excluded.posicion_literal,
              capitan = excluded.capitan`, [a.id, pn.p, j.literal ?? j.abrev, j.capitan]);
        }
      }
      n.escritos += aps.length;
    }
    for (const lado of ['local', 'visitante']) {
      if (!esquema[lado]) continue;
      n.esquemas++;
      if (aplicar) await pg.query(`insert into core.match_esquema (match_id, lado, esquema) values ($1,$2,$3)
        on conflict (match_id, lado) do update set esquema = excluded.esquema`, [m.match_id, lado, esquema[lado]]);
    }
    if (aplicar) await pg.query('commit');
  } catch (e) {
    if (aplicar) await pg.query('rollback').catch(() => {});
    console.error(`  ✗ acta ${fila.codigo}: ${e.message}`);
  }
  if (n.actas % 5000 === 0) console.log(`  … ${n.actas} actas`);
}
console.log(aplicar ? 'APLICADO' : 'SÓLO RECUENTO (añade --aplicar para escribir)');
console.table({ ...n, posiciones_desconocidas: Object.keys(n.posiciones_desconocidas).length });
if (Object.keys(n.posiciones_desconocidas).length) console.log('Literales sin normalizar (añádelos a core.posicion_normalizada):', n.posiciones_desconocidas);
cola.close();
await pg.end();
