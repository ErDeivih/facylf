-- 0045 · Buscador: nombre y apellido comunes a la vez («hugo garcía», «garcía lópez»).
--
-- Límite que dejaba 0041 (medido el 23/10/2026 con 2 millones de personas): con DOS palabras muy comunes la
-- búsqueda partía de la menos común de las dos, pero las dos pasaban de 5.000 coincidencias, así que sólo se
-- miraban las 5.000 más populares de la primera: «garcía lópez» daba 150 de los miles que hay.
-- Ahora también hay un índice de PARES de palabras seguidas del nombre (`analytics.search_par`: «garcia lopez»,
-- «hugo garcia»…). La consulta prueba cada palabra escrita y cada par de palabras seguidas (en los dos órdenes)
-- y empieza por lo que tenga menos coincidencias: un nombre y apellido juntos casi nunca pasan de unos cientos.
-- Tabla aparte (y no filas en search_palabra) para que las búsquedas de una sola palabra no lean pares.

create table if not exists analytics.search_par (
  par             text     not null,       -- 'garcia lopez' (dos palabras seguidas del nombre normalizado)
  entity_type     text     not null,
  entity_id       bigint   not null,
  normalized_name text     not null,
  popularidad     integer  not null default 0,
  primary key (entity_type, entity_id, normalized_name, par)
);
create index if not exists search_par_prefijo_idx on analytics.search_par (par text_pattern_ops, popularidad desc);

-- Pares de palabras seguidas (de 2 letras o más cada una).
create or replace function analytics.pares_de(p_nombre text) returns setof text language sql immutable parallel safe as $$
  with w as (select x.w, x.i from regexp_split_to_table(btrim(coalesce(p_nombre, '')), '\s+') with ordinality x(w, i)
              where length(x.w) >= 2)
  select distinct a.w || ' ' || b.w from w a join w b on b.i = a.i + 1
$$;

-- El disparador de 0041 mantiene ahora las dos tablas.
create or replace function analytics.mantiene_search_palabra() returns trigger language plpgsql as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    delete from analytics.search_palabra
     where entity_type = old.entity_type and entity_id = old.entity_id and normalized_name = old.normalized_name;
    delete from analytics.search_par
     where entity_type = old.entity_type and entity_id = old.entity_id and normalized_name = old.normalized_name;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into analytics.search_palabra (palabra, entity_type, entity_id, normalized_name, popularidad, federation_id, restringida)
    select w, new.entity_type, new.entity_id, new.normalized_name, coalesce(new.popularidad, 0), new.federation_id, coalesce(new.restringida, false)
      from analytics.palabras_de(new.normalized_name) w
    on conflict do nothing;
    insert into analytics.search_par (par, entity_type, entity_id, normalized_name, popularidad)
    select p, new.entity_type, new.entity_id, new.normalized_name, coalesce(new.popularidad, 0)
      from analytics.pares_de(new.normalized_name) p
    on conflict do nothing;
  end if;
  return null;
end $$;

-- Relleno inicial (con la base ya proyectada).
insert into analytics.search_par (par, entity_type, entity_id, normalized_name, popularidad)
select p, se.entity_type, se.entity_id, se.normalized_name, coalesce(se.popularidad, 0)
  from analytics.search_entity se cross join lateral analytics.pares_de(se.normalized_name) p
on conflict do nothing;
analyze analytics.search_par;

grant select on analytics.search_par to facylf_lector, facylf_app;
grant select, insert, update, delete on analytics.search_par to facylf_publicador;
grant execute on function analytics.pares_de(text) to facylf_lector, facylf_app, facylf_publicador;
