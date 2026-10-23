import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Entidades del canónico: club, equipo (inscripción) y persona.
 *
 * Es la «espina B» del front —la del ojeador—, la que empieza en un club o en un nombre y sube por
 * temporadas. La «espina A» (federación → edición → grupo → jornada) vive en `catalogo.ts` y en
 * `partidos.ts`. Las dos se tocan en un solo sitio: `core.team_entry`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * DOS REGLAS DE ESTA CASA QUE ESTE FICHERO EXISTE PARA CUMPLIR
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * 1. EL EQUIPO SE SELECCIONA POR `team_entry`, NUNCA POR `team_season` (medido el 23/09/2026).
 *
 *    La clave única de `core.team_season` es `(club_id, season_id, nombre)`. Cuando la fuente publica
 *    el mismo nombre para dos equipos del mismo club en la misma temporada, los dos colapsan en una
 *    sola fila. Comprobado en el canónico local: el club 16 «Ciudad Rodrigo C.F.» tiene en 2025-26 el
 *    equipo juvenil (`team_entry` 2489, «1ª División Provincial de Juveniles», grupo «Primera -
 *    Salamanca») y el sénior (`team_entry` 2517, «1ª División Regional de Aficionados», grupo
 *    «Primera - B»), y **los dos apuntan a `team_season` 2489**.
 *
 *    Consecuencia: cualquier lista de equipos se construye desde `team_entry`, y la etiqueta lleva la
 *    competición y el grupo, no sólo el nombre. Un selector por `team_season` ofrecería a la vez una
 *    plantilla juvenil y una sénior, y todo lo que enseñara después sería falso.
 *
 *    Y la categoría fiable es `core.competition_edition.categoria`, no `core.team_season.categoria`:
 *    en el caso medido, el `team_season` dice `aficionados` para un equipo que juega en categoría
 *    juvenil. Se devuelven las dos, con nombres distintos, para que la interfaz pueda explicarlo en
 *    vez de elegir en silencio.
 *
 * 2. LA CLASIFICACIÓN `oficial` NO TRAE GOLES, Y NO SE CONVIERTE EN CERO (medido el 23/09/2026).
 *
 *    `core.standing_snapshot` guarda dos orígenes. Medido sobre el canónico local: de las **338**
 *    filas con `origen = 'oficial'` y `jugados > 0`, **las 338** tienen `goles_favor = 0` y
 *    `goles_contra = 0`. No es que la fuente publique ceros: el juvenil de Ciudad Rodrigo ganó 14
 *    partidos de 26 y la reconstrucción desde sus marcadores da **59 goles a favor y 42 en contra**
 *    mientras la fila oficial dice 0 y 0.
 *
 *    Es exactamente el «falso cero» que el proyecto existe para no enseñar. Por eso este fichero
 *    **no expone los goles oficiales**: devuelve posición, puntos y partidos desde la fila oficial
 *    —que ahí sí es correcta y coincide con los marcadores— y los goles desde la reconstruida, con
 *    campos que se llaman `goles_*_reconstruidos` para que nadie los confunda con los oficiales.
 *
 *    El arreglo de fondo es del importador (escribir `NULL`, no `0`, cuando la fuente no publica el
 *    dato) y no se hace aquí: cambiar la interfaz para tapar un dato mal escrito sería empeorarlo.
 */

/** Un club con su federación. */
export type FilaClub = {
  club_id: number;
  nombre_canonico: string;
  municipio: string | null;
  provincia: string | null;
  federacion: string;
  federacion_nombre: string;
  /** Literales con los que cada fuente ha publicado este club, con su periodo. Procedencia del nombre. */
  aliases: string | null;
};

/**
 * El club y sus nombres publicados.
 *
 * Los alias salen de `core.team_alias` (el literal que usó cada fuente y desde cuándo): un club puede
 * llamarse distinto en dos federaciones y eso es un hecho, no un error que haya que unificar.
 */
export const CLUB_POR_ID: Consulta<FilaClub> = {
  nombre: 'club-por-id',
  descripcion: 'Un club con su federación y los literales con los que las fuentes lo han publicado.',
  plan: 'indexado',
  presupuestoMs: 100,
  columnas: ['club_id', 'nombre_canonico', 'municipio', 'provincia', 'federacion', 'federacion_nombre', 'aliases'],
  sql: `
    select c.id                                as club_id,
           c.nombre_canonico,
           c.municipio,
           c.provincia,
           f.codigo                            as federacion,
           f.nombre                            as federacion_nombre,
           (select string_agg(distinct ta.literal, ' · ' order by ta.literal)
              from core.team_alias ta
              join core.team_season ts2 on ts2.id = ta.team_season_id
             where ts2.club_id = c.id)         as aliases
      from core.club c
      join core.federation f on f.id = c.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
     where c.id = $1
     limit 1`,
};

/** Un equipo del club: la inscripción concreta, con su contexto y su clasificación final. */
export type FilaEquipoDeClub = {
  equipo_id: number;
  temporada: string;
  temporada_orden: number;
  edicion_id: number;
  edicion: string;
  edicion_codigo: string;
  /** Categoría de la edición. Es la fiable; la del `team_season` puede no coincidir (ver cabecera). */
  edicion_categoria: string;
  edicion_ambito: string | null;
  edicion_modalidad: string | null;
  edicion_genero: string | null;
  edicion_provincia: string | null;
  edicion_estado: string;
  grupo_id: number;
  grupo: string;
  grupo_codigo: string;
  jornadas_previstas: number | null;
  nombre_en_fuente: string;
  /** Categoría declarada en `team_season`. Se enseña aparte porque puede discrepar de la edición. */
  categoria_team_season: string;
  /** Posición, puntos y balance desde la fila oficial de clasificación. */
  posicion: number | null;
  puntos: number | null;
  jugados: number | null;
  ganados: number | null;
  empatados: number | null;
  perdidos: number | null;
  clasificacion_origen: string | null;
  /** Goles **reconstruidos** desde los marcadores: la fila oficial los trae a cero (ver cabecera). */
  goles_favor_reconstruidos: number | null;
  goles_contra_reconstruidos: number | null;
  partidos_conocidos: number | null;
  partidos_con_resultado: number | null;
  complete_through_matchday: number | null;
  visibility_state: string | null;
  calculado_en: string | null;
  total: number;
};

/**
 * Los equipos de un club, temporada a temporada, con su clasificación final.
 *
 * Es la consulta que sostiene el selector «temporada → equipo» de la ficha de club. Devuelve **una
 * fila por inscripción**, no por equipo de temporada: si un club tiene dos equipos con el mismo
 * nombre publicado en la misma temporada, salen dos filas y la interfaz puede explicar por qué.
 *
 * Parámetros: (1) club, (2) temporada exacta o `null` para todas, (3) límite.
 *
 * La clasificación final se lee con un `lateral … limit 1` sobre `standings_team_idx`, que es el
 * índice `(team_entry_id, matchday_id)`: una lectura por fila y no un recorrido de la tabla.
 */
export const EQUIPOS_DEL_CLUB: Consulta<FilaEquipoDeClub> = {
  nombre: 'equipos-del-club',
  descripcion: 'Las inscripciones de un club en todas sus temporadas, con competición, grupo, cobertura de su grupo y clasificación final oficial más los goles reconstruidos.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['equipo_id', 'temporada', 'temporada_orden', 'edicion_id', 'edicion', 'edicion_codigo',
    'edicion_categoria', 'edicion_ambito', 'edicion_modalidad', 'edicion_genero', 'edicion_provincia',
    'edicion_estado', 'grupo_id', 'grupo', 'grupo_codigo', 'jornadas_previstas', 'nombre_en_fuente',
    'categoria_team_season', 'posicion', 'puntos', 'jugados', 'ganados', 'empatados', 'perdidos',
    'clasificacion_origen', 'goles_favor_reconstruidos', 'goles_contra_reconstruidos',
    'partidos_conocidos', 'partidos_con_resultado', 'complete_through_matchday', 'visibility_state',
    'calculado_en', 'total'],
  sql: `
    select te.id                                as equipo_id,
           s.etiqueta                           as temporada,
           s.orden::int                         as temporada_orden,
           e.id                                 as edicion_id,
           e.nombre_publicado                   as edicion,
           e.codigo_externo                     as edicion_codigo,
           e.categoria                          as edicion_categoria,
           e.ambito                             as edicion_ambito,
           e.modalidad                          as edicion_modalidad,
           e.genero                             as edicion_genero,
           e.provincia                          as edicion_provincia,
           e.estado                             as edicion_estado,
           g.id                                 as grupo_id,
           g.nombre                             as grupo,
           g.codigo_externo                     as grupo_codigo,
           g.jornadas_previstas,
           te.nombre_en_fuente,
           ts.categoria                         as categoria_team_season,
           ofi.posicion,
           ofi.puntos,
           ofi.jugados,
           ofi.ganados,
           ofi.empatados,
           ofi.perdidos,
           ofi.origen                           as clasificacion_origen,
           rec.goles_favor                      as goles_favor_reconstruidos,
           rec.goles_contra                     as goles_contra_reconstruidos,
           c.partidos_conocidos,
           c.partidos_con_resultado,
           c.complete_through_matchday,
           c.visibility_state,
           c.calculado_en,
           (count(*) over ())::int              as total
      from core.team_season ts
      join core.team_entry te on te.team_season_id = ts.id
      join core.phase_group g on g.id = te.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      -- La última jornada con clasificación oficial de ESTE equipo en ESTE grupo.
      left join lateral (
           select ss.posicion, ss.puntos, ss.jugados, ss.ganados, ss.empatados, ss.perdidos, ss.origen
             from core.standing_snapshot ss
            where ss.team_entry_id = te.id
              and ss.phase_group_id = g.id
              and ss.origen = 'oficial'
            order by ss.matchday_id desc
            limit 1) ofi on true
      -- Y los goles, de la reconstruida: la oficial los trae a cero (ver la cabecera del fichero).
      left join lateral (
           select ss.goles_favor, ss.goles_contra
             from core.standing_snapshot ss
            where ss.team_entry_id = te.id
              and ss.phase_group_id = g.id
              and ss.origen = 'reconstruida'
            order by ss.matchday_id desc
            limit 1) rec on true
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     where ts.club_id = $1
       and ($2::text is null or s.etiqueta = $2)
     order by s.orden desc, e.nombre_publicado, g.orden, te.nombre_en_fuente
     limit $3`,
};

/** Cabecera de un equipo: su contexto completo y el balance de la temporada. */
export type FilaEquipo = {
  equipo_id: number;
  nombre_en_fuente: string;
  club_id: number;
  club: string;
  provincia_club: string | null;
  federacion: string;
  federacion_nombre: string;
  temporada: string;
  edicion_id: number;
  edicion: string;
  edicion_categoria: string;
  edicion_ambito: string | null;
  edicion_modalidad: string | null;
  edicion_genero: string | null;
  edicion_estado: string;
  grupo_id: number;
  grupo: string;
  jornadas_previstas: number | null;
  categoria_team_season: string;
  posicion: number | null;
  puntos: number | null;
  jugados: number | null;
  ganados: number | null;
  empatados: number | null;
  perdidos: number | null;
  goles_favor_reconstruidos: number | null;
  goles_contra_reconstruidos: number | null;
  partidos_elegibles: number | null;
  partidos_cubiertos: number | null;
  partidos_conocidos: number | null;
  partidos_con_resultado: number | null;
  complete_through_matchday: number | null;
  visibility_state: string | null;
  calculado_en: string | null;
};

/**
 * Un equipo por su `team_entry`, con todo el contexto que necesita su cabecera.
 *
 * `partidos_elegibles` y `partidos_cubiertos` salen de `analytics.team_edition_summary` y son el
 * **denominador** de toda cifra individual de la plantilla: sin ellos una media no se puede
 * interpretar y no se enseña. Son `null` si el agregado todavía no se ha calculado, que no es lo
 * mismo que cero partidos cubiertos.
 */
export const EQUIPO_POR_ID: Consulta<FilaEquipo> = {
  nombre: 'equipo-por-id',
  descripcion: 'Una inscripción de equipo con su club, federación, edición, grupo, cobertura del grupo, balance de la temporada y el denominador de sus métricas individuales.',
  plan: 'indexado',
  presupuestoMs: 200,
  columnas: ['equipo_id', 'nombre_en_fuente', 'club_id', 'club', 'provincia_club', 'federacion',
    'federacion_nombre', 'temporada', 'edicion_id', 'edicion', 'edicion_categoria', 'edicion_ambito',
    'edicion_modalidad', 'edicion_genero', 'edicion_estado', 'grupo_id', 'grupo', 'jornadas_previstas',
    'categoria_team_season', 'posicion', 'puntos', 'jugados', 'ganados', 'empatados', 'perdidos',
    'goles_favor_reconstruidos', 'goles_contra_reconstruidos', 'partidos_elegibles',
    'partidos_cubiertos', 'partidos_conocidos', 'partidos_con_resultado', 'complete_through_matchday',
    'visibility_state', 'calculado_en'],
  sql: `
    select te.id                                as equipo_id,
           te.nombre_en_fuente,
           cl.id                                as club_id,
           cl.nombre_canonico                   as club,
           cl.provincia                         as provincia_club,
           f.codigo                             as federacion,
           f.nombre                             as federacion_nombre,
           s.etiqueta                           as temporada,
           e.id                                 as edicion_id,
           e.nombre_publicado                   as edicion,
           e.categoria                          as edicion_categoria,
           e.ambito                             as edicion_ambito,
           e.modalidad                          as edicion_modalidad,
           e.genero                             as edicion_genero,
           e.estado                             as edicion_estado,
           g.id                                 as grupo_id,
           g.nombre                             as grupo,
           g.jornadas_previstas,
           ts.categoria                         as categoria_team_season,
           ofi.posicion,
           ofi.puntos,
           ofi.jugados,
           ofi.ganados,
           ofi.empatados,
           ofi.perdidos,
           rec.goles_favor                      as goles_favor_reconstruidos,
           rec.goles_contra                     as goles_contra_reconstruidos,
           res.partidos_elegibles,
           res.partidos_cubiertos,
           c.partidos_conocidos,
           c.partidos_con_resultado,
           c.complete_through_matchday,
           c.visibility_state,
           c.calculado_en
      from core.team_entry te
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      join core.phase_group g on g.id = te.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      left join analytics.team_edition_summary res on res.team_entry_id = te.id
      left join lateral (
           select ss.posicion, ss.puntos, ss.jugados, ss.ganados, ss.empatados, ss.perdidos
             from core.standing_snapshot ss
            where ss.team_entry_id = te.id and ss.phase_group_id = g.id and ss.origen = 'oficial'
            order by ss.matchday_id desc
            limit 1) ofi on true
      left join lateral (
           select ss.goles_favor, ss.goles_contra
             from core.standing_snapshot ss
            where ss.team_entry_id = te.id and ss.phase_group_id = g.id and ss.origen = 'reconstruida'
            order by ss.matchday_id desc
            limit 1) rec on true
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     where te.id = $1
     limit 1`,
};

/** Un jugador de la plantilla, con sus cifras y su denominador. */
export type FilaJugadorDePlantilla = {
  persona_id: number;
  nombre_mostrado: string;
  /** `true` cuando la identidad es **nominal**: asignada sin código federativo. Ver la ficha de persona. */
  identidad_nominal: boolean;
  es_menor: boolean;
  /** Dorsales usados en este equipo, ya formateados. `null` si la fuente no publica dorsal. */
  dorsales: string | null;
  portero: boolean;
  partidos_con_aparicion: number;
  convocatorias: number | null;
  partidos_demostrados: number | null;
  titularidades: number | null;
  suplencias: number | null;
  minutos_exactos: number | null;
  minutos_estimados: number | null;
  minutos_fiables: boolean | null;
  goles: number | null;
  goles_penalti: number | null;
  propias_puerta: number | null;
  amarillas: number | null;
  rojas: number | null;
  partidos_elegibles: number | null;
  partidos_cubiertos: number | null;
  total: number;
};

/**
 * La plantilla de un equipo: una fila por persona que aparece en alguna de sus actas.
 *
 * Se construye desde `core.appearance` —quién aparece de verdad— y no desde una lista de inscritos
 * que el esquema no guarda. Las cifras vienen de `analytics.player_team_season_summary`, y los
 * dorsales y la condición de portero se agregan de las propias apariciones.
 *
 * `convocatorias` incluye las apariciones `called_up_unknown`, que **no** son partidos jugados: la
 * distinción la hace la interfaz con la microcopia canónica, no esta consulta.
 */
export const PLANTILLA_DEL_EQUIPO: Consulta<FilaJugadorDePlantilla> = {
  nombre: 'plantilla-del-equipo',
  descripcion: 'Las personas que aparecen en las actas de una inscripción de equipo, con sus convocatorias, partidos demostrados, titularidades, minutos, goles, tarjetas y el denominador de partidos del equipo.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['persona_id', 'nombre_mostrado', 'identidad_nominal', 'es_menor', 'dorsales', 'portero',
    'partidos_con_aparicion', 'convocatorias', 'partidos_demostrados', 'titularidades', 'suplencias',
    'minutos_exactos', 'minutos_estimados', 'minutos_fiables', 'goles', 'goles_penalti',
    'propias_puerta', 'amarillas', 'rojas', 'partidos_elegibles', 'partidos_cubiertos', 'total'],
  sql: `
    with apariciones as (
      select a.person_id,
             string_agg(distinct a.dorsal::text, ' · ' order by a.dorsal::text) as dorsales,
             bool_or(a.portero)                                          as portero,
             count(distinct a.match_id)::int                             as partidos_con_aparicion
        from core.appearance a
       where a.team_entry_id = $1
       group by a.person_id
    )
    select ap.person_id                          as persona_id,
           p.nombre_mostrado,
           p.identidad_nominal,
           p.es_menor,
           ap.dorsales,
           ap.portero,
           ap.partidos_con_aparicion,
           s.convocatorias,
           s.partidos_demostrados,
           s.titularidades,
           s.suplencias,
           s.minutos_exactos,
           s.minutos_estimados,
           s.minutos_fiables,
           s.goles,
           s.goles_penalti,
           s.propias_puerta,
           s.amarillas,
           s.rojas,
           s.partidos_elegibles,
           s.partidos_cubiertos,
           (count(*) over ())::int             as total
      from apariciones ap
      join core.person p on p.id = ap.person_id
      left join analytics.player_team_season_summary s
             on s.person_id = ap.person_id
            and s.team_entry_id = $1
     order by s.goles desc nulls last, ap.partidos_con_aparicion desc, p.nombre_mostrado
     limit $2`,
};

/** Un partido de un equipo, desde su punto de vista. */
export type FilaPartidoDeEquipo = {
  partido_id: number;
  jornada_numero: number | null;
  jornada_id: number | null;
  fecha: string | null;
  fecha_prevista: string | null;
  estado: string;
  condicion: string;
  rival_id: number;
  rival: string;
  /** Goles del equipo consultado y del rival. `null` cuando el marcador no está publicado. */
  goles_propios: number | null;
  goles_rival: number | null;
  /** `ganado`, `empatado`, `perdido` o `sin_resultado`. Nunca `null` convertido en derrota. */
  resultado: string;
  campo: string | null;
  calidad_acta: string | null;
  total: number;
};

/**
 * Los partidos de un equipo, en orden de jornada, desde su propio punto de vista.
 *
 * El marcador se devuelve ya orientado —`goles_propios` y `goles_rival`— para que la interfaz no
 * tenga que saber si jugó en casa, que es donde se cuelan los errores de signo. Y `resultado` es
 * `sin_resultado` cuando el marcador es `null`: no se deduce una derrota de un dato ausente.
 *
 * Parámetros: (1) equipo, (2) límite, (3) desplazamiento.
 */
export const PARTIDOS_DEL_EQUIPO: Consulta<FilaPartidoDeEquipo> = {
  nombre: 'partidos-del-equipo',
  descripcion: 'Los partidos de una inscripción con la jornada, el rival, el marcador ya orientado desde su punto de vista, el resultado y la calidad del acta.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['partido_id', 'jornada_numero', 'jornada_id', 'fecha', 'fecha_prevista', 'estado',
    'condicion', 'rival_id', 'rival', 'goles_propios', 'goles_rival', 'resultado', 'campo',
    'calidad_acta', 'total'],
  sql: `
    select m.id                                                        as partido_id,
           j.numero                                                    as jornada_numero,
           j.id                                                        as jornada_id,
           m.played_at                                                 as fecha,
           m.fecha_prevista,
           m.official_status                                           as estado,
           case when m.home_team_entry_id = $1 then 'casa' else 'fuera' end as condicion,
           riv.id                                                      as rival_id,
           riv.nombre_en_fuente                                        as rival,
           case when m.home_team_entry_id = $1 then m.goles_local else m.goles_visitante end as goles_propios,
           case when m.home_team_entry_id = $1 then m.goles_visitante else m.goles_local end   as goles_rival,
           case when m.goles_local is null or m.goles_visitante is null then 'sin_resultado'
                when (m.home_team_entry_id = $1 and m.goles_local > m.goles_visitante)
                  or (m.away_team_entry_id = $1 and m.goles_visitante > m.goles_local) then 'ganado'
                when m.goles_local = m.goles_visitante then 'empatado'
                else 'perdido' end                                     as resultado,
           v.nombre                                                    as campo,
           r.quality                                                   as calidad_acta,
           (count(*) over ())::int                                     as total
      from core.match m
      join core.team_entry riv
        on riv.id = case when m.home_team_entry_id = $1 then m.away_team_entry_id else m.home_team_entry_id end
      left join core.matchday j on j.id = m.matchday_id
      left join core.venue v on v.id = m.venue_id
      left join core.match_report r on r.match_id = m.id
     where m.home_team_entry_id = $1 or m.away_team_entry_id = $1
     order by j.numero nulls last, m.fecha_prevista nulls last, m.id
     limit $2 offset $3`,
};

/** Una persona con lo que el canónico sabe de su identidad. */
export type FilaPersona = {
  persona_id: number;
  nombre_mostrado: string;
  identidad_nominal: boolean;
  es_menor: boolean;
  /** Códigos federativos conocidos, federación y contexto. Prueba de identidad fuerte si existe. */
  codigos: string | null;
  /** Uniones o rechazos de identidad registrados. Nunca se fusiona sin una decisión. */
  decisiones_identidad: number;
  total: number;
};

/**
 * Una persona por su identificador canónico.
 *
 * `identidad_nominal = true` significa que se le asignó identidad **sin código federativo**, por el
 * contexto de su equipo y su nombre. La interfaz tiene que decirlo: un nombre igual no une a dos
 * personas, y presentar como hecho un enlace probable es inventar. Los códigos y las decisiones de
 * identidad se devuelven como recuento para poder avisar sin volcar el detalle.
 */
export const PERSONA_POR_ID: Consulta<FilaPersona> = {
  nombre: 'persona-por-id',
  descripcion: 'Una persona con su nombre mostrado, si su identidad es nominal, si es menor de edad, sus códigos federativos conocidos y cuántas decisiones de identidad tiene registradas.',
  plan: 'indexado',
  presupuestoMs: 150,
  columnas: ['persona_id', 'nombre_mostrado', 'identidad_nominal', 'es_menor', 'codigos',
    'decisiones_identidad', 'total'],
  sql: `
    select p.id                                 as persona_id,
           p.nombre_mostrado,
           p.identidad_nominal,
           p.es_menor,
           (select string_agg(distinct psi.codigo_externo, ' · ')
              from core.person_source_identity psi
             where psi.person_id = p.id)        as codigos,
           (select count(*)::int from core.identity_decision d
             where d.person_a = p.id or d.person_b = p.id) as decisiones_identidad,
           1::int                               as total
      from core.person p
     where p.id = $1
     limit 1`,
};

/** Una temporada de la carrera de una persona, en un equipo concreto. */
export type FilaTemporadaDePersona = {
  temporada: string;
  temporada_orden: number;
  equipo_id: number;
  club_id: number;
  club: string;
  nombre_en_fuente: string;
  edicion: string;
  edicion_categoria: string;
  edicion_ambito: string | null;
  grupo: string;
  federacion: string;
  federacion_nombre: string;
  partidos_con_aparicion: number;
  convocatorias: number | null;
  partidos_demostrados: number | null;
  titularidades: number | null;
  suplencias: number | null;
  minutos_exactos: number | null;
  minutos_estimados: number | null;
  minutos_fiables: boolean | null;
  goles: number | null;
  goles_penalti: number | null;
  propias_puerta: number | null;
  amarillas: number | null;
  rojas: number | null;
  partidos_elegibles: number | null;
  partidos_cubiertos: number | null;
  total: number;
};

/**
 * La carrera de una persona: una fila por temporada y equipo.
 *
 * Es lo que responde «¿dónde jugaba el año pasado?». Una persona puede tener **dos filas en la misma
 * temporada** y no es un duplicado: son dos equipos distintos —el juvenil y el sénior, el equipo y la
 * copa—, cada uno con su contexto. Por eso la clave de la fila es el equipo y no la temporada.
 *
 * Sólo aparecen las temporadas en las que hay apariciones registradas. Una temporada sin datos no se
 * rellena: no se sabe si jugó en otro sitio o si no se recogió, y son cosas distintas.
 */
export const TRAYECTORIA_DE_PERSONA: Consulta<FilaTemporadaDePersona> = {
  nombre: 'trayectoria-de-persona',
  descripcion: 'Las temporadas y equipos de una persona con su contexto completo, las cifras de cada temporada y el denominador del equipo, ordenadas de la más reciente a la más antigua.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['temporada', 'temporada_orden', 'equipo_id', 'club_id', 'club', 'nombre_en_fuente',
    'edicion', 'edicion_categoria', 'edicion_ambito', 'grupo', 'federacion', 'federacion_nombre',
    'partidos_con_aparicion', 'convocatorias', 'partidos_demostrados', 'titularidades', 'suplencias',
    'minutos_exactos', 'minutos_estimados', 'minutos_fiables', 'goles', 'goles_penalti',
    'propias_puerta', 'amarillas', 'rojas', 'partidos_elegibles', 'partidos_cubiertos', 'total'],
  sql: `
    with por_equipo as (
      select a.team_entry_id,
             a.season_id,
             count(distinct a.match_id)::int as partidos_con_aparicion
        from core.appearance a
       where a.person_id = $1
       group by a.team_entry_id, a.season_id
    )
    select s.etiqueta                           as temporada,
           s.orden::int                         as temporada_orden,
           te.id                                as equipo_id,
           cl.id                                as club_id,
           cl.nombre_canonico                   as club,
           te.nombre_en_fuente,
           e.nombre_publicado                   as edicion,
           e.categoria                          as edicion_categoria,
           e.ambito                             as edicion_ambito,
           g.nombre                             as grupo,
           f.codigo                             as federacion,
           f.nombre                             as federacion_nombre,
           pe.partidos_con_aparicion,
           res.convocatorias,
           res.partidos_demostrados,
           res.titularidades,
           res.suplencias,
           res.minutos_exactos,
           res.minutos_estimados,
           res.minutos_fiables,
           res.goles,
           res.goles_penalti,
           res.propias_puerta,
           res.amarillas,
           res.rojas,
           res.partidos_elegibles,
           res.partidos_cubiertos,
           (count(*) over ())::int              as total
      from por_equipo pe
      join core.team_entry te on te.id = pe.team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      join core.phase_group g on g.id = te.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      left join analytics.player_team_season_summary res
             on res.person_id = $1 and res.team_entry_id = te.id
     order by s.orden desc, e.nombre_publicado, te.id
     limit $2`,
};

/** Un resultado de búsqueda por nombre: un club o una persona, con su contexto. */
export type FilaBusqueda = {
  /** `club` o `jugador`. La interfaz decide el enlace con esto. */
  tipo: string;
  entidad_id: number;
  nombre: string;
  /** Federación del club, o las federaciones en las que aparece la persona, ya formateadas. */
  federacion_nombre: string | null;
  /** Contexto humano: provincia del club, o su último equipo conocido. */
  contexto: string | null;
  /** `true` en personas cuya identidad se asignó sin código federativo. */
  identidad_nominal: boolean;
  es_menor: boolean;
  /** Similitud de trigramas con lo escrito: es lo que ordena los resultados. */
  parecido: number;
  total: number;
};

/**
 * Búsqueda por nombre sobre el canónico, devolviendo **clubes y jugadores**.
 *
 * Desde el 21/10/2026 se consulta `analytics.search_entity` (migración 0023, `pnpm lectura:proyectar`).
 * Antes iba sobre `core.person` y, por cada persona que coincidía, recorría TODAS sus apariciones para
 * sacar su contexto: con un apellido común y las 19 federaciones eso eran millones de filas por tecla.
 * La proyección ya trae el contexto, los alias y la marca de menor. El contrato no cambia. Si la
 * proyección está vacía (migración sin proyectar), la búsqueda devuelve vacío: `pnpm lectura:estado`.
 *
 * Reglas que se ven en el SQL:
 * - se busca sobre `nombre_norm` (sin tildes ni signos), así que `rodrigo` encuentra `Rodríguez` y
 *   `penaranda` encuentra `Peñaranda`; el literal original se conserva y es lo que se enseña;
 * - `like '%texto%'` sobre un índice de trigramas, no un `similarity()` completo: PostgreSQL puede
 *   resolverlo por índice y el orden final lo fija `similarity()`;
 * - una persona **no** se une a un club por nombre: el contexto que se enseña sale de sus actas
 *   (`core.appearance`), que es un hecho, no una coincidencia de nombres.
 *
 * Parámetros: (1) texto, (2) federación o `null`, (3) tipo (`club`/`jugador`) o `null`, (4) temporada
 * (`AAAA-AA`) o `null`, (5) límite.
 */
export const BUSQUEDA_POR_NOMBRE: Consulta<FilaBusqueda> = {
  nombre: 'busqueda-por-nombre',
  descripcion: 'Busca clubes y jugadores por nombre normalizado (tolerante a tildes y erratas cortas) y devuelve cada resultado con su federación, su contexto y si su identidad es nominal.',
  plan: 'indexado',
  presupuestoMs: 500,
  columnas: ['tipo', 'entidad_id', 'nombre', 'federacion_nombre', 'contexto', 'identidad_nominal',
    'es_menor', 'parecido', 'total'],
  sql: `
    -- 0041: por PALABRAS (analytics.search_palabra), no por texto dentro del nombre. Se empieza por la palabra
    -- escrita con menos coincidencias (contadas con tope) y se filtra con las demás, en cualquier orden.
    -- Con palabras muy comunes se toman las 5.000 entidades más populares: «total» llega como mucho a 5.000
    -- (la web enseña «más de 5.000» y pide afinar). Medido con 2 millones de personas: RENDIMIENTO-BASE.md §2.
    -- (Sin barras invertidas en el SQL: dentro de una plantilla de JS, «barra + s» se queda en «s» y se partía el
    -- nombre por cada letra s. Por eso [[:space:]]. Fallo real de 0041, visto el 23/10.)
    -- 0045: si TODAS las palabras escritas pasan de 5.000 coincidencias («garcía lópez», «hugo garcía»), se
    -- empieza por un PAR de palabras seguidas (analytics.search_par, en los dos órdenes), que casi nunca pasa de
    -- unos cientos. Si alguna palabra sola baja de 5.000, se sigue empezando por ella: así no se pierde a quien
    -- tiene las dos palabras separadas («hugo [garcía] lópez»).
    with patron as (select btrim(core.normaliza_nombre($1::text)) as t),
    tokens as (
      select x.w, length(x.w) as l, x.i from patron p, regexp_split_to_table(p.t, '[[:space:]]+') with ordinality x(w, i) where x.w <> ''
    ),
    -- Prefijo como RANGO con los operadores de text_pattern_ops (~>=~ ~<~): un «like k.w || '%'» con valor no
    -- constante no puede usar el índice y recorrería todas las palabras. '{' va justo después de la 'z' y los
    -- nombres normalizados sólo tienen [a-z0-9 ].
    solas as (
      select k.w, 'palabra'::text as fuente, c.n, k.l from tokens k
       cross join lateral (select count(*) as n from (select 1 from analytics.search_palabra sp
                                                       where sp.palabra ~>=~ k.w and sp.palabra ~<~ (k.w || '{') limit 5001) z) c
    ),
    pares as (
      select q.w, 'par'::text as fuente, c.n, length(q.w) as l
        from (select a.w || ' ' || b.w as w from tokens a join tokens b on b.i = a.i + 1
              union select b.w || ' ' || a.w from tokens a join tokens b on b.i = a.i + 1) q
       cross join lateral (select count(*) as n from (select 1 from analytics.search_par sq
                                                       where sq.par ~>=~ q.w and sq.par ~<~ (q.w || '{') limit 5001) z) c
       where (select min(n) from solas) > 5000 and c.n > 0
    ),
    conductor as (
      select w, fuente from (select * from solas union all select * from pares) x
       order by x.n, x.l desc
       limit 1
    ),
    base as (
      -- lateral: primero lo elegido y, para ello, un recorrido por rango del índice (si no, el planificador
      -- puede cruzar los 6 millones de palabras con la elegida)
      select sp.entity_type, sp.entity_id, sp.normalized_name
        from conductor d
        cross join lateral (
          select x.entity_type, x.entity_id, x.normalized_name, x.popularidad
            from analytics.search_palabra x
           where d.fuente = 'palabra' and x.palabra ~>=~ d.w and x.palabra ~<~ (d.w || '{')
             and x.entity_type in ('club', 'persona')
             and ($3::text is null or ($3 = 'club' and x.entity_type = 'club') or ($3 = 'jugador' and x.entity_type = 'persona'))
           order by x.popularidad desc
           limit 5000) sp
      union all
      select sq.entity_type, sq.entity_id, sq.normalized_name
        from conductor d
        cross join lateral (
          select y.entity_type, y.entity_id, y.normalized_name
            from analytics.search_par y
           where d.fuente = 'par' and y.par ~>=~ d.w and y.par ~<~ (d.w || '{')
             and y.entity_type in ('club', 'persona')
             and ($3::text is null or ($3 = 'club' and y.entity_type = 'club') or ($3 = 'jugador' and y.entity_type = 'persona'))
           order by y.popularidad desc
           limit 5000) sq
    ),
    candidatos as (
      -- Los alias (otras formas en que la fuente escribió el nombre) son filas aparte que apuntan a la
      -- misma entidad: se queda la mejor coincidencia de cada entidad.
      select distinct on (se.entity_type, se.entity_id)
             se.entity_type, se.entity_id, se.contexto, se.federation_id, se.popularidad,
             similarity(se.normalized_name, p.t)                                  as parecido,
             (se.normalized_name = p.t)                                           as exacto,
             (se.normalized_name like p.t || '%' or se.normalized_name like '% ' || p.t || '%') as prefijo
        from base b
        join analytics.search_entity se on se.entity_type = b.entity_type and se.entity_id = b.entity_id
                                       and se.normalized_name = b.normalized_name
        cross join patron p
       where p.t <> ''
         -- todas las palabras escritas tienen que estar, como comienzo de alguna palabra del nombre
         and not exists (select 1 from tokens k
                          where se.normalized_name not like k.w || '%' and se.normalized_name not like '% ' || k.w || '%')
       order by se.entity_type, se.entity_id,
                (se.normalized_name = p.t) desc,
                (se.normalized_name like p.t || '%' or se.normalized_name like '% ' || p.t || '%') desc,
                similarity(se.normalized_name, p.t) desc
    )
    select case c.entity_type when 'persona' then 'jugador' else 'club' end as tipo,
           c.entity_id                                       as entidad_id,
           coalesce(pe.nombre_mostrado, cl.nombre_canonico)  as nombre,
           f.nombre                                          as federacion_nombre,
           c.contexto,
           coalesce(pe.identidad_nominal, false)             as identidad_nominal,
           coalesce(pe.es_menor, false)                      as es_menor,
           c.parecido,
           (count(*) over ())::int                           as total
      from candidatos c
      join core.federation f on f.id = c.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      -- lateral con «limit 1» (no se puede aplanar, así que se busca por la clave para cada candidato): con un
      -- join normal el planificador creía que había 1 candidato y recorría core.person entera (2 millones) por
      -- cada uno de los hasta 5.000
      left join lateral (select p2.id, p2.nombre_mostrado, p2.identidad_nominal, p2.es_menor from core.person p2
                          where c.entity_type = 'persona' and p2.id = c.entity_id limit 1) pe on true
      left join lateral (select c2.id, c2.nombre_canonico from core.club c2
                          where c.entity_type = 'club' and c2.id = c.entity_id limit 1) cl on true
     where coalesce(pe.id, cl.id) is not null
       -- Federación y temporada se comprueban contra HECHOS (los resúmenes salen de las actas), no contra
       -- el rango de temporadas de la proyección: quien jugó en 2019 y 2025 no aparece al filtrar 2022.
       and ($2::text is null or (c.entity_type = 'club' and f.codigo = $2) or (c.entity_type = 'persona' and exists (
             select 1 from analytics.player_team_season_summary s2
               join core.competition_edition e2 on e2.id = s2.competition_edition_id
               join core.federation f2 on f2.id = e2.federation_id
              where s2.person_id = c.entity_id and f2.codigo = $2)))
       and ($4::text is null or (c.entity_type = 'club' and exists (
             select 1 from core.team_season ts4
               join core.team_entry te4 on te4.team_season_id = ts4.id
               join core.season s4 on s4.id = ts4.season_id
              where ts4.club_id = c.entity_id and s4.etiqueta = $4))
         or (c.entity_type = 'persona' and exists (
             select 1 from analytics.player_team_season_summary s5
               join core.season se5 on se5.id = s5.season_id
              where s5.person_id = c.entity_id and se5.etiqueta = $4)))
     -- Orden de RENDIMIENTO-BUSQUEDA.md §4: igualdad, prefijo de palabra, parecido; la actividad sólo desempata.
     order by c.exacto desc, c.prefijo desc, c.parecido desc, c.popularidad desc, nombre
     limit $5`,
};

/** Un equipo (inscripción) en un listado, con su club, su competición y la cobertura de su grupo. */
export type FilaEquipoListado = {
  equipo_id: number;
  nombre_en_fuente: string;
  club_id: number;
  club: string;
  temporada: string;
  temporada_orden: number;
  edicion: string;
  edicion_categoria: string;
  edicion_ambito: string | null;
  grupo: string;
  grupo_id: number;
  federacion: string;
  federacion_nombre: string;
  jornadas_previstas: number | null;
  partidos_conocidos: number | null;
  visibility_state: string | null;
  calculado_en: string | null;
  total: number;
};

/**
 * Listado de equipos inscritos, con filtros de federación, temporada, categoría y nombre.
 *
 * Cada fila es una **inscripción** (`team_entry`), no un equipo de temporada ni un club: es la misma
 * decisión que en el resto de la espina B, y por el mismo motivo medido —`core.team_season` mezcla el
 * juvenil y el sénior del club 16 en una sola fila—. Por eso la etiqueta de cada fila lleva su
 * competición y su grupo: sin ellos, dos equipos distintos del mismo club parecerían el mismo.
 *
 * La categoría que se filtra es la de la **edición**, que es la fiable; la del `team_season` puede
 * discrepar (ver la cabecera de este fichero).
 *
 * Parámetros: (1) federación, (2) temporada, (3) categoría, (4) texto del nombre, (5) límite,
 * (6) desplazamiento.
 */
export const EQUIPOS_POR_FEDERACION: Consulta<FilaEquipoListado> = {
  nombre: 'equipos-por-federacion',
  descripcion: 'Equipos inscritos del canónico con su club, su competición, su grupo y la cobertura medida de ese grupo, filtrables por federación, temporada, categoría y nombre.',
  plan: 'indexado',
  // El listado sin filtros recorre y ordena 1,2 M de inscripciones (el `count(*) over ()` obliga a pasar por
  // todas para dar el total): medido el 23/10/2026, 2,1-2,4 s. El tope dice el coste real; la solución de
  // fondo es un listado precalculado en `analytics` (fase C), no subir el número.
  presupuestoMs: 3_000,
  columnas: ['equipo_id', 'nombre_en_fuente', 'club_id', 'club', 'temporada', 'temporada_orden',
    'edicion', 'edicion_categoria', 'edicion_ambito', 'grupo', 'grupo_id', 'federacion',
    'federacion_nombre', 'jornadas_previstas', 'partidos_conocidos', 'visibility_state',
    'calculado_en', 'total'],
  sql: `
    select te.id                                as equipo_id,
           te.nombre_en_fuente,
           cl.id                                as club_id,
           cl.nombre_canonico                   as club,
           s.etiqueta                           as temporada,
           s.orden::int                         as temporada_orden,
           e.nombre_publicado                   as edicion,
           e.categoria                          as edicion_categoria,
           e.ambito                             as edicion_ambito,
           g.nombre                             as grupo,
           g.id                                 as grupo_id,
           g.jornadas_previstas,
           f.codigo                             as federacion,
           f.nombre                             as federacion_nombre,
           c.partidos_conocidos,
           c.visibility_state,
           c.calculado_en,
           (count(*) over ())::int              as total
      from core.team_entry te
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
      join core.phase_group g on g.id = te.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     where ($1::text is null or f.codigo = $1)
       and ($2::text is null or s.etiqueta = $2)
       and ($3::text is null or e.categoria = $3)
       and (coalesce($4::text, '') = ''
            or core.normaliza_nombre(te.nombre_en_fuente) like '%' || core.normaliza_nombre($4) || '%')
     order by s.orden desc, f.codigo, e.nombre_publicado, g.orden, te.nombre_en_fuente
     limit $5 offset $6`,
};

/** Un partido en un listado, con su contexto y el resultado desde el punto de vista del local. */
export type FilaPartidoListado = {
  partido_id: number;
  jornada_numero: number | null;
  jornada_id: number | null;
  temporada: string;
  federacion: string;
  federacion_nombre: string;
  edicion: string;
  edicion_categoria: string;
  grupo: string;
  grupo_id: number;
  local_id: number;
  local: string;
  visitante_id: number;
  visitante: string;
  goles_local: number | null;
  goles_visitante: number | null;
  fecha_prevista: string | null;
  jugado_en: string | null;
  estado: string;
  calidad_acta: string | null;
  total: number;
};

/**
 * Listado de partidos con filtros de federación, temporada y jornada.
 *
 * **Medido antes de escribirlo, porque `core.match` es tabla de hechos y la regla del proyecto prohíbe
 * recorrerla entera en un recorrido crítico.** `EXPLAIN (ANALYZE)` con federación y temporada da:
 *
 *     Index Scan using match_phase_group_id_matchday_id_source_order_key on match m
 *                                                    (actual rows=231.67 loops=6)
 *
 * Es decir: el filtro de federación y temporada resuelve primero un puñado de grupos, y de ahí se baja
 * al partido **por índice**, grupo a grupo. Los únicos `Seq Scan` del plan son de catálogo
 * (`federation` 1 fila, `competition_edition` 37, `season` 1), que es lo que la regla permite.
 *
 * De ahí una consecuencia de diseño que no es un detalle: **la temporada no debería ir vacía en uso
 * normal.** Sin ella el conjunto de grupos crece hasta todas las ediciones de la federación, y aunque
 * hoy 9.175 partidos siguen entrando, el camino barato deja de estar garantizado. La página filtra por
 * defecto por la temporada más reciente del canónico.
 *
 * Parámetros: (1) federación, (2) temporada, (3) número de jornada, (4) límite, (5) desplazamiento.
 */
export const PARTIDOS_DEL_CANONICO: Consulta<FilaPartidoListado> = {
  nombre: 'partidos-del-canónico',
  descripcion: 'Partidos del canónico con su jornada, su competición, su grupo, los dos equipos, el marcador y la calidad del acta, filtrables por federación, temporada y jornada.',
  plan: 'indexado',
  presupuestoMs: 600,
  columnas: ['partido_id', 'jornada_numero', 'jornada_id', 'temporada', 'federacion',
    'federacion_nombre', 'edicion', 'edicion_categoria', 'grupo', 'grupo_id', 'local_id', 'local',
    'visitante_id', 'visitante', 'goles_local', 'goles_visitante', 'fecha_prevista', 'jugado_en',
    'estado', 'calidad_acta', 'total'],
  sql: `
    select m.id                                 as partido_id,
           j.numero                             as jornada_numero,
           j.id                                 as jornada_id,
           s.etiqueta                           as temporada,
           f.codigo                             as federacion,
           f.nombre                             as federacion_nombre,
           e.nombre_publicado                   as edicion,
           e.categoria                          as edicion_categoria,
           g.nombre                             as grupo,
           g.id                                 as grupo_id,
           loc.id                               as local_id,
           loc.nombre_en_fuente                 as local,
           vis.id                               as visitante_id,
           vis.nombre_en_fuente                 as visitante,
           m.goles_local,
           m.goles_visitante,
           m.fecha_prevista,
           m.played_at                          as jugado_en,
           m.official_status                    as estado,
           r.quality                            as calidad_acta,
           (count(*) over ())::int              as total
      from core.match m
      join core.phase_group g on g.id = m.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      left join core.matchday j on j.id = m.matchday_id
      join core.team_entry loc on loc.id = m.home_team_entry_id
      join core.team_entry vis on vis.id = m.away_team_entry_id
      left join core.match_report r on r.match_id = m.id
     where ($1::text is null or f.codigo = $1)
       and ($2::text is null or s.etiqueta = $2)
       and ($3::int is null or j.numero = $3)
     order by s.orden desc, m.played_at desc nulls last, m.id desc
     limit $4 offset $5`,
};

/** Un grupo resuelto por sus códigos externos, con su contexto y su cobertura. */
export type FilaGrupoResuelto = {
  grupo_id: number;
  federacion: string;
  federacion_nombre: string;
  grupo_codigo: string;
  grupo: string;
  tipo: string;
  jornadas_previstas: number | null;
  edicion: string;
  edicion_codigo: string;
  temporada: string;
  inscripciones: number;
  partidos_conocidos: number | null;
  visibility_state: string | null;
  calculado_en: string | null;
};

/**
 * Resuelve un grupo del canónico a partir de los **códigos externos** de su edición y de sí mismo.
 *
 * Es la pieza que permite que los enlaces antiguos sigan funcionando. El slug heredado tiene la forma
 * `t21-c22911157-g22911162`: la temporada codificada ahí (`21`) es la de la **cola local** y **no
 * existe en el canónico** —la 2025-26 es la 3—, así que no se puede traducir. Pero `c22911157` y
 * `g22911162` sí son los `codigo_externo` de la edición y del grupo, y con esos dos la búsqueda es
 * exacta y no necesita la temporada.
 *
 * Se ignoran a propósito los códigos de temporada del slug en vez de intentar adivinarlos: cruzar un
 * código local con uno canónico es exactamente lo que el proyecto prohíbe hacer con identificadores
 * externos.
 *
 * Parámetros: (1) código externo de la edición, (2) código externo del grupo.
 */
export const GRUPO_POR_CODIGOS_EXTERNOS: Consulta<FilaGrupoResuelto> = {
  nombre: 'grupo-por-codigos-externos',
  descripcion: 'Resuelve un grupo del canónico por el código externo de su edición y el suyo propio, con su federación, su temporada, sus inscripciones y la cobertura medida.',
  plan: 'indexado',
  presupuestoMs: 150,
  columnas: ['grupo_id', 'federacion', 'federacion_nombre', 'grupo_codigo', 'grupo', 'tipo',
    'jornadas_previstas', 'edicion', 'edicion_codigo', 'temporada', 'inscripciones',
    'partidos_conocidos', 'visibility_state', 'calculado_en'],
  sql: `
    select g.id                                 as grupo_id,
           f.codigo                             as federacion,
           f.nombre                             as federacion_nombre,
           g.codigo_externo                     as grupo_codigo,
           g.nombre                             as grupo,
           g.tipo,
           g.jornadas_previstas,
           e.nombre_publicado                   as edicion,
           e.codigo_externo                     as edicion_codigo,
           s.etiqueta                           as temporada,
           (select count(*) from core.team_entry te where te.phase_group_id = g.id)::int as inscripciones,
           c.partidos_conocidos,
           c.visibility_state,
           c.calculado_en
      from core.phase_group g
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     where e.codigo_externo = $1
       and g.codigo_externo = $2
     limit 1`,
};

/** Parámetros por defecto: los usan las páginas, la prueba de contrato y `scripts/planes.mjs`. */
export const PARAMETROS_ENTIDADES: Record<string, readonly unknown[]> = {
  // Club 16 «Ciudad Rodrigo C.F.»: el caso medido que mezcla juvenil y sénior en un `team_season`.
  'club-por-id': [16],
  'equipos-del-club': [16, null, 80],
  // 2489 es el juvenil de Ciudad Rodrigo en «Primera - Salamanca» (2025-26).
  'equipo-por-id': [2489],
  'plantilla-del-equipo': [2489, 200],
  'partidos-del-equipo': [2489, 80, 0],
  'persona-por-id': [1],
  'trayectoria-de-persona': [1, 80],
  // «rodrigo» es el caso real: encuentra el club 16 y a las personas cuyo apellido lo contiene.
  'busqueda-por-nombre': ['rodrigo', null, null, null, 50],
  'equipos-por-federacion': [null, null, null, '', 80, 0],
  // El escenario realista es con federación y temporada: es lo que mide el plan y lo que garantiza
  // que se baje al partido por índice en vez de por recorrido completo.
  'partidos-del-canónico': ['castilla-leon', '2025-26', null, 80, 0],
  // El grupo de Salamanca juvenil medido: su edición y su código de grupo salen del slug heredado
  // `t21-c22911157-g22911162`, y son los dos únicos códigos que se pueden traducir al canónico.
  'grupo-por-codigos-externos': ['22911157', '22911162'],
};

/** Todas las consultas de entidades, para las pruebas de contrato y la medición de planes. */
export const CONSULTAS_ENTIDADES = [CLUB_POR_ID, EQUIPOS_DEL_CLUB, EQUIPO_POR_ID,
  PLANTILLA_DEL_EQUIPO, PARTIDOS_DEL_EQUIPO, PERSONA_POR_ID, TRAYECTORIA_DE_PERSONA,
  BUSQUEDA_POR_NOMBRE, EQUIPOS_POR_FEDERACION, PARTIDOS_DEL_CANONICO,
  GRUPO_POR_CODIGOS_EXTERNOS] as const;
