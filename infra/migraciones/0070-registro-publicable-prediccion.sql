create view analytics.prediccion_registro_resumen as
select p.modelo, case when grouping(d.numero)=1 then null else d.numero end jornada,
       count(*)::int n, avg(r.acierto::int)::float8 acierto, avg(r.log_loss)::float8 log_loss,
       avg(r.brier)::float8 brier, count(r.marcador_acierto)::int con_marcador,
       avg(r.marcador_acierto::int)::float8 acierto_marcador
  from analytics.prediccion_resultado r
  join analytics.prediccion_ml p on p.match_id=r.match_id and p.corte_datos is not null
  join analytics.prediccion_emitida x on x.match_id=r.match_id and x.modelo=p.modelo and x.emitida_en=p.calculado_en
  join core.match m on m.id=r.match_id
  join core.matchday d on d.id=m.matchday_id
 where m.official_status='played' and m.goles_local is not null and m.goles_visitante is not null
   and coalesce((m.played_at at time zone 'Europe/Madrid')::date,m.fecha_prevista)
       > (x.emitida_en at time zone 'Europe/Madrid')::date
 group by grouping sets ((p.modelo,d.numero),(p.modelo));

grant select on analytics.prediccion_registro_resumen to facylf_lector, facylf_publicador;
