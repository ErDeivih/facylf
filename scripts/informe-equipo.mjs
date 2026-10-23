#!/usr/bin/env node
/*
 * INFORME DE EQUIPO Y PLANTILLA DESDE EL CANÓNICO
 * =========================================================
 *
 * Consulta general por inscripción de equipo. Responde, entre otras, a estas preguntas:
 *
 *   1. quién forma la plantilla de la temporada seleccionada y qué ha hecho cada persona;
 *   2. dónde jugó cada integrante en temporadas anteriores con cobertura completa;
 *   3. quién ha participado también con equipos de categoría superior del club;
 *   4. qué trayectoria tiene el cuerpo técnico y en qué contexto obtuvo sus resultados.
 *
 * Reglas que respeta, porque son las del proyecto:
 *
 *   · Lee SÓLO con `DATABASE_URL_LECTOR` (rol de sólo lectura). No escribe nada en la base.
 *   · Agrega SIEMPRE por `team_entry_id`. `core.team_season` 8873 agrupa DOS equipos del mismo club
 *     en 2026-27 —el juvenil (entry 8873) y el sénior (entry 8905)—: agregar por `team_season_id`
 *     o por `club_id` mezcla dos plantillas distintas.
 *   · La plantilla nace de la ficha oficial del equipo y se completa con las actas. Así incluye
 *     también a quien está inscrito pero todavía no ha participado.
 *   · Los minutos son DERIVADOS de los cambios del acta, no publicados. Se dice, y se comprueba que
 *     cuadren con 11 × partidos antes de enseñarlos.
 *   · La demarcación se publica? No: el acta sólo distingue al portero. No se inventa ninguna otra.
 *
 * El servicio de informes resuelve el contexto y pasa --equipo, --anterior y --mayores.
 * Los valores por defecto de la CLI conservan el caso original de Ciudad Rodrigo.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resumeDisciplina } from './lib/informe-disciplina.mjs';
import { renderDashboard } from './lib/informe-dashboard.mjs';
import { coberturaSql, elegible } from './lib/informes-politica.mjs';
import {mismoEquipoHistorico} from './lib/equipo-identidad.mjs';
import { minutosSql, movimientosSql } from './lib/informe-minutos.mjs';
import { duracionSql, jugadoresSql, formatoPartido } from './lib/informe-formato.mjs';
import { ejecutaEnFoto } from './lib/consultas-en-foto.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'informes');

// ── Credenciales: se leen del `.env` (nunca versionado), igual que hace la CLI del importador ──────
const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* sin .env no hay informe */ }
}
const URL = process.env.DATABASE_URL_LECTOR;
if (!URL) throw new Error('Falta DATABASE_URL_LECTOR en .env: el informe lee con el rol de sólo lectura.');

const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const pg = requerir('pg');

/*
 * ── EL ÁMBITO: SE PASA POR PARÁMETRO, NO SE ESCRIBE EN EL CÓDIGO ──────────────────────────────────────
 *
 * Estas cinco cosas son lo ÚNICO que ata este informe a un equipo concreto. Todo lo demás —las consultas,
 * las tablas, las gráficas, el texto— se compone con lo que devuelve el canónico, así que el mismo programa
 * sirve para cualquier equipo cambiando estos números.
 *
 * Los valores por defecto son el Ciudad Rodrigo Juvenil, que es el informe que originó todo esto; con
 * `--equipo`, `--anterior` y `--mayores` se hace el de cualquier otro:
 *
 *   node scripts/informe-equipo.mjs \
 *     --equipo 8874 --anterior 2492 --mayores "174:Unionistas B (Tercera Fed. 2026-27),156:Unionistas B (Tercera Fed. 2025-26)" \
 *     --titulo "Unionistas de Salamanca C.F. Juvenil «C»" --slug unionistas-c-juvenil-2026-27
 *
 * `--mayores` son los equipos de categoría SUPERIOR del mismo club a los que un jugador de este equipo
 * puede subir: el sénior, un filial, o un juvenil de categoría más alta. Se declaran a mano porque el
 * canónico no sabe cuál es «el equipo de arriba» de nadie — y adivinarlo con la categoría de
 * `team_season` no vale: medido, ese campo dice `aficionados` para equipos juveniles y comparte fila entre
 * equipos distintos del mismo club (el juvenil «B» y el sénior «B» de Unionistas comparten `team_season`
 * 156). Se declara, no se deduce.
 */
const argumentos = process.argv.slice(2);
const arg = (nombre, defecto = null) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : defecto;
};

const JUVENIL_ENTRY = Number(arg('equipo', 8873));         // el equipo que se informa, esta temporada
const JUVENIL_ENTRY_2025 = Number(arg('anterior', 2489));  // el mismo equipo (o su hueco) la temporada pasada
/** Equipos de categoría superior del club, con su etiqueta: `entry:etiqueta`, separados por comas. */
const MAYORES = (arg('mayores', '8905:Sénior (1ª Div. Regional de Aficionados 2026-27),2517:Sénior (1ª Div. Regional de Aficionados 2025-26)') ?? '')
  .split(',').map((t) => t.trim()).filter(Boolean)
  .map((t) => {
    const corte = t.indexOf(':');
    return corte < 0 ? { entry: Number(t), etiqueta: `equipo ${t}` } : { entry: Number(t.slice(0, corte)), etiqueta: t.slice(corte + 1) };
  });
const TITULO = arg('titulo', 'Ciudad Rodrigo C.F. — Juvenil');
const SLUG = arg('slug', 'ciudad-rodrigo-juvenil-2026-27');
const TEMPORADA = Number(arg('temporada', 44));            // 2026-27
const TEMPORADA_ANTERIOR = Number(arg('temporada-anterior', 3));   // 2025-26
let ETIQUETA_ANTERIOR = '';
const DESDE_TEMPORADA = arg('desde-temporada', '2021-22');
const LOGO_EQUIPO = arg('logo-equipo', join(RAIZ, 'informes', 'recursos', 'ciudad-rodrigo.jpg'));
const LOGO_MARCA = arg('logo-marca', join(RAIZ, 'informes', 'recursos', 'pizarrales.jpg'));

/* ══ CONSULTAS ═════════════════════════════════════════════════════════════════════════════════════
 * Se guardan como texto para poder volcarlas al `.sql` del informe: lo que se publica es lo que se
 * ejecutó, no una paráfrasis.
 */
const CONSULTAS = {};
// Duración y jugadores salen de la edición (modalidad y categoría): ver lib/informe-formato.mjs.
const DURACION_PARTIDO_SQL = duracionSql('ce_d');
const JUGADORES_PARTIDO_SQL = jugadoresSql('ce_d');
const PLANTILLA_PERSONAS_SQL = `
  select person_id from core.current_squad_member
   where team_entry_id = ${JUVENIL_ENTRY} and role = 'player' and person_id is not null
  union
  select distinct person_id from core.appearance where team_entry_id = ${JUVENIL_ENTRY}`;

// Nombres completos publicados, con y sin la coma «apellidos, nombre».
// Incluye técnicos de la ficha aunque todavía no tengan persona resuelta ni un acta.
const NOMBRES_TECNICOS_SQL = `select distinct core.normaliza_nombre(v.nombre) as nombre_norm
 from (
  select p.nombre_mostrado as nombre from core.person p join cuerpo c on c.person_id=p.id
  union select pn.literal from core.person_name pn join cuerpo c on c.person_id=pn.person_id where not pn.es_apodo
  union select display_name from core.current_squad_member where team_entry_id=${JUVENIL_ENTRY} and role in ('coach','delegate')
 ) raw cross join lateral(values(raw.nombre),(regexp_replace(raw.nombre,'^([^,]+),[[:space:]]*(.+)$','\\2 \\1'))) v(nombre)
 where length(core.normaliza_nombre(v.nombre))>=7`;

/*
 * ── SÓLO COMPETICIONES CON LA TEMPORADA COMPLETAMENTE INGESTA (regla §5.4.1 de la guía) ────────────────
 *
 * `visibility_state = 'completa'` es lo que el propio recolector escribe cuando están todas las jornadas,
 * todos los resultados y todas las actas disponibles (`packages/canonico/src/lote.ts`). Cualquier otro estado
 * significa que falta algo, y con lo que falta los números MIENTEN: medido el 25/09/2026 en el archivo local,
 * la «2ª División Provincial de Juveniles» de Victoria tenía **7 partidos de 26 jornadas** y el informe la
 * enseñaba como una temporada más, con su balance y su «ninguno (sin actas)».
 *
 * La temporada EN CURSO es la excepción declarada y no un descuido: por definición no puede estar completa, es
 * determinada por la fecha del sistema, no por la temporada seleccionada. El informe conserva la muestra
 * disponible y excluye cualquier temporada posterior a la que se está analizando.
 *
 * Se añade a la condición del `join`, no a un `where`, para no tener que tocar el resto de cada consulta.
 */
const SQL_INGESTA_COMPLETA = (alias, grupo='pg') => `(${coberturaSql(alias, new Date(), grupo)} and ${alias}.season_id in
  (select id from core.season where etiqueta >= '2021-22' and orden <= (select orden from core.season where id=${TEMPORADA})))`;
// El acta publica la segunda amarilla como «doble-amarilla», ya transformada en una roja.
// Es una amarilla adicional visible, además de una expulsión; la primera consta por separado.
const ES_AMARILLA = alias => `(${alias}.event_type='tarjeta_amarilla' or (${alias}.event_type='tarjeta_roja' and ${alias}.subtipo='doble_amarilla'))`;

CONSULTAS.contexto = `
-- Identidad exacta del equipo y de su competición. La categoría fiable es la de la EDICIÓN, no la
-- de team_season (que dice 'aficionados' para un equipo juvenil).
select te.id as team_entry, te.codigo_externo as codigo_equipo, te.nombre_en_fuente as nombre_en_fuente,
       ts.id as team_season, ts.nombre as team_season_nombre, ts.categoria as team_season_categoria,
       cl.id as club, cl.nombre_canonico as club_nombre,
       s.etiqueta as temporada, ce.id as edicion, ce.codigo_externo as edicion_codigo,
       ce.nombre_publicado as competicion, ce.categoria as categoria, ce.ambito, ce.modalidad,
       ce.estado as estado_edicion,
       pg.id as grupo, pg.codigo_externo as grupo_codigo, pg.nombre as grupo_nombre,
       -- Las jornadas que tiene el grupo ENTERO. Es lo que permite decir si la competición está a la mitad,
       -- que es la regla §5.4.2 de la guía: no se sacan conclusiones de una temporada a medio ingerir.
       pg.jornadas_previstas
from core.team_entry te
join core.team_season ts on ts.id = te.team_season_id
join core.club cl on cl.id = ts.club_id
join core.season s on s.id = ts.season_id
join core.phase_group pg on pg.id = te.phase_group_id
join core.competition_edition ce on ce.id = pg.competition_edition_id
where te.id = ${JUVENIL_ENTRY}`;

CONSULTAS.escudo_club = `
select a.mime_type, encode(a.contenido, 'base64') as contenido_base64
from core.club_asset a
where a.club_id = (select ts.club_id from core.team_entry te
  join core.team_season ts on ts.id=te.team_season_id where te.id=${JUVENIL_ENTRY})
  and a.tipo='escudo' and a.vigente
order by a.observado_en desc limit 1`;

CONSULTAS.plantilla_publicada = `
select role, source_order, display_name, person_id, resolution, declared_players, captured_at
from core.current_squad_member where team_entry_id = ${JUVENIL_ENTRY}
order by case role when 'player' then 1 when 'coach' then 2 else 3 end, source_order`;

CONSULTAS.cobertura = `
-- Hasta qué jornada se sabe algo de este equipo, y con qué calidad de acta.
-- 'completa hasta J1' no es «temporada completa»: es «no falta nada de lo jugado».
select ce.visibility_state, ce.data_version,
       count(distinct m.id) as partidos,
       count(distinct m.id) filter (where m.goles_local is not null) as partidos_con_marcador,
       count(distinct m.id) filter (where m.home_team_entry_id = te.id or m.away_team_entry_id = te.id) as partidos_equipo,
       count(distinct m.id) filter (where (m.home_team_entry_id = te.id or m.away_team_entry_id = te.id)
         and m.goles_local is not null and m.goles_visitante is not null) as partidos_equipo_con_marcador,
       count(distinct m.matchday_id) as jornadas_con_partido,
       max(j.numero) filter (where m.goles_local is not null) as ultima_jornada_con_resultado,
       count(distinct a.match_id) as partidos_con_alineacion,
       count(distinct a.person_id) as personas_vistas
from core.competition_edition ce
join core.phase_group pg on pg.competition_edition_id = ce.id
join core.team_entry te on te.phase_group_id = pg.id and te.id = ${JUVENIL_ENTRY}
left join core.match m on m.phase_group_id = pg.id
left join core.matchday j on j.id = m.matchday_id
left join core.appearance a on a.match_id = m.id and a.team_entry_id = te.id
where ce.season_id = ${TEMPORADA}
group by ce.visibility_state, ce.data_version`;

/*
 * ── TODAS LAS JORNADAS JUGADAS (regla §5.4.4 de la guía) ────────────────────────────────────────────────
 *
 * El informe enseñaba sólo la ÚLTIMA jornada: un informe que habla de la jornada 2 cuando se han jugado dos
 * está contando la mitad de lo que ha pasado, y es justo la mitad que menos informa (un partido suelto no dice
 * si el equipo va bien). Aquí salen todos los partidos jugados de la temporada, en orden, para poder ver la
 * racha: resultados, puntos y goles acumulados.
 *
 * Sólo partidos CON RESULTADO: los aplazados y los que aún no se han jugado no son jornadas jugadas.
 */
CONSULTAS.partidos_temporada = `
select m.id as match_id, j.numero as jornada,
       (m.home_team_entry_id = ${JUVENIL_ENTRY}) as en_casa,
       (case when m.home_team_entry_id = ${JUVENIL_ENTRY} then m.goles_local else m.goles_visitante end) as goles_favor,
       (case when m.home_team_entry_id = ${JUVENIL_ENTRY} then m.goles_visitante else m.goles_local end) as goles_contra,
       (case when m.home_team_entry_id = ${JUVENIL_ENTRY} then rival.nombre_en_fuente else casa.nombre_en_fuente end) as rival,
       coalesce(m.played_at::date,m.fecha_prevista) as fecha_prevista
  from core.match m
  join core.matchday j on j.id = m.matchday_id
  join core.phase_group g on g.id = m.phase_group_id
  join core.team_entry casa on casa.id = m.home_team_entry_id
  join core.team_entry rival on rival.id = m.away_team_entry_id
 where g.competition_edition_id = (select pg.competition_edition_id from core.phase_group pg
                                    where pg.id = (select phase_group_id from core.team_entry where id = ${JUVENIL_ENTRY}))
   and (m.home_team_entry_id = ${JUVENIL_ENTRY} or m.away_team_entry_id = ${JUVENIL_ENTRY})
   and m.goles_local is not null and m.goles_visitante is not null
 order by coalesce(m.played_at::date,m.fecha_prevista), j.numero, m.source_order`;

CONSULTAS.jornada1 = `
-- La jornada jugada, con su resultado. El marcador sale del calendario/jornada de la fuente; el
-- contraste con los eventos del acta lo hace el importador y aquí se repite para poder enseñarlo.
select m.id as match_id, j.numero as jornada, m.fecha_prevista, m.official_status,
       m.home_team_entry_id, m.away_team_entry_id,
       m.goles_local, m.goles_visitante,
       el.nombre_en_fuente as local, ev.nombre_en_fuente as visitante,
       (select count(*) from core.match_event e where e.match_id = m.id) as eventos_del_acta,
       (select count(*) from core.match_event e where e.match_id = m.id and e.event_type = 'gol'
          and e.lado_beneficiado = 'local') as goles_eventos_local,
       (select count(*) from core.match_event e where e.match_id = m.id and e.event_type = 'gol'
          and e.lado_beneficiado = 'visitante') as goles_eventos_visitante,
       mr.quality, mr.incidencias
from core.match m
join core.matchday j on j.id = m.matchday_id
join core.team_entry el on el.id = m.home_team_entry_id
join core.team_entry ev on ev.id = m.away_team_entry_id
left join core.match_report mr on mr.match_id = m.id
where m.phase_group_id = (select pg.id from core.team_entry te join core.phase_group pg on pg.id = te.phase_group_id
                          where te.id = ${JUVENIL_ENTRY})
order by j.numero, m.source_order`;

CONSULTAS.resumen_liga = `
-- Radiografía de todos los partidos disputados en el grupo hasta el corte del informe.
with equipos as (
  select te.id, te.nombre_en_fuente as equipo from core.team_entry te
  where te.phase_group_id=(select phase_group_id from core.team_entry where id=${JUVENIL_ENTRY})
), partidos as (
  select m.* from core.match m
  where m.phase_group_id=(select phase_group_id from core.team_entry where id=${JUVENIL_ENTRY})
    and m.goles_local is not null and m.goles_visitante is not null
), balance as (
  select e.id as team_entry, e.equipo,
    count(p.id) as jugados,
    count(*) filter (where (p.home_team_entry_id=e.id and p.goles_local>p.goles_visitante)
                          or (p.away_team_entry_id=e.id and p.goles_visitante>p.goles_local)) as ganados,
    count(*) filter (where p.goles_local=p.goles_visitante) as empatados,
    count(*) filter (where (p.home_team_entry_id=e.id and p.goles_local<p.goles_visitante)
                          or (p.away_team_entry_id=e.id and p.goles_visitante<p.goles_local)) as perdidos,
    coalesce(sum(case when p.home_team_entry_id=e.id then p.goles_local else p.goles_visitante end),0) as gf,
    coalesce(sum(case when p.home_team_entry_id=e.id then p.goles_visitante else p.goles_local end),0) as gc
  from equipos e left join partidos p on p.home_team_entry_id=e.id or p.away_team_entry_id=e.id
  group by e.id,e.equipo
)
select *, ganados*3+empatados as puntos,
       round(gf::numeric/nullif(jugados,0),2) as gf_partido,
       round(gc::numeric/nullif(jugados,0),2) as gc_partido
from balance order by puntos desc, (gf-gc) desc, gf desc, equipo`;

/** «7:12,16:2» → «7 (12) · 16 (2)»; un solo dorsal → «7». */
function formatoDorsales(frecuencia) {
  if (!frecuencia) return '';
  const partes = String(frecuencia).split(',').map((x) => x.split(':'));
  return partes.length === 1 ? partes[0][0] : partes.map(([d, n]) => `${d} (${n})`).join(' · ');
}

CONSULTAS.plantilla = `
-- LA PLANTILLA oficial, aunque alguien todavía no haya participado. Una fila por persona; las cifras
-- deportivas salen de las actas de ESTE equipo (team_entry 8873), nunca de su club.
--
-- Los minutos son DERIVADOS: un titular que no sale juega 90; uno que sale, hasta su minuto de salida;
-- un suplente que entra, desde su minuto de entrada hasta el final; uno que no entra, cero.
with plantilla_personas as (${PLANTILLA_PERSONAS_SQL}), aparicion as (
  select a.person_id, a.match_id, a.condition, a.dorsal, a.portero,
    ${minutosSql(DURACION_PARTIDO_SQL)} as minutos,
    coalesce(sale.minuto, ${DURACION_PARTIDO_SQL}) as minuto_salida,
    entra.minuto as minuto_entrada
  from core.appearance a
  join core.team_entry te_d on te_d.id=a.team_entry_id
  join core.phase_group pg_d on pg_d.id=te_d.phase_group_id
  join core.competition_edition ce_d on ce_d.id=pg_d.competition_edition_id
  ${movimientosSql(DURACION_PARTIDO_SQL)}
  where a.team_entry_id = ${JUVENIL_ENTRY}
)
select p.id as person_id, p.nombre_mostrado as nombre, p.es_menor,
       exists(select 1 from core.current_squad_member sm where sm.team_entry_id=${JUVENIL_ENTRY}
         and sm.role='player' and sm.person_id=p.id) as inscrito_oficial,
       (count(ap.*) > 0) as ha_participado,
       array_agg(distinct ap.dorsal) filter (where ap.dorsal is not null) as dorsales,
       (select string_agg(x.dorsal::text || ':' || x.n, ',' order by x.n desc, x.dorsal)
          from (select a3.dorsal, count(*) n from core.appearance a3
                 where a3.person_id = p.id and a3.team_entry_id = ${JUVENIL_ENTRY} and a3.dorsal is not null
                 group by a3.dorsal) x) as dorsales_frecuencia,
       count(ap.*) as convocatorias,
       count(*) filter (where ap.condition = 'starter') as titularidades,
       count(*) filter (where ap.condition = 'substitute') as suplencias,
       count(*) filter (where ap.condition = 'substitute' and ap.minuto_entrada is not null) as entro,
       count(*) filter (where ap.condition = 'substitute' and ap.minuto_entrada is null) as no_entro,
       case when count(*) filter(where ap.match_id is not null and ap.minutos is null)>0 then null else coalesce(sum(ap.minutos),0) end as minutos_derivados, count(*) filter(where ap.match_id is not null and ap.minutos is null) as minutos_sin_resolver,
       count(*) filter (where ap.portero) as veces_portero,
       (select count(*) from core.match_event e where e.person_id = p.id
          and e.team_entry_id=${JUVENIL_ENTRY} and e.sujeto_tipo='jugador'
          and e.match_id in (select match_id from core.appearance where team_entry_id = ${JUVENIL_ENTRY})
          and e.event_type = 'gol' and e.subtipo = 'penalti') as goles_penalti,
       (select count(*) from core.match_event e where e.person_id = p.id
          and e.team_entry_id=${JUVENIL_ENTRY} and e.sujeto_tipo='jugador'
          and e.match_id in (select match_id from core.appearance where team_entry_id = ${JUVENIL_ENTRY})
          and e.event_type = 'gol' and e.subtipo is distinct from 'propia_puerta') as goles,
       (select count(*) from core.match_event e where e.person_id = p.id
          and e.team_entry_id=${JUVENIL_ENTRY} and e.sujeto_tipo='jugador'
          and e.match_id in (select match_id from core.appearance where team_entry_id = ${JUVENIL_ENTRY})
          and ${ES_AMARILLA('e')}) as amarillas,
       (select count(*) from core.match_event e where e.person_id = p.id
          and e.team_entry_id=${JUVENIL_ENTRY} and e.sujeto_tipo='jugador'
          and e.match_id in (select match_id from core.appearance where team_entry_id = ${JUVENIL_ENTRY})
          and e.event_type = 'tarjeta_roja') as rojas
from plantilla_personas pl
join core.person p on p.id = pl.person_id
left join aparicion ap on ap.person_id = p.id
group by p.id, p.nombre_mostrado, p.es_menor
order by coalesce(sum(ap.minutos),0) desc, p.nombre_mostrado`;

CONSULTAS.minutos_historial = `
-- Minutos DERIVADOS de cada persona de la plantilla, en TODAS sus temporadas y equipos. Se usa la
-- misma regla que en la plantilla de 2026-27, para que la comparación entre temporadas sea como con
-- como y no apariciones contra minutos, que no significa nada.
--
-- Y de paso da la comprobación que hace creíble el método: los minutos de un equipo en una temporada
-- completa tienen que sumar jornadas × 11 × 90.
with plantilla as (
  ${PLANTILLA_PERSONAS_SQL}
), aparicion as (
  select a.person_id, a.season_id, a.team_entry_id, a.match_id, a.condition,
    ${minutosSql(DURACION_PARTIDO_SQL)} as minutos
  from core.appearance a
  join core.team_entry te_d on te_d.id=a.team_entry_id
  join core.phase_group pg_d on pg_d.id=te_d.phase_group_id
  join core.competition_edition ce_d on ce_d.id=pg_d.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce_d','pg_d')}
  ${movimientosSql(DURACION_PARTIDO_SQL)}
  where a.person_id in (select person_id from plantilla)
)
select ap.person_id, s.etiqueta as temporada, ap.team_entry_id, te.nombre_en_fuente as equipo,
       ts.club_id, ce.categoria as categoria, ce.nombre_publicado as competicion,
       count(*) as apariciones,
       count(distinct ap.match_id) as partidos,
       case when bool_or(ap.minutos is null) then null else sum(ap.minutos) end as minutos, count(*) filter(where ap.minutos is null) as minutos_sin_resolver,
       count(*) filter (where ap.condition = 'starter') as titularidades
from aparicion ap
join core.season s on s.id = ap.season_id
join core.team_entry te on te.id = ap.team_entry_id
join core.team_season ts on ts.id = te.team_season_id
join core.phase_group pg on pg.id = te.phase_group_id
join core.competition_edition ce on ce.id = pg.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce')}
where s.etiqueta >= '${DESDE_TEMPORADA}'
group by ap.person_id, s.etiqueta, s.orden, ap.team_entry_id, te.nombre_en_fuente, ts.club_id, ce.categoria, ce.nombre_publicado
order by ap.person_id, s.orden desc, sum(ap.minutos) desc`;

/*
 * ── EL PESO DE CADA JUGADOR EN SU EQUIPO (lo que pidió el entrenador) ────────────────────────────────
 *
 * Los minutos sueltos no dicen si un jugador es importante: 2.000 minutos en una temporada de 26 partidos
 * no equivalen a 2.000 en una de 38. El denominador correcto es el tiempo que ESE jugador pudo disputar:
 * la duración reglamentaria por cada partido del equipo con acta. Un partido completo debe ser 100 %, no
 * 9,1 % por dividir
 * entre los once jugadores. También se calculan participación, titularidad, goles/90 y percentil de minutos
 * dentro de sus compañeros de esa inscripción.
 *
 * `partidos_equipo` va al lado a propósito: si de esa temporada sólo hay acta de 12 partidos de 26, el
 * porcentaje es sobre los 12, y quien lea tiene que poder verlo sin preguntar.
 */
CONSULTAS.peso_en_su_equipo = `
with plantilla as (${PLANTILLA_PERSONAS_SQL}),
equipos_pertinentes as (select distinct team_entry_id from core.appearance where person_id in (select person_id from plantilla)),
aparicion as (
  select a.person_id, a.season_id, a.team_entry_id, a.match_id, a.condition,
    ${minutosSql(DURACION_PARTIDO_SQL)} as minutos
  from core.appearance a
  join core.team_entry te_d on te_d.id=a.team_entry_id
  join core.phase_group pg_d on pg_d.id=te_d.phase_group_id
  join core.competition_edition ce_d on ce_d.id=pg_d.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce_d','pg_d')}
  ${movimientosSql(DURACION_PARTIDO_SQL)}
  where a.team_entry_id in (select team_entry_id from equipos_pertinentes)
), jugador as (
  select ap.person_id, ap.season_id, ap.team_entry_id,
         count(distinct ap.match_id) as partidos,
         case when bool_or(ap.minutos is null) then null else sum(ap.minutos) end as minutos, count(*) filter(where ap.minutos is null) as minutos_sin_resolver,
         count(*) filter (where ap.condition = 'starter') as titularidades,
         count(*) filter (where ap.condition = 'substitute') as suplencias
    from aparicion ap group by 1, 2, 3
), equipo as (
  select ap.season_id, ap.team_entry_id,
         count(distinct ap.match_id) as partidos_equipo,
         sum(ap.minutos) as minutos_equipo
    from aparicion ap group by 1, 2
), comparativa as (
  select j.*,
         percent_rank() over (partition by j.season_id, j.team_entry_id order by j.minutos) as pct_rank_minutos,
         rank() over (partition by j.season_id, j.team_entry_id order by j.minutos desc nulls last) as posicion_minutos,
         count(j.minutos) over (partition by j.season_id, j.team_entry_id) as jugadores_con_minutos_calculables
  from jugador j
)
select j.person_id, s.etiqueta as temporada, s.orden as temporada_orden, j.team_entry_id,
       te.nombre_en_fuente as equipo, ce.categoria, ce.nombre_publicado as competicion,
       ${DURACION_PARTIDO_SQL} as duracion_partido,
       j.partidos, j.titularidades, j.suplencias, j.minutos, j.minutos_sin_resolver,
       e.partidos_equipo, e.minutos_equipo,
       round(100.0 * j.minutos / nullif(e.partidos_equipo * ${DURACION_PARTIDO_SQL}, 0), 1) as porcentaje_disponible,
       round(100.0 * j.partidos / nullif(e.partidos_equipo, 0), 1) as porcentaje_participacion,
       round(100.0 * j.titularidades / nullif(e.partidos_equipo, 0), 1) as porcentaje_titular,
       round((100.0 * j.pct_rank_minutos)::numeric, 0) as percentil_minutos,
       j.posicion_minutos, j.jugadores_con_minutos_calculables
  from comparativa j
  join equipo e on e.season_id = j.season_id and e.team_entry_id = j.team_entry_id
  join core.season s on s.id = j.season_id
  join core.team_entry te on te.id = j.team_entry_id
  join core.phase_group pg on pg.id = te.phase_group_id
  join core.competition_edition ce on ce.id = pg.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce')}
  join core.competition_edition ce_d on ce_d.id = pg.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce_d')}
where s.etiqueta >= '${DESDE_TEMPORADA}' and j.person_id in (select person_id from plantilla)
order by j.person_id, s.orden desc, j.minutos desc`;

/* Cuerpo técnico del equipo actual y toda su trayectoria observable, sin atribuirle causalidad. */
CONSULTAS.cuerpo_tecnico = `
with cuerpo as (
  select person_id from core.current_squad_member
   where team_entry_id=${JUVENIL_ENTRY} and role in ('coach','delegate') and person_id is not null
  union
  select distinct s.person_id from core.match_staff s where s.team_entry_id = ${JUVENIL_ENTRY}
), base as (
  select s.person_id, p.nombre_mostrado as nombre, se.etiqueta as temporada, se.orden,
         cl.nombre_canonico as club, te.nombre_en_fuente as equipo, ce.categoria,
         ce.nombre_publicado as competicion, s.rol, s.team_entry_id,
         count(distinct s.match_id) as partidos,
         count(distinct s.match_id) filter (where
           (m.home_team_entry_id = s.team_entry_id and m.goles_local > m.goles_visitante) or
           (m.away_team_entry_id = s.team_entry_id and m.goles_visitante > m.goles_local)) as victorias,
         count(distinct s.match_id) filter (where m.goles_local = m.goles_visitante) as empates,
         count(distinct s.match_id) filter (where
           (m.home_team_entry_id = s.team_entry_id and m.goles_local < m.goles_visitante) or
           (m.away_team_entry_id = s.team_entry_id and m.goles_visitante < m.goles_local)) as derrotas,
         coalesce(sum(case when m.home_team_entry_id = s.team_entry_id then m.goles_local
                           else m.goles_visitante end), 0) as gf,
         coalesce(sum(case when m.home_team_entry_id = s.team_entry_id then m.goles_visitante
                           else m.goles_local end), 0) as gc
  from cuerpo c
  join core.person p on p.id = c.person_id
  join core.match_staff s on s.person_id = c.person_id
  join core.match m on m.id = s.match_id and m.goles_local is not null
  join core.team_entry te on te.id = s.team_entry_id
  join core.team_season ts on ts.id = te.team_season_id
  join core.club cl on cl.id = ts.club_id
  join core.season se on se.id = ts.season_id
  join core.phase_group pg on pg.id = te.phase_group_id
  join core.competition_edition ce on ce.id = pg.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce')}
  group by s.person_id, p.nombre_mostrado, se.etiqueta, se.orden, cl.nombre_canonico,
           te.nombre_en_fuente, ce.categoria, ce.nombre_publicado, s.rol, s.team_entry_id
)
select b.*, pe.disponibles,
       round(100.0 * b.partidos / nullif(pe.disponibles, 0), 1) as cobertura,
       round((3.0 * b.victorias + b.empates) / nullif(b.partidos, 0), 2) as puntos_por_partido,
       round(1.0 * (b.gf - b.gc) / nullif(b.partidos, 0), 2) as diferencia_por_partido
from base b join lateral(select count(*) as disponibles from core.match m
 where (m.home_team_entry_id=b.team_entry_id or m.away_team_entry_id=b.team_entry_id)
 and m.goles_local is not null and m.goles_visitante is not null) pe on true
where b.temporada >= '${DESDE_TEMPORADA}'
order by b.nombre, b.orden desc, b.club, b.equipo, b.rol`;

/*
 * El mismo cuerpo técnico en temporadas ANTERIORES, buscado por nombre publicado.
 *
 * Por qué por nombre y no por persona: la identidad nominal del canónico se construye por
 * (rol, temporada, equipo) —migración 0008—, así que el mismo técnico en otra temporada es otra
 * fila de `core.person` y no se puede seguir por `person_id`. Se enlaza por `nombre_norm`, que es
 * lo único que la fuente publica, y por eso el informe lo declara: puede unir a dos homónimos.
 */
CONSULTAS.cuerpo_tecnico_por_nombre = `
with cuerpo as (
  select person_id from core.current_squad_member
   where team_entry_id=${JUVENIL_ENTRY} and role in ('coach','delegate') and person_id is not null
  union
  select distinct s.person_id from core.match_staff s where s.team_entry_id = ${JUVENIL_ENTRY}
), nombres as materialized (
  ${NOMBRES_TECNICOS_SQL}
)
select n.nombre_norm, max(p.nombre_mostrado) as nombre, se.etiqueta as temporada, se.orden,
       cl.nombre_canonico as club, te.nombre_en_fuente as equipo, ce.categoria,
       ce.nombre_publicado as competicion, s.rol, s.team_entry_id,
       bool_or(not p.identidad_nominal and p.id in (select person_id from cuerpo)) as identidad_directa,
       (cl.id=(select ts0.club_id from core.team_entry te0 join core.team_season ts0 on ts0.id=te0.team_season_id where te0.id=${JUVENIL_ENTRY})) as mismo_club,
       count(distinct p.id) as fichas_nominales,
       count(distinct s.match_id) as partidos, pe.disponibles,
       count(distinct s.match_id) filter (where
         (m.home_team_entry_id = s.team_entry_id and m.goles_local > m.goles_visitante) or
         (m.away_team_entry_id = s.team_entry_id and m.goles_visitante > m.goles_local)) as victorias,
       count(distinct s.match_id) filter (where m.goles_local = m.goles_visitante) as empates,
       count(distinct s.match_id) filter (where
         (m.home_team_entry_id = s.team_entry_id and m.goles_local < m.goles_visitante) or
         (m.away_team_entry_id = s.team_entry_id and m.goles_visitante < m.goles_local)) as derrotas,
       coalesce(sum(case when m.home_team_entry_id = s.team_entry_id then m.goles_local
                         else m.goles_visitante end), 0) as gf,
       coalesce(sum(case when m.home_team_entry_id = s.team_entry_id then m.goles_visitante
                         else m.goles_local end), 0) as gc
from nombres n
join core.person p on p.nombre_norm = n.nombre_norm
join core.match_staff s on s.person_id = p.id
join core.match m on m.id = s.match_id and m.goles_local is not null
join core.team_entry te on te.id = s.team_entry_id
join core.team_season ts on ts.id = te.team_season_id
join core.club cl on cl.id = ts.club_id
join core.season se on se.id = ts.season_id
join core.phase_group pg on pg.id = te.phase_group_id
join core.competition_edition ce on ce.id = pg.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce')}
join lateral(select count(*) as disponibles from core.match m0
 where (m0.home_team_entry_id=te.id or m0.away_team_entry_id=te.id)
 and m0.goles_local is not null and m0.goles_visitante is not null) pe on true
where se.id <> ${TEMPORADA}
  and se.etiqueta >= '${DESDE_TEMPORADA}'
group by n.nombre_norm, se.etiqueta, se.orden, cl.id, cl.nombre_canonico, te.nombre_en_fuente, ce.categoria,
         ce.nombre_publicado, s.rol, s.team_entry_id, pe.disponibles
order by 2, 4 desc, 5, 6, 9`;

/*
 * CÓMO DIRIGÍA sus equipos anteriores: cambios y amonestaciones por partido.
 *
 * Es la parte que pidió el responsable del Pizarrales —«patrón de cuándo hace los cambios, de cuántas
 * amonestaciones tienen sus equipos por partido»— y por eso se mide SÓLO en los partidos en que el técnico
 * figura en el acta, igual que el balance de victorias: si se contara la temporada entera del equipo se le
 * estarían atribuyendo partidos que dirigió otro.
 *
 * Sólo se mira el cambio (`sale`), que es el que da el minuto: cada sustitución deja un `sale` y un `entra`.
 */
CONSULTAS.cuerpo_tecnico_anterior_equipo = `
with cuerpo as (
  select person_id from core.current_squad_member
   where team_entry_id=${JUVENIL_ENTRY} and role in ('coach','delegate') and person_id is not null
  union
  select distinct s.person_id from core.match_staff s where s.team_entry_id = ${JUVENIL_ENTRY}
), nombres as materialized (
  ${NOMBRES_TECNICOS_SQL}
), dirigidos as (
  select n.nombre_norm, max(p.nombre_mostrado) as nombre, s.team_entry_id, s.match_id, se.etiqueta as temporada, se.orden
  from nombres n
  join core.person p on p.nombre_norm = n.nombre_norm
  join core.match_staff s on s.person_id = p.id
  join core.team_entry te on te.id = s.team_entry_id
  join core.team_season ts on ts.id = te.team_season_id
  join core.season se on se.id = ts.season_id
  where s.rol ~* 'entrenador|coach|técnico|tecnico'
    and se.id <> ${TEMPORADA}
    and se.etiqueta >= '${DESDE_TEMPORADA}'
  group by n.nombre_norm,s.team_entry_id,s.match_id,se.etiqueta,se.orden
), medido as (
  select d.nombre_norm, max(d.nombre) as nombre, d.temporada, d.orden, d.team_entry_id,
         count(distinct d.match_id) as partidos,
         count(e.id) filter (where ${ES_AMARILLA('e')} and e.sujeto_tipo='jugador') as amarillas,
         count(e.id) filter (where e.event_type = 'tarjeta_roja' and e.sujeto_tipo='jugador') as rojas,
         count(e.id) filter (where e.event_type = 'sale') as cambios,
         round(avg(e.minute_base) filter (where e.event_type = 'sale' and e.minute_base between 0 and 120), 1) as minuto_medio_cambio,
         min(e.minute_base) filter (where e.event_type = 'sale' and e.minute_base between 0 and 120) as minuto_primer_cambio
  from dirigidos d
  left join core.match_event e on e.match_id = d.match_id and e.team_entry_id = d.team_entry_id
  group by d.nombre_norm, d.temporada, d.orden, d.team_entry_id
)
select m.*, cl.nombre_canonico as club, te.nombre_en_fuente as equipo, ce.categoria,
       ce.nombre_publicado as competicion
from medido m
join core.team_entry te on te.id = m.team_entry_id
join core.team_season ts on ts.id = te.team_season_id
join core.club cl on cl.id = ts.club_id
join core.phase_group pg on pg.id = te.phase_group_id
join core.competition_edition ce on ce.id = pg.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce')}
order by 1, 4 desc, 3 desc`;

/*
 * Goles y tarjetas DE CADA EQUIPO-TEMPORADA, para poder dar el porcentaje del jugador sobre su equipo.
 *
 * Los goles del equipo se cuentan por `lado_beneficiado` y no sumando los goles de sus jugadores: una propia
 * puerta es un gol del equipo rival que no marca nadie, y sumando jugadores se perdería. Medido: el juvenil
 * de 2025-26 tiene 59 goles a favor, que es lo que dice su clasificación.
 */
CONSULTAS.goles_y_tarjetas_del_equipo = `
with equipos as (
  select ${JUVENIL_ENTRY}::bigint as team_entry_id
  union
  select distinct a.team_entry_id from core.appearance a
   where a.person_id in (${PLANTILLA_PERSONAS_SQL})
)
select te.id as team_entry_id, s.etiqueta as temporada, te.nombre_en_fuente as equipo,
       count(distinct m.id) filter (where m.goles_local is not null) as partidos_con_resultado,
       count(e.id) filter (where e.event_type = 'gol') as goles,
       (select count(*) from core.match_event d where d.team_entry_id=te.id
          and ${ES_AMARILLA('d')} and d.sujeto_tipo='jugador') as amarillas,
       (select count(*) from core.match_event d where d.team_entry_id=te.id
          and d.event_type='tarjeta_roja' and d.sujeto_tipo='jugador') as rojas,
       not exists (
         select 1 from core.match gm
         where (gm.home_team_entry_id=te.id or gm.away_team_entry_id=te.id)
           and gm.goles_local is not null and gm.goles_visitante is not null
           and (select count(*) from core.match_event ge
                where ge.match_id=gm.id and ge.event_type='gol'
                  and ge.lado_beneficiado=case when gm.home_team_entry_id=te.id then 'local' else 'visitante' end)
               <> case when gm.home_team_entry_id=te.id then gm.goles_local else gm.goles_visitante end
       ) and not exists (
         select 1 from core.match gm
         join core.match_event ge on ge.match_id=gm.id and ge.event_type='gol'
         where (gm.home_team_entry_id=te.id or gm.away_team_entry_id=te.id)
           and (gm.goles_local is null or gm.goles_visitante is null)
       ) as goles_eventos_cuadran
  from equipos x
  join core.team_entry te on te.id = x.team_entry_id
  join core.team_season ts on ts.id = te.team_season_id
  join core.season s on s.id = ts.season_id
  left join lateral (
    select id,home_team_entry_id,goles_local from core.match where home_team_entry_id=te.id
    union all
    select id,home_team_entry_id,goles_local from core.match where away_team_entry_id=te.id
  ) m on true
  left join core.match_event e on e.match_id = m.id
    and e.lado_beneficiado = (case when m.home_team_entry_id = te.id then 'local' else 'visitante' end)
 group by 1, 2, 3 order by 2 desc, 3`;

/*
 * ── LA SECUENCIA DE PARTIDOS DE CADA JUGADOR, CON SUS TARJETAS ───────────────────────────────────────
 *
 * Una fila por partido jugado por su equipo (con resultado), en orden de jornada, diciendo si el jugador
 * apareció en el acta y qué tarjetas vio. Con eso se responde a «¿se perdió algún partido por sanción?» de
 * la única forma honesta que hay: **mirando si falta en los siguientes**. La federación no publica las
 * sanciones, así que el informe no puede afirmar que la hubo; puede decir que coincide.
 */
CONSULTAS.secuencia_de_partidos = `
with plantilla as (${PLANTILLA_PERSONAS_SQL}),
equipos as (
  select distinct a.person_id, a.team_entry_id from core.appearance a
   where a.person_id in (select person_id from plantilla)),
partidos as (
  select e.person_id, e.team_entry_id, m.id as match_id, md.numero as jornada,
         coalesce(m.played_at::date, m.fecha_prevista) as fecha,
         s.etiqueta as temporada, s.orden as temporada_orden
    from equipos e
    join core.team_entry te on te.id = e.team_entry_id
    join core.phase_group pg on pg.id=te.phase_group_id
    join core.competition_edition ce on ce.id=pg.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce')}
    join core.team_season ts on ts.id = te.team_season_id
    join core.season s on s.id = ts.season_id
    join core.match m on (m.home_team_entry_id = e.team_entry_id or m.away_team_entry_id = e.team_entry_id)
    join core.matchday md on md.id = m.matchday_id
   where m.goles_local is not null and s.etiqueta >= '${DESDE_TEMPORADA}')
select p.person_id, p.temporada, p.temporada_orden, p.team_entry_id, p.match_id, p.jornada, p.fecha,
       (a.id is not null) as consta_en_acta, a.condition,
       (a.condition='starter' or exists (
          select 1 from core.match_event cambio where cambio.match_id=p.match_id
            and cambio.person_id=p.person_id and cambio.team_entry_id=p.team_entry_id
            and cambio.event_type='entra' and cambio.sujeto_tipo='jugador'
       )) as participacion_confirmada,
       (a.id is not null) as jugo,
       (exists (select 1 from core.match_report informe where informe.match_id=p.match_id and informe.quality='correct')
        and (select count(*) from core.appearance comprobacion where comprobacion.match_id=p.match_id
         and comprobacion.team_entry_id=p.team_entry_id and comprobacion.condition='starter') >=
         coalesce((select ${jugadoresSql('ce_formato')}
           from core.team_entry te_formato
           join core.phase_group pg_formato on pg_formato.id=te_formato.phase_group_id
           join core.competition_edition ce_formato on ce_formato.id=pg_formato.competition_edition_id
           where te_formato.id=p.team_entry_id),11)) as alineacion_disponible,
       (select count(*) from core.match_event ev where ev.match_id = p.match_id and ev.person_id = p.person_id
          and ${ES_AMARILLA('ev')} and ev.team_entry_id=p.team_entry_id and ev.sujeto_tipo='jugador') as amarillas,
       (select count(*) from core.match_event ev where ev.match_id = p.match_id and ev.person_id = p.person_id
          and ev.event_type = 'tarjeta_roja' and ev.team_entry_id=p.team_entry_id and ev.sujeto_tipo='jugador') as rojas
  from partidos p
  left join core.appearance a on a.match_id = p.match_id and a.person_id = p.person_id
    and a.team_entry_id = p.team_entry_id
 order by p.person_id, p.temporada_orden desc, p.jornada`;

CONSULTAS.cuadre_minutos = `
-- El cuadre del método de minutos, equipo a equipo y temporada a temporada: los minutos derivados de
-- un equipo en un partido tienen que sumar jugadores × duración de SU formato (11 × 90 en fútbol 11,
-- 8 × 60 en un alevín de fútbol 8). Con formato sin minutos derivables (sala) el cuadre sale nulo. Se cuenta cuántos partidos cuadran y cuántos no,
-- en vez de dar un total que esconda los que fallan: medido el 24/09/2026, fallan 2 de 56 (uno con
-- tres tarjetas rojas y otro con un acta que trae una fila de suplente de más).
with aparicion as (
  select a.team_entry_id, a.season_id, a.match_id, a.condition,
    ${minutosSql(DURACION_PARTIDO_SQL)} as minutos
  from core.appearance a
  join core.team_entry te_d on te_d.id=a.team_entry_id
  join core.phase_group pg_d on pg_d.id=te_d.phase_group_id
  join core.competition_edition ce_d on ce_d.id=pg_d.competition_edition_id
  ${movimientosSql(DURACION_PARTIDO_SQL)}
  where a.team_entry_id in (${JUVENIL_ENTRY}, ${JUVENIL_ENTRY_2025}, ${MAYORES.map((m) => m.entry).join(", ")})
), por_partido as (
  select team_entry_id, season_id, match_id,
         count(*) filter (where condition = 'starter') as titulares,
         sum(minutos) as minutos
  from aparicion group by team_entry_id, season_id, match_id
)
select s.etiqueta as temporada, pp.team_entry_id,
       count(*) as partidos,
       count(*) filter (where pp.minutos = ${JUGADORES_PARTIDO_SQL} * ${DURACION_PARTIDO_SQL} and pp.titulares = ${JUGADORES_PARTIDO_SQL}) as partidos_cuadrados,
       count(*) filter (where pp.minutos <> ${JUGADORES_PARTIDO_SQL} * ${DURACION_PARTIDO_SQL} or pp.titulares <> ${JUGADORES_PARTIDO_SQL}) as partidos_descuadrados,
       sum(pp.minutos) as minutos_derivados,
       count(*) * ${JUGADORES_PARTIDO_SQL} * ${DURACION_PARTIDO_SQL} as minutos_esperados,
       sum(pp.minutos) - count(*) * ${JUGADORES_PARTIDO_SQL} * ${DURACION_PARTIDO_SQL} as desviacion,
       max(${JUGADORES_PARTIDO_SQL}) as jugadores_por_equipo
from por_partido pp join core.season s on s.id = pp.season_id
join core.team_entry te_d on te_d.id=pp.team_entry_id
join core.phase_group pg_d on pg_d.id=te_d.phase_group_id
join core.competition_edition ce_d on ce_d.id=pg_d.competition_edition_id
group by s.etiqueta, s.orden, pp.team_entry_id, ce_d.categoria, ce_d.modalidad
order by s.orden desc, pp.team_entry_id`;

CONSULTAS.goles_del_partido = `
-- Quién marcó cada gol del grupo, con su equipo, para poder contarlo en el informe sin enseñar
-- identificadores. Los goles en propia puerta se marcan como tales: el acta los apunta al lado
-- beneficiado y no se le atribuyen al jugador como mérito propio.
select e.match_id, e.source_order, e.subtipo, e.lado_beneficiado,
       e.minute_base, e.minute_added,
       coalesce(p.nombre_mostrado, '(sin identificar)') as quien,
       te.nombre_en_fuente as equipo
from core.match_event e
left join core.person p on p.id = e.person_id
left join core.team_entry te on te.id = e.team_entry_id
where e.event_type = 'gol'
  and e.match_id in (select m.id from core.match m
    where m.phase_group_id = (select pg.id from core.team_entry te2
      join core.phase_group pg on pg.id = te2.phase_group_id where te2.id = ${JUVENIL_ENTRY}))
order by e.match_id, e.source_order`;

CONSULTAS.base_historial = `
-- Sobre QUÉ se ha buscado a los jugadores en la temporada pasada. Esto no es adorno: el informe del
-- 24/09/2026 afirmaba que Adrián Pereira había jugado 1 partido cuando había jugado 23, porque sólo había
-- 5 grupos de 2025-26 importados de los 193 que había recolectados. Poner el tamaño de la base delante es
-- lo que hace visible un hueco así: si el número es pequeño, la comparación no vale.
--
-- Se acota a la MISMA federación que el equipo: lo que un jugador de Salamanca hiciera en Cataluña no
-- depende de este archivo y contarlo aquí sólo inflaría la cifra.
select count(distinct m.id) as partidos, count(distinct ce.id) as competiciones,
       count(distinct pg.id) as grupos, count(distinct a.person_id) as personas
from core.competition_edition ce
join core.phase_group pg on pg.competition_edition_id = ce.id
left join core.match m on m.phase_group_id = pg.id
left join core.appearance a on a.match_id = m.id
where ce.season_id = ${TEMPORADA_ANTERIOR}
  and ce.federation_id = (select ce2.federation_id from core.competition_edition ce2
    join core.phase_group pg2 on pg2.competition_edition_id = ce2.id
    join core.team_entry te2 on te2.phase_group_id = pg2.id where te2.id = ${JUVENIL_ENTRY})`;

CONSULTAS.historia_equipo = `
-- Candidatas del mismo club y categoría en TODAS las temporadas. Tras consultar se filtran
-- por código federativo y sección A/B/C, para no atribuir la trayectoria de B o A al equipo C.
--
-- No se usa la clasificación para esto: se cuenta lo que el equipo hizo, partido a partido. Así funciona
-- también en las temporadas de las que sólo hay resultados y ninguna tabla publicada.
--
-- OJO con la categoría: se compara por la de la EDICIÓN, no la de team_season, que dice 'aficionados'
-- para equipos juveniles y mezcla equipos del mismo club en una sola fila.
--
-- OJO TAMBIÉN con las dos agregaciones: los partidos y los jugadores se cuentan EN CONSULTAS SEPARADAS.
-- Hacerlo en una sola con dos left join multiplica: cada partido se cuenta una vez por cada aparición.
-- Medido el 24/09/2026: así salían «10.764 partidos» en una temporada de 26.
with equipos as (
  select te.id as team_entry, te.codigo_externo as equipo_codigo, pg.id as grupo, s.etiqueta as temporada, s.orden as orden,
         ce.nombre_publicado as competicion, ce.categoria as categoria,
         te.nombre_en_fuente as equipo_en_fuente
  from core.team_entry te
  join core.team_season ts on ts.id = te.team_season_id
  join core.season s on s.id = ts.season_id
  join core.phase_group pg on pg.id = te.phase_group_id
  join core.competition_edition ce on ce.id = pg.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce')}
  where ts.club_id = (select ts2.club_id from core.team_entry te2
          join core.team_season ts2 on ts2.id = te2.team_season_id where te2.id = ${JUVENIL_ENTRY})
    and ce.categoria = (select ce2.categoria from core.competition_edition ce2
          join core.phase_group pg2 on pg2.competition_edition_id = ce2.id
          join core.team_entry te2 on te2.phase_group_id = pg2.id where te2.id = ${JUVENIL_ENTRY})
    and s.etiqueta >= '${DESDE_TEMPORADA}'
),
resultados as (
  select e.team_entry,
         count(m.id) as partidos,
         count(m.id) filter (where m.goles_local is not null) as con_resultado,
         count(m.id) filter (where (m.home_team_entry_id = e.team_entry and m.goles_local > m.goles_visitante)
                               or (m.away_team_entry_id = e.team_entry and m.goles_visitante > m.goles_local)) as ganados,
         count(m.id) filter (where m.goles_local is not null and m.goles_local = m.goles_visitante) as empatados,
         count(m.id) filter (where (m.home_team_entry_id = e.team_entry and m.goles_local < m.goles_visitante)
                               or (m.away_team_entry_id = e.team_entry and m.goles_visitante < m.goles_local)) as perdidos,
         coalesce(sum(case when m.home_team_entry_id = e.team_entry then m.goles_local
                           when m.away_team_entry_id = e.team_entry then m.goles_visitante end), 0) as goles_favor,
         coalesce(sum(case when m.home_team_entry_id = e.team_entry then m.goles_visitante
                           when m.away_team_entry_id = e.team_entry then m.goles_local end), 0) as goles_contra
  from equipos e
  join core.match m on m.phase_group_id = e.grupo
    and (m.home_team_entry_id = e.team_entry or m.away_team_entry_id = e.team_entry)
  group by e.team_entry
),
jugadores as (
  select e.team_entry, count(distinct a.person_id) as jugadores_con_acta
  from equipos e
  join core.appearance a on a.team_entry_id = e.team_entry
  group by e.team_entry
)
select e.temporada, e.competicion, e.categoria, e.team_entry, e.equipo_codigo, e.equipo_en_fuente,
       coalesce(r.partidos, 0) as partidos, coalesce(r.con_resultado, 0) as con_resultado,
       coalesce(r.ganados, 0) as ganados, coalesce(r.empatados, 0) as empatados, coalesce(r.perdidos, 0) as perdidos,
       coalesce(r.goles_favor, 0) as goles_favor, coalesce(r.goles_contra, 0) as goles_contra,
       coalesce(j.jugadores_con_acta, 0) as jugadores_con_acta
from equipos e
left join resultados r on r.team_entry = e.team_entry
left join jugadores j on j.team_entry = e.team_entry
order by e.orden desc`;

/*
 * ── LO QUE SE QUEDA FUERA POR NO ESTAR COMPLETO (regla §5.4.1 de la guía) ──────────────────────────────
 *
 * El informe no enseña una competición a medias, pero tampoco la esconde: dice cuáles deja fuera y por qué.
 * Es la diferencia entre «no hay datos» y «no se cuentan porque faltan», que el responsable del informe pidió
 * expresamente el 25/09/2026: si una competición está a la mitad, no puede ser accesible todavía.
 *
 * Dos ámbitos, porque son dos tablas distintas: las competiciones del club en esta categoría (historia del
 * equipo) y las que aparecen en el historial de estos jugadores concretos.
 */
CONSULTAS.ediciones_incompletas_club = `
select s.etiqueta as temporada, ce.nombre_publicado as competicion, ce.visibility_state,
       count(distinct m.id) filter (where m.goles_local is not null) as con_resultado,
       max(pg.jornadas_previstas) as jornadas_previstas
from core.competition_edition ce
join core.season s on s.id = ce.season_id
join core.phase_group pg on pg.competition_edition_id = ce.id
join core.team_entry te on te.phase_group_id = pg.id
join core.team_season ts on ts.id = te.team_season_id
left join core.match m on m.phase_group_id = pg.id
where ts.club_id = (select ts2.club_id from core.team_entry te2
        join core.team_season ts2 on ts2.id = te2.team_season_id where te2.id = ${JUVENIL_ENTRY})
  and ce.categoria = (select ce2.categoria from core.competition_edition ce2
        join core.phase_group pg2 on pg2.competition_edition_id = ce2.id
        join core.team_entry te2 on te2.phase_group_id = pg2.id where te2.id = ${JUVENIL_ENTRY})
  and s.etiqueta >= '${DESDE_TEMPORADA}'
  and s.id <> ${TEMPORADA}
  and not exists(select 1 from ops.coverage_checkpoint where phase_group_id=pg.id and visibility_state='completa' and completitud_historica)
group by s.etiqueta, s.orden, ce.nombre_publicado, ce.visibility_state
order by s.orden desc, con_resultado desc`;

CONSULTAS.ediciones_incompletas_plantilla = `
with plantilla as (${PLANTILLA_PERSONAS_SQL})
select s.etiqueta as temporada, ce.nombre_publicado as competicion, ce.visibility_state,
       count(distinct ap.person_id) as personas, count(*) as apariciones
from core.appearance ap
join plantilla pl on pl.person_id = ap.person_id
join core.season s on s.id = ap.season_id
join core.team_entry te on te.id = ap.team_entry_id
join core.phase_group pg on pg.id = te.phase_group_id
join core.competition_edition ce on ce.id = pg.competition_edition_id
where s.etiqueta >= '${DESDE_TEMPORADA}'
  and s.id <> ${TEMPORADA}
  and not exists(select 1 from ops.coverage_checkpoint where phase_group_id=pg.id and visibility_state='completa' and completitud_historica)
group by s.etiqueta, s.orden, ce.nombre_publicado, ce.visibility_state
order by s.orden desc, apariciones desc`;

CONSULTAS.eventos_dashboard = `
select e.id,e.match_id,e.person_id,e.team_entry_id,e.event_type,e.subtipo,e.sujeto_tipo,
       e.minute_base,e.minute_added,e.lado_beneficiado,p.nombre_mostrado as nombre,
       j.numero as jornada,m.fecha_prevista,m.home_team_entry_id,m.away_team_entry_id
from core.match m join core.matchday j on j.id=m.matchday_id
join core.match_event e on e.match_id=m.id left join core.person p on p.id=e.person_id
where m.home_team_entry_id=${JUVENIL_ENTRY} or m.away_team_entry_id=${JUVENIL_ENTRY}
order by m.fecha_prevista,j.numero,e.source_order`;

CONSULTAS.disciplina_dashboard = `
with personas as (${PLANTILLA_PERSONAS_SQL})
select e.person_id,e.team_entry_id,s.etiqueta as temporada,
 count(*) filter(where ${ES_AMARILLA('e')}) as amarillas,
 count(*) filter(where e.event_type='tarjeta_roja' and coalesce(e.subtipo,'') <> 'doble_amarilla') as rojas_directas,
 count(*) filter(where e.event_type='tarjeta_roja' and e.subtipo='doble_amarilla') as dobles_amarillas,
 count(*) filter(where e.event_type='tarjeta_roja') as rojas
from core.match_event e join personas p on p.person_id=e.person_id
join core.team_entry te on te.id=e.team_entry_id join core.phase_group g on g.id=te.phase_group_id
join core.competition_edition ce on ce.id=g.competition_edition_id join core.season s on s.id=ce.season_id
where e.event_type in ('tarjeta_amarilla','tarjeta_roja') and e.sujeto_tipo='jugador'
and s.etiqueta>='${DESDE_TEMPORADA}' and ${SQL_INGESTA_COMPLETA('ce','g')}
group by e.person_id,e.team_entry_id,s.etiqueta`;

CONSULTAS.historial = `
-- DÓNDE JUGÓ CADA UNO, temporada a temporada y equipo a equipo. Es la respuesta a «jugara donde
-- jugara»: se recorre TODAS las apariciones de esas personas, en cualquier club y cualquier
-- categoría, incluidas las del sénior. Se agrupa por inscripción (team_entry_id), no por club.
with plantilla as (
  ${PLANTILLA_PERSONAS_SQL}
)
select ap.person_id, s.etiqueta as temporada, te.id as team_entry, ts.id as team_season,
       cl.nombre_canonico as club, te.nombre_en_fuente as equipo, ce.categoria as categoria,
       ce.nombre_publicado as competicion,
       (ts.club_id = (select ts2.club_id from core.team_entry te2
          join core.team_season ts2 on ts2.id = te2.team_season_id where te2.id = ${JUVENIL_ENTRY})) as es_mismo_club,
       case when te.id in (${MAYORES.map((m) => m.entry).join(", ")}) then true else false end as es_senior,
       case when te.id = ${JUVENIL_ENTRY} or te.id = ${JUVENIL_ENTRY_2025} then true else false end as es_juvenil_de_este_club,
       count(*) as apariciones,
       count(*) filter (where ap.condition = 'starter') as titularidades,
       count(*) filter (where ap.condition = 'substitute') as suplencias,
       -- Dorsales de esa temporada en ESE equipo, del más usado al menos: «7:12,16:2» = el 7 en 12 actas y el 16
       -- en 2. Lo que publica el acta; null si la federación no lo publica.
       (select string_agg(x.dorsal::text || ':' || x.n, ',' order by x.n desc, x.dorsal)
          from (select a3.dorsal, count(*) n from core.appearance a3
                 where a3.person_id = ap.person_id and a3.team_entry_id = te.id and a3.dorsal is not null
                 group by a3.dorsal) x) as dorsales_frecuencia,
       (select count(*) from core.match_event e where e.person_id = ap.person_id and e.event_type = 'gol' and e.subtipo is distinct from 'propia_puerta'
          and e.team_entry_id = te.id and e.match_id in
            (select match_id from core.appearance a2 where a2.person_id = ap.person_id and a2.team_entry_id = te.id)) as goles,
       (select count(*) from core.match_event e where e.person_id = ap.person_id and e.sujeto_tipo='jugador' and ${ES_AMARILLA('e')}
          and e.team_entry_id = te.id and e.match_id in
            (select match_id from core.appearance a2 where a2.person_id = ap.person_id and a2.team_entry_id = te.id)) as amarillas,
       (select count(*) from core.match_event e where e.person_id = ap.person_id and e.event_type = 'tarjeta_roja'
          and e.team_entry_id = te.id and e.match_id in
            (select match_id from core.appearance a2 where a2.person_id = ap.person_id and a2.team_entry_id = te.id)) as rojas
from core.appearance ap
join plantilla pl on pl.person_id = ap.person_id
join core.season s on s.id = ap.season_id
join core.team_entry te on te.id = ap.team_entry_id
join core.team_season ts on ts.id = te.team_season_id
join core.club cl on cl.id = ts.club_id
join core.phase_group pg on pg.id = te.phase_group_id
join core.competition_edition ce on ce.id = pg.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce')}
where s.etiqueta >= '${DESDE_TEMPORADA}'
group by ap.person_id, s.etiqueta, s.orden, te.id, ts.id, cl.nombre_canonico, ts.nombre, ce.categoria, ce.nombre_publicado
order by ap.person_id, s.orden desc, count(*) desc`;

CONSULTAS.clasificacion = `
-- La tabla del grupo tras la jornada jugada, en sus DOS orígenes. La oficial publica los goles a
-- cero (la columna es NOT NULL y la vista resumen no los trae): la web no los enseña y aquí tampoco.
select so.origen, so.posicion, so.puntos, so.jugados, so.ganados, so.empatados, so.perdidos,
       so.goles_favor, so.goles_contra, coalesce(te.nombre_en_fuente,c.nombre_canonico) as equipo, te.id as team_entry,
       j.numero as jornada_de_corte, cp.tabla_oficial_corte_completo
from core.standing_snapshot so
join core.team_entry te on te.id = so.team_entry_id
join core.team_season ts on ts.id = te.team_season_id
join core.club c on c.id = ts.club_id
join core.matchday j on j.id = so.matchday_id
left join ops.coverage_checkpoint cp on cp.phase_group_id=so.phase_group_id
where so.phase_group_id = (select pg.id from core.team_entry te join core.phase_group pg on pg.id = te.phase_group_id
                           where te.id = ${JUVENIL_ENTRY})
order by so.origen, so.posicion`;

CONSULTAS.cruce_senior = `
-- EL CRUCE QUE IMPORTA: quién de la plantilla ha jugado ya en un equipo de categoría superior del club,
-- en esta temporada o en la anterior. Se compara por persona, que es lo que la identidad resuelve.
with plantilla as (
  ${PLANTILLA_PERSONAS_SQL}
)
select p.id as person_id, p.nombre_mostrado as nombre, s.etiqueta as temporada,
       te.id as team_entry, ce.nombre_publicado as competicion, ce.categoria as categoria,
       count(*) as apariciones,
       count(*) filter (where ap.condition = 'starter') as titularidades,
       (select count(*) from core.match_event e where e.person_id = p.id and e.event_type = 'gol'
          and e.team_entry_id = te.id) as goles,
       min(m.fecha_prevista) as primera, max(m.fecha_prevista) as ultima
from core.appearance ap
join plantilla pl on pl.person_id = ap.person_id
join core.person p on p.id = ap.person_id
join core.season s on s.id = ap.season_id
join core.team_entry te on te.id = ap.team_entry_id
join core.phase_group pg on pg.id = te.phase_group_id
join core.competition_edition ce on ce.id = pg.competition_edition_id and ${SQL_INGESTA_COMPLETA('ce')}
join core.match m on m.id = ap.match_id
where te.id in (${MAYORES.map((m) => m.entry).join(", ")})
group by p.id, p.nombre_mostrado, s.etiqueta, s.orden, te.id, ce.nombre_publicado, ce.categoria
order by p.nombre_mostrado, s.orden desc`;

CONSULTAS.trayectoria_de_la_plantilla = `
-- Cuánto archivo hay de cada integrante de la plantilla: apariciones, temporadas y primera/última
-- temporada con datos, en TODO el canónico. No filtra por temporada: quién no aparece en la temporada
-- anterior lo calcula el motor (\`procedencia.sinDatos2025\`) con la etiqueta anterior real, no 2025-26 fija.
with plantilla as (
  ${PLANTILLA_PERSONAS_SQL}
)
select p.id as person_id, p.nombre_mostrado as nombre,
       (select count(*) from core.appearance a where a.person_id = p.id) as apariciones_totales,
       (select count(distinct a.season_id) from core.appearance a where a.person_id = p.id) as temporadas_con_datos,
       (select min(s.etiqueta) from core.appearance a join core.season s on s.id = a.season_id
          where a.person_id = p.id) as primera_temporada,
       (select max(s.etiqueta) from core.appearance a join core.season s on s.id = a.season_id
          where a.person_id = p.id) as ultima_temporada
from plantilla pl join core.person p on p.id = pl.person_id
order by p.nombre_mostrado`;

/* ══ MOTOR ═════════════════════════════════════════════════════════════════════════════════════════ */
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => (v === null || v === undefined ? null : Number(v));
const nulo = (v) => (v === null || v === undefined ? '—' : String(v));
// Duración reglamentaria: una sola definición, en lib/informe-formato.mjs.
const duracionCategoria = (categoria) => formatoPartido({ categoria }).duracion;

/**
 * Las tarjetas de una temporada, resumidas: `3 A · 1 R`.
 *
 * `sanciones` es lo que se ha podido OBSERVAR de esa persona en esa temporada y equipo (ver
 * `secuencia_de_partidos`): las amarillas acumuladas están ahí porque el acumulado es lo que hace falta para
 * saber si llegó a cinco, y las rojas porque son el otro motivo de sanción.
 */
function marcasDeTarjetas(sanciones) {
  if (!sanciones) return '—';
  const amarillas = Number(sanciones.amarillas ?? 0);
  const rojas = (sanciones.rojas ?? []).length;
  if (amarillas === 0 && rojas === 0) return '—';
  const partes = [];
  if (amarillas > 0) partes.push(`${amarillas} A`);
  if (rojas > 0) partes.push(`${rojas} R`);
  return partes.join(' · ');
}

/**
 * Qué se vio DESPUÉS de una roja o de la quinta amarilla, dicho como lo que es: una coincidencia.
 *
 * La federación no publica las sanciones, así que el informe no puede decir «cumplió un partido de sanción».
 * Puede decir que **no aparece en el acta siguiente**, que es un hecho del archivo, y cuántas veces pasa.
 */
function textoDeSanciones(sanciones) {
  if (!sanciones) return '—';
  const partes = [];
  for (const roja of sanciones.rojas ?? []) {
    const cuantos = roja.ausencias === 1 ? 'el siguiente' : `los ${roja.ausencias} siguientes`;
    partes.push(roja.ausencias === 0
      ? `roja en la J${roja.jornada} y **sí** juega el siguiente`
      : `roja en la J${roja.jornada}: no aparece en ${cuantos}`);
  }
  for (const quinta of sanciones.quintas ?? []) {
    partes.push(quinta.ausente === null
      ? `quinta amarilla en la J${quinta.jornada} (último partido del archivo)`
      : quinta.ausente
        ? `quinta amarilla en la J${quinta.jornada}: no aparece en la siguiente`
        : `quinta amarilla en la J${quinta.jornada} y juega la siguiente`);
  }
  return partes.length === 0 ? '—' : partes.join('; ');
}
/**
 * Nombre legible de una inscripción.
 *
 * OJO: `pg` devuelve `bigint` como TEXTO (no cabe en un `number` de JS), así que comparar
 * `team_entry_id === 8873` con el número nunca casa. Comparar contra `String(...)`.
 */
const etiquetaEquipo = (teamEntryId) => {
  const id = String(teamEntryId);
  if (id === String(JUVENIL_ENTRY)) return 'el equipo informado';
  if (id === String(JUVENIL_ENTRY_2025)) return 'el mismo equipo la temporada pasada';
  const mayor = MAYORES.find((m) => String(m.entry) === id);
  if (mayor !== undefined) return mayor.etiqueta;
  return `inscripción ${id}`;
};

/**
 * Fecha en AAAA-MM-DD, en hora LOCAL.
 *
 * OJO: `toISOString()` NO sirve aquí. El driver devuelve una columna `date` como un `Date` a medianoche
 * local, y en Madrid (UTC+2) eso es las 22:00 del día ANTERIOR en UTC: convertir a ISO y cortar los diez
 * primeros caracteres adelanta la fecha un día. Se comprobó con la jornada 1 del juvenil, jugada el
 * 19/09/2026, que salía fechada el 18. Se formatea con los componentes locales.
 */
const fecha = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

async function main() {
  /*
   * Todas las consultas ven la MISMA foto de la base (REPEATABLE READ), como antes; ahora repartidas
   * entre varias conexiones que importan esa foto (lib/consultas-en-foto.mjs). Con --conexiones 1 el
   * comportamiento es el de siempre, en serie. Medido: 8 consultas de 0,5 s pasan de 4,0 s a 1,0 s.
   */
  const conexiones = Number(arg('conexiones', process.env.FACYLF_INFORME_CONEXIONES ?? 4));
  const { filas: res, tiempos } = await ejecutaEnFoto(pg, URL, CONSULTAS, {
    conexiones, aplicacion: 'facylf-informe', limite: '120s',
    // Medianas medidas en las 8 instantáneas del 27/09 (ms): las lentas arrancan primero.
    tiemposPrevios: { cuerpo_tecnico_por_nombre: 2200, peso_en_su_equipo: 2000, cuerpo_tecnico: 1700,
      goles_y_tarjetas_del_equipo: 1100, minutos_historial: 400, base_historial: 400, secuencia_de_partidos: 200 },
    antesDeRepartir: async (cliente) => {
    const { rows: [ambito] } = await cliente.query(`select s.etiqueta, (select visibility_state from ops.coverage_checkpoint where phase_group_id=g.id) visibility_state
      from core.team_entry te join core.phase_group g on g.id=te.phase_group_id
      join core.competition_edition ce on ce.id=g.competition_edition_id
      join core.season s on s.id=ce.season_id where te.id=$1`, [JUVENIL_ENTRY]);
    if (!ambito || !elegible(ambito.etiqueta, ambito.visibility_state)) throw Error('Competición histórica incompleta o fuera del periodo permitido.');
    const inicio = Number(ambito.etiqueta.slice(0,4));
    ETIQUETA_ANTERIOR = `${inicio-1}-${String(inicio).slice(-2)}`;
    },
  });

  // PostgreSQL devuelve `date` como Date a medianoche local. Serializarlo como JSON
  // lo pasaría a UTC y puede mostrar el día anterior en el dashboard.
  for (const [consulta, columna] of [
    ['partidos_temporada', 'fecha_prevista'],
    ['jornada1', 'fecha_prevista'],
    ['eventos_dashboard', 'fecha_prevista'],
    ['secuencia_de_partidos', 'fecha'],
  ]) for (const fila of res[consulta] ?? []) if (fila[columna] instanceof Date) fila[columna] = fecha(fila[columna]);

  const contexto = res.contexto[0];
  const equipoActual={club_id:contexto.club,club:contexto.club_nombre,categoria:contexto.categoria,
    equipo:contexto.nombre_en_fuente,codigo_externo:contexto.codigo_equipo};
  res.historia_equipo=res.historia_equipo.filter(x=>mismoEquipoHistorico(equipoActual,
    {club_id:contexto.club,club:contexto.club_nombre,categoria:x.categoria,
     equipo:x.equipo_en_fuente,codigo_externo:x.equipo_codigo}));
  const cobertura = res.cobertura[0];
  const plantilla = res.plantilla;
  const historial = res.historial;
  const cruce = res.cruce_senior;

  // Minutos derivados por persona y temporada: es lo que permite comparar 2025-26 con 2026-27 sin
  // mezclar unidades.
  const minutosPorPersona = new Map();
  for (const m of res.minutos_historial) {
    if (!minutosPorPersona.has(m.person_id)) minutosPorPersona.set(m.person_id, []);
    minutosPorPersona.get(m.person_id).push(m);
  }
  const minutosDe = (personId, temporada) =>
    (minutosPorPersona.get(personId) ?? []).filter((m) => m.temporada === temporada)
      .reduce((n, m) => n + Number(m.minutos), 0);
  // Minutos por persona, temporada e inscripción: es lo que permite poner minutos en cada fila del
  // historial sin volver a consultar la base.
  const minutosExactos = new Map();
  for (const m of res.minutos_historial) {
    minutosExactos.set(`${m.person_id}:${m.temporada}:${m.team_entry_id}`, Number(m.minutos));
  }
  const minutosDeEquipo = (personId, temporada, teamEntryId) =>
    minutosExactos.get(`${personId}:${temporada}:${teamEntryId}`) ?? null;

  // El cuadre que hace creíbles los minutos: los de un partido con alineación completa suman
  // jugadores × duración de su formato. Sin minutos derivables (sala) no hay cuadre que afirmar.
  const formato = formatoPartido(contexto);
  const partidosConAlineacion = Number(cobertura.partidos_con_alineacion);
  const totalMinutos = plantilla.reduce((n, j) => n + Number(j.minutos_derivados), 0);
  const minutosEsperados = formato.minutosCalculables ? partidosConAlineacion * formato.jugadores * formato.duracion : null;
  const cuadraMinutos = minutosEsperados === null ? null : totalMinutos === minutosEsperados;

  // Dónde jugó cada uno: se indexa por persona para poder resumirlo en su ficha.
  const porPersona = new Map();
  for (const h of historial) {
    if (!porPersona.has(h.person_id)) porPersona.set(h.person_id, []);
    porPersona.get(h.person_id).push(h);
  }

  /*
   * ── EL PESO EN SU EQUIPO, Y LAS TARJETAS ────────────────────────────────────────────────────────────
   *
   * Por (persona, temporada, inscripción): minutos y su porcentaje sobre los del equipo, y goles y su
   * porcentaje sobre los del equipo. Se indexa por persona y temporada, y también por persona+temporada+
   * inscripción para poder pintar cada fila de la trayectoria con SUS números.
   */
  const equipoPorClave = new Map();
  for (const g of res.goles_y_tarjetas_del_equipo) {
    equipoPorClave.set(`${g.temporada}:${g.team_entry_id}`, g);
  }
  const pesoPorClave = new Map();
  for (const p of res.peso_en_su_equipo) {
    pesoPorClave.set(`${p.person_id}:${p.temporada}:${p.team_entry_id}`, p);
  }

  /*
   * Los partidos de cada jugador con sus tarjetas, para poder mirar lo que pasa DESPUÉS de una roja o de
   * cinco amarillas. Se cuenta lo observable —cuántas veces no aparece en el siguiente— y se dice así en el
   * informe: la federación no publica sanciones, así que afirmarlas sería inventar.
   */
  const sancionesPorClave = resumeDisciplina(res.secuencia_de_partidos);
  const seniorPorPersona = new Map();
  for (const c of cruce) {
    if (!seniorPorPersona.has(c.person_id)) seniorPorPersona.set(c.person_id, []);
    seniorPorPersona.get(c.person_id).push(c);
  }

  // Procedencia: de dónde viene cada uno de la plantilla de este año, mirando 2025-26. Se distinguen
  // cuatro casos que para un entrenador NO son lo mismo: seguir en el mismo equipo, haber subido desde
  // otra categoría del club, haber llegado de otro club, o no aparecer en el archivo.
  const procedencia = { juvenil: [], senior: [], mismaCasaOtraCategoria: [], otroClub: [], sinDatos2025: [] };
  for (const j of plantilla) {
    const filas2025 = (porPersona.get(j.person_id) ?? []).filter((h) => h.temporada === ETIQUETA_ANTERIOR);
    if (filas2025.length === 0) { procedencia.sinDatos2025.push(j); continue; }
    if (filas2025.some((f) => f.es_juvenil_de_este_club)) procedencia.juvenil.push(j);
    if (filas2025.some((f) => f.es_senior)) procedencia.senior.push(j);
    const otrasCategorias = filas2025.filter((f) => !f.es_juvenil_de_este_club && !f.es_senior);
    if (otrasCategorias.some((f) => f.es_mismo_club)) procedencia.mismaCasaOtraCategoria.push(j);
    if (otrasCategorias.some((f) => !f.es_mismo_club)) procedencia.otroClub.push(j);
  }

  // Los goles de cada partido, listos para contar: quién, en qué minuto y de qué equipo.
  const golesDelPartido = new Map();
  for (const g of res.goles_del_partido) {
    const minuto = g.minute_added ? `${g.minute_base}+${g.minute_added}'` : `${g.minute_base}'`;
    if (!golesDelPartido.has(g.match_id)) golesDelPartido.set(g.match_id, []);
    golesDelPartido.get(g.match_id).push({
      quien: g.quien,
      minuto,
      equipo: g.equipo,
      propiaPuerta: g.subtipo === 'propia_puerta',
      penalti: g.subtipo === 'penalti',
    });
  }

  const contextoInforme = {
    contexto, cobertura, plantilla, historial, porPersona, seniorPorPersona, procedencia,
    jornada1: res.jornada1, clasificacion: res.clasificacion, trayectoriaPlantilla: res.trayectoria_de_la_plantilla,
    resumenLiga: res.resumen_liga,
    cruce, minutosPorPersona, minutosDe, minutosDeEquipo, cuadreMinutos: res.cuadre_minutos,
    partidosConAlineacion, totalMinutos, minutosEsperados, cuadraMinutos, golesDelPartido,
    baseHistorial: res.base_historial?.[0] ?? null,
    historiaEquipo: res.historia_equipo,
    edicionesIncompletasClub: res.ediciones_incompletas_club ?? [],
    edicionesIncompletasPlantilla: res.ediciones_incompletas_plantilla ?? [],
    partidosTemporada: res.partidos_temporada ?? [],
    cuerpoTecnico: res.cuerpo_tecnico,
    cuerpoTecnicoAnterior: res.cuerpo_tecnico_por_nombre ?? [],
    cuerpoTecnicoAnteriorEquipo: res.cuerpo_tecnico_anterior_equipo ?? [],
    plantillaPublicada: res.plantilla_publicada,
    escudoClub: res.escudo_club?.[0] ?? null,
    pesoPorClave, equipoPorClave, sancionesPorClave,
    generadoEn: new Date().toISOString(),
  };

  const instantanea = {version:2,titulo:TITULO,slug:SLUG,
    generadoEn:contextoInforme.generadoEn,tiemposMs:tiempos,datos:res};
  if(argumentos.includes('--stdout-json')) {
    process.stdout.write(JSON.stringify(instantanea));
    return;
  }
  mkdirSync(SALIDA, { recursive: true });
  writeFileSync(join(SALIDA, `${SLUG}.datos.json`), JSON.stringify(instantanea, null, 2));
  mkdirSync(join(SALIDA,'dashboard'),{recursive:true});
  writeFileSync(join(SALIDA,'dashboard',`${SLUG}.html`),renderDashboard(instantanea,{photo:(person,season)=>{
    for(const ext of ['jpg','jpeg','png','webp']){
      const path=join(SALIDA,'fotos',`${SLUG}-${person}-${season}.${ext}`);
      if(existsSync(path))return `data:image/${ext==='jpg'?'jpeg':ext};base64,${readFileSync(path).toString('base64')}`;
    }
    return null;
  }}));

  // 1. Las consultas, tal cual se ejecutaron.
  const sql = [
    `-- Consultas del informe de ${TITULO}.`,
    `-- Generadas por scripts/informe-ciudad-rodrigo-juvenil.mjs el ${contextoInforme.generadoEn}.`,
    '-- Rol: facylf_lector (sólo lectura).',
    '',
    ...Object.entries(CONSULTAS).flatMap(([nombre, texto]) => [`-- ${'─'.repeat(100)}`, `-- ${nombre}`, `-- ${'─'.repeat(100)}`, `${texto.trim()};`, '']),
  ].join('\n');
  writeFileSync(join(SALIDA, `${SLUG}.consultas.sql`), `${sql}\n`);

  const markdown = componeMarkdown(contextoInforme);
  writeFileSync(join(SALIDA, `${SLUG}.md`), conFotosMarkdown(markdown));

  const html = componeHtml(contextoInforme);
  const rutaHtml = join(SALIDA, `${SLUG}.html`);
  writeFileSync(rutaHtml, html);

  // El PDF se imprime del HTML, que es el que lleva las gráficas en SVG.
  const carpetaPdf = join(RAIZ, 'output', 'pdf');
  mkdirSync(carpetaPdf, { recursive: true });
  const nombrePdf = `${SLUG}-${Date.now()}.pdf`;
  const rutaPdf = join(carpetaPdf, nombrePdf);
  let pdf = null;
  try {
    if (!argumentos.includes('--sin-pdf')) {
      await imprimePdf(rutaHtml, rutaPdf);
      pdf = `output/pdf/${nombrePdf}`;
      instantanea.pdfArchivo = nombrePdf;
      writeFileSync(join(SALIDA, `${SLUG}.datos.json`), JSON.stringify(instantanea, null, 2));
    }
  } catch (error) {
    throw new Error(`PDF no actualizado: ${error.message}`);
  }

  console.log(JSON.stringify({
    equipo: `${contexto.club_nombre} · ${contexto.competicion} · ${contexto.grupo_nombre}`,
    plantillaConocida: plantilla.length,
    partidosConAlineacion,
    minutosDerivados: totalMinutos,
    minutosEsperados,
    cuadraMinutos,
    jugadoresConSenior: seniorPorPersona.size,
    sinDatosDe2025: procedencia.sinDatos2025.length,
    pdf,
    ficheros: [
      `informes/${SLUG}.md`,
      `informes/${SLUG}.html`,
      `informes/${SLUG}.consultas.sql`,
      `informes/dashboard/${SLUG}.html`,
    ],
  }, null, 2));
}

/* ══ PDF ══════════════════════════════════════════════════════════════════════════════════════════ */

/** Chrome instalado en la máquina. El proyecto ya lo usa para los recolectores: no se instala nada. */
function rutaChrome() {
  const candidatos = [
    process.env.FACYLF_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidatos.find((c) => existsSync(c)) ?? null;
}

/**
 * Imprime el HTML a PDF con Chrome en modo headless.
 *
 * Se le da un `--user-data-dir` propio y temporal: los recolectores tienen sus perfiles de Chrome
 * abiertos y compartir perfil con un navegador en marcha hace que Chrome reenvíe la orden a la
 * instancia que ya corre y no imprima nada.
 */
async function imprimePdf(rutaHtml, rutaPdf) {
  const chrome = rutaChrome();
  if (chrome === null) throw new Error('No se ha encontrado Chrome ni Edge para imprimir el PDF.');
  const perfil = join(process.env.TEMP ?? '.', `facylf-informe-${Date.now()}`);
  const temporalPdf = `${rutaPdf}.${Date.now()}.tmp.pdf`;
  try {
    await new Promise((resolver, rechazar) => {
      const hijo = spawn(chrome, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        `--user-data-dir=${perfil}`,
        '--no-pdf-header-footer',
        `--print-to-pdf=${temporalPdf}`,
        pathToFileURL(rutaHtml).href,
      ], { stdio: 'ignore', windowsHide: true });
      hijo.on('error', rechazar);
      hijo.on('exit', (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(`Chrome terminó con código ${codigo}`))));
    });
  } finally {
    rmSync(perfil, { recursive: true, force: true });
  }
  if (!existsSync(temporalPdf)) throw new Error('Chrome no escribió un PDF nuevo; se conserva la versión anterior.');
  renameSync(temporalPdf,rutaPdf);
}

/* ══ RENDER ════════════════════════════════════════════════════════════════════════════════════════ */

/** Un gráfico de barras horizontales en SVG. Sin dependencias: se imprime igual en papel. */function barras(datos, { ancho = 700, altoFila = 22, etiqueta = '', color = '#a8053d', maximo = null } = {}) {
  const margenIzq = 255;
  const margenDer = 60;
  const alto = datos.length * altoFila + 26;
  const max = maximo ?? Math.max(1, ...datos.map((d) => d.valor));
  const anchoBarra = (v) => Math.max(1, Math.round(((ancho - margenIzq - margenDer) * v) / max));
  const filas = datos.map((d, i) => {
    const y = 18 + i * altoFila;
    const w = anchoBarra(d.valor);
    const detalle = `${d.detalle ?? d.etiqueta}: ${d.valor}${d.sufijo ?? ''}${d.ayuda ? ` · ${d.ayuda}` : ''}`;
    return `<g class="barra" tabindex="0"><title>${esc(detalle)}</title><text x="${margenIzq - 8}" y="${y + 14}" text-anchor="end" class="etq">${esc(d.etiqueta)}</text>` +
      `<rect x="${margenIzq}" y="${y + 3}" width="${w}" height="${altoFila - 9}" fill="${d.color ?? color}" rx="2"/>` +
      `<text x="${margenIzq + w + 6}" y="${y + 14}" class="val">${d.valor}${d.sufijo ?? ''}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" role="img" aria-label="${esc(etiqueta)}" class="grafica">${filas}</svg>`;
}

function tabla(cabeceras, filas, { clase = '' } = {}) {
  const th = cabeceras.map((c) => `<th>${c}</th>`).join('');
  const tr = filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table class="${clase}"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

/**
 * El informe, en texto.
 *
 * ESTO LO LEE UN ENTRENADOR, NO UN INFORMÁTICO. Ni un identificador, ni un nombre de tabla, ni una ruta:
 * sólo nombres de equipos, números y las palabras que se usarían hablando. Lo que hay que saber para
 * interpretar las cifras va en una nota corta al final, no repartido por todo el documento.
 *
 * Los nombres salen del propio canónico, así que este generador sirve para otro equipo cambiando sólo las
 * constantes del principio del fichero.
 */
function componeMarkdown(d) {
  const { contexto, cobertura, plantilla, jornada1, clasificacion, porPersona, procedencia, cruce, minutosDe, minutosDeEquipo, historiaEquipo, edicionesIncompletasClub = [], edicionesIncompletasPlantilla = [], pesoPorClave, equipoPorClave, sancionesPorClave, cuerpoTecnico, cuerpoTecnicoAnterior = [], cuerpoTecnicoAnteriorEquipo = [], plantillaPublicada, resumenLiga, partidosTemporada = [] } = d;
  const L = [];
  const p = (t = '') => L.push(t);
  const jornada = cobertura.ultima_jornada_con_resultado ?? 0;
  /*
   * ── SÓLO LA ÚLTIMA JORNADA, QUE ES LO QUE DICE EL TÍTULO (arreglado el 25/09/2026) ─────────────────────
   *
   * `jornada1` devuelve TODOS los partidos del grupo, no una jornada: el nombre engaña. El informe filtraba
   * sólo por equipo, así que este apartado —titulado «La jornada N»— enseñaba la temporada entera, y el «resto
   * de la jornada» mezclaba los partidos de todas las jornadas.
   *
   * Se descubrió al añadir el resumen de todas las jornadas: la tabla nueva decía «J2: C.D. Navega, fuera,
   * 1-2» y este apartado decía «Victoria 1-0 contra Atlético Bembibre», que es la J1. Dos afirmaciones
   * incompatibles en el mismo informe, y la que mentía era ésta.
   */
  const esDeLaUltimaJornada = (m) => Number(m.jornada) === Number(jornada);
  const propio = jornada1.filter((m) => esDeLaUltimaJornada(m)
    && (m.local === contexto.nombre_en_fuente || m.visitante === contexto.nombre_en_fuente));
  const resto = jornada1.filter((m) => esDeLaUltimaJornada(m) && !propio.includes(m));
  const corto = (nombre) => {
    const [apellidos = '', nombrePila = ''] = String(nombre).split(',').map((s) => s.trim());
    const primero = nombrePila.split(' ')[0] ?? '';
    return `${apellidos}${primero ? `, ${primero}` : ''}`;
  };

  // ── Portada ─────────────────────────────────────────────────────────────────────────────────────
  p(`# ${contexto.club_nombre} — ${contexto.categoria.charAt(0).toUpperCase()}${contexto.categoria.slice(1)}`);
  p();
  p(`## Plantilla ${contexto.temporada} y qué ha hecho cada jugador`);
  p();
  const oficial = clasificacion.filter((c) => c.origen === 'oficial');
  const filaPropia = oficial.find((f) => f.team_entry === contexto.team_entry);
  const ultimo = propio[propio.length - 1];
  // El nombre EN LA FUENTE va en la cabecera porque es lo que distingue a este equipo de sus hermanos: un
  // club con «A», «B» y «C» publica los tres con el mismo nombre de club, y el «C» sólo se ve aquí.
  p(`**${contexto.competicion}** · grupo ${contexto.grupo_nombre} · temporada ${contexto.temporada}`);
  p(`Equipo en la fuente: «${contexto.nombre_en_fuente}»`);
  p();
  if (ultimo) {
    const local = ultimo.local === contexto.nombre_en_fuente;
    const gf = local ? ultimo.goles_local : ultimo.goles_visitante;
    const gc = local ? ultimo.goles_visitante : ultimo.goles_local;
    const rival = local ? ultimo.visitante : ultimo.local;
    const signo = Number(gf) > Number(gc) ? 'Victoria' : Number(gf) < Number(gc) ? 'Derrota' : 'Empate';
    p(`Última jornada jugada: la **${ultimo.jornada}**, el ${fecha(ultimo.fecha_prevista)} — **${signo} ${gf}-${gc}** contra ${rival}.`);
  }
  if (filaPropia) {
    p(`Clasificación: **${filaPropia.posicion}.º de ${oficial.length}**, ${filaPropia.puntos} punto(s) en ${filaPropia.jugados} partido(s).`);
  }
  p();
  p(`> Documento interno. Contiene nombres y datos deportivos de menores de edad: no se publica.`);
  p();
  p(`---`);
  p();

  // ── 1. Resumen ──────────────────────────────────────────────────────────────────────────────────
  p(`## 1. De un vistazo`);
  p();
  const goleadores = plantilla.filter((j) => Number(j.goles) > 0).sort((a, b) => Number(b.goles) - Number(a.goles));
  const masMinutos = [...plantilla].sort((a, b) => Number(b.minutos_derivados) - Number(a.minutos_derivados));
  const participantes = plantilla.filter((j) => j.ha_participado === true);
  const sinParticipar = plantilla.filter((j) => j.ha_participado !== true);
  const jugadoresOficiales = plantillaPublicada.filter((m) => m.role === 'player');
  const conSenior = [...new Set(cruce.map((c) => c.person_id))].length;
  /*
   * LA FICHA OFICIAL SÓLO SE NOMBRA CUANDO ESTÁ EN EL ARCHIVO (arreglado el 25/09/2026).
   *
   * Antes esta tabla decía «Jugadores inscritos en la ficha oficial» con el número de jugadores vistos en las
   * actas cuando no había ficha: medido con el juvenil de Victoria C.F., decía **20** cuando la ficha oficial
   * declaraba **19**. Un informe no puede llamar «ficha oficial» a lo que ha deducido de las actas.
   */
  const hayFichaOficial = jugadoresOficiales.length > 0;
  const jugadoresSinFicha = hayFichaOficial
    ? participantes.filter((j) => !jugadoresOficiales.some((m) => String(m.person_id) === String(j.person_id))) : [];
  p(`| | |`);
  p(`|---|---|`);
  if (hayFichaOficial) {
    p(`| Jugadores inscritos en la ficha oficial | **${jugadoresOficiales.length}** |`);
    p(`| Jugadores vistos en las actas | **${participantes.length}**${jugadoresSinFicha.length ? ` (${jugadoresSinFicha.length} de ellos no están en la ficha: ${jugadoresSinFicha.map((j) => j.nombre).join(', ')})` : ''} |`);
    const inscritosSinJugar = jugadoresOficiales.filter((m) => m.person_id
      && !participantes.some((j) => String(j.person_id) === String(m.person_id)));
    p(`| Inscritos todavía sin participación | **${inscritosSinJugar.length}**${inscritosSinJugar.length ? ` — ${inscritosSinJugar.map((m) => m.display_name).join(', ')}` : ''} |`);
  } else {
    p(`| Ficha oficial de este equipo en el archivo | **no está** |`);
    p(`| Jugadores vistos en las actas | **${participantes.length}** |`);
    p(`| Jugadores conocidos (actas y ficha del club) | **${plantilla.length}** |`);
  }
  p(`| Jornadas jugadas de la liga | **${jornada}** |`);
  p(`| Goleador | ${goleadores.length === 0 ? 'nadie ha marcado todavía' : `**${goleadores[0].nombre}** (${goleadores[0].goles} de los ${goleadores.reduce((n, j) => n + Number(j.goles), 0)} goles del equipo)`} |`);
  p(`| Más minutos | ${masMinutos.length === 0 ? '—' : `**${masMinutos[0].nombre}** (${masMinutos[0].minutos_derivados} min)`} |`);
  p(`| Portero | ${(() => { const por = plantilla.filter((j) => Number(j.veces_portero) > 0); return por.length === 0 ? 'no identificado en las actas' : por.map((j) => `**${j.nombre}** (${j.veces_portero} partido(s))`).join(', '); })()} |`);
  p(`| Han jugado en un equipo superior | **${conSenior}** de ${plantilla.length} jugadores conocidos |`);
  p();

  /*
   * ── EL AVISO DE COMPETICIÓN A MEDIAS (regla §5.4.2 de la guía) ─────────────────────────────────────────
   *
   * Medido el 25/09/2026 con el informe de Victoria C.F.: su grupo tenía **2 jornadas jugadas de 30**, y el
   * informe las presentaba sin decir en ninguna parte que aquello era el principio de la temporada. Quien lo
   * leyera podía tomar los minutos, los goles o las tarjetas por el retrato de una temporada, cuando eran el
   * retrato de dos partidos.
   *
   * La regla es que **sólo se sacan datos de competiciones con la temporada completamente ingesta**, y que si
   * está a medias hay que decirlo con esas palabras. Aquí se dice arriba del todo, no en el pie de página: un
   * aviso al final de un informe de siete páginas no lo lee nadie.
   */
  const jornadasPrevistas = Number(contexto.jornadas_previstas ?? 0);
  const jornadasJugadas = Number(jornada ?? 0);
  if (jornadasPrevistas > 0 && jornadasJugadas < jornadasPrevistas) {
    const porcentaje = Math.round((jornadasJugadas / jornadasPrevistas) * 100);
    p(`> ### ⚠️ Esta competición está EN CURSO: ${jornadasJugadas} de ${jornadasPrevistas} jornadas (${porcentaje} %)`);
    p(`>`);
    p(`> **Todo lo de esta temporada —minutos, goles, tarjetas, titularidades— está calculado sobre ${jornadasJugadas} partido(s), no sobre una temporada entera.** Sirve para saber con quién se juega el próximo domingo; no sirve para juzgar a un jugador.`);
    p(`> Lo que sí es de temporada completa es la comparación con la temporada pasada y el historial de cada uno.`);
    p();
  }
  const cargaAnterior = plantilla.map((j) => {
    const pesos = [...pesoPorClave.values()].filter((x) => String(x.person_id) === String(j.person_id) && x.temporada === ETIQUETA_ANTERIOR);
    const minutos = pesos.reduce((n, x) => n + Number(x.minutos), 0);
    const posibles = pesos.reduce((n, x) => n + Number(x.partidos_equipo) * Number(x.duracion_partido ?? 90), 0);
    const goles = (porPersona.get(j.person_id) ?? []).filter((x) => x.temporada === ETIQUETA_ANTERIOR).reduce((n, x) => n + Number(x.goles), 0);
    const sanciones = pesos.map((x) => sancionesPorClave.get(`${j.person_id}:${x.temporada}:${x.team_entry_id}`)).filter(Boolean);
    return { ...j, disponibilidad: posibles ? 100 * minutos / posibles : 0, goles,
      amarillas: sanciones.reduce((n, x) => n + Number(x.amarillas ?? 0), 0),
      rojas: sanciones.reduce((n, x) => n + Number(x.rojas?.length ?? 0), 0) };
  });
  const continuidad = [...cargaAnterior].filter((x) => x.disponibilidad >= 70).sort((a,b) => b.disponibilidad-a.disponibilidad).slice(0,5);
  const amenaza = [...cargaAnterior].filter((x) => x.goles > 0).sort((a,b) => b.goles-a.goles).slice(0,5);
  const disciplina = [...cargaAnterior].filter((x) => x.rojas > 0 || x.amarillas >= 5)
    .sort((a,b) => b.rojas-a.rojas || b.amarillas-a.amarillas).slice(0,5);
  p(`### Conclusiones accionables para preparar el rival`);
  p();
  p(`- **Continuidad y peso competitivo:** ${continuidad.length ? continuidad.map((x) => `${x.nombre} (${x.disponibilidad.toFixed(0)} % disponible)`).join('; ') : 'todavía sin muestra suficiente'}. Son los primeros perfiles que conviene revisar en vídeo o actas.`);
  p(`- **Amenaza goleadora anterior:** ${amenaza.length ? amenaza.map((x) => `${x.nombre} (${x.goles})`).join('; ') : 'sin goles anteriores registrados'}. Sirve para priorizar vigilancia, no para asignar una demarcación que la fuente no publica.`);
  p(`- **Experiencia por encima de su categoría:** ${cruce.length ? [...new Set(cruce.map((x) => x.nombre))].join(', ') : 'ningún jugador registrado'}.`);
  /*
   * De dónde viene el cuerpo técnico: es la respuesta a «¿este equipo cambia de manos este año?». Se lee del
   * historial por nombre —no por ficha de persona, que el canónico no enlaza entre temporadas— y sólo de los
   * roles de entrenador: un delegado o un encargado de material no dirige al equipo.
   */
  const deDondeViene = [];
  const yaVistos = new Set();
  for (const t of [...(cuerpoTecnicoAnterior ?? [])]
    .filter((x) => /entrenador/i.test(String(x.rol)))
    .sort((a, b) => String(b.temporada).localeCompare(String(a.temporada), 'es'))) {
    if (yaVistos.has(t.nombre_norm) || deDondeViene.length === 3) continue;
    yaVistos.add(t.nombre_norm);
    const media = Number(t.partidos) > 0
      ? ((3 * Number(t.victorias) + Number(t.empates)) / Number(t.partidos)).toFixed(2) : '—';
    deDondeViene.push(`${t.nombre} venía de ${t.club} (${t.temporada}, ${t.partidos} partido(s), ${media} puntos por partido)`);
  }
  p(`- **De dónde viene el cuerpo técnico:** ${deDondeViene.length ? `${deDondeViene.join('; ')}.` : 'de los nombres de esta temporada no hay partidos anteriores en el archivo.'} Dice si el equipo cambia de manos este año.`);
  p(`- **Disciplina a vigilar:** ${disciplina.length ? disciplina.map((x) => `${x.nombre} (${x.amarillas} A, ${x.rojas} R)`).join('; ') : 'sin señales destacadas'}. Es una señal histórica, no una predicción.`);
  p();
  p(`> Las conclusiones se limitan a los partidos disponibles. El contexto histórico de ${ETIQUETA_ANTERIOR} no sustituye al rendimiento de esta temporada.`);
  p();
  /*
   * ── LA HISTORIA DE ESTE EQUIPO ─────────────────────────────────────────────────────────────────────
   *
   * El mismo equipo —mismo club, misma categoría— en todas las temporadas que hay en el archivo. El
   * balance se calcula de los marcadores, partido a partido, y no de la clasificación: así funciona
   * también en las temporadas de las que sólo hay resultados y ninguna tabla publicada.
   *
   * Y se dice en qué temporadas hay actas: una temporada con partidos y sin actas da el recorrido del
   * equipo pero **ningún jugador**, y confundir las dos cosas haría parecer que no hubo plantilla.
   */
  if (Array.isArray(historiaEquipo) && historiaEquipo.length > 0) {
    p(`### El club en esta categoría, temporada a temporada`);
    p();
    p(`Son **todos los equipos de esta categoría del club** en el archivo, no sólo el primero: la Liga Nacional es`);
    p(`el primer equipo y las divisiones provinciales son sus filiales. La fila que interesa para comparar`);
    p(`temporadas es la de la competición del equipo que se analiza.`);
    p();
    p(`| Temporada | Competición | Partidos con resultado | G | E | P | Goles | Jugadores con acta |`);
    p(`|---|---|---|---|---|---|---|---|`);
    for (const t of historiaEquipo) {
      const gf = Number(t.goles_favor);
      const gc = Number(t.goles_contra);
      const goles = Number(t.con_resultado) === 0 ? 'sin resultados' : `${gf} a favor, ${gc} en contra (${gf - gc >= 0 ? '+' : ''}${gf - gc})`;
      p(`| **${t.temporada}** | ${t.competicion} | ${t.con_resultado}${Number(t.partidos) !== Number(t.con_resultado) ? ` de ${t.partidos}` : ''} | ${t.ganados} | ${t.empatados} | ${t.perdidos} | ${goles} | ${Number(t.jugadores_con_acta) === 0 ? '**ninguno** (sin actas)' : t.jugadores_con_acta} |`);
    }
    p();
    const conActas = historiaEquipo.filter((t) => Number(t.jugadores_con_acta) > 0).length;
    p(`> ${historiaEquipo.length} temporada(s) en el archivo, ${conActas} de ellas con actas. **Una temporada sin actas no significa que no hubiera jugadores**: significa que la federación no las publica o que no se han recolectado. Por eso la última columna dice «ninguno (sin actas)» y no un cero a secas.`);
    p();
    // Lo que se deja fuera, dicho: una competición a medias no se enseña, pero tampoco se esconde.
    if (edicionesIncompletasClub.length > 0) {
      const detalle = edicionesIncompletasClub.map((e) => `${e.temporada} ${e.competicion} (${e.con_resultado} de ${e.jornadas_previstas ?? '?'} jornadas)`);
      p(`> **No se cuentan ${edicionesIncompletasClub.length} competición(es) de temporadas anteriores** porque el archivo no las tiene`);
      p(`> completas, y su balance saldría falso: ${detalle.join('; ')}.`);
      p();
    }
  }
  p();
  p(`---`);
  p();

  // ── 2. La jornada ───────────────────────────────────────────────────────────────────────────────
  p(`## 2. La jornada ${jornada}`);
  p();

  /*
   * ── TODAS LAS JORNADAS, ANTES DEL DETALLE DE LA ÚLTIMA (regla §5.4.4) ──────────────────────────────────
   *
   * Primero la temporada entera de un vistazo —resultados, puntos y goles acumulados— y después el detalle del
   * último partido. Al revés, el lector ve un partido suelto y no sabe si el equipo va primero o último.
   */
  if (partidosTemporada.length > 0) {
    p(`### Todas las jornadas jugadas hasta ahora`);
    p();
    p(`| Jornada | Rival | Dónde | Resultado | Puntos | Acumulados | Goles a favor | En contra |`);
    p(`|---|---|---|---|---|---|---|---|`);
    let puntosTotales = 0; let golesFavor = 0; let golesContra = 0; let victorias = 0; let empates = 0; let derrotas = 0;
    for (const m of partidosTemporada) {
      const enCasa = m.en_casa === true;
      const mios = Number(m.goles_favor);
      const suyos = Number(m.goles_contra);
      const rival = m.rival ?? '—';
      const puntos = mios > suyos ? 3 : mios === suyos ? 1 : 0;
      puntosTotales += puntos; golesFavor += mios; golesContra += suyos;
      if (puntos === 3) victorias++; else if (puntos === 1) empates++; else derrotas++;
      p(`| J${m.jornada} | ${rival} | ${enCasa ? 'casa' : 'fuera'} | **${mios}-${suyos}** | ${puntos} | ${puntosTotales} | ${golesFavor} | ${golesContra} |`);
    }
    p();
    p(`**Balance: ${victorias} victorias, ${empates} empates y ${derrotas} derrotas · ${puntosTotales} puntos · ${golesFavor} goles a favor y ${golesContra} en contra.**`);
    p();
    p(`### El último partido, con detalle`);
    p();
  }
  for (const m of propio) {
    const local = m.local === contexto.nombre_en_fuente;
    const gf = local ? m.goles_local : m.goles_visitante;
    const gc = local ? m.goles_visitante : m.goles_local;
    const rival = local ? m.visitante : m.local;
    const signo = Number(gf) > Number(gc) ? 'Victoria' : Number(gf) < Number(gc) ? 'Derrota' : 'Empate';
    p(`**${signo} ${gf}-${gc}** contra ${rival}, el ${fecha(m.fecha_prevista)}.`);
    p();
    const goles = golesDePartido(d, m);
    if (goles.length > 0) {
      p(`| Minuto | Gol | Para |`);
      p(`|---|---|---|`);
      for (const g of goles) {
        const marca = g.propiaPuerta ? ' (en propia puerta)' : g.penalti ? ' (de penalti)' : '';
        p(`| ${g.minuto} | ${g.quien}${marca} | ${g.equipo ?? '—'} |`);
      }
      p();
    }
  }
  if (resto.length > 0) {
    p(`**El resto de la jornada en el grupo**`);
    p();
    p(`| Partido | Resultado |`);
    p(`|---|---|`);
    for (const m of resto) p(`| ${m.local} — ${m.visitante} | ${nulo(m.goles_local)}-${nulo(m.goles_visitante)} |`);
    p();
  }
  const jugadosLiga = jornada1.filter((m) => m.goles_local !== null && m.goles_visitante !== null);
  if (jugadosLiga.length > 0) {
    const golesLiga = jugadosLiga.reduce((n, m) => n + Number(m.goles_local) + Number(m.goles_visitante), 0);
    const local = jugadosLiga.filter((m) => Number(m.goles_local) > Number(m.goles_visitante)).length;
    const empates = jugadosLiga.filter((m) => Number(m.goles_local) === Number(m.goles_visitante)).length;
    const visitante = jugadosLiga.length - local - empates;
    p(`### Radiografía de la liga hasta ahora`);
    p();
    p(`Se han jugado **${jugadosLiga.length} partidos**, con **${golesLiga} goles** (${(golesLiga / jugadosLiga.length).toFixed(2)} por partido):`);
    p(`${local} victorias locales, ${empates} empates y ${visitante} victorias visitantes.`);
    p();
    p(`| Equipo | J | G | E | P | GF | GC | GF/partido | GC/partido |`);
    p(`|---|---|---|---|---|---|---|---|---|`);
    for (const t of resumenLiga.filter((x) => Number(x.jugados) > 0)) {
      p(`| ${t.equipo}${Number(t.team_entry) === Number(contexto.team_entry) ? ' **←**' : ''} | ${t.jugados} | ${t.ganados} | ${t.empatados} | ${t.perdidos} | ${t.gf} | ${t.gc} | ${t.gf_partido} | ${t.gc_partido} |`);
    }
    p();
    p(`Este bloque crecerá cada semana y permitirá detectar ritmos de gol, defensas fuertes y cambios de forma antes de preparar el siguiente rival.`);
    p();
  }
  p(`### Clasificación`);
  p();
  if (oficial.length === 0) {
    p(`No hay una clasificación oficial incorporada para este grupo.`);
  } else {
    p(`| # | Equipo | Pts | J | G | E | P |`);
    p(`|---|---|---|---|---|---|---|`);
    for (const f of oficial) {
      p(`| ${f.posicion} | ${f.equipo}${f.team_entry === contexto.team_entry ? ' **←**' : ''} | ${f.puntos} | ${f.jugados} | ${f.ganados} | ${f.empatados} | ${f.perdidos} |`);
    }
    p();
    p(`Es la tabla que publica la federación. No incluye goles a favor ni en contra.`);
    if(oficial.some(f=>f.tabla_oficial_corte_completo!==true))p(`Fecha de corte sin confirmar: no debe interpretarse como la clasificación exacta de una jornada.`);
  }
  p();
  p(`---`);
  p();

  // ── 3. La plantilla ─────────────────────────────────────────────────────────────────────────────
  p(`## 3. La plantilla y lo que ha hecho cada uno`);
  p();
  if (hayFichaOficial) {
    p(`La ficha oficial publica **${jugadoresOficiales.length} jugadores**. De ellos, ${participantes.length - jugadoresSinFicha.length} ya aparecen en un acta y`);
    p(`${jugadoresOficiales.length - (participantes.length - jugadoresSinFicha.length)} todavía no han participado; estos últimos también están incluidos y su historial anterior se busca igual.`);
    if (jugadoresSinFicha.length) {
      /*
       * De dónde viene cada uno de los que juegan sin estar en la ficha. Se lee de su propio historial de la
       * temporada en curso y se escribe el equipo, no un «suelen ser del filial»: medido con Victoria C.F. el
       * 25/09/2026, los tres eran del filial ("B") y cada uno había jugado un partido con cada equipo.
       */
      const deDonde = jugadoresSinFicha.map((j) => {
        const otros = [...new Set((porPersona.get(j.person_id) ?? [])
          .filter((f) => f.temporada === contexto.temporada && String(f.team_entry) !== String(JUVENIL_ENTRY))
          .map((f) => f.equipo))];
        return otros.length ? `${j.nombre} (${otros.join(', ')})` : `${j.nombre} (sin otro equipo en el archivo)`;
      });
      p(`Además, en las actas aparecen **${jugadoresSinFicha.length} jugador(es) que no están en la ficha oficial** de este equipo:`);
      p(`${deDonde.join('; ')}. Han jugado aquí sin estar inscritos, así que se cuentan aparte de la plantilla.`);
    }
  } else {
    p(`**La ficha oficial de este equipo no está en el archivo**, así que la lista son los **${plantilla.length} jugadores que`);
    p(`aparecen en las actas** de esta temporada (${participantes.length} ya con minutos). Un inscrito que no haya jugado`);
    p(`todavía no puede salir aquí: se sabe que existe, pero no su nombre. No se rellena con ceros ni se supone.`);
  }
  p();
  p(`| Jugador | Estado actual | Dorsal | Partidos | Titular | Suplente | Minutos | Goles | Amarillas | Rojas |`);
  p(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const j of masMinutos) {
    // Del más usado al menos, con cuántas actas: «7 (12) · 16 (2)». Si sólo hay uno, el número a secas.
    const dorsal = formatoDorsales(j.dorsales_frecuencia) || (j.dorsales ?? []).join('-') || '—';
    const portero = Number(j.veces_portero) > 0 ? ' **(portero)**' : '';
    const penalti = Number(j.goles_penalti) > 0 ? ` (${j.goles_penalti} de penalti)` : '';
    const estado = j.ha_participado === true ? 'Ya ha participado' : '**Inscrito · aún sin participación**';
    // La foto va TAMBIÉN aquí, en la tabla de la plantilla: es la primera tabla que mira el entrenador y sin
    // cara al lado un listado de 20 nombres no se lee. Regla §5.4.3 de la guía.
    p(`| [[foto:${j.person_id}]]${j.nombre}${portero} | ${estado} | ${dorsal} | ${j.convocatorias} | ${j.titularidades} | ${j.suplencias} | ${j.minutos_derivados} | ${j.goles}${penalti} | ${j.amarillas} | ${j.rojas} |`);
  }
  p();
  p(`---`);
  p();

  // ── 4. La temporada pasada ──────────────────────────────────────────────────────────────────────
  p(`## 4. Dónde ha jugado cada uno, temporada a temporada`);
  p();
  p(`Está **todo lo que hay de cada jugador**: cada temporada que aparece en el archivo, con su equipo, su`);
  p(`categoría y su competición. No sólo la temporada pasada, y no sólo en este club — si jugó en otro`);
  p(`equipo, en otra categoría o en un equipo superior del suyo, sale aquí.`);
  p();
  if (d.baseHistorial) {
    const b = d.baseHistorial;
    p(`Para situar el tamaño de lo que se ha mirado: de la temporada ${ETIQUETA_ANTERIOR} hay en el archivo`);
    p(`**${Number(b.partidos).toLocaleString('es-ES')} partidos**, repartidos en ${b.competiciones} competiciones y ${b.grupos} grupos, con`);
    p(`**${Number(b.personas).toLocaleString('es-ES')} jugadores distintos**.`);
    p();
  }
  const filasHistorial = [];
  for (const j of masMinutos) {
    // TODAS las temporadas, no sólo la pasada: es la trazabilidad que se pide. Ordenadas de la más
    // reciente a la más antigua, y dentro de cada temporada por minutos jugados.
    const filas = (porPersona.get(j.person_id) ?? [])
      .slice()
      .sort((a, b) => b.temporada.localeCompare(a.temporada, 'es')
        || Number(minutosDeEquipo(j.person_id, b.temporada, b.team_entry) ?? 0) - Number(minutosDeEquipo(j.person_id, a.temporada, a.team_entry) ?? 0));
    if (filas.length === 0) {
      filasHistorial.push([`[[foto:${j.person_id}]] **${j.nombre}**`, '—', '—', 'Sin datos en el archivo', '—', '—', '—', '—']);
      continue;
    }
    let temporadaAnterior = null;
    filas.forEach((f) => {
      // El peso: su parte de los minutos y de los goles DE SU EQUIPO esa temporada. Va por fila porque es
      // justo lo que hace comparables dos temporadas en equipos distintos.
      const peso = pesoPorClave.get(`${j.person_id}:${f.temporada}:${f.team_entry}`) ?? null;
      const equipo = equipoPorClave.get(`${f.temporada}:${f.team_entry}`) ?? null;
      const golesEquipo = equipo ? Number(equipo.goles) : 0;
      const porcentajeGoles = golesEquipo > 0 && Number(f.goles) > 0
        ? `${((100 * Number(f.goles)) / golesEquipo).toFixed(0)} %` : '—';
      const minutos = minutosDeEquipo(j.person_id, f.temporada, f.team_entry);
      const duracion = Number(peso?.duracion_partido ?? 90);
      const golesPartido = minutos && minutos > 0 ? (duracion * Number(f.goles) / minutos).toFixed(2) : '—';
      const sanciones = sancionesPorClave.get(`${j.person_id}:${f.temporada}:${f.team_entry}`) ?? null;
      const primeraDeTemporada = temporadaAnterior !== f.temporada;
      temporadaAnterior = f.temporada;
      /*
       * La segunda fila de la misma persona y temporada es su otro equipo —el filial y el primero—: el nombre
       * no se repite para que se lean juntas, pero la celda NO puede quedar vacía, que en Markdown se lee como
       * un informe roto. Lleva una flecha que dice «esto es continuación de la fila de arriba».
       */
      filasHistorial.push([
        primeraDeTemporada ? `[[foto:${j.person_id}:${f.temporada}]] **${j.nombre}**` : '↳',
        f.temporada,
        f.club,
        `${f.equipo} · ${f.categoria} · ${f.competicion}`,
        peso ? `${f.apariciones}/${peso.partidos_equipo} · ${peso.porcentaje_titular} % titular` : `${f.apariciones} partidos`,
        peso ? `${nulo(minutos)} min · ${peso.porcentaje_disponible} % disp. · supera al ${peso.percentil_minutos} % de compañeros` : `${nulo(minutos)} min`,
        peso ? `${f.goles} · ${golesPartido}/partido completo · ${porcentajeGoles} del equipo` : f.goles,
        `${marcasDeTarjetas(sanciones)} · ${textoDeSanciones(sanciones)}`,
      ]);
    });
  }
  p(`| Jugador | Temporada | Club | Equipo · categoría · competición | Uso | Carga | Gol | Disciplina |`);
  p(`|---|---|---|---|---|---|---|---|`);
  for (const fila of filasHistorial) p(`| ${fila.join(' | ')} |`);
  p();
  p(`**Cómo se leen las cifras relativas:** «% disponible» divide sus minutos entre la duración reglamentaria`);
  p(`de cada partido de su categoría; un partido completo es 100 %. «Supera al 90 %» significa que tuvo más`);
  p(`minutos que el 90 % de sus compañeros de esa temporada y equipo. Los goles por partido completo comparan ritmos y el porcentaje de goles`);
  p(`mide su aportación al total del equipo. Siempre se muestran los partidos disponibles para no comparar`);
  p(`una muestra de dos jornadas con una temporada completa.`);
  p();
  p(`> Está **todo lo que hay de cada jugador**, temporada a temporada y equipo a equipo, en cualquier club`);
  p(`> y cualquier federación de las que tenemos datos. Un jugador con una sola fila es un jugador del que`);
  p(`> sólo tenemos esa temporada.`);
  p();
  if (edicionesIncompletasPlantilla.length > 0) {
    const detalle = edicionesIncompletasPlantilla.map((e) => `${e.temporada} ${e.competicion} (${e.personas} jugador(es), ${e.apariciones} aparición(es))`);
    p(`> **No se cuentan ${edicionesIncompletasPlantilla.length} competición(es) de temporadas anteriores**, porque el archivo las tiene a`);
    p(`> medias y los minutos y los partidos de esos jugadores saldrían por debajo de los reales: ${detalle.join('; ')}.`);
    p(`> Se dirá de ellas en cuanto se recoleccionen enteras.`);
    p();
  }
  p(`**De dónde viene esta plantilla:**`);
  p();
  // OJO: estas filas NO son excluyentes y hay que decirlo. Un jugador que ya estaba y además jugó en un
  // equipo superior del club cuenta en las dos. Medido en el Unionistas «C»: suman 24 sobre 16 jugadores,
  // y sin la nota parecería que hay 24 personas.
  p(`Cada jugador puede aparecer en más de una fila: son cosas distintas, no cestas excluyentes.`);
  p();
  p(`| | Jugadores | Quiénes |`);
  p(`|---|---|---|`);
  const listaDe = (lista) => (lista.length === 0 ? '—' : lista.map((j) => j.nombre).join(', '));
  p(`| Ya estaban en este equipo | ${procedencia.juvenil.length} | ${listaDe(procedencia.juvenil)} |`);
  p(`| Subieron desde otra categoría del club | ${procedencia.mismaCasaOtraCategoria.length} | ${listaDe(procedencia.mismaCasaOtraCategoria)} |`);
  p(`| Llegaron de otro club | ${procedencia.otroClub.length} | ${listaDe(procedencia.otroClub)} |`);
  p(`| Jugaron en un equipo superior del club | ${procedencia.senior.length} | ${listaDe(procedencia.senior)} |`);
  p(`| No aparecen en el archivo de la temporada pasada | ${procedencia.sinDatos2025.length} | ${listaDe(procedencia.sinDatos2025)} |`);
  p();
  p(`> «Sin datos» significa que ese jugador **no aparece en las actas que tenemos**, no que no jugara. Es un hueco del archivo, y por eso se dice así en vez de poner un cero.`);
  p();
  p(`---`);
  p();

  // ── 5. Tarjetas y ausencias ─────────────────────────────────────────────────────────────────────
  p(`## 5. Tarjetas y ausencias que siguen a una sanción`);
  p();
  p(`**La federación no publica las sanciones**, así que aquí no se afirma ninguna: se cuenta lo que se ve en`);
  p(`las actas. Después de una roja —y después de la quinta amarilla— se mira si el jugador **no aparece en los`);
  p(`partidos siguientes**, que es el rastro que deja una sanción. Aparece con su jornada para poder`);
  p(`comprobarlo en el acta.`);
  p();
  /*
   * ── LA COMPROBACIÓN QUE PIDE LA REGLA §5.4.5 ────────────────────────────────────────────────────────────
   *
   * Antes de publicar tarjetas hay que comprobar que son pocas POR EL FÚTBOL y no por el archivo. Medido el
   * 25/09/2026 con el informe de Victoria C.F.: 7 amarillas en dos jornadas, repartidas entre 7 jugadores
   * distintos de 20 con aparición; y en esos MISMOS partidos los rivales acumularon 8. Es decir: el dato está
   * bien, y lo que pasa es que se han jugado dos jornadas.
   *
   * Sin esa comprobación, un lector mira la tabla, ve casi todo a cero y saca una conclusión falsa —que el
   * equipo es limpio o que la plantilla no se implica—. Así que se dice: cuántos partidos hay detrás y cuántos
   * jugadores llevan tarjeta. Un cero con contexto es un dato; sin contexto es una trampa.
   */
  const amarillasEquipo = masMinutos.reduce((n, j) => n + Number(j.amarillas ?? 0), 0);
  const rojasEquipo = masMinutos.reduce((n, j) => n + Number(j.rojas ?? 0), 0);
  const jugadoresConTarjeta = masMinutos.filter((j) => Number(j.amarillas ?? 0) + Number(j.rojas ?? 0) > 0).length;
  const partidosDetras = Number(jornada ?? 0);
  if (partidosDetras > 0) {
    p(`**Cuántas tarjetas y con cuántos partidos detrás:** el equipo acumula **${amarillasEquipo} amarilla(s) y ${rojasEquipo} roja(s)`);
    p(`en ${partidosDetras} jornada(s)**, repartidas entre **${jugadoresConTarjeta} jugador(es)** de ${masMinutos.length}.`);
    if (partidosDetras <= 6) {
      p(`Con tan pocos partidos, que la mayoría no tenga ninguna **no significa que sea un equipo limpio**: significa`);
      p(`que todavía no ha habido ocasión. La comparación con la temporada pasada sí es de temporada entera.`);
    }
    p();
  }
  const conTarjetas = masMinutos
    .map((j) => ({
      jugador: j,
      casos: [...sancionesPorClave.entries()].filter(([clave,s]) => clave.startsWith(`${j.person_id}:`) && (s.amarillas > 0 || s.rojas.length > 0)),
    }))
    .filter((x) => x.casos.length > 0);
  if (conTarjetas.length === 0) {
    p(`No hay ninguna tarjeta registrada de esta plantilla en el archivo.`);
  } else {
    p(`| Jugador | Temporada | Equipo | Tarjetas | Ausencias posteriores observadas |`);
    p(`|---|---|---|---|---|`);
    for (const { jugador, casos } of conTarjetas) {
      for (const [clave, sanciones] of casos) {
        const [, temporada, teamEntry] = clave.split(':');
        const peso = pesoPorClave.get(`${jugador.person_id}:${temporada}:${teamEntry}`) ?? null;
        p(`| **${jugador.nombre}** | ${temporada} | ${peso ? peso.equipo : '—'} | ${marcasDeTarjetas(sanciones)} | ${textoDeSanciones(sanciones)} |`);
      }
    }
    p();
    const rojasVistas = [...sancionesPorClave.values()].reduce((n, s) => n + (s.rojas ?? []).length, 0);
    const rojasConAusencia = [...sancionesPorClave.values()].reduce(
      (n, s) => n + (s.rojas ?? []).filter((r) => r.ausencias > 0).length, 0);
    const quintasVistas = [...sancionesPorClave.values()].reduce((n, s) => n + (s.quintas ?? []).length, 0);
    const quintasConAusencia = [...sancionesPorClave.values()].reduce(
      (n, s) => n + (s.quintas ?? []).filter((q) => q.ausente === true).length, 0);
    p(`De **${rojasVistas} rojas** vistas en el archivo de esta plantilla, en **${rojasConAusencia}** el jugador no`);
    p(`aparece en los partidos siguientes. Y de **${quintasVistas} ciclos de cinco amarillas**, en **${quintasConAusencia}**`);
    p(`falta en el siguiente. Lo que no coincide tiene explicación al lado —una última jornada sin partido`);
    p(`después, o un partido del que no tenemos acta— y se deja escrito en vez de cuadrarlo a la fuerza.`);
  }
  p();
  p(`> Los ciclos de cinco amarillas se cuentan sobre las actas que tenemos: una amarilla que la fuente no`);
  p(`> publicó, o un partido sin acta, desplazan el conteo. Sirve como señal, no como expediente.`);
  p();
  p(`---`);
  p();

  // ── 5. El sénior ────────────────────────────────────────────────────────────────────────────────
  p(`## 6. Entrenadores y delegados`);
  p();
  p(`Trayectoria observada del cuerpo técnico que aparece esta temporada. Los resultados describen los partidos`);
  p(`en los que figura cada persona; no demuestran por sí solos el efecto del entrenador o delegado.`);
  p();
  const nombresConActa = new Set((cuerpoTecnico ?? []).map((t) => String(t.nombre).toLocaleUpperCase('es')));
  const personalSinHistorial = plantillaPublicada.filter((m) => m.role !== 'player' && !m.person_id
    && !nombresConActa.has(String(m.display_name).toLocaleUpperCase('es')));
  if (!cuerpoTecnico?.length && personalSinHistorial.length === 0) {
    p(`El archivo disponible todavía no identifica al cuerpo técnico de este equipo.`);
  } else {
    p(`| Persona | Rol | Temporada | Club | Equipo · categoría · competición | Presencia | G-E-P | Puntos/partido | Dif. gol/partido |`);
    p(`|---|---|---|---|---|---|---|---|---|`);
    /*
     * Una persona puede salir dos veces esta temporada por llevar dos roles —delegado de equipo y delegado de
     * campo, medido en Victoria: APELLIDO DE EJEMPLO, NOMBRE—. Cuando los dos papeles dan EL MISMO número de
     * partidos se enseñan en una sola fila con los dos roles; si los números difieren se dejan separadas, porque
     * entonces son dos tramos distintos y juntarlos inventaría un dato.
     */
    const fusionadas = [];
    for (const t of cuerpoTecnico) {
      const previa = fusionadas.find((x) => x.nombre === t.nombre && x.temporada === t.temporada
        && x.equipo === t.equipo && Number(x.partidos) === Number(t.partidos)
        && Number(x.victorias) === Number(t.victorias) && Number(x.empates) === Number(t.empates));
      if (previa) previa.rol = `${previa.rol} · ${t.rol}`;
      else fusionadas.push({ ...t });
    }
    for (const t of fusionadas) {
      p(`| **${t.nombre}** | ${t.rol} | ${t.temporada} | ${t.club} | ${t.equipo} · ${t.categoria} · ${t.competicion} | ${t.partidos}/${t.disponibles} (${t.cobertura} %) | ${t.victorias}-${t.empates}-${t.derrotas} | ${t.puntos_por_partido} | ${t.diferencia_por_partido} |`);
    }
    for (const t of personalSinHistorial) {
      const rol = t.role === 'coach' ? 'Técnico' : 'Delegado/a';
      p(`| **${t.display_name}** | ${rol} | ${contexto.temporada} | ${contexto.club_nombre} | ${contexto.nombre_en_fuente} · ${contexto.categoria} · ${contexto.competicion} | Inscrito/a en la ficha | — | — | — |`);
    }
  }
  p();

  // Los mismos nombres en temporadas anteriores: la pregunta «¿este técnico es nuevo o ya estaba?».
  const anteriores = (cuerpoTecnicoAnterior ?? []).filter((t) => Number(t.partidos) > 0);
  p(`### Los mismos nombres en temporadas anteriores`);
  p();
  if (anteriores.length === 0) {
    p(`Ninguno de los nombres del cuerpo técnico actual aparece en partidos de este club en las temporadas`);
    p(`anteriores que el archivo cubre. O son nuevos, o su etapa anterior no está recogida.`);
  } else {
    p(`Buscado por **nombre y apellidos**, que es lo único que publica el acta. Dos personas distintas con el`);
    p(`mismo nombre aparecerían aquí como una sola.`);
    p();
    p(`| Persona | Temporada | Club · equipo | Categoría · competición | Rol | Partidos | G-E-P | Puntos/partido | Dif. gol/partido |`);
    p(`|---|---|---|---|---|---|---|---|---|`);
    const media = (total, partidos) => (Number(partidos) > 0 ? (total / Number(partidos)).toFixed(2) : '—');
    for (const t of anteriores) {
      const cobertura = t.disponibles ? ` de ${t.disponibles}` : '';
      const pts = media(3 * Number(t.victorias) + Number(t.empates), t.partidos);
      const dif = media(Number(t.gf) - Number(t.gc), t.partidos);
      p(`| **${t.nombre}** | ${t.temporada} | ${t.club} · ${t.equipo} | ${t.categoria} · ${t.competicion} | ${t.rol} | ${t.partidos}${cobertura} | ${t.victorias}-${t.empates}-${t.derrotas} | ${pts} | ${dif} |`);
    }
  }
  p();

  // Cómo dirigía: cambios y amonestaciones de sus equipos, medidos sólo en los partidos en que figura él.
  const dirigidos = (cuerpoTecnicoAnteriorEquipo ?? []).filter((t) => Number(t.partidos) > 0);
  if (dirigidos.length > 0) {
    p(`### Cómo dirigía a sus equipos`);
    p();
    p(`Medido **sólo en los partidos en que figura en el acta**. Los cambios son las sustituciones que hace su`);
    p(`equipo, y el minuto es el del jugador que sale.`);
    p();
    p(`| Persona | Temporada | Club · equipo | Partidos | Amarillas/partido | Rojas/partido | Cambios/partido | Minuto medio del cambio | Primer cambio |`);
    p(`|---|---|---|---|---|---|---|---|---|`);
    const porPartido = (total, partidos) => (Number(partidos) > 0 ? (Number(total) / Number(partidos)).toFixed(2) : '—');
    for (const t of dirigidos) {
      p(`| **${t.nombre}** | ${t.temporada} | ${t.club} · ${t.equipo} | ${t.partidos} | ${porPartido(t.amarillas, t.partidos)} | ${porPartido(t.rojas, t.partidos)} | ${porPartido(t.cambios, t.partidos)} | ${t.minuto_medio_cambio ?? '—'} | ${t.minuto_primer_cambio ?? '—'} |`);
    }
    p();
  }
  p(`---`);
  p();

  p(`## 7. Los que ya han jugado en un equipo superior`);
  p();
  if (cruce.length === 0) {
    p(`Ninguno de los jugadores de esta plantilla tiene partidos registrados en un equipo superior del club.`);
  } else {
    p(`Los siguientes ya han jugado en un equipo de categoría superior del club. Es el mejor indicador de nivel que se puede dar`);
    p(`con estos datos: alguien a quien han alineado en un equipo de arriba está más hecho que quien sólo`);
    p(`ha jugado en su categoría.`);
    p();
    p(`| Jugador | Temporada | Competición | Partidos | Titular | Minutos | Goles | Primer partido |`);
    p(`|---|---|---|---|---|---|---|---|`);
    for (const c of cruce) {
      p(`| ${c.nombre} | ${c.temporada} | ${c.competicion} | ${c.apariciones} | ${c.titularidades} | ${nulo(minutosDeEquipo(c.person_id, c.temporada, c.team_entry))} | ${c.goles} | ${fecha(c.primera)} |`);
    }
  }
  p();
  p(`---`);
  p();

  // ── 6. Gráficas ─────────────────────────────────────────────────────────────────────────────────
  if (false) { // Las gráficas visuales ya están al principio; no se repiten como lista de números.
  p(`## 8. Gráficas`);
  p();
  p(`Las gráficas están en el PDF y en la versión HTML. Aquí quedan los números que las alimentan.`);
  p();
  p(`**Minutos jugados esta temporada**`);
  p();
  for (const j of masMinutos) p(`- ${j.nombre}: ${j.minutos_derivados}`);
  p();
  p(`**Minutos jugados la temporada pasada** (donde jugara cada uno)`);
  p();
  const conPasado = plantilla.filter((j) => minutosDe(j.person_id, ETIQUETA_ANTERIOR) > 0)
    .sort((a, b) => minutosDe(b.person_id, ETIQUETA_ANTERIOR) - minutosDe(a.person_id, ETIQUETA_ANTERIOR));
  for (const j of conPasado) p(`- ${j.nombre}: ${minutosDe(j.person_id, ETIQUETA_ANTERIOR)}`);
  if (conPasado.length === 0) p(`- Nadie de la plantilla tiene minutos registrados la temporada pasada.`);
  p();
  p(`---`);
  p();

  // ── 7. Cómo leer los números ────────────────────────────────────────────────────────────────────
  }
  p(`## 8. Cómo leer estos números`);
  p();
  p(`Cuatro cosas, y con esto se interpreta todo lo de arriba:`);
  p();
  p(`1. **Los minutos no los publica la federación: los calculamos** a partir de los cambios que anota el`);
  p(`   acta. Un partido completo son 90 minutos en juvenil, 80 en cadete, 70 en infantil, 60 en alevín,`);
  p(`   50 en benjamín y 40 en prebenjamín; quien entra suma desde su minuto hasta el final. Sirven`);
  p(`   para comparar jugadores y ver tendencia, no son minutos oficiales.`);
  p(`2. **La única posición que publica el acta es la de portero.** No hay laterales, centrales ni`);
  p(`   delanteros en los datos, así que no se inventan a partir del dorsal ni de los goles.`);
  p(`3. **La ficha oficial y las actas se leen juntas.** Un inscrito puede no haber participado todavía;`);
  p(`   por eso figura con cero en la temporada actual, pero se conserva todo su historial anterior.`);
  p(`4. **No hay asistencias, recuperaciones ni ningún dato técnico**: la federación no los publica.`);
  p();
  // Los retratos se sustituyen al escribir el fichero .md: el HTML necesita las marcas para poner las
  // iniciales de relleno de quien no tiene foto, y se quedaría sin ellas si se resolvieran aquí.
  return L.join('\n');
}

/**
 * Las marcas `[[foto:<person_id>]]` de la plantilla, convertidas en imágenes de Markdown.
 *
 * Sin foto no se deja marca ni hueco: en la tabla del `.md` una inicial suelta se leería como parte del
 * nombre. En el HTML sí hay hueco, porque allí el hueco es un círculo con las iniciales.
 */
function conFotosMarkdown(texto) {
  return texto.replace(/\[\[foto:(\d+)(?::([^\]]+))?\]\]/g, (_, personId, temporada) => {
    const ruta = rutaDeFoto(personId, temporada);
    return ruta ? `![retrato](${ruta}) ` : '';
  });
}

/*
 * La foto de un jugador, si está puesta: `informes/fotos/<slug>-<person_id>-<temporada>.<ext>`, y el fichero
 * sin temporada como retrato de la actual. Devuelve la ruta relativa al informe, que sirve igual en Markdown
 * y en HTML, o `null` si no hay foto. La federación no publica retratos; esto sólo enseña los que se pongan.
 */
function rutaDeFoto(personId, temporada = null) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    if (temporada) {
      const historica = join(SALIDA, 'fotos', `${SLUG}-${personId}-${temporada}.${ext}`);
      if (existsSync(historica)) return `fotos/${SLUG}-${personId}-${temporada}.${ext}`;
    }
    const actual = join(SALIDA, 'fotos', `${SLUG}-${personId}.${ext}`);
    if (existsSync(actual)) return `fotos/${SLUG}-${personId}.${ext}`;
  }
  return null;
}

/** Los goles de un partido, con quién los metió y de qué equipo era. Se leen de los eventos del acta. */
function golesDePartido(d, m) {
  return (d.golesDelPartido?.get(m.match_id) ?? []);
}


function componeHtml(d) {
  const md = componeMarkdown(d);
  const { plantilla, procedencia, contexto, minutosDe } = d;

  /*
   * ── LAS FOTOS, SI LAS HAY ────────────────────────────────────────────────────────────────────────────
   *
   * La federación **no publica foto ni fecha de nacimiento** de estos jugadores: medido el 24/09/2026 en tres
   * fichas de la RFCyLF (`NFG_EstadisticasJugador`), el hueco de la foto no existe y el de la fecha sale vacío
   * (`<b>,&nbsp;</b>`). Así que el informe no puede traerlas de la fuente —inventarlas o buscarlas por ahí
   * sería otra cosa—, pero sí puede enseñarlas en cuanto se pongan.
   *
   * Convenio: en `informes/fotos/` un fichero por jugador llamado `<slug>-<person_id>.<jpg|png|webp>`. El
   * informe lo detecta solo y lo pone en su fila y en su ficha. Los que no tengan foto salen con sus
   * iniciales, para que la tabla no se descuadre.
   */
  const fotoDe = (personId, temporada = null) => rutaDeFoto(personId, temporada);
  const fotoEnHtml = (j, temporada = null) => {
    const ruta = fotoDe(j.person_id, temporada);
    const iniciales = String(j.nombre).split(',')[1]?.trim().slice(0, 1)
      ?? String(j.nombre).slice(0, 1);
    return ruta
      ? `<img class="foto" src="${esc(ruta)}" alt="">`
      : `<span class="foto foto-vacia">${esc(iniciales.toUpperCase())}</span>`;
  };
  const fotoEnTabla = (personId, temporada = null) => {
    const jugador = plantilla.find((j) => String(j.person_id) === String(personId));
    if (!jugador) return '';
    return `<span class="jugador-con-foto">${fotoEnHtml(jugador, temporada)}</span>`;
  };
  const recurso = (ruta) => ruta && existsSync(ruta) ? pathToFileURL(ruta).href : null;
  /*
   * ── EL ESCUDO NO PUEDE SER EL DE OTRO CLUB (arreglado el 24/09/2026) ───────────────────────────────────
   *
   * Hasta hoy, si el club no tenía escudo en la base, se usaba el fichero de `--logo-equipo` y su valor por
   * defecto era el del CIUDAD RODRIGO. Es decir: el informe de cualquier otro equipo salía con la insignia del
   * Ciudad Rodrigo puesta, y nada avisaba. Medido al hacer el informe de Victoria C.F.: el HTML referenciaba
   * `ciudad-rodrigo.jpg` como escudo de un rival.
   *
   * Ahora el fichero se busca POR EL NOMBRE DEL PROPIO CLUB: `informes/recursos/<club>.jpg`. Así, para que
   * aparezca un escudo, el fichero tiene que llamarse como el club al que pertenece, y es imposible enseñar el
   * de otro por descuido. Si no existe, el informe sale SIN escudo — que es lo correcto: mejor sin insignia que
   * con la equivocada.
   *
   * La normalización quita tildes y las siglas del final (C.F., C.D., S.D., club…), para que
   * «Ciudad Rodrigo C.F.» encuentre `ciudad-rodrigo.jpg`, que es como se llama el fichero que ya existía.
   */
  const nombreDeFichero = (nombre) => String(nombre ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')            // tildes fuera
    .toLowerCase()
    .replace(/\b(c\.?f\.?|c\.?d\.?|s\.?d\.?|u\.?d\.?|club|de|del|la|el)\b/g, ' ')  // siglas y artículos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const logoEquipo = d.escudoClub
    ? `data:${d.escudoClub.mime_type};base64,${d.escudoClub.contenido_base64}`
    : (recurso(arg('logo-equipo', null)) ?? (() => {
      // Y si no se ha pasado ninguno, se busca por el nombre del propio club; nunca se cae en el fichero de
      // otro. Se prueban las extensiones habituales: el escudo que publica la federación suele ser PNG.
      const base = join(RAIZ, 'informes', 'recursos', nombreDeFichero(contexto.club_nombre));
      for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
        const hallado = recurso(base + ext);
        if (hallado) return hallado;
      }
      return null;
    })());
  const logoMarca = recurso(LOGO_MARCA);

  // ── Gráficas. Se ordenan de mayor a menor: un gráfico que no está ordenado obliga a leerlo dos veces.
  const deMayorAMenor = (xs) => [...xs].sort((a, b) => b.valor - a.valor);
  const nombreGrafico = (nombre) => {
    const [apellidos = '', nombres = ''] = String(nombre).split(',').map((x) => x.trim());
    return `${nombres.split(' ')[0] ?? ''} ${apellidos}`.trim();
  };
  const pesoActual = (j) => d.pesoPorClave.get(`${j.person_id}:${contexto.temporada}:${contexto.team_entry}`) ?? null;
  const disponibilidad2026 = deMayorAMenor(plantilla.map((j) => ({
    etiqueta: nombreGrafico(j.nombre), detalle: j.nombre, valor: Number(pesoActual(j)?.porcentaje_disponible ?? 0), sufijo: ' %',
  })));
  const goles2026 = deMayorAMenor(plantilla.filter((j) => Number(j.goles) > 0)
    .map((j) => ({ etiqueta: nombreGrafico(j.nombre), detalle: j.nombre, valor: Number(j.goles), color: '#0d47a1' })));
  const disponibilidadDe = (personId, temporada) => {
    const filas = [...d.pesoPorClave.values()].filter((x) => String(x.person_id) === String(personId) && x.temporada === temporada);
    const minutos = filas.reduce((n, x) => n + Number(x.minutos), 0);
    const posibles = filas.reduce((n, x) => n + Number(x.partidos_equipo) * Number(x.duracion_partido ?? 90), 0);
    return posibles > 0 ? Math.round(1000 * minutos / posibles) / 10 : 0;
  };
  const disponibilidad2025 = deMayorAMenor(plantilla.map((j) => ({
    etiqueta: nombreGrafico(j.nombre), detalle: j.nombre, valor: disponibilidadDe(j.person_id, ETIQUETA_ANTERIOR), sufijo: ' %',
  })).filter((x) => x.valor > 0));
  const metricasPrevias = plantilla.map((j) => {
    const pesos = [...d.pesoPorClave.values()].filter((x) => String(x.person_id) === String(j.person_id) && x.temporada === ETIQUETA_ANTERIOR);
    const historias = (d.porPersona.get(j.person_id) ?? []).filter((x) => x.temporada === ETIQUETA_ANTERIOR);
    const minutos = pesos.reduce((n, x) => n + Number(x.minutos), 0);
    const posibles = pesos.reduce((n, x) => n + Number(x.partidos_equipo) * Number(x.duracion_partido ?? 90), 0);
    const partidosCompletos = pesos.reduce((n, x) => n + Number(x.minutos) / Number(x.duracion_partido ?? 90), 0);
    const goles = historias.reduce((n, x) => n + Number(x.goles), 0);
    const claves = [...new Set(pesos.map((x) => `${x.temporada}:${x.team_entry_id}`))];
    const equipos = claves.map((k) => d.equipoPorClave.get(k)).filter(Boolean);
    const golesEquipo = equipos.reduce((n, x) => n + Number(x.goles), 0);
    const amarillasEquipo = equipos.reduce((n, x) => n + Number(x.amarillas), 0);
    const rojasEquipo = equipos.reduce((n, x) => n + Number(x.rojas), 0);
    const sanciones = pesos.map((x) => d.sancionesPorClave.get(`${j.person_id}:${x.temporada}:${x.team_entry_id}`)).filter(Boolean);
    const amarillas = sanciones.reduce((n, x) => n + Number(x.amarillas ?? 0), 0);
    const rojas = sanciones.reduce((n, x) => n + Number(x.rojas?.length ?? 0), 0);
    return {
      ...j,
      historialComparable: pesos.length > 0,
      disponibilidad: posibles > 0 ? 100 * minutos / posibles : 0,
      goles, golesPorPartido: partidosCompletos > 0 ? goles / partidosCompletos : 0,
      pesoGoles: golesEquipo > 0 ? 100 * goles / golesEquipo : 0,
      amarillas, amarillasPorPartido: partidosCompletos > 0 ? amarillas / partidosCompletos : 0,
      pesoAmarillas: amarillasEquipo > 0 ? 100 * amarillas / amarillasEquipo : 0,
      rojas, pesoRojas: rojasEquipo > 0 ? 100 * rojas / rojasEquipo : 0,
      superior: d.seniorPorPersona.has(j.person_id), minutos,
    };
  }).filter(x=>x.historialComparable).sort((a, b) => b.disponibilidad - a.disponibilidad || b.golesPorPartido - a.golesPorPartido);
  const pesoGoleador2025 = deMayorAMenor(metricasPrevias.filter((x) => x.pesoGoles > 0).map((x) => ({
    etiqueta: nombreGrafico(x.nombre), detalle: x.nombre, valor: Number(x.pesoGoles.toFixed(1)), sufijo: ' %',
    ayuda: `${x.goles} goles · ${x.golesPorPartido.toFixed(2)} por partido completo`, color: '#0d47a1',
  })));
  const pesoAmarillas2025 = deMayorAMenor(metricasPrevias.filter((x) => x.pesoAmarillas > 0).map((x) => ({
    etiqueta: nombreGrafico(x.nombre), detalle: x.nombre, valor: Number(x.pesoAmarillas.toFixed(1)), sufijo: ' %',
    ayuda: `${x.amarillas} amarillas · ${x.rojas} rojas`, color: '#e0a100',
  })));
  const pesoRojas2025 = deMayorAMenor(metricasPrevias.filter((x) => x.pesoRojas > 0).map((x) => ({
    etiqueta: nombreGrafico(x.nombre), detalle: x.nombre, valor: Number(x.pesoRojas.toFixed(1)), sufijo: ' %',
    ayuda: `${x.rojas} roja(s)`, color: '#b71c1c',
  })));
  const rankingHtml = `<section class="panel-decision"><h2>Lectura rápida para tomar decisiones</h2>
    <p class="nota">Orden inicial: disponibilidad de ${ETIQUETA_ANTERIOR}. En la versión HTML puede pulsarse cualquier encabezado para reordenar. Las tasas usan la duración reglamentaria de cada categoría.</p>
    <p class="nota">${metricasPrevias.length} jugadores con historial comparable. Los ${plantilla.length-metricasPrevias.length} restantes no se presentan como cero: faltan datos históricos con cobertura suficiente. «Equipo superior» indica apariciones registradas en el historial disponible, no un ascenso permanente.</p>
    <table id="ranking-jugadores" class="ranking"><thead><tr>
      <th>Jugador</th><th data-sort="num">Disponibilidad</th><th data-sort="num">Gol / partido</th>
      <th data-sort="num">% goles equipo</th><th data-sort="num">Amarillas / partido</th>
      <th data-sort="num">Rojas</th><th data-sort="text">Equipo superior</th></tr></thead><tbody>
      ${metricasPrevias.map((x) => `<tr><td>${fotoEnHtml(x, ETIQUETA_ANTERIOR)}<strong>${esc(x.nombre)}</strong></td>
        <td data-v="${x.disponibilidad}">${x.disponibilidad.toFixed(1)} %</td>
        <td data-v="${x.golesPorPartido}">${x.golesPorPartido.toFixed(2)}</td>
        <td data-v="${x.pesoGoles}">${x.pesoGoles.toFixed(1)} %</td>
        <td data-v="${x.amarillasPorPartido}">${x.amarillasPorPartido.toFixed(2)}</td>
        <td data-v="${x.rojas}">${x.rojas}</td><td data-v="${x.superior ? 'sí' : 'no'}">${x.superior ? 'Sí' : 'No'}</td></tr>`).join('')}
    </tbody></table></section>`;
  const bloqueGrafico = (titulo, contenido) => `<div class="grafico-bloque"><p class="titulo-grafica">${esc(titulo)}</p>${contenido}</div>`;
  const procedenciaBarras = [
    { etiqueta: 'Ya estaba en este equipo', valor: procedencia.juvenil.length },
    { etiqueta: 'Subió de otra categoría del club', valor: procedencia.mismaCasaOtraCategoria.length, color: '#42a5f5' },
    { etiqueta: 'Llegó de otro club', valor: procedencia.otroClub.length, color: '#0d47a1' },
    { etiqueta: 'Jugó en un equipo superior', valor: procedencia.senior.length, color: '#00897b' },
    { etiqueta: 'Sin datos en el archivo', valor: procedencia.sinDatos2025.length, color: '#9e9e9e' },
  ];

  let cuerpo = markdownAHtml(md).replace(/^<h1>[^<]*<\/h1>\s*(<h2>[^<]*<\/h2>)?/, '');
  cuerpo = cuerpo.replace(/\[\[foto:(\d+)(?::([^\]]+))?\]\]/g, (_, personId, temporada) => fotoEnTabla(personId, temporada));

  const portada = `<header class="portada">
    <div class="marca">${logoMarca ? `<img src="${esc(logoMarca)}" alt="C.D.M. Pizarrales">` : ''}<span>ANÁLISIS DE RIVAL · USO INTERNO</span></div>
    <div class="identidad">
      <div><p class="kicker">INFORME DE PLANTILLA</p><h1>${esc(contexto.club_nombre)}</h1>
      <h2>${esc(contexto.competicion)} · ${esc(contexto.temporada)}</h2>
      <p class="bajada">Trayectoria, disponibilidad, peso relativo y progresión de jugadores y cuerpo técnico.</p></div>
      ${logoEquipo ? `<img class="escudo-equipo" src="${esc(logoEquipo)}" alt="Escudo de ${esc(contexto.club_nombre)}">` : ''}
    </div>
    <div class="metadatos"><span>Actualizado ${new Date(d.generadoEn).toLocaleDateString('es-ES')}</span><span>${plantilla.length} jugadores inscritos e identificados</span><span>Datos hasta J${d.cobertura.ultima_jornada_con_resultado ?? '—'}</span></div>
  </header>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(contexto.club_nombre)} — ${esc(contexto.categoria)} · plantilla ${esc(contexto.temporada)}</title>
<style>
  @page { size: A4; margin: 15mm 13mm; }
  :root { --tinta:#17202a; --suave:#59636e; --linea:#d8dde3; --acento:#bd1e2d; --rival:#ed6b21; --papel:#ffffff; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.4 "Segoe UI", system-ui, sans-serif; color: var(--tinta); margin: 0; }
  h1 { font-size: 21pt; margin: 0 0 2pt; color: var(--acento); }
  h2 { font-size: 15pt; margin: 4pt 0 8pt; font-weight: 500; color: var(--suave); }
  h3 { font-size: 12.5pt; margin: 16pt 0 5pt; border-bottom: 2px solid var(--acento); padding-bottom: 3pt; }
  h4 { font-size: 11pt; margin: 12pt 0 3pt; color: var(--acento); }
  p { margin: 4pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 8.3pt; }
  thead { display: table-header-group; }
  th, td { border: 1px solid var(--linea); padding: 3pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-weight: 600; }
  tbody tr:nth-child(even) { background: #fafafa; }
  tr { page-break-inside: avoid; }
  blockquote { margin: 6pt 0; padding: 6pt 10pt; background: #f7f7f7; border-left: 3px solid var(--acento); color: var(--suave); font-size: 9.5pt; }
  hr { border: 0; border-top: 1px solid var(--linea); margin: 12pt 0; }
  .grafica { display: block; margin: 4pt 0 12pt; page-break-inside: avoid; }
  .grafica .etq { font-size: 8.5px; fill: #333; }
  .grafica .val { font-size: 8.5px; fill: #666; }
  .grafica .barra { cursor: help; }
  .grafica .barra:hover rect, .grafica .barra:focus rect { filter: brightness(1.18); stroke:#17202a; stroke-width:1; }
  .graficas { page-break-inside: auto; }
  .grafico-bloque { break-inside:avoid; page-break-inside:avoid; }
  .titulo-grafica { font-weight: 600; margin: 10pt 0 0; }
  .portada { border-top: 8pt solid var(--acento); padding-top: 10pt; margin-bottom: 14pt; page-break-inside: avoid; }
  .marca { display:flex; justify-content:space-between; align-items:center; color:var(--suave); font-size:7.5pt; letter-spacing:1.2pt; font-weight:700; }
  .marca img { width:42pt; height:42pt; object-fit:contain; }
  .identidad { display:flex; justify-content:space-between; align-items:center; gap:18pt; margin:10pt 0 12pt; }
  .identidad h1 { font-size:27pt; color:var(--tinta); }
  .identidad h2 { color:var(--rival); font-size:13pt; font-weight:650; }
  .kicker { color:var(--acento); font-size:8pt; font-weight:800; letter-spacing:1.6pt; }
  .bajada { max-width:390pt; color:var(--suave); font-size:10pt; }
  .escudo-equipo { width:90pt; height:90pt; object-fit:contain; }
  .metadatos { display:flex; gap:8pt; flex-wrap:wrap; padding:7pt 9pt; background:#f4f6f8; border-radius:4pt; font-size:8.5pt; }
  .metadatos span+span:before { content:'·'; margin-right:8pt; color:var(--acento); }
  .foto { width:32pt; height:40pt; object-fit:cover; border:1px solid var(--linea); border-radius:3pt; display:inline-block; vertical-align:middle; margin-right:4pt; }
  .foto-vacia { display: flex; align-items: center; justify-content: center; background: #f2f2f2; color: #999;
                font-size: 12pt; font-weight: 600; }
  .jugador-con-foto { white-space:nowrap; }
  .panel-decision { margin: 14pt 0; }
  .ranking th[data-sort] { cursor:pointer; text-decoration:underline dotted; text-underline-offset:2px; }
  .ranking td:first-child { min-width:145pt; }
  .ranking tr { break-inside:avoid; }
  .subdato { color:var(--suave); font-size:7.4pt; }
  .nota { font-size: 9pt; color: var(--suave); }
  .nota { font-size: 9pt; color: var(--suave); }
  .pie { margin-top: 20pt; padding-top: 6pt; border-top: 1px solid var(--linea); font-size: 8.5pt; color: var(--suave); }
  @media print { .ranking th[data-sort] { cursor:default; text-decoration:none; } }
</style>
</head>
<body>
${portada}
<div class="graficas">
${bloqueGrafico('Disponibilidad utilizada esta temporada', barras(disponibilidad2026, { etiqueta: 'Porcentaje de minutos disponibles jugados esta temporada', maximo: 100 }))}
${bloqueGrafico('Goles esta temporada', goles2026.length ? barras(goles2026, { etiqueta: 'Goles por jugador esta temporada' }) : '<p class="nota">Todavía no ha marcado nadie.</p>')}
${bloqueGrafico('Disponibilidad utilizada la temporada pasada, donde jugara cada uno', disponibilidad2025.length ? barras(disponibilidad2025, { etiqueta: 'Porcentaje de minutos disponibles la temporada pasada', color: '#5c5c5c', maximo: 100 }) : '<p class="nota">Sin datos de la temporada pasada para esta plantilla.</p>')}
${bloqueGrafico('Peso en los goles de sus equipos · '+ETIQUETA_ANTERIOR, pesoGoleador2025.length ? barras(pesoGoleador2025, { etiqueta: 'Porcentaje de goles de sus equipos marcados por cada jugador', maximo: 100 }) : '<p class="nota">Sin goles registrados en el histórico completo de la temporada anterior.</p>')}
${bloqueGrafico('Peso en las amarillas de sus equipos · '+ETIQUETA_ANTERIOR, pesoAmarillas2025.length ? barras(pesoAmarillas2025, { etiqueta: 'Porcentaje de amarillas de sus equipos recibidas por cada jugador', maximo: 100 }) : '<p class="nota">Sin amarillas registradas en el histórico completo de la temporada anterior.</p>')}
${bloqueGrafico('Peso en las rojas de sus equipos · '+ETIQUETA_ANTERIOR, pesoRojas2025.length ? barras(pesoRojas2025, { etiqueta: 'Porcentaje de rojas de sus equipos recibidas por cada jugador', maximo: 100 }) : '<p class="nota">Sin rojas registradas en el histórico completo de la temporada anterior.</p>')}
${bloqueGrafico('De dónde viene esta plantilla', barras(procedenciaBarras, { etiqueta: 'Procedencia de la plantilla', maximo: Math.max(1, plantilla.length) }))}
</div>
${rankingHtml}
${cuerpo}
<script>
document.querySelectorAll('#ranking-jugadores th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const tabla = th.closest('table'); const cuerpo = tabla.tBodies[0];
    const indice = [...th.parentElement.cells].indexOf(th); const asc = th.dataset.dir !== 'asc';
    [...cuerpo.rows].sort((a,b) => {
      const av = a.cells[indice].dataset.v ?? a.cells[indice].textContent.trim();
      const bv = b.cells[indice].dataset.v ?? b.cells[indice].textContent.trim();
      const cmp = th.dataset.sort === 'num' ? Number(av)-Number(bv) : av.localeCompare(bv, 'es');
      return asc ? cmp : -cmp;
    }).forEach(f => cuerpo.appendChild(f));
    tabla.querySelectorAll('th').forEach(x => delete x.dataset.dir); th.dataset.dir = asc ? 'asc' : 'desc';
  });
});
</script>
</body>
</html>`;
}

/** Conversor mínimo de markdown a HTML: títulos, tablas, listas, blockquote, hr, código y énfasis. */
function markdownAHtml(md) {
  const lineas = md.split('\n');
  const salida = [];
  let enTabla = false;
  let enLista = false;
  const cierra = () => {
    if (enTabla) { salida.push('</tbody></table>'); enTabla = false; }
    if (enLista) { salida.push('</ul>'); enLista = false; }
  };
  const enfasis = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)\*([^*]+)\*/g, '$1<em>$2</em>');

  for (const linea of lineas) {
    const l = linea.trimEnd();
    if (/^\|/.test(l)) {
      const celdas = l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (/^[\s|:-]+$/.test(l)) continue;                    // la fila de guiones del encabezado
      if (!enTabla) {
        enLista && (salida.push('</ul>'), (enLista = false));
        salida.push('<table><thead><tr>' + celdas.map((c) => `<th>${enfasis(c)}</th>`).join('') + '</tr></thead><tbody>');
        enTabla = true;
      } else {
        salida.push('<tr>' + celdas.map((c) => `<td>${enfasis(c)}</td>`).join('') + '</tr>');
      }
      continue;
    }
    cierra();
    if (l === '') { continue; }
    if (l === '---') { salida.push('<hr>'); continue; }
    let m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { salida.push(`<h${m[1].length}>${enfasis(m[2])}</h${m[1].length}>`); continue; }
    if ((m = /^>\s?(.*)$/.exec(l))) { salida.push(`<blockquote>${enfasis(m[1])}</blockquote>`); continue; }
    if ((m = /^[-*]\s+(.*)$/.exec(l))) {
      if (!enLista) { salida.push('<ul>'); enLista = true; }
      salida.push(`<li>${enfasis(m[1])}</li>`);
      continue;
    }
    if ((m = /^\d+\.\s+(.*)$/.exec(l))) { salida.push(`<p>${enfasis(l)}</p>`); continue; }
    salida.push(`<p>${enfasis(l)}</p>`);
  }
  cierra();
  return salida.join('\n');
}

if(argumentos.includes('--sql-consulta')){
 const nombre=arg('sql-consulta');if(!Object.hasOwn(CONSULTAS,nombre))throw Error('Consulta desconocida');
 process.stdout.write(CONSULTAS[nombre]);
}else await main();
