/**
 * Federaciones de las que ESTA máquina no se ocupa, y que por tanto su web no enseña.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Desde el 24/09/2026 Valencia, Madrid y Cataluña se recogen en el PC de trabajo y el servidor se queda con las
 * otras dieciséis. Lo que el servidor tiene de esas tres es una **foto congelada**: es correcto, pero se queda
 * atrás en cuanto el PC avance, y un dato viejo con pinta de actual es peor que no enseñarlo. La web las retira
 * hasta que el trabajo del PC se una al canónico.
 *
 * La variable es `FACYLF_EXCLUIR`, **la misma que usa el supervisor del PC** (`scripts/entorno-flota.ps1`) y
 * significa lo mismo en los dos sitios: «de estas no me ocupo yo». Allí impide que dos flotas pidan a la misma
 * federación; aquí, que la web sirva datos que ya no son suyos. Una sola idea, un solo nombre.
 */
const CRUDO = process.env.FACYLF_EXCLUIR ?? '';

/** Códigos en minúscula, sin espacios y sin repetidos. */
export const FEDERACIONES_EXCLUIDAS: readonly string[] = [...new Set(
  CRUDO.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean),
)];

export const estaExcluida = (codigo: string | null | undefined): boolean =>
  codigo !== null && codigo !== undefined && FEDERACIONES_EXCLUIDAS.includes(String(codigo).toLowerCase());

/**
 * Devuelve la lista tal como se puede escribir dentro de un SQL, validada.
 *
 * ── POR QUÉ SE INTERPOLA Y NO SE PASA COMO PARÁMETRO ────────────────────────────────────────────────────
 *
 * Pasar cada código como parámetro obligaría a añadir un parámetro a CADA consulta del canónico y a reordenar
 * los `$1`, `$2`… de todas ellas. Ese reordenamiento es la clase de cambio que se equivoca en silencio: una
 * consulta que sigue funcionando pero devuelve otra cosa (por ejemplo `limit` leyendo la lista de federaciones).
 * Como los códigos son nuestros y de forma fija, se validan con una expresión regular estricta y se escriben
 * como literales: si un código no encaja, se descarta en vez de entrar en el SQL.
 */
function literalesSql(): string {
  const validos = FEDERACIONES_EXCLUIDAS.filter((c) => /^[a-z0-9-]{2,40}$/.test(c));
  return validos.map((c) => `'${c}'`).join(', ');
}

/**
 * Fragmento SQL que deja fuera las federaciones excluidas. Se apoya en el alias `f` de `core.federation`, que
 * usan todas las consultas del canónico; si alguna no lo usara, esto falla al consultar (ruidosamente), que es
 * lo que se quiere: mejor un error claro que una federación colándose en una tabla.
 *
 * Sin exclusiones vale `true`, así que el SQL sigue siendo válido y no cambia nada.
 */
export const SQL_FEDERACION_NO_EXCLUIDA: string = (() => {
  const lista = literalesSql();
  // Las federaciones de laboratorio (`pruebas`, `pruebas-sincodigo`, `pruebas-retirada`…) no son
  // datos públicos: sus grupos y partidos los crean y borran las suites. Se excluyen siempre, además
  // de las que lleguen por FACYLF_EXCLUIR.
  const base = "f.codigo not like 'pruebas%'";
  return lista === '' ? base : `(${base} and f.codigo <> all(array[${lista}]::text[]))`;
})();

/** Cuántas federaciones se están dejando fuera (para poder decirlo en pantalla en vez de callarlo). */
export const HAY_EXCLUIDAS = FEDERACIONES_EXCLUIDAS.length > 0;
