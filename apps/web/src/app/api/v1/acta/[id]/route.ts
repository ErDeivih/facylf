import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { ACTA_DEL_PARTIDO, type FilaActaCanonica } from '@/consultas/partidos';

/**
 * `GET /api/v1/acta/[id]`: el acta completa de un partido.
 *
 * El id es el de `core.match.id`. Reutiliza `acta-del-partido` (la consulta de la pantalla del acta) y
 * conserva su regla: un partido sin informe de acta, o con calidad `unavailable`, no es un acta → 404.
 */
export async function GET(req: Request, contexto: ContextoRuta): Promise<Response> {
  const bloqueada = conLimiteDePeticiones(req);
  if (bloqueada !== null) return bloqueada;

  const { id: idCrudo } = await contexto.params;
  const id = idDeApi(idCrudo);
  if (id === null) {
    return errorApi(400, 'id_invalido', 'El id del acta debe ser el de un partido (entero positivo).', { parametro: 'id' });
  }

  try {
    const { datos, origen } = await cacheado<FilaActaCanonica | null>(
      ['api:v1:acta', String(id)],
      ETIQUETAS['acta-del-partido']([id]),
      async () => {
        const [fila] = await consulta<FilaActaCanonica>(ACTA_DEL_PARTIDO.sql, [id]);
        return fila ?? null;
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `El partido ${id} no existe o no tiene un acta publicada.`);
    }
    return respuestaJson(sobreRecurso('acta', datos, {
      web: `/explorar/acta/${id}`,
      api: `/api/v1/acta/${id}`,
      competicion: `/explorar/competicion/${datos.grupo_id}`,
      jornada: `/explorar/competicion/${datos.grupo_id}/jornada/${datos.jornada}`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
