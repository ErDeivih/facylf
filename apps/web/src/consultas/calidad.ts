/**
 * Panel de calidad global: todos los grupos de una temporada con las tres reglas (PJ, puntos, goles) y el % de
 * actas, más los contadores (grupos, OK, KO) en la MISMA fila, para que el contador no pueda contradecir a la
 * columna.
 *
 * Parámetros: (1) etiqueta de temporada (p. ej. '2026-27').
 */
import type { Consulta } from './contratos';

export type FilaCalidadGlobal = {
  grupo_id: number;
  edicion: string;
  grupo: string;
  federacion: string;
  partidos: number;
  con_resultado: number;
  con_acta: number;
  porcentaje_actas: number;
  descuadre_pj: number;
  descuadre_puntos: number;
  descuadre_goles: number;
  resultado: string;
  total_grupos: number;
  total_ko: number;
};

export const CALIDAD_GLOBAL: Consulta<FilaCalidadGlobal> = {
  nombre: 'calidad-global',
  descripcion: 'Todos los grupos de una temporada de CyL con las reglas de coherencia, el % de actas y los contadores.',
  plan: 'indexado',
  presupuestoMs: 8000,
  columnas: ['grupo_id', 'edicion', 'grupo', 'federacion', 'partidos', 'con_resultado', 'con_acta',
    'porcentaje_actas', 'descuadre_pj', 'descuadre_puntos', 'descuadre_goles', 'resultado',
    'total_grupos', 'total_ko'],
  sql: `
    with resultados as (
      select m.phase_group_id gid, m.home_team_entry_id te, m.goles_local gf, m.goles_visitante gc
        from core.match m
        join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.season s on s.id = e.season_id
        join core.federation f on f.id = e.federation_id
       where f.nombre ilike '%castilla%' and s.etiqueta = $1
         and m.goles_local is not null and m.goles_visitante is not null
      union all
      select m.phase_group_id, m.away_team_entry_id, m.goles_visitante, m.goles_local
        from core.match m
        join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.season s on s.id = e.season_id
        join core.federation f on f.id = e.federation_id
       where f.nombre ilike '%castilla%' and s.etiqueta = $1
         and m.goles_local is not null and m.goles_visitante is not null
    ),
    calc as (
      select gid, te, count(*)::int jugados,
             count(*) filter (where gf > gc)::int ganados,
             count(*) filter (where gf = gc)::int empatados,
             count(*) filter (where gf < gc)::int perdidos,
             sum(gf)::int gf, sum(gc)::int gc,
             sum(case when gf > gc then 3 when gf = gc then 1 else 0 end)::int puntos
        from resultados group by 1, 2
    ),
    grupo as (
      select gid,
             sum(jugados - (ganados + empatados + perdidos))::int descuadre_pj,
             sum(puntos - (3 * ganados + empatados))::int descuadre_puntos,
             (sum(gf) - sum(gc))::int descuadre_goles
        from calc group by 1
    ),
    datos as (
      select g.id grupo_id,
             e.nombre_publicado edicion,
             g.nombre grupo,
             f.nombre federacion,
             (select count(*)::int from core.match m where m.phase_group_id = g.id) partidos,
             (select count(*)::int from core.match m
               where m.phase_group_id = g.id and m.goles_local is not null) con_resultado,
             (select count(*)::int from core.match m
               where m.phase_group_id = g.id
                 and exists (select 1 from core.match_report r where r.match_id = m.id)) con_acta,
             coalesce(gr.descuadre_pj, 0) descuadre_pj,
             coalesce(gr.descuadre_puntos, 0) descuadre_puntos,
             coalesce(gr.descuadre_goles, 0) descuadre_goles
        from grupo gr
        join core.phase_group g on g.id = gr.gid
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.season s on s.id = e.season_id
        join core.federation f on f.id = e.federation_id
       where f.nombre ilike '%castilla%' and s.etiqueta = $1
    ),
    con_estado as (
      select *,
             case when descuadre_pj = 0 and descuadre_puntos = 0 and descuadre_goles = 0 then 'OK' else 'KO' end as resultado,
             case when con_resultado = 0 then 0
                  else round(100.0 * con_acta / con_resultado)::int end as porcentaje_actas
        from datos
    )
    select c.*,
           count(*) over ()::int total_grupos,
           count(*) filter (where c.resultado = 'KO') over ()::int total_ko
      from con_estado c
     order by c.resultado desc, c.descuadre_pj, c.descuadre_puntos, c.descuadre_goles, c.edicion, c.grupo
     limit 400`,
};
