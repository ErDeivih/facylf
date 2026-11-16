import type { Consulta } from './contratos';

export type FilaEquipoDeArbitro = {
  /** Una inscripción reciente de ese equipo, para enlazar a su ficha. */
  equipo_id: number;
  equipo: string;
  categoria: string;
  partidos: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  /** Partidos de esos que tienen acta: es el denominador de las tarjetas. */
  con_acta: number;
  amarillas: number;
  rojas: number;
};

/**
 * Cómo le ha ido a cada equipo con un árbitro: partidos, balance y tarjetas recibidas. Sólo equipos con
 * dos partidos o más con él, y agrupando por club, nombre de equipo y categoría (el juvenil y el sénior
 * de un club son equipos distintos).
 *
 * Es un recuento, no una conclusión: con tres o cuatro partidos el balance dice poco, y por eso la
 * pantalla enseña siempre cuántos son.
 * Parámetros: (1) `core.person.id` del árbitro.
 */
export const EQUIPOS_DEL_ARBITRO: Consulta<FilaEquipoDeArbitro> = {
  nombre: 'equipos-del-arbitro',
  descripcion: 'Balance y tarjetas de cada equipo en los partidos dirigidos por un árbitro.',
  plan: 'indexado',
  presupuestoMs: 600,
  columnas: ['equipo_id', 'equipo', 'categoria', 'partidos', 'ganados', 'empatados', 'perdidos',
    'con_acta', 'amarillas', 'rojas'],
  sql: `
    with partidos as (
      select m.id, m.home_team_entry_id as h, m.away_team_entry_id as a,
             m.goles_local as gl, m.goles_visitante as gv,
             exists (select 1 from core.match_report r where r.match_id = m.id) as con_acta
        from core.match_official o
        join core.match m on m.id = o.match_id
       where o.person_id = $1 and o.rol = 'principal'
         and m.goles_local is not null and m.goles_visitante is not null
    ),
    lados as (
      select id, h as te, gl as gf, gv as gc, con_acta from partidos
      union all
      select id, a, gv, gl, con_acta from partidos
    ),
    tarjetas as (
      select e.match_id, e.team_entry_id as te,
             count(*) filter (where e.event_type = 'tarjeta_amarilla')::int as amarillas,
             count(*) filter (where e.event_type = 'tarjeta_roja')::int as rojas
        from core.match_event e
       where e.match_id in (select id from partidos) and e.team_entry_id is not null
       group by e.match_id, e.team_entry_id
    )
    select max(te.id)::int as equipo_id, ts.nombre as equipo, ts.categoria,
           count(*)::int as partidos,
           count(*) filter (where l.gf > l.gc)::int as ganados,
           count(*) filter (where l.gf = l.gc)::int as empatados,
           count(*) filter (where l.gf < l.gc)::int as perdidos,
           count(*) filter (where l.con_acta)::int as con_acta,
           coalesce(sum(t.amarillas), 0)::int as amarillas,
           coalesce(sum(t.rojas), 0)::int as rojas
      from lados l
      join core.team_entry te on te.id = l.te
      join core.team_season ts on ts.id = te.team_season_id
      left join tarjetas t on t.match_id = l.id and t.te = l.te
     group by ts.club_id, ts.nombre, ts.categoria
    having count(*) >= 2
     order by partidos desc, ts.nombre
     limit 30`,
};
