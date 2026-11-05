-- 0057 · Cuentas propias: credenciales, sesiones y favorito de equipo por inscripción.
--
-- Contexto (WALL, objetivo 7). Hasta hoy el alta de usuarios dependía de Better Auth: la web llamaba a
-- `app.alta_usuario()` con el id que creaba Better Auth y las contraseñas y sesiones vivían en el
-- esquema `auth`. Better Auth no está instalado y el registro tiene que funcionar ya, dentro de lo que
-- existe. Esta migración añade sólo lo imprescindible y NO toca 0027/0031/0037/0043:
--
--   1. `app.credencial`: correo normalizado y hash de contraseña (scrypt lo calcula la web; aquí sólo
--      se guarda). Una fila por usuario; el correo es único.
--   2. `app.sesion`: token de sesión guardado **hasheado** (SHA-256, calculado en la web), usuario,
--      caducidad y último uso. Nunca se guarda el token en claro.
--   3. Funciones con `security definer` para que `facylf_app` no necesite permisos directos sobre las
--      dos tablas nuevas: alta de cuenta, lectura de credencial, crear/validar/cerrar sesión, limpiar
--      caducadas y los dos envoltorios de favorito de equipo (la ficha usa `team_entry.id` pero
--      `app.guarda_favorito` guarda la línea a partir de `team_season.id`).
--   4. Arregla un permiso que faltaba desde 0043: `app.espera_entrada()` consultaba
--      `app.intento_entrada` como invocador y `facylf_app` no tiene SELECT ahí, así que el freno de
--      intentos habría fallado en producción. Pasa a `security definer` con el mismo cuerpo.
--   5. `ops.purga_cuentas()` borra también sesiones caducadas.
--
-- Reversión manual (esta migración no la aplica sola; se deja escrita para poder deshacerla):
--   drop function if exists app.guarda_favorito_equipo(text, bigint, text);
--   drop function if exists app.es_favorito_equipo(text, bigint);
--   drop function if exists app.limpia_sesiones();
--   drop function if exists app.cierra_sesion(text);
--   drop function if exists app.sesion_valida(text);
--   drop function if exists app.crea_sesion(text, text, integer);
--   drop function if exists app.credencial_por_correo(text);
--   drop function if exists app.alta_cuenta(text, text, text, text, text);
--   drop function if exists app.modo_registro();
--   drop table if exists app.sesion;
--   drop table if exists app.credencial;
--   (y reponer `app.espera_entrada` y `ops.purga_cuentas` con el cuerpo de 0043)
--
-- Depende de: 0027 (app.usuario, rol facylf_app), 0031 (app.ajuste, app.favorito), 0037
-- (app.guarda_favorito), 0043 (app.intento_entrada, app.anota_entrada, app.espera_entrada).

-- ── 1. Credenciales ──────────────────────────────────────────────────────────────────────────────────
create table if not exists app.credencial (
  user_id       text primary key references app.usuario(user_id) on delete cascade,
  correo        text not null check (correo = lower(btrim(correo)) and length(correo) between 3 and 254),
  password_hash text not null check (length(password_hash) between 20 and 500),
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists credencial_correo_uq on app.credencial (correo);

-- ── 2. Sesiones ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists app.sesion (
  id           bigint generated always as identity primary key,
  token_sha    text   not null unique check (token_sha ~ '^[0-9a-f]{64}$'),
  user_id      text   not null references app.usuario(user_id) on delete cascade,
  creada_en    timestamptz not null default now(),
  expira_en    timestamptz not null,
  ultimo_uso_en timestamptz not null default now()
);
create index if not exists sesion_usuario_idx on app.sesion (user_id, creada_en desc);
create index if not exists sesion_expira_idx on app.sesion (expira_en);

-- ── 3. Funciones de cuenta y sesión ──────────────────────────────────────────────────────────────────

-- El modo vigente lo lee la pantalla de entrada para redactar el alta (invitación o aprobación).
create or replace function app.modo_registro() returns text language sql stable as $$
  select valor from app.ajuste where clave = 'registro_modo'
$$;

-- Credencial por correo, para verificar la contraseña en la web. Devuelve el hash SÓLO al servidor;
-- nunca se envía al navegador. `facylf_app` no tiene SELECT directo sobre la tabla.
create or replace function app.credencial_por_correo(p_correo text)
returns table (user_id text, password_hash text, estado text, activo boolean, valido_hasta date,
               nombre_visible text, rol text, paquete text)
language sql stable security definer set search_path = app, pg_temp as $$
  select c.user_id, c.password_hash, u.estado, u.activo, u.valido_hasta, u.nombre_visible, u.rol, u.paquete
    from app.credencial c
    join app.usuario u on u.user_id = c.user_id
   where c.correo = lower(btrim(coalesce(p_correo, '')))
$$;

-- Alta completa: reutiliza `app.alta_usuario` (invitación, aprobación o abierto; 0043) y guarda la
-- credencial en la MISMA transacción. Si algo falla, no queda ni usuario ni invitación consumida.
create or replace function app.alta_cuenta(p_user_id text, p_correo text, p_password_hash text,
                                            p_codigo text, p_nombre text)
returns text language plpgsql security definer set search_path = app, pg_temp as $$
declare
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_estado text;
begin
  if p_user_id is null or length(btrim(p_user_id)) not between 8 and 100 then
    raise exception 'CUENTA_NO_VALIDA';
  end if;
  if length(v_correo) not between 3 and 254 or v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'CORREO_NO_VALIDO';
  end if;
  if p_password_hash is null or length(p_password_hash) not between 20 and 500 then
    raise exception 'CONTRASENA_NO_VALIDA';
  end if;
  v_estado := app.alta_usuario(p_user_id, p_codigo, p_nombre, v_correo);
  insert into app.credencial (user_id, correo, password_hash) values (p_user_id, v_correo, p_password_hash);
  return v_estado;
exception
  when unique_violation then
    raise exception 'CORREO_YA_REGISTRADO';
end $$;

-- Crea una sesión y devuelve su caducidad. Limpia caducadas y deja como mucho 20 por usuario.
create or replace function app.crea_sesion(p_user_id text, p_token_sha text, p_horas integer default 168)
returns timestamptz language plpgsql security definer set search_path = app, pg_temp as $$
declare v_expira timestamptz;
begin
  if p_token_sha !~ '^[0-9a-f]{64}$' then raise exception 'TOKEN_NO_VALIDO'; end if;
  delete from app.sesion where expira_en < now();
  delete from app.sesion where id in (
    select id from app.sesion where user_id = p_user_id order by creada_en desc offset 19
  );
  insert into app.sesion (token_sha, user_id, expira_en)
  values (p_token_sha, p_user_id, now() + make_interval(hours => greatest(1, least(720, coalesce(p_horas, 168)))))
  returning expira_en into v_expira;
  update app.usuario set ultimo_acceso = now() where user_id = p_user_id;
  return v_expira;
end $$;

-- Sesión válida: token vigente y cuenta activa y no caducada. Toca `ultimo_uso_en` como mucho cada
-- 5 minutos, no en cada petición.
create or replace function app.sesion_valida(p_token_sha text)
returns table (user_id text, nombre_visible text, rol text, paquete text, expira_en timestamptz)
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  update app.sesion s set ultimo_uso_en = now()
   where s.token_sha = p_token_sha and s.expira_en > now()
     and s.ultimo_uso_en < now() - interval '5 minutes';
  return query
    select s.user_id, u.nombre_visible, u.rol, u.paquete, s.expira_en
      from app.sesion s
      join app.usuario u on u.user_id = s.user_id
     where s.token_sha = p_token_sha and s.expira_en > now()
       and u.estado = 'activo' and u.activo
       and (u.valido_hasta is null or u.valido_hasta >= current_date);
end $$;

create or replace function app.cierra_sesion(p_token_sha text) returns boolean language sql as $$
  with d as (delete from app.sesion where token_sha = p_token_sha returning 1)
  select exists (select 1 from d)
$$;

create or replace function app.limpia_sesiones() returns integer language plpgsql as $$
declare n integer;
begin
  delete from app.sesion where expira_en < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 4. Arreglo del freno de intentos (0043) ──────────────────────────────────────────────────────────
-- Mismo cuerpo que 0043, pero ejecutado con los permisos de su dueño: `facylf_app` no tiene SELECT
-- sobre `app.intento_entrada` y la función habría fallado con «permission denied» en cada entrada.
create or replace function app.espera_entrada(p_correo text)
returns integer language sql stable security definer set search_path = app, ops, pg_temp as $$
  with v as (select coalesce(ops.p('entrada_ventana_min'), 15) * interval '1 minute' as ventana,
                    coalesce(ops.p('entrada_fallos_bloqueo'), 8)::int as tope),
  f as (select i.en from app.intento_entrada i, v
         where i.correo_sha = app.sha_correo(p_correo) and i.en > now() - v.ventana and not i.ok
           and i.en > coalesce((select max(en) from app.intento_entrada o where o.correo_sha = i.correo_sha and o.ok), '-infinity'))
  select case when (select count(*) from f) >= (select tope from v)
              then greatest(1, ceil(extract(epoch from ((select max(en) from f) + (select ventana from v) - now()))))::int
              else 0 end
$$;

-- ── 5. Favorito de equipo por inscripción ────────────────────────────────────────────────────────────
-- La ficha de equipo usa `team_entry.id`, pero `app.guarda_favorito` guarda la LÍNEA a partir de
-- `team_season.id`. Estas dos funciones hacen la traducción en el servidor (nunca el cliente).
create or replace function app.guarda_favorito_equipo(p_usuario text, p_team_entry bigint, p_etiqueta text)
returns bigint language plpgsql security definer set search_path = app, pg_temp as $$
declare v_ts bigint;
begin
  select ts.team_season_id into v_ts from core.team_entry ts where ts.id = p_team_entry;
  if v_ts is null then raise exception 'EQUIPO_NO_EXISTE'; end if;
  return app.guarda_favorito(p_usuario, 'equipo', v_ts, p_etiqueta, null);
end $$;

create or replace function app.es_favorito_equipo(p_usuario text, p_team_entry bigint)
returns bigint language sql stable security definer set search_path = app, pg_temp as $$
  select app.es_favorito(p_usuario, 'equipo', (select ts.team_season_id from core.team_entry ts where ts.id = p_team_entry))
$$;

-- ── 6. Purga de sesiones caducadas ───────────────────────────────────────────────────────────────────
create or replace function ops.purga_cuentas() returns jsonb language plpgsql as $$
declare n integer; s integer;
begin
  delete from app.intento_entrada where en < now() - interval '30 days';
  get diagnostics n = row_count;
  delete from app.sesion where expira_en < now();
  get diagnostics s = row_count;
  return jsonb_build_object('intentos_entrada', n, 'sesiones', s);
end $$;

-- ── 7. Permisos ──────────────────────────────────────────────────────────────────────────────────────
-- `facylf_app` no recibe SELECT/INSERT directo sobre credencial y sesión: sólo puede llamar a las
-- funciones de arriba, que son security definer. Así la contraseña y los tokens no son accesibles
-- desde una consulta cualquiera.
grant execute on function app.modo_registro(),
  app.credencial_por_correo(text),
  app.alta_cuenta(text, text, text, text, text),
  app.crea_sesion(text, text, integer),
  app.sesion_valida(text),
  app.cierra_sesion(text),
  app.limpia_sesiones(),
  app.guarda_favorito_equipo(text, bigint, text),
  app.es_favorito_equipo(text, bigint),
  app.espera_entrada(text) to facylf_app;
