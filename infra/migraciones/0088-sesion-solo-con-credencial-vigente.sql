-- 0088 · Crear la sesión sólo si la credencial verificada sigue siendo la misma.
--
-- La entrada verifica el hash y después crea la sesión. Si entre esas dos operaciones se cambia la
-- contraseña, la sesión del hash viejo podía sobrevivir. Esta función bloquea la fila de credencial
-- (`for share`) y comprueba el hash en la misma transacción que inserta la sesión: un cambio de
-- contraseña concurrente espera y, cuando termina, borra la sesión recién creada.

create or replace function app.crea_sesion_si_credencial(
  p_user_id text,
  p_password_hash text,
  p_token_sha text,
  p_horas integer default 168
) returns timestamp with time zone
language plpgsql
security definer
set search_path to 'app', 'pg_temp'
as $$
declare v_expira timestamptz;
begin
  perform 1 from app.credencial
   where user_id = p_user_id and password_hash = p_password_hash
   for share;
  if not found then raise exception 'CREDENCIAL_CAMBIADA'; end if;
  select app.crea_sesion(p_user_id, p_token_sha, p_horas) into v_expira;
  return v_expira;
end;
$$;

revoke execute on function app.crea_sesion_si_credencial(text, text, text, integer) from public;
grant execute on function app.crea_sesion_si_credencial(text, text, text, integer) to facylf_app;
