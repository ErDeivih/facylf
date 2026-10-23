/*
 * informe-cuerpo-tecnico.mjs — el cuerpo técnico de un equipo: quién es y CÓMO TRABAJA
 *
 * ── QUÉ AÑADE AL INFORME DE EQUIPO ──────────────────────────────────────────────────────────────────────
 *
 * El informe de equipo ya dice quién es el entrenador y qué resultados ha tenido. Lo que faltaba es el
 * COMPORTAMIENTO, que es lo que sirve para preparar un partido:
 *
 *   1. QUIÉN ES, de verdad: roles normalizados (las fuentes escriben «Entrenador», «ENTRENADOR» y
 *      «entrenador» para lo mismo, y mezclan catalán y castellano), y desde cuándo está.
 *   2. SU TRAYECTORIA COMPLETA, no sólo esta temporada: todos los equipos, clubes y categorías donde ha
 *      aparecido, con su balance en cada uno. Es lo que permite ver si su desempeño se sostiene al subir de
 *      categoría o si fue cosa de un equipo bueno.
 *   3. CÓMO HACE LOS CAMBIOS: en qué minuto hace el primero, cuántos usa y en qué tramos del partido. Medido
 *      sobre los eventos `sale` del acta, que es donde están los cambios con su minuto.
 *   4. SU DISCIPLINA: tarjetas por partido de sus equipos, separando jugadores de banquillo, y con la media
 *      de su grupo al lado para poder comparar.
 *
 * ── POR QUÉ VA APARTE Y NO DENTRO DEL INFORME DE EQUIPO ─────────────────────────────────────────────────
 *
 * Porque el informe de equipo funciona y tiene 1.807 líneas: meter esto dentro es la forma más fácil de
 * romperlo sin darse cuenta. Va como pieza independiente que lee la MISMA base y escribe su propio Markdown,
 * así que se puede añadir al informe cuando esté probado.
 *
 * Lee con `DATABASE_URL_LECTOR` (sólo lectura) de la base LOCAL, que es la que alimentan los informes.
 *
 * Uso:
 *   node scripts/informe-cuerpo-tecnico.mjs --equipos 17745,9334 --titulo "Victoria C.F. — Juvenil" --slug victoria-cf-juvenil-2026-27
 */
import { createRequire } from 'node:module';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) { try { process.loadEnvFile(rutaEnv); } catch { /* sin .env no hay informe */ } }
const URL = process.env.DATABASE_URL_LECTOR;
if (!URL) throw new Error('Falta DATABASE_URL_LECTOR en .env');

const args = process.argv.slice(2);
const arg = (nombre, defecto = null) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : defecto;
};
const EQUIPOS = String(arg('equipos', '')).split(',').map((x) => Number(x.trim())).filter(Boolean);
const TITULO = arg('titulo', 'Cuerpo técnico');
const SLUG = arg('slug', 'cuerpo-tecnico');
if (!EQUIPOS.length) throw new Error('hace falta --equipos con al menos un team_entry_id');

const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const pg = requerir('pg');
const cliente = new pg.Client({ connectionString: URL });
await cliente.connect();
const q = async (sql, valores = []) => (await cliente.query(sql, valores)).rows;
const ida = `(${EQUIPOS.join(',')})`;

// ── Normalización de roles: las fuentes mezclan mayúsculas, catalán y castellano para lo mismo.
const normalizaRol = (rol) => {
  const r = String(rol ?? '').toLowerCase().replace(/\./g, '').trim();
  if (/entrenador|entrenadora|mister/.test(r)) return /2|seg|segon/.test(r) ? 'Segundo entrenador' : 'Entrenador';
  if (/delegat|del\b|delegado/.test(r)) return /camp/.test(r) ? 'Delegado de campo' : 'Delegado de equipo';
  if (/ats|fisio|medic/.test(r)) return 'Servicios médicos';
  if (/preparador|fisico/.test(r)) return 'Preparador físico';
  return rol ? String(rol).trim() : 'Sin rol';
};

// ── 1. Quién forma el cuerpo técnico de estos equipos ──────────────────────────────────────────────────
const cuerpo = await q(`
  select ms.person_id, p.nombre_mostrado as persona, ms.rol, s.etiqueta as temporada,
         count(distinct ms.match_id) as partidos
    from core.match_staff ms
    join core.match m on m.id = ms.match_id
    join core.matchday j on j.id = m.matchday_id
    join core.phase_group g on g.id = m.phase_group_id
    join core.competition_edition ce on ce.id = g.competition_edition_id
    join core.season s on s.id = ce.season_id
    left join core.person p on p.id = ms.person_id
   where ms.team_entry_id in ${ida}
   group by ms.person_id, p.nombre_mostrado, ms.rol, s.etiqueta
   order by s.etiqueta desc, partidos desc`);

/*
 * ── 2. Su trayectoria COMPLETA: todos los equipos donde ha aparecido ───────────────────────────────────
 *
 * Se busca por persona en TODA la base, no sólo en estos equipos: así se ve si viene de otro club, si
 * repite categoría o si ha subido. El balance sale de los goles del partido y del lado en que jugó ese
 * equipo, que se deduce de las alineaciones (`appearance.lado`).
 */
const personas = [...new Set(cuerpo.map((c) => c.person_id))];
const trayectoria = personas.length ? await q(`
  select ms.person_id, s.etiqueta as temporada, cl.nombre_canonico as club, ts.nombre as equipo,
         ts.categoria, count(distinct ms.match_id) as partidos,
         sum(case when (a.lado = 'local' and m.goles_local > m.goles_visitante)
                    or (a.lado = 'visitante' and m.goles_visitante > m.goles_local) then 1 else 0 end) as ganados,
         sum(case when m.goles_local = m.goles_visitante then 1 else 0 end) as empatados,
         sum(case when (a.lado = 'local' and m.goles_local < m.goles_visitante)
                    or (a.lado = 'visitante' and m.goles_visitante < m.goles_local) then 1 else 0 end) as perdidos
    from core.match_staff ms
    join core.match m on m.id = ms.match_id
    join core.team_entry te on te.id = ms.team_entry_id
    join core.team_season ts on ts.id = te.team_season_id
    join core.club cl on cl.id = ts.club_id
    join core.phase_group g on g.id = m.phase_group_id
    join core.competition_edition ce on ce.id = g.competition_edition_id
    join core.season s on s.id = ce.season_id
    left join lateral (select lado from core.appearance ap
                        where ap.match_id = m.id and ap.team_entry_id = te.id limit 1) a on true
   where ms.person_id = any($1::bigint[])
   group by ms.person_id, s.etiqueta, cl.nombre_canonico, ts.nombre, ts.categoria
   order by ms.person_id, s.etiqueta desc`, [personas]) : [];

// ── 3. Patrón de cambios: minutos de cada sustitución (eventos `sale`) ─────────────────────────────────
const cambios = await q(`
  select s.etiqueta as temporada, j.numero as jornada, e.match_id,
         min(e.minute_base) as primer_cambio,
         count(*) as cuantos,
         array_agg(e.minute_base order by e.minute_base) as minutos
    from core.match_event e
    join core.match m on m.id = e.match_id
    join core.matchday j on j.id = m.matchday_id
    join core.phase_group g on g.id = m.phase_group_id
    join core.competition_edition ce on ce.id = g.competition_edition_id
    join core.season s on s.id = ce.season_id
   where e.team_entry_id in ${ida} and e.event_type = 'sale'
   group by s.etiqueta, j.numero, e.match_id
   order by s.etiqueta desc, j.numero`);

// ── 4. Disciplina: tarjetas de sus equipos, por partido, contra la media de su grupo ───────────────────
const disciplina = await q(`
  with suyos as (
    select e.match_id, e.event_type, e.subtipo, e.sujeto_tipo, g.id as grupo
      from core.match_event e
      join core.match m on m.id = e.match_id
      join core.phase_group g on g.id = m.phase_group_id
     where e.team_entry_id in ${ida}
       and e.event_type in ('tarjeta_amarilla','tarjeta_roja')
  )
  select (select count(distinct match_id) from suyos) as partidos,
         count(*) filter (where event_type = 'tarjeta_amarilla') as amarillas,
         count(*) filter (where event_type = 'tarjeta_roja') as rojas,
         count(*) filter (where event_type = 'tarjeta_roja' and subtipo = 'doble_amarilla') as dobles,
         count(*) filter (where sujeto_tipo is not null and sujeto_tipo <> 'jugador') as de_banquillo
    from suyos`);

const grupoDisciplina = await q(`
  select count(*)::float / greatest(count(distinct e.match_id), 1) as media_por_partido
    from core.match_event e
    join core.match m on m.id = e.match_id
    join core.phase_group g on g.id = m.phase_group_id
   where g.id in (select g2.id from core.phase_group g2 join core.team_entry te on te.phase_group_id = g2.id
                   where te.id in ${ida})
     and e.event_type in ('tarjeta_amarilla','tarjeta_roja')`);

await cliente.end();

/* ══ EL INFORME ═══════════════════════════════════════════════════════════════════════════════════════ */
const barras = (n, total, ancho = 24) => {
  const lleno = total > 0 ? Math.round((n / total) * ancho) : 0;
  return '█'.repeat(lleno) + '·'.repeat(Math.max(0, ancho - lleno));
};
const pct = (n, total) => (total > 0 ? `${((n / total) * 100).toFixed(1)} %` : '—');
const L = [];
L.push(`# ${TITULO}`, '', '## Cómo trabaja su cuerpo técnico', '',
  '_Análisis sobre las actas del canónico. Los minutos de cambio salen de los eventos `sale` de cada acta, que es donde la fuente publica el minuto._', '');

// 1. Quién es
L.push('### 1. Quién forma el cuerpo técnico', '');
const porPersona = new Map();
for (const c of cuerpo) {
  if (!porPersona.has(c.person_id)) porPersona.set(c.person_id, { persona: c.persona ?? `persona ${c.person_id}`, roles: new Map(), temporadas: new Map() });
  const p = porPersona.get(c.person_id);
  const rol = normalizaRol(c.rol);
  p.roles.set(rol, (p.roles.get(rol) ?? 0) + Number(c.partidos));
  p.temporadas.set(c.temporada, (p.temporadas.get(c.temporada) ?? 0) + Number(c.partidos));
}
L.push('| persona | roles | 2026-27 | 2025-26 | partidos totales |', '|---|---|---|---|---|');
for (const [, p] of [...porPersona].sort((a, b) => {
  const t = (x) => [...x[1].roles.values()].reduce((s, v) => s + v, 0);
  return t(b) - t(a);
})) {
  const total = [...p.roles.values()].reduce((s, v) => s + v, 0);
  L.push(`| ${p.persona} | ${[...p.roles.entries()].map(([r, n]) => `${r} (${n})`).join(', ')} | `
    + `${p.temporadas.get('2026-27') ?? '—'} | ${p.temporadas.get('2025-26') ?? '—'} | ${total} |`);
}
L.push('');

// 2. Trayectoria
L.push('### 2. Su trayectoria en todos los equipos y categorías', '',
  'Sirve para ver si su desempeño se sostiene al subir de categoría o si fue cosa de un equipo concreto.', '');
L.push('| persona | temporada | club | equipo | categoría | partidos | G-E-P | puntos/partido |', '|---|---|---|---|---|---|---|---|');
for (const t of trayectoria) {
  const persona = porPersona.get(t.person_id)?.persona ?? `persona ${t.person_id}`;
  const g = Number(t.ganados), e = Number(t.empatados), p = Number(t.perdidos);
  const pts = g * 3 + e;
  L.push(`| ${persona} | ${t.temporada} | ${t.club} | ${t.equipo} | ${t.categoria ?? '—'} | ${t.partidos} | ${g}-${e}-${p} | ${(pts / Math.max(1, Number(t.partidos))).toFixed(2)} |`);
}
L.push('');

// 3. Patrón de cambios
L.push('### 3. Cómo hace los cambios', '');
if (!cambios.length) {
  L.push('_Las actas de este equipo no traen cambios con minuto._', '');
} else {
  const partidos = cambios.length;
  const primeros = cambios.map((c) => Number(c.primer_cambio)).filter((x) => Number.isFinite(x));
  const medios = primeros.reduce((s, v) => s + v, 0) / Math.max(1, primeros.length);
  const totalCambios = cambios.reduce((s, c) => s + Number(c.cuantos), 0);
  L.push(`- **Partidos con cambios anotados:** ${partidos}`);
  L.push(`- **Primer cambio, de media: minuto ${medios.toFixed(0)}** (el más pronto, ${Math.min(...primeros)}; el más tarde, ${Math.max(...primeros)})`);
  L.push(`- **Cambios por partido: ${(totalCambios / partidos).toFixed(1)}**`, '');

  // Distribución por tramos de 15 minutos, con barra.
  const tramos = [[0, 15], [15, 30], [30, 45], [45, 60], [60, 75], [75, 90], [90, 130]];
  const cuenta = tramos.map(([a, b]) => ({ tramo: `${a}-${b}`, n: 0 }));
  for (const c of cambios) {
    for (const m of c.minutos ?? []) {
      const min = Number(m);
      const i = tramos.findIndex(([a, b]) => min >= a && min < b);
      if (i >= 0) cuenta[i].n++;
    }
  }
  const total = cuenta.reduce((s, x) => s + x.n, 0);
  L.push('**Cuándo los hace** (minuto del cambio):', '', '```');
  for (const c of cuenta) L.push(`${c.tramo.padStart(7)} | ${barras(c.n, total, 28)} ${String(c.n).padStart(4)}  ${pct(c.n, total)}`);
  L.push('```', '');
}

// 4. Disciplina
L.push('### 4. Disciplina de sus equipos', '');
const d = disciplina[0] ?? {};
const partidosDisciplina = Number(d.partidos ?? 0);
const tarjetas = Number(d.amarillas ?? 0) + Number(d.rojas ?? 0);
const mediaGrupo = Number(grupoDisciplina[0]?.media_por_partido ?? 0);
L.push('| | su equipo | media de su grupo |', '|---|---|---|');
L.push(`| tarjetas por partido | **${(tarjetas / Math.max(1, partidosDisciplina)).toFixed(2)}** | ${mediaGrupo.toFixed(2)} |`);
L.push(`| amarillas | ${d.amarillas ?? 0} | |`, `| rojas | ${d.rojas ?? 0} (${d.dobles ?? 0} por doble amarilla) | |`);
L.push(`| del banquillo (técnicos) | ${d.de_banquillo ?? 0} | |`, '');
const comparacion = tarjetas / Math.max(1, partidosDisciplina) - mediaGrupo;
L.push(comparacion > 0.3
  ? `**Es un equipo tarjetero:** ${comparacion.toFixed(2)} tarjetas por partido POR ENCIMA de la media de su grupo.`
  : comparacion < -0.3
    ? `**Es un equipo disciplinado:** ${Math.abs(comparacion).toFixed(2)} tarjetas por partido por debajo de la media de su grupo.`
    : '**Está en la media de su grupo** en tarjetas por partido.', '');

mkdirSync(join(RAIZ, 'informes'), { recursive: true });
const salida = join(RAIZ, 'informes', `${SLUG}-cuerpo-tecnico.md`);
writeFileSync(salida, L.join('\n'), 'utf8');
console.log(`informe del cuerpo técnico: ${salida}`);
console.log(`  personas analizadas: ${porPersona.size} · filas de trayectoria: ${trayectoria.length} · partidos con cambios: ${cambios.length} · tarjetas: ${tarjetas}`);
