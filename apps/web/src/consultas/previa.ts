import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

export type JugadorPrevia = { persona_id: number; nombre: string; minutos: number | null; goles: number };
export type H2HPrevia = { fecha: string | null; local: string; visitante: string; gl: number; gv: number };
export type PuntoJornada = { jornada: number; puntos: number };

export type FilaPrevia = {
  match_id: number;
  local: string;
  visitante: string;
  local_id: number;
  visitante_id: number;
  local_tiene_escudo: boolean | null;
  visitante_tiene_escudo: boolean | null;
  local_club_id: number;
  visitante_club_id: number;
  edicion: string;
  grupo: string;
  jornada: number;
  fecha: string | null;
  hora: string | null;
  campo: string | null;
  municipio: string | null;
  arbitro: string | null;
  pred_local: number | null;
  pred_empate: number | null;
  pred_visitante: number | null;
  pred_local_low: number | null;
  pred_local_high: number | null;
  pred_empate_low: number | null;
  pred_empate_high: number | null;
  pred_visitante_low: number | null;
  pred_visitante_high: number | null;
  marcador: string | null;
  prob_marcador: number | null;
  matriz: Record<string, number> | null;
  jugadores_local: JugadorPrevia[];
  jugadores_visitante: JugadorPrevia[];
  h2h: H2HPrevia[];
  puntos_local: PuntoJornada[];
  puntos_visitante: PuntoJornada[];
};

/** Previa de un partido pendiente: contexto, predicción, plantillas conocidas, H2H y puntos por jornada. */
export const PREVIA_DEL_PARTIDO: Consulta<FilaPrevia> = {
  nombre: 'previa-del-partido',
  descripcion: 'Previa de un partido: contexto, predicción, plantillas, enfrentamientos y puntos por jornada.',
  plan: 'indexado',
  presupuestoMs: 800,
  columnas: ['match_id', 'local', 'visitante', 'local_id', 'visitante_id', 'local_tiene_escudo', 'visitante_tiene_escudo', 'local_club_id', 'visitante_club_id',
    'edicion', 'grupo', 'jornada', 'fecha', 'hora', 'campo', 'municipio', 'arbitro',
    'pred_local', 'pred_empate', 'pred_visitante', 'pred_local_low', 'pred_local_high',
    'pred_empate_low', 'pred_empate_high', 'pred_visitante_low', 'pred_visitante_high',
    'marcador', 'prob_marcador', 'matriz', 'jugadores_local', 'jugadores_visitante', 'h2h',
    'puntos_local', 'puntos_visitante'],
  sql: `
    select m.id match_id,
           el.nombre_en_fuente local, ev.nombre_en_fuente visitante,
           el.id local_id, ev.id visitante_id,
           exists(select 1 from core.club_asset ca where ca.club_id = tsl.club_id and ca.tipo='escudo' and ca.vigente) local_tiene_escudo,
           exists(select 1 from core.club_asset ca where ca.club_id = tsv.club_id and ca.tipo='escudo' and ca.vigente) visitante_tiene_escudo,
           tsl.club_id local_club_id, tsv.club_id visitante_club_id,
           e.nombre_publicado edicion, g.nombre grupo, d.numero jornada,
           to_char(coalesce(m.played_at, m.fecha_prevista::timestamptz), 'YYYY-MM-DD') fecha,
           case when m.hora_confirmada and m.played_at is not null
                then to_char(m.played_at at time zone 'UTC', 'HH24:MI') end hora,
           v.nombre campo, v.municipio,
           po.nombre_mostrado arbitro,
           ml.prob_local pred_local, ml.prob_empate pred_empate, ml.prob_visitante pred_visitante,
           ml.prob_local_low pred_local_low, ml.prob_local_high pred_local_high,
           ml.prob_empate_low pred_empate_low, ml.prob_empate_high pred_empate_high,
           ml.prob_visitante_low pred_visitante_low, ml.prob_visitante_high pred_visitante_high,
           coalesce(ml.marcador_probable, pp.marcador_probable) marcador,
           coalesce(ml.prob_marcador, pp.prob_marcador) prob_marcador,
           pp.matriz,
           (select jsonb_agg(jsonb_build_object('persona_id', ps.person_id, 'nombre', p.nombre_mostrado, 'minutos', coalesce(ps.minutos_exactos, ps.minutos_estimados), 'goles', ps.goles)
                    order by coalesce(ps.minutos_exactos, ps.minutos_estimados) desc nulls last)
              from analytics.player_team_season_summary ps
              join core.person p on p.id = ps.person_id
             where ps.team_entry_id = el.id limit 14) jugadores_local,
           (select jsonb_agg(jsonb_build_object('persona_id', ps.person_id, 'nombre', p.nombre_mostrado, 'minutos', coalesce(ps.minutos_exactos, ps.minutos_estimados), 'goles', ps.goles)
                    order by coalesce(ps.minutos_exactos, ps.minutos_estimados) desc nulls last)
              from analytics.player_team_season_summary ps
              join core.person p on p.id = ps.person_id
             where ps.team_entry_id = ev.id limit 14) jugadores_visitante,
           (select jsonb_agg(jsonb_build_object('fecha', x.fecha, 'local', x.local, 'visitante', x.visitante, 'gl', x.gl, 'gv', x.gv)
                    order by x.fecha desc)
              from (
                select to_char(coalesce(m2.played_at, m2.fecha_prevista::timestamptz), 'YYYY-MM-DD') fecha,
                       l2.nombre_en_fuente local, v2.nombre_en_fuente visitante, m2.goles_local gl, m2.goles_visitante gv
                  from core.match m2
                  join core.team_entry l2 on l2.id = m2.home_team_entry_id
                  join core.team_season l2s on l2s.id = l2.team_season_id
                  join core.team_entry v2 on v2.id = m2.away_team_entry_id
                  join core.team_season v2s on v2s.id = v2.team_season_id
                 where m2.goles_local is not null and m2.id <> m.id
                   and ((l2s.club_id = tsl.club_id and v2s.club_id = tsv.club_id)
                     or (l2s.club_id = tsv.club_id and v2s.club_id = tsl.club_id))
                 order by fecha desc nulls last
                 limit 5) x) h2h,
           (select jsonb_agg(jsonb_build_object('jornada', j, 'puntos', p) order by j)
              from (select d2.numero j,
                           sum(case when (m2.home_team_entry_id = el.id and m2.goles_local > m2.goles_visitante)
                                      or (m2.away_team_entry_id = el.id and m2.goles_visitante > m2.goles_local) then 3
                                    when m2.goles_local = m2.goles_visitante then 1 else 0 end) p
                      from core.match m2 join core.matchday d2 on d2.id = m2.matchday_id
                     where (m2.home_team_entry_id = el.id or m2.away_team_entry_id = el.id)
                       and m2.goles_local is not null
                     group by d2.numero) z) puntos_local,
           (select jsonb_agg(jsonb_build_object('jornada', j, 'puntos', p) order by j)
              from (select d2.numero j,
                           sum(case when (m2.home_team_entry_id = ev.id and m2.goles_local > m2.goles_visitante)
                                      or (m2.away_team_entry_id = ev.id and m2.goles_visitante > m2.goles_local) then 3
                                    when m2.goles_local = m2.goles_visitante then 1 else 0 end) p
                      from core.match m2 join core.matchday d2 on d2.id = m2.matchday_id
                     where (m2.home_team_entry_id = ev.id or m2.away_team_entry_id = ev.id)
                       and m2.goles_local is not null
                     group by d2.numero) z) puntos_visitante
      from core.match m
      join core.phase_group g on g.id = m.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.matchday d on d.id = m.matchday_id
      join core.team_entry el on el.id = m.home_team_entry_id
      join core.team_entry ev on ev.id = m.away_team_entry_id
      join core.team_season tsl on tsl.id = el.team_season_id
      join core.team_season tsv on tsv.id = ev.team_season_id
      left join core.venue v on v.id = m.venue_id
      left join core.match_official mo on mo.match_id = m.id and mo.rol = 'principal'
      left join core.person po on po.id = mo.person_id
      left join analytics.prediccion_ml ml on ml.match_id = m.id and ml.corte_datos is not null
      left join analytics.poisson_partido pp on pp.match_id = m.id
     where m.id = $1
     limit 1`,
};
