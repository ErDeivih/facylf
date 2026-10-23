-- 0038 · Cada federación es distinta: su perfil como DATOS, y los avisos de página que salen de él.
--
-- La web no lleva `if (federacion === 'cataluna')`: pregunta a `analytics.avisos_de_datos(federacion, edicion)`
-- y pinta lo que vuelve (código, nivel y texto en castellano). Lo que cambia por federación está aquí:
--   · core.federacion_perfil: rasgos de la FUENTE (plataforma, código de jugador, árbitros unidos con « / »,
--     «convocados» sin titular/suplente, posiciones desde una temporada, capitán, sistema, fotos en el acta…).
--     Valores medidos el 22/10/2026 (COBERTURA-FEDERACIONES.md). NULL = sin medir (nunca «no»).
--   · analytics.edicion_capacidad (0032): lo que apunta CADA competición y temporada.
-- Si mañana Cataluña empieza a publicar cambios, no se toca la web: cambia la capacidad medida y desaparece
-- el aviso. Si una federación cambia de plataforma, se actualiza su fila aquí (y queda en la auditoría).

create table if not exists core.federacion_perfil (
  codigo                 text primary key,            -- el de core.federation.codigo (y de la carpeta descargas-<codigo>)
  nombre_corto           text not null,
  comunidad              text not null,
  federacion_madre       text,                         -- laspalmas/tenerife → canarias; araba/bizkaia/gipuzkoa → euskadi
  plataforma             text not null check (plataforma in ('fenix', 'novanet', 'fcf', 'otra')),
  idioma_nombres         text not null default 'es' check (idioma_nombres in ('es', 'ca', 'eu', 'gl', 'va')),
  codigo_jugador         boolean,                      -- ¿el acta trae un código estable por jugador?
  arbitros_unidos        boolean,                      -- ¿a veces une varios colegiados en un texto con « / »?
  varios_arbitros        boolean,                      -- ¿publica asistentes y cuarto árbitro?
  convocados_sin_condicion boolean,                    -- ¿filas «convocado» sin decir titular o suplente?
  posiciones_desde       text,                         -- temporada desde la que publica la posición ('2025-26')
  sistema_juego          boolean,
  capitan                boolean,
  fotos_en_acta          boolean,                      -- sólo para identidad en el PC; NUNCA se publican
  medido_en              date,
  nota                   text                          -- explicación para el panel de administración
);

insert into core.federacion_perfil (codigo, nombre_corto, comunidad, federacion_madre, plataforma, idioma_nombres,
  codigo_jugador, arbitros_unidos, varios_arbitros, convocados_sin_condicion, posiciones_desde, sistema_juego, capitan, fotos_en_acta, medido_en, nota) values
  ('andalucia', 'Andalucía', 'Andalucía', null, 'fenix', 'es', true, false, false, false, null, false, false, true, '2026-10-22', 'Casi todo fútbol base: sólo el 2 % de las actas con alineación trae cambios.'),
  ('araba', 'Araba', 'País Vasco', 'euskadi', 'fenix', 'eu', true, false, false, false, null, false, false, false, '2026-10-22', 'Minuto de gol en el 27 % de los goles.'),
  ('aragon', 'Aragón', 'Aragón', null, 'fenix', 'es', null, null, null, null, null, null, null, null, null, 'Sin medir (cola en el servidor).'),
  ('asturias', 'Asturias', 'Asturias', null, 'fenix', 'es', null, null, null, null, null, null, null, null, null, 'Sin medir (cola en el servidor).'),
  ('baleares', 'Baleares', 'Illes Balears', null, 'fenix', 'ca', null, null, null, null, null, null, null, null, null, 'Sin medir (cola en el servidor).'),
  ('bizkaia', 'Bizkaia', 'País Vasco', 'euskadi', 'fenix', 'eu', true, false, false, false, null, false, false, false, '2026-10-22', null),
  ('canarias', 'Canarias', 'Canarias', null, 'fenix', 'es', true, false, false, false, null, false, false, false, '2026-10-22', 'Competiciones regionales. Minuto de gol 0 % en 2024-25.'),
  ('cantabria', 'Cantabria', 'Cantabria', null, 'fenix', 'es', null, null, null, null, null, null, null, null, null, 'Sin medir (cola en el servidor).'),
  ('castilla-la-mancha', 'Castilla-La Mancha', 'Castilla-La Mancha', null, 'fenix', 'es', null, null, null, null, null, null, null, null, null, 'Sin medir (cola en el servidor).'),
  ('castilla-leon', 'Castilla y León', 'Castilla y León', null, 'fenix', 'es', true, false, false, false, null, false, false, true, '2026-10-22', 'Tarjetas 0 % en 2016-17 y 2018-19.'),
  ('cataluna', 'Cataluña', 'Cataluña', null, 'fcf', 'ca', true, true, true, false, null, false, true, false, '2026-10-22',
   'La FCF sí publica código, tarjetas, cambios y capitán: nuestro lector no los leía hasta el 22/10/2026. Las ~40.000 actas bajadas antes siguen sin ellos hasta releerlas (decisión de David); los avisos salen por edición, no por federación.'),
  ('ceuta', 'Ceuta', 'Ceuta', null, 'fenix', 'es', true, false, false, false, null, false, false, false, '2026-10-22', 'Cambios en el 0-8 % de las actas: minutos casi nunca calculables.'),
  ('euskadi', 'Euskadi', 'País Vasco', null, 'fenix', 'eu', true, false, false, false, null, false, false, false, '2026-10-22', 'Sin cambios de 2016-17 a 2022-23; desde 2023-24, 75-85 %.'),
  ('extremadura', 'Extremadura', 'Extremadura', null, 'fenix', 'es', null, null, null, null, null, null, null, null, null, 'Sin medir (cola en el servidor).'),
  ('galicia', 'Galicia', 'Galicia', null, 'fenix', 'gl', null, null, null, null, null, null, null, null, null, 'Sin medir (cola en el servidor).'),
  ('gipuzkoa', 'Gipuzkoa', 'País Vasco', 'euskadi', 'fenix', 'eu', true, false, false, false, null, false, false, false, '2026-10-22', 'Código de jugador en el 81 % de las filas.'),
  ('laspalmas', 'Las Palmas', 'Canarias', 'canarias', 'fenix', 'es', true, false, false, false, null, false, false, false, '2026-10-22', 'Minuto de gol en el 29 % de los goles.'),
  ('madrid', 'Madrid', 'Comunidad de Madrid', null, 'novanet', 'es', true, true, true, true, '2025-26', true, true, false, '2026-10-22', '12 % de filas «convocado» sin titular/suplente; posición en ~10 % desde 2025-26.'),
  ('melilla', 'Melilla', 'Melilla', null, 'fenix', 'es', true, false, false, false, null, false, false, false, '2026-10-22', 'Código de jugador en el 59 % de las filas.'),
  ('murcia', 'Murcia', 'Región de Murcia', null, 'fenix', 'es', null, null, null, null, null, null, null, null, null, 'Sin medir (cola en el servidor).'),
  ('navarra', 'Navarra', 'Navarra', null, 'fenix', 'es', true, false, false, false, null, false, false, false, '2026-10-22', null),
  ('rioja', 'La Rioja', 'La Rioja', null, 'fenix', 'es', true, false, false, false, null, false, false, false, '2026-10-22', null),
  ('tenerife', 'Tenerife', 'Canarias', 'canarias', 'fenix', 'es', true, false, false, false, null, false, false, false, '2026-10-22', 'Minuto de gol en el 45 % de los goles.'),
  ('valencia', 'Comunitat Valenciana', 'Comunitat Valenciana', null, 'novanet', 'va', true, true, true, false, '2025-26', true, true, false, '2026-10-22', 'Posición en ~85 % de las filas y sistema de juego desde 2025-26.')
on conflict (codigo) do nothing;

-- ── Avisos de una página ─────────────────────────────────────────────────────────────────────────────
-- La web los enseña tal cual, en este orden (los de nivel 'limite' arriba, los 'nota' abajo y discretos).
-- p_edicion NULL = página de la federación (avisos de la federación); con edición = competición, equipo,
-- jugador (de esa temporada) o acta.
create or replace function analytics.avisos_de_datos(p_federacion text, p_edicion bigint default null)
returns table (codigo text, nivel text, texto text)
language sql stable as $$
  with p as (select * from core.federacion_perfil where codigo = p_federacion),
       c as (select * from analytics.edicion_capacidad where competition_edition_id = p_edicion),
       t as (select se.etiqueta, se.orden from core.competition_edition ce join core.season se on se.id = ce.season_id where ce.id = p_edicion),
       pd as (select orden from core.season where etiqueta = (select posiciones_desde from p))
  select * from (
    -- Lo que la COMPETICIÓN no apunta (manda la medida, no el perfil)
    select 'solo_calendario', 'limite', 'Esta competición sólo publica el calendario: aún no hay resultados.' from c where c.nivel = 'calendario'
    union all select 'solo_resultados', 'limite', 'Esta competición publica resultados pero no alineaciones: no hay plantillas, minutos ni goleadores.' from c where c.nivel = 'resultados'
    union all select 'sin_cambios', 'limite', 'La competición no apunta los cambios: no se pueden calcular minutos. Se muestran partidos y titularidades.'
      from c where c.registra_alineaciones and not c.registra_cambios
    union all select 'sin_tarjetas', 'limite', 'La competición no apunta tarjetas: no hay disciplina ni sanciones.'
      from c where c.registra_alineaciones and not c.registra_tarjetas
    union all select 'sin_minuto_gol', 'nota', 'Los goles no traen minuto: no hay goles por tramo ni cronología.'
      from c where c.goles > 0 and not c.registra_minuto_gol
    -- Lo que la FUENTE hace distinto (perfil)
    -- Identidad por nombre: con edición, lo MEDIDO en ella (menos de la mitad de sus jugadores con código);
    -- sin edición (página de la federación), lo que dice el perfil de la fuente.
    union all select 'identidad_por_nombre', 'nota', 'En esta competición la mayoría de jugadores no trae código de la federación: las fichas se unen por nombre y equipo, y puede haber jugadores repetidos o mezclados.'
      from c where c.personas > 0 and c.personas_con_codigo * 2 < c.personas
    union all select 'identidad_por_nombre', 'nota', 'Esta federación no da un código por jugador: las fichas se unen por nombre y equipo, y puede haber jugadores repetidos o mezclados.'
      from p where p_edicion is null and p.codigo_jugador = false
    union all select 'convocados', 'nota', 'Parte de las actas sólo dice «convocado», sin titular ni suplente: cuentan como convocatoria, no como partido jugado.'
      from p where p.convocados_sin_condicion
    union all select 'posiciones_desde', 'nota', 'La posición de cada jugador sólo se publica desde la temporada ' || p.posiciones_desde || '.'
      from p where p.posiciones_desde is not null and (p_edicion is null or (select orden from t) < (select orden from pd))
    union all select 'arbitros_unidos', 'nota', 'A veces el acta junta a varios colegiados en un solo nombre; se cuenta sólo el principal.'
      from p where p.arbitros_unidos
    union all select 'sin_medir', 'nota', 'Aún no se ha medido qué datos publica esta federación: los huecos pueden ser de la fuente o nuestros.'
      from p where p.medido_en is null
  ) x(codigo, nivel, texto)
  order by case nivel when 'limite' then 1 else 2 end, codigo
$$;

-- ── Ficha de la federación: perfil + lo medido en su temporada más reciente ───────────────────────────
create or replace view analytics.federacion_ficha as
select p.codigo, p.nombre_corto, p.comunidad, p.federacion_madre, p.plataforma, p.idioma_nombres,
       p.codigo_jugador, p.varios_arbitros, p.posiciones_desde, p.sistema_juego, p.capitan, p.medido_en,
       fc.temporada, fc.ediciones, fc.partidos, fc.pct_resultado, fc.pct_alineacion, fc.pct_cambios, fc.pct_tarjetas,
       fc.pct_minuto_gol, fc.pct_posicion, fc.ediciones_completas, fc.ediciones_alineaciones, fc.ediciones_solo_resultados
  from core.federacion_perfil p
  left join lateral (select * from analytics.federacion_capacidad x where x.federacion = p.codigo order by x.orden desc limit 1) fc on true;

-- Auditoría (0034): un cambio de perfil queda registrado con su autor.
drop trigger if exists audita on core.federacion_perfil;
create trigger audita after insert or update or delete on core.federacion_perfil for each row execute function app.audita('codigo');

grant select on core.federacion_perfil, analytics.federacion_ficha to facylf_lector, facylf_app, facylf_publicador;
grant update on core.federacion_perfil to facylf_app;           -- sólo desde el panel (administrar_usuarios)
grant execute on function analytics.avisos_de_datos(text, bigint) to facylf_lector, facylf_app;
