-- La clasificación no se guarda: se calcula.
-- Ojo: esta vista da los números, NO el orden final. El desempate por enfrentamiento
-- directo vive en `packages/dominio` porque en SQL se vuelve ilegible, y porque sólo
-- se aplica cuando los empatados ya se han visto todas las veces previstas.

create materialized view clasificaciones as
with r as (
  select competicion_id, local_id as equipo_id,
         goles_local_oficial as gf, goles_visitante_oficial as gc, true as en_casa
    from partidos where goles_local_oficial is not null
  union all
  select competicion_id, visitante_id,
         goles_visitante_oficial, goles_local_oficial, false
    from partidos where goles_local_oficial is not null
)
select r.competicion_id,
       r.equipo_id,
       count(*)                                          as pj,
       count(*) filter (where gf > gc)                   as g,
       count(*) filter (where gf = gc)                   as e,
       count(*) filter (where gf < gc)                   as p,
       coalesce(sum(gf), 0)                              as gf,
       coalesce(sum(gc), 0)                              as gc,
       coalesce(sum(gf) - sum(gc), 0)                    as dg,
       count(*) filter (where gf > gc) * 3
         + count(*) filter (where gf = gc)
         - coalesce((select sum(s.puntos) from sanciones s
                      where s.equipo_id = r.equipo_id
                        and s.competicion_id = r.competicion_id), 0) as pts
  from r
 group by r.competicion_id, r.equipo_id;

create unique index on clasificaciones (competicion_id, equipo_id);

create or replace function refresca_clasificaciones() returns void
  language sql as $$ refresh materialized view concurrently clasificaciones $$;
