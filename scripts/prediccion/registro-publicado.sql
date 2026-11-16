-- consulta: vincula
insert into analytics.prediccion_emitida
  (match_id,emitida_en,modelo,prob_local,prob_empate,prob_visitante,marcador_probable,prob_marcador)
select p.match_id,p.calculado_en,p.modelo,p.prob_local,p.prob_empate,p.prob_visitante,p.marcador_probable,p.prob_marcador
  from analytics.prediccion_ml p join core.match m on m.id=p.match_id
 where p.corte_datos is not null and m.official_status='played'
   and coalesce((m.played_at at time zone 'Europe/Madrid')::date,m.fecha_prevista)
       > (p.calculado_en at time zone 'Europe/Madrid')::date
on conflict (match_id) do nothing;

-- consulta: evalua
with datos as (
  select m.id, m.goles_local gl, m.goles_visitante gv, e.marcador_probable,
         e.prob_local / s.total pl, e.prob_empate / s.total px, e.prob_visitante / s.total pv,
         case when m.goles_local > m.goles_visitante then 0 when m.goles_local = m.goles_visitante then 1 else 2 end signo
    from analytics.prediccion_emitida e
    join analytics.prediccion_ml p on p.match_id=e.match_id and p.modelo=e.modelo and p.calculado_en=e.emitida_en
    join core.match m on m.id=e.match_id
    cross join lateral (select e.prob_local+e.prob_empate+e.prob_visitante total) s
   where p.corte_datos is not null and m.official_status='played'
     and m.goles_local is not null and m.goles_visitante is not null and s.total>0
     and coalesce((m.played_at at time zone 'Europe/Madrid')::date,m.fecha_prevista)
         > (e.emitida_en at time zone 'Europe/Madrid')::date
), medidos as (
  select id,signo,signo = case when pl >= px and pl >= pv then 0 when px >= pv then 1 else 2 end acierto,
         -ln(greatest(.000000000001,case signo when 0 then pl when 1 then px else pv end))::numeric(8,5) log_loss,
         ((pl-(signo=0)::int)^2+(px-(signo=1)::int)^2+(pv-(signo=2)::int)^2)::numeric(8,5) brier,
         marcador_probable = gl::text || '-' || gv::text marcador_acierto
    from datos
)
insert into analytics.prediccion_resultado as r
  (match_id,signo_real,acierto,log_loss,brier,marcador_acierto)
select id,signo,acierto,log_loss,brier,marcador_acierto from medidos
on conflict (match_id) do update set
  signo_real=excluded.signo_real,acierto=excluded.acierto,log_loss=excluded.log_loss,
  brier=excluded.brier,marcador_acierto=excluded.marcador_acierto,calculado_en=now()
where (r.signo_real,r.acierto,r.log_loss,r.brier,r.marcador_acierto)
   is distinct from (excluded.signo_real,excluded.acierto,excluded.log_loss,excluded.brier,excluded.marcador_acierto);

-- consulta: informe
select * from analytics.prediccion_registro_resumen order by modelo,jornada nulls first;
