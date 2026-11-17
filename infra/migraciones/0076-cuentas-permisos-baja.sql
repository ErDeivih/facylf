-- 0076 · Cerrar la ejecución pública de la baja y revocar sesiones al cambiar contraseña.
revoke all on function app.baja_usuario(text, text) from public;
grant execute on function app.baja_usuario(text, text) to facylf_app;

create or replace function app.cambia_contrasena(p_usuario text, p_hash text) returns void
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  if p_hash is null or length(p_hash) < 20 then raise exception 'HASH_NO_VALIDO'; end if;
  update app.credencial set password_hash = p_hash, actualizado_en = now() where user_id = p_usuario;
  if not found then raise exception 'CREDENCIAL_NO_EXISTE'; end if;
  delete from app.sesion where user_id = p_usuario;
end $$;
revoke all on function app.cambia_contrasena(text, text) from public;
grant execute on function app.cambia_contrasena(text, text) to facylf_app;
