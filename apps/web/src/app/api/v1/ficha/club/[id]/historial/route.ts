import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { HISTORIAL_DEL_CLUB, type FilaHistorialClub } from '@/consultas/historial-equipos';

/** Cuántas inscripciones del club se devuelven como mucho (la misma ventana que la pantalla). */
const LIMITE_INSCRIPCIONES = 500;

/**
 * `GET /api/v1/ficha/club/[id]/historial`: los equipos de un club, temporada a temporada.
 *
 * El id es el de `core.club.id`. Reutiliza `historial-del-club` con la misma ventana que la pantalla
 * (500 inscripciones, que cubre de sobra un club real) y devuelve el club en cada fila: así el cliente
 * pinta la cabecera sin otra lectura. Un club que existe pero no tiene equipos publicados devuelve 200
 * con una fila de club y el resto a `null`; un club que no existe es 404.
 */
export async function GET(req: Request, contexto: ContextoRuta): Promise<Response> {
  const bloqueada = conLimiteDePeticiones(req);
  if (bloqueada !== null) return bloqueada;

  const { id: idCrudo } = await contexto.params;
  const id = idDeApi(idCrudo);
  if (id === null) {
    return errorApi(400, 'id_invalido', 'El id del club debe ser entero positivo.', { parametro: 'id' });
  }

  try {
    const { datos, origen } = await cacheado<FilaHistorialClub[] | null>(
      ['api:v1:historial-club', String(id)],
      ETIQUETAS['historial-del-club']!([id]),
      async () => {
        const filas = await consulta<FilaHistorialClub>(HISTORIAL_DEL_CLUB.sql, [id, LIMITE_INSCRIPCIONES]);
        return filas.length === 0 ? null : filas;
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ningún club con el id ${id}.`);
    }
    return respuestaJson(sobreRecurso('historial-club', datos, {
      web: `/explorar/club/${id}/historial`,
      ficha: `/explorar/club/${id}`,
      api: `/api/v1/ficha/club/${id}/historial`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
