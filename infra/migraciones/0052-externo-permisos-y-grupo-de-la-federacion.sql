-- 0052 · Permisos del esquema `externo` y el grupo de la federación en lp_competicion. Claude, 26/10/2026.
--
-- La 0051 creó el esquema y sus tablas pero no dio permisos: el importador escribe SIEMPRE como
-- facylf_publicador (destino/pool.ts) y con la 0051 sola recibe «permission denied for schema externo».
-- Comprobado en una base de prueba con 0001-0051 aplicadas. Mismo patrón que la 0001 para los demás esquemas.
-- Aditiva: no toca 0001-0051.

-- La web (facylf_lector) NO lee las tablas de externo: llevan nombres de menores tal como los publica LP. Sólo
-- verá las vistas de 0054, que los quitan (27/10/2026).
grant usage on schema externo to facylf_publicador, facylf_lector;
grant select, insert, update, delete on all tables in schema externo to facylf_publicador;
grant usage, select on all sequences in schema externo to facylf_publicador;

alter default privileges in schema externo
  grant select, insert, update, delete on tables to facylf_publicador;
alter default privileges in schema externo
  grant usage, select on sequences to facylf_publicador;

-- La URL de la federación de la que carga LP cada competición (`urlDataLoaderResultados`, medido el 26/10/2026):
-- con ella el emparejado es EXACTO por código (PNFG codgrupo, iSquad id_competicion) en vez de por nombres.
alter table externo.lp_competicion
  add column if not exists organizador text,
  add column if not exists url_federacion text,
  add column if not exists plataforma_federacion text,        -- pnfg | isquad | fcf | rfef | otra
  add column if not exists competicion_federacion text,       -- codcompeticion / id_competicion / slug
  add column if not exists grupo_federacion text;             -- codgrupo / id_grupo / grup-N
comment on column externo.lp_competicion.grupo_federacion is
  'Código del grupo en la web de la federación según la URL de carga de LP. Sólo lo traen las competiciones que LP '
  'carga sola (temporadas recientes). Con él, externo.lp_emparejado se resuelve por código.';

-- Y de qué lado jugaba cada uno (la ficha de LP pone primero al local): sin esto, la alineación no se puede llevar a
-- la cola que lee el importador.
alter table externo.lp_participacion add column if not exists lado text check (lado in ('local','visitante'));
alter table externo.lp_evento add column if not exists lado text check (lado in ('local','visitante'));

-- El tipo de gol: la ficha de LP marca el penalti y el gol en propia puerta. En un gol, `lado` es el del equipo
-- BENEFICIADO (el de «GOLEADORES <equipo>», contrastado con el marcador parcial de cada gol); el goleador de un gol
-- en propia puerta juega en el otro lado, y así lo pasa cola-lp.mjs al importador.
alter table externo.lp_evento add column if not exists subtipo text
  check (subtipo is null or subtipo in ('normal','penalti','propia-puerta'));
comment on column externo.lp_evento.lado is
  'local | visitante. En los goles, el lado BENEFICIADO (en propia puerta el goleador es del otro lado).';
