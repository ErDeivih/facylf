import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { HISTORIAL_DEL_EQUIPO, type FilaHistorialEquipo } from '@/consultas/historial-equipos';

/**
 * `GET /api/v1/ficha/equipo/[id]/historial`: la línea de un equipo, temporada a temporada.
 *
 * El id es el de `core.team_entry.id` (inscripción). Reutiliza `historial-del-equipo`: todas las
 * temporadas de la línea (club, categoría y letra) con competición, grupo, puesto, movimiento, balance,
 * racha y enlaces a jornada/acta. 404 si el equipo no existe o su federación está excluida.
 */
export async function GET(req: Request, contexto: ContextoRuta): Promise<Response> {
  const bloqueada = conLimiteDePeticiones(req);
  if (bloqueada !== null) return bloqueada;

  const { id: idCrudo } = await contexto.params;
  const id = idDeApi(idCrudo);
  if (id === null) {
    return errorApi(400, 'id_invalido', 'El id del equipo debe ser entero positivo.', { parametro: 'id' });
  }

  try {
    const { datos, origen } = await cacheado<FilaHistorialEquipo[] | null>(
      ['api:v1:historial-equipo', String(id)],
      ETIQUETAS['historial-del-equipo']!([id]),
      async () => {
        const filas = await consulta<FilaHistorialEquipo>(HISTORIAL_DEL_EQUIPO.sql, [id]);
        return filas.length === 0 ? null : filas;
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ningún equipo con el id ${id}.`);
    }
    return respuestaJson(sobreRecurso('historial-equipo', datos, {
      web: `/explorar/equipo/${id}/historial`,
      ficha: `/explorar/equipo/${id}`,
      api: `/api/v1/ficha/equipo/${id}/historial`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
