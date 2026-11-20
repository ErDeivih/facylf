import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Historial de un jugador (feedback de David, 05/11/2026): todos sus equipos y clubes, con los cambios
 * a mitad de temporada.
 *
 * La trayectoria agregada (`trayectoria-de-persona`) da una fila por temporada y equipo, pero no dice
 * **cuándo** empieza y acaba cada tramo ni permite ver un cambio dentro de una temporada. Esta consulta
 * baja a la aparición (`core.appearance`): una fila por partido en el que la persona está en el acta,
 * con su equipo, su club, su competición y la fecha. El agrupado en tramos se hace en
 * `lib/historial-jugador.ts`, que es puro y se prueba sin base.
 *
 * Una sola consulta por pantalla: persona + apariciones en un JSON. Las cifras de cada aparición (goles,
 * tarjetas) salen de `core.match_event` y los minutos del resumen por equipo-temporada
 * (`analytics.player_team_season_summary`), que es el único sitio donde la fiabilidad de los minutos está
 * calculada; no se inventan minutos a partir de las actas aquí.
 *
 * Regla del proyecto: una persona sin apariciones devuelve UNA fila con la lista vacía (existe, pero no
 * hay historial publicado); un id que no es una persona no devuelve ninguna fila, y la página es 404.
 */

/** Una aparición en un partido: el ladrillo con el que se construyen los tramos. */
export type AparicionDeHistorial = {
  match_id: number;
  team_entry_id: number;
  /** `starter`, `substitute` o `called_up_unknown`. */
  condicion: string;
  /** Fecha del partido (la jugada o, si no se jugó, la prevista publicada). */
  fecha: string | null;
  temporada: string;
  temporada_orden: number;
  equipo: string;
  club_id: number;
  club: string;
  edicion: string;
  edicion_id: number;
  grupo_id: number;
  grupo: string;
  federacion: string;
  federacion_nombre: string;
  goles: number;
  goles_penalti: number;
  propias: number;
  amarillas: number;
  rojas: number;
  minutos_exactos: number | null;
  minutos_estimados: number | null;
  minutos_fiables: boolean | null;
};

/** Lo que la pantalla del historial necesita de una persona. */
export type FilaHistorialJugador = {
  persona_id: number;
  nombre_mostrado: string;
  es_menor: boolean;
  identidad_nominal: boolean;
  apariciones: AparicionDeHistorial[];
};

/**
 * Historial completo de una persona en una sola consulta. Parámetros: (1) `core.person.id`.
 *
 * El `LIMIT 2000` va dentro del bloque de apariciones y es de sobra: la persona con más apariciones del
 * canónico tiene menos de 500. El `LIMIT 1` exterior no recorta nada (agrupa a una fila), pero deja la
 * consulta declarada como acotada.
 */
export const HISTORIAL_DE_JUGADOR: Consulta<FilaHistorialJugador> = {
  nombre: 'historial-de-jugador',
  descripcion: 'Todas las apariciones de una persona con su equipo, club, competición, temporada, fecha, goles, tarjetas y minutos fiables, para construir sus tramos reales y los cambios de equipo.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['persona_id', 'nombre_mostrado', 'es_menor', 'identidad_nominal', 'apariciones'],
  sql: `
    with persona as (
      select p.id::int          as persona_id,
             p.nombre_mostrado,
             p.es_menor,
             p.identidad_nominal
        from core.person p
       where p.id = $1
         and exists (
           select 1 from core.appearance a
             join core.team_entry te on te.id = a.team_entry_id
             join core.phase_group g on g.id = te.phase_group_id
             join core.competition_edition e on e.id = g.competition_edition_id
             join core.federation f on f.id = e.federation_id
            where a.person_id = p.id and (${SQL_FEDERACION_NO_EXCLUIDA})
         )
    ),
    -- Goles y tarjetas de la persona en cada partido y equipo. Se agrega una vez para todas sus
    -- apariciones: nunca una subconsulta por partido.
    eventos as (
      select e.match_id,
             e.team_entry_id,
             count(*) filter (where e.event_type = 'gol')::int                           as goles,
             count(*) filter (where e.event_type = 'gol' and e.subtipo = 'penalti')::int  as goles_penalti,
             count(*) filter (where e.event_type = 'gol' and e.subtipo = 'propia_puerta')::int as propias,
             count(*) filter (where e.event_type = 'tarjeta_amarilla')::int             as amarillas,
             count(*) filter (where e.event_type = 'tarjeta_roja')::int                 as rojas
        from core.match_event e
       where e.person_id = $1
       group by e.match_id, e.team_entry_id
    ),
    apariciones as (
      select a.match_id::int                                            as match_id,
             a.team_entry_id::int                                       as team_entry_id,
             a.condition                                                as condicion,
             to_char(coalesce((m.played_at at time zone 'UTC')::date, m.fecha_prevista), 'YYYY-MM-DD') as fecha,
             s.etiqueta                                                 as temporada,
             s.orden                                                    as temporada_orden,
             te.nombre_en_fuente                                        as equipo,
             ts.club_id::int                                            as club_id,
             c.nombre_canonico                                          as club,
             e.nombre_publicado                                         as edicion,
             e.id::int                                                  as edicion_id,
             g.id::int                                                  as grupo_id,
             g.nombre                                                   as grupo,
             f.codigo                                                   as federacion,
             -- El nombre largo de la federación, directo de core.federation: unir
             -- analytics.federacion_ficha aquí lo convertiría en una vista agregada por fila (medido:
             -- 590 ms frente a ~25 ms) y el dato corto no compensa esa consulta por cada aparición.
             f.nombre                                                   as federacion_nombre,
             coalesce(ev.goles, 0)                                      as goles,
             coalesce(ev.goles_penalti, 0)                              as goles_penalti,
             coalesce(ev.propias, 0)                                    as propias,
             coalesce(ev.amarillas, 0)                                  as amarillas,
             coalesce(ev.rojas, 0)                                      as rojas,
             x.minutos_exactos,
             x.minutos_estimados,
             x.minutos_fiables
        from core.appearance a
        join core.match m on m.id = a.match_id
        join core.team_entry te on te.id = a.team_entry_id
        join core.team_season ts on ts.id = te.team_season_id
        join core.club c on c.id = ts.club_id
        join core.phase_group g on g.id = te.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
        join core.season s on s.id = e.season_id
        left join eventos ev on ev.match_id = a.match_id and ev.team_entry_id = a.team_entry_id
        -- Los minutos son del equipo-temporada (la misma fila para todas sus apariciones); vienen del
        -- resumen que ya calcula la fiabilidad. Si no hay resumen, quedan a NULL y la pantalla lo dice.
        left join analytics.player_team_season_summary x
               on x.person_id = a.person_id
              and x.team_entry_id = a.team_entry_id
              and x.season_id = s.id
       where a.person_id = $1
       order by s.orden desc, fecha asc nulls last, a.match_id
       limit 2000
    )
    select persona.persona_id,
           persona.nombre_mostrado,
           persona.es_menor,
           persona.identidad_nominal,
           coalesce(jsonb_agg(jsonb_build_object(
                      'match_id', ap.match_id,
                      'team_entry_id', ap.team_entry_id,
                      'condicion', ap.condicion,
                      'fecha', ap.fecha,
                      'temporada', ap.temporada,
                      'temporada_orden', ap.temporada_orden,
                      'equipo', ap.equipo,
                      'club_id', ap.club_id,
                      'club', ap.club,
                      'edicion', ap.edicion,
                      'edicion_id', ap.edicion_id,
                      'grupo_id', ap.grupo_id,
                      'grupo', ap.grupo,
                      'federacion', ap.federacion,
                      'federacion_nombre', ap.federacion_nombre,
                      'goles', ap.goles,
                      'goles_penalti', ap.goles_penalti,
                      'propias', ap.propias,
                      'amarillas', ap.amarillas,
                      'rojas', ap.rojas,
                      'minutos_exactos', ap.minutos_exactos,
                      'minutos_estimados', ap.minutos_estimados,
                      'minutos_fiables', ap.minutos_fiables)
                    order by ap.temporada_orden desc, ap.fecha asc nulls last, ap.match_id)
                  filter (where ap.match_id is not null), '[]'::jsonb) as apariciones
      from persona
      left join apariciones ap on true
     group by persona.persona_id, persona.nombre_mostrado, persona.es_menor, persona.identidad_nominal
     limit 1`,
};

export const CONSULTAS_HISTORIAL = [HISTORIAL_DE_JUGADOR] as const;

export const PARAMETROS_HISTORIAL: Record<string, readonly unknown[]> = {
  'historial-de-jugador': [1181455],
};
