/** Normalización de nombres de equipo.
 *  La federación no es consistente consigo misma: en el .xls del calendario aparece
 *  `C.D. Munibar Pizarrales "B"` y en el PDF de la cuadrícula el mismo equipo es
 *  `C.D. Munibar Pizarrales`. Ver skill `parser-federacion`. */

const PREFIJOS = /\b(c\.?d\.?[mfb]?\.?|u\.?d\.?|c\.?f\.?|s\.?d\.?|a\.?d\.?|r\.?s\.?|e\.?f\.?|club|deportivo|municipal)\b/g;

/** Sufijo de filial tal cual lo escribe la federación: "B", "C"... o null. */
export function sufijoFilial(nombre: string): string | null {
  const m = nombre.match(/["“”']\s*([A-Z])\s*["“”']/);
  return m ? m[1]! : null;
}

/** Clave de comparación. Pierde el sufijo de filial aposta: se compara aparte. */
export function normaliza(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bretirad[oa]s?\b/g, ' ')        // marca de la federación: "Retirado"
    .replace(/["“”']\s*[a-z]\s*["“”']/g, ' ')
    .replace(PREFIJOS, ' ')
    .replace(/[^a-z0-9]/g, '');
}

/** Clave completa: base + filial. Dos equipos del mismo club en el mismo grupo es
 *  raro, pero pasa en categorías bajas, y confundirlos arruina la clasificación. */
export function clave(nombre: string): string {
  const s = sufijoFilial(nombre);
  return normaliza(nombre) + (s ? '#' + s.toLowerCase() : '');
}

/** ¿Son el mismo equipo? Tolera prefijos, tildes y puntuación; NO tolera filiales
 *  distintos. Si a uno le falta el sufijo (el caso del PDF), se acepta la coincidencia
 *  por base pero se avisa con `dudoso`. */
export function comparaEquipos(a: string, b: string): { igual: boolean; dudoso: boolean } {
  const [na, nb] = [normaliza(a), normaliza(b)];
  if (na !== nb || !na) return { igual: false, dudoso: false };
  const [sa, sb] = [sufijoFilial(a), sufijoFilial(b)];
  if (sa === sb) return { igual: true, dudoso: false };
  if (sa === null || sb === null) return { igual: true, dudoso: true };
  return { igual: false, dudoso: false };
}

export const mismoEquipo = (a: string, b: string): boolean => comparaEquipos(a, b).igual;
