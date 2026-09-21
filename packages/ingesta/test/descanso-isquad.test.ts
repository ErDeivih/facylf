/**
 * El bloque de descanso de iSquad (Madrid y Valencia) y las entradas falsas del catálogo.
 *
 * En iSquad el descanso no llega como una tabla con un pseudo-equipo: llega en el JSON de resultados con
 * **código de equipo negativo** (`-1` en el caso más común). Medido sobre las dos colas: las 3.386 filas de
 * descanso de Madrid llevan código negativo en ese lado y hay 3.386 partidos con algún código negativo,
 * **ninguno sin la palabra**; en Valencia 686 y 686. Es una biyección, así que la evidencia es el código.
 *
 * Se prueba **el módulo que ejecuta el recolector** (`scripts/lib/filas-descanso-isquad.mjs`), no una copia
 * de la regla, y una comprobación estructural de que el registrador lo sigue usando.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADAPTADOR_ISQUAD, clasificaFilaDeDescansoIsquad, esLadoDeDescansoIsquad, separaDescansos, extraePartidosIsquad, extraeFilasInformativasIsquad, decideFilasDeJornada } from '../../../scripts/lib/filas-descanso-isquad.mjs';

/** Una fila real de Madrid: códigos positivos. */
const real = (local: string, visitante: string, codLocal: string, codVisitante: string) => ({
  cod_equipo_local: codLocal, cod_equipo_visitante: codVisitante, local, visitante, resultado: '1-0',
});

describe('la evidencia del descanso en iSquad es el CÓDIGO negativo, no el nombre', () => {
  it('un código negativo marca el lado del descanso', () => {
    for (const codigo of ['-1', '-9872', '-25890290', ' -1 ']) {
      expect(esLadoDeDescansoIsquad(codigo), codigo).toBe(true);
    }
  });

  it('un código positivo NO lo marca, aunque el nombre sea el del descanso', () => {
    for (const codigo of ['10548', '435', '', null, undefined]) {
      expect(esLadoDeDescansoIsquad(codigo), String(codigo)).toBe(false);
    }
  });

  it('una fila con código negativo es informativa y dice qué equipo descansa', () => {
    const r = clasificaFilaDeDescansoIsquad(real('A.D. VILLAVICIOSA DE ODON \'A\'', 'Descansa', '435', '-1'));
    expect(r.informativa).toBe(true);
    expect(r.equipoQueDescansa).toBe("A.D. VILLAVICIOSA DE ODON 'A'");
    expect(r.motivo).toMatch(/negativo en el lado visitante/);
  });

  it('un club cuyo nombre CONTIENE la palabra es un partido normal: no se toca', () => {
    const r = clasificaFilaDeDescansoIsquad(real('C.D. DESCANSO', 'C.D. UNO', '5001', '5002'));
    expect(r.informativa).toBe(false);
    expect(r.motivo).toBeNull();
  });

  it('con la palabra EXACTA y código POSITIVO, la fila se conserva y se declara', () => {
    // No se descarta por el nombre: perder un partido real es peor que guardar una fila de más.
    const r = clasificaFilaDeDescansoIsquad(real('Descansa', 'C.D. UNO', '5001', '5002'));
    expect(r.informativa).toBe(false);
    expect(r.motivo).toMatch(/NO es negativo/);
  });

  it('el adaptador declara los siete puntos que exige el encargo', () => {
    for (const campo of ['delimitaFilaDePartido', 'extraeCeldasDirectas', 'ignoraSubtablas', 'marcadoresDeEstado', 'evidenciaParaCorregir', 'cuandoDevuelveIncidencia'] as const) {
      expect(typeof ADAPTADOR_ISQUAD[campo], campo).toBe('string');
      expect(ADAPTADOR_ISQUAD[campo].length, campo).toBeGreaterThan(10);
    }
    expect(ADAPTADOR_ISQUAD.vocabularioDescanso.length).toBeGreaterThan(0);
  });
});

describe('separaDescansos: lo que el recolector ejecuta de verdad', () => {
  it('quita el descanso y CONSERVA EL ORDEN RELATIVO de los partidos reales', () => {
    // Es el segundo daño del defecto: la fila del descanso ocupaba un `orden` y desplazaba a los demás.
    const partidos = [
      real('C.D. UNO', 'C.D. DOS', '11', '12'),
      real('Descansa', 'C.D. TRES', '-1', '13'),
      real('C.D. CUATRO', 'C.D. CINCO', '14', '15'),
      real('C.D. SEIS', 'Descansa', '16', '-1'),
    ];
    const { reales, descansos, equiposQueDescansan } = separaDescansos(partidos);
    expect(reales.map((p: { local?: string }) => p.local)).toEqual(['C.D. UNO', 'C.D. CUATRO']);
    expect(descansos).toHaveLength(2);
    // Y queda registrado QUIÉN descansa en cada caso: es información de la fuente, no basura.
    expect(equiposQueDescansan).toEqual(['C.D. TRES', 'C.D. SEIS']);
  });

  it('una jornada sin descanso no cambia en nada', () => {
    const partidos = [real('C.D. UNO', 'C.D. DOS', '11', '12'), real('C.D. TRES', 'C.D. CUATRO', '13', '14')];
    const { reales, descansos, sospechosas } = separaDescansos(partidos);
    expect(reales).toEqual(partidos);
    expect(descansos).toEqual([]);
    expect(sospechosas).toEqual([]);
  });

  it('una jornada que SÓLO tiene el descanso deja cero partidos reales', () => {
    const { reales, descansos } = separaDescansos([real('Descansa', 'C.D. UNO', '-1', '11')]);
    expect(reales).toEqual([]);
    expect(descansos).toHaveLength(1);
  });

  it('no se pierde ningún partido: reales + descansos suman el total', () => {
    const partidos = [
      real('C.D. UNO', 'C.D. DOS', '11', '12'),
      real('Descansa', 'C.D. TRES', '-1', '13'),
      real('C.D. CUATRO', 'Descansa', '14', '-1'),
      real('C.D. CINCO', 'C.D. SEIS', '15', '16'),
    ];
    const { reales, descansos } = separaDescansos(partidos);
    expect(reales.length + descansos.length).toBe(partidos.length);
  });

  it('el descanso con los DOS lados negativos tampoco se cuela', () => {
    const { reales, descansos } = separaDescansos([real('Descansa', 'Descansa', '-1', '-1')]);
    expect(reales).toEqual([]);
    expect(descansos[0]!.equipoQueDescansa).toBe('Descansa');
  });
});

/**
 * La decisión de QUÉ se escribe al registrar una jornada, en el recolector.
 *
 * Son las pruebas que faltaban para que una recuperación de la reconstrucción no se borre sola: el
 * recolector reescribe la jornada entera (borra y vuelve a insertar), y la fuente NUNCA publicó el partido
 * que la reconstrucción recuperó —su hueco lo ocupa «Descansa»—, así que compactando se perdería. Sin esta
 * regla, los 28 partidos recuperados de Valencia desaparecerían en la siguiente re-comprobación de esas
 * jornadas.
 */
describe('decideFilasDeJornada: qué se escribe al registrar la jornada', () => {
  const real = (local: string, visitante: string, codLocal: string, codVisitante: string) =>
    ({ cod_equipo_local: codLocal, cod_equipo_visitante: codVisitante, local, visitante, resultado: '1-0', codacta: `a-${codLocal}` });

  const conDescanso = () => [
    real('C.D. UNO', 'C.D. DOS', '11', '12'),
    { cod_equipo_local: '13', cod_equipo_visitante: '-1', local: 'C.D. TRES', visitante: 'Descansa', resultado: '', codacta: 'a-13' },
    real('C.D. CUATRO', 'C.D. CINCO', '14', '15'),
  ];

  it('lo normal: aparta el descanso y numera los reales seguidos, sin huecos', () => {
    const { filas, recuperadas, descansos } = decideFilasDeJornada({ partidos: conDescanso() });
    expect(recuperadas).toBe(0);
    expect(descansos).toBe(1);
    expect(filas.map((f) => f.orden)).toEqual([0, 1]);
    expect(filas.map((f) => f.partido?.local)).toEqual(['C.D. UNO', 'C.D. CUATRO']);
    // Ninguna fila de descanso se cuela: es el defecto que este camino arregló.
    expect(filas.some((f) => String(f.partido?.visitante).includes('Descansa'))).toBe(false);
  });

  it('CON recuperación: conserva la fila que la cola ya tenía donde está el descanso', () => {
    // La cola tiene, en la posición del descanso (orden 1), el partido que el acta documenta.
    const filasActuales = [
      { orden: 0, local: 'C.D. UNO', visitante: 'C.D. DOS' },
      { orden: 1, local: 'C.D. TRES', visitante: 'C.D. CUATRO' },
      { orden: 2, local: 'C.D. CUATRO', visitante: 'C.D. CINCO' },
    ];
    const { filas, recuperadas } = decideFilasDeJornada({
      partidos: conDescanso(), filasActuales,
      actaDe: (codigo) => (codigo === 'a-13' ? ['C.D. TRES', 'C.D. CUATRO'] : null),
    });
    expect(recuperadas).toBe(1);
    const conservada = filas.find((f) => f.conservada);
    expect(conservada?.orden).toBe(1);
    expect(conservada?.conservada).toMatchObject({ local: 'C.D. TRES', visitante: 'C.D. CUATRO' });
    // Y las posiciones de la fuente se respetan: el partido que iba detrás sigue en la 2.
    expect(filas.map((f) => f.orden)).toEqual([0, 1, 2]);
  });

  it('sin acta que sostenga la pareja NO se conserva nada', () => {
    const filasActuales = [{ orden: 1, local: 'C.D. TRES', visitante: 'C.D. CUATRO' }];
    for (const actaDe of [
      () => null,                                   // no hay acta
      () => ['', ''] as [string, string],           // acta vacía
      () => ['C.D. TRES', 'OTRO EQUIPO'] as [string, string],   // el acta no dice lo que la fila
      () => ['C.D. TRES', 'C.D. TRES'] as [string, string],     // un equipo contra sí mismo
      () => { throw new Error('ilegible'); },       // acta ilegible
    ]) {
      const { filas, recuperadas } = decideFilasDeJornada({ partidos: conDescanso(), filasActuales, actaDe });
      expect(recuperadas, JSON.stringify(actaDe.toString())).toBe(0);
      expect(filas.some((f) => f.conservada)).toBe(false);
    }
  });

  it('la pareja se compara sin tildes ni mayúsculas, pero ENTERA', () => {
    const filasActuales = [{ orden: 1, local: 'C.D. TRES', visitante: "C.E. L'ALCUDIA 'A'" }];
    const { recuperadas } = decideFilasDeJornada({
      partidos: conDescanso(), filasActuales,
      actaDe: () => ['c.d. tres', "C.E. L'Alcudia 'a'"] as [string, string],
    });
    expect(recuperadas).toBe(1);
  });
});

describe('el registrador de iSquad sigue usando la regla', () => {
  it('escribe los partidos REALES, no la lista entera', () => {
    // Comprobación estructural: si alguien revierte el arreglo y vuelve a recorrer `partidos` al insertar,
    // esta prueba lo dice. Es la única forma de proteger el punto de llamada sin arrancar el recolector,
    // que es un programa con efectos al importarse.
    const fuente = readFileSync(resolve(import.meta.dirname, '..', '..', '..', 'scripts', 'recolector-valencia.mjs'), 'utf8');
    expect(fuente).toMatch(/import \{ separaDescansos, decideFilasDeJornada \} from '\.\/lib\/filas-descanso-isquad\.mjs';/);
    // La decisión de qué se escribe es la función PURA y probada, y recibe lo que hay hoy en la jornada.
    expect(fuente).toMatch(/const escritura = decideFilasDeJornada\(\{ partidos, filasActuales, actaDe \}\);/);
    expect(fuente).toMatch(/for \(const \{ orden, partido, conservada \} of escritura\.filas\)/);
    // Y ya no se recorre `reales` para insertar: era el camino que borraba las recuperaciones.
    expect(fuente).not.toMatch(/reales\.forEach\(\(p, orden\) => \{/);
  });
});

/**
 * La lectura de la jornada ARCHIVADA, que es lo que usa la reconstrucción.
 *
 * Estas dos pruebas fijan los dos defectos que se cometieron al escribirla, los dos medidos sobre la cola
 * real de Madrid (53.119 filas) al enchufar el adaptador:
 *
 *   1. clasificar la fila TRADUCIDA (con `codLocal`) en vez de la CRUDA (con `cod_equipo_local`): los dos
 *      lados se quedaban sin código, los 3.386 bloques se declaraban «sospechosos» y el informe publicaba
 *      **0 fantasma** donde hay 3.386;
 *   2. devolver el bloque como si fuera un partido: la comparación es posicional y el bloque se aparta de
 *      los dos lados por parejas, así que el lado del archivo se quedaba con una fila de más y desplazaba
 *      todo lo que iba detrás. Medido: **8.569 filas ambiguas** que eran puro artefacto.
 */
describe('extraePartidosIsquad: la jornada archivada, leída para comparar', () => {
  const jornada = JSON.stringify({
    origen: 'resultados_por_grupo_jornada',
    jornada: '1',
    partidos: [
      { codacta: '900', cod_equipo_local: '11', cod_equipo_visitante: '12', local: 'C.D. UNO', visitante: 'C.D. DOS', resultado: '1-0' },
      { codacta: '901', cod_equipo_local: '-1', cod_equipo_visitante: '13', local: 'Descansa', visitante: 'C.D. TRES', resultado: '' },
      { codacta: '902', cod_equipo_local: '14', cod_equipo_visitante: '15', local: 'C.D. CUATRO', visitante: 'C.D. CINCO', resultado: '2-2' },
    ],
  });

  it('devuelve los partidos REALES y en su orden: el bloque de descanso no entra', () => {
    const filas = extraePartidosIsquad(jornada);
    expect(filas.map((f) => f.local)).toEqual(['C.D. UNO', 'C.D. CUATRO']);
    // Y traduce los nombres de campo de la fuente a los que espera la herramienta.
    expect(filas[0]).toEqual({ local: 'C.D. UNO', visitante: 'C.D. DOS', codLocal: '11', codVisitante: '12', codActa: '900' });
  });

  it('una jornada sin el JSON esperado falla en voz alta, no devuelve una lista vacía', () => {
    expect(() => extraePartidosIsquad('<html>no soy JSON</html>')).toThrow(/no es JSON/);
    expect(() => extraePartidosIsquad('{"otra":"cosa"}')).toThrow(/no trae una lista/);
  });
});

describe('extraeFilasInformativasIsquad: el bloque se reconoce por CÓDIGO', () => {
  const jornada = JSON.stringify({
    partidos: [
      { codacta: '900', cod_equipo_local: '11', cod_equipo_visitante: '12', local: 'C.D. UNO', visitante: 'C.D. DOS' },
      { codacta: '901', cod_equipo_local: '-1', cod_equipo_visitante: '13', local: 'Descansa', visitante: 'C.D. TRES' },
      { codacta: '902', cod_equipo_local: '14', cod_equipo_visitante: '-1', local: 'C.D. CUATRO', visitante: 'Descansa' },
      { codacta: '903', cod_equipo_local: '15', cod_equipo_visitante: '16', local: 'Descansa', visitante: 'C.D. SEIS' },
    ],
  });

  it('el código negativo da un bloque INFORMATIVO, con el equipo que descansa', () => {
    const informativas = extraeFilasInformativasIsquad(jornada);
    expect(informativas).toHaveLength(3);
    const negativas = informativas.filter((i) => i.informativa);
    expect(negativas).toHaveLength(2);
    expect(negativas.map((i) => i.equipoQueDescansa)).toEqual(['C.D. TRES', 'C.D. CUATRO']);
    expect(negativas[0]!.motivo).toMatch(/código de equipo negativo/);
    // La tercera (nombre de descanso, código POSITIVO) se conserva y se declara sospechosa.
    const sospechosa = informativas.find((i) => i.sospechosa)!;
    expect(sospechosa.local).toBe('Descansa');
    expect(sospechosa.motivo).toMatch(/NO es negativo/);
  });
});
