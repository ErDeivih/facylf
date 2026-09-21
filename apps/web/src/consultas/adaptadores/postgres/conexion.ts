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

/** Traduce el fallo a algo que se le pueda enseñar a una persona, sin filtrar la cadena de conexión. */
function resume(error: unknown): string {
  const codigo = (error as { code?: string } | null)?.code;
  if (codigo === 'ECONNREFUSED') return 'El canónico no acepta conexiones: ¿está arrancado el contenedor? (`pnpm db:arrancar`)';
  if (codigo === '28P01' || codigo === '28000') return 'Las credenciales de lectura del canónico no son válidas.';
  if (codigo === '3D000') return 'La base de datos canónica indicada no existe.';
  if (codigo === '42P01') return 'Falta una tabla del canónico: hay migraciones sin aplicar (`pnpm db:estado`, `pnpm db:migrar`).';
  if (codigo === '57014') return 'La consulta superó el presupuesto de tiempo del servidor de la web (5 s).';
  return `No se pudo consultar el canónico: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Ejecuta una consulta del catálogo `consultas/`. Devuelve las filas tal cual las da PostgreSQL:
 * quien llame decide qué hacer con un `null` (y nunca debe convertirlo en `0`).
 */
export async function consulta<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  parametros: readonly unknown[] = [],
): Promise<T[]> {
  const motivo = motivoSinCanonico();
  if (motivo) throw new CanonicoNoDisponible(motivo);
  try {
    const { rows } = await poolLector().query<T>(sql, parametros as unknown[]);
    return rows;
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) throw error;
    throw new CanonicoNoDisponible(resume(error));
  }
}

/** Cierra el pool. Lo usan las pruebas y el apagado ordenado. */
export async function cierraCanonico(): Promise<void> {
  const actual = pool;
  pool = null;
  await actual?.end();
}
