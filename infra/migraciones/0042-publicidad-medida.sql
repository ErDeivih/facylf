-- 0042 · Publicidad medida de verdad: impresiones VISTAS, reparto de campañas, interruptor general e informe.
--
-- Revisado el 23/10/2026 sobre 0033 (sigue todo APAGADO por defecto: la plataforma es privada):
--   · 0033 contaba una impresión al pintar la página, aunque el hueco quedase al final y nadie lo viera. Lo que
--     se cobra (y lo que mide AdSense) es la impresión VISIBLE: al menos el 50 % del anuncio en pantalla durante
--     1 segundo seguido (norma IAB/MRC). Ahora hay tres eventos: 'impresion' (se sirvió), 'vista' (fue visible)
--     y 'clic'. La web manda 'vista' con IntersectionObserver + navigator.sendBeacon
--     (docs/plataforma-web/codigo/anuncio.tsx).
--   · Los eventos llegan de navegadores: sólo se cuentan para huecos y campañas que existen y casan (nada de
--     filas basura con códigos inventados), y un clic sin impresión previa ese día no cuenta.
--   · Una campaña con tope de impresiones se gastaba entera el primer día. Ahora: reparto 'uniforme' (por
--     defecto: no adelanta más de un 10 % al ritmo que toca por días transcurridos) o 'lo_antes_posible', y
--     un tope diario opcional.
--   · Interruptor general (ops.parametro 'anuncios_encendidos' = 0 apaga todos los huecos de golpe).
--   · Precio de los patrocinios (CPM o importe fijo) para el informe y la factura; AdSense, estimado con el RPM
--     de ops.parametro (INGRESOS.md: 1-3 € por mil en España) hasta que se lea su API.

alter table ops.anuncio_dia add column if not exists vistas integer not null default 0;
create index if not exists anuncio_dia_campana_idx on ops.anuncio_dia (campana_id, dia);

alter table app.campana_anuncio
  add column if not exists reparto     text not null default 'uniforme',
  add column if not exists tope_diario integer,
  add column if not exists precio_cpm  numeric(8,2),          -- € por 1.000 impresiones vistas
  add column if not exists importe_fijo numeric(10,2);        -- € por toda la campaña (excluyente con el CPM)
do $$ begin
  alter table app.campana_anuncio add constraint campana_reparto_check check (reparto in ('uniforme', 'lo_antes_posible'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table app.campana_anuncio add constraint campana_precio_check check (
    (precio_cpm is null or precio_cpm >= 0) and (importe_fijo is null or importe_fijo >= 0)
    and not (precio_cpm is not null and importe_fijo is not null)
    and (tope_diario is null or tope_diario > 0) and (tope_impresiones is null or tope_impresiones > 0));
exception when duplicate_object then null; end $$;

insert into ops.parametro (clave, valor, descripcion) values
  ('anuncios_encendidos', 1, 'Interruptor general de publicidad: 0 apaga todos los huecos aunque estén activos'),
  ('adsense_rpm_estimado', 1.5, '€ estimados por 1.000 impresiones vistas de AdSense (hasta leer su API; INGRESOS.md)'),
  ('anuncio_adelanto_max', 1.10, 'Reparto uniforme: cuánto puede adelantarse una campaña a su ritmo (1,10 = 10 %)')
on conflict (clave) do nothing;

-- Ritmo de una campaña: lo servido frente a lo que tocaría por días transcurridos (1 = al día).
create or replace function app.ritmo_campana(c app.campana_anuncio, p_servidas bigint, p_hoy date default current_date)
returns numeric language sql immutable as $$
  select case when c.tope_impresiones is null then null
              else round(p_servidas::numeric
                         / greatest(1, c.tope_impresiones::numeric * least(1, (p_hoy - c.desde + 1)::numeric / (c.hasta - c.desde + 1))), 3) end
$$;

-- Misma firma y columnas que en 0033 (la web no cambia): ahora con interruptor, reparto y tope diario.
create or replace function app.elige_campana(p_espacio text, p_federacion smallint, p_edicion bigint, p_club bigint,
                                             p_usuario text, p_pagina_con_menores boolean)
returns table (campana_id bigint, titulo text, imagen_url text, destino_url text, proveedor text, adsense_slot text)
language sql stable as $$
  with esp as (select * from app.espacio_anuncio
                where codigo = p_espacio and activo and proveedor <> 'ninguno'
                  and coalesce(ops.p('anuncios_encendidos'), 1) > 0),
  sin as (select coalesce(bool_or(p.sin_anuncios), false) as sin
            from app.usuario u join app.paquete p on p.codigo = u.paquete where u.user_id = p_usuario)
  select c.id, c.titulo, c.imagen_url, c.destino_url, e.proveedor, e.adsense_slot
    from esp e
    left join lateral (
      select c.* from app.campana_anuncio c
        left join lateral (select coalesce(sum(d.impresiones), 0) as total,
                                  coalesce(sum(d.impresiones) filter (where d.dia = current_date), 0) as hoy
                             from ops.anuncio_dia d where d.campana_id = c.id) s on true
       where e.proveedor = 'directo' and c.activa and p_espacio = any(c.espacios)
         and current_date between c.desde and c.hasta
         and (c.federaciones is null or p_federacion = any(c.federaciones))
         and (c.ediciones is null or p_edicion = any(c.ediciones))
         and (c.clubes is null or p_club = any(c.clubes))
         and (c.tope_impresiones is null or s.total < c.tope_impresiones)
         and (c.tope_diario is null or s.hoy < c.tope_diario)
         and (c.reparto = 'lo_antes_posible' or c.tope_impresiones is null
              or app.ritmo_campana(c, s.total) < coalesce(ops.p('anuncio_adelanto_max'), 1.1))
       order by c.prioridad desc, random() limit 1) c on true
   where not p_pagina_con_menores and not coalesce((select sin from sin), false)
     and (e.proveedor = 'adsense' or c.id is not null)
$$;

-- Evento que manda el navegador. Devuelve si se contó.
create or replace function ops.cuenta_anuncio_evento(p_espacio text, p_campana bigint, p_tipo text)
returns boolean language plpgsql as $$
declare v_campana bigint := coalesce(p_campana, 0);
begin
  if p_tipo not in ('impresion', 'vista', 'clic') then return false; end if;
  if not exists (select 1 from app.espacio_anuncio where codigo = p_espacio and activo and proveedor <> 'ninguno') then
    return false;
  end if;
  if v_campana <> 0 and not exists (select 1 from app.campana_anuncio
                                     where id = v_campana and p_espacio = any(espacios)) then
    return false;
  end if;
  if p_tipo in ('vista', 'clic') and not exists (select 1 from ops.anuncio_dia
       where dia = current_date and espacio = p_espacio and campana_id = v_campana and impresiones > 0) then
    return false;                                     -- sin impresión servida hoy no hay vista ni clic
  end if;
  insert into ops.anuncio_dia (dia, espacio, campana_id, impresiones, vistas, clics)
  values (current_date, p_espacio, v_campana, (p_tipo = 'impresion')::int, (p_tipo = 'vista')::int, (p_tipo = 'clic')::int)
  on conflict (dia, espacio, campana_id) do update set
    impresiones = ops.anuncio_dia.impresiones + excluded.impresiones,
    vistas      = ops.anuncio_dia.vistas + excluded.vistas,
    clics       = ops.anuncio_dia.clics + excluded.clics;
  return true;
end $$;

-- La función de 0033 sigue (la web antigua la llama), ahora por la nueva.
create or replace function ops.cuenta_anuncio(p_espacio text, p_campana bigint, p_clic boolean)
returns void language sql as $$
  select ops.cuenta_anuncio_evento(p_espacio, p_campana, case when p_clic then 'clic' else 'impresion' end)
$$;

-- Informe por hueco y campaña en un periodo: lo que pide el panel y lo que se factura al patrocinador.
-- Ingresos: CPM × vistas / 1.000; importe fijo repartido por los días de la campaña dentro del periodo;
-- AdSense, estimado con el RPM del parámetro (la columna `estimado` lo dice).
create or replace function ops.informe_anuncios(p_desde date, p_hasta date)
returns table (espacio text, campana_id bigint, patrocinador text, impresiones bigint, vistas bigint, clics bigint,
               pct_visible numeric, ctr numeric, ingresos numeric, estimado boolean)
language sql stable as $$
  with d as (
    select a.espacio, a.campana_id, sum(a.impresiones) imp, sum(a.vistas) vis, sum(a.clics) cl
      from ops.anuncio_dia a where a.dia between p_desde and p_hasta
     group by a.espacio, a.campana_id),
  -- reparto del importe fijo entre los huecos según sus impresiones vistas
  fijo as (
    select c.id, c.importe_fijo
           * greatest(0, (least(c.hasta, p_hasta) - greatest(c.desde, p_desde) + 1))::numeric
           / (c.hasta - c.desde + 1) as importe
      from app.campana_anuncio c where c.importe_fijo is not null)
  select d.espacio, d.campana_id, c.patrocinador, d.imp, d.vis, d.cl,
         round(100.0 * d.vis / nullif(d.imp, 0), 1),
         round(100.0 * d.cl / nullif(d.imp, 0), 2),
         round(case
           when d.campana_id = 0 then d.vis * coalesce(ops.p('adsense_rpm_estimado'), 0) / 1000
           when c.precio_cpm is not null then d.vis * c.precio_cpm / 1000
           when f.importe is not null then f.importe * d.vis
                / nullif(sum(d.vis) over (partition by d.campana_id), 0)
         end, 2),
         d.campana_id = 0
    from d
    left join app.campana_anuncio c on c.id = d.campana_id
    left join fijo f on f.id = d.campana_id
   order by d.vis desc, d.espacio
$$;

grant select on ops.parametro to facylf_app;
grant execute on function app.ritmo_campana(app.campana_anuncio, bigint, date),
  ops.cuenta_anuncio_evento(text, bigint, text), ops.informe_anuncios(date, date) to facylf_app;
grant execute on function ops.p(text) to facylf_app;
