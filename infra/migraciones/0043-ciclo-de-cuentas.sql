-- 0043 · Ciclo de cuentas completo: invitar, registrarse, esperar aprobación, aprobar o rechazar, bloquear,
-- caducar, recuperar la contraseña sin dar pistas, y doble verificación obligatoria para administradores.
--
-- Revisado el 23/10/2026 sobre 0027/0031/0037 y docs/plataforma-web/codigo/auth.ts. Faltaba:
--   1. Crear invitaciones desde el panel (código fuerte, caducidad, opcionalmente atada a un correo) y anularlas.
--      Una invitación atada a un correo sólo vale para ese correo (no se puede reenviar a otro).
--   2. Rechazar a un pendiente con motivo, y avisar al usuario cuando se le aprueba (bandeja + correo).
--   3. Bloqueo por cuenta tras muchas contraseñas fallidas: Better Auth limita por IP, pero un ataque desde
--      muchas IP contra una cuenta no se frenaba. Se guarda sólo el resumen SHA-256 del correo (nunca el correo).
--   4. `app.estado_acceso(user)`: UNA consulta por petición (clave primaria) que dice a la web qué hacer:
--      ok · pendiente · rechazado · bloqueado · baja · caducado · sin_alta · requiere_2fa.
--   5. Vigilancia: administradores sin doble verificación, pendientes que llevan días esperando, cuentas
--      bloqueadas por intentos.

-- ── 1. Invitaciones ─────────────────────────────────────────────────────────────────────────────────
alter table app.invitacion
  add column if not exists correo_sha text,                 -- sha256(lower(correo)); NULL = cualquiera
  add column if not exists anulada_en timestamptz;
alter table app.usuario add column if not exists motivo_estado text;

-- Correo → resumen (minúsculas y sin espacios). Lo usa también el bloqueo por intentos.
create or replace function app.sha_correo(p_correo text) returns text language sql immutable parallel safe as $$
  select case when p_correo is null or btrim(p_correo) = '' then null
              else encode(sha256(convert_to(lower(btrim(p_correo)), 'UTF8')), 'hex') end
$$;

-- Código de 20 caracteres sin letras confusas (0/O, 1/l/I), en grupos de 5: «K7QF-M2XR-…».
create or replace function app.nuevo_codigo_invitacion() returns text language sql volatile as $$
  select string_agg(substr(s, i, 5), '-')
    from (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, k) % 31), 1), '' order by k) s
            from (select uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()) b) x,
                 generate_series(0, 19) k) y,
         generate_series(1, 16, 5) i
$$;

create or replace function app.crea_invitacion(p_admin text, p_paquete text, p_usos integer default 1,
                                               p_dias integer default 14, p_correo text default null, p_nota text default null)
returns text language plpgsql as $$
declare v text;
begin
  if not app.puede(p_admin, 'administrar_usuarios') then raise exception 'SIN_PERMISO'; end if;
  if not exists (select 1 from app.paquete where codigo = p_paquete and activo) then raise exception 'PAQUETE_NO_EXISTE'; end if;
  if p_usos is null or p_usos < 1 or p_usos > 500 then raise exception 'USOS_NO_VALIDOS'; end if;
  if p_correo is not null and p_usos <> 1 then raise exception 'INVITACION_PERSONAL_DE_UN_USO'; end if;
  if p_correo is not null and p_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'CORREO_NO_VALIDO'; end if;
  v := app.nuevo_codigo_invitacion();
  insert into app.invitacion (codigo, creada_por, paquete, usos_max, caduca_en, nota, correo_sha)
  values (v, p_admin, p_paquete, p_usos, case when p_dias is null then null else now() + make_interval(days => p_dias) end,
          left(p_nota, 200), app.sha_correo(p_correo));
  return v;
end $$;

create or replace function app.anula_invitacion(p_admin text, p_codigo text) returns boolean language plpgsql as $$
begin
  if not app.puede(p_admin, 'administrar_usuarios') then raise exception 'SIN_PERMISO'; end if;
  update app.invitacion set anulada_en = now() where codigo = p_codigo and anulada_en is null;
  return found;
end $$;

-- ── 2. Alta (sustituye a la de 0031: ahora con el correo, para invitaciones personales y anuladas) ─────
create or replace function app.alta_usuario(p_user_id text, p_codigo text, p_nombre text, p_correo text)
returns text language plpgsql as $$
declare v_modo text; v_inv app.invitacion; v_paquete text;
begin
  select valor into v_modo from app.ajuste where clave = 'registro_modo';
  select valor into v_paquete from app.ajuste where clave = 'paquete_por_defecto';
  if p_codigo is not null and btrim(p_codigo) <> '' then
    select * into v_inv from app.invitacion where codigo = upper(btrim(p_codigo)) for update;
    if v_inv.codigo is null or v_inv.anulada_en is not null then raise exception 'INVITACION_NO_EXISTE'; end if;
    if v_inv.caduca_en is not null and v_inv.caduca_en < now() then raise exception 'INVITACION_CADUCADA'; end if;
    if v_inv.usos >= v_inv.usos_max then raise exception 'INVITACION_AGOTADA'; end if;
    if v_inv.correo_sha is not null and v_inv.correo_sha is distinct from app.sha_correo(p_correo) then
      raise exception 'INVITACION_DE_OTRO_CORREO';
    end if;
    update app.invitacion set usos = usos + 1 where codigo = v_inv.codigo;
    insert into app.usuario (user_id, rol, paquete, activo, estado, nombre_visible, invitacion)
    values (p_user_id, 'usuario', v_inv.paquete, true, 'activo', left(btrim(p_nombre), 60), v_inv.codigo)
    on conflict (user_id) do nothing;
    return 'activo';
  end if;
  if v_modo = 'abierto' then
    insert into app.usuario (user_id, paquete, activo, estado, nombre_visible) values (p_user_id, v_paquete, true, 'activo', left(btrim(p_nombre), 60))
    on conflict (user_id) do nothing;
    return 'activo';
  elsif v_modo = 'aprobacion' then
    insert into app.usuario (user_id, paquete, activo, estado, nombre_visible) values (p_user_id, v_paquete, false, 'pendiente', left(btrim(p_nombre), 60))
    on conflict (user_id) do nothing;
    return 'pendiente';
  else
    raise exception 'REGISTRO_SOLO_CON_INVITACION';
  end if;
end $$;
-- La firma antigua (3 argumentos) sigue funcionando: sin correo.
create or replace function app.alta_usuario(p_user_id text, p_codigo text default null, p_nombre text default null)
returns text language sql as $$ select app.alta_usuario(p_user_id, p_codigo, p_nombre, null::text) $$;

-- ── 3. Aprobar, rechazar, bloquear, reactivar (con aviso al usuario) ─────────────────────────────────
alter table app.usuario drop constraint if exists usuario_estado_check;
alter table app.usuario add constraint usuario_estado_check check (estado in ('pendiente', 'activo', 'bloqueado', 'baja', 'rechazado'));

create or replace function app.aprueba_usuario(p_user_id text, p_admin text, p_paquete text default null)
returns void language plpgsql as $$
begin
  if not app.puede(p_admin, 'administrar_usuarios') then raise exception 'SIN_PERMISO'; end if;
  update app.usuario set estado = 'activo', activo = true, motivo_estado = null,
         paquete = coalesce(p_paquete, paquete), notas = coalesce(notas || E'\n', '') || 'aprobado por ' || p_admin || ' el ' || now()::date
   where user_id = p_user_id and estado in ('pendiente', 'rechazado');
  if found then
    insert into app.notificacion (user_id, tipo, clave, titulo, cuerpo, url)
    values (p_user_id, 'cuenta', 'cuenta:aprobada', 'Tu cuenta está aprobada', 'Ya puedes usar facylf. Empieza guardando tus equipos.', '/')
    on conflict (user_id, clave) do nothing;
  end if;
end $$;

create or replace function app.cambia_estado_usuario(p_admin text, p_user_id text, p_estado text, p_motivo text default null)
returns void language plpgsql as $$
declare v app.usuario;
begin
  if not app.puede(p_admin, 'administrar_usuarios') then raise exception 'SIN_PERMISO'; end if;
  if p_estado not in ('rechazado', 'bloqueado', 'activo') then raise exception 'ESTADO_NO_VALIDO'; end if;
  if p_admin = p_user_id and p_estado <> 'activo' then raise exception 'NO_A_UNO_MISMO'; end if;
  select * into v from app.usuario where user_id = p_user_id for update;
  if v.user_id is null then raise exception 'USUARIO_NO_EXISTE'; end if;
  if v.estado = 'baja' then raise exception 'USUARIO_DADO_DE_BAJA'; end if;
  if p_estado = 'rechazado' and v.estado <> 'pendiente' then raise exception 'SOLO_PENDIENTES'; end if;
  if p_estado <> 'activo' and v.rol = 'administrador'
     and (select count(*) from app.usuario where rol = 'administrador' and activo) <= 1 then
    raise exception 'ULTIMO_ADMINISTRADOR';
  end if;
  if p_estado in ('rechazado', 'bloqueado') and (p_motivo is null or length(btrim(p_motivo)) < 3) then
    raise exception 'FALTA_MOTIVO';
  end if;
  update app.usuario set estado = p_estado, activo = (p_estado = 'activo'),
         motivo_estado = case when p_estado = 'activo' then null else left(btrim(p_motivo), 200) end,
         notas = left(coalesce(notas || E'\n', '') || p_estado || ' por ' || p_admin || ' el ' || now()::date, 2000)
   where user_id = p_user_id;
  -- Bloquear corta las sesiones abiertas (tabla de Better Auth, si existe).
  if p_estado <> 'activo' and to_regclass('auth.session') is not null then
    execute 'delete from auth.session where "userId" = $1' using p_user_id;
  end if;
end $$;

-- ── 4. Bloqueo por cuenta tras contraseñas fallidas ───────────────────────────────────────────────────
create table if not exists app.intento_entrada (
  correo_sha text        not null,
  en         timestamptz not null default now(),
  ok         boolean     not null
);
create index if not exists intento_entrada_idx on app.intento_entrada (correo_sha, en desc);
insert into ops.parametro (clave, valor, descripcion) values
  ('entrada_fallos_bloqueo', 8, 'Contraseñas fallidas seguidas de una cuenta (en la ventana) que la frenan'),
  ('entrada_ventana_min', 15, 'Minutos de la ventana y del freno por contraseñas fallidas'),
  ('pendiente_dias_aviso', 3, 'Días esperando aprobación que avisan en la vigilancia')
on conflict (clave) do nothing;

-- Lo llama la web después de cada intento (también si el correo no existe: así no se distingue).
create or replace function app.anota_entrada(p_correo text, p_ok boolean) returns void language sql as $$
  insert into app.intento_entrada (correo_sha, ok) select app.sha_correo(p_correo), p_ok where p_correo is not null;
$$;

-- Segundos que faltan para poder volver a intentarlo (0 = adelante). Fallos seguidos dentro de la ventana,
-- contados desde el último acierto. La web lo pregunta ANTES de comprobar la contraseña.
create or replace function app.espera_entrada(p_correo text) returns integer language sql stable as $$
  with v as (select coalesce(ops.p('entrada_ventana_min'), 15) * interval '1 minute' as ventana,
                    coalesce(ops.p('entrada_fallos_bloqueo'), 8)::int as tope),
  f as (select i.en from app.intento_entrada i, v
         where i.correo_sha = app.sha_correo(p_correo) and i.en > now() - v.ventana and not i.ok
           and i.en > coalesce((select max(en) from app.intento_entrada o where o.correo_sha = i.correo_sha and o.ok), '-infinity'))
  select case when (select count(*) from f) >= (select tope from v)
              then greatest(1, ceil(extract(epoch from ((select max(en) from f) + (select ventana from v) - now()))))::int
              else 0 end
$$;

-- ── 5. Qué hacer con esta sesión (una consulta por petición) ─────────────────────────────────────────
create or replace function app.estado_acceso(p_usuario text, p_con_2fa boolean default null)
returns table (estado text, rol text, paquete text, motivo text, dias_para_caducar integer)
language sql stable as $$
  select case
           when u.user_id is null then 'sin_alta'
           when u.estado = 'baja' then 'baja'
           when u.estado = 'pendiente' then 'pendiente'
           when u.estado = 'rechazado' then 'rechazado'
           when u.estado = 'bloqueado' or not u.activo then 'bloqueado'
           when u.valido_hasta is not null and u.valido_hasta < current_date then 'caducado'
           when u.rol = 'administrador' and p_con_2fa is false then 'requiere_2fa'
           else 'ok' end,
         u.rol, u.paquete,
         case when u.estado in ('rechazado', 'bloqueado') then u.motivo_estado end,
         case when u.valido_hasta is not null then (u.valido_hasta - current_date) end
    from (select p_usuario as id) x left join app.usuario u on u.user_id = x.id
$$;

-- Aviso de caducidad (7 y 1 días antes) en la bandeja: lo llama el generador de avisos una vez al día.
create or replace function app.avisa_caducidades() returns integer language plpgsql as $$
declare n integer;
begin
  insert into app.notificacion (user_id, tipo, clave, titulo, cuerpo, url)
  select u.user_id, 'cuenta', 'caduca:' || u.valido_hasta || ':' || (u.valido_hasta - current_date),
         case when u.valido_hasta = current_date + 1 then 'Tu acceso caduca mañana' else 'Tu acceso caduca en 7 días' end,
         'Tu paquete ' || coalesce(p.nombre, u.paquete) || ' vence el ' || to_char(u.valido_hasta, 'DD/MM/YYYY') || '. Escribe al administrador para renovarlo.',
         '/cuenta'
    from app.usuario u left join app.paquete p on p.codigo = u.paquete
   where u.estado = 'activo' and u.valido_hasta in (current_date + 7, current_date + 1)
  on conflict (user_id, clave) do nothing;
  get diagnostics n = row_count; return n;
end $$;

-- ── 6. Vigilancia de cuentas (se suma a ops.chequeos con su propio nombre) ───────────────────────────
create or replace function ops.chequeos_cuentas()
returns table (nombre text, area text, estado text, valor numeric, umbral numeric, detalle jsonb)
language plpgsql stable as $$
#variable_conflict use_column
declare v numeric; d jsonb;
begin
  v := 0; d := '[]';
  if to_regclass('auth."user"') is not null then
    execute $q$select count(*), coalesce(jsonb_agg(u.user_id), '[]') from app.usuario u
                join auth."user" a on a.id = u.user_id
               where u.rol = 'administrador' and u.activo and not coalesce(a."twoFactorEnabled", false)$q$ into v, d;
  end if;
  return query select 'administradores_sin_2fa', 'cuentas', case when v > 0 then 'fallo' else 'ok' end, v, 0::numeric, jsonb_build_object('usuarios', d);

  select count(*) into v from app.usuario
   where estado = 'pendiente' and creado_en < now() - coalesce(ops.p('pendiente_dias_aviso'), 3) * interval '1 day';
  return query select 'pendientes_esperando', 'cuentas', case when v > 0 then 'aviso' else 'ok' end, v, 0::numeric, '{}'::jsonb;

  select count(distinct correo_sha) into v from app.intento_entrada i
   where not ok and en > now() - interval '1 hour' and app.espera_entrada_sha(i.correo_sha) > 0;
  return query select 'cuentas_frenadas', 'cuentas', case when v >= 3 then 'aviso' when v > 0 then 'info' else 'ok' end, v, 3::numeric, '{}'::jsonb;
end $$;

create or replace function app.espera_entrada_sha(p_sha text) returns integer language sql stable as $$
  with v as (select coalesce(ops.p('entrada_ventana_min'), 15) * interval '1 minute' as ventana,
                    coalesce(ops.p('entrada_fallos_bloqueo'), 8)::int as tope),
  f as (select i.en from app.intento_entrada i, v
         where i.correo_sha = p_sha and i.en > now() - v.ventana and not i.ok
           and i.en > coalesce((select max(en) from app.intento_entrada o where o.correo_sha = p_sha and o.ok), '-infinity'))
  select case when (select count(*) from f) >= (select tope from v) then 1 else 0 end
$$;

-- ops.chequeos() = datos ∪ plataforma ∪ cuentas
create or replace function ops.chequeos()
returns table (nombre text, area text, estado text, valor numeric, umbral numeric, detalle jsonb)
language sql stable as $$
  select * from ops.chequeos_datos() union all select * from ops.chequeos_plataforma() union all select * from ops.chequeos_cuentas()
$$;

-- Purga: intentos de entrada de más de 30 días.
create or replace function ops.purga_cuentas() returns jsonb language plpgsql as $$
declare n integer;
begin
  delete from app.intento_entrada where en < now() - interval '30 days'; get diagnostics n = row_count;
  return jsonb_build_object('intentos_entrada', n);
end $$;
-- ops.purga() = datos || plataforma || uso (0039) || cuentas
create or replace function ops.purga() returns jsonb language sql as $$
  select ops.purga_datos() || ops.purga_plataforma() || ops.purga_uso() || ops.purga_cuentas()
$$;

-- ── 7. Permisos ───────────────────────────────────────────────────────────────────────────────────────
grant select (motivo_estado) on app.usuario to facylf_app;
grant execute on function app.sha_correo(text), app.crea_invitacion(text, text, integer, integer, text, text),
  app.anula_invitacion(text, text), app.alta_usuario(text, text, text, text), app.alta_usuario(text, text, text),
  app.aprueba_usuario(text, text, text), app.cambia_estado_usuario(text, text, text, text),
  app.anota_entrada(text, boolean), app.espera_entrada(text), app.estado_acceso(text, boolean) to facylf_app;
grant execute on function app.avisa_caducidades(), ops.chequeos_cuentas(), app.espera_entrada_sha(text), ops.purga_cuentas() to facylf_publicador;
-- Funciones que escriben en tablas donde la web no tiene permiso directo: security definer con comprobación dentro.
alter function app.crea_invitacion(text, text, integer, integer, text, text) security definer set search_path = app, ops, public, pg_temp;
alter function app.anula_invitacion(text, text) security definer set search_path = app, pg_temp;
alter function app.cambia_estado_usuario(text, text, text, text) security definer set search_path = app, pg_temp;
alter function app.anota_entrada(text, boolean) security definer set search_path = app, pg_temp;
alter function app.aprueba_usuario(text, text, text) security definer set search_path = app, pg_temp;
alter function app.alta_usuario(text, text, text, text) security definer set search_path = app, pg_temp;
-- El panel (facylf_app) lee el resumen de cuentas: lee auth."user" e intentos de entrada, que la web no ve.
alter function ops.chequeos_cuentas() security definer set search_path = app, ops, pg_temp;
grant execute on function ops.chequeos_cuentas() to facylf_app;
