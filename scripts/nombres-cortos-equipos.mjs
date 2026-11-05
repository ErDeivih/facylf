#!/usr/bin/env node
/*
 * Deriva y guarda el nombre corto de los equipos en `analytics.nombre_corto_equipo`.
 *
 *   node scripts/nombres-cortos-equipos.mjs --seco
 *   node scripts/nombres-cortos-equipos.mjs
 *   node scripts/nombres-cortos-equipos.mjs --federacion castilla-leon
 *
 * Qué hace: lee las inscripciones de equipo de la federación con su nombre publicado, aplica las reglas
 * puras de `scripts/lib/nombres-cortos.mjs` (y las decisiones manuales de ese mismo fichero) y guarda una
 * fila por `team_entry_id` con `nombre_corto`, `metodo` y `confianza`. No toca el nombre de la fuente: el
 * nombre largo se sigue enseñando donde cabe.
 *
 * Idempotente por diseño: la clave es la inscripción y el `on conflict` sólo escribe si el nombre, el
 * método o la confianza cambian. Una segunda pasada no modifica ninguna fila (lo comprueba la prueba).
 *
 * Opciones:
 *   --seco               calcula y enseña la cobertura y los casos dudosos, sin escribir.
 *   --federacion <cod>   federación a poblar (por defecto castilla-leon).
 *   --limite <n>         para probar: sólo las primeras n inscripciones.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nombreCortoParaEquipo } from './lib/nombres-cortos.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* el mensaje claro se da debajo */ }
}

const argv = process.argv.slice(2);
const arg = (nombre, porDefecto = null) => {
  const i = argv.indexOf(`--${nombre}`);
  return i >= 0 ? argv[i + 1] : porDefecto;
};
const seco = argv.includes('--seco');
const federacion = arg('federacion', 'castilla-leon');
const limite = Number(arg('limite', 0)) || 0;

const url = process.env.DATABASE_URL_PUBLICADOR || process.env.DATABASE_URL_LECTOR;
if (!url) throw new Error('Falta DATABASE_URL_PUBLICADOR (o DATABASE_URL_LECTOR) en .env.');
const { Client } = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'))('pg');
const db = new Client({ connectionString: url, application_name: 'facylf-nombres-cortos' });
await db.connect();

try {
  const { rows } = await db.query(
    `select te.id as team_entry_id, te.nombre_en_fuente
       from core.team_entry te
       join core.phase_group g on g.id = te.phase_group_id
       join core.competition_edition e on e.id = g.competition_edition_id
       join core.federation f on f.id = e.federation_id
      where f.codigo = $1
      order by te.id
      ${limite > 0 ? 'limit $2' : ''}`,
    limite > 0 ? [federacion, limite] : [federacion]);

  const equipos = rows.map((fila) => ({
    teamEntryId: Number(fila.team_entry_id),
    nombreEnFuente: fila.nombre_en_fuente,
    ...nombreCortoParaEquipo(fila.nombre_en_fuente),
  }));

  const resumen = {
    federacion,
    equipos: equipos.length,
    regla: equipos.filter((e) => e.metodo === 'regla').length,
    manual: equipos.filter((e) => e.metodo === 'manual').length,
    confianzaBaja: equipos.filter((e) => e.confianza < 0.7).length,
    masLargoQue28: equipos.filter((e) => e.nombreCorto.length > 28).length,
    sinCambio: equipos.filter((e) => e.nombreCorto === e.nombreEnFuente).length,
  };
  console.log(JSON.stringify(resumen, null, 2));

  // Los casos que piden revisión: confianza baja o nombre corto aún largo. No se escriben a mano solos;
  // se enseñan para decidirlos (y si se decide, va a `DECISIONES_MANUALES`).
  const dudosos = equipos.filter((e) => e.confianza < 0.7 || e.nombreCorto.length > 28);
  if (dudosos.length > 0) {
    console.log(`\nCasos a revisar (${dudosos.length}):`);
    for (const equipo of dudosos.slice(0, 40)) {
      console.log(`  ${String(equipo.confianza).padEnd(4)} ${JSON.stringify(equipo.nombreEnFuente)} -> ${JSON.stringify(equipo.nombreCorto)}`);
    }
    if (dudosos.length > 40) console.log(`  … y ${dudosos.length - 40} más`);
  }

  if (seco) {
    console.log('\nEN SECO: no se ha escrito nada.');
  } else {
    // Upsert por tandas: 34.000 filas de una en una serían miles de viajes. `unnest` manda los cuatro
    // arrays en una sola sentencia por tanda.
    let nuevas = 0;
    let actualizadas = 0;
    const TANDA = 500;
    for (let i = 0; i < equipos.length; i += TANDA) {
      const tanda = equipos.slice(i, i + TANDA);
      const { rows: tocadas } = await db.query(
        `insert into analytics.nombre_corto_equipo (team_entry_id, nombre_corto, metodo, confianza)
         select * from unnest($1::bigint[], $2::text[], $3::text[], $4::numeric[])
         on conflict (team_entry_id) do update set
           nombre_corto = excluded.nombre_corto,
           metodo = excluded.metodo,
           confianza = excluded.confianza,
           observado_en = now()
         where analytics.nombre_corto_equipo.nombre_corto is distinct from excluded.nombre_corto
            or analytics.nombre_corto_equipo.metodo is distinct from excluded.metodo
            or analytics.nombre_corto_equipo.confianza is distinct from excluded.confianza
         returning (xmax = 0) as insertada`,
        [
          tanda.map((e) => e.teamEntryId),
          tanda.map((e) => e.nombreCorto),
          tanda.map((e) => e.metodo),
          tanda.map((e) => e.confianza),
        ]);
      for (const fila of tocadas) {
        if (fila.insertada) nuevas += 1;
        else actualizadas += 1;
      }
    }
    console.log(`\nGuardadas: ${nuevas} nuevas · ${actualizadas} actualizadas · sin cambios: ${equipos.length - nuevas - actualizadas}`);
    const cobertura = await db.query(
      `select count(*)::int as equipos_con_nombre,
              count(*) filter (where n.metodo = 'manual')::int as manuales,
              count(*) filter (where n.confianza < 0.7)::int as revision
         from analytics.nombre_corto_equipo n
         join core.team_entry te on te.id = n.team_entry_id
         join core.phase_group g on g.id = te.phase_group_id
         join core.competition_edition e on e.id = g.competition_edition_id
         join core.federation f on f.id = e.federation_id
        where f.codigo = $1`, [federacion]);
    console.log(JSON.stringify({ cobertura: cobertura.rows[0] }, null, 2));
  }
} finally {
  await db.end();
}
