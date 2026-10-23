/**
 * OWBasket (Optimal Way Consulting): la plataforma de competición de varias federaciones de baloncesto. Su API
 * «ESB» (esb.optimalwayconsulting.com/{fede}/1/{clave}) es la que llama la web pública sin sesión; la clave va
 * escrita en la propia página de cada federación. Responde JSON en base64. Sondeo del 01/10/2026 (FBCyL):
 *   Zone/getVisibleWeb                                   → zonas (FBCyL y sus 9 delegaciones provinciales)
 *   CategoryRegistered/getByZoneAndSeason/{zona}/{temp}  → categorías de la zona en la temporada
 *   Competition/getCompetitionGroupVisibleWeb/{cat}/{zona} → grupos (fase + grupo)
 *   FCBQWeb/getAllGamesByGrupWithMatchRecords/{grupo}    → TODAS las jornadas del grupo con marcador, pista y
 *                                                           clasificación (una petición por grupo)
 * Sin datos de personas: sólo equipos, clubes, pistas y marcadores. Temporadas desde 2016 en FBCyL.
 * Federaciones: Valencia, Castilla y León, Rioja, Castilla-La Mancha, Navarra, Baleares y País Vasco.
 */
export const FEDERACIONES = [
  { fede: 'fbcyl', clave: 'jR4rgA5K6Chhh5vyfrxo9wTScdg2NT7K', nombre: 'Federación de Baloncesto de Castilla y León' },
  { fede: 'fbcv', clave: 'btz38ZsZlAdaODiH2fGsnJC9mZgSNPeR', nombre: 'Federació de Basquetbol de la Comunitat Valenciana' },
  { fede: 'frb', clave: 'jR4rgA5K6Chhh5vyfrxo9wTScdg2NT7K', nombre: 'Federación Riojana de Baloncesto' },
  // Claves leídas de sus webs públicas el 01/10/2026 (busca-plataforma.mjs). Sus subdominios competiciones.*
  // tienen el certificado caducado, pero el ESB (esb.optimalwayconsulting.com) tiene uno válido.
  { fede: 'fbclm', clave: 'JEduUpOOoH6Ym8MKXbJN9GL5Zj8Z5Uoa', nombre: 'Federación de Baloncesto de Castilla-La Mancha' },
  { fede: 'fnb', clave: 'k1tEpEWUQKXh9qMvJVS2sWofAvrICVb1', nombre: 'Federación Navarra de Baloncesto' },
  { fede: 'fbib', clave: 'jR4rgA5K6Chhh5vyfrxo9wTScdg2NT7K', nombre: 'Federació de Bàsquet de les Illes Balears' },
  { fede: 'esf', clave: 'GxgkvuHIaZfnRat0UN9xafd8TyzGDHjN', nombre: 'Federación Vasca de Baloncesto' },
];
const ESB = 'https://esb.optimalwayconsulting.com';

/** El ESB contesta base64 (a veces JSON directo). Devuelve messageData o null. */
export function descodifica(texto) {
  const t = String(texto ?? '').trim();
  let j = null;
  try { j = JSON.parse(/^[[{]/.test(t) ? t : Buffer.from(t, 'base64').toString('utf8')); } catch { return null; }
  if (j && j.result && j.result !== 'OK') return null;
  return j?.messageData ?? j;
}

const nulo = (v) => (v === '' || v === undefined ? null : v);
const entero = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Partidos y clasificación de un grupo (respuesta de getAllGamesByGrupWithMatchRecords). */
export function partidosDelGrupo(datos) {
  const salida = [];
  for (const [num, ronda] of Object.entries(datos?.rounds ?? {})) {
    for (const m of Object.values(ronda?.matches ?? {})) {
      const pl = entero(m.localScore), pv = entero(m.visitorScore);
      const fecha = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/.exec(m.matchDay ?? '');
      salida.push({
        id_partido: m.idMatch, jornada: entero(m.numMatchDay ?? num), fecha_jornada: nulo(ronda?.date),
        fecha: fecha?.[1] ?? null, hora: fecha?.[2] ?? null,
        local: { id: m.idLocalTeam, nombre: m.nameLocalTeam ?? m.nameLocalTeamCte, club: m.idLocalClub },
        visitante: { id: m.idVisitorTeam, nombre: m.nameVisitorTeam ?? m.nameVisitorTeamCte, club: m.idVisitorClub },
        // Sin marcador publicado = desconocido (null), nunca 0.
        puntos_local: pl, puntos_visitante: pv, jugado: pl != null && pv != null,
        parciales: [1, 2, 3, 4].map((q) => [entero(m[`localScoreP${q}`]), entero(m[`visitorScoreP${q}`])]).filter(([a, b]) => a != null || b != null),
        estado: nulo(m.state), tipo_resultado: nulo(m.typeResult), no_presentado: m.typeResult === 'NP' ? true : undefined,
        pista: nulo(m.nameField), direccion_pista: nulo(m.adressField),
        competicion: { id: m.idCompetition, nombre: m.nameCompetition }, categoria: { id: m.idCategorySigned, nombre: m.nameCategorySigned ?? m.nameCategory },
        sexo: nulo(m.sexCategorySigned), grupo: { id: m.idGroup, nombre: m.nameGroup }, temporada: entero(m.season), zona: nulo(m.idZone),
      });
    }
  }
  const clasificacion = (datos?.standing ?? []).map((s) => ({
    posicion: entero(s.position), equipo: { id: s.idTeam, nombre: s.teamName, club: s.idClub }, jornada: entero(s.jornada),
    jugados: entero(s.matchPlayed), ganados: entero(s.matchWin), perdidos: entero(s.matchLost), empatados: entero(s.matchTie),
    no_presentados: entero(s.matchNotPresent), a_favor: entero(s.matchScoreFavour), en_contra: entero(s.matchScoreAgainst),
    puntos: entero(s.standingScore),
  }));
  return { partidos: salida, clasificacion };
}

export function creaAdaptadorOwbasket({ federaciones = FEDERACIONES, temporadas = [2026, 2025, 2024, 2023], ahora = () => new Date() } = {}) {
  const actual = () => { const d = ahora(); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
  const prio = (t, nivel) => (actual() - Number(t)) * 10 + nivel + 10;
  const url = (f, ruta) => `${ESB}/${f.fede}/1/${f.clave}/${ruta}`;
  const fedDe = (c) => federaciones.find((f) => f.fede === c.fede);
  return {
    nombre: 'owbasket', deporte: 'baloncesto',
    semillas: () => federaciones.map((f) => ({ tipo: 'zonas', url: url(f, 'Zone/getVisibleWeb'), prioridad: 5, contexto: { fede: f.fede } })),
    tipos: {
      zonas: {
        interpreta(texto, { contexto }) {
          const zonas = descodifica(texto);
          if (!Array.isArray(zonas)) return { sinPublicar: true };
          const f = fedDe(contexto);
          return {
            enlaces: zonas.filter((z) => z.visibleWeb !== '0').flatMap((z) => temporadas.map((t) => ({
              tipo: 'categorias', url: url(f, `CategoryRegistered/getByZoneAndSeason/${z.idZone}/${t}`), prioridad: prio(t, 3),
              contexto: { fede: f.fede, zona: { id: z.idZone, nombre: z.name }, temporada: t } }))),
            revisitarHoras: 24 * 30,
          };
        },
      },
      categorias: {
        interpreta(texto, { contexto }) {
          const cats = descodifica(texto);
          if (!Array.isArray(cats)) return { sinPublicar: true };
          const f = fedDe(contexto);
          return {
            enlaces: cats.map((c) => ({ tipo: 'grupos', url: url(f, `Competition/getCompetitionGroupVisibleWeb/${c.idCategoryRegistred}/${contexto.zona.id}`),
              prioridad: prio(contexto.temporada, 2),
              contexto: { ...contexto, categoria: { id: c.idCategoryRegistred, nombre: c.categoryRegisteredName, sexo: c.sex ?? null } } })),
            revisitarHoras: Number(contexto.temporada) === actual() ? 24 * 7 : undefined,
          };
        },
      },
      grupos: {
        interpreta(texto, { contexto }) {
          const grupos = descodifica(texto);
          if (!Array.isArray(grupos)) return { sinPublicar: true };
          const f = fedDe(contexto);
          return {
            enlaces: grupos.map((g) => ({ tipo: 'partidos', url: url(f, `FCBQWeb/getAllGamesByGrupWithMatchRecords/${g.idGroup}`),
              prioridad: prio(contexto.temporada, 1),
              contexto: { ...contexto, grupo: { id: g.idGroup, nombre: g.nameGrupCompetition ?? g.grupName } } })),
            revisitarHoras: Number(contexto.temporada) === actual() ? 24 * 7 : undefined,
          };
        },
      },
      partidos: {
        interpreta(texto, { contexto }) {
          const datos = descodifica(texto);
          const { partidos, clasificacion } = partidosDelGrupo(datos);
          if (!partidos.length) return { sinPublicar: true };
          const base = { fede: contexto.fede, zona: contexto.zona };
          const registros = partidos.map((p) => ({ tipo: 'partido', clave: `${contexto.fede}|${p.id_partido}`, datos: { ...base, ...p } }));
          if (clasificacion.length) registros.push({ tipo: 'clasificacion', clave: `${contexto.fede}|${contexto.grupo.id}`,
            datos: { ...base, temporada: contexto.temporada, categoria: contexto.categoria, grupo: contexto.grupo, filas: clasificacion } });
          const abiertos = partidos.some((p) => !p.jugado);
          return { registros, revisitarHoras: Number(contexto.temporada) === actual() && abiertos ? 24 : undefined };
        },
      },
    },
  };
}

export default creaAdaptadorOwbasket();
