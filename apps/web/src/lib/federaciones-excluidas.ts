/**
 * Qué federaciones publica esta web y cuáles deja fuera.
 *
 * ── LA PUBLICACIÓN ES SÓLO CASTILLA Y LEÓN (fase C) ────────────────────────────────────────────────────
 *
 * El producto es de Castilla y León y sólo de Castilla y León. El canónico del PC tiene hoy 26
 * federaciones de toda España —lo que hay de las demás es correcto, pero es de otras comunidades y este
 * producto no lo publica—, así que todo lo que enseña la web tiene que estar acotado a `castilla-leon`.
 *
 * **`FEDERACIONES_PUBLICADAS` es el único sitio donde se decide.** Es una constante del código y no una
 * variable de entorno: `FACYLF_EXCLUIR` es una lista de operación (qué federación recoge cada máquina) y
 * una web no puede publicar datos distintos según el entorno en que arranque. Si algún día hay que
 * publicar más federaciones, se amplía esta lista y las consultas la obedecen solas.
 *
 * ── Y ADEMÁS, `FACYLF_EXCLUIR` (OPERACIÓN) ──────────────────────────────────────────────────────────────
 *
 * La variable es `FACYLF_EXCLUIR`, **la misma que usa el supervisor del PC** (`scripts/entorno-flota.ps1`),
 * y significa lo mismo en los dos sitios: «de estas no me ocupo yo». Allí impide que dos flotas pidan a la
 * misma federación. Aquí sirve de cinturón adicional: una federación que la flota tiene retirada tampoco
 * se ofrece, aunque algún día se amplíe `FEDERACIONES_PUBLICADAS`. Lo que la web enseña es la
 * intersección de las dos listas (`esFederacionVisible`).
 *
 * ── POR QUÉ EL SQL SE INTERPOLA Y NO SE PASA COMO PARÁMETRO ─────────────────────────────────────────────
 *
 * Pasar cada código como parámetro obligaría a añadir un parámetro a CADA consulta del canónico y a
 * reordenar los `$1`, `$2`… de todas ellas. Ese reordenamiento es la clase de cambio que se equivoca en
 * silencio: una consulta que sigue funcionando pero devuelve otra cosa (por ejemplo `limit` leyendo la
 * lista de federaciones). Como los códigos son nuestros y de forma fija, se validan con una expresión
 * regular estricta y se escriben como literales: si un código no encaja, se descarta en vez de entrar en
 * el SQL.
 */

/** La lista de federaciones que este producto publica. Único sitio donde se decide (fase C). */
export const FEDERACIONES_PUBLICADAS: readonly string[] = ['castilla-leon'];

/** `FACYLF_EXCLUIR` tal cual: la lista de federaciones de las que esta máquina no se ocupa. */
const CRUDO = process.env.FACYLF_EXCLUIR ?? '';

/** Códigos en minúscula, sin espacios y sin repetidos. */
export const FEDERACIONES_EXCLUIDAS: readonly string[] = [...new Set(
  CRUDO.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean),
)].filter((codigo) => !FEDERACIONES_PUBLICADAS.includes(codigo));

/** ¿Está la federación entre las publicadas (la regla de la fase C)? */
export const estaPublicada = (codigo: string | null | undefined): boolean =>
  codigo !== null && codigo !== undefined && FEDERACIONES_PUBLICADAS.includes(String(codigo).toLowerCase());

/** ¿La excluye la flota con `FACYLF_EXCLUIR`? Una federación publicada nunca se excluye por esto. */
export const estaExcluida = (codigo: string | null | undefined): boolean =>
  codigo !== null && codigo !== undefined && FEDERACIONES_EXCLUIDAS.includes(String(codigo).toLowerCase());

/**
 * ¿La enseña esta web? Es la regla completa: publicada por la fase C **y** no retirada por la flota.
 *
 * Sin la primera condición se colaría una federación de otra comunidad; sin la segunda, una que la flota
 * tiene retirada podría volver si algún día se amplía la lista de publicadas.
 */
export const esFederacionVisible = (codigo: string | null | undefined): boolean =>
  estaPublicada(codigo) && !estaExcluida(codigo);

/** Los códigos de una lista, validados, como literales de SQL. Si uno no encaja, se descarta. */
function literalesSql(codigos: readonly string[]): string {
  const validos = codigos.filter((c) => /^[a-z0-9-]{2,40}$/.test(c));
  return validos.map((c) => `'${c}'`).join(', ');
}

/**
 * Fragmento SQL que deja sólo las federaciones que esta web publica. Se apoya en el alias `f` de
 * `core.federation`, que usan todas las consultas del canónico; si alguna no lo usara, esto falla al
 * consultar (ruidosamente), que es lo que se quiere: mejor un error claro que una federación colándose en
 * una tabla.
 *
 * Tres condiciones, y las tres importan:
 *
 *  1. `f.codigo = any(array[...])` — **la publicación**: sólo `castilla-leon` (fase C). Aunque el canónico
 *     tenga 26 federaciones y el entorno diga otra cosa, la consulta no puede devolver las demás.
 *  2. `f.codigo <> all(array[...])` — la retirada de la flota (`FACYLF_EXCLUIR`), si la hay.
 *  3. `f.codigo not like 'pruebas%'` — las federaciones de laboratorio (`pruebas`, `pruebas-sincodigo`,
 *     `pruebas-retirada`…) no son datos públicos: sus grupos y partidos los crean y borran las suites.
 *
 * El resultado es siempre una expresión booleana válida (nunca `and` colgando), así que el SQL sigue
 * compilando aunque alguna lista quede vacía.
 */
export const SQL_FEDERACION_NO_EXCLUIDA: string = (() => {
  const publicadas = literalesSql(FEDERACIONES_PUBLICADAS);
  const excluidas = literalesSql(FEDERACIONES_EXCLUIDAS);
  const condiciones = ["f.codigo not like 'pruebas%'"];
  if (publicadas !== '') condiciones.push(`f.codigo = any(array[${publicadas}]::text[])`);
  if (excluidas !== '') condiciones.push(`f.codigo <> all(array[${excluidas}]::text[])`);
  return `(${condiciones.join(' and ')})`;
})();

/** Cuántas federaciones se están dejando fuera (para poder decirlo en pantalla en vez de callarlo). */
export const HAY_EXCLUIDAS = FEDERACIONES_EXCLUIDAS.length > 0;
