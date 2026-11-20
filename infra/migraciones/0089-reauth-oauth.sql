-- 0089 · Reautenticación reciente para operaciones destructivas de cuentas OAuth.
--
-- Una cuenta creada con Google no tiene contraseña local. Para dar de baja una cuenta así no basta
-- con una sesión antigua: se exige volver a autenticarse con Google y se marca la sesión durante unos
-- minutos. La marca se guarda por token de sesión, no por usuario, para que no alcance a otros
-- navegadores.

alter table app.sesion add column if not exists reautenticada_en timestamp with time zone;

create or replace function app.marca_reauth_oauth(p_token_sha text, p_user_id text)
returns boolean
language plpgsql
security definer
set search_path to 'app', 'pg_temp'
as $$
begin
  if p_token_sha !~ '^[0-9a-f]{64}$' then return false; end if;
  update app.sesion
     set reautenticada_en = now()
   where token_sha = p_token_sha
     and user_id = p_user_id
     and expira_en > now();
  return found;
end;
$$;

revoke execute on function app.marca_reauth_oauth(text, text) from public;
grant execute on function app.marca_reauth_oauth(text, text) to facylf_app;
