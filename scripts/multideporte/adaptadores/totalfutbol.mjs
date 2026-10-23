/**
 * totalFútbol (totalfutbol.es, producto de totalsports.es): gestor de campeonatos de F7 aficionado y
 * universitario de Madrid (Collado Villalba, Pozuelo/UFV/Escolapios, UPM, UCJC, Las Rozas, Aravaca,
 * Torrelodones, Paracuellos, Bomberos…). ASP.NET con HTML servido, sin sesión. Sondeo del 01/10/2026:
 *   Inicio.aspx?ids={sede}             → campeonatos de la sede (FasesGrupos.aspx?IdC=N)
 *   FasesGrupos.aspx?idc={campeonato}  → nombre, fase, grupos con sus equipos y la ÚLTIMA jornada de cada grupo
 *                                         (Resultados.aspx?IdJ=N); «fase anterior» = FasesGrupos.aspx?IdF=N
 *   Resultados.aspx?IdJ={jornada}      → partidos de la jornada (equipos con id, marcador, fecha, hora,
 *                                         ResultadoPartido.aspx?idpartido=N); «jornada anterior» = otro IdJ
 * Los ids de campeonato son correlativos y globales (1…~500): se siembran todos para tener el histórico.
 * Sólo equipos (las fichas de jugador no se piden).
 */
import { decodificaEntidades, limpia } from './_html.mjs';

const BASE = 'https://www.totalfutbol.es/ges/laweb/';
export const SEDES = [13, 14, 16, 17, 18, 19, 20, 22, 23];
const iso = (f) => { const m = /(\d{2})-(\d{2})-(\d{4})/.exec(f ?? ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const num = (t) => { const s = limpia(t); return /^\d+$/.test(s) ? Number(s) : null; };
const span = (html, id) => limpia(new RegExp(`<span id="${id}"[^>]*>([^<]*)`).exec(html)?.[1] ?? '') || null;
const postbackUrl = (html, nombre) => decodificaEntidades(new RegExp(`name="${nombre}"[^>]*onclick="[^"]*&quot;([A-Za-z]+\\.aspx\\?[^&]*?)&quot;`).exec(html)?.[1] ?? '') || null;

export function fasesYGrupos(html) {
  const campeonato = span(html, 'LabelCampeonato');
  const fase = span(html, 'LabelFase');
  const grupos = [...html.matchAll(/<a href="Resultados\.aspx\?IdJ=(\d+)">([\s\S]*?)<\/a>/g)].map((m) => {
    const nombre = limpia(/<span class="TextoBlanco12B"[^>]*>([^<]*)/.exec(m[2])?.[1] ?? '') || null;
    const equipos = [...m[2].matchAll(/<span class="TextoVerdeOscuro10"[^>]*>([^<]*)/g)].map((e) => limpia(e[1]));
    return { ultima_jornada: m[1], nombre, equipos };
  });
  return { campeonato, fase, grupos, fase_anterior: postbackUrl(html, 'AntFase') };
}

/** «20:00 h» o «12h» → «20:00» / «12:00». */
function hora(textos) {
  for (const t of textos) {
    const m = /^(\d{1,2})(?::(\d{2}))?\s*h?$/.exec(t);
    if (m) return `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`;
  }
  return null;
}

export function partidosDeJornada(html) {
  const campeonato = span(html, 'LabelCampeonato'), fase = span(html, 'LabelFase'), jornadaTxt = span(html, 'LabelJornada');
  const jornada = Number(/(\d+)/.exec(jornadaTxt ?? '')?.[1]) || null;
  const i = html.indexOf('id="PanelPartidos"');
  const partidos = [];
  if (i >= 0) {
    // Dos plantillas (antigua con alto fijo y fondo; nueva sin él): las dos comparten «position:relative;left:53px;».
    for (const b of html.slice(i).split(/<div style="[^"]*position:relative;left:53px;[^"]*">/).slice(1)) {
      const eq = [...b.matchAll(/href="DetEquipo\.aspx\?IdC=(\d+)&amp;IdE=(\d+)"[^>]*>([^<]*)<\/a>/g)];
      if (eq.length < 2) continue;
      const goles = [...b.matchAll(/<span class="TextoBlanco10B"[^>]*>([^<]*)<\/span>/g)].map((g) => num(g[1]));
      const textos = [...b.matchAll(/<span class="TextoNegro10"[^>]*>([^<]*)<\/span>/g)].map((t) => limpia(t[1]));
      const gl = goles[0] ?? null, gv = goles[1] ?? null;
      partidos.push({
        id_partido: /ResultadoPartido\.aspx\?idpartido=(\d+)/.exec(b)?.[1] ?? null, id_campeonato: eq[0][1],
        local: { id: eq[0][2], nombre: limpia(eq[0][3]) }, visitante: { id: eq[1][2], nombre: limpia(eq[1][3]) },
        goles_local: gl, goles_visitante: gv, jugado: gl != null && gv != null,
        fecha: iso(textos.find((t) => /\d{2}-\d{2}-\d{4}/.test(t))), hora: hora(textos),
        campo: textos.find((t) => !/\d{2}-\d{2}-\d{4}/.test(t) && !/^\d{1,2}(:\d{2})?\s*h?$/.test(t)) ?? null,
      });
    }
  }
  const ant = postbackUrl(html, 'AntJornada');
  // Desde la jornada 1 la flecha lleva a la fase (FasesGrupos): eso no es una jornada.
  return { campeonato, fase, jornada, partidos, anterior: ant && /^Resultados\.aspx/i.test(ant) ? ant : null };
}

export function creaAdaptadorTotalFutbol({ maxCampeonato = 520, sedes = SEDES } = {}) {
  const prioCamp = (id) => 10 + Math.max(0, Math.floor((maxCampeonato - Number(id)) / 25));
  return {
    nombre: 'totalfutbol', deporte: 'futbol',
    semillas: () => [
      ...sedes.map((s) => ({ tipo: 'sede', url: `${BASE}Inicio.aspx?ids=${s}`, prioridad: 5, contexto: { sede: s } })),
      ...Array.from({ length: maxCampeonato }, (_, k) => k + 1).map((id) => ({ tipo: 'fase', url: `${BASE}FasesGrupos.aspx?idc=${id}`, prioridad: prioCamp(id), contexto: { idc: id } })),
    ],
    tipos: {
      sede: {
        interpreta(html) {
          const ids = [...new Set([...html.matchAll(/FasesGrupos\.aspx\?IdC=(\d+)/gi)].map((m) => m[1]))];
          return { enlaces: ids.map((id) => ({ tipo: 'fase', url: `${BASE}FasesGrupos.aspx?idc=${id}`, prioridad: 6, contexto: { idc: Number(id) } })), revisitarHoras: 24 * 7 };
        },
      },
      fase: {
        interpreta(html, { contexto }) {
          const f = fasesYGrupos(html);
          // Un id sin campeonato devuelve una página sin título: no hay nada que guardar ni que volver a mirar.
          if (!f.campeonato) return { registros: [], enlaces: [] };
          const enlaces = f.grupos.map((g) => ({ tipo: 'jornada', url: `${BASE}Resultados.aspx?IdJ=${g.ultima_jornada}`, prioridad: 4,
            contexto: { idc: contexto.idc, campeonato: f.campeonato, fase: f.fase, grupo: g.nombre } }));
          if (f.fase_anterior) enlaces.push({ tipo: 'fase', url: `${BASE}${f.fase_anterior}`, prioridad: 6, contexto: { idc: contexto.idc } });
          return {
            registros: [{ tipo: 'fase', clave: `${contexto.idc}|${f.fase}`, datos: { idc: contexto.idc, campeonato: f.campeonato, fase: f.fase,
              grupos: f.grupos.map((g) => ({ nombre: g.nombre, equipos: g.equipos })) } }],
            enlaces, revisitarHoras: 24 * 3,
          };
        },
      },
      jornada: {
        interpreta(html, { contexto, url }) {
          const j = partidosDeJornada(html);
          const enlaces = [];
          if (j.anterior && !url.endsWith(j.anterior)) enlaces.push({ tipo: 'jornada', url: `${BASE}${j.anterior}`, prioridad: 4, contexto });
          if (!j.partidos.length) return { enlaces, sinPublicar: enlaces.length === 0 ? true : undefined };
          const base = { idc: contexto.idc, campeonato: j.campeonato ?? contexto.campeonato, fase: j.fase ?? contexto.fase, grupo: contexto.grupo ?? null, jornada: j.jornada };
          const pendientes = j.partidos.some((p) => !p.jugado);
          return {
            registros: j.partidos.map((p, k) => ({ tipo: 'partido', clave: p.id_partido ?? `${url}#${k}`, datos: { ...base, ...p } })),
            enlaces,
            revisitarHoras: pendientes ? 48 : undefined,
          };
        },
      },
    },
  };
}
export default creaAdaptadorTotalFutbol();
