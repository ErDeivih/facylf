-- 0030 · Observabilidad, alertas y mantenimiento de la plataforma
--
-- Por qué (David, 21/10/2026): «mantener buenos tiempos, buenas estadísticas, que no haya errores y si los
-- hay, poder subsanarlos y enterarme a tiempo». Hasta hoy sólo había registros sueltos de cada script.
--
-- Qué añade (aditiva):
--   1. `ops.evento_app`: registro estructurado de errores y avisos de web, proyector, importador y vigilancia.
--   2. `ops.consulta_minuto`: tiempos de cada consulta nombrada de la web, agregados por minuto (p50/p95/máx).
--   3. `ops.web_vital`: rendimiento percibido (LCP, INP, CLS) por ruta y día, p75.
--   4. `ops.copia`: cada copia de seguridad y cada restauración de prueba.
--   5. `ops.chequeos()`: ~25 comprobaciones de salud, frescura, calidad de datos y rendimiento, en SQL.
--   6. `ops.alerta` + `ops.registra_chequeos()`: abre, mantiene y cierra alertas; devuelve las que cambian de
--      estado para que scripts/vigilancia-plataforma.mjs avise (Telegram / ntfy / correo).
--   7. `ops.purga()`: retención (90 días de eventos, 30 de tiempos por minuto, 400 de chequeos diarios).
-- No usa extensiones nuevas. Si `pg_stat_statements` está creada, la aprovecha; si no, ese chequeo se salta.

-- ── 1. Eventos ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists ops.evento_app (
  id          bigint      generated always as identity primary key,
  creado_en   timestamptz not null default now(),
  nivel       text        not null check (nivel in ('debug', 'info', 'aviso', 'error', 'critico')),
  origen      text        not null check (origen in ('web', 'proyector', 'importador', 'recolector', 'vigilancia', 'mantenimiento', 'copia')),
  tipo        text        not null,                 -- 'consulta_fallida', 'pagina_500', 'lote_fallido'…
  mensaje     text        not null,
  detalle     jsonb       not null default '{}'::jsonb,
  peticion_id text,                                 -- correlación entre la web y la base
  usuario     text,                                 -- hash del usuario, nunca el correo
  ruta        text,
  duracion_ms integer
);
create index if not exists evento_app_fecha_idx on ops.evento_app (creado_en desc);
create index if not exists evento_app_nivel_idx on ops.evento_app (nivel, creado_en desc) where nivel in ('error', 'critico');
comment on table ops.evento_app is
  'Errores y avisos de todos los procesos. NUNCA datos personales: ni nombres de jugadores ni correos (usuario = '
  'sha256 truncado). Se purga a los 90 días (ops.purga).';

-- ── 2. Tiempos de consultas ─────────────────────────────────────────────────────────────────────────
create table if not exists ops.consulta_minuto (
  minuto            timestamptz not null,
  consulta          text        not null,          -- el `nombre` de la Consulta (apps/web/src/consultas)
  n                 integer     not null,
  ms_p50            integer     not null,
  ms_p95            integer     not null,
  ms_max            integer     not null,
  errores           integer     not null default 0,
  sobre_presupuesto integer     not null default 0, -- ejecuciones por encima de presupuestoMs
  presupuesto_ms    integer,
  primary key (minuto, consulta)
);

-- ── 3. Rendimiento percibido ────────────────────────────────────────────────────────────────────────
create table if not exists ops.web_vital (
  dia     date    not null,
  ruta    text    not null,                         -- patrón de ruta (/jugador/[id]), nunca la URL con id
  metrica text    not null check (metrica in ('LCP', 'INP', 'CLS', 'TTFB', 'FCP')),
  p75     numeric not null,
  n       integer not null,
  primary key (dia, ruta, metrica)
);

-- ── 4. Copias ───────────────────────────────────────────────────────────────────────────────────────
create table if not exists ops.copia (
  id          bigint      generated always as identity primary key,
  tipo        text        not null check (tipo in ('copia', 'restauracion_prueba')),
  iniciada_en timestamptz not null default now(),
  terminada_en timestamptz,
  correcta    boolean,
  ruta        text,
  bytes       bigint,
  sha256      text,
  detalle     jsonb       not null default '{}'::jsonb
);

-- ── 5. Parámetros de los chequeos ───────────────────────────────────────────────────────────────────
create table if not exists ops.parametro (
  clave text primary key,
  valor numeric not null,
  descripcion text not null
);
insert into ops.parametro (clave, valor, descripcion) values
  ('proyeccion_pendiente_aviso', 200, 'Grupos pendientes de proyectar: aviso'),
  ('proyeccion_pendiente_fallo', 2000, 'Grupos pendientes de proyectar: fallo'),
  ('horas_sin_lote_aviso', 48, 'Horas sin un lote publicado de una federación activa'),
  ('pct_actas_revision_aviso', 5, '% de actas «review» en 7 días'),
  ('pct_minutos_no_calculables_aviso', 30, '% de filas jugador-equipo de la temporada en curso sin minutos fiables'),
  ('gb_base_aviso', 150, 'Tamaño de la base en GB'),
  ('pct_conexiones_aviso', 80, '% de max_connections en uso'),
  ('segundos_bloqueo_aviso', 60, 'Una sesión esperando un bloqueo más de N s'),
  ('minutos_consulta_larga_aviso', 5, 'Una consulta activa más de N min'),
  ('pct_tuplas_muertas_aviso', 20, '% de tuplas muertas en una tabla grande'),
  ('errores_web_15min_aviso', 5, 'Errores de la web en 15 minutos'),
  ('horas_sin_copia_fallo', 26, 'Horas desde la última copia correcta'),
  ('dias_sin_restauracion_aviso', 35, 'Días desde la última restauración de prueba correcta'),
  ('p95_sobre_presupuesto_aviso', 1, 'Consultas con p95 por encima de su presupuesto en la última hora')
on conflict (clave) do nothing;

create or replace function ops.p(p_clave text) returns numeric language sql stable as $$
  select valor from ops.parametro where clave = p_clave
$$;

-- ── 6. Chequeos ─────────────────────────────────────────────────────────────────────────────────────
-- Cada fila: nombre estable (clave de la alerta), área, estado ok|aviso|fallo|info, valor, umbral, detalle.
create or replace function ops.chequeos()
returns table (nombre text, area text, estado text, valor numeric, umbral numeric, detalle jsonb)
language plpgsql stable as $$
#variable_conflict use_column
declare v numeric; d jsonb; temporada smallint;
begin
  select id into temporada from core.season order by orden desc limit 1;

  -- Frescura y procesos ──────────────────────────────────────────────────────────────────────────────
  select count(*) into v from analytics.proyeccion_pendiente;
  return query select 'proyeccion_pendiente', 'procesos',
    case when v >= ops.p('proyeccion_pendiente_fallo') then 'fallo' when v >= ops.p('proyeccion_pendiente_aviso') then 'aviso' else 'ok' end,
    v, ops.p('proyeccion_pendiente_aviso'), '{}'::jsonb;

  return query
    with ultimo as (
      select f.codigo, max(b.terminado_en) as t
        from core.federation f left join ops.batch b on b.federation_id = f.id and b.estado = 'publicado'
       where f.activa group by f.codigo)
    select 'federacion_sin_lote:' || u.codigo, 'frescura',
           case when u.t is null then 'info' when u.t < now() - make_interval(hours => ops.p('horas_sin_lote_aviso')::int) then 'aviso' else 'ok' end,
           round(extract(epoch from now() - u.t) / 3600)::numeric, ops.p('horas_sin_lote_aviso'),
           jsonb_build_object('ultimo_lote', u.t)
      from ultimo u;

  select count(*) into v from ops.batch where estado = 'fallido' and iniciado_en > now() - interval '24 hours';
  return query select 'lotes_fallidos_24h', 'procesos', case when v > 0 then 'aviso' else 'ok' end, v, 0::numeric,
    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'federacion', federation_id, 'origen', sqlite_origen)), '[]')
       from ops.batch where estado = 'fallido' and iniciado_en > now() - interval '24 hours');

  select count(*) into v from ops.batch where estado = 'en_curso' and iniciado_en < now() - interval '3 hours';
  return query select 'lotes_colgados', 'procesos', case when v > 0 then 'aviso' else 'ok' end, v, 0::numeric, '{}'::jsonb;

  select count(*) into v from ops.normalizacion_error where registrado_en > now() - interval '24 hours';
  return query select 'errores_normalizacion_24h', 'calidad', case when v > 500 then 'aviso' else 'ok' end, v, 500::numeric,
    (select coalesce(jsonb_object_agg(codigo, n), '{}') from (select codigo, count(*) n from ops.normalizacion_error
       where registrado_en > now() - interval '24 hours' group by codigo order by n desc limit 10) x);

  -- Calidad de los datos ─────────────────────────────────────────────────────────────────────────────
  select round(100.0 * count(*) filter (where quality = 'review') / nullif(count(*), 0), 1) into v
    from core.match_report where ingested_at > now() - interval '7 days';
  return query select 'actas_a_revisar_7d', 'calidad',
    case when coalesce(v, 0) > ops.p('pct_actas_revision_aviso') then 'aviso' else 'ok' end, coalesce(v, 0), ops.p('pct_actas_revision_aviso'), '{}'::jsonb;

  select count(*) into v from core.match m
   where m.official_status = 'played' and m.played_at between now() - interval '60 days' and now() - interval '7 days'
     and not exists (select 1 from core.match_report r where r.match_id = m.id);
  return query select 'jugados_sin_acta', 'calidad', case when v > 0 then 'info' else 'ok' end, v, 0::numeric, '{}'::jsonb;

  select count(*) into v from core.match_report r
   where r.ingested_at > now() - interval '7 days' and r.incidencias @> '["SCORE_EVENTS_MISMATCH"]'::jsonb;
  return query select 'goles_no_cuadran_7d', 'calidad', case when v > 0 then 'info' else 'ok' end, v, 0::numeric, '{}'::jsonb;

  select count(*) into v from (
    select e.match_id, e.person_id, e.minute_base from core.match_event e
     join core.match m on m.id = e.match_id and m.played_at > now() - interval '60 days'
     where e.event_type = 'tarjeta_amarilla' and e.person_id is not null
     group by e.match_id, e.person_id, e.minute_base having count(*) > 1) x;
  return query select 'amarillas_duplicadas', 'calidad', case when v > 0 then 'info' else 'ok' end, v, 0::numeric,
    jsonb_build_object('nota', 'dos amarillas al mismo jugador en el mismo minuto: no se cuentan como doble amarilla');

  select count(*) into v from (
    select a.person_id, m.played_at from core.appearance a join core.match m on m.id = a.match_id
     where m.played_at > now() - interval '60 days' and a.condition = 'starter'
     group by a.person_id, m.played_at having count(distinct a.match_id) > 1) x;
  return query select 'titular_en_dos_partidos_a_la_vez', 'calidad', case when v > 0 then 'aviso' else 'ok' end, v, 0::numeric,
    jsonb_build_object('nota', 'misma persona titular en dos partidos a la misma hora: identidad mal unida o fecha errónea');

  select round(100.0 * count(*) filter (where not minutos_fiables and partidos_demostrados > 0)
               / nullif(count(*) filter (where partidos_demostrados > 0), 0), 1) into v
    from analytics.player_team_season_summary where season_id = temporada;
  return query select 'minutos_no_calculables', 'calidad',
    case when coalesce(v, 0) > ops.p('pct_minutos_no_calculables_aviso') then 'aviso' else 'ok' end, coalesce(v, 0),
    ops.p('pct_minutos_no_calculables_aviso'),
    (select coalesce(jsonb_object_agg(codigo, pct), '{}') from (
       select f.codigo, round(100.0 * count(*) filter (where not s.minutos_fiables) / nullif(count(*), 0), 1) pct
         from analytics.player_team_season_summary s
         join core.competition_edition ce on ce.id = s.competition_edition_id
         join core.federation f on f.id = ce.federation_id
        where s.season_id = temporada and s.partidos_demostrados > 0 group by f.codigo) x);

  select count(*) into v from analytics.ojeo_temporada where edad_incoherente and season_id = temporada;
  return query select 'edad_incoherente', 'identidad', case when v > 0 then 'info' else 'ok' end, v, 0::numeric,
    jsonb_build_object('nota', 'personas unidas cuyas categorías no cuadran con una sola edad: revisar la unión');

  select count(*) into v from analytics.jugador_temporada where cambio_club = 'simultaneo' and season_id = temporada;
  return query select 'dos_clubes_a_la_vez', 'identidad', case when v > 0 then 'info' else 'ok' end, v, 0::numeric,
    jsonb_build_object('nota', 'puede ser fútbol + sala, un convenio o dos personas con el mismo código: revisar');

  select count(*) into v from analytics.sancion_inferida s
   where s.season_id = temporada and s.motivo in ('roja_directa', 'doble_amarilla', 'doble_amarilla_deducida')
     and s.partidos_perdidos = 0 and s.cierre = 'reaparece';
  return query select 'expulsado_que_juega_el_siguiente', 'calidad', case when v > 0 then 'info' else 'ok' end, v, 0::numeric,
    jsonb_build_object('nota', 'tras una expulsión jugó el partido siguiente: recurso estimado, error de acta o roja mal atribuida');

  -- Base de datos ────────────────────────────────────────────────────────────────────────────────────
  v := round(pg_database_size(current_database()) / 1024.0 / 1024 / 1024, 1);
  return query select 'tamano_base_gb', 'base', case when v > ops.p('gb_base_aviso') then 'aviso' else 'ok' end, v, ops.p('gb_base_aviso'), '{}'::jsonb;

  select round(100.0 * count(*) / current_setting('max_connections')::numeric, 1) into v from pg_stat_activity;
  return query select 'conexiones', 'base', case when v > ops.p('pct_conexiones_aviso') then 'aviso' else 'ok' end, v, ops.p('pct_conexiones_aviso'), '{}'::jsonb;

  select count(*) into v from pg_stat_activity
   where wait_event_type = 'Lock' and now() - query_start > make_interval(secs => ops.p('segundos_bloqueo_aviso')::int);
  return query select 'bloqueos', 'base', case when v > 0 then 'aviso' else 'ok' end, v, 0::numeric, '{}'::jsonb;

  select count(*) into v from pg_stat_activity
   where state = 'active' and backend_type = 'client backend' and pid <> pg_backend_pid()
     and now() - query_start > make_interval(mins => ops.p('minutos_consulta_larga_aviso')::int);
  return query select 'consultas_largas', 'base', case when v > 0 then 'aviso' else 'ok' end, v, 0::numeric,
    (select coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'usuario', usename, 'segundos', round(extract(epoch from now() - query_start)),
                                                  'consulta', left(query, 120))), '[]')
       from pg_stat_activity where state = 'active' and backend_type = 'client backend' and pid <> pg_backend_pid()
        and now() - query_start > make_interval(mins => ops.p('minutos_consulta_larga_aviso')::int));

  return query
    select 'tuplas_muertas:' || s.schemaname || '.' || s.relname, 'base',
           case when 100.0 * s.n_dead_tup / nullif(s.n_live_tup + s.n_dead_tup, 0) > ops.p('pct_tuplas_muertas_aviso') then 'aviso' else 'ok' end,
           round(100.0 * s.n_dead_tup / nullif(s.n_live_tup + s.n_dead_tup, 0), 1), ops.p('pct_tuplas_muertas_aviso'),
           jsonb_build_object('ultimo_autovacuum', s.last_autovacuum, 'ultimo_autoanalyze', s.last_autoanalyze)
      from pg_stat_user_tables s
     where s.schemaname in ('core', 'analytics') and s.n_live_tup > 100000;

  -- Rendimiento de la web ────────────────────────────────────────────────────────────────────────────
  select count(distinct consulta) into v from ops.consulta_minuto
   where minuto > now() - interval '1 hour' and presupuesto_ms is not null and ms_p95 > presupuesto_ms;
  return query select 'consultas_sobre_presupuesto', 'rendimiento',
    case when v >= ops.p('p95_sobre_presupuesto_aviso') then 'aviso' else 'ok' end, v, ops.p('p95_sobre_presupuesto_aviso'),
    (select coalesce(jsonb_object_agg(consulta, p95), '{}') from (
       select consulta, max(ms_p95) p95 from ops.consulta_minuto
        where minuto > now() - interval '1 hour' and presupuesto_ms is not null and ms_p95 > presupuesto_ms
        group by consulta order by p95 desc limit 10) x);

  select count(*) into v from ops.evento_app where origen = 'web' and nivel in ('error', 'critico') and creado_en > now() - interval '15 minutes';
  return query select 'errores_web_15min', 'rendimiento',
    case when v >= ops.p('errores_web_15min_aviso') then 'fallo' when v > 0 then 'aviso' else 'ok' end, v, ops.p('errores_web_15min_aviso'),
    (select coalesce(jsonb_object_agg(tipo, n), '{}') from (select tipo, count(*) n from ops.evento_app
       where origen = 'web' and nivel in ('error', 'critico') and creado_en > now() - interval '15 minutes' group by tipo) x);

  if exists (select 1 from pg_extension where extname = 'pg_stat_statements') then
    execute $q$ select coalesce(jsonb_agg(x), '[]') from (
                  select left(query, 120) as consulta, calls, round(mean_exec_time)::int as media_ms
                    from pg_stat_statements where mean_exec_time > 500 and calls > 20
                   order by mean_exec_time * calls desc limit 10) x $q$ into d;
    return query select 'sentencias_lentas', 'rendimiento', case when jsonb_array_length(d) > 0 then 'info' else 'ok' end,
      jsonb_array_length(d)::numeric, 0::numeric, d;
  end if;

  -- Copias ───────────────────────────────────────────────────────────────────────────────────────────
  select round(extract(epoch from now() - max(terminada_en)) / 3600) into v from ops.copia where tipo = 'copia' and correcta;
  return query select 'copia_de_seguridad', 'copias',
    case when v is null or v > ops.p('horas_sin_copia_fallo') then 'fallo' else 'ok' end, v, ops.p('horas_sin_copia_fallo'), '{}'::jsonb;

  select round(extract(epoch from now() - max(terminada_en)) / 86400) into v from ops.copia where tipo = 'restauracion_prueba' and correcta;
  return query select 'restauracion_probada', 'copias',
    case when v is null or v > ops.p('dias_sin_restauracion_aviso') then 'aviso' else 'ok' end, v, ops.p('dias_sin_restauracion_aviso'), '{}'::jsonb;
end $$;

comment on function ops.chequeos() is
  'Todas las comprobaciones de salud. Barata: sólo cuenta en ventanas recientes y en catálogos de Postgres. '
  'La llama scripts/vigilancia-plataforma.mjs cada 15 minutos.';

-- ── 7. Alertas ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists ops.alerta (
  nombre          text        primary key,
  area            text        not null,
  estado          text        not null check (estado in ('abierta', 'cerrada')),
  severidad       text        not null check (severidad in ('aviso', 'fallo')),
  abierta_en      timestamptz not null default now(),
  ultima_vez      timestamptz not null default now(),
  cerrada_en      timestamptz,
  veces           integer     not null default 1,
  valor           numeric,
  detalle         jsonb       not null default '{}'::jsonb,
  notificada_en   timestamptz,
  silenciada_hasta timestamptz
);

create table if not exists ops.chequeo_diario (
  dia    date    not null,
  nombre text    not null,
  area   text    not null,
  peor   text    not null,      -- el peor estado del día
  valor  numeric,
  primary key (dia, nombre)
);

-- Ejecuta los chequeos, abre/actualiza/cierra alertas y devuelve las que hay que notificar:
--   'abre'   → nueva alerta (o sube de aviso a fallo);
--   'cierra' → vuelve a ok;
--   'sigue'  → abierta desde hace más de 6 h sin notificar de nuevo (recordatorio, máx. 1 cada 6 h).
create or replace function ops.registra_chequeos()
returns table (accion text, nombre text, area text, severidad text, valor numeric, detalle jsonb)
language plpgsql as $$
#variable_conflict use_column
declare r record;
begin
  create temporary table if not exists _chequeo on commit drop as select * from ops.chequeos() limit 0;
  truncate _chequeo;
  insert into _chequeo select * from ops.chequeos();

  insert into ops.chequeo_diario (dia, nombre, area, peor, valor)
  select current_date, c.nombre, c.area, c.estado, c.valor from _chequeo c
  on conflict (dia, nombre) do update set
    peor = case when array_position(array['ok','info','aviso','fallo'], excluded.peor)
                   > array_position(array['ok','info','aviso','fallo'], ops.chequeo_diario.peor)
                then excluded.peor else ops.chequeo_diario.peor end,
    valor = excluded.valor;

  for r in select * from _chequeo c where c.estado in ('aviso', 'fallo') loop
    if not exists (select 1 from ops.alerta a where a.nombre = r.nombre and a.estado = 'abierta') then
      insert into ops.alerta (nombre, area, estado, severidad, valor, detalle)
      values (r.nombre, r.area, 'abierta', r.estado, r.valor, r.detalle)
      on conflict (nombre) do update set estado = 'abierta', severidad = excluded.severidad, abierta_en = now(),
        ultima_vez = now(), cerrada_en = null, veces = ops.alerta.veces + 1, valor = excluded.valor,
        detalle = excluded.detalle, notificada_en = null;
      accion := 'abre'; nombre := r.nombre; area := r.area; severidad := r.estado; valor := r.valor; detalle := r.detalle;
      return next;
    else
      update ops.alerta a set ultima_vez = now(), valor = r.valor, detalle = r.detalle,
             severidad = case when r.estado = 'fallo' then 'fallo' else a.severidad end
       where a.nombre = r.nombre;
      if exists (select 1 from ops.alerta a where a.nombre = r.nombre
                  and (a.silenciada_hasta is null or a.silenciada_hasta < now())
                  and (a.notificada_en is null or a.notificada_en < now() - interval '6 hours')) then
        accion := 'sigue'; nombre := r.nombre; area := r.area; severidad := r.estado; valor := r.valor; detalle := r.detalle;
        return next;
      end if;
    end if;
  end loop;

  for r in select a.* from ops.alerta a
            where a.estado = 'abierta'
              and not exists (select 1 from _chequeo c where c.nombre = a.nombre and c.estado in ('aviso', 'fallo')) loop
    update ops.alerta set estado = 'cerrada', cerrada_en = now() where ops.alerta.nombre = r.nombre;
    accion := 'cierra'; nombre := r.nombre; area := r.area; severidad := r.severidad; valor := null; detalle := '{}'::jsonb;
    return next;
  end loop;
end $$;

create or replace function ops.marca_notificada(p_nombres text[]) returns void language sql as $$
  update ops.alerta set notificada_en = now() where nombre = any(p_nombres)
$$;

-- ── 8. Retención ────────────────────────────────────────────────────────────────────────────────────
create or replace function ops.purga()
returns jsonb language plpgsql as $$
declare a int; b int; c int; d int;
begin
  delete from ops.evento_app where creado_en < now() - interval '90 days'; get diagnostics a = row_count;
  delete from ops.consulta_minuto where minuto < now() - interval '30 days'; get diagnostics b = row_count;
  delete from ops.chequeo_diario where dia < current_date - 400; get diagnostics c = row_count;
  delete from ops.alerta where estado = 'cerrada' and cerrada_en < now() - interval '180 days'; get diagnostics d = row_count;
  return jsonb_build_object('eventos', a, 'consultas', b, 'chequeos', c, 'alertas', d);
end $$;

-- Panel de salud (pantalla de administrador): lo último de cada chequeo y las alertas abiertas.
create or replace view ops.salud as
select a.nombre, a.area, a.estado, a.severidad, a.abierta_en, a.ultima_vez, a.veces, a.valor, a.detalle
  from ops.alerta a where a.estado = 'abierta';

-- ── 9. Permisos ─────────────────────────────────────────────────────────────────────────────────────
-- La web (facylf_app) escribe sus eventos, tiempos y web vitals; lee la salud (sólo administradores, lo
-- comprueba la web con app.puede(usuario, 'administrar_usuarios')).
grant usage on schema ops to facylf_app;
grant insert on ops.evento_app, ops.web_vital to facylf_app;
grant insert, update on ops.consulta_minuto, ops.web_vital to facylf_app;
grant select on ops.salud, ops.alerta, ops.chequeo_diario, ops.consulta_minuto, ops.web_vital, ops.copia to facylf_app;
grant usage, select on all sequences in schema ops to facylf_app;
-- Vigilancia, mantenimiento y copias corren con facylf_publicador.
grant select, insert, update, delete on ops.evento_app, ops.consulta_minuto, ops.web_vital, ops.copia, ops.alerta,
                                        ops.chequeo_diario, ops.parametro to facylf_publicador;
grant select on ops.salud to facylf_publicador;
grant usage, select on all sequences in schema ops to facylf_publicador;
grant execute on function ops.p(text), ops.chequeos(), ops.registra_chequeos(), ops.marca_notificada(text[]), ops.purga()
  to facylf_publicador;
-- Ver pg_stat_activity de otras sesiones (bloqueos, consultas largas). Si quien migra no puede concederlo,
-- se avisa y los chequeos de sesiones sólo verán las del propio usuario.
do $$ begin
  grant pg_monitor to facylf_publicador;
exception when insufficient_privilege then
  raise notice 'pg_monitor no concedido: concédelo como superusuario (grant pg_monitor to facylf_publicador)';
end $$;
