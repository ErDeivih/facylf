/**
 * Playooz (api.playooz.com): plataforma de ligas de F7/F11/sala amateur y universitarias (Madrid, Navarra,
 * Cataluña…). Una API para todos los clientes; la liga se identifica con la cabecera X-Tenant-Host (el dominio de
 * su web), igual que hace su propia página. Sondeo del 01/10/2026 (ligafutbolmadrid.es):
 *   /season/selector                                  → temporadas
 *   /event/web/list?seasonId=&pageNumber=&pageSize=   → eventos (ligas, copas) de la temporada
 *   /event/rounds?eventId=                            → rondas (fases)
 *   /event/groups?roundId=                            → grupos
 *   /event/result/matches?eventId&type=1&roundId&groupId → TODOS los partidos del grupo (marcador null = sin jugar)
 *   /event/standings/{evento}/{ronda}/{grupo}         → clasificación
 * Sólo equipos (los jugadores son otra llamada que no se usa). Los logos llevan una firma que cambia en cada
 * petición: se quitan para que el registro no «cambie» en cada visita.
 */
export const CLIENTES = [
  ['ligafutbolmadrid.es', 'Madrid'], ['www.ligasfutbolsiete.com', 'Madrid'], ['www.ligaelitefutbol.com', 'Madrid'],
  ['www.envinya.es', 'Madrid'], ['ligapressbysantander.com', 'Madrid'], ['www.futbol7navarra.com', 'Navarra'],
  ['lliguesuniversitaries.cat', 'Barcelona'], ['www.esportuniversitari.cat', 'Cataluña'], ['mlasport.com', 'Aragón'],
  ['www.aidebcompeticiones.com', 'España'], ['www.campeonatoscda.com', 'España'],
];
const API = 'https://api.playooz.com';
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const sinLogos = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !/logo/i.test(k)));

export function partido(m) {
  const jugado = m.scoreHome != null && m.scoreAway != null;
  return {
    id: m.id, evento: { id: m.eventId, nombre: m.eventName }, ronda: m.roundName, grupo: m.groupName,
    jornada: m.fixtureNumber ?? null, jornada_nombre: m.fixtureName ?? null, fecha: m.date?.slice(0, 10) ?? null, hora: m.start?.slice(0, 5) ?? null,
    instalacion: m.facilityAlias ?? null, campo: m.fieldAlias ?? null, descansa: m.isBye || undefined,
    local: { id: m.homeId, nombre: m.homeName ?? m.homeSlotText ?? null }, visitante: { id: m.awayId, nombre: m.awayName ?? m.awaySlotText ?? null },
    // Sin marcador publicado = desconocido (null), nunca 0.
    goles_local: jugado ? m.scoreHome : null, goles_visitante: jugado ? m.scoreAway : null, jugado,
    penaltis: m.penaltyShots ? [m.penaltyHome, m.penaltyAway] : undefined,
    retirada: (m.withdrawalHome || m.withdrawalAway || m.withdrawalMidGameHome || m.withdrawalMidGameAway) ? true : undefined,
    estado: m.status,
  };
}

export function creaAdaptadorPlayooz({ clientes = CLIENTES } = {}) {
  const url = (ruta) => `${API}${ruta}`;
  return {
    nombre: 'playooz', deporte: 'futbol',
    cabeceras: (pag) => {
      let c = null; try { c = JSON.parse(pag.contexto ?? 'null'); } catch {}
      return c?.host ? { 'X-Tenant-Host': c.host, 'X-Language': 'es', accept: 'application/json' } : null;
    },
    semillas: () => clientes.map(([host, provincia]) => ({ tipo: 'temporadas', url: url(`/season/selector?h=${host}`), prioridad: 5, contexto: { host, provincia } })),
    tipos: {
      temporadas: {
        interpreta(texto, { contexto }) {
          const t = json(texto);
          if (!Array.isArray(t)) return { sinPublicar: true };
          // La lista sin seasonId (lo que enseña la web) más cada temporada por si guarda las pasadas.
          const enlaces = [{ tipo: 'eventos', url: url(`/event/web/list?pageNumber=1&pageSize=100&h=${contexto.host}`), prioridad: 6, contexto }]
            .concat(t.map((s) => ({ tipo: 'eventos', url: url(`/event/web/list?seasonId=${s.id}&pageNumber=1&pageSize=100&h=${contexto.host}`), prioridad: 7,
              contexto: { ...contexto, temporada: s.label } })));
          return { enlaces, revisitarHoras: 24 * 7 };
        },
      },
      eventos: {
        interpreta(texto, { contexto }) {
          const d = json(texto);
          const items = d?.items ?? [];
          return {
            registros: items.map((e) => ({ tipo: 'evento', clave: `${contexto.host}|${e.id}`, datos: { host: contexto.host, provincia: contexto.provincia,
              id: e.id, nombre: e.nameFull, descripcion: e.description, estado: e.statusText, ruta: e.route } })),
            enlaces: items.filter((e) => e.status !== 0).map((e) => ({ tipo: 'rondas', url: url(`/event/rounds?eventId=${e.id}`), prioridad: 8,
              contexto: { host: contexto.host, provincia: contexto.provincia, evento: { id: e.id, nombre: e.nameFull } } })),
            revisitarHoras: 24 * 3,
          };
        },
      },
      rondas: {
        interpreta(texto, { contexto }) {
          const r = json(texto);
          if (!Array.isArray(r) || !r.length) return { sinPublicar: true };
          return { enlaces: r.map((x) => ({ tipo: 'grupos', url: url(`/event/groups?roundId=${x.id}`), prioridad: 9, contexto: { ...contexto, ronda: { id: x.id, nombre: x.name } } })),
            revisitarHoras: 24 * 3 };
        },
      },
      grupos: {
        interpreta(texto, { contexto }) {
          const g = json(texto);
          if (!Array.isArray(g) || !g.length) return { sinPublicar: true };
          const e = contexto.evento.id, r = contexto.ronda.id;
          return {
            enlaces: g.flatMap((x) => {
              const ctx = { ...contexto, grupo: { id: x.id, nombre: x.name } };
              return [
                { tipo: 'partidos', url: url(`/event/result/matches?eventId=${e}&type=1&roundId=${r}&groupId=${x.id}`), prioridad: 3, contexto: ctx },
                { tipo: 'clasificacion', url: url(`/event/standings/${e}/${r}/${x.id}`), prioridad: 4, contexto: ctx },
              ];
            }),
            revisitarHoras: 24 * 7,
          };
        },
      },
      partidos: {
        interpreta(texto, { contexto }) {
          const l = json(texto);
          if (!Array.isArray(l)) throw new Error('los partidos no son JSON');
          if (!l.length) return { sinPublicar: true };
          const ps = l.map(partido);
          return {
            registros: ps.map((p) => ({ tipo: 'partido', clave: `${contexto.host}|${p.id}`, datos: { host: contexto.host, provincia: contexto.provincia, grupo_id: contexto.grupo.id, ...p } })),
            revisitarHoras: ps.some((p) => !p.jugado && !p.descansa) ? 24 : undefined,
          };
        },
      },
      clasificacion: {
        interpreta(texto, { contexto }) {
          const d = json(texto);
          const grupos = d?.groups ?? [];
          if (!grupos.length) return { sinPublicar: true };
          return {
            registros: grupos.map((g) => ({ tipo: 'clasificacion', clave: `${contexto.host}|${g.groupId}`, datos: {
              host: contexto.host, provincia: contexto.provincia, evento: contexto.evento, ronda: g.roundName, grupo: { id: g.groupId, nombre: g.groupName },
              filas: (g.standings ?? []).map((s) => sinLogos({ posicion: s.pos, equipo: { id: s.id, nombre: s.name }, puntos: s.points, jugados: s.played,
                ganados: s.won, empatados: s.drawn, perdidos: s.lost, a_favor: s.scoreFor, en_contra: s.scoreAgainst, puntos_extra: s.extraPoints })) } })),
            revisitarHoras: 24,
          };
        },
      },
    },
  };
}
export default creaAdaptadorPlayooz();
