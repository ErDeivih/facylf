-- 0091 · Consultar la reautenticación OAuth sin dar SELECT directo sobre app.sesion.
--
-- `facylf_app` no puede leer `app.sesion`; la comprobación de la baja OAuth se encapsula aquí.
-- La marca sólo vale para el token y el usuario exactos, y caduca a los quince minutos.

create or replace function app.reautenticacion_oauth_reciente(p_token_sha text, p_user_id text)
returns boolean
language sql
security definer
stable
set search_path to 'app', 'pg_temp'
as $$
  select coalesce((
    select reautenticada_en > now() - interval '15 minutes'
      from app.sesion
     where token_sha = p_token_sha
       and user_id = p_user_id
       and expira_en > now()
  ), false)
$$;

revoke execute on function app.reautenticacion_oauth_reciente(text, text) from public;
grant execute on function app.reautenticacion_oauth_reciente(text, text) to facylf_app;
