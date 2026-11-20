-- 0085 · Al bloquear, rechazar o dar de baja una cuenta se cierran también sus sesiones propias.
--
-- `app.cambia_estado_usuario` ya borraba `auth.session` (Better Auth), pero la web usa `app.sesion`.
-- Sin esto, una cuenta bloqueada podía seguir usando un token ya emitido hasta siete días, y al
-- reactivarla esos tokens volvían a valer. El trigger cubre cualquier camino que cambie el estado,
-- no sólo la función administrativa actual.

create or replace function app.cierra_sesiones_si_inactiva()
returns trigger
language plpgsql
security definer
set search_path to 'app', 'pg_temp'
as $$
begin
  if new.estado <> 'activo' then
    delete from app.sesion where user_id = new.user_id;
  end if;
  return new;
end
$$;

revoke execute on function app.cierra_sesiones_si_inactiva() from public;
grant execute on function app.cierra_sesiones_si_inactiva() to facylf_app;

drop trigger if exists usuario_cierra_sesiones on app.usuario;
create trigger usuario_cierra_sesiones
  after update of estado on app.usuario
  for each row
  when (new.estado <> 'activo')
  execute function app.cierra_sesiones_si_inactiva();
