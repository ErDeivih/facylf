import { API_VERSION, conLimiteDePeticiones, errorApi, normalizaIdentificadores, respuestaJson } from '@/lib/api';
import { leeFiltrosCalendarioApi, respuestaDeFallo } from '@/lib/api-datos';
import { cacheado, ETIQUETAS } from '@/lib/cache';
import { consulta } from '@/consultas/adaptadores/postgres/conexion';
import { PARTIDOS_DEL_CALENDARIO, type FilaCalendarioGlobal } from '@/consultas/calendario';

/**
 * `GET /api/v1/calendario`: partidos del canónico con filtros y paginación.
 *
 * Parámetros: `federacion`, `temporada`, `jornada`, `desde`, `hasta`, `texto`, `pagina` y `porPagina`.
 * Se validan de verdad: un filtro mal escrito es un 400 que dice qué parámetro falla, no un filtro
 * ignorado en silencio. Se pide una fila de más para saber si hay página siguiente sin contar la tabla
 * entera (`hayMas`), que es el dato que el cliente necesita para paginar.
 *
 * Los nombres de campo de `datos` son los de la consulta del canónico y están documentados en
 * `docs/plataforma-web/API.md`; así la API y las pantallas no cuentan dos versiones del mismo dato.
 */
export async function GET(req: Request): Promise<Response> {
  const bloqueada = conLimiteDePeticiones(req);
  if (bloqueada !== null) return bloqueada;

  const leidos = leeFiltrosCalendarioApi(new URL(req.url).searchParams);
  if (!leidos.ok) {
    return errorApi(400, 'parametro_invalido', leidos.mensaje, { parametro: leidos.parametro });
  }
  const filtros = leidos.filtros;

  try {
    const { datos, origen } = await cacheado<{ partidos: FilaCalendarioGlobal[]; hayMas: boolean }>(
      ['api:v1:calendario', JSON.stringify(filtros)],
      ETIQUETAS['partidos-del-calendario']([]),
      async () => {
        const filas = await consulta<FilaCalendarioGlobal>(PARTIDOS_DEL_CALENDARIO.sql, [
          filtros.federacion,
          filtros.temporada,
          filtros.jornada,
          filtros.desde,
          filtros.hasta,
          filtros.texto,
          filtros.porPagina + 1,
          filtros.desplazamiento,
        ]);
        return { partidos: filas.slice(0, filtros.porPagina), hayMas: filas.length > filtros.porPagina };
      },
    );
    return respuestaJson({
      api: { version: API_VERSION, recurso: 'calendario' },
      filtros: {
        federacion: filtros.federacion,
        temporada: filtros.temporada,
        jornada: filtros.jornada,
        desde: filtros.desde,
        hasta: filtros.hasta,
        texto: filtros.texto,
      },
      paginacion: { pagina: filtros.pagina, porPagina: filtros.porPagina, hayMas: datos.hayMas },
      datos: normalizaIdentificadores(datos.partidos),
    }, req, { origen });
  } catch (error) {
    return respuestaDeFallo(error);
  }
}
