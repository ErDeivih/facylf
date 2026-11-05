import type { Consulta } from './contratos';

/**
 * Lo que la página de liga necesita y no estaba ya en el catálogo: **minutos de jugadores de equipos
 * inferiores** y **disciplina por equipo** (amarillas, expulsiones y partidos de sanción).
 *
 * Las demás piezas se reutilizan sin copiarlas: `GRUPO_POR_ID` y `CLASIFICACION_DE_LA_PANTALLA`
 * (`competiciones.ts`), `PARTIDOS_DE_GRUPO` (`partidos.ts`) y `EVENTOS_DEL_GRUPO` (`estadisticas.ts`).
 * Aquí sólo va lo que faltaba, con una consulta por bloque y sin recorrer tablas de hechos sin el
 * grupo delante.
 *
 * ── DE DÓNDE SALE CADA COSA ────────────────────────────────────────────────────────────────────────
 *
 * · La disciplina, de `analytics.player_team_season_summary` (una fila por persona y equipo-temporada):
 *   `amarillas`, `rojas` (que desde la versión 2 de métricas son EXPULSIONES) y `partidos_sancion`, que
 *   la proyección infiere de las actas. Si la proyección no ha llegado, `partidos_sancion` es `null` y
 *   se pinta «—», no un cero.
 * · Los minutos, de la misma tabla, con `minutos_exactos` y, si el acta no permite el cálculo exacto,
 *   `minutos_estimados`.
 * · Los minutos de cantera, de cruzar esa misma persona con OTRO equipo del MISMO club y la MISMA
 *   temporada de categoría inferior. La categoría se ordena con una escala explícita
 *   (prebenjamín < benjamín < alevín < infantil < cadete < juvenil < aficionados): sin escala, «inferior»
 *   no significa nada.
 *
 * Lo que no existe no se inventa: un equipo sin actas no tiene tarjetas «a cero», tiene `partidos_con_acta
 * = 0` y la pantalla lo dice; un equipo sin minutos publicados deja los porcentajes en `null`.
 */

/** La disciplina y los minutos de un equipo del grupo. */
export type FilaEquipoDeLiga = {
  equipo_id: number;
  equipo: string;
  /** Jugadores con resumen de la temporada en este equipo. `null` si no hay resumen. */
  jugadores: number | null;
  /** Minutos publicados de todo el equipo (exactos o estimados). `null` si no hay resumen. */
  minutos: number | null;
  /** Amarillas del equipo. `null` si no hay resumen. */
  amarillas: number | null;
  /** Expulsiones (partidos en que fue expulsado un jugador), no tarjetas rojas sueltas. */
  rojas: number | null;
  /** Partidos de sanción inferidos de las actas. `null` = la proyección no lo ha calculado. */
  partidos_sancion: number | null;
  /** Partidos del equipo con acta publicada: el denominador de la disciplina. */
  partidos_con_acta: number;
  /** Minutos jugados por futbolistas que también jugaron en un equipo inferior del mismo club. */
  minutos_inferiores: number | null;
  /** Cuántos futbolistas de equipos inferiores han jugado en este equipo. */
  jugadores_inferiores: number | null;
};

/**
 * Disciplina y cantera de un grupo, una fila por equipo.
 *
 * Parámetros: (1) grupo (`core.phase_group.id`).
 *
 * La agregación se hace por equipo y temporada: los resúmenes por persona se suman una vez y el
 * porcentaje de cantera se calcula sobre los minutos publicados del equipo, no sobre «minutos posibles»
 * que el acta no permite afirmar.
 */
export const DISCIPLINA_Y_CANTERA_DEL_GRUPO: Consulta<FilaEquipoDeLiga> = {
  nombre: 'disciplina-y-cantera-del-grupo',
  descripcion: 'Amarillas, expulsiones, partidos de sanción y minutos publicados de cada equipo de un grupo, con los minutos jugados por futbolistas de equipos inferiores del mismo club.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['equipo_id', 'equipo', 'jugadores', 'minutos', 'amarillas', 'rojas', 'partidos_sancion',
    'partidos_con_acta', 'minutos_inferiores', 'jugadores_inferiores'],
  sql: `
    with equipos as (
      select te.id                     as equipo_id,
             te.nombre_en_fuente       as equipo,
             ts.club_id,
             e.season_id,
             case lower(coalesce(e.categoria, ''))
               when 'prebenjamin' then 1 when 'benjamin' then 2 when 'alevin' then 3 when 'infantil' then 4
               when 'cadete' then 5 when 'juvenil' then 6 when 'aficionados' then 7 when 'veteranos' then 8
               else 0
             end                       as rango
        from core.team_entry te
        join core.team_season ts on ts.id = te.team_season_id
        join core.phase_group g on g.id = te.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
       where g.id = $1 and not te.retirado
    ),
    actas as (
      select e.equipo_id, count(distinct m.id)::int as partidos_con_acta
        from equipos e
        join core.match m on (m.home_team_entry_id = e.equipo_id or m.away_team_entry_id = e.equipo_id)
        join core.match_report r on r.match_id = m.id
       group by e.equipo_id
    ),
    resumen as (
      select s.team_entry_id                                 as equipo_id,
             count(*)::int                                   as jugadores,
             sum(coalesce(s.minutos_exactos, s.minutos_estimados))::int as minutos,
             sum(s.amarillas)::int                           as amarillas,
             sum(s.rojas)::int                               as rojas,
             sum(s.partidos_sancion)::int                    as partidos_sancion
        from analytics.player_team_season_summary s
        join equipos e on e.equipo_id = s.team_entry_id
       group by s.team_entry_id
    ),
    minutos as (
      select s.team_entry_id as equipo_id,
             s.person_id,
             coalesce(s.minutos_exactos, s.minutos_estimados) as minutos
        from analytics.player_team_season_summary s
        join equipos e on e.equipo_id = s.team_entry_id
       where coalesce(s.minutos_exactos, s.minutos_estimados, 0) > 0
    ),
    inferiores as (
      select m.equipo_id, m.person_id, m.minutos
        from minutos m
        join equipos t on t.equipo_id = m.equipo_id
       where t.rango > 1 and exists (
         select 1
           from analytics.player_team_season_summary s2
           join core.team_entry te2 on te2.id = s2.team_entry_id
           join core.team_season ts2 on ts2.id = te2.team_season_id
           join core.phase_group g2 on g2.id = te2.phase_group_id
           join core.competition_edition e2 on e2.id = g2.competition_edition_id
          where s2.person_id = m.person_id
            and s2.team_entry_id <> m.equipo_id
            and s2.season_id = t.season_id
            and ts2.club_id = t.club_id
            and coalesce(s2.minutos_exactos, s2.minutos_estimados, 0) > 0
            and (case lower(coalesce(e2.categoria, ''))
                  when 'prebenjamin' then 1 when 'benjamin' then 2 when 'alevin' then 3 when 'infantil' then 4
                  when 'cadete' then 5 when 'juvenil' then 6 when 'aficionados' then 7 when 'veteranos' then 8
                  else 0
                end) between 1 and t.rango - 1)
    )
    select e.equipo_id::int                            as equipo_id,
           e.equipo                                    as equipo,
           r.jugadores,
           r.minutos,
           r.amarillas,
           r.rojas,
           r.partidos_sancion,
           coalesce(a.partidos_con_acta, 0)::int       as partidos_con_acta,
           case when r.minutos is null then null
                else coalesce(sum(i.minutos) filter (where i.person_id is not null), 0)::int end as minutos_inferiores,
           case when r.minutos is null then null
                else count(distinct i.person_id)::int end as jugadores_inferiores
      from equipos e
      left join resumen r on r.equipo_id = e.equipo_id
      left join actas a on a.equipo_id = e.equipo_id
      left join inferiores i on i.equipo_id = e.equipo_id
     group by e.equipo_id, e.equipo, r.jugadores, r.minutos, r.amarillas, r.rojas, r.partidos_sancion,
              a.partidos_con_acta
     order by e.equipo
     limit 40`,
};

/** Las consultas propias de la página de liga, para la prueba de contrato. */
export const CONSULTAS_LIGA = [DISCIPLINA_Y_CANTERA_DEL_GRUPO] as const;

/** Parámetros por defecto: grupo 797 (Liga Nacional Juvenil, CyL, temporada 2025-26 completa). */
export const PARAMETROS_LIGA: Record<string, readonly unknown[]> = {
  'disciplina-y-cantera-del-grupo': [797],
};
