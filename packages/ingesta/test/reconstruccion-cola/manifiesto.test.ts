/**
 * Los contadores del informe y la prueba que impide volver a presentar cifras incompatibles.
 *
 * ## El error que esta prueba blinda
 *
 * Se presentaron a la vez «22 casos ambiguos» (la cifra del manifiesto) y «13 + 11 = 24» (dos
 * diagnósticos anteriores), como si fueran el mismo conjunto contado de dos maneras. No lo eran:
 *
 * - el **13** era un DELTA de otro diagnóstico —«13 casos más quedarían reparados si además se quitara
 *   `(P)`»—, medido sobre la comparación calendario/acta y en otra instantánea de la cola. Hoy mide 16,
 *   y es una PARTE de los ambiguos, no un añadido;
 * - el **11** no era un recuento de filas: era el número de apariciones del marcador `(Irabazlea)`.
 *   La Clase B de Euskadi es **cero** (los 75 de Clase B son de Castilla y León 62, Aragón 5,
 *   Castilla-La Mancha 3, La Rioja 3 y Ceuta 2).
 *
 * Medición reproducible: `scripts/_diag-union-ambiguas.mjs`, volcado en
 * `pruebas/reconstruccion/informes/union-ambiguas.txt`.
 */
import { describe, expect, it } from 'vitest';
import {
  VOCABULARIO_MOTIVO_AMBIGUO, compruebaCifraAmbigua, compruebaCoherencia, esMotivoAmbiguo, idDeManifiesto,
  resumenDe, type JornadaManifiesto, type Manifiesto,
} from '../../src/reconstruccion-cola/manifiesto.js';
import { huellaFila, type FilaCola } from '../../src/reconstruccion-cola/filas.js';

const fila = (orden: number, local: string, visitante: string): FilaCola => ({
  jornada: 1, orden, codigo_acta: `acta-${orden}`,
  equipo_local_codigo: null, equipo_visitante_codigo: null,
  local, visitante, goles_local: 1, goles_visitante: 0,
  fecha: '2025-10-12', hora: '10:00', campo: 'CAMPO UNO', campo_codigo: '77', arbitro: null,
});

function jornada(over: Partial<JornadaManifiesto> = {}): JornadaManifiesto {
  const antes = fila(0, '(Sailkatua) ALAVES "B"', 'BILBAO C.D.');
  const despues = fila(0, 'ALAVES "B"', 'BILBAO C.D.');
  return {
    temporada: '21', competicion: '900', grupo: '901', numero: 1,
    archivo: 'x.html', huella_html: 'aaaa', huella_jornada_guardada: null,
    filas: 3, identicas: 1,
    cambios: [{
      orden: 0, antes, despues, huella_antes: huellaFila(antes), huella_despues: huellaFila(despues),
      codigo_recuperado: false, via: { local: 'nombre-limpio-único', visitante: 'nombre-limpio-único' },
      marcadores: ['(Sailkatua)'], referencia_contextual: true,
    }],
    ambiguos: [{
      orden: 1, actual: 'X vs Y', html: 'X vs Z', motivo: 'el-acta-no-sostiene-la-pareja',
      vias: { local: 'nombre-limpio-único', visitante: 'nombre-limpio-único' },
      marcadores_fuera_de_posicion: [], marcadores_desconocidos: ['(P)'],
    }],
    estado: 'con-cambios',
    ...over,
  };
}

function manifiesto(jornadas: JornadaManifiesto[], over: Partial<Manifiesto> = {}): Manifiesto {
  return {
    federacion: 'euskadi', maqueta: 'nova',
    version_extractor: 'aaaaaaaaaaaaaaaa', version_contrato: 2, esquema_manifiesto: 2, artefactos: {},
    generado_en: '2026-09-15T00:00:00.000Z', resumen: resumenDe(jornadas), jornadas,
    id: idDeManifiesto({ federacion: 'euskadi', version: 'aaaaaaaaaaaaaaaa', jornadas }),
    ...over,
  };
}

describe('vocabulario de motivos', () => {
  it('es cerrado: un motivo de fuera no se acepta', () => {
    expect(esMotivoAmbiguo('el-acta-no-sostiene-la-pareja')).toBe(true);
    expect(esMotivoAmbiguo('el acta no sostiene la pareja que sale del HTML')).toBe(false);
    expect(VOCABULARIO_MOTIVO_AMBIGUO).toHaveLength(3);
  });
});

describe('partición de las filas', () => {
  it('cada fila es idéntica, corregida o ambigua, y nada más', () => {
    const r = resumenDe([jornada()]);
    expect(r.filas).toBe(r.identicas + r.cambios + r.ambiguos);
  });

  it('el desglose por motivo suma exactamente el total de ambiguos', () => {
    const r = resumenDe([jornada(), jornada({ numero: 2, filas: 1, identicas: 0, cambios: [] })]);
    expect(Object.values(r.ambiguos_por_motivo).reduce((a, n) => a + n, 0)).toBe(r.ambiguos);
  });

  it('un manifiesto que cuadra no da problemas', () => {
    expect(compruebaCoherencia(manifiesto([jornada()]))).toEqual([]);
  });
});

describe('la prueba que impide volver a presentar cifras incompatibles', () => {
  it('rechaza la cifra 24 cuando el manifiesto dice 22 (13 + 11 no es una unión)', () => {
    // Se construye un manifiesto de 22 ambiguos y se intenta publicar 24, como se hizo.
    const jornadas = [
      jornada({ numero: 1, filas: 13, identicas: 0, cambios: [], estado: 'sin-cambios', ambiguos: Array.from({ length: 13 }, (_, i) => ({
        orden: i, actual: 'X vs Y', html: 'X vs P', motivo: 'el-acta-no-sostiene-la-pareja' as const,
        vias: { local: 'sin-resolver', visitante: 'sin-resolver' },
        marcadores_fuera_de_posicion: [], marcadores_desconocidos: ['(P)'],
      })) }),
      jornada({ numero: 2, filas: 9, identicas: 0, cambios: [], estado: 'sin-cambios', ambiguos: Array.from({ length: 9 }, (_, i) => ({
        orden: i, actual: 'X vs Y', html: 'X vs Y', motivo: 'el-acta-no-permite-comprobar-la-pareja' as const,
        vias: { local: 'nombre-limpio-único', visitante: 'nombre-limpio-único' },
        marcadores_fuera_de_posicion: [], marcadores_desconocidos: [],
      })) }),
    ];
    const m = manifiesto(jornadas);
    expect(m.resumen.ambiguos).toBe(22);

    // La cifra correcta pasa.
    expect(compruebaCifraAmbigua(m, 22)).toEqual([]);

    // La suma de los dos contadores de otros diagnósticos NO pasa.
    const fallos = compruebaCifraAmbigua(m, 24);
    expect(fallos.length).toBeGreaterThan(0);
    expect(fallos.join(' ')).toMatch(/la cifra publicada de casos ambiguos es 24 y el manifiesto dice 22/);
    expect(fallos.join(' ')).toMatch(/universos distintos/);
  });

  it('rechaza cualquier cifra que no sea exactamente la del manifiesto', () => {
    const m = manifiesto([jornada()]);
    for (const cifra of [0, 2, 13, 16, 24, m.resumen.ambiguos + 1]) {
      expect(compruebaCifraAmbigua(m, cifra).length, `cifra ${cifra}`).toBeGreaterThan(0);
    }
    expect(compruebaCifraAmbigua(m, m.resumen.ambiguos)).toEqual([]);
  });

  it('el desglose por motivo queda publicado, para que la cifra sea auditable', () => {
    const m = manifiesto([jornada()]);
    expect(m.resumen.ambiguos_por_motivo['el-acta-no-sostiene-la-pareja']).toBe(1);
    expect(m.resumen.ambiguos_por_motivo['el-acta-no-permite-comprobar-la-pareja']).toBe(0);
  });
});

describe('compruebaCoherencia · lo que detecta', () => {
  it('una jornada cuya partición no cuadra', () => {
    const m = manifiesto([jornada({ filas: 5 })]);
    expect(compruebaCoherencia(m).join(' ')).toMatch(/filas=5/);
  });

  it('un resumen que no es la suma de las jornadas', () => {
    const m = manifiesto([jornada()]);
    m.resumen.ambiguos = 24;
    expect(compruebaCoherencia(m).join(' ')).toMatch(/resumen\.ambiguos=24/);
  });

  it('un motivo fuera del vocabulario cerrado', () => {
    const j = jornada();
    j.ambiguos[0]!.motivo = 'porque sí' as never;
    expect(compruebaCoherencia(manifiesto([j])).join(' ')).toMatch(/motivo fuera del vocabulario/);
  });
  it('un «cambio» que no cambia nada', () => {
    const j = jornada();
    j.cambios[0]!.huella_despues = j.cambios[0]!.huella_antes;
    expect(compruebaCoherencia(manifiesto([j])).join(' ')).toMatch(/cambio sin diferencia de huella/);
  });

  it('un resumen sin desglose por motivo', () => {
    const m = manifiesto([jornada()]);
    delete (m.resumen as Partial<typeof m.resumen>).ambiguos_por_motivo;
    expect(compruebaCoherencia(m).join(' ')).toMatch(/no lleva el desglose por motivo/);
  });

  it('una jornada saltada que sin embargo declara filas o ambigüedades', () => {
    const m = manifiesto([jornada({ saltada: 'no se pudo leer el HTML archivado' })]);
    expect(compruebaCoherencia(m).join(' ')).toMatch(/jornada saltada/);
  });

  it('una jornada saltada sin filas ni cambios ni ambiguos es coherente y cuenta aparte', () => {
    const m = manifiesto([jornada({ saltada: 'no se pudo leer el HTML archivado', filas: 0, identicas: 0, cambios: [], ambiguos: [], estado: 'sin-cambios' })]);
    expect(compruebaCoherencia(m)).toEqual([]);
    expect(m.resumen.jornadas_saltadas).toBe(1);
    expect(m.resumen.ambiguos).toBe(0);
  });
});

describe('diagnóstico del defecto de las filas de descanso', () => {
  // ilas cuenta TODAS las filas de la cola, y las fantasma son una de sus cuatro suertes: por eso la
  // partición pasa a ser identicas + cambios + ambiguos + fantasma.
  const conFantasma = (over: Partial<JornadaManifiesto> = {}): JornadaManifiesto => jornada({
    filas: 5,
    informativas: [{ maqueta: 'nova-widget', local: 'SESTAO F.S.', visitante: 'Atsedena', informativa: true, sospechosa: false, motivo: 'palabra de descanso sin acta', equipoQueDescansa: 'SESTAO F.S.' }],
    filasFantasma: [
      { orden: 2, local: 'SESTAO F.S.', visitante: 'Atsedena', codigo_acta: null, equipo_que_descansa: 'SESTAO F.S.', motivo: 'palabra de descanso sin acta', tiene_acta: false, acta: 'sin-acta' },
      { orden: 3, local: 'ARTAROMO IFO', visitante: 'Atsedena', codigo_acta: '999', equipo_que_descansa: 'ARTAROMO IFO', motivo: 'palabra de descanso con acta', tiene_acta: true, acta: 'descanso' },
    ],
    partidosRecuperados: [{ local: 'UNIÓN LA JOTA', visitante: 'EL SALVADOR', codigo_acta: '667866' }],
    filasDuplicadas: [{ orden: 1, codigo_acta: '667866', local: 'DESCANSA', visitante: 'BALSAS' }],
    ...over,
  });

  it('los contadores del diagnóstico se agregan y cuadran con las jornadas', () => {
    const m = manifiesto([conFantasma()]);
    expect(compruebaCoherencia(m)).toEqual([]);
    expect(m.resumen.filas_fantasma).toBe(2);
    expect(m.resumen.filas_fantasma_sin_acta).toBe(1);
    expect(m.resumen.partidos_recuperados).toBe(1);
    expect(m.resumen.filas_duplicadas).toBe(1);
    expect(m.resumen.jornadas_con_filas_fantasma).toBe(1);
  });

  it('la partición incluye las fantasma como una cuarta suerte de fila', () => {
    // Es lo que impide volver a sumar contadores de universos distintos: una fila de la cola es idéntica,
    // corregida, ambigua o fantasma, y nada más. La coherencia lo exige y la suma tiene que cuadrar.
    const m = manifiesto([conFantasma()]);
    const r = m.resumen;
    expect(r.filas).toBe(r.identicas + r.cambios + r.ambiguos + r.filas_fantasma);
    expect(compruebaCoherencia(m)).toEqual([]);
    // Y una jornada SIN fantasma sigue cuadrando con la partición de tres términos.
    expect(compruebaCoherencia(manifiesto([jornada()]))).toEqual([]);
  });

  it('unas fantasma sin acta que superan el total se detectan', () => {
    const m = manifiesto([conFantasma()]);
    m.resumen.filas_fantasma_sin_acta = 5;
    expect(compruebaCoherencia(m).join(' ')).toMatch(/no puede superar/);
  });

  it('una jornada sin el diagnóstico cuenta cero, no «desconocido»', () => {
    const m = manifiesto([jornada()]);
    expect(m.resumen.filas_fantasma).toBe(0);
    expect(m.resumen.partidos_recuperados).toBe(0);
    expect(compruebaCoherencia(m)).toEqual([]);
  });

  it('una fila fantasma con acta se declara como tal: no se retira a ciegas', () => {
    const m = manifiesto([conFantasma()]);
    const conActa = m.jornadas[0]!.filasFantasma!.filter((f) => f.tiene_acta);
    expect(conActa).toHaveLength(1);
    expect(m.resumen.filas_fantasma_sin_acta).toBe(m.resumen.filas_fantasma - conActa.length);
  });

  it('los veredictos del acta suman: sin acta + con acta = fantasma', () => {
    const m = manifiesto([conFantasma()]);
    const r = m.resumen;
    expect(r.filas_fantasma_con_acta).toBe(1);
    expect(r.filas_fantasma_con_acta_de_descanso).toBe(1);
    expect(r.filas_fantasma_con_acta_de_partido).toBe(0);
    expect(r.filas_fantasma_con_acta + r.filas_fantasma_sin_acta).toBe(r.filas_fantasma);
    expect(compruebaCoherencia(m)).toEqual([]);
  });

  it('una fantasma cuyo acta nombra DOS equipos reales no se retira NUNCA', () => {
    // Es la única forma de perder un partido real por este camino: el acta dice que hubo partido entre dos
    // equipos, así que la fila no es un bloque de descanso mal puesto, es un partido. Se declara y se deja.
    const antes = fila(3, 'ARTAROMO IFO', 'Atsedena');
    const m = manifiesto([conFantasma({
      filasFantasma: [
        { orden: 2, local: 'SESTAO F.S.', visitante: 'Atsedena', codigo_acta: null, equipo_que_descansa: 'SESTAO F.S.', motivo: 'p', tiene_acta: false, acta: 'sin-acta' },
        { orden: 3, local: 'ARTAROMO IFO', visitante: 'Atsedena', codigo_acta: '999', equipo_que_descansa: 'ARTAROMO IFO', motivo: 'p', tiene_acta: true, acta: 'partido-real' },
      ],
      retiradas: [{ orden: 3, antes, huella_antes: huellaFila(antes), equipo_que_descansa: 'ARTAROMO IFO', motivo: 'bloque de descanso con acta' }],
    })]);
    expect(compruebaCoherencia(m).join(' ')).toMatch(/acta no autoriza a borrar \(partido-real\)/);
  });

  it('una fantasma cuyo acta nombra el descanso SÍ se retira: el acta no documenta partido', () => {
    const antes = fila(3, 'ARTAROMO IFO', 'Atsedena');
    const m = manifiesto([conFantasma({
      retiradas: [{ orden: 3, antes, huella_antes: huellaFila(antes), equipo_que_descansa: 'ARTAROMO IFO', motivo: 'bloque de descanso cuyo acta nombra el descanso' }],
    })]);
    expect(compruebaCoherencia(m)).toEqual([]);
    expect(m.resumen.filas_retirables).toBe(1);
  });

  it('un partido DESPLAZADO no se puede retirar: el acta dice que ahí hubo partido', () => {
    const antes = fila(3, 'Descansa', 'DANOK BAT CLUB');
    const m = manifiesto([conFantasma({
      desplazadas: [{
        orden: 3, en_la_cola: 'Descansa vs DANOK BAT CLUB',
        dice_el_acta: 'CANALS PROMESES C.F. "A" / DANOK BAT CLUB', codigo_acta: 'acta-3',
        equipo_que_la_cola_no_tiene: 'CANALS PROMESES C.F. "A"', la_pareja_del_acta_ya_esta_en_la_jornada: false,
      }],
      retiradas: [{ orden: 3, antes, huella_antes: huellaFila(antes), equipo_que_descansa: null, motivo: 'x' }],
    })]);
    const fallos = compruebaCoherencia(m).join(' ');
    expect(fallos).toMatch(/partido DESPLAZADO/);
    expect(m.resumen.filas_desplazadas).toBe(1);
  });

  it('los desplazados se cuentan aparte de la partición: esa fila se sigue comparando', () => {
    const m = manifiesto([conFantasma({
      desplazadas: [{
        orden: 3, en_la_cola: 'Descansa vs DANOK BAT CLUB', dice_el_acta: 'A / DANOK BAT CLUB',
        codigo_acta: 'acta-3', equipo_que_la_cola_no_tiene: 'A', la_pareja_del_acta_ya_esta_en_la_jornada: false,
      }],
    })]);
    expect(compruebaCoherencia(m)).toEqual([]);
    const r = m.resumen;
    expect(r.filas_desplazadas).toBe(1);
    // La partición NO los incluye: sus filas ya están contadas como idénticas o como lo que sean.
    expect(r.filas).toBe(r.identicas + r.cambios + r.ambiguos + r.filas_fantasma + r.filas_no_comparables);
  });
});

describe('identidad del lote', () => {
  it('incluye el MOTIVO de cada ambigüedad, no sólo su posición', () => {
    const a = jornada();
    const b = jornada();
    b.ambiguos[0]!.motivo = 'el-acta-no-permite-comprobar-la-pareja';
    expect(idDeManifiesto({ federacion: 'euskadi', version: 'v', jornadas: [a] }))
      .not.toBe(idDeManifiesto({ federacion: 'euskadi', version: 'v', jornadas: [b] }));
  });

  it('cambia con la versión de la herramienta', () => {
    const j = jornada();
    expect(idDeManifiesto({ federacion: 'euskadi', version: 'v1', jornadas: [j] }))
      .not.toBe(idDeManifiesto({ federacion: 'euskadi', version: 'v2', jornadas: [j] }));
  });
});
