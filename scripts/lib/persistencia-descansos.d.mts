import type { DatabaseSync } from 'node:sqlite';
import type { DecisionDescanso } from '../../packages/ingesta/src/descanso/decision-descanso.js';

export function leeDecisionDescanso(db: DatabaseSync, clave: string): DecisionDescanso | undefined;
export function guardaDecisionDescanso(
  db: DatabaseSync,
  decision: DecisionDescanso,
  motivo: string,
  opciones?: { registrarEvento?: boolean },
): void;
export function decisionesPendientesPorActa(
  db: DatabaseSync,
  trabajo: { temporada: string; competicion: string; grupo: string; jornada: number; acta: string },
): DecisionDescanso[];
