-- 0073 · Corrección de la función de límite compartido (0072): comparar el contador devuelto.
create or replace function app.consume_limite(p_clave text, p_max integer, p_ventana interval)
returns boolean language plpgsql security definer set search_path = app, pg_temp as $$
declare v_ventana timestamptz; v_usos integer;
begin
  if p_max <= 0 or p_ventana is null then return false; end if;
  v_ventana := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_ventana)) * extract(epoch from p_ventana));
  insert into app.limite_peticion (clave, ventana, usos) values (p_clave, v_ventana, 1)
  on conflict (clave, ventana) do update set usos = app.limite_peticion.usos + 1
  returning usos into v_usos;
  delete from app.limite_peticion where ventana < now() - interval '1 day';
  return v_usos <= p_max;
end $$;
grant execute on function app.consume_limite(text, integer, interval) to facylf_app;
