import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  decisionesPendientesPorActa, guardaDecisionDescanso, leeDecisionDescanso,
} from '../../../../scripts/lib/persistencia-descansos.mjs';
import { decideFilaDeDescanso } from '../../src/descanso/decision-descanso.js';

function base() {
  const db = new DatabaseSync(':memory:');
  db.exec(`create table decisiones_descanso(
    clave text primary key,federacion text,temporada text,competicion text,grupo text,
    jornada integer,orden integer,codigo_acta text,decision_json text,actualizado_en text);
    create table eventos(id integer primary key,creado_en text,nivel text,tipo text,detalle text);`);
  return db;
}

const entrada = {
  federacion: 'euskadi', temporada: '13', competicion: '2949', grupo: '7237', jornada: 19,
  orden: 2, codigo_acta: '131632', literal_local: 'DANOK BAT CLUB', literal_visitante: 'DESCANSA',
  archivo_html: 'jornada-19.html', huella_html: 'html-1', enlaceDeActa: true,
  parejaDelActa: null, huella_acta: null, comprobada_en: '2026-09-16T17:00:00.000Z',
} as const;

describe('persistencia real de la decisión de descanso', () => {
  it('guarda, recupera y localiza por acta sin crear eventos duplicados al leer', () => {
    const db = base();
    const resultado = decideFilaDeDescanso(entrada);
    guardaDecisionDescanso(db, resultado.decision!, resultado.motivo);
    expect(leeDecisionDescanso(db, resultado.decision!.clave)?.veredicto).toBe('sin-decidir');
    expect(decisionesPendientesPorActa(db, { ...entrada, acta: '131632' })).toHaveLength(1);
    expect(db.prepare('select count(*) n from eventos').get()).toEqual({ n: 1 });
  });

  it('actualiza la misma clave cuando llega el acta y conserva una sola decisión', () => {
    const db = base();
    const inicial = decideFilaDeDescanso(entrada);
    guardaDecisionDescanso(db, inicial.decision!, inicial.motivo);
    const confirmada = decideFilaDeDescanso({
      ...entrada, parejaDelActa: ['DANOK BAT CLUB', 'DESCANSA'], huella_acta: 'acta-1',
    });
    guardaDecisionDescanso(db, confirmada.decision!, confirmada.motivo);
    expect(db.prepare('select count(*) n from decisiones_descanso').get()).toEqual({ n: 1 });
    expect(leeDecisionDescanso(db, confirmada.decision!.clave)?.veredicto).toBe('informativa');
  });
});
