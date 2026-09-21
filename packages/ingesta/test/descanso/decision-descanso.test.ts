/**
 * La decisión persistente sobre las filas de descanso, probada escenario a escenario.
 *
 * Lo que se prueba aquí es la POLÍTICA, no la escritura: si `partidos` no debe guardar la fila, si hay que
 * conservar incidencia, qué veredicto se afirma y cuándo la decisión caduca. Son los escenarios que el
 * encargo enumera, incluidos los que hoy fallarían: con el comportamiento actual la fila **vuelve a
 * `partidos`** en el siguiente repaso porque el extractor la emite mientras traiga acta.
 */
import { describe, expect, it } from 'vitest';
import {
  claveDeDecision, decideFilaDeDescanso, estadoDeLaDecision, evaluaYCompara,
  type DecisionDescanso, type EntradaDecision,
} from '../../src/descanso/decision-descanso.js';

const HUELLA_HTML = 'aaaa1111aaaa1111';
const HUELLA_ACTA = 'bbbb2222bbbb2222';

/** Las 12 filas reales de Euskadi, reducidas a dos muestras representativas. */
const SAMPLE_1 = {
  federacion: 'euskadi', temporada: '13', competicion: '2949', grupo: '7237', jornada: 19, orden: 2,
  codigo_acta: '131632',
  literal_local: 'DANOK BAT CLUB', literal_visitante: 'DESCANSA',
};
const SAMPLE_2 = {
  federacion: 'euskadi', temporada: '17', competicion: '3077', grupo: '7360', jornada: 12, orden: 4,
  codigo_acta: '264457',
  literal_local: 'DEPORTIVO ALAVES', literal_visitante: 'DESCANSA',
};

const entrada = (over: Partial<EntradaDecision> = {}): EntradaDecision => ({
  ...SAMPLE_1,
  archivo_html: 'F:\\descargas-euskadi\\recolector-local\\t13\\grupo-7237\\jornada-19.html',
  huella_html: HUELLA_HTML,
  enlaceDeActa: true,
  parejaDelActa: ['DANOK BAT CLUB', 'DESCANSA'],
  huella_acta: HUELLA_ACTA,
  comprobada_en: '2026-09-16T15:30:00.000Z',
  ...over,
});

describe('la clave es la identidad completa de la fuente', () => {
  it('incluye federación, temporada, competición, grupo, jornada, orden y acta', () => {
    expect(claveDeDecision(SAMPLE_1)).toBe('euskadi|13|2949|7237|19|2|131632');
  });

  it('dos filas del mismo orden en federaciones distintas NO son la misma fila', () => {
    const otra = { ...SAMPLE_1, federacion: 'rioja' };
    expect(claveDeDecision(SAMPLE_1)).not.toBe(claveDeDecision(otra));
  });

  it('sin acta, la clave acaba en el separador: no se confunde con la que sí la tiene', () => {
    expect(claveDeDecision({ ...SAMPLE_1, codigo_acta: null })).toBe('euskadi|13|2949|7237|19|2|');
  });
});

describe('qué se persiste en `partidos` y qué queda como incidencia', () => {
  it('acta que nombra el descanso: NO se persiste y queda informativa confirmada', () => {
    const r = decideFilaDeDescanso(entrada());
    expect(r.persiste).toBe(false);
    expect(r.decision!.veredicto).toBe('informativa');
    expect(r.decision!.evidencia).toBe('el-acta-nombra-el-descanso');
    // Y conserva TODO lo que el encargo exige para no perder evidencia.
    const d = r.decision!;
    expect(d.temporada).toBe('13');
    expect(d.competicion).toBe('2949');
    expect(d.grupo).toBe('7237');
    expect(d.jornada).toBe(19);
    expect(d.orden).toBe(2);
    expect(d.literal_local).toBe('DANOK BAT CLUB');
    expect(d.literal_visitante).toBe('DESCANSA');
    expect(d.codigo_acta).toBe('131632');
    expect(d.archivo_html).toContain('jornada-19.html');
    expect(d.huella_html).toBe(HUELLA_HTML);
    expect(d.huella_acta).toBe(HUELLA_ACTA);
    expect(d.comprobada_en).toBe('2026-09-16T15:30:00.000Z');
    expect(d.pareja_del_acta).toEqual(['DANOK BAT CLUB', 'DESCANSA']);
  });

  it('la segunda muestra real se comporta igual (no es un caso suelto)', () => {
    const r = decideFilaDeDescanso(entrada({
      ...SAMPLE_2, parejaDelActa: ['DEPORTIVO ALAVES', 'DESCANSA'],
    }));
    expect(r.persiste).toBe(false);
    expect(r.decision!.veredicto).toBe('informativa');
  });

  it('acta con DOS EQUIPOS REALES: no se persiste como partido y queda DESPLAZADA, con la pareja del acta', () => {
    const r = decideFilaDeDescanso(entrada({
      parejaDelActa: ['CANALS PROMESES C.F. "A"', 'DANOK BAT CLUB'],
    }));
    expect(r.persiste).toBe(false);
    expect(r.decision!.veredicto).toBe('desplazada');
    expect(r.decision!.evidencia).toBe('el-acta-nombra-dos-equipos-reales');
    // La pareja del acta se conserva: es lo que permite recuperar el partido después.
    expect(r.decision!.pareja_del_acta).toEqual(['CANALS PROMESES C.F. "A"', 'DANOK BAT CLUB']);
  });

  it('acta VACÍA (la forma real de Madrid y Valencia): incidencia pendiente, NO se decide', () => {
    const r = decideFilaDeDescanso(entrada({ parejaDelActa: ['', ''] }));
    expect(r.persiste).toBe(false);
    expect(r.decision!.veredicto).toBe('sin-decidir');
    expect(r.decision!.evidencia).toBe('el-acta-no-permite-veredicto');
  });

  it('acta TODAVÍA NO descargada: igual, pendiente y sin decidir; jamás se deduce del enlace', () => {
    const r = decideFilaDeDescanso(entrada({ parejaDelActa: null, huella_acta: null }));
    expect(r.persiste).toBe(false);
    expect(r.decision!.veredicto).toBe('sin-decidir');
  });

  it('sin enlace de acta en el HTML: informativa y fuera de `partidos` (la regla que ya funcionaba)', () => {
    const r = decideFilaDeDescanso(entrada({ enlaceDeActa: false, parejaDelActa: null, huella_acta: null }));
    expect(r.persiste).toBe(false);
    expect(r.decision!.veredicto).toBe('informativa');
    expect(r.decision!.evidencia).toBe('palabra-de-descanso-sin-acta');
  });
});

describe('la decisión caduca si cambia la evidencia', () => {
  const guardada = (): DecisionDescanso => decideFilaDeDescanso(entrada()).decision!;

  it('con el HTML igual y el acta igual, sigue vigente', () => {
    expect(estadoDeLaDecision(guardada(), {
      huella_html: HUELLA_HTML, huella_acta: HUELLA_ACTA, codigo_acta: '131632',
    })).toBe('vigente');
  });

  it('HTML MODIFICADO: caduca y la fila vuelve a revisión', () => {
    expect(estadoDeLaDecision(guardada(), {
      huella_html: 'cccc9999cccc9999', huella_acta: HUELLA_ACTA, codigo_acta: '131632',
    })).toBe('caducada');
  });

  it('ACTA MODIFICADA: caduca', () => {
    expect(estadoDeLaDecision(guardada(), {
      huella_html: HUELLA_HTML, huella_acta: 'dddd7777dddd7777', codigo_acta: '131632',
    })).toBe('caducada');
  });

  it('CÓDIGO DE ACTA CAMBIADO: caduca aunque las huellas que tenemos coincidan', () => {
    expect(estadoDeLaDecision(guardada(), {
      huella_html: HUELLA_HTML, huella_acta: HUELLA_ACTA, codigo_acta: '999999',
    })).toBe('caducada');
  });

  it('sin decisión guardada: ausente', () => {
    expect(estadoDeLaDecision(undefined as unknown as DecisionDescanso, {
      huella_html: HUELLA_HTML, huella_acta: HUELLA_ACTA, codigo_acta: '131632',
    })).toBe('ausente');
  });

  it('recuperación: si la evidencia vuelve a cambiar, la decisión se recalcula y vuelve a escribirse', () => {
    const primera = evaluaYCompara(entrada(), undefined);
    expect(primera.escribir).toBe(true);
    expect(primera.estado).toBe('ausente');

    // Segunda pasada sin tocar nada: idempotente, no se escribe otra vez.
    const segunda = evaluaYCompara(entrada(), primera.resultado.decision!);
    expect(segunda.escribir).toBe(false);
    expect(segunda.estado).toBe('vigente');
    expect(segunda.resultado.decision!.veredicto).toBe('informativa');

    // El HTML cambia: la decisión caduca y hay que volver a escribirla.
    const tercera = evaluaYCompara(
      entrada({ huella_html: 'eeee5555eeee5555' }), primera.resultado.decision!,
    );
    expect(tercera.escribir).toBe(true);
    expect(tercera.estado).toBe('caducada');

    // Y si el acta nueva nombra dos equipos reales, el veredicto CAMBIA: informativa → desplazada.
    const cuarta = evaluaYCompara(
      entrada({ huella_acta: 'ffff3333ffff3333', parejaDelActa: ['CANALS PROMESES C.F. "A"', 'DANOK BAT CLUB'] }),
      primera.resultado.decision!,
    );
    expect(cuarta.escribir).toBe(true);
    expect(cuarta.resultado.decision!.veredicto).toBe('desplazada');
  });
});

describe('lo que NO se hace nunca', () => {
  it('no se persiste un partido cuando un lado es exactamente una palabra de descanso, con acta o sin ella', () => {
    for (const parejaDelActa of [null, ['', ''], ['A', 'DESCANSA'], ['A', 'B']] as const) {
      const r = decideFilaDeDescanso(entrada({ parejaDelActa }));
      expect(r.persiste).toBe(false);
      expect(r.decision).not.toBeNull();
    }
  });

  it('el veredicto `informativa` sólo se afirma con evidencia: sin acta legible queda `sin-decidir`', () => {
    expect(decideFilaDeDescanso(entrada({ parejaDelActa: null })).decision!.veredicto).toBe('sin-decidir');
    expect(decideFilaDeDescanso(entrada({ parejaDelActa: ['', ''] })).decision!.veredicto).toBe('sin-decidir');
    expect(decideFilaDeDescanso(entrada()).decision!.veredicto).toBe('informativa');
  });
});
