import { existsSync, readFileSync } from 'node:fs';

/**
 * Reparto de una federación por TEMPORADAS entre dos máquinas.
 *
 * ── LA IDEA (del responsable, 24/09/2026) ───────────────────────────────────────────────────────────────
 *
 * Castilla y León se recoge en el PC y en el servidor a la vez. Para que las dos máquinas no pidan LAS MISMAS
 * actas al mismo portal —peticiones duplicadas, que es lo que el proyecto prohíbe— cada una se queda con una
 * TEMPORADA COMPLETA: el servidor con la 2026-27 y el PC con la 2025-26. Cuando una termina, reclama la
 * siguiente libre. Así las dos avanzan de verdad, en paralelo, y sobre conjuntos disjuntos de trabajo.
 *
 * ── POR QUÉ SE FILTRA POR ETIQUETA Y NO POR CÓDIGO ─────────────────────────────────────────────────────
 *
 * `trabajos.temporada` guarda el CÓDIGO de temporada, y ese código NO significa lo mismo en cada federación: en
 * La Rioja el 9 es 2013-14 y en Andalucía el 19 es 2023-24 (está documentado en `temporada-minima.mjs`). Por eso
 * lo que se pide por línea de órdenes son ETIQUETAS (`2025-26`) y aquí se traducen a códigos consultando la
 * tabla `temporadas` de ESA cola. Escribir el código a mano sería un error silencioso: filtraría por la
 * temporada equivocada sin dar ningún aviso.
 *
 * ── SIN LA VARIABLE NO CAMBIA NADA ─────────────────────────────────────────────────────────────────────
 *
 * `FACYLF_TEMPORADAS` vacía o ausente ⇒ el fragmento SQL es `1=1` y el recolector se comporta como siempre. Es
 * deliberado: el reparto es opt-in por federación y por máquina, no un cambio global.
 */

/**
 * Etiquetas asignadas a esta máquina. Se puede fijar de dos maneras, y la segunda manda:
 *
 *   1. `FACYLF_TEMPORADAS=2025-26` en el entorno (cómodo para pruebas y para un contenedor);
 *   2. un fichero `temporadas-asignadas.txt` **dentro de la carpeta de la federación**, junto a su cola.
 *
 * ── POR QUÉ EL FICHERO, Y NO SÓLO LA VARIABLE DE ENTORNO (medido el 24/09/2026) ───────────────────────────
 *
 * Porque la asignación es POR FEDERACIÓN y el entorno es de la MÁQUINA. En el PC conviven cuatro federaciones
 * (Valencia, Madrid, Cataluña y Castilla y León) y sólo una se reparte por temporadas: una variable global
 * restringiría TAMBIÉN a las otras tres, y eso no daría ningún error —simplemente dejarían de recoger el resto de
 * sus temporadas—, que es la clase de fallo silencioso que más caro sale.
 *
 * El fichero viaja con los datos de la federación (en el servidor va dentro del volumen montado), así que se ve,
 * se audita y se cambia sin tocar el lanzador ni reconstruir nada. Se admiten saltos de línea y comentarios con
 * `#`, para poder explicar en el propio fichero por qué esa máquina tiene esas temporadas.
 */
let asignadas = [];

function parte(texto) {
  /*
   * ── EL ORDEN DE ESTOS TRES PASOS NO ES COSMÉTICO (falló el 24/09/2026) ──────────────────────────────────
   *
   * La primera versión partía por comas y LUEGO quitaba los comentarios. Como los comentarios de este fichero
   * llevan comas, el `#` sólo quedaba en el primer trozo de cada línea y el resto entraba como si fueran
   * temporadas: medido, la lista salía «pero REPARTIDA», «esta federación vuelve», «así que borrarlo con el
   * servidor también activo duplica»… y la última, «2025-26», que era la buena.
   *
   * Con esa basura dentro, el filtro SQL habría buscado temporadas que no existen y el recolector se habría
   * quedado SIN TRABAJO, sin ningún error que lo explicara. Así que: primero se quita el comentario de CADA
   * línea, después se juntan y sólo entonces se parte por comas.
   */
  return String(texto)
    .split('\n')
    .map((linea) => linea.replace(/#.*$/, ''))
    .join(',')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function cargaTemporadasAsignadas(archivo) {
  try {
    if (archivo && existsSync(archivo)) {
      asignadas = parte(readFileSync(archivo, 'utf8'));
      return { origen: archivo, temporadas: [...asignadas] };
    }
  } catch {
    /* Un fichero ilegible no puede dejar la federación sin recoger: se sigue con lo que hubiera. */
  }
  return { origen: null, temporadas: [...asignadas] };
}

/** Las temporadas asignadas ahora mismo (lista vacía = sin reparto: se trabaja todo lo que pase el suelo). */
export const temporadasAsignadas = () => [...asignadas];

export const hayTemporadasAsignadas = () => asignadas.length > 0;

// El entorno se aplica al cargar, y el fichero lo puede sustituir después (manda el fichero).
asignadas = parte(process.env.FACYLF_TEMPORADAS ?? '');

/**
 * Fragmento SQL que limita la consulta a las temporadas asignadas.
 *
 * Se traduce por la tabla `temporadas` (código → etiqueta) para no depender de que el código sea el mismo en
 * todas las federaciones. Los valores van como parámetros (`?`), nunca interpolados.
 */
export function sqlSoloTemporadasAsignadas(alias = 't') {
  if (!asignadas.length) return '1=1';
  const columna = alias ? `${alias}.temporada` : 'temporada';
  const marcas = asignadas.map(() => '?').join(', ');
  return `${columna} in (select codigo from temporadas where etiqueta in (${marcas}))`;
}

/** Los valores que hay que pasar, EN ORDEN, a la consulta que use `sqlSoloTemporadasAsignadas`. */
export function parametrosSoloTemporadas() {
  return [...asignadas];
}

/**
 * ── UNA TEMPORADA ASIGNADA MANDA SOBRE EL SUELO, TAMBIÉN AL ENCOLAR (29/09/2026) ─────────────────────────────
 *
 * `siguienteTrabajo` ya dejaba que la asignación sustituyera al suelo (2023-24) al ELEGIR trabajo, y
 * `reactivaTemporadasAsignadas` le levantaba el aplazamiento al año 2099 al ABRIR la cola. Faltaba el tercer
 * sitio, y era el que dejaba el trabajo a medias de una forma que no se ve: **`encola` no CREA trabajo de una
 * temporada por debajo del suelo**, y `preparaDesdeCatalogo` ni siquiera la registra.
 *
 * Consecuencia medida el 29/09/2026: al asignar la 2015-16 a una máquina, la asignación se aceptaba, el filtro
 * la dejaba pasar y el recolector decía «ningún trabajo disponible» —sin error— porque no había NADA que hacer
 * en esa temporada: ni el catálogo la había encolado. Las seis temporadas de 2015-16 a 2020-21 estaban así en
 * las dos máquinas, con todo su trabajo aplazado y sin forma de crecer.
 *
 * Es exactamente el fallo silencioso contra el que avisa el comentario de `siguienteTrabajo`: parece que
 * funciona. Así que las tres puertas usan ahora el mismo criterio —lo asignado explícitamente es una decisión,
 * no un descuido— y sin asignación nada de esto cambia.
 */
export function esTemporadaAsignada(etiqueta) {
  if (!asignadas.length || !etiqueta) return false;
  return asignadas.includes(String(etiqueta).trim());
}

/**
 * La misma pregunta, pero partiendo del CÓDIGO de temporada de una cola concreta.
 *
 * Va por la tabla `temporadas` a propósito: el código no significa lo mismo en cada federación (el 9 es 2013-14
 * en La Rioja y 2023-24 en Andalucía), así que comparar códigos con etiquetas sería un error silencioso. Si la
 * cola todavía no conoce el código, se responde `false`: sin poder traducirlo no se puede afirmar que esté
 * asignada, y ante la duda manda el suelo.
 */
export function esTemporadaAsignadaDeLaCola(db, temporada) {
  if (!asignadas.length) return false;
  if (temporada === null || temporada === undefined || temporada === '') return false;
  const fila = db.prepare('select etiqueta from temporadas where codigo = ?').get(String(temporada));
  return esTemporadaAsignada(fila?.etiqueta);
}

/**
 * Traduce las etiquetas asignadas a los códigos de ESTA cola, para poder comprobarlo y contarlo.
 * Devuelve las etiquetas que la cola no conoce, que es un aviso importante: significaría que se ha pedido una
 * temporada que esa federación no tiene catalogada y el recolector se quedaría sin trabajo sin saber por qué.
 */
export function resuelveTemporadasAsignadas(db) {
  const salida = { codigos: [], desconocidas: [] };
  for (const etiqueta of asignadas) {
    const fila = db.prepare('select codigo from temporadas where etiqueta = ?').get(etiqueta);
    if (fila?.codigo) salida.codigos.push(String(fila.codigo));
    else salida.desconocidas.push(etiqueta);
  }
  return salida;
}

/**
 * REACTIVA el trabajo de las temporadas asignadas que estaba APLAZADO por el suelo.
 *
 * ── POR QUÉ HACE FALTA, Y POR QUÉ NO BASTABA CON ASIGNAR (medido el 24/09/2026) ───────────────────────────
 *
 * El suelo de temporadas no sólo excluye al elegir trabajo: cuando se aplicó, **aplazó** el trabajo de las
 * temporadas antiguas a una fecha lejana (`aplazaTemporadasViejas`, hasta el año 2099). Así que asignar la
 * 2021-22 a una máquina y no tocar nada más da un resultado engañoso: el filtro la deja pasar, pero esas 5.750
 * tareas siguen fechadas en 2099 y el recolector contesta **«ningún trabajo disponible»** — sin error, sin aviso,
 * pareciendo que ya está todo hecho.
 *
 * Por eso, al cargar una asignación, se les quita ese aplazamiento. Sólo a las temporadas asignadas: lo demás
 * sigue aplazado como estaba, que es lo que quiere el suelo.
 */
export function reactivaTemporadasAsignadas(db, { hasta = '2099-01-01T00:00:00.000Z' } = {}) {
  if (!asignadas.length) return 0;
  const marcas = asignadas.map(() => '?').join(', ');
  const resultado = db.prepare(`
    update trabajos set siguiente_intento = null, actualizado_en = ?
    where estado = 'pendiente'
      and siguiente_intento >= ?
      and temporada in (select codigo from temporadas where etiqueta in (${marcas}))
  `).run(new Date().toISOString(), hasta, ...asignadas);
  return Number(resultado.changes ?? 0);
}
