/**
 * MyGol (*.mygol.es): 29+ ligas de fútbol aficionado (F7, F11, sala, veteranos). Es una SPA; su API JSON se
 * grabó con el sondeo de navegador del 01/10/2026:
 *   GET  /api/tournaments                         → todos los torneos de la organización (todas las temporadas)
 *   GET  /api/tournaments/{id}                    → equipos, fases y grupos del torneo
 *   POST /api/matches/filterMatchesByDatesRange   {startTime, endTime, idTournament} → partidos con marcador,
 *        jornada, campo, equipos y estado
 * Una organización por subdominio. Sin nombres de jugadores en esta versión (las fichas son otra llamada).
 */
export const ORGANIZACIONES = [
  ['futbol7amistad', 'Santa Cruz de Tenerife'], ['ligaf7aviles', 'Asturias'], ['ligaf7gijon', 'Asturias'], ['f7asturias', 'Asturias'],
  ['redsports', 'Madrid'], ['futbol7leganes', 'Madrid'], ['doc', 'España'], ['ligahesperides', 'Sevilla'], ['ligasgda', 'Cádiz'],
  ['advetarucas', 'Cádiz'], ['vigoenxogo', 'Pontevedra'], ['afscs', 'Castellón'], ['tusligascanarias', 'Las Palmas'],
  ['futsalvilanova', 'Barcelona'], ['ligamaxal', 'Baleares'], ['laboralyempresas', 'Zaragoza'], ['zaragoza', 'Zaragoza'],
  ['futplaya', 'Valencia'], ['alicante', 'Alicante'], ['fs5navarra', 'Navarra'], ['minifutbolreus', 'Tarragona'],
  ['minifutboltarragones', 'Tarragona'], ['lligueslleida', 'Lleida'], ['ligacomarcalbajocinca', 'Huesca'],
  ['futbolinclusivo', 'España'], ['ligaone', 'España'], ['futbolreal', 'España'], ['ligasfutbolzone', 'España'],
  ['ligaveteranosfutbol', 'España'], ['minutocero', 'España'],
  // Añadidas el 01/10/2026 (búsqueda de ligas). miligafutbol9 se quitó: es de Chile (miliga.cl).
  ['minifutbolcatcentral', 'Barcelona'], ['aemf', 'España'],
  // MyGol también sirve en dominio propio (misma API): se reconoce por <title>MyGol platform</title>.
  ['malagaf7', 'Málaga', 'https://www.malagaf7.com'], // ligas.redfutbolsiete.com = redsports (mismos 278 torneos): no se repite.
  ['minifutbolterresdelebre', 'Tarragona', 'https://minifutbolterresdelebre.mygolpro.com'],
  // Añadidas el 02/10/2026: Fundación Eusebio Sacristán (Liga Federación de Peñas del Real Valladolid, F7) y
  // Fútbol Rápido Bizkaia (dominio propio).
  ['fes', 'Valladolid'],
  ['futbolrapido', 'Bizkaia', 'https://www.futbolrapido.biz'],
];
const FUERA_DE_ESPANA = new Set(['miligafutbol9']);
const baseDe = (c) => c.base ?? `https://${c.org}.mygol.es`;

const json = (t) => { try { return JSON.parse(t); } catch { return null; } };

export function creaAdaptadorMyGol({ organizaciones = ORGANIZACIONES } = {}) {
  return {
    nombre: 'mygol', deporte: 'futbol',
    // Dos organizaciones a la vez (subdominios distintos), cada una a su ritmo de siempre (02/10/2026).
    carriles: 2,
    semillas: () => organizaciones.map(([org, provincia, base]) => ({
      tipo: 'torneos', url: `${base ?? `https://${org}.mygol.es`}/api/tournaments`, prioridad: 10, contexto: { org, provincia, ...(base ? { base } : {}) } })),
    tipos: {
      torneos: {
        revisitarHoras: 24 * 7,
        interpreta(texto, { contexto }) {
          // Organizaciones que resultaron no ser de España (quedaron sembradas en la cola de pruebas): nada.
          if (FUERA_DE_ESPANA.has(contexto.org)) return { registros: [], enlaces: [] };
          const lista = json(texto);
          if (!Array.isArray(lista)) throw new Error('la lista de torneos no es JSON');
          return {
            registros: lista.map((t) => ({ tipo: 'torneo', clave: `${contexto.org}:${t.id}`,
              datos: { org: contexto.org, provincia: contexto.provincia, id: t.id, nombre: t.name?.trim(), temporada: t.idSeason, estado: t.status, visible: t.visible } })),
            enlaces: lista.filter((t) => t.visible !== false).flatMap((t) => {
              const ctx = { ...contexto, torneo: { id: t.id, nombre: t.name?.trim(), temporada: t.idSeason, estado: t.status } };
              return [
                { tipo: 'torneo', prioridad: 20, url: `${baseDe(contexto)}/api/tournaments/${t.id}`, contexto: ctx },
                { tipo: 'partidos', prioridad: 30, url: `${baseDe(contexto)}/api/matches/filterMatchesByDatesRange`, contexto: ctx,
                  cuerpo: JSON.stringify({ startTime: '2010-01-01T00:00:00.000Z', endTime: '2030-12-31T23:59:59.000Z', idTournament: String(t.id) }) },
              ];
            }),
          };
        },
      },
      torneo: {
        interpreta(texto, { contexto }) {
          const t = json(texto);
          if (!t) throw new Error('el torneo no es JSON');
          return { registros: [{ tipo: 'torneo-detalle', clave: `${contexto.org}:${t.id}`, datos: {
            org: contexto.org, provincia: contexto.provincia, id: t.id, nombre: t.name?.trim(),
            equipos: (t.teams ?? []).map((e) => ({ id: e.id, nombre: e.name?.trim() })),
            fases: (t.stages ?? []).map((f) => ({ id: f.id, nombre: f.name })), grupos: (t.groups ?? []).map((g) => ({ id: g.id, nombre: g.name, fase: g.idStage })) } }] };
        },
      },
      partidos: {
        interpreta(texto, { contexto }) {
          const lista = json(texto);
          if (!Array.isArray(lista)) throw new Error('los partidos no son JSON');
          // Si la API no filtrara por torneo, se quedan sólo los suyos (la clave es el id del partido: no se duplica).
          const suyos = lista.filter((m) => String(m.idTournament) === String(contexto.torneo.id));
          /*
           * Un partido sin jugar viene con homeScore=0 y visitorScore=0 (visto en el sondeo: status 1, fecha futura).
           * El 0 NO es un resultado: sólo se guarda el marcador si el partido ya empezó y su estado no es 1
           * (hipótesis a confirmar con más datos: el estado crudo se guarda tal cual en `estado`).
           */
          const jugado = (m) => m.status !== 1 && new Date(m.startTime) < new Date();
          const abiertos = suyos.some((m) => !jugado(m));
          return {
            registros: suyos.map((m) => ({ tipo: 'partido', clave: `${contexto.org}:${m.id}`, datos: {
              org: contexto.org, provincia: contexto.provincia, torneo: contexto.torneo, id: m.id,
              fase: m.idStage, grupo: m.idGroup, jornada: m.day?.name ?? null, inicio: m.startTime, duracion: m.duration, estado: m.status,
              local: { id: m.idHomeTeam, nombre: m.homeTeam?.name?.trim() }, visitante: { id: m.idVisitorTeam, nombre: m.visitorTeam?.name?.trim() },
              jugado: jugado(m), goles_local: jugado(m) ? m.homeScore : null, goles_visitante: jugado(m) ? m.visitorScore : null, campo: m.field?.name ?? null } })),
            revisitarHoras: abiertos ? 48 : undefined,
          };
        },
      },
    },
  };
}
export default creaAdaptadorMyGol();
