import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Identidad de un jugador entre federaciones y temporadas (migración 0024).
 *
 * La ficha de un jugador ya no es la de UNA identidad federativa: es la de su grupo de identidad
 * (`analytics.persona_grupo`), que junta las fichas que la máquina enlazó con evidencia alta y las que
 * una persona confirmó. Las propuestas sin confirmar se enseñan aparte, con su evidencia, para decidir.
 * Ver docs/plataforma-web/PLATAFORMA-NACIONAL.md §3.4.
 */

export type FilaTrayectoriaUnificada = {
  persona_id: number; temporada: string; temporada_orden: number;
  federacion: string; federacion_nombre: string;
  equipo_id: number; equipo: string; club_id: number; club: string;
  edicion: string; categoria: string; division: string | null; grupo: string;
  convocatorias: number; partidos_demostrados: number; titularidades: number;
  minutos_exactos: number | null; minutos_estimados: number | null; minutos_fiables: boolean;
  goles: number; amarillas: number; rojas: number;
  partidos_elegibles: number; partidos_cubiertos: number; total: number;
};

/**
 * Todas las temporadas de todas las fichas de la misma persona. Parámetros: (1) persona_id de cualquiera
 * de sus fichas, (2) límite. Si la persona no tiene grupo, es su propia ficha sola.
 */
export const TRAYECTORIA_UNIFICADA: Consulta<FilaTrayectoriaUnificada> = {
  nombre: 'trayectoria-unificada',
  descripcion: 'La trayectoria de una persona sumando todas sus fichas enlazadas (otras federaciones, o la misma sin código), temporada a temporada.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['persona_id', 'temporada', 'temporada_orden', 'federacion', 'federacion_nombre', 'equipo_id', 'equipo',
    'club_id', 'club', 'edicion', 'categoria', 'division', 'grupo', 'convocatorias', 'partidos_demostrados',
    'titularidades', 'minutos_exactos', 'minutos_estimados', 'minutos_fiables', 'goles', 'amarillas', 'rojas',
    'partidos_elegibles', 'partidos_cubiertos', 'total'],
  sql: `
    with grupo as (
      select coalesce((select grupo_id from analytics.persona_grupo where person_id = $1), $1::bigint) as g
    ),
    fichas as (
      select pg.person_id from analytics.persona_grupo pg, grupo where pg.grupo_id = grupo.g
      union select $1::bigint
    )
    select s.person_id as persona_id, se.etiqueta as temporada, se.orden::int as temporada_orden,
           f.codigo as federacion, f.nombre as federacion_nombre,
           te.id as equipo_id, ts.nombre as equipo, cl.id as club_id, cl.nombre_canonico as club,
           ce.nombre_publicado as edicion, ce.categoria, ce.division, g.nombre as grupo,
           s.convocatorias, s.partidos_demostrados, s.titularidades, s.minutos_exactos, s.minutos_estimados,
           s.minutos_fiables, s.goles, s.amarillas, s.rojas, s.partidos_elegibles, s.partidos_cubiertos,
           (count(*) over ())::int as total
      from fichas fi
      join analytics.player_team_season_summary s on s.person_id = fi.person_id
      join core.team_entry te on te.id = s.team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      join core.phase_group g on g.id = te.phase_group_id
      join core.competition_edition ce on ce.id = s.competition_edition_id
      join core.federation f on f.id = ce.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season se on se.id = s.season_id
     order by se.orden desc, s.partidos_demostrados desc, te.id
     limit $2`,
};

export type FilaCandidatoIdentidad = {
  candidato_id: number; otra_persona_id: number; nombre: string; federaciones: string;
  temporadas: string; partidos: number; estado: string; score: number; margen: number | null;
  homonimos_esperados: number | null; hueco_temporadas: number | null; rivales: number | null;
  total: number;
};

/**
 * Las otras fichas que la máquina relaciona con esta persona y que NO están unidas (pendientes de
 * confirmar), con su evidencia. Parámetros: (1) persona_id, (2) límite.
 */
export const CANDIDATOS_DE_IDENTIDAD: Consulta<FilaCandidatoIdentidad> = {
  nombre: 'candidatos-de-identidad',
  descripcion: 'Fichas con el mismo nombre y trayectoria compatible que esperan una decisión: es la misma persona o no.',
  plan: 'indexado',
  presupuestoMs: 200,
  columnas: ['candidato_id', 'otra_persona_id', 'nombre', 'federaciones', 'temporadas', 'partidos', 'estado',
    'score', 'margen', 'homonimos_esperados', 'hueco_temporadas', 'rivales', 'total'],
  sql: `
    select c.id as candidato_id,
           o.id as otra_persona_id,
           o.nombre_mostrado as nombre,
           (select string_agg(distinct f.nombre, ' · ') from core.federation f where f.id = any(pp.federaciones)
               and (${SQL_FEDERACION_NO_EXCLUIDA})) as federaciones,
           (select string_agg(x::text, ', ' order by x) from unnest(pp.anios) x) as temporadas,
           coalesce(pp.partidos, 0) as partidos,
           c.estado, c.score::float8 as score, c.margen::float8 as margen,
           (c.features_json->>'homonimos_esperados')::float8 as homonimos_esperados,
           (c.features_json->>'hueco_temporadas')::int as hueco_temporadas,
           (c.features_json->>'rivales')::int as rivales,
           (count(*) over ())::int as total
      from core.identity_candidate c
      join core.person o on o.id = case when c.person_a = $1 then c.person_b else c.person_a end
      left join analytics.persona_perfil pp on pp.person_id = o.id
     where (c.person_a = $1 or c.person_b = $1)
       and c.estado = 'pendiente'
     order by c.score desc, c.id
     limit $2`,
};

export const PARAMETROS_IDENTIDAD: Record<string, readonly unknown[]> = {
  'trayectoria-unificada': [1, 80],
  'candidatos-de-identidad': [1, 20],
};

/** Las consultas de identidad, para la medición de planes (`pnpm planes`). */
export const CONSULTAS_IDENTIDAD = [TRAYECTORIA_UNIFICADA, CANDIDATOS_DE_IDENTIDAD] as const;
