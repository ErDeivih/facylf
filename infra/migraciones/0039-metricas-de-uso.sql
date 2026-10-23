-- 0039 · Métricas de uso: qué páginas se ven, cuánta gente entra y cuánto acierta la caché.
--
-- Sin herramientas de terceros (la plataforma es privada y no hace falta Google Analytics ni cookies de
-- medición): la web llama a `ops.anota_uso` en cada página servida (desde el layout del servidor, con
-- `after()` para no retrasar la respuesta). Se guarda por DÍA y TIPO de página ('/equipo/[id]', no la URL
-- concreta), y qué usuarios entraron cada día (para «activos en 7 días»); se purga a los 90 días.
-- Alimenta la portada del panel (prototipo 21) y responde «¿qué pantallas se usan de verdad?».

create table if not exists ops.uso_dia (
  dia          date    not null,
  ruta         text    not null,            -- patrón de ruta: '/equipo/[id]', '/ojeo', '/mi'…
  vistas       integer not null default 0,
  cache_acierto integer not null default 0, -- páginas servidas desde la caché (sin tocar la base)
  ms_total     bigint  not null default 0,  -- tiempo de servidor acumulado (media = ms_total / vistas)
  primary key (dia, ruta)
);
create table if not exists ops.uso_usuario_dia (
  dia      date not null,
  user_id  text not null,
  vistas   integer not null default 0,
  primary key (dia, user_id)
);
create index if not exists uso_usuario_dia_usuario_idx on ops.uso_usuario_dia (user_id, dia desc);

-- Una página servida. p_ruta = patrón (la web usa el de su router; nunca la URL con parámetros).
create or replace function ops.anota_uso(p_ruta text, p_usuario text, p_cache boolean, p_ms integer)
returns void language plpgsql as $$
declare v_dia date := (now() at time zone 'Europe/Madrid')::date;
begin
  if p_ruta is null or p_ruta !~ '^/' or length(p_ruta) > 120 then return; end if;
  insert into ops.uso_dia (dia, ruta, vistas, cache_acierto, ms_total)
  values (v_dia, p_ruta, 1, case when p_cache then 1 else 0 end, greatest(coalesce(p_ms, 0), 0))
  on conflict (dia, ruta) do update set vistas = ops.uso_dia.vistas + 1,
    cache_acierto = ops.uso_dia.cache_acierto + excluded.cache_acierto, ms_total = ops.uso_dia.ms_total + excluded.ms_total;
  if p_usuario is not null then
    insert into ops.uso_usuario_dia (dia, user_id, vistas) values (v_dia, p_usuario, 1)
    on conflict (dia, user_id) do update set vistas = ops.uso_usuario_dia.vistas + 1;
  end if;
end $$;

-- Resumen para el panel: una fila por día de los últimos N.
create or replace function ops.uso_resumen(p_dias integer default 14)
returns table (dia date, vistas bigint, usuarios bigint, pct_cache numeric, ms_medio numeric, activos_7d bigint)
language sql stable as $$
  with d as (select generate_series((now() at time zone 'Europe/Madrid')::date - (p_dias - 1), (now() at time zone 'Europe/Madrid')::date, '1 day')::date as dia)
  select d.dia,
         coalesce((select sum(u.vistas) from ops.uso_dia u where u.dia = d.dia), 0),
         (select count(*) from ops.uso_usuario_dia x where x.dia = d.dia),
         (select round(100.0 * sum(u.cache_acierto) / nullif(sum(u.vistas), 0), 1) from ops.uso_dia u where u.dia = d.dia),
         (select round(sum(u.ms_total)::numeric / nullif(sum(u.vistas), 0), 0) from ops.uso_dia u where u.dia = d.dia),
         (select count(distinct x.user_id) from ops.uso_usuario_dia x where x.dia between d.dia - 6 and d.dia)
    from d order by d.dia
$$;

-- Qué pantallas se usan (y cuáles no): últimos N días.
create or replace function ops.uso_por_pantalla(p_dias integer default 30)
returns table (ruta text, vistas bigint, pct_cache numeric, ms_medio numeric, dias_con_uso bigint)
language sql stable as $$
  select ruta, sum(vistas), round(100.0 * sum(cache_acierto) / nullif(sum(vistas), 0), 1),
         round(sum(ms_total)::numeric / nullif(sum(vistas), 0), 0), count(*)
    from ops.uso_dia where dia > (now() at time zone 'Europe/Madrid')::date - p_dias
   group by ruta order by 2 desc
$$;

-- Retención: se suma a la purga de la plataforma (0035) sin redefinirla entera.
create or replace function ops.purga_uso() returns jsonb language plpgsql as $$
declare a int; b int;
begin
  delete from ops.uso_dia where dia < current_date - 400; get diagnostics a = row_count;        -- agregados: 13 meses
  delete from ops.uso_usuario_dia where dia < current_date - 90; get diagnostics b = row_count; -- quién entró: 90 días
  return jsonb_build_object('uso_dias', a, 'uso_usuarios', b);
end $$;
create or replace function ops.purga() returns jsonb language sql as $$
  select ops.purga_datos() || ops.purga_plataforma() || ops.purga_uso()
$$;

-- «Usuarios activos» del panel salen ahora de aquí (app.usuario.ultimo_acceso sólo guarda el último).
grant select, insert, update on ops.uso_dia, ops.uso_usuario_dia to facylf_app;
grant execute on function ops.anota_uso(text, text, boolean, integer) to facylf_app;
grant select on ops.uso_dia, ops.uso_usuario_dia to facylf_publicador;
grant delete on ops.uso_dia, ops.uso_usuario_dia to facylf_publicador;
grant execute on function ops.uso_resumen(integer), ops.uso_por_pantalla(integer) to facylf_app, facylf_publicador;
grant execute on function ops.purga_uso(), ops.purga() to facylf_publicador;
