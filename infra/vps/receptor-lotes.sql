-- ── RECEPTOR DE LOTES EN EL VPS ─────────────────────────────────────────────────────────────────────────
--
-- El servidor genera lotes incrementales (`scripts/servidor/exporta-lote.mjs`) con un CSV por tabla, un
-- manifiesto con el sha256 de cada fichero y la marca de corte. Esto es la otra mitad: cómo se cargan en
-- el VPS de forma que **nunca se dupliquen** y que un lote repetido no haga daño.
--
-- Uso previsto (cuando exista la máquina):
--   1. rsync de la carpeta del lote desde el servidor:  rsync -a servidor:/var/lib/facylf-export/lotes/<id>/ /srv/lotes/<id>/
--   2. comprobar el manifiesto (sha256 de cada CSV)
--   3. psql -f receptor-lotes.sql -v lote=<id> -v dir=/srv/lotes/<id>
--
-- Nada de esto se ejecuta todavía: no hay VPS. El fichero queda como contrato para cuando lo haya.

-- 1 · Registro de lotes cargados. Si el lote ya está, se ignora y no se carga dos veces.
create table if not exists ops.lote_cargado (
  lote        text primary key,
  cuando      timestamptz not null default now(),
  ficheros    int not null,
  filas       bigint not null,
  manifiesto  jsonb not null
);

-- 2 · Tabla de staging genérica: se copia el CSV tal cual y luego se reparte a su tabla.
--    Se usa una sola para no crear 19 tablas temporales.
create table if not exists ops.staging_lote (
  tabla  text not null,
  linea  text not null
);

-- 3 · Carga de un fichero a staging (ejecutar una vez por tabla, desde psql con \copy):
--      \copy ops.staging_lote(tabla, linea) from 'core_match.csv' with (format csv, header true)
--    El CSV trae cabecera: la primera línea se descarta con la opción header true.

-- 4 · Traspaso a la tabla definitiva. Cada tabla necesita su lista de columnas; abajo las principales.
--    El patrón es siempre el mismo: cargar en una tabla temporal tipada y hacer INSERT ... ON CONFLICT.
--
--    Ejemplo con core.match (la clave natural es (phase_group_id, matchday_id, home_team_entry_id,
--    away_team_entry_id, fecha_prevista); el id del servidor NO se reutiliza):
--
--      create temp table tmp_match (like core.match including defaults) on commit drop;
--      \copy tmp_match from 'core_match.csv' with (format csv, header true)
--      insert into core.match (phase_group_id, matchday_id, source_order, home_team_entry_id,
--             away_team_entry_id, goles_local, goles_visitante, official_status, played_at,
--             fecha_prevista, hora_confirmada, venue_id, data_version)
--      select phase_group_id, matchday_id, source_order, home_team_entry_id, away_team_entry_id,
--             goles_local, goles_visitante, official_status, played_at, fecha_prevista,
--             hora_confirmada, venue_id, data_version
--        from tmp_match
--      on conflict (phase_group_id, matchday_id, home_team_entry_id, away_team_entry_id, fecha_prevista)
--      do update set goles_local = excluded.goles_local,
--                    goles_visitante = excluded.goles_visitante,
--                    official_status = excluded.official_status,
--                    hora_confirmada = excluded.hora_confirmada,
--                    data_version = core.match.data_version + 1;

-- 5 · Marcar el lote como cargado SÓLO al final, en la misma transacción del tras paso.
--      insert into ops.lote_cargado (lote, ficheros, filas, manifiesto)
--      values (:'lote', :ficheros, :filas, :'manifiesto'::jsonb);

-- 6 · Comprobación de que no se ha perdido nada: el VPS debe tener tantas filas como dice el manifiesto.
--      select tabla, count(*) from ops.staging_lote group by 1;

-- ── NOTAS ──────────────────────────────────────────────────────────────────────────────────────────────
-- · Los `id` del servidor se conservan en el VPS para poder seguir la traza, pero la clave de conflicto es
--   la natural: así un lote repetido actualiza en vez de duplicar.
-- · El orden de carga importa por las claves foráneas: season, federation, club, team_season,
--   competition_edition, phase_group, team_entry, matchday, venue, match, y después el resto.
-- · Los lotes se envían cada 10-15 minutos (acordado con Claude el 18/11/2026); el primero lleva todo el
--   histórico y los siguientes sólo lo nuevo.
