#!/usr/bin/env node
/*
 * calendario-desde-html.mjs — llena `core.calendario_previsto` (0067) con el calendario completo de cada
 * grupo, leído de la página de calendario que el recolector YA tiene archivada.
 *
 * NO pide nada al portal. Lee `descargas-<federación>/recolector-local/t<cod>-<temporada>/comp-<c>/
 * grupo-<g>/calendario.html(.gz)` del disco. Si un grupo no tiene ese fichero, se cuenta y se sigue.
 *
 * Tres barreras antes de escribir un grupo (si falla una, ese grupo no se toca y sale en el resumen):
 *   1. la lectura no declara problemas (`scripts/lib/calendario-html.mjs`);
 *   2. el recuento de cruces coincide con el del extractor del recolector (`extraePartidos`) sobre la
 *      misma página: son dos lecturas independientes del mismo HTML;
 *   3. el grupo y TODOS sus equipos existen en el canónico (por código de la federación, nunca por nombre).
 *
 * Idempotente: si la huella de la página es la que ya está guardada, el grupo no se reescribe.
 *
 * Uso:
 *   node scripts/calendario-desde-html.mjs --seco --limite 20
 *   node scripts/calendario-desde-html.mjs --seco
 *   node scripts/calendario-desde-html.mjs
 *   node scripts/calendario-desde-html.mjs --federacion castilla-leon --temporada 2026-27
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { calendarioDeHtml, totalDeCruces } from './lib/calendario-html.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valor = (bandera, porDefecto) => {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : porDefecto;
};
const FEDERACION = valor('--federacion', 'castilla-leon');
const TEMPORADA = valor('--temporada', '2026-27');
const LIMITE = Number(valor('--limite', '0')) || 0;
const SECO = args.includes('--seco');

if (!/^[a-z-]+$/.test(FEDERACION) || !/^\d{4}-\d{2}$/.test(TEMPORADA)) {
  console.error('Uso: --federacion <codigo> --temporada <aaaa-aa>');
  process.exit(2);
}

const carpetaFederacion = join(RAIZ, FEDERACION === 'castilla-leon' ? 'descargas-federacion' : `descargas-${FEDERACION}`, 'recolector-local');
const listar = (dir) => { try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; } };

/** Todas las carpetas `grupo-*` de la temporada, con su competición. */
function gruposArchivados() {
  const salida = [];
  for (const t of listar(carpetaFederacion)) {
    if (!t.isDirectory() || !t.name.endsWith(`-${TEMPORADA}`)) continue;
    for (const c of listar(join(carpetaFederacion, t.name))) {
      const competicion = /^comp-(.+)$/.exec(c.name)?.[1];
      if (!c.isDirectory() || !competicion) continue;
      for (const g of listar(join(carpetaFederacion, t.name, c.name))) {
        const grupo = /^grupo-(.+)$/.exec(g.name)?.[1];
        if (!g.isDirectory() || !grupo) continue;
        salida.push({ competicion, grupo, carpeta: join(carpetaFederacion, t.name, c.name, g.name) });
      }
    }
  }
  return salida;
}

function leeCalendario(carpeta) {
  const comprimido = join(carpeta, 'calendario.html.gz');
  const plano = join(carpeta, 'calendario.html');
  if (existsSync(comprimido)) return gunzipSync(readFileSync(comprimido)).toString('utf8');
  if (existsSync(plano)) return readFileSync(plano, 'utf8');
  return null;
}

try { process.loadEnvFile(join(RAIZ, '.env')); } catch { /* el entorno puede traerla */ }
const url = process.env.DATABASE_URL_MIGRACION ?? process.env.DATABASE_URL_PUBLICADOR;
if (!url) {
  console.error('Falta DATABASE_URL_MIGRACION o DATABASE_URL_PUBLICADOR (en .env).');
  process.exit(2);
}

const archivados = gruposArchivados();
if (archivados.length === 0) {
  console.error(`No hay carpetas de grupo de ${TEMPORADA} en ${carpetaFederacion}.`);
  process.exit(1);
}
const lista = LIMITE > 0 ? archivados.slice(0, LIMITE) : archivados;
console.log(`grupos archivados de ${TEMPORADA}: ${archivados.length}${LIMITE > 0 ? ` (se miran ${lista.length})` : ''}`);

// El extractor del recolector es la segunda lectura. Se carga aquí y no arriba para que un fallo al
// cargarlo se diga con claridad en vez de tumbar el guion con un error de importación.
let extraePartidos;
try {
  ({ extraePartidos } = await import('./lib/recolector-local.mjs'));
} catch (error) {
  console.error(`No se pudo cargar el extractor del recolector para contrastar: ${error.message}`);
  process.exit(2);
}

const requerir = createRequire(resolve(RAIZ, 'packages/canonico/package.json'));
const { Client } = requerir('pg');
const c = new Client({ connectionString: url, statement_timeout: 600000, application_name: 'calendario-desde-html' });
await c.connect();

const cuenta = {
  escritos: 0, sinCambios: 0, sinFichero: 0, lecturaDudosa: 0, noCuadra: 0,
  sinGrupo: 0, sinEquipo: 0, cruces: 0, futuros: 0,
};
const ejemplos = { lecturaDudosa: [], noCuadra: [], sinGrupo: [], sinEquipo: [] };
const anota = (clave, texto) => { cuenta[clave] += 1; if (ejemplos[clave].length < 8) ejemplos[clave].push(texto); };

try {
  const grupos = await c.query(`
    select pg.id::text id, pg.codigo_externo grupo, ce.codigo_externo competicion
      from core.phase_group pg
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.season s on s.id = ce.season_id
      join core.federation f on f.id = ce.federation_id
     where f.codigo = $1 and s.etiqueta = $2`, [FEDERACION, TEMPORADA]);
  const grupoDe = new Map(grupos.rows.map((g) => [`${g.competicion}/${g.grupo}`, g.id]));

  const equipos = await c.query(`
    select te.phase_group_id::text g, te.codigo_externo codigo, te.id::text id
      from core.team_entry te
     where te.phase_group_id = any($1::bigint[]) and te.codigo_externo is not null`,
  [grupos.rows.map((g) => g.id)]);
  const equipoDe = new Map(equipos.rows.map((e) => [`${e.g}/${e.codigo}`, e.id]));

  const huellas = await c.query(`
    select phase_group_id::text g, min(sha256) sha, count(distinct sha256)::int distintas
      from core.calendario_previsto where phase_group_id = any($1::bigint[]) group by 1`,
  [grupos.rows.map((g) => g.id)]);
  const huellaDe = new Map(huellas.rows.filter((h) => h.distintas === 1).map((h) => [h.g, h.sha]));

  const hoy = new Date().toISOString().slice(0, 10);
  for (const archivo of lista) {
    const etiqueta = `comp-${archivo.competicion}/grupo-${archivo.grupo}`;
    const html = leeCalendario(archivo.carpeta);
    if (html === null) { cuenta.sinFichero += 1; continue; }

    const calendario = calendarioDeHtml(html);
    if (calendario.problemas.length > 0) { anota('lecturaDudosa', `${etiqueta}: ${calendario.problemas[0]}`); continue; }
    const total = totalDeCruces(calendario);
    const contraste = extraePartidos(html).length;
    if (contraste !== total) { anota('noCuadra', `${etiqueta}: ${total} cruces aquí, ${contraste} en el extractor del recolector`); continue; }

    const grupoId = grupoDe.get(`${archivo.competicion}/${archivo.grupo}`);
    if (grupoId === undefined) { anota('sinGrupo', etiqueta); continue; }

    const filas = [];
    let falta = null;
    for (const jornada of calendario.jornadas) {
      for (const p of jornada.partidos) {
        const local = equipoDe.get(`${grupoId}/${p.codLocal}`);
        const visitante = equipoDe.get(`${grupoId}/${p.codVisitante}`);
        if (local === undefined || visitante === undefined) {
          falta = `${local === undefined ? p.local : p.visitante} (código ${local === undefined ? p.codLocal : p.codVisitante})`;
          break;
        }
        filas.push({ jornada: jornada.numero, orden: p.orden, local, visitante, fecha: jornada.fecha });
      }
      if (falta !== null) break;
    }
    if (falta !== null) { anota('sinEquipo', `${etiqueta}: ${falta}`); continue; }

    cuenta.cruces += filas.length;
    cuenta.futuros += filas.filter((f) => f.fecha !== null && f.fecha >= hoy).length;
    const sha = createHash('sha256').update(html).digest('hex');
    if (huellaDe.get(grupoId) === sha) { cuenta.sinCambios += 1; continue; }
    if (SECO) { cuenta.escritos += 1; continue; }

    await c.query('begin');
    try {
      await c.query('delete from core.calendario_previsto where phase_group_id = $1', [grupoId]);
      for (let i = 0; i < filas.length; i += 400) {
        const lote = filas.slice(i, i + 400);
        const valores = [];
        const params = [];
        lote.forEach((f, j) => {
          const b = j * 7;
          valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
          params.push(grupoId, f.jornada, f.orden, f.local, f.visitante, f.fecha, sha);
        });
        await c.query(`insert into core.calendario_previsto
          (phase_group_id, jornada, orden, home_team_entry_id, away_team_entry_id, fecha_prevista, sha256)
          values ${valores.join(',')}`, params);
      }
      await c.query('commit');
      cuenta.escritos += 1;
    } catch (error) {
      await c.query('rollback');
      throw error;
    }
  }

  console.log(`${SECO ? 'seco: se escribirían' : 'escritos'} ${cuenta.escritos} grupos · sin cambios ${cuenta.sinCambios} · `
    + `cruces leídos ${cuenta.cruces} (${cuenta.futuros} con fecha de hoy en adelante)`);
  console.log(`no escritos → sin calendario archivado ${cuenta.sinFichero} · lectura dudosa ${cuenta.lecturaDudosa} · `
    + `no cuadra con el recolector ${cuenta.noCuadra} · grupo que no está en el canónico ${cuenta.sinGrupo} · `
    + `equipo que no está en el canónico ${cuenta.sinEquipo}`);
  for (const [clave, textos] of Object.entries(ejemplos)) {
    for (const t of textos) console.log(`  ${clave}: ${t}`);
  }
  if (!SECO) {
    const control = await c.query(`
      select count(*)::int cruces, count(distinct phase_group_id)::int grupos,
             (select count(*)::int from core.calendario_pendiente p
               where p.phase_group_id = any($1::bigint[])) pendientes
        from core.calendario_previsto where phase_group_id = any($1::bigint[])`,
    [grupos.rows.map((g) => g.id)]);
    console.log('control:', control.rows[0]);
  }
} finally {
  await c.end();
}
