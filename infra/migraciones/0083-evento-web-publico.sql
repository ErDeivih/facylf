-- 0083 · Vista agregable de visitas para observabilidad, sin abrir app.evento_web al rol de lectura.
create or replace view analytics.evento_web_publico as
select date_trunc('day', creado_en) as dia, ruta, count(*)::bigint as visitas
  from app.evento_web
 group by 1, 2;
grant select on analytics.evento_web_publico to facylf_lector;
