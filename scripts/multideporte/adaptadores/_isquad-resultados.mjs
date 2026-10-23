/**
 * iSquad «resultados» (resultados{voleibol,balonmano}.isquad.es): la misma plataforma para varios deportes y
 * con los mismos identificadores de territorial (9999 estatal, 16 CLM, 17 Cataluña, 18 Euskadi, 19
 * Extremadura, 20 Galicia, 21 Madrid, 22 Murcia, 24 Ceuta, 25 Melilla, 26 Andalucía, 27 Aragón, 28 Asturias,
 * 29 Baleares, 31 Navarra, 32 Rioja, 33 Valencia, 35 Cantabria, 36 CyL, 37 Canarias).
 *
 * Todo lo necesario está en el HTML servido (comprobado con el sondeo del 30/09/2026):
 *   competicion.php?…&id_territorial=T&id_temp=S                → <select id=categorias>
 *   …&id_categoria=C                                            → <select id=competiciones>
 *   …&id_competicion=K                                          → <select id=torneos> (fases/grupos)
 *   …&id=G  y  …&id=G&jornada=J                                  → enlaces a cada jornada + filas de partidos
 *   clasificacion_completa.php?…&id_competicion=K               → clasificaciones de todos los grupos (se guarda)
 *   {voleibol|balonmano}.isquad.es/acta_completa_pdf.php?id_partido=N → acta en PDF (se guarda)
 * Cada fila de partido: <tr … data-id=N data-estado=…> (balonmano) o el id en mostrarActaFormal/mostrarPrevio
 * (voleibol), equipos con su id (equipo.php?id_equipo=X), marcador y, en voleibol, los parciales por set.
 */
import { decodificaEntidades, limpia } from './_html.mjs';
import { leeActaBalonmano } from './_acta-balonmano.mjs';

export const TERRITORIALES = {
  9999: 'estatal', 16: 'castilla-la-mancha', 17: 'cataluna', 18: 'euskadi', 19: 'extremadura', 20: 'galicia',
  21: 'madrid', 22: 'murcia', 24: 'ceuta', 25: 'melilla', 26: 'andalucia', 27: 'aragon', 28: 'asturias',
  29: 'baleares', 31: 'navarra', 32: 'rioja', 33: 'valencia', 35: 'cantabria', 36: 'castilla-leon', 37: 'canarias',
};

export function opcionesDeSelect(html, id) {
  const m = new RegExp(`<select[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</select>`).exec(html);
  if (!m) return [];
  return [...m[1].matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>([^<]*)/g)]
    .map((o) => ({ valor: o[1].trim(), texto: limpia(o[2]) }))
    .filter((o) => o.valor !== '' && !o.valor.includes('+'));
}

export function jornadasEnlazadas(html) {
  return [...new Set([...html.matchAll(/competicion\.php\?[^'"]*?&jornada=(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

const ESTADOS = /(Finalizado|Pendiente|Aplazado|Suspendido|En progreso|Descansa|Anulado|No presentado)/i;

/** Filas de partido de una página de jornada. */
export function partidosDePagina(html) {
  const filas = [];
  for (const m of html.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)) {
    const [, atributos, cuerpo] = m;
    if (!cuerpo.includes('nombres-equipos')) continue;
    const id = /data-id="(\d+)"/.exec(atributos)?.[1]
      ?? /mostrar(?:ActaFormal|Previo|ActaFormalPlaya)\((\d+)\)/.exec(cuerpo)?.[1] ?? null;
    const bloqueNombres = /class="nombres-equipos">([\s\S]*?)<\/div>/.exec(cuerpo)?.[1] ?? '';
    const equipos = [...bloqueNombres.matchAll(/href='equipo\.php\?[^']*?id_equipo=(\d+)[^']*'>([\s\S]*?)<\/a>/g)]
      .map((e) => ({ id: e[1] === '0' ? null : e[1], nombre: limpia(e[2]) }));
    const tanteos = [...cuerpo.matchAll(/<div class="custom-col">\s*<span[^>]*>([^<]*)<\/span>\s*-\s*<span[^>]*>([^<]*)<\/span>/g)]
      .map((t) => [t[1].trim(), t[2].trim()]);
    const [marcador = ['', ''], ...sets] = tanteos;
    const num = (x) => (x === '' || x == null || Number.isNaN(Number(x)) ? null : Number(x));
    const fecha = /(\d{2})\/(\d{2})\/(\d{4})/.exec(cuerpo);
    const hora = /(?:>|\s)(\d{2}:\d{2})(?:<|\s)/.exec(cuerpo)?.[1] ?? null;
    const lugar = /class="col-lugar">\s*(?:<a[^>]*>)?([\s\S]*?)(?:<\/a>)?\s*<\/td>/.exec(cuerpo)?.[1];
    const estado = /data-estado="([^"]+)"/.exec(atributos)?.[1] ?? ESTADOS.exec(limpia(cuerpo))?.[1] ?? null;
    filas.push({
      id_partido: id,
      local: equipos[0] ?? null, visitante: equipos[1] ?? null,
      tanteo_local: num(marcador[0]), tanteo_visitante: num(marcador[1]),
      parciales: sets.map(([a, b]) => [num(a), num(b)]).filter(([a, b]) => a != null || b != null),
      fecha: fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null,
      hora,
      lugar: lugar ? limpia(lugar.replace(/<\/?br\s*\/?>/gi, ' · ')) || null : null,
      estado,
    });
  }
  return filas;
}

/** Temporada iSquad «2627» → año de inicio 2026. */
export const anioDeTemporada = (s) => 2000 + Number(String(s).slice(0, 2));

export function creaAdaptadorIsquad({ deporte, temporadas = ['2627', '2526', '2425', '2324'], territoriales,
  actas = false, ahora = () => new Date() }) {
  const base = `https://resultados${deporte}.isquad.es/competicion.php`;
  const url = (p) => `${base}?seleccion=0&id_superficie=1&${new URLSearchParams(p).toString()}`;
  const baseClasif = `https://resultados${deporte}.isquad.es/clasificacion_completa.php`;
  const temporadaActual = () => {
    const d = ahora();
    const inicio = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return `${String(inicio).slice(2)}${String(inicio + 1).slice(2)}`;
  };
  const esActual = (s) => String(s) === temporadaActual();
  const prioridad = (s, nivel) => (esActual(s) ? 10 : 30 + (Number(temporadaActual().slice(0, 2)) - Number(String(s).slice(0, 2))) * 10) + nivel;
  const ids = territoriales ?? Object.keys(TERRITORIALES);

  return {
    nombre: `isquad-${deporte}`,
    deporte,
    semillas: () => ids.flatMap((t) => temporadas.map((s) => ({
      tipo: 'territorial', url: url({ id_territorial: t, id_temp: s }), prioridad: prioridad(s, 0),
      contexto: { deporte, territorial: String(t), federacion: TERRITORIALES[t] ?? String(t), temporada: s },
    }))),
    tipos: {
      territorial: {
        interpreta(html, { contexto }) {
          const categorias = opcionesDeSelect(html, 'categorias');
          return {
            registros: categorias.map((c) => ({ tipo: 'categoria', clave: `${contexto.territorial}:${contexto.temporada}:${c.valor}`, datos: { ...contexto, categoria: c } })),
            enlaces: categorias.map((c) => ({ tipo: 'categoria', prioridad: prioridad(contexto.temporada, 1),
              url: url({ id_territorial: contexto.territorial, id_temp: contexto.temporada, id_categoria: c.valor }),
              contexto: { ...contexto, categoria: c } })),
            revisitarHoras: esActual(contexto.temporada) ? 24 * 7 : undefined,
          };
        },
      },
      categoria: {
        interpreta(html, { contexto }) {
          const competiciones = opcionesDeSelect(html, 'competiciones');
          return {
            enlaces: competiciones.flatMap((k) => {
              const p = { id_territorial: contexto.territorial, id_temp: contexto.temporada, id_categoria: contexto.categoria.valor, id_competicion: k.valor };
              const ctx = { ...contexto, competicion: k };
              return [
                { tipo: 'competicion', url: url(p), prioridad: prioridad(contexto.temporada, 2), contexto: ctx },
                { tipo: 'clasificacion', prioridad: prioridad(contexto.temporada, 6), contexto: ctx,
                  url: `${baseClasif}?seleccion=0&id_superficie=1&iframe=0&id_ambito=0&${new URLSearchParams(p).toString()}` },
              ];
            }),
            revisitarHoras: esActual(contexto.temporada) ? 24 * 7 : undefined,
          };
        },
      },
      competicion: {
        interpreta(html, { contexto }) {
          const torneos = opcionesDeSelect(html, 'torneos');
          return {
            registros: [{ tipo: 'competicion', clave: `${contexto.territorial}:${contexto.temporada}:${contexto.competicion.valor}`,
              datos: { ...contexto, torneos } }],
            enlaces: torneos.map((g) => ({ tipo: 'torneo', prioridad: prioridad(contexto.temporada, 3),
              url: url({ id_territorial: contexto.territorial, id_temp: contexto.temporada, id_categoria: contexto.categoria.valor,
                id_competicion: contexto.competicion.valor, id: g.valor }),
              contexto: { ...contexto, torneo: g } })),
            revisitarHoras: esActual(contexto.temporada) ? 24 * 7 : undefined,
          };
        },
      },
      torneo: {
        // La página del grupo trae los enlaces a TODAS sus jornadas: se encola cada una (la actual también,
        // para que su lectura sea siempre la misma).
        interpreta(html, { contexto }) {
          const jornadas = jornadasEnlazadas(html);
          const p = { id_territorial: contexto.territorial, id_temp: contexto.temporada, id_categoria: contexto.categoria.valor,
            id_competicion: contexto.competicion.valor, id: contexto.torneo.valor };
          if (!jornadas.length && !partidosDePagina(html).length) return { sinPublicar: true };
          return {
            enlaces: (jornadas.length ? jornadas : [1]).map((j) => ({ tipo: 'jornada', prioridad: prioridad(contexto.temporada, 4),
              url: url({ ...p, jornada: j }), contexto: { ...contexto, jornada: j } })),
            revisitarHoras: esActual(contexto.temporada) ? 24 * 3 : undefined,
          };
        },
      },
      jornada: {
        interpreta(html, { contexto }) {
          const partidos = partidosDePagina(html);
          const abiertos = partidos.some((x) => x.estado && !/finalizado|anulado/i.test(x.estado));
          const base = { deporte, federacion: contexto.federacion, territorial: contexto.territorial, temporada: contexto.temporada,
            categoria: contexto.categoria, competicion: contexto.competicion, torneo: contexto.torneo, jornada: contexto.jornada };
          return {
            registros: partidos.filter((x) => x.id_partido).map((x) => ({ tipo: 'partido', clave: x.id_partido, datos: { ...base, ...x } })),
            enlaces: actas ? partidos.filter((x) => x.id_partido && /finalizado/i.test(x.estado ?? '')).map((x) => ({
              tipo: 'acta', prioridad: prioridad(contexto.temporada, 8), contexto: { id_partido: x.id_partido },
              url: `https://${deporte}.isquad.es/acta_completa_pdf.php?id_partido=${x.id_partido}` })) : [],
            revisitarHoras: esActual(contexto.temporada) && (abiertos || !partidos.length) ? 24 : undefined,
          };
        },
      },
      // Se guardan tal cual (evidencia); su lectura llega cuando se decida el modelo de clasificación/acta.
      clasificacion: { interpreta: (_html, { contexto }) => ({ revisitarHoras: esActual(contexto.temporada) ? 24 * 2 : undefined }) },
      // Actas PDF: en balonmano se leen (jugadores, goles, amonestaciones, exclusiones, técnicos, árbitros); en
      // voleibol siguen guardándose como evidencia hasta tener su lector.
      acta: {
        interpreta(_texto, { contexto, bruto }) {
          if (deporte !== 'balonmano' || !bruto) return {};
          const a = leeActaBalonmano(bruto);
          if (!a) return {};
          return { registros: [{ tipo: 'acta', clave: contexto.id_partido, datos: { deporte, id_partido: contexto.id_partido, ...a } }] };
        },
      },
    },
  };
}
