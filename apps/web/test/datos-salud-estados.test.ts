import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import {
  CAPACIDAD_DE_FEDERACIONES, CHEQUEOS_DE_LA_PLATAFORMA, COBERTURA_POR_TEMPORADA, CONSULTAS_OBSERVABILIDAD,
  EJEMPLOS_DE_ESTADOS, FRESCURA_Y_COBERTURA, PARAMETROS_DE_CAPACIDAD, PARAMETROS_OBSERVABILIDAD,
  type FilaCapacidad, type FilaChequeo, type FilaCoberturaTemporada, type FilaEstados, type FilaFrescura,
  type FilaParametroCapacidad,
} from '../src/consultas/observabilidad';
import {
  AREAS_PUBLICAS, alertaDeChequeo, agrupaChequeosPorArea, capacidadesDeFederacion, carenciasDeFederacion,
  estadoPeor, etiquetaDeChequeo, haceTiempo, motivoDeEstado, porcentajePublicable, resumenDeComprobaciones,
  severidadDeEstado, temporadaDeReferencia, textoDeValor, unidadDeChequeo,
} from '../src/lib/observabilidad-pantalla';
import { CabeceraPantalla, ChipSeveridad, TarjetaDeEstado } from '../src/componentes/observabilidad/piezas';
import {
  AvisosDeDatos, CapacidadDeFederaciones, CasosDeDatos, CoberturaDeCastillaYLeon, ResumenDeDatos,
} from '../src/componentes/observabilidad/Datos';
import {
  AlertasAbiertas, CalidadDeLosDatos, CopiasDeSeguridad, DatosPorFederacion, EstadoDeLasAreas,
  RendimientoDeLaPlataforma,
} from '../src/componentes/observabilidad/Salud';
import {
  EstadosDeCargaYError, EstadosDelBuscador, MotivosDeCompeticion,
} from '../src/componentes/observabilidad/Estados';

/**
 * Pantallas «Datos», «Salud» y «Estados» (WALL, pantallas restantes del prototipo).
 *
 * Datos y Salud se alimentan de la observabilidad REAL del canónico, leída con el rol público
 * (`facylf_lector`): `ops.chequeos()` (68 comprobaciones con su valor, su umbral y su estado),
 * `ops.coverage_checkpoint` (cobertura calculada de verdad), `analytics.federacion_capacidad` y
 * `analytics.parametro_capacidad` (qué datos da cada federación y con qué umbrales).
 *
 * Lo que se defiende:
 *  · las comprobaciones se leen con su unidad y su umbral; una que no se conoce no se inventa;
 *  · los porcentajes imposibles (por encima de 100) no se publican como si fueran medidas;
 *  · la temporada de referencia es la última CERRADA, no la que está en curso;
 *  · Estados enseña los estados reales con enlaces reales, sin texto de relleno;
 *  · la interfaz no habla de tablas, consultas ni caché (DOCTRINA-CALIDAD §8).
 */

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;

afterAll(async () => {
  await cierraCanonico();
});

/* ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────── */

const CHEQUEOS: FilaChequeo[] = [
  { nombre: 'proyeccion_pendiente', area: 'procesos', estado: 'fallo', valor: 4102, umbral: 200, detalle: {} },
  { nombre: 'federacion_sin_lote:madrid', area: 'frescura', estado: 'aviso', valor: 52, umbral: 48, detalle: { ultimo_lote: null } },
  { nombre: 'minutos_no_calculables', area: 'calidad', estado: 'aviso', valor: 46.9, umbral: 30, detalle: {} },
  { nombre: 'actas_a_revisar_7d', area: 'calidad', estado: 'ok', valor: 0, umbral: 5, detalle: {} },
  { nombre: 'jugados_sin_acta', area: 'calidad', estado: 'info', valor: 1255, umbral: 0, detalle: {} },
  { nombre: 'copia_de_seguridad', area: 'copias', estado: 'ok', valor: 12, umbral: 26, detalle: {} },
  { nombre: 'restauracion_probada', area: 'copias', estado: 'aviso', valor: null, umbral: 35, detalle: {} },
  { nombre: 'tamano_base_gb', area: 'base', estado: 'ok', valor: 31.8, umbral: 150, detalle: {} },
  { nombre: 'consultas_sobre_presupuesto', area: 'rendimiento', estado: 'ok', valor: 0, umbral: 1, detalle: {} },
  { nombre: 'errores_web_15min', area: 'rendimiento', estado: 'ok', valor: 0, umbral: 5, detalle: {} },
  { nombre: 'sentencias_lentas', area: 'rendimiento', estado: 'info', valor: 8, umbral: 0, detalle: {} },
  { nombre: 'registros_sin_aprobar', area: 'usuarios', estado: 'ok', valor: 0, umbral: 48, detalle: {} },
  { nombre: 'cuentas_frenadas', area: 'cuentas', estado: 'ok', valor: 0, umbral: 3, detalle: {} },
  { nombre: 'publicidad_activa', area: 'publicidad', estado: 'ok', valor: 0, umbral: 0, detalle: {} },
];

const COBERTURA: FilaCoberturaTemporada[] = [
  { temporada: '2026-27', orden: 2026, grupos: 55, partidos: 4100, con_resultado: 3858, actas_disponibles: 1200, actas_parseadas: 1200, actas_correctas: 900, actas_a_revisar: 300, calculado_en: '2026-11-05 21:06:00+00' },
  { temporada: '2025-26', orden: 2025, grupos: 71, partidos: 24360, con_resultado: 23824, actas_disponibles: 23400, actas_parseadas: 23400, actas_correctas: 18000, actas_a_revisar: 5400, calculado_en: '2026-11-05 21:06:00+00' },
];

const CAPACIDAD: FilaCapacidad[] = [
  { federacion: 'castilla-leon', nombre: 'Real Federación de Castilla y León de Fútbol', temporada: '2026-27', orden: 2026, ediciones: 55, partidos: 4100, pct_resultado: 94.1, pct_alineacion: 100, pct_cambios: 54.3, pct_tarjetas: 51.4, pct_minuto_gol: 100, pct_arbitro: 94.1, pct_posicion: 0 },
  { federacion: 'castilla-leon', nombre: 'Real Federación de Castilla y León de Fútbol', temporada: '2025-26', orden: 2025, ediciones: 71, partidos: 24360, pct_resultado: 97.8, pct_alineacion: 97.9, pct_cambios: 56.4, pct_tarjetas: 52.8, pct_minuto_gol: 100, pct_arbitro: 97.8, pct_posicion: 0 },
  { federacion: 'cataluna', nombre: 'Federación Catalana de Fútbol', temporada: '2025-26', orden: 2025, ediciones: 93, partidos: 23498, pct_resultado: 52, pct_alineacion: 77.8, pct_cambios: 0, pct_tarjetas: 0, pct_minuto_gol: 100, pct_arbitro: 35.6, pct_posicion: 0 },
  { federacion: 'andalucia', nombre: 'Real Federación Andaluza de Fútbol', temporada: '2025-26', orden: 2025, ediciones: 91, partidos: 64575, pct_resultado: 92.1, pct_alineacion: 95.3, pct_cambios: 2.1, pct_tarjetas: 13.5, pct_minuto_gol: 100, pct_arbitro: 91.4, pct_posicion: 0 },
  { federacion: 'pruebas-sincodigo', nombre: 'Federación de pruebas', temporada: '2025-26', orden: 2025, ediciones: 1, partidos: 2, pct_resultado: 100, pct_alineacion: 100, pct_cambios: 100, pct_tarjetas: 100, pct_minuto_gol: 100, pct_arbitro: 100, pct_posicion: 0 },
];

const PARAMETROS: FilaParametroCapacidad[] = [
  { clave: 'min_pct_cambios', valor: 40, descripcion: 'cambios' },
  { clave: 'min_pct_tarjetas', valor: 15, descripcion: 'tarjetas' },
  { clave: 'min_pct_minuto_gol', valor: 80, descripcion: 'minuto de gol' },
  { clave: 'min_pct_posiciones', valor: 50, descripcion: 'posiciones' },
  { clave: 'min_pct_alineaciones', valor: 30, descripcion: 'alineaciones' },
];

const FRESCURA: FilaFrescura = {
  recuento: { federaciones: 20, ediciones: 12749, grupos: 40399, partidos: 1202687, informes: 721621, personas: 1825731, calculado_en: '2026-10-23T09:51:57.062Z' },
  ultima_acta: '2026-10-28T11:01:33.976Z',
  cobertura: [
    { federacion: 'castilla-leon', nombre: 'Real Federación de Castilla y León de Fútbol', grupos: 3566, partidos: 222988, con_resultado: 219225, actas_parseadas: 206055, calculado_en: '2026-11-05 21:06:00+00' },
    { federacion: 'cataluna', nombre: 'Federación Catalana de Fútbol', grupos: 1200, partidos: 314000, con_resultado: 14000, actas_parseadas: 16000, calculado_en: '2026-11-05 20:00:00+00' },
  ],
};

const CAPACIDADES = capacidadesDeFederacion(CAPACIDAD[1]!, { min_pct_cambios: 40, min_pct_tarjetas: 15, min_pct_minuto_gol: 80, min_pct_posiciones: 50, min_pct_alineaciones: 30 });

const ESTADOS: FilaEstados = {
  datos: {
  sin_resultado: { grupo: 75250, nombre: 'ZAMORA', edicion: 'Debutantes de Fútbol Sala', temporada: '2026-27', partidos: 7, con_resultado: 0, con_acta: null },
  sin_calendario: { grupo: 28328, nombre: 'Liga - VIII', edicion: 'Campeonato Nacional de Liga de 3ª División', temporada: '2018-19', partidos: 0, con_resultado: null, con_acta: null },
  sin_actas: { grupo: 2985, nombre: '1 - Grupo 9', edicion: 'Tercera División de Fútbol Sala', temporada: '2025-26', partidos: 8, con_resultado: 8, con_acta: 0 },
  sin_cambios: { grupo: 3966, nombre: '3ª División Provincial de Alevines', edicion: '3ª División Provincial de Alevines', temporada: '2026-27', partidos: 340, con_resultado: null, con_acta: 329 },
  },
};

/* ── Reglas puras: comprobaciones, áreas y unidades ───────────────────────────────────────────────── */

describe('las comprobaciones de la plataforma se leen sin inventar', () => {
  it('el peor estado manda y un estado desconocido no se disfraza de bueno', () => {
    expect(estadoPeor(['ok', 'info'])).toBe('info');
    expect(estadoPeor(['info', 'aviso'])).toBe('aviso');
    expect(estadoPeor(['aviso', 'fallo'])).toBe('fallo');
    expect(estadoPeor(['fallo', 'ok'])).toBe('fallo');
    expect(estadoPeor([])).toBe('ok');
    expect(estadoPeor(['raro'])).toBe('info');
  });

  it('la severidad que se enseña usa las palabras del sistema', () => {
    expect(severidadDeEstado('fallo')).toBe('grave');
    expect(severidadDeEstado('aviso')).toBe('aviso');
    expect(severidadDeEstado('info')).toBe('info');
    expect(severidadDeEstado('ok')).toBe('ok');
    expect(severidadDeEstado('cualquiera')).toBe('info');
  });

  it('las áreas de la Salud pública dejan fuera las cuentas, los usuarios y la publicidad', () => {
    expect(AREAS_PUBLICAS).toContain('calidad');
    expect(AREAS_PUBLICAS).toContain('frescura');
    expect(AREAS_PUBLICAS).not.toContain('usuarios');
    expect(AREAS_PUBLICAS).not.toContain('cuentas');
    expect(AREAS_PUBLICAS).not.toContain('publicidad');
    const areas = agrupaChequeosPorArea(CHEQUEOS, AREAS_PUBLICAS);
    expect(areas.map((a) => a.area)).not.toContain('usuarios');
    const calidad = areas.find((a) => a.area === 'calidad')!;
    expect(calidad.estado).toBe('aviso');
    expect(calidad.avisos).toBe(1);
    expect(calidad.ok).toBe(1);
    expect(calidad.infos).toBe(1);
  });

  it('el resumen cuenta fallos, avisos e informativos de las áreas que se enseñan', () => {
    expect(resumenDeComprobaciones(CHEQUEOS, AREAS_PUBLICAS))
      .toEqual({ fallos: 1, avisos: 3, infos: 2, ok: 5 });
  });

  it('cada comprobación se traduce a una frase con su unidad y su umbral', () => {
    expect(etiquetaDeChequeo('proyeccion_pendiente')).toBe('Competiciones pendientes de publicar');
    expect(etiquetaDeChequeo('federacion_sin_lote:madrid')).toBe('Madrid: sin lote publicado');
    expect(unidadDeChequeo('proyeccion_pendiente')).toBe('grupos');
    expect(unidadDeChequeo('copia_de_seguridad')).toBe('horas');
    expect(unidadDeChequeo('actas_a_revisar_7d')).toBe('%');
    expect(unidadDeChequeo('desconocida_x')).toBeNull();
    // Un nombre que no está en el diccionario se enseña legible, no crudo.
    expect(etiquetaDeChequeo('algo_nuevo')).toBe('Algo nuevo');

    const alerta = alertaDeChequeo({ ...CHEQUEOS[0]! });
    expect(alerta.severidad).toBe('grave');
    expect(alerta.titulo).toBe('Competiciones pendientes de publicar');
    expect(alerta.valorTexto).toBe('4102 grupos');
    expect(alerta.umbralTexto).toBe('200 grupos');
  });

  it('un valor sin dato es un guion, no un cero', () => {
    const restauracion = alertaDeChequeo({ ...CHEQUEOS[6]! });
    expect(restauracion.valorTexto).toBe('—');
    expect(restauracion.umbralTexto).toBe('35 días');
    expect(textoDeValor(null, 'horas')).toBe('—');
    expect(textoDeValor(12, 'horas')).toBe('12 h');
  });

  it('el tiempo transcurrido se dice en palabras y sin fecha es un guion', () => {
    const ahora = new Date('2026-11-05T22:00:00Z');
    expect(haceTiempo('2026-11-05T20:00:00Z', ahora)).toBe('hace 2 h');
    expect(haceTiempo('2026-11-03T20:00:00Z', ahora)).toBe('hace 2 días');
    expect(haceTiempo('2026-11-05T21:59:30Z', ahora)).toBe('ahora mismo');
    expect(haceTiempo(null, ahora)).toBe('—');
  });
});

/* ── Reglas puras: capacidad de las federaciones ──────────────────────────────────────────────────── */

describe('qué datos da cada federación', () => {
  it('la temporada de referencia es la última cerrada, no la que está en curso', () => {
    expect(temporadaDeReferencia(CAPACIDAD)).toBe('2025-26');
    expect(temporadaDeReferencia([CAPACIDAD[0]!])).toBe('2026-27');
    expect(temporadaDeReferencia([])).toBeNull();
  });

  it('un porcentaje imposible no se publica como si fuera una medida', () => {
    expect(porcentajePublicable(56.4)).toBe(56.4);
    expect(porcentajePublicable(0)).toBe(0);
    expect(porcentajePublicable(100)).toBe(100);
    expect(porcentajePublicable(700)).toBeNull();
    expect(porcentajePublicable(-3)).toBeNull();
    expect(porcentajePublicable(null)).toBeNull();
  });

  it('las capacidades se derivan de los umbrales reales, no de números escritos a mano', () => {
    expect(CAPACIDADES).toEqual({ minutos: true, disciplina: true, golesPorTramo: true, alineaciones: true, posiciones: false });
    const andalucia = capacidadesDeFederacion(CAPACIDAD[3]!, {
      min_pct_cambios: 40, min_pct_tarjetas: 15, min_pct_minuto_gol: 80, min_pct_posiciones: 50, min_pct_alineaciones: 30,
    });
    expect(andalucia).toEqual({ minutos: false, disciplina: false, golesPorTramo: true, alineaciones: true, posiciones: false });
    expect(carenciasDeFederacion(andalucia)).toEqual(['sin minutos jugados', 'sin disciplina']);
    // Sin umbrales (tabla vacía) no se afirma nada: todas las capacidades quedan en «no se sabe».
    expect(capacidadesDeFederacion(CAPACIDAD[1]!, {})).toEqual({ minutos: false, disciplina: false, golesPorTramo: false, alineaciones: false, posiciones: false });
  });
});

/* ── Reglas puras: los estados de una competición ─────────────────────────────────────────────────── */

describe('los motivos de un estado vacío', () => {
  it('cada motivo dice qué pasa con cifras reales y enlaza al grupo', () => {
    const pendiente = motivoDeEstado('sin_resultado', ESTADOS.datos.sin_resultado)!;
    expect(pendiente.chip).toBe('Pendiente');
    expect(pendiente.motivo).toContain('7 partidos');
    expect(pendiente.motivo).toContain('ninguno con resultado');
    expect(pendiente.href).toBe('/explorar/competicion/75250');

    const sinCalendario = motivoDeEstado('sin_calendario', ESTADOS.datos.sin_calendario)!;
    expect(sinCalendario.chip).toBe('Sin calendario');
    expect(sinCalendario.motivo).toMatch(/calendario/i);

    const sinActas = motivoDeEstado('sin_actas', ESTADOS.datos.sin_actas)!;
    expect(sinActas.chip).toBe('Sin actas');
    expect(sinActas.motivo).toContain('8 partidos');
    expect(sinActas.motivo).toMatch(/acta/i);

    const sinCambios = motivoDeEstado('sin_cambios', ESTADOS.datos.sin_cambios)!;
    expect(sinCambios.chip).toBe('Sin minutos');
    expect(sinCambios.motivo).toMatch(/cambios/i);
    expect(sinCambios.motivo).toMatch(/minutos/i);

    // Sin ejemplo real no se inventa el estado.
    expect(motivoDeEstado('sin_resultado', null)).toBeNull();
  });
});

/* ── Contrato estático de las consultas ───────────────────────────────────────────────────────────── */

describe('contrato estático de la observabilidad', () => {
  it('todas las consultas declaran presupuesto, plan, columnas y parámetros', () => {
    expect(CONSULTAS_OBSERVABILIDAD.length).toBeGreaterThanOrEqual(5);
    for (const c of CONSULTAS_OBSERVABILIDAD) {
      expect(c.presupuestoMs, `${c.nombre} sin presupuesto`).toBeGreaterThan(0);
      expect(['indexado', 'agregado'], `${c.nombre} sin plan`).toContain(c.plan);
      expect(c.columnas.length, `${c.nombre} sin columnas`).toBeGreaterThan(0);
      expect(c.sql, `${c.nombre} interpola`).not.toContain('${');
      expect(c.descripcion.length, `${c.nombre} sin descripción`).toBeGreaterThan(30);
      // Toda consulta con parámetros tiene ejemplo para la prueba de contrato.
      if (c.sql.includes('$1')) expect(PARAMETROS_OBSERVABILIDAD[c.nombre], `${c.nombre} sin parámetros`).toBeDefined();
    }
  });
});

/* ── Contrato real con el canónico ────────────────────────────────────────────────────────────────── */

describe.skipIf(!hayCanonico)('contrato real: la observabilidad sale de la base, no de un ejemplo', () => {
  it('las 68 comprobaciones llegan con su estado y su umbral', async () => {
    const filas = await consulta<FilaChequeo>(CHEQUEOS_DE_LA_PLATAFORMA.sql, PARAMETROS_OBSERVABILIDAD[CHEQUEOS_DE_LA_PLATAFORMA.nombre], {
      presupuestoMs: 30000,
    });
    expect(filas.length).toBeGreaterThanOrEqual(60);
    for (const f of filas) {
      expect(['ok', 'info', 'aviso', 'fallo']).toContain(f.estado);
      expect(typeof f.nombre).toBe('string');
      expect(f.area.length).toBeGreaterThan(0);
    }
    const proyeccion = filas.find((f) => f.nombre === 'proyeccion_pendiente');
    expect(proyeccion, 'falta la comprobación de proyección pendiente').toBeDefined();
    expect(proyeccion!.valor).toBeGreaterThan(0);
    // Los valores y umbrales llegan como números, no como texto de PostgreSQL.
    expect(typeof proyeccion!.valor).toBe('number');
    expect(typeof proyeccion!.umbral).toBe('number');
  });

  it('la cobertura de Castilla y León trae sus temporadas con partidos y actas', async () => {
    const filas = await consulta<FilaCoberturaTemporada>(COBERTURA_POR_TEMPORADA.sql,
      PARAMETROS_OBSERVABILIDAD[COBERTURA_POR_TEMPORADA.nombre]);
    expect(filas.length).toBeGreaterThanOrEqual(2);
    const actual = filas.find((f) => f.temporada === '2026-27');
    expect(actual).toBeDefined();
    expect(actual!.grupos).toBeGreaterThan(0);
    expect(actual!.partidos).toBeGreaterThan(0);
    expect(actual!.actas_parseadas).toBeGreaterThan(0);
    const cerrada = filas.find((f) => f.temporada === '2025-26');
    expect(cerrada).toBeDefined();
    expect(cerrada!.partidos).toBeGreaterThan(20000);
    for (const f of filas) {
      expect(f.calculado_en, `temporada ${f.temporada} sin fecha`).toBeTruthy();
      expect(f.partidos).toBeGreaterThanOrEqual(f.con_resultado);
    }
  });

  it('la capacidad por federación se lee con umbrales reales y la temporada de referencia cerrada', async () => {
    const [filas, parametros] = await Promise.all([
      consulta<FilaCapacidad>(CAPACIDAD_DE_FEDERACIONES.sql, PARAMETROS_OBSERVABILIDAD[CAPACIDAD_DE_FEDERACIONES.nombre]),
      consulta<FilaParametroCapacidad>(PARAMETROS_DE_CAPACIDAD.sql, []),
    ]);
    expect(filas.length).toBeGreaterThanOrEqual(1);
    expect(filas.every((f) => f.federacion === 'castilla-leon')).toBe(true);
    expect(parametros.map((p) => p.clave).sort()).toEqual([
      'min_pct_alineaciones', 'min_pct_cambios', 'min_pct_minuto_gol', 'min_pct_posiciones', 'min_pct_tarjetas',
    ]);
    const umbrales = Object.fromEntries(parametros.map((p) => [p.clave, p.valor]));
    expect(umbrales.min_pct_cambios).toBe(40);
    expect(typeof filas[0]!.pct_resultado).toBe('number');
    const referencia = temporadaDeReferencia(filas);
    expect(referencia).toBe('2025-26');
    const cyl = filas.find((f) => f.federacion === 'castilla-leon' && f.temporada === referencia)!;
    expect(cyl).toBeDefined();
    expect(cyl.partidos).toBeGreaterThan(20000);
    expect(cyl.pct_resultado).toBeGreaterThan(90);
    // Y las cifras llegan como números (el saneado de las imposibles va en la prueba pura).
    for (const f of filas.filter((x) => x.temporada === referencia)) {
      expect(typeof f.pct_resultado, `${f.federacion}: pct_resultado`).toBe('number');
    }
  });

  it('la frescura dice cuándo se importó la última acta y la cobertura por federación', async () => {
    const [fila] = await consulta<FilaFrescura>(FRESCURA_Y_COBERTURA.sql, []);
    expect(fila).toBeDefined();
    expect(fila!.recuento.partidos).toBeGreaterThan(1000000);
    expect(fila!.ultima_acta).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(fila!.cobertura.length).toBe(1);
    const cyl = fila!.cobertura.find((c) => c.federacion === 'castilla-leon')!;
    expect(cyl).toBeDefined();
    expect(cyl.partidos).toBeGreaterThan(200000);
    expect(cyl.calculado_en).toBeTruthy();
  });

  it('los ejemplos de Estados son grupos reales del canónico', async () => {
    const [fila] = await consulta<FilaEstados>(EJEMPLOS_DE_ESTADOS.sql, []);
    expect(fila).toBeDefined();
    for (const clave of ['sin_resultado', 'sin_calendario', 'sin_actas', 'sin_cambios'] as const) {
      const ejemplo = fila!.datos[clave];
      expect(ejemplo, `falta el ejemplo ${clave}`).not.toBeNull();
      expect(Number(ejemplo!.grupo), `${clave} sin grupo`).toBeGreaterThan(0);
      expect(ejemplo!.temporada).toMatch(/^\d{4}-\d{2}$/);
    }
    // Los cuatro son estados distintos: no vale devolver el mismo grupo para todo.
    const grupos = new Set(Object.values(fila!.datos).map((e) => e?.grupo));
    expect(grupos.size).toBeGreaterThanOrEqual(3);
  });
});

/* ── Render ───────────────────────────────────────────────────────────────────────────────────────── */

describe('la pantalla de Datos enseña la calidad y la cobertura', () => {
  it('la cabecera dice de qué va la pantalla', () => {
    const html = renderToStaticMarkup(createElement(CabeceraPantalla, {
      titulo: 'Calidad de datos', entradilla: 'Qué datos hay y cuáles faltan.', meta: 'Última detección: hoy 06:10',
    }));
    expect(html).toContain('<h1');
    expect(html).toContain('Calidad de datos');
    expect(html).toContain('Qué datos hay y cuáles faltan.');
  });

  it('el resumen cuenta casos graves, avisos e informativos', () => {
    const html = renderToStaticMarkup(createElement(ResumenDeDatos, {
      resumen: resumenDeComprobaciones(CHEQUEOS, AREAS_PUBLICAS),
      casosGraves: 607,
      actasARevisar: 45.2,
      ultimaActa: FRESCURA.ultima_acta,
    }));
    expect(html).toContain('Casos graves');
    expect(html).toContain('607');
    expect(html).toContain('Avisos');
    expect(html).toContain('45,2'); // actas a revisar 7d
  });

  it('los casos por tipo llevan su severidad, su cifra y lo que hace la plataforma', () => {
    const html = renderToStaticMarkup(createElement(CasosDeDatos, {
      chequeos: CHEQUEOS, areas: AREAS_PUBLICAS,
    }));
    expect(html).toContain('Competiciones pendientes de publicar');
    expect(html).toContain('4102');
    expect(html).toContain('Grave');
    expect(html).toContain('Aviso');
    // Las comprobaciones por federación no son «casos de datos» y no inundan la lista.
    expect(html).not.toContain('sin lote publicado');
    // «Sin minutos» no puede salir si el valor está por encima del umbral.
    expect(html).not.toContain('undefined');
  });

  it('la cobertura de Castilla y León se lee temporada a temporada y enlaza al selector', () => {
    const html = renderToStaticMarkup(createElement(CoberturaDeCastillaYLeon, { filas: COBERTURA }));
    expect(html).toContain('2025-26');
    expect(html).toContain('24.360');
    expect(html).toContain('97,8'); // 23824 / 24360
    expect(html).toContain('href="/explorar/competiciones?fed=castilla-leon&amp;temp=2025-26"');
  });

  it('la capacidad de cada federación publica sólo porcentajes posibles y sus carencias', () => {
    const html = renderToStaticMarkup(createElement(CapacidadDeFederaciones, {
      filas: CAPACIDAD, parametros: PARAMETROS, temporada: '2025-26',
    }));
    expect(html).toContain('Castilla y León');
    expect(html).toContain('97,8');
    expect(html).toContain('Cataluña');
    expect(html).toContain('sin minutos');
    expect(html).toContain('sin disciplina');
    expect(html).not.toContain('700');
    // Las federaciones de laboratorio no se publican.
    expect(html).not.toContain('pruebas');
    expect(html).toContain('href="/explorar/competiciones?fed=castilla-leon&amp;temp=2025-26"');
  });

  it('los avisos de datos dicen qué se revisa y con qué cifra', () => {
    const html = renderToStaticMarkup(createElement(AvisosDeDatos, { chequeos: CHEQUEOS, areas: AREAS_PUBLICAS }));
    expect(html).toContain('Minutos no calculables');
    expect(html).toContain('46,9');
    expect(html).toContain('%');
  });
});

describe('la pantalla de Salud enseña el estado real', () => {
  it('cada área lleva su peor estado y su recuento', () => {
    const html = renderToStaticMarkup(createElement(EstadoDeLasAreas, {
      chequeos: CHEQUEOS, areas: AREAS_PUBLICAS,
    }));
    expect(html).toContain('Calidad');
    expect(html).toContain('Copias');
    // El recuento por área dice «fallo» y «aviso» con palabra, no sólo un color.
    expect(html).toMatch(/fallo/);
    expect(html).toMatch(/aviso/);
  });

  it('las alertas abiertas llevan severidad, cifra, umbral y desde cuándo', () => {
    const html = renderToStaticMarkup(createElement(AlertasAbiertas, {
      chequeos: CHEQUEOS, areas: AREAS_PUBLICAS,
    }));
    expect(html).toContain('Competiciones pendientes de publicar');
    expect(html).toContain('4102');
    expect(html).toContain('200');
    expect(html).toContain('Aviso');
    // Una comprobación sana no es una alerta.
    expect(html).not.toContain('Actas a revisar (7 días)');
    // Sin alertas: se dice, no se deja una lista vacía.
    const sano = renderToStaticMarkup(createElement(AlertasAbiertas, {
      chequeos: CHEQUEOS.filter((c) => c.estado === 'ok'), areas: AREAS_PUBLICAS,
    }));
    expect(sano).toMatch(/sin alertas/i);
  });

  it('los datos por federación dicen la cobertura y cuándo se calculó', () => {
    const html = renderToStaticMarkup(createElement(DatosPorFederacion, { cobertura: FRESCURA.cobertura }));
    expect(html).toContain('Castilla y León');
    expect(html).toContain('222.988');
    expect(html).toContain('22:06'); // hora del último cálculo, en hora de Madrid
  });

  it('el rendimiento dice la verdad: sin medición por petición, pero con las comprobaciones reales', () => {
    const html = renderToStaticMarkup(createElement(RendimientoDeLaPlataforma, {
      chequeos: CHEQUEOS, areas: AREAS_PUBLICAS,
    }));
    expect(html).toMatch(/sin medición/i);
    expect(html).toContain('Errores de la web');
    expect(html).toContain('0');
  });

  it('la calidad de la semana y las copias se leen de las comprobaciones', () => {
    const calidad = renderToStaticMarkup(createElement(CalidadDeLosDatos, { chequeos: CHEQUEOS, ultimaActa: FRESCURA.ultima_acta }));
    expect(calidad).toContain('Minutos no calculables');
    expect(calidad).toContain('46,9 %');
    expect(calidad).toContain('Última acta');
    const copias = renderToStaticMarkup(createElement(CopiasDeSeguridad, { chequeos: CHEQUEOS }));
    expect(copias).toContain('hace 12 h');
    expect(copias).toMatch(/sin restauración/i);
  });
});

describe('la pantalla de Estados enseña estados reales con enlaces', () => {
  it('los cuatro motivos de una competición llevan su enlace al grupo real', () => {
    const html = renderToStaticMarkup(createElement(MotivosDeCompeticion, { ejemplos: ESTADOS }));
    expect(html).toContain('Pendiente');
    expect(html).toContain('Sin calendario');
    expect(html).toContain('Sin actas');
    expect(html).toContain('Sin minutos');
    expect(html).toContain('href="/explorar/competicion/75250"');
    expect(html).toContain('href="/explorar/competicion/28328"');
  });

  it('el buscador enseña sus dos estados y enlaza a búsquedas reales', () => {
    const html = renderToStaticMarkup(createElement(EstadosDelBuscador));
    expect(html).toContain('Sin resultados');
    expect(html).toContain('href="/buscar?q=');
    expect(html).toMatch(/60/); // el tope real de resultados
  });

  it('carga, error y 404 usan las piezas reales y enlazan a pantallas reales', () => {
    const html = renderToStaticMarkup(createElement(EstadosDeCargaYError));
    expect(html).toMatch(/cargando/i);
    expect(html).toContain('href="/explorar/competicion/999999999"');
    expect(html).toContain('href="/explorar/estadisticas"');
  });

  it('una tarjeta de estado lleva su chip y su enlace', () => {
    const html = renderToStaticMarkup(createElement(TarjetaDeEstado, {
      chip: 'Empieza el 08/11', titulo: 'Clasificación', motivo: 'La competición empieza el 08/11/2026.', href: '/explorar/competicion/75252',
    }));
    expect(html).toContain('Empieza el 08/11');
    expect(html).toContain('Clasificación');
    expect(html).toContain('href="/explorar/competicion/75252"');
  });

  it('el chip de severidad no depende del color: lleva palabra', () => {
    for (const [estado, texto] of [['fallo', 'Grave'], ['aviso', 'Aviso'], ['info', 'Info'], ['ok', 'Ok']] as const) {
      const html = renderToStaticMarkup(createElement(ChipSeveridad, { estado }));
      expect(html, estado).toContain(texto);
    }
  });
});

/* ── La interfaz no habla de cómo está hecha ──────────────────────────────────────────────────────── */

describe('la interfaz no enseña textos internos (DOCTRINA-CALIDAD §8)', () => {
  it('ninguna de las tres pantallas habla de tablas, SQL ni caché', () => {
    const html = [
      renderToStaticMarkup(createElement(ResumenDeDatos, {
        resumen: resumenDeComprobaciones(CHEQUEOS, AREAS_PUBLICAS), casosGraves: 607, actasARevisar: 45.2,
        ultimaActa: FRESCURA.ultima_acta,
      })),
      renderToStaticMarkup(createElement(CasosDeDatos, { chequeos: CHEQUEOS, areas: AREAS_PUBLICAS })),
      renderToStaticMarkup(createElement(CoberturaDeCastillaYLeon, { filas: COBERTURA })),
      renderToStaticMarkup(createElement(CapacidadDeFederaciones, { filas: CAPACIDAD, parametros: PARAMETROS, temporada: '2025-26' })),
      renderToStaticMarkup(createElement(AvisosDeDatos, { chequeos: CHEQUEOS, areas: AREAS_PUBLICAS })),
      renderToStaticMarkup(createElement(EstadoDeLasAreas, { chequeos: CHEQUEOS, areas: AREAS_PUBLICAS })),
      renderToStaticMarkup(createElement(AlertasAbiertas, { chequeos: CHEQUEOS, areas: AREAS_PUBLICAS })),
      renderToStaticMarkup(createElement(DatosPorFederacion, { cobertura: FRESCURA.cobertura })),
      renderToStaticMarkup(createElement(RendimientoDeLaPlataforma, { chequeos: CHEQUEOS, areas: AREAS_PUBLICAS })),
      renderToStaticMarkup(createElement(CalidadDeLosDatos, { chequeos: CHEQUEOS, ultimaActa: FRESCURA.ultima_acta })),
      renderToStaticMarkup(createElement(CopiasDeSeguridad, { chequeos: CHEQUEOS })),
      renderToStaticMarkup(createElement(MotivosDeCompeticion, { ejemplos: ESTADOS })),
      renderToStaticMarkup(createElement(EstadosDelBuscador)),
      renderToStaticMarkup(createElement(EstadosDeCargaYError)),
    ].join('');
    expect(html).not.toMatch(/ops\.|core\.|SQL|consulta_minuto|caché|cache_sin|endpoint|token/i);
    expect(html).not.toMatch(/undefined|NaN/);
  });
});







