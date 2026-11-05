/**
 * Reglas de la portada (`/`) que no necesitan Next ni base de datos.
 *
 * La portada no lista «todo el catálogo»: enseña una selección corta de competiciones reales de
 * Castilla y León, con su cobertura publicada, y enlaza cada una a su ficha. La selección y los textos
 * de cobertura se calculan aquí para probarlos sin renderizar ni consultar.
 */

import type { FilaGrupoSelector } from '@/consultas/catalogo-selector';
import type { FilaAcceso } from '@/consultas/usuario';

/** La federación que se prioriza en la portada. */
export const FEDERACION_DE_LA_PORTADA = 'castilla-leon';

/** Cuántas competiciones se enseñan como mucho. */
export const COMPETICIONES_EN_LA_PORTADA = 6;

/** Una competición de la portada, ya con su enlace. */
export type CompeticionDePortada = {
  grupoId: number;
  edicion: string;
  grupo: string;
  temporada: string;
  federacion: string;
  federacionNombre: string;
  /** `null` = la cobertura no está medida; no se convierte en 0. */
  partidosConResultado: number | null;
  partidosConocidos: number | null;
};

/** Las filas del selector que caben en la portada, sin inventar ninguna. */
export function competicionesDePortada(
  filas: readonly FilaGrupoSelector[],
  maximo: number = COMPETICIONES_EN_LA_PORTADA,
): CompeticionDePortada[] {
  const salida: CompeticionDePortada[] = [];
  const vistos = new Set<number>();
  const ediciones = new Set<string>();
  for (const fila of filas) {
    if (salida.length >= maximo) break;
    const grupoId = Number(fila.grupo_id);
    if (!Number.isInteger(grupoId) || grupoId <= 0 || vistos.has(grupoId)) continue;
    // Una competición puede tener varios grupos (provincias): la portada enseña competiciones
    // distintas, no seis grupos de la misma. El primer grupo de cada edición es su enlace.
    const edicion = `${fila.federacion}|${fila.temporada}|${fila.edicion_codigo}`;
    if (ediciones.has(edicion)) continue;
    vistos.add(grupoId);
    ediciones.add(edicion);
    salida.push({
      grupoId,
      edicion: fila.edicion,
      grupo: fila.grupo,
      temporada: fila.temporada,
      federacion: fila.federacion,
      federacionNombre: fila.federacion_corta ?? fila.federacion_nombre,
      partidosConResultado: fila.partidos_con_resultado === null ? null : Number(fila.partidos_con_resultado),
      partidosConocidos: fila.partidos_conocidos === null ? null : Number(fila.partidos_conocidos),
    });
  }
  return salida;
}

/** Ruta de la ficha de una competición de la portada. */
export function rutaDeCompeticion(grupoId: number): string {
  return `/explorar/competicion/${grupoId}`;
}

/**
 * La cobertura en una línea. Sin punto de control se dice «sin medir»; un grupo medido sin partidos
 * dice «sin partidos publicados», que es un cero real y no un hueco.
 */
export function textoDeCobertura(competicion: CompeticionDePortada): string {
  const conocidos = competicion.partidosConocidos;
  const conResultado = competicion.partidosConResultado;
  if (conocidos === null || conResultado === null) return 'Cobertura sin medir';
  if (conocidos === 0) return 'Sin partidos publicados';
  return `${conResultado} de ${conocidos} partidos con resultado`;
}

/** La temporada que comparten las competiciones de la portada, si la hay. */
export function temporadaDeLaPortada(competiciones: readonly CompeticionDePortada[]): string | null {
  return competiciones[0]?.temporada ?? null;
}

/** Enlace al selector con la federación y la temporada de la portada ya puestas. */
export function urlDelSelector(
  federacion: string = FEDERACION_DE_LA_PORTADA,
  temporada: string | null = null,
): string {
  const q = new URLSearchParams();
  if (federacion !== '') q.set('fed', federacion);
  if (temporada !== null) q.set('temp', temporada);
  const cadena = q.toString();
  return cadena === '' ? '/explorar/competiciones' : `/explorar/competiciones?${cadena}`;
}

/** Los tipos de favorito que la portada sabe nombrar. */
const ETIQUETA_TIPO_ACCESO: Readonly<Record<string, string>> = {
  equipo: 'Equipo',
  club: 'Club',
  jugador: 'Jugador',
  competicion: 'Competición',
  grupo: 'Grupo',
  temporada: 'Temporada',
  arbitro: 'Árbitro',
  busqueda: 'Búsqueda',
};

/** La etiqueta visible de un favorito. */
export function etiquetaDeAcceso(acceso: FilaAcceso): string {
  return ETIQUETA_TIPO_ACCESO[acceso.tipo] ?? 'Favorito';
}

/** El texto del último o próximo partido de un favorito; `null` si no hay dato. */
export function textoSiguiente(acceso: FilaAcceso, cual: 'ultimo' | 'proximo'): string | null {
  const valor = (acceso[cual] ?? '').trim();
  return valor === '' ? null : valor;
}
