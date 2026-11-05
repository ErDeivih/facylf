import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { ENTRENADOR_POR_ID, type FilaEntrenador } from '@/consultas/oficiales';

/**
 * `GET /api/v1/oficiales/entrenador/[id]`: ficha de un entrenador.
 *
 * El id es el de `core.person.id`. Reutiliza `entrenador-por-id`, con la misma regla de rol que la
 * pantalla (primer/segundo entrenador normalizado; nunca preparadores de porteros). Un jugador o un id
 * inexistente son 404. No se expone ningún dato de cuenta.
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
    const { datos, origen } = await cacheado<FilaEntrenador | null>(
      ['api:v1:entrenador', String(id)],
      ETIQUETAS['entrenador-por-id']!([id]),
      async () => {
        const [fila] = await consulta<FilaEntrenador>(ENTRENADOR_POR_ID.sql, [id]);
        return fila ?? null;
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ninguna ficha de entrenador para la persona ${id}.`);
    }
    return respuestaJson(sobreRecurso('entrenador', datos, {
      web: `/explorar/entrenador/${id}`,
      api: `/api/v1/oficiales/entrenador/${id}`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
