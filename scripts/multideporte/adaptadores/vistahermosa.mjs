/**
 * Liga Vistahermosa Fútbol 7 (Alicante, ligavistahermosaf7.futbol): web propia en PHP, con todo su histórico
 * (ligas desde 2018-19, copas y torneos de verano). robots.txt: no tiene (404). Sondeo del 05/10/2026:
 *   index.php?op=GRUPO&idcomp=N   → menú con TODAS las competiciones por temporada («LIGA 2026-2027», «COPA…»)
 *                                   y, del grupo N, todas sus jornadas con local, visitante y marcador («2-1»
 *                                   o «---» si no se ha jugado). La web no publica fechas en esta página.
 * Sólo equipos: no se piden actas ni jugadores.
 */
import { decodificaEntidades, limpia } from './_html.mjs';

const BASE = 'https://www.ligavistahermosaf7.futbol/index.php';

/** Competiciones del menú: [{ idcomp, campeonato, nombre }]. */
export function competicionesDelMenu(html) {
  const salida = [];
  for (const m of html.matchAll(/<a tabindex="-1" href="#">\s*([^<]+?)\s*<i[^>]*><\/i><\/a>\s*<ul class="dropdown-menu"[^>]*>([\s\S]*?)<\/ul>/g)) {
    for (const c of m[2].matchAll(/idcomp=(\d+)">([^<]*)</g)) {
      salida.push({ idcomp: Number(c[1]), campeonato: limpia(decodificaEntidades(m[1])), nombre: limpia(decodificaEntidades(c[2])) });
    }
  }
  // Competiciones sueltas que no van en submenú (por si las hay).
  for (const c of html.matchAll(/idcomp=(\d+)">([^<]*)</g)) {
    if (!salida.some((s) => s.idcomp === Number(c[1]))) salida.push({ idcomp: Number(c[1]), campeonato: null, nombre: limpia(decodificaEntidades(c[2])) });
  }
  return salida;
}
/** «LIGA 2026-2027» → 2026-2027; «TORNEO JULIO 2019» → 2019 (torneo de un solo año). */
export function temporadaDe(texto) {
  const d = /(20\d{2})\s*[-/]\s*(20\d{2}|\d{2})\b/.exec(texto ?? '');
  if (d) return `${d[1]}-${d[2].length === 2 ? `20${d[2]}` : d[2]}`;
  return /\b(20\d{2})\b/.exec(texto ?? '')?.[1] ?? null;
}

/** Jornadas del grupo: tablas con cabecera «Jornada N». */
export function partidosDelGrupo(html) {
  const salida = [];
  for (const t of html.split(/<th[^>]*colspan="2"[^>]*>\s*Jornada\s+/).slice(1)) {
    const jornada = Number(/^(\d+)/.exec(t)?.[1]) || null;
    const tabla = t.slice(0, t.indexOf('</table>'));
    for (const fila of tabla.split('<tr').slice(1)) {
      const celdas = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => limpia(decodificaEntidades(m[1])));
      if (celdas.length < 3) continue;
      const [local, visitante, res] = celdas;
      const descanso = [local, visitante].some((n) => /^DESCANSA$/i.test(n));
      const g = /^(\d+)\s*-\s*(\d+)$/.exec(res);
      salida.push({ jornada, local: { nombre: local || null }, visitante: { nombre: visitante || null },
        goles_local: g && !descanso ? Number(g[1]) : null, goles_visitante: g && !descanso ? Number(g[2]) : null,
        jugado: Boolean(g) && !descanso, ...(descanso ? { descanso: true } : {}) });
    }
  }
  return salida;
}

export function creaAdaptadorVistahermosa() {
  return {
    nombre: 'vistahermosa', deporte: 'futbol',
    semillas: () => [{ tipo: 'menu', url: `${BASE}?op=GRUPO&idcomp=1`, prioridad: 5, contexto: {} }],
    tipos: {
      // Cualquier página trae el menú completo: de él salen todas las competiciones (también las nuevas).
      menu: {
        revisitarHoras: 24 * 7,
        interpreta(html) {
          return { enlaces: competicionesDelMenu(html).map((c) => ({ tipo: 'grupo', prioridad: 10 + Math.max(0, 300 - c.idcomp) / 100,
            url: `${BASE}?op=GRUPO&idcomp=${c.idcomp}`, contexto: { ...c, temporada: temporadaDe(c.campeonato) } })) };
        },
      },
      grupo: {
        interpreta(html, { contexto }) {
          const ps = partidosDelGrupo(html);
          if (!ps.length) return { sinPublicar: true };
          const pendientes = ps.some((p) => !p.jugado && !p.descanso);
          return {
            registros: ps.map((p) => ({ tipo: 'partido', clave: `${contexto.idcomp}|${p.jornada}|${p.local.nombre}|${p.visitante.nombre}`,
              datos: { idcomp: contexto.idcomp, campeonato: contexto.campeonato, competicion: contexto.nombre, temporada: contexto.temporada, ...p } })),
            revisitarHoras: pendientes ? 48 : 24 * 30,
          };
        },
      },
    },
  };
}
export default creaAdaptadorVistahermosa();
