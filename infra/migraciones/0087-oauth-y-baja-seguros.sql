-- 0087 · Endurecer OAuth y completar la baja.
--
-- 1. OAuth no enlaza automáticamente una cuenta por correo: un atacante podría registrar el correo de
--    la víctima con contraseña y quedarse con la cuenta cuando ella entrara con Google. La identidad
--    OAuth crea su propia cuenta; el enlace explícito queda para una revisión posterior.
-- 2. El alta OAuth respeta `app.ajuste.registro_modo` (abierto/aprobación/cerrado), igual que el alta
--    con contraseña.
-- 3. La baja elimina también `app.oauth_identidad`; antes quedaba el correo y la identidad del
--    proveedor en la base.

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
  v_modo text;
  v_paquete text;
begin
  if p_proveedor <> 'google' then raise exception 'PROVEEDOR_NO_VALIDO'; end if;
  if p_sujeto is null or length(btrim(p_sujeto)) < 3 then raise exception 'SUJETO_NO_VALIDO'; end if;
  if p_correo is null or position('@' in p_correo) = 0 then raise exception 'CORREO_NO_VALIDO'; end if;

  select user_id into v_user
    from app.oauth_identidad
   where proveedor = p_proveedor and sujeto = p_sujeto;
  if v_user is not null then
    select estado into v_estado from app.usuario where user_id = v_user;
    if v_estado is distinct from 'activo' then raise exception 'CUENTA_NO_ACTIVA'; end if;
    return v_user;
  end if;

  select valor into v_modo from app.ajuste where clave = 'registro_modo';
  select valor into v_paquete from app.ajuste where clave = 'paquete_por_defecto';
  if v_modo = 'abierto' then
    insert into app.usuario (user_id, rol, paquete, estado, activo, nombre_visible)
    values (p_user_id, 'usuario', v_paquete, 'activo', true,
            left(coalesce(nullif(btrim(p_nombre), ''), split_part(p_correo, '@', 1)), 120));
  elsif v_modo = 'aprobacion' then
    insert into app.usuario (user_id, rol, paquete, estado, activo, nombre_visible)
    values (p_user_id, 'usuario', v_paquete, 'pendiente', false,
            left(coalesce(nullif(btrim(p_nombre), ''), split_part(p_correo, '@', 1)), 120));
  else
    raise exception 'REGISTRO_SOLO_CON_INVITACION';
  end if;

  insert into app.oauth_identidad (proveedor, sujeto, user_id, correo)
  values (p_proveedor, p_sujeto, p_user_id, lower(btrim(p_correo)));
  return p_user_id;
end;
$$;

revoke execute on function app.alta_cuenta_oauth(text, text, text, text, text) from public;
grant execute on function app.alta_cuenta_oauth(text, text, text, text, text) to facylf_app;

create or replace function app.baja_usuario(p_usuario text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path to 'app', 'pg_temp'
as $$
begin
  if not exists (select 1 from app.usuario where user_id = p_usuario) then raise exception 'USUARIO_NO_EXISTE'; end if;
  if exists (select 1 from app.usuario where user_id = p_usuario and rol = 'administrador')
     and (select count(*) from app.usuario where rol = 'administrador' and activo) <= 1 then
    raise exception 'ULTIMO_ADMINISTRADOR';
  end if;
  delete from app.oauth_identidad where user_id = p_usuario;
  delete from app.favorito where user_id = p_usuario;
  delete from app.preferencia_aviso where user_id = p_usuario;
  delete from app.suscripcion_push where user_id = p_usuario;
  delete from app.notificacion where user_id = p_usuario;
  delete from app.usuario_capacidad where user_id = p_usuario;
  delete from app.sesion where user_id = p_usuario;
  delete from app.credencial where user_id = p_usuario;
  update app.usuario set estado = 'baja', activo = false, nombre_visible = null, invitacion = null, ultimo_acceso = null,
                         notas = left('baja ' || to_char(now(), 'YYYY-MM-DD') || coalesce(': ' || p_motivo, ''), 200)
   where user_id = p_usuario;
end;
$$;

revoke execute on function app.baja_usuario(text, text) from public;
grant execute on function app.baja_usuario(text, text) to facylf_app;
