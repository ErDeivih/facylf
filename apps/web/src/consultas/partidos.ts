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
  /** Ids de inscripción de los dos equipos: hacen falta para calcular la forma desde los partidos. */
  local_id: number;
  visitante_id: number;
  local: string;
  visitante: string;
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
  columnas: ['match_id', 'jornada', 'orden', 'fecha', 'hora', 'local_id', 'visitante_id', 'local', 'visitante',
    'goles_local', 'goles_visitante', 'campo', 'arbitro', 'calidad_acta', 'estado'],
  sql: `
    select m.id                      as match_id,
           d.numero                  as jornada,
           m.source_order            as orden,
           to_char(m.played_at, 'YYYY-MM-DD') as fecha,
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

export const CONSULTAS_PARTIDOS = [PARTIDOS_DE_GRUPO, GOLES_DE_PARTIDOS, GRUPO_DEL_CANONICO, CLASIFICACION_DEL_GRUPO] as const;

export const PARAMETROS_PARTIDOS: Record<string, readonly unknown[]> = {
  'partidos-de-grupo': ['castilla-leon', '11379752', 400],
  'goles-de-partidos': ['castilla-leon', '11379752', 2000],
  'grupo-del-canónico': ['castilla-leon', '11379752'],
  'clasificación-del-grupo': ['castilla-leon', '11379752'],
};
