import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it } from 'vitest';

import { LISTADO_DE_GRUPOS } from '../src/consultas/catalogo';
import { GRUPOS_DEL_SELECTOR, type FilaGrupoSelector } from '../src/consultas/catalogo-selector';
import { cierraCanonico, consulta, motivoSinCanonico } from '../src/consultas/adaptadores/postgres/conexion';
import { FiltrosSelector } from '../src/componentes/catalogo/FiltrosSelector';
import Competiciones from '../src/app/competiciones/page';
import { agrupaFacetas } from '../src/lib/presentacion-canonico';
import { PROVINCIAS_CYL } from '../src/lib/provincias-cyl';
import {
  chipsDeFiltros, leeFiltrosSelector, opcionesDeSelector, tieneFiltrosSelector, urlDeSelector,
} from '../src/lib/selector-competiciones';

/**
 * Fase C: el filtro de provincia es MÚLTIPLE y con las etiquetas canónicas.
 *
 * Hay grupos interprovinciales («Primera - Burgos - Valladolid»), así que quien busca por provincia
 * necesita marcar varias. Lo que se defiende aquí:
 *
 *  · el estado es una lista (`provincias: string[]`), la URL es coherente con él (`prov` repetido o
 *    separado por comas) y las URLs viejas de una sola provincia siguen funcionando;
 *  · cada provincia elegida se puede quitar por separado (un chip por provincia);
 *  · las etiquetas que se ven son las canónicas de `PROVINCIAS_CYL` («Ávila», «León»…), aunque el dato
 *    venga como «Avila» o «Leon»: las tildes del desplegable las ven los coordinadores;
 *  · el SQL acepta un array y compara sin tildes, y el nombre del grupo casa con cualquiera de las
 *    provincias elegidas (la segunda vía que ya existía para una sola).
 */

const TEMPORADAS = ['2026-27', '2025-26', '2016-17'];

describe('el filtro de provincia es múltiple', () => {
  it('lee una lista de la URL con la forma repetida (`prov` varias veces)', () => {
    const r = leeFiltrosSelector({ prov: ['Burgos', 'Valladolid'] }, TEMPORADAS);
    expect(r.filtros.provincias).toEqual(['Burgos', 'Valladolid']);
    expect(tieneFiltrosSelector(r.filtros)).toBe(true);
  });

  it('acepta también la forma separada por comas', () => {
    const r = leeFiltrosSelector({ prov: 'Burgos,Valladolid' }, TEMPORADAS);
    expect(r.filtros.provincias).toEqual(['Burgos', 'Valladolid']);
  });

  it('una URL vieja de una sola provincia sigue funcionando', () => {
    expect(leeFiltrosSelector({ prov: 'Burgos' }, TEMPORADAS).filtros.provincias).toEqual(['Burgos']);
    // Y sin tilde: el dato puede venir como «Leon» o «León» y la URL vieja traía cualquiera de las dos.
    expect(leeFiltrosSelector({ prov: 'Leon' }, TEMPORADAS).filtros.provincias).toEqual(['León']);
    expect(leeFiltrosSelector({ prov: 'LEON' }, TEMPORADAS).filtros.provincias).toEqual(['León']);
    expect(leeFiltrosSelector({ prov: 'Ávila' }, TEMPORADAS).filtros.provincias).toEqual(['Ávila']);
  });

  it('normaliza, deduplica y ordena con la lista canónica, no con el orden de la URL', () => {
    const r = leeFiltrosSelector({ prov: ['Valladolid', 'leon', 'Valladolid', 'Burgos'] }, TEMPORADAS);
    expect(r.filtros.provincias).toEqual(['Burgos', 'León', 'Valladolid']);
  });

  it('una provincia que no es de CyL no crea un filtro que no se puede cumplir', () => {
    const r = leeFiltrosSelector({ prov: ['Madrid', 'Burgos'] }, TEMPORADAS);
    expect(r.filtros.provincias).toEqual(['Burgos']);
    expect(leeFiltrosSelector({ prov: 'Madrid' }, TEMPORADAS).filtros.provincias).toEqual([]);
    expect(tieneFiltrosSelector(leeFiltrosSelector({}, TEMPORADAS).filtros)).toBe(false);
  });

  it('escribe la URL con `prov` repetido y la vuelve a leer igual', () => {
    const filtros = {
      federacion: 'castilla-leon', temporada: null, categoria: null, modalidad: null, genero: null,
      provincias: ['Burgos', 'Valladolid'], nivel: null, texto: null, desplazamiento: 0,
    };
    const url = urlDeSelector(filtros);
    const parametros = new URL(url, 'http://local').searchParams;
    expect(parametros.getAll('prov')).toEqual(['Burgos', 'Valladolid']);
    expect(urlDeSelector(filtros)).toBe(url);
    expect(leeFiltrosSelector({ prov: parametros.getAll('prov') }, TEMPORADAS).filtros.provincias)
      .toEqual(['Burgos', 'Valladolid']);
  });

  it('los filtros activos se enseñan con un chip por provincia y cada uno quita sólo la suya', () => {
    const estado = leeFiltrosSelector({ prov: ['Burgos', 'Valladolid'] }, TEMPORADAS);
    const chips = chipsDeFiltros(estado, opcionesDeSelector([]));
    const deProvincia = chips.filter((chip) => chip.clave.startsWith('provincia:'));
    expect(deProvincia.map((chip) => chip.texto)).toEqual(['Burgos', 'Valladolid']);
    expect(new Set(deProvincia.map((chip) => chip.clave)).size).toBe(2);
    for (const chip of deProvincia) {
      const quitadas = new URL(chip.url, 'http://local').searchParams.getAll('prov');
      expect(quitadas).toHaveLength(1);
      expect(quitadas[0]).not.toBe(chip.texto);
    }
  });
});

describe('las etiquetas se enseñan canónicas, con sus tildes', () => {
  it('el selector ofrece las nueve provincias con su nombre canónico', () => {
    const provincias = opcionesDeSelector([]).provincias.map((opcion) => opcion.valor);
    expect(provincias).toEqual([...PROVINCIAS_CYL]);
    expect(provincias).toContain('Ávila');
    expect(provincias).toContain('León');
  });

  it('el catálogo ofrece las nueve aunque el dato llegue sin tildes o en mayúsculas', () => {
    const facetas = agrupaFacetas([
      { dimension: 'provincia', valor: 'Leon', orden: null },
      { dimension: 'provincia', valor: 'ÁVILA', orden: null },
      { dimension: 'provincia', valor: 'MADRID', orden: null },
    ]);
    expect(facetas.provincias.map((faceta) => faceta.valor)).toEqual([...PROVINCIAS_CYL]);
    expect(facetas.provincias.map((faceta) => faceta.etiqueta)).toEqual([...PROVINCIAS_CYL]);
  });

  it('la etiqueta canónica sustituye a la del dato también si el dato no está entre las nueve', () => {
    const facetas = agrupaFacetas([{ dimension: 'provincia', valor: 'Avila', orden: null }]);
    expect(facetas.provincias.map((faceta) => faceta.etiqueta)).toEqual([...PROVINCIAS_CYL]);
  });
});

describe('contrato estático del SQL de provincias', () => {
  it('las dos consultas reciben un array de provincias, no un valor suelto', () => {
    expect(GRUPOS_DEL_SELECTOR.sql).toContain('any($6::text[])');
    expect(GRUPOS_DEL_SELECTOR.sql).toContain('unnest($6::text[])');
    expect(LISTADO_DE_GRUPOS.sql).toContain('any($8::text[])');
    // La comparación no distingue tildes: se normalizan los dos lados.
    expect(GRUPOS_DEL_SELECTOR.sql).toContain('core.normaliza_nombre');
    expect(LISTADO_DE_GRUPOS.sql).toContain('core.normaliza_nombre');
  });
});

describe('la UI de provincia marca varias', () => {
  /** Las casillas de provincia de un HTML, con su valor, sin depender del orden de sus atributos. */
  const casillas = (html: string, nombre: 'prov' | 'provincia') => [...html.matchAll(/<input[^>]*>/g)]
    .map((coincidencia) => coincidencia[0])
    .filter((etiqueta) => etiqueta.includes('type="checkbox"') && etiqueta.includes(`name="${nombre}"`))
    .map((etiqueta) => /value="([^"]+)"/.exec(etiqueta)?.[1] ?? '');
  const estaMarcada = (html: string, provincia: string) => [...html.matchAll(/<input[^>]*>/g)]
    .map((coincidencia) => coincidencia[0])
    .some((etiqueta) => etiqueta.includes(`value="${provincia}"`) && /\schecked/.test(etiqueta));

  it('el selector pinta una casilla por cada una de las nueve, con las elegidas marcadas', () => {
    const estado = leeFiltrosSelector({ prov: ['Burgos', 'León'] }, TEMPORADAS);
    const html = renderToStaticMarkup(createElement(FiltrosSelector, {
      estado, opciones: opcionesDeSelector([]),
    }));
    expect(casillas(html, 'prov')).toEqual([...PROVINCIAS_CYL]);
    for (const provincia of ['Burgos', 'León']) {
      expect(estaMarcada(html, provincia), `${provincia} marcada`).toBe(true);
    }
    expect(estaMarcada(html, 'Ávila')).toBe(false);
    expect(html).not.toContain('value="Madrid"');
  });

  it('las provincias elegidas se pueden quitar de una en una: un chip por provincia', () => {
    const estado = leeFiltrosSelector({ prov: ['Burgos', 'León'] }, TEMPORADAS);
    const chips = chipsDeFiltros(estado, opcionesDeSelector([]));
    expect(chips.filter((chip) => chip.clave.startsWith('provincia:')).map((chip) => chip.texto))
      .toEqual(['Burgos', 'León']);
  });
});

const motivo = motivoSinCanonico();
const hayCanonico = motivo === null;
afterAll(async () => { await cierraCanonico(); });

describe.skipIf(!hayCanonico)('contra el canónico real', () => {
  /** Parámetros de `GRUPOS_DEL_SELECTOR`: fed, temp, cat, mod, gen, provincias, nivel, tokens, límite, offset. */
  const grupos = (provincias: string[], temporada: string | null = '2026-27') =>
    consulta<FilaGrupoSelector>(GRUPOS_DEL_SELECTOR.sql,
      ['castilla-leon', temporada, null, null, null, provincias, null, [], 200, 0]);
  const identificadores = (filas: readonly FilaGrupoSelector[]) => new Set(filas.map((fila) => Number(fila.grupo_id)));

  it('el grupo interprovincial «Primera - Burgos - Valladolid» aparece con cada provincia y con las dos', async () => {
    const CREADO = 75145;
    const burgos = await grupos(['Burgos']);
    const valladolid = await grupos(['Valladolid']);
    const ambas = await grupos(['Burgos', 'Valladolid']);
    expect(identificadores(burgos).has(CREADO), 'con Burgos solo').toBe(true);
    expect(identificadores(valladolid).has(CREADO), 'con Valladolid solo').toBe(true);
    expect(identificadores(ambas).has(CREADO), 'con las dos').toBe(true);
    // Elegir dos provincias es la UNIÓN de elegir una: no se pierde lo que traía cada una.
    for (const id of identificadores(burgos)) expect(identificadores(ambas).has(id)).toBe(true);
    for (const id of identificadores(valladolid)) expect(identificadores(ambas).has(id)).toBe(true);
  });

  it('el filtro compara sin tildes: «Leon» y «León» devuelven los mismos grupos', async () => {
    const conTilde = await grupos(['León'], null);
    const sinTilde = await grupos(['Leon'], null);
    expect(conTilde.length).toBeGreaterThan(0);
    expect(identificadores(sinTilde)).toEqual(identificadores(conTilde));
  });

  it('el catálogo acepta varias provincias y devuelve la unión de las ediciones de cada una', async () => {
    const catalogo = (provincias: string[]) => consulta<{ federacion: string; grupo_codigo: string; provincia: string | null }>(
      LISTADO_DE_GRUPOS.sql, [null, null, null, null, null, null, null, provincias, null, '', false, 200, 0]);
    const burgos = await catalogo(['Burgos']);
    const segovia = await catalogo(['Segovia']);
    const ambas = await catalogo(['Burgos', 'Segovia']);
    expect(burgos.length).toBeGreaterThan(0);
    expect(segovia.length).toBeGreaterThan(0);
    for (const fila of ambas) expect(['Burgos', 'Segovia']).toContain(String(fila.provincia));
    const claves = new Set(ambas.map((fila) => `${fila.federacion}|${fila.grupo_codigo}`));
    for (const fila of [...burgos, ...segovia]) expect(claves.has(`${fila.federacion}|${fila.grupo_codigo}`)).toBe(true);
  });

  it('la página del catálogo pinta las nueve casillas y deja marcadas las que vienen de la URL', async () => {
    const html = renderToStaticMarkup(await Competiciones({
      searchParams: Promise.resolve({ provincia: ['Burgos', 'Valladolid'] }),
    }));
    const etiquetas = [...html.matchAll(/<input[^>]*>/g)].map((coincidencia) => coincidencia[0]);
    const deProvincia = etiquetas.filter((etiqueta) =>
      etiqueta.includes('type="checkbox"') && etiqueta.includes('name="provincia"'));
    expect(deProvincia.map((etiqueta) => /value="([^"]+)"/.exec(etiqueta)?.[1] ?? ''))
      .toEqual([...PROVINCIAS_CYL]);
    for (const elegida of ['Burgos', 'Valladolid']) {
      expect(etiquetas.some((etiqueta) =>
        etiqueta.includes(`value="${elegida}"`) && /\schecked/.test(etiqueta)),
      `${elegida} marcada`).toBe(true);
    }
    expect(html).not.toContain('value="Madrid"');
  });
});
