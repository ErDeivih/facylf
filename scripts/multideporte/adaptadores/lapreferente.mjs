/**
 * La Preferente (lapreferente.com), categorías «No Federado» y «Veteranos» de fútbol: ligas de peñas,
 * locales, de empresas y de veteranos (sobre todo Andalucía, también otras comunidades). robots.txt permisivo.
 * Sondeo del 01/10/2026:
 *   página de cualquier competición (C{id}-1/{slug}/widget.html) → desplegables por categoría con TODAS las
 *       competiciones de su comunidad («grupo24» = No Federado, «grupo21» = Veteranos), el selector de jornadas
 *       (index.php?comp={id}&accion=widget&jor={n}, con la fecha) y el de temporadas (index.php?gr=&temporada=)
 *   página de jornada → tabla «panelResultados{comp}-{jor}»: local, visitante (con id de escudo), marcador
 * Como semilla de cada comunidad se usa su grupo de Tercera Federación 2025-26 (sólo para leer los desplegables).
 * Codificación ISO-8859-1 (windows-1252). Sólo equipos: no se piden plantillas ni fichas de jugador.
 */
import { decodificaEntidades, limpia } from './_html.mjs';

const BASE = 'https://www.lapreferente.com/';
// Tercera Federación 2025-26, grupos 1-18 (una por comunidad; el 9 y el 10 cubren también Melilla y Ceuta).
export const SEMILLAS = [22317, 22284, 22282, 22283, 22365, 22262, 22362, 22363, 22266, 22265, 22298, 22310, 22285, 22286, 22287, 22281, 22288, 22289];
export const CATEGORIAS = { 24: 'No Federado', 21: 'Veteranos' };
// Histórico (02/10/2026): desde 2015-16. Las temporadas pasadas se leen una vez y se revisitan cada 90 días.
const DESDE = 20152016;
/** Temporada en curso como 20252026 (empieza en julio). */
export const temporadaEnCurso = (d = new Date()) => { const y = d.getUTCFullYear() - (d.getUTCMonth() < 6 ? 1 : 0); return y * 10000 + y + 1; };
const esPasada = (t) => { const n = Number(String(t ?? '').replace(/\D/g, '').slice(0, 8)); return n > 0 && n < temporadaEnCurso(); };

const opciones = (html, id) => {
  const m = new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
  return m ? [...m[1].matchAll(/<option([^>]*)value="([^"]*)"[^>]*>([^<]*)/g)].map((o) => ({ attrs: o[1], valor: decodificaEntidades(o[2]), texto: limpia(o[3]) })) : [];
};
const iso = (f) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(f ?? ''); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };

/** Datos de la competición que la página lleva en JSON dentro de un atributo. */
export function meta(html) {
  const m = /onChangeTemporada\(this,(\{[\s\S]*?\}),/.exec(html);
  if (!m) return null;
  try { const j = JSON.parse(decodificaEntidades(m[1])); return { id: j.ID, nombre: j.nombre, temporada: j.temporada, categoria: j.categoria, id_categoria: j.IDcategoria, division: j.division, id_ccaa: j.IDccaa, grupo: j.IDgrupo }; }
  catch { return null; }
}

export function temporadas(html) {
  const i = html.indexOf('onChangeTemporada');
  if (i < 0) return [];
  const sel = html.slice(i, html.indexOf('</select>', i));
  return [...sel.matchAll(/<option value="(\d{8})" url="([^"]+)"/g)].map((m) => ({ temporada: Number(m[1]), url: new URL(decodificaEntidades(m[2]), BASE).href }));
}

export function jornadas(html, comp) {
  return [...html.matchAll(new RegExp(`<option[^>]*value="(index\\.php\\?comp=${comp}&(?:amp;)?accion=widget&(?:amp;)?jor=(\\d+))"[^>]*>([^<]*)`, 'g'))]
    .map((m) => ({ url: new URL(decodificaEntidades(m[1]), BASE).href, jornada: Number(m[2]), fecha: iso(m[3]) }));
}

export function partidosDeJornada(html, comp, jor) {
  const i = html.indexOf(`id="panelResultados${comp}-${jor}"`);
  if (i < 0) return { fecha: null, partidos: [], descansa: null };
  const tabla = html.slice(i, html.indexOf('</table>', i));
  const fecha = iso(/JORNADA\s+\d+\s*-\s*([\d/]+)/i.exec(limpia(tabla))?.[1]);
  const partidos = [];
  for (const f of tabla.split(/<tr id="filaPartido"/).slice(1)) {
    const eq = [...f.matchAll(/escudo-(\d+)\.[a-z]+[^>]*>\s*<span[^>]*>([^<]*)<\/span>/g)];
    if (eq.length < 2) continue;
    const res = limpia(/class="v11redb"[^>]*>([\s\S]*?)<\/td>/.exec(f)?.[1] ?? '');
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(res);
    partidos.push({ local: { id: eq[0][1], nombre: limpia(eq[0][2]) }, visitante: { id: eq[1][1], nombre: limpia(eq[1][2]) },
      goles_local: m ? Number(m[1]) : null, goles_visitante: m ? Number(m[2]) : null, jugado: Boolean(m), marcador_texto: m ? undefined : res || undefined });
  }
  const descansa = limpia(/Descansa:\s*([^<]*)/.exec(tabla)?.[1] ?? '') || null;
  return { fecha, partidos, descansa };
}

export function creaAdaptadorLaPreferente({ semillas = SEMILLAS, categorias = CATEGORIAS, desde = DESDE } = {}) {
  const comp = (url) => Number(/C(\d+)-1\//.exec(url)?.[1] ?? /comp=(\d+)/.exec(url)?.[1] ?? 0);
  return {
    nombre: 'lapreferente', deporte: 'futbol', codificacion: 'windows-1252',
    semillas: () => semillas.map((id) => ({ tipo: 'region', url: `${BASE}C${id}-1/x/widget.html`, prioridad: 5, contexto: { semilla: id } })),
    tipos: {
      region: {
        interpreta(html) {
          const enlaces = [];
          for (const [id, nombre] of Object.entries(categorias)) {
            for (const o of opciones(html, `grupo${id}`)) {
              if (!/^C\d+-1\//.test(o.valor)) continue;
              enlaces.push({ tipo: 'competicion', url: BASE + o.valor, prioridad: 6, contexto: { categoria: nombre, nombre: o.texto } });
            }
          }
          // La misma semilla en otras temporadas trae las competiciones de esas temporadas.
          for (const t of temporadas(html).filter((x) => x.temporada >= desde)) enlaces.push({ tipo: 'region', url: t.url, prioridad: 7, contexto: { temporada: t.temporada } });
          return { enlaces, revisitarHoras: 24 * 7 };
        },
      },
      competicion: {
        interpreta(html, { contexto, url }) {
          const m = meta(html);
          const id = m?.id ? Number(m.id) : comp(url);
          if (!id) return { sinPublicar: true };
          const js = jornadas(html, id);
          const base = { competicion: { id, nombre: m?.nombre ?? contexto.nombre, categoria: m?.categoria ?? contexto.categoria, division: m?.division ?? null,
            ccaa: m?.id_ccaa ?? null, temporada: m?.temporada ?? null } };
          const enlaces = js.map((j) => ({ tipo: 'jornada', url: j.url, prioridad: 3, contexto: { ...base, jornada: j.jornada, fecha: j.fecha } }));
          for (const t of temporadas(html).filter((x) => x.temporada >= desde)) enlaces.push({ tipo: 'competicion', url: t.url, prioridad: 6, contexto: { categoria: contexto.categoria } });
          return { registros: [{ tipo: 'competicion', clave: String(id), datos: { ...base.competicion, jornadas: js.length } }], enlaces,
            revisitarHoras: esPasada(base.competicion.temporada) ? 24 * 90 : 24 * 3 };
        },
      },
      jornada: {
        interpreta(html, { contexto }) {
          const c = contexto.competicion;
          const j = partidosDeJornada(html, c.id, contexto.jornada);
          if (!j.partidos.length) return { sinPublicar: true };
          const fecha = j.fecha ?? contexto.fecha ?? null;
          return {
            registros: j.partidos.map((p) => ({ tipo: 'partido', clave: `${c.id}|${contexto.jornada}|${p.local.id}|${p.visitante.id}`,
              datos: { competicion: c, jornada: contexto.jornada, fecha_jornada: fecha, descansa: j.descansa, ...p } })),
            // Sin jugar en una temporada pasada ya no se jugará: no se revisita.
            revisitarHoras: j.partidos.some((p) => !p.jugado) && !esPasada(c.temporada) ? 48 : undefined,
          };
        },
      },
    },
  };
}
export default creaAdaptadorLaPreferente();
