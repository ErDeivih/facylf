import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Consultas de los paneles: rankings, evolución de club, zonas de la clasificación, panel de equipo,
 * comparador de jugadores y comparación de ligas. Todas leen `analytics` (0023-0026): ninguna agrega
 * actas de más de un equipo o de un grupo en la petición, salvo las marcadas `agregado`.
 * Ver docs/plataforma-web/PLATAFORMA-NACIONAL.md §6.
 */

export type FilaRanking = {
  posicion: number; persona_id: number; grupo_persona_id: number; nombre: string; es_menor: boolean;
  equipo_id: number; equipo: string; club_id: number; federacion: string; federacion_nombre: string;
  edicion: string; division: string; grupo: string; goles: number; goles_penalti: number;
  partidos: number; goles_por_partido: number | null; minutos_por_gol: number | null; total: number;
};

/**
 * Goleadores de un grupo, de una división o de una categoría entera cruzando federaciones.
 * Parámetros: (1) federación o null = todas, (2) temporada AAAA-AA, (3) categoría o null, (4) división o
 * null, (5) phase_group_id o null, (6) mínimo de partidos, (7) límite.
 * `minutos_por_gol` sólo cuando los minutos del jugador son fiables en ese equipo; si no, null.
 */
export const RANKING_GOLEADORES: Consulta<FilaRanking> = {
  nombre: 'ranking-goleadores',
  descripcion: 'Máximos goleadores por grupo, división o categoría, en una federación o en todas.',
  plan: 'indexado',
  presupuestoMs: 500,
  columnas: ['posicion', 'persona_id', 'grupo_persona_id', 'nombre', 'es_menor', 'equipo_id', 'equipo', 'club_id',
    'federacion', 'federacion_nombre', 'edicion', 'division', 'grupo', 'goles', 'goles_penalti', 'partidos',
    'goles_por_partido', 'minutos_por_gol', 'total'],
  sql: `
    select (rank() over (order by s.goles desc, s.partidos_demostrados asc))::int as posicion,
           s.person_id as persona_id, coalesce(pg2.grupo_id, s.person_id) as grupo_persona_id,
           p.nombre_mostrado as nombre, p.es_menor,
           te.id as equipo_id, ts.nombre as equipo, ts.club_id,
           f.codigo as federacion, f.nombre as federacion_nombre,
           ce.nombre_publicado as edicion, ce.division, g.nombre as grupo,
           s.goles, s.goles_penalti, s.partidos_demostrados as partidos,
           round(s.goles::numeric / nullif(s.partidos_demostrados, 0), 2)::float8 as goles_por_partido,
           case when s.minutos_fiables and s.goles > 0 then round(s.minutos_exactos::numeric / s.goles)::int end as minutos_por_gol,
           (count(*) over ())::int as total
      from core.competition_edition ce
      join core.season se on se.id = ce.season_id and se.etiqueta = $2
      join core.federation f on f.id = ce.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join analytics.player_team_season_summary s on s.competition_edition_id = ce.id
      join core.team_entry te on te.id = s.team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
      join core.phase_group g on g.id = te.phase_group_id
      join core.person p on p.id = s.person_id
      left join analytics.persona_grupo pg2 on pg2.person_id = s.person_id
     where ($1::text is null or f.codigo = $1)
       and ($3::text is null or ce.categoria = $3)
       and ($4::text is null or ce.division = $4)
       and ($5::bigint is null or te.phase_group_id = $5)
       and ($8::text is null
            or ($8 = 'futbol' and ce.modalidad in ('futbol11','futbol8','futbol7','desconocida'))
            or ce.modalidad = $8)
       and ($9::text is null or ce.genero = $9)
       and ce.ambito <> 'copa'
       and s.goles > 0 and s.partidos_demostrados >= $6
     order by s.goles desc, s.partidos_demostrados asc, p.nombre_mostrado
     limit $7`,
};

export type FilaEvolucionClub = {
  linea: string; letra: string; categoria: string; genero: string; modalidad: string;
  anio: number; temporada: string; division: string; nivel: number | null; posicion: number | null;
  equipos: number | null; movimiento: string | null; jugo_fase_ascenso: boolean;
  equipo_id: number; edicion: string; grupo: string; grupo_id: number; total: number;
};

/** Cada equipo del club (A, B, C… por categoría) temporada a temporada. Parámetros: (1) club_id, (2) límite. */
export const EVOLUCION_DEL_CLUB: Consulta<FilaEvolucionClub> = {
  nombre: 'evolucion-del-club',
  descripcion: 'Dónde jugó cada equipo del club cada temporada, su puesto final y si ascendió o descendió.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['linea', 'letra', 'categoria', 'genero', 'modalidad', 'anio', 'temporada', 'division', 'nivel',
    'posicion', 'equipos', 'movimiento', 'jugo_fase_ascenso', 'equipo_id', 'edicion', 'grupo', 'grupo_id', 'total'],
  sql: `
    select l.linea, l.letra, l.categoria, l.genero, l.modalidad, l.anio::int, se.etiqueta as temporada,
           l.division, l.nivel, l.posicion, l.equipos, l.movimiento, l.jugo_fase_ascenso,
           l.team_entry_id as equipo_id, ce.nombre_publicado as edicion, g.nombre as grupo, g.id as grupo_id,
           (count(*) over ())::int as total
      from analytics.linea_equipo_temporada l
      join core.season se on se.id = l.season_id
      join core.competition_edition ce on ce.id = l.competition_edition_id
      join core.phase_group g on g.id = l.phase_group_id
      join core.federation f on f.id = l.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
     where l.club_id = $1
     order by array_position(array['aficionados','juvenil','cadete','infantil','alevin','benjamin','prebenjamin','veteranos','desconocida'], l.categoria),
              l.genero, l.letra, l.anio desc
     limit $2`,
};

export type FilaZonas = {
  ascensos: number; promocion: number; descensos: number; promocion_permanencia: number;
  origen: string; confianza: number | null; temporadas: number | null;
};

/** Zonas para pintar la clasificación de un grupo. Parámetros: (1) phase_group_id. */
export const ZONAS_DEL_GRUPO: Consulta<FilaZonas> = {
  nombre: 'zonas-del-grupo',
  descripcion: 'Cuántos ascienden, juegan promoción, descienden o juegan permanencia en el grupo, y de dónde sale (reglamento o aprendido).',
  plan: 'indexado',
  presupuestoMs: 100,
  columnas: ['ascensos', 'promocion', 'descensos', 'promocion_permanencia', 'origen', 'confianza', 'temporadas'],
  sql: `
    select ascensos, promocion, descensos, promocion_permanencia, origen, confianza::float8, temporadas
      from analytics.zonas_de_grupo where phase_group_id = $1
     limit 1`,
};

export type FilaJornadaEquipo = {
  jornada: number; fecha: string | null; rival: string; condicion: string;
  goles_favor: number | null; goles_contra: number | null; resultado: string;
  puntos_acumulados: number; posicion_oficial: number | null; total: number;
};

/** Curva del equipo jornada a jornada: puntos acumulados y puesto oficial. Parámetros: (1) team_entry_id, (2) límite. */
export const CURVA_DEL_EQUIPO: Consulta<FilaJornadaEquipo> = {
  nombre: 'curva-del-equipo',
  descripcion: 'Resultado, puntos acumulados y puesto oficial del equipo en cada jornada (para el gráfico de evolución).',
  plan: 'indexado',
  presupuestoMs: 200,
  columnas: ['jornada', 'fecha', 'rival', 'condicion', 'goles_favor', 'goles_contra', 'resultado',
    'puntos_acumulados', 'posicion_oficial', 'total'],
  sql: `
    with partidos as (
      select md.numero as jornada, md.id as matchday_id, coalesce(m.played_at::date, m.fecha_prevista) as fecha,
             case when m.home_team_entry_id = $1 then 'local' else 'visitante' end as condicion,
             case when m.home_team_entry_id = $1 then ta.nombre_en_fuente else th.nombre_en_fuente end as rival,
             case when m.home_team_entry_id = $1 then m.goles_local else m.goles_visitante end as gf,
             case when m.home_team_entry_id = $1 then m.goles_visitante else m.goles_local end as gc
        from core.match m
        join core.matchday md on md.id = m.matchday_id
        left join core.team_entry th on th.id = m.home_team_entry_id
        left join core.team_entry ta on ta.id = m.away_team_entry_id
       where m.home_team_entry_id = $1 or m.away_team_entry_id = $1
    )
    select p.jornada::int, p.fecha::text, p.rival, p.condicion, p.gf as goles_favor, p.gc as goles_contra,
           case when p.gf is null or p.gc is null then 'sin_resultado' when p.gf > p.gc then 'ganado'
                when p.gf = p.gc then 'empatado' else 'perdido' end as resultado,
           (sum(case when p.gf > p.gc then 3 when p.gf = p.gc then 1 else 0 end) over (order by p.jornada))::int as puntos_acumulados,
           ss.posicion::int as posicion_oficial,
           (count(*) over ())::int as total
      from partidos p
      left join core.standing_snapshot ss on ss.matchday_id = p.matchday_id and ss.team_entry_id = $1 and ss.origen = 'oficial'
     order by p.jornada
     limit $2`,
};

export type FilaGolesPorTramo = { tramo: string; orden: number; a_favor: number; en_contra: number; total: number };

/** Goles a favor y en contra por tramos de 15 minutos. Parámetros: (1) team_entry_id. Sin minuto, «sin minuto». */
export const GOLES_POR_TRAMO: Consulta<FilaGolesPorTramo> = {
  nombre: 'goles-por-tramo',
  descripcion: 'Cuándo marca y cuándo encaja el equipo, por tramos de 15 minutos; los goles sin minuto aparecen aparte.',
  plan: 'indexado',
  presupuestoMs: 200,
  columnas: ['tramo', 'orden', 'a_favor', 'en_contra', 'total'],
  sql: `
    with goles as (
      select e.minute_base as minuto,
             -- Lado al que sube el gol: el que publica el acta; si no, el del goleador (al revés en propia puerta).
             (coalesce(e.lado_beneficiado,
                       case when e.subtipo = 'propia_puerta' then case e.lado when 'local' then 'visitante' else 'local' end
                            else e.lado end)
              = case when m.home_team_entry_id = $1 then 'local' else 'visitante' end) as favor
        from core.match m
        join core.match_event e on e.match_id = m.id and e.event_type = 'gol'
       where m.home_team_entry_id = $1 or m.away_team_entry_id = $1
    ),
    tramos as (
      select case when minuto is null then 99 else least(minuto / 15, 6) end as orden, favor from goles
       where favor is not null
    )
    select case orden when 99 then 'sin minuto' when 6 then '90+'
                else (orden * 15)::text || '-' || (orden * 15 + 15)::text end as tramo,
           orden::int, count(*) filter (where favor)::int as a_favor, count(*) filter (where not favor)::int as en_contra,
           (count(*) over ())::int as total
      from tramos group by orden order by orden
     limit 10`,
};

export type FilaComparador = {
  grupo_persona_id: number; nombre: string; es_menor: boolean; federaciones: string; temporadas: number;
  primera: string; ultima: string; partidos: number; titularidades: number; goles: number;
  minutos_fiables: number | null; amarillas: number; rojas: number; categoria_mas_alta: string | null; total: number;
};

/**
 * Comparador: totales de carrera de 2 a 4 jugadores, sumando todas sus fichas enlazadas aunque sean de
 * federaciones distintas. Parámetros: (1) persona_id[] (cualquiera de sus fichas).
 */
export const COMPARADOR_JUGADORES: Consulta<FilaComparador> = {
  nombre: 'comparador-jugadores',
  descripcion: 'Totales de carrera de varios jugadores, cada uno sumando sus fichas de cualquier federación.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['grupo_persona_id', 'nombre', 'es_menor', 'federaciones', 'temporadas', 'primera', 'ultima', 'partidos',
    'titularidades', 'goles', 'minutos_fiables', 'amarillas', 'rojas', 'categoria_mas_alta', 'total'],
  sql: `
    with pedidos as (
      select distinct coalesce(pg.grupo_id, x) as g from unnest($1::bigint[]) x
        left join analytics.persona_grupo pg on pg.person_id = x
    ),
    fichas as (
      select p.g, coalesce(pg.person_id, p.g) as person_id from pedidos p
        left join analytics.persona_grupo pg on pg.grupo_id = p.g
    )
    select fi.g as grupo_persona_id, max(pe.nombre_mostrado) as nombre, bool_or(pe.es_menor) as es_menor,
           string_agg(distinct f.nombre, ' · ') as federaciones, count(distinct s.season_id)::int as temporadas,
           min(se.etiqueta) as primera, max(se.etiqueta) as ultima,
           sum(s.partidos_demostrados)::int as partidos, sum(s.titularidades)::int as titularidades, sum(s.goles)::int as goles,
           sum(s.minutos_exactos) filter (where s.minutos_fiables)::int as minutos_fiables,
           sum(s.amarillas)::int as amarillas, sum(s.rojas)::int as rojas,
           (array_agg(ce.categoria order by array_position(array['aficionados','juvenil','cadete','infantil','alevin','benjamin','prebenjamin'], ce.categoria)))[1] as categoria_mas_alta,
           (count(*) over ())::int as total
      from fichas fi
      join core.person pe on pe.id = fi.person_id
      join analytics.player_team_season_summary s on s.person_id = fi.person_id
      join core.competition_edition ce on ce.id = s.competition_edition_id
      join core.federation f on f.id = ce.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season se on se.id = s.season_id
     group by fi.g
     limit 4`,
};

export type FilaLiga = {
  federacion: string; federacion_nombre: string; edicion_id: number; edicion: string; grupos: number;
  equipos: number; partidos: number; goles_por_partido: number | null; victorias_local_pct: number | null;
  empates_pct: number | null; diferencia_lider_ultimo: number | null; total: number;
};

/**
 * Comparación de ligas del mismo escalón en distintas federaciones (base del análisis futuro).
 * Parámetros: (1) temporada, (2) categoría, (3) división, (4) límite. Agrega resúmenes de equipo, no actas.
 */
export const COMPARACION_DE_LIGAS: Consulta<FilaLiga> = {
  nombre: 'comparacion-de-ligas',
  descripcion: 'Goles por partido, ventaja local, empates y competitividad de las ligas de un mismo escalón en cada federación.',
  plan: 'agregado',
  presupuestoMs: 800,
  columnas: ['federacion', 'federacion_nombre', 'edicion_id', 'edicion', 'grupos', 'equipos', 'partidos',
    'goles_por_partido', 'victorias_local_pct', 'empates_pct', 'diferencia_lider_ultimo', 'total'],
  sql: `
    with ed as (
      select ce.id, ce.nombre_publicado, f.codigo, f.nombre from core.competition_edition ce
        join core.season se on se.id = ce.season_id and se.etiqueta = $1
        join core.federation f on f.id = ce.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
       where ce.categoria = $2 and ce.division = $3 and ce.ambito <> 'copa'
    ),
    por_grupo as (
      select pg.competition_edition_id as ed_id, t.phase_group_id,
             count(*) as equipos, sum(t.jugados) / 2.0 as partidos, sum(t.goles_favor) as goles,
             sum(t.jugados_casa) as jugados_casa,
             max(t.puntos) - min(t.puntos) as diferencia
        from analytics.team_edition_summary t
        join core.phase_group pg on pg.id = t.phase_group_id
       where pg.competition_edition_id in (select id from ed)
       group by 1, 2
    ),
    resultados as (
      select pg.competition_edition_id as ed_id,
             count(*) filter (where m.goles_local > m.goles_visitante) as gana_local,
             count(*) filter (where m.goles_local = m.goles_visitante) as empates,
             count(*) filter (where m.goles_local is not null and m.goles_visitante is not null) as con_resultado
        from core.match m join core.phase_group pg on pg.id = m.phase_group_id
       where pg.competition_edition_id in (select id from ed)
       group by 1
    )
    select ed.codigo as federacion, ed.nombre as federacion_nombre, ed.id as edicion_id, ed.nombre_publicado as edicion,
           count(pgr.phase_group_id)::int as grupos, sum(pgr.equipos)::int as equipos, sum(pgr.partidos)::int as partidos,
           round(sum(pgr.goles) / nullif(sum(pgr.partidos), 0), 2)::float8 as goles_por_partido,
           round(100.0 * max(r.gana_local) / nullif(max(r.con_resultado), 0), 1)::float8 as victorias_local_pct,
           round(100.0 * max(r.empates) / nullif(max(r.con_resultado), 0), 1)::float8 as empates_pct,
           round(avg(pgr.diferencia), 1)::float8 as diferencia_lider_ultimo,
           (count(*) over ())::int as total
      from ed
      join por_grupo pgr on pgr.ed_id = ed.id
      left join resultados r on r.ed_id = ed.id
     group by ed.codigo, ed.nombre, ed.id, ed.nombre_publicado
     order by goles_por_partido desc nulls last
     limit $4`,
};

export const PARAMETROS_PANELES: Record<string, readonly unknown[]> = {
  'ranking-goleadores': [null, '2025-26', 'juvenil', null, null, 3, 50],
  'evolucion-del-club': [16, 200],
  'zonas-del-grupo': [1],
  'curva-del-equipo': [2489, 60],
  'goles-por-tramo': [2489],
  'comparador-jugadores': [[1, 2]],
  'comparacion-de-ligas': ['2025-26', 'juvenil', 'liga-nacional', 40],
};


export type FilaZonasHistoricas = { ascensos: number; promocion: number; descensos: number; temporadas: number };

/**
 * Zonas de grupos comparables de la misma federación, categoría, división y género. Solo se usa como
 * respaldo cuando el grupo actual no tiene reglamento ni zona aprendida; la pantalla lo dice y nunca lo
 * presenta como el reglamento de este grupo.
 */
export const ZONAS_HISTORICAS: Consulta<FilaZonasHistoricas> = {
  nombre: 'zonas-historicas',
  descripcion: 'Patrón de ascensos, promoción y descensos más repetido en grupos comparables de temporadas anteriores.',
  plan: 'indexado',
  presupuestoMs: 100,
  columnas: ['ascensos', 'promocion', 'descensos', 'temporadas'],
  sql: `
    select z.ascensos, z.promocion, z.descensos, count(*)::int temporadas
      from analytics.zonas_de_grupo z
      join core.phase_group pg on pg.id = z.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
     where ce.categoria = $1 and ce.division = $2 and ce.genero = $3
       and ce.federation_id = (select ce2.federation_id from core.phase_group pg2
                                 join core.competition_edition ce2 on ce2.id = pg2.competition_edition_id
                                where pg2.id = $4)
       and ce.modalidad = (select ce2.modalidad from core.phase_group pg2
                             join core.competition_edition ce2 on ce2.id = pg2.competition_edition_id
                            where pg2.id = $4)
       and coalesce(ce.provincia, '') = coalesce((select ce2.provincia from core.phase_group pg2
                                                   join core.competition_edition ce2 on ce2.id = pg2.competition_edition_id
                                                  where pg2.id = $4), '')
       and z.phase_group_id <> $4 and z.origen = 'aprendida' and z.temporadas >= 2
     group by z.ascensos, z.promocion, z.descensos
     order by count(*) desc
     limit 1`,
};


export type FilaArrastre = {
  equipo_id: number; equipo: string; club_id: number;
  filial_id: number; filial: string; nivel: number;
};

/** Posibles arrastres: mismo club con otro equipo en una categoría inferior de la misma temporada. */
export const ARRASTRES_DEL_GRUPO: Consulta<FilaArrastre> = {
  nombre: 'arrastres-del-grupo',
  descripcion: 'Equipos del grupo que tienen otro equipo del mismo club en una categoría inferior; solo candidatos a arrastre, no una plaza confirmada.',
  plan: 'indexado',
  presupuestoMs: 150,
  columnas: ['equipo_id', 'equipo', 'club_id', 'filial_id', 'filial', 'nivel'],
  sql: `
    with actual as (
      select te.id equipo_id, te.nombre_en_fuente equipo, ts.club_id, ce.nivel,
             ce.season_id, ce.federation_id, ce.categoria, ce.modalidad, ce.genero
        from core.phase_group pg
        join core.team_entry te on te.phase_group_id = pg.id
        join core.team_season ts on ts.id = te.team_season_id
        join core.competition_edition ce on ce.id = pg.competition_edition_id
       where pg.id = $1
    )
    select a.equipo_id, a.equipo, a.club_id,
           b.id filial_id, b.nombre_en_fuente filial, ce2.nivel
      from actual a
      join core.team_season ts2 on ts2.club_id = a.club_id and ts2.season_id = a.season_id
      join core.team_entry b on b.team_season_id = ts2.id and b.id <> a.equipo_id
      join core.phase_group pg2 on pg2.id = b.phase_group_id
      join core.competition_edition ce2 on ce2.id = pg2.competition_edition_id
     where ce2.federation_id = a.federation_id
       and ce2.season_id = a.season_id
       and ce2.categoria = a.categoria
       and ce2.modalidad = a.modalidad
       and ce2.genero = a.genero
       and ce2.ambito <> 'copa'
       and ce2.nivel = (select min(ce3.nivel) from core.competition_edition ce3
                         where ce3.federation_id = a.federation_id and ce3.season_id = a.season_id
                           and ce3.categoria = a.categoria and ce3.modalidad = a.modalidad
                           and ce3.genero = a.genero and ce3.ambito <> 'copa'
                           and ce3.nivel > a.nivel)
     order by a.equipo, ce2.nivel, b.nombre_en_fuente
     limit 40`,
};

export const CONSULTAS_PANELES = [RANKING_GOLEADORES, EVOLUCION_DEL_CLUB, ZONAS_DEL_GRUPO, ZONAS_HISTORICAS, ARRASTRES_DEL_GRUPO, CURVA_DEL_EQUIPO,
  GOLES_POR_TRAMO, COMPARADOR_JUGADORES, COMPARACION_DE_LIGAS] as const;
