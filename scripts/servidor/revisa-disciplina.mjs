/*
 * revisa-disciplina.mjs — ¿están bien contadas las tarjetas de este equipo?
 *
 * ── QUÉ COMPRUEBA Y POR QUÉ ASÍ ─────────────────────────────────────────────────────────────────────────
 *
 * La sospecha del responsable: «a la mayoría de jugadores le salen muy pocas tarjetas». Puede ser normal —con
 * dos jornadas jugadas, lo raro sería lo contrario— o puede ser que estemos perdiendo las tarjetas por el
 * camino. Se distingue comparando, NO mirando el total del equipo:
 *
 *   1. Las tarjetas de NUESTRO equipo en cada partido, y las del RIVAL en ese mismo partido. Si en los mismos
 *      partidos el rival acumula muchas y nosotros casi ninguna, algo no cuadra; si van parejas, es el fútbol.
 *   2. Cuántos JUGADORES DISTINTOS tienen tarjeta. Un reparto muy concentrado en uno o dos apunta a que las
 *      demás no se están atribuyendo.
 *   3. Y las que van al BANQUILLO (`sujeto_tipo`), que no son de ningún jugador y no deben contarse como suyas.
 *
 * SÓLO LEE la base local.
 *
 * Uso:  node scripts/servidor/revisa-disciplina.mjs <team_entry_id>
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

const entry = Number(process.argv[2]);
if (!entry) { console.error('uso: revisa-disciplina.mjs <team_entry_id>'); process.exit(2); }

const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const pg = requerir('pg');
const cliente = new pg.Client({ connectionString: URL });
await cliente.connect();

// 1. Tarjetas por partido: las nuestras y las del rival, en los mismos partidos.
const porPartido = await cliente.query(`
  select j.numero as jornada, m.id as partido,
         count(*) filter (where e.team_entry_id = $1 and e.event_type = 'tarjeta_amarilla') as nuestras_amarillas,
         count(*) filter (where e.team_entry_id = $1 and e.event_type = 'tarjeta_roja') as nuestras_rojas,
         count(*) filter (where e.team_entry_id <> $1 and e.event_type = 'tarjeta_amarilla') as rival_amarillas,
         count(*) filter (where e.team_entry_id <> $1 and e.event_type = 'tarjeta_roja') as rival_rojas
    from core.match m
    join core.matchday j on j.id = m.matchday_id
    left join core.match_event e on e.match_id = m.id
   where m.id in (select match_id from core.appearance where team_entry_id = $1)
   group by j.numero, m.id order by j.numero`, [entry]);

console.log(`equipo ${entry} · partidos con alineación: ${porPartido.rows.length}\n`);
console.log('  jornada   nuestras(A/R)   rival(A/R)');
let nA = 0, nB = 0, oA = 0, oB = 0;
for (const r of porPartido.rows) {
  nA += Number(r.nuestras_amarillas); nB += Number(r.nuestras_rojas);
  oA += Number(r.rival_amarillas); oB += Number(r.rival_rojas);
  console.log(`  J${String(r.jornada).padEnd(7)} ${String(r.nuestras_amarillas)}/${r.nuestras_rojas}`.padEnd(30) + `${r.rival_amarillas}/${r.rival_rojas}`);
}
console.log(`  TOTAL     ${nA}/${nB}`.padEnd(30) + `${oA}/${oB}`);

// 2. Reparto entre jugadores: ¿se concentran o se reparten?
const porJugador = await cliente.query(`
  select p.nombre_mostrado as jugador, e.sujeto_tipo,
         count(*) filter (where e.event_type = 'tarjeta_amarilla') as amarillas,
         count(*) filter (where e.event_type = 'tarjeta_roja') as rojas
    from core.match_event e
    left join core.person p on p.id = e.person_id
   where e.team_entry_id = $1 and e.event_type in ('tarjeta_amarilla','tarjeta_roja')
   group by p.nombre_mostrado, e.sujeto_tipo
   order by amarillas desc, rojas desc`, [entry]);

console.log('\n  tarjetas por persona:');
if (!porJugador.rows.length) console.log('     ninguna');
for (const r of porJugador.rows) {
  console.log(`     ${String(r.jugador ?? '(sin identificar)').padEnd(34)} A:${r.amarillas} R:${r.rojas}`
    + `${r.sujeto_tipo && r.sujeto_tipo !== 'jugador' ? `  ← ${r.sujeto_tipo} (no es jugador)` : ''}`);
}

// 3. Control: cuántos jugadores han jugado, para poder decir «pocas» con fundamento.
const jugadores = await cliente.query(`
  select count(distinct person_id) as n from core.appearance where team_entry_id = $1 and person_id is not null`, [entry]);
console.log(`\n  jugadores con aparición: ${jugadores.rows[0].n}`);
console.log(`  con al menos una tarjeta: ${new Set(porJugador.rows.filter((r) => !r.sujeto_tipo || r.sujeto_tipo === 'jugador').map((r) => r.jugador)).size}`);
console.log(`\n  comparación: en los mismos partidos el rival acumuló ${oA + oB} tarjetas y nosotros ${nA + nB}.`);
await cliente.end();
