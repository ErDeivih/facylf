/*
 * cruza-juvenil-senior.mjs — ¿ha subido algún juvenil al sénior de verdad?
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * El informe dice «0 jugadores han jugado en un equipo superior», y eso llama la atención: en un club con
 * juvenil y sénior en la misma ciudad, lo normal es que alguno haya subido. Antes de dar el cero por bueno hay
 * que comprobar de dónde sale, porque un cero puede significar dos cosas muy distintas:
 *
 *   · que de verdad no haya subido nadie (y entonces es un dato interesante);
 *   · que la comparación esté mirando en el sitio equivocado.
 *
 * Y hay una trampa conocida en este proyecto: los identificadores de persona son POR FEDERACIÓN, y equipos de
 * clubes distintos pueden compartir código. Además, un jugador puede aparecer con identidades nominales
 * distintas (sin código) según el acta. Así que aquí se mira por person_id Y por nombre normalizado, y se
 * enseña lo que salga de cada vía.
 *
 * SÓLO LEE la base local.
 *
 * Uso:  node scripts/servidor/cruza-juvenil-senior.mjs <entry_juvenil> <entry_senior...>
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

const [juvenil, ...mayores] = process.argv.slice(2).map(Number).filter(Boolean);
if (!juvenil || !mayores.length) { console.error('uso: cruza-juvenil-senior.mjs <entry_juvenil> <entry_senior...>'); process.exit(2); }

const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const pg = requerir('pg');
const cliente = new pg.Client({ connectionString: URL });
await cliente.connect();

const juveniles = await cliente.query(`
  select distinct a.person_id, p.nombre_mostrado, p.nombre_norm
    from core.appearance a left join core.person p on p.id = a.person_id
   where a.team_entry_id = $1 and a.person_id is not null`, [juvenil]);

const enSenior = await cliente.query(`
  select distinct a.person_id, p.nombre_mostrado, p.nombre_norm, m.id as partido
    from core.appearance a
    join core.match m on m.id = a.match_id
    left join core.person p on p.id = a.person_id
   where a.team_entry_id = any($1::bigint[]) and a.person_id is not null`, [mayores]);

console.log(`juvenil ${juvenil}: ${juveniles.rows.length} jugadores con aparición`);
console.log(`sénior ${mayores.join(', ')}: ${enSenior.rows.length} apariciones de personas distintas\n`);

const idsSenior = new Set(enSenior.rows.map((r) => String(r.person_id)));
const normSenior = new Map(enSenior.rows.map((r) => [r.nombre_norm, r]));

console.log('  por IDENTIFICADOR de persona:');
const porId = juveniles.rows.filter((j) => idsSenior.has(String(j.person_id)));
if (porId.length) for (const j of porId) console.log(`     ✓ ${j.nombre_mostrado}`);
else console.log('     ninguno');

console.log('\n  por NOMBRE (para cazar identidades sin código):');
let porNombre = 0;
for (const j of juveniles.rows) {
  if (idsSenior.has(String(j.person_id))) continue;
  const igual = normSenior.get(j.nombre_norm);
  if (igual) { porNombre++; console.log(`     ✓ ${j.nombre_mostrado}  (en el sénior como «${igual.nombre_mostrado}», persona ${igual.person_id})`); }
}
if (!porNombre) console.log('     ninguno');

console.log(`\n  TOTAL que ha jugado en un equipo superior: ${porId.length + porNombre}`);
await cliente.end();
