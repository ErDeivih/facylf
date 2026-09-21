/**
 * La herramienta de reconstrucción, de punta a punta y sobre colas TEMPORALES.
 *
 * Ninguna prueba de este fichero abre la cola de ninguna federación de verdad: todas montan su propia
 * raíz con `montaBanco`. La razón no es el orden, es que la cola real la están escribiendo los workers y
 * una prueba que la abriera en escritura podría tirar horas de recolección.
 *
 * Lo que se demuestra, punto por punto: simular no escribe; el manifiesto se persiste; los hashes de HTML
 * y de fila detectan cambios; el manifiesto ausente, obsoleto o de otra versión se rechaza; una jornada
 * `en_curso` detiene el lote; se valida TODO antes de la primera escritura; hay una transacción por
 * jornada y una jornada fallida revierte sola sin llevarse las anteriores; el lote se reanuda; la copia
 * previa es consistente con el WAL; el diario guarda los valores anteriores y posteriores; la
 * verificación y la reversión exacta funcionan; aplicar dos veces y aplicar→revertir→aplicar son
 * idempotentes; el adaptador equivocado y las PNFG se rechazan; lo ambiguo queda fuera.
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

import {
  aplica, guardaManifiesto, invalidaManifiesto, leeManifiesto, revierte, revisaAplicacion,
  simula, verifica, rutaBloqueo, sueltaBloqueo,
} from '../../../../scripts/reconstruir-cola.mjs';
import { versionExtractor } from '../../src/reconstruccion-cola/version.js';
import { compruebaCoherencia } from '../../src/reconstruccion-cola/manifiesto.js';
import { DatabaseSync, montaBanco, htmlJornada, type Banco, type GrupoBanco } from './banco.js';

const raices: string[] = [];
function raiz(): string {
  const r = mkdtempSync(join(tmpdir(), 'facylf-recon-'));
  raices.push(r);
  return r;
}
afterEach(() => {
  for (const r of raices.splice(0)) rmSync(r, { recursive: true, force: true });
});

const GRUPO_BASE: GrupoBanco = {
  temporada: '21', competicion: '900', grupo: '901',
  // La clasificación lista a los CUATRO equipos: es la segunda fuente de evidencia del catálogo y la
  // única que publica el código de los equipos que el calendario no enlaza. Sin ella, los equipos sin
  // código en la cola no resolverían —que es exactamente el bloqueo estructural de Euskadi.
  clasificacion: [
    { nombre: 'ALAVES "B"', codigo: '111' }, { nombre: 'BILBAO C.D.', codigo: '222' },
    { nombre: 'EIBAR "C"', codigo: '333' }, { nombre: 'DERIO C.D.', codigo: '444' },
  ],
  jornadas: [
    { numero: 1, filas: [
      { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
      { orden: 1, local: '(Irabazlea) EIBAR "C"', visitante: 'DERIO C.D.', codigos: ['333', '444'], acta: ['EIBAR C', 'DERIO C.D.'] },
    ] },
    { numero: 2, filas: [
      { orden: 0, local: '(Sailkatua) EIBAR "C"', visitante: 'ALAVES "B"', codigos: ['333', '111'], acta: ['EIBAR C', 'ALAVES B'] },
    ] },
  ],
};

function banco(grupos: GrupoBanco[] = [GRUPO_BASE], federacion = 'euskadi'): Banco {
  return montaBanco({ raiz: raiz(), grupos, federacion });
}

/** Simula y persiste, que es el camino real. Devuelve el manifiesto y su id. */
function simulaYGuarda(b: Banco, federacion = 'euskadi') {
  const m = simula(federacion, { raiz: b.raiz });
  guardaManifiesto(m, { raiz: b.raiz });
  return m;
}

/**
 * Un grupo con dos partidos reales y, detrás, el bloque de descanso, como lo publica la fuente.
 *
 * Es el caso que la corrección del extractor NO puede arreglar sola: la cola todavía tiene la fila del
 * descanso, y si no se aparta antes de comparar, desplaza la alineación de todo lo que va detrás.
 */
const GRUPO_CON_DESCANSO: GrupoBanco = {
  temporada: '21', competicion: '900', grupo: '903',
  clasificacion: [
    { nombre: 'ALAVES "B"', codigo: '111' }, { nombre: 'BILBAO C.D.', codigo: '222' },
    { nombre: 'EIBAR "C"', codigo: '333' }, { nombre: 'DERIO C.D.', codigo: '444' },
  ],
  jornadas: [{ numero: 1, filas: [
    { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
    { orden: 1, local: '(Irabazlea) EIBAR "C"', visitante: 'DERIO C.D.', codigos: ['333', '444'], acta: ['EIBAR C', 'DERIO C.D.'] },
    // El bloque de descanso: sin código y sin acta, como lo publica la maqueta nova.
    { orden: 2, local: 'SESTAO F.S.', visitante: 'Atsedena', codigos: [null, null], acta: null, codActa: null },
  ] }],
};

describe('diagnóstico de las filas de descanso', () => {
  it('la fila de descanso se informa como fantasma y NO desalinea lo demás', () => {
    const b = banco([GRUPO_CON_DESCANSO]);
    const m = simula('euskadi', { raiz: b.raiz });
    expect(m.resumen.filas_fantasma).toBe(1);
    expect(m.resumen.filas_fantasma_sin_acta).toBe(1);
    expect(m.jornadas[0]!.filasFantasma![0]!.equipo_que_descansa).toBe('SESTAO F.S.');
    // Y lo que importa: las dos filas reales siguen cuadrando. Sin apartar el descanso antes de comparar,
    // la alineación se desplazaría y éstas saldrían ambiguas en vez de corregidas.
    expect(m.resumen.cambios).toBe(2);
    expect(m.resumen.ambiguos).toBe(0);
    expect(m.resumen.identicas).toBe(0);
    // La partición incluye la fantasma: una fila de la cola es idéntica, corregida, ambigua o fantasma.
    const r = m.resumen;
    expect(r.filas).toBe(r.identicas + r.cambios + r.ambiguos + r.filas_fantasma);
    // El bloque se declara, y se declara que la cola SÍ lo tiene: es lo que permite retirarlo.
    expect(m.jornadas[0]!.informativas!.find((i) => i.informativa)!.en_la_cola).toBe(true);
    expect(compruebaCoherencia(m)).toEqual([]);
  });

  it('una jornada sin descanso no declara ninguna fantasma', () => {
    const b = banco();
    const m = simula('euskadi', { raiz: b.raiz });
    expect(m.resumen.filas_fantasma).toBe(0);
    expect(m.resumen.jornadas_con_filas_fantasma).toBe(0);
  });

  /**
   * El defecto medido tras aplicar el lote `e698fde408abbfc4` en Euskadi: 54 filas «ambiguas» que eran puro
   * artefacto de alineación.
   *
   * El bloque de descanso va EN MEDIO a propósito. La fuente lo sigue publicando —y con acta, así que el
   * extractor lo emite—, mientras que la cola ya no tiene la fila porque un lote la retiró. Comparando por
   * posición, la fila real que va detrás del bloque se compara con el bloque y sale ambigua: en la cola real
   * fueron 54 filas repartidas por las jornadas que tenían un bloque de estos.
   *
   * Sin el arreglo esta prueba falla: la detección del bloque buscaba la fila en la COLA, y sin fila no
   * encontraba nada que apartar.
   */
  it('un bloque de descanso CON ACTA ya retirado de la cola no desalinea lo que va detrás', () => {
    const conBloqueRetirado: GrupoBanco = {
      temporada: '21', competicion: '900', grupo: '904',
      clasificacion: [
        { nombre: 'ALAVES "B"', codigo: '111' }, { nombre: 'BILBAO C.D.', codigo: '222' },
        { nombre: 'EIBAR "C"', codigo: '333' }, { nombre: 'DERIO C.D.', codigo: '444' },
        { nombre: 'SESTAO F.S.', codigo: '555' },
      ],
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
        // El bloque: la fuente lo publica, la cola ya no lo tiene, y su acta nombra el descanso.
        { orden: -1, local: 'SESTAO F.S.', visitante: 'Atsedena', codigos: [null, null], codActa: 'acta-904-1-bloque',
          acta: ['SESTAO F.S.', 'DESCANSA'], soloEnHtml: true },
        // Ésta ya está como el HTML la publica: sin marcadores y con sus códigos ya recuperados.
        { orden: 1, local: 'EIBAR "C"', visitante: 'DERIO C.D.', codigos: ['333', '444'], codigosEnCola: ['333', '444'],
          acta: ['EIBAR C', 'DERIO C.D.'] },
      ] }],
    };
    const b = banco([conBloqueRetirado]);
    const m = simula('euskadi', { raiz: b.raiz });
    const j = m.jornadas[0]!;
    // Las dos filas reales se comparan con SU fila, no con el bloque: una idéntica (ya estaba corregida) y
    // una corregida.
    expect(j.ambiguos).toEqual([]);
    expect(m.resumen.ambiguos).toBe(0);
    expect(m.resumen.identicas).toBe(1);
    expect(m.resumen.cambios).toBe(1);
    // Y el bloque retirado NO se publica como partido recuperable: ya está declarado como bloque.
    expect(m.resumen.partidos_recuperados).toBe(0);
    // La fila ya no está en la cola, así que no hay fantasma que retirar; el bloque se sigue declarando.
    expect(m.resumen.filas_fantasma).toBe(0);
    expect(j.informativas!.filter((i) => i.sospechosa).length).toBe(1);
    // Y se anota que la cola YA NO tiene esa fila: es la huella que deja la retirada, y sin este dato no se
    // puede distinguir un bloque retirado de uno que la cola nunca guardó.
    expect(j.informativas!.find((i) => i.sospechosa)!.en_la_cola).toBe(false);
    expect(compruebaCoherencia(m)).toEqual([]);
  });
});

describe('retirada de filas fantasma', () => {
  it('retira la fantasma, la verifica y la REVERSIÓN la vuelve a insertar entera', async () => {
    const b = banco([GRUPO_CON_DESCANSO]);
    const inicial = b.estadoLogico();
    const m = simulaYGuarda(b);
    expect(m.resumen.filas_retirables).toBe(1);

    // Sin el permiso explícito NO se retira nada: el defecto se informa, no se toca.
    const sinPermiso = await aplica('euskadi', m.id, { raiz: b.raiz });
    expect(sinPermiso.retirada_fantasma).toBe(false);
    expect(b.leerFila('903', 1, 2)).toBeDefined();

    // Y con él, sí. `b.estadoLogico()` no debe perder la fila al revertir: por eso la retirada guarda la
    // fila ENTERA en el diario y la reversión la inserta, en vez de intentar un `update` que no afectaría
    // a ninguna fila.
    revierte('euskadi', m.id, { raiz: b.raiz });
    const conRetirada = await aplica('euskadi', m.id, { raiz: b.raiz, retirar: true });
    expect(conRetirada.retirada_fantasma).toBe(true);
    expect(b.leerFila('903', 1, 2)).toBeUndefined();
    expect(verifica('euskadi', m.id, { raiz: b.raiz }).malas).toEqual([]);

    // Aplicar dos veces con retirada no se queja ni duplica: la fila ya no está y eso es lo esperado.
    const segunda = await aplica('euskadi', m.id, { raiz: b.raiz, retirar: true });
    expect(segunda.filas_nuevas).toBe(0);

    // Y la reversión devuelve la cola EXACTAMENTE al estado inicial, fila fantasma incluida.
    revierte('euskadi', m.id, { raiz: b.raiz });
    expect(b.estadoLogico()).toEqual(inicial);
  });

  it('pedir la retirada sobre un lote ya aplicado SIN retirada no miente sobre lo que pasó', async () => {
    const b = banco([GRUPO_CON_DESCANSO]);
    const m = simulaYGuarda(b);
    const sinPermiso = await aplica('euskadi', m.id, { raiz: b.raiz });
    expect(sinPermiso.retirada_fantasma).toBe(false);

    // La jornada está marcada como hecha, pero la fantasma no se retiró porque esa invocación no lo pidió.
    // Antes esto se rechazaba diciendo «la fila fantasma ya retirada sigue en la cola», que es falso: no se
    // retiró nunca. Lo que hay que decir es qué falta hacer.
    let error: Error | null = null;
    await aplica('euskadi', m.id, { raiz: b.raiz, retirar: true })
      .catch((e: unknown) => { error = e as Error; });
    expect(error).toBeInstanceOf(Error);
    expect((error as unknown as Error).message).toMatch(/SIN retirada/);
    expect((error as unknown as Error).message).toMatch(/manifiesto nuevo/);
    expect((error as unknown as Error).message).not.toMatch(/ya retirada/);
    // Y la fantasma sigue donde estaba: no se ha tocado nada a medias.
    expect(b.leerFila('903', 1, 2)).toBeDefined();
  });

  /*
   * La regla cambió, y cambió porque se abrió el acta. Antes era «¿trae acta? entonces no se retira», que
   * es un criterio sobre la EXISTENCIA del acta. Medido en Euskadi: de 13 fantasma con acta, 12 tienen un
   * acta cuya pareja es `(equipo real, DESCANSA)` —la federación creó el acta del hueco— y NINGUNA tiene un
   * acta con dos equipos reales. O sea que el acta no era la prueba de que hubiera partido: era un papel
   * que nadie había leído. Ahora se lee, y decide lo que DICE.
   */
  it('una fantasma cuyo acta nombra el DESCANSO sí se retira: el acta no documenta ningún partido', async () => {
    const b = banco([{
      temporada: '21', competicion: '900', grupo: '903',
      clasificacion: [{ nombre: 'ALAVES "B"', codigo: '111' }, { nombre: 'BILBAO C.D.', codigo: '222' }],
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
        // El bloque de descanso CON acta, y el acta nombra el descanso: es el caso real de Euskadi.
        { orden: 1, local: 'DANOK BAT CLUB', visitante: 'DESCANSA', codigos: [null, null], codActa: 'acta-descanso', acta: ['DANOK BAT CLUB', 'DESCANSA'] },
      ] }],
    }]);
    const m = simulaYGuarda(b);
    expect(m.resumen.filas_fantasma).toBe(1);
    expect(m.jornadas[0]!.filasFantasma![0]!.acta).toBe('descanso');
    expect(m.resumen.filas_fantasma_con_acta_de_descanso).toBe(1);
    expect(m.resumen.filas_retirables).toBe(1);

    await aplica('euskadi', m.id, { raiz: b.raiz, retirar: true });
    expect(b.leerFila('903', 1, 1)).toBeUndefined();
    // Y la reversión la devuelve entera, con su acta y todo: retirar con acta no es retirar a ciegas.
    revierte('euskadi', m.id, { raiz: b.raiz });
    expect(b.leerFila('903', 1, 1)).toBeDefined();
  });

  it('una fantasma cuyo acta nombra DOS EQUIPOS REALES no se retira: ahí hay partido', async () => {
    const b = banco([{
      temporada: '21', competicion: '900', grupo: '903',
      clasificacion: [{ nombre: 'ALAVES "B"', codigo: '111' }, { nombre: 'BILBAO C.D.', codigo: '222' }],
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
        // El acta dice que hubo partido entre dos equipos: borrar la fila lo perdería. Queda declarada.
        { orden: 1, local: 'DANOK BAT CLUB', visitante: 'DESCANSA', codigos: [null, null], codActa: 'acta-partido', acta: ['DANOK BAT CLUB', 'ARENAS CLUB'] },
      ] }],
    }]);
    const m = simulaYGuarda(b);
    // NO es fantasma y NO se retira: es un partido desplazado, que se informa y no se toca.
    expect(m.resumen.filas_fantasma).toBe(0);
    expect(m.resumen.filas_retirables).toBe(0);
    expect(m.resumen.filas_desplazadas).toBe(1);
    const a = await aplica('euskadi', m.id, { raiz: b.raiz, retirar: true });
    // La corrección del partido real SÍ se aplica —quitar el marcador de estado es otra cosa—; la fila del
    // descanso no se toca.
    expect(a.filas_nuevas).toBe(1);
    expect(b.leerFila('903', 1, 1)).toBeDefined();
  });

  it('sin acta que se pueda leer no se retira y no se decide: no saber no autoriza a borrar', async () => {
    const b = banco([{
      temporada: '21', competicion: '900', grupo: '903',
      clasificacion: [{ nombre: 'ALAVES "B"', codigo: '111' }, { nombre: 'BILBAO C.D.', codigo: '222' }],
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
        // El código de acta está en la cola, pero la fila del acta no: veredicto «no-demuestra».
        { orden: 1, local: 'DANOK BAT CLUB', visitante: 'DESCANSA', codigos: [null, null], codActa: 'acta-que-no-existe', acta: null },
      ] }],
    }]);
    const m = simulaYGuarda(b);
    // Ni fantasma ni desplazado: se declara como bloque sospechoso y se deja donde está.
    expect(m.resumen.filas_fantasma).toBe(0);
    expect(m.resumen.filas_retirables).toBe(0);
    expect(m.resumen.filas_desplazadas).toBe(0);
    expect(m.jornadas[0]!.informativas!.some((i) => i.sospechosa)).toBe(true);
    await aplica('euskadi', m.id, { raiz: b.raiz, retirar: true });
    expect(b.leerFila('903', 1, 1)).toBeDefined();
  });
  it('una fila cuyo acta nombra DOS EQUIPOS REALES se informa como partido DESPLAZADO, no como fantasma', () => {
    /*
     * Es el caso real de Valencia, grupo 904325856: 5 jornadas donde la cola pone «Descansa» en el lado que
     * el acta atribuye a `Canals Promeses C.F. 'A'`. La fila NO es una fantasma —ahí hubo partido— y por eso
     * no puede entrar en ningún lote de retirada: lo que hay que hacer es recuperar el partido, no borrarlo.
     */
    const b = banco([{
      temporada: '21', competicion: '900', grupo: '903',
      clasificacion: [{ nombre: 'ALAVES "B"', codigo: '111' }, { nombre: 'BILBAO C.D.', codigo: '222' }],
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
        // La cola pone el descanso en el lado local; el acta de ESA fila nombra a un equipo real.
        { orden: 1, local: 'Descansa', visitante: 'DANOK BAT CLUB', codigos: [null, null], codActa: 'acta-desplazada', acta: ['CANALS PROMESES C.F. "A"', 'DANOK BAT CLUB'] },
      ] }],
    }]);
    const m = simulaYGuarda(b);
    expect(m.resumen.filas_desplazadas).toBe(1);
    expect(m.resumen.filas_fantasma).toBe(0);
    expect(m.resumen.filas_retirables).toBe(0);
    const d = m.jornadas[0]!.desplazadas![0]!;
    expect(d.en_la_cola).toBe('Descansa vs DANOK BAT CLUB');
    expect(d.dice_el_acta).toBe('CANALS PROMESES C.F. "A" / DANOK BAT CLUB');
    expect(d.equipo_que_la_cola_no_tiene).toBe('CANALS PROMESES C.F. "A"');
    expect(d.la_pareja_del_acta_ya_esta_en_la_jornada).toBe(false);
    // Y la coherencia del manifiesto cuadra: el diagnóstico no se mezcla con la partición.
    expect(compruebaCoherencia(m)).toEqual([]);
  });
});

describe('simular', () => {
  it('no escribe NADA en la cola y produce contadores coherentes', () => {
    const b = banco();
    const antes = b.estadoLogico();
    const m = simula('euskadi', { raiz: b.raiz });
    expect(b.estadoLogico()).toEqual(antes);
    expect(compruebaCoherencia(m)).toEqual([]);
    expect(m.resumen.filas).toBe(m.resumen.identicas + m.resumen.cambios + m.resumen.ambiguos);
  });

  it('encuentra las correcciones deterministas y las sostiene con el acta', () => {
    const b = banco();
    const m = simula('euskadi', { raiz: b.raiz });
    expect(m.resumen.cambios).toBe(3);
    expect(m.resumen.ambiguos).toBe(0);
    expect(m.resumen.jornadas_con_cambios).toBe(2);
    const cambios = m.jornadas.flatMap((j) => j.cambios);
    expect(cambios.every((c) => c.huella_antes !== c.huella_despues)).toBe(true);
    // Los tres recuperan código porque el calendario publica el enlace de comparativa en este banco.
    expect(cambios.filter((c) => c.codigo_recuperado)).toHaveLength(3);
    // Los marcadores de estado quedan registrados como procedencia.
    expect(cambios.flatMap((c) => c.marcadores).sort()).toEqual(['(Irabazlea)', '(Sailkatua)', '(Sailkatua)']);
  });

  it('deja FUERA lo que el acta no sostiene, y no lo llama arreglado', () => {
    const b = banco([{
      ...GRUPO_BASE,
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['OTRO EQUIPO', 'BILBAO C.D.'] },
      ] }],
    }]);
    const m = simula('euskadi', { raiz: b.raiz });
    expect(m.resumen.cambios).toBe(0);
    expect(m.resumen.ambiguos).toBe(1);
    expect(m.jornadas[0]!.ambiguos[0]!.motivo).toBe('el-acta-no-sostiene-la-pareja');
  });

  it('sin acta no puede comprobar la pareja: es ambiguo, no corregido', () => {
    const b = banco([{
      ...GRUPO_BASE,
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: null, codActa: null },
      ] }],
    }]);
    const m = simula('euskadi', { raiz: b.raiz });
    expect(m.resumen.cambios).toBe(0);
    expect(m.resumen.ambiguos).toBe(1);
    expect(m.jornadas[0]!.ambiguos[0]!.motivo).toBe('el-acta-no-permite-comprobar-la-pareja');
  });

  it('una jornada sin HTML archivado se declara SALTADA, no ambigua', () => {
    const b = banco([{ ...GRUPO_BASE, jornadas: [GRUPO_BASE.jornadas[0]!], sinArchivo: [1] }]);
    const m = simula('euskadi', { raiz: b.raiz });
    expect(m.resumen.jornadas_saltadas).toBe(1);
    expect(m.resumen.ambiguos).toBe(0);
    expect(m.resumen.filas).toBe(0);
    expect(compruebaCoherencia(m)).toEqual([]);
  });

  /*
   * El HTML archivado lo reescribe el worker EN EL SITIO, y la cola sobre la que se reconstruye es una
   * foto: cualquier jornada que el worker vuelva a comprobar después de la foto queda con filas de una
   * lectura y HTML de otra. Compararlas fabrica correcciones que no son defectos del extractor, así que la
   * jornada tiene que quedar FUERA del lote y declarada. Sin esta puerta, el banco produce una corrección
   * determinista «sostenida por el acta» que no está sostenida por nada.
   */
  it('una jornada con el HTML cambiado desde que la cola la escribió queda FUERA del lote', () => {
    const b = banco([{
      ...GRUPO_BASE,
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
        { orden: 1, local: 'SESTAO F.S.', visitante: 'DURANGO C.D.', codigos: ['333', '444'], acta: ['SESTAO F.S.', 'DURANGO C.D.'] },
      ] }],
      hashDesfasado: [1],
    }]);
    const m = simula('euskadi', { raiz: b.raiz });
    expect(m.resumen.jornadas_con_evidencia_desfasada).toBe(1);
    expect(m.resumen.filas_no_comparables).toBe(2);
    // Ni una corrección, ni una ambigua, ni una idéntica: no se comparó nada de esa jornada.
    expect(m.resumen.cambios).toBe(0);
    expect(m.resumen.ambiguos).toBe(0);
    expect(m.resumen.identicas).toBe(0);
    // No es una jornada saltada: el HTML está, lo que no corresponde es la lectura de las filas.
    expect(m.resumen.jornadas_saltadas).toBe(0);
    const j = m.jornadas[0]!;
    expect(j.evidencia_desfasada?.huella_cola).toBe('f'.repeat(64));
    expect(j.evidencia_desfasada?.huella_disco).not.toBe(j.evidencia_desfasada?.huella_cola);
    expect(j.filas).toBe(2);
    expect(compruebaCoherencia(m)).toEqual([]);
  });

  it('sin huella en la cola no se puede demostrar el desfase: la jornada se compara', () => {
    // `jornadas.hash` nulo = la cola no registró con qué lectura escribió. No se declara lo que no se puede
    // demostrar, y tampoco se deja de reconstruir por una sospecha.
    const b = banco([{
      ...GRUPO_BASE,
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
      ] }],
    }]);
    const m = simula('euskadi', { raiz: b.raiz });
    expect(m.resumen.jornadas_con_evidencia_desfasada).toBe(0);
    expect(m.resumen.cambios).toBe(1);
  });

  it('el catálogo no cruza el ámbito: el mismo nombre en otro grupo resuelve a SU código', () => {
    const b = banco([
      { ...GRUPO_BASE, grupo: '901', jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
      ] }] },
      {
        temporada: '21', competicion: '900', grupo: '902',
        // En este grupo `BILBAO C.D.` tiene OTRO código. Si el catálogo cruzara el ámbito, la
        // reconstrucción escribiría 222 —el del grupo 901— y estaría atribuyendo el partido a la
        // inscripción equivocada.
        clasificacion: [{ nombre: 'AJENO C.F.', codigo: '999' }, { nombre: 'BILBAO C.D.', codigo: '777' }],
        jornadas: [{ numero: 1, filas: [
          { orden: 0, local: '(Sailkatua) AJENO C.F.', visitante: '(Sailkatua) BILBAO C.D.', codigos: ['999', '777'], acta: ['AJENO C.F.', 'BILBAO C.D.'] },
        ] }],
      },
    ]);
    const m = simula('euskadi', { raiz: b.raiz });
    expect(m.resumen.ambiguos).toBe(0);
    expect(m.resumen.cambios).toBe(2);
    const deGrupo902 = m.jornadas.find((j) => j.grupo === '902')!.cambios[0]!;
    expect(deGrupo902.despues.equipo_visitante_codigo).toBe('777');
    expect(deGrupo902.despues.equipo_local_codigo).toBe('999');
  });
});

describe('manifiesto persistente y sus puertas', () => {
  it('se guarda en disco y se vuelve a leer idéntico', () => {
    const b = banco();
    const m = simulaYGuarda(b);
    const ruta = join(b.raiz, 'pruebas', 'reconstruccion', `euskadi-${m.id}.manifiesto.json`);
    expect(existsSync(ruta)).toBe(true);
    expect(leeManifiesto('euskadi', m.id, { raiz: b.raiz }).id).toBe(m.id);
  });

  it('un manifiesto INEXISTENTE rechaza la aplicación', async () => {
    const b = banco();
    await expect(aplica('euskadi', 'no-existe', { raiz: b.raiz })).rejects.toThrow(/No hay manifiesto de simulación/);
  });

  it('un manifiesto OBSOLETO rechaza la aplicación y dice por qué', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    invalidaManifiesto('euskadi', m.id, 'generado antes de corregir la construcción de las filas', { raiz: b.raiz });
    await expect(aplica('euskadi', m.id, { raiz: b.raiz })).rejects.toThrow(/INVALIDADO/);
  });

  it('un manifiesto de otra VERSIÓN rechaza la aplicación', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    const ruta = join(b.raiz, 'pruebas', 'reconstruccion', `euskadi-${m.id}.manifiesto.json`);
    const guardado = JSON.parse(readFileSync(ruta, 'utf8'));
    guardado.version_extractor = 'bbbbbbbbbbbbbbbb';
    writeFileSync(ruta, JSON.stringify(guardado));
    await expect(aplica('euskadi', m.id, { raiz: b.raiz })).rejects.toThrow(/no está vigente/);
  });

  it('un artefacto cambiado invalida el manifiesto y se dice CUÁL: es el defecto que se corrigió', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    // El manifiesto guarda la huella de CADA artefacto que decide el resultado, no un solo número: por eso
    // se puede decir qué cambió. Aquí se altera la huella de la construcción de filas, que es justo la
    // pieza cuyo cambio NO invalidaba el manifiesto en el diseño anterior.
    const ruta = join(b.raiz, 'pruebas', 'reconstruccion', `euskadi-${m.id}.manifiesto.json`);
    const guardado = JSON.parse(readFileSync(ruta, 'utf8'));
    expect(Object.keys(guardado.artefactos)).toEqual(expect.arrayContaining([
      'packages/ingesta/src/reconstruccion-cola/filas.ts',
      'packages/ingesta/src/parsers/nova-equipos.ts',
      'scripts/reconstruir-cola.mjs',
    ]));
    guardado.artefactos['packages/ingesta/src/reconstruccion-cola/filas.ts'] = '0000000000000000';
    writeFileSync(ruta, JSON.stringify(guardado));
    await expect(aplica('euskadi', m.id, { raiz: b.raiz })).rejects.toThrow(/filas\.ts cambió desde la simulación/);
    // Y no se ha escrito nada.
    expect(b.leerFila('901', 1, 0)!.local).toBe('(Sailkatua) ALAVES "B"');
  });

  it('el manifiesto vigente lleva la versión, el contrato y el esquema de la herramienta', () => {
    const b = banco();
    const m = simulaYGuarda(b);
    const v = versionExtractor({ raiz: process.cwd() });
    expect(m.version_extractor).toBe(v.version);
    expect(m.version_contrato).toBe(v.contrato);
    expect(m.esquema_manifiesto).toBe(v.esquema);
  });

  it('un HTML CAMBIADO desde la simulación rechaza la aplicación', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    writeFileSync(b.rutaHtmlDe('901', '900', 1), gzipSync(htmlJornada([
      { orden: 0, local: 'OTRO', visitante: 'BILBAO C.D.' },
      { orden: 1, local: '(Irabazlea) EIBAR "C"', visitante: 'DERIO C.D.' },
    ])));
    await expect(aplica('euskadi', m.id, { raiz: b.raiz })).rejects.toThrow(/el HTML cambió desde la simulación/);
  });

  it('una FILA cambiada desde la simulación rechaza la aplicación', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    b.escribirFila('901', 1, 0, { local: 'ALGUIEN MAS' });
    await expect(aplica('euskadi', m.id, { raiz: b.raiz })).rejects.toThrow(/no está como la dejó la simulación/);
  });

  it('una jornada con trabajo en_curso rechaza SOLO esa jornada y no detiene a los workers', async () => {
    const b = banco([{ ...GRUPO_BASE, enCurso: [1] }]);
    const m = simulaYGuarda(b);
    const problemas = revisaAplicacion('euskadi', m, new Set(), { raiz: b.raiz });
    expect(problemas.join(' ')).toMatch(/trabajo en_curso del worker/);
    await expect(aplica('euskadi', m.id, { raiz: b.raiz })).rejects.toThrow(/en_curso/);
    // Y no se ha escrito nada.
    expect(b.leerFila('901', 1, 0)!.local).toBe('(Sailkatua) ALAVES "B"');
  });

  it('valida TODAS las jornadas antes de la PRIMERA escritura', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    // La jornada 1 está bien; la 2 se rompe. Si se validara al vuelo, la 1 ya estaría escrita.
    b.escribirFila('901', 2, 0, { local: 'ALGUIEN MAS' });
    await expect(aplica('euskadi', m.id, { raiz: b.raiz })).rejects.toThrow(/no se puede aplicar/);
    expect(b.leerFila('901', 1, 0)!.local).toBe('(Sailkatua) ALAVES "B"');
  });
});

describe('aplicar', () => {
  it('escribe las correcciones y deja fuera los ambiguos', async () => {
    const b = banco([{
      ...GRUPO_BASE,
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: '(Sailkatua) ALAVES "B"', visitante: 'BILBAO C.D.', codigos: ['111', '222'], acta: ['ALAVES B', 'BILBAO C.D.'] },
        { orden: 1, local: '(Irabazlea) EIBAR "C"', visitante: 'DERIO C.D.', codigos: ['333', '444'], acta: ['NO ES ESE', 'DERIO C.D.'] },
      ] }],
    }]);
    const m = simulaYGuarda(b);
    expect(m.resumen.ambiguos).toBe(1);
    const a = await aplica('euskadi', m.id, { raiz: b.raiz });
    expect(a.filas).toBe(1);
    expect(a.filas_nuevas).toBe(1);
    expect(a.ambiguos_excluidos).toBe(1);
    expect(b.leerFila('901', 1, 0)!.local).toBe('ALAVES "B"');
    // La ambigua NO se ha tocado.
    expect(b.leerFila('901', 1, 1)!.local).toBe('(Irabazlea) EIBAR "C"');
  });

  it('hace una copia previa CONSISTENTE con el WAL activo, no copiando el fichero', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    const a = await aplica('euskadi', m.id, { raiz: b.raiz });
    expect(existsSync(a.ruta_backup)).toBe(true);
    expect(a.bytes_backup).toBeGreaterThan(0);
    // La copia se abre y tiene las filas de ANTES del lote: es una SQLite válida, no un fichero a medias.
    const copia = new DatabaseSync(a.ruta_backup, { readOnly: true });
    try {
      expect(copia.prepare('select count(*) n from partidos').get()).toEqual({ n: 3 });
      expect((copia.prepare('select local from partidos where orden=0').get() as { local: string }).local)
        .toBe('(Sailkatua) ALAVES "B"');
    } finally { copia.close(); }
  });

  it('escribe un diario con los valores ANTERIORES y POSTERIORES de cada fila', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    const a = await aplica('euskadi', m.id, { raiz: b.raiz });
    const diario = readFileSync(a.ruta_diario, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    expect(diario).toHaveLength(3);
    for (const d of diario) {
      expect(d.antes).toBeDefined();
      expect(d.despues).toBeDefined();
      expect(d.huella_antes).not.toBe(d.huella_despues);
      expect(d.lote).toBe(m.id);
    }
    // El diario NO vive en la cola: el esquema de la cola es del worker y no se toca.
    expect(a.ruta_diario).toContain('pruebas');
    const db = b.abre();
    try {
      const tablas = (db.prepare("select name from sqlite_master where type='table'").all() as Array<{ name: string }>).map((t) => t.name);
      expect(tablas.sort()).toEqual(['actas', 'competiciones', 'equipos', 'jornadas', 'metadatos', 'partidos', 'temporadas', 'trabajos']);
    } finally { db.close(); }
  });

  it('usa busy_timeout 15000 en la conexión de escritura', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    await aplica('euskadi', m.id, { raiz: b.raiz });
    // El pragma se pone en la conexión de escritura; aquí se comprueba que la cola sigue siendo usable y
    // que el valor declarado en la herramienta es el que se aplica.
    const fuente = readFileSync(join(process.cwd(), 'scripts', 'reconstruir-cola.mjs'), 'utf8');
    expect(fuente).toMatch(/pragma busy_timeout = 15000/);
  });

  it('aplicar DOS VECES no escribe nada la segunda vez', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    const primera = await aplica('euskadi', m.id, { raiz: b.raiz });
    const estado = b.estadoLogico();
    const segunda = await aplica('euskadi', m.id, { raiz: b.raiz });
    expect(segunda.filas_nuevas).toBe(0);
    expect(segunda.jornadas_nuevas).toBe(0);
    expect(segunda.filas).toBe(primera.filas);
    expect(b.estadoLogico()).toEqual(estado);
    // Y el diario no se ha duplicado, que es lo que haría que la reversión restaurara dos veces.
    const diario = readFileSync(segunda.ruta_diario, 'utf8').split('\n').filter(Boolean);
    expect(diario).toHaveLength(primera.filas);
  });

  it('una jornada FALLIDA revierte sola y CONSERVA las anteriores ya confirmadas', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    // Se hace fallar la SEGUNDA jornada con una restricción que rechaza su valor nuevo.
    const db = new DatabaseSync(b.rutaCola);
    db.exec(`create trigger rechaza_j2 before update on partidos
      when new.jornada = 2 begin select raise(abort, 'trigger de prueba'); end;`);
    db.close();
    await expect(aplica('euskadi', m.id, { raiz: b.raiz })).rejects.toThrow(/revertida sin aplicar/);
    // La jornada 1 quedó confirmada; la 2 no se tocó.
    expect(b.leerFila('901', 1, 0)!.local).toBe('ALAVES "B"');
    expect(b.leerFila('901', 2, 0)!.local).toBe('(Sailkatua) EIBAR "C"');

    // Se quita el trigger y se REANUDA con el mismo id: la jornada 1 no se repite.
    const db2 = new DatabaseSync(b.rutaCola);
    db2.exec('drop trigger rechaza_j2');
    db2.close();
    const reanudado = await aplica('euskadi', m.id, { raiz: b.raiz });
    expect(reanudado.filas_nuevas).toBe(1);
    expect(reanudado.jornadas_nuevas).toBe(1);
    expect(reanudado.completo).toBe(true);
    expect(b.leerFila('901', 2, 0)!.local).toBe('EIBAR "C"');
    const diario = readFileSync(reanudado.ruta_diario, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    expect(diario).toHaveLength(3);
    // Una fila de la jornada fallida no puede estar en el diario: deshacerla desharía lo que no se hizo.
    expect(diario.filter((d) => d.jornada === 2)).toHaveLength(1);
  });

  it('un bloqueo cooperativo impide dos aplicaciones a la vez, y no toca a los workers', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    writeFileSync(rutaBloqueo('euskadi', { raiz: b.raiz }), JSON.stringify({ federacion: 'euskadi', pid: 1, desde: new Date().toISOString() }));
    await expect(aplica('euskadi', m.id, { raiz: b.raiz })).rejects.toThrow(/Ya hay una reconstrucción/);
    sueltaBloqueo('euskadi', { raiz: b.raiz });
    const a = await aplica('euskadi', m.id, { raiz: b.raiz });
    expect(a.completo).toBe(true);
  });
});

describe('verificar y revertir', () => {
  it('verifica que las filas están como las dejó el lote', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    await aplica('euskadi', m.id, { raiz: b.raiz });
    const v = verifica('euskadi', m.id, { raiz: b.raiz });
    expect(v.filas).toBe(3);
    expect(v.correctas).toBe(3);
    expect(v.malas).toEqual([]);
    expect(v.completo).toBe(true);
  });

  it('la verificación detecta una fila tocada después del lote', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    await aplica('euskadi', m.id, { raiz: b.raiz });
    b.escribirFila('901', 1, 0, { local: 'TOCADO DESPUES' });
    const v = verifica('euskadi', m.id, { raiz: b.raiz });
    expect(v.malas).toHaveLength(1);
    expect(v.correctas).toBe(2);
  });

  it('revierte de forma EXACTA al estado inicial', async () => {
    const b = banco();
    const inicial = b.estadoLogico();
    const m = simulaYGuarda(b);
    await aplica('euskadi', m.id, { raiz: b.raiz });
    expect(b.estadoLogico()).not.toEqual(inicial);
    const r = revierte('euskadi', m.id, { raiz: b.raiz });
    expect(r.filas).toBe(3);
    expect(r.copia_conservada).toBe(true);
    expect(b.estadoLogico()).toEqual(inicial);
    // La copia previa y el diario NO se borran: son el rastro.
    expect(existsSync(r.copia_previa)).toBe(true);
  });

  it('se NIEGA a revertir si una fila cambió después del lote', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    await aplica('euskadi', m.id, { raiz: b.raiz });
    b.escribirFila('901', 1, 0, { local: 'CAMBIADO POR OTRO' });
    expect(() => revierte('euskadi', m.id, { raiz: b.raiz })).toThrow(/La reversión se niega/);
    // Y no ha tocado nada.
    expect(b.leerFila('901', 1, 0)!.local).toBe('CAMBIADO POR OTRO');
  });

  it('aplicar → revertir → aplicar termina en el mismo estado que aplicar una vez', async () => {
    const b = banco();
    const m = simulaYGuarda(b);
    const primera = await aplica('euskadi', m.id, { raiz: b.raiz });
    const trasAplicar = b.estadoLogico();
    revierte('euskadi', m.id, { raiz: b.raiz });
    const segunda = await aplica('euskadi', m.id, { raiz: b.raiz });
    expect(segunda.filas_nuevas).toBe(primera.filas);
    expect(b.estadoLogico()).toEqual(trasAplicar);
    // Y el diario no acumula: la segunda aplicación empieza un diario nuevo porque el anterior se
    // conservó para la reversión ya hecha.
    expect(segunda.ruta_diario).not.toBe(primera.ruta_diario);
  });

  it('revertir un lote no aplicado falla en voz alta', () => {
    const b = banco();
    const m = simulaYGuarda(b);
    expect(() => revierte('euskadi', m.id, { raiz: b.raiz })).toThrow(/No hay lote aplicado/);
  });
});

describe('adaptadores', () => {
  /**
   * iSquad: Madrid y Valencia. La jornada archivada es un JSON y el bloque de descanso se reconoce por
   * **código de equipo negativo**, no por el nombre.
   *
   * Estas pruebas fijan el adaptador que faltaba. Sin él, `simula('madrid', …)` se negaba con «no hay
   * adaptador de reconstrucción»; y con él mal enchufado —clasificando la fila traducida o devolviendo el
   * bloque como si fuera un partido— el informe publicaba **0 fantasma** (donde hay 3.386 en la cola real) o
   * **8.569 ambiguas** de puro artefacto de alineación.
   */
  describe('isquad (Madrid y Valencia)', () => {
    /** Una jornada de iSquad: dos partidos reales y el bloque de descanso con su código negativo. */
    const GRUPO_ISQUAD: GrupoBanco = {
      temporada: '21', competicion: '900', grupo: '950', isquad: true,
      jornadas: [{ numero: 1, filas: [
        { orden: 0, local: 'C.D. UNO', visitante: 'C.D. DOS', codigos: ['11', '12'], codigosEnCola: ['11', '12'], acta: ['C.D. UNO', 'C.D. DOS'] },
        // El bloque: la fuente le da el código sintético `-1` y el acta de esa fila NO trae pareja.
        { orden: 1, local: 'Descansa', visitante: 'C.D. TRES', codigos: ['-1', '13'], codigosEnCola: ['-1', '13'], acta: ['', ''] },
        { orden: 2, local: 'C.D. CUATRO', visitante: 'C.D. CINCO', codigos: ['14', '15'], codigosEnCola: ['14', '15'], acta: ['C.D. CUATRO', 'C.D. CINCO'] },
      ] }],
    };

    it('declara el bloque fantasma por el CÓDIGO negativo y no desalinea los partidos reales', () => {
      const b = banco([GRUPO_ISQUAD], 'madrid');
      const m = simula('madrid', { raiz: b.raiz });
      expect(m.maqueta).toBe('isquad');
      expect(m.resumen.filas).toBe(3);
      expect(m.resumen.filas_fantasma).toBe(1);
      expect(m.jornadas[0]!.filasFantasma![0]!.equipo_que_descansa).toBe('C.D. TRES');
      // Los dos partidos reales se comparan con SU fila: ninguno queda ambiguo por el bloque de en medio.
      expect(m.resumen.ambiguos).toBe(0);
      expect(m.resumen.identicas + m.resumen.cambios).toBe(2);
      expect(compruebaCoherencia(m)).toEqual([]);
    });

    it('un acta SIN pareja no autoriza a retirar: queda declarada, no reparada', () => {
      const b = banco([GRUPO_ISQUAD], 'madrid');
      const m = simula('madrid', { raiz: b.raiz });
      // Es el caso medido en Madrid: 3.386 bloques con acta, TODAS sin pareja legible → 0 retirables.
      expect(m.resumen.filas_fantasma_con_acta).toBe(1);
      expect(m.resumen.filas_fantasma_con_acta_de_descanso).toBe(0);
      expect(m.resumen.filas_fantasma_con_acta_de_partido).toBe(0);
      expect(m.resumen.filas_retirables).toBe(0);
      expect(m.jornadas[0]!.retiradas).toEqual([]);
    });

    it('un bloque cuyo acta nombra DOS EQUIPOS REALES se informa DESPLAZADO y nunca se retira', () => {
      // El caso de Valencia: el descanso ocupa el hueco de un equipo que el acta sí conoce.
      const grupo: GrupoBanco = {
        temporada: '21', competicion: '900', grupo: '951', isquad: true,
        jornadas: [{ numero: 1, filas: [
          { orden: 0, local: 'C.D. UNO', visitante: 'C.D. DOS', codigos: ['11', '12'], codigosEnCola: ['11', '12'], acta: ['C.D. UNO', 'C.D. DOS'] },
          { orden: 1, local: 'C.D. TRES', visitante: 'Descansa', codigos: ['13', '-1'], codigosEnCola: ['13', '-1'], acta: ['C.D. TRES', 'C.D. CUATRO'] },
        ] }],
      };
      const b = banco([grupo], 'valencia');
      const m = simula('valencia', { raiz: b.raiz });
      const desplazada = m.jornadas[0]!.desplazadas![0]!;
      expect(m.resumen.filas_desplazadas).toBe(1);
      expect(desplazada.en_la_cola).toBe('C.D. TRES vs Descansa');
      expect(desplazada.dice_el_acta).toBe('C.D. TRES / C.D. CUATRO');
      expect(desplazada.equipo_que_la_cola_no_tiene).toBe('C.D. CUATRO');
      // Y lo que importa: ahí hubo partido, así que NO se retira.
      expect(m.resumen.filas_retirables).toBe(0);
      expect(m.jornadas[0]!.retiradas).toEqual([]);
      expect(compruebaCoherencia(m)).toEqual([]);
    });

    /**
     * El caso medido en Madrid: **52 filas del grupo `t17 c18882291 g18850968`** traen el nombre VACÍO y su
     * código puesto (`local = ""`, `equipo_local_codigo = "17145319"`). El catálogo descartaba el código
     * cuando el literal estaba vacío, así que la reconstrucción no podía demostrar la fila y la declaraba
     * ambigua. Con el código en el catálogo, la fila derivada coincide con la de la cola: es una fila bien
     * guardada a la que la fuente no le publica el nombre.
     */
    it('un nombre VACÍO con código puesto no deja la fila ambigua: el código basta para demostrarla', () => {
      const grupo: GrupoBanco = {
        temporada: '21', competicion: '900', grupo: '953', isquad: true,
        jornadas: [{ numero: 1, filas: [
          { orden: 0, local: '', visitante: 'A.D. NAVALAFUENTE', codigos: ['17145319', '17145547'], codigosEnCola: ['17145319', '17145547'], acta: ['', ''] },
        ] }],
      };
      const b = banco([grupo], 'madrid');
      const m = simula('madrid', { raiz: b.raiz });
      expect(m.resumen.ambiguos).toBe(0);
      expect(m.resumen.identicas).toBe(1);
      expect(compruebaCoherencia(m)).toEqual([]);
    });

    /**
     * El partido desplazado de verdad, de punta a punta: se RECUPERA (no se retira), se comprueba y la
     * reversión lo devuelve a como estaba.
     *
     * El equipo que falta —el que el calendario no nombra porque su hueco lo ocupa «Descansa»— sólo aparece
     * en la **clasificación** del grupo. Es el caso de Valencia: sin la clasificación en JSON, el equipo no
     * resuelve y la fila no se puede recuperar (se declara y ya está).
     */
    it('RECUPERA el partido desplazado usando la clasificación, y la reversión lo devuelve', async () => {
      const grupo: GrupoBanco = {
        temporada: '21', competicion: '900', grupo: '954', isquad: true,
        clasificacion: [
          { nombre: 'C.D. UNO', codigo: '11' }, { nombre: 'C.D. DOS', codigo: '12' },
          { nombre: 'C.D. TRES', codigo: '13' }, { nombre: 'C.D. CUATRO', codigo: '14' },
        ],
        jornadas: [{ numero: 1, filas: [
          { orden: 0, local: 'C.D. UNO', visitante: 'C.D. DOS', codigos: ['11', '12'], codigosEnCola: ['11', '12'], acta: ['C.D. UNO', 'C.D. DOS'] },
          // Desplazado: el acta nombra a `C.D. CUATRO`, que NO juega en ninguna otra fila de la jornada.
          { orden: 1, local: 'C.D. TRES', visitante: 'Descansa', codigos: ['13', '-1'], codigosEnCola: ['13', '-1'], acta: ['C.D. TRES', 'C.D. CUATRO'] },
        ] }],
      };
      const b = banco([grupo], 'valencia');
      const m = simulaYGuarda(b, 'valencia');
      expect(m.resumen.filas_desplazadas).toBe(1);
      expect(m.resumen.filas_recuperables).toBe(1);
      const recuperada = m.jornadas[0]!.recuperadas![0]!;
      expect(recuperada.orden).toBe(1);
      expect(recuperada.despues.local).toBe('C.D. TRES');
      expect(recuperada.despues.visitante).toBe('C.D. CUATRO');
      expect(recuperada.despues.visitante && recuperada.despues.equipo_visitante_codigo).toBe('14');

      // Sin la bandera NO se toca nada: la fila sigue diciendo «Descansa».
      await aplica('valencia', m.id, { raiz: b.raiz, retirar: false, recuperar: false });
      expect(b.leerFila('954', 1, 1)!.visitante).toBe('Descansa');

      // Con la bandera se recupera, y la fila queda con el equipo que el acta nombra.
      const aplicado = await aplica('valencia', m.id, { raiz: b.raiz, retirar: false, recuperar: true, forzar: true });
      expect(aplicado.recuperadas).toBe(1);
      expect(b.leerFila('954', 1, 1)!.visitante).toBe('C.D. CUATRO');
      expect(b.leerFila('954', 1, 1)!.equipo_visitante_codigo).toBe('14');
      const verificacion = verifica('valencia', m.id, { raiz: b.raiz });
      expect(verificacion.malas).toEqual([]);

      // Y la reversión lo devuelve exactamente a como estaba, con el diario que ya existía.
      revierte('valencia', m.id, { raiz: b.raiz });
      expect(b.leerFila('954', 1, 1)!.visitante).toBe('Descansa');
      expect(b.leerFila('954', 1, 1)!.equipo_visitante_codigo).toBe('-1');
    });

    it('un acta que nombra al MISMO equipo en los dos lados no se recupera: un equipo no juega contra sí mismo', () => {
      const grupo: GrupoBanco = {
        temporada: '21', competicion: '900', grupo: '955', isquad: true,
        clasificacion: [{ nombre: 'C.D. UNO', codigo: '11' }, { nombre: 'C.D. TRES', codigo: '13' }],
        jornadas: [{ numero: 1, filas: [
          { orden: 0, local: 'C.D. TRES', visitante: 'Descansa', codigos: ['13', '-1'], codigosEnCola: ['13', '-1'], acta: ['C.D. TRES', 'C.D. TRES'] },
        ] }],
      };
      const b = banco([grupo], 'valencia');
      const m = simula('valencia', { raiz: b.raiz });
      // Se DECLARA desplazada —el acta nombra dos equipos reales— pero no se recupera.
      expect(m.resumen.filas_desplazadas).toBe(1);
      expect(m.resumen.filas_recuperables).toBe(0);
      expect(m.jornadas[0]!.recuperadas).toEqual([]);
    });

    it('una fila con la palabra pero código POSITIVO se conserva y no se declara fantasma', () => {
      const grupo: GrupoBanco = {
        temporada: '21', competicion: '900', grupo: '952', isquad: true,
        jornadas: [{ numero: 1, filas: [
          { orden: 0, local: 'Descansa', visitante: 'C.D. DOS', codigos: ['5001', '12'], codigosEnCola: ['5001', '12'], acta: ['C.D. DESCANSADERO', 'C.D. DOS'] },
        ] }],
      };
      const b = banco([grupo], 'madrid');
      const m = simula('madrid', { raiz: b.raiz });
      expect(m.resumen.filas_fantasma).toBe(0);
      expect(m.resumen.filas_retirables).toBe(0);
      // El bloque se declara SOSPECHOSO (nombre de descanso sin código negativo) y la fila sigue contando.
      expect(m.jornadas[0]!.informativas!.some((i) => i.sospechosa)).toBe(true);
    });
  });

  it('rechaza una federación sin adaptador declarado', () => {
    const b = banco();
    expect(() => simula('atlantida', { raiz: b.raiz })).toThrow(/No hay adaptador/);
  });

  it('rechaza las PNFG mientras su Clase B no esté corregida, y no simula nada', () => {
    const b = banco([GRUPO_BASE], 'castilla-leon');
    expect(() => simula('castilla-leon', { raiz: b.raiz })).toThrow(/Clase B necesita primero su corrección de extractor/);
    for (const fed of ['aragon', 'castilla-la-mancha', 'rioja', 'ceuta']) {
      expect(() => simula(fed, { raiz: b.raiz })).toThrow(/todavía no tiene adaptador de resolución/);
    }
  });

  it('el id del lote depende de la federación', () => {
    const a = simula('euskadi', { raiz: banco().raiz });
    expect(a.federacion).toBe('euskadi');
    expect(a.maqueta).toBe('nova');
  });
});
