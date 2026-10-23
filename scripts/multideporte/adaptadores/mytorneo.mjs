/**
 * myTorneo (mytorneo.com, «Gestor online de torneos y ligas de fútbol»): HTML sencillo, robots.txt permite todo
 * salvo `/img/` y `*\/jugadores/*`. Hoy sólo tiene ligas activas en Cáceres (veteranos F7, 171 torneos desde
 * 2023-24), pero la portada enlaza una página por provincia y se miran todas. Sondeo del 02/10/2026:
 *   /                                   → enlaces /torneos-ligas-en-<provincia>/ y a las ligas destacadas
 *   /torneos-ligas-en-<provincia>/      → enlaces a ligas <provincia>/<categoria>/<liga>
 *   <liga>/jornada-N.html               → «Ver jornada» (todas las jornadas), tabla «proximos» (fecha, hora, campo,
 *                                         equipos) y bloque «Resultados» (marcador y enlace al partido con su id)
 * Sólo equipos: no se piden fichas de jugadores (además, robots las excluye).
 */
import { decodificaEntidades, limpia } from './_html.mjs';

const BASE = 'https://www.mytorneo.com/';
const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const unicos = (xs) => [...new Set(xs)];

/** Ligas enlazadas: rutas de tres tramos sin extensión (provincia/categoría/liga). */
export const ligasEnlazadas = (html) => unicos([...html.matchAll(/href="\/?([a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+)\/?"/g)]
  .map((m) => m[1]).filter((r) => !/^(jqu|css|img|js)\//.test(r)));
export const provinciasEnlazadas = (html) => unicos([...html.matchAll(/href="\/?(torneos-ligas-en-[a-z-]+)\/?"/g)].map((m) => m[1]));
/** Números de jornada del desplegable «Ver Jornada». */
export const jornadasDe = (html) => unicos([...html.matchAll(/<option value="(\d+)"[^>]*>\s*Jornada\s+\d+/g)].map((m) => Number(m[1])));

/** Año de inicio de la temporada a partir del nombre de la liga («…-2026-2027-…» o «…2026/27…»). */
export function anioInicio(texto) {
  const m = /(20\d{2})[-/](?:20)?(\d{2})\b/.exec(texto ?? '');
  return m ? Number(m[1]) : null;
}
/** «25 Sep» con la temporada 2026-27 → 2026-09-25 (de julio a diciembre, el primer año; si no, el segundo). */
export function fechaIso(diaMes, inicio) {
  const m = /(\d{1,2})\s+([A-Za-zé]{3})/.exec(diaMes ?? '');
  if (!m || !inicio) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  const anio = mes >= 7 ? inicio : inicio + 1;
  return `${anio}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
const equipo = (trozo) => {
  const m = /href="[^"]*\/equipos\/[a-z0-9-]+-(\d+)\.html" title="([^"]*)"/.exec(trozo);
  return m ? { id: m[1], nombre: limpia(m[2]) } : null;
};

/** Partidos de una página de jornada: cruza «Horarios» (fecha, hora, campo) con «Resultados» (marcador, id). */
export function partidosDeJornada(html, inicio) {
  const porPareja = new Map();
  const clave = (l, v) => `${l?.id}|${v?.id}`;
  const i = html.indexOf('<table class="proximos"');
  if (i >= 0) {
    const tabla = html.slice(i, html.indexOf('</table>', i));
    for (const fila of tabla.split('<tr').slice(1)) {
      const eqs = fila.split('class="equipos"').slice(1).map(equipo);
      if (eqs.length < 2 || !eqs[0] || !eqs[1]) continue;
      const fecha = decodificaEntidades(limpia(/class="fecha">([\s\S]*?)<\/td>/.exec(fila)?.[1] ?? ''));
      porPareja.set(clave(eqs[0], eqs[1]), {
        id_partido: null, local: eqs[0], visitante: eqs[1], fecha: fechaIso(fecha, inicio), fecha_texto: fecha || null,
        hora: /class="hora">\s*(\d{1,2}:\d{2})/.exec(fila)?.[1] ?? null,
        campo: limpia(/class="lugar">([\s\S]*?)<\/td>/.exec(fila)?.[1] ?? '') || null,
        goles_local: null, goles_visitante: null, jugado: false,
      });
    }
  }
  for (const r of html.split('<div class="resultado">').slice(1)) {
    const izq = r.slice(0, r.indexOf('resultado_cen'));
    const cen = r.slice(r.indexOf('resultado_cen'), r.indexOf('resultado_der'));
    const der = r.slice(r.indexOf('resultado_der'));
    const l = equipo(izq); const v = equipo(der);
    if (!l || !v) continue;
    const g = /<b>\s*(\d+)(?:&nbsp;|\s)*-(?:&nbsp;|\s)*(\d+)\s*<\/b>/.exec(cen);
    const p = porPareja.get(clave(l, v)) ?? { local: l, visitante: v, fecha: null, fecha_texto: null, hora: null, campo: null };
    porPareja.set(clave(l, v), { ...p, id_partido: /-(\d+)\.html"/.exec(cen)?.[1] ?? null,
      goles_local: g ? Number(g[1]) : null, goles_visitante: g ? Number(g[2]) : null, jugado: Boolean(g) });
  }
  return [...porPareja.values()];
}

const jornada = {
  interpreta(html, { contexto, url }) {
    const liga = contexto.liga;
    const [provincia, categoria] = liga.split('/');
    const n = contexto.jornada ?? Number(/jornada-(\d+)\.html/.exec(url)?.[1]) ?? null;
    const nombre = limpia(/<h1>\s*Jornada\s+\d+\s+([^<]+)<\/h1>/.exec(html)?.[1] ?? '') || null;
    const ps = partidosDeJornada(html, anioInicio(liga) ?? anioInicio(nombre));
    return {
      registros: ps.map((p) => ({ tipo: 'partido', clave: p.id_partido ?? `${liga}|${n}|${p.local.id}|${p.visitante.id}`,
        datos: { liga, competicion: nombre, provincia, categoria, jornada: n, ...p } })),
      revisitarHoras: ps.some((p) => !p.jugado) ? 48 : undefined,
    };
  },
};

export function creaAdaptadorMyTorneo() {
  return {
    nombre: 'mytorneo', deporte: 'futbol',
    semillas: () => [{ tipo: 'portada', url: BASE, prioridad: 5, contexto: {} }],
    tipos: {
      portada: {
        revisitarHoras: 24 * 7,
        interpreta(html) {
          return { enlaces: [
            ...provinciasEnlazadas(html).map((p) => ({ tipo: 'provincia', url: `${BASE}${p}/`, prioridad: 6, contexto: { provincia: p.replace('torneos-ligas-en-', '') } })),
            ...ligasEnlazadas(html).map((l) => ({ tipo: 'liga', url: `${BASE}${l}/jornada-1.html`, prioridad: 7, contexto: { liga: l } })),
          ] };
        },
      },
      provincia: {
        revisitarHoras: 24 * 7,
        interpreta(html) {
          return { enlaces: ligasEnlazadas(html).map((l) => ({ tipo: 'liga', url: `${BASE}${l}/jornada-1.html`, prioridad: 7, contexto: { liga: l } })) };
        },
      },
      // La jornada 1 de cada liga sirve de índice: trae el desplegable con todas las jornadas.
      liga: {
        revisitarHoras: 24 * 3,
        interpreta(html, ctx) {
          const r = jornada.interpreta(html, ctx);
          const nombre = limpia(/<h1>\s*Jornada\s+\d+\s+([^<]+)<\/h1>/.exec(html)?.[1] ?? '') || null;
          const enlaces = jornadasDe(html).filter((n) => n !== 1).map((n) => ({ tipo: 'jornada', prioridad: 8,
            url: `${BASE}${ctx.contexto.liga}/jornada-${n}.html`, contexto: { ...ctx.contexto, jornada: n } }));
          return { registros: [...(r.registros ?? []), { tipo: 'liga', clave: ctx.contexto.liga, datos: { liga: ctx.contexto.liga, nombre, jornadas: jornadasDe(html).length } }],
            enlaces, revisitarHoras: r.revisitarHoras ?? 24 * 3 };
        },
      },
      jornada,
    },
  };
}


export default creaAdaptadorMyTorneo();
