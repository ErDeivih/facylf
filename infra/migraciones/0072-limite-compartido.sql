-- 0072 · Límite de peticiones compartido entre instancias (respaldo del límite en memoria del proxy).
create table if not exists app.limite_peticion (
  clave text not null,
  ventana timestamptz not null,
  usos integer not null default 0,
  primary key (clave, ventana)
);
create or replace function app.consume_limite(p_clave text, p_max integer, p_ventana interval)
returns boolean language plpgsql security definer set search_path = app, pg_temp as $$
declare v_ventana timestamptz;
begin
  if p_max <= 0 or p_ventana is null then return false; end if;
  v_ventana := date_trunc('second', now()) - (extract(epoch from (now() - date_trunc('second', now())))::int % extract(epoch from p_ventana)::int) * interval '1 second';
  insert into app.limite_peticion (clave, ventana, usos) values (p_clave, v_ventana, 1)
  on conflict (clave, ventana) do update set usos = app.limite_peticion.usos + 1
  returning usos into p_max;
  delete from app.limite_peticion where ventana < now() - interval '1 day';
  return p_max <= (select max(usos) from app.limite_peticion where clave = p_clave and ventana = v_ventana) is not true;
end $$;
grant execute on function app.consume_limite(text, integer, interval) to facylf_app;
grant select, insert, update, delete on app.limite_peticion to facylf_app;
