/**
 * Interpreta la cabecera de una jornada tal como la pinta la FCF.
 *
 * La web usaba antes dos nodos separados ("JORNADA 1" y la fecha), pero ahora publica un
 * único nodo: "JORNADA 1 2025-09-20". El extractor exigía que el texto terminase justo tras
 * el número y por eso confundió calendarios completos con calendarios vacíos.
 * Esta función no depende de Node y se inyecta también en el navegador.
 */
export function interpretaCabeceraJornadaFcf(texto) {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim();
  const jornada = limpio.match(/^JORNADA\s+(\d+)\b/i);
  if (!jornada) return null;
  return {
    numero: Number(jornada[1]),
    fecha: (limpio.match(/\b\d{4}-\d{2}-\d{2}\b/) || [])[0] ?? null,
  };
}

/**
 * Firma de una jornada: sus emparejamientos, CON EL LADO.
 *
 * ── EL LADO IMPORTA, Y APRENDERLO COSTÓ UNA MEDICIÓN MAL HECHA (24/09/2026) ──────────────────────────────
 *
 * La primera versión ordenaba los dos nombres para que diera igual quién jugara en casa. Parecía inofensivo y
 * era un error: en una liga a doble vuelta, la jornada de vuelta empareja a los MISMOS equipos con los lados
 * cambiados, así que las dos jornadas producían la misma firma. Con eso, cualquier grupo de dos jornadas
 * (ida y vuelta) se marcaba como «todas las jornadas iguales» —y la medición de calendarios imposibles daba
 * 434 grupos de fuera de Cataluña que eran perfectamente normales.
 *
 * Guardando el lado, la vuelta se distingue de la ida y el defecto de copia se sigue viendo igual: la jornada
 * repetida repite también el lado.
 */
function firmaDeJornada(jornada) {
  return (jornada?.partidos ?? [])
    .map((p) => {
      const local = String(p?.local ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
      const visitante = String(p?.visitante ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (!local || !visitante) return null;
      return `${local}>${visitante}`;
    })
    .filter(Boolean)
    .sort()
    .join(' · ');
}

/**
 * ¿Han salido TODAS las jornadas con las mismas parejas?
 *
 * En un calendario real cada jornada empareja a los equipos de otra manera. Que 30 jornadas traigan las
 * mismas 8 parejas no lo produce ninguna liga: significa que la lectura ha tomado el contenido de UNA
 * jornada —la que quedó abierta en la página— y lo ha repetido en todas. Es la huella exacta de haber
 * subido por el DOM hasta un bloque que ya era de varias jornadas.
 *
 * Medido el 24/09/2026: así quedaron **186 de los 447 grupos catalanes** del canónico (42 %), con hasta 34
 * jornadas compartiendo 9 parejas. El defecto no es del importador: las colas ya lo traen escrito así.
 *
 * La firma incluye el lado (ver `firmaDeJornada`): si no, la jornada de vuelta de cualquier liga a doble
 * vuelta contaría como repetición de la ida.
 *
 * Se exigen al menos DOS jornadas con partidos para poder hablar de repetición: un grupo con una sola
 * jornada publicada tiene una sola firma y eso es normal.
 */
export function jornadasTodasIguales(jornadas) {
  const firmas = (jornadas ?? []).map(firmaDeJornada).filter((f) => f !== '');
  if (firmas.length < 2) return false;
  return firmas.every((f) => f === firmas[0]);
}

/**
 * ¿El calendario entero ha venido sin un solo partido?
 *
 * Es la otra mitad de la misma comprobación. Una jornada suelta sin partidos es normal —todavía no se ha
 * jugado, o la federación no los ha publicado—, pero un grupo con varias jornadas y CERO partidos entre
 * todas no lo es: la FCF publica los emparejamientos de la temporada entera de una vez. Medido el
 * 20/09/2026: el grupo 58161868 se archivó con 30 jornadas y ningún partido, y días después el mismo grupo
 * tenía sus 240 partidos. Era una lectura fallida, no un grupo vacío.
 *
 * Se exigen dos jornadas para poder hablar de grupo: con una sola no hay nada que comparar, y hay grupos de
 * una jornada en competiciones a partido único.
 */
export function calendarioSinPartidos(jornadas) {
  const lista = jornadas ?? [];
  if (lista.length < 2) return false;
  return lista.every((j) => firmaDeJornada(j) === '');
}

/**
 * ¿Faltan jornadas YA JUGADAS en un calendario leído? (20/10/2026)
 *
 * Las otras dos comprobaciones miran el grupo entero (todo vacío, todo igual). Se escapaba el caso que de
 * verdad estaba pasando: la página sólo trae desplegada la ÚLTIMA jornada, los clics para abrir las demás
 * no hacían nada (la página de la FCF es Next.js y en el PC cargado se pulsaba antes de que React se
 * enganchara) y el calendario salía con 29 jornadas vacías y 1 llena. Ni «todo vacío» ni «todo igual»:
 * se guardaba como bueno. Medido en la cola del PC: 1.335 de 1.550 grupos de 2025-26 con 2,4 jornadas con
 * partidos de 16,1 ya jugadas, ~20.000 partidos de unos ~180.000.
 *
 * Una jornada con fecha ya pasada y sin ni un partido no es normal en la FCF (publica la temporada entera).
 * Se tolera una suelta —y hasta un 10 %— por jornadas de descanso o aplazadas.
 */
export function calendarioIncompleto(jornadas, hoy = new Date().toISOString().slice(0, 10)) {
  const jugadas = (jornadas ?? []).filter((j) => j?.fecha && String(j.fecha).slice(0, 10) <= hoy);
  const vacias = jugadas.filter((j) => !(j.partidos?.length));
  return {
    jugadas: jugadas.length,
    vacias: vacias.length,
    numerosVacios: vacias.map((j) => j.numero),
    incompleto: vacias.length >= 2 && vacias.length > jugadas.length * 0.1,
  };
}
