/**
 * Adaptador de `clasificacion.json`: validación y comparación.
 *
 * Los casos salen del corpus real medido el 15/09/2026 (1.595 ficheros, 11.677 filas en Cataluña,
 * Madrid y Valencia), no de ejemplos inventados: cada prueba de rechazo corresponde a una forma que
 * aparece de verdad y que no puede entrar en el canónico. Los ficheros usados aquí son reducciones de
 * los reales; se recortan las filas, no los valores.
 *
 * Importa especialmente el caso que NO se puede rechazar: `puntos` por debajo de `3·G + E` es un hecho
 * de la fuente (una sanción o un ajuste) y hay que guardarlo tal cual. En el grupo 54322935 el JSON
 * publica 40 puntos donde el registro da 41 y `sancion` es 0: rechazarlo habría dejado al grupo sin
 * tabla oficial, y «arreglarlo» habría inventado un resultado.
 */
import { describe, expect, it } from 'vitest';
import {
  TablaOficialInvalida, comparaTablasOficiales, leeClasificacionJson, nombreDeClub,
} from '../src/clasificacion-oficial-json.js';
import { resuelveEquipoOficial, type CatalogoEquipos } from '../src/clasificacion-oficial.js';

/** Fila del formato real, con los diez campos del vocabulario medido. */
const fila = (extra: Record<string, unknown> = {}) => ({
  posicion: 1,
  equipoCodigo: null,
  equipo: 'ARGENTONA, C.F. A',
  puntos: 58,
  jugados: 30,
  ganados: 17,
  empatados: 7,
  perdidos: 6,
  ultimos: ['P', 'G', 'G', 'G', 'G'],
  sancion: 0,
  ...extra,
});

const json = (filas: unknown[]) => JSON.stringify(filas);

describe('lectura del clasificacion.json', () => {
  it('lee las diez claves del vocabulario medido y devuelve la fila tal cual', () => {
    const [leida] = leeClasificacionJson(json([fila()]), 'pruebas');
    expect(leida).toEqual({
      posicion: 1, equipoCodigo: null, equipo: 'ARGENTONA, C.F. A', puntos: 58, jugados: 30,
      ganados: 17, empatados: 7, perdidos: 6, ultimos: ['P', 'G', 'G', 'G', 'G'], sancion: 0,
    });
  });

  it('convierte `equipoCodigo` a texto cuando la fuente lo publica (Madrid y Valencia lo traen)', () => {
    const [leida] = leeClasificacionJson(json([fila({ equipoCodigo: 10659963 })]), 'pruebas');
    expect(leida!.equipoCodigo).toBe('10659963');
  });

  it('un array vacío es «la fuente aún no publica tabla», no un error', () => {
    // 576 de los 1.595 ficheros del corpus están así.
    expect(leeClasificacionJson('[]', 'pruebas')).toEqual([]);
  });

  it('acepta una sanción declarada con puntos por debajo del registro', () => {
    const [leida] = leeClasificacionJson(json([fila({ puntos: 8, ganados: 3, empatados: 2, perdidos: 16, jugados: 21, sancion: 3 })]), 'pruebas');
    expect(leida!.puntos).toBe(8);
    expect(leida!.sancion).toBe(3);
  });

  it('acepta puntos negativos cuando la sanción declarada los explica', () => {
    // Medido: «C.F. FUENLABRADA S.A.D. \'A\'» publica −3 puntos con sanción 3 y 0-0-30.
    const [leida] = leeClasificacionJson(json([fila({ puntos: -3, ganados: 0, empatados: 0, perdidos: 30, jugados: 30, sancion: 3 })]), 'pruebas');
    expect(leida!.puntos).toBe(-3);
  });

  it('acepta un ajuste de la fuente que la columna `sancion` no declara', () => {
    // Medido en el grupo 54322935: el JSON publica 40 puntos y el registro da 41, con sanción 0.
    const [leida] = leeClasificacionJson(json([
      fila({ posicion: 1, equipo: 'ASCÓ, F.C. A', puntos: 40, ganados: 12, empatados: 5, perdidos: 13, sancion: 0 }),
    ]), 'pruebas');
    expect(leida!.puntos).toBe(40);
    expect(3 * leida!.ganados + leida!.empatados).toBe(41); // el ajuste se registra, no se corrige
  });

  it('R1: rechaza `posicion: 0`, que es lo que publican 212 ficheros de la temporada en curso', () => {
    expect(() => leeClasificacionJson(json([fila({ posicion: 0 })]), 'pruebas')).toThrow(TablaOficialInvalida);
    expect(() => leeClasificacionJson(json([fila({ posicion: 0 })]), 'pruebas')).toThrow(/R1/);
  });

  it('R1: rechaza una posición que retrocede', () => {
    const filas = [fila({ posicion: 1, equipo: 'UNO' }), fila({ posicion: 3, equipo: 'DOS' }), fila({ posicion: 2, equipo: 'TRES' })];
    expect(() => leeClasificacionJson(json(filas), 'pruebas')).toThrow(/R1/);
  });

  it('R1: acepta empates de posición, que la fuente publica de verdad (1,2,3,3,5)', () => {
    const filas = [
      fila({ posicion: 1, equipo: 'UNO' }), fila({ posicion: 2, equipo: 'DOS' }),
      fila({ posicion: 3, equipo: 'TRES' }), fila({ posicion: 3, equipo: 'CUATRO' }),
      fila({ posicion: 5, equipo: 'CINCO' }),
    ];
    expect(leeClasificacionJson(json(filas), 'pruebas')).toHaveLength(5);
  });

  it('R2: rechaza un equipo repetido y un equipo sin nombre', () => {
    expect(() => leeClasificacionJson(json([fila({ posicion: 1 }), fila({ posicion: 2 })]), 'pruebas')).toThrow(/R2/);
    expect(() => leeClasificacionJson(json([fila({ equipo: '   ' })]), 'pruebas')).toThrow(/R2/);
  });

  it('R3: rechaza que los jugados no sean ganados + empatados + perdidos', () => {
    // Se cumple en las 11.677 filas del corpus, así que un fallo aquí es un fichero roto.
    expect(() => leeClasificacionJson(json([fila({ jugados: 30, ganados: 17, empatados: 7, perdidos: 5 })]), 'pruebas')).toThrow(/R3/);
  });

  it('R4: rechaza puntos por encima de lo que dan los resultados', () => {
    expect(() => leeClasificacionJson(json([fila({ puntos: 999 })]), 'pruebas')).toThrow(/R4/);
  });

  it('R5: rechaza una tabla donde nadie tiene puntos habiendo victorias (31 ficheros del corpus)', () => {
    const filas = [
      fila({ posicion: 1, equipo: 'UNO', puntos: 0, ganados: 2, empatados: 1, perdidos: 1, jugados: 4 }),
      fila({ posicion: 2, equipo: 'DOS', puntos: 0, ganados: 1, empatados: 2, perdidos: 1, jugados: 4 }),
    ];
    expect(() => leeClasificacionJson(json(filas), 'pruebas')).toThrow(/R5/);
  });

  it('R5: NO rechaza una tabla de pretemporada, donde nadie tiene puntos ni resultados', () => {
    const filas = [
      fila({ posicion: 1, equipo: 'UNO', puntos: 0, ganados: 0, empatados: 0, perdidos: 0, jugados: 0 }),
      fila({ posicion: 2, equipo: 'DOS', puntos: 0, ganados: 0, empatados: 0, perdidos: 0, jugados: 0 }),
    ];
    expect(leeClasificacionJson(json(filas), 'pruebas')).toHaveLength(2);
  });

  it('R6: rechaza puntos negativos que ninguna sanción declarada explica', () => {
    expect(() => leeClasificacionJson(json([fila({ puntos: -5, sancion: 3 })]), 'pruebas')).toThrow(/R6/);
  });

  it('R7: rechaza los puntos fraccionarios que publican 5 ficheros (`puntos: 0.25`)', () => {
    // Redondear 0,25 sería inventar. Se detiene el lote y se mira la fuente.
    const malo = fila({ puntos: 0.25, ganados: 2, empatados: 1, perdidos: 1, jugados: 4 });
    expect(() => leeClasificacionJson(json([malo]), 'pruebas')).toThrow(/R7/);
  });

  it('rechaza un JSON ilegible o que no es una lista, con la evidencia en el mensaje', () => {
    expect(() => leeClasificacionJson('{no es json', 'cat c1 g2')).toThrow(/no es JSON válido/);
    expect(() => leeClasificacionJson('{"filas":[]}', 'pruebas')).toThrow(/no es una lista/);
    expect(() => leeClasificacionJson(json([null]), 'pruebas')).toThrow(/no es un objeto/);
  });

  it('el error lleva el contexto y los valores, para poder mirarlo sin reproducirlo', () => {
    try {
      leeClasificacionJson(json([fila({ puntos: 0.25 })]), 'cataluna c54322932 g54322933 · /ruta/clasificacion.json');
      expect.unreachable('debía lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(TablaOficialInvalida);
      const e = error as TablaOficialInvalida;
      expect(e.motivo).toMatch(/R7/);
      expect(e.detalle).toContain('cataluna c54322932 g54322933');
      expect(e.detalle).toContain('0.25');
      expect(e.detalle).toContain('ARGENTONA');
    }
  });
});

describe('nombre de club sin la letra de equipo', () => {
  it('quita un token final de una sola letra', () => {
    expect(nombreDeClub('argentona c f a')).toBe('argentona c f');
    expect(nombreDeClub('villareal cf b')).toBe('villareal cf');
    expect(nombreDeClub('sant jaume olot b c f a')).toBe('sant jaume olot b c f');
  });

  it('NO quita la última letra de una palabra', () => {
    // `CD TERUEL` acaba en `l`, pero no es una letra de equipo suelta: no se toca.
    expect(nombreDeClub('cd teruel')).toBe('cd teruel');
    expect(nombreDeClub('atletico madrileno')).toBe('atletico madrileno');
    expect(nombreDeClub('europa c e a')).toBe('europa c e');
  });
});

describe('resolución del equipo publicado', () => {
  const catalogo: CatalogoEquipos = {
    porCodigo: new Map([['10659963', 11]]),
    porNombre: new Map([['granollers e c a', 22]]),
    porClub: new Map([['argentona c f', 33]]),
  };
  const normaliza = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  it('resuelve por código federativo cuando la fuente lo trae', () => {
    expect(resuelveEquipoOficial({ equipo: 'LO QUE SEA', equipoCodigo: '10659963' }, catalogo, normaliza))
      .toEqual({ teamEntryId: 11, via: 'codigo' });
  });

  it('resuelve por literal exacto', () => {
    expect(resuelveEquipoOficial({ equipo: 'GRANOLLERS, E.C. A', equipoCodigo: null }, catalogo, normaliza))
      .toEqual({ teamEntryId: 22, via: 'nombre' });
  });

  it('resuelve por nombre de club cuando la fuente publica otra letra de equipo', () => {
    // 7 de las 16 filas del grupo 54322933 se resuelven así, y las 16 coinciden con la reconstruida.
    expect(resuelveEquipoOficial({ equipo: 'ARGENTONA, C.F. A', equipoCodigo: null }, catalogo, normaliza))
      .toEqual({ teamEntryId: 33, via: 'club' });
  });

  it('la letra de equipo da igual, pero el club no: no se resuelve por parecido', () => {
    // La regla del club ignora la letra final a propósito (la fuente publica «A» donde la cola dice
    // «B»), así que cualquier letra resuelve al mismo club…
    expect(resuelveEquipoOficial({ equipo: 'ARGENTONA, C.F. Z', equipoCodigo: null }, catalogo, normaliza))
      .toEqual({ teamEntryId: 33, via: 'club' });
    // …pero un club DISTINTO no resuelve, y una errata tampoco: no hay distancia de edición aquí.
    // (`ARGENTONA, C.F, A` sí resuelve: la normalización colapsa la puntuación, y eso es la misma
    // cadena, no una errata.)
    expect(resuelveEquipoOficial({ equipo: 'ARGENTONA DOS, C.F. A', equipoCodigo: null }, catalogo, normaliza)).toBeNull();
    expect(resuelveEquipoOficial({ equipo: 'ARGENTONAA, C.F. A', equipoCodigo: null }, catalogo, normaliza)).toBeNull();
    expect(resuelveEquipoOficial({ equipo: 'ARGENTONA', equipoCodigo: null }, catalogo, normaliza)).toBeNull();
    expect(resuelveEquipoOficial({ equipo: 'OTRO CLUB', equipoCodigo: '999' }, catalogo, normaliza)).toBeNull();
  });
});

describe('comparación de las dos maquetas del mismo grupo', () => {
  const base = leeClasificacionJson(json([
    fila({ posicion: 1, equipo: 'UNO' }), fila({ posicion: 2, equipo: 'DOS', puntos: 57, ganados: 17, empatados: 6, perdidos: 7 }),
  ]), 'pruebas');

  it('dice que coinciden cuando son iguales', () => {
    expect(comparaTablasOficiales(base, leeClasificacionJson(json([
      fila({ posicion: 1, equipo: 'UNO' }), fila({ posicion: 2, equipo: 'DOS', puntos: 57, ganados: 17, empatados: 6, perdidos: 7 }),
    ]), 'pruebas'))).toBeNull();
  });

  it('detecta una diferencia de puntos y la explica', () => {
    const otra = leeClasificacionJson(json([
      fila({ posicion: 1, equipo: 'UNO' }), fila({ posicion: 2, equipo: 'DOS', puntos: 60, ganados: 19, empatados: 3, perdidos: 8 }),
    ]), 'pruebas');
    expect(comparaTablasOficiales(base, otra)).toMatch(/«DOS»: puntos 57 en una y 60 en la otra/);
  });

  it('detecta que una trae filas que la otra no', () => {
    expect(comparaTablasOficiales(base, base.slice(0, 1))).toMatch(/2 filas y la otra 1/);
    const otra = leeClasificacionJson(json([
      fila({ posicion: 1, equipo: 'UNO' }), fila({ posicion: 2, equipo: 'TRES' }),
    ]), 'pruebas');
    expect(comparaTablasOficiales(base, otra)).toMatch(/sólo está en una de las dos/);
  });
});
