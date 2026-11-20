-- 0086 · Identidades OAuth/OIDC y alta de cuenta sin contraseña.
--
-- La cuenta puede nacer de un proveedor verificado (Google). Se guarda la identidad por
-- (proveedor, sujeto) y se enlaza con una credencial existente sólo si el correo ya está verificado
-- por el proveedor. Un usuario OAuth no tiene contraseña local: `app.credencial` sigue siendo la
-- tabla de contraseñas y no se rellena con un hash ficticio.

create table if not exists app.oauth_identidad (
  proveedor text not null check (proveedor in ('google')),
  sujeto text not null,
  user_id text not null references app.usuario(user_id) on delete cascade,
  correo text not null,
  creado_en timestamp with time zone not null default now(),
  primary key (proveedor, sujeto),
  unique (user_id, proveedor)
);

revoke all on table app.oauth_identidad from public;
grant select, insert, delete on table app.oauth_identidad to facylf_app;

create or replace function app.alta_cuenta_oauth(
  p_user_id text,
  p_proveedor text,
  p_sujeto text,
  p_correo text,
  p_nombre text
) returns text
language plpgsql
security definer
set search_path to 'app', 'pg_temp'
as $$
declare
  v_user text;
  v_estado text;
begin
  if p_proveedor <> 'google' then raise exception 'PROVEEDOR_NO_VALIDO'; end if;
  if p_sujeto is null or length(btrim(p_sujeto)) < 3 then raise exception 'SUJETO_NO_VALIDO'; end if;
  if p_correo is null or position('@' in p_correo) = 0 then raise exception 'CORREO_NO_VALIDO'; end if;

  -- Identidad ya conocida: sólo se permite si la cuenta sigue activa.
  select user_id into v_user
    from app.oauth_identidad
   where proveedor = p_proveedor and sujeto = p_sujeto;
  if v_user is not null then
    select estado into v_estado from app.usuario where user_id = v_user;
    if v_estado is distinct from 'activo' then raise exception 'CUENTA_NO_ACTIVA'; end if;
    return v_user;
  end if;

  -- Enlace con una cuenta de contraseña del mismo correo verificado por el proveedor.
  select user_id into v_user from app.credencial where correo = lower(btrim(p_correo));
  if v_user is not null then
    select estado into v_estado from app.usuario where user_id = v_user;
    if v_estado is distinct from 'activo' then raise exception 'CUENTA_NO_ACTIVA'; end if;
  else
    insert into app.usuario (user_id, rol, estado, activo, nombre_visible)
    values (p_user_id, 'usuario', 'activo', true, left(coalesce(nullif(btrim(p_nombre), ''), split_part(p_correo, '@', 1)), 120));
    v_user := p_user_id;
  end if;

  insert into app.oauth_identidad (proveedor, sujeto, user_id, correo)
  values (p_proveedor, p_sujeto, v_user, lower(btrim(p_correo)));
  return v_user;
end;
$$;

revoke execute on function app.alta_cuenta_oauth(text, text, text, text, text) from public;
grant execute on function app.alta_cuenta_oauth(text, text, text, text, text) to facylf_app;
