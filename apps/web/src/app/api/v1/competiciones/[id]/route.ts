import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { enlacesDeCompeticion, idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { GRUPO_POR_ID, type FilaPortadaGrupo } from '@/consultas/competiciones';

/**
 * `GET /api/v1/competiciones/[id]`: contexto y cobertura de un grupo.
 *
 * El id es el de `core.phase_group.id`, el mismo que usa la pantalla `/explorar/competicion/[id]`.
 * Reutiliza la consulta de esa pantalla; no hay SQL nuevo aquí. Responde 400 si el id no es válido y
 * 404 si no existe (o si la federación está excluida de la web).
 */
export async function GET(req: Request, contexto: ContextoRuta): Promise<Response> {
  const bloqueada = conLimiteDePeticiones(req);
  if (bloqueada !== null) return bloqueada;

  const { id: idCrudo } = await contexto.params;
  const id = idDeApi(idCrudo);
  if (id === null) {
    return errorApi(400, 'id_invalido', 'El id de la competición debe ser un entero positivo.', { parametro: 'id' });
  }

  try {
    const { datos, origen } = await cacheado<FilaPortadaGrupo | null>(
      ['api:v1:competicion', String(id)],
      ETIQUETAS['grupo-por-id']!([id]),
      async () => {
        const [fila] = await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [id]);
        return fila ?? null;
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ninguna competición con el id ${id}.`);
    }
    return respuestaJson(sobreRecurso('competicion', datos, enlacesDeCompeticion(id)), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
