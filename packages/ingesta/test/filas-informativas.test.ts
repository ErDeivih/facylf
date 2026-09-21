/**
 * Pruebas de la clasificación de filas de descanso.
 *
 * Lo que se demuestra: que la palabra se compara ENTERA y no por contención —un club llamado «DESCANSO»
 * no es un descanso—, que cada maqueta declara su vocabulario, que una fila con varias señales conserva
 * todas pero cae en UNA sola clase, y que los recuentos cumplen `total = suma de clases`.
 *
 * Estas pruebas no tocan ninguna base ni ningún archivo: la clasificación es pura a propósito, para que
 * el inventario del defecto se pueda comprobar sin PostgreSQL y sin las colas.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASES, SENALES, VOCABULARIO_DESCANSO, clasificaFilaDeDescanso, compruebaInvariantesDelInventario,
  esPalabraDeDescanso, llevaMarcadorDeEstado, recuentaInventario, veredictoDelActaDeDescanso,
  type ClaseDescanso, type EntradaClasificacion, type Maqueta,
} from '../src/parsers/filas-informativas.js';

/** Una fila base sin ninguna señal, para ir añadiendo la que pruebe cada caso. */
const base = (over: Partial<EntradaClasificacion> = {}): EntradaClasificacion => ({
  maqueta: 'pnfg-clasica',
  local: 'DESCANSA',
  visitante: 'BALSAS PICARRAL-U.D.',
  codigoActa: null,
  golesLocal: null,
  golesVisitante: null,
  campo: null,
  arbitro: null,
  filasConLaMismaActa: 0,
  filasConLaMismaPareja: 1,
  parejaExisteEnElHtml: null,
  hayPartidoDelHtmlAusente: false,
  actaDemuestraPartidoReal: null,
  ...over,
});

describe('la palabra se compara entera, nunca por contención', () => {
  it('reconoce la palabra sola, con espacios y en cualquier caja', () => {
    for (const literal of ['DESCANSA', 'Descansa', '  descansa  ', 'Descans', 'descanS']) {
      expect(esPalabraDeDescanso(literal, 'pnfg-clasica'), literal).toBe(true);
    }
  });

  it('la reconoce con un marcador de estado pegado: `Descansa (Ganador)`', () => {
    // Medido en La Rioja: la fuente pega el marcador de estado también al descanso.
    expect(esPalabraDeDescanso('Descansa (Ganador)', 'pnfg-clasica')).toBe(true);
    expect(esPalabraDeDescanso('(Clasificado) Descansa', 'pnfg-clasica')).toBe(true);
    expect(llevaMarcadorDeEstado('Descansa (Ganador)')).toBe(true);
  });

  it('NO confunde un club cuyo nombre CONTIENE la palabra', () => {
    // Es la trampa que el encargo prohíbe: borrar por contención se llevaría por delante este club.
    for (const literal of [
      'C.D. DESCANSO', 'DESCANSO F.S.', 'CLUB DESCANSA', 'C.D. DESCANSA-B',
      'ATLÉTICO DESCANSO "A"', 'DESCANSOS UNIDOS',
    ]) {
      expect(esPalabraDeDescanso(literal, 'pnfg-clasica'), literal).toBe(false);
    }
  });

  it('cada maqueta declara su vocabulario: Euskadi es bilingüe y publica las dos formas', () => {
    expect(VOCABULARIO_DESCANSO['nova-widget']).toEqual(['descansa', 'atsedena']);
    expect(VOCABULARIO_DESCANSO['pnfg-clasica']).toEqual(['descansa', 'descans']);
    // `Atsedena` sólo vale en la maqueta que lo declara: no se aplica a las demás por si acaso.
    expect(esPalabraDeDescanso('Atsedena', 'nova-widget')).toBe(true);
    expect(esPalabraDeDescanso('Atsedena', 'pnfg-clasica')).toBe(false);
    expect(esPalabraDeDescanso('Descansa', 'nova-widget')).toBe(true);
  });

  it('una maqueta sin vocabulario declarado no clasifica nada', () => {
    expect(esPalabraDeDescanso('DESCANSA', 'desconocida')).toBe(false);
  });
});

describe('clases causales, excluyentes', () => {
  it('A · descanso informativo puro: los dos lados son descanso y no hay ningún dato de partido', () => {
    const r = clasificaFilaDeDescanso(base({ local: 'Descansa', visitante: 'Descansa' }));
    expect(r.clase).toBe('A');
    expect(r.senales).toContain('literal-de-descanso-en-los-dos-lados');
    expect(r.certeza).toBe('demostrado');
  });

  it('B · descanso unido a un equipo real, sin datos de partido', () => {
    const r = clasificaFilaDeDescanso(base());
    expect(r.clase).toBe('B');
    expect(r.explicacion).toMatch(/qué equipo descansa/);
  });

  it('B · en la maqueta nova, con `Atsedena` y el equipo que descansa en el otro lado', () => {
    // Euskadi publica las dos formas, así que el lado que NO es descanso tiene que ser un equipo de verdad.
    const r = clasificaFilaDeDescanso(base({ maqueta: 'nova-widget', local: 'SESTAO F.S.', visitante: 'Atsedena' }));
    expect(r.clase).toBe('B');
    expect(r.senales).not.toContain('literal-de-descanso-en-los-dos-lados');
  });

  it('C · partido desplazado: la fila lleva acta de un partido real', () => {
    const r = clasificaFilaDeDescanso(base({ codigoActa: '667866', actaDemuestraPartidoReal: true, golesLocal: 1, golesVisitante: 3, campo: 'EL RABAL', hayPartidoDelHtmlAusente: true }));
    expect(r.clase).toBe('C');
    expect(r.certeza).toBe('demostrado');
    expect(r.senales).toEqual(expect.arrayContaining(['acta-en-la-fila', 'marcador-publicado', 'campo-real', 'partido-real-del-html-ausente-en-la-cola']));
    expect(r.explicacion).toMatch(/acta 667866/);
  });

  it('un 0-0 a secas NO es un partido desplazado: es la plantilla del bloque de descanso', () => {
    // Medido en Euskadi t13 c2949 g7237 J3: el bloque publica celdas de marcador con señales `ntype(...)`
    // que resuelven a 0 y 0, sin acta, sin campo y sin árbitro, y esa jornada tiene sus ocho filas
    // alineadas con el HTML, sin ningún partido perdido. Ascender eso a «desplazado» sería inventar.
    const r = clasificaFilaDeDescanso(base({ local: 'DEPORTIVO ALAVES', visitante: 'DESCANSA', golesLocal: 0, golesVisitante: 0 }));
    expect(r.clase).toBe('B');
    expect(r.senales).toContain('marcador-publicado');
    expect(r.senales).toContain('marcador-0-0-de-plantilla-sin-otra-senal');
  });

  it('pero un 0-0 CON evidencia de desplazamiento sí es clase C', () => {
    expect(clasificaFilaDeDescanso(base({ golesLocal: 0, golesVisitante: 0, hayPartidoDelHtmlAusente: true })).clase).toBe('C');
    expect(clasificaFilaDeDescanso(base({ golesLocal: 0, golesVisitante: 0, codigoActa: '123', actaDemuestraPartidoReal: true })).clase).toBe('C');
    expect(clasificaFilaDeDescanso(base({ golesLocal: 0, golesVisitante: 0, parejaExisteEnElHtml: false })).clase).toBe('C');
  });

  it('un marcador distinto de 0-0 sí cuenta como dato de partido real', () => {
    const r = clasificaFilaDeDescanso(base({ golesLocal: 1, golesVisitante: 3 }));
    expect(r.clase).toBe('C');
    expect(r.senales).not.toContain('marcador-0-0-de-plantilla-sin-otra-senal');
  });

  it('C · también cuando el único dato de partido es el campo o el árbitro', () => {
    expect(clasificaFilaDeDescanso(base({ campo: 'EL RABAL (antiguo Vadorrey)-C.M.F.' })).clase).toBe('C');
    expect(clasificaFilaDeDescanso(base({ arbitro: 'ESTELA GALLAN, PAOLA' })).clase).toBe('C');
  });

  it('un campo que es la propia palabra de descanso NO cuenta como campo real', () => {
    // La fuente publica el bloque de descanso con el campo «Descansa»: no es el campo de un partido.
    const r = clasificaFilaDeDescanso(base({ campo: 'Descansa' }));
    expect(r.clase).toBe('B');
    expect(r.senales).not.toContain('campo-real');
  });

  it('D · duplicado: la jornada repite la pareja o comparte la acta', () => {
    expect(clasificaFilaDeDescanso(base({ filasConLaMismaPareja: 2 })).clase).toBe('D');
    expect(clasificaFilaDeDescanso(base({ codigoActa: '667866', filasConLaMismaActa: 2 })).clase).toBe('D');
  });

  it('E · marcador de estado pegado al descanso manda sobre las demás señales', () => {
    const r = clasificaFilaDeDescanso(base({ local: 'Descansa (Ganador)', codigoActa: '667866', filasConLaMismaPareja: 2 }));
    expect(r.clase).toBe('E');
    // Pero NO pierde las otras señales: una fila puede tener varias y todas se conservan.
    expect(r.senales).toEqual(expect.arrayContaining(['marcador-de-estado-pegado-al-descanso', 'acta-en-la-fila', 'pareja-repetida-en-la-jornada']));
  });

  it('F · una fila sin la palabra entera no entra: es un club, no un descanso', () => {
    const r = clasificaFilaDeDescanso(base({ local: 'C.D. DESCANSO', visitante: 'BALSAS PICARRAL-U.D.' }));
    expect(r.clase).toBe('F');
    expect(r.senales).toEqual([]);
  });

  it('cada clase del vocabulario se puede alcanzar', () => {
    const alcanzadas = new Set<ClaseDescanso>([
      clasificaFilaDeDescanso(base({ local: 'Descansa', visitante: 'Descansa' })).clase,
      clasificaFilaDeDescanso(base()).clase,
      clasificaFilaDeDescanso(base({ codigoActa: '1', actaDemuestraPartidoReal: true })).clase,
      clasificaFilaDeDescanso(base({ filasConLaMismaPareja: 2 })).clase,
      clasificaFilaDeDescanso(base({ local: 'Descansa (Ganador)' })).clase,
      clasificaFilaDeDescanso(base({ local: 'C.D. DESCANSO' })).clase,
    ]);
    expect([...alcanzadas].sort()).toEqual([...CLASES].sort());
  });
});

describe('lo que dice el acta de un bloque de descanso', () => {
  it('el acta que nombra el descanso NO documenta partido', () => {
    // Es el caso real de Euskadi: 12 de las 13 fantasma con acta tienen un acta así, creada por la propia
    // federación para el hueco. Antes esto no se miraba —bastaba con que hubiera acta— y esas 12 filas
    // quedaban sin poder retirar.
    expect(veredictoDelActaDeDescanso(['DANOK BAT CLUB', 'DESCANSA'])).toBe('descanso');
    expect(veredictoDelActaDeDescanso(['DESCANSA', 'ARENAS CLUB'])).toBe('descanso');
    expect(veredictoDelActaDeDescanso(['EIBAR, S.D.', 'Atsedena'])).toBe('descanso');
    // El vocabulario se prueba en TODAS las maquetas: el nombre lo escribió la fuente en su acta.
    expect(veredictoDelActaDeDescanso(['EIBAR, S.D.', 'Descans'])).toBe('descanso');
    // Y con marcador de estado pegado, que también pasa.
    expect(veredictoDelActaDeDescanso(['EIBAR, S.D.', 'Descansa (Ganador)'])).toBe('descanso');
  });

  it('el acta con DOS equipos reales dice que ahí hubo partido: no autoriza a borrar', () => {
    expect(veredictoDelActaDeDescanso(['DANOK BAT CLUB', 'ARENAS CLUB'])).toBe('partido-real');
    // Un nombre que CONTIENE la palabra no es el descanso: `C.D. DESCANSO` es un equipo.
    expect(veredictoDelActaDeDescanso(['C.D. DESCANSO', 'ARENAS CLUB'])).toBe('partido-real');
  });

  it('lo que no se puede leer no demuestra nada', () => {
    expect(veredictoDelActaDeDescanso(null)).toBe('no-demuestra');
    expect(veredictoDelActaDeDescanso(['DANOK BAT CLUB', null])).toBe('no-demuestra');
    expect(veredictoDelActaDeDescanso(['', 'DESCANSA'])).toBe('no-demuestra');
    /*
     * Los DOS lados vacíos son la forma REAL de Madrid y Valencia: `{"local":"","visitante":""}` con estado
     * `pendiente`, 4.054 filas. Este caso no es una curiosidad: contarlas como pareja fue el error que hizo
     * que un cruce por SQL publicara 111 y 150 filas «con dos equipos reales» que no existen, porque en SQL
     * `'' is not null` es cierto. Se fija aquí, con el caso tal cual, para que no vuelva a colarse por la
     * puerta de «una cadena vacía no es una pareja» sin que nadie lo vea.
     */
    expect(veredictoDelActaDeDescanso(['', ''])).toBe('no-demuestra');
    expect(veredictoDelActaDeDescanso([undefined, undefined])).toBe('no-demuestra');
  });
});

describe('invariantes del inventario', () => {
  const casos = [
    { clase: 'B' as ClaseDescanso, federacion: 'aragon', maqueta: 'pnfg-clasica' as Maqueta, certeza: 'demostrado' as const, senales: ['literal-de-descanso-en-un-lado'] as const },
    { clase: 'B' as ClaseDescanso, federacion: 'aragon', maqueta: 'pnfg-clasica' as Maqueta, certeza: 'demostrado' as const, senales: ['literal-de-descanso-en-un-lado'] as const },
    { clase: 'C' as ClaseDescanso, federacion: 'euskadi', maqueta: 'nova-widget' as Maqueta, certeza: 'probable' as const, senales: ['literal-de-descanso-en-un-lado', 'acta-en-la-fila'] as const },
  ];

  it('el inventario coherente no da problemas', () => {
    expect(compruebaInvariantesDelInventario(casos)).toEqual([]);
  });

  it('total = suma de clases excluyentes', () => {
    const r = recuentaInventario(casos);
    expect(r.total).toBe(3);
    expect(Object.values(r.porClase).reduce((a, b) => a + b, 0)).toBe(r.total);
    expect(r.porFederacion).toEqual({ aragon: 2, euskadi: 1 });
  });

  it('una clase fuera del vocabulario se detecta', () => {
    const fallos = compruebaInvariantesDelInventario([{ clase: 'Z' as ClaseDescanso, federacion: 'x', senales: [] }]);
    expect(fallos.join(' ')).toMatch(/clase fuera del vocabulario/);
  });

  it('una señal fuera del vocabulario se detecta', () => {
    const fallos = compruebaInvariantesDelInventario([{ clase: 'B', federacion: 'x', senales: ['inventada' as never] }]);
    expect(fallos.join(' ')).toMatch(/señal fuera del vocabulario/);
  });

  it('una fila sin federación se detecta', () => {
    expect(compruebaInvariantesDelInventario([{ clase: 'B', federacion: '', senales: [] }]).join(' ')).toMatch(/sin federación/);
  });

  it('los recuentos llevan SIEMPRE todas las clases, aunque estén a cero', () => {
    const r = recuentaInventario([casos[0]!]);
    for (const c of CLASES) expect(r.porClase[c], c).toBeTypeOf('number');
    expect(r.porClase.A).toBe(0);
    expect(r.porCerteza['sin-determinar']).toBe(0);
  });

  it('el vocabulario de señales no tiene duplicados', () => {
    expect(new Set(SENALES).size).toBe(SENALES.length);
  });
});
