import {
  conLimiteDePeticiones, errorApi, respuestaJson, sobreRecurso, type ContextoRuta,
} from '@/lib/api';
import { idDeApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta, consultaEnUnaFoto } from '@/consultas/adaptadores/postgres/conexion';
import { GRUPO_POR_ID, type FilaPortadaGrupo } from '@/consultas/competiciones';
import { PARTIDOS_DE_GRUPO, type FilaPartidoCanonico } from '@/consultas/partidos';
import {
  EVENTOS_DEL_GRUPO, GOLEADORES_DE_ESTADISTICAS,
  type EventosDelGrupo, type FilaEventosDelGrupo, type FilaGoleadorEstadisticas, type ResumenDePartidos,
} from '@/consultas/estadisticas';
import { agregaResumenDePartidos } from '@/lib/estadisticas';

/** Lo que devuelve `GET /api/v1/estadisticas/competicion/[id]`. */
type EstadisticasCompeticionApi = {
  competicion: {
    id: number;
    federacion: string;
    federacion_nombre: string;
    temporada: string;
    edicion: string;
    grupo: string;
    categoria: string;
    division: string;
    modalidad: string;
    ambito: string;
    jornada_actual: number | null;
  };
  resumen: ResumenDePartidos;
  eventos: EventosDelGrupo;
  goleadores: FilaGoleadorEstadisticas[];
};

/**
 * `GET /api/v1/estadisticas/competicion/[id]`: resumen de una competición (grupo).
 *
 * Reutiliza las mismas consultas que la página de estadísticas del grupo (`grupo-por-id` para validar y
 * situar la competición, `partidos-de-grupo`, `eventos-del-grupo` y `goleadores-de-estadísticas`) y
 * agrega el resumen con la misma función pura que la página. No hay ni una consulta por equipo ni por
 * jornada. La temporada no se filtra por parámetro: la fija la edición del grupo pedido.
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
    const { datos, origen } = await cacheado<EstadisticasCompeticionApi | null>(
      ['api:v1:estadisticas-competicion', String(id)],
      ETIQUETAS['resumen-de-estadísticas']!([id]),
      async () => {
        const [portada] = await consulta<FilaPortadaGrupo>(GRUPO_POR_ID.sql, [id]);
        if (!portada) return null;
        const [partidosFilas, eventosFilas, goleadoresFilas] = await consultaEnUnaFoto([
          { sql: PARTIDOS_DE_GRUPO.sql, parametros: [portada.federacion, portada.grupo_codigo, 1000] },
          { sql: EVENTOS_DEL_GRUPO.sql, parametros: [portada.grupo_id] },
          {
            sql: GOLEADORES_DE_ESTADISTICAS.sql,
            parametros: [portada.federacion, portada.temporada, portada.grupo_id, 1, 10],
          },
        ]);
        const partidos = partidosFilas as unknown as FilaPartidoCanonico[];
        const eventos = (eventosFilas as unknown as FilaEventosDelGrupo[])[0]?.datos
          ?? { tramos: [], tarjetas: [] };
        return {
          competicion: {
            id: Number(portada.grupo_id),
            federacion: portada.federacion,
            federacion_nombre: portada.federacion_nombre,
            temporada: portada.temporada,
            edicion: portada.edicion,
            grupo: portada.grupo,
            categoria: portada.categoria,
            division: portada.division,
            modalidad: portada.modalidad,
            ambito: portada.ambito,
            jornada_actual: portada.jornada_actual,
          },
          resumen: agregaResumenDePartidos(partidos),
          eventos,
          goleadores: goleadoresFilas as unknown as FilaGoleadorEstadisticas[],
        };
      },
    );
    if (datos === null) {
      return errorApi(404, 'no_encontrado', `No existe ninguna competición con el id ${id}.`);
    }
    return respuestaJson(sobreRecurso('estadisticas-competicion', datos, {
      web: `/explorar/competicion/${id}/estadisticas`,
      api: `/api/v1/estadisticas/competicion/${id}`,
      clasificacion: `/explorar/competicion/${id}`,
      calendario: `/explorar/competicion/${id}/calendario`,
    }), req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
