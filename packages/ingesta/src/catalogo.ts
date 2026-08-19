/**
 * Catálogo de competiciones.
 *
 * Los códigos viven en la tabla `competiciones` de Supabase, **no en el código**:
 * cambian cada temporada y así se pueden añadir provincias sin tocar nada.
 * `bin/descubrir.ts` los rehace recorriendo los desplegables de la federación.
 */

export interface Competicion {
  id?: number;
  codCompeticion: string;
  codGrupo: string;
  codTemporada: string;
  codDelegacion: string;
  nombre: string;
  categoria: Categoria;
  genero: 'm' | 'f';
  slug: string;
  activa: boolean;
}

export type Categoria =
  | 'aficionados' | 'juvenil' | 'cadete' | 'infantil' | 'alevin'
  | 'benjamin' | 'prebenjamin' | 'sala' | 'copa';

/** Categorías cuyos jugadores son menores. Marca dónde aplican las reglas del §9
 *  de PROYECTO.md: dorsal sí, nombre no. */
export const CATEGORIAS_DE_MENORES: readonly Categoria[] = [
  'juvenil', 'cadete', 'infantil', 'alevin', 'benjamin', 'prebenjamin',
];

export const esDeMenores = (c: Categoria): boolean => CATEGORIAS_DE_MENORES.includes(c);
