#!/usr/bin/env node
/**
 * MANTENIMIENTO DE LA BASE: lo que hay que hacer cada noche y cada semana para que los tiempos no se degraden.
 *
 * Noche (`--noche`, 4:30):
 *   1. ops.purga(): retención de eventos (90 d), tiempos por minuto (30 d), chequeos (400 d), alertas cerradas.
 *   2. Cálculos globales del modelo de lectura que no se hacen en cada pasada corta del proyector:
 *      frecuencias de nombres (0024), evolución y zonas (0026), árbitros (0029).
 *   3. ANALYZE de las tablas de analytics que más cambian (estadísticas frescas = buenos planes).
 * Semana (`--semana`, domingo 5:00), además:
 *   4. VACUUM (ANALYZE) de las tablas grandes con más del 10 % de tuplas muertas o sin analizar en 7 días.
 *   5. REINDEX CONCURRENTLY de los índices de core/analytics con hinchazón > 30 %, si la extensión pgstattuple
 *      existe (si no, lo dice y no hace nada: no se reindexa a ciegas).
 *   6. Informe de las 10 sentencias que más tiempo total consumen (pg_stat_statements) en ops.evento_app,
 *      para revisar con `pnpm planes`.
 * Regla del servidor: aborta si quedan menos de 3 GiB libres o la carga pasa de 14; una cosa cada vez; nunca
 * VACUUM FULL ni CLUSTER (bloquean la tabla). Con DATABASE_URL_MIGRACION (VACUUM/REINDEX piden ser dueño).
 *
 * Uso: node scripts/mantenimiento-bd.mjs --noche | --semana [--simular]
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freemem, loadavg } from 'node:os';

try { process.loadEnvFile('.env'); } catch { /* entorno externo */ }
const { Client } = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'canonico', 'package.json'))('pg');

const args = process.argv.slice(2);
const semana = args.includes('--semana');
const noche = args.includes('--noche') || semana;
const simular = args.includes('--simular');
if (!noche) { console.error('Uso: --noche | --semana [--simular]'); process.exit(2); }
const url = (process.env.DATABASE_URL_MIGRACION ?? '').trim();
if (!url) { console.error('✗ Falta DATABASE_URL_MIGRACION.'); process.exit(2); }

const c = new Client({ connectionString: url, application_name: 'mantenimiento-bd' });
await c.connect();
const log = [];
const paso = async (titulo, sql, params = []) => {
  if (freemem() < 3 * 1024 ** 3 || (process.platform !== 'win32' && loadavg()[0] > 14)) {
    throw new Error(`guardia del servidor antes de «${titulo}»: memoria o carga al límite`);
  }
  const t = Date.now();
  if (simular) { console.log(`· (simulado) ${titulo}`); return null; }
  const r = await c.query(sql, params);
  const ms = Date.now() - t;
  console.log(`✓ ${titulo} · ${ms} ms`);
  log.push({ paso: titulo, ms });
  return r;
};
const existe = async (reg) => (await c.query('select to_regclass($1) is not null as ok', [reg])).rows[0].ok;
const funcion = async (f) => (await c.query('select to_regprocedure($1) is not null as ok', [f])).rows[0].ok;

let error = null;
try {
  await c.query(`set statement_timeout = '30min'`);
  if (await funcion('ops.purga()')) await paso('purga de ops', 'select ops.purga()');
  if (await funcion('analytics.recalcula_frecuencias()')) await paso('frecuencias de nombres', 'select analytics.recalcula_frecuencias()');
  if (await funcion('analytics.recalcula_evolucion()')) {
    await paso('evolución de equipos', 'select analytics.recalcula_evolucion()');
    await paso('zonas aprendidas', 'select analytics.recalcula_zonas()');
  }
  if (await funcion('analytics.recalcula_arbitros()')) await paso('árbitros', 'select analytics.recalcula_arbitros()');
  // 0036: la semana rehace el ojeo entero (recoge uniones y separaciones de identidad); la noche sólo puntúa.
  if (semana && await funcion('analytics.recalcula_ojeo()')) await paso('ojeo entero', 'select analytics.recalcula_ojeo()');
  else if (await funcion('analytics.puntua_ojeo(smallint[])')) await paso('puntuación del ojeo (todas las temporadas)', 'select analytics.puntua_ojeo(null)');
  for (const t of ['analytics.player_team_season_summary', 'analytics.jugador_temporada', 'analytics.search_entity',
                   'analytics.sancion_inferida', 'analytics.persona_tramo', 'analytics.persona_perfil', 'analytics.ojeo_jugador',
                   'app.notificacion', 'app.favorito', 'ops.caso_dato']) {
    if (await existe(t)) await paso(`analyze ${t}`, `analyze ${t}`);
  }

  if (semana) {
    const { rows: tablas } = await c.query(`
      select schemaname || '.' || relname as t, n_live_tup, n_dead_tup, last_analyze, last_autoanalyze
        from pg_stat_user_tables
       where schemaname in ('core', 'analytics', 'ops') and n_live_tup > 50000
         and (n_dead_tup > 0.10 * (n_live_tup + n_dead_tup)
              or greatest(last_analyze, last_autoanalyze) is null
              or greatest(last_analyze, last_autoanalyze) < now() - interval '7 days')
       order by n_dead_tup desc`);
    for (const t of tablas) await paso(`vacuum (analyze) ${t.t} (${t.n_dead_tup} muertas)`, `vacuum (analyze) ${t.t}`);

    if ((await c.query(`select count(*)::int n from pg_extension where extname = 'pgstattuple'`)).rows[0].n) {
      const { rows: indices } = await c.query(`
        select i.indexrelid::regclass::text as idx, (pgstatindex(i.indexrelid)).avg_leaf_density as densidad
          from pg_index i join pg_class cl on cl.oid = i.indexrelid join pg_namespace n on n.oid = cl.relnamespace
          join pg_am am on am.oid = cl.relam
         where n.nspname in ('core', 'analytics') and am.amname = 'btree' and pg_relation_size(i.indexrelid) > 50 * 1024 * 1024`);
      for (const i of indices.filter((x) => x.densidad > 0 && x.densidad < 70)) {
        await paso(`reindex concurrently ${i.idx} (densidad ${Math.round(i.densidad)} %)`, `reindex index concurrently ${i.idx}`);
      }
    } else {
      console.log('· pgstattuple no está: no se mide la hinchazón de índices (create extension pgstattuple; como admin para activarlo)');
    }

    if ((await c.query(`select count(*)::int n from pg_extension where extname = 'pg_stat_statements'`)).rows[0].n) {
      const { rows: top } = await c.query(`
        select left(query, 200) as consulta, calls, round(total_exec_time)::bigint as total_ms, round(mean_exec_time)::int as media_ms
          from pg_stat_statements order by total_exec_time desc limit 10`);
      if (!simular && await existe('ops.evento_app')) {
        await c.query(`insert into ops.evento_app (nivel, origen, tipo, mensaje, detalle) values ('info','mantenimiento','top_sentencias',$1,$2)`,
          ['Las 10 sentencias que más tiempo total consumen', { top }]);
      }
      console.table(top.map((t) => ({ media_ms: t.media_ms, llamadas: t.calls, consulta: t.consulta.slice(0, 80) })));
    }
  }
} catch (e) {
  error = e;
  console.error(`✗ ${e.message}`);
} finally {
  if (!simular && await existe('ops.evento_app').catch(() => false)) {
    await c.query(`insert into ops.evento_app (nivel, origen, tipo, mensaje, detalle) values ($1,'mantenimiento',$2,$3,$4)`,
      [error ? 'error' : 'info', semana ? 'mantenimiento_semanal' : 'mantenimiento_nocturno', error ? error.message : 'hecho', { pasos: log }]).catch(() => {});
  }
  await c.end();
}
process.exit(error ? 1 : 0);
