import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Partidos y actas del canónico.
 *
 * Aquí no se reconstruye nada: se enseña lo que hay. Un marcador que la fuente no publicó es `NULL`
 * y se pinta como un guion; jamás como 0-0. Un goleador sin código federativo es una identidad
 * nominal y la página lo dice, para no presentarlo como perfil confirmado.
 */

export type FilaPartidoCanonico = {
  match_id: number;
  jornada: number;
  orden: number;
  fecha: string | null;
  /**
   * Hora de comienzo publicada (`HH24:MI`), o `null` si la federación no la confirmó. En el canónico
   * no hay columna de hora: `core.match.hora_confirmada` es un booleano y `fecha_prevista` es una
   * fecha. La hora vive en `played_at`, que el importador rellena con fecha+hora sólo cuando la fuente
   * publica la hora (ver `packages/canonico/src/lote.ts`). Sin ese dato no se inventa un 00:00.
   */
  hora: string | null;
  /**
   * Fecha PUBLICADA en el calendario (`core.match.fecha_prevista`), aunque el partido no se haya jugado
   * todavía. `fecha` sale de `played_at` y por eso llega `null` en un grupo con calendario y sin
   * resultados (75250, 75252); la jornada necesita esta fecha para orientar la pantalla. Mismo formato
   * `YYYY-MM-DD` y mismo criterio: si la fuente no la publicó, es `null`, no una fecha inventada.
   */
  fecha_prevista?: string | null;
  /** Ids de inscripción de los dos equipos: hacen falta para calcular la forma desde los partidos. */
  local_id: number;
  visitante_id: number;
  local: string;
  visitante: string;
  /**
   * Código federativo del equipo en la fuente. Es lo que enlaza con la ficha del equipo y con su acta;
   * el id de inscripción no sirve fuera de esta base.
   *
   * Los campos de club y código son opcionales EN EL TIPO, no en la consulta: `columnas` los exige y
   * la prueba de contrato los comprueba contra el canónico. Van opcionales para que una fila
   * construida a mano (pruebas de render) no tenga que inventarse un club.
   */
  local_codigo?: string | null;
  visitante_codigo?: string | null;
  /**
   * El club canónico de cada equipo-temporada y si tiene escudo vigente. Van en la MISMA fila para que
   * la jornada y el acta pinten los dos escudos con una sola consulta, sin pedir club por partido.
   */
  local_club_id?: number | null;
  visitante_club_id?: number | null;
  local_tiene_escudo?: boolean | null;
  visitante_tiene_escudo?: boolean | null;
  /**
   * Nombre corto de cada inscripción (`analytics.nombre_corto_equipo`, 0060): el que cabe en la jornada
   * y en el acta cuando el nombre publicado es largo. `null` si aún no se ha derivado; la pantalla cae
   * al completo, nunca a una cadena vacía.
   */
  local_nombre_corto?: string | null;
  visitante_nombre_corto?: string | null;
  goles_local: number | null;
  goles_visitante: number | null;
  campo: string | null;
  arbitro: string | null;
  calidad_acta: string | null;
  estado: string | null;
};

export const PARTIDOS_DE_GRUPO: Consulta<FilaPartidoCanonico> = {
  nombre: 'partidos-de-grupo',
  descripcion: 'Partidos de un grupo importado, con marcador —o su ausencia—, hora publicada, campo, árbitro y calidad del acta.',
  plan: 'indexado',
  presupuestoMs: 800,
  columnas: ['match_id', 'jornada', 'orden', 'fecha', 'fecha_prevista', 'hora', 'local_id', 'visitante_id', 'local', 'visitante',
    'local_codigo', 'visitante_codigo', 'local_club_id', 'visitante_club_id', 'local_tiene_escudo',
    'visitante_tiene_escudo', 'local_nombre_corto', 'visitante_nombre_corto', 'goles_local', 'goles_visitante',
    'campo', 'arbitro', 'calidad_acta', 'estado'],
  sql: `
    select m.id                      as match_id,
           d.numero                  as jornada,
           m.source_order            as orden,
           to_char(m.played_at, 'YYYY-MM-DD') as fecha,
           -- La fecha publicada en el calendario, para las jornadas de grupos que aún no han jugado:
           -- «fecha» es la del partido jugado y ahí es null. Una fecha por columna, como el resto: no
           -- se rellena «fecha» con la prevista (mezclaría «jugado» con «programado»).
           to_char(m.fecha_prevista, 'YYYY-MM-DD') as fecha_prevista,
           case
             when m.hora_confirmada and m.played_at is not null
               -- La hora se publica en hora local española y el importador la guarda tal cual sobre
               -- played_at (que es timestamptz). Se fija UTC para no depender del huso de la sesión:
               -- leerla en Europe/Madrid sumaría dos horas a la hora que publicó la federación.
               then to_char(m.played_at at time zone 'UTC', 'HH24:MI')
           end                       as hora,
           el.id                     as local_id,
           ev.id                     as visitante_id,
           el.nombre_en_fuente       as local,
           ev.nombre_en_fuente       as visitante,
           el.codigo_externo         as local_codigo,
           ev.codigo_externo         as visitante_codigo,
           -- El club de cada equipo-temporada y su escudo, en la misma fila del partido: la jornada y
           -- el acta pintan los dos escudos con esta consulta y no piden nada más. El EXISTS va contra
           -- el índice del registro vigente, no recorre la tabla.
           tsl.club_id               as local_club_id,
           tsv.club_id               as visitante_club_id,
           exists (select 1 from core.club_asset cal
                    where cal.club_id = tsl.club_id and cal.tipo = 'escudo' and cal.vigente) as local_tiene_escudo,
           exists (select 1 from core.club_asset cav
                    where cav.club_id = tsv.club_id and cav.tipo = 'escudo' and cav.vigente) as visitante_tiene_escudo,
           -- Nombre corto guardado (0060) de cada inscripción, en la misma fila: la jornada y el acta lo
           -- pintan sin aplicar reglas ni pedir otra consulta.
           ncl.nombre_corto          as local_nombre_corto,
           ncv.nombre_corto          as visitante_nombre_corto,
           m.goles_local,
           m.goles_visitante,
           v.nombre                  as campo,
           po.nombre_mostrado        as arbitro,
           r.quality                 as calidad_acta,
           m.official_status         as estado
      from core.match m
      join core.phase_group g on g.id = m.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.matchday d on d.id = m.matchday_id
      join core.team_entry el on el.id = m.home_team_entry_id
      join core.team_entry ev on ev.id = m.away_team_entry_id
      join core.team_season tsl on tsl.id = el.team_season_id
      join core.team_season tsv on tsv.id = ev.team_season_id
      left join analytics.nombre_corto_equipo ncl on ncl.team_entry_id = el.id
      left join analytics.nombre_corto_equipo ncv on ncv.team_entry_id = ev.id
      left join core.venue v on v.id = m.venue_id
      left join core.match_report r on r.match_id = m.id
      left join core.match_official o on o.match_id = m.id and o.rol = 'principal'
      left join core.person po on po.id = o.person_id
     where f.codigo = $1 and g.codigo_externo = $2
     order by d.numero, m.source_order
     limit $3`,
};

export type FilaGoleador = {
  match_id: number;
  minuto: number | null;
  subtipo: string | null;
  autor: string;
  identidad_nominal: boolean;
  equipo: string;
};

/**
 * Goles de los partidos pedidos. `subtipo` distingue penalti y propia puerta: sumarlos como si fueran
 * iguales da una tabla de goleadores que no cuadra con el marcador.
 */
export const GOLES_DE_PARTIDOS: Consulta<FilaGoleador> = {
  nombre: 'goles-de-partidos',
  descripcion: 'Goles con su autoría y minuto para un grupo, marcando quién sólo se conoce por su nombre.',
  plan: 'indexado',
  presupuestoMs: 800,
  columnas: ['match_id', 'minuto', 'subtipo', 'autor', 'identidad_nominal', 'equipo'],
  sql: `
    select e.match_id,
           coalesce(e.minute_base, e.minute_added) as minuto,
           e.subtipo,
           p.nombre_mostrado                       as autor,
           p.identidad_nominal,
           te.nombre_en_fuente                     as equipo
      from core.match_event e
      join core.match m on m.id = e.match_id
      join core.phase_group g on g.id = m.phase_group_id
      join core.competition_edition ed on ed.id = g.competition_edition_id
      join core.federation f on f.id = ed.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.person p on p.id = e.person_id
      join core.team_entry te on te.id = e.team_entry_id
     where f.codigo = $1 and g.codigo_externo = $2 and e.event_type = 'gol'
     order by e.match_id, coalesce(e.minute_base, e.minute_added), e.source_order
     limit $3`,
};

/** Un grupo concreto del canónico: lo que la página de detalle necesita para su cabecera. */
export type FilaGrupoDetalle = {
  federacion: string;
  federacion_nombre: string;
  temporada: string;
  edicion: string;
  grupo: string;
  grupo_codigo: string;
  jornadas_previstas: number | null;
  partidos_conocidos: number | null;
  partidos_con_resultado: number | null;
  actas_disponibles: number | null;
  actas_parseadas: number | null;
  complete_through_matchday: number | null;
  visibility_state: string | null;
  calculado_en: string | null;
};

export const GRUPO_DEL_CANONICO: Consulta<FilaGrupoDetalle> = {
  nombre: 'grupo-del-canónico',
  descripcion: 'Cabecera de un grupo importado: de qué federación y edición es y hasta dónde llega su cobertura.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['federacion', 'federacion_nombre', 'temporada', 'edicion', 'grupo', 'grupo_codigo', 'jornadas_previstas',
    'partidos_conocidos', 'partidos_con_resultado', 'actas_disponibles', 'actas_parseadas',
    'complete_through_matchday', 'visibility_state', 'calculado_en'],
  sql: `
    select f.codigo           as federacion,
           f.nombre           as federacion_nombre,
           s.etiqueta         as temporada,
           e.nombre_publicado as edicion,
           g.nombre           as grupo,
           g.codigo_externo   as grupo_codigo,
           g.jornadas_previstas,
           c.partidos_conocidos,
           c.partidos_con_resultado,
           c.actas_disponibles,
           c.actas_parseadas,
           c.complete_through_matchday,
           c.visibility_state,
           c.calculado_en
      from core.phase_group g
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     where f.codigo = $1 and g.codigo_externo = $2
     limit 1`,
};

/** Clasificación guardada del grupo, con su origen a la vista: `oficial` o `reconstruida`. */
export type FilaClasificacion = {
  posicion: number;
  equipo: string;
  puntos: number;
  jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  goles_favor: number;
  goles_contra: number;
  origen: string;
  jornada: number;
};

export const CLASIFICACION_DEL_GRUPO: Consulta<FilaClasificacion> = {
  nombre: 'clasificación-del-grupo',
  descripcion: 'Tabla del grupo con su posición, puntos, partidos y goles, y de dónde sale cada fila (oficial o reconstruida).',
  plan: 'indexado',
  presupuestoMs: 500,
  columnas: ['posicion', 'equipo', 'puntos', 'jugados', 'ganados', 'empatados', 'perdidos', 'goles_favor', 'goles_contra', 'origen', 'jornada'],
  sql: `
    select s.posicion,
           te.nombre_en_fuente as equipo,
           s.puntos,
           s.jugados,
           s.ganados,
           s.empatados,
           s.perdidos,
           s.goles_favor,
           s.goles_contra,
           s.origen,
           d.numero            as jornada
      from core.standing_snapshot s
      join core.phase_group g on g.id = s.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.team_entry te on te.id = s.team_entry_id
      join core.matchday d on d.id = s.matchday_id
     where f.codigo = $1 and g.codigo_externo = $2
     order by case when s.origen = 'oficial' then 0 else 1 end, s.posicion
     limit 40`,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────────
 * ACTA DEL PARTIDO
 * ──────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Un evento del acta, tal y como viaja en el JSON de `acta-del-partido`. */
export type EventoDeActa = {
  evento_id: number;
  /** `gol`, `tarjeta_amarilla`, `tarjeta_roja`, `entra`, `sale` u `otro`. */
  tipo: string;
  /** En goles: `normal`, `penalti` o `propia_puerta`. En rojas, `doble_amarilla`. */
  subtipo: string | null;
  minuto: number | null;
  /** Minutos de descuento publicados (90+3 → `minuto` 90, `minuto_extra` 3). */
  minuto_extra: number | null;
  lado: 'local' | 'visitante' | null;
  /**
   * En un gol en propia puerta, `lado` es el equipo del jugador que la mete y `lado_beneficiado` el que
   * suma el gol. El marcador del acta se lee siempre por `lado_beneficiado`.
   */
  lado_beneficiado: 'local' | 'visitante' | null;
  /** `jugador`, `tecnico`, `arbitro` o `desconocido`: no todo lo que se apunta en un acta es un jugador. */
  sujeto_tipo: string;
  persona_id: number | null;
  /** Nombre publicado de la persona; `null` si la fuente no lo publicó (no se inventa). */
  persona: string | null;
  equipo_id: number | null;
};

/** Una persona convocada en el acta, con su condición y su dorsal. */
export type JugadorDeActa = {
  persona_id: number;
  lado: 'local' | 'visitante';
  /** `starter`, `substitute` o `called_up_unknown` (convocado sin condición publicada). */
  condicion: string;
  dorsal: number | null;
  portero: boolean;
  orden: number;
  persona: string;
  posicion: string | null;
  capitan: boolean | null;
};

/** Un árbitro del partido. `rol` es el del esquema (`principal`, `asistente1`…). */
export type OficialDeActa = {
  rol: string;
  persona: string;
};

/** Un miembro del cuerpo técnico, con el lado al que pertenece. */
export type TecnicoDeActa = {
  lado: 'local' | 'visitante' | null;
  rol: string;
  persona: string;
};

/** Un enfrentamiento anterior entre los dos clubes, en la misma categoría. */
export type EnfrentamientoPrevio = {
  match_id: number;
  fecha: string | null;
  temporada: string;
  jornada: number;
  local: string;
  visitante: string;
  goles_local: number | null;
  goles_visitante: number | null;
};

/**
 * Lo que la pantalla del acta necesita de un partido: contexto, marcador, calidad del acta y todo el
 * contenido del acta en cinco bloques JSON. Una fila por partido.
 */
export type FilaActaCanonica = {
  match_id: number;
  jornada: number;
  federacion: string;
  federacion_nombre: string;
  temporada: string;
  edicion: string;
  edicion_id: number;
  categoria: string;
  division: string;
  modalidad: string;
  ambito: string;
  grupo_id: number;
  grupo: string;
  grupo_codigo: string;
  fecha: string | null;
  fecha_prevista: string | null;
  hora: string | null;
  campo: string | null;
  municipio: string | null;
  local: string;
  visitante: string;
  /** Nombres cortos guardados (0060) de los dos equipos; `null` si aún no se han derivado. */
  local_nombre_corto?: string | null;
  visitante_nombre_corto?: string | null;
  local_id: number;
  visitante_id: number;
  local_club_id: number | null;
  visitante_club_id: number | null;
  local_tiene_escudo: boolean;
  visitante_tiene_escudo: boolean;
  goles_local: number | null;
  goles_visitante: number | null;
  penaltis_local: number | null;
  penaltis_visitante: number | null;
  estado: string;
  calidad_acta: string;
  eventos: EventoDeActa[];
  alineaciones: JugadorDeActa[];
  oficiales: OficialDeActa[];
  cuerpo_tecnico: TecnicoDeActa[];
  enfrentamientos: EnfrentamientoPrevio[];
};

/**
 * El acta completa de un partido, en UNA consulta. Parámetros: (1) `core.match.id`.
 *
 * Por qué el acta va entera en una fila con JSON: la pantalla necesita cinco listas (eventos,
 * alineaciones, árbitros, cuerpo técnico y enfrentamientos anteriores) y pedirlas por separado sería
 * un viaje por lista. Aquí cada bloque es una subconsulta correlacionada contra su índice por
 * `match_id`, así que sigue siendo un recorrido indexado y una sola ida a la base, sin N+1.
 *
 * El filtro de calidad deja fuera las actas `unavailable`: la federación comprobó que no las ofrece y
 * la página no puede inventarlas. Sin fila, la pantalla es un 404.
 */
export const ACTA_DEL_PARTIDO: Consulta<FilaActaCanonica> = {
  nombre: 'acta-del-partido',
  descripcion: 'Acta completa de un partido: contexto, marcador, eventos con minuto y persona, alineaciones, árbitros, cuerpo técnico y enfrentamientos anteriores.',
  plan: 'indexado',
  presupuestoMs: 500,
  columnas: ['match_id', 'jornada', 'federacion', 'federacion_nombre', 'temporada', 'edicion', 'edicion_id',
    'categoria', 'division', 'modalidad', 'ambito', 'grupo_id', 'grupo', 'grupo_codigo', 'fecha',
    'fecha_prevista', 'hora', 'campo', 'municipio', 'local', 'visitante', 'local_nombre_corto',
    'visitante_nombre_corto', 'local_id', 'visitante_id',
    'local_club_id', 'visitante_club_id', 'local_tiene_escudo', 'visitante_tiene_escudo', 'goles_local',
    'goles_visitante', 'penaltis_local', 'penaltis_visitante', 'estado', 'calidad_acta', 'eventos',
    'alineaciones', 'oficiales', 'cuerpo_tecnico', 'enfrentamientos'],
  sql: `
    select m.id::int                           as match_id,
           d.numero                            as jornada,
           f.codigo                            as federacion,
           coalesce(ff.nombre_corto, f.nombre)  as federacion_nombre,
           s.etiqueta                          as temporada,
           e.nombre_publicado                  as edicion,
           e.id::int                           as edicion_id,
           e.categoria,
           e.division,
           e.modalidad,
           e.ambito,
           g.id::int                           as grupo_id,
           g.nombre                            as grupo,
           g.codigo_externo                    as grupo_codigo,
           to_char(m.played_at, 'YYYY-MM-DD')  as fecha,
           to_char(m.fecha_prevista, 'YYYY-MM-DD') as fecha_prevista,
           -- La hora se publica en hora local española y el importador la guarda tal cual sobre played_at
           -- (timestamptz). Se lee en UTC para no sumar dos horas a la hora de la federación.
           case when m.hora_confirmada and m.played_at is not null
                then to_char(m.played_at at time zone 'UTC', 'HH24:MI') end as hora,
           v.nombre                            as campo,
           v.municipio                         as municipio,
           el.nombre_en_fuente                 as local,
           ev.nombre_en_fuente                 as visitante,
           ncl.nombre_corto                    as local_nombre_corto,
           ncv.nombre_corto                    as visitante_nombre_corto,
           el.id::int                          as local_id,
           ev.id::int                          as visitante_id,
           tsl.club_id::int                    as local_club_id,
           tsv.club_id::int                    as visitante_club_id,
           exists (select 1 from core.club_asset cal
                    where cal.club_id = tsl.club_id and cal.tipo = 'escudo' and cal.vigente) as local_tiene_escudo,
           exists (select 1 from core.club_asset cav
                    where cav.club_id = tsv.club_id and cav.tipo = 'escudo' and cav.vigente) as visitante_tiene_escudo,
           m.goles_local,
           m.goles_visitante,
           m.penaltis_local,
           m.penaltis_visitante,
           m.official_status                   as estado,
           r.quality                           as calidad_acta,
           -- Eventos en el orden en que los publicó la federación: es el orden del acta, no una
           -- reconstrucción por minuto. La página decide qué se agrupa (un cambio son dos eventos).
           coalesce((select jsonb_agg(jsonb_build_object(
                        'evento_id', x.id, 'tipo', x.event_type, 'subtipo', x.subtipo,
                        'minuto', x.minute_base, 'minuto_extra', x.minute_added,
                        'lado', x.lado, 'lado_beneficiado', x.lado_beneficiado,
                        'sujeto_tipo', x.sujeto_tipo,
                        'persona_id', x.person_id, 'persona', p.nombre_mostrado,
                        'equipo_id', x.team_entry_id)
                      order by x.source_order)
                     from core.match_event x
                     left join core.person p on p.id = x.person_id
                    where x.match_id = m.id), '[]'::jsonb) as eventos,
           coalesce((select jsonb_agg(jsonb_build_object(
                        'persona_id', a.person_id, 'lado', a.lado, 'condicion', a.condition,
                        'dorsal', a.dorsal, 'portero', a.portero, 'orden', a.orden,
                        'persona', pa.nombre_mostrado,
                        'posicion', ad.posicion, 'capitan', ad.capitan)
                      order by a.lado,
                               case a.condition when 'starter' then 0 when 'substitute' then 1 else 2 end,
                               a.orden)
                     from core.appearance a
                     join core.person pa on pa.id = a.person_id
                     left join core.appearance_detalle ad on ad.appearance_id = a.id
                    where a.match_id = m.id), '[]'::jsonb) as alineaciones,
           coalesce((select jsonb_agg(jsonb_build_object('rol', o.rol, 'persona', po.nombre_mostrado)
                      order by case o.rol when 'principal' then 0 when 'asistente1' then 1
                                           when 'asistente2' then 2 when 'cuarto' then 3 else 4 end)
                     from core.match_official o
                     join core.person po on po.id = o.person_id
                    where o.match_id = m.id), '[]'::jsonb) as oficiales,
           coalesce((select jsonb_agg(jsonb_build_object(
                        'lado', case when st.team_entry_id = m.home_team_entry_id then 'local'
                                     when st.team_entry_id = m.away_team_entry_id then 'visitante' end,
                        'rol', st.rol, 'persona', ps.nombre_mostrado)
                      order by st.team_entry_id, st.rol)
                     from core.match_staff st
                     join core.person ps on ps.id = st.person_id
                    where st.match_id = m.id), '[]'::jsonb) as cuerpo_tecnico,
           -- Enfrentamientos anteriores entre los dos clubes en la MISMA categoría. Se busca por club
           -- y no por nombre: un nombre igual no une dos equipos. El índice de team_season por club
           -- acota la búsqueda a los equipos de esos dos clubes, y los partidos se leen por el índice de
           -- equipo-fecha de la tabla de partidos.
           coalesce((select jsonb_agg(jsonb_build_object(
                        'match_id', h.match_id, 'fecha', h.fecha, 'temporada', h.temporada,
                        'jornada', h.jornada, 'local', h.local, 'visitante', h.visitante,
                        'goles_local', h.goles_local, 'goles_visitante', h.goles_visitante)
                      order by h.fecha desc)
                     from (
                       select m2.id as match_id,
                              to_char(coalesce(m2.played_at, m2.fecha_prevista::timestamptz), 'YYYY-MM-DD') as fecha,
                              s2.etiqueta as temporada,
                              d2.numero   as jornada,
                              el2.nombre_en_fuente as local,
                              ev2.nombre_en_fuente as visitante,
                              m2.goles_local,
                              m2.goles_visitante
                         from core.team_entry el2
                         join core.team_season tsl2 on tsl2.id = el2.team_season_id
                         join core.match m2 on m2.home_team_entry_id = el2.id
                         join core.team_entry ev2 on ev2.id = m2.away_team_entry_id
                         join core.team_season tsv2 on tsv2.id = ev2.team_season_id
                         join core.matchday d2 on d2.id = m2.matchday_id
                         join core.phase_group g2 on g2.id = m2.phase_group_id
                         join core.competition_edition e2 on e2.id = g2.competition_edition_id
                         join core.season s2 on s2.id = e2.season_id
                        where ((tsl2.club_id = tsl.club_id and tsv2.club_id = tsv.club_id)
                            or (tsl2.club_id = tsv.club_id and tsv2.club_id = tsl.club_id))
                          and tsl2.categoria = e.categoria
                          and tsv2.categoria = e.categoria
                          and m2.played_at is not null
                          and m2.goles_local is not null
                          and m2.id <> m.id
                          and coalesce(m2.played_at, m2.fecha_prevista::timestamptz)
                              < coalesce(m.played_at, m.fecha_prevista::timestamptz)
                        order by m2.played_at desc
                        limit 4
                     ) h), '[]'::jsonb) as enfrentamientos
      from core.match m
      join core.phase_group g on g.id = m.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      left join analytics.federacion_ficha ff on ff.codigo = f.codigo
      join core.matchday d on d.id = m.matchday_id
      join core.team_entry el on el.id = m.home_team_entry_id
      join core.team_entry ev on ev.id = m.away_team_entry_id
      join core.team_season tsl on tsl.id = el.team_season_id
      join core.team_season tsv on tsv.id = ev.team_season_id
      left join analytics.nombre_corto_equipo ncl on ncl.team_entry_id = el.id
      left join analytics.nombre_corto_equipo ncv on ncv.team_entry_id = ev.id
      left join core.venue v on v.id = m.venue_id
      join core.match_report r on r.match_id = m.id
     where m.id = $1
       and r.quality <> 'unavailable'
     limit 1`,
};

export const CONSULTAS_PARTIDOS = [PARTIDOS_DE_GRUPO, GOLES_DE_PARTIDOS, GRUPO_DEL_CANONICO, CLASIFICACION_DEL_GRUPO, ACTA_DEL_PARTIDO] as const;

export const PARAMETROS_PARTIDOS: Record<string, readonly unknown[]> = {
  'partidos-de-grupo': ['castilla-leon', '11379752', 400],
  'goles-de-partidos': ['castilla-leon', '11379752', 2000],
  'grupo-del-canónico': ['castilla-leon', '11379752'],
  'clasificación-del-grupo': ['castilla-leon', '11379752'],
  'acta-del-partido': [94040],
};
