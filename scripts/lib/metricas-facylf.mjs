/**
 * Reglas puras de `metricas-facylf.json` (panel de proyectos).
 *
 * El panel **no calcula**: lee el documento y lo pinta. Por eso la semántica vive aquí, con nombres
 * explícitos y pruebas, y el script de `scripts/metricas-facylf.mjs` sólo se encarga de leer las
 * fuentes y escribir el fichero.
 *
 * Definiciones (las mismas que están en `docs/plataforma-web/METRICAS-PANEL.md`):
 *  · «competición» = edición de competición (una liga/división en una temporada), que es la unidad con
 *    la que el proyecto decide si una competición está terminada;
 *  · «completa» = edición con TODOS sus grupos en cobertura `completa` en el canónico. `parcial_privada`
 *    NO cuenta como completa: la fuente publica menos, pero falta dato y el panel no debe fingir lo
 *    contrario;
 *  · total = unión de las competiciones que conocen las colas de CyL del PC y del servidor y las que ya
 *    están en el canónico, sin duplicar por código;
 *  · `porcentaje` = lo que FALTA (100 − completas/total), entero y redondeado.
 *
 * Este módulo no importa `node:sqlite`, ni `pg`, ni nada de red: es puro y se prueba sin base.
 */

/**
 * Ventana del ritmo. No es la media histórica: son los últimos 5 minutos, expresados **por minuto**
 * (90 peticiones en 5 min = 18/min). Una ventana de 60 s daba ceros y picos de ráfaga que no describen
 * la máquina; 5 min sigue siendo «ahora» para un panel que se refresca cada minuto.
 */
export const TAMANO_VENTANA_MINUTOS = 5;

/** Peticiones por minuto a partir de un recuento en una ventana de `minutos`, con un decimal. */
export function porMinuto(total, minutos = TAMANO_VENTANA_MINUTOS) {
  const t = Number(total);
  const m = Number(minutos);
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(m) || m <= 0) return 0;
  return Math.round((t / m) * 10) / 10;
}

/** Clave estable de una competición para no contarla dos veces al unir las dos colas y el canónico. */
export function claveDeCompeticion(etiqueta, codigo) {
  return `${String(etiqueta)}|${String(codigo).trim()}`;
}

/** Porcentaje que FALTA, entero. Sin competiciones no se inventa un 100: es 0 (no hay nada que falte). */
export function porcentajeQueFalta(total, completas) {
  const t = Number(total);
  const c = Number(completas);
  if (!Number.isFinite(t) || t <= 0) return 0;
  const falta = Math.max(0, t - Math.max(0, Math.min(c, t)));
  return Math.round((falta / t) * 100);
}

/** Marca local `AAAA-MM-DDTHH:MM` (sin segundos ni zona), como la espera el panel. */
export function formatoMedido(fecha) {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(fecha);
  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value ?? '00';
  return `${valor('year')}-${valor('month')}-${valor('day')}T${valor('hour')}:${valor('minute')}`;
}

/** Añade las competiciones de una cola al mapa `temporada|código`, traduciendo el código de temporada. */
function añadeCatalogo(destino, catalogo) {
  if (!catalogo) return;
  const etiquetaPorCodigo = new Map(
    (catalogo.temporadas ?? []).map((t) => [String(t.codigo), String(t.etiqueta)]),
  );
  for (const c of catalogo.competiciones ?? []) {
    const etiqueta = etiquetaPorCodigo.get(String(c.temporada)) ?? String(c.temporada);
    destino.set(claveDeCompeticion(etiqueta, c.codigo), { etiqueta, codigo: String(c.codigo) });
  }
}

/**
 * Construye el documento exacto que lee el panel.
 *
 * @param {object} datos
 * @param {object} datos.catalogoPc            `{temporadas:[{codigo,etiqueta}], competiciones:[{temporada,codigo}]}`
 * @param {object} datos.catalogoServidor      misma forma (lo que el servidor conoce de CyL)
 * @param {Array}  datos.edicionesCanonico     `[{etiqueta, codigo, completa}]`
 * @param {{pcPorMin:number, servidorPorMin:number}} datos.ritmo
 * @param {string} datos.medido                marca local ya formateada
 */
export function construyeMetricas({ catalogoPc, catalogoServidor, edicionesCanonico, ritmo, medido }) {
  const totales = new Map();
  añadeCatalogo(totales, catalogoPc);
  añadeCatalogo(totales, catalogoServidor);
  const completas = new Set();
  for (const e of edicionesCanonico ?? []) {
    totales.set(claveDeCompeticion(e.etiqueta, e.codigo), { etiqueta: String(e.etiqueta), codigo: String(e.codigo) });
    if (e.completa === true) completas.add(claveDeCompeticion(e.etiqueta, e.codigo));
  }

  const porTemporada = new Map();
  for (const [clave, { etiqueta }] of totales) {
    const fila = porTemporada.get(etiqueta) ?? { temporada: etiqueta, hecho: 0, total: 0 };
    fila.total += 1;
    if (completas.has(clave)) fila.hecho += 1;
    porTemporada.set(etiqueta, fila);
  }

  const temporadas = [...porTemporada.values()].sort((a, b) => b.temporada.localeCompare(a.temporada, 'es'));
  const competicionesTotal = temporadas.reduce((n, t) => n + t.total, 0);
  const hechas = temporadas.reduce((n, t) => n + t.hecho, 0);

  return {
    cyl: {
      competiciones_total: competicionesTotal,
      completas: hechas,
      porcentaje: porcentajeQueFalta(competicionesTotal, hechas),
    },
    temporadas,
    ritmo: {
      pc_por_min: Math.max(0, Math.round(Number(ritmo?.pcPorMin ?? 0) * 10) / 10),
      servidor_por_min: Math.max(0, Math.round(Number(ritmo?.servidorPorMin ?? 0) * 10) / 10),
      medido: String(medido),
    },
  };
}

/** Una frase en llano con los mismos números, para el estado del agente o un log. */
export function fraseResumen(metricas) {
  const { cyl, ritmo } = metricas;
  return `CyL: ${cyl.completas} de ${cyl.competiciones_total} competiciones completas `
    + `(falta el ${cyl.porcentaje} %); ritmo PC ${ritmo.pc_por_min}/min y servidor ${ritmo.servidor_por_min}/min `
    + `(medido ${ritmo.medido}).`;
}

/**
 * Parsea la salida del sondeo del servidor. Se queda con la ÚLTIMA línea que sea un objeto JSON: el
 * comando puede traer avisos de Node por stdout antes, y una salida sin JSON es un fallo de medición
 * (no un cero).
 */
export function parseaSondeoServidor(texto) {
  const lineas = String(texto ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lineas.length - 1; i >= 0; i -= 1) {
    if (!lineas[i].startsWith('{')) continue;
    try {
      const datos = JSON.parse(lineas[i]);
      if (datos && typeof datos === 'object') return datos;
    } catch { /* no era el JSON: se sigue buscando hacia atrás */ }
  }
  throw new Error(`No se pudo medir el servidor: su respuesta no trae un JSON válido (${lineas.slice(-2).join(' | ').slice(0, 200)}).`);
}
