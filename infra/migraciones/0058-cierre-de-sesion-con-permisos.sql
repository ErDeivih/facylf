-- 0058 · Cerrar sesión y limpiar caducadas con los permisos de su dueño.
--
-- 0057 dejó `app.cierra_sesion()` y `app.limpia_sesiones()` como funciones de invocador, pero
-- `facylf_app` no tiene DELETE directo sobre `app.sesion` (a propósito: el token y las sesiones sólo
-- se tocan por función). Sin esto, el cierre de sesión habría fallado con «permission denied» la
-- primera vez que alguien pulsara «Cerrar sesión». Se recrean con `security definer` y el mismo
-- cuerpo; la concesión de EXECUTE se conserva al ser la misma función (mismo OID).
--
-- Reversión: volver a crear ambas con `security definer` quitado (no tiene sentido deshacerlo).

create or replace function app.cierra_sesion(p_token_sha text)
returns boolean language sql security definer set search_path = app, pg_temp as $$
  with d as (delete from app.sesion where token_sha = p_token_sha returning 1)
  select exists (select 1 from d)
$$;

create or replace function app.limpia_sesiones() returns integer language plpgsql security definer
set search_path = app, pg_temp as $$
declare n integer;
begin
  delete from app.sesion where expira_en < now();
  get diagnostics n = row_count;
  return n;
end $$;
