/**
 * Voleibol de Madrid (fmvoley.com): API JSON pública en intranet.fmvoley.com, encadenada así (parámetros
 * sacados del propio JavaScript de la web, 01/10/2026):
 *   getTiposCompeticion → getCompeticiones?tipoCompeticionId → getCompeticionesTemporada?competicionId
 *   → getFasesCompeticion?competicionTemporadaId → getGruposCompeticion?faseId → getJornadasGrupo?grupoId
 *   → getPartidosByJornada?jornadaId   (+ getClasificacionGrupo?grupoId)
 * Las respuestas se leen sin suponer la forma exacta (lista directa o dentro de data/result); cada nivel
 * guarda su crudo como registro para afinar después sin volver a pedir.
 */
const API = 'https://intranet.fmvoley.com/api/competiciones';
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
export function lista(j) {
  if (Array.isArray(j)) return j;
  if (j && typeof j === 'object') {
    if (j.error?.hasError) throw new Error(`la API dice error: ${j.error.message ?? ''}`);
    for (const k of ['data', 'result', 'results', 'items', 'datos', 'lista']) if (Array.isArray(j[k])) return j[k];
    const primera = Object.values(j).find(Array.isArray);
    if (primera) return primera;
  }
  return [];
}
const idDe = (x) => x?.id ?? x?.Id ?? x?.ID ?? Object.entries(x ?? {}).find(([k]) => /id$/i.test(k))?.[1];
const nombreDe = (x) => x?.nombre ?? x?.Nombre ?? x?.descripcion ?? x?.Descripcion ?? x?.name ?? null;

/**
 * Partido normalizado (02/10/2026: hasta ahora sólo se guardaba el crudo y el control de calidad daba 0 % de
 * fechas, equipos y marcadores). Un partido no finalizado lleva «0-0» en la API: eso es desconocido (null), no
 * un resultado. Fuera del crudo: escudos (llevan un `rnd` que cambia en cada visita y haría «cambiar» el
 * registro) y nombres de árbitros (no hacen falta).
 */
export function partidoFmvoley(x) {
  const n = (v) => (v == null || v === '' ? null : Number(v));
  const f = /(\d{2})\/(\d{2})\/(\d{4})/.exec(x.fecha ?? '');
  const id = (u) => /[?&]Id=(\d+)/.exec(u ?? '')?.[1] ?? null;
  // «DESCANSA...» es el hueco de la jornada (equipo que no juega), no un partido 0-0.
  const descanso = [x.equipo_local, x.equipo_visitante].some((e) => /^DESCANSA/i.test(String(e ?? '').trim()));
  const finalizado = x.finalizado === true && !descanso;
  const parciales = [];
  for (let i = 1; i <= 5; i += 1) {
    const a = n(x[`puntos_local_juego_${i}`]); const b = n(x[`puntos_visitante_juego_${i}`]);
    if (finalizado && (a || b)) parciales.push([a, b]);
  }
  return {
    fecha: f ? `${f[3]}-${f[2]}-${f[1]}` : null,
    hora: x.hora && x.hora !== '0:00' ? x.hora.padStart(5, '0') : null,   // «0:00» = sin hora fijada
    pabellon: x.pabellon || null, pista: x.pista || null,
    local: { id: id(x.img_local), nombre: x.equipo_local ?? null, club: x.clubLocalId ?? null },
    visitante: { id: id(x.img_visitante), nombre: x.equipo_visitante ?? null, club: x.clubVisitanteId ?? null },
    sets_local: finalizado ? n(x.sets_local) : null, sets_visitante: finalizado ? n(x.sets_visitante) : null,
    parciales: parciales.length ? parciales : null,
    finalizado, aplazado: x.esAplazado === true, ...(descanso ? { descanso: true } : {}),
  };
}
const sinRuido = (x) => Object.fromEntries(Object.entries(x ?? {}).filter(([k]) => !/^img_|^imagen$|^arb\d$/.test(k)));

function nivel({ tipo, siguiente, parametro, url: urlSig, prioridad, revisitar }) {
  return {
    revisitarHoras: revisitar,
    interpreta(texto, { contexto }) {
      const j = json(texto);
      if (j == null) throw new Error(`${tipo}: la respuesta no es JSON`);
      const xs = lista(j);
      const registros = xs.map((x) => ({ tipo, clave: `${tipo}:${idDe(x)}`, datos: { ...contexto, [tipo]: { id: idDe(x), nombre: nombreDe(x) },
        ...(tipo === 'partido' ? partidoFmvoley(x) : {}), crudo: sinRuido(x) } }));
      const enlaces = siguiente ? xs.filter((x) => idDe(x) != null).map((x) => ({
        tipo: siguiente, prioridad, url: `${API}/${urlSig}?${parametro}=${encodeURIComponent(idDe(x))}`,
        contexto: { ...contexto, [tipo]: { id: idDe(x), nombre: nombreDe(x) } } })) : [];
      if (tipo === 'grupo') {
        for (const x of xs.filter((y) => idDe(y) != null)) enlaces.push({ tipo: 'clasificacion', prioridad: prioridad + 5,
          url: `${API}/getClasificacionGrupo?grupoId=${encodeURIComponent(idDe(x))}`, contexto: { ...contexto, grupo: { id: idDe(x), nombre: nombreDe(x) } } });
      }
      return { registros, enlaces };
    },
  };
}

export function creaAdaptadorFmvoley() {
  return {
    nombre: 'fmvoley', deporte: 'voleibol',
    semillas: () => [{ tipo: 'tipos', url: `${API}/getTiposCompeticion`, prioridad: 10, contexto: { federacion: 'madrid' } }],
    tipos: {
      tipos: nivel({ tipo: 'tipoCompeticion', siguiente: 'competiciones', parametro: 'tipoCompeticionId', url: 'getCompeticiones', prioridad: 20, revisitar: 24 * 7 }),
      competiciones: nivel({ tipo: 'competicion', siguiente: 'temporadas', parametro: 'competicionId', url: 'getCompeticionesTemporada', prioridad: 30, revisitar: 24 * 7 }),
      temporadas: nivel({ tipo: 'division', siguiente: 'fases', parametro: 'competicionTemporadaId', url: 'getFasesCompeticion', prioridad: 40, revisitar: 24 * 7 }),
      fases: nivel({ tipo: 'fase', siguiente: 'grupos', parametro: 'faseId', url: 'getGruposCompeticion', prioridad: 50, revisitar: 24 * 7 }),
      grupos: nivel({ tipo: 'grupo', siguiente: 'jornadas', parametro: 'grupoId', url: 'getJornadasGrupo', prioridad: 60, revisitar: 24 * 3 }),
      jornadas: nivel({ tipo: 'jornada', siguiente: 'partidos', parametro: 'jornadaId', url: 'getPartidosByJornada', prioridad: 70, revisitar: 24 * 2 }),
      partidos: nivel({ tipo: 'partido', prioridad: 80, revisitar: 24 }),
      clasificacion: nivel({ tipo: 'fila-clasificacion', prioridad: 90, revisitar: 24 * 2 }),
    },
  };
}
export default creaAdaptadorFmvoley();
