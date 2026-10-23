import pg from 'pg';

/**
 * Adaptador PostgreSQL: la única frontera de la web con la base.
 *
 * Reglas que no se negocian:
 * - se lee con el rol `facylf_lector`, nunca con el publicador ni con el administrador;
 * - si no hay credenciales o el canónico no responde, la web lo **dice**: no rellena el hueco con
 *   datos de ejemplo ni con ceros, porque un cero se lee como «no pasó nada» y aquí significa
 *   «no lo sé»;
 * - todo va por parámetros (`$1`, `$2`…). Aquí no se concatena un valor en SQL jamás.
 *
 * Este fichero no importa nada de Next: es testeable sin servidor y reutilizable por un script.
 */

export class CanonicoNoDisponible extends Error {}

const URL_LECTOR = (process.env.DATABASE_URL_LECTOR ?? '').trim();
const ROL_CON_ESCRITURA = /facylf_(admin|publicador|migracion)/i;

/** Motivo por el que la web no puede leer el canónico, o `null` si sí puede. */
export function motivoSinCanonico(): string | null {
  if (URL_LECTOR.length === 0) {
    return 'Falta DATABASE_URL_LECTOR. Sin credenciales de lectura, esta página no puede enseñar nada: '
      + 'no se inventan datos para rellenarla.';
  }
  if (ROL_CON_ESCRITURA.test(URL_LECTOR)) {
    return 'DATABASE_URL_LECTOR apunta a un rol con permiso de escritura. La web sólo puede leer con facylf_lector.';
  }
  return null;
}

let pool: pg.Pool | null = null;

function poolLector(): pg.Pool {
  pool ??= new pg.Pool({
    connectionString: URL_LECTOR,
    max: 5,
    application_name: 'facylf-web',
    // Presupuesto duro: una página no puede quedarse colgada esperando a PostgreSQL. 5 s es holgado
    // frente a los presupuestos de RENDIMIENTO-BUSQUEDA.md y evita acumular consultas colgadas.
    statement_timeout: 5000,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

/**
 * Traduce el fallo a algo que se le pueda enseñar a una persona, sin filtrar la cadena de conexión.
 *
 * ── EL MENSAJE DECÍA «5 s» SIEMPRE, Y ESO MANDA A BUSCAR DONDE NO ESTÁ (medido el 29/09/2026) ────────────
 *
 * El texto del tiempo agotado estaba escrito a mano con el presupuesto por defecto de la web. Pero `consulta`
 * puede AMPLIAR ese presupuesto para una consulta declarada cara a propósito, y entonces el aviso decía
 * «(5 s)» cuando lo que se había agotado eran veinte: la última medición de la prueba de contrato dio
 * exactamente eso —`RESUMEN_CANONICO` declara 20 s y el error hablaba de 5—, que es la clase de dato que hace
 * perder una tarde. Ahora se informa del presupuesto QUE ESTABA EN VIGOR.
 */
function resume(error: unknown, presupuestoMs: number): string {
  const codigo = (error as { code?: string } | null)?.code;
  if (codigo === 'ECONNREFUSED') return 'El canónico no acepta conexiones: ¿está arrancado el contenedor? (`pnpm db:arrancar`)';
  if (codigo === '28P01' || codigo === '28000') return 'Las credenciales de lectura del canónico no son válidas.';
  if (codigo === '3D000') return 'La base de datos canónica indicada no existe.';
  if (codigo === '42P01') return 'Falta una tabla del canónico: hay migraciones sin aplicar (`pnpm db:estado`, `pnpm db:migrar`).';
  if (codigo === '57014') {
    return `La consulta superó el presupuesto de tiempo del servidor de la web (${(presupuestoMs / 1000).toFixed(0)} s).`;
  }
  return `No se pudo consultar el canónico: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Ejecuta una consulta del catálogo `consultas/`. Devuelve las filas tal cual las da PostgreSQL:
 * quien llame decide qué hacer con un `null` (y nunca debe convertirlo en `0`).
 *
 * `presupuestoMs` sólo se usa para AMPLIAR el presupuesto de una consulta de diagnóstico declarada como
 * cara a propósito (el resumen del canónico cuenta tablas de hechos enteras). Por debajo de los 5 s del
 * servidor no se toca nada: el límite de la web sigue siendo el mismo para todo lo demás.
 */
export async function consulta<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  parametros: readonly unknown[] = [],
  opciones: { presupuestoMs?: number } = {},
): Promise<T[]> {
  const motivo = motivoSinCanonico();
  if (motivo) throw new CanonicoNoDisponible(motivo);
  const presupuesto = opciones.presupuestoMs ?? 0;
  const cliente = presupuesto > 5000 ? await poolLector().connect() : null;
  // El presupuesto que de verdad está en vigor: el declarado por la consulta si se abrió conexión propia para
  // ampliarlo, y si no el de la web (el `statement_timeout` del pool). Se usa para informar del fallo.
  const enVigor = cliente !== null ? Math.floor(presupuesto) : 5000;
  try {
    if (cliente !== null) {
      await cliente.query('begin');
      await cliente.query(`set local statement_timeout = ${Math.floor(presupuesto)}`);
      const { rows } = await cliente.query<T>(sql, parametros as unknown[]);
      await cliente.query('commit');
      return rows;
    }
    const { rows } = await poolLector().query<T>(sql, parametros as unknown[]);
    return rows;
  } catch (error) {
    if (cliente !== null) await cliente.query('rollback').catch(() => undefined);
    if (error instanceof CanonicoNoDisponible) throw error;
    throw new CanonicoNoDisponible(resume(error, enVigor));
  } finally {
    cliente?.release();
  }
}

/**
 * Ejecuta VARIAS consultas en UNA SOLA foto del canónico.
 *
 * Para qué. Una prueba que compara el `total` de la página 1 con el de la página 2 usando dos consultas
 * sueltas no comprueba la paginación: comprueba si el canónico está quieto. Medido el 25/09/2026, con el
 * importador escribiendo: «el total cambia entre páginas» fallaba con una diferencia de una fila, y ese
 * fallo no decía nada de la paginación. Con `repeatable read` las dos consultas ven el mismo estado y la
 * comprobación vuelve a hablar de lo que dice hablar.
 *
 * Es de sólo lectura: no puede escribir ni por descuido.
 */
export async function consultaEnUnaFoto<T extends pg.QueryResultRow = pg.QueryResultRow>(
  consultas: ReadonlyArray<{ sql: string; parametros?: readonly unknown[] }>,
): Promise<T[][]> {
  const motivo = motivoSinCanonico();
  if (motivo) throw new CanonicoNoDisponible(motivo);
  const cliente = await poolLector().connect();
  try {
    await cliente.query('begin isolation level repeatable read read only');
    const salidas: T[][] = [];
    for (const una of consultas) {
      const { rows } = await cliente.query<T>(una.sql, (una.parametros ?? []) as unknown[]);
      salidas.push(rows);
    }
    await cliente.query('commit');
    return salidas;
  } catch (error) {
    await cliente.query('rollback').catch(() => undefined);
    if (error instanceof CanonicoNoDisponible) throw error;
    // Aquí no se amplía nada: esta función va siempre con el presupuesto de la web.
    throw new CanonicoNoDisponible(resume(error, 5000));
  } finally {
    cliente.release();
  }
}

/** Cierra el pool. Lo usan las pruebas y el apagado ordenado. */
export async function cierraCanonico(): Promise<void> {
  const actual = pool;
  pool = null;
  await actual?.end();
}
