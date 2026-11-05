/**
 * Nombres cortos de equipo para cuando el nombre completo no cabe.
 *
 * Regla de producto: aquí no se inventa un nombre. Se quitan las formas legales que la federación
 * escribe delante o detrás del nombre («C.D.», «S.A.D.», «Club Deportivo», «Unión Deportiva», «Club de
 * Fútbol»…) y se conserva el resto tal cual, con su letra de equipo filial («B», «C»). Si al limpiar
 * queda algo dudoso o vacío, se devuelve el nombre completo: mejor largo que falso.
 *
 * Los nombres cortos de verdad viven en el canónico (`local_nombre_corto` / `visitante_nombre_corto` en
 * los partidos). Esta función es el respaldo mientras el campo no llega o no está guardado para un
 * equipo; el componente debe preferir siempre el valor guardado.
 *
 * Ejemplos que la prueba fija:
 *  · «Club Deportivo Isoba» → «Isoba»
 *  · «Real Valladolid Club de Fútbol» → «R. Valladolid»
 *  · «Unión Deportiva Santa Marta» → «Santa Marta»
 *  · «SD Ponferradina» → «Ponferradina»
 *  · «Salamanca Club de Fútbol UDS» → «Salamanca CF»
 */

/** Formas que se quitan enteras cuando van al principio, con sus variantes con puntos. */
const PREFIJOS_LEGALES: readonly RegExp[] = [
  /^c\.?\s*y\s*d\.?\s+/i, // «C. y D.» (Cultural y Deportiva)
  /^club\s+deportivo\s+/i,
  /^club\s+de\s+f[uú]tbol\s+/i,
  /^f[uú]tbol\s+club\s+/i,
  /^club\s+/i,
  /^uni[oó]n\s+deportiva\s+/i,
  /^uni[oó]n\s+deportivo\s+/i,
  /^(?:c\.?d\.?i\.?|c\.?d\.?i?|c\.?f\.?|f\.?c\.?|s\.?d\.?|u\.?d\.?|a\.?d\.?|s\.?a\.?d\.?|uds)\s+/i,
];

/** Formas que se quitan enteras cuando van al final. «Club de Fútbol» no está aquí: se abrevia a CF. */
const SUFIJOS_LEGALES: readonly RegExp[] = [
  /\s+(?:s\.?a\.?d\.?|sad|uds|c\.?d\.?i\.?|c\.?d\.?i?|c\.?f\.?|f\.?c\.?|s\.?d\.?|u\.?d\.?|a\.?d\.?|club)$/i,
];

/** Formas legales de dos palabras que, en medio, se abrevian a «CF» como en «Salamanca CF». */
const CLUB_FUTBOL = /\s+club\s+de\s+f[uú]tbol(?=\s|$)/i;
const FUTBOL_CLUB = /\s+f[uú]tbol\s+club(?=\s|$)/i;

/** Un token que es sólo una letra de equipo filial: «B», «C». */
function letraDeFilial(token: string): string | null {
  const limpio = token.replace(/["'«»]/g, '').trim();
  return /^[A-Z]$/.test(limpio) ? limpio : null;
}

function limpiaEspacios(texto: string): string {
  return texto.replace(/\s+/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
}

/**
 * El nombre corto de un equipo. Sin nombre, devuelve cadena vacía; con un nombre que no se puede
 * acortar con seguridad, devuelve el nombre completo.
 */
export function nombreCorto(nombre: string | null | undefined): string {
  const original = limpiaEspacios((nombre ?? '').trim());
  if (original === '') return '';

  // La letra del filial va al final y no es una forma legal: se aparta antes de limpiar.
  let letra: string | null = null;
  let resto = original;
  const tokens = resto.split(' ');
  if (tokens.length > 1) {
    const posible = letraDeFilial(tokens[tokens.length - 1]!);
    if (posible !== null) {
      letra = posible;
      resto = tokens.slice(0, -1).join(' ');
    }
  }

  // Prefijos legales, en orden: algunos empiezan igual («Club Deportivo» antes que «Club»).
  let cambiado = true;
  while (cambiado) {
    cambiado = false;
    for (const prefijo of PREFIJOS_LEGALES) {
      if (prefijo.test(resto)) {
        resto = resto.replace(prefijo, '');
        cambiado = true;
      }
    }
  }

  // «Real …» se abrevia a «R. …»: es como se lee en una tabla.
  if (/^real\s+/i.test(resto)) {
    resto = resto.replace(/^real\s+/i, 'R. ');
  }

  // Sufijos legales, repetidos porque puede haber dos seguidos («C.F. S.A.D.»). Se hace ANTES de
  // abreviar «Club de Fútbol»: así «Salamanca Club de Fútbol UDS» acaba en «Salamanca CF» y no se
  // lleva por delante el «CF» recién puesto.
  cambiado = true;
  while (cambiado) {
    cambiado = false;
    for (const sufijo of SUFIJOS_LEGALES) {
      if (sufijo.test(resto)) {
        resto = resto.replace(sufijo, '');
        cambiado = true;
      }
    }
  }

  // «Club de Fútbol» en medio o al final se abrevia a «CF» (Salamanca CF), no se borra.
  resto = resto.replace(CLUB_FUTBOL, ' CF').replace(FUTBOL_CLUB, ' CF');

  resto = limpiaEspacios(resto);
  // Los conectores sueltos del principio («de la Amistad») no son el nombre; «La Virgen» sí se queda.
  resto = resto.replace(/^(?:de\s+(?:la|las|los|el)\s+|del\s+|de\s+)/i, '').trim();
  // Si se ha abreviado «Real» no se deja además un «CF» pegado: «R. Valladolid», no «R. Valladolid CF».
  if (/^R\.\s/.test(resto)) resto = resto.replace(/\s+CF$/i, '');
  // Puntos sueltos que quedan al quitar formas: «C.D. Isoba» ya no debería dejar ninguno, pero se limpia.
  resto = limpiaEspacios(resto.replace(/^[.\s]+|[.\s]+$/g, ''));

  if (resto === '' || resto.length < 2) return original;
  return letra === null ? resto : `${resto} ${letra}`;
}

/**
 * El nombre que se pinta en una tabla: el corto guardado en el canónico si existe y no está vacío; si
 * no, el que sale de las reglas.
 */
export function nombreCortoDe(
  guardado: string | null | undefined,
  completo: string | null | undefined,
): string {
  const corto = (guardado ?? '').trim();
  if (corto !== '') return corto;
  return nombreCorto(completo);
}

/** Los dos nombres de un partido, prefiriendo el corto guardado y cayendo a las reglas. */
export type NombresDelPartido = {
  local: string;
  visitante: string;
  completo_local: string;
  completo_visitante: string;
};

export function nombresDelPartido(p: {
  local: string;
  visitante: string;
  local_nombre_corto?: string | null;
  visitante_nombre_corto?: string | null;
}): NombresDelPartido {
  return {
    local: nombreCortoDe(p.local_nombre_corto, p.local),
    visitante: nombreCortoDe(p.visitante_nombre_corto, p.visitante),
    completo_local: p.local,
    completo_visitante: p.visitante,
  };
}
