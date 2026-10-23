// RENDIMIENTO de todas las consultas de la web sobre la base de volumen (pruebas/sql/volumen.mjs).
//   node --experimental-strip-types pruebas/sql/rendimiento.mjs [carpeta] [filtro]
// Para cada consulta: tiempo (mediana de 3, tras calentar), presupuesto, y los recorridos completos
// (Seq Scan) sobre tablas grandes. PGlite es más lento que PostgreSQL nativo (≈ ×2-4): el tiempo sirve
// para comparar consultas entre sí; los Seq Scan sobre tablas grandes son un fallo en cualquier caso.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = process.argv[2] ?? '/tmp/facylf-volumen';
const FILTRO = process.argv[3] ?? '';
const db = new PGlite({ dataDir: DIR, extensions: { pg_trgm, unaccent } });
const q = async (s, p) => (await db.query(s, p)).rows;

// Copia los .ts de consultas sin el import de federaciones excluidas (aquí no se excluye ninguna).
const TMP = join(tmpdir(), 'facylf-consultas'); mkdirSync(TMP, { recursive: true });
const carpeta = join(RAIZ, 'apps', 'web', 'src', 'consultas');
const modulos = {};
for (const f of readdirSync(carpeta).filter((f) => f.endsWith('.ts') && f !== 'contratos.ts')) {
  const src = readFileSync(join(carpeta, f), 'utf8')
    .replace(/^import type .*$/m, '')
    .replace(/^import \{ SQL_FEDERACION_NO_EXCLUIDA \} from .*$/m, "const SQL_FEDERACION_NO_EXCLUIDA = 'true';");
  writeFileSync(join(TMP, f), src);
  modulos[f] = await import(pathToFileURL(join(TMP, f)).href);
}

// Identificadores de la base de volumen equivalentes a los ejemplos reales de cada fichero.
const uno = async (s) => Object.values((await q(s))[0] ?? {})[0];
const club = await uno(`select club_id from core.team_season group by club_id order by count(*) desc limit 1`);
const equipo = await uno(`select te.id from core.team_entry te join core.team_season ts on ts.id = te.team_season_id
  join core.phase_group pg on pg.id = te.phase_group_id join core.competition_edition ce on ce.id = pg.competition_edition_id
  where ts.club_id = ${club} and ce.season_id = 2 order by te.id limit 1`);
const persona = await uno(`select person_id from analytics.jugador_temporada group by person_id having count(*) = 2 order by person_id limit 1`);
const persona2 = await uno(`select person_id from analytics.jugador_temporada group by person_id having count(*) = 2 order by person_id offset 1 limit 1`);
const edicion = await uno(`select ce.id from core.competition_edition ce where ce.season_id = 1 and ce.categoria = 'juvenil' order by id limit 1`);
const grupo = await uno(`select id from core.phase_group where competition_edition_id = ${edicion} limit 1`);
const ediCod = await uno(`select codigo_externo from core.competition_edition where id = ${edicion}`);
const arbitro = await uno(`select arbitro_id from analytics.arbitro_temporada limit 1`);
console.log({ club, equipo, persona, edicion, grupo, arbitro });
await q(`insert into app.usuario (user_id, rol) values ('admin','administrador') on conflict do nothing`);
const sobre = {
  'club-por-id': [club], 'equipos-del-club': [club, null, 80], 'equipo-por-id': [equipo], 'plantilla-del-equipo': [equipo, 200],
  'partidos-del-equipo': [equipo, 80, 0], 'persona-por-id': [persona], 'trayectoria-de-persona': [persona, 80],
  'busqueda-por-nombre': ['jugador 1-1', null, null, null, 50], 'partidos-del-canónico': ['f1', '2025-26', null, 80, 0],
  'grupo-por-codigos-externos': [ediCod, 'G1'], 'trayectoria-unificada': [persona, 80], 'candidatos-de-identidad': [persona, 20],
  'ojeo-jugadores': ['f1', '2025-26', 2007, 2009, null, null, 270, null, null, null, null, 50, false],
  'ojeo-jugadores@nacional': [null, '2025-26', null, null, null, null, 0, null, null, null, null, 50, false],
  'minutos-por-equipo': [persona], 'sanciones-inferidas': [edicion, null, 50, false], 'arbitros': [null, edicion, 50],
  'uso-de-cantera': [edicion, 40], 'evolucion-del-club': [club, 200], 'zonas-del-grupo': [grupo], 'curva-del-equipo': [equipo, 60],
  'goles-por-tramo': [equipo], 'comparador-jugadores': [[persona, persona2]],
  'ranking-goleadores': [null, '2025-26', 'juvenil', null, null, 3, 50],
  'partidos-de-grupo': ['f1', 'G1', 400], 'goles-de-partidos': ['f1', 'G1', 2000], 'grupo-del-canónico': ['f1', 'G1'],
  'clasificación-del-grupo': ['f1', 'G1'],
  'avisos-de-datos': ['f3', edicion], 'ficha-federacion': [null], 'estado-secciones': [edicion, null], 'estado-secciones-equipo': [equipo],
  'forma-del-equipo': [equipo, 5], 'reparto-de-goles': [equipo, false, 30], 'rachas-del-grupo': [grupo],
};
const GRANDES = new Set(['match', 'appearance', 'match_event', 'match_official', 'match_report', 'match_source', 'match_staff', 'person',
  'person_name', 'person_source_identity', 'player_team_season_summary', 'jugador_temporada', 'search_entity', 'persona_tramo',
  'persona_perfil', 'persona_grupo', 'player_career_summary', 'sancion_inferida', 'notificacion', 'favorito', 'team_entry', 'team_season']);
const recorre = (n, acc = []) => { if (!n) return acc; if (n['Node Type'] === 'Seq Scan') acc.push(`${n['Relation Name']}(${n['Actual Rows'] ?? '?'})`); for (const h of n.Plans ?? []) recorre(h, acc); return acc; };

const filas = [];
for (const [fichero, m] of Object.entries(modulos)) {
  const lista = Object.entries(m).find(([k]) => k.startsWith('CONSULTAS_'))?.[1] ?? [];
  const params = Object.entries(m).find(([k]) => k.startsWith('PARAMETROS_'))?.[1] ?? {};
  const variantes = lista.flatMap((c) => sobre[c.nombre + '@nacional'] ? [c, { ...c, nombre: c.nombre + '@nacional' }] : [c]);
  for (const c of variantes) {
    if (FILTRO && !c.nombre.includes(FILTRO)) continue;
    const p = sobre[c.nombre] ?? params[c.nombre] ?? [];
    try {
      await q(c.sql, p);
      const t = [];
      for (let i = 0; i < 3; i++) { const a = performance.now(); await q(c.sql, p); t.push(performance.now() - a); }
      const ms = t.sort((a, b) => a - b)[1];
      const [{ 'QUERY PLAN': plan }] = await q(`explain (analyze, format json) ${c.sql}`, p);
      const seq = recorre(plan[0].Plan).filter((s) => GRANDES.has(s.split('(')[0]));
      const n = (await q(c.sql, p)).length;
      // ¿Hay camino por índice? Con seqscan desactivado, un Seq Scan que sigue ahí es un índice que falta.
      let sinIndice = '';
      if (seq.length) {
        await q('set enable_seqscan = off');
        const [{ 'QUERY PLAN': p2 }] = await q(`explain (format json) ${c.sql}`, p);
        await q('set enable_seqscan = on');
        sinIndice = recorre(p2[0].Plan).filter((s) => GRANDES.has(s.split('(')[0])).map((s) => s.split('(')[0]).join(' ');
      }
      filas.push({ fichero, consulta: c.nombre, plan: c.plan, pres: c.presupuestoMs, ms: Math.round(ms), filas: n,
        estado: sinIndice && c.plan === 'indexado' ? 'SIN_INDICE' : ms > c.presupuestoMs ? 'LENTA' : 'ok', seq: seq.join(' '), sin_indice: sinIndice });
    } catch (e) { filas.push({ fichero, consulta: c.nombre, plan: c.plan, pres: c.presupuestoMs, ms: -1, filas: 0, estado: 'ERROR', seq: e.message.slice(0, 90) }); }
  }
}
console.table(filas);
writeFileSync(join(tmpdir(), 'facylf-rendimiento.json'), JSON.stringify(filas, null, 1));
const malas = filas.filter((f) => f.estado !== 'ok');
console.log(`${filas.length} consultas · ${malas.length} a revisar (${malas.map((f) => `${f.consulta}:${f.estado}`).join(', ')})`);
// Falla (para la integración continua) sólo por lo estructural: sin índice o error. «LENTA» se avisa pero no
// falla: PGlite es más lento que PostgreSQL nativo y el presupuesto se mide en la base real (planes.mjs).
const graves = filas.filter((f) => f.estado === 'SIN_INDICE' || f.estado === 'ERROR');
if (graves.length) { console.error(`✗ ${graves.length} consultas sin índice o con error`); process.exitCode = 1; }
await db.close();
