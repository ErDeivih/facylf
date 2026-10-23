/**
 * FEB «Baloncesto en Vivo» (baloncestoenvivo.feb.es): baloncesto nacional NO profesional (Liga EBA, Tercera y
 * Segunda FEB, Liga Femenina 2, Liga U, Copa España) y campeonatos de España de base. Sondeo del 30/09/2026:
 *   /calendario/{nm}/{g}/{t}   → temporada completa del grupo seleccionado: jornadas, equipos, Partido.aspx?p=N
 *                                 (si ya se jugó, el enlace lleva el marcador «68-74»)
 *   los demás grupos           → «postback» de ASP.NET (POST con __VIEWSTATE y el grupo elegido)
 *   /Partido.aspx?p=N          → box score: parciales por cuarto, árbitros, pista y estadística por jugador
 * Las ligas profesionales (LF Endesa, Primera FEB, LF Challenge) se dejan fuera a propósito.
 * Menores (campeonatos de base): se guarda el partido y los totales del equipo, NO los nombres de jugadores.
 */
import { decodificaEntidades, limpia } from './_html.mjs';

const BASE = 'https://baloncestoenvivo.feb.es';
export const COMPETICIONES = [
  { g: 57, nm: 'ligaeba', nombre: 'Liga EBA' }, { g: 3, nm: 'tercerafeb', nombre: 'Tercera FEB' },
  { g: 2, nm: 'segundafeb', nombre: 'Segunda FEB' }, { g: 9, nm: 'lf2', nombre: 'Liga Femenina 2' },
  { g: 74, nm: 'ligau', nombre: 'Liga U' }, { g: 73, nm: 'copaespaa', nombre: 'Copa España' },
  { g: 44, nm: 'fasefinal1divisinfemenin', nombre: 'Fase final 1ª División Femenina' },
  { g: 21, nm: 'cespclubesjrmasc', nombre: 'CE Clubes Junior Masc.', menores: true },
  { g: 22, nm: 'cespclubesjrfem', nombre: 'CE Clubes Junior Fem.', menores: true },
  { g: 35, nm: 'cespclubescadmasc', nombre: 'CE Clubes Cadete Masc.', menores: true },
  { g: 36, nm: 'cespclubescadfem', nombre: 'CE Clubes Cadete Fem.', menores: true },
  { g: 37, nm: 'cespclubesinfmasc', nombre: 'CE Clubes Infantil Masc.', menores: true },
  { g: 38, nm: 'cespclubesinffem', nombre: 'CE Clubes Infantil Fem.', menores: true },
  { g: 71, nm: 'cespclubesminimasc', nombre: 'CE Clubes Mini Masc.', menores: true },
  { g: 72, nm: 'cespclubesminifem', nombre: 'CE Clubes Mini Fem.', menores: true },
  { g: 19, nm: 'cessaaminimas', nombre: 'CE Selecciones Mini Masc.', menores: true },
  { g: 20, nm: 'cessaaminifem', nombre: 'CE Selecciones Mini Fem.', menores: true },
  { g: 25, nm: 'cessaainfantilmas', nombre: 'CE Selecciones Infantil Masc.', menores: true },
  { g: 26, nm: 'cessaainfantilfem', nombre: 'CE Selecciones Infantil Fem.', menores: true },
  { g: 40, nm: 'cessaacadetemas', nombre: 'CE Selecciones Cadete Masc.', menores: true },
  { g: 41, nm: 'cessaacadetefem', nombre: 'CE Selecciones Cadete Fem.', menores: true },
];

export function opciones(html, nombreCampo) {
  const m = new RegExp(`<select[^>]*name="[^"]*${nombreCampo}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
  if (!m) return [];
  return [...m[1].matchAll(/<option([^>]*)value="([^"]*)"[^>]*>([^<]*)/g)]
    .map((o) => ({ valor: o[2], texto: limpia(o[3]), elegido: /selected/.test(o[1]) }));
}

/** Campos del formulario de ASP.NET para repetir la página eligiendo otro valor de un desplegable. */
export function cuerpoPostback(html, campo, valor) {
  const ocultos = Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)"[^>]*value="([^"]*)"/g)]
    .map((m) => [m[1], decodificaEntidades(m[2])]));
  const nombre = /<select[^>]*name="([^"]*gruposDropDownList)"/.exec(html)?.[1];
  const temporadas = /<select[^>]*name="([^"]*temporadasDropDownList)"/.exec(html)?.[1];
  const p = new URLSearchParams({ ...ocultos, __EVENTTARGET: nombre?.replace(/:/g, '$') ?? '', __EVENTARGUMENT: '', __LASTFOCUS: '' });
  if (temporadas) p.set(temporadas, opciones(html, 'temporadasDropDownList').find((o) => o.elegido)?.valor ?? '');
  if (nombre && campo === 'grupo') p.set(nombre, valor);
  return p.toString();
}

export function accionDelFormulario(html) {
  const a = /<form[^>]*action="([^"]+)"/.exec(html)?.[1];
  return a ? new URL(decodificaEntidades(a), BASE).href : null;
}

/** Partidos del calendario de un grupo, con su jornada. */
export function partidosDelCalendario(html) {
  const salida = [];
  const bloques = html.split(/<h1 class="titulo-modulo">/).slice(1);
  for (const b of bloques) {
    const cab = limpia(b.slice(0, b.indexOf('</h1>')));
    const jornada = Number(/Jornada\s+(\d+)/.exec(cab)?.[1]) || null;
    for (const f of b.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const fila = f[1];
      if (!fila.includes('Partido.aspx?p=')) continue;
      const eq = [...fila.matchAll(/href="[^"]*Equipo\.aspx\?i=(\d+)">([^<]*)<\/a>/g)].map((e) => ({ id: e[1], nombre: limpia(e[2]) }));
      const p = /Partido\.aspx\?p=(\d+)'?"?>([\s\S]*?)<\/a>/.exec(fila);
      const texto = limpia((p?.[2] ?? '').replace(/<br\s*\/?>/g, ' '));
      const marcador = /^(\d+)\s*-\s*(\d+)$/.exec(texto);
      const fecha = /(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
      salida.push({
        id_partido: p?.[1] ?? null, jornada, local: eq[0] ?? null, visitante: eq[1] ?? null,
        puntos_local: marcador ? Number(marcador[1]) : null, puntos_visitante: marcador ? Number(marcador[2]) : null,
        jugado: Boolean(marcador),
        fecha: fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null, hora: /(\d{2}:\d{2})/.exec(texto)?.[1] ?? null,
      });
    }
  }
  return salida;
}

const n = (x) => { const t = String(x ?? '').trim().replace(',', '.'); return t === '' || Number.isNaN(Number(t)) ? null : Number(t); };

/** Box score de Partido.aspx. Con `sinNombres` (base), los jugadores quedan sólo con dorsal y números. */
export function boxScore(html, { sinNombres = false } = {}) {
  const nombre = (lado) => limpia(new RegExp(`equipo${lado}Nombre">([^<]*)`).exec(html)?.[1] ?? '') || null;
  const id = (lado) => new RegExp(`equipo${lado}HyperLink" href="[^"]*Equipo\\.aspx\\?i=(\\d+)`).exec(html)?.[1] ?? null;
  const resultados = [...html.matchAll(/<span class="resultado">(\d+)<\/span>/g)].map((m) => Number(m[1]));
  const parciales = [...html.matchAll(/<span class="cuarto">([^<]+)<\/span><span class="marcador">(\d+)\/(\d+)<\/span>/g)]
    .map((m) => ({ periodo: limpia(m[1]), local: Number(m[2]), visitante: Number(m[3]) }));
  const texto = limpia(html.replace(/<table[\s\S]*$/, ''));
  const fecha = /Fecha\s+(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}:\d{2})/.exec(texto);
  const equipos = [];
  for (const t of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    if (!t[1].includes('class="dorsal"')) continue;
    const jugadores = [];
    for (const f of t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const celdas = [...f[1].matchAll(/<td class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)].map((c) => [c[1], limpia(c[2])]);
      if (!celdas.length) continue;
      const v = (cls) => celdas.find(([c]) => c === cls)?.[1];
      const dorsal = v('dorsal');
      if (dorsal == null || dorsal === '') continue;
      jugadores.push({
        dorsal, ...(sinNombres ? {} : { nombre: v('nombre jugador') ?? null }), titular: v('inicial') === '*',
        minutos: v('minutos') ?? null, puntos: n(v('puntos')), t2: v('tiros dos') ?? null, t3: v('tiros tres') ?? null,
        tl: v('tiros libres') ?? null, rebotes: n(v('rebotes total')), asistencias: n(v('asistencias')),
        faltas: n(v('faltas cometidas')), valoracion: n(v('valoracion')),
      });
    }
    equipos.push(jugadores);
  }
  return {
    competicion: limpia(/<span class="liga">([^<]*)/.exec(html)?.[1] ?? '') || null,
    temporada: limpia(/<span class="temporada">([^<]*)/.exec(html)?.[1] ?? '') || null,
    local: { id: id('Local'), nombre: nombre('Local') }, visitante: { id: id('Visitante'), nombre: nombre('Visitante') },
    puntos_local: resultados[0] ?? null, puntos_visitante: resultados[1] ?? null, parciales,
    fecha: fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null, hora: fecha?.[4] ?? null,
    arbitros: /Árbitros\s+(.+?)\s+Pista\s/.exec(texto)?.[1] ?? null,
    pista: /Pista\s+(.+?)(?:\s+%|$)/.exec(texto)?.[1] ?? null,
    jugadores_local: equipos[0] ?? [], jugadores_visitante: equipos[1] ?? [],
  };
}

export function creaAdaptadorFeb({ temporadas = [2026, 2025, 2024, 2023], competiciones = COMPETICIONES, ahora = () => new Date() } = {}) {
  const actual = () => { const d = ahora(); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
  const prio = (t, nivel) => (Number(t) === actual() ? 10 : 20 + (actual() - Number(t)) * 10) + nivel;
  return {
    nombre: 'feb', deporte: 'baloncesto',
    semillas: () => competiciones.flatMap((c) => temporadas.map((t) => ({
      tipo: 'calendario', url: `${BASE}/calendario/${c.nm}/${c.g}/${t}`, prioridad: prio(t, 0),
      contexto: { competicion: c, temporada: t, abrirGrupos: true } }))),
    tipos: {
      calendario: {
        interpreta(html, { contexto }) {
          const grupos = opciones(html, 'gruposDropDownList');
          const grupo = grupos.find((g) => g.elegido) ?? contexto.grupo ?? null;
          const partidos = partidosDelCalendario(html);
          if (!partidos.length && !grupos.length) return { sinPublicar: true };
          const base = { competicion: contexto.competicion.nombre, g: contexto.competicion.g, temporada: contexto.temporada,
            grupo: grupo ? { id: grupo.valor, nombre: grupo.texto } : null };
          const enlaces = partidos.filter((p) => p.jugado && p.id_partido).map((p) => ({ tipo: 'partido', prioridad: prio(contexto.temporada, 3),
            url: `${BASE}/Partido.aspx?p=${p.id_partido}`, contexto: { ...base, menores: Boolean(contexto.competicion.menores), id_partido: p.id_partido } }));
          if (contexto.abrirGrupos) {
            const accion = accionDelFormulario(html);
            for (const g of grupos.filter((x) => !x.elegido)) {
              enlaces.push({ tipo: 'calendario', prioridad: prio(contexto.temporada, 1), url: accion, cuerpo: cuerpoPostback(html, 'grupo', g.valor),
                contexto: { competicion: contexto.competicion, temporada: contexto.temporada, grupo: g, abrirGrupos: false } });
            }
          }
          const abiertos = partidos.some((p) => !p.jugado);
          return {
            registros: partidos.filter((p) => p.id_partido).map((p) => ({ tipo: 'partido', clave: p.id_partido, datos: { ...base, ...p } })),
            enlaces,
            revisitarHoras: Number(contexto.temporada) === actual() && abiertos ? 24 : undefined,
          };
        },
      },
      partido: {
        interpreta(html, { contexto }) {
          // Desde el 05/10/2026 también con nombres en base (se recoge todo; `menores` marca el partido, no se publica).
          const b = boxScore(html);
          return { registros: [{ tipo: 'box-score', clave: contexto.id_partido, datos: { ...contexto, ...b } }] };
        },
      },
    },
  };
}

export default creaAdaptadorFeb();
