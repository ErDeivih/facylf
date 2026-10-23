-- 0034 · Auditoría de lo que se cambia desde la administración
--
-- En una plataforma grande cada cambio hecho a mano (aprobar un usuario, cambiar su paquete, unir o separar
-- dos jugadores, fijar ascensos, descartar un caso, tocar la publicidad o un ajuste) queda registrado: quién,
-- cuándo, qué había antes y qué hay después. Así se puede deshacer y explicar.
--
-- Cómo sabe la base QUIÉN lo hizo: la web, en la misma transacción del cambio, hace
--   select set_config('facylf.usuario', '<user_id de la sesión>', true);
-- (true = sólo para esa transacción). Si un script cambia algo sin decir quién, queda como el rol de conexión.
-- ops.caso_dato NO se audita aquí: el detector lo refresca en cada pasada; la revisión humana ya guarda
-- revisado_por, revisado_en y nota.

create table if not exists app.auditoria (
  id         bigint generated always as identity primary key,
  en         timestamptz not null default now(),
  usuario    text        not null,
  tabla      text        not null,
  accion     text        not null check (accion in ('insert', 'update', 'delete')),
  clave      text,
  antes      jsonb,
  despues    jsonb
);
create index if not exists auditoria_fecha_idx on app.auditoria (en desc);
create index if not exists auditoria_tabla_idx on app.auditoria (tabla, clave, en desc);

create or replace function app.audita() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_usuario text := coalesce(nullif(current_setting('facylf.usuario', true), ''), session_user::text);
        v_antes jsonb; v_despues jsonb; v_clave text;
begin
  if tg_op <> 'INSERT' then v_antes := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_despues := to_jsonb(new); end if;
  v_clave := coalesce(v_despues, v_antes) ->> coalesce(tg_argv[0], 'id');
  -- Nunca se guardan secretos: ni contraseñas ni claves de suscripción push.
  v_antes := v_antes - 'p256dh' - 'auth'; v_despues := v_despues - 'p256dh' - 'auth';
  -- Entrar en la web actualiza ultimo_acceso: eso no es un cambio de administración.
  if tg_op = 'UPDATE' and (v_antes - 'ultimo_acceso') = (v_despues - 'ultimo_acceso') then return new; end if;
  insert into app.auditoria (usuario, tabla, accion, clave, antes, despues)
  values (v_usuario, tg_table_schema || '.' || tg_table_name, lower(tg_op), v_clave, v_antes, v_despues);
  return coalesce(new, old);
end $$;

do $$
declare t record;
begin
  for t in select * from (values
      ('app', 'usuario', 'user_id'), ('app', 'usuario_capacidad', 'user_id'), ('app', 'invitacion', 'codigo'),
      ('app', 'ajuste', 'clave'), ('app', 'espacio_anuncio', 'codigo'), ('app', 'campana_anuncio', 'id'),
      ('core', 'identity_decision', 'id'), ('core', 'reglamento_grupo', 'id'),
      ('ops', 'parametro', 'clave'), ('analytics', 'parametro_sancion', 'federation_id'),
      ('analytics', 'parametro_capacidad', 'clave')) v(esquema, tabla, clave)
  loop
    if to_regclass(t.esquema || '.' || t.tabla) is not null then
      execute format('drop trigger if exists audita on %I.%I', t.esquema, t.tabla);
      execute format('create trigger audita after insert or update or delete on %I.%I for each row execute function app.audita(%L)',
                     t.esquema, t.tabla, t.clave);
    end if;
  end loop;
end $$;

grant select on app.auditoria to facylf_app;       -- la pantalla de administración la enseña (sólo administradores)
