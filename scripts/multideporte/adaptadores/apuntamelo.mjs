/**
 * Apúntamelo (apuntamelo.com): plataforma de ligas de F7/sala amateur, sobre todo en Cataluña (Tiki Taka BCN,
 * Catalonia Sports, Clicsports, Viaró, Másters BRAFA, El Planter, Liga Brave…), también Aragón (MLA),
 * Andalucía (Liga de Empresas), Elche o Futbol Live (Valencia). API JSON pública, la misma que usa su web.
 * Sondeo del 01/10/2026:
 *   /obtenerOrganizaciones                                       → organizaciones
 *   /obtenerDivisiones?id={org}                                  → divisiones (con su instalación)
 *   /obtenerPartidosPorJornadaDivision?organizacion=&division=   → TODOS los partidos de la división
 *   /obtenerLigasDivision?organizacion=&division=                → grupos con su clasificación (JSON)
 * Sólo equipos: no se piden jugadores, plantillas, usuarios ni fotos (y se quitan escudos, capitanes y fotos).
 * Los amistosos se saltan.
 */
const BASE = 'https://apuntamelo.com';
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const AMISTOSOS = /amistos/i;

export function partido(m) {
  const jugado = m.Goles_A != null && m.Goles_B != null;
  return {
    id: m.Id, liga: { id: m.FK_Liga, nombre: m.NombreLiga ?? m.NombreGrupo ?? null }, division: m.Division, grupo: { id: m.Grupo, nombre: m.NombreGrupo ?? null },
    jornada: m.Jornada ?? null, fecha: m.Fecha ?? null, hora: m.Hora ? m.Hora.slice(0, 5) : null, campo: m.Nombre_campo ?? null,
    local: { id: m.FK_EquipoLiga_A, nombre: m.Nombre_A }, visitante: { id: m.FK_EquipoLiga_B, nombre: m.Nombre_B },
    // Sin marcador publicado = desconocido (null), nunca 0.
    goles_local: jugado ? m.Goles_A : null, goles_visitante: jugado ? m.Goles_B : null, jugado,
    penaltis: m.Penaltis_A != null || m.Penaltis_B != null ? [m.Penaltis_A, m.Penaltis_B] : undefined,
    validado: m.Validado === 1, incomparecencia: m.Wo ? true : undefined, playoff: m.Playoff ? true : undefined, fase: m.Fase ?? null,
  };
}

export function creaAdaptadorApuntamelo() {
  return {
    nombre: 'apuntamelo', deporte: 'futbol',
    semillas: () => [{ tipo: 'organizaciones', url: `${BASE}/obtenerOrganizaciones`, prioridad: 5, contexto: {} }],
    tipos: {
      organizaciones: {
        interpreta(texto) {
          const l = json(texto);
          if (!Array.isArray(l)) throw new Error('las organizaciones no son JSON');
          return {
            registros: l.map((o) => ({ tipo: 'organizacion', clave: String(o.Id), datos: { id: o.Id, nombre: o.Nombre, club: o.Club === 1 } })),
            enlaces: l.map((o) => ({ tipo: 'divisiones', url: `${BASE}/obtenerDivisiones?id=${o.Id}`, prioridad: 6, contexto: { org: { id: o.Id, nombre: o.Nombre } } })),
            revisitarHoras: 24 * 7,
          };
        },
      },
      divisiones: {
        interpreta(texto, { contexto }) {
          const l = json(texto);
          if (!Array.isArray(l)) throw new Error('las divisiones no son JSON');
          const buenas = l.filter((d) => !AMISTOSOS.test(d.Nombre ?? ''));
          if (!buenas.length) return { sinPublicar: true };
          const o = contexto.org.id;
          return {
            enlaces: buenas.flatMap((d) => {
              const ctx = { ...contexto, division: { id: d.Id, nombre: d.Nombre } };
              return [
                { tipo: 'partidos', url: `${BASE}/obtenerPartidosPorJornadaDivision?organizacion=${o}&division=${d.Id}`, prioridad: 3, contexto: ctx },
                { tipo: 'clasificacion', url: `${BASE}/obtenerLigasDivision?organizacion=${o}&division=${d.Id}`, prioridad: 4, contexto: ctx },
              ];
            }),
            revisitarHoras: 24 * 3,
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
            registros: ps.map((p) => ({ tipo: 'partido', clave: String(p.id), datos: { org: contexto.org, division_nombre: contexto.division.nombre, ...p } })),
            revisitarHoras: ps.some((p) => !p.jugado) ? 24 : undefined,
          };
        },
      },
      clasificacion: {
        interpreta(texto, { contexto }) {
          const l = json(texto);
          if (!Array.isArray(l) || !l.length) return { sinPublicar: true };
          return {
            registros: l.map((g) => {
              let filas = [];
              try { filas = JSON.parse(g.Json_clasificacion ?? '[]') ?? []; } catch {}
              return { tipo: 'clasificacion', clave: String(g.Id), datos: { org: contexto.org, division: contexto.division, liga: { id: g.Id, nombre: g.Nombre }, grupo: g.Grupo,
                filas: filas.map((f) => ({ equipo: { id: f.Id, nombre: f.Nombre }, puntos: f.Puntos, jugados: f.PJ, ganados: f.Victorias, empatados: f.Empates,
                  perdidos: f.Derrotas, a_favor: f.GF, en_contra: f.GC, fairplay: f.Fairplay })) } };
            }),
            revisitarHoras: 24,
          };
        },
      },
    },
  };
}
export default creaAdaptadorApuntamelo();
