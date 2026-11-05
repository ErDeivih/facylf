import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { HISTORIAL_DE_JUGADOR, type FilaHistorialJugador } from '@/consultas/historial';

/**
 * `GET /api/v1/ficha/jugador/[id]/historial`: historial real de una persona.
 *
 * Devuelve la persona y **todas sus apariciones** (con equipo, club, competición, temporada, fecha,
 * goles, tarjetas y minutos fiables). El cliente agrupa en tramos con las mismas reglas que la web
 * (`lib/historial-jugador.ts`); la API no impone una agrupación distinta. 404 si la persona no existe.
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
    const { datos, origen } = await cacheado<FilaHistorialJugador | null>(
      ['api:v1:historial-jugador', String(id)],
      ETIQUETAS['historial-de-jugador']!([id]),
      async () => {
        const [fila] = await consulta<FilaHistorialJugador>(HISTORIAL_DE_JUGADOR.sql, [id]);
        return fila ?? null;
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ninguna persona con el id ${id}.`);
    }
    return respuestaJson(sobreRecurso('historial-jugador', datos, {
      web: `/explorar/jugador/${id}/historial`,
      ficha: `/explorar/jugador/${id}`,
      api: `/api/v1/ficha/jugador/${id}/historial`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
