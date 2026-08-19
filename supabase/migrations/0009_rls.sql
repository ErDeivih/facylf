-- Seguridad a nivel de fila.
-- Lo público se lee sin cuenta (el 95% de la gente entra, mira y se va).
-- Escribir requiere cuenta, mayoría de 16 y reputación no quemada.

alter table delegaciones      enable row level security;
alter table temporadas        enable row level security;
alter table competiciones     enable row level security;
alter table clubes            enable row level security;
alter table equipos           enable row level security;
alter table equipos_competicion enable row level security;
alter table partidos          enable row level security;
alter table sanciones         enable row level security;
alter table usuarios          enable row level security;
alter table delegados         enable row level security;
alter table reportes          enable row level security;
alter table goles             enable row level security;
alter table consentimientos   enable row level security;
alter table mensajes          enable row level security;
alter table denuncias         enable row level security;
alter table scrape_log        enable row level security;

-- lectura pública del catálogo y de los resultados
do $$
declare t text;
begin
  foreach t in array array['delegaciones','temporadas','competiciones','clubes',
                           'equipos','equipos_competicion','partidos','sanciones','goles']
  loop
    execute format('create policy %I on %I for select using (true)', 'lee_'||t, t);
  end loop;
end $$;

-- perfil propio
create policy usuarios_lee on usuarios for select using (true);
create policy usuarios_edita on usuarios for update using (auth.uid() = id) with check (auth.uid() = id);

-- reportes: los lee cualquiera, los escribe su dueño si tiene 16 años y no está quemado
create policy reportes_lee on reportes for select using (not descartado);
create policy reportes_escribe on reportes for insert with check (
  auth.uid() = usuario_id
  and exists (select 1 from usuarios u
               where u.id = auth.uid() and u.mayor_de_16 and u.reputacion > -15)
);
create policy reportes_corrige on reportes for update
  using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- mensajes: cerrados hasta que haya moderación. Ver PROYECTO.md §7.
create policy mensajes_lee on mensajes for select using (not oculto);
-- (no hay policy de insert a propósito: el chat se abre en la fase 3)

create policy denuncias_escribe on denuncias for insert
  with check (auth.uid() = usuario_id);

-- el scrape_log es de operación: sólo el service_role, que salta la RLS
