import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { ARBITRO_POR_ID, type FilaArbitro } from '@/consultas/oficiales';

/**
 * `GET /api/v1/oficiales/arbitro/[id]`: ficha de un árbitro principal.
 *
 * El id es el de `core.person.id`. Reutiliza `arbitro-por-id`, que devuelve fila sólo si esa persona ha
 * arbitrado al menos un partido como principal: un jugador o un id inexistente son 404, no una ficha
 * vacía. No se expone ningún dato de cuenta.
 */
export async function GET(req: Request, contexto: ContextoRuta): Promise<Response> {
  const bloqueada = conLimiteDePeticiones(req);
  if (bloqueada !== null) return bloqueada;

  const { id: idCrudo } = await contexto.params;
  const id = idDeApi(idCrudo);
  if (id === null) {
    return errorApi(400, 'id_invalido', 'El id de la persona debe ser entero positivo.', { parametro: 'id' });
  }

  try {
    const { datos, origen } = await cacheado<FilaArbitro | null>(
      ['api:v1:arbitro', String(id)],
      ETIQUETAS['arbitro-por-id']!([id]),
      async () => {
        const [fila] = await consulta<FilaArbitro>(ARBITRO_POR_ID.sql, [id]);
        return fila ?? null;
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ninguna ficha de árbitro para la persona ${id}.`);
    }
    return respuestaJson(sobreRecurso('arbitro', datos, {
      web: `/explorar/arbitro/${id}`,
      api: `/api/v1/oficiales/arbitro/${id}`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
