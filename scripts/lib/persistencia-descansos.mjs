/** Persistencia auditable de decisiones sobre filas que representan un descanso, no un partido. */

export function leeDecisionDescanso(db, clave) {
  const fila = db.prepare('select decision_json from decisiones_descanso where clave=?').get(clave);
  if (!fila) return undefined;
  try { return JSON.parse(fila.decision_json); } catch { return undefined; }
}

export function guardaDecisionDescanso(db, decision, motivo, { registrarEvento = true } = {}) {
  db.prepare(`insert into decisiones_descanso(
      clave,federacion,temporada,competicion,grupo,jornada,orden,codigo_acta,decision_json,actualizado_en
    ) values(?,?,?,?,?,?,?,?,?,?)
    on conflict(clave) do update set
      decision_json=excluded.decision_json,actualizado_en=excluded.actualizado_en`)
    .run(decision.clave, decision.federacion, decision.temporada, decision.competicion,
      decision.grupo, decision.jornada, decision.orden, decision.codigo_acta,
      JSON.stringify(decision), decision.comprobada_en);
  if (registrarEvento) {
    db.prepare('insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)')
      .run(decision.comprobada_en, decision.veredicto === 'desplazada' ? 'warn' : 'info',
        'decision_descanso', `${decision.clave}: ${motivo}`);
  }
}

export function decisionesPendientesPorActa(db, trabajo) {
  return db.prepare(`select decision_json from decisiones_descanso
    where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta=?`)
    .all(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta)
    .flatMap((fila) => { try { return [JSON.parse(fila.decision_json)]; } catch { return []; } });
}
