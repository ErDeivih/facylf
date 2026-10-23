/*
 * ids-locales-equipo.mjs — los identificadores de un equipo en el canónico LOCAL del PC
 *
 * ── POR QUÉ NO SIRVEN LOS DEL SERVIDOR ──────────────────────────────────────────────────────────────────
 *
 * Los informes se generan contra la base local del PC (`127.0.0.1:5433`), que es OTRA base que la del
 * servidor: misma estructura, datos distintos y, sobre todo, **identificadores distintos**. El `team_entry`
 * 4213 del servidor no tiene por qué ser el 4213 de aquí.
 *
 * Y ojo con el campo `categoria`: medido, miente (dice «prebenjamín» en un equipo juvenil). Por eso aquí se
 * enseña la COMPETICIÓN y el GRUPO, que sí identifican al equipo sin ambigüedad.
 *
 * SÓLO LEE la base local.
 *
 * Uso:  node scripts/servidor/ids-locales-equipo.mjs <texto-club>
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) { try { process.loadEnvFile(rutaEnv); } catch { /* sin .env no hay consulta */ } }
const URL = process.env.DATABASE_URL_LECTOR;
if (!URL) throw new Error('Falta DATABASE_URL_LECTOR en .env');

const texto = process.argv[2];
if (!texto) { console.error('uso: ids-locales-equipo.mjs <texto-club>'); process.exit(2); }

const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const pg = requerir('pg');
const cliente = new pg.Client({ connectionString: URL });
await cliente.connect();

const { rows } = await cliente.query(`
  select c.nombre_canonico as club, ts.nombre as equipo, coalesce(ts.categoria,'(sin categoria)') as categoria,
         s.etiqueta as temporada, coalesce(ce.nombre_publicado,'(sin competicion)') as competicion,
         coalesce(g.nombre,'(sin grupo)') as grupo, te.id as entry, ts.id as team_season
    from core.team_entry te
    join core.team_season ts on ts.id = te.team_season_id
    join core.club c on c.id = ts.club_id
    join core.season s on s.id = ts.season_id
    left join core.phase_group g on g.id = te.phase_group_id
    left join core.competition_edition ce on ce.id = g.competition_edition_id
   where c.nombre_norm ilike $1
   order by s.etiqueta desc, ce.nombre_publicado, g.nombre`, [`%${texto}%`]);

console.log(`equipos de clubes que contienen «${texto}» en la base LOCAL: ${rows.length}\n`);
console.log('  temporada  equipo                        competición                              grupo             entry');
for (const r of rows) {
  console.log(`  ${String(r.temporada).padEnd(9)}  ${String(r.equipo).padEnd(28)}  ${String(r.competicion).padEnd(40)}  ${String(r.grupo).padEnd(16)}  ${r.entry}`);
}
await cliente.end();
