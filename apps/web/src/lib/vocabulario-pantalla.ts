/**
 * Vocabulario del esquema traducido a lo que se lee en pantalla.
 *
 * Las columnas `categoria`, `modalidad`, `genero` y `ambito` de `core.competition_edition` son
 * enumerados del esquema (`CHECK`). Aquí sólo se traducen; un valor desconocido NO se disfraza: se
 * enseña el código tal cual, para que se note que el vocabulario cambió y hay que mirarlo.
 */

const CATEGORIA: Record<string, string> = {
  aficionados: 'Aficionados', juvenil: 'Juvenil', cadete: 'Cadete', infantil: 'Infantil',
  alevin: 'Alevín', benjamin: 'Benjamín', prebenjamin: 'Prebenjamín', veteranos: 'Veteranos',
};

const MODALIDAD: Record<string, string> = {
  futbol11: 'Fútbol 11', futbol8: 'Fútbol 8', futbol7: 'Fútbol 7', sala: 'Fútbol sala', playa: 'Fútbol playa',
};

const AMBITO: Record<string, string> = {
  nacional: 'Nacional', regional: 'Regional', provincial: 'Provincial', ascenso: 'Fase de ascenso',
  copa: 'Copa', otra: 'Otra',
};

const GENERO: Record<string, string> = {
  masculina: 'Masculina', femenina: 'Femenina', mixta: 'Mixta',
};

/** Código → etiqueta; si no está en el vocabulario se enseña el código y no se adivina. */
const traduce = (mapa: Record<string, string>, codigo: string | null | undefined): string => {
  const clave = (codigo ?? '').trim();
  if (clave === '' || clave === 'desconocida' || clave === 'desconocido') return 'Sin clasificar';
  return mapa[clave] ?? clave;
};

export const etiquetaCategoria = (c: string | null | undefined) => traduce(CATEGORIA, c);
export const etiquetaModalidad = (m: string | null | undefined) => traduce(MODALIDAD, m);
export const etiquetaAmbito = (a: string | null | undefined) => traduce(AMBITO, a);
export const etiquetaGenero = (g: string | null | undefined) => traduce(GENERO, g);

/**
 * Cómo se llama la división en la ficha. `core.competition_edition.division` también es un enumerado.
 */
const DIVISION: Record<string, string> = {
  'primera-federacion': 'Primera Federación', 'segunda-federacion': 'Segunda Federación',
  'tercera-federacion': 'Tercera Federación', superliga: 'Superliga', 'division-honor': 'División de Honor',
  'liga-nacional': 'Liga Nacional', 'division-honor-regional': 'División de Honor Regional',
  preferente: 'Preferente', autonomica: 'Autonómica', primera: 'Primera', segunda: 'Segunda',
  tercera: 'Tercera', cuarta: 'Cuarta', quinta: 'Quinta',
};

export const etiquetaDivision = (d: string | null | undefined) => traduce(DIVISION, d);

/** Estado de visibilidad del dato, en palabras que se puedan leer en el pie de la tabla. */
const VISIBILIDAD: Record<string, string> = {
  completa: 'Completa: todos los partidos con resultado y acta',
  verificada_hasta_jornada: 'Verificada hasta una jornada',
  parcial_privada: 'Parcial',
  oculta: 'Oculta',
};

export const etiquetaVisibilidad = (v: string | null | undefined) => traduce(VISIBILIDAD, v);

/** Fecha corta es-ES para la barra de la temporada («14 sept»). Se formatea siempre en UTC. */
export function fechaCorta(fecha: string | null): string | null {
  if (!fecha) return null;
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}
