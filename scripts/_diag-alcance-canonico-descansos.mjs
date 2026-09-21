#!/usr/bin/env node
/**
 * SÓLO LECTURA: alcance CANÓNICO del defecto de las filas de descanso.
 *
 * Es la Fase 5 del encargo, y estaba sin poder medir porque PostgreSQL no estaba disponible. Este script
 * deja la medición preparada y ejecutable en cuanto la base esté viva: **no escribe nada**, sólo `select`.
 *
 * Mide, para cada federación afectada:
 *
 * 1. inscripciones canónicas cuyo nombre en la fuente es exactamente una palabra de descanso — el
 *    pseudo-equipo que se creó a partir del bloque de descanso;
 * 2. partidos canónicos que cuelgan de esa inscripción;
 * 3. apariciones, eventos y fichas de cuerpo técnico que cuelgan de ella;
 * 4. filas de clasificación (`standing_snapshot`) con esa inscripción;
 * 5. en qué grupos y temporadas están, y si el grupo está publicado.
 *
 * Con eso se puede escribir el plan de reparación con cifras en vez de con supuestos, y decidir qué lotes
 * reversibles hacen falta. Ver `docs/plataforma-web/REPARACION-DESCANSOS.md` §6.
 *
 * Uso: npx tsx scripts/_diag-alcance-canonico-descansos.mjs
 *
 * (Con 
ode a secas no arranca: importa el acceso al canónico, que es TypeScript. Se ejecuta con 	sx,
 *  igual que los demás diagnósticos que tocan PostgreSQL.)
 */
import { resolve } from 'node:path';

process.loadEnvFile(resolve(import.meta.dirname, '..', '.env'));

/** El vocabulario de descanso, por federación. Se declara aquí porque el canónico ya no sabe de maquetas. */
const PALABRAS = ['descansa', 'descans', 'descanso', 'atsedena'];

let creaPool;
try {
  ({ creaPool } = await import('../packages/canonico/src/destino/pool.js'));
} catch (error) {
  console.error(`✗ No se pudo cargar el acceso al canónico: ${error.message}`);
  process.exit(1);
}

let pool;
try {
  pool = creaPool();
} catch (error) {
  // El mensaje de `creaPool` ya explica qué falta (`.env`, `pnpm db:arrancar`). Aquí se añade el estado.
  console.error(`✗ No hay PostgreSQL canónico disponible, así que la Fase 5 no se puede medir todavía.`);
  console.error(`  ${error.message.split('\n')[0]}`);
  console.error('  Comprueba que Docker Desktop está arrancado y ejecuta `pnpm db:arrancar` y `pnpm db:migrar`.');
  process.exit(2);
}

/*
 * `creaPool` NO conecta: `pg` conecta en pereza, así que el fallo aparece en la PRIMERA consulta. Por eso
 * la conexión va también dentro de un try: sin esto, un PostgreSQL apagado daba una traza de pila en vez
 * de la frase que explica qué falta.
 */
let cliente;
try {
  cliente = await pool.connect();
} catch (error) {
  console.error('✗ No hay PostgreSQL canónico disponible, así que la Fase 5 no se puede medir todavía.');
  console.error(`  ${String(error.message).split('\n')[0]}`);
  console.error('  Comprueba que Docker Desktop está arrancado y ejecuta `pnpm db:arrancar` y `pnpm db:migrar`.');
  await pool.end().catch(() => undefined);
  process.exit(2);
}
try {
  // 1. Las inscripciones fantasma: nombre en la fuente que es EXACTAMENTE una palabra de descanso.
  const { rows: fantasma } = await cliente.query(
    `select te.id, te.nombre_en_fuente, te.codigo_externo, te.metodo_resolucion, te.procedencias,
            pg.codigo_externo as grupo, pg.nombre as grupo_nombre,
            ce.codigo_externo as competicion, ce.nombre_publicado as competicion_nombre,
            s.etiqueta as temporada, f.codigo as federacion,
            ce.visibility_state
       from core.team_entry te
       join core.phase_group pg on pg.id = te.phase_group_id
       join core.competition_edition ce on ce.id = pg.competition_edition_id
       join core.season s on s.id = ce.season_id
       join core.federation f on f.id = ce.federation_id
      where core.normaliza_nombre(te.nombre_en_fuente) = any($1::text[])
      order by f.codigo, s.etiqueta, pg.codigo_externo`,
    [PALABRAS],
  );

  console.log(`inscripciones canónicas cuyo nombre en la fuente es exactamente una palabra de descanso: ${fantasma.length}`);
  if (fantasma.length === 0) {
    console.log('  (ninguna: el pseudo-equipo no llegó al canónico)');
    process.exitCode = 0;
  } else {
    const ids = fantasma.map((f) => Number(f.id));
    const uno = async (etiqueta, sql) => {
      const { rows } = await cliente.query(sql, [ids]);
      console.log(`  ${etiqueta.padEnd(46)} ${String(rows[0]?.n ?? 0).padStart(6)}`);
      return Number(rows[0]?.n ?? 0);
    };
    console.log('\nlo que cuelga de esas inscripciones:');
    await uno('partidos (core.match, como local o visitante)', `select count(*) n from core.match where home_team_entry_id = any($1::bigint[]) or away_team_entry_id = any($1::bigint[])`);
    await uno('apariciones (core.appearance)', `select count(*) n from core.appearance where team_entry_id = any($1::bigint[])`);
    await uno('eventos (core.match_event)', `select count(*) n from core.match_event where team_entry_id = any($1::bigint[])`);
    await uno('fichas de cuerpo técnico (core.match_staff)', `select count(*) n from core.match_staff where team_entry_id = any($1::bigint[])`);
    await uno('filas de clasificación (core.standing_snapshot)', `select count(*) n from core.standing_snapshot where team_entry_id = any($1::bigint[])`);
    await uno('resúmenes de equipo (analytics.team_edition_summary)', `select count(*) n from analytics.team_edition_summary where team_entry_id = any($1::bigint[])`);

    const porFederacion = new Map();
    for (const f of fantasma) porFederacion.set(f.federacion, (porFederacion.get(f.federacion) ?? 0) + 1);
    const grupos = new Set(fantasma.map((f) => `${f.federacion}|${f.temporada}|${f.grupo}`));
    console.log(`\n  federaciones afectadas: ${[...porFederacion.entries()].map(([f, n]) => `${f}=${n}`).join(' · ')}`);
    console.log(`  grupos afectados: ${grupos.size}`);
    const sinPublicar = fantasma.filter((f) => f.visibility_state === 'oculta').length;
    console.log(`  de esas inscripciones, en grupos con visibilidad «oculta»: ${sinPublicar}`);
    console.log('\n  muestra:');
    for (const f of fantasma.slice(0, 8)) {
      console.log(`    ${f.federacion} ${f.temporada} c${f.competicion} g${f.grupo} · «${f.nombre_en_fuente}»`
        + ` · código ${f.codigo_externo ?? 'NULL'} · vía ${f.metodo_resolucion} · visibilidad ${f.visibility_state}`);
    }
    console.log('\n  Nada de esto se borra a mano: ver el plan de reparación (§6) para la vía por lotes reversibles.');
  }
} finally {
  cliente.release();
  await pool.end();
}
