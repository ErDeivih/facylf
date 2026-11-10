import type { FilaOpcionSelector } from '@/consultas/catalogo-selector';
import { etiqueta } from './presentacion-canonico';
import { esProvinciaDeCyl } from './provincias-cyl';
import {
  desplazamientoDeFiltro, enteroDeFiltro, federacionDeFiltro, temporadaDeFiltro, textoDeFiltro,
} from './calendario';

/**
 * Reglas del selector de temporada y competición (WALL objetivo 4).
 *
 * Son funciones puras: los filtros de la URL, la interpretación de una búsqueda como «Segunda Juvenil
 * 2017, Burgos», los chips de filtros activos y la paginación se prueban sin Next y sin base de datos.
 *
 * Las reglas de producto:
 *  · **nada se inventa**: un año que no está en el catálogo no crea una temporada, y una palabra se
 *    busca como lo que es (por comienzo de palabra, sin tildes), no como una suposición;
 *  · un parámetro inválido no rompe la página: se ignora y se enseña la vista sin ese filtro;
 *  · el estado vive en la URL (`fed`, `temp`, `cat`, `mod`, `gen`, `prov`, `nivel`, `q`, `offset`), así
 *    que una búsqueda se puede compartir y recargar;
 *  · la paginación es por desplazamiento y siempre múltiplo de la página: `offset` sin normalizar es
 *    una fuente de filas repetidas.
 */

/** La ruta del selector. La usan la página, los formularios y las pruebas. */
export const RUTA_SELECTOR = '/explorar/competiciones';

/** Cuántos grupos caben en una página del selector. */
export const TAMANO_PAGINA_SELECTOR = 30;

/** Los filtros del selector, tal como viajan en la URL y como se aplican a la consulta. */
export type FiltrosSelector = {
  federacion: string | null;
  temporada: string | null;
  categoria: string | null;
  modalidad: string | null;
  genero: string | null;
  provincia: string | null;
  nivel: number | null;
  texto: string | null;
  desplazamiento: number;
};

/** Lo que se deduce de la caja de texto libre. */
export type InterpretacionTexto = {
  /** Palabras que se buscan, normalizadas y con los ordinales ya convertidos a cifra. */
  tokens: string[];
  /** Temporada deducida de un año escrito (`2017` → `2016-17`), sólo si existe en el catálogo. */
  temporada: string | null;
  /** El año escrito, aunque no haya temporada: la pantalla lo puede usar para explicarse. */
  anio: string | null;
  /** El texto sin el año, para poder quitar la temporada deducida sin borrar toda la búsqueda. */
  textoSinTemporada: string;
};

/** El estado completo del selector: lo que pide la URL y lo que se aplica de verdad. */
export type EstadoSelector = {
  /** Filtros efectivos (la temporada deducida del texto ya incluida). */
  filtros: FiltrosSelector;
  /** Filtros tal cual vienen de la URL, sin deducir nada. */
  explicita: FiltrosSelector;
  interpretacion: InterpretacionTexto;
};

/** Una opción de un filtro, con su etiqueta para pantalla. */
export type OpcionSelector = { valor: string; etiqueta: string };

/** Todas las opciones del formulario, agrupadas por dimensión. */
export type OpcionesSelector = {
  federaciones: OpcionSelector[];
  temporadas: OpcionSelector[];
  categorias: OpcionSelector[];
  modalidades: OpcionSelector[];
  generos: OpcionSelector[];
  provincias: OpcionSelector[];
  niveles: OpcionSelector[];
};

/** Un filtro activo que se puede quitar: lo que se pinta como chip y el enlace que lo quita. */
export type ChipFiltro = { clave: string; texto: string; url: string; aria: string };

type Parametros = Record<string, string | string[] | undefined>;

/** Primer valor de un parámetro; los repetidos no se interpretan. */
function uno(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? (valor[0] ?? '') : (valor ?? '');
}

/** Ordinales escritos con letra → cifra. Es una ayuda de búsqueda, no un dato del catálogo. */
const ORDINALES: Record<string, string> = {
  primera: '1', primero: '1', segunda: '2', segundo: '2', tercera: '3', tercero: '3',
  cuarta: '4', cuarto: '4', quinta: '5', quinto: '5', sexta: '6', sexto: '6',
  septima: '7', septimo: '7', octava: '8', octavo: '8', novena: '9', noveno: '9',
  decima: '10', decimo: '10',
};

/** Palabras vacías: no filtran nada y, si se buscaran, podrían esconder resultados válidos. */
const VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'al', 'a', 'por', 'para', 'con',
  'un', 'una', 'unos', 'unas', 'que', 'temporada', 'temporadas',
]);

/** Minúsculas y sin tildes: la misma forma que espera la comparación del SQL. */
function normaliza(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Interpreta una búsqueda libre.
 *
 * Ejemplos:
 *  · «Segunda Juvenil 2017, Burgos» → temporada `2016-17`, palabras `2`, `juvenil`, `burgos`.
 *  · «2ª División 2016-17 Burgos» → temporada `2016-17` (el rango escrito manda), palabras `2`,
 *    `division`, `burgos`.
 *  · «juvenil de Burgos» → palabras `juvenil`, `burgos` (las palabras vacías no se buscan).
 *
 * El año suelto `Y` se interpreta como la temporada que **termina** en `Y` (`2017` → `2016-17`), que es
 * como se pide una temporada en fútbol; si esa temporada no está en el catálogo se prueba la que
 * empieza en `Y`. Si ninguna existe, no se inventa una temporada: el año se busca como palabra (y no
 * habrá resultados, que es la verdad).
 */
export function interpretaTexto(
  texto: string | null | undefined,
  temporadas: readonly string[],
): InterpretacionTexto {
  const original = (texto ?? '').trim();
  if (original === '') {
    return { tokens: [], temporada: null, anio: null, textoSinTemporada: '' };
  }

  let resto = original;
  let anio: string | null = null;
  let temporada: string | null = null;

  // Un rango escrito con dos años («2016-17», «2016/2017») ya es una temporada: no hay que adivinar.
  const rango = /\b((?:19|20)\d{2})\s*[-/–]\s*((?:19|20)?\d{2})\b/.exec(resto);
  if (rango) {
    const inicio = rango[1]!;
    const fin = rango[2]!;
    const etiqueta = `${inicio}-${fin.length === 4 ? fin.slice(2) : fin}`;
    anio = inicio;
    temporada = temporadas.includes(etiqueta) ? etiqueta : null;
    resto = resto.replace(rango[0], ' ');
  } else {
    const suelto = /\b((?:19|20)\d{2})\b/.exec(resto);
    if (suelto) {
      const y = Number(suelto[1]);
      const termina = `${y - 1}-${String(y).slice(-2)}`;
      const empieza = `${y}-${String(y + 1).slice(-2)}`;
      anio = String(y);
      if (temporadas.includes(termina)) temporada = termina;
      else if (temporadas.includes(empieza)) temporada = empieza;
      resto = resto.replace(suelto[0], ' ');
    }
  }

  const tokens: string[] = [];
  const vistos = new Set<string>();
  const anadir = (token: string) => {
    if (token === '' || token.length > 30 || vistos.has(token) || tokens.length >= 8) return;
    vistos.add(token);
    tokens.push(token);
  };
  for (const crudo of normaliza(resto).split(/[^a-z0-9]+/)) {
    if (crudo === '' || VACIAS.has(crudo)) continue;
    anadir(ORDINALES[crudo] ?? crudo);
  }
  // Un año que no corresponde a ninguna temporada del catálogo se busca como palabra: así la pantalla
  // no devuelve «todo» cuando el usuario ha escrito una temporada que no existe.
  if (anio !== null && temporada === null) anadir(anio);

  const textoSinTemporada = resto
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { tokens, temporada, anio, textoSinTemporada };
}

/** Un código de faceta (`categoria`, `modalidad`, `genero`): minúsculas, letras, dígitos y guiones. */
function codigoDeFiltro(valor: string | string[] | undefined): string | null {
  const crudo = uno(valor).trim().toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(crudo) ? crudo : null;
}

/** Una provincia: texto libre acotado. No se adivina el valor: o coincide con el catálogo o no filtra. */
function provinciaDeFiltro(valor: string | string[] | undefined): string | null {
  const crudo = uno(valor).trim().slice(0, 60);
  return crudo === '' ? null : crudo;
}

/** Lee el estado del selector de los `searchParams` de Next. */
export function leeFiltrosSelector(parametros: Parametros, temporadas: readonly string[]): EstadoSelector {
  const explicita: FiltrosSelector = {
    federacion: federacionDeFiltro(parametros.fed),
    temporada: temporadaDeFiltro(parametros.temp),
    categoria: codigoDeFiltro(parametros.cat),
    modalidad: codigoDeFiltro(parametros.mod),
    genero: codigoDeFiltro(parametros.gen),
    provincia: provinciaDeFiltro(parametros.prov),
    nivel: enteroDeFiltro(parametros.nivel, 20),
    texto: textoDeFiltro(parametros.q),
    desplazamiento: desplazamientoDeFiltro(parametros.offset, TAMANO_PAGINA_SELECTOR),
  };
  const interpretacion = interpretaTexto(explicita.texto, temporadas);
  const filtros: FiltrosSelector = {
    ...explicita,
    // La temporada escrita en la URL manda; la deducida del texto sólo rellena el hueco.
    temporada: explicita.temporada ?? interpretacion.temporada,
  };
  return { filtros, explicita, interpretacion };
}

/** ¿Hay algún filtro activo? La paginación no cuenta como filtro. */
export function tieneFiltrosSelector(filtros: FiltrosSelector): boolean {
  return Boolean(
    filtros.federacion || filtros.temporada || filtros.categoria || filtros.modalidad
    || filtros.genero || filtros.provincia || filtros.nivel !== null || filtros.texto,
  );
}

/**
 * La URL del selector con los filtros puestos y los cambios pedidos. Los valores por defecto no se
 * escriben: una URL limpia es la que se puede compartir. El desplazamiento hay que pasarlo
 * explícitamente (normalmente 0) cuando cambia un filtro, para no quedarse en una página que ya no
 * existe.
 */
export function urlDeSelector(filtros: FiltrosSelector, cambios: Partial<FiltrosSelector> = {}): string {
  const f = { ...filtros, ...cambios };
  const query = new URLSearchParams();
  if (f.federacion) query.set('fed', f.federacion);
  if (f.temporada) query.set('temp', f.temporada);
  if (f.categoria) query.set('cat', f.categoria);
  if (f.modalidad) query.set('mod', f.modalidad);
  if (f.genero) query.set('gen', f.genero);
  if (f.provincia) query.set('prov', f.provincia);
  if (f.nivel !== null) query.set('nivel', String(f.nivel));
  if (f.texto) query.set('q', f.texto);
  if (f.desplazamiento > 0) query.set('offset', String(f.desplazamiento));
  const cadena = query.toString();
  return cadena === '' ? RUTA_SELECTOR : `${RUTA_SELECTOR}?${cadena}`;
}

/** La etiqueta de un valor de opción; si el valor ya no existe en el catálogo, se enseña tal cual. */
function etiquetaDe(lista: readonly OpcionSelector[], valor: string): string {
  return lista.find((o) => o.valor === valor)?.etiqueta ?? valor;
}

/**
 * Los chips de los filtros activos, con el enlace que quita cada uno.
 *
 * La temporada deducida del texto se quita quitando el año del texto (no sólo `temp=`), y la búsqueda
 * por texto se quita entera. Todos los enlaces vuelven a la primera página.
 */
export function chipsDeFiltros(estado: EstadoSelector, opciones: OpcionesSelector): ChipFiltro[] {
  const { filtros, explicita, interpretacion } = estado;
  const chips: ChipFiltro[] = [];

  if (filtros.texto) {
    chips.push({
      clave: 'texto',
      // Si la temporada salió del año escrito, el chip del texto la quita del texto: dos chips que
      // dicen «2017» y «Temporada 2016-17» serían la misma cosa contada dos veces.
      texto: `«${interpretacion.temporada && interpretacion.textoSinTemporada
        ? interpretacion.textoSinTemporada
        : filtros.texto}»`,
      aria: 'Quitar la búsqueda por texto',
      url: urlDeSelector(filtros, {
        texto: null,
        temporada: explicita.temporada,
        desplazamiento: 0,
      }),
    });
  }

  if (filtros.temporada) {
    const deducida = explicita.temporada === null;
    chips.push({
      clave: 'temporada',
      texto: `Temporada ${filtros.temporada}`,
      aria: `Quitar el filtro de temporada (${filtros.temporada})`,
      url: deducida
        ? urlDeSelector(filtros, { temporada: null, texto: interpretacion.textoSinTemporada || null, desplazamiento: 0 })
        : urlDeSelector(filtros, { temporada: null, desplazamiento: 0 }),
    });
  }

  if (filtros.federacion) {
    chips.push({
      clave: 'federacion',
      texto: etiquetaDe(opciones.federaciones, filtros.federacion),
      aria: 'Quitar el filtro de federación',
      url: urlDeSelector(filtros, { federacion: null, desplazamiento: 0 }),
    });
  }
  if (filtros.categoria) {
    chips.push({
      clave: 'categoria',
      texto: etiquetaDe(opciones.categorias, filtros.categoria),
      aria: 'Quitar el filtro de categoría',
      url: urlDeSelector(filtros, { categoria: null, desplazamiento: 0 }),
    });
  }
  if (filtros.modalidad) {
    chips.push({
      clave: 'modalidad',
      texto: etiquetaDe(opciones.modalidades, filtros.modalidad),
      aria: 'Quitar el filtro de modalidad',
      url: urlDeSelector(filtros, { modalidad: null, desplazamiento: 0 }),
    });
  }
  if (filtros.genero) {
    chips.push({
      clave: 'genero',
      texto: etiquetaDe(opciones.generos, filtros.genero),
      aria: 'Quitar el filtro de género',
      url: urlDeSelector(filtros, { genero: null, desplazamiento: 0 }),
    });
  }
  if (filtros.provincia) {
    chips.push({
      clave: 'provincia',
      texto: filtros.provincia,
      aria: 'Quitar el filtro de provincia',
      url: urlDeSelector(filtros, { provincia: null, desplazamiento: 0 }),
    });
  }
  if (filtros.nivel !== null) {
    chips.push({
      clave: 'nivel',
      texto: etiquetaDe(opciones.niveles, String(filtros.nivel)),
      aria: 'Quitar el filtro de nivel',
      url: urlDeSelector(filtros, { nivel: null, desplazamiento: 0 }),
    });
  }

  return chips;
}

/**
 * Las temporadas que se ofrecen para recuperar una búsqueda sin resultados: las más cercanas a la
 * pedida (o las más recientes si no hay ninguna), sin repetir la que ya está puesta. Son temporadas que
 * existen en el catálogo; no se promete que esa competición concreta esté en todas.
 */
export function temporadasSugeridas(
  filtros: FiltrosSelector,
  temporadas: readonly string[],
  cuantas = 6,
): string[] {
  const disponibles = temporadas.filter((t) => t !== filtros.temporada);
  if (disponibles.length === 0) return [];
  if (filtros.temporada === null) return disponibles.slice(0, cuantas);
  const indice = temporadas.indexOf(filtros.temporada);
  return disponibles
    .slice()
    .sort((a, b) => Math.abs(temporadas.indexOf(a) - indice) - Math.abs(temporadas.indexOf(b) - indice))
    .slice(0, cuantas);
}

/** Agrupa las filas de opciones del canónico en las listas del formulario. */
export function opcionesDeSelector(filas: readonly FilaOpcionSelector[]): OpcionesSelector {
  const de = (dimension: string): FilaOpcionSelector[] => filas
    .filter((f) => f.dimension === dimension && f.valor.trim() !== '')
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));

  const temporadas = filas
    .filter((f) => f.dimension === 'temporada' && f.valor.trim() !== '')
    .sort((a, b) => (b.orden ?? 0) - (a.orden ?? 0));
  const niveles = filas
    .filter((f) => f.dimension === 'nivel' && f.valor.trim() !== '')
    .sort((a, b) => Number(a.valor) - Number(b.valor));

  const aOpcion = ({ valor, etiqueta: rotulo }: FilaOpcionSelector): OpcionSelector => ({ valor, etiqueta: rotulo });

  return {
    federaciones: de('federacion').map(aOpcion),
    temporadas: temporadas.map(aOpcion),
    // El catálogo guarda los códigos del esquema (`alevin`, `futbol8`…): en un desplegable se leen
    // traducidos, y `desconocida` es un valor real que se ofrece como «sin determinar», no se esconde.
    categorias: de('categoria').map((f) => ({ valor: f.valor, etiqueta: etiqueta('categoria', f.valor) })),
    modalidades: de('modalidad').map((f) => ({ valor: f.valor, etiqueta: etiqueta('modalidad', f.valor) })),
    generos: de('genero').map((f) => ({ valor: f.valor, etiqueta: etiqueta('genero', f.valor) })),
    // Fase C: sólo se ofrece provincia de Castilla y León. El catálogo puede traer provincias de las
    // otras federaciones del PC (48 valores distintos medidos el 10/11/2026); ofrecerlas sería ofrecer
    // filtros que no devuelven nada de lo que este producto publica. El valor es el del dato, no se
    // reescribe: el SQL compara `provincia` tal cual.
    provincias: de('provincia').filter((f) => esProvinciaDeCyl(f.valor)).map(aOpcion),
    niveles: niveles.map((f) => ({ valor: f.valor, etiqueta: f.etiqueta || `Nivel ${f.valor}` })),
  };
}
