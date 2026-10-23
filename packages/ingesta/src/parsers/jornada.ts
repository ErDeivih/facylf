/**
 * Parser de la página de RESULTADOS de una jornada (`NFG_CmpJornada`).
 *
 * El marcador va **ofuscado**: el número real está en un `<span style="display:none;">`
 * o en un icono `fa-solid`/`fa-N`. Aquí se lee del DOM (node-html-parser), no por líneas.
 *
 * ── LAS DOS MAQUETAS ──────────────────────────────────────────────────────────────────────────────
 *
 * El portal PNFG sirve la misma jornada de dos formas y las dos están archivadas. No es una
 * suposición: está medido sobre los ficheros de la cola de Castilla y León el 24/09/2026.
 *
 * | maqueta | estructura | ejemplo medido |
 * |---|---|---|
 * | clásica | **una `<table>` por partido**: local (`div.font_widgetL`), resultado (dos `.wid2_resultado_cerrada`) y visitante (`div.font_widgetV`), más una fila con el campo (`NFG_VisCampos`) y el árbitro | `comp-24218932/grupo-24218933/jornada-1` → 10 tablas, 18 marcadores, 9 partidos leídos |
 * | fila | **una sola `<table>` con un `<tr>` por partido**: 1 tabla, 7 filas, 14 marcadores | `comp-24218963/grupo-24218968/jornada-1` → **0 partidos leídos** antes de este arreglo |
 *
 * La segunda dejaba la jornada entera sin marcador: el recolector guardaba los partidos con
 * `goles_local` nulo, la clasificación no se podía reconstruir y la tabla oficial se quedaba sin
 * jornada de corte a la que colgarse. Medido el 24/09/2026 en el grupo 24218968 (Provincial Juvenil
 * de Salamanca 2026-27): 7 partidos jugados, 7 actas correctas y **0 marcadores en la cola**.
 *
 * En la maqueta de fila la fecha y la hora no van en `span.horario` sino en `span.esconder`; el
 * campo no se publica en esa página, así que queda a nulo en vez de inventarse.
 */

import { parse, type HTMLElement } from 'node-html-parser';
import { numeroOfuscado } from './ofuscacion.js';

export interface ResultadoJornada {
  jornada: number;
  local: string;
  visitante: string;
  golesLocal: number;
  golesVisitante: number;
  fecha: string | null;
  hora: string | null;
  campo: string | null;
  arbitro: string | null;
  codActa: string | null;
  codLocal: string | null;
  codVisitante: string | null;
  codCampo: string | null;
}

/** Texto limpio de un enlace o elemento (sin espacios repetidos). */
const limpio = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** Un contenedor de partido tiene EXACTAMENTE dos marcadores y dos enlaces de equipo. */
function esContenedorDePartido(elemento: HTMLElement): boolean {
  return elemento.querySelectorAll('.wid2_resultado_cerrada').length === 2 &&
    elemento.querySelectorAll('a[href*="NFG_VisEquipos"]').length === 2;
}

/**
 * Contenedores de partido del documento, en orden de aparición.
 *
 * Se aceptan las dos maquetas y **no se cuenta dos veces el mismo partido**: cuando la tabla ya
 * envuelve un solo partido, sus filas se descartan como contenedor; sólo se miran las filas que no
 * viven dentro de una tabla de partido, que son las de la maqueta de fila.
 */
function contenedoresDePartido(raiz: HTMLElement): HTMLElement[] {
  const tablas = raiz.querySelectorAll('table').filter(esContenedorDePartido);
  const filasDentroDeTabla = new Set<HTMLElement>();
  for (const tabla of tablas) for (const fila of tabla.querySelectorAll('tr')) filasDentroDeTabla.add(fila);
  return [
    ...tablas,
    ...raiz.querySelectorAll('tr').filter((fila) => esContenedorDePartido(fila) && !filasDentroDeTabla.has(fila)),
  ];
}

/**
 * Fecha y hora del partido, en cualquiera de las dos maquetas.
 *
 * La clásica las pone en `span.horario` (fecha primero, hora después); la de fila, en `span.esconder`
 * con el mismo orden. Se leen en orden de aparición y se coge la primera fecha y la primera hora.
 */
function fechaYHora(contenedor: HTMLElement): { fecha: string | null; hora: string | null } {
  const horarios = contenedor.querySelectorAll('span.horario').map((s) => s.textContent ?? '');
  const textos = horarios.length > 0 ? horarios : contenedor.querySelectorAll('span.esconder').map((s) => s.textContent ?? '');
  let fecha: string | null = null;
  let hora: string | null = null;
  for (const texto of textos) {
    if (fecha === null) {
      const m = /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/.exec(texto);
      if (m) { fecha = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`; continue; }
    }
    if (hora === null) {
      const h = /(\d{1,2}):(\d{2})/.exec(texto);
      if (h) hora = `${h[1]}:${h[2]}`;
    }
  }
  return { fecha, hora };
}

function parametro(href: string, nombre: string): string | null {
  try {
    const u = new URL(href.replace(/&amp;/g, '&'), 'https://www.rfcylf.es/pnfg/NPcd/');
    for (const [k, v] of u.searchParams) if (k.toLowerCase() === nombre.toLowerCase()) return v;
  } catch { /* enlace incompleto */ }
  return null;
}

export function parseaJornada(html: string, jornada: number): ResultadoJornada[] {
  const raiz = parse(html);
  // Se conservan scripts y estilos hasta descodificar el marcador: algunas variantes
  // guardan precisamente ahí el dígito real. numeroOfuscado ignora después los señuelos.
  const out: ResultadoJornada[] = [];
  const vistos = new Set<string>();

  for (const contenedor of contenedoresDePartido(raiz)) {
    const marcadores = contenedor.querySelectorAll('.wid2_resultado_cerrada');
    const equipos = contenedor.querySelectorAll('a[href*="NFG_VisEquipos"]');

    const local = limpio(equipos[0]!.textContent);
    const visitante = limpio(equipos[1]!.textContent);
    const codLocal = parametro(equipos[0]!.getAttribute('href') ?? '', 'Codigo_Equipo') ??
      parametro(equipos[0]!.getAttribute('href') ?? '', 'codequipo');
    const codVisitante = parametro(equipos[1]!.getAttribute('href') ?? '', 'Codigo_Equipo') ??
      parametro(equipos[1]!.getAttribute('href') ?? '', 'codequipo');
    const gl = numeroOfuscado(marcadores[0]!);
    const gv = numeroOfuscado(marcadores[1]!);
    if (!local || !visitante || gl === null || gv === null) continue;

    const { fecha, hora } = fechaYHora(contenedor);

    // campo: enlace a NFG_VisCampos. La maqueta de fila no lo publica en la página de jornada.
    const campoA = contenedor.querySelector('a[href*="NFG_VisCampos"]');
    const campo = limpio(campoA?.textContent) || null;
    const codCampo = campoA ? parametro(campoA.getAttribute('href') ?? '', 'Codigo_Campo') : null;

    // árbitro: el <strong> que empieza por "Árbitro:"
    let arbitro: string | null = null;
    for (const st of contenedor.querySelectorAll('strong')) {
      if (/^árbitro/i.test(limpio(st.textContent))) {
        const contenido = limpio(st.parentNode?.textContent);
        const posicion = contenido.toLocaleLowerCase('es').indexOf('árbitro');
        const resto = (posicion >= 0 ? contenido.slice(posicion + 'árbitro'.length) : contenido)
          .replace(/^\s*:/, '').trim();
        if (resto) arbitro = resto;
        break;
      }
    }

    // acta: enlace a NFG_CmpPartido con CodActa
    let codActa: string | null = null;
    const actaA = contenedor.querySelector('a[href*="NFG_CmpPartido"]');
    if (actaA) {
      const m = /[?&]CodActa=(\d+)/i.exec(actaA.getAttribute('href') ?? '');
      if (m) codActa = m[1]!;
    }

    const clave = `${local}|${visitante}|${gl}-${gv}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ jornada, local, visitante, golesLocal: gl, golesVisitante: gv, fecha, hora,
      campo, arbitro, codActa, codLocal, codVisitante, codCampo });
  }
  return out;
}
