/*
 * ── VARIAS CONSULTAS, VARIAS CONEXIONES, UNA SOLA FOTO DE LA BASE ─────────────────────────────────────
 *
 * El informe de equipo lanza ~26 consultas de sólo lectura. Iban en serie dentro de una transacción
 * REPEATABLE READ para que todas vieran la misma foto mientras el importador escribe: correcto, pero
 * medido en las instantáneas del 27/09, cada equipo tardaba entre 7 y 21 s — la SUMA de todas.
 *
 * PostgreSQL permite exportar la foto de una transacción (`pg_export_snapshot()`) e importarla en otras
 * (`SET TRANSACTION SNAPSHOT`). Así varias conexiones ven EXACTAMENTE los mismos datos y el tiempo total
 * pasa a ser el de la consulta más lenta más el reparto. La coherencia no cambia: es la misma foto.
 *
 * Reglas:
 *   · La transacción que exporta se mantiene abierta hasta que terminan todas (si no, la foto caduca).
 *   · Todas son READ ONLY. Si una falla, se cancelan todas y el error dice qué consulta fue.
 *   · Con `conexiones: 1` el comportamiento es idéntico al anterior (útil para comparar).
 */

const FOTO_VALIDA = /^[0-9A-F]+-[0-9A-F]+(-[0-9]+)?$/i;

/** Orden de reparto: primero las que más tardaron la última vez, para no dejar la lenta para el final. */
export function ordenDeReparto(nombres, tiemposPrevios = {}) {
  return [...nombres].sort((a, b) => (Number(tiemposPrevios[b]) || 0) - (Number(tiemposPrevios[a]) || 0));
}

/**
 * @param {typeof import('pg')} pg  el módulo `pg` del paquete canónico
 * @param {string} url              conexión de sólo lectura
 * @param {Record<string,string>} consultas  nombre → SQL sin parámetros
 * @param {{conexiones?:number, aplicacion?:string, limite?:string, antesDeRepartir?:(c:any)=>Promise<void>, tiemposPrevios?:Record<string,number>}} opciones
 * @returns {Promise<{filas:Record<string,any[]>, tiempos:Record<string,number>, conexiones:number, totalMs:number}>}
 */
export async function ejecutaEnFoto(pg, url, consultas, opciones = {}) {
  const conexiones = Math.max(1, Math.min(8, Number(opciones.conexiones) || 1));
  const aplicacion = opciones.aplicacion ?? 'facylf-informe';
  const limite = /^\d+s$/.test(String(opciones.limite)) ? opciones.limite : '120s';
  const inicioTotal = performance.now();
  const clientes = [];
  let abiertas = 0;
  try {
    const coordinador = new pg.Client({ connectionString: url, application_name: aplicacion });
    await coordinador.connect(); clientes.push(coordinador);
    await coordinador.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); abiertas++;
    await coordinador.query(`SET LOCAL statement_timeout = '${limite}'`);
    // La foto de REPEATABLE READ se fija en la PRIMERA consulta, no en el BEGIN. Se fija aquí, antes
    // de cualquier otra cosa, para que la comprobación previa y todas las consultas vean lo mismo.
    // (Medido: exportándola después, lo escrito entre medias entraba en la foto.)
    const { rows: [{ foto }] } = await coordinador.query('select pg_export_snapshot() as foto');
    if (!FOTO_VALIDA.test(foto)) throw new Error(`Identificador de foto inesperado: ${foto}`);
    // Lo que haya que comprobar ANTES de gastar conexiones (p. ej. que el equipo es elegible), en la foto.
    if (opciones.antesDeRepartir) await opciones.antesDeRepartir(coordinador);

    if (conexiones > 1) {
      for (let i = 1; i < conexiones; i++) {
        const c = new pg.Client({ connectionString: url, application_name: `${aplicacion}-${i}` });
        await c.connect(); clientes.push(c);
        await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); abiertas++;
        await c.query(`SET TRANSACTION SNAPSHOT '${foto}'`);
        await c.query(`SET LOCAL statement_timeout = '${limite}'`);
      }
    }

    const pendientes = ordenDeReparto(Object.keys(consultas), opciones.tiemposPrevios);
    const filas = {}, tiempos = {};
    let fallo = null;
    const trabajador = async (cliente) => {
      while (pendientes.length && !fallo) {
        const nombre = pendientes.shift();
        const inicio = performance.now();
        try {
          filas[nombre] = (await cliente.query(consultas[nombre])).rows;
          tiempos[nombre] = Math.round(performance.now() - inicio);
        } catch (error) {
          fallo ??= Object.assign(error, { message: `Consulta ${nombre}: ${error.message}` });
        }
      }
    };
    await Promise.all(clientes.map(trabajador));
    if (fallo) throw fallo;
    // Devolver en el MISMO orden en que se declararon, para que el resto del motor no note la diferencia.
    const ordenadas = Object.fromEntries(Object.keys(consultas).map((k) => [k, filas[k]]));
    return { filas: ordenadas, tiempos, conexiones: clientes.length, totalMs: Math.round(performance.now() - inicioTotal) };
  } finally {
    // Primero cerrar las importadoras; la exportadora la última, para que la foto no caduque antes.
    for (const c of clientes.slice(1).concat(clientes.slice(0, 1))) {
      try { if (abiertas) await c.query('ROLLBACK'); } catch { /* ya cerrada */ }
      try { await c.end(); } catch { /* ya cerrada */ }
    }
  }
}
