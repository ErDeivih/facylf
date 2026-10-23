/*
 * ── PREVIA DE PARTIDO: TU EQUIPO CONTRA EL RIVAL ──────────────────────────────────────────────────────
 *
 * Responde la primera pregunta del producto —«¿cómo preparo el partido?»— sin abrir dos informes. Pone
 * frente a frente a dos inscripciones del MISMO grupo: clasificación, forma, casa/fuera, cuándo marcan y
 * cuándo encajan, disciplina, once más repetido, goleadores y enfrentamientos previos.
 *
 * Reglas del proyecto que aplica:
 *   · Temporada en curso: lo publicado hasta hoy, y se dice hasta qué jornada.
 *   · Enfrentamientos de temporadas anteriores: sólo de grupos con certificado completo.
 *   · La clasificación que se calcula aquí es la de los RESULTADOS publicados y se rotula así; la oficial,
 *     si existe, va aparte y con su jornada de corte.
 *   · Desconocido no es cero: un gol sin minuto no entra en los tramos, se cuenta aparte; un partido sin
 *     alineación no entra en el once.
 *   · Personas por identificador canónico, nunca por nombre.
 */
import { ejecutaEnFoto } from './consultas-en-foto.mjs';
import { temporadaActual } from './informes-politica.mjs';
import { formatoPartido } from './informe-formato.mjs';
import { InformeNoConsultable } from './informe-errores.mjs';

const entero = (v) => { const n = Number(v); if (!Number.isSafeInteger(n) || n <= 0) throw new InformeNoConsultable({ status: 400, titulo: 'Equipo no válido' }); return n; };

/** Las consultas, con los dos identificadores ya validados como enteros. */
export function consultasPrevia(a, b) {
  const equipos = `${a},${b}`;
  const grupo = `(select phase_group_id from core.team_entry where id=${a})`;
  return {
    contexto: `select te.id, te.phase_group_id, coalesce(nullif(te.nombre_en_fuente,''),ts.nombre) as equipo, cl.id as club_id,
        cl.nombre_canonico as club, pg.nombre as grupo, pg.jornadas_previstas, ce.nombre_publicado as competicion,
        ce.categoria, ce.modalidad, s.etiqueta as temporada, f.codigo as federacion,
        cc.visibility_state, cc.completitud_historica, cc.complete_through_matchday
      from core.team_entry te join core.team_season ts on ts.id=te.team_season_id join core.club cl on cl.id=ts.club_id
      join core.phase_group pg on pg.id=te.phase_group_id join core.competition_edition ce on ce.id=pg.competition_edition_id
      join core.season s on s.id=ce.season_id join core.federation f on f.id=ce.federation_id
      left join ops.coverage_checkpoint cc on cc.phase_group_id=pg.id
      where te.id in (${equipos})`,
    // Todos los partidos del grupo: con ellos se calcula la clasificación por resultados y la forma.
    partidos: `select m.id, md.numero as jornada, coalesce(m.played_at::date, m.fecha_prevista, md.fecha_prevista) as fecha,
        m.home_team_entry_id as local, m.away_team_entry_id as visitante, m.goles_local, m.goles_visitante,
        -- Por LADO: un acta parcial puede traer la alineación de un equipo y no la del otro.
        (select count(*) from core.appearance ap where ap.match_id=m.id and ap.team_entry_id=m.home_team_entry_id) as apariciones_local,
        (select count(*) from core.appearance ap where ap.match_id=m.id and ap.team_entry_id=m.away_team_entry_id) as apariciones_visitante
      from core.match m join core.matchday md on md.id=m.matchday_id
      where m.phase_group_id=${grupo} order by md.numero, m.source_order limit 2000`,
    nombres: `select te.id, coalesce(nullif(te.nombre_en_fuente,''),ts.nombre) as equipo
      from core.team_entry te join core.team_season ts on ts.id=te.team_season_id where te.phase_group_id=${grupo} limit 200`,
    oficial: `select st.team_entry_id, st.posicion, st.puntos, st.jugados, md.numero as jornada
      from core.standing_snapshot st join core.matchday md on md.id=st.matchday_id
      where st.phase_group_id=${grupo} and st.origen='oficial'
        and md.numero=(select max(md2.numero) from core.standing_snapshot s2 join core.matchday md2 on md2.id=s2.matchday_id
                       where s2.phase_group_id=${grupo} and s2.origen='oficial') limit 200`,
    goles: `select e.match_id, e.minute_base, e.lado_beneficiado, e.subtipo, e.sujeto_tipo, e.person_id, e.team_entry_id as equipo_autor,
        m.home_team_entry_id as local, m.away_team_entry_id as visitante, p.nombre_mostrado as nombre
      from core.match_event e join core.match m on m.id=e.match_id left join core.person p on p.id=e.person_id
      where m.phase_group_id=${grupo} and e.event_type='gol' and (m.home_team_entry_id in (${equipos}) or m.away_team_entry_id in (${equipos}))
      limit 5000`,
    tarjetas: `select e.team_entry_id as equipo, e.event_type, e.subtipo, count(*)::int as n
      from core.match_event e join core.match m on m.id=e.match_id
      where m.phase_group_id=${grupo} and e.team_entry_id in (${equipos}) and e.sujeto_tipo='jugador'
        and e.event_type in ('tarjeta_amarilla','tarjeta_roja')
      group by 1,2,3 limit 50`,
    once: `select a.team_entry_id as equipo, a.person_id, p.nombre_mostrado as nombre,
        count(*) filter (where a.condition='starter')::int as titularidades, count(*)::int as convocatorias
      from core.appearance a join core.match m on m.id=a.match_id join core.person p on p.id=a.person_id
      where m.phase_group_id=${grupo} and a.team_entry_id in (${equipos})
      group by 1,2,3 order by 1, titularidades desc, convocatorias desc, nombre limit 400`,
    // Enfrentamientos previos entre equipos de estos dos clubes en la misma categoría, sólo certificados.
    previos: `select s.etiqueta as temporada, ce.nombre_publicado as competicion, md.numero as jornada,
        coalesce(m.played_at::date, m.fecha_prevista) as fecha, ts_l.club_id as club_local,
        coalesce(nullif(tl.nombre_en_fuente,''),ts_l.nombre) as local, coalesce(nullif(tv.nombre_en_fuente,''),ts_v.nombre) as visitante,
        m.goles_local, m.goles_visitante
      from core.match m join core.phase_group pg on pg.id=m.phase_group_id
      join core.competition_edition ce on ce.id=pg.competition_edition_id join core.season s on s.id=ce.season_id
      join core.matchday md on md.id=m.matchday_id
      join core.team_entry tl on tl.id=m.home_team_entry_id join core.team_season ts_l on ts_l.id=tl.team_season_id
      join core.team_entry tv on tv.id=m.away_team_entry_id join core.team_season ts_v on ts_v.id=tv.team_season_id
      where pg.id<>${grupo} and m.goles_local is not null and m.goles_visitante is not null
        and s.etiqueta between '2021-22' and '${temporadaActual()}'
        and ce.categoria=(select ce0.categoria from core.team_entry t0 join core.phase_group g0 on g0.id=t0.phase_group_id
                          join core.competition_edition ce0 on ce0.id=g0.competition_edition_id where t0.id=${a})
        and exists (select 1 from ops.coverage_checkpoint cc where cc.phase_group_id=pg.id and cc.visibility_state='completa' and cc.completitud_historica)
        and least(ts_l.club_id,ts_v.club_id)=(select least(x.c1,x.c2) from (select
              (select ts.club_id from core.team_entry t join core.team_season ts on ts.id=t.team_season_id where t.id=${a}) c1,
              (select ts.club_id from core.team_entry t join core.team_season ts on ts.id=t.team_season_id where t.id=${b}) c2) x)
        and greatest(ts_l.club_id,ts_v.club_id)=(select greatest(x.c1,x.c2) from (select
              (select ts.club_id from core.team_entry t join core.team_season ts on ts.id=t.team_season_id where t.id=${a}) c1,
              (select ts.club_id from core.team_entry t join core.team_season ts on ts.id=t.team_season_id where t.id=${b}) c2) x)
      order by fecha desc nulls last limit 20`,
  };
}

/** Lo calculable sin base, separado para poder probarlo: clasificación, forma, splits, tramos, cuadre. */
export function componPrevia({ contexto, partidos, nombres, oficial, goles, tarjetas, once, previos }, a, b) {
  const ctx = new Map(contexto.map((x) => [String(x.id), x]));
  const A = ctx.get(String(a)), B = ctx.get(String(b));
  const nombre = new Map(nombres.map((x) => [String(x.id), x.equipo]));
  const jugados = partidos.filter((m) => m.goles_local != null && m.goles_visitante != null);
  const formato = formatoPartido(A);

  // Clasificación por resultados publicados (3-1-0), orden: puntos, diferencia, goles a favor, nombre.
  const tabla = new Map();
  const fila = (id) => { if (!tabla.has(id)) tabla.set(id, { id, equipo: nombre.get(id) ?? id, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 }); return tabla.get(id); };
  for (const id of nombre.keys()) fila(id);
  for (const m of jugados) {
    const l = fila(String(m.local)), v = fila(String(m.visitante)), gl = Number(m.goles_local), gv = Number(m.goles_visitante);
    l.pj++; v.pj++; l.gf += gl; l.gc += gv; v.gf += gv; v.gc += gl;
    if (gl > gv) { l.g++; v.p++; l.pts += 3; } else if (gl < gv) { v.g++; l.p++; v.pts += 3; } else { l.e++; v.e++; l.pts++; v.pts++; }
  }
  const clasificacion = [...tabla.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.gc) - (x.gf - x.gc) || y.gf - x.gf || String(x.equipo).localeCompare(String(y.equipo), 'es'))
    .map((x, i) => ({ ...x, pos: i + 1 }));

  const equipo = (id) => {
    const sid = String(id);
    const suyos = jugados.filter((m) => String(m.local) === sid || String(m.visitante) === sid)
      .map((m) => { const casa = String(m.local) === sid, gf = Number(casa ? m.goles_local : m.goles_visitante), gc = Number(casa ? m.goles_visitante : m.goles_local);
        return { ...m, casa, gf, gc, rival: nombre.get(String(casa ? m.visitante : m.local)), r: gf > gc ? 'V' : gf < gc ? 'D' : 'E' }; });
    const split = (lista) => ({ pj: lista.length, v: lista.filter((x) => x.r === 'V').length, e: lista.filter((x) => x.r === 'E').length,
      d: lista.filter((x) => x.r === 'D').length, gf: lista.reduce((s, x) => s + x.gf, 0), gc: lista.reduce((s, x) => s + x.gc, 0) });
    // Goles por tramos: sólo los que tienen minuto y lado; el resto se cuenta como «sin minuto».
    const dur = formato.duracion ?? 90, tramos = Array.from({ length: 6 }, (_, i) => ({ desde: Math.floor(i * dur / 6), hasta: Math.floor((i + 1) * dur / 6), favor: 0, contra: 0 }));
    let sinMinuto = 0;
    const idsSuyos = new Set(suyos.map((m) => String(m.id)));
    for (const g of goles.filter((x) => idsSuyos.has(String(x.match_id)))) {
      const casa = String(g.local) === sid, aFavor = (casa && g.lado_beneficiado === 'local') || (!casa && g.lado_beneficiado === 'visitante');
      if (g.minute_base == null || !['local', 'visitante'].includes(g.lado_beneficiado) || Number(g.minute_base) < 0 || Number(g.minute_base) > dur + 15) { sinMinuto++; continue; }
      const t = tramos[Math.min(5, Math.floor(Number(g.minute_base) / (dur / 6)))]; if (aFavor) t.favor++; else t.contra++;
    }
    // ¿Cuadran los eventos con el marcador? Si no, los tramos describen sólo los goles con acta.
    const golesMarcador = suyos.reduce((s, x) => s + x.gf + x.gc, 0);
    const golesEventos = goles.filter((x) => idsSuyos.has(String(x.match_id))).length;
    const goleadores = new Map();
    for (const g of goles) if (String(g.equipo_autor) === sid && g.sujeto_tipo === 'jugador' && g.subtipo !== 'propia_puerta' && g.person_id != null) {
      const k = String(g.person_id); goleadores.set(k, { nombre: g.nombre, goles: (goleadores.get(k)?.goles ?? 0) + 1 });
    }
    // Denominador del once: partidos donde ESTE equipo tiene alineación, no donde la tiene cualquiera.
    const conAlineacion = suyos.filter((m) => Number(m.casa ? m.apariciones_local : m.apariciones_visitante) > 0).length;
    const tarj = (tipo, doble = false) => tarjetas.filter((x) => String(x.equipo) === sid && x.event_type === tipo && (doble ? x.subtipo === 'doble_amarilla' : true)).reduce((s, x) => s + Number(x.n), 0);
    const of = oficial.find((x) => String(x.team_entry_id) === sid);
    return {
      id: sid, ...ctx.get(sid), posicion: clasificacion.find((x) => x.id === sid),
      oficial: of ? { posicion: Number(of.posicion), puntos: Number(of.puntos), jornada: Number(of.jornada) } : null,
      forma: suyos.slice(-5), total: split(suyos), casa: split(suyos.filter((x) => x.casa)), fuera: split(suyos.filter((x) => !x.casa)),
      tramos, sinMinuto, cuadranGoles: golesMarcador === golesEventos, golesMarcador, golesEventos,
      goleadores: [...goleadores.values()].sort((x, y) => y.goles - x.goles || String(x.nombre).localeCompare(String(y.nombre), 'es')).slice(0, 5),
      once: once.filter((x) => String(x.equipo) === sid && Number(x.titularidades) > 0).slice(0, formato.jugadores),
      conAlineacion, amarillas: tarj('tarjeta_amarilla') + tarj('tarjeta_roja', true), rojas: tarj('tarjeta_roja'),
    };
  };
  const entreEllos = jugados.filter((m) => [String(m.local), String(m.visitante)].sort().join() === [String(a), String(b)].sort().join());
  const proximo = partidos.find((m) => m.goles_local == null && [String(m.local), String(m.visitante)].sort().join() === [String(a), String(b)].sort().join()) ?? null;
  return {
    formato, clasificacion, a: equipo(a), b: equipo(b), proximo, entreEllos, previos,
    ultimaJornada: jugados.length ? Math.max(...jugados.map((m) => Number(m.jornada))) : null,
    oficialJornada: oficial[0] ? Number(oficial[0].jornada) : null,
  };
}

export async function consultarPrevia(pg, url, idA, idB) {
  const a = entero(idA), b = entero(idB);
  if (a === b) throw new InformeNoConsultable({ status: 422, titulo: 'Elige dos equipos distintos' });
  const { filas } = await ejecutaEnFoto(pg, url, consultasPrevia(a, b), { conexiones: 3, aplicacion: 'facylf-previa', limite: '60s' });
  const [A, B] = [a, b].map((id) => filas.contexto.find((x) => Number(x.id) === id));
  if (!A || !B) throw new InformeNoConsultable({ status: 404, titulo: 'Alguno de los dos equipos no existe' });
  if (String(A.phase_group_id) !== String(B.phase_group_id)) throw new InformeNoConsultable({ status: 422, titulo: 'Los dos equipos no juegan en el mismo grupo',
    detalle: `${A.equipo} juega en ${A.competicion} · ${A.grupo}; ${B.equipo}, en ${B.competicion} · ${B.grupo}.` });
  const enCurso = A.temporada === temporadaActual(), certificado = A.visibility_state === 'completa' && A.completitud_historica;
  if (!enCurso && !certificado) throw new InformeNoConsultable({ status: 422, titulo: `${A.competicion} · ${A.temporada}: grupo sin certificar`,
    detalle: 'Una temporada terminada sólo se compara cuando su grupo está completo: con partidos o actas de menos, las cifras mentirían.' });
  return { ...componPrevia(filas, a, b), enCurso, generadoEn: new Date().toISOString() };
}
