/*
 * ── RELLENO DE LA COLA LOCAL DESDE LA COLA COMPARTIDA (Postgres) ──────────────────────────────────────────
 *
 * Diseño de Claude (25/11/2026), adaptado a nuestro caso: el recolector sigue trabajando contra su SQLite
 * (rápido y probado), pero **el trabajo se lo lleva por lotes de la cola compartida**, que es la que decide
 * quién hace qué. Así dos navegadores no pueden coger el mismo trabajo ni la misma competición, aunque estén
 * en la misma temporada.
 *
 * Cómo funciona:
 *   1. Reclama hasta N trabajos de `ops.cola` con una sola sentencia (`UPDATE … RETURNING` + SKIP LOCKED).
 *   2. Los inserta en la cola local (`trabajos`) para que el bucle del recolector los vea como siempre.
 *   3. Renueva el alquiler de la competición mientras trabaja.
 *
 * Si Postgres no responde, **no hace nada y el recolector sigue con su cola local**: nunca deja al navegador
 * sin trabajo por un fallo de la base compartida.
 *
 * Se carga con la ruta completa porque el módulo vive en `/app/scripts/node_modules` (directorio montado).
 */
const RUTA_PG = '/app/scripts/node_modules/pg';
const CADENA = process.env.FACYLF_COLA_POSTGRES ?? null;

// En un módulo ESM no existe `require`: hay que crearlo desde la ruta del propio fichero.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let Client = null;
try {
  ({ Client } = require(RUTA_PG));
} catch {
  // Sin driver: el recolector sigue con su cola local, como siempre.
}

/** Conexión corta a Postgres. Devuelve null si no hay cadena o no se puede conectar. */
async function conexion() {
  if (!CADENA || !Client) return null;
  const cliente = new Client({ connectionString: CADENA });
  try {
    await cliente.connect();
    return cliente;
  } catch {
    return null;
  }
}

/**
 * Reclama hasta `limite` trabajos de la cola compartida y los deja en la cola local.
 * Devuelve cuántos ha traído (0 si no hay cola compartida o no hay trabajo).
 */
export async function rellenaDesdePostgres(db, dueno, limite = 200) {
  const cliente = await conexion();
  if (!cliente) return 0;
  try {
    // Reclamación atómica: nadie más puede llevarse estas filas.
    const { rows } = await cliente.query(`
      update ops.cola c
         set estado = 'en_curso', dueno = $1, alquiler_hasta = now() + interval '20 min'
        where c.id in (
          select id from ops.cola
           where estado = 'pendiente'
             and (siguiente_intento is null or siguiente_intento <= now())
           order by prioridad, id
           limit $2
           for update skip locked
        )
        returning c.clave, c.tipo, c.temporada, c.competicion, c.grupo, c.jornada, c.acta, c.url, c.prioridad`,
      [dueno, limite]);

    if (rows.length === 0) return 0;

    const inserta = db.prepare(`insert into trabajos (clave, tipo, temporada, competicion, grupo, jornada, acta,
        url, prioridad, estado, intentos, creado_en, actualizado_en)
      values (?,?,?,?,?,?,?,?,?, 'pendiente', 0, ?, ?)
      on conflict(clave) do update set estado = 'pendiente', siguiente_intento = null`);
    const ahora = new Date().toISOString();
    db.exec('begin');
    for (const f of rows) {
      inserta.run(f.clave, f.tipo, f.temporada, f.competicion, f.grupo, f.jornada, f.acta, f.url,
        f.prioridad ?? 0, ahora, ahora);
    }
    db.exec('commit');

    // Alquiler de las competiciones que trae el lote: mientras las tenga, otro navegador no las cogerá.
    const competiciones = [...new Set(rows.filter((f) => f.competicion).map((f) => `${f.temporada}|${f.competicion}`))];
    for (const clave of competiciones) {
      const [temporada, competicion] = clave.split('|');
      await cliente.query(`
        insert into ops.competicion_alquiler (temporada, competicion, dueno, alquiler_hasta)
        values ($1, $2, $3, now() + interval '20 min')
        on conflict (temporada, competicion) do update
          set dueno = excluded.dueno, alquiler_hasta = excluded.alquiler_hasta
        where ops.competicion_alquiler.alquiler_hasta < now()`,
        [temporada, competicion, dueno]);
    }
    return rows.length;
  } catch (error) {
    console.error(`  · cola compartida: no se pudo rellenar (${error.message}). Se sigue con la cola local.`);
    return 0;
  } finally {
    try { await cliente.end(); } catch { /* da igual */ }
  }
}
