import { clave } from '@facylf/dominio';
import { parse, type HTMLElement } from 'node-html-parser';
import { decodifica, lineas } from '../texto.js';
import { decodificaHtml, normalizaTextoFederacion } from '../texto.js';
import { decodificaContenidoCss, numeroOfuscadoHtml } from './ofuscacion.js';

/**
 * @experimental — NO usar para escribir en producción.
 *
 * El fichero de `datos-ejemplo/` es de pretemporada: todos los valores son 0, así que
 * no se puede saber qué columna es cuál por su contenido. `Puntos` además aparece dos
 * veces (una es la sanción). En cuanto haya una jornada jugada hay que coger el fichero
 * real, compararlo con la clasificación de la web y fijar el mapeo con un test.
 *
 * Y ojo: para la clasificación **no hace falta parsear nada**. Se calcula desde
 * `partidos` con `@facylf/dominio`. Este parser sirve sólo para **verificar** que
 * nuestro cálculo coincide con el oficial; si no coincide, casi siempre es una sanción
 * de puntos que la federación aplicó y nosotros no tenemos.
 */
export interface FilaOficial {
  equipo: string;
  /** Los 9 numéricos de la fila, en el orden en que vienen. Sin interpretar. */
  valores: number[];
}

/** Fila de la tabla resumen que publica la federacion en
 * `NFG_VisClasificacion`. A diferencia del antiguo volcado pseudo-XLS, esta
 * estructura tiene un encabezado inequivoco y permite usar la clasificacion
 * oficial (incluidas sanciones) sin hacer otra peticion. */
export interface ClasificacionOficialHtml {
  posicion: number;
  equipoCodigo: string | null;
  equipo: string;
  puntos: number;
  jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  ultimos: string[];
  sancion: number;
}

const entero = (valor: string): number | null => {
  const limpio = valor.replace(/[^\d-]/g, '');
  return /^-?\d+$/.test(limpio) ? Number(limpio) : null;
};

function parametroEquipo(href: string): string | null {
  try {
    const url = new URL(href.replace(/&amp;/g, '&'), 'https://www.rfcylf.es/pnfg/NPcd/');
    for (const [nombre, valor] of url.searchParams) {
      /*
       * El nombre del parámetro cambia de portal a portal: `codequipo` en la PNFG, `Codigo_Equipo` en las
       * páginas de equipo, `codEquipo` en algunas competiciones. Se acepta cualquiera que diga «equipo» y
       * traiga valor: lo que se busca es el CÓDIGO, y el nombre exacto es lo de menos.
       */
      if (nombre.toLowerCase().includes('equipo') && valor.trim() !== '') return valor;
    }
  } catch { /* enlace incompleto */ }
  return null;
}

/** Un número entero, y SÓLO un entero: «2,5000» no es 25000. */
const enteroExacto = (valor: string): number | null => {
  const limpio = valor.trim();
  return /^-?\d+$/.test(limpio) ? Number(limpio) : null;
};

/** Las letras de «últimos resultados»: G/E/P en castellano y en euskera, I/B en euskera. */
const RE_ULTIMOS = /^[GEPIB](\s+[GEPIB])*$/i;

/**
 * Una fila de la tabla RESUMEN, o `null` si esa fila no lo es.
 *
 * ── POR QUÉ SE BUSCA POR ANCLAS Y NO POR POSICIÓN (medido el 25/09/2026) ──────────────────────────────
 *
 * El lector anterior leía las celdas por índice fijo (posición en la 1, equipo en la 2, puntos en la 3…) y
 * con eso leyó bien 4.595 clasificaciones. Pero la MISMA tabla aparece con una columna de más en cuanto el
 * portal publica «Pts/PJ» (puntos por partido): baleares 2024-25 mete `2,5000` en la celda 3 y desplaza todo
 * una posición. Con índices fijos, eso no es un fallo visible: `entero("2,5000")` quitaba la coma y devolvía
 * **25000 puntos**. La columna de más no rompía la lectura, la envenenaba.
 *
 * Así que las celdas se buscan por lo que SON, no por dónde están:
 *
 *   · el EQUIPO es la celda con un enlace que lleva el código de equipo (`codequipo`, `Codigo_Equipo`);
 *   · la POSICIÓN es el primer entero limpio a su izquierda;
 *   · los ÚLTIMOS RESULTADOS son la celda donde se corta la racha de números (o ninguna: en pretemporada
 *     está vacía);
 *   · los cinco primeros números de la racha son puntos, jugados, ganados, empatados y perdidos, y se caen
 *     los que no sean enteros limpios (así el «Pts/PJ» decimal se descarta solo).
 *
 * Y la coherencia (`jugados = ganados + empatados + perdidos`) NO se exige fila a fila, sino al conjunto: se
 * marca cada fila y se decide con la tabla entera (v. `parseaClasificacionHtml`). Medido el 25/09/2026: hay
 * tablas publicadas con una fila que no cuadra —Asturias 2019-20, grupo 24469: 21+6+2 = 29 victorias, empates
 * y derrotas en 28 partidos—, y rechazar esas filas una a una tiraba datos buenos de verdad.
 */
/**
 * ── EL VALOR DE UNA CELDA, CUANDO LA FUENTE NO LO ESCRIBE COMO TEXTO ───────────────────────────────────
 *
 * Casi siempre el valor de una celda es su texto y aquí no se toca nada: si el texto ya es un entero, se
 * devuelve tal cual y ninguna federación que hoy se lee bien cambia de valor. Pero Galicia publica la
 * clasificación con los números ofuscados —un pseudo-elemento CSS (`#id:before{content:"2,8158"}`), una clase
 * `fa-N` que resuelve `ntype()`, y al lado un `<span style="display:none">` que es un SEÑUELO—, así que el
 * texto de la celda es el CSS o el script y el número no aparece por ningún lado. Medido el 26/09/2026: con
 * esto, las tres celdas ofuscadas de una fila real salen (3 descifradas, 0 sin descifrar).
 *
 * Dos cosas que hay que hacer bien, y las dos están medidas:
 *
 *  · el descifrador necesita la **tabla numérica del `eval` de la página**, y hay que dársela DENTRO de un
 *    `<script>`: si se le pasa la celda sola tira de la clase (que el propio módulo avisa que puede ser el
 *    señuelo), y si se le pasa la tabla como texto plano, sus 40 dígitos se concatenan con los de la celda y
 *    sale `2,59e+44`;
 *  · si el CSS publica un **decimal** (`Pts/PJ` = `content:"2,8158"`), se devuelve el decimal que la fuente
 *    publica, NO sus dígitos pegados: `28158` entraría en la racha como un entero y desplazaría todas las
 *    columnas siguientes —los puntos acabarían en «jugados»—. Un decimal, en cambio, la racha ya sabe
 *    saltárselo sin cortarse, igual que el «Pts/PJ» de otras federaciones.
 */
function valorDeCelda(celda: HTMLElement, contexto: string): string {
  const texto = normalizaTextoFederacion(celda.textContent);
  if (enteroExacto(texto) !== null) return texto;
  const crudo = celda.innerHTML ?? '';
  /*
   * ── UN DECIMAL PUBLICADO NO ES UN ENTERO, Y ESO VA PRIMERO ────────────────────────────────────────────
   *
   * El `Pts/PJ` de Galicia es un cociente —`content:"2,8158"`, que es 107/38— y se devuelve TAL CUAL: la racha
   * de números sabe saltarse un decimal sin cortarse, mientras que sus dígitos pegados (28158) entrarían como
   * un entero y desplazarían todas las columnas siguientes, dejando los puntos en «jugados».
   */
  const contenidos = [...crudo.matchAll(/content\s*:\s*["']([^"']*)["']/gi)]
    .map((m) => decodificaContenidoCss(m[1] ?? '').trim())
    .filter((v) => v !== '');
  const decimal = contenidos.find((v) => /[.,]/.test(v) && /^[\d\s.,-]+$/.test(v));
  if (decimal !== undefined) return decimal;
  /*
   * ── Y LO DEMÁS LO RESUELVE EL DESCIFRADOR DEL PORTAL, NO UNA COPIA SUYA ────────────────────────────────
   *
   * Aquí estuve a punto de escribir un error de datos: cogiendo el `content` del primer pseudo-elemento, la
   * columna de ganados de Galicia salía 3 en vez de 35 —el número viene partido, la primera cifra en el CSS y
   * la segunda en el texto visible— y se perdían 11 de 20 equipos. `numeroOfuscadoHtml` recorre el DOM y junta
   * todas las piezas EN ORDEN: pseudo-elementos, `ntype(...)`, texto visible y spans ocultos (que son
   * señuelos). Una sola definición, la que ya usa el parser de actas.
   *
   * Sólo se descifra cuando hay de dónde: la tabla del `eval` de la página, o algo publicado en un
   * pseudo-elemento. Sin ninguna de las dos, se devuelve el texto y decide la coherencia de la tabla.
   */
  if (contexto !== '' || contenidos.length > 0) {
    const numero = numeroOfuscadoHtml(`${contexto}${crudo}`);
    if (numero !== null) return String(numero);
  }
  return texto;
}

/** La tabla numérica del `eval` empaquetado de la página, envuelta en un `<script>` (v. `valorDeCelda`). */
function contextoDeOfuscacion(html: string): string {
  const tabla = /\[((?:\d+\s*,\s*){9,}\d+)\]/.exec(html)?.[1];
  return tabla === undefined ? '' : `<script>[${tabla}]</script>`;
}

/**
 * Las celdas de una fila, con el equipo localizado y la racha de números que le sigue.
 *
 * Compartido por el resumen y por el desglose casa/fuera: las dos tablas colocan las mismas cosas —posición,
 * equipo con su código, y luego números—, así que se leen igual.
 */
function leeFilaConNumeros(fila: HTMLElement, contexto = ''): {
  equipo: string; equipoCodigo: string | null; posicion: number; numeros: number[]; desdeCorte: string[];
  /** `true` cuando lo primero que publica la fila detrás del equipo es un número NO entero (v. el desglose). */
  primerDecimal: number | null;
} | null {
  const celdas = fila.querySelectorAll('th,td');
  if (celdas.length < 8) return null;
  const textos = celdas.map((c) => valorDeCelda(c, contexto));

  let equipoIdx = -1;
  let equipoCodigo: string | null = null;
  for (let i = 0; i < celdas.length && equipoIdx < 0; i += 1) {
    const href = celdas[i]!.querySelector('a')?.getAttribute('href') ?? '';
    const codigo = parametroEquipo(href);
    if (codigo !== null) { equipoIdx = i; equipoCodigo = codigo; }
  }
  if (equipoIdx < 0) {
    /*
     * Y si la página no enlaza el equipo con su código, se busca por lo que es: la primera celda con letras
     * (el nombre) que tenga números detrás. Los encabezados no la cumplen —detrás traen etiquetas, no
     * números—, así que no se confunden con un equipo.
     */
    for (let i = 0; i < celdas.length && equipoIdx < 0; i += 1) {
      const texto = (textos[i] ?? '').trim();
      if (texto === '' || !/[a-záéíóúñ]/i.test(texto)) continue;
      const detras = textos.slice(i + 1, i + 7).map((t) => enteroExacto(t ?? '')).filter((n) => n !== null);
      if (detras.length >= 5) equipoIdx = i;
    }
  }
  if (equipoIdx < 0) return null;
  const equipo = textos[equipoIdx] ?? '';
  if (!equipo) return null;

  let posicion: number | null = null;
  for (let i = equipoIdx - 1; i >= 0 && posicion === null; i -= 1) posicion = enteroExacto(textos[i] ?? '');
  if (posicion === null) return null;

  /*
   * Los números van SEGUIDOS detrás del equipo: se recogen hasta que aparece algo que no es un número (los
   * «últimos resultados», una celda vacía, o el texto raro de una maqueta que pinta los valores con
   * JavaScript). Un valor con coma o punto —el «Pts/PJ»— se cuenta como número para no cortar la racha,
   * pero NO se guarda: no es un entero y nunca se convierte en uno.
   */
  const numeros: number[] = [];
  let corteIdx = -1;
  let primerDecimal: number | null = null;
  for (let i = equipoIdx + 1; i < textos.length && corteIdx < 0; i += 1) {
    const texto = (textos[i] ?? '').trim();
    const entero = enteroExacto(texto);
    if (entero !== null) { numeros.push(entero); continue; }
    if (/^[\d.,\s-]+$/.test(texto) && /\d/.test(texto)) {
      // «2,5000» o «4,25»: número, pero no entero. Se apunta el VALOR si es lo primero que publica la fila,
      // porque quién sume el desglose tiene que poder comprobar de qué es ese decimal (v. `filasDelDesglose`).
      if (numeros.length === 0) primerDecimal = Number(texto.replace(',', '.'));
      continue;
    }
    corteIdx = i;
  }
  if (corteIdx < 0) return null;
  return { equipo, equipoCodigo, posicion, numeros, desdeCorte: textos.slice(corteIdx), primerDecimal };
}

/** La clave con la que se casa la misma fila en dos tablas: el código si lo hay, y si no el nombre. */
const claveDeEquipo = (equipoCodigo: string | null, equipo: string): string =>
  equipoCodigo === null ? `n:${equipo}` : `c:${equipoCodigo}`;

/** Una fila del desglose casa/fuera, con sus dos mitades ya separadas y sus totales sumados. */
type FilaDesglose = {
  posicion: number; equipo: string; equipoCodigo: string | null;
  /** Los puntos PUBLICADOS. No se calculan: la federación los publica y pueden llevar ajuste. */
  puntos: number;
  jugados: number; ganados: number; empatados: number; perdidos: number;
  ultimos: string[]; sancion: number;
  /**
   * El valor del número NO entero que la fila publica delante de todo, si lo hay.
   *
   * `null` cuando la fila empieza por un entero. Se lleva hasta la SÍNTESIS —y no se decide aquí— porque en
   * Galicia ese decimal es la columna `Pts/PJ` (legítima) y en Murcia son los PUNTOS de ese equipo (y entonces
   * la fila no se puede escribir con puntos honestos). El desglose en sí sigue sirviendo para contrastar el
   * resumen aunque traiga un decimal: por eso esto no anula `filasDelDesglose`, sólo avisa.
   */
  primerDecimal: number | null;
};

/**
 * Las filas del desglose casa/fuera de una tabla, ya sumadas.
 *
 * ── POR QUÉ HAY DOS FORMAS DE DESGLOSE, Y POR QUÉ HAY QUE DECIDIR CUÁL ES ──────────────────────────────
 *
 * El desglose clásico publica nueve números por equipo: los puntos y luego casa (J, G, E, P) y fuera
 * (J, G, E, P). Pero Galicia y La Rioja publican TRECE, porque además publican los goles de cada mitad:
 *
 *   [Pts] [Jc Gc Ec Pc Fc Cc] [Jf Gf Ef Pf Ff Cf]
 *
 * Y no se puede saber cuál es cuál contando números sin más: hay que COMPROBARLO. La comprobación es la
 * coherencia de cada mitad consigo misma —`jugados = ganados + empatados + perdidos`—, que se cumple en una
 * lectura y no en la otra. Medido el 26/09/2026 en Galicia (t18 c15035102 g15578307, R.C. DEPORTIVO):
 * `[107, 19, 18, 0, 1, 84, 13, 19, 17, 2, 0, 88, 11]` — leído como nueve, la mitad de fuera da 84 = 13+19+17
 * (falso); leído como trece, casa 19 = 18+0+1 y fuera 19 = 17+2+0, las dos cuadran y los totales son
 * J=38, G=35, E=2, P=1 → 107 puntos, que es exactamente lo que dice la columna `Pts/PJ` de la propia página
 * (2,8158 = 107/38).
 *
 * Devuelve `null` cuando ninguna de las dos lecturas cuadra en la mayoría de las filas: entonces no se
 * devuelve nada, que es lo correcto cuando no se entiende la maqueta.
 */
function filasDelDesglose(tabla: HTMLElement, contexto: string): FilaDesglose[] | null {
  const leidas = tabla.querySelectorAll('tr')
    .map((fila) => leeFilaConNumeros(fila, contexto))
    .filter((l): l is NonNullable<typeof l> => l !== null && l.numeros.length >= 9);
  if (leidas.length === 0) return null;

  /** Los totales de una mitad, leídos a partir de un desplazamiento. Comprueba que la mitad cuadre. */
  const mitad = (n: number[], desde: number) => ({
    jugados: n[desde]!, ganados: n[desde + 1]!, empatados: n[desde + 2]!, perdidos: n[desde + 3]!,
    cuadra: n[desde] === n[desde + 1]! + n[desde + 2]! + n[desde + 3]!,
  });
  /*
   * Con nueve o once números las dos mitades están donde siempre —casa en 1..4 y fuera en 5..8— y no hay nada
   * que decidir: los goles, cuando están, van al final. La duda aparece SÓLO con trece o más, porque entonces
   * los goles van DENTRO de cada mitad y la de fuera empieza en 7 en vez de en 5. Se decide con la coherencia
   * de cada mitad, que es la única señal que hay cuando la página no publica resumen (Galicia y La Rioja).
   *
   * Y no se exige coherencia para aceptar: hay federaciones que publican una mitad que no cuadra consigo misma
   * —medido en Asturias 2019-20, grupo 24469: fuera 8+5+1 = 14 sobre 13 jugados— y esas tablas se leen igual.
   * Quien decide si la tabla sirve es la comprobación del conjunto, no esta.
   */
  const conGoles = leidas.filter((l) => l.numeros.length >= 13
    && mitad(l.numeros, 1).cuadra && mitad(l.numeros, 7).cuadra).length;
  const sinGolesConTrece = leidas.filter((l) => l.numeros.length >= 13
    && mitad(l.numeros, 1).cuadra && mitad(l.numeros, 5).cuadra).length;
  const deTrece = leidas.filter((l) => l.numeros.length >= 13).length;
  const usaGoles = deTrece * 2 > leidas.length && conGoles > sinGolesConTrece;

  const salida: FilaDesglose[] = [];
  for (const l of leidas) {
    const n = l.numeros;
    const casa = mitad(n, 1);
    const fuera = mitad(n, usaGoles ? 7 : 5);
    // La racha y la sanción se leen igual que en el resumen: son las celdas que quedan tras los números.
    const cellUltimos = l.desdeCorte.find((t) => RE_ULTIMOS.test((t ?? '').trim())) ?? '';
    salida.push({
      posicion: l.posicion, equipo: l.equipo, equipoCodigo: l.equipoCodigo, puntos: n[0]!,
      jugados: casa.jugados + fuera.jugados,
      ganados: casa.ganados + fuera.ganados,
      empatados: casa.empatados + fuera.empatados,
      perdidos: casa.perdidos + fuera.perdidos,
      ultimos: cellUltimos.split(/\s+/).filter((x) => /^[GEPIB]$/i.test(x)).map((x) => x.toUpperCase()),
      sancion: l.desdeCorte.map((t) => enteroExacto(t ?? '')).find((x) => x !== null) ?? 0,
      primerDecimal: l.primerDecimal,
    });
  }
  return salida;
}

/** Los totales que publica el desglose casa/fuera (casa + fuera), por equipo. */
function totalesDelDesglose(tabla: HTMLElement, contexto: string): Map<string, { jugados: number; ganados: number; empatados: number; perdidos: number }> {
  const salida = new Map<string, { jugados: number; ganados: number; empatados: number; perdidos: number }>();
  for (const f of filasDelDesglose(tabla, contexto) ?? []) {
    salida.set(claveDeEquipo(f.equipoCodigo, f.equipo), {
      jugados: f.jugados, ganados: f.ganados, empatados: f.empatados, perdidos: f.perdidos,
    });
  }
  return salida;
}

function leeFilaDeResumen(fila: HTMLElement, contexto = ''): (ClasificacionOficialHtml & { cuadra: boolean }) | null {
  const leida = leeFilaConNumeros(fila, contexto);
  if (leida === null || leida.numeros.length < 5) return null;
  const { equipo, equipoCodigo, posicion, numeros, desdeCorte } = leida;
  const [puntos, jugados, ganados, empatados, perdidos] = numeros as [number, number, number, number, number];
  /*
   * La coherencia se apunta, no se exige aquí: la decide el conjunto de la tabla (v. más abajo). Es la
   * comprobación que distingue «esta maqueta no la entiendo» de «estos números son los que publica», pero
   * aplicada fila a fila rechazaría filas publicadas que no cuadran por un partido anulado o arrastrado.
   */
  const cuadra = jugados === ganados + empatados + perdidos;

  // La celda del corte son los «últimos resultados» si trae letras; si está vacía (pretemporada, sin
  // partidos jugados) se queda sin ellos, que es la verdad: no hay ninguno.
  const cellUltimos = desdeCorte.find((t) => RE_ULTIMOS.test((t ?? '').trim())) ?? '';
  const ultimos = cellUltimos.split(/\s+/).filter((x) => /^[GEPIB]$/i.test(x)).map((x) => x.toUpperCase());
  const sancion = desdeCorte.map((t) => enteroExacto(t ?? '')).find((n) => n !== null) ?? 0;
  return { posicion, equipoCodigo, equipo, puntos, jugados, ganados, empatados, perdidos, ultimos, sancion, cuadra };
}

/**
 * ¿Cuántas tablas de clasificación hay en la página? (0 si no hay ninguna.)
 *
 * Existe para poder decir POR QUÉ una clasificación archivada no se lee, que son dos cosas distintas:
 *
 *   · no hay tabla de clasificación en el archivo (la federación no la publicaba, o el recolector guardó
 *     otra vista de la página) — el archivo es el que no la trae;
 *   · hay tabla y el lector no saca filas — el hueco es NUESTRO.
 *
 * Medido el 25/09/2026 en euskadi 2014-15 (comp 2837, grupo 513242): el archivo sólo trae la tabla de
 * resultados, con los partidos y su marcador, y ninguna clasificación. Sin esta comprobación se contaba como
 * «el lector no la sabe leer», que era falso.
 */
export function cuentaTablasDeClasificacion(entrada: string | Buffer | Uint8Array): number {
  const html = typeof entrada === 'string' ? entrada : decodificaHtml(entrada);
  let cuantas = 0;
  for (const tabla of parse(html).querySelectorAll('table')) {
    const filas = tabla.querySelectorAll('tr');
    const cabecera = filas.slice(0, 2).flatMap((fila) =>
      fila.querySelectorAll('th,td').map((celda) => normalizaTextoFederacion(celda.textContent)))
      .join(' ').replace(/\s+/g, ' ');
    if (!/\bPts\b|\bPtak\b/i.test(cabecera)) continue;
    if (!/Sanci[oó]n|Descuento|Zigorra/i.test(cabecera)) continue;
    cuantas += 1;
  }
  return cuantas;
}

/**
 * Lee la tabla oficial visible. Ignora la tabla detallada casa/fuera y los resultados que aparecen debajo.
 * Devuelve `[]` para una página sin tabla.
 */
export function parseaClasificacionHtml(entrada: string | Buffer | Uint8Array): ClasificacionOficialHtml[] {
  const html = typeof entrada === 'string' ? entrada : decodificaHtml(entrada);
  const raiz = parse(html);
  const tablas = raiz.querySelectorAll('table');
  // La tabla numérica del `eval` de la página, que es lo que permite descifrar los `ntype(...)` (v. valorDeCelda).
  const contexto = contextoDeOfuscacion(html);
  /*
   * Primero se busca el DESGLOSE casa/fuera, que es la lectura independiente con la que se contrasta el
   * resumen cuando éste no cuadra consigo mismo (v. más abajo) y, en las páginas que NO publican resumen
   * —Galicia y La Rioja, v. más abajo—, la única fuente que hay.
   */
  let desglose: Map<string, { jugados: number; ganados: number; empatados: number; perdidos: number }> | null = null;
  let tablaDesglose: HTMLElement | null = null;
  for (const tabla of tablas) {
    const grupos = (tabla.querySelectorAll('tr')[0]?.querySelectorAll('th,td') ?? [])
      .map((celda) => normalizaTextoFederacion(celda.textContent)).join(' ');
    if (/casa|fuera|etxeko|kanpoko/i.test(grupos)) { tablaDesglose = tabla; break; }
  }
  if (tablaDesglose !== null) desglose = totalesDelDesglose(tablaDesglose, contexto);
  for (const tabla of tablas) {
    const filas = tabla.querySelectorAll('tr');
    if (filas.length < 3) continue;
    // No dependemos de los espacios que haya entre las etiquetas: algunos
    // portales/minificadores concatenan el textContent de los <th>.
    const cabecera = filas.slice(0, 2).flatMap((fila) =>
      fila.querySelectorAll('th,td').map((celda) => normalizaTextoFederacion(celda.textContent)))
      .join(' ').replace(/\s+/g, ' ');
    /*
     * ── LAS CABECERAS CAMBIAN DE IDIOMA Y DE PALABRA, Y ESO DEJÓ 1.321 TABLAS SIN LEER ───────────────
     *
     * Medido el 25/09/2026. La guarda pedía «Pts», «J» y «Sanción», y esa es la maqueta PNFG de Castilla y
     * León. Pero la misma maqueta la publican otras federaciones con sus palabras:
     *
     *   · euskadi la publica en EUSKERA: «Ptak» (puntos), «J», «I» (irabaziak/berdinketak), «Zigorra»
     *     (sanción) — 873 clasificaciones archivadas que se leían como «sin tabla»;
     *   · baleares usa «Descuento» en la última columna — 448 clasificaciones más.
     *
     * Lo que estaba de más era el vocabulario, no la estructura: la tabla es la misma.
     */
    if (!/\bPts\b|\bPtak\b/i.test(cabecera)) continue;
    if (!/Sanci[oó]n|Descuento|Zigorra/i.test(cabecera)) continue;
    /*
     * Y el desglose casa/fuera es OTRA tabla de la misma página, con el mismo vocabulario: se distingue por
     * su cabecera agrupada («Partidos Casa»/«Partidos Fuera», «Etxeko Partidak»/«Kanpoko Partidak»), que es
     * lo que publica el doble de números por equipo.
     */
    const grupos = (filas[0]?.querySelectorAll('th,td') ?? [])
      .map((celda) => normalizaTextoFederacion(celda.textContent)).join(' ');
    if (/casa|fuera|etxeko|kanpoko/i.test(grupos)) continue;

    /*
     * ── LA TABLA SE ACEPTA ENTERA O NO SE ACEPTA: LA COHERENCIA DECIDE QUÉ TABLA ES ─────────────────────
     *
     * Cada fila se lee sin exigirle que cuadre, y al final se mira el conjunto. Hay dos formas de que una
     * tabla sea la clasificación:
     *
     *   1. la mayoría de sus filas cumple `jugados = ganados + empatados + perdidos` — el caso normal;
     *   2. o sus totales COINCIDEN con los del desglose casa/fuera de la misma página, que es una lectura
     *      independiente de los mismos datos.
     *
     * La segunda vía no es un adorno: medido el 25/09/2026, Asturias 2019-20 (comp 7526, grupo 24469)
     * publica un resumen que no cuadra consigo mismo —Real Titanico: 21 victorias + 6 empates + 2 derrotas
     * son 29 partidos y la columna de jugados dice 28— y sin embargo el desglose casa/fuera da exactamente
     * esos totales (15+13 = 28 jugados, 13+8 = 21 ganados, 1+5 = 6 empatados, 1+1 = 2 perdidos) y los puntos
     * también cuadran (13·3+1 + 8·3+5 = 69). La federación publica así, y esos 132 grupos se leían antes y
     * se perderían ahora. Con esta vía se aceptan, y con la coherencia interna sola se caían.
     *
     * Y si NO se cumple ninguna de las dos —la maqueta de Galicia pinta los valores con JavaScript y en el
     * HTML quedan números sueltos y descuadrados—, no se devuelve nada: decir «no la sé leer» es correcto;
     * escribir números con esa pinta, no.
     */
    const leidas = filas.slice(1)                  // la cabecera ocupa una o dos filas y no tiene anclas
      .map((fila) => leeFilaDeResumen(fila, contexto))
      .filter((l): l is ClasificacionOficialHtml & { cuadra: boolean } => l !== null);
    if (leidas.length === 0) continue;
    const cuadran = leidas.filter((l) => l.cuadra).length;
    const coinciden = leidas.filter((l) => {
      const suyo = desglose?.get(claveDeEquipo(l.equipoCodigo, l.equipo));
      return suyo !== undefined && suyo.jugados === l.jugados && suyo.ganados === l.ganados
        && suyo.empatados === l.empatados && suyo.perdidos === l.perdidos;
    }).length;
    if (cuadran * 2 <= leidas.length && coinciden * 2 < leidas.length) continue;
    return leidas.map((l) => ({
      posicion: l.posicion, equipoCodigo: l.equipoCodigo, equipo: l.equipo, puntos: l.puntos,
      jugados: l.jugados, ganados: l.ganados, empatados: l.empatados, perdidos: l.perdidos,
      ultimos: l.ultimos, sancion: l.sancion,
    }));
  }

  /*
   * ── SI LA PÁGINA NO PUBLICA RESUMEN, EL RESUMEN ES LA SUMA DEL DESGLOSE ───────────────────────────────
   *
   * Galicia y La Rioja publican la clasificación SÓLO como desglose casa/fuera: su tabla agrupa las columnas
   * en «Partidos Casa» y «Partidos Fuera», así que el bucle de arriba la descarta a propósito (no es el
   * resumen) y luego no encuentra ningún resumen que leer. Medido el 26/09/2026: 596 clasificaciones
   * archivadas de La Rioja y 1.267 de Galicia devolvían cero filas por esto.
   *
   * Pero el resumen está ahí, sumando: los jugados, ganados, empatados y perdidos de cada equipo son la suma
   * de sus dos mitades, y los PUNTOS se toman **los que publica la federación**, no los que saldrían de
   * calcularlos (una sanción no se inventa ni se pierde). No es adivinar: es sumar lo que la fuente publica.
   *
   * Y sólo se devuelve si la suma cuadra —`jugados = ganados + empatados + perdidos`— en la mayoría de las
   * filas: esa comprobación es la que distingue «esta maqueta la entiendo» de «estos números son invento mío».
   *
   * Esta rama SÓLO se alcanza cuando ninguna tabla de la página ha dado filas de resumen, así que no puede
   * cambiar nada de lo que hoy se lee bien: donde antes había cero filas, ahora hay filas sumadas.
   */
  if (tablaDesglose !== null) {
    const filasDesglose = filasDelDesglose(tablaDesglose, contexto);
    /*
     * ── Y UN DECIMAL DELANTE PUEDE SER DOS COSAS MUY DISTINTAS ──────────────────────────────────────────
     *
     * Galicia publica `Pts/PJ` —el cociente de puntos por partido— ANTES de los puntos, y ahí el decimal es una
     * columna legítima que hay que saltarse. Murcia publica los puntos con decimal para algún equipo (`4,25`
     * en el líder del grupo 24024914, medido el 26/09/2026): allí el decimal ES la puntuación, y saltárselo
     * dejaría al líder con 0 puntos —un dato FALSO, no una ausencia—.
     *
     * Los distingue la propia aritmética de la fuente: si es el cociente, tiene que valer los puntos partidos
     * por los jugados de esa misma fila (107/38 = 2,8158). Si no cuadra, no se sintetiza nada y la tabla se
     * queda sin leer, exactamente como estaba antes.
     *
     * El guardián vive AQUÍ, en la síntesis, y no en `filasDelDesglose`: el desglose sigue valiendo para
     * contrastar un resumen aunque traiga un decimal, y anularlo ahí dejaba sin leer una clasificación de
     * Navarra que sí se leía (medido: 673 → 672 al ponerlo en el sitio equivocado).
     */
    const conDecimalQueNoEsCociente = (filasDesglose ?? []).some((f) => f.primerDecimal !== null
      && (f.jugados === 0 || Math.abs(f.primerDecimal - (f.puntos / f.jugados)) > 0.001));
    if (filasDesglose !== null && !conDecimalQueNoEsCociente) {
      const cuadran = filasDesglose.filter((f) => f.jugados === f.ganados + f.empatados + f.perdidos).length;
      if (cuadran * 2 > filasDesglose.length) {
        return filasDesglose.map((f) => ({
          posicion: f.posicion, equipoCodigo: f.equipoCodigo, equipo: f.equipo, puntos: f.puntos,
          jugados: f.jugados, ganados: f.ganados, empatados: f.empatados, perdidos: f.perdidos,
          ultimos: f.ultimos, sancion: f.sancion,
        }));
      }
    }
  }
  return [];
}

const RE_NUM = /^-?\d+$/;

export function parseaClasificacionCruda(entrada: string | Buffer | Uint8Array): FilaOficial[] {
  const html = typeof entrada === 'string' ? entrada : decodifica(entrada);
  const ls = lineas(html);
  const filas: FilaOficial[] = [];

  for (let i = 0; i < ls.length; i++) {
    // patrón de fila: <posición> <nombre de equipo> <9 numéricos>
    if (!RE_NUM.test(ls[i] ?? '')) continue;
    const nombre = ls[i + 1];
    if (!nombre || RE_NUM.test(nombre)) continue;
    const valores = ls.slice(i + 2, i + 11);
    if (valores.length !== 9 || !valores.every((v) => RE_NUM.test(v))) continue;
    filas.push({ equipo: nombre, valores: valores.map(Number) });
    i += 10;
  }
  return filas;
}

/** Comparación entre lo que calculamos y lo que publica la federación.
 *  Devuelve los equipos cuya diferencia de puntos no cuadra. */
export function contrasta(
  calculado: { equipo: string; puntos: number }[],
  oficial: FilaOficial[],
  indicePuntos: number,
): { equipo: string; nuestro: number; suyo: number }[] {
  const mapa = new Map(oficial.map((f) => [clave(f.equipo), f.valores[indicePuntos] ?? 0]));
  return calculado
    .map((c) => ({ equipo: c.equipo, nuestro: c.puntos, suyo: mapa.get(clave(c.equipo)) ?? 0 }))
    .filter((x) => x.nuestro !== x.suyo);
}
