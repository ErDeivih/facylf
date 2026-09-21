/**
 * Maqueta «nova»: separación entre nombre y estado, y resolución de la inscripción por evidencia.
 *
 * Todos los literales de estas pruebas están copiados de la cola real de Euskadi (medidos el
 * 15/09/2026). Ninguno es inventado: cada uno representa una forma que aparece de verdad, y los casos
 * de «no se toca» representan paréntesis que **identifican** al equipo y que quitarlos fusionaría dos
 * plantillas —el equipo femenino con el masculino del mismo club, por ejemplo—.
 */
import { describe, expect, it } from 'vitest';
import {
  MARCADORES_ESTADO, esMarcadorEstado, normalizaNombreEquipo, resuelveEquipoNova, separaNombreYEstado,
  type CatalogoNova,
} from '../src/parsers/nova-equipos.js';

describe('separación entre nombre y marcador de estado', () => {
  it('quita los cuatro estados medidos y conserva el nombre', () => {
    const casos: Array<[string, string, string]> = [
      ['(Sailkatua) BEASAIN S.D.', 'BEASAIN S.D.', '(Sailkatua)'],
      ['PORTUGALETE, C. (Sailkatua)', 'PORTUGALETE, C.', '(Sailkatua)'],
      ['(Sailkatua) DANOK BAT C.', 'DANOK BAT C.', '(Sailkatua)'],
      ['BEASAIN, S.D. (Irabazlea)', 'BEASAIN, S.D.', '(Irabazlea)'],
      ['REAL RACING CLUB SAD (Ganador)', 'REAL RACING CLUB SAD', '(Ganador)'],
      ['(Clasificado) REAL RACING CLUB SAD', 'REAL RACING CLUB SAD', '(Clasificado)'],
    ];
    for (const [literal, nombre, marcador] of casos) {
      const r = separaNombreYEstado(literal);
      expect(r.nombreEquipo, literal).toBe(nombre);
      expect(r.marcadoresEstado, literal).toEqual([marcador]);
      expect(r.marcadoresDesconocidos, literal).toEqual([]);
      expect(r.literalOriginal, literal).toBe(literal); // el literal nunca se pierde
    }
  });

  it('quita los dos marcadores cuando van juntos al principio', () => {
    const r = separaNombreYEstado('(Sailkatua) (Irabazlea) BEASAIN S.D.');
    expect(r.nombreEquipo).toBe('BEASAIN S.D.');
    expect(r.marcadoresEstado.sort()).toEqual(['(Irabazlea)', '(Sailkatua)']);
    expect(r.marcadoresFueraDePosicion).toEqual([]);
  });

  it('NO quita un estado que va detrás de otro paréntesis que NO se toca', () => {
    // La protección que sigue en pie: si delante hay un paréntesis que no es un estado, el estado queda
    // «fuera de posición» y se conserva. Aquí `(Juv.)` es categoría —identifica al equipo—, así que tapa
    // a `(Sailkatua)` en medio. Quitarlo de en medio cambiaría el nombre donde el paréntesis puede formar
    // parte de la razón social.
    //
    // Antes esta prueba usaba `(P)` como el paréntesis que tapa. Ya no sirve para eso: `(P)` resultó ser
    // «Ganador del partido en Penaltis» —lo dice el `title` de la fuente, 35 de 35— y ahora sí se separa,
    // que es lo que repara las 16 filas de Euskadi que estaban detenidas.
    const r = separaNombreYEstado('(Juv.) (Sailkatua) BERGARA K.E., CLUB');
    expect(r.nombreEquipo).toBe('(Juv.) (Sailkatua) BERGARA K.E., CLUB');
    expect(r.marcadoresEstado).toEqual([]);
    expect(r.marcadoresFueraDePosicion).toEqual(['(Sailkatua)']);
    expect(r.marcadoresDesconocidos).toEqual(['(Juv.)']);
  });

  it('quita el marcador al final aunque haya comillas y letra de equipo antes', () => {
    const r = separaNombreYEstado('LEIOA, S.D. "B" REAL SOCIEDAD S.A.D. "B" (Sailkatua)');
    expect(r.marcadoresEstado).toEqual(['(Sailkatua)']);
    expect(r.nombreEquipo.endsWith('(Sailkatua)')).toBe(false);
    expect(r.nombreEquipo).toContain('"B"');
  });

  it('NO quita la categoría ni el género: identifican al equipo', () => {
    // Quitar «(Femenino)» uniría al equipo femenino con el masculino del mismo club.
    const femenino = separaNombreYEstado('E.F. ARNEDO Pitillos (Femenino)');
    expect(femenino.nombreEquipo).toBe('E.F. ARNEDO Pitillos (Femenino)');
    expect(femenino.marcadoresEstado).toEqual([]);
    expect(femenino.marcadoresDesconocidos).toEqual(['(Femenino)']);

    const juvenil = separaNombreYEstado('CALASANZ A.D. (Juv.)');
    expect(juvenil.nombreEquipo).toBe('CALASANZ A.D. (Juv.)');
    expect(juvenil.marcadoresDesconocidos).toEqual(['(Juv.)']);

    const veteranos = separaNombreYEstado('EMD SANVICENTEÑA (VETERANOS)');
    expect(veteranos.nombreEquipo).toBe('EMD SANVICENTEÑA (VETERANOS)');
  });

  it('NO toca un paréntesis que no está en medio ni en la lista', () => {
    // El marcador está en MEDIO (antes de la letra de equipo): no es la posición documentada.
    const r = separaNombreYEstado('CALASANZ A.D. (Juv.) "A"');
    expect(r.nombreEquipo).toBe('CALASANZ A.D. (Juv.) "A"');
    expect(r.marcadoresEstado).toEqual([]);
    expect(r.marcadoresDesconocidos).toEqual(['(Juv.)']);
  });

  it('NO toca paréntesis legítimos del nombre ni códigos publicados dentro de él', () => {
    const legitimos: Array<[string, string]> = [
      ['C.D. DEPORTE Y OCIO (ADYO)', '(ADYO)'],
      ['SELECCION CORDOBESA ESCUELAS RFAF (CORDOBA) "AB"', '(CORDOBA)'],
      ['C.D. GUADALCACIN F.S. (603621)', '(603621)'],
      ['BURELA F.S.(PESCADOS RUBEN)', '(PESCADOS RUBEN)'],
      ['CD LA ROCA - BENJAMIN FOMENTO COMPLETO (1 TEMPORADA) -MÁLAGA', '(1 TEMPORADA)'],
      ['C.D. DAVID CASTEDO 3 (DC 3) "C"', '(DC 3)'],
    ];
    for (const [literal, marcador] of legitimos) {
      const r = separaNombreYEstado(literal);
      expect(r.nombreEquipo, literal).toBe(literal);
      expect(r.marcadoresEstado, literal).toEqual([]);
      expect(r.marcadoresDesconocidos, literal).toEqual([marcador]);
    }
  });

  it('registra los marcadores desconocidos y los conserva, en vez de descartarlos', () => {
    const r = separaNombreYEstado('PRESION BREAK BERRIZ (RET)');
    expect(r.nombreEquipo).toBe('PRESION BREAK BERRIZ (RET)');
    expect(r.marcadoresDesconocidos).toEqual(['(RET)']);
  });

  it('no deja el nombre vacío: si al quitar todo no queda nada, devuelve el literal', () => {
    const r = separaNombreYEstado('(Sailkatua)');
    expect(r.nombreEquipo).toBe('(Sailkatua)');
    expect(r.marcadoresEstado).toEqual([]);
  });

  it('es idempotente y no cambia nada cuando no hay marcadores', () => {
    const limpio = separaNombreYEstado('(Sailkatua) DEPORTIVO ALAVES S.A.D. "B"');
    expect(limpio.nombreEquipo).toBe('DEPORTIVO ALAVES S.A.D. "B"');
    const otra = separaNombreYEstado(limpio.nombreEquipo);
    expect(otra.nombreEquipo).toBe(limpio.nombreEquipo);
    expect(otra.marcadoresEstado).toEqual([]);
  });

  it('la lista de estados es la medida y ninguna más', () => {
    expect(MARCADORES_ESTADO).toEqual(['(sailkatua)', '(irabazlea)', '(ganador)', '(clasificado)', '(p)']);
    expect(esMarcadorEstado('(Sailkatua)')).toBe(true);
    expect(esMarcadorEstado('(IRABAZLEA)')).toBe(true);
    // `(P)` es «Ganador del partido en Penaltis»: lo dice el `title` de la fuente, 35 de 35.
    expect(esMarcadorEstado('(P)')).toBe(true);
    expect(esMarcadorEstado('(p)')).toBe(true);
    // Los que identifican al equipo, o que la fuente publica como texto suelto, NO son estados.
    for (const token of ['(Juv.)', '(Femenino)', '(VETERANOS)', '(RET)', '(ADYO)', '(3)']) {
      expect(esMarcadorEstado(token), token).toBe(false);
    }
  });

  /**
   * `(P)` = «Ganador del partido en Penaltis», según el `title` que la propia fuente pone al `<span>` que
   * envuelve al paréntesis (medido: 35 de 35 apariciones en 110 jornadas archivadas). No es una
   * interpretación: es la fuente diciendo qué significa.
   */
  describe('(P): ganador del partido en penaltis', () => {
    it('se separa del nombre cuando va al final', () => {
      const r = separaNombreYEstado('ARRUPE CHAMINADE C.D. (P)');
      expect(r.nombreEquipo).toBe('ARRUPE CHAMINADE C.D.');
      expect(r.marcadoresEstado).toEqual(['(P)']);
    });

    it('se separa cuando va al principio', () => {
      const r = separaNombreYEstado('(P) HEGALARIAK');
      expect(r.nombreEquipo).toBe('HEGALARIAK');
      expect(r.marcadoresEstado).toEqual(['(P)']);
    });

    it('sale también cuando va encadenado detrás de (Sailkatua): el bucle hace dos pasadas', () => {
      // Es la forma que aparece en la cola real y la que dejaba 16 filas detenidas.
      const detras = separaNombreYEstado('ARRUPE CHAMINADE C.D. (P) (Sailkatua)');
      expect(detras.nombreEquipo).toBe('ARRUPE CHAMINADE C.D.');
      expect(detras.marcadoresEstado.sort()).toEqual(['(P)', '(Sailkatua)']);

      const delante = separaNombreYEstado('(P) (Sailkatua) BERGARA K.E., CLUB');
      expect(delante.nombreEquipo).toBe('BERGARA K.E., CLUB');
      expect(delante.marcadoresEstado.sort()).toEqual(['(P)', '(Sailkatua)']);

      const conIrabazlea = separaNombreYEstado('ATHLETIC CLUB "C" (P) (Irabazlea)');
      expect(conIrabazlea.nombreEquipo).toBe('ATHLETIC CLUB "C"');
    });

    it('deja el nombre limpio igual al que publica el acta', () => {
      // Es lo que hace que el calendario y la acta hablen del mismo equipo, y lo que reparaba las 16 filas.
      const calendario = separaNombreYEstado('ARRUPE CHAMINADE C.D. (P) (Sailkatua)').nombreEquipo;
      const acta = separaNombreYEstado('ARRUPE CHAMINADE C.D.').nombreEquipo;
      expect(calendario).toBe(acta);
      expect(normalizaNombreEquipo(calendario)).toBe(normalizaNombreEquipo(acta));
    });

    it('lo que NO cambia con este marcador: (RET), (Juv.), (Femenino) y (VETERANOS) siguen enteros', () => {
      for (const [literal, esperado] of [
        ['PRESION BREAK BERRIZ (RET)', 'PRESION BREAK BERRIZ (RET)'],
        ['CALASANZ A.D. (Juv.) "A"', 'CALASANZ A.D. (Juv.) "A"'],
        ['CLUB DEPORTIVO (Femenino)', 'CLUB DEPORTIVO (Femenino)'],
        ['CLUB DEPORTIVO (VETERANOS)', 'CLUB DEPORTIVO (VETERANOS)'],
      ] as const) {
        expect(separaNombreYEstado(literal).nombreEquipo, literal).toBe(esperado);
      }
    });
  });
});

describe('resolución de la inscripción por evidencia', () => {
  /** El catálogo de UN grupo: sólo su ámbito. */
  const catalogo: CatalogoNova = {
    inscripcionPorCodigo: new Map([['9439', 'ARENAS C.'], ['22880135', 'RACING CLUB DE FERROL, SAD']]),
    inscripcionPorNombreLimpio: new Map([
      [normalizaNombreEquipo('BEASAIN S.D.'), 'BEASAIN S.D.'],
      [normalizaNombreEquipo('RIO ARANDA-ESCUELA FUTBOL BASE "A"'), 'RIO ARANDA-ESCUELA FUTBOL BASE "A"'],
    ]),
  };

  it('1. usa el código explícito del propio partido cuando existe', () => {
    const r = resuelveEquipoNova({ literal: 'ARENAS C.', codigoExplicito: '9439' }, catalogo);
    expect(r.via).toBe('codigo-explícito-del-partido');
    expect(r.codigoExterno).toBe('9439');
    expect(r.inscripcion).toBe('ARENAS C.');
  });

  it('2. resuelve por nombre limpio único cuando la fuente no publica código', () => {
    // Es el caso de 28.833 de los 32.877 partidos de Euskadi: sin código, y el nombre limpio resuelve.
    const r = resuelveEquipoNova({ literal: '(Sailkatua) BEASAIN S.D.', codigoExplicito: null }, catalogo);
    expect(r.via).toBe('nombre-limpio-único');
    expect(r.inscripcion).toBe('BEASAIN S.D.');
    // El código NO se fabrica: la fuente no lo publica.
    expect(r.codigoExterno).toBeNull();
    expect(r.marcadoresEstado).toEqual(['(Sailkatua)']);
  });

  it('3. deja sin resolver cuando el nombre limpio no es único en el grupo', () => {
    // Dos equipos del mismo grupo con el mismo nombre limpio: el mapa no los contiene y no se elige.
    const ambiguo: CatalogoNova = { inscripcionPorCodigo: new Map(), inscripcionPorNombreLimpio: new Map() };
    const r = resuelveEquipoNova({ literal: 'CLUB X "A"', codigoExplicito: null }, ambiguo);
    expect(r.via).toBe('sin-resolver');
    expect(r.inscripcion).toBeNull();
    expect(r.codigoExterno).toBeNull();
  });

  it('no cruza el ámbito: un código que no es de este grupo no resuelve y no cae al nombre', () => {
    const r = resuelveEquipoNova({ literal: 'BEASAIN S.D.', codigoExplicito: '999999' }, catalogo);
    expect(r.via).toBe('sin-resolver');
    expect(r.inscripcion).toBeNull();
    expect(r.evidencia).toContain('999999');
  });

  it('no une primer equipo y filial: la letra forma parte de la identidad', () => {
    const r = resuelveEquipoNova({ literal: 'RIO ARANDA-ESCUELA FUTBOL BASE "B"', codigoExplicito: null }, catalogo);
    // El catálogo sólo tiene la «A»: la «B» no resuelve, y no se recorta la letra para que resuelva.
    expect(r.via).toBe('sin-resolver');
    expect(r.inscripcion).toBeNull();
    const a = resuelveEquipoNova({ literal: 'RIO ARANDA-ESCUELA FUTBOL BASE "A"', codigoExplicito: null }, catalogo);
    expect(a.via).toBe('nombre-limpio-único');
    expect(a.inscripcion).toContain('"A"');
  });

  it('conserva el literal y deja la evidencia escrita, para poder auditar cada decisión', () => {
    const r = resuelveEquipoNova({ literal: '(Sailkatua) ATHLETIC CLUB "B"', codigoExplicito: null }, catalogo);
    expect(r.nombreEquipo).toBe('ATHLETIC CLUB "B"');
    expect(r.evidencia).toContain('ATHLETIC CLUB "B"');
    expect(r.via).toBe('sin-resolver'); // no está en este catálogo de prueba
  });

  it('la normalización de nombres no depende de la puntuación ni de las tildes', () => {
    // La puntuación se convierte en espacio, igual que en `core.normaliza_nombre`: `S.D.` → `s d`.
    expect(normalizaNombreEquipo('S.D. SAN JOSÉ "A"')).toBe(normalizaNombreEquipo('S.D. SAN JOSE "A"'));
    expect(normalizaNombreEquipo('S.D. SAN JOSÉ "A"')).toBe('s d san jose a');
    expect(normalizaNombreEquipo('BETOÑO, C.D.')).toBe('betono c d');
  });
});
