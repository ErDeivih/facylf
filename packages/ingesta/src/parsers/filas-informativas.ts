/**
 * Filas INFORMATIVAS de una jornada: el bloque de descanso que la fuente publica y que NO es un partido.
 *
 * ## El hecho, medido
 *
 * En una liga de número impar de equipos cada jornada deja a uno descansando, y el portal publica ese
 * bloque con la MISMA forma que un partido. Medido sobre las dieciocho colas (15/09/2026):
 *
 * - maqueta **clásica** (PNFG): el bloque es una tabla más, con **dos enlaces `NFG_VisEquipos`** — el
 *   criterio con el que `extraePartidos` decide que algo es un partido— y el lado del descanso **es un
 *   enlace de verdad a un equipo de verdad**, con su `Codigo_Equipo`:
 *
 *   ```html
 *   <a style="color:#000;" href="NFG_VisEquipos?cod_primaria=1000119&amp;Codigo_Equipo=4807245"> DESCANSA </a>
 *   ```
 *
 *   Es decir: la federación da de alta un equipo llamado «DESCANSA» y le asigna un código. Por eso no
 *   basta con «dos enlaces de equipo» para saber que una fila es un partido.
 *
 * - maqueta **nova** (Euskadi): el bloque lleva las dos celdas que busca `extraePartidosWidget`
 *   (`font_widgetL` y `font_widgetV`), el «visitante» es la palabra `Atsedena` («el descanso») y su
 *   escudo es un **placeholder genérico** (`escudo_sm_resultados_.jpg`), no un escudo de club.
 *
 * ## Por qué no vale una lista global de palabras
 *
 * El encargo lo prohíbe con razón: borrar cualquier nombre que contenga «descanso» se llevaría por delante
 * un club llamado así. Aquí la palabra se compara **entera** —el nombre normalizado tiene que SER la
 * palabra, no contenerla— y además cada adaptador declara **su** vocabulario, porque el portal de Euskadi
 * es bilingüe y publica `Descansa` y `Atsedena`.
 *
 * Y no basta la palabra: cada clase exige **evidencia corroborante** (ver `clasificaFilaDeDescanso`). Una
 * fila con la palabra en medio de un nombre de club no se clasifica: cae en `F` y no se toca.
 */

import { normalizaNombreEquipo, separaNombreYEstado } from './nova-equipos.js';

/** Maqueta de la página, que NO es lo mismo que el adaptador declarado de la federación. */
export type Maqueta = 'pnfg-clasica' | 'nova-widget' | 'fcf' | 'isquad' | 'desconocida';

/**
 * Vocabulario de descanso **declarado por cada maqueta**. Euskadi es un portal bilingüe y publica las dos
 * formas, así que la suya lleva las dos; las demás llevan la que se ha medido en su cola.
 */
export const VOCABULARIO_DESCANSO: Readonly<Record<Maqueta, readonly string[]>> = {
  'pnfg-clasica': ['descansa', 'descans'],
  'nova-widget': ['descansa', 'atsedena'],
  fcf: ['descansa'],
  isquad: ['descansa'],
  desconocida: [],
};

/**
 * ¿El literal es EXACTAMENTE una palabra de descanso de su maqueta?
 *
 * Se quitan primero los marcadores de estado, porque la fuente también los pega al descanso: medido,
 * `Descansa (Ganador)` aparece así en La Rioja. El nombre tiene que ser la palabra entera, nunca
 * contenerla: `C.D. DESCANSO` no es un descanso.
 */
export function esPalabraDeDescanso(literal: string, maqueta: Maqueta): boolean {
  const limpio = normalizaNombreEquipo(separaNombreYEstado(String(literal ?? '')).nombreEquipo);
  if (limpio === '') return false;
  return (VOCABULARIO_DESCANSO[maqueta] ?? []).includes(limpio);
}

/** ¿El literal lleva además un marcador de estado? `Descansa (Ganador)` sí. */
export function llevaMarcadorDeEstado(literal: string): boolean {
  return separaNombreYEstado(String(literal ?? '')).marcadoresEstado.length > 0;
}

/** Qué dice un acta sobre una fila que la cola tiene como bloque de descanso. */
export type VeredictoActaDescanso = 'descanso' | 'partido-real' | 'no-demuestra';

/**
 * ¿La pareja que publica el ACTA demuestra que ahí no hubo partido?
 *
 * La regla de retirada exigía «sin acta», y el acta es un buen criterio mientras no se pueda abrir: si no
 * existe, nadie ha documentado un partido en esa fila. Pero hay actas que sí existen y **nombran el
 * descanso**: medido en Euskadi, 12 de las 13 filas fantasma con acta tienen un acta cuya pareja es
 * `(equipo real, DESCANSA)` —la propia federación creó el acta del hueco—, y ninguna de las 13 nombra dos
 * equipos reales. Abrir el acta es lo que convierte «no se puede descartar sin abrirla» en un veredicto.
 *
 * Es deliberadamente CONSERVADOR en el único sentido que importa: `partido-real` (dos equipos reales) y
 * `no-demuestra` (acta sin pareja, ilegible o ausente) NO autorizan a borrar nada. Sólo `descanso` lo
 * hace, y sólo cuando el acta misma dice que uno de los dos lados es el descanso.
 *
 * El vocabulario que se prueba es el de TODAS las maquetas, no el de la cola: el nombre lo escribió la
 * fuente en su acta, no la cola. De más a menos, equivocarse aquí significa no retirar una fila.
 */
export function veredictoDelActaDeDescanso(
  pareja: readonly [string | null | undefined, string | null | undefined] | null,
): VeredictoActaDescanso {
  if (!pareja || pareja.length < 2) return 'no-demuestra';
  const limpia = (x: unknown) => normalizaNombreEquipo(separaNombreYEstado(String(x ?? '')).nombreEquipo);
  const [a, b] = [limpia(pareja[0]), limpia(pareja[1])];
  if (a === '' || b === '') return 'no-demuestra';
  const esDescanso = (literal: string) =>
    (Object.keys(VOCABULARIO_DESCANSO) as Maqueta[]).some((m) => esPalabraDeDescanso(literal, m));
  if (esDescanso(a) || esDescanso(b)) return 'descanso';
  return 'partido-real';
}

/**
 * Señales observables de una fila. Una fila puede tener varias, y **todas se conservan**: lo que es único
 * es la clase causal principal, no las señales.
 */
export const SENALES = [
  'literal-de-descanso-en-un-lado',
  'literal-de-descanso-en-los-dos-lados',
  'marcador-de-estado-pegado-al-descanso',
  'acta-en-la-fila',
  'marcador-publicado',
  'campo-real',
  'arbitro-publicado',
  'acta-compartida-con-otra-fila-de-la-jornada',
  'pareja-repetida-en-la-jornada',
  'la-pareja-no-existe-en-el-html',
  'partido-real-del-html-ausente-en-la-cola',
  'marcador-0-0-de-plantilla-sin-otra-senal',
  'acta-que-no-demuestra-partido-real',
] as const;
export type Senal = (typeof SENALES)[number];

/**
 * Clases causales, **excluyentes**. Son las del encargo:
 *
 * - `A` descanso informativo puro: los dos lados son descanso; la fila no lleva nada de un partido.
 * - `B` descanso unido a un equipo real: un lado es el descanso y el otro un equipo, sin ningún dato de
 *   partido. Es la indicación de **quién descansa**, y es la forma más común.
 * - `C` partido desplazado: la fila lleva acta, marcador, campo o árbitro de un partido REAL. El partido
 *   verdadero falta o está corrupto.
 * - `D` duplicado: la misma acta —o la misma pareja— aparece en más de una fila de la jornada.
 * - `E` marcador de estado pegado al descanso.
 * - `F` legítimo o no explicado: no se toca.
 */
export type ClaseDescanso = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export const CLASES: readonly ClaseDescanso[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export type Certeza = 'demostrado' | 'probable' | 'sin-determinar';

export type EntradaClasificacion = {
  maqueta: Maqueta;
  local: string;
  visitante: string;
  codigoActa: string | null;
  golesLocal: number | null;
  golesVisitante: number | null;
  campo: string | null;
  arbitro: string | null;
  /** Cuántas filas de la MISMA jornada comparten este `codigo_acta`. */
  filasConLaMismaActa: number;
  /** Cuántas filas de la MISMA jornada repiten esta pareja exacta de literales. */
  filasConLaMismaPareja: number;
  /** ¿La pareja de esta fila existe como partido en el HTML archivado de su jornada? */
  parejaExisteEnElHtml: boolean | null;
  /** ¿Falta en la cola algún partido que el HTML sí publica en esta jornada? */
  hayPartidoDelHtmlAusente: boolean;
  /**
   * ¿El acta de esta fila DEMUESTRA que hubo un partido real?
   *
   * Tener `codigo_acta` no basta, y esto se midió: en Euskadi la acta del bloque de descanso publica la
   * pareja `DANOK BAT CLUB / DESCANSA` —el propio descanso dentro de la acta—, y en Madrid y Valencia el
   * código de acta del bloque existe pero su ficha no tiene pareja ninguna (estado `pendiente`). En los
   * dos casos el acta es un marcador de posición, no la prueba de un partido.
   *
   * `true` sólo cuando la acta tiene pareja legible, NINGUNO de sus lados es una palabra de descanso y esa
   * pareja NO es la misma que la de la fila. `null` cuando no hay acta o no se puede leer.
   */
  actaDemuestraPartidoReal: boolean | null;
};

export type Clasificacion = {
  clase: ClaseDescanso;
  senales: Senal[];
  certeza: Certeza;
  explicacion: string;
};

/**
 * Clasifica una fila con la palabra de descanso. Determinista y sin acceso a la base: se prueba sola.
 *
 * El orden de decisión está fijado a propósito, porque una misma fila puede tener varias señales —una
 * fila duplicada con acta es a la vez `C` y `D`— y el encargo pide una única clase principal. Se elige la
 * causa MÁS ESPECÍFICA, de más a menos:
 *
 * 1. `E` marcador de estado pegado al descanso: nombra un defecto propio y demostrable;
 * 2. `D` duplicado: la misma acta o la misma pareja repetida en la jornada;
 * 3. `C` desplazado: la fila lleva datos de un partido real (acta, marcador, campo, árbitro);
 * 4. `A` los dos lados son descanso;
 * 5. `B` descanso junto a un equipo real, sin ningún dato de partido;
 * 6. `F` el resto, que NO se toca.
 */
export function clasificaFilaDeDescanso(entrada: EntradaClasificacion): Clasificacion {
  const { maqueta } = entrada;
  const localEsDescanso = esPalabraDeDescanso(entrada.local, maqueta);
  const visitanteEsDescanso = esPalabraDeDescanso(entrada.visitante, maqueta);
  // Si NINGÚN lado es la palabra entera, esta fila no es un caso: se queda fuera del inventario.
  if (!localEsDescanso && !visitanteEsDescanso) {
    return { clase: 'F', senales: [], certeza: 'sin-determinar', explicacion: 'ningún lado es exactamente una palabra de descanso de su maqueta' };
  }

  const senales: Senal[] = ['literal-de-descanso-en-un-lado'];
  if (localEsDescanso && visitanteEsDescanso) senales.push('literal-de-descanso-en-los-dos-lados');
  const conMarcadorDeEstado = llevaMarcadorDeEstado(entrada.local) || llevaMarcadorDeEstado(entrada.visitante);
  if (conMarcadorDeEstado) senales.push('marcador-de-estado-pegado-al-descanso');
  if (entrada.codigoActa !== null) senales.push('acta-en-la-fila');
  if (entrada.codigoActa !== null && entrada.actaDemuestraPartidoReal === false) senales.push('acta-que-no-demuestra-partido-real');
  if (entrada.golesLocal !== null || entrada.golesVisitante !== null) senales.push('marcador-publicado');
  const campoReal = entrada.campo !== null && entrada.campo.trim() !== ''
    && !esPalabraDeDescanso(entrada.campo, maqueta) && !/descans/i.test(entrada.campo);
  if (campoReal) senales.push('campo-real');
  if (entrada.arbitro !== null && entrada.arbitro.trim() !== '') senales.push('arbitro-publicado');
  if (entrada.codigoActa !== null && entrada.filasConLaMismaActa > 1) senales.push('acta-compartida-con-otra-fila-de-la-jornada');
  if (entrada.filasConLaMismaPareja > 1) senales.push('pareja-repetida-en-la-jornada');
  if (entrada.parejaExisteEnElHtml === false) senales.push('la-pareja-no-existe-en-el-html');
  if (entrada.hayPartidoDelHtmlAusente) senales.push('partido-real-del-html-ausente-en-la-cola');

  const conDatosDePartidoReal = entrada.actaDemuestraPartidoReal === true || campoReal
    || (entrada.arbitro !== null && entrada.arbitro.trim() !== '')
    // Un marcador que NO sea 0-0 sí es dato de un partido real; el 0-0 se trata abajo, porque puede ser
    // la plantilla del bloque de descanso.
    || ((entrada.golesLocal !== null || entrada.golesVisitante !== null)
        && !(entrada.golesLocal === 0 && entrada.golesVisitante === 0));

  /*
   * Un `0-0` a secas NO es la prueba de un partido desplazado: es la plantilla del bloque de descanso.
   *
   * Medido en Euskadi (t13 c2949 g7237 J3): el bloque de descanso publica `DEPORTIVO ALAVES` vs `DESCANSA`
   * con celdas de marcador que llevan señales `ntype(...)` que resuelven a 0 y 0 —la plantilla de la
   * fuente, no un resultado—, sin acta, sin campo y sin árbitro; y esa jornada tiene sus OCHO filas
   * alineadas con el HTML, sin ningún partido perdido. Tratar ese `0-0` como «datos de un partido real»
   * ascendería 53 filas de Euskadi a «partido desplazado» sin ninguna prueba de desplazamiento.
   *
   * Lo que sí sigue siendo prueba de desplazamiento es que FALTE en la cola un partido que el HTML
   * publica, o que la pareja no exista en el HTML, o que la fila traiga acta, campo o árbitro.
   */
  const marcadorCero = entrada.golesLocal === 0 && entrada.golesVisitante === 0;
  const marcadorPublicado = entrada.golesLocal !== null || entrada.golesVisitante !== null;
  const desplazamientoDemostrado = entrada.hayPartidoDelHtmlAusente || entrada.parejaExisteEnElHtml === false;
  if (marcadorCero && !conDatosDePartidoReal && !desplazamientoDemostrado) {
    senales.push('marcador-0-0-de-plantilla-sin-otra-senal');
  }

  if (conMarcadorDeEstado) {
    return {
      clase: 'E', senales, certeza: 'demostrado',
      explicacion: 'el literal de descanso lleva pegado un marcador de estado, así que la fuente lo trata como un nombre de equipo',
    };
  }
  if (entrada.filasConLaMismaActa > 1 || entrada.filasConLaMismaPareja > 1) {
    return {
      clase: 'D', senales, certeza: 'demostrado',
      explicacion: `la jornada repite esta fila (${entrada.filasConLaMismaPareja} veces la pareja, ${entrada.filasConLaMismaActa} con la misma acta): es un duplicado de lectura`,
    };
  }
  if (conDatosDePartidoReal || desplazamientoDemostrado) {
    const porQue = [
      entrada.actaDemuestraPartidoReal === true ? `acta ${entrada.codigoActa} con pareja propia` : null,
      marcadorPublicado && !marcadorCero ? `marcador ${entrada.golesLocal ?? '?'}-${entrada.golesVisitante ?? '?'}` : null,
      campoReal ? `campo «${entrada.campo}»` : null,
      entrada.arbitro !== null && entrada.arbitro.trim() !== '' ? `árbitro «${entrada.arbitro}»` : null,
      desplazamientoDemostrado ? 'falta el partido real en la cola o la pareja no está en el HTML' : null,
    ].filter((x): x is string => x !== null).join(', ');
    return {
      clase: 'C', senales,
      certeza: desplazamientoDemostrado ? 'demostrado' : 'probable',
      explicacion: `la fila lleva datos de un partido real (${porQue})`,
    };
  }
  if (localEsDescanso && visitanteEsDescanso) {
    return {
      clase: 'A', senales, certeza: 'demostrado',
      explicacion: 'los dos lados son la palabra de descanso y la fila no lleva ningún dato de partido',
    };
  }
  return {
    clase: 'B', senales,
    // El reconocimiento de esta clase no depende del HTML: lo que la sostiene es que el nombre sea
    // EXACTAMENTE una palabra del vocabulario declarado por su maqueta, y eso ya se ha comprobado arriba.
    // La incógnita sobre el HTML (`parejaExisteEnElHtml`) no pone en duda QUÉ es la fila.
    certeza: 'demostrado',
    explicacion: 'un lado es el descanso y el otro un equipo real, sin ningún dato de partido: indica qué equipo descansa',
  };
}

/**
 * Invariantes del inventario. Lista vacía = se puede publicar.
 *
 * El encargo pide que `total = suma de clases excluyentes`: es lo que impide que una fila se cuente dos
 * veces —una por cada señal que tiene— al informar del alcance del defecto.
 */
export function compruebaInvariantesDelInventario(
  casos: ReadonlyArray<{ clase: ClaseDescanso; federacion: string; senales: readonly Senal[] }>,
): string[] {
  const fallos: string[] = [];
  for (const [i, caso] of casos.entries()) {
    if (!CLASES.includes(caso.clase)) fallos.push(`caso ${i}: clase fuera del vocabulario (${String(caso.clase)})`);
    if (!caso.federacion) fallos.push(`caso ${i}: sin federación`);
    for (const s of caso.senales) if (!SENALES.includes(s)) fallos.push(`caso ${i}: señal fuera del vocabulario (${String(s)})`);
  }
  const sumaClases = CLASES.reduce((a, c) => a + casos.filter((x) => x.clase === c).length, 0);
  if (sumaClases !== casos.length) {
    fallos.push(`la suma de las clases (${sumaClases}) no es el total de casos (${casos.length})`);
  }
  return fallos;
}

export type RecuentoInventario = {
  total: number;
  porClase: Record<ClaseDescanso, number>;
  porFederacion: Record<string, number>;
  porMaqueta: Record<string, number>;
  porCerteza: Record<Certeza, number>;
};

/** Recuentos del inventario, con las clases SIEMPRE presentes (aunque estén a cero). */
export function recuentaInventario(
  casos: ReadonlyArray<{ clase: ClaseDescanso; federacion: string; maqueta: Maqueta; certeza: Certeza }>,
): RecuentoInventario {
  const porClase = Object.fromEntries(CLASES.map((c) => [c, 0])) as Record<ClaseDescanso, number>;
  const porFederacion: Record<string, number> = {};
  const porMaqueta: Record<string, number> = {};
  const porCerteza: Record<Certeza, number> = { demostrado: 0, probable: 0, 'sin-determinar': 0 };
  for (const caso of casos) {
    porClase[caso.clase] += 1;
    porFederacion[caso.federacion] = (porFederacion[caso.federacion] ?? 0) + 1;
    porMaqueta[caso.maqueta] = (porMaqueta[caso.maqueta] ?? 0) + 1;
    porCerteza[caso.certeza] += 1;
  }
  return { total: casos.length, porClase, porFederacion, porMaqueta, porCerteza };
}
