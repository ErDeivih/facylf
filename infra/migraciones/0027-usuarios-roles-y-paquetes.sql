-- 0027 · Usuarios, roles y paquetes
--
-- La plataforma es privada (David y su gente) pero con cuentas: cada persona entra con su usuario y ve lo
-- que su paquete le permite. Dos roles: `administrador` (todo, gestiona usuarios y decisiones) y `usuario`.
-- Cada usuario tiene un PAQUETE (conjunto de capacidades) y, aparte, capacidades sueltas que concede un
-- administrador (por ejemplo ver nombres de menores, que no va en ningún paquete).
--
-- La autenticación (contraseñas, sesiones, 2FA) la lleva Better Auth en el esquema `auth`, con sus propias
-- tablas. Aquí sólo vive lo NUESTRO, referenciado por el id de usuario de Better Auth (texto).
-- La comprobación es una función, `app.puede(usuario, capacidad)`, que usa el servidor web en cada acción.
-- Aditiva: 0001-0026 no se tocan.

create schema if not exists app;
create schema if not exists auth;

-- Rol con el que la web ESCRIBE lo poco que escribe: cuentas, decisiones de identidad, reglamentos.
-- Lo que lee sigue siendo con facylf_lector. La contraseña se asigna fuera (ALTER ROLE … PASSWORD).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'facylf_app') then
    create role facylf_app login nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;

create table if not exists app.capacidad (
  codigo       text primary key,
  descripcion  text not null,
  sensible     boolean not null default false   -- se registra cada uso en app.registro_acceso
);

insert into app.capacidad (codigo, descripcion, sensible) values
  ('buscar', 'Buscar jugadores, clubes, equipos y competiciones', false),
  ('ver_fichas', 'Fichas de club, equipo, jugador, competición, árbitro y campo', false),
  ('ver_actas', 'Actas de partido con alineaciones y eventos', false),
  ('rankings', 'Rankings de goleadores y disciplina', false),
  ('panel_equipo', 'Panel de equipo con gráficos y previa de partido', false),
  ('comparar', 'Comparador de jugadores y equipos', false),
  ('cruzar_federaciones', 'Filtros y rankings que cruzan varias federaciones', false),
  ('exportar_pdf', 'Descargar informes en PDF', false),
  ('analisis_ligas', 'Comparación de ligas y análisis de datos agregados', false),
  ('exportar_datos', 'Descargar datos en CSV/Parquet', true),
  ('ver_menores_nombres', 'Ver nombres de jugadores menores de edad', true),
  ('confirmar_identidades', 'Unir o separar fichas de jugadores', true),
  ('gestionar_reglamentos', 'Fijar ascensos, descensos y promociones de un grupo', true),
  ('administrar_usuarios', 'Crear usuarios y asignar paquetes', true)
on conflict (codigo) do nothing;

create table if not exists app.paquete (
  codigo       text primary key,
  nombre       text not null,
  descripcion  text not null,
  orden        smallint not null default 0,
  activo       boolean not null default true
);

create table if not exists app.paquete_capacidad (
  paquete    text not null references app.paquete(codigo) on delete cascade,
  capacidad  text not null references app.capacidad(codigo),
  primary key (paquete, capacidad)
);

insert into app.paquete (codigo, nombre, descripcion, orden) values
  ('esencial', 'Esencial', 'Buscar y consultar fichas, actas, clasificaciones y rankings.', 1),
  ('ojeador', 'Ojeador', 'Esencial + panel de equipo, comparador, cruce de federaciones y PDF.', 2),
  ('analista', 'Analista', 'Ojeador + análisis entre ligas y exportación de datos.', 3)
on conflict (codigo) do nothing;

insert into app.paquete_capacidad (paquete, capacidad)
select p, c from (values
  ('esencial', 'buscar'), ('esencial', 'ver_fichas'), ('esencial', 'ver_actas'), ('esencial', 'rankings'),
  ('ojeador', 'buscar'), ('ojeador', 'ver_fichas'), ('ojeador', 'ver_actas'), ('ojeador', 'rankings'),
  ('ojeador', 'panel_equipo'), ('ojeador', 'comparar'), ('ojeador', 'cruzar_federaciones'), ('ojeador', 'exportar_pdf'),
  ('analista', 'buscar'), ('analista', 'ver_fichas'), ('analista', 'ver_actas'), ('analista', 'rankings'),
  ('analista', 'panel_equipo'), ('analista', 'comparar'), ('analista', 'cruzar_federaciones'), ('analista', 'exportar_pdf'),
  ('analista', 'analisis_ligas'), ('analista', 'exportar_datos')
) v(p, c)
on conflict do nothing;

create table if not exists app.usuario (
  user_id      text primary key,                 -- id del usuario en Better Auth (auth.user)
  rol          text not null default 'usuario' check (rol in ('administrador', 'usuario')),
  paquete      text references app.paquete(codigo),
  valido_hasta date,                             -- null = sin caducidad
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  notas        text
);

create table if not exists app.usuario_capacidad (
  user_id      text not null references app.usuario(user_id) on delete cascade,
  capacidad    text not null references app.capacidad(codigo),
  concedida_por text not null,
  hasta        date,
  motivo       text not null,
  creada_en    timestamptz not null default now(),
  primary key (user_id, capacidad)
);

create table if not exists app.registro_acceso (
  id         bigint generated always as identity primary key,
  user_id    text not null,
  capacidad  text not null,
  entidad    text,                                -- 'persona:123', 'export:goleadores-2025-26'…
  en         timestamptz not null default now()
);
create index if not exists registro_acceso_usuario_idx on app.registro_acceso (user_id, en desc);

-- ¿Puede este usuario hacer esto? Administrador activo: todo. Usuario activo y vigente: su paquete y sus
-- capacidades sueltas vigentes.
create or replace function app.puede(p_usuario text, p_capacidad text)
returns boolean language sql stable as $$
  select coalesce((
    select u.activo and (u.valido_hasta is null or u.valido_hasta >= current_date)
           and (u.rol = 'administrador'
                or exists (select 1 from app.paquete_capacidad pc join app.paquete p on p.codigo = pc.paquete and p.activo
                            where pc.paquete = u.paquete and pc.capacidad = p_capacidad)
                or exists (select 1 from app.usuario_capacidad uc
                            where uc.user_id = u.user_id and uc.capacidad = p_capacidad
                              and (uc.hasta is null or uc.hasta >= current_date)))
      from app.usuario u where u.user_id = p_usuario), false)
$$;

create or replace function app.capacidades_de(p_usuario text)
returns text[] language sql stable as $$
  select coalesce(array_agg(c.codigo order by c.codigo), '{}') from app.capacidad c where app.puede(p_usuario, c.codigo)
$$;

-- Permisos: la web (facylf_app) gestiona cuentas y escribe decisiones humanas; nada más del canónico.
grant usage on schema app, auth to facylf_app;
grant usage on schema core, analytics to facylf_app;
grant select on all tables in schema app to facylf_app;
grant insert, update, delete on app.usuario, app.usuario_capacidad to facylf_app;
grant insert on app.registro_acceso to facylf_app;
grant usage, select on all sequences in schema app to facylf_app;
grant create on schema auth to facylf_app;                -- Better Auth crea y migra sus tablas aquí
grant select, insert, update on core.identity_decision to facylf_app;
grant usage, select on sequence core.identity_decision_id_seq to facylf_app;
grant select, update on core.identity_candidate to facylf_app;
grant select, insert, update, delete on core.reglamento_grupo to facylf_app;
grant usage, select on sequence core.reglamento_grupo_id_seq to facylf_app;
grant execute on function app.puede(text, text), app.capacidades_de(text) to facylf_app;
grant usage on schema app to facylf_lector;
grant select on app.capacidad, app.paquete, app.paquete_capacidad to facylf_lector;
