-- 0035 · Vigilancia de la plataforma de usuarios: avisos, push, correo, casos de datos, capacidad,
-- registro, publicidad y accesos sensibles. Retención de lo nuevo. Vista del panel de administración.
--
-- Cómo encaja con 0030: `ops.chequeos()` pasa a llamarse `ops.chequeos_datos()` (mismo cuerpo) y el nuevo
-- `ops.chequeos()` = chequeos_datos() ∪ chequeos_plataforma(). Así `ops.registra_chequeos()`, la vigilancia
-- (scripts/vigilancia-plataforma.mjs) y las alertas no cambian. Igual con `ops.purga()`.
-- Si un chequeo nuevo salta a diario sin ser un problema, se sube su umbral en ops.parametro.

-- ── 0. Origen de eventos: el script de avisos y la web de usuarios ─────────────────────────────────
alter table ops.evento_app drop constraint if exists evento_app_origen_check;
alter table ops.evento_app add constraint evento_app_origen_check
  check (origen in ('web', 'proyector', 'importador', 'recolector', 'vigilancia', 'mantenimiento', 'copia', 'avisos', 'auth'));

-- ── 1. Parámetros nuevos ────────────────────────────────────────────────────────────────────────────
insert into ops.parametro (clave, valor, descripcion) values
  ('minutos_generador_parado_aviso', 60, 'Minutos sin pasada del generador de avisos (si ya ha corrido alguna vez)'),
  ('avisos_push_pendientes_aviso', 200, 'Avisos de más de 1 h sin entregar por push a usuarios que lo tienen activo'),
  ('suscripcion_push_fallos_aviso', 5, 'Fallos seguidos de una suscripción push'),
  ('correos_fallidos_24h_aviso', 3, 'Correos de aviso fallidos en 24 h'),
  ('casos_graves_abiertos_aviso', 1, 'Casos de datos graves abiertos'),
  ('casos_nuevos_24h_aviso', 500, 'Casos de datos nuevos en 24 h (subida brusca = cambio en el origen o error del importador)'),
  ('ediciones_sin_medir_aviso', 50, 'Ediciones con partidos y sin capacidad medida'),
  ('horas_usuario_pendiente_aviso', 48, 'Horas que un registro lleva esperando aprobación'),
  ('accesos_menores_24h_aviso', 200, 'Accesos a nombres de menores en 24 h (todos los usuarios)'),
  ('altas_24h_aviso', 20, 'Altas de usuario en 24 h (una plataforma privada no debería tener más)'),
  ('errores_auth_15min_aviso', 10, 'Errores de entrada o registro en 15 minutos (posible ataque de contraseñas)'),
  ('dias_notificacion_retencion', 120, 'Días que se guardan los avisos leídos'),
  ('dias_auditoria_retencion', 730, 'Días que se guarda la auditoría de administración'),
  ('dias_registro_acceso_retencion', 365, 'Días que se guarda el registro de accesos sensibles')
on conflict (clave) do nothing;

-- ── 2. Chequeos de la plataforma ────────────────────────────────────────────────────────────────────
-- Sólo la primera vez (si se vuelve a aplicar, ops.chequeos() ya es la versión nueva y no hay que renombrarla).
do $$ begin
  if to_regprocedure('ops.chequeos_datos()') is null then alter function ops.chequeos() rename to chequeos_datos; end if;
end $$;

-- Arreglo de 0030 (encontrado al aplicar todas las migraciones en un PostgreSQL limpio): si la extensión
-- pg_stat_statements existe pero no está en shared_preload_libraries, leerla da ERROR y TODOS los chequeos
-- fallaban (la vigilancia se quedaba ciega). En el PC está precargada; en el servidor o en uno nuevo, no.
do $$ declare d text; begin
  d := pg_get_functiondef('ops.chequeos_datos()'::regprocedure);
  if position('shared_preload_libraries' in d) = 0 then
    d := replace(d, $x$where extname = 'pg_stat_statements') then$x$,
      $x$where extname = 'pg_stat_statements') and current_setting('shared_preload_libraries', true) like '%pg_stat_statements%' then$x$);
    execute d;
  end if;
end $$;

create or replace function ops.chequeos_plataforma()
returns table (nombre text, area text, estado text, valor numeric, umbral numeric, detalle jsonb)
language plpgsql stable as $$
#variable_conflict use_column
declare v numeric; g app.estado_generador;
begin
  -- Avisos ─────────────────────────────────────────────────────────────────────────────────────────
  select * into g from app.estado_generador;
  v := round(extract(epoch from now() - g.ultima_pasada) / 60);
  return query select 'avisos_generador', 'avisos',
    case when g.ultima_pasada is null then 'info'
         when v > ops.p('minutos_generador_parado_aviso') then 'aviso' else 'ok' end,
    v, ops.p('minutos_generador_parado_aviso'), jsonb_build_object('pasadas', g.pasadas, 'ultima', g.ultima_pasada);

  select count(*) into v from app.notificacion n
    join app.preferencia_aviso pa on pa.user_id = n.user_id and pa.push
   where n.push_en is null and n.creada_en between now() - interval '2 days' and now() - interval '1 hour'
     and exists (select 1 from app.suscripcion_push s where s.user_id = n.user_id);
  return query select 'avisos_push_atascados', 'avisos',
    case when v > ops.p('avisos_push_pendientes_aviso') then 'aviso' else 'ok' end, v, ops.p('avisos_push_pendientes_aviso'), '{}'::jsonb;

  select count(*) into v from app.suscripcion_push where fallos >= ops.p('suscripcion_push_fallos_aviso');
  return query select 'suscripciones_push_fallando', 'avisos',
    case when v > 0 then 'aviso' else 'ok' end, v, ops.p('suscripcion_push_fallos_aviso'), '{}'::jsonb;

  select count(*) into v from ops.evento_app where tipo = 'correo_fallido' and creado_en > now() - interval '24 hours';
  return query select 'correos_fallidos_24h', 'avisos',
    case when v >= ops.p('correos_fallidos_24h_aviso') then 'aviso' else 'ok' end, v, ops.p('correos_fallidos_24h_aviso'), '{}'::jsonb;

  select count(*) into v from ops.evento_app where tipo = 'notificaciones_fallidas' and creado_en > now() - interval '1 hour';
  return query select 'generador_avisos_fallando', 'avisos',
    case when v > 0 then 'fallo' else 'ok' end, v, 0::numeric,
    (select coalesce(jsonb_agg(mensaje), '[]') from (select mensaje from ops.evento_app
      where tipo = 'notificaciones_fallidas' and creado_en > now() - interval '1 hour' order by id desc limit 3) x);

  -- Caché de la web (0036): etiquetas sin consumir hace más de 10 min = la web no está refrescando páginas
  if to_regclass('ops.invalidacion') is not null then
    execute 'select count(*) from ops.invalidacion where consumida_en is null and creada_en < now() - interval ''10 minutes''' into v;
    return query select 'cache_sin_refrescar', 'web', case when v > 0 then 'aviso' else 'ok' end, v, 0::numeric, '{}'::jsonb;
  end if;

  -- Calidad: casos y capacidad ────────────────────────────────────────────────────────────────────
  select count(*) into v from ops.caso_dato where estado = 'abierto' and severidad = 'grave';
  return query select 'casos_graves_abiertos', 'calidad',
    case when v >= ops.p('casos_graves_abiertos_aviso') then 'aviso' else 'ok' end, v, ops.p('casos_graves_abiertos_aviso'),
    (select coalesce(jsonb_object_agg(codigo, n), '{}') from (select codigo, count(*) n from ops.caso_dato
       where estado = 'abierto' and severidad = 'grave' group by codigo) x);

  select count(*) into v from ops.caso_dato where detectado_en > now() - interval '24 hours';
  return query select 'casos_nuevos_24h', 'calidad',
    case when v >= ops.p('casos_nuevos_24h_aviso') then 'aviso' else 'ok' end, v, ops.p('casos_nuevos_24h_aviso'),
    (select coalesce(jsonb_object_agg(codigo, n), '{}') from (select codigo, count(*) n from ops.caso_dato
       where detectado_en > now() - interval '24 hours' group by codigo order by n desc limit 10) x);

  select count(*) into v from core.competition_edition ce
   where not exists (select 1 from analytics.edicion_capacidad c where c.competition_edition_id = ce.id)
     and exists (select 1 from core.phase_group pg join core.match m on m.phase_group_id = pg.id
                  where pg.competition_edition_id = ce.id);
  return query select 'ediciones_sin_medir', 'calidad',
    case when v >= ops.p('ediciones_sin_medir_aviso') then 'aviso' else 'ok' end, v, ops.p('ediciones_sin_medir_aviso'), '{}'::jsonb;

  -- Usuarios y seguridad ──────────────────────────────────────────────────────────────────────────
  select count(*) into v from app.usuario
   where estado = 'pendiente' and creado_en < now() - make_interval(hours => ops.p('horas_usuario_pendiente_aviso')::int);
  return query select 'registros_sin_aprobar', 'usuarios',
    case when v > 0 then 'aviso' else 'ok' end, v, ops.p('horas_usuario_pendiente_aviso'), '{}'::jsonb;

  select count(*) into v from app.usuario where creado_en > now() - interval '24 hours';
  return query select 'altas_24h', 'usuarios',
    case when v > ops.p('altas_24h_aviso') then 'aviso' else 'ok' end, v, ops.p('altas_24h_aviso'),
    jsonb_build_object('modo', (select valor from app.ajuste where clave = 'registro_modo'));

  select count(*) into v from app.registro_acceso where capacidad = 'ver_menores_nombres' and en > now() - interval '24 hours';
  return query select 'accesos_menores_24h', 'usuarios',
    case when v > ops.p('accesos_menores_24h_aviso') then 'aviso' else 'ok' end, v, ops.p('accesos_menores_24h_aviso'),
    (select coalesce(jsonb_object_agg(left(user_id, 6), n), '{}') from (select user_id, count(*) n from app.registro_acceso
       where capacidad = 'ver_menores_nombres' and en > now() - interval '24 hours' group by user_id order by n desc limit 5) x);

  select count(*) into v from ops.evento_app where origen = 'auth' and nivel in ('aviso', 'error') and creado_en > now() - interval '15 minutes';
  return query select 'errores_entrada_15min', 'usuarios',
    case when v >= ops.p('errores_auth_15min_aviso') then 'aviso' else 'ok' end, v, ops.p('errores_auth_15min_aviso'), '{}'::jsonb;

  select count(*) into v from app.usuario u where u.rol = 'administrador' and u.activo;
  -- Sin ningún usuario la plataforma aún no está montada (info); con usuarios y sin administrador, fallo:
  -- nadie podría aprobar registros ni revisar nada.
  return query select 'administradores_activos', 'usuarios',
    case when v > 0 then 'ok' when exists (select 1 from app.usuario) then 'fallo' else 'info' end, v, 1::numeric, '{}'::jsonb;

  select count(*) into v from app.usuario_capacidad where hasta is not null and hasta < current_date;
  return query select 'permisos_caducados_sin_quitar', 'usuarios',
    case when v > 0 then 'info' else 'ok' end, v, 0::numeric, '{}'::jsonb;

  -- Publicidad: nunca encendida sin que alguien lo sepa ─────────────────────────────────────────────
  select count(*) into v from app.espacio_anuncio where activo and proveedor <> 'ninguno';
  return query select 'publicidad_activa', 'publicidad', case when v > 0 then 'info' else 'ok' end, v, 0::numeric,
    (select coalesce(jsonb_agg(codigo), '[]') from app.espacio_anuncio where activo and proveedor <> 'ninguno');

  select count(*) into v from app.campana_anuncio where activa and hasta < current_date;
  return query select 'campanas_caducadas_activas', 'publicidad', case when v > 0 then 'info' else 'ok' end, v, 0::numeric, '{}'::jsonb;
end $$;

create or replace function ops.chequeos()
returns table (nombre text, area text, estado text, valor numeric, umbral numeric, detalle jsonb)
language sql stable as $$
  select * from ops.chequeos_datos()
  union all
  select * from ops.chequeos_plataforma()
$$;
comment on function ops.chequeos() is
  'Todas las comprobaciones: datos y base (chequeos_datos, 0030) + usuarios, avisos y calidad (chequeos_plataforma, 0035).';

-- ── 3. Retención ────────────────────────────────────────────────────────────────────────────────────
-- Sólo la primera vez (si se vuelve a aplicar, ops.purga() ya es la versión nueva y no hay que renombrarla).
do $$ begin
  if to_regprocedure('ops.purga_datos()') is null then alter function ops.purga() rename to purga_datos; end if;
end $$;

create or replace function ops.purga_plataforma()
returns jsonb language plpgsql as $$
declare a int; b int; c int; d int; e int; f int;
begin
  delete from app.notificacion where leida_en is not null
     and creada_en < now() - make_interval(days => ops.p('dias_notificacion_retencion')::int); get diagnostics a = row_count;
  -- sin leer, se borran a los 365 días (la bandeja no es un archivo)
  delete from app.notificacion where creada_en < now() - interval '365 days'; get diagnostics b = row_count;
  -- fotos de partidos fuera de la ventana del generador (14 días atrás) con margen
  delete from app.foto_partido where vista_en < now() - interval '45 days'; get diagnostics c = row_count;
  delete from app.auditoria where en < now() - make_interval(days => ops.p('dias_auditoria_retencion')::int); get diagnostics d = row_count;
  delete from app.registro_acceso where en < now() - make_interval(days => ops.p('dias_registro_acceso_retencion')::int); get diagnostics e = row_count;
  -- casos cerrados hace más de un año (los descartados se quedan: si no, volverían a abrirse)
  delete from ops.caso_dato where estado in ('resuelto_solo', 'corregido') and coalesce(revisado_en, visto_en) < now() - interval '365 days';
  get diagnostics f = row_count;
  -- etiquetas de caché ya consumidas (0036); si la tabla aún no existe, nada
  if to_regclass('ops.invalidacion') is not null then
    execute 'delete from ops.invalidacion where consumida_en < now() - interval ''2 days''';
  end if;
  return jsonb_build_object('avisos_leidos', a, 'avisos_viejos', b, 'fotos', c, 'auditoria', d, 'accesos', e, 'casos', f);
end $$;

create or replace function ops.purga() returns jsonb language sql as $$
  select ops.purga_datos() || ops.purga_plataforma()
$$;

-- ── 4. Resumen para la portada del panel (una fila, barata) ─────────────────────────────────────────
create or replace view ops.panel_resumen as
select
  (select count(*) from ops.alerta where estado = 'abierta' and severidad = 'fallo')                  as alertas_fallo,
  (select count(*) from ops.alerta where estado = 'abierta' and severidad = 'aviso')                  as alertas_aviso,
  (select count(*) from app.usuario where estado = 'pendiente')                                         as usuarios_pendientes,
  (select count(*) from app.usuario where estado = 'activo' and activo)                                 as usuarios_activos,
  (select count(*) from app.usuario where ultimo_acceso > now() - interval '7 days')                    as activos_7d,
  (select count(*) from ops.caso_dato where estado = 'abierto' and severidad = 'grave')                 as casos_graves,
  (select count(*) from ops.caso_dato where estado = 'abierto')                                         as casos_abiertos,
  (select count(*) from app.notificacion where creada_en > now() - interval '24 hours')                 as avisos_24h,
  (select ultima_pasada from app.estado_generador)                                                       as avisos_ultima_pasada,
  (select max(terminada_en) from ops.copia where tipo = 'copia' and correcta)                            as ultima_copia,
  (select count(*) from analytics.proyeccion_pendiente)                                                 as grupos_pendientes,
  (select count(*) from app.espacio_anuncio where activo and proveedor <> 'ninguno')                     as huecos_anuncio_activos;

-- ── 5. Permisos ─────────────────────────────────────────────────────────────────────────────────────
grant execute on function ops.chequeos(), ops.chequeos_datos(), ops.chequeos_plataforma(),
  ops.purga(), ops.purga_datos(), ops.purga_plataforma() to facylf_publicador;
grant select on app.estado_generador, app.notificacion, app.preferencia_aviso, app.suscripcion_push, app.usuario,
  app.usuario_capacidad, app.registro_acceso, app.ajuste, app.espacio_anuncio, app.campana_anuncio to facylf_publicador;
grant delete on app.notificacion, app.foto_partido, app.auditoria, app.registro_acceso, ops.caso_dato to facylf_publicador;
grant select on ops.panel_resumen to facylf_app, facylf_publicador;
