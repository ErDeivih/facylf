import { API_VERSION, errorApi } from '@/lib/api';
import { consumeInvalidaciones } from '@/lib/cache';
import { CanonicoNoDisponible } from '@/consultas/adaptadores/postgres/conexion';

/**
 * `POST /api/revalidar`: consume la cola de `ops.invalidacion` y refresca la caché por etiquetas.
 *
 * No es un endpoint público: es la operación de servicio que llama el proyector (o el temporizador de
 * `instrumentation.ts`, cada minuto) cuando cambia un grupo. Exige `Authorization: Bearer <secreto>`,
 * con el mismo secreto del proyector (`REVALIDACION_SECRETO`; se admite el nombre antiguo
 * `REVALIDAR_SECRETO`). Sin secreto configurado responde 503: no se abre nunca en abierto.
 *
 * Devuelve `{ refrescadas }`: etiquetas consumidas más las derivadas (acta/calendario) que también se
 * refrescan. La cola queda marcada como consumida en la misma transacción de la función del canónico.
 */
export async function POST(req: Request): Promise<Response> {
  const secreto = (process.env.REVALIDACION_SECRETO ?? process.env.REVALIDAR_SECRETO ?? '').trim();
  if (secreto === '') {
    return errorApi(503, 'sin_configurar', 'La revalidación no está configurada en este servidor.');
  }
  const autorizacion = (req.headers.get('authorization') ?? '').trim();
  if (autorizacion !== `Bearer ${secreto}`) {
    return errorApi(401, 'no_autorizado', 'Hace falta el secreto de revalidación.');
  }

  // `maximo` permite limitar el lote (0 = sólo comprobar que la operación responde, sin consumir nada).
  const maximoCrudo = new URL(req.url).searchParams.get('maximo');
  let maximo = 2000;
  if (maximoCrudo !== null) {
    const n = Number(maximoCrudo);
    if (!Number.isInteger(n) || n < 0 || n > 10_000) {
      return errorApi(400, 'parametro_invalido', '«maximo» debe ser un entero entre 0 y 10000.', { parametro: 'maximo' });
    }
    maximo = n;
  }

  try {
    const refrescadas = await consumeInvalidaciones(maximo);
    return new Response(JSON.stringify({ api: { version: API_VERSION }, refrescadas }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof CanonicoNoDisponible) {
      return errorApi(503, 'canonico_no_disponible', error.message);
    }
    console.error('[api] fallo consumiendo invalidaciones:', error);
    return errorApi(500, 'error_interno', 'No se ha podido consumir la cola de invalidaciones.');
  }
}
