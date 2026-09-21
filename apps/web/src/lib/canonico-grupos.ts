import { CanonicoNoDisponible, consulta } from '@/consultas/adaptadores/postgres/conexion';
import { GRUPOS_DEL_CANONICO, PARAMETROS_POR_DEFECTO, type FilaGrupoCanonico } from '@/consultas/cobertura';

/**
 * Puente entre el catálogo y el canónico: «¿este grupo está ya importado con datos verificados?».
 *
 * La web todavía navega el catálogo por el puente de las colas SQLite (miles de grupos), mientras el
 * canónico tiene sólo los importados. Sin esta conexión, el visitante no tiene forma de saber que un
 * grupo concreto ya tiene datos importados, verificados y con su cobertura medida.
 *
 * Si el canónico no está disponible, devuelve un mapa vacío: la página sigue funcionando sin el aviso.
 * Un fallo del canónico no puede tumbar el catálogo.
 */

export type GrupoCanonico = FilaGrupoCanonico;

const clave = (federacion: string, grupo: string): string => `${federacion}|${grupo}`;

export function indexaGrupos(filas: GrupoCanonico[]): Map<string, GrupoCanonico> {
  return new Map(filas.map((fila) => [clave(fila.federacion, fila.grupo_codigo), fila]));
}

/** Caché corta: el canónico cambia cuando alguien importa, no en cada clic. */
let cache: { en: number; mapa: Map<string, GrupoCanonico> } | null = null;
const VIDA_MS = 60_000;

export async function gruposEnCanonico(): Promise<Map<string, GrupoCanonico>> {
  if (cache && Date.now() - cache.en < VIDA_MS) return cache.mapa;
  try {
    const filas = await consulta<GrupoCanonico>(GRUPOS_DEL_CANONICO.sql, PARAMETROS_POR_DEFECTO[GRUPOS_DEL_CANONICO.nombre]);
    const mapa = indexaGrupos(filas);
    cache = { en: Date.now(), mapa };
    return mapa;
  } catch (error) {
    // Sin canónico no hay aviso, pero tampoco un error en la cara del visitante.
    if (error instanceof CanonicoNoDisponible) return new Map();
    throw error;
  }
}

/** El grupo de esa federación, si está importado. */
export async function grupoEnCanonico(federacion: string, grupo: string): Promise<GrupoCanonico | null> {
  const mapa = await gruposEnCanonico();
  return mapa.get(clave(federacion, grupo)) ?? null;
}
