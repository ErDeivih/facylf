import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import {
  CLUB_POR_ID, EQUIPOS_DEL_CLUB, type FilaClub, type FilaEquipoDeClub,
} from '@/consultas/entidades';
import { ESCUDO_DEL_CLUB, type FilaEscudoDeClub } from '@/consultas/fichas';

/** Lo que devuelve `GET /api/v1/ficha/club/[id]`. */
type FichaClubApi = {
  club: FilaClub;
  escudo: FilaEscudoDeClub | null;
  equipos: FilaEquipoDeClub[];
};

/**
 * `GET /api/v1/ficha/club/[id]`: ficha de un club canónico.
 *
 * El id es el de `core.club.id`. Reutiliza las consultas de la ficha: club, sus inscripciones (hasta 500,
 * que cubre de sobra un club real) y si tiene escudo. Un club no se confunde con un equipo: la lista de
 * `equipos` es la de inscripciones de todas sus categorías y temporadas.
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
    const { datos, origen } = await cacheado<FichaClubApi | null>(
      ['api:v1:ficha-club', String(id)],
      ETIQUETAS['club-por-id']([id]),
      async () => {
        const [club] = await consulta<FilaClub>(CLUB_POR_ID.sql, [id]);
        if (!club) return null;
        const [lista, escudo] = await consultaEnUnaFoto([
          { sql: EQUIPOS_DEL_CLUB.sql, parametros: [id, null, 500] },
          { sql: ESCUDO_DEL_CLUB.sql, parametros: [id] },
        ]);
        return {
          club,
          escudo: (escudo[0] as FilaEscudoDeClub | undefined) ?? null,
          equipos: lista as unknown as FilaEquipoDeClub[],
        };
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ningún club con el id ${id}.`);
    }
    return respuestaJson(sobreRecurso('ficha-club', datos, {
      web: `/explorar/club/${id}`,
      api: `/api/v1/ficha/club/${id}`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
