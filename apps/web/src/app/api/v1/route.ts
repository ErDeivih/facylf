import {
  API_VERSION, ENDPOINTS_PUBLICOS, OPERACIONES_API, conLimiteDePeticiones, respuestaJson,
} from '@/lib/api';

/**
 * Índice de la API pública v1.
 *
 * Es el contrato legible por máquina: qué hay, con qué método, si está disponible o planeado. No toca
 * la base ni datos de sesión.
 */
export async function GET(req: Request): Promise<Response> {
  const bloqueada = conLimiteDePeticiones(req);
  if (bloqueada !== null) return bloqueada;
  return respuestaJson({
    api: { version: API_VERSION },
    endpoints: ENDPOINTS_PUBLICOS,
    operaciones: OPERACIONES_API,
  }, req, { cache: 'indice' });
}
