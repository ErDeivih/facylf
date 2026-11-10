import { afterAll, describe, expect, it } from 'vitest';

import { FACETAS_DEL_CATALOGO, FEDERACIONES_DEL_CANONICO, PARAMETROS_CATALOGO } from '../src/consultas/catalogo';
import { OPCIONES_DEL_SELECTOR, type FilaOpcionSelector } from '../src/consultas/catalogo-selector';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { agrupaFacetas } from '../src/lib/presentacion-canonico';
import { opcionesDeSelector } from '../src/lib/selector-competiciones';
import { PROVINCIAS_CYL, esProvinciaDeCyl, normalizaProvincia } from '../src/lib/provincias-cyl';
import {
  FEDERACIONES_PUBLICADAS, SQL_FEDERACION_NO_EXCLUIDA, esFederacionVisible,
} from '../src/lib/federaciones-excluidas';

/**
 * Fase C: el producto es de Castilla y León y sólo de Castilla y León.
 *
 * Lo que se defiende aquí:
 *
 *  · las provincias que se ofrecen como filtro son **las nueve de CyL**, sin importar que el canónico
 *    (que hoy tiene 26 federaciones de toda España) traiga 48 provincias distintas;
 *  · la comparación no distingue tildes ni mayúsculas, porque el mismo dato llega como «León» y como
 *    «Leon» según la federación de origen;
 *  · un valor que no es una de las nueve **no se ofrece** y no rompe nada: ni una excepción, ni una
 *    opción vacía, ni una provincia de otra comunidad colada en el desplegable;
 *  · la publicación está limitada a `castilla-leon` en **un solo sitio** documentado.
 */

const LAS_NUEVE = ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'];

function filaProvincia(valor: string) {
  return { dimension: 'provincia', valor, etiqueta: valor, orden: null };
}

describe('las nueve provincias de Castilla y León', () => {
  it('la lista canónica son exactamente las nueve provincias, escritas como las escribe la federación', () => {
    expect(PROVINCIAS_CYL).toEqual(LAS_NUEVE);
  });

  it('reconoce las nueve con su nombre oficial', () => {
    for (const provincia of LAS_NUEVE) {
      expect(esProvinciaDeCyl(provincia), `${provincia} debería ser de CyL`).toBe(true);
    }
  });

  it('la comparación no distingue tildes ni mayúsculas: «Leon», «LEÓN» y «león» son la misma provincia', () => {
    expect(esProvinciaDeCyl('Leon')).toBe(true);
    expect(esProvinciaDeCyl('LEÓN')).toBe(true);
    expect(esProvinciaDeCyl('león')).toBe(true);
    expect(esProvinciaDeCyl('LEON')).toBe(true);
    expect(esProvinciaDeCyl('  León  ')).toBe(true);
    expect(esProvinciaDeCyl('ÁVILA')).toBe(true);
    expect(esProvinciaDeCyl('avila')).toBe(true);
  });

  it('una provincia de otra comunidad no es de CyL, aunque sea una provincia española de verdad', () => {
    for (const ajena of ['Madrid', 'Barcelona', 'Zaragoza', 'Valencia', 'Sevilla', 'A Coruña',
      'Pontevedra', 'Vizcaya', 'Las Palmas', 'Illes Balears']) {
      expect(esProvinciaDeCyl(ajena), `${ajena} no es de CyL`).toBe(false);
    }
  });

  it('una zona que no es provincia (El Bierzo) tampoco se ofrece como provincia', () => {
    expect(esProvinciaDeCyl('El Bierzo')).toBe(false);
    expect(esProvinciaDeCyl('bierzo')).toBe(false);
  });

  it('un valor vacío, nulo o ausente no es una provincia y no rompe la comparación', () => {
    expect(esProvinciaDeCyl('')).toBe(false);
    expect(esProvinciaDeCyl('   ')).toBe(false);
    expect(esProvinciaDeCyl(null)).toBe(false);
    expect(esProvinciaDeCyl(undefined)).toBe(false);
    expect(esProvinciaDeCyl('Provincia inventada del norte')).toBe(false);
  });

  it('normaliza a minúsculas sin tildes para poder comparar cualquier procedencia', () => {
    expect(normalizaProvincia('León')).toBe('leon');
    expect(normalizaProvincia('ÁVILA')).toBe('avila');
    expect(normalizaProvincia('  Soria  ')).toBe('soria');
    expect(normalizaProvincia('')).toBe('');
  });
});

describe('los filtros de provincia sólo ofrecen provincias de Castilla y León', () => {
  const filas = [
    filaProvincia('Burgos'),
    filaProvincia('León'),
    filaProvincia('Leon'),
    filaProvincia('Salamanca'),
    filaProvincia('Madrid'),
    filaProvincia('Barcelona'),
    filaProvincia('A Coruña'),
    filaProvincia('El Bierzo'),
    filaProvincia(''),
  ];

  it('el selector descarta las que no son de CyL aunque el canónico las traiga', () => {
    const opciones = opcionesDeSelector(filas);
    const valores = opciones.provincias.map((p) => p.valor);
    expect(valores).toContain('Burgos');
    expect(valores).toContain('León');
    // «Leon» es el mismo dato con otra escritura: si el canónico lo trae, se ofrece con su valor real
    // (el filtro del SQL compara el valor tal cual) y no se pierde la opción.
    expect(valores).toContain('Leon');
    expect(valores).not.toContain('Madrid');
    expect(valores).not.toContain('Barcelona');
    expect(valores).not.toContain('A Coruña');
    expect(valores).not.toContain('El Bierzo');
    expect(opciones.provincias.every((p) => esProvinciaDeCyl(p.valor))).toBe(true);
  });

  it('el catálogo de /competiciones descarta las que no son de CyL', () => {
    const facetas = agrupaFacetas(filas);
    const valores = facetas.provincias.map((p) => p.valor);
    expect(valores).toContain('Salamanca');
    expect(valores).not.toContain('Madrid');
    expect(valores).not.toContain('Barcelona');
    expect(valores).not.toContain('El Bierzo');
    expect(facetas.provincias.every((p) => esProvinciaDeCyl(p.valor))).toBe(true);
  });

  it('sin ninguna provincia de CyL no se inventa una opción: la lista queda vacía', () => {
    const soloAjenas = [filaProvincia('Madrid'), filaProvincia('Sevilla'), filaProvincia('Alicante')];
    expect(opcionesDeSelector(soloAjenas).provincias).toEqual([]);
    expect(agrupaFacetas(soloAjenas).provincias).toEqual([]);
  });
});

describe('la publicación está limitada a Castilla y León', () => {
  it('la lista de federaciones publicadas es sólo castilla-leon, en un único sitio', () => {
    expect(FEDERACIONES_PUBLICADAS).toEqual(['castilla-leon']);
  });

  it('el SQL que comparten las consultas del canónico no puede devolver otra federación', () => {
    // Las consultas no escriben la federación a mano: todas usan este fragmento. Si el fragmento no
    // limita a CyL, basta una consulta nueva (o una que se olvide del filtro) para enseñar otra
    // comunidad, que es justo lo que la fase C prohíbe.
    expect(SQL_FEDERACION_NO_EXCLUIDA).toContain("f.codigo = any(array['castilla-leon']::text[])");
    expect(SQL_FEDERACION_NO_EXCLUIDA).toContain("f.codigo not like 'pruebas%'");
    // La publicación es una constante del código, no una lista del entorno: aunque `FACYLF_EXCLUIR`
    // cambie (o no exista), la web no puede enseñar federaciones de fuera de CyL.
    for (const publicada of FEDERACIONES_PUBLICADAS) {
      expect(SQL_FEDERACION_NO_EXCLUIDA).toContain(`'${publicada}'`);
    }
  });

  it('una federación se enseña si está publicada y no la excluye la flota', () => {
    expect(esFederacionVisible('castilla-leon')).toBe(true);
    expect(esFederacionVisible('madrid')).toBe(false);
    expect(esFederacionVisible('galicia')).toBe(false);
    expect(esFederacionVisible('')).toBe(false);
    expect(esFederacionVisible(null)).toBe(false);
  });
});

/**
 * La comprobación que de verdad importa: el canónico del PC no es de CyL, es de toda España. Estas
 * pruebas van contra la base real y se saltan si no está disponible (`skipIf`), como el resto de
 * contratos de la web.
 */
const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;
afterAll(async () => { await cierraCanonico(); });

describe.skipIf(!hayCanonico)('contra el canónico real, que tiene federaciones de toda España', () => {
  it('el selector no ofrece ninguna federación ni provincia de fuera de CyL', async () => {
    const filas = await consulta<FilaOpcionSelector>(OPCIONES_DEL_SELECTOR.sql, []);
    const opciones = opcionesDeSelector(filas);
    expect(opciones.federaciones.map((f) => f.valor)).toEqual(['castilla-leon']);
    expect(opciones.provincias.length).toBeGreaterThan(0);
    expect(opciones.provincias.every((p) => esProvinciaDeCyl(p.valor))).toBe(true);
  });

  it('las facetas del catálogo (que traen provincias de todo el canónico) se acotan a las nueve al pintarlas', async () => {
    const filas = await consulta<{ dimension: string; valor: string; orden: number | null }>(
      FACETAS_DEL_CATALOGO.sql, PARAMETROS_CATALOGO[FACETAS_DEL_CATALOGO.nombre] ?? []);
    const delCanonico = filas.filter((f) => f.dimension === 'provincia').map((f) => f.valor);
    const facetas = agrupaFacetas(filas);
    expect(facetas.provincias.length).toBeGreaterThan(0);
    expect(facetas.provincias.every((p) => esProvinciaDeCyl(p.valor))).toBe(true);
    expect(facetas.provincias.map((p) => p.valor)).toContain('Burgos');
    // Y se comprueba que el filtro hace algo: si el canónico no trajera provincias de fuera, esta prueba
    // no demostraría nada. Hoy trae 48 valores distintos (medido el 10/11/2026).
    expect(delCanonico.some((valor) => !esProvinciaDeCyl(valor))).toBe(true);
  });

  it('la lista de federaciones de las consultas sólo trae castilla-leon', async () => {
    const filas = await consulta<{ codigo: string }>(
      FEDERACIONES_DEL_CANONICO.sql, PARAMETROS_CATALOGO[FEDERACIONES_DEL_CANONICO.nombre]);
    expect(filas.map((f) => f.codigo)).toEqual(['castilla-leon']);
  });
});
