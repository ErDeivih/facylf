-- 0090 · Correo de la cuenta para mostrarlo enmascarado en «Mi cuenta».
--
-- La web no puede leer `app.credencial` directamente y la ficha no debe mostrar la dirección
-- completa. Esta función devuelve sólo el correo de la sesión pedida; el enmascarado se hace en la
-- capa de presentación.

create or replace function app.correo_de_usuario(p_user_id text)
returns text
language sql
security definer
stable
set search_path to 'app', 'pg_temp'
as $$
  select correo from app.credencial where user_id = p_user_id
$$;

revoke execute on function app.correo_de_usuario(text) from public;
grant execute on function app.correo_de_usuario(text) to facylf_app;
