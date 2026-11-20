-- Informe de cobertura por temporada (Castilla y León), a partir del diseño de Codex (20/11/2026).
-- Los equipos y los partidos se agregan por separado para no multiplicar los recuentos.
with equipos as (
  select phase_group_id, count(*) n from core.team_entry group by 1
),
partidos as (
  select phase_group_id,
         count(*) presentes,
         count(*) filter (where goles_local is not null and goles_visitante is not null) con_resultado,
         count(*) filter (where hora_confirmada is true) con_hora
    from core.match group by 1
)
select s.etiqueta temporada,
       count(*) grupos,
       sum(coalesce(e.n, 0)) equipos,
       sum(coalesce(e.n * (e.n - 1), 0)) esperados_1vuelta,
       sum(coalesce(p.presentes, 0)) hay,
       sum(coalesce(p.con_resultado, 0)) con_res,
       sum(coalesce(p.con_hora, 0)) con_hora,
       round(100.0 * sum(coalesce(p.presentes, 0)) / nullif(sum(coalesce(e.n * (e.n - 1), 0)), 0), 0) pct
  from core.phase_group g
  join core.competition_edition ce on ce.id = g.competition_edition_id
  join core.season s on s.id = ce.season_id
  join core.federation f on f.id = ce.federation_id
  left join equipos e on e.phase_group_id = g.id
  left join partidos p on p.phase_group_id = g.id
 where f.codigo = 'castilla-leon' and s.etiqueta >= '2014-15'
 group by 1
 order by 1;
