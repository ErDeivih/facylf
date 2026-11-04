import type { FilaBusqueda } from '@/consultas/entidades';
import { nombreVisible } from '@/lib/menores';

/**
 * Una sugerencia lista para el panel del buscador.
 *
 * Es el mismo contrato que consumía el buscador anterior: `tipo`, `titulo`, `subtitulo`, `meta`,
 * `url` y `territorio`. La ruta de `/api/buscar` sólo mapea con esto; la regla vive aquí y se prueba
 * sin base de datos.
 */
export type Sugerencia = {
  tipo: string;
  titulo: string;
  subtitulo: string;
  meta: string;
  url: string;
  territorio: string;
};

/**
 * Convierte una fila de `BUSQUEDA_POR_NOMBRE` en una sugerencia del panel.
 *
 * Regla del proyecto (`CLAUDE.md`, `SEGURIDAD-OPERACION.md`): **un nombre de menor de edad no se
 * publica nunca**. La consulta ya trae `es_menor`; aquí se aplica `nombreVisible()`, que rotula
 * «Jugador menor de edad» en lugar de enseñar el nombre. Sólo los jugadores pasan por esa regla: un
 * club no es una persona y conserva el nombre con el que lo publica la federación.
 *
 * El resto del contrato no cambia (lo consume el buscador de la cabecera): el `subtitulo` compone
 * federación y contexto, y `meta` sólo avisa de la identidad nominal de un jugador, que es lo que
 * cambia cómo debe leerse el resultado.
 */
export function resultadoDeSugerencia(fila: FilaBusqueda): Sugerencia {
  const esJugador = fila.tipo === 'jugador';
  return {
    tipo: fila.tipo,
    titulo: esJugador ? nombreVisible(fila.es_menor, fila.nombre) : fila.nombre,
    subtitulo: [fila.federacion_nombre, fila.contexto].filter(Boolean).join(' · ') || 'Sin contexto en el canónico',
    meta: esJugador && fila.identidad_nominal ? 'identidad nominal' : '',
    url: fila.tipo === 'club' ? `/club/${fila.entidad_id}` : `/jugador/${fila.entidad_id}`,
    territorio: fila.federacion_nombre ?? '',
  };
}
