import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Las tres fichas de oficiales: árbitro, entrenador y delegado de equipo.
 *
 * ── UNA CONSULTA POR PANTALLA, Y NINGUNA POR FILA ───────────────────────────────────────────────────
 *
 * Cada ficha necesita cuatro bloques (la persona, los totales, el desglose por competición o por
 * equipo y la lista de partidos). Pedirlos por separado serían tres o cuatro viajes a la base; aquí van
 * en **una sola fila con bloques JSON**, igual que el acta: cada bloque es una subconsulta agregada
 * contra su índice, así que no hay N+1 ni una consulta por partido.
 *
 * ── QUÉ SE CUENTA Y QUÉ NO ──────────────────────────────────────────────────────────────────────────
 *
 *  · **Árbitros**: `core.match_official` hoy sólo guarda el rol `principal`; los asistentes no se
 *    publican y no se inventan. Las tarjetas y los penaltis salen de `core.match_event` del partido
 *    arbitrado (los penaltis son goles de penalti: un penalti fallado no deja evento que contar).
 *    La media de la competición se calcula sobre **todos los partidos de esa edición con acta**, no
 *    sobre los del árbitro, que es lo que hace que la comparación signifique algo.
 *  · **Entrenadores**: `core.match_staff` con rol de entrenador (primer o segundo, normalizado en SQL
 *    con la misma regla que `lib/oficiales.ts`). El balance se lee desde el punto de vista de SU equipo.
 *  · **Delegados**: sólo el delegado **de equipo**; el de campo es otra figura y tiene su familia.
 *
 * Los partidos sin resultado no suman victorias ni derrotas, y un partido sin acta no se convierte en
 * «cero tarjetas»: se cuenta aparte (`tiene_acta`) y la media sólo divide entre partidos con acta.
 */

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Árbitro
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Un partido arbitrado, con lo que el árbitro enseñó en él. */
export type PartidoDeArbitro = {
  match_id: number;
  fecha: string | null;
  jornada: number | null;
  temporada: string;
  edicion: string;
  edicion_id: number;
  grupo: string;
  grupo_id: number;
  local_id: number | null;
  local: string | null;
  visitante_id: number | null;
  visitante: string | null;
  goles_local: number | null;
  goles_visitante: number | null;
  /** Tarjetas amarillas señaladas en el partido. */
  amarillas: number;
  rojas: number;
  /** Rojas que son doble amarilla (para poder separarlas de la roja directa). */
  dobles_amarillas: number;
  /** Goles de penalti: el único rastro que deja un penalti señalado en el acta. */
  penaltis: number;
  /** Si el partido tiene acta publicada (es lo que permite enlazarla). */
  tiene_acta: boolean;
};

/** El paso de un árbitro por una competición, con su media y la de la competición. */
export type LineaCompeticionArbitro = {
  edicion_id: number;
  edicion: string;
  temporada: string;
  partidos: number;
  con_acta: number;
  amarillas: number;
  rojas: number;
  dobles_amarillas: number;
  penaltis: number;
  /** Datos de TODOS los partidos con acta de la edición, para comparar. */
  partidos_competicion: number;
  amarillas_competicion: number;
  rojas_competicion: number;
  penaltis_competicion: number;
};

/** La ficha completa de un árbitro, en una fila. */
export type FilaArbitro = {
  person_id: number;
  nombre: string;
  partidos: number;
  con_acta: number;
  amarillas: number;
  rojas: number;
  dobles_amarillas: number;
  penaltis: number;
  competiciones: LineaCompeticionArbitro[];
  ultimos: PartidoDeArbitro[];
};

/**
 * La ficha del árbitro. Parámetros: (1) `core.person.id`.
 *
 * Devuelve una fila sólo si esa persona ha arbitrado al menos un partido como principal: un jugador o
 * un id inexistente no tienen ficha de árbitro (la página es un 404, no una ficha vacía).
 */
export const ARBITRO_POR_ID: Consulta<FilaArbitro> = {
  nombre: 'arbitro-por-id',
  descripcion: 'Ficha de un árbitro principal: partidos arbitrados, tarjetas y penaltis por partido, media frente a la de sus competiciones y últimos partidos con su acta.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['person_id', 'nombre', 'partidos', 'con_acta', 'amarillas', 'rojas', 'dobles_amarillas',
    'penaltis', 'competiciones', 'ultimos'],
  sql: `
    with arbitro as (
      select p.id as person_id, p.nombre_mostrado as nombre
        from core.person p
       where p.id = $1
    ),
    partidos as (
      select m.id                                                            as match_id,
             coalesce(to_char(m.played_at, 'YYYY-MM-DD'), to_char(m.fecha_prevista, 'YYYY-MM-DD')) as fecha,
             j.numero                                                        as jornada,
             s.etiqueta                                                      as temporada,
             e.id                                                            as edicion_id,
             e.nombre_publicado                                              as edicion,
             g.id                                                            as grupo_id,
             g.nombre                                                        as grupo,
             m.home_team_entry_id                                            as local_id,
             local.nombre_en_fuente                                          as local,
             m.away_team_entry_id                                            as visitante_id,
             visita.nombre_en_fuente                                         as visitante,
             m.goles_local,
             m.goles_visitante,
             ev.amarillas,
             ev.rojas,
             ev.dobles,
             ev.penaltis,
             exists (select 1 from core.match_report r
                      where r.match_id = m.id and r.quality <> 'unavailable') as tiene_acta
        from core.match_official mo
        join core.match m               on m.id = mo.match_id
        join core.phase_group g         on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.season s              on s.id = e.season_id
        join core.federation f          on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
        left join core.matchday j       on j.id = m.matchday_id
        left join core.team_entry local  on local.id = m.home_team_entry_id
        left join core.team_entry visita on visita.id = m.away_team_entry_id
        cross join lateral (
          select (count(*) filter (where me.event_type = 'tarjeta_amarilla'))::int as amarillas,
                 (count(*) filter (where me.event_type = 'tarjeta_roja'))::int     as rojas,
                 (count(*) filter (where me.event_type = 'tarjeta_roja' and me.subtipo = 'doble_amarilla'))::int as dobles,
                 (count(*) filter (where me.event_type = 'gol' and me.subtipo = 'penalti'))::int as penaltis
            from core.match_event me
           where me.match_id = m.id
        ) ev
       where mo.person_id = (select person_id from arbitro)
         and mo.rol = 'principal'
    ),
    resumen as (
      select count(*)::int                                              as partidos,
             count(*) filter (where tiene_acta)::int                    as con_acta,
             coalesce(sum(amarillas), 0)::int                           as amarillas,
             coalesce(sum(rojas), 0)::int                               as rojas,
             coalesce(sum(dobles), 0)::int                              as dobles_amarillas,
             coalesce(sum(penaltis), 0)::int                            as penaltis
        from partidos
    ),
    por_competicion as (
      select edicion_id, edicion, temporada,
             count(*)::int                            as partidos,
             count(*) filter (where tiene_acta)::int  as con_acta,
             coalesce(sum(amarillas), 0)::int         as amarillas,
             coalesce(sum(rojas), 0)::int             as rojas,
             coalesce(sum(dobles), 0)::int            as dobles_amarillas,
             coalesce(sum(penaltis), 0)::int          as penaltis
        from partidos
       group by edicion_id, edicion, temporada
    ),
    competicion as (
      select g.competition_edition_id              as edicion_id,
             count(*)::int                         as partidos,
             coalesce(sum(ev.amarillas), 0)::int   as amarillas,
             coalesce(sum(ev.rojas), 0)::int       as rojas,
             coalesce(sum(ev.penaltis), 0)::int    as penaltis
        from core.match m
        join core.match_report r on r.match_id = m.id and r.quality <> 'unavailable'
        join core.phase_group g  on g.id = m.phase_group_id
        cross join lateral (
          select (count(*) filter (where me.event_type = 'tarjeta_amarilla'))::int as amarillas,
                 (count(*) filter (where me.event_type = 'tarjeta_roja'))::int     as rojas,
                 (count(*) filter (where me.event_type = 'gol' and me.subtipo = 'penalti'))::int as penaltis
            from core.match_event me
           where me.match_id = m.id
        ) ev
       where g.competition_edition_id in (select edicion_id from por_competicion)
       group by 1
    )
    select a.person_id::int as person_id, a.nombre,
           r.partidos, r.con_acta, r.amarillas, r.rojas, r.dobles_amarillas, r.penaltis,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'edicion_id', pc.edicion_id, 'edicion', pc.edicion, 'temporada', pc.temporada,
                      'partidos', pc.partidos, 'con_acta', pc.con_acta,
                      'amarillas', pc.amarillas, 'rojas', pc.rojas,
                      'dobles_amarillas', pc.dobles_amarillas, 'penaltis', pc.penaltis,
                      'partidos_competicion', c.partidos, 'amarillas_competicion', c.amarillas,
                      'rojas_competicion', c.rojas, 'penaltis_competicion', c.penaltis
                    ) order by pc.temporada desc, pc.edicion)
               from por_competicion pc
               left join competicion c on c.edicion_id = pc.edicion_id), '[]'::jsonb) as competiciones,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'match_id', p.match_id, 'fecha', p.fecha, 'jornada', p.jornada,
                      'temporada', p.temporada, 'edicion', p.edicion, 'edicion_id', p.edicion_id,
                      'grupo', p.grupo, 'grupo_id', p.grupo_id,
                      'local_id', p.local_id, 'local', p.local,
                      'visitante_id', p.visitante_id, 'visitante', p.visitante,
                      'goles_local', p.goles_local, 'goles_visitante', p.goles_visitante,
                      'amarillas', p.amarillas, 'rojas', p.rojas,
                      'dobles_amarillas', p.dobles, 'penaltis', p.penaltis,
                      'tiene_acta', p.tiene_acta
                    ) order by p.fecha desc nulls last, p.match_id desc)
               from (select * from partidos order by fecha desc nulls last, match_id desc limit 20) p), '[]'::jsonb) as ultimos
      from arbitro a
      cross join resumen r
     where exists (select 1 from partidos)`,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Entrenador
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Un partido dirigido, desde el punto de vista de su equipo. */
export type PartidoDeEntrenador = {
  match_id: number;
  fecha: string | null;
  jornada: number | null;
  temporada: string;
  edicion: string;
  edicion_id: number;
  grupo: string;
  grupo_id: number;
  equipo_id: number;
  equipo: string;
  club_id: number;
  club: string;
  rival_id: number | null;
  rival: string | null;
  condicion: string;
  goles_propios: number | null;
  goles_rival: number | null;
  /** `ganado`, `empatado`, `perdido` o `sin_resultado`. */
  resultado: string;
  /** El literal del acta («Entrenador», «2ºEntrenador»…): se enseña en palabras al lado. */
  rol: string;
  tiene_acta: boolean;
};

/** Un tramo de un entrenador en un equipo: una temporada, una competición y un rol. */
export type AsignacionDeEntrenador = {
  temporada: string;
  temporada_orden: number;
  edicion_id: number;
  edicion: string;
  grupo_id: number;
  grupo: string;
  equipo_id: number;
  equipo: string;
  club_id: number;
  club: string;
  rol: string;
  partidos: number;
  victorias: number;
  empates: number;
  derrotas: number;
  primera_fecha: string | null;
  ultima_fecha: string | null;
};

/** La ficha completa de un entrenador, en una fila. */
export type FilaEntrenador = {
  person_id: number;
  nombre: string;
  partidos: number;
  victorias: number;
  empates: number;
  derrotas: number;
  equipos: number;
  clubes: number;
  temporadas: number;
  asignaciones: AsignacionDeEntrenador[];
  ultimos: PartidoDeEntrenador[];
};

/**
 * La ficha del entrenador (primer o segundo). Parámetros: (1) `core.person.id`.
 *
 * El rol se filtra con la misma regla que `lib/oficiales.ts`: `entrenador|entrenatzaile|coach|manager`
 * y fuera el entrenador de porteros, que no dirige al equipo. Un `distinct on (match_id)` evita contar
 * dos veces un partido en el que el acta le apunta dos roles.
 */
export const ENTRENADOR_POR_ID: Consulta<FilaEntrenador> = {
  nombre: 'entrenador-por-id',
  descripcion: 'Ficha de un entrenador: equipos y clubes por temporada, partidos dirigidos, victorias, empates y derrotas desde el punto de vista de su equipo, y últimos partidos con su acta.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['person_id', 'nombre', 'partidos', 'victorias', 'empates', 'derrotas', 'equipos', 'clubes',
    'temporadas', 'asignaciones', 'ultimos'],
  sql: `
    with persona as (
      select p.id as person_id, p.nombre_mostrado as nombre
        from core.person p
       where p.id = $1
    ),
    partidos as (
      select distinct on (m.id)
             m.id                                                            as match_id,
             coalesce(to_char(m.played_at, 'YYYY-MM-DD'), to_char(m.fecha_prevista, 'YYYY-MM-DD')) as fecha,
             j.numero                                                        as jornada,
             s.etiqueta                                                      as temporada,
             s.orden                                                         as temporada_orden,
             e.id                                                            as edicion_id,
             e.nombre_publicado                                              as edicion,
             g.id                                                            as grupo_id,
             g.nombre                                                        as grupo,
             te.id                                                           as equipo_id,
             te.nombre_en_fuente                                             as equipo,
             cl.id                                                           as club_id,
             cl.nombre_canonico                                              as club,
             rival.id                                                        as rival_id,
             rival.nombre_en_fuente                                          as rival,
             case when m.home_team_entry_id = te.id then 'casa' else 'fuera' end as condicion,
             case when m.home_team_entry_id = te.id then m.goles_local else m.goles_visitante end as goles_propios,
             case when m.home_team_entry_id = te.id then m.goles_visitante else m.goles_local end   as goles_rival,
             case when m.goles_local is null or m.goles_visitante is null then 'sin_resultado'
                  when (m.home_team_entry_id = te.id and m.goles_local > m.goles_visitante)
                    or (m.away_team_entry_id = te.id and m.goles_visitante > m.goles_local) then 'ganado'
                  when m.goles_local = m.goles_visitante then 'empatado'
                  else 'perdido' end                                          as resultado,
             ms.rol,
             exists (select 1 from core.match_report r
                      where r.match_id = m.id and r.quality <> 'unavailable') as tiene_acta
        from core.match_staff ms
        join core.match m               on m.id = ms.match_id
        join core.team_entry te         on te.id = ms.team_entry_id
        join core.team_season ts        on ts.id = te.team_season_id
        join core.club cl               on cl.id = ts.club_id
        join core.team_entry rival      on rival.id = case when m.home_team_entry_id = te.id
                                                           then m.away_team_entry_id else m.home_team_entry_id end
        join core.phase_group g         on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.season s              on s.id = e.season_id
        join core.federation f          on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
        left join core.matchday j       on j.id = m.matchday_id
       where ms.person_id = (select person_id from persona)
         and ms.team_entry_id is not null
         and core.normaliza_nombre(ms.rol) ~ 'entrenador|entrenatzaile|coach|manager'
         and core.normaliza_nombre(ms.rol) !~ 'porter|atezain'
       order by m.id,
                case when core.normaliza_nombre(ms.rol) ~ 'auxiliar|ayudante|assistant|^2o?\\s*entrenador|segundo entrenador'
                     then 1 else 0 end,
                ms.rol
    ),
    resumen as (
      select count(*)::int                                                   as partidos,
             count(*) filter (where resultado = 'ganado')::int               as victorias,
             count(*) filter (where resultado = 'empatado')::int             as empates,
             count(*) filter (where resultado = 'perdido')::int              as derrotas,
             count(distinct equipo_id)::int                                  as equipos,
             count(distinct club_id)::int                                    as clubes,
             count(distinct temporada)::int                                  as temporadas
        from partidos
    ),
    asignaciones as (
      select temporada, temporada_orden, edicion_id, edicion, grupo_id, grupo,
             equipo_id, equipo, club_id, club, rol,
             count(*)::int                                                as partidos,
             count(*) filter (where resultado = 'ganado')::int            as victorias,
             count(*) filter (where resultado = 'empatado')::int          as empates,
             count(*) filter (where resultado = 'perdido')::int           as derrotas,
             min(fecha)                                                   as primera_fecha,
             max(fecha)                                                   as ultima_fecha
        from partidos
       group by temporada, temporada_orden, edicion_id, edicion, grupo_id, grupo,
                equipo_id, equipo, club_id, club, rol
    )
    select pe.person_id::int as person_id, pe.nombre,
           r.partidos, r.victorias, r.empates, r.derrotas, r.equipos, r.clubes, r.temporadas,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'temporada', a.temporada, 'temporada_orden', a.temporada_orden,
                      'edicion_id', a.edicion_id, 'edicion', a.edicion,
                      'grupo_id', a.grupo_id, 'grupo', a.grupo,
                      'equipo_id', a.equipo_id, 'equipo', a.equipo,
                      'club_id', a.club_id, 'club', a.club,
                      'rol', a.rol, 'partidos', a.partidos,
                      'victorias', a.victorias, 'empates', a.empates, 'derrotas', a.derrotas,
                      'primera_fecha', a.primera_fecha, 'ultima_fecha', a.ultima_fecha
                    ) order by a.temporada desc, a.edicion, a.equipo)
               from asignaciones a), '[]'::jsonb) as asignaciones,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'match_id', p.match_id, 'fecha', p.fecha, 'jornada', p.jornada,
                      'temporada', p.temporada, 'edicion', p.edicion, 'edicion_id', p.edicion_id,
                      'grupo', p.grupo, 'grupo_id', p.grupo_id,
                      'equipo_id', p.equipo_id, 'equipo', p.equipo,
                      'club_id', p.club_id, 'club', p.club,
                      'rival_id', p.rival_id, 'rival', p.rival, 'condicion', p.condicion,
                      'goles_propios', p.goles_propios, 'goles_rival', p.goles_rival,
                      'resultado', p.resultado, 'rol', p.rol, 'tiene_acta', p.tiene_acta
                    ) order by p.fecha desc nulls last, p.match_id desc)
               from (select * from partidos order by fecha desc nulls last, match_id desc limit 20) p), '[]'::jsonb) as ultimos
      from persona pe
      cross join resumen r
     where exists (select 1 from partidos)`,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Delegado de equipo
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Un partido en el que la persona fue delegada de equipo. */
export type PartidoDeDelegado = {
  match_id: number;
  fecha: string | null;
  jornada: number | null;
  temporada: string;
  edicion: string;
  edicion_id: number;
  grupo: string;
  grupo_id: number;
  equipo_id: number;
  equipo: string;
  club_id: number;
  club: string;
  rival_id: number | null;
  rival: string | null;
  condicion: string;
  goles_propios: number | null;
  goles_rival: number | null;
  rol: string;
  tiene_acta: boolean;
};

/** Un tramo de un delegado en un equipo. */
export type AsignacionDeDelegado = {
  temporada: string;
  temporada_orden: number;
  edicion_id: number;
  edicion: string;
  grupo_id: number;
  grupo: string;
  equipo_id: number;
  equipo: string;
  club_id: number;
  club: string;
  rol: string;
  partidos: number;
  primera_fecha: string | null;
  ultima_fecha: string | null;
};

/** La ficha completa de un delegado de equipo, en una fila. */
export type FilaDelegado = {
  person_id: number;
  nombre: string;
  partidos: number;
  equipos: number;
  clubes: number;
  temporadas: number;
  asignaciones: AsignacionDeDelegado[];
  ultimos: PartidoDeDelegado[];
};

/**
 * La ficha del delegado **de equipo**. Parámetros: (1) `core.person.id`.
 *
 * El filtro de rol es el mismo que `esRolDeDelegadoDeEquipo` de `lib/oficiales.ts`: incluye
 * `DEL. Equipo`, `delegado`, `DELEGAT EQUIP` y `Taldeko Delegatua`, y deja fuera `DEL. Campo`,
 * `delegat camp` y `Zelaiko Delegatua` (el delegado del recinto no es el del equipo).
 */
export const DELEGADO_POR_ID: Consulta<FilaDelegado> = {
  nombre: 'delegado-por-id',
  descripcion: 'Ficha de un delegado de equipo: equipos y clubes por temporada, partidos como delegado y últimos partidos con su acta.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['person_id', 'nombre', 'partidos', 'equipos', 'clubes', 'temporadas', 'asignaciones', 'ultimos'],
  sql: `
    with persona as (
      select p.id as person_id, p.nombre_mostrado as nombre
        from core.person p
       where p.id = $1
    ),
    partidos as (
      select distinct on (m.id)
             m.id                                                            as match_id,
             coalesce(to_char(m.played_at, 'YYYY-MM-DD'), to_char(m.fecha_prevista, 'YYYY-MM-DD')) as fecha,
             j.numero                                                        as jornada,
             s.etiqueta                                                      as temporada,
             s.orden                                                         as temporada_orden,
             e.id                                                            as edicion_id,
             e.nombre_publicado                                              as edicion,
             g.id                                                            as grupo_id,
             g.nombre                                                        as grupo,
             te.id                                                           as equipo_id,
             te.nombre_en_fuente                                             as equipo,
             cl.id                                                           as club_id,
             cl.nombre_canonico                                              as club,
             rival.id                                                        as rival_id,
             rival.nombre_en_fuente                                          as rival,
             case when m.home_team_entry_id = te.id then 'casa' else 'fuera' end as condicion,
             case when m.home_team_entry_id = te.id then m.goles_local else m.goles_visitante end as goles_propios,
             case when m.home_team_entry_id = te.id then m.goles_visitante else m.goles_local end   as goles_rival,
             ms.rol,
             exists (select 1 from core.match_report r
                      where r.match_id = m.id and r.quality <> 'unavailable') as tiene_acta
        from core.match_staff ms
        join core.match m               on m.id = ms.match_id
        join core.team_entry te         on te.id = ms.team_entry_id
        join core.team_season ts        on ts.id = te.team_season_id
        join core.club cl               on cl.id = ts.club_id
        join core.team_entry rival      on rival.id = case when m.home_team_entry_id = te.id
                                                           then m.away_team_entry_id else m.home_team_entry_id end
        join core.phase_group g         on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.season s              on s.id = e.season_id
        join core.federation f          on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
        left join core.matchday j       on j.id = m.matchday_id
       where ms.person_id = (select person_id from persona)
         and ms.team_entry_id is not null
         and (core.normaliza_nombre(ms.rol) in ('del equipo', 'delegat equip', 'taldeko delegatua')
              or (core.normaliza_nombre(ms.rol) ~ 'deleg'
                  and core.normaliza_nombre(ms.rol) !~ 'campo|zelaiko|proteccion|covid'))
       order by m.id, ms.rol
    ),
    resumen as (
      select count(*)::int                            as partidos,
             count(distinct equipo_id)::int           as equipos,
             count(distinct club_id)::int             as clubes,
             count(distinct temporada)::int           as temporadas
        from partidos
    ),
    asignaciones as (
      select temporada, temporada_orden, edicion_id, edicion, grupo_id, grupo,
             equipo_id, equipo, club_id, club, rol,
             count(*)::int as partidos, min(fecha) as primera_fecha, max(fecha) as ultima_fecha
        from partidos
       group by temporada, temporada_orden, edicion_id, edicion, grupo_id, grupo,
                equipo_id, equipo, club_id, club, rol
    )
    select pe.person_id::int as person_id, pe.nombre,
           r.partidos, r.equipos, r.clubes, r.temporadas,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'temporada', a.temporada, 'temporada_orden', a.temporada_orden,
                      'edicion_id', a.edicion_id, 'edicion', a.edicion,
                      'grupo_id', a.grupo_id, 'grupo', a.grupo,
                      'equipo_id', a.equipo_id, 'equipo', a.equipo,
                      'club_id', a.club_id, 'club', a.club,
                      'rol', a.rol, 'partidos', a.partidos,
                      'primera_fecha', a.primera_fecha, 'ultima_fecha', a.ultima_fecha
                    ) order by a.temporada desc, a.edicion, a.equipo)
               from asignaciones a), '[]'::jsonb) as asignaciones,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'match_id', p.match_id, 'fecha', p.fecha, 'jornada', p.jornada,
                      'temporada', p.temporada, 'edicion', p.edicion, 'edicion_id', p.edicion_id,
                      'grupo', p.grupo, 'grupo_id', p.grupo_id,
                      'equipo_id', p.equipo_id, 'equipo', p.equipo,
                      'club_id', p.club_id, 'club', p.club,
                      'rival_id', p.rival_id, 'rival', p.rival, 'condicion', p.condicion,
                      'goles_propios', p.goles_propios, 'goles_rival', p.goles_rival,
                      'rol', p.rol, 'tiene_acta', p.tiene_acta
                    ) order by p.fecha desc nulls last, p.match_id desc)
               from (select * from partidos order by fecha desc nulls last, match_id desc limit 20) p), '[]'::jsonb) as ultimos
      from persona pe
      cross join resumen r
     where exists (select 1 from partidos)`,
};

/** Todas las consultas de oficiales, para la prueba de contrato. */
export const CONSULTAS_OFICIALES = [ARBITRO_POR_ID, ENTRENADOR_POR_ID, DELEGADO_POR_ID] as const;

/** Parámetros por defecto: personas reales del canónico (grupo 797, CyL, temporada 2025-26). */
export const PARAMETROS_OFICIALES: Record<string, readonly unknown[]> = {
  // Árbitro principal con 10 partidos en el grupo 797, todos con acta.
  'arbitro-por-id': [18951],
  // Entrenador del C.D.I. de la Amistad Deltacinco (30 partidos, temporada 2025-26).
  'entrenador-por-id': [19080],
  // Delegado de equipo del C.D. La Virgen del Camino (30 partidos, temporada 2025-26).
  'delegado-por-id': [19236],
};
