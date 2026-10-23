-- 0033 · Espacios publicitarios y patrocinios (preparado; apagado por defecto)
--
-- Por qué (David, 22/10/2026): aprender cómo se ponen anuncios (Google, Meta…), dónde y cómo se administran.
-- Guía completa: docs/plataforma-web/PUBLICIDAD.md. Aquí sólo lo que la web necesita para pintarlos y medirlos:
--   · `app.espacio_anuncio`: cada hueco de la web (página + posición + formato), con su proveedor:
--     'ninguno' (por defecto: la plataforma es privada y NO lleva anuncios), 'adsense' o 'directo'.
--   · `app.campana_anuncio`: patrocinios directos (p. ej. un comercio local en las páginas de su liga), con
--     segmentación por federación, competición o club, fechas, prioridad y tope de impresiones.
--   · `ops.anuncio_dia`: impresiones y clics por espacio y campaña, contados en el servidor sin cookies.
--   · `app.elige_campana()`: qué patrocinio sale en un hueco para una página concreta.
--   · `app.paquete.sin_anuncios`: los paquetes de pago pueden ir sin anuncios.
-- Nunca hay anuncios en: acceso y registro, cuenta, administración, ni en fichas de menores (comprobado
-- en `app.elige_campana` y en el componente de la web).

alter table app.paquete add column if not exists sin_anuncios boolean not null default false;
update app.paquete set sin_anuncios = true where codigo in ('ojeador', 'analista');

create table if not exists app.espacio_anuncio (
  codigo       text primary key,                     -- 'competicion-entre-jornadas', 'ficha-lateral'…
  pagina       text not null,                        -- patrón de ruta: '/competicion/[id]'
  posicion     text not null,                        -- 'lateral', 'entre-secciones', 'pie', 'ancla-movil'
  formato      text not null check (formato in ('rectangulo_300x250', 'media_pagina_300x600', 'banner_728x90',
                                                'banner_movil_320x100', 'nativo', 'ancla_movil')),
  proveedor    text not null default 'ninguno' check (proveedor in ('ninguno', 'adsense', 'directo')),
  adsense_slot text,                                 -- data-ad-slot del bloque en AdSense
  activo       boolean not null default false,
  nota         text
);
insert into app.espacio_anuncio (codigo, pagina, posicion, formato, nota) values
  ('inicio-entre-secciones', '/', 'entre-secciones', 'nativo', 'Entre «Explorar» y «Tus equipos»'),
  ('competicion-lateral', '/competicion/[id]', 'lateral', 'media_pagina_300x600', 'Escritorio: columna derecha, pegajoso'),
  ('competicion-entre-jornadas', '/competicion/[id]', 'entre-secciones', 'rectangulo_300x250', 'Tras la clasificación, antes de la jornada'),
  ('acta-pie', '/partido/[id]', 'pie', 'banner_728x90', 'Debajo de las alineaciones (móvil: 320x100)'),
  ('equipo-entre-secciones', '/equipo/[id]', 'entre-secciones', 'rectangulo_300x250', 'Entre gráficos y plantilla'),
  ('rankings-entre-filas', '/rankings', 'entre-secciones', 'nativo', 'Cada 25 filas como mucho, nunca dentro de la tabla'),
  ('movil-ancla', '*', 'ancla-movil', 'ancla_movil', 'Barra inferior cerrable; sólo móvil')
on conflict (codigo) do nothing;

create table if not exists app.campana_anuncio (
  id             bigint generated always as identity primary key,
  patrocinador   text not null,
  titulo         text not null,
  imagen_url     text not null,                      -- subida al propio servidor (CSP: sin terceros)
  destino_url    text not null check (destino_url ~ '^https://'),
  espacios       text[] not null,                    -- códigos de app.espacio_anuncio
  federaciones   smallint[],                         -- NULL = todas
  ediciones      bigint[],
  clubes         bigint[],
  desde          date not null,
  hasta          date not null,
  prioridad      smallint not null default 1,
  tope_impresiones integer,
  activa         boolean not null default true,
  creada_por     text not null,
  creada_en      timestamptz not null default now(),
  check (hasta >= desde)
);

create table if not exists ops.anuncio_dia (
  dia          date   not null,
  espacio      text   not null,
  campana_id   bigint not null default 0,            -- 0 = AdSense u otro proveedor externo
  impresiones  integer not null default 0,
  clics        integer not null default 0,
  primary key (dia, espacio, campana_id)
);

-- Qué patrocinio sale en un hueco. NULL = nada (o que la web pinte AdSense si el espacio es 'adsense').
create or replace function app.elige_campana(p_espacio text, p_federacion smallint, p_edicion bigint, p_club bigint,
                                             p_usuario text, p_pagina_con_menores boolean)
returns table (campana_id bigint, titulo text, imagen_url text, destino_url text, proveedor text, adsense_slot text)
language sql stable as $$
  with esp as (select * from app.espacio_anuncio where codigo = p_espacio and activo and proveedor <> 'ninguno'),
  sin as (select coalesce(bool_or(p.sin_anuncios), false) as sin
            from app.usuario u join app.paquete p on p.codigo = u.paquete where u.user_id = p_usuario)
  select c.id, c.titulo, c.imagen_url, c.destino_url, e.proveedor, e.adsense_slot
    from esp e
    left join lateral (
      select c.* from app.campana_anuncio c
       where e.proveedor = 'directo' and c.activa and p_espacio = any(c.espacios)
         and current_date between c.desde and c.hasta
         and (c.federaciones is null or p_federacion = any(c.federaciones))
         and (c.ediciones is null or p_edicion = any(c.ediciones))
         and (c.clubes is null or p_club = any(c.clubes))
         and (c.tope_impresiones is null or c.tope_impresiones >
              (select coalesce(sum(impresiones), 0) from ops.anuncio_dia d where d.campana_id = c.id))
       order by c.prioridad desc, random() limit 1) c on true
   where not p_pagina_con_menores and not (select sin from sin)
     and (e.proveedor = 'adsense' or c.id is not null)
$$;

create or replace function ops.cuenta_anuncio(p_espacio text, p_campana bigint, p_clic boolean)
returns void language sql as $$
  insert into ops.anuncio_dia (dia, espacio, campana_id, impresiones, clics)
  values (current_date, p_espacio, coalesce(p_campana, 0), case when p_clic then 0 else 1 end, case when p_clic then 1 else 0 end)
  on conflict (dia, espacio, campana_id) do update set
    impresiones = ops.anuncio_dia.impresiones + excluded.impresiones, clics = ops.anuncio_dia.clics + excluded.clics
$$;

grant select on app.espacio_anuncio, app.campana_anuncio to facylf_app;
grant insert, update, delete on app.espacio_anuncio, app.campana_anuncio to facylf_app;   -- pantalla de administración
grant usage, select on all sequences in schema app to facylf_app;
grant select on ops.anuncio_dia to facylf_app;
grant execute on function app.elige_campana(text, smallint, bigint, bigint, text, boolean), ops.cuenta_anuncio(text, bigint, boolean) to facylf_app;
grant insert, update on ops.anuncio_dia to facylf_app;
