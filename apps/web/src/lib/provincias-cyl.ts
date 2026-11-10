/**
 * Las nueve provincias de Castilla y León: la lista única que decide qué se ofrece como provincia.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────────────────────────────
 *
 * El canónico del PC tiene hoy 26 federaciones de toda España y sus ediciones traen 48 valores de
 * `provincia` distintos (medido el 10/11/2026: de «A Coruña» a «Zaragoza»). La fase C publica **sólo
 * Castilla y León**, así que un desplegable de provincia que se construya con los valores reales del
 * catálogo ofrecería provincias de otras comunidades: filtros que no pueden devolver nada de lo que este
 * producto enseña y que, además, delatan datos que no se publican.
 *
 * La regla es la del resto del proyecto: **no se inventa**. No se rellena la lista con las provincias que
 * hoy tengan datos (hoy faltan Soria y Zamora como `provincia` de edición y aparecen igualmente: la
 * federación las tiene, sus grupos se llaman «Primera - Soria»), ni se ofrece un valor que no sea una de
 * estas nueve. Si el canónico trae un valor que no encaja, no se ofrece y no se rompe nada.
 *
 * ── LA COMPARACIÓN NO DISTINGUE TILDES NI MAYÚSCULAS ────────────────────────────────────────────────────
 *
 * El mismo dato llega escrito de las dos formas según la federación de origen: «León» y «Leon». Se
 * compara con `normalizaProvincia`, que pasa a minúsculas y quita las tildes (NFD + marcas combinantes),
 * la misma forma que usa `core.normaliza_nombre` en el SQL. El valor que viaja en la URL del filtro es el
 * valor real del dato (no se reescribe), porque el SQL compara `provincia` tal cual.
 */

/** Las nueve provincias de Castilla y León, escritas como las escribe la federación. */
export const PROVINCIAS_CYL: readonly string[] = [
  'Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora',
];

/**
 * Forma comparable de un nombre de provincia: minúsculas, sin tildes y sin espacios de sobra.
 *
 * `'León'`, `'LEON'` y `' leon '` dan `'leon'`. Es la misma normalización que `core.normaliza_nombre`
 * aplica en el SQL, para que la web y la base no discrepen al comparar el mismo texto.
 */
export function normalizaProvincia(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Las nueve, ya normalizadas: se calcula una vez y se compara contra un `Set` en cada llamada. */
const NORMALIZADAS = new Map(PROVINCIAS_CYL.map((provincia) => [normalizaProvincia(provincia), provincia]));

/**
 * La etiqueta canónica de una de las nueve provincias, o `null` si el valor no es de CyL.
 *
 * Es lo que permite enseñar «León» aunque el dato venga como «Leon»: el valor de la URL y de la
 * etiqueta es siempre el canónico, y la comparación con el dato la hace el SQL sin tildes.
 */
export function provinciaCanonicaDe(valor: string | null | undefined): string | null {
  const normalizado = normalizaProvincia(valor);
  return normalizado === '' ? null : (NORMALIZADAS.get(normalizado) ?? null);
}

/**
 * ¿Es `valor` una de las nueve provincias de Castilla y León?
 *
 * Devuelve `false` —sin lanzar— para un valor vacío, nulo, ausente o que no sea una de las nueve: quien
 * lo llama sólo tiene que decidir si ofrece la opción, no protegerse de una excepción.
 */
export function esProvinciaDeCyl(valor: string | null | undefined): boolean {
  return provinciaCanonicaDe(valor) !== null;
}
