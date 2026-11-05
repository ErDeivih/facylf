import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  PERSONA_POR_ID, TRAYECTORIA_DE_PERSONA, type FilaPersona, type FilaTemporadaDePersona,
} from '@/consultas/entidades';
import { PARTIDOS_DE_PERSONA, type FilaPartidoDePersona } from '@/consultas/fichas';

/** Lo que devuelve `GET /api/v1/ficha/jugador/[id]`. */
type FichaJugadorApi = {
  persona: FilaPersona;
  trayectoria: FilaTemporadaDePersona[];
  partidos: FilaPartidoDePersona[];
};

/**
 * `GET /api/v1/ficha/jugador/[id]`: ficha de una persona.
 *
 * El id es el de `core.person.id`, no un código federativo (la misma persona puede tener códigos de dos
 * federaciones). Se reutilizan las consultas de la ficha: persona + trayectoria + últimos partidos, dos
 * viajes y nada por partido. Los nombres de menores se publican igual que en la web (consentimiento de
 * la federación); esta API no sirve fotos de personas.
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
    const { datos, origen } = await cacheado<FichaJugadorApi | null>(
      ['api:v1:ficha-jugador', String(id)],
      ETIQUETAS['persona-por-id']([id]),
      async () => {
        const [persona] = await consulta<FilaPersona>(PERSONA_POR_ID.sql, [id]);
        if (!persona) return null;
        const [trayectoria, partidos] = await consultaEnUnaFoto([
          { sql: TRAYECTORIA_DE_PERSONA.sql, parametros: [id, 100] },
          { sql: PARTIDOS_DE_PERSONA.sql, parametros: [id, 12] },
        ]);
        return {
          persona,
          trayectoria: trayectoria as unknown as FilaTemporadaDePersona[],
          partidos: partidos as unknown as FilaPartidoDePersona[],
        };
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ninguna persona con el id ${id}.`);
    }
    return respuestaJson(sobreRecurso('ficha-jugador', datos, {
      web: `/explorar/jugador/${id}`,
      api: `/api/v1/ficha/jugador/${id}`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
