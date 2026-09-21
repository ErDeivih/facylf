/**
 * Parser de la página de RESULTADOS de una jornada (`NFG_CmpJornada`).
 *
 * En el HTML real, cada partido es un `<table width="100%">` con tres celdas: equipo local
 * (`div.font_widgetL`), resultado (dos spans `.wid2_resultado_cerrada`) y equipo visitante
 * (`div.font_widgetV`), seguido de una fila con el campo (enlace `NFG_VisCampos`) y el
 * árbitro. El marcador va **ofuscado**: el número real está en un `<span style="display:none;">`
 * o en un icono `fa-solid`/`fa-N`. Aquí se lee del DOM (node-html-parser), no por líneas.
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

  for (const tabla of raiz.querySelectorAll('table')) {
    const marcadores = tabla.querySelectorAll('.wid2_resultado_cerrada');
    if (marcadores.length !== 2) continue;         // evita tablas contenedoras de varios partidos

    const equipos = tabla.querySelectorAll('a[href*="NFG_VisEquipos"]');
    if (equipos.length !== 2) continue;            // descanso, retirado o tabla contenedora

    const local = limpio(equipos[0]!.textContent);
    const visitante = limpio(equipos[1]!.textContent);
    const codLocal = parametro(equipos[0]!.getAttribute('href') ?? '', 'Codigo_Equipo') ??
      parametro(equipos[0]!.getAttribute('href') ?? '', 'codequipo');
    const codVisitante = parametro(equipos[1]!.getAttribute('href') ?? '', 'Codigo_Equipo') ??
      parametro(equipos[1]!.getAttribute('href') ?? '', 'codequipo');
    const gl = numeroOfuscado(marcadores[0]!);
    const gv = numeroOfuscado(marcadores[1]!);
    if (!local || !visitante || gl === null || gv === null) continue;

    // fecha y hora
    let fecha: string | null = null;
    let hora: string | null = null;
    const horarios = tabla.querySelectorAll('span.horario');
    if (horarios[0]) {
      const m = /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/.exec(horarios[0]!.textContent ?? '');
      if (m) fecha = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
    }
    if (horarios[1]) {
      const h = /(\d{1,2}):(\d{2})/.exec(horarios[1]!.textContent ?? '');
      if (h) hora = `${h[1]}:${h[2]}`;
    }

    // campo: enlace a NFG_VisCampos
    const campoA = tabla.querySelector('a[href*="NFG_VisCampos"]');
    const campo = limpio(campoA?.textContent) || null;
    const codCampo = campoA ? parametro(campoA.getAttribute('href') ?? '', 'Codigo_Campo') : null;

    // árbitro: el <strong> que empieza por "Árbitro:"
    let arbitro: string | null = null;
    for (const st of tabla.querySelectorAll('strong')) {
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
    const actaA = tabla.querySelector('a[href*="NFG_CmpPartido"]');
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
