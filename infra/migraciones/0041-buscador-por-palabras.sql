-- 0041 · Buscador rápido también con nombres muy comunes.
--
-- Medido el 22/10/2026 (pruebas/sql/buscador.mjs: 2 millones de personas con nombres y apellidos frecuentes):
-- la consulta `busqueda-por-nombre` buscaba el texto DENTRO de todos los nombres (`like '%texto%'` con trigramas)
-- y luego ordenaba y contaba todas las coincidencias: «garcía» 6,6 s (462.555 coincidencias), «pe» 4,0 s,
-- «gonzález» 2,4 s. Un nombre raro, 25 ms. El buscador es lo más usado de la web: no puede ir así.
--
-- Ahora: un índice de PALABRAS (`analytics.search_palabra`: cada palabra de cada nombre, con su popularidad),
-- que se mantiene solo con disparadores sobre `analytics.search_entity`. La consulta empieza por la palabra
-- escrita que menos nombres tiene (se cuenta con tope), toma sus coincidencias por prefijo de palabra, y filtra
-- con las demás palabras. Con palabras muy comunes se queda con las 5.000 entidades más populares que la llevan
-- (el usuario afina escribiendo un apellido más); el total se da con tope («más de 5.000»).

create table if not exists analytics.search_palabra (
  palabra         text     not null,
  entity_type     text     not null,
  entity_id       bigint   not null,
  normalized_name text     not null,       -- la fila de search_entity de la que sale (los alias son filas aparte)
  popularidad     integer  not null default 0,
  federation_id   smallint not null,
  restringida     boolean  not null default false,
  primary key (entity_type, entity_id, normalized_name, palabra)
);
-- Sin filtrar `restringida`: la búsqueda original tampoco lo hacía (qué se enseña lo decide la página con los permisos).
create index if not exists search_palabra_prefijo_idx on analytics.search_palabra (palabra text_pattern_ops, popularidad desc);

-- Palabras de un nombre normalizado: distintas, de 2 letras o más (una sola letra no sirve para buscar).
create or replace function analytics.palabras_de(p_nombre text) returns setof text language sql immutable parallel safe as $$
  select distinct w from regexp_split_to_table(btrim(coalesce(p_nombre, '')), '\s+') w where length(w) >= 2
$$;

create or replace function analytics.mantiene_search_palabra() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    delete from analytics.search_palabra
     where entity_type = old.entity_type and entity_id = old.entity_id and normalized_name = old.normalized_name;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into analytics.search_palabra (palabra, entity_type, entity_id, normalized_name, popularidad, federation_id, restringida)
    select w, new.entity_type, new.entity_id, new.normalized_name, coalesce(new.popularidad, 0), new.federation_id, coalesce(new.restringida, false)
      from analytics.palabras_de(new.normalized_name) w
    on conflict do nothing;
  end if;
  return null;
end $$;

drop trigger if exists search_palabra_sync on analytics.search_entity;
create trigger search_palabra_sync after insert or update or delete on analytics.search_entity
  for each row execute function analytics.mantiene_search_palabra();

-- Relleno inicial (con la base ya proyectada; vacía, no hace nada).
insert into analytics.search_palabra (palabra, entity_type, entity_id, normalized_name, popularidad, federation_id, restringida)
select w, se.entity_type, se.entity_id, se.normalized_name, coalesce(se.popularidad, 0), se.federation_id, coalesce(se.restringida, false)
  from analytics.search_entity se cross join lateral analytics.palabras_de(se.normalized_name) w
on conflict do nothing;
analyze analytics.search_palabra;

grant select on analytics.search_palabra to facylf_lector, facylf_app;
grant select, insert, update, delete on analytics.search_palabra to facylf_publicador;
grant execute on function analytics.palabras_de(text) to facylf_lector, facylf_app, facylf_publicador;
