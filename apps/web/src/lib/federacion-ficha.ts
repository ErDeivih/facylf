/**
 * Reglas de la ficha de federación: percentajes, avisos y etiquetas, fuera del JSX.
 *
 * La ficha no inventa capacidades: enseña lo MEDIDO (`analytics.federacion_ficha`) y, cuando una cifra
 * falta, dice «sin medir». Los avisos se derivan de esos mismos números: si los cambios sólo constan en
 * el 54 % de los partidos, la ficha lo dice con esa cifra, sin prometer minutos que no se pueden
 * calcular.
 */
import type { FilaFichaFederacion, FilaAvisoDatos } from '@/consultas/federaciones';
import type { FilaEdicionDeFederacion } from '@/consultas/federacion-ficha';
import { estaExcluida } from './federaciones-excluidas';
import { etiquetaAmbito, etiquetaCategoria, etiquetaGenero, etiquetaModalidad } from './vocabulario-pantalla';

/** Un código de federación de la URL: minúsculas, dígitos y guiones. Lo demás no es una ficha. */
export function codigoDeFederacion(crudo: string | undefined): string | null {
  const limpio = (crudo ?? '').trim().toLowerCase();
  return /^[a-z0-9-]{2,40}$/.test(limpio) ? limpio : null;
}

/** El código de la federación por defecto de la plataforma (Castilla y León). */
export const FEDERACION_DE_LA_FICHA_POR_DEFECTO = 'castilla-leon';

/** `numeric` de PostgreSQL llega como texto al driver: se convierte sin inventar ceros. */
export function numeroDePorcentaje(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** Porcentaje entero de una parte sobre un total; `null` si el total no se conoce o es cero. */
export function porcentajeDe(parte: number | null, total: number | null): number | null {
  if (parte === null || total === null || total <= 0) return null;
  return Math.round((parte / total) * 100);
}

/** Una medida de «qué datos publica» la federación. */
export type MedidaDeCobertura = {
  clave: string;
  etiqueta: string;
  /** Porcentaje medido, o `null` si esta federación no tiene medición. */
  porcentaje: number | null;
  /** Detalle humano bajo la cifra. */
  detalle: string;
};

/** Las medidas del prototipo, con la cifra medida de la federación (no una estimación). */
export function medidasDeCobertura(ficha: FilaFichaFederacion | null): MedidaDeCobertura[] {
  const pct = (clave: keyof FilaFichaFederacion) =>
    ficha === null ? null : numeroDePorcentaje(ficha[clave] as number | string | null);
  return [
    { clave: 'resultado', etiqueta: 'Partidos con resultado', porcentaje: pct('pct_resultado'), detalle: 'del total publicado en la temporada' },
    { clave: 'alineacion', etiqueta: 'Con alineaciones', porcentaje: pct('pct_alineacion'), detalle: 'con los jugadores de cada equipo' },
    { clave: 'cambios', etiqueta: 'Con cambios', porcentaje: pct('pct_cambios'), detalle: 'necesarios para calcular minutos' },
    { clave: 'tarjetas', etiqueta: 'Con tarjetas', porcentaje: pct('pct_tarjetas'), detalle: 'disciplina de la temporada' },
    { clave: 'minuto-gol', etiqueta: 'Minuto del gol', porcentaje: pct('pct_minuto_gol'), detalle: 'cronología y tramos del partido' },
    { clave: 'posicion', etiqueta: 'Con posición', porcentaje: pct('pct_posicion'), detalle: 'puesto habitual del jugador' },
  ];
}

/** Un aviso derivado de la cobertura medida, con el tono del prototipo. */
export type AvisoDeCobertura = {
  nivel: 'limite' | 'nota';
  titulo: string;
  texto: string;
};

/**
 * Avisos que se pueden afirmar con lo medido. No son textos genéricos de plantilla: cada uno lleva la
 * cifra de esta federación y una consecuencia concreta para el lector.
 */
export function avisosDeCobertura(ficha: FilaFichaFederacion | null): AvisoDeCobertura[] {
  if (ficha === null) {
    return [{
      nivel: 'nota',
      titulo: 'Sin medir',
      texto: 'Esta federación todavía no tiene una medición de sus datos. No se enseñan porcentajes que no se hayan medido.',
    }];
  }
  const avisos: AvisoDeCobertura[] = [];
  const n = (clave: keyof FilaFichaFederacion) => numeroDePorcentaje(ficha[clave] as number | string | null);
  const temporada = ficha.temporada ?? 'la temporada medida';
  const resultado = n('pct_resultado');
  if (resultado !== null && resultado < 100) {
    avisos.push({
      nivel: 'limite',
      titulo: 'Resultados',
      texto: `Hay resultado publicado en el ${resultado} % de los partidos de ${temporada}: en el resto no se puede contar un marcador ni una tabla.`,
    });
  }
  const cambios = n('pct_cambios');
  if (cambios !== null && cambios < 100) {
    avisos.push({
      nivel: 'limite',
      titulo: 'Minutos',
      texto: `Los cambios constan en el ${cambios} % de los partidos: donde faltan no se pueden calcular minutos exactos y se muestran partidos y titularidades.`,
    });
  }
  const tarjetas = n('pct_tarjetas');
  if (tarjetas !== null && tarjetas < 100) {
    avisos.push({
      nivel: 'nota',
      titulo: 'Disciplina',
      texto: `Las tarjetas constan en el ${tarjetas} % de los partidos: la disciplina se enseña como lo publicado, no como el total de la temporada.`,
    });
  }
  const minutoGol = n('pct_minuto_gol');
  if (minutoGol !== null && minutoGol < 100) {
    avisos.push({
      nivel: 'nota',
      titulo: 'Goles',
      texto: `El minuto del gol consta en el ${minutoGol} % de los goles: los tramos del partido se calculan sólo con esos.`,
    });
  }
  if (ficha.codigo_jugador === false) {    avisos.push({
      nivel: 'nota',
      titulo: 'Identidad',
      texto: 'Las actas de esta federación no traen código de jugador: las fichas se unen por nombre y equipo, y se avisa cuando la identidad es nominal.',
    });
  }
  if (ficha.varios_arbitros === true) {
    avisos.push({
      nivel: 'nota',
      titulo: 'Árbitros',
      texto: 'A veces el acta junta a varios colegiados en un solo nombre; se cuenta sólo el principal.',
    });
  }
  if (avisos.length === 0) {
    avisos.push({
      nivel: 'nota',
      titulo: 'Sin límites',
      texto: `La temporada medida tiene resultados, alineaciones, cambios y tarjetas en todos los partidos publicados.`,
    });
  }
  return avisos;
}

/** Avisos del catálogo de datos (analytics.avisos_de_datos) mezclados con los derivados. */
export function combinaAvisos(derivados: readonly AvisoDeCobertura[], catalogo: readonly FilaAvisoDatos[]): AvisoDeCobertura[] {
  const vistos = new Set(derivados.map((a) => a.texto));
  return [
    ...derivados,
    ...catalogo
      .map((fila) => ({ nivel: fila.nivel, titulo: fila.nivel === 'limite' ? 'Límite' : 'Nota', texto: fila.texto }))
      .filter((aviso) => !vistos.has(aviso.texto)),
  ];
}

/** Cómo se llama el nivel de cobertura de una competición, y con qué tono se pinta. */
export type NivelDeEdicion = { etiqueta: string; tono: 'completo' | 'alineaciones' | 'resultados' | 'calendario' };

const NIVELES: Record<string, NivelDeEdicion> = {
  completo: { etiqueta: 'Completo', tono: 'completo' },
  alineaciones: { etiqueta: 'Con alineaciones', tono: 'alineaciones' },
  resultados: { etiqueta: 'Sólo resultados', tono: 'resultados' },
  calendario: { etiqueta: 'Sólo calendario', tono: 'calendario' },
};

/** Traduce el nivel medido de una edición. Un valor desconocido no se disfraza: se enseña tal cual. */
export function nivelDeEdicion(nivel: string | null | undefined): NivelDeEdicion | null {
  const clave = (nivel ?? '').trim();
  if (clave === '') return null;
  return NIVELES[clave] ?? { etiqueta: clave, tono: 'calendario' };
}

/** Cobertura porcentual de una competición a partir de sus recuentos medidos. */
export function coberturaDeEdicion(fila: FilaEdicionDeFederacion): {
  resultado: number | null;
  acta: number | null;
  cambios: number | null;
  tarjetas: number | null;
  minutoGol: number | null;
  arbitro: number | null;
  posicion: number | null;
} {
  return {
    resultado: porcentajeDe(fila.con_resultado, fila.partidos),
    acta: porcentajeDe(fila.con_acta, fila.partidos),
    cambios: porcentajeDe(fila.lados_con_cambios, fila.partidos),
    tarjetas: porcentajeDe(fila.partidos_con_tarjetas, fila.partidos),
    minutoGol: porcentajeDe(fila.goles_con_minuto, fila.goles),
    arbitro: porcentajeDe(fila.con_arbitro, fila.partidos),
    posicion: porcentajeDe(fila.con_posicion, fila.personas),
  };
}

/** Etiqueta de una competición: categoría, ámbito, género y modalidad cuando aportan. */
export function etiquetasDeEdicion(fila: FilaEdicionDeFederacion): string {
  const partes = [
    etiquetaCategoria(fila.categoria),
    fila.ambito && fila.ambito !== 'desconocido' ? etiquetaAmbito(fila.ambito) : null,
    fila.genero && fila.genero !== 'desconocida' && fila.genero !== 'masculina' ? etiquetaGenero(fila.genero) : null,
    fila.modalidad && fila.modalidad !== 'desconocida' && fila.modalidad !== 'futbol11' ? etiquetaModalidad(fila.modalidad) : null,
  ].filter((parte): parte is string => parte !== null && parte !== 'Sin clasificar');
  return partes.join(' · ');
}

/** Cuántas competiciones, grupos y partidos tiene la federación en la temporada medida. */
export function resumenDeLaFederacion(ficha: FilaFichaFederacion | null): {
  temporada: string | null;
  ediciones: number | null;
  partidos: number | null;
  edicionesCompletas: number | null;
  edicionesAlineaciones: number | null;
  edicionesSoloResultados: number | null;
  medidoEn: string | null;
} {
  return {
    temporada: ficha?.temporada ?? null,
    ediciones: ficha?.ediciones ?? null,
    partidos: ficha?.partidos ?? null,
    edicionesCompletas: ficha?.ediciones_completas ?? null,
    edicionesAlineaciones: ficha?.ediciones_alineaciones ?? null,
    edicionesSoloResultados: ficha?.ediciones_solo_resultados ?? null,
    medidoEn: ficha?.medido_en ?? null,
  };
}

/** Otras federaciones con las que comparar: con medición, sin la actual y sin las retiradas de la web. */
export function federacionesComparables(
  fichas: readonly FilaFichaFederacion[],
  actual: string | null,
  limite = 12,
): FilaFichaFederacion[] {
  return fichas
    .filter((ficha) => ficha.codigo !== actual
      && ficha.partidos !== null
      && !ficha.codigo.startsWith('pruebas')
      && !estaExcluida(ficha.codigo))
    .sort((a, b) => (numeroDePorcentaje(b.pct_resultado) ?? -1) - (numeroDePorcentaje(a.pct_resultado) ?? -1))
    .slice(0, limite);
}

/** Nombre para la pestaña de la federación. */
export function tituloDeFederacion(nombre: string): string {
  return `${nombre} — Cantera`;
}

/** Nombre para la pestaña del comparador. */
export function tituloDelComparador(a: string | null, b: string | null): string {
  return a !== null && b !== null ? `${a} y ${b} — Cantera` : 'Comparar jugadores — Cantera';
}
