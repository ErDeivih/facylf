/**
 * ServerSports (ASP.NET, «Software de Gestión de Competiciones Deportivas»): la plataforma de Futormes y de la
 * mayor red de ligas de fútbol aficionado encontrada (catálogo del 30/09/2026). Todas comparten rutas:
 *   /mod/soccer/competitions.aspx          → enlaces situation.aspx?itm=C (campeonatos de la temporada en curso)
 *                                             y menú de temporadas (Futormes: 13, de 2014 a 2026)
 *   /mod/soccer/situation.aspx?itm=C       → nombre del campeonato y enlaces team.aspx?itm=T
 *   /mod/soccer/team.aspx?itm=T            → CALENDARIO COMPLETO del equipo (tabla dgrPartidos): fecha, hora,
 *                                             campo, local, marcador, visitante, finalizado y match.aspx?itm=M
 *   /mod/soccer/match.aspx?itm=M           → ficha del partido: jornada, categoría y, por jugador, dorsal,
 *                                             goles, goles en propia puerta, goles recibidos y tarjetas
 * Los `itm` son globales en toda la plataforma. Las temporadas pasadas van por «postback» de ASP.NET (POST a
 * competitions.aspx sin URL propia): las siembra el tipo `temporadas` (02/10/2026: antes sólo se pedían 2023+
 * y sólo al revisitar la portada cada semana, así que el histórico de Futormes no llegaba a pedirse).
 * Las páginas de estadísticas (stats_scorers.aspx…) dependen de la sesión y no llevan `itm`: no se piden; las
 * mismas cifras salen de sumar las fichas de partido.
 *
 * Datos personales: de la ficha de partido sólo se guarda id de jugador, nombre, dorsal, goles y número de
 * tarjetas. La plataforma publica además edad, altura, peso, foto, apodo y el motivo de cada tarjeta: NO se
 * guardan (minimización). Categorías de menores (alevín, infantil, cadete, juvenil…): desde el 05/10/2026 se
 * guardan también sus jugadores (decisión de David: instancia privada, como en las federaciones), con el partido
 * marcado `menores: true` para que la capa que publique no los enseñe.
 */
import { limpia } from './_html.mjs';

export const LIGAS = [
  ['futormes', 'Salamanca', 'https://www.futormes.com'],
  ['futormes-zamora', 'Zamora', 'https://www.futormeszamora.com'],
  ['futcyl', 'Castilla y León', 'https://www.futcyl.com'],
  ['futzaragoza', 'Zaragoza', 'https://www.futzaragoza.com'],
  ['asofusa', 'Valladolid', 'https://www.asofusa.com'],
  ['solohayfutbol', 'Valladolid', 'https://www.solohayfutbol.com'],
  ['liga-empresas', 'España', 'https://www.laligadelasempresas.com'],
  ['estadio7', 'Las Palmas', 'http://www.estadio7.com'],
  ['f7-giralda', 'Sevilla', 'http://www.futbol7giralda.com'],
  ['f7-sevilla', 'Sevilla', 'http://www.f7sevilla.com'],
  ['f7-elite-sevilla', 'Sevilla', 'https://www.futbol7elite.es'],
  ['business-sports', 'Madrid', 'https://futbol.business-sports.es'],
  ['ligas-a-mas-7', 'Guadalajara', 'https://www.ligamas7.com'],
  ['ligas-f7-madrid', 'Madrid', 'http://www.ligasfutbol7madrid.com'],
  ['totana', 'Murcia', 'http://ligadefutbol.totana.es'],
  ['liga-iberica', 'Asturias', 'https://www.ligaiberica.es'],
  ['futsal-chiclana', 'Cádiz', 'https://www.futsalchiclana.com'],
  ['f7-avila', 'Ávila', 'https://www.f7avila.com'],
  ['burlada', 'Navarra', 'http://www.cptoburlada.net'],
  ['tikitaka-f7', 'Valencia', 'https://www.tikitakaf7.com'],
  ['fs-burgos', 'Burgos', 'http://www.futbolsalaburgos.es'],
  ['bunwer', 'Madrid', 'https://www.bunwer.es'], // sin «www» no responde (02/10/2026); F11 veteranos, 2013-2026
  ['fitgalicia', 'Galicia', 'https://www.fitgalicia.com'],
  // Añadida el 01/10/2026: Business Sports Empresas (F7 empresas, 7 divisiones 2026-27).
  ['business-sports-empresas', 'Madrid', 'https://www.torneosparaempresas.com'],
  // Añadidas el 02/10/2026 tras sondear cada portada (sondea-serversports.mjs): temporadas del menú entre paréntesis.
  ['7pa7', 'Córdoba', 'https://www.futbol7pa7.com'],                       // F7 y F3 (2016-2025)
  ['cnfs', 'España', 'http://www.cnfutbolsala.com'],                        // CNFS, fútbol sala (2011-2026)
  ['veterans-valles-maresme', 'Barcelona', 'https://www.veteransfutbol.com'], // F11 veteranos
  ['adac-almeria', 'Almería', 'http://www.almeriacup.es'],                  // Almería Cup League (2015-2026)
  ['f7-mallorca', 'Baleares', 'https://www.futbol7mallorcatorneos.es'],     // torneos de F7 por pueblos
  ['jdm-segovia', 'Segovia', 'http://juegosmunicipales.imdsg.es'],          // Juegos Deportivos Municipales (F7 y sala)
  ['liga-hesperides', 'Sevilla', 'http://demoligahesperides.serversports.net'], // F11 aficionado y veteranos (2015-2019; hoy en MyGol)
  ['anf7', 'España', 'http://demoanfutbol7.serversports.net'],              // Campeonato Nacional de F7 (anfutbol7.com no resuelve)
  ['aldovea', 'Madrid', 'http://www.aldoveafutbol7.com'],                   // AA Aldovea (2010-2026)
  ['afes-gandia', 'Valencia', 'http://www.afes.red'],                       // AFES Gandía, F11 (2024-2026)
  ['empubenco', 'Las Palmas', 'http://www.empubenco.com'],                  // organismos y empresas, sala y K7 (2024-2026)
  ['liga-delicias', 'Zaragoza', 'https://www.ligadelicias.com'],            // Liga Comarcal Calatayud FS
  // Descartadas: ligacorporativa.com (México), torneosindesa.com (Colombia), ligafansport (Colombia), sportevents
  // (Argentina). Sin DNS: bysportfutbol7, aspefutbol7, futbol7asturias, ligafebril, futbolsalacda, ligas.redfutbolsala,
  // fsempresas, 7pa7.com. Sin campeonatos ahora: ligaempresascordoba, futbol7elite, cptoburlada; f7jerez no responde.
];

const unicos = (xs) => [...new Set(xs)];
export const campeonatosEnlazados = (html) => unicos([...html.matchAll(/situation\.aspx\?itm=(\d+)/g)].map((m) => m[1]));
export const equiposEnlazados = (html) => unicos([...html.matchAll(/team\.aspx\?itm=(\d+)/g)].map((m) => m[1]));
/** Nombre de cada campeonato según el menú de la portada: { id: nombre }. En temporadas pasadas la página del
 *  campeonato no lo trae (va en el menú de la sesión), así que se toma de aquí. */
export const nombresDeCampeonatos = (html) => Object.fromEntries([...html.matchAll(/situation\.aspx\?itm=(\d+)">(?:<img[^>]*>)?([^<]+)<\/a>/g)]
  .map((m) => [m[1], limpia(m[2])]).filter(([, n]) => n));
export const nombreCampeonato = (html) => limpia(/Campeonato:(?:<\/b>|&lt;\/b>)\s*([^"<]+)/.exec(html)?.[1] ?? '') || null;

/** Tabla de partidos de la ficha de un equipo (id de ASP.NET `dgrPartidos_ctlNN_…`). */
export function partidosDeEquipo(html) {
  const filas = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const f = m[1];
    if (!/dgrPartidos_ctl\d+_lblFecha/.test(f)) continue;
    const campo = (k) => new RegExp(`dgrPartidos_ctl\\d+_${k}"[^>]*>([\\s\\S]*?)<\\/`).exec(f)?.[1];
    const equipo = (k) => {
      const e = new RegExp(`dgrPartidos_ctl\\d+_${k}"(?: title="([^"]*)")? href="team\\.aspx\\?itm=(\\d+)"`).exec(f);
      return e ? { id: e[2], nombre: limpia(e[1] ?? '') || null } : null;
    };
    const fecha = /(\d{2})\.(\d{2})\.(\d{4})/.exec(campo('lblFecha') ?? '');
    const marcador = /(\d+)\s*-\s*(\d+)/.exec(limpia(campo('lblMarcador') ?? ''));
    const lugar = /dgrPartidos_ctl\d+_lblCampo" title="([^"]*)"/.exec(f)?.[1];
    filas.push({
      id_partido: /match\.aspx\?itm=(\d+)/.exec(f)?.[1] ?? null,
      fecha: fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null,
      hora: /\d{2}:\d{2}/.exec(campo('lblHora') ?? '')?.[0] ?? null,
      lugar: lugar ? limpia(lugar) : null,
      local: equipo('hlkLocal'), visitante: equipo('hlkVisitante'),
      goles_local: marcador ? Number(marcador[1]) : null, goles_visitante: marcador ? Number(marcador[2]) : null,
      finalizado: /title="Partido finalizado"/.test(f),
    });
  }
  return filas;
}

/** Cabecera de la ficha de partido (lo seguro; alineaciones y goles por jugador, en la versión 2). */
export function cabeceraDePartido(html) {
  const t = limpia(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' '));
  return {
    jornada: Number(/·\s*Jornada\s+(\d+)/.exec(t)?.[1]) || null,
    categoria: /Categoría\s*:\s*(.+?)\s+Fecha\s*:/.exec(t)?.[1] ?? null,
    estado: /(Finalizado|Aplazado|Suspendido|Pendiente|En juego)/.exec(t.slice(t.indexOf('Campo :')))?.[1] ?? null,
  };
}

/** ¿Competición de menores? (por categoría o por nombre del campeonato) → no se guardan jugadores. */
const RE_MENORES = /\b(pre-?benjam[ií]n|benjam[ií]n|alev[ií]n|infantil|cadete|juvenil|bebé|chupet[ií]n|escuela|f[úu]tbol base|base|sub-?\s?(?:[6-9]|1[0-8])|u-?(?:[6-9]|1[0-8]))\b/i;
export const esDeMenores = (...textos) => textos.some((t) => t && RE_MENORES.test(t));

/** Tarjetas por el icono (16card_yellow.png, 16card_red.png…); el motivo (atributo title) no se guarda. */
function tarjetas(html) {
  const t = { amarillas: 0, rojas: 0 };
  for (const [, k] of html.matchAll(/16card_([a-z0-9]+)\.(?:png|gif)/gi)) {
    const c = k.toLowerCase();
    if (c === 'yellow') t.amarillas += 1;
    else if (c === 'red') t.rojas += 1;
    else (t.otras ??= {})[c] = (t.otras?.[c] ?? 0) + 1; // p. ej. doble amarilla, si la plataforma la distingue
  }
  return t;
}

/** Jugadores de la ficha de partido (tablas dgrJugadoresL / dgrJugadoresV). Sin datos del «tooltip». */
export function jugadoresDePartido(html) {
  const num = (v) => { const n = /\d+/.exec(limpia(v ?? '')); return n ? Number(n[0]) : 0; };
  const jugadores = [];
  for (const lado of ['L', 'V']) {
    const re = new RegExp(`dgrJugadores${lado}_(ctl\\d+)_lblDorsal"[^>]*>([^<]*)<`, 'g');
    const filas = [...html.matchAll(re)];
    filas.forEach((m, i) => {
      // Cada fila: «tooltip» (edad, altura, peso, foto: no se leen) y después dorsal, jugador, goles y tarjetas.
      const trozo = html.slice(m.index, i + 1 < filas.length ? filas[i + 1].index : m.index + 20000);
      const ctl = m[1];
      const j = new RegExp(`dgrJugadores${lado}_${ctl}_hlkJugador"(?: title="([^"]*)")? href="player\\.aspx\\?itm=(\\d+)"`).exec(trozo);
      const campo = (k) => new RegExp(`dgrJugadores${lado}_${ctl}_${k}"[^>]*>([\\s\\S]*?)<\\/span>`).exec(trozo)?.[1];
      const amon = new RegExp(`dgrJugadores${lado}_${ctl}_pnlAmonestaciones"[^>]*>([\\s\\S]*?)<\\/div>`).exec(trozo)?.[1] ?? '';
      const dorsal = /\d+/.exec(m[2])?.[0];
      jugadores.push({
        lado, id: j?.[2] ?? null, nombre: j ? limpia(j[1] ?? '') || null : null, dorsal: dorsal ? Number(dorsal) : null,
        goles: num(campo('lblGoles')), goles_propia_puerta: num(campo('lblGolesPropiaPuerta')),
        goles_recibidos: num(campo('lblGolesRecibidos')),
        ...tarjetas(amon),
      });
    });
  }
  return jugadores;
}

/** Equipos y competición de la cabecera de la ficha (hlkPartidoInfoNombreEquipoL/V, lblPartidoInfoCompeticion). */
export function equiposDePartido(html) {
  const eq = (l) => {
    const m = new RegExp(`hlkPartidoInfoNombreEquipo${l}"[^>]*href="team\\.aspx\\?itm=(\\d+)"[^>]*>([^<]*)<`).exec(html);
    return m ? { id: m[1], nombre: limpia(m[2]) || null } : null;
  };
  const comp = /lblPartidoInfoCompeticion"[^>]*>([^<]*)</.exec(html)?.[1];
  return { local: eq('L'), visitante: eq('V'), competicion: comp ? limpia(comp).replace(/\s*·\s*Jornada\s+\d+\s*$/, '') || null : null };
}

/** Temporadas del menú (ASP.NET «postback»): [{ id, anio }]. */
export function temporadasDelMenu(html) {
  return [...html.matchAll(/menuTemporada\\\\(\d+)&#39;\)"[^>]*>(?:<img[^>]*>)?\s*(\d{4})\s*<\/a>/g)]
    .map((m) => ({ id: m[1], anio: Number(m[2]) }));
}

/** Cuerpo del postback que cambia de temporada (mismos campos ocultos que la página). */
export function cuerpoTemporada(html, idTemporada) {
  const ocultos = Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)"[^>]*value="([^"]*)"/g)]
    .map((m) => [m[1], m[2].replace(/&amp;/g, '&').replace(/&#43;/g, '+').replace(/&#47;/g, '/')]));
  return new URLSearchParams({ ...ocultos, __EVENTTARGET: 'ctl00$mnuSituacion', __EVENTARGUMENT: `menuTemporada\\${idTemporada}` }).toString();
}

/** Partido con jugadores y totales por equipo; `menores` marca las categorías de base (no se publican). */
export function fichaDePartido(html, contexto = {}) {
  const cab = cabeceraDePartido(html);
  const eq = equiposDePartido(html);
  const jugadores = jugadoresDePartido(html);
  const menores = esDeMenores(cab.categoria, eq.competicion, contexto.campeonato?.nombre);
  const suma = (lado, k) => jugadores.filter((j) => j.lado === lado).reduce((a, j) => a + (j[k] ?? 0), 0);
  const totales = Object.fromEntries(['L', 'V'].map((l) => [l === 'L' ? 'local' : 'visitante', {
    jugadores: jugadores.filter((j) => j.lado === l).length, goles: suma(l, 'goles'),
    goles_propia_puerta: suma(l, 'goles_propia_puerta'), amarillas: suma(l, 'amarillas'), rojas: suma(l, 'rojas') }]));
  // Desde el 05/10/2026 también los jugadores de menores (se recoge todo; `menores` lo marca y no se publica).
  return { ...cab, ...eq, menores, totales, jugadores };
}

export function creaAdaptadorServerSports({ ligas = LIGAS, desdeAnio = 0 } = {}) {
  const LARGO = 24 * 90; // lo de temporadas pasadas casi no cambia: una vuelta cada tres meses
  return {
    nombre: 'serversports',
    // Tres ligas a la vez (nunca dos peticiones a la misma), cada una a su ritmo de siempre (02/10/2026).
    carriles: 3,
    deporte: 'futbol',
    semillas: () => ligas.flatMap(([id, provincia, base]) => [
      { tipo: 'campeonatos', url: `${base}/mod/soccer/competitions.aspx`, prioridad: 10, contexto: { liga: id, provincia, base } },
      // Mismo URL, otro tipo (otra clave): lee el menú de temporadas y encola un POST por temporada pasada.
      { tipo: 'temporadas', url: `${base}/mod/soccer/competitions.aspx`, prioridad: 12, contexto: { liga: id, provincia, base } },
    ]),
    tipos: {
      temporadas: {
        revisitarHoras: 24 * 30,
        interpreta(html, { contexto }) {
          const ts = temporadasDelMenu(html);
          if (!ts.length) return {};
          const masReciente = Math.max(...ts.map((t) => t.anio));
          return {
            registros: [{ tipo: 'temporadas', clave: contexto.liga, datos: { liga: contexto.liga, temporadas: ts } }],
            enlaces: ts.filter((t) => t.anio < masReciente && t.anio >= desdeAnio).map((t) => ({
              tipo: 'campeonatos', prioridad: 15, url: `${contexto.base}/mod/soccer/competitions.aspx`,
              cuerpo: cuerpoTemporada(html, t.id), identidad: `temporada:${t.id}`,
              contexto: { ...contexto, temporada: t.anio, id_temporada: t.id } })),
          };
        },
      },
      campeonatos: {
        revisitarHoras: 24 * 7,
        interpreta(html, { contexto }) {
          const ids = campeonatosEnlazados(html);
          if (!ids.length) return contexto.temporada ? { revisitarHoras: LARGO } : { sinPublicar: true };
          const nombres = nombresDeCampeonatos(html);
          return {
            enlaces: ids.map((c) => ({ tipo: 'situacion', prioridad: contexto.temporada ? 25 : 20, url: `${contexto.base}/mod/soccer/situation.aspx?itm=${c}`,
              contexto: { ...contexto, campeonato: { id: c, nombre: nombres[c] ?? null } } })),
            revisitarHoras: contexto.temporada ? LARGO : undefined,
          };
        },
      },
      situacion: {
        revisitarHoras: 24 * 7,
        interpreta(html, { contexto }) {
          const campeonato = { id: contexto.campeonato.id, nombre: nombreCampeonato(html) ?? contexto.campeonato.nombre ?? null };
          const ctx = { ...contexto, campeonato };
          return {
            registros: [{ tipo: 'campeonato', clave: campeonato.id, datos: ctx }],
            enlaces: equiposEnlazados(html).map((t) => ({ tipo: 'equipo', prioridad: contexto.temporada ? 35 : 30,
              url: `${contexto.base}/mod/soccer/team.aspx?itm=${t}`, contexto: ctx })),
            revisitarHoras: contexto.temporada ? LARGO : undefined,
          };
        },
      },
      equipo: {
        interpreta(html, { contexto }) {
          const partidos = partidosDeEquipo(html);
          const base = { liga: contexto.liga, provincia: contexto.provincia, campeonato: contexto.campeonato,
            ...(contexto.temporada ? { temporada: contexto.temporada } : {}) };
          const abiertos = partidos.some((p) => !p.finalizado);
          return {
            registros: partidos.filter((p) => p.id_partido).map((p) => ({ tipo: 'partido', clave: p.id_partido, datos: { ...base, ...p } })),
            enlaces: partidos.filter((p) => p.id_partido && p.finalizado).map((p) => ({ tipo: 'partido', prioridad: contexto.temporada ? 45 : 40,
              url: `${contexto.base}/mod/soccer/match.aspx?itm=${p.id_partido}`, contexto: { ...base, id_partido: p.id_partido } })),
            // Temporada en curso con partidos por jugar: otra vuelta en 48 h. Las pasadas no se revisitan.
            revisitarHoras: abiertos && !contexto.temporada ? 48 : undefined,
          };
        },
      },
      partido: {
        interpreta(html, { contexto }) {
          return { registros: [{ tipo: 'ficha-partido', clave: contexto.id_partido, datos: { ...contexto, ...fichaDePartido(html, contexto) } }] };
        },
      },
    },
  };
}

export default creaAdaptadorServerSports();
