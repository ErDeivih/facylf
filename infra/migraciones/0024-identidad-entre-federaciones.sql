-- 0024 · Identidad de jugadores entre federaciones y temporadas (candidatos con evidencias)
--
-- El caso: un jugador que juega unos años en una federación y otros en otra no tiene ningún código común;
-- sólo coincide el nombre. Y en las fuentes sin código de jugador (Cataluña entera) la misma persona es una
-- identidad distinta por temporada y equipo (ADR-0011). Sin enlazarlas no hay «vida deportiva».
--
-- Medido el 21/10/2026 sobre 933.909 identidades de 16 colas (docs/plataforma-web/PLATAFORMA-NACIONAL.md §3.4):
--   · 174.126 pares de igual nombre (orden nombre | apellido1 apellido2) en federaciones distintas;
--   · 40.770 se descartan porque juegan A LA VEZ en las dos (fechas que se solapan);
--   · 63.354 porque sus EDADES son incompatibles (la categoría fija una horquilla de año de nacimiento);
--   · 46.533 porque el nombre está incompleto («HUGO»): nunca se cruzan;
--   · de los que quedan, el NÚMERO ESPERADO DE HOMÓNIMOS (frecuencia del nombre × apellidos) separa:
--       2.763 automáticos (nombre raro + trayectoria contigua), 4.058 de confianza alta, 2.448 a revisar,
--       14.200 que no se proponen porque el nombre es común.
--   · Las federaciones vascas (Euskadi, Araba, Bizkaia, Gipuzkoa) COMPARTEN código de jugador: de 4.021
--     códigos comunes Euskadi∩Bizkaia, 4.019 llevan el mismo nombre. Ahí el enlace es determinista.
--
-- Cumple ADR-0003: el nombre genera candidatos; se enlaza sólo con evidencia alta y margen claro (nadie más
-- compite por ese nombre) o por decisión humana. Las apariciones NO se reescriben: el enlace vive en
-- `analytics.persona_grupo` y se recalcula; una decisión `separar` manda sobre cualquier regla.
-- Aditiva: 0001-0023 no se tocan.

-- ── 1. Familias de federaciones (comparten o no código de jugador) ─────────────────────────────────────
create table if not exists core.federacion_familia (
  federation_id     smallint primary key references core.federation(id),
  familia           text     not null,
  comparte_codigos  boolean  not null default false
);
comment on table core.federacion_familia is
  'Federaciones que pertenecen a una misma territorial. comparte_codigos = true: el mismo código de jugador '
  'en dos de ellas es la misma persona (medido en el País Vasco). Una federación sin fila es su propia familia.';

insert into core.federacion_familia (federation_id, familia, comparte_codigos)
select f.id, 'pais-vasco', true from core.federation f
 where f.codigo in ('euskadi', 'araba', 'alava', 'bizkaia', 'gipuzkoa')
on conflict (federation_id) do nothing;
insert into core.federacion_familia (federation_id, familia, comparte_codigos)
select f.id, 'canarias', false from core.federation f
 where f.codigo in ('canarias', 'tenerife', 'laspalmas', 'las-palmas')
on conflict (federation_id) do nothing;

create or replace function core.familia_de(p_federacion smallint)
returns text language sql stable parallel safe as $$
  select coalesce((select familia from core.federacion_familia where federation_id = p_federacion),
                  'fed:' || p_federacion::text)
$$;

-- ── 2. Clave de nombre: «nombre | apellido1 apellido2», sin partículas ────────────────────────────────
-- «ZOMEÑO FAJARDO, CARLES» y «Carles Zomeño Fajardo» (Valencia escribe así) dan la misma clave.
-- El ORDEN de los apellidos se conserva: «MARTÍN BENITO» y «BENITO MARTÍN» son personas distintas.
-- Sin nombre de pila o sin apellido devuelve NULL: «HUGO» no se cruza nunca.
create or replace function core.tokens_nombre(p text)
returns text[] language sql immutable parallel safe as $$
  select coalesce(array_agg(x order by o), '{}')
    from unnest(regexp_split_to_array(btrim(core.normaliza_nombre(coalesce(p, ''))), '\s+')) with ordinality u(x, o)
   where x <> '' and x not in ('de','del','la','las','los','y','i','el','da','dos','van','al','d','l')
$$;

create or replace function core.clave_nombre_persona(p text)
returns text language plpgsql immutable parallel safe as $$
declare
  s text[]; g text[]; t text[]; n int;
begin
  if p is null then return null; end if;
  if position(',' in p) > 0 then
    s := core.tokens_nombre(split_part(p, ',', 1));
    g := core.tokens_nombre(substr(p, position(',' in p) + 1));
  else
    t := core.tokens_nombre(p);
    n := coalesce(array_length(t, 1), 0);
    if n < 3 then return null; end if;
    g := t[1:n-2]; s := t[n-1:n];
  end if;
  if coalesce(array_length(g, 1), 0) = 0 or coalesce(array_length(s, 1), 0) = 0 then return null; end if;
  return array_to_string(g, ' ') || ' | ' || array_to_string(s, ' ');
end $$;

-- ── 3. Tramos: dónde y cuándo jugó cada persona (uno por persona y grupo) ─────────────────────────────
create table if not exists analytics.persona_tramo (
  person_id       bigint   not null references core.person(id) on delete cascade,
  phase_group_id  bigint   not null references core.phase_group(id) on delete cascade,
  federation_id   smallint not null,
  club_id         bigint,
  anio            smallint not null,          -- core.season.anio_inicio
  categoria       text     not null,
  confianza       numeric(3,2) not null default 0,
  desde           date,
  hasta           date,
  partidos        integer  not null default 0,
  primary key (person_id, phase_group_id)
);
create index if not exists persona_tramo_grupo_idx on analytics.persona_tramo (phase_group_id);

create or replace function analytics.proyecta_tramos_grupo(p_grupo bigint)
returns integer language plpgsql as $$
declare v integer;
begin
  delete from analytics.persona_tramo where phase_group_id = p_grupo;
  insert into analytics.persona_tramo (person_id, phase_group_id, federation_id, club_id, anio, categoria,
                                       confianza, desde, hasta, partidos)
  select a.person_id, p_grupo, ce.federation_id, min(ts.club_id), se.anio_inicio, ce.categoria,
         ce.classification_confidence,
         min(coalesce(m.played_at::date, m.fecha_prevista)), max(coalesce(m.played_at::date, m.fecha_prevista)),
         count(distinct a.match_id)
    from core.appearance a
    join core.team_entry te on te.id = a.team_entry_id and te.phase_group_id = p_grupo
    join core.team_season ts on ts.id = te.team_season_id
    join core.match m on m.id = a.match_id
    join core.phase_group pg on pg.id = te.phase_group_id
    join core.competition_edition ce on ce.id = pg.competition_edition_id
    join core.season se on se.id = ce.season_id
   group by a.person_id, ce.federation_id, se.anio_inicio, ce.categoria, ce.classification_confidence;
  get diagnostics v = row_count;
  return v;
end $$;

-- ── 4. Perfil: lo que hace falta para comparar dos identidades ────────────────────────────────────────
-- Horquilla de nacimiento por categoría (año de inicio de temporada Y; RFEF): juvenil Y-18..Y-16,
-- cadete Y-15..Y-14, infantil Y-13..Y-12, alevín Y-11..Y-10, benjamín Y-9..Y-8, prebenjamín Y-7..Y-6.
-- Se tolera jugar hasta 2 años POR ENCIMA de la edad (más joven) y 1 año por debajo (excepciones,
-- fútbol femenino). Aficionados: nacido como tarde en Y-15. Veteranos: como tarde en Y-30.
-- Sólo cuentan categorías con confianza ≥ 0,6 (nombre explícito o «SUB-NN»).
create table if not exists analytics.persona_perfil (
  person_id        bigint   primary key references core.person(id) on delete cascade,
  clave_nombre     text,
  familias         text[]   not null default '{}',
  federaciones     smallint[] not null default '{}',
  anios            smallint[] not null default '{}',
  nacimiento_min   smallint,
  nacimiento_max   smallint,
  es_nominal       boolean  not null default false,
  partidos         integer  not null default 0
);
create index if not exists persona_perfil_clave_idx on analytics.persona_perfil (clave_nombre) where clave_nombre is not null;

create or replace function analytics.proyecta_perfiles(p_personas bigint[])
returns integer language plpgsql as $$
declare v integer;
begin
  delete from analytics.persona_perfil where person_id = any(p_personas);
  insert into analytics.persona_perfil (person_id, clave_nombre, familias, federaciones, anios,
                                        nacimiento_min, nacimiento_max, es_nominal, partidos)
  select p.id, core.clave_nombre_persona(p.nombre_mostrado),
         array_agg(distinct core.familia_de(t.federation_id)),
         array_agg(distinct t.federation_id),
         array_agg(distinct t.anio order by t.anio),
         max(case when t.confianza >= 0.6 then
               case t.categoria when 'juvenil' then t.anio - 19 when 'cadete' then t.anio - 16
                                when 'infantil' then t.anio - 14 when 'alevin' then t.anio - 12
                                when 'benjamin' then t.anio - 10 when 'prebenjamin' then t.anio - 8 end end),
         min(case
               when t.confianza >= 0.6 and t.categoria in ('juvenil','cadete','infantil','alevin','benjamin','prebenjamin') then
                 t.anio - case t.categoria when 'juvenil' then 16 when 'cadete' then 14 when 'infantil' then 12
                                           when 'alevin' then 10 when 'benjamin' then 8 else 6 end + 2
               when t.confianza >= 0.5 and t.categoria = 'aficionados' then t.anio - 15
               when t.confianza >= 0.6 and t.categoria = 'veteranos' then t.anio - 30 end),
         p.identidad_nominal,
         sum(t.partidos)::integer
    from core.person p
    join analytics.persona_tramo t on t.person_id = p.id
   where p.id = any(p_personas)
   group by p.id;
  get diagnostics v = row_count;
  return v;
end $$;

-- ── 5. Frecuencia de nombres y apellidos (para el número esperado de homónimos) ───────────────────────
create table if not exists analytics.frecuencia_nombre (
  parte   text     not null check (parte in ('g', 's1', 's2', 'total')),
  valor   text     not null,
  ambito  smallint not null default 0,          -- 0 = España; si no, federation_id
  n       integer  not null,
  primary key (parte, valor, ambito)
);

create or replace function analytics.recalcula_frecuencias()
returns integer language plpgsql as $$
declare v integer;
begin
  truncate analytics.frecuencia_nombre;
  with partes as (
    select pp.person_id, f as ambito,
           split_part(pp.clave_nombre, ' | ', 1) as g,
           (string_to_array(split_part(pp.clave_nombre, ' | ', 2), ' '))[1] as s1,
           coalesce(nullif(array_to_string((string_to_array(split_part(pp.clave_nombre, ' | ', 2), ' '))[2:], ' '), ''), '-') as s2
      from analytics.persona_perfil pp
      cross join lateral unnest(array[0::smallint] || pp.federaciones) f
     where pp.clave_nombre is not null
  )
  insert into analytics.frecuencia_nombre (parte, valor, ambito, n)
  select 'g', g, ambito, count(*) from partes group by g, ambito
  union all select 's1', s1, ambito, count(*) from partes group by s1, ambito
  union all select 's2', s2, ambito, count(*) from partes group by s2, ambito
  union all select 'total', '*', ambito, count(*) from partes group by ambito;
  get diagnostics v = row_count;
  return v;
end $$;

-- Parámetros del modelo, en una tabla para poder ajustarlos sin migración.
create table if not exists analytics.parametro_identidad (
  clave text primary key,
  valor numeric not null,
  nota  text
);
insert into analytics.parametro_identidad (clave, valor, nota) values
  ('poblacion_espana', 4000000, 'Jugadores distintos de fútbol federado en España en las temporadas cubiertas (≈1,2 M de licencias por temporada con rotación). Escala la muestra al total real mientras falten federaciones.'),
  ('umbral_automatico', 0.05, 'Homónimos esperados por debajo de esto + trayectoria contigua + sin rivales = enlace automático.'),
  ('umbral_revision', 1, 'Por debajo de esto se propone para revisar; por encima no se propone.')
on conflict (clave) do nothing;

-- Número esperado de personas con ese nombre completo en un ámbito: población estimada del ámbito ×
-- p(nombre) × p(apellido1) × p(apellido2), con las frecuencias medidas en nuestros datos. Se toma el ámbito
-- más desfavorable (España o cada federación implicada): «Mohamed Mohamed» es raro en España y común en
-- Ceuta. La población de un ámbito es su muestra escalada por la cobertura nacional de la muestra.
create or replace function analytics.homonimos_esperados(p_clave text, p_federaciones smallint[])
returns numeric language plpgsql stable as $$
declare
  g text; s1 text; s2 text; mejor numeric := 0; e numeric; amb smallint;
  ng numeric; ns1 numeric; ns2 numeric; nt numeric; ntotal numeric; escala numeric;
begin
  if p_clave is null then return 1e6; end if;
  g := split_part(p_clave, ' | ', 1);
  s1 := (string_to_array(split_part(p_clave, ' | ', 2), ' '))[1];
  s2 := coalesce(nullif(array_to_string((string_to_array(split_part(p_clave, ' | ', 2), ' '))[2:], ' '), ''), '-');
  select n into ntotal from analytics.frecuencia_nombre where parte = 'total' and valor = '*' and ambito = 0;
  if ntotal is null or ntotal = 0 then return 1e6; end if;
  escala := greatest(1, coalesce((select valor from analytics.parametro_identidad where clave = 'poblacion_espana'), ntotal) / ntotal);
  foreach amb in array (array[0::smallint] || coalesce(p_federaciones, '{}')) loop
    select n into nt from analytics.frecuencia_nombre where parte = 'total' and valor = '*' and ambito = amb;
    if nt is null or nt < 500 then continue; end if;   -- ámbito demasiado pequeño para estimar
    select coalesce(max(n), 0) into ng  from analytics.frecuencia_nombre where parte = 'g'  and valor = g  and ambito = amb;
    select coalesce(max(n), 0) into ns1 from analytics.frecuencia_nombre where parte = 's1' and valor = s1 and ambito = amb;
    select coalesce(max(n), 0) into ns2 from analytics.frecuencia_nombre where parte = 's2' and valor = s2 and ambito = amb;
    e := escala * nt * ((ng + 0.5) / nt) * ((ns1 + 0.5) / nt) * ((ns2 + 0.5) / nt);
    if e > mejor then mejor := e; end if;
  end loop;
  return round(mejor, 4);
end $$;

-- ── 6. Candidatos ─────────────────────────────────────────────────────────────────────────────────────
create or replace function analytics.genera_candidatos(p_personas bigint[])
returns integer language plpgsql as $$
declare v integer;
begin
  -- Sólo se rehacen las propuestas de la máquina; lo que un humano marcó (descartado/resuelto) se respeta.
  delete from core.identity_candidate
   where model_version in ('nombre-tiempo-edad-v1', 'codigo-familia-v1')
     and estado in ('pendiente', 'propuesto')
     and (person_a = any(p_personas) or person_b = any(p_personas));

  -- 6a. Mismo código en federaciones de una familia que comparte códigos: determinista.
  insert into core.identity_candidate (person_a, person_b, score, margen, features_json, model_version, estado)
  select distinct least(i1.person_id, i2.person_id), greatest(i1.person_id, i2.person_id), 1, 1,
         jsonb_build_object('motivo', 'mismo_codigo_en_familia', 'codigo', i1.codigo_externo, 'familia', ff1.familia),
         'codigo-familia-v1', 'propuesto'
    from core.person_source_identity i1
    join core.federacion_familia ff1 on ff1.federation_id = i1.federation_id and ff1.comparte_codigos
    join core.person_source_identity i2 on i2.codigo_externo = i1.codigo_externo
                                       and i2.federation_id <> i1.federation_id and i2.person_id <> i1.person_id
    join core.federacion_familia ff2 on ff2.federation_id = i2.federation_id and ff2.familia = ff1.familia
   where i1.codigo_externo is not null
     and (i1.person_id = any(p_personas) or i2.person_id = any(p_personas))
     and not exists (select 1 from core.identity_candidate x
                      where x.person_a = least(i1.person_id, i2.person_id)
                        and x.person_b = greatest(i1.person_id, i2.person_id) and x.model_version = 'codigo-familia-v1')
  on conflict do nothing;

  -- 6b. Mismo nombre completo: compatibilidad temporal y de edad, y rareza del nombre.
  with pares as (
    select least(a.person_id, b.person_id) as pa, greatest(a.person_id, b.person_id) as pb,
           a.clave_nombre as clave,
           (select array_agg(distinct x) from unnest(a.federaciones || b.federaciones) x) as feds,
           greatest(a.nacimiento_min, b.nacimiento_min) as nac_min,
           least(a.nacimiento_max, b.nacimiento_max) as nac_max,
           a.anios as anios_a, b.anios as anios_b,
           (a.familias && b.familias) as misma_familia,
           a.es_nominal or b.es_nominal as alguno_nominal
      from analytics.persona_perfil a
      join analytics.persona_perfil b on b.clave_nombre = a.clave_nombre and b.person_id <> a.person_id
     where a.person_id = any(p_personas) and a.clave_nombre is not null
  ),
  unicos as (select distinct on (pa, pb) * from pares order by pa, pb),
  filtrados as (
    -- Dentro de una misma federación, dos códigos distintos son dos personas (el código es la identidad):
    -- sólo se emparejan si al menos una de las dos es nominal (fuente sin código).
    select u.* from unicos u
     where (not u.misma_familia or u.alguno_nominal)
       and (u.nac_min is null or u.nac_max is null or u.nac_min <= u.nac_max)
  ),
  con_tiempo as (
    select f.*,
           -- temporadas en que las dos juegan y sus fechas se solapan; en la misma federación y club no
           -- cuenta (un nominal puede salir en el A y en el B del mismo club la misma temporada)
           (select count(*) from (
              select ta.anio from analytics.persona_tramo ta
                join analytics.persona_tramo tb on tb.person_id = f.pb and tb.anio = ta.anio
               where ta.person_id = f.pa
                 and not (ta.club_id is not distinct from tb.club_id and ta.federation_id = tb.federation_id)
                 and (ta.desde is null or tb.desde is null or not (ta.hasta < tb.desde or tb.hasta < ta.desde))
               group by ta.anio) c) as choques,
           (select min(abs(x - y)) from unnest(f.anios_a) x, unnest(f.anios_b) y) as hueco
      from filtrados f
  ),
  puntuados as (
    select c.*, analytics.homonimos_esperados(c.clave, c.feds) as e from con_tiempo c where c.choques = 0
  ),
  competencia as (
    -- Margen: ¿cuántas otras identidades viables compiten por cada lado?
    select p.*, count(*) over (partition by p.pa) as rivales_a, count(*) over (partition by p.pb) as rivales_b
      from puntuados p where p.e < (select valor from analytics.parametro_identidad where clave = 'umbral_revision')
  )
  insert into core.identity_candidate (person_a, person_b, score, margen, features_json, model_version, estado)
  select c.pa, c.pb,
         least(0.999, round((1 / (1 + c.e)) * case when c.hueco <= 1 then 1 when c.hueco <= 3 then 0.85 else 0.6 end, 3)),
         round(1.0 / greatest(c.rivales_a, c.rivales_b), 3),
         jsonb_build_object('clave', c.clave, 'homonimos_esperados', c.e, 'hueco_temporadas', c.hueco,
                            'nacimiento', jsonb_build_array(c.nac_min, c.nac_max),
                            'rivales', greatest(c.rivales_a, c.rivales_b) - 1, 'nominal', c.alguno_nominal),
         'nombre-tiempo-edad-v1',
         case when c.e < (select valor from analytics.parametro_identidad where clave = 'umbral_automatico') and c.hueco <= 1 and c.rivales_a = 1 and c.rivales_b = 1 then 'propuesto' else 'pendiente' end
    from competencia c
   where not exists (select 1 from core.identity_candidate x
                      where x.person_a = c.pa and x.person_b = c.pb and x.model_version = 'nombre-tiempo-edad-v1')
  on conflict do nothing;
  get diagnostics v = row_count;
  return v;
end $$;

comment on function analytics.genera_candidatos(bigint[]) is
  'Rehace los candidatos de la máquina para esas personas. «propuesto» = enlace automático (evidencia alta y '
  'sin rivales); «pendiente» = se enseña en la ficha para confirmar. Lo que un humano decidió no se toca.';

-- ── 7. Grupos de identidad: quién es la misma persona ────────────────────────────────────────────────
create table if not exists analytics.persona_grupo (
  person_id  bigint primary key references core.person(id) on delete cascade,
  grupo_id   bigint not null,
  calculado_en timestamptz not null default now()
);
create index if not exists persona_grupo_grupo_idx on analytics.persona_grupo (grupo_id);

create or replace function analytics.recalcula_grupos(p_personas bigint[])
returns integer language plpgsql as $$
declare v integer; semillas bigint[];
begin
  -- Quien comparte grupo con una persona afectada también se recalcula: si un enlace desaparece, el otro
  -- lado no puede quedarse con el número de grupo viejo.
  select array_agg(distinct x) into semillas from (
    select unnest(p_personas) as x
    union select pg2.person_id from analytics.persona_grupo pg1
            join analytics.persona_grupo pg2 on pg2.grupo_id = pg1.grupo_id
           where pg1.person_id = any(p_personas)) t;
  with recursive aristas as (
    select person_a as x, person_b as y from core.identity_candidate c
     where c.estado in ('propuesto', 'resuelto')
       and not exists (select 1 from core.identity_decision d
                        where d.decision = 'separar' and d.revertida_en is null
                          and d.person_a = c.person_a and d.person_b = c.person_b)
    union
    select person_a, person_b from core.identity_decision d where d.decision = 'unir' and d.revertida_en is null
  ),
  sim as (select x, y from aristas union select y, x from aristas),
  alcance(semilla, persona) as (
    select s, s from unnest(semillas) s
    union
    select a.semilla, sim.y from alcance a join sim on sim.x = a.persona
  ),
  componentes as (
    select persona, min(persona) over (partition by semilla) as grupo from alcance
  ),
  final as (select persona, min(grupo) as grupo from componentes group by persona)
  insert into analytics.persona_grupo (person_id, grupo_id, calculado_en)
  select persona, grupo, now() from final
  on conflict (person_id) do update set grupo_id = excluded.grupo_id, calculado_en = now();
  get diagnostics v = row_count;
  return v;
end $$;

-- La trayectoria unificada: todas las fichas del mismo grupo, con su federación.
-- `s.*` se expande al crear la vista: si más adelante otra migración añade columnas a
-- analytics.player_team_season_summary, volver a crearla cambiaría nombres de columnas y PostgreSQL lo
-- prohíbe. Se borra y se crea (nada depende de ella) para que la migración se pueda repetir.
drop view if exists analytics.trayectoria_unificada;
create view analytics.trayectoria_unificada as
select coalesce(pg.grupo_id, s.person_id) as grupo_id, s.*, ce.federation_id
  from analytics.player_team_season_summary s
  join core.competition_edition ce on ce.id = s.competition_edition_id
  left join analytics.persona_grupo pg on pg.person_id = s.person_id;

-- ── 8. Permisos ──────────────────────────────────────────────────────────────────────────────────────
grant select on core.federacion_familia to facylf_lector;
grant select, insert, update, delete on core.federacion_familia to facylf_publicador;
grant select on analytics.parametro_identidad to facylf_lector;
grant select, update on analytics.parametro_identidad to facylf_publicador;
grant select on analytics.persona_tramo, analytics.persona_perfil, analytics.frecuencia_nombre,
                analytics.persona_grupo, analytics.trayectoria_unificada to facylf_lector;
grant select, insert, update, delete on analytics.persona_tramo, analytics.persona_perfil,
                analytics.frecuencia_nombre, analytics.persona_grupo to facylf_publicador;
grant select on analytics.trayectoria_unificada to facylf_publicador;
grant select, insert, update, delete on core.identity_candidate to facylf_publicador;
grant usage, select on all sequences in schema core to facylf_publicador;
grant execute on function core.familia_de(smallint), core.tokens_nombre(text), core.clave_nombre_persona(text),
                          analytics.homonimos_esperados(text, smallint[]) to facylf_lector, facylf_publicador;
grant execute on function analytics.proyecta_tramos_grupo(bigint), analytics.proyecta_perfiles(bigint[]),
                          analytics.recalcula_frecuencias(), analytics.genera_candidatos(bigint[]),
                          analytics.recalcula_grupos(bigint[]) to facylf_publicador;
