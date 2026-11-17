-- 0071 · Observabilidad mínima: una fila por visita de página, sin cookies de terceros ni IP.
create table if not exists app.evento_web (
  id bigint generated always as identity primary key,
  ruta text not null check (length(ruta) between 1 and 300),
  referrer text check (referrer is null or length(referrer) <= 500),
  creado_en timestamptz not null default now()
);
create index if not exists evento_web_fecha_idx on app.evento_web (creado_en desc);
create index if not exists evento_web_ruta_idx on app.evento_web (ruta, creado_en desc);
comment on table app.evento_web is 'Vistas de página agregables; no guarda IP, cookie ni identificador de persona.';
grant select, insert on app.evento_web to facylf_app;
grant usage, select on sequence app.evento_web_id_seq to facylf_app;
