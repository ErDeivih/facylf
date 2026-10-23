-- 0031 · Registro de usuarios, favoritos, accesos rápidos y notificaciones
--
-- Por qué (David, 22/10/2026): «un login y un registro en el que la gente pueda entrar y buscar sus
-- favoritos, sus equipos, sus competiciones, temporadas, jugadores… guardar los favoritos, recibir
-- notificaciones cuando haya un nuevo partido de un equipo guardado… páginas de acceso rápido».
--
-- Qué añade (aditiva; 0027 sigue igual):
--   1. Modo de registro (`app.ajuste`): 'invitacion' (por defecto: la plataforma es privada), 'aprobacion'
--      (cualquiera se registra y un administrador lo activa) o 'abierto'. Invitaciones con código, paquete,
--      usos y caducidad. `app.alta_usuario()` la llama la web justo después del alta en Better Auth.
--   2. `app.favorito`: equipos (se sigue la LÍNEA del equipo, así «Valdecastro Juvenil A» sigue siendo el
--      favorito la temporada que viene), clubes, competiciones/grupos, jugadores (persona unificada entre
--      federaciones), árbitros y temporadas. Orden propio (accesos rápidos) y «avisarme» por favorito.
--   3. Preferencias de aviso, suscripciones Web Push y la bandeja `app.notificacion` (idempotente: cada
--      aviso tiene una clave única por usuario y no se repite aunque el generador corra dos veces).
--   4. `app.genera_notificaciones()`: compara una foto de los partidos de lo que la gente sigue (ventana de
--      14 días atrás a 21 adelante) con la anterior y crea avisos de: partido programado, cambio de fecha u
--      hora, resultado, acta publicada, jornada completa del grupo seguido, y del jugador seguido (jugó,
--      minutos, goles, expulsión). La primera vez sólo hace la foto (no avisa de todo lo pasado).
--   5. `app.mis_accesos(usuario)`: lo que pinta «Mi panel» con nombres actuales y lo último / lo próximo.
-- Menores: un aviso sobre un jugador menor sólo lleva el nombre si el usuario tiene `ver_menores_nombres`.

-- ── 1. Registro ─────────────────────────────────────────────────────────────────────────────────────
create table if not exists app.ajuste (
  clave text primary key,
  valor text not null,
  descripcion text not null
);
insert into app.ajuste (clave, valor, descripcion) values
  ('registro_modo', 'invitacion', 'invitacion | aprobacion | abierto'),
  ('paquete_por_defecto', 'esencial', 'Paquete con el que entra un usuario aprobado o de registro abierto'),
  ('max_favoritos', '300', 'Favoritos por usuario'),
  ('max_avisos_por_pasada', '30', 'Avisos nuevos por usuario y pasada del generador (el resto, en el resumen)')
on conflict (clave) do nothing;

alter table app.usuario
  add column if not exists estado text not null default 'activo'
    check (estado in ('pendiente', 'activo', 'bloqueado', 'baja')),
  add column if not exists nombre_visible text,
  add column if not exists zona_horaria text not null default 'Europe/Madrid',
  add column if not exists ultimo_acceso timestamptz,
  add column if not exists invitacion text;

create table if not exists app.invitacion (
  codigo      text primary key check (length(codigo) >= 8),
  creada_por  text not null,
  paquete     text not null references app.paquete(codigo),
  usos_max    integer not null default 1 check (usos_max >= 1),
  usos        integer not null default 0,
  caduca_en   timestamptz,
  nota        text,
  creada_en   timestamptz not null default now()
);

-- La llama la web en el gancho «después del alta» de Better Auth, en la misma transacción lógica:
-- si lanza error, la web borra la cuenta recién creada y enseña el motivo.
create or replace function app.alta_usuario(p_user_id text, p_codigo text default null, p_nombre text default null)
returns text language plpgsql as $$
declare v_modo text; v_inv app.invitacion; v_paquete text;
begin
  select valor into v_modo from app.ajuste where clave = 'registro_modo';
  select valor into v_paquete from app.ajuste where clave = 'paquete_por_defecto';
  if p_codigo is not null and btrim(p_codigo) <> '' then
    select * into v_inv from app.invitacion where codigo = btrim(p_codigo) for update;
    if v_inv.codigo is null then raise exception 'INVITACION_NO_EXISTE'; end if;
    if v_inv.caduca_en is not null and v_inv.caduca_en < now() then raise exception 'INVITACION_CADUCADA'; end if;
    if v_inv.usos >= v_inv.usos_max then raise exception 'INVITACION_AGOTADA'; end if;
    update app.invitacion set usos = usos + 1 where codigo = v_inv.codigo;
    insert into app.usuario (user_id, rol, paquete, activo, estado, nombre_visible, invitacion)
    values (p_user_id, 'usuario', v_inv.paquete, true, 'activo', p_nombre, v_inv.codigo)
    on conflict (user_id) do nothing;
    return 'activo';
  end if;
  if v_modo = 'abierto' then
    insert into app.usuario (user_id, paquete, activo, estado, nombre_visible) values (p_user_id, v_paquete, true, 'activo', p_nombre)
    on conflict (user_id) do nothing;
    return 'activo';
  elsif v_modo = 'aprobacion' then
    insert into app.usuario (user_id, paquete, activo, estado, nombre_visible) values (p_user_id, v_paquete, false, 'pendiente', p_nombre)
    on conflict (user_id) do nothing;
    return 'pendiente';
  else
    raise exception 'REGISTRO_SOLO_CON_INVITACION';
  end if;
end $$;

create or replace function app.aprueba_usuario(p_user_id text, p_admin text, p_paquete text default null)
returns void language plpgsql as $$
begin
  if not app.puede(p_admin, 'administrar_usuarios') then raise exception 'SIN_PERMISO'; end if;
  update app.usuario set estado = 'activo', activo = true,
         paquete = coalesce(p_paquete, paquete), notas = coalesce(notas || E'\n', '') || 'aprobado por ' || p_admin || ' el ' || now()::date
   where user_id = p_user_id and estado = 'pendiente';
end $$;

-- ── 2. Favoritos ────────────────────────────────────────────────────────────────────────────────────
create table if not exists app.favorito (
  id          bigint generated always as identity primary key,
  user_id     text   not null references app.usuario(user_id) on delete cascade,
  tipo        text   not null check (tipo in ('equipo', 'club', 'competicion', 'grupo', 'jugador', 'arbitro', 'temporada', 'busqueda')),
  entidad_id  bigint,          -- equipo: team_season de cuando se guardó; club; competition_edition; phase_group; grupo_persona; árbitro; season
  clave       text,            -- equipo: la LÍNEA (club|categoría|género|modalidad|letra); búsqueda: la URL de la búsqueda guardada
  etiqueta    text   not null, -- lo que ve el usuario («Valdecastro Juvenil A»); editable
  orden       integer not null default 0,
  avisar      boolean not null default true,
  creado_en   timestamptz not null default now(),
  unique (user_id, tipo, entidad_id, clave)
);
create index if not exists favorito_tipo_idx on app.favorito (tipo, clave) where avisar;
create index if not exists favorito_usuario_idx on app.favorito (user_id, orden);

-- La línea de un equipo-temporada, con la misma regla que analytics.linea_equipo_temporada (0026).
create or replace function app.linea_de_equipo(p_team_season bigint)
returns text language sql stable as $$
  select ts.club_id || '|' || ce.categoria || '|' || ce.genero || '|' || ce.modalidad || '|'
         || core.letra_de_equipo(coalesce(te.nombre_en_fuente, ts.nombre))
    from core.team_season ts
    join core.team_entry te on te.team_season_id = ts.id
    join core.phase_group pg on pg.id = te.phase_group_id
    join core.competition_edition ce on ce.id = pg.competition_edition_id
   where ts.id = p_team_season
   order by (pg.tipo = 'liga') desc, te.id
   limit 1
$$;

create or replace function app.limita_favoritos() returns trigger language plpgsql as $$
begin
  if new.tipo = 'equipo' and new.clave is null then new.clave := app.linea_de_equipo(new.entidad_id); end if;
  if (select count(*) from app.favorito where user_id = new.user_id)
       >= (select valor::int from app.ajuste where clave = 'max_favoritos') then
    raise exception 'DEMASIADOS_FAVORITOS';
  end if;
  return new;
end $$;
drop trigger if exists favorito_limite on app.favorito;
create trigger favorito_limite before insert on app.favorito for each row execute function app.limita_favoritos();

-- ── 3. Preferencias, suscripciones y bandeja ────────────────────────────────────────────────────────
create table if not exists app.preferencia_aviso (
  user_id        text primary key references app.usuario(user_id) on delete cascade,
  en_app         boolean not null default true,
  push           boolean not null default false,
  correo         text    not null default 'resumen' check (correo in ('nunca', 'al_momento', 'resumen')),
  hora_resumen   time    not null default '08:00',
  silencio_desde time,
  silencio_hasta time,
  eventos        text[]  not null default array['programado', 'cambio_horario', 'resultado', 'acta', 'jornada_completa', 'jugador']
);

create table if not exists app.suscripcion_push (
  id         bigint generated always as identity primary key,
  user_id    text not null references app.usuario(user_id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  agente     text,
  creada_en  timestamptz not null default now(),
  ultima_ok  timestamptz,
  fallos     integer not null default 0
);

create table if not exists app.notificacion (
  id            bigint generated always as identity primary key,
  user_id       text not null references app.usuario(user_id) on delete cascade,
  tipo          text not null,
  clave         text not null,          -- idempotencia: 'resultado:123' no se crea dos veces para el mismo usuario
  titulo        text not null,
  cuerpo        text,
  url           text,
  creada_en     timestamptz not null default now(),
  leida_en      timestamptz,
  push_en       timestamptz,
  correo_en     timestamptz,
  unique (user_id, clave)
);
create index if not exists notificacion_bandeja_idx on app.notificacion (user_id, creada_en desc);
create index if not exists notificacion_push_pend_idx on app.notificacion (creada_en) where push_en is null;

-- ── 4. Generador ────────────────────────────────────────────────────────────────────────────────────
create table if not exists app.foto_partido (
  match_id     bigint primary key references core.match(id) on delete cascade,
  goles_local  smallint,
  goles_visit  smallint,
  cuando       timestamptz,
  con_acta     boolean not null default false,
  vista_en     timestamptz not null default now()
);
create table if not exists app.foto_jornada (
  matchday_id  bigint primary key references core.matchday(id) on delete cascade,
  completa     boolean not null default false
);
create table if not exists app.estado_generador (
  id           boolean primary key default true check (id),
  ultima_pasada timestamptz,
  pasadas      integer not null default 0
);
insert into app.estado_generador (id) values (true) on conflict do nothing;

-- A quién le importa cada equipo-inscripción, grupo y persona de AHORA (ventana del generador).
create or replace view app.seguimiento as
with favs as (
  select f.user_id, f.tipo, f.entidad_id, f.clave from app.favorito f
    join app.usuario u on u.user_id = f.user_id and u.activo
   where f.avisar
)
select fv.user_id, 'equipo'::text as tipo, te.id as team_entry_id, null::bigint as phase_group_id, null::bigint as grupo_persona_id
  from favs fv
  join core.team_season ts on fv.tipo = 'equipo' and ts.club_id = split_part(fv.clave, '|', 1)::bigint
  join core.team_entry te on te.team_season_id = ts.id
  join core.phase_group pg on pg.id = te.phase_group_id
  join core.competition_edition ce on ce.id = pg.competition_edition_id
 where ce.categoria = split_part(fv.clave, '|', 2) and ce.genero = split_part(fv.clave, '|', 3)
   and ce.modalidad = split_part(fv.clave, '|', 4)
   and core.letra_de_equipo(coalesce(te.nombre_en_fuente, ts.nombre)) = split_part(fv.clave, '|', 5)
union all
select fv.user_id, 'club', te.id, null, null
  from favs fv join core.team_season ts on fv.tipo = 'club' and ts.club_id = fv.entidad_id
  join core.team_entry te on te.team_season_id = ts.id
union all
select fv.user_id, 'grupo', null, fv.entidad_id, null from favs fv where fv.tipo = 'grupo'
union all
select fv.user_id, 'grupo', null, pg.id, null from favs fv join core.phase_group pg on fv.tipo = 'competicion' and pg.competition_edition_id = fv.entidad_id
union all
select fv.user_id, 'jugador', null, null, fv.entidad_id from favs fv where fv.tipo = 'jugador';

create or replace function app.genera_notificaciones(p_ahora timestamptz default now())
returns jsonb language plpgsql as $$
declare
  v_primera boolean; v_max int; v_n int := 0; v_ini timestamptz := clock_timestamp();
  v_id0 bigint := (select coalesce(max(id), 0) from app.notificacion);
begin
  select ultima_pasada is null into v_primera from app.estado_generador;
  select valor::int into v_max from app.ajuste where clave = 'max_avisos_por_pasada';

  create temporary table if not exists _seg on commit drop as select * from app.seguimiento limit 0;
  truncate _seg; insert into _seg select * from app.seguimiento;

  -- Partidos en la ventana de lo que alguien sigue (por equipo o por grupo).
  create temporary table if not exists _part on commit drop as
    select m.id as match_id, m.phase_group_id, m.matchday_id, m.home_team_entry_id, m.away_team_entry_id,
           m.goles_local, m.goles_visitante, coalesce(m.played_at, m.fecha_prevista::timestamptz) as cuando,
           exists (select 1 from core.match_report r where r.match_id = m.id) as con_acta, m.official_status
      from core.match m limit 0;
  truncate _part;
  insert into _part
  select m.id, m.phase_group_id, m.matchday_id, m.home_team_entry_id, m.away_team_entry_id, m.goles_local, m.goles_visitante,
         coalesce(m.played_at, m.fecha_prevista::timestamptz),
         exists (select 1 from core.match_report r where r.match_id = m.id), m.official_status
    from core.match m
   where coalesce(m.played_at, m.fecha_prevista::timestamptz) between p_ahora - interval '14 days' and p_ahora + interval '21 days'
     and (m.home_team_entry_id in (select team_entry_id from _seg where team_entry_id is not null)
          or m.away_team_entry_id in (select team_entry_id from _seg where team_entry_id is not null)
          or m.phase_group_id in (select phase_group_id from _seg where phase_group_id is not null)
          or exists (select 1 from core.appearance a join analytics.persona_grupo pgp on pgp.person_id = a.person_id
                      where a.match_id = m.id and pgp.grupo_id in (select grupo_persona_id from _seg where grupo_persona_id is not null))
          or exists (select 1 from core.appearance a where a.match_id = m.id
                      and a.person_id in (select grupo_persona_id from _seg where grupo_persona_id is not null)));

  if not v_primera then
    -- Cambios respecto a la foto anterior → un aviso por usuario interesado.
    with cambios as (
      select p.*, f.match_id is null as nuevo,
             (f.goles_local is null and p.goles_local is not null) as resultado,
             (not coalesce(f.con_acta, false) and p.con_acta) as acta,
             (f.match_id is not null and f.cuando is distinct from p.cuando and p.goles_local is null) as horario
        from _part p left join app.foto_partido f on f.match_id = p.match_id
    ),
    eventos as (
      select 'programado'::text as tipo, 'programado:' || c.match_id as clave, c.* from cambios c
       where c.nuevo and c.goles_local is null and c.cuando > p_ahora and c.official_status <> 'cancelled'
      union all select 'cambio_horario', 'horario:' || c.match_id || ':' || coalesce(extract(epoch from c.cuando)::bigint, 0), c.* from cambios c where c.horario
      union all select 'resultado', 'resultado:' || c.match_id, c.* from cambios c where c.resultado
      union all select 'acta', 'acta:' || c.match_id, c.* from cambios c where c.acta
    ),
    nombres as (
      select e.*, tl.nombre as local, tv.nombre as visitante, g.nombre as grupo
        from eventos e
        left join core.team_entry el on el.id = e.home_team_entry_id left join core.team_season tl on tl.id = el.team_season_id
        left join core.team_entry ev on ev.id = e.away_team_entry_id left join core.team_season tv on tv.id = ev.team_season_id
        join core.phase_group g on g.id = e.phase_group_id
    ),
    destinatarios as (
      select x.*, row_number() over (partition by x.user_id
                                     order by case x.tipo when 'resultado' then 1 when 'cambio_horario' then 2 when 'acta' then 3 else 4 end,
                                              x.cuando desc) as rn
        from (select distinct s.user_id, n.* from nombres n
                join _seg s on (s.team_entry_id in (n.home_team_entry_id, n.away_team_entry_id)) or s.phase_group_id = n.phase_group_id) x
    )
    insert into app.notificacion (user_id, tipo, clave, titulo, cuerpo, url)
    select d.user_id, d.tipo, d.clave,
           case d.tipo
             when 'resultado' then d.local || ' ' || d.goles_local || '-' || d.goles_visitante || ' ' || d.visitante
             when 'acta' then 'Acta publicada: ' || d.local || ' - ' || d.visitante
             when 'cambio_horario' then 'Cambio de horario: ' || d.local || ' - ' || d.visitante
             else 'Próximo partido: ' || d.local || ' - ' || d.visitante end,
           case when d.tipo in ('programado', 'cambio_horario')
                then to_char(d.cuando at time zone 'Europe/Madrid', 'DD/MM HH24:MI') || ' · ' || d.grupo
                else d.grupo end,
           '/partido/' || d.match_id
      from destinatarios d
      join app.usuario u on u.user_id = d.user_id
      left join app.preferencia_aviso pa on pa.user_id = d.user_id
     where d.tipo = any(coalesce(pa.eventos, array['programado','cambio_horario','resultado','acta','jornada_completa','jugador']))
       and coalesce(pa.en_app, true)
       and d.rn <= v_max                                  -- tope por usuario y pasada: lo más importante primero
    on conflict (user_id, clave) do nothing;
    get diagnostics v_n = row_count;

    -- Jugadores seguidos que aparecen en un acta nueva.
    with actas_nuevas as (
      select p.match_id from _part p left join app.foto_partido f on f.match_id = p.match_id
       where p.con_acta and not coalesce(f.con_acta, false)
    ),
    jug as (
      select s.user_id, a.match_id, a.person_id, p.nombre_mostrado, p.es_menor,
             s.grupo_persona_id,
             coalesce(sum(case when e.event_type = 'gol' and coalesce(e.subtipo,'normal') <> 'propia_puerta' then 1 end), 0) as goles,
             bool_or(e.event_type = 'tarjeta_roja') as expulsado,
             max(s2.minutos_exactos) as minutos_temporada
        from _seg s
        -- La persona unificada (0024) o, si no está unida a nadie, ella misma (grupo = person_id).
        cross join lateral (select x.person_id from analytics.persona_grupo x where x.grupo_id = s.grupo_persona_id
                            union select s.grupo_persona_id) pgp
        join core.appearance a on a.person_id = pgp.person_id and a.match_id in (select match_id from actas_nuevas)
        join core.person p on p.id = a.person_id
        left join core.match_event e on e.match_id = a.match_id and e.person_id = a.person_id
        left join analytics.player_team_season_summary s2 on s2.person_id = a.person_id and s2.team_entry_id = a.team_entry_id
       where s.tipo = 'jugador'
       group by s.user_id, a.match_id, a.person_id, p.nombre_mostrado, p.es_menor, s.grupo_persona_id
    )
    insert into app.notificacion (user_id, tipo, clave, titulo, cuerpo, url)
    select j.user_id, 'jugador', 'jugador:' || j.match_id || ':' || j.person_id,
           case when j.es_menor and not app.puede(j.user_id, 'ver_menores_nombres') then 'Un jugador que sigues' else j.nombre_mostrado end
             || case when j.goles > 0 then ' marcó ' || j.goles || case when j.goles = 1 then ' gol' else ' goles' end
                     when j.expulsado then ' fue expulsado' else ' jugó' end,
           'Acta publicada', '/jugador/' || j.grupo_persona_id
      from jug j
      left join app.preferencia_aviso pa on pa.user_id = j.user_id
     where 'jugador' = any(coalesce(pa.eventos, array['jugador']))
    on conflict (user_id, clave) do nothing;

    -- Jornada completa en un grupo seguido.
    with jornadas as (
      select p.matchday_id, p.phase_group_id,
             bool_and(p.goles_local is not null or p.official_status in ('cancelled','postponed')) as completa
        from _part p join core.match m on m.matchday_id = p.matchday_id
       group by p.matchday_id, p.phase_group_id
    ),
    nuevas as (
      select j.* from jornadas j left join app.foto_jornada f on f.matchday_id = j.matchday_id
       where j.completa and not coalesce(f.completa, false)
    )
    insert into app.notificacion (user_id, tipo, clave, titulo, cuerpo, url)
    select distinct s.user_id, 'jornada_completa', 'jornada:' || n.matchday_id,
           'Jornada ' || md.numero || ' completa · ' || g.nombre, 'Clasificación actualizada', '/competicion/' || g.competition_edition_id || '?grupo=' || g.id
      from nuevas n
      join _seg s on s.phase_group_id = n.phase_group_id
      join core.matchday md on md.id = n.matchday_id
      join core.phase_group g on g.id = n.phase_group_id
    on conflict (user_id, clave) do nothing;
  end if;

  -- Foto nueva.
  insert into app.foto_partido (match_id, goles_local, goles_visit, cuando, con_acta, vista_en)
  select match_id, goles_local, goles_visitante, cuando, con_acta, p_ahora from _part
  on conflict (match_id) do update set goles_local = excluded.goles_local, goles_visit = excluded.goles_visit,
    cuando = excluded.cuando, con_acta = excluded.con_acta, vista_en = excluded.vista_en;
  insert into app.foto_jornada (matchday_id, completa)
  select p.matchday_id, bool_and(m.goles_local is not null or m.official_status in ('cancelled','postponed'))
    from (select distinct matchday_id from _part) p join core.match m on m.matchday_id = p.matchday_id
   group by p.matchday_id
  on conflict (matchday_id) do update set completa = excluded.completa;
  delete from app.foto_partido where vista_en < p_ahora - interval '60 days';

  update app.estado_generador set ultima_pasada = p_ahora, pasadas = pasadas + 1;
  return jsonb_build_object('primera', v_primera, 'partidos_vigilados', (select count(*) from _part),
    'avisos', (select count(*) from app.notificacion where id > v_id0),
    'ms', (extract(epoch from clock_timestamp() - v_ini) * 1000)::int);
end $$;

comment on function app.genera_notificaciones(timestamptz) is
  'Lo llama scripts/notificaciones.mjs tras cada pasada del proyector. Idempotente (clave única por usuario). '
  'La primera vez sólo guarda la foto: no avisa de lo que ya pasó.';

-- ── 5. Mi panel ─────────────────────────────────────────────────────────────────────────────────────
-- Una fila por favorito, con el nombre ACTUAL, la temporada en curso y lo último / lo próximo (equipos).
create or replace function app.mis_accesos(p_usuario text)
returns table (id bigint, tipo text, etiqueta text, url text, orden integer, avisar boolean,
               ultimo text, ultimo_url text, proximo text, proximo_url text)
language sql stable as $$
  with f as (select * from app.favorito where user_id = p_usuario),
  temporada as (select id from core.season order by orden desc limit 1),
  equipos_ahora as (
    select f.id as fav, te.id as te
      from f
      join core.team_season ts on f.tipo = 'equipo' and ts.club_id = split_part(f.clave, '|', 1)::bigint and ts.season_id = (select id from temporada)
      join core.team_entry te on te.team_season_id = ts.id
      join core.phase_group pg on pg.id = te.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
     where ce.categoria = split_part(f.clave, '|', 2) and ce.genero = split_part(f.clave, '|', 3)
       and core.letra_de_equipo(coalesce(te.nombre_en_fuente, ts.nombre)) = split_part(f.clave, '|', 5)
  ),
  ult as (
    select distinct on (ea.fav) ea.fav, m.id, m.goles_local, m.goles_visitante, m.home_team_entry_id, m.away_team_entry_id
      from equipos_ahora ea join core.match m on ea.te in (m.home_team_entry_id, m.away_team_entry_id)
     where m.goles_local is not null order by ea.fav, coalesce(m.played_at, m.fecha_prevista::timestamptz) desc
  ),
  prox as (
    select distinct on (ea.fav) ea.fav, m.id, coalesce(m.played_at, m.fecha_prevista::timestamptz) as cuando, m.home_team_entry_id, m.away_team_entry_id
      from equipos_ahora ea join core.match m on ea.te in (m.home_team_entry_id, m.away_team_entry_id)
     where m.goles_local is null and coalesce(m.played_at, m.fecha_prevista::timestamptz) >= now() - interval '3 hours'
       and m.official_status not in ('cancelled')
     order by ea.fav, coalesce(m.played_at, m.fecha_prevista::timestamptz)
  ),
  nom as (select te.id, ts.nombre from core.team_entry te join core.team_season ts on ts.id = te.team_season_id)
  select f.id, f.tipo, f.etiqueta,
         case f.tipo when 'equipo' then '/equipo/' || coalesce((select min(te) from equipos_ahora ea where ea.fav = f.id), f.entidad_id)
                     when 'club' then '/club/' || f.entidad_id when 'competicion' then '/competicion/' || f.entidad_id
                     when 'grupo' then '/competicion/grupo/' || f.entidad_id when 'jugador' then '/jugador/' || f.entidad_id
                     when 'arbitro' then '/arbitro/' || f.entidad_id when 'temporada' then '/explorar?temporada=' || f.entidad_id
                     else f.clave end,
         f.orden, f.avisar,
         (select nl.nombre || ' ' || u.goles_local || '-' || u.goles_visitante || ' ' || nv.nombre from ult u
            join nom nl on nl.id = u.home_team_entry_id join nom nv on nv.id = u.away_team_entry_id where u.fav = f.id),
         (select '/partido/' || u.id from ult u where u.fav = f.id),
         (select nl.nombre || ' - ' || nv.nombre || ' · ' || to_char(p.cuando at time zone 'Europe/Madrid', 'DD/MM HH24:MI') from prox p
            join nom nl on nl.id = p.home_team_entry_id join nom nv on nv.id = p.away_team_entry_id where p.fav = f.id),
         (select '/partido/' || p.id from prox p where p.fav = f.id)
    from f order by f.orden, f.creado_en
$$;

-- ── 6. Permisos ─────────────────────────────────────────────────────────────────────────────────────
grant select on app.ajuste to facylf_app;
grant update on app.ajuste to facylf_app;                      -- sólo desde la pantalla de administración
grant select, insert, update, delete on app.invitacion, app.favorito, app.preferencia_aviso, app.suscripcion_push to facylf_app;
grant select, update on app.notificacion to facylf_app;        -- marcar leída; no puede crear avisos
grant usage, select on all sequences in schema app to facylf_app;
grant execute on function app.alta_usuario(text, text, text), app.aprueba_usuario(text, text, text),
                          app.linea_de_equipo(bigint), app.mis_accesos(text) to facylf_app;
-- El generador y la entrega corren con facylf_publicador.
grant usage on schema app to facylf_publicador;
grant select on app.usuario, app.ajuste, app.favorito, app.preferencia_aviso, app.seguimiento,
                app.paquete, app.paquete_capacidad, app.usuario_capacidad to facylf_publicador;
grant select, insert, update, delete on app.notificacion, app.foto_partido, app.foto_jornada, app.estado_generador,
                                        app.suscripcion_push to facylf_publicador;
grant usage, select on all sequences in schema app to facylf_publicador;
grant execute on function app.genera_notificaciones(timestamptz), app.puede(text, text) to facylf_publicador;
