-- Registro de cada petición a la federación. Es lo que permite darse cuenta de que
-- han cambiado el formato: si un parseo devuelve 0 partidos donde antes devolvía 182,
-- salta aquí.

create table scrape_log (
  id              bigserial primary key,
  competicion_id  bigint references competiciones on delete set null,
  url             text not null,
  etag            text,
  hash_contenido  text,
  estado          smallint,         -- 200, 304, 429, 500...
  filas           integer,          -- cuántos partidos ha devuelto el parser
  cambios         smallint not null default 0,
  ms              integer,
  error           text,
  creado          timestamptz not null default now()
);

create index on scrape_log (competicion_id, creado desc);
create index on scrape_log (creado desc) where error is not null;

-- Última vez que una competición se leyó bien. La usa el worker para decidir a quién
-- le toca en este ciclo.
create view estado_ingesta as
select c.id as competicion_id, c.slug,
       max(l.creado) filter (where l.error is null)            as ultimo_ok,
       max(l.creado)                                           as ultimo_intento,
       count(*) filter (where l.error is not null
                          and l.creado > now() - interval '1 hour') as fallos_recientes
  from competiciones c left join scrape_log l on l.competicion_id = c.id
 group by c.id, c.slug;
