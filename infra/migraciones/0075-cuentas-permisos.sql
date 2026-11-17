-- 0075 · Funciones de cuenta que necesitan permisos de dueño: cambio de contraseña y baja completa.
create or replace function app.hash_credencial(p_usuario text) returns text
language sql security definer set search_path = app, pg_temp as $$
  select password_hash from app.credencial where user_id = p_usuario
$$;
revoke all on function app.hash_credencial(text) from public;
grant execute on function app.hash_credencial(text) to facylf_app;

create or replace function app.cambia_contrasena(p_usuario text, p_hash text) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if p_hash is null or length(p_hash) < 20 then raise exception 'HASH_NO_VALIDO'; end if;
  update app.credencial set password_hash = p_hash, actualizado_en = now() where user_id = p_usuario;
  if not found then raise exception 'CREDENCIAL_NO_EXISTE'; end if;
end $$;
revoke all on function app.cambia_contrasena(text, text) from public;
grant execute on function app.cambia_contrasena(text, text) to facylf_app;

create or replace function app.baja_usuario(p_usuario text, p_motivo text default null) returns void language plpgsql as $$
begin
  if not exists (select 1 from app.usuario where user_id = p_usuario) then raise exception 'USUARIO_NO_EXISTE'; end if;
  if exists (select 1 from app.usuario where user_id = p_usuario and rol = 'administrador')
     and (select count(*) from app.usuario where rol = 'administrador' and activo) <= 1 then
    raise exception 'ULTIMO_ADMINISTRADOR';
  end if;
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
end $$;
alter function app.baja_usuario(text, text) security definer set search_path = app, pg_temp;
grant execute on function app.baja_usuario(text, text) to facylf_app;
