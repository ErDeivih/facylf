/*
 * mira-escudo-club.mjs — ¿tiene el canónico local el escudo de este club?
 *
 * El informe usa como escudo del equipo el fichero que se le pasa con `--logo-equipo`, y su valor por defecto
 * es el del Ciudad Rodrigo. Para el informe de Victoria eso es un error visible. Antes de inventar nada hay que
 * ver si la base ya tiene el escudo del club: el informe sabe leer `core.club_asset` (tipo 'escudo').
 *
 * SÓLO LEE la base local.
 *
 * Uso:  node scripts/servidor/mira-escudo-club.mjs <texto-del-club> <team_entry_id>
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

const [texto, entry] = process.argv.slice(2);
if (!texto) { console.error('uso: mira-escudo-club.mjs <texto-del-club> [team_entry_id]'); process.exit(2); }

const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const pg = requerir('pg');
const cliente = new pg.Client({ connectionString: URL });
await cliente.connect();

const { rows: clubes } = await cliente.query(`
  select c.id, c.nombre_canonico,
         (select count(*) from core.club_asset a where a.club_id = c.id) as activos,
         (select count(*) from core.club_asset a where a.club_id = c.id and a.tipo = 'escudo') as escudos
    from core.club c
   where c.nombre_norm ilike $1 ${entry ? `and c.id = (select ts.club_id from core.team_entry te
     join core.team_season ts on ts.id = te.team_season_id where te.id = ${Number(entry)})` : ''}
   order by c.nombre_canonico`, [`%${texto}%`]);

console.log(`clubes que contienen «${texto}»: ${clubes.length}`);
for (const c of clubes) {
  console.log(`  club ${c.id}  ${c.nombre_canonico}: ${c.escudos} escudo(s) · ${c.activos} activo(s) en total`);
}

// Y si hay escudo, en qué formato está, que es lo que necesita el informe para incrustarlo.
const conEscudo = clubes.filter((c) => Number(c.escudos) > 0);
for (const c of conEscudo) {
  const { rows } = await cliente.query(`select mime_type, length(contenido) as bytes, observado_en
    from core.club_asset where club_id = $1 and tipo = 'escudo' order by observado_en desc limit 3`, [c.id]);
  for (const r of rows) console.log(`    escudo de ${c.nombre_canonico}: ${r.mime_type}, ${r.bytes} bytes, observado ${r.observado_en}`);
}
if (!conEscudo.length) {
  console.log('\n  NO hay ningún escudo guardado para esos clubes: el informe caería en el logo por defecto');
  console.log('  (el del Ciudad Rodrigo) y hay que darle uno con `--logo-equipo`.');
}
await cliente.end();
