/*
 * ── COMPROBACIÓN DE CODIFICACIÓN: QUE UN TEXTO MAL CODIFICADO FALLE, NO QUE SE LEA Y YA ESTÁ ─────────────────
 *
 * El daño que se persigue no es un error de base de datos: es el SILENCIO. Una cadena doblemente codificada
 * («MÃ¡laga» en vez de «Málaga») es UTF-8 perfectamente válido, entra sin queja en PostgreSQL, se publica y se
 * lee mal en la web. No hay excepción que lo delate; sólo se ve mirando. Esto es esa mirada, hecha programa.
 *
 * Tres familias de daño, cada una con su nombre:
 *
 *   1. **doble codificación** — UTF-8 leído como Latin-1 y vuelto a guardar: «Ã¡» por «á», «Ã©» por «é», «Ã±» por
 *      «ñ», «Â» delante de los signos de dos bytes («Â«», «Â»», «Â ») y «â€”» para la raya. Es el más frecuente y
 *      el que más caro sale, porque no falla nada.
 *   2. **carácter de reemplazo U+FFFD** — algo se perdió y ya no se puede reconstruir; es un dato que falta
 *      disfrazado de letra.
 *   3. **UTF-8 inválido** — bytes que no forman UTF-8. Esto sólo se puede ver sobre BYTES: si ya se ha decodificado
 *      el daño está hecho y lo que hay es U+FFFD. Por eso el módulo recibe bytes y no texto cuando comprueba
 *      ficheros.
 *
 * Y un cuarto modo, el de los `.ps1`: **sólo ASCII**. PowerShell 5.1 lee un .ps1 UTF-8 **sin BOM** como ANSI, y
 * una raya (E2 80 94) se convierte en una comilla tipográfica que corta la cadena y rompe el análisis del fichero
 * (pasó el 24/09/2026 con `importar-temporada.ps1`). Los guiones del proyecto que van a correr en PowerShell 5.1
 * se comprueban con este modo.
 *
 * ── DÓNDE SE COMPRUEBA ─────────────────────────────────────────────────────────────────────────────────────
 *
 *   · **el canónico**: columnas de nombre de club, equipo, competición, persona, provincia y municipio. La consulta
 *     filtra en SQL (para no traerse 2,5 millones de personas a memoria) y aquí se vuelve a mirar lo que sale, con
 *     las mismas funciones puras. PostgreSQL garantiza UTF-8 válido, así que en la base sólo caben las familias 1,
 *     2 y los controles C1; el UTF-8 inválido se comprueba en los ficheros.
 *   · **ficheros de texto** que elige el ciclo: su propio .ps1 (en ASCII), su registro y su último resumen, y el
 *     documento del pipeline. Un fichero que no existe se OMITE: el primer día el registro no está y eso no puede
 *     tumbar el ciclo.
 *
 * ── CONTRATO ───────────────────────────────────────────────────────────────────────────────────────────────
 *
 * No hay «avisos»: un solo problema es fallo (`ok: false`) y el CLI sale con 1. Va dentro del ciclo diario, así que
 * tiene que poder fallar de verdad. Si el entorno falla (Docker apagado, psql que no contesta) sale con 2, que es
 * otra cosa: no sabemos si hay corrupción.
 *
 * Uso:
 *   node scripts/lib/codificacion.mjs --bd                    # sólo el canónico
 *   node scripts/lib/codificacion.mjs --ficheros a.txt,b.md   # sólo ficheros
 *   node scripts/lib/codificacion.mjs --bd --ficheros ...     # las dos cosas (lo que hace el ciclo diario)
 *   node scripts/lib/codificacion.mjs --json                  # resultado legible por máquina
 *
 * Los mensajes que imprime van en ASCII a propósito: el registro del ciclo diario lo escribe PowerShell 5.1 y no
 * queremos que la comprobación de codificación meta ella misma un carácter raro en el log.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Los nombres de los problemas. Son estables: el ciclo y las pruebas se apoyan en ellos. */
export const TIPOS = Object.freeze({
  DOBLE: 'doble-codificacion',
  REEMPLAZO: 'reemplazo-utf8',
  CONTROL: 'control-c1',
  UTF8_INVALIDO: 'utf8-invalido',
  NO_ASCII: 'no-ascii',
});

/*
 * ── LOS PATRONES, Y POR QUÉ NO SE MARCA «Ã» NI «Â» A SECAS ─────────────────────────────────────────────────
 *
 * Los marcadores fuertes, con el caso que cubre cada uno:
 *
 *   · «Ã» + byte alto (0x80-0xFF) → á, é, í, ó, ú, ñ. El segundo byte de cualquier letra acentuada cae ahí;
 *   · «Ã» + «?» → «Á» (C3 81), «À» (C3 80)… perdieron su segundo byte (un control C1) y alguien lo sustituyó por
 *     «?»: «SÃ?NCHEZ» por «SÁNCHEZ». Es corrupción con pérdida y se ve igual de claro;
 *   · «Â» + byte alto (0x80-0xBF) → «Â«», «Â»», «Â » (el espacio duro): los signos de dos bytes empiezan por C2;
 *   · «â€» → la raya, las comillas tipográficas y el euro (empiezan por E2 80);
 *   · U+FFFD (carácter de reemplazo) y los controles C1 sueltos.
 *
 * Lo que NO se marca, medido el 10/11/2026 sobre el canónico real: «Ã» y «Â» DELANTE DE UNA LETRA ASCII. No es un
 * descuido. «JOÃO», «MAGALHÃES», «QUINTÃO» son portugués BIEN escrito (Ã + vocal ASCII), y «CÂMARA» también lleva
 * una Â que no es de nadie. En la base hay 43 nombres con alguno de esos caracteres y casi todos son portugueses
 * legítimos: marcar la letra suelta convertiría el ciclo diario en un aviso permanente que nadie miraría —que es
 * justo lo contrario de lo que se pide—. La marca fuerte (byte alto detrás) no tiene ese problema.
 *
 * Se buscan TODAS las apariciones, no la primera: un informe que dice «1 problema» y esconde 200 no sirve.
 */
const PATRONES = [
  { tipo: TIPOS.DOBLE, expresion: /\u00C3[\u0080-\u00FF]/g, detalle: 'UTF-8 leido como Latin-1 (chr195 + byte alto)' },
  { tipo: TIPOS.DOBLE, expresion: /\u00C3\?/g, detalle: 'chr195 + "?": el byte de continuacion se perdio y se sustituyo por "?"' },
  { tipo: TIPOS.DOBLE, expresion: /\u00C2[\u0080-\u00BF]/g, detalle: 'UTF-8 leido como Latin-1 (chr194 + byte alto)' },
  { tipo: TIPOS.DOBLE, expresion: /\u00C2\?/g, detalle: 'chr194 + "?": el byte de continuacion se perdio y se sustituyo por "?"' },
  { tipo: TIPOS.DOBLE, expresion: /\u00E2\u20AC/g, detalle: 'UTF-8 leido como Latin-1 (raya, comillas tipograficas, euro)' },
  { tipo: TIPOS.REEMPLAZO, expresion: /\uFFFD/g, detalle: 'caracter de reemplazo U+FFFD (dato perdido)' },
  { tipo: TIPOS.CONTROL, expresion: /[\u0080-\u009F]/g, detalle: 'control C1 (U+0080-U+009F): resto de una conversion mal hecha' },
];

/**
 * Deja un texto en ASCII seguro: cualquier carácter por encima de 127 se escribe como `\uXXXX`.
 *
 * ── POR QUÉ HACE FALTA (medido el 10/11/2026) ───────────────────────────────────────────────────────────────
 *
 * Los avisos de esta comprobación se escriben en el registro del ciclo diario, y el registro es uno de los ficheros
 * que la comprobación revisa. Si un aviso copiara la cadena corrupta tal cual, el registro quedaría contaminado y al
 * día siguiente el ciclo se acusaría a sí mismo: un fallo diario causado por el aviso del fallo. Con esto, el
 * detalle sigue siendo exacto (`\u00c3\u00a1` se lee sin ambigüedad) pero el registro queda limpio.
 */
export function asciiSeguro(texto) {
  return String(texto ?? '').replace(/[^\u0000-\u007F]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Una muestra corta y en una línea, para que el aviso se pueda leer (y pegar en un informe). Siempre ASCII. */
function muestra(cadena, indice, longitud = 24) {
  const desde = Math.max(0, indice - 8);
  const trozo = cadena.slice(desde, indice + longitud);
  /* eslint-disable-next-line no-control-regex */
  return JSON.stringify(asciiSeguro(trozo.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)));
}

/** El número de línea (1-based) de una posición del texto: para poder abrir el fichero y verlo. */
function lineaDe(texto, indice) {
  let linea = 1;
  for (let i = 0; i < indice && i < texto.length; i += 1) if (texto[i] === '\n') linea += 1;
  return linea;
}

/**
 * Analiza TEXTO ya decodificado. Funcion pura: no lee ficheros ni toca la base.
 * Devuelve `{ ok, problemas: [{ tipo, detalle, muestra, indice }] }`.
 */
export function analizaTexto(texto) {
  const cadena = texto === null || texto === undefined ? '' : String(texto);
  const problemas = [];
  for (const patron of PATRONES) {
    patron.expresion.lastIndex = 0;
    let coincidencia = patron.expresion.exec(cadena);
    while (coincidencia !== null) {
      problemas.push({
        tipo: patron.tipo,
        detalle: patron.detalle,
        indice: coincidencia.index,
        muestra: muestra(cadena, coincidencia.index),
      });
      // Si el patrón pudiera casar la cadena vacía, esto sería un bucle infinito; no es el caso, pero se avanza
      // explícitamente porque este código va a correr todos los días sobre millones de cadenas.
      patron.expresion.lastIndex = coincidencia.index + Math.max(1, coincidencia[0].length);
      coincidencia = patron.expresion.exec(cadena);
    }
  }
  return { ok: problemas.length === 0, problemas };
}

/** ¿Son estos bytes UTF-8 válido? Se decodifica en modo estricto: si algo no cuadra, lanza y aquí es `false`. */
export function esUTF8Valido(bytes) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** ¿Todo el texto es ASCII (0x00-0x7F)? Es la regla de los .ps1 que corren en PowerShell 5.1. */
export function esTextoASCII(texto) {
  return /^[\u0000-\u007F]*$/.test(String(texto ?? ''));
}

/**
 * Analiza BYTES: primero si son UTF-8 válido (eso sólo se ve en los bytes) y después el texto que salga.
 * Un BOM UTF-8 es válido y no se marca.
 */
export function analizaBytes(bytes) {
  const datos = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (!esUTF8Valido(datos)) {
    return {
      ok: false,
      problemas: [{
        tipo: TIPOS.UTF8_INVALIDO,
        detalle: 'los bytes no son UTF-8 valido (secuencia cortada o byte suelto)',
        indice: null,
        muestra: null,
      }],
    };
  }
  return analizaTexto(new TextDecoder('utf-8').decode(datos));
}

/**
 * Analiza un fichero. Opciones:
 *   · `soloASCII` — exige además que todos los bytes sean ASCII (para los .ps1 de PowerShell 5.1).
 * Si el fichero no existe devuelve `{ existe: false, omitido: true, ok: true }`: un registro que todavía no se ha
 * creado no es corrupción.
 */
export function analizaFichero(ruta, { soloASCII = false } = {}) {
  const absoluta = resolve(String(ruta));
  if (!existsSync(absoluta)) return { ruta: absoluta, existe: false, omitido: true, ok: true, bytes: 0, problemas: [] };
  let bytes;
  try {
    bytes = readFileSync(absoluta);
  } catch (error) {
    // No poder LEER un fichero que el ciclo dice comprobar sí es un problema: no sabemos qué hay dentro.
    return {
      ruta: absoluta,
      existe: true,
      omitido: false,
      ok: false,
      bytes: 0,
      problemas: [{ tipo: TIPOS.UTF8_INVALIDO, detalle: `no se pudo leer: ${error.message}`, indice: null, muestra: null }],
    };
  }
  const problemas = [];
  if (soloASCII && !esTextoASCII(bytes.toString('latin1'))) {
    // Se localiza la primera línea con un byte alto para que el aviso lleve a algún sitio.
    const texto = bytes.toString('latin1');
    const indice = texto.search(/[\u0080-\u00FF]/);
    problemas.push({
      tipo: TIPOS.NO_ASCII,
      detalle: 'tiene bytes por encima de 127 y PowerShell 5.1 lo leera como ANSI',
      indice,
      linea: indice < 0 ? null : lineaDe(texto, indice),
      muestra: indice < 0 ? null : muestra(texto, indice),
    });
  }
  const analisis = analizaBytes(bytes);
  for (const problema of analisis.problemas) {
    // La línea del problema: el índice es del texto decodificado, así que se calcula sobre él.
    const texto = new TextDecoder('utf-8').decode(bytes);
    problemas.push({ ...problema, linea: problema.indice === null ? null : lineaDe(texto, problema.indice) });
  }
  return { ruta: absoluta, existe: true, omitido: false, ok: problemas.length === 0, bytes: bytes.length, problemas };
}

/** Analiza una lista de ficheros. Cada elemento es una ruta o `{ ruta, soloASCII }`. */
export function analizaFicheros(lista, opciones = {}) {
  const ficheros = [];
  for (const elemento of lista ?? []) {
    const objeto = typeof elemento === 'string' ? { ruta: elemento } : elemento;
    if (!objeto || !objeto.ruta) continue;
    ficheros.push(analizaFichero(objeto.ruta, { soloASCII: Boolean(objeto.soloASCII), ...opciones }));
  }
  return { ok: ficheros.every((f) => f.ok), ficheros };
}

/*
 * ── LAS COLUMNAS DE NOMBRE DEL CANÓNICO ─────────────────────────────────────────────────────────────────────
 *
 * Las que deciden si un aficionado lee «Málaga» o «MÃ¡laga» en la web: club, equipo, competición, persona,
 * provincia y municipio. Se comprueban también los nombres de federación y de grupo (competición), que se publican
 * igual. La lista está aquí y no en el ciclo porque esto es conocimiento del esquema, no de la operación.
 */
/**
 * Cada columna de nombre, con la condición que la limita a Castilla y León.
 *
 * ── POR QUÉ EL ALCANCE ES CASTILLA Y LEÓN, Y NO TODA LA BASE ─────────────────────────────────────────────────
 *
 * La fase es CyL (`--federaciones federacion`) y la comprobación tiene que poder estar en VERDE para servir de
 * alarma: si saliera roja todos los días por daños viejos de otras federaciones, dejaría de mirarse. Medido el
 * 10/11/2026 con `--alcance global`: hay corrupción real fuera de CyL (nombres tipo «SÃ?NCHEZ», «MARTÃ?N» en
 * Madrid, Extremadura y Cataluña, con la C1 sustituida por «?»). Eso es un problema de esos datos, se apunta y se
 * arregla aparte; no es excusa para dejar ciego el ciclo de CyL. Para verlo entero: `--alcance global`.
 *
 * `cyl` es la condición SQL (sobre el alias `t`) que limita esa tabla a Castilla y León. En persona no hay columna
 * de federación: se usa su identidad de origen (`person_source_identity`), que es donde dice de dónde viene.
 */
export const COLUMNAS_DE_NOMBRE = Object.freeze([
  { tabla: 'core.club', columna: 'nombre_canonico', cyl: 't.federation_id = (select id from core.federation where codigo = \'castilla-leon\')' },
  { tabla: 'core.club', columna: 'municipio', cyl: 't.federation_id = (select id from core.federation where codigo = \'castilla-leon\')' },
  { tabla: 'core.club', columna: 'provincia', cyl: 't.federation_id = (select id from core.federation where codigo = \'castilla-leon\')' },
  { tabla: 'core.team_season', columna: 'nombre', cyl: 'exists (select 1 from core.club c where c.id = t.club_id and c.federation_id = (select id from core.federation where codigo = \'castilla-leon\'))' },
  { tabla: 'core.competition_edition', columna: 'nombre_publicado', cyl: 't.federation_id = (select id from core.federation where codigo = \'castilla-leon\')' },
  { tabla: 'core.competition_edition', columna: 'provincia', cyl: 't.federation_id = (select id from core.federation where codigo = \'castilla-leon\')' },
  { tabla: 'core.phase_group', columna: 'nombre', cyl: 'exists (select 1 from core.competition_edition ce where ce.id = t.competition_edition_id and ce.federation_id = (select id from core.federation where codigo = \'castilla-leon\'))' },
  { tabla: 'core.person', columna: 'nombre_mostrado', cyl: 'exists (select 1 from core.person_source_identity psi where psi.person_id = t.id and psi.federation_id = (select id from core.federation where codigo = \'castilla-leon\'))' },
  { tabla: 'core.venue', columna: 'nombre', cyl: 't.federation_id = (select id from core.federation where codigo = \'castilla-leon\')' },
  { tabla: 'core.venue', columna: 'municipio', cyl: 't.federation_id = (select id from core.federation where codigo = \'castilla-leon\')' },
  { tabla: 'core.federation', columna: 'nombre', cyl: 't.codigo = \'castilla-leon\'' },
]);

/**
 * SQL que devuelve SÓLO las filas sospechosas de las columnas de nombre. Se filtra en SQL a propósito: `person`
 * tiene 2,5 millones de filas y traérselas todas a Node para mirarlas costaría más que todo el ciclo diario.
 *
 * El SQL es ASCII puro (nada de «Ã» escrita en el texto): las marcas van con `chr()`. Así el fichero SQL que se le
 * pasa a psql por la entrada estándar no depende de la codificación del cliente.
 *
 * El filtro de SQL es GRUESO a propósito: devuelve también lo que el detector fino descartará (por ejemplo «JOÃO»,
 * que es portugués bien escrito). La autoridad es `analizaTexto`; esto sólo evita traerse la tabla entera.
 */
export function sqlDeNombresSospechosos(columnas = COLUMNAS_DE_NOMBRE, { limite = 200, alcance = 'cyl' } = {}) {
  const sospecha = (columna) => [
    `position(chr(195) in ${columna}) > 0`,
    `position(chr(194) in ${columna}) > 0`,
    `position(chr(65533) in ${columna}) > 0`,
    `(${columna} ~ ('[' || chr(128) || '-' || chr(159) || ']'))`,
    `(position(chr(226) in ${columna}) > 0 and position(chr(8364) in ${columna}) > 0)`,
  ].join(' or ');
  const partes = columnas.map(({ tabla, columna, cyl }) => {
    const recorte = alcance === 'global' || !cyl ? 'true' : cyl;
    return `
  select '${tabla}' as tabla, '${columna}' as columna, t.id::text as id, coalesce(t.${columna}, '') as valor
    from ${tabla} t
   where (${sospecha(`t.${columna}`)}) and (${recorte})`;
  });
  return `${partes.join('\n  union all')}\n  limit ${Number(limite)};\n`;
}

/** Los parámetros de conexión: el contenedor y la base canónicos del PC, sobreescribibles por entorno. */
export function destinoDeConsulta() {
  return {
    contenedor: process.env.FACYLF_CONTENEDOR_POSTGRES ?? 'facylf-postgres',
    usuario: process.env.FACYLF_PSQL_USUARIO ?? 'facylf_admin',
    base: process.env.FACYLF_PSQL_BASE ?? 'facylf',
  };
}

/**
 * Lanza el SQL contra el canónico y devuelve las filas como objetos `{ tabla, columna, id, valor }`.
 * Reutiliza la receta del proyecto: `psql` dentro del contenedor, con el SQL por la entrada estándar.
 * Si Docker o psql fallan, LANZA: eso no es «no hay corrupción», es «no se ha podido comprobar».
 */
export function consultaCanonico(sql, destino = destinoDeConsulta()) {
  const salida = execFileSync('docker', [
    'exec', '-i', destino.contenedor,
    'psql', '-U', destino.usuario, '-d', destino.base,
    '-X', '-q', '-t', '-A', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-f', '-',
  ], { input: sql, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, windowsHide: true });
  const filas = [];
  for (const linea of salida.split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const campos = linea.split('\t');
    if (campos.length < 4) continue;
    filas.push({ tabla: campos[0], columna: campos[1], id: campos[2], valor: campos.slice(3).join('\t') });
  }
  return filas;
}

/**
 * Comprueba las columnas de nombre del canónico. La consulta ya ha filtrado; aquí se vuelve a analizar cada valor
 * con las funciones puras del módulo, para que el veredicto y el detalle salgan del MISMO criterio que las pruebas.
 *
 * Las filas que el filtro SQL trae pero que el detector fino NO reconoce son BENIGNAS (portugués bien escrito, por
 * ejemplo) y se cuentan aparte: no son un fallo. `consulta` se puede inyectar para probar sin Docker.
 */
export function compruebaCanonico({ consulta = consultaCanonico, columnas = COLUMNAS_DE_NOMBRE, alcance = 'cyl' } = {}) {
  const filas = consulta(sqlDeNombresSospechosos(columnas, { alcance }));
  const problemas = [];
  let benignas = 0;
  for (const fila of filas) {
    const analisis = analizaTexto(fila.valor);
    if (analisis.ok) {
      benignas += 1;
      continue;
    }
    for (const problema of analisis.problemas) {
      problemas.push({ ...problema, tabla: fila.tabla, columna: fila.columna, id: fila.id, valor: fila.valor.slice(0, 80) });
    }
  }
  return { ok: problemas.length === 0, filas: filas.length, benignas, alcance, columnas: columnas.length, problemas };
}

/** Reúne los veredictos parciales en uno. `problemas` es el total, no una lista de listas. */
export function resumenDeComprobacion({ bd = null, ficheros = null, cuando = new Date().toISOString() } = {}) {
  const totalBd = bd ? bd.problemas.length : 0;
  const totalFicheros = ficheros ? ficheros.ficheros.reduce((suma, f) => suma + f.problemas.length, 0) : 0;
  return {
    ok: (bd === null || bd.ok) && (ficheros === null || ficheros.ok),
    cuando,
    problemas: totalBd + totalFicheros,
    bd: bd === null ? null : { ok: bd.ok, filas: bd.filas, benignas: bd.benignas ?? 0, alcance: bd.alcance ?? 'cyl', columnas: bd.columnas, problemas: totalBd },
    ficheros: ficheros === null ? null : {
      ok: ficheros.ok,
      total: ficheros.ficheros.length,
      comprobados: ficheros.ficheros.filter((f) => f.existe).length,
      omitidos: ficheros.ficheros.filter((f) => f.omitido).length,
      problemas: totalFicheros,
    },
  };
}

/**
 * Líneas de informe en ASCII puro, una por hecho. Es lo que el ciclo diario escribe en su registro.
 *
 * ASCII PURO, no sólo «UTF-8 válido»: el registro del ciclo es uno de los ficheros que esta misma comprobación
 * revisa, así que si el aviso metiera un carácter raro en el registro, al día siguiente el ciclo fallaría por su
 * propio informe. El separador es ` | ` y no un punto medio por eso mismo.
 */
export function lineasDeComprobacion(resumen) {
  const lineas = [];
  if (resumen.bd) {
    lineas.push(`codificacion base (${resumen.bd.alcance}): ${resumen.bd.ok ? 'OK' : 'FALLO'} | ${resumen.bd.columnas} columnas de nombre | ${resumen.bd.filas} filas marcadas por el filtro (${resumen.bd.benignas} benignas) | ${resumen.bd.problemas} problemas`);
  }
  if (resumen.ficheros) {
    lineas.push(`codificacion ficheros: ${resumen.ficheros.ok ? 'OK' : 'FALLO'} | ${resumen.ficheros.comprobados}/${resumen.ficheros.total} comprobados (${resumen.ficheros.omitidos} omitidos) | ${resumen.ficheros.problemas} problemas`);
  }
  return lineas;
}

/** El detalle de cada problema, en ASCII y en una línea, para el registro y para la consola. */
export function lineasDeProblemas(resumen, bd, ficheros) {
  const lineas = [];
  if (bd) {
    for (const p of bd.problemas.slice(0, 50)) {
      const donde = p.tabla ? `${p.tabla}.${p.columna} id=${p.id}` : 'base';
      lineas.push(`[FALLO] ${p.tipo} | ${donde} | ${asciiSeguro(p.detalle)} | ${asciiSeguro(p.valor ?? p.muestra ?? '')}`);
    }
    if (bd.problemas.length > 50) lineas.push(`[FALLO] ... y ${bd.problemas.length - 50} mas (se corta a 50)`);
  }
  if (ficheros) {
    for (const f of ficheros.ficheros) {
      for (const p of f.problemas.slice(0, 20)) {
        const donde = p.linea === null ? f.ruta : `${f.ruta}:${p.linea}`;
        lineas.push(`[FALLO] ${p.tipo} | ${asciiSeguro(donde)} | ${asciiSeguro(p.detalle)} | ${p.muestra ?? ''}`);
      }
    }
  }
  return lineas;
}

/* ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Los ficheros que comprueba el ciclo diario si no se le pasa otra lista.
 *
 * El documento `PIPELINE-DIARIO.md` NO está aquí a propósito: enseña ejemplos de cadenas corruptas (los «Ã¡», «Ã©»,
 * «Â» del apartado de la comprobación) y esos ejemplos son corrupción literal dentro del fichero. Comprobarlo daría
 * un fallo diario por documentar el fallo. Quien quiera comprobarlo, lo pide con `--ficheros`.
 */
export const FICHEROS_POR_DEFECTO = Object.freeze([
  { ruta: join(RAIZ, 'scripts', 'ciclo-diario-cyl.ps1'), soloASCII: true },
  { ruta: join(RAIZ, 'estado', 'ciclo-diario-ultimo.json') },
  { ruta: join(RAIZ, 'estado', 'ciclo-diario.log') },
]);

function main(argumentos) {
  const pideBd = argumentos.includes('--bd');
  const pideJson = argumentos.includes('--json');
  const pideAyuda = argumentos.includes('--ayuda') || argumentos.includes('-h');
  const posicion = argumentos.indexOf('--ficheros');
  const posicionAscii = argumentos.indexOf('--ascii');
  const posicionBase = argumentos.indexOf('--base');
  const posicionAlcance = argumentos.indexOf('--alcance');
  const alcance = posicionAlcance >= 0 && argumentos[posicionAlcance + 1] === 'global' ? 'global' : 'cyl';

  if (pideAyuda) {
    console.log('uso: node scripts/lib/codificacion.mjs [--bd] [--alcance cyl|global] [--ficheros a,b] [--ascii a,b] [--json]');
    return 0;
  }

  const lista = (indice) => {
    if (indice < 0) return [];
    return String(argumentos[indice + 1] ?? '').split(',').map((r) => r.trim()).filter(Boolean);
  };
  const pedidos = lista(posicion).map((ruta) => ({ ruta }));
  const soloAscii = lista(posicionAscii).map((ruta) => ({ ruta, soloASCII: true }));
  /* Sin `--bd` ni `--ficheros` se comporta como el ciclo: la base y la lista por defecto. Con `--ficheros` se
   * comprueba SÓLO lo que piden, que es lo que hace la prueba y lo que permite ejecutarlo en cualquier máquina. */
  const haySeleccion = posicion >= 0 || posicionAscii >= 0;
  const rutas = haySeleccion ? [...pedidos, ...soloAscii] : [...FICHEROS_POR_DEFECTO];
  if (posicionBase >= 0) rutas.push({ ruta: argumentos[posicionBase + 1] });
  const quiereBd = pideBd || (!haySeleccion && !posicionBase);

  let bd = null;
  let ficheros = null;
  let errorDeEntorno = null;
  try {
    if (quiereBd) bd = compruebaCanonico({ alcance });
  } catch (error) {
    errorDeEntorno = error;
  }
  if (rutas.length > 0) ficheros = analizaFicheros(rutas);

  const resumen = resumenDeComprobacion({ bd: quiereBd && !errorDeEntorno ? bd : null, ficheros });
  if (pideJson) {
    console.log(JSON.stringify({ ...resumen, bd: errorDeEntorno ? { ok: null, error: errorDeEntorno.message } : resumen.bd }, null, 2));
  } else {
    for (const linea of lineasDeComprobacion(resumen)) console.log(linea);
    for (const linea of lineasDeProblemas(resumen, bd, ficheros)) console.log(linea);
    console.log(`codificacion: ${resumen.ok && !errorDeEntorno ? 'OK' : 'FALLO'} | ${resumen.problemas} problemas`);
  }
  if (errorDeEntorno) {
    console.error(`no se pudo comprobar la base: ${errorDeEntorno.message}`);
    return 2;
  }
  return resumen.ok ? 0 : 1;
}

// El CLI sólo corre si se ejecuta este fichero; al importarlo desde una prueba no se ejecuta nada.
const esEjecucionDirecta = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esEjecucionDirecta) process.exitCode = main(process.argv.slice(2));
