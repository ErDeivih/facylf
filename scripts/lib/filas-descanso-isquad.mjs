/**
 * ADAPTADOR ISQUAD (Madrid y Valencia): cómo reconoce el bloque de descanso.
 *
 * ## Por qué es un módulo aparte y no está en la tabla de `recolector-local.mjs`
 *
 * Porque es **otro defecto**. En la maqueta clásica la federación publica el descanso como una tabla más
 * con un pseudo-equipo al que asigna código; aquí el bloque llega en el JSON de resultados de iSquad y
 * **su equipo trae código NEGATIVO** —`-1` en el caso más común—, que es un identificador sintético de la
 * fuente. Medido sobre las dos colas: en Madrid las 3.386 filas de descanso llevan código negativo en ese
 * lado y hay 3.386 partidos con algún código negativo, **ninguno sin la palabra**; en Valencia 686 y 686.
 * Es una biyección, así que la evidencia es el código, no el parecido del nombre.
 *
 * El encargo lo pide explícitamente: no se presume que PNFG, Cataluña, Madrid, Valencia y Euskadi
 * compartan el mismo defecto, y por eso el reconocimiento se declara uno a uno.
 *
 * ## El daño que hacía, medido
 *
 * El registrador escribía la fila del descanso como un partido más y, en el mismo lazo, daba de alta en
 * `equipos` el código y el nombre de los DOS lados. Es decir: **las entradas del catálogo llamadas
 * «Descansa» con código negativo las creó el propio recolector**, no las publica la federación. Y como la
 * fila ocupaba un `orden`, los partidos reales de esa jornada quedaban desordenados.
 *
 * ## Qué exige para descartar la fila
 *
 * El **código negativo** en un lado. **No el nombre**: un club podría llamarse así, y el nombre solo no
 * basta. Si el nombre es una palabra de descanso pero el código no es negativo, la fila **se conserva** y
 * se declara sospechosa: perder un partido real es peor que guardar una fila de más.
 *
 * Este módulo es puro a propósito —no toca la base ni la red— para que la regla se pueda probar sola y
 * para que el recolector y su prueba usen EXACTAMENTE el mismo código.
 */

/** Declaración del adaptador, en los mismos términos que los de `recolector-local.mjs`. */
export const ADAPTADOR_ISQUAD = {
  maqueta: 'isquad',
  vocabularioDescanso: ['descansa', 'descans', 'descanso'],
  delimitaFilaDePartido: 'una entrada del JSON de resultados de la jornada, con sus dos equipos y su resultado',
  extraeCeldasDirectas: 'los campos `Nombre_equipo_local`/`Nombre_equipo_visitante` y sus códigos',
  ignoraSubtablas: 'no aplica: la fuente entrega una lista plana, sin tablas anidadas',
  marcadoresDeEstado: 'no aplica: iSquad no pega marcadores de estado al nombre',
  evidenciaParaCorregir: 'código de equipo NEGATIVO en uno de los dos lados',
  cuandoDevuelveIncidencia: 'cuando el nombre es una palabra de descanso pero el código no es negativo: la fila se conserva y se declara',
};

const texto = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim();

/** ¿Este lado es el bloque de descanso? El código negativo es el identificador sintético de la fuente. */
export function esLadoDeDescansoIsquad(codigo) {
  return texto(codigo).startsWith('-');
}

/** ¿La fila entera es el bloque de descanso, y con qué evidencia? */
export function clasificaFilaDeDescansoIsquad(partido) {
  const local = esLadoDeDescansoIsquad(partido.cod_equipo_local);
  const visitante = esLadoDeDescansoIsquad(partido.cod_equipo_visitante);
  if (local || visitante) {
    return {
      informativa: true,
      motivo: `código de equipo negativo en el lado ${local ? 'local' : 'visitante'}`,
      equipoQueDescansa: local ? texto(partido.visitante) : texto(partido.local),
    };
  }
  const nombreDeDescanso = ADAPTADOR_ISQUAD.vocabularioDescanso.includes(texto(partido.local).toLowerCase())
    || ADAPTADOR_ISQUAD.vocabularioDescanso.includes(texto(partido.visitante).toLowerCase());
  if (nombreDeDescanso) {
    return {
      informativa: false,
      motivo: 'el nombre es una palabra de descanso pero el código NO es negativo: se conserva y se declara',
      equipoQueDescansa: null,
    };
  }
  return { informativa: false, motivo: null, equipoQueDescansa: null };
}

/**
 * Separa los partidos reales del bloque de descanso, **conservando el orden relativo de los reales**.
 *
 * Devolver el orden relativo es el punto: antes, la fila del descanso ocupaba un `orden` y desplazaba a
 * los partidos que iban detrás.
 */
export function separaDescansos(partidos) {
  const reales = [];
  const descansos = [];
  const sospechosas = [];
  for (const partido of partidos) {
    const clasificacion = clasificaFilaDeDescansoIsquad(partido);
    if (clasificacion.informativa) descansos.push(clasificacion);
    else {
      reales.push(partido);
      if (clasificacion.motivo) sospechosas.push(clasificacion);
    }
  }
  return {
    reales, descansos, sospechosas,
    equiposQueDescansan: descansos.map((d) => d.equipoQueDescansa).filter((x) => x !== null && x !== ''),
  };
}

/* ------------------------------------------------------------------ */
/* Qué se ESCRIBE al registrar una jornada                             */
/* ------------------------------------------------------------------ */

const norm = (t) => texto(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const parejaDe = (a, b) => [norm(a), norm(b)].sort().join(' | ');

/**
 * Las filas que hay que escribir al registrar una jornada, ya decididas.
 *
 * Es una función PURA —la base entra como datos y sale como datos— para que la regla se pueda probar sin
 * arrancar el recolector, que es un programa con efectos al importarse.
 *
 * Dos casos, y sólo dos:
 *
 *   1. **Lo normal**: el bloque de descanso no es un partido, así que se aparta y los reales se numeran
 *      seguidos (`orden` 0..n-1 sin huecos). Es el arreglo que impidió que el descanso ocupara un `orden` y
 *      desplazara a los partidos que iban detrás.
 *   2. **La jornada con una RECUPERACIÓN**: la reconstrucción pudo corregir una fila —el calendario pone
 *      «Descansa» donde el ACTA de esa misma fila nombra dos equipos reales— y esa fila está hoy en la cola.
 *      Re-escribir la jornada compactando la borraría, porque la fuente nunca publicó ese partido. En ese
 *      caso se conservan las POSICIONES de la fuente y en el hueco del descanso se escribe **la fila que la
 *      cola ya tiene**, no el descanso.
 *
 * La evidencia para conservar una fila es el ACTA, y se exige entera: tiene que nombrar **dos equipos
 * distintos** y su pareja tiene que ser **exactamente** la de la fila que hay hoy en esa posición. Ni
 * parecido de nombre ni una pareja a medias: sin esa coincidencia, la posición se descarta como siempre.
 *
 * @param partidos        las filas de la FUENTE, en su orden (con el bloque de descanso incluido)
 * @param filasActuales   lo que la cola tiene hoy en esa jornada (`{orden, local, visitante}`)
 * @param actaDe          `(codigoActa) => [local, visitante] | null`; la base la consulta quien llama
 */
export function decideFilasDeJornada({ partidos, filasActuales = [], actaDe = () => null }) {
  const actualesPorOrden = new Map(filasActuales.map((f) => [f.orden, f]));
  const conservadas = new Map();

  for (const [i, p] of partidos.entries()) {
    if (!clasificaFilaDeDescansoIsquad(p).informativa) continue;
    const actual = actualesPorOrden.get(i);
    if (!actual) continue;
    let pareja = null;
    try { pareja = actaDe(p.codacta); } catch { pareja = null; }
    if (!Array.isArray(pareja) || pareja.length < 2) continue;
    const [al, av] = [texto(pareja[0]), texto(pareja[1])];
    if (!al || !av) continue;
    if (norm(al) === norm(av)) continue;                                  // un equipo no juega contra sí mismo
    if (parejaDe(al, av) !== parejaDe(actual.local, actual.visitante)) continue;
    conservadas.set(i, actual);
  }

  const filas = [];
  let descansos = 0;
  if (conservadas.size === 0) {
    let orden = 0;
    for (const p of partidos) {
      if (clasificaFilaDeDescansoIsquad(p).informativa) { descansos += 1; continue; }
      filas.push({ orden: orden++, partido: p });
    }
    return { filas, recuperadas: 0, descansos };
  }

  let recuperadas = 0;
  for (const [i, p] of partidos.entries()) {
    if (!clasificaFilaDeDescansoIsquad(p).informativa) { filas.push({ orden: i, partido: p }); continue; }
    descansos += 1;
    const conservada = conservadas.get(i);
    if (conservada) { filas.push({ orden: i, conservada }); recuperadas += 1; }
  }
  return { filas, recuperadas, descansos };
}

/* ------------------------------------------------------------------ */
/* Lectura de la jornada ARCHIVADA                                     */
/* ------------------------------------------------------------------ */

/** Lee la lista de partidos del JSON archivado, SIN normalizar: la clasificación necesita los nombres de
 *  campo de la fuente (`cod_equipo_local`), y traducirlos antes de clasificar fue justo el defecto que hizo
 *  que Madrid declarase 3.386 bloques como «sospechosos» en vez de reconocerlos. */
function leePartidosDeJornada(contenido) {
  let datos;
  try {
    datos = JSON.parse(String(contenido ?? ''));
  } catch (error) {
    throw new Error(`La jornada archivada de iSquad no es JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const partidos = datos?.partidos;
  if (!Array.isArray(partidos)) {
    throw new Error('La jornada archivada de iSquad no trae una lista «partidos»: no se puede reconstruir nada de ella.');
  }
  return partidos;
}

/**
 * Los partidos REALES de una jornada archivada de iSquad: **sin el bloque de descanso**.
 *
 * Quitar el bloque aquí, y no más tarde, es lo que mantiene alineadas las dos lecturas. La comparación de la
 * reconstrucción es posicional —la fila `n` de la cola contra la `n`-ésima del archivo— y el bloque se
 * aparta de los dos lados por parejas; si el extractor además lo devolviera como partido, el lado del
 * archivo tendría una fila que el lado de la cola ya no tiene y **desplazaría una posición todo lo que va
 * detrás**. Medido al escribir esto en Madrid: 8.569 filas «ambiguas» que eran puro artefacto, con el patrón
 * inconfundible (la cola `ord 1` aparecía en el archivo en la posición 2).
 *
 * Las otras dos maquetas hacen lo mismo por la vía del literal (`extraePartidos` descarta el bloque cuando
 * `reconoceFilaInformativa` dice que es informativa); aquí la vía es el **código negativo**.
 *
 * El fichero archivado es el JSON normalizado que guarda el propio recolector
 * (`{"origen":"resultados_por_grupo_jornada","jornada":"1","partidos":[…]}`), no la respuesta cruda del
 * portal: por eso Madrid y Valencia —que publican con nombres de campo distintos— se leen igual.
 */
export function extraePartidosIsquad(contenido) {
  const { reales } = separaDescansos(leePartidosDeJornada(contenido));
  return reales.map((p) => ({
    local: texto(p.local),
    visitante: texto(p.visitante),
    codLocal: texto(p.cod_equipo_local) || null,
    codVisitante: texto(p.cod_equipo_visitante) || null,
    codActa: texto(p.codacta) || null,
  }));
}

/**
 * Las filas informativas de una jornada de iSquad, en la MISMA forma que las de las otras maquetas
 * (`{informativa, sospechosa, maqueta, local, visitante, motivo, equipoQueDescansa}`), para que la
 * herramienta no tenga que saber de qué maqueta viene cada una.
 *
 * La diferencia con las PNFG está en la EVIDENCIA: aquí el bloque se reconoce por **código de equipo
 * negativo** (`-1` en la inmensa mayoría de los casos), no por el literal. El nombre se mira sólo para
 * declarar una sospecha —una fila que se llama «Descansa» pero cuyo código NO es negativo— y esa fila
 * **se conserva**: perder un partido real es peor que guardar una fila de más.
 *
 * Se clasifica la fila CRUDA de la fuente, no la traducida: `clasificaFilaDeDescansoIsquad` lee
 * `cod_equipo_local`, y pasarle la forma de la herramienta (`codLocal`) dejaría los dos lados sin código y
 * convertiría cada bloque en una sospecha.
 */
export function extraeFilasInformativasIsquad(contenido) {
  return leePartidosDeJornada(contenido)
    .map((p) => {
      const clasificacion = clasificaFilaDeDescansoIsquad(p);
      if (!clasificacion.motivo) return null;
      return {
        maqueta: 'isquad',
        local: texto(p.local),
        visitante: texto(p.visitante),
        informativa: clasificacion.informativa,
        sospechosa: !clasificacion.informativa,
        motivo: clasificacion.motivo,
        equipoQueDescansa: clasificacion.equipoQueDescansa,
      };
    })
    .filter(Boolean);
}
