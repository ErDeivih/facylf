/**
 * Gesdeportiva / Indalweb: la plataforma de competición de varias federaciones de baloncesto (FBM Madrid,
 * Canarias, Melilla, Asturias, Murcia, Extremadura…). Sondeo del 01/10/2026 (FBM y Canarias):
 * una página ASP.NET con desplegables encadenados por «postback», en este orden si existen:
 *   Temporada → Delegación → Competición → Categoría → Fase → Grupo
 * La página de un grupo trae en HTML, sin JavaScript, la pestaña CALENDARIO con todas las jornadas
 * («Jornada N - dd/mm/aaaa»): equipos (con id si son enlace /equipo-{idEquipo}-{idGrupo}/…), marcador si se
 * jugó, fecha, hora y pista. Los informes PDF no hacen falta.
 * Fuera a propósito: competiciones FEB, Liga Endesa/ACB e internacionales (profesional o ya en el adaptador feb).
 * Sólo nombres de EQUIPO (no hay jugadores en estas páginas), así que no hay datos de menores.
 */
import { decodificaEntidades, limpia } from './_html.mjs';

export const SITIOS = [
  { id: 'fbm', nombre: 'Federación de Baloncesto de Madrid', pagina: 'https://www.fbm.es/es/horarios-y-resultados' },
  { id: 'canarias', nombre: 'Federación Canaria de Baloncesto', pagina: 'https://gesdeportiva.fcbaloncesto.es/competiciones-6/FederacionCanaria' },
  { id: 'melilla', nombre: 'Federación Melillense de Baloncesto', pagina: 'https://gesdeportiva.melillensebaloncesto.es/competiciones-15/melillense' },
  // Mismos desplegables en una página /competicion-N/… (comprobado con busca-plataforma.mjs el 01/10/2026).
  // En Asturias y Extremadura cada competición es su propia página (sin desplegable de competición).
  { id: 'asturias-17433', nombre: 'Federación de Baloncesto del Principado de Asturias', pagina: 'https://www.fbpa.es/competicion-17433/competiciones-federadas-' },
  { id: 'asturias-17436', nombre: 'Federación de Baloncesto del Principado de Asturias', pagina: 'https://www.fbpa.es/competicion-17436/juegos-deportivos-del-principado-' },
  { id: 'asturias-17442', nombre: 'Federación de Baloncesto del Principado de Asturias', pagina: 'https://www.fbpa.es/competicion-17442/copa-asturias' },
  // Murcia (fbrm.org) NO: esconde equipos y marcadores tras <script>decodificar("&#…;")</script>, una medida
  // deliberada contra la lectura automática. No se esquiva; decide David (o se pide acceso).
  ...[[98, 'senior-femenina'], [99, 'trofeo-diputación-cáceres'], [100, 'trofeo-diputacion-badajoz'], [101, 'judex'], [104, 'copa-extremadura-']]
    .map(([n, slug]) => ({ id: `extremadura-${n}`, nombre: 'Federación Extremeña de Baloncesto', pagina: `https://www.fexb.es/competicion-${n}/${encodeURI(slug)}.aspx` })),
];
const ORDEN = ['DDLTemporadas', 'DDLDelegacion', 'DDLCompeticiones', 'DDLCategorias', 'DDLFases', 'DDLGrupos'];
const TIPO = { DDLTemporadas: 'temporada', DDLDelegacion: 'delegacion', DDLCompeticiones: 'competicion', DDLCategorias: 'categoria', DDLFases: 'fase', DDLGrupos: 'grupo' };
export const FUERA = /(^|\s)FEB(\s|$)|COMPETICIONES FEB|ENDESA|INTERNACIONAL|\bACB\b/i;

export function desplegable(html, sufijo) {
  const m = new RegExp(`<select[^>]*name="((?:[^"]*\\$)?${sufijo})"[^>]*>([\\s\\S]*?)</select>`).exec(html);
  if (!m) return null;
  const opciones = [...m[2].matchAll(/<option([^>]*)value="([^"]*)"[^>]*>([^<]*)/g)]
    .map((o) => ({ valor: o[2], texto: limpia(o[3]), elegido: /selected/.test(o[1]) }));
  return { nombre: m[1], opciones, elegido: opciones.find((o) => o.elegido) ?? opciones[0] ?? null };
}
export const nivelesDe = (html) => ORDEN.filter((s) => desplegable(html, s));

/** Cuerpo del POST que repite el formulario cambiando un desplegable (los demás, con lo que tienen elegido). */
export function cuerpoCambio(html, sufijo, valor) {
  const p = new URLSearchParams();
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    if (!/type="hidden"/.test(tag)) continue;
    const nombre = /name="([^"]+)"/.exec(tag)?.[1];
    if (nombre) p.set(nombre, decodificaEntidades(/value="([^"]*)"/.exec(tag)?.[1] ?? ''));
  }
  for (const s of ORDEN) { const d = desplegable(html, s); if (d?.elegido) p.set(d.nombre, d.elegido.valor); }
  const d = desplegable(html, sufijo);
  p.set('__EVENTTARGET', d.nombre); p.set('__EVENTARGUMENT', ''); p.set('__LASTFOCUS', '');
  p.set(d.nombre, valor);
  return p.toString();
}

export function accionDelFormulario(html, pagina) {
  // El formulario ASP.NET (method="post"); FBM tiene antes un buscador por GET que no sirve.
  const a = [...html.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]).filter((f) => /method="post"/i.test(f))
    .map((f) => /action="([^"]+)"/.exec(f)?.[1]).find(Boolean);
  return a ? new URL(decodificaEntidades(a), pagina).href : pagina;
}

const iso = (f) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(f ?? ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const num = (t) => { const s = limpia(t); return /^\d+$/.test(s) ? Number(s) : null; };
function equipo(celda) {
  const a = /href="\/equipo-(\d+)-(\d+)\/[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(celda ?? '');
  return a ? { id: a[1], nombre: limpia(a[3]), id_grupo: a[2] } : { id: null, nombre: limpia(celda ?? '') || null };
}

/** Partidos de la pestaña CALENDARIO de un grupo. */
export function partidosDelGrupo(html) {
  const i = html.indexOf('id="calendario"');
  if (i < 0) return [];
  const fin = html.indexOf('id="equipos"', i);
  const cal = html.slice(i, fin > 0 ? fin : undefined);
  if (/decodificar\(/.test(cal)) return [];   // contenido ofuscado a propósito: no se descifra
  const salida = [];
  for (const b of cal.split(/<h4>/).slice(1)) {
    const cab = limpia(b.slice(0, b.indexOf('</h4>')));
    const jornada = Number(/Jornada\s+(\d+)/i.exec(cab)?.[1]) || null;
    const fechaJornada = iso(cab);
    for (const f of b.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const celdas = [...f[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map((c) => ({ attr: c[1], html: c[2] }));
      const iL = celdas.findIndex((c) => /puntos_locales/.test(c.attr));
      const iV = celdas.findIndex((c) => /puntos_visitantes/.test(c.attr));
      if (iL < 1 || iV < 0 || !celdas[iV + 1]) continue;
      const local = equipo(celdas[iL - 1].html), visitante = equipo(celdas[iV + 1].html);
      if (!local.nombre || !visitante.nombre) continue;
      const resto = celdas.slice(iV + 2);
      const cuando = resto.find((c) => /<strong>/.test(c.html))?.html ?? '';
      const campo = resto.find((c) => /LCampoJuego|<span/.test(c.html) && !/<strong>/.test(c.html))?.html;
      const puntos_local = num(celdas[iL].html), puntos_visitante = num(celdas[iV].html);
      salida.push({
        jornada, fecha_jornada: fechaJornada, id_grupo: local.id_grupo ?? visitante.id_grupo ?? null,
        local: { id: local.id, nombre: local.nombre }, visitante: { id: visitante.id, nombre: visitante.nombre },
        puntos_local, puntos_visitante, jugado: puntos_local != null && puntos_visitante != null,
        fecha: iso(cuando), hora: /(\d{1,2}:\d{2})/.exec(cuando)?.[1] ?? null,
        pista: campo ? limpia(campo.replace(/<br\s*\/?>/g, ' · ')) || null : null,
      });
    }
  }
  return salida;
}

export function creaAdaptadorGesdeportiva({ nombre = 'gesdeportiva', sitios = SITIOS, fuera = FUERA, desdeAnio = 2023 } = {}) {
  const sitioDe = (c) => sitios.find((s) => s.id === c.sitio);
  /** Desde la página de un nivel, encola los valores del nivel siguiente (si no hay siguiente, es un grupo). */
  function siguiente(html, contexto, url) {
    const niveles = nivelesDe(html);
    const hechos = niveles.filter((s) => contexto[TIPO[s]] != null);
    const sufijo = niveles.find((s) => contexto[TIPO[s]] == null);
    if (!sufijo) return [];
    const d = desplegable(html, sufijo);
    const pos = ORDEN.indexOf(sufijo);
    return d.opciones.filter((o) => o.valor && o.valor !== '0')
      .filter((o) => !(sufijo === 'DDLCompeticiones' && fuera.test(o.texto)))
      .filter((o) => !(sufijo === 'DDLTemporadas' && Number(o.valor) < desdeAnio))
      .map((o) => {
        const ctx = { ...contexto, [TIPO[sufijo]]: { id: o.valor, nombre: o.texto } };
        // La identidad es la ruta de ids elegidos: el __VIEWSTATE cambia entre visitas.
        const identidad = [...hechos, sufijo].map((s) => ctx[TIPO[s]].id).join('/');
        const actual = sufijo === 'DDLTemporadas' ? Number(o.valor) : Number(contexto.temporada?.id ?? 0);
        return { tipo: TIPO[sufijo] === 'grupo' ? 'grupo' : 'nivel', url: accionDelFormulario(html, url), cuerpo: cuerpoCambio(html, sufijo, o.valor),
          identidad: `${contexto.sitio}:${identidad}`, prioridad: 20 - pos + (actual ? (new Date().getUTCFullYear() - actual) * 10 : 0), contexto: ctx };
      });
  }
  return {
    nombre, deporte: 'baloncesto',
    // Cada federación es un sitio distinto: hasta tres a la vez, cada una a su ritmo de siempre (02/10/2026).
    carriles: 3,
    semillas: () => sitios.map((s) => ({ tipo: 'nivel', url: s.pagina, prioridad: 5, contexto: { sitio: s.id } })),
    tipos: {
      nivel: { interpreta: (html, { contexto, url }) => {
        const enlaces = siguiente(html, contexto, url);
        return enlaces.length ? { enlaces, revisitarHoras: 24 * 7 } : { sinPublicar: true };
      } },
      grupo: {
        interpreta(html, { contexto }) {
          const partidos = partidosDelGrupo(html);
          if (!partidos.length) return { sinPublicar: true };
          const s = sitioDe(contexto);
          const base = { sitio: contexto.sitio, federacion: s?.nombre ?? null, temporada: contexto.temporada ?? null, delegacion: contexto.delegacion ?? null,
            competicion: contexto.competicion ?? null, categoria: contexto.categoria ?? null, fase: contexto.fase ?? null, grupo: contexto.grupo };
          const vistas = new Map();
          const clave = (p) => {
            const k = `${contexto.sitio}|${contexto.grupo.id}|${p.jornada ?? p.fecha_jornada}|${p.local.id ?? p.local.nombre}|${p.visitante.id ?? p.visitante.nombre}`;
            const n = (vistas.get(k) ?? 0) + 1; vistas.set(k, n);
            return n === 1 ? k : `${k}|${n}`;
          };
          return {
            registros: partidos.map((p) => ({ tipo: 'partido', clave: clave(p), datos: { ...base, ...p } })),
            revisitarHoras: partidos.some((p) => !p.jugado) ? 24 : 24 * 14,
          };
        },
      },
    },
  };
}

export default creaAdaptadorGesdeportiva();
