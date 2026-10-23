/**
 * siguetuliga.com: agregador de ligas. Además de las federadas (que ya se recogen de cada federación), tiene
 * ligas que llevan sus propios usuarios: veteranos gallegos (A Coruña, Santiago, Ourense, Lugo, Pontevedra, A
 * Costa), ligas locales de sala (Lugo, Vigo, Ferrol, Rianxo, Ponteceso, Sarria…), peñas (Arteixo, Betanzos),
 * F7 (Lalín, Polvorín, Ourense), AFAS Extremadura, Liga Dolorense (Córdoba), Insepal (Madrid)… Muchas están
 * abandonadas y la calidad varía (un administrador puede dejar fechas de la temporada anterior): se guarda lo
 * que publican, tal cual, con la fecha de la jornada como texto además de en ISO.
 *
 * robots.txt prohíbe `/*?`, `/api/`, `/ws/`, `/rankings/`… → sólo se piden URLs sin parámetros:
 *   /sitemaps/sitemapLigas.xml → /liga/<slug>/calendario (todas las jornadas en una página)
 * Fuera: otros deportes del mismo sitio (baloncesto, balonmano, bolos, lucha). Desde el 05/10/2026 entran también
 * las ligas de menores (escolar, biberones, benjamín, alevín…): se recoge todo, como en las federaciones.
 */
import { limpia } from './_html.mjs';

const BASE = 'https://www.siguetuliga.com';
const INCLUYE = /veteran|local|futbol-7|f7|empresa|penas|municipal|amistad|liga-de-futbol-sala|futbol-sala-|torneo|verano|veran|playa|universit|trofeo|insepal|afas|dolorense|otras-ligas|escolar|biberon|benx|benjam|bemjam|alevin|infantil|cadete|iniciacion|-anos-/;
const EXCLUYE = /^(internacional|europa|nacional|baloncesto|balonmano)|laliga|liga-f-|acb|rfef|lnfs|bolos|lucha/;
// Categorías federadas que se cuelan por «futbol-sala-…» (las lleva la federación: ya se recogen de allí).
const FEDERADA = /regional|preferente|autonomica|autonimica|tercera-division|segunda-division|primera-division-provincial|division-de-honor-(juvenil|cadete)|nacional/;
export const esAficionada = (slug) => INCLUYE.test(slug) && !EXCLUYE.test(slug)
  && (!FEDERADA.test(slug) || /veteran|local|penas|empresa/.test(slug));
export const ligasDelSitemap = (xml) => [...new Set([...xml.matchAll(/<loc>https?:\/\/www\.siguetuliga\.com\/liga\/([^/<]+)<\/loc>/g)].map((m) => m[1]))];

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
/** «Sábado, 19 de Septiembre de 2026» → 2026-09-19. */
export function fechaIso(texto) {
  const m = /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i.exec(texto ?? '');
  const mes = m && MESES[m[2].toLowerCase()];
  return mes ? `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** Todos los partidos del calendario, jornada a jornada. */
export function partidosDelCalendario(html) {
  const vistos = new Map();
  for (const panel of html.split('panelListaResultados').slice(1)) {
    const jornada = Number(/J\.\s*(\d+)/.exec(panel)?.[1]) || null;
    const fechaTexto = limpia(/id="fecha_jornada">([^<]*)</.exec(panel)?.[1] ?? '') || null;
    const ids = [...new Set([...panel.matchAll(/tr-(\d+)\s/g)].map((m) => m[1]))];
    for (const id of ids) {
      if (vistos.has(id)) continue;
      const desde = panel.indexOf(`tr-${id}`);
      const trozo = panel.slice(desde, panel.indexOf('filaPartido', desde + 20) > 0 ? panel.indexOf('filaPartido', desde + 20) : undefined);
      const nombre = (lado) => {
        const i = trozo.indexOf(`id="equipo${lado}-${id}"`);
        if (i < 0) return null;
        return limpia(/nombreEquipoResultados">([\s\S]*?)<\/span>/.exec(trozo.slice(i))?.[1] ?? '') || null;
      };
      const num = (k) => { const m = new RegExp(`id="${k}-${id}">\\s*(\\d+)\\s*<`).exec(trozo); return m ? Number(m[1]) : null; };
      const gl = num('golesEquipoLocal'); const gv = num('golesEquipoVisitante');
      vistos.set(id, {
        id_partido: id, jornada, fecha_jornada: fechaIso(fechaTexto), fecha_texto: fechaTexto,
        hora: new RegExp(`horaDelPartido-${id}">\\s*(\\d{1,2}:\\d{2})`).exec(trozo)?.[1] ?? null,
        local: { id: new RegExp(`id="idEquipoLocal-${id}" value="(\\d+)"`).exec(trozo)?.[1] ?? null, nombre: nombre('Local') },
        visitante: { id: new RegExp(`id="idEquipoVisitante-${id}" value="(\\d+)"`).exec(trozo)?.[1] ?? null, nombre: nombre('Visitante') },
        goles_local: gl, goles_visitante: gv, jugado: gl != null && gv != null,
      });
    }
  }
  return [...vistos.values()];
}

export function creaAdaptadorSiguetuliga() {
  return {
    nombre: 'siguetuliga', deporte: 'futbol',
    semillas: () => [{ tipo: 'sitemap', url: `${BASE}/sitemaps/sitemapLigas.xml`, prioridad: 5, contexto: {} }],
    tipos: {
      sitemap: {
        revisitarHoras: 24 * 7,
        interpreta(xml) {
          const ligas = ligasDelSitemap(xml).filter(esAficionada);
          return { enlaces: ligas.map((slug) => ({ tipo: 'calendario', prioridad: 20, url: `${BASE}/liga/${slug}/calendario`, contexto: { liga: slug } })) };
        },
      },
      calendario: {
        interpreta(html, { contexto }) {
          const nombre = limpia(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '') || null;
          const ps = partidosDelCalendario(html);
          if (!ps.length) return { sinPublicar: true };
          // Liga viva = le quedan partidos por jugar y alguna jornada es de los últimos 60 días (o futura). No se
          // exige que la fecha sea la del partido pendiente: hay administradores que dejan las de la temporada pasada.
          const limite = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
          const viva = ps.some((p) => !p.jugado) && ps.some((p) => p.fecha_jornada && p.fecha_jornada >= limite);
          return {
            registros: ps.map((p) => ({ tipo: 'partido', clave: p.id_partido, datos: { liga: contexto.liga, competicion: nombre, ...p } })),
            revisitarHoras: viva ? 48 : 24 * 30,
          };
        },
      },
    },
  };
}
export default creaAdaptadorSiguetuliga();
