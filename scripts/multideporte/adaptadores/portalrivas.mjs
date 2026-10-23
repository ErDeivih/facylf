/**
 * PortalRivas (portalrivas.com): ligas municipales de Rivas-Vaciamadrid (Madrid) — F11, F7 de 1.ª a 5.ª, F7
 * veteranos y fútbol sala—, con histórico desde 2010/2011. robots.txt permisivo. Sondeo del 05/10/2026:
 *   /<categoria>-rivas.php                 → selector de temporadas (#temp) y el código de la categoría
 *                                            («categoria_padre», p. ej. 1F7) en sus fases (#cat2)
 *   POST /otras-fases-js.php               → fases de una categoría en una temporada (1F7, 1F7-GA, 1F7-GB…)
 *        queryString=<temporada>&queryString2=<categoría>
 *   POST /calendario-js.php                → calendario completo de una fase: jornada, local y visitante con id,
 *        queryString=<temporada>&queryString2=<fase>   marcador, id de partido, fecha, hora y campo
 * Sólo equipos: no se piden fichas de jugadores ni goleadores.
 */
import { decodificaEntidades, limpia } from './_html.mjs';

const BASE = 'https://www.portalrivas.com';
const unicos = (xs) => [...new Set(xs)];
export const paginasDeCategoria = (html) => unicos([...html.matchAll(/href=['"]\/?(futbol[a-z0-9-]*-rivas\.php)['"]/gi)].map((m) => m[1]));
export const temporadasDe = (html) => unicos([...(/<select id="temp"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '').matchAll(/value=['"]?(\d{4}\/\d{4})/g)].map((m) => m[1]));
/** Código de la categoría: el de la consulta que la propia página deja escrita, o el de su primera fase. */
export const codigoDeCategoria = (html) => /categoria_padre='([^']+)'/.exec(html)?.[1] || /cambiar_categoria\("([^"]+)"\)/.exec(html)?.[1] || null;
export const fasesDe = (html) => unicos([...html.matchAll(/cambiar_categoria\("([^"]+)"\)/g)].map((m) => m[1]));

const cuerpo = (o) => new URLSearchParams(o).toString();
/** Temporada en curso con el formato de la web («2026/2027»; empieza en julio). */
export const temporadaEnCurso = (d = new Date()) => { const y = d.getUTCFullYear() - (d.getUTCMonth() < 6 ? 1 : 0); return `${y}/${y + 1}`; };

/** Partidos del calendario completo de una fase. */
export function partidosDelCalendario(html) {
  const salida = [];
  const bloques = html.split("<h1 class='group-header'>Jornada ").slice(1);
  for (const b of bloques) {
    const jornada = Number(/^(\d+)/.exec(b)?.[1]) || null;
    for (const fila of b.split(/<tr[^>]*>/).slice(1)) {
      const eqs = [...fila.matchAll(/href='ficha-equipo\.php\?id=(\d+)'>([^<]+)<\/a>/g)].map((m) => ({ id: m[1], nombre: limpia(decodificaEntidades(m[2])) }));
      const celdas = fila.split('<td').slice(1).map((c) => limpia(decodificaEntidades(c.replace(/^[^>]*>/, '').replace(/<br\s*\/?>/g, ' '))));
      if (celdas.length < 5) continue;
      // Columnas: escudo, local, resultado, visitante, escudo, fecha, campo. «DESCANSA» no lleva enlace de equipo.
      const local = eqs.length >= 2 ? eqs[0] : { id: null, nombre: celdas[1] || null };
      const visitante = eqs.length >= 2 ? eqs[eqs.length - 1] : { id: null, nombre: celdas[3] || null };
      if (eqs.length === 1) { if (celdas[1] === eqs[0].nombre) Object.assign(local, eqs[0]); else Object.assign(visitante, eqs[0]); }
      const descanso = [local.nombre, visitante.nombre].some((n) => /^DESCANSA/i.test(n ?? ''));
      const res = /(\d+)\s*-\s*(\d+)/.exec(celdas[2] ?? '');
      const f = /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}))?/.exec(celdas[5] ?? '');
      const campo = /title='([^']*)' onClick='initialize/.exec(fila)?.[1];
      salida.push({
        jornada, id_partido: /ficha-partido\.php\?id=(\d+)/.exec(fila)?.[1] ?? null,
        local, visitante,
        goles_local: res && !descanso ? Number(res[1]) : null, goles_visitante: res && !descanso ? Number(res[2]) : null,
        jugado: Boolean(res) && !descanso,
        fecha: f ? `${f[3]}-${f[2]}-${f[1]}` : null,
        // «00:00» es la hora sin fijar (lo que publica la web cuando aún no hay horario).
        hora: f?.[4] && f[4] !== '00:00' ? f[4].padStart(5, '0') : null,
        campo: campo ? limpia(decodificaEntidades(campo)) : null,
        ...(descanso ? { descanso: true } : {}),
      });
    }
  }
  return salida;
}

export function creaAdaptadorPortalRivas({ desde = '0000' } = {}) {   // todo el histórico (desde 2009/2010)
  return {
    nombre: 'portalrivas', deporte: 'futbol',
    semillas: () => [{ tipo: 'categoria', url: `${BASE}/futbol7-primera-rivas.php`, prioridad: 5, contexto: { pagina: 'futbol7-primera-rivas.php' } }],
    tipos: {
      // Página de una categoría: de aquí salen las demás categorías, las temporadas y el código de la categoría.
      categoria: {
        revisitarHoras: 24 * 7,
        interpreta(html, { contexto }) {
          const codigo = codigoDeCategoria(html);
          const nombre = limpia(/<title>([^<]*)/.exec(html)?.[1] ?? '') || null;
          const enlaces = paginasDeCategoria(html).filter((p) => p !== contexto.pagina).map((p) => ({
            tipo: 'categoria', prioridad: 5, url: `${BASE}/${p}`, contexto: { pagina: p } }));
          if (codigo) {
            for (const t of temporadasDe(html).filter((x) => x >= desde)) {
              enlaces.push({ tipo: 'fases', prioridad: 10, url: `${BASE}/otras-fases-js.php`, identidad: `${t}|${codigo}`,
                cuerpo: cuerpo({ queryString: t, queryString2: codigo }), contexto: { categoria: codigo, nombre, temporada: t } });
            }
          }
          return { enlaces };
        },
      },
      fases: {
        revisitarHoras: 24 * 7,
        interpreta(html, { contexto }) {
          // Sin fases, la categoría no existía esa temporada: no se pide nada más.
          const lista = fasesDe(html);
          return { enlaces: lista.map((f) => ({ tipo: 'calendario', prioridad: 20, url: `${BASE}/calendario-js.php`, identidad: `${contexto.temporada}|${f}`,
            cuerpo: cuerpo({ queryString: contexto.temporada, queryString2: f }), contexto: { ...contexto, fase: f } })) };
        },
      },
      calendario: {
        interpreta(html, { contexto }) {
          const ps = partidosDelCalendario(html);
          // Vacío: en la temporada en curso puede estar aún sin publicar; en una pasada, no hay nada que esperar.
          if (!ps.length) return contexto.temporada >= temporadaEnCurso() ? { sinPublicar: true } : {};
          const enCurso = ps.some((p) => !p.jugado && !p.descanso);
          return {
            registros: ps.map((p) => ({ tipo: 'partido', clave: p.id_partido ?? `${contexto.temporada}|${contexto.fase}|${p.jornada}|${p.local.nombre}|${p.visitante.nombre}`,
              datos: { temporada: contexto.temporada, categoria: contexto.categoria, competicion: contexto.nombre, fase: contexto.fase, ...p } })),
            // Temporada con partidos por jugar: otra vuelta en 48 h; terminada, una al mes por si corrigen algo.
            revisitarHoras: enCurso ? 48 : 24 * 30,
          };
        },
      },
    },
  };
}
export default creaAdaptadorPortalRivas();
