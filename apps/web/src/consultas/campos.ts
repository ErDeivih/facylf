import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Ficha de campo: qué se ha jugado en una instalación, cómo le va al equipo de casa y a qué horas se
 * juega. Todo sale de `core.match.venue_id`; un partido sin campo publicado no cuenta para ninguna
 * instalación.
 */

export type FilaCampo = {
  campo_id: number;
  nombre: string;
  municipio: string | null;
  partidos: number;
  con_resultado: number;
  victorias_local: number;
  empates: number;
  victorias_visitante: number;
  goles: number;
  /** Primer y último partido con fecha, `YYYY-MM-DD`. */
  primero: string | null;
  ultimo: string | null;
};

/** El campo y sus totales. Parámetros: (1) `core.venue.id`. */
export const CAMPO_POR_ID: Consulta<FilaCampo> = {
  nombre: 'campo-por-id',
  descripcion: 'Un campo con sus partidos, el balance del equipo local y los goles.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['campo_id', 'nombre', 'municipio', 'partidos', 'con_resultado', 'victorias_local', 'empates',
    'victorias_visitante', 'goles', 'primero', 'ultimo'],
  sql: `
    select v.id::int as campo_id, v.nombre, v.municipio,
           count(m.id)::int as partidos,
           count(m.id) filter (where m.goles_local is not null and m.goles_visitante is not null)::int as con_resultado,
           count(m.id) filter (where m.goles_local > m.goles_visitante)::int as victorias_local,
           count(m.id) filter (where m.goles_local = m.goles_visitante)::int as empates,
           count(m.id) filter (where m.goles_local < m.goles_visitante)::int as victorias_visitante,
           coalesce(sum(m.goles_local + m.goles_visitante), 0)::int as goles,
           to_char(min(coalesce(m.played_at::date, m.fecha_prevista)), 'YYYY-MM-DD') as primero,
           to_char(max(coalesce(m.played_at::date, m.fecha_prevista)), 'YYYY-MM-DD') as ultimo
      from core.venue v
      join core.federation f on f.id = v.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      left join core.match m on m.venue_id = v.id
     where v.id = $1
     group by v.id, v.nombre, v.municipio
     limit 1`,
};

export type FilaHorarioDeCampo = {
  /** 1 = lunes … 7 = domingo. */
  dia: number;
  /** `HH:MM` en hora de Madrid. */
  hora: string;
  partidos: number;
};

/**
 * Horarios habituales: día de la semana y hora de comienzo de los partidos con hora confirmada, de más
 * a menos frecuente. Un partido sin hora publicada no entra: no se le supone una.
 * Parámetros: (1) `core.venue.id`.
 */
export const HORARIOS_DEL_CAMPO: Consulta<FilaHorarioDeCampo> = {
  nombre: 'horarios-del-campo',
  descripcion: 'Día de la semana y hora de comienzo más frecuentes en un campo, sólo con hora confirmada.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['dia', 'hora', 'partidos'],
  sql: `
    select extract(isodow from (m.played_at at time zone 'Europe/Madrid'))::int as dia,
           to_char(m.played_at at time zone 'Europe/Madrid', 'HH24:MI') as hora,
           count(*)::int as partidos
      from core.match m
     where m.venue_id = $1 and m.hora_confirmada and m.played_at is not null
     group by 1, 2
     order by partidos desc, dia, hora
     limit 12`,
};

export type FilaLocalDeCampo = {
  /** Una inscripción reciente de ese equipo, para enlazar a su ficha. */
  equipo_id: number;
  equipo: string;
  categoria: string;
  partidos: number;
  ganados: number;
  empatados: number;
  perdidos: number;
};

/**
 * Los equipos que juegan en casa en este campo y su balance en él. Se agrupa por club, nombre de equipo
 * y categoría: el juvenil y el sénior de un club son equipos distintos aunque se llamen igual.
 * Parámetros: (1) `core.venue.id`.
 */
export const LOCALES_DEL_CAMPO: Consulta<FilaLocalDeCampo> = {
  nombre: 'locales-del-campo',
  descripcion: 'Equipos que juegan como locales en un campo, con su balance en él.',
  plan: 'indexado',
  presupuestoMs: 500,
  columnas: ['equipo_id', 'equipo', 'categoria', 'partidos', 'ganados', 'empatados', 'perdidos'],
  sql: `
    select max(te.id)::int as equipo_id, ts.nombre as equipo, ts.categoria,
           count(*)::int as partidos,
           count(*) filter (where m.goles_local > m.goles_visitante)::int as ganados,
           count(*) filter (where m.goles_local = m.goles_visitante)::int as empatados,
           count(*) filter (where m.goles_local < m.goles_visitante)::int as perdidos
      from core.match m
      join core.team_entry te on te.id = m.home_team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
     where m.venue_id = $1 and m.goles_local is not null and m.goles_visitante is not null
     group by ts.club_id, ts.nombre, ts.categoria
     order by partidos desc, ts.nombre
     limit 15`,
};

export type FilaPartidoDeCampo = {
  match_id: number;
  fecha: string | null;
  hora: string | null;
  edicion: string;
  grupo_id: number;
  jornada: number | null;
  local: string;
  visitante: string;
  goles_local: number | null;
  goles_visitante: number | null;
  tiene_acta: boolean;
};

/** Últimos partidos del campo, del más reciente al más antiguo. Parámetros: (1) `core.venue.id`, (2) límite. */
export const PARTIDOS_DEL_CAMPO: Consulta<FilaPartidoDeCampo> = {
  nombre: 'partidos-del-campo',
  descripcion: 'Partidos jugados o previstos en un campo, del más reciente al más antiguo.',
  plan: 'indexado',
  presupuestoMs: 500,
  columnas: ['match_id', 'fecha', 'hora', 'edicion', 'grupo_id', 'jornada', 'local', 'visitante',
    'goles_local', 'goles_visitante', 'tiene_acta'],
  sql: `
    select m.id::int as match_id,
           to_char(coalesce((m.played_at at time zone 'Europe/Madrid')::date, m.fecha_prevista), 'YYYY-MM-DD') as fecha,
           case when m.hora_confirmada and m.played_at is not null
                then to_char(m.played_at at time zone 'Europe/Madrid', 'HH24:MI') end as hora,
           e.nombre_publicado as edicion, g.id::int as grupo_id, d.numero::int as jornada,
           el.nombre_en_fuente as local, ev.nombre_en_fuente as visitante,
           m.goles_local, m.goles_visitante,
           exists (select 1 from core.match_report r where r.match_id = m.id) as tiene_acta
      from core.match m
      join core.phase_group g on g.id = m.phase_group_id
      join core.competition_edition e on e.id = g.competition_edition_id
      left join core.matchday d on d.id = m.matchday_id
      join core.team_entry el on el.id = m.home_team_entry_id
      join core.team_entry ev on ev.id = m.away_team_entry_id
     where m.venue_id = $1
     order by coalesce(m.played_at::date, m.fecha_prevista) desc nulls last, m.id desc
     limit $2`,
};
