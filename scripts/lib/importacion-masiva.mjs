/**
 * ── IMPORTACIÓN MASIVA: qué grupos entran, en qué orden y qué hacer con los que fallan ──────────────────
 *
 * El importador trabaja por lotes y la unidad es **(federación, temporada, grupo)**: un grupo = un lote = una
 * transacción. Con las colas reales hay del orden de **29 500 unidades** y cada una cuesta entre 43 s y 2 min,
 * así que esto son días de máquina: lo que decide este módulo no es «cómo importar», sino **en qué orden** y
 * **qué hacer cuando una unidad se atasca**.
 *
 * Dos reglas que vienen de la realidad medida (informe del importador, §10):
 *
 *   1. **Hay 242 partidos donde el calendario y el acta no comparten ningún equipo** y el importador DETIENE el
 *      lote cuando los encuentra (Euskadi 167, Castilla y León 62…). Si la importación masiva se parara en cada
 *      uno, no avanzaría nunca; y si los saltara en silencio, se perderían. Por eso se **apartan y se listan**:
 *      quedan en el estado con su motivo, visibles, y el resto sigue.
 *   2. **El orden importa para poder usar la plataforma cuanto antes**: primero lo reciente (temporada 2026-27 y
 *      2025-26) y, dentro de eso, los grupos con más actas, que son los que más pantallas llenan por minuto de
 *      CPU. Lo viejo va después.
 */

/** De más reciente a más antigua. Una temporada que no se reconoce va al final, nunca delante. */
export function ordenaTemporadas(a, b) {
  const año = (t) => Number(String(t ?? '').slice(0, 4)) || 0;
  return año(b) - año(a);
}

/**
 * El orden en el que se importan las unidades: temporada reciente primero y, a igual temporada, más actas
 * primero (más valor por minuto de CPU).
 */
export function ordenaUnidades(unidades) {
  return [...unidades].sort((a, b) => {
    const porTemporada = ordenaTemporadas(a.temporada, b.temporada);
    if (porTemporada !== 0) return porTemporada;
    if ((b.actas ?? 0) !== (a.actas ?? 0)) return (b.actas ?? 0) - (a.actas ?? 0);
    return `${a.federacion}${a.grupo}`.localeCompare(`${b.federacion}${b.grupo}`);
  });
}

/** La clave con la que se recuerda una unidad (una sola forma de nombrarla en todo el proceso). */
export function claveDeUnidad({ federacion, temporada, grupo }) {
  return `${federacion}|${temporada}|${grupo}`;
}

/**
 * ¿El fallo de esta unidad es de los que se APARTAN (se listan y no se reintentan)?
 *
 * Hay dos familias, y las dos son «esto necesita que lo mire una persona», no «vuelve a intentarlo»:
 *
 *   1. **Calendario y acta sin equipos en común** (los 242 partidos del informe del importador): el importador
 *      detiene el lote porque no sabe qué partido describe el acta.
 *   2. **La validación del lote no cuadra** («actas analizadas 27≠18, participaciones 1031≠685…»): medido el
 *      21/09/2026 con el grupo 22841470 de Navarra. El importador revierte el lote entero (así no deja datos a
 *      medias) y devuelve el error; reintentarlo da exactamente lo mismo, porque el desajuste está en los datos.
 *
 * Un fallo DISTINTO (un timeout, una caída de la base) sí se reintenta: es la diferencia entre «estos datos
 * tienen un problema» y «esta vez no salió». Si el motivo se arregla, `--reintentar-apartados` los vuelve a
 * poner en la cola: apartar no es tirar nada.
 */
export function esIncidenciaQueAparta(mensaje) {
  const texto = String(mensaje ?? '').toLowerCase();
  const sinEquipos = texto.includes('sin equipos en común') || texto.includes('sin equipos en comun')
    || (texto.includes('calendario') && texto.includes('acta') && texto.includes('ningún equipo'));
  const validacion = /la validación del lote .* ha fallado/.test(texto) || /validacion del lote .* ha fallado/.test(texto);
  return sinEquipos || validacion;
}

/** Compatibilidad con el nombre anterior (lo usaban las pruebas y el lanzador). */
export const esIncidenciaDeEquipos = esIncidenciaQueAparta;

/**
 * Qué toca importar ahora, a partir de las unidades que hay y del estado guardado.
 *
 *   · lo ya hecho no se repite;
 *   · lo apartado por incidencia no se reintenta (se revisa a mano; reintentarlo cada día es tirar CPU) — salvo
 *     que se pida expresamente con `reintentarApartados`, que es lo que se hace cuando el motivo ya se arregló;
 *   · lo que falló por otra razón se reintenta hasta `intentosMaximos` veces.
 */
export function unidadesPendientes(unidades, estado = {}, { intentosMaximos = 3, reintentarApartados = false } = {}) {
  const hechos = estado.hechos ?? {};
  const apartados = estado.apartados ?? {};
  const fallos = estado.fallos ?? {};
  return unidades.filter((unidad) => {
    const clave = claveDeUnidad(unidad);
    if (hechos[clave]) return false;
    if (apartados[clave] && !reintentarApartados) return false;
    const intentos = fallos[clave]?.intentos ?? 0;
    return intentos < intentosMaximos;
  });
}

/** El resumen que se escribe en `estado/importacion.json` y que se puede leer de un vistazo. */
export function resumenDeImportacion(estado = {}, unidades = []) {
  const hechos = Object.keys(estado.hechos ?? {}).length;
  const apartados = Object.keys(estado.apartados ?? {}).length;
  const fallos = Object.keys(estado.fallos ?? {}).length;
  const filas = Object.values(estado.hechos ?? {}).reduce((a, x) => a + (Number(x.filas) || 0), 0);
  return {
    unidades: unidades.length,
    hechas: hechos,
    apartadas: apartados,
    conFallos: fallos,
    pendientes: Math.max(0, unidades.length - hechos - apartados),
    filasImportadas: filas,
    actualizado: estado.actualizado ?? null,
  };
}

/** El texto con el que se avisa de que una unidad se ha apartado (va al registro y al aviso). */
export function textoDeApartado(unidad, motivo) {
  return `Apartado ${claveDeUnidad(unidad)}: ${String(motivo ?? '').slice(0, 300)}`;
}
