import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

export type PreviaCruce = {
  edicion: string; grupo: string; temporada: string; local: string; visitante: string;
  fecha_jornada: string | null; fecha_partido: string | null; hora: string | null;
  campo_id: number | null; campo: string | null; arbitro_id: number | null; arbitro: string | null;
  match_id: number | null; calidad: string | null; estado: string | null;
  gl: number | null; gv: number | null; modelo: string | null; corte: string;
  pred_local: number | null; pred_empate: number | null; pred_visitante: number | null;
  marcador: string | null;
};

/** La misma clave sobrevive al paso de calendario a partido y al retiro de un calendario antiguo. */
export const PREVIA_CRUCE: Consulta<PreviaCruce> = {
  nombre: 'previa-cruce', descripcion: 'Calendario, primera emisión y partido confirmado por grupo, jornada y las dos inscripciones.',
  plan: 'indexado', presupuestoMs: 400,
  columnas: ['edicion', 'grupo', 'temporada', 'local', 'visitante', 'fecha_jornada', 'fecha_partido', 'hora',
    'campo_id', 'campo', 'arbitro_id', 'arbitro', 'match_id', 'calidad', 'estado', 'gl', 'gv', 'modelo', 'corte',
    'pred_local', 'pred_empate', 'pred_visitante', 'marcador'],
  sql: `
    with candidatos as (
      select m.*, count(*) over () as coincidencias
        from core.match m join core.matchday d on d.id=m.matchday_id
       where m.phase_group_id=$1 and d.phase_group_id=$1 and d.numero=$2
         and m.home_team_entry_id=$3 and m.away_team_entry_id=$4
    ), calendario as (
      select min(fecha_prevista) fecha, count(*) n from core.calendario_previsto
       where phase_group_id=$1 and jornada=$2 and home_team_entry_id=$3 and away_team_entry_id=$4
    )
    select e.nombre_publicado edicion, g.nombre grupo, s.etiqueta temporada,
           l.nombre_en_fuente local, v.nombre_en_fuente visitante,
           (case when c.n=1 then c.fecha end)::text fecha_jornada,
           coalesce((m.played_at at time zone 'UTC')::date,m.fecha_prevista)::text fecha_partido,
           case when m.hora_confirmada then to_char(m.played_at at time zone 'UTC','HH24:MI') end hora,
           sede.id::int campo_id, sede.nombre campo, po.id::int arbitro_id, po.nombre_mostrado arbitro,
           m.id::int match_id, r.quality calidad, m.official_status estado, m.goles_local gl, m.goles_visitante gv,
           x.modelo, least(x.corte_datos, (m.played_at at time zone 'UTC')::date, m.fecha_prevista,
                           case when c.n=1 then c.fecha end, (now() at time zone 'Europe/Madrid')::date)::text corte,
           x.prob_local::float8 pred_local, x.prob_empate::float8 pred_empate, x.prob_visitante::float8 pred_visitante,
           x.marcador_probable marcador
      from core.phase_group g join core.competition_edition e on e.id=g.competition_edition_id
      join core.federation f on f.id=e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id=e.season_id
      join core.team_entry l on l.id=$3 and l.phase_group_id=g.id
      join core.team_entry v on v.id=$4 and v.phase_group_id=g.id
      cross join calendario c
      left join analytics.prediccion_emitida_cruce x on x.phase_group_id=g.id and x.jornada=$2
            and x.home_team_entry_id=l.id and x.away_team_entry_id=v.id and x.corte_datos is not null
      left join candidatos m on m.coincidencias=1
      left join core.match_report r on r.match_id=m.id
      left join core.venue sede on sede.id=m.venue_id
      left join core.match_official o on o.match_id=m.id and o.rol='principal'
      left join core.person po on po.id=o.person_id
     where g.id=$1 and (c.n=1 or x.modelo is not null or m.id is not null)
     limit 1`,
};

export type FormaPrevia = {
  equipo_id: number; fecha: string; rival: string; gf: number; gc: number;
  jugadores: { id: number; nombre: string }[];
};

export const FORMA_PREVIA_CRUCE: Consulta<FormaPrevia> = {
  nombre: 'forma-previa-cruce', descripcion: 'Últimos cinco partidos anteriores al corte y convocatoria del encuentro más reciente de cada inscripción.',
  plan: 'indexado', presupuestoMs: 400, columnas: ['equipo_id', 'fecha', 'rival', 'gf', 'gc', 'jugadores'],
  sql: `
    select t.id::int equipo_id, to_char(p.played_at at time zone 'UTC','YYYY-MM-DD') fecha,
           rival.nombre_en_fuente rival, p.gf, p.gc,
           coalesce((select jsonb_agg(jsonb_build_object('id',persona.id,'nombre',persona.nombre_mostrado)
                                      order by a.orden, persona.id)
              from core.appearance a join core.person persona on persona.id=a.person_id
             where p.orden=1 and a.match_id=p.id and a.team_entry_id=t.id),'[]'::jsonb) jugadores
      from (values ($1::bigint),($2::bigint)) as t(id)
      cross join lateral (
        select ultimos.*, row_number() over (order by played_at desc,id desc) orden
          from (
            select m.id,m.played_at,case when m.home_team_entry_id=t.id then m.away_team_entry_id else m.home_team_entry_id end rival,
                   case when m.home_team_entry_id=t.id then m.goles_local else m.goles_visitante end gf,
                   case when m.home_team_entry_id=t.id then m.goles_visitante else m.goles_local end gc
              from core.match m
             where (m.home_team_entry_id=t.id or m.away_team_entry_id=t.id)
               and m.goles_local is not null and m.goles_visitante is not null
               and m.played_at < ($3::date::timestamp at time zone 'UTC')
             order by m.played_at desc,m.id desc limit 5
          ) ultimos
      ) p join core.team_entry rival on rival.id=p.rival
     order by t.id,p.orden limit 10`,
};
