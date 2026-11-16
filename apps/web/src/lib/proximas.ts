/**
 * Próximos partidos: filtros de la URL y agrupación por competición.
 *
 * La pantalla enseña sólo lo que aún no se ha jugado y tiene fecha de hoy en adelante, competición a
 * competición. Nada de una lista plana: el orden de lectura es competición › grupo › partido.
 */
import type { FilaCrucePrevisto, FilaProximoPartido, FilaProximosPorCompeticion } from '@/consultas/partidos';
import { expectativa1X2 } from './poisson';

export const VENTANAS = [7, 14, 30] as const;
export type Ventana = (typeof VENTANAS)[number];
export const VENTANA_POR_DEFECTO: Ventana = 7;

export const CATEGORIAS_FILTRABLES = [
  'aficionados', 'juvenil', 'cadete', 'infantil', 'alevin', 'benjamin', 'prebenjamin', 'veteranos',
] as const;
export type CategoriaFiltrable = (typeof CATEGORIAS_FILTRABLES)[number];

export type FiltrosProximas = { dias: Ventana; categoria: CategoriaFiltrable | null };

type Parametros = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Lee y valida los filtros de la URL; lo que no encaja vuelve al valor por defecto. */
export function leeFiltrosProximas(parametros: Parametros): FiltrosProximas {
  const dias = Number(uno(parametros.dias));
  const categoria = uno(parametros.categoria);
  return {
    dias: (VENTANAS as readonly number[]).includes(dias) ? (dias as Ventana) : VENTANA_POR_DEFECTO,
    categoria: (CATEGORIAS_FILTRABLES as readonly string[]).includes(categoria ?? '')
      ? (categoria as CategoriaFiltrable) : null,
  };
}

/** URL de la pantalla con unos filtros; los valores por defecto no se escriben. */
export function urlDeProximas(filtros: FiltrosProximas): string {
  const q = new URLSearchParams();
  if (filtros.dias !== VENTANA_POR_DEFECTO) q.set('dias', String(filtros.dias));
  if (filtros.categoria) q.set('categoria', filtros.categoria);
  const cola = q.toString();
  return cola ? `/explorar/proximas?${cola}` : '/explorar/proximas';
}

/**
 * Junta los partidos con fila y los cruces del calendario previsto en una sola lista, en el orden de
 * lectura de la pantalla (competición › grupo › fecha › jornada › orden). Un cruce previsto no tiene
 * predicción guardada: se le da la expectativa del Poisson con sus goles esperados.
 */
export function conCrucesPrevistos(
  partidos: readonly FilaProximoPartido[], previstos: readonly FilaCrucePrevisto[],
): FilaProximoPartido[] {
  const deCalendario = previstos.map((c): FilaProximoPartido => {
    const e = expectativa1X2(c.goles_esperados_local, c.goles_esperados_visitante);
    return {
      match_id: null, grupo_id: c.grupo_id, grupo: c.grupo, edicion: c.edicion, edicion_id: c.edicion_id,
      categoria: c.categoria, jornada: c.jornada, orden: c.orden, fecha: c.fecha,
      local: c.local, visitante: c.visitante,
      pred_local: e?.local ?? null, pred_empate: e?.empate ?? null, pred_visitante: e?.visitante ?? null,
      pred_marcador: e?.marcador ?? null,
    };
  });
  // Cada lista llega ya ordenada por competición y grupo: se conserva el orden de aparición de cada
  // competición y de cada grupo, y dentro del grupo se ordena por fecha, jornada y orden.
  const todos = [...partidos, ...deCalendario];
  const turnoEdicion = new Map<number, number>();
  const turnoGrupo = new Map<number, number>();
  for (const p of todos) {
    if (!turnoEdicion.has(p.edicion_id)) turnoEdicion.set(p.edicion_id, turnoEdicion.size);
    if (!turnoGrupo.has(p.grupo_id)) turnoGrupo.set(p.grupo_id, turnoGrupo.size);
  }
  return todos.sort((a, b) => (
    turnoEdicion.get(a.edicion_id)! - turnoEdicion.get(b.edicion_id)!
    || turnoGrupo.get(a.grupo_id)! - turnoGrupo.get(b.grupo_id)!
    || a.fecha.localeCompare(b.fecha) || a.jornada - b.jornada || a.orden - b.orden
  ));
}

export type GrupoConProximos = {
  grupoId: number;
  grupo: string;
  partidos: FilaProximoPartido[];
};

export type CompeticionConProximos = {
  edicionId: number;
  edicion: string;
  ultimoResultado: string | null;
  atrasados: number;
  partidos: number;
  grupos: GrupoConProximos[];
};

/**
 * Reparte los partidos por competición y grupo, en el orden en que llegan (la consulta ya ordena), y
 * separa las competiciones de la temporada que no tienen ninguno en la ventana.
 */
export function agrupaProximos(
  partidos: readonly FilaProximoPartido[], resumen: readonly FilaProximosPorCompeticion[],
): { con: CompeticionConProximos[]; sin: FilaProximosPorCompeticion[] } {
  const resumenDe = new Map(resumen.map((r) => [r.edicion_id, r]));
  const porEdicion = new Map<number, CompeticionConProximos>();
  for (const p of partidos) {
    let competicion = porEdicion.get(p.edicion_id);
    if (!competicion) {
      const r = resumenDe.get(p.edicion_id);
      competicion = {
        edicionId: p.edicion_id, edicion: p.edicion,
        ultimoResultado: r?.ultimo_resultado ?? null, atrasados: r?.atrasados ?? 0,
        partidos: 0, grupos: [],
      };
      porEdicion.set(p.edicion_id, competicion);
    }
    let grupo = competicion.grupos.find((g) => g.grupoId === p.grupo_id);
    if (!grupo) {
      grupo = { grupoId: p.grupo_id, grupo: p.grupo, partidos: [] };
      competicion.grupos.push(grupo);
    }
    grupo.partidos.push(p);
    competicion.partidos += 1;
  }
  return {
    con: [...porEdicion.values()],
    sin: resumen.filter((r) => !porEdicion.has(r.edicion_id)),
  };
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'] as const;

/** `2026-11-21` → «sáb 21 nov». Una fecha que no se entiende se devuelve tal cual. */
export function diaCorto(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  if (!a || !m || !d) return fecha;
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${d} ${MESES[m - 1]}`;
}

/** `2026-11-08` → «8 nov». */
export function diaYMes(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  if (!a || !m || !d) return fecha;
  return `${d} ${MESES[m - 1]}`;
}

/** «1 49,8 % · X 11,7 % · 2 38,6 %», o `null` si el partido no tiene predicción. */
export function linea1X2(p: Pick<FilaProximoPartido, 'pred_local' | 'pred_empate' | 'pred_visitante'>): string | null {
  if (p.pred_local == null || p.pred_empate == null || p.pred_visitante == null) return null;
  const pct = (v: number) => `${Number(v).toFixed(1).replace('.', ',')} %`;
  return `1 ${pct(p.pred_local)} · X ${pct(p.pred_empate)} · 2 ${pct(p.pred_visitante)}`;
}
