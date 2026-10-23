-- 0037 · Perfil del usuario: lo que hace la web en «Mi cuenta», en funciones probadas y con reglas claras.
--
--   · app.perfil(user)                    — una fila: datos, paquete, capacidades efectivas, preferencias, contadores
--   · app.guarda_perfil(user, nombre, zona) y app.guarda_preferencias(user, jsonb) — validan antes de guardar
--   · app.guarda_favorito / app.quita_favorito / app.reordena_favoritos / app.avisar_favorito
--   · app.marca_leidos(user, ids)         — todos o algunos
--   · app.registra_visita(user)           — último acceso, como mucho una escritura cada 5 minutos
--   · app.exporta_mis_datos(user)         — todo lo suyo en JSON (derecho de acceso y portabilidad, RGPD art. 15 y 20)
--   · app.baja_usuario(user, motivo)      — derecho de supresión (art. 17): borra lo suyo y deja la fila anonimizada
--                                            (la auditoría la referencia); Better Auth borra su cuenta aparte.
-- Todas reciben el user_id de la SESIÓN (la web nunca lo toma de la URL ni de un formulario).

-- ── 1. Lectura del perfil ─────────────────────────────────────────────────────────────────────────────
create or replace function app.perfil(p_usuario text)
returns table (user_id text, nombre text, rol text, estado text, paquete text, paquete_nombre text, valido_hasta date,
               zona_horaria text, creado_en timestamptz, capacidades text[], favoritos integer, avisos_sin_leer integer,
               dispositivos_push integer, preferencias jsonb)
language sql stable as $$
  select u.user_id, u.nombre_visible, u.rol, u.estado, u.paquete, p.nombre, u.valido_hasta, u.zona_horaria, u.creado_en,
         coalesce((select array_agg(distinct c order by c) from (
             select pc.capacidad c from app.paquete_capacidad pc where pc.paquete = u.paquete
             union select uc.capacidad from app.usuario_capacidad uc
                    where uc.user_id = u.user_id and (uc.hasta is null or uc.hasta >= current_date)
             union select ca.codigo from app.capacidad ca where u.rol = 'administrador') x), '{}'),
         (select count(*) from app.favorito f where f.user_id = u.user_id)::int,
         (select count(*) from app.notificacion n where n.user_id = u.user_id and n.leida_en is null)::int,
         (select count(*) from app.suscripcion_push s where s.user_id = u.user_id)::int,
         coalesce((select to_jsonb(pa) - 'user_id' from app.preferencia_aviso pa where pa.user_id = u.user_id),
                  jsonb_build_object('en_app', true, 'push', false, 'correo', 'resumen', 'hora_resumen', '08:00:00',
                                     'silencio_desde', null, 'silencio_hasta', null,
                                     'eventos', jsonb_build_array('programado', 'cambio_horario', 'resultado', 'acta', 'jornada_completa', 'jugador')))
    from app.usuario u left join app.paquete p on p.codigo = u.paquete
   where u.user_id = p_usuario
$$;

-- ── 2. Escrituras con validación ──────────────────────────────────────────────────────────────────────
create or replace function app.guarda_perfil(p_usuario text, p_nombre text, p_zona text)
returns void language plpgsql as $$
begin
  if p_nombre is not null and (length(btrim(p_nombre)) not between 1 and 60) then raise exception 'NOMBRE_NO_VALIDO'; end if;
  if p_zona is not null and not exists (select 1 from pg_timezone_names where name = p_zona) then raise exception 'ZONA_NO_VALIDA'; end if;
  update app.usuario set nombre_visible = coalesce(nullif(btrim(p_nombre), ''), nombre_visible),
                         zona_horaria = coalesce(p_zona, zona_horaria)
   where user_id = p_usuario;
end $$;

create or replace function app.guarda_preferencias(p_usuario text, p jsonb)
returns void language plpgsql as $$
declare v_eventos text[];
begin
  if p ? 'correo' and p->>'correo' not in ('nunca', 'al_momento', 'resumen') then raise exception 'CORREO_NO_VALIDO'; end if;
  if p ? 'eventos' then
    select array_agg(e) into v_eventos from jsonb_array_elements_text(p->'eventos') e;
    if exists (select 1 from unnest(coalesce(v_eventos, '{}')) e
                where e not in ('programado', 'cambio_horario', 'resultado', 'acta', 'jornada_completa', 'jugador')) then
      raise exception 'EVENTO_NO_VALIDO';
    end if;
  end if;
  insert into app.preferencia_aviso (user_id) values (p_usuario) on conflict (user_id) do nothing;
  update app.preferencia_aviso set
    en_app         = coalesce((p->>'en_app')::boolean, en_app),
    push           = coalesce((p->>'push')::boolean, push),
    correo         = coalesce(p->>'correo', correo),
    hora_resumen   = coalesce((p->>'hora_resumen')::time, hora_resumen),
    silencio_desde = case when p ? 'silencio_desde' then (p->>'silencio_desde')::time else silencio_desde end,
    silencio_hasta = case when p ? 'silencio_hasta' then (p->>'silencio_hasta')::time else silencio_hasta end,
    eventos        = coalesce(v_eventos, eventos)
  where user_id = p_usuario;
end $$;

-- Favoritos sin duplicados. La restricción de 0031 (user_id, tipo, entidad_id, clave) no los evitaba:
--   · club, jugador, competición…: `clave` es NULL y en PostgreSQL dos NULL nunca chocan → se podía repetir;
--   · equipo: se guarda la LÍNEA, pero con el team_season de cada temporada → la misma línea dos veces.
-- Primero se quitan los repetidos que hubiera (se queda el más antiguo) y luego tres índices únicos.
delete from app.favorito f using app.favorito g
 where f.user_id = g.user_id and f.tipo = g.tipo and f.id > g.id
   and case when f.tipo in ('equipo', 'busqueda') then f.clave = g.clave else f.entidad_id = g.entidad_id end;
create unique index if not exists favorito_entidad_uq on app.favorito (user_id, tipo, entidad_id) where tipo not in ('equipo', 'busqueda');
create unique index if not exists favorito_linea_uq on app.favorito (user_id, clave) where tipo = 'equipo';
create unique index if not exists favorito_busqueda_uq on app.favorito (user_id, clave) where tipo = 'busqueda';

-- Guardar un favorito (idempotente: si ya lo sigue, devuelve el mismo id y actualiza la etiqueta).
-- Equipo: entidad_id = team_season; se guarda su LÍNEA (club|categoría|género|modalidad|letra) y se sigue cada
-- temporada. Búsqueda: clave = la URL de la búsqueda (sólo rutas internas).
create or replace function app.guarda_favorito(p_usuario text, p_tipo text, p_entidad bigint, p_etiqueta text, p_clave text default null)
returns bigint language plpgsql as $$
declare v_id bigint; v_clave text;
begin
  if p_tipo = 'busqueda' and (p_clave is null or p_clave !~ '^/[a-z]' or length(p_clave) > 500) then raise exception 'BUSQUEDA_NO_VALIDA'; end if;
  if length(btrim(coalesce(p_etiqueta, ''))) not between 1 and 80 then raise exception 'ETIQUETA_NO_VALIDA'; end if;
  v_clave := case when p_tipo = 'equipo' then app.linea_de_equipo(p_entidad) else p_clave end;
  if p_tipo = 'equipo' and v_clave is null then raise exception 'EQUIPO_NO_EXISTE'; end if;
  select id into v_id from app.favorito
   where user_id = p_usuario and tipo = p_tipo
     and case when p_tipo in ('equipo', 'busqueda') then clave = v_clave else entidad_id = p_entidad end;
  if v_id is not null then
    update app.favorito set etiqueta = btrim(p_etiqueta) where id = v_id;
    return v_id;
  end if;
  insert into app.favorito (user_id, tipo, entidad_id, etiqueta, clave, orden)
  values (p_usuario, p_tipo, p_entidad, btrim(p_etiqueta), v_clave,
          coalesce((select max(orden) + 1 from app.favorito where user_id = p_usuario), 0))
  returning id into v_id;
  return v_id;
end $$;

-- ¿Lo sigue ya? (la estrella de cada ficha: llena o vacía)
create or replace function app.es_favorito(p_usuario text, p_tipo text, p_entidad bigint) returns bigint language sql stable as $$
  select id from app.favorito
   where user_id = p_usuario and tipo = p_tipo
     and case when p_tipo = 'equipo' then clave = app.linea_de_equipo(p_entidad) else entidad_id = p_entidad end
   limit 1
$$;

create or replace function app.quita_favorito(p_usuario text, p_id bigint) returns boolean language sql as $$
  with d as (delete from app.favorito where id = p_id and user_id = p_usuario returning 1) select exists (select 1 from d)
$$;

create or replace function app.avisar_favorito(p_usuario text, p_id bigint, p_avisar boolean) returns void language sql as $$
  update app.favorito set avisar = p_avisar where id = p_id and user_id = p_usuario
$$;

-- El orden de «Mi panel»: la web manda los ids en el orden nuevo (arrastrar y soltar).
create or replace function app.reordena_favoritos(p_usuario text, p_ids bigint[]) returns integer language plpgsql as $$
declare n integer;
begin
  update app.favorito f set orden = x.pos - 1
    from unnest(p_ids) with ordinality x(id, pos)
   where f.id = x.id and f.user_id = p_usuario;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function app.marca_leidos(p_usuario text, p_ids bigint[] default null) returns integer language plpgsql as $$
declare n integer;
begin
  update app.notificacion set leida_en = now()
   where user_id = p_usuario and leida_en is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

-- Último acceso sin escribir en cada petición (el disparador de auditoría ya ignora este campo, 0034).
create or replace function app.registra_visita(p_usuario text) returns void language sql as $$
  update app.usuario set ultimo_acceso = now()
   where user_id = p_usuario and (ultimo_acceso is null or ultimo_acceso < now() - interval '5 minutes')
$$;

-- Suscripción push del navegador (la web la llama tras pushManager.subscribe()).
create or replace function app.guarda_suscripcion_push(p_usuario text, p_endpoint text, p_p256dh text, p_auth text, p_agente text)
returns void language plpgsql as $$
begin
  if p_endpoint !~ '^https://' then raise exception 'ENDPOINT_NO_VALIDO'; end if;
  insert into app.suscripcion_push (user_id, endpoint, p256dh, auth, agente) values (p_usuario, p_endpoint, p_p256dh, p_auth, left(p_agente, 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, fallos = 0;
  insert into app.preferencia_aviso (user_id, push) values (p_usuario, true) on conflict (user_id) do update set push = true;
end $$;

-- ── 3. Derechos sobre los datos ───────────────────────────────────────────────────────────────────────
create or replace function app.exporta_mis_datos(p_usuario text) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'generado_en', now(),
    'cuenta', (select to_jsonb(u) - 'notas' from app.usuario u where u.user_id = p_usuario),
    'permisos', coalesce((select jsonb_agg(to_jsonb(uc) - 'user_id') from app.usuario_capacidad uc where uc.user_id = p_usuario), '[]'),
    'favoritos', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'etiqueta', etiqueta, 'avisar', avisar, 'creado_en', creado_en) order by orden)
                             from app.favorito where user_id = p_usuario), '[]'),
    'preferencias', (select to_jsonb(pa) - 'user_id' from app.preferencia_aviso pa where pa.user_id = p_usuario),
    'dispositivos_push', coalesce((select jsonb_agg(jsonb_build_object('agente', agente, 'creada_en', creada_en, 'ultima_ok', ultima_ok))
                                     from app.suscripcion_push where user_id = p_usuario), '[]'),
    'avisos', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'titulo', titulo, 'creada_en', creada_en, 'leida_en', leida_en) order by creada_en desc)
                          from (select * from app.notificacion where user_id = p_usuario order by creada_en desc limit 1000) n), '[]'),
    'accesos_sensibles', coalesce((select jsonb_agg(jsonb_build_object('capacidad', capacidad, 'entidad', entidad, 'en', en) order by en desc)
                                     from app.registro_acceso where user_id = p_usuario), '[]'))
$$;

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
  update app.usuario set estado = 'baja', activo = false, nombre_visible = null, invitacion = null, ultimo_acceso = null,
                         notas = left('baja ' || to_char(now(), 'YYYY-MM-DD') || coalesce(': ' || p_motivo, ''), 200)
   where user_id = p_usuario;
end $$;

-- ── 4. Permisos ───────────────────────────────────────────────────────────────────────────────────────
grant select (user_id, nombre_visible, rol, estado, paquete, valido_hasta, zona_horaria, creado_en, ultimo_acceso)
  on app.usuario to facylf_app;
grant update (nombre_visible, zona_horaria, ultimo_acceso) on app.usuario to facylf_app;
grant select on app.paquete, app.paquete_capacidad, app.capacidad, app.usuario_capacidad, app.registro_acceso to facylf_app;
grant execute on function app.perfil(text), app.es_favorito(text, text, bigint), app.guarda_perfil(text, text, text), app.guarda_preferencias(text, jsonb),
  app.guarda_favorito(text, text, bigint, text, text), app.quita_favorito(text, bigint), app.avisar_favorito(text, bigint, boolean),
  app.reordena_favoritos(text, bigint[]), app.marca_leidos(text, bigint[]), app.registra_visita(text),
  app.guarda_suscripcion_push(text, text, text, text, text), app.exporta_mis_datos(text) to facylf_app;
-- La baja la ejecuta la web con el rol de la aplicación, pero borra en tablas donde sólo tiene permisos
-- limitados: por eso es security definer y comprueba lo necesario dentro.
alter function app.baja_usuario(text, text) security definer set search_path = app, pg_temp;
grant execute on function app.baja_usuario(text, text) to facylf_app;
