/**
 * Pool de escritura del canónico.
 *
 * Regla de prohibiciones del encargo: el importador escribe SIEMPRE con `DATABASE_URL_PUBLICADOR`.
 * Nunca con `facylf_admin` (dueño de las migraciones) ni con `facylf_lector` (sólo lectura).
 */
import pg from 'pg';

export type PoolCanonico = pg.Pool;
export type ClienteCanonico = pg.PoolClient;

const MAX_CONEXIONES = 5;

export function urlPublicador(): string {
  const url = process.env.DATABASE_URL_PUBLICADOR;
  if (!url) {
    throw new Error(
      'Falta DATABASE_URL_PUBLICADOR. Copia .env.example como .env y arranca el canónico con '
      + '`pnpm db:arrancar` y `pnpm db:migrar`.',
    );
  }
  if (/facylf_admin/.test(url)) {
    throw new Error('DATABASE_URL_PUBLICADOR apunta a facylf_admin: el importador no escribe como admin.');
  }
  return url;
}

/** ¿Hay canónico disponible? Las pruebas se saltan con aviso cuando no lo hay. */
export async function canonicoDisponible(): Promise<{ disponible: boolean; motivo?: string }> {
  let pool: pg.Pool | undefined;
  try {
    pool = creaPool();
    const cliente = await pool.connect();
    try {
      await cliente.query('select 1 from ops.migracion limit 1');
    } finally {
      cliente.release();
    }
    return { disponible: true };
  } catch (error) {
    return { disponible: false, motivo: error instanceof Error ? error.message : String(error) };
  } finally {
    await pool?.end().catch(() => undefined);
  }
}

export function creaPool(): pg.Pool {
  const pool = new pg.Pool({
    connectionString: urlPublicador(),
    max: MAX_CONEXIONES,
    idleTimeoutMillis: 10_000,
    // El publicador no lleva `statement_timeout`: una importación de un grupo grande puede tardar
    // minutos y no debe abortarse a mitad, porque un lote a medias parece cobertura.
    statement_timeout: false,
    application_name: 'facylf-importador',
  });
  return pool;
}
