import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { DELEGADO_POR_ID, type FilaDelegado } from '@/consultas/oficiales';

/**
 * `GET /api/v1/oficiales/delegado/[id]`: ficha de un delegado de equipo.
 *
 * El id es el de `core.person.id`. Reutiliza `delegado-por-id`, con la regla de rol de la pantalla
 * (delegado de equipo; los roles de delegado de campo/protección no son esta ficha). Un id que no es
 * delegado o no existe es 404. No se expone ningún dato de cuenta.
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
    const { datos, origen } = await cacheado<FilaDelegado | null>(
      ['api:v1:delegado', String(id)],
      ETIQUETAS['delegado-por-id']!([id]),
      async () => {
        const [fila] = await consulta<FilaDelegado>(DELEGADO_POR_ID.sql, [id]);
        return fila ?? null;
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ninguna ficha de delegado para la persona ${id}.`);
    }
    return respuestaJson(sobreRecurso('delegado', datos, {
      web: `/explorar/delegado/${id}`,
      api: `/api/v1/oficiales/delegado/${id}`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
