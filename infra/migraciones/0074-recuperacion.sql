-- 0074 · Solicitudes de recuperación de contraseña. No se guarda el correo en claro: sólo su SHA-256.
create table if not exists app.recuperacion_solicitud (
  id bigint generated always as identity primary key,
  correo_sha text not null,
  creado_en timestamptz not null default now(),
  atendida_en timestamptz
);
create index if not exists recuperacion_pendiente_idx on app.recuperacion_solicitud (creado_en desc) where atendida_en is null;
grant select, insert, update on app.recuperacion_solicitud to facylf_app;
grant usage, select on sequence app.recuperacion_solicitud_id_seq to facylf_app;
