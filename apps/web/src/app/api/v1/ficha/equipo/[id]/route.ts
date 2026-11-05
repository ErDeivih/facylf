import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  EQUIPO_POR_ID, PARTIDOS_DEL_EQUIPO, PLANTILLA_DEL_EQUIPO,
  type FilaEquipo, type FilaJugadorDePlantilla, type FilaPartidoDeEquipo,
} from '@/consultas/entidades';
import {
  ESCUDO_DEL_CLUB, GOLES_POR_TRAMO, type FilaEscudoDeClub, type FilaTramoGoles,
} from '@/consultas/fichas';

/** Lo que devuelve `GET /api/v1/ficha/equipo/[id]`. */
type FichaEquipoApi = {
  equipo: FilaEquipo;
  escudo: FilaEscudoDeClub | null;
  plantilla: FilaJugadorDePlantilla[];
  partidos: FilaPartidoDeEquipo[];
  goles_por_tramo: FilaTramoGoles[];
};

/**
 * `GET /api/v1/ficha/equipo/[id]`: la ficha de una inscripción de equipo.
 *
 * El id es el de `core.team_entry.id` (la misma decisión que la pantalla: club y equipo-temporada no son
 * la misma entidad). Reutiliza las consultas de la ficha y las lee en una sola foto: cinco consultas
 * como mucho y ninguna por jugador ni por partido. Si el equipo no existe, 404 antes de pedir el resto.
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
    const { datos, origen } = await cacheado<FichaEquipoApi | null>(
      ['api:v1:ficha-equipo', String(id)],
      ETIQUETAS['equipo-por-id']([id]),
      async () => {
        const [equipo] = await consulta<FilaEquipo>(EQUIPO_POR_ID.sql, [id]);
        if (!equipo) return null;
        const [escudo, plantilla, partidos, goles] = await consultaEnUnaFoto([
          { sql: ESCUDO_DEL_CLUB.sql, parametros: [Number(equipo.club_id)] },
          { sql: PLANTILLA_DEL_EQUIPO.sql, parametros: [id, 200] },
          { sql: PARTIDOS_DEL_EQUIPO.sql, parametros: [id, 200, 0] },
          { sql: GOLES_POR_TRAMO.sql, parametros: [id] },
        ]);
        return {
          equipo,
          escudo: (escudo[0] as FilaEscudoDeClub | undefined) ?? null,
          plantilla: plantilla as unknown as FilaJugadorDePlantilla[],
          partidos: partidos as unknown as FilaPartidoDeEquipo[],
          goles_por_tramo: goles as unknown as FilaTramoGoles[],
        };
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ningún equipo con el id ${id}.`);
    }
    return respuestaJson(sobreRecurso('ficha-equipo', datos, {
      web: `/explorar/equipo/${id}`,
      api: `/api/v1/ficha/equipo/${id}`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
