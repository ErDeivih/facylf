/**
 * Reglas puras del nombre corto de equipo (`scripts/nombres-cortos-equipos.mjs`).
 *
 * El nombre corto es una decisión de PRESENTACIÓN, no un dato de la federación: se deriva del nombre
 * publicado con reglas explícitas y, cuando la regla no es fiable, se decide a mano (`DECISIONES`).
 * Vive aparte del script para poder probar las reglas sin base de datos.
 *
 * Reglas (las cinco del encargo y sus casos raros):
 *   «Club Deportivo Isoba»              → «Isoba»
 *   «Real Valladolid Club de Fútbol»    → «R. Valladolid»
 *   «Unión Deportiva Santa Marta»       → «Santa Marta»
 *   «SD Ponferradina»                   → «Ponferradina»
 *   «Salamanca Club de Fútbol UDS»      → «Salamanca CF»
 *
 * Lo que NO hace: inventar. Si al quitar las formas legales no queda nada, o queda algo que no parece
 * el nombre de un equipo, devuelve el nombre completo con confianza baja para que alguien lo revise.
 */

/** Formas legales de varias palabras, en orden de más larga a más corta. */
const FRASES_LEGALES = [
  ['club', 'deportivo', 'internacional'],
  ['club', 'de', 'futbol'],
  ['club', 'deportivo'],
  ['union', 'deportiva'],
  ['sociedad', 'deportiva'],
  ['club', 'de', 'futbol', 'sala'],
  ['c', 'y', 'd'],
];

/** Siglas de forma legal. Se comparan en mayúsculas y sin puntos. */
const SIGLAS_LEGALES = new Set([
  'CD', 'CDI', 'CF', 'SD', 'SAD', 'UD', 'UDS', 'AD', 'ACD', 'FS', 'FC', 'CP', 'SC',
  'CB', 'CL', 'CR', 'GC', 'RC', 'SA', 'SL', 'UDC', 'FSC', 'CDE', 'CDS', 'CDB', 'CDUP',
  'CDF', 'CFF', 'CFS', 'ADF', 'UDF', 'SDF', 'CDA', 'CAC', 'CEC', 'CFI', 'CFP', 'CFU',
]);

/** Marcas de modalidad que suelen ir seguidas del patrocinador: lo que viene después no es el nombre. */
const MARCAS_DE_MODALIDAD = new Set(['FS', 'F5', 'FUTSAL', 'SALA']);

/** Nombres cortos decididos a mano para los casos que la regla no resuelve bien (patrocinios, siglas
 *  propias del club, equipos de la misma ciudad). */
export const DECISIONES_MANUALES = {
  // Dos equipos de la misma ciudad con nombre muy parecido: el corto tiene que distinguirlos.
  'C.D.I. de la Amistad': 'C.D.I. Amistad',
  'C.D.I. de la Amistad Deltacinco': 'C.D.I. Amistad',
  'Salamanca C.F. UDS': 'Salamanca CF',
  'Unionistas de Salamanca C.F.': 'Unionistas',
  // David pidió expresamente «Unión Deportiva Santa Marta → Santa Marta»; el nombre publicado
  // añade «de Tormes» y los filiales llevan letra.
  'U.D. SANTA MARTA': 'Santa Marta',
  'U.D. SANTA MARTA DE TORMES': 'Santa Marta',
  'U.D. Santa Marta de Tormes': 'Santa Marta',
  'U.D. Santa Marta de Tormes "B"': 'Santa Marta B',
  'U.D. Santa Marta de Tormes "C"': 'Santa Marta C',
  'U.D. Santa Marta de Tormes "D"': 'Santa Marta D',
  'U.D. Santa Marta de Tormes "E"': 'Santa Marta E',
  // Nombres de club con artículo o con patrocinador que la regla no puede separar con seguridad.
  'C.D. Juventud del Círculo Católico': 'Círculo Católico',
  'C.D. Juventud del Circulo Católico': 'Círculo Católico',
  'C.D. Amor de Dios de Zamora': 'Amor de Dios',
  'C.D. Casa de Asturias en León': 'Casa de Asturias',
  'C.D. Trabajadores de Bridgestone': 'Bridgestone',
  'Sporting Nava de La Asunción': 'Sporting Nava',
  'Sporting Nava de La Asuncion': 'Sporting Nava',
  'Sporting Garrido de Salamanca': 'Sporting Garrido',
  'C.D.F. Santovenia de La Valdoncina': 'Santovenia',
  'C.D. San Roque Carbajosa de La Sagrada': 'San Roque',
  'Real Aero Club de León': 'R. Aero Club León',
  // Fútbol sala con patrocinador dentro del nombre: el corto es el club, no la marca.
  'C.D.I. Villaquilambre Futsal': 'Villaquilambre',
  'C.D. Juventud Villaquilambre': 'Villaquilambre',
  'C.D. Tres Columnas': 'Tres Columnas',
  'C.F.S. La Bañeza': 'La Bañeza',
  'Trepalio León Sala': 'Trepalio León',
  'C.D. Unión Arroyo': 'Unión Arroyo',
  'C.D. San Cristóbal de Segovia': 'San Cristóbal',
  'F.S. Salamanca': 'Salamanca',
  'C.D. Inter Sala': 'Inter Sala',
  'C.D. Viveros Herol Zarzuela del Pinar F.S.': 'Zarzuela del Pinar',
  'C.D. Zarzuela del Pinar F.S.': 'Zarzuela del Pinar',
  'C.D. Salatormes': 'Salatormes',
  'C.D. Arroyo F5': 'Arroyo',
  'C.D. Legio Sala': 'Legio Sala',
  'F.S. Cuéllar': 'Cuéllar',
  'C.D. Segosala': 'Segosala',
  'C.D. Tierra Castellana': 'Tierra Castellana',
  'Atlético Ciudad de Salamanca': 'Atlético Salamanca',
  'Atlético F. Ciudad de Salamanca': 'Atlético Salamanca',
  'C.F.S. Ciudad de Toro': 'Ciudad de Toro',
  'C.D. Los Leones de Vitigudino': 'Leones de Vitigudino',
  'Atlético Aranda 1503': 'Atlético Aranda',
  'PERITACIONES MINA VILLAQUILAMBRE FUTSAL': 'Villaquilambre',
  'Burgos International Football': 'Burgos International',
  'C.D. Zamora Amigos del Duero': 'Zamora Amigos del Duero',
  'Atlético F. Ciudad de Salamanca': 'Atlético Salamanca',
  'Atlético de Laguna Lince': 'Atlético Laguna',
  'Gimnástica Segoviana': 'Gimnástica Segoviana',
};


/** Quita las comillas y los signos de puntuación que sobran en los extremos de un token. */
function limpiaToken(token) {
  return token.replace(/^[\s,;:"'“”‘’()[\]+*·-]+|[\s,;:"'“”‘’()[\]+*·-]+$/g, '');
}

/** Letra de equipo filial: `"B"`, `'B'` o `(B)`. Devuelve la letra y el nombre sin ese trozo. */
function extraeLetra(nombre) {
  const conComillas = /["“”'‘’]\s*([A-E])\s*["“”'‘’]/.exec(nombre);
  if (conComillas) return { letra: conComillas[1], resto: nombre.replace(conComillas[0], ' ') };
  const conParentesis = /\(\s*([A-E])\s*\)/.exec(nombre);
  if (conParentesis) return { letra: conParentesis[1], resto: nombre.replace(conParentesis[0], ' ') };
  // «A.D. Mojados B», «Arandina C.F. B»: una letra suelta al final, nunca la última palabra del nombre.
  const suelta = /\s([A-E])$/.exec(nombre);
  if (suelta) return { letra: suelta[1], resto: nombre.slice(0, suelta.index) };
  return { letra: null, resto: nombre };
}

/**
 * Nombre corto derivado del nombre publicado.
 *
 * Devuelve `{ nombreCorto, confianza }`. `confianza` baja si la regla ha tenido que recortar mucho o el
 * resultado no parece fiable; la página puede enseñar igualmente el nombre corto, pero el script marca
 * esos casos para revisarlos a mano.
 */
export function derivaNombreCorto(nombreEnFuente) {
  const original = String(nombreEnFuente ?? '').replace(/\s+/g, ' ').trim();
  if (original === '') return { nombreCorto: '', confianza: 0 };

  const { letra, resto } = extraeLetra(original);
  const femenino = /femenino/i.test(resto);
  const esReal = /^real\b/i.test(resto);

  // Un « - » separa el nombre del club del patrocinador en la mayoría de los nombres de fútbol sala
  // («Trepalio León Sala - Universidad de León»). Se queda el lado izquierdo, que es el nombre.
  const sinPatrocinador = resto.split(/\s+[-–—]\s+/)[0] ?? resto;

  // Sin puntos: «S.A.D.» → «SAD», «C.F.» → «CF», «C. y D.» → «C y D». El punto no aporta nada aquí.
  let tokens = sinPatrocinador
    .replace(/\./g, '')
    .replace(/["“”'‘’()[\],]/g, ' ')
    .split(/\s+/)
    .map(limpiaToken)
    .filter((t) => t !== '');

  // «Real» es un tratamiento, no una forma legal: se conserva abreviado.
  if (esReal) {
    tokens.shift();
  }

  const teniaFutbol = /club\s+de\s+f[uú]tbol/i.test(resto) || tokens.some((t) => t.toUpperCase() === 'CF');
  let quitoSigla = false;
  // Frases legales completas (varias palabras), de más larga a más corta. Se comparan sin tildes:
  // «Unión» y «Fútbol» tienen que casar con «union» y «futbol».
  const sinTildes = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  for (const frase of FRASES_LEGALES) {
    for (let i = 0; i <= tokens.length - frase.length; i += 1) {
      const trozo = tokens.slice(i, i + frase.length).map(sinTildes);
      if (trozo.every((t, j) => t === frase[j])) {
        tokens.splice(i, frase.length);
        i -= 1;
      }
    }
  }

  // Marca de modalidad («F.S.», «Futsal», «F5», «Sala»): lo que viene detrás suele ser el patrocinador.
  // Si la marca abre el nombre («F.S. Salamanca Mirat Fertilizantes»), se quita y se sigue con el resto.
  // Y si delante sólo hay siglas («C.D. F.S. La Cisterniga»), no se corta: se quita la marca y se
  // conserva el nombre, que es lo único que hay.
  const modalidad = tokens.findIndex((t) => MARCAS_DE_MODALIDAD.has(t.toLocaleUpperCase('es')));
  if (modalidad === 0) {
    tokens.shift();
  } else if (modalidad > 0) {
    const delante = tokens.slice(0, modalidad);
    const hayNombreDelante = delante.some((t) => !SIGLAS_LEGALES.has(t.toLocaleUpperCase('es')));
    tokens = hayNombreDelante ? delante : tokens.slice(modalidad + 1);
  }

  // Siglas sueltas y «femenino».
  tokens = tokens.filter((token) => {
    const mayus = token.toLocaleUpperCase('es');
    if (SIGLAS_LEGALES.has(mayus)) {
      quitoSigla = true;
      return false;
    }
    if (/^femenino$/i.test(token)) return false;
    return true;
  });

  // Conectores al principio («de la Amistad» → «Amistad»). Un artículo en mayúscula forma parte del
  // nombre del pueblo («La Bañeza», «El Barco»); en minúscula es el artículo del nombre común.
  while (tokens.length > 0) {
    const primero = tokens[0];
    const minus = primero.toLocaleLowerCase('es');
    const esConector =
      minus === 'de' || minus === 'del' || minus === 'y' || minus === 'e'
      || ((minus === 'la' || minus === 'el' || minus === 'los' || minus === 'las') && primero === minus);
    if (!esConector) break;
    tokens.shift();
  }

  let nombreCorto = tokens.join(' ').replace(/\s+/g, ' ').trim();

  // Un nombre que era sólo forma legal no se sustituye por nada: se deja el completo, con aviso.
  if (nombreCorto === '') {
    return { nombreCorto: original, confianza: 0.2 };
  }

  // «Salamanca Club de Fútbol UDS»: al quitar «Club de Fútbol» y la sigla queda sólo la ciudad. Ese
  // «CF» dice «es el club de fútbol de Salamanca», y es la diferencia con el nombre de la ciudad.
  if (teniaFutbol && quitoSigla && nombreCorto.split(' ').length === 1) {
    nombreCorto = `${nombreCorto} CF`;
  }

  if (esReal) nombreCorto = `R. ${nombreCorto}`;
  if (femenino) nombreCorto = `${nombreCorto} Femenino`;
  if (letra) nombreCorto = `${nombreCorto} ${letra}`;

  // Confianza: la regla es fiable cuando ha quitado formas legales conocidas y el resultado sigue
  // teniendo pinta de nombre. Baja si no cambió nada (puede ser un nombre raro), si quedó muy largo
  // (probable patrocinador dentro del nombre) o si no se reconoció ninguna forma legal.
  let confianza = 0.9;
  const cambio = nombreCorto !== original;
  if (!cambio) confianza = 0.8;
  if (nombreCorto.length > 28) confianza = Math.min(confianza, 0.6);
  if (nombreCorto.length > 40) confianza = 0.4;
  if (nombreCorto.split(' ').length > 5) confianza = Math.min(confianza, 0.5);
  return { nombreCorto, confianza };
}

/**
 * Nombre corto definitivo para un equipo: primero la decisión manual y, si no hay, la regla.
 *
 * La decisión manual se busca por el nombre SIN la letra del filial ni «Femenino», y admite que el
 * nombre publicado añada un patrocinador detrás («C.D.I. Villaquilambre Futsal - CAJA RURAL» empieza
 * por la decisión «C.D.I. Villaquilambre Futsal»). La letra y «Femenino» se vuelven a poner después,
 * para que el filial B no pierda su B.
 */
export function nombreCortoParaEquipo(nombreEnFuente) {
  const original = String(nombreEnFuente ?? '').replace(/\s+/g, ' ').trim();
  if (original === '') return { nombreCorto: original, metodo: 'regla', confianza: 0 };

  const { letra, resto } = extraeLetra(original);
  const femenino = /femenino/i.test(resto);
  const base = resto.replace(/femenino/i, ' ').replace(/\s+/g, ' ').trim();
  const normaliza = (texto) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  const baseNorm = normaliza(base);

  const decision = Object.entries(DECISIONES_MANUALES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([clave]) => {
      const claveNorm = normaliza(clave);
      return baseNorm === claveNorm
        || baseNorm.startsWith(`${claveNorm} `)
        || baseNorm.startsWith(`${claveNorm}-`)
        || baseNorm.startsWith(`${claveNorm} -`);
    });
  if (decision) {
    let nombreCorto = decision[1];
    if (femenino && !/femenino/i.test(nombreCorto)) nombreCorto = `${nombreCorto} Femenino`;
    if (letra) nombreCorto = `${nombreCorto} ${letra}`;
    return { nombreCorto, metodo: 'manual', confianza: 1 };
  }

  const { nombreCorto, confianza } = derivaNombreCorto(original);
  if (nombreCorto === '') return { nombreCorto: original, metodo: 'regla', confianza: 0 };
  return { nombreCorto, metodo: 'regla', confianza };
}
