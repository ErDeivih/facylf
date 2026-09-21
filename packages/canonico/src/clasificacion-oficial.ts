/**
 * Clasificación OFICIAL: la que publica la federación, con sus sanciones y sus ajustes.
 *
 * Este módulo NO lee ficheros: elige entre los dos lectores y escribe el resultado en el canónico.
 *
 * - `parseaClasificacionHtml` de `@facylf/ingesta` lee la maqueta PNFG (`clasificacion.html[.gz]`);
 * - `clasificacion-oficial-json.ts` lee la maqueta propia de Cataluña, Madrid y Valencia
 *   (`clasificacion.json`).
 *
 * Medido el 15/09/2026: Cataluña es la única federación donde coexisten los dos archivos (282 de 283
 * grupos) y en los 282 el parser PNFG lee 0 filas; Madrid y Valencia **sólo** tienen JSON. Cuando las
 * dos fuentes producen filas se comparan y, si difieren, **no se elige ninguna**: se detiene el lote.
 *
 * Nada se pide a la web de la federación: los archivos archivados son la evidencia de ingesta.
 *
 * Y una cosa que se comprobó con datos reales antes de escribir esto: **la tabla oficial y la
 * reconstruida desde el calendario NO siempre coinciden**. En el grupo de Tercera Federación de
 * Castilla y León 2024-25, Atlético Tordesillas aparece con 72 puntos en la oficial y con 69 en la
 * reconstruida. Cuando eso pasa, no se elige en silencio: se guardan las dos, la web enseña la oficial
 * y la diferencia queda registrada en `ops.normalizacion_error` para poder mirarla.
 *
 * La oficial **nunca** se sobrescribe con la reconstruida: viven en filas distintas de
 * `core.standing_snapshot`, separadas por `origen` (`oficial` / `reconstruida`), y ese `origen` forma
 * parte de la clave primaria.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseaClasificacionHtml, type ClasificacionOficialHtml } from '@facylf/ingesta';
import type { ClienteCanonico } from './destino/pool.js';
import type { Repositorio } from './destino/repositorio.js';
import {
  TablaOficialInvalida, comparaTablasOficiales, leeClasificacionJson, leeTexto, nombreDeClub, rutaClasificacionJson,
} from './clasificacion-oficial-json.js';

export type DiferenciaClasificacion = { equipo: string; oficial: number; reconstruida: number };

/** De dónde salió la tabla oficial que se ha escrito. Nunca se deduce: se declara. */
export type FuenteOficial = 'pnfg-html' | 'json';

export type ResumenOficial = {
  ruta: string;
  fuente: FuenteOficial;
  filas: number;
  /** ¿Se ha podido contrastar con la reconstruida? Falso a mitad de temporada, por fechas distintas. */
  comparada: boolean;
  /** Filas cuya puntuación no coincide con la reconstruida. Se registran, no se esconden. */
  diferencias: DiferenciaClasificacion[];
  /** Equipos de la tabla oficial que no se han podido resolver a una inscripción del canónico. */
  sinResolver: number;
  /** Filas resueltas por nombre de club, sin la letra de equipo: la fuente publica «A» donde la cola dice «B». */
  resueltasPorClub: number;
  /** Equipos cuya puntuación publicada está por debajo de la que dan sus resultados: ajuste de la federación. */
  ajustes: Array<{ equipo: string; publicado: number; deResultados: number; sancion: number }>;
  /** Fichero de la otra maqueta que también estaba archivado, si lo había. */
  rutaAlternativa: string | null;
  /**
   * `true` sólo cuando las DOS maquetas produjeron filas y se comprobó que dicen lo mismo.
   *
   * No es lo mismo que «la otra estaba archivada»: en Cataluña los 282 grupos tienen las dos, y el
   * parser PNFG no lee ni una fila del HTML. Decir que coinciden sin haberlas comparado sería
   * exactamente el tipo de afirmación que este proyecto no se permite.
   */
  cotejadaConLaOtra: boolean;
};

/** Catálogo de equipos del grupo, para resolver la tabla oficial contra SUS inscripciones. */
export type CatalogoEquipos = {
  /** Código externo de la fuente → inscripción. */
  porCodigo: Map<string, number>;
  /** Nombre publicado NORMALIZADO (mismo `core.normaliza_nombre` que usa la base) → inscripción. */
  porNombre: Map<string, number>;
  /** Nombre de club sin la letra de equipo → inscripción, sólo cuando es inequívoco. */
  porClub: Map<string, number>;
};

export type ViaResolucion = 'codigo' | 'nombre' | 'club';

/**
 * Resuelve un equipo publicado a una inscripción DEL GRUPO.
 *
 * Tres vías, en este orden, y la tercera necesita justificación porque a primera vista parece un
 * parecido:
 *
 * 1. **código federativo** cuando la fuente lo trae (Madrid y Valencia): es identidad fuerte dentro de
 *    su federación y su ámbito.
 * 2. **literal exacto** normalizado.
 * 3. **nombre de club sin la letra final**. No es un parecido: en el grupo 54322933 la tabla oficial
 *    publica «ARGENTONA, C.F. A» donde el calendario dice «ARGENTONA, C.F. B», y **las 16 filas
 *    coinciden exactamente** con la clasificación reconstruida (mismo registro y mismos puntos) bajo
 *    esa correspondencia, que además es biyectiva dentro del grupo (cada club aparece una sola vez en
 *    cada lado). El mapa `porClub` ya llega sin los clubes ambiguos: si un club tiene dos equipos en
 *    el mismo grupo, su nombre no está ahí y la fila queda sin resolver.
 */
export function resuelveEquipoOficial(
  fila: { equipo: string; equipoCodigo: string | null },
  catalogo: CatalogoEquipos,
  normaliza: (texto: string) => string,
): { teamEntryId: number; via: ViaResolucion } | null {
  if (fila.equipoCodigo !== null) {
    const porCodigo = catalogo.porCodigo.get(String(fila.equipoCodigo));
    if (porCodigo !== undefined) return { teamEntryId: porCodigo, via: 'codigo' };
  }
  // `normaliza` tiene que devolver el nombre normalizado de verdad, incluidas las formas que sólo
  // existen en la tabla oficial: el catálogo se indexa así. Si devolviera el literal crudo (porque el
  // nombre no estuviera ya en la caché), ninguna fila casaría y el lote se detendría en falso.
  const norm = normaliza(fila.equipo);
  const porNombre = catalogo.porNombre.get(norm);
  if (porNombre !== undefined) return { teamEntryId: porNombre, via: 'nombre' };
  const porClub = catalogo.porClub.get(nombreDeClub(norm));
  if (porClub !== undefined) return { teamEntryId: porClub, via: 'club' };
  return null;
}

/** Ruta del HTML de clasificación archivado para un grupo, tal y como la escribe el recolector. */
export function rutaClasificacionOficial(
  raizCola: string, temporada: { codigo: string; etiqueta: string }, competicion: string, grupo: string,
): string | null {
  const carpeta = join(raizCola, `t${temporada.codigo}-${temporada.etiqueta}`, `comp-${competicion}`, `grupo-${grupo}`);
  for (const nombre of ['clasificacion.html.gz', 'clasificacion.html']) {
    const ruta = join(carpeta, nombre);
    if (existsSync(ruta)) return ruta;
  }
  return null;
}

export async function importaClasificacionOficial(
  cliente: ClienteCanonico,
  repo: Repositorio,
  datos: {
    raizCola: string;
    temporada: { codigo: string; etiqueta: string };
    competicion: string;
    grupo: string;
    batchId: number;
    federacion: string;
    phaseGroupId: number;
    matchdayId: number | null;
    catalogo: CatalogoEquipos;
    /**
     * Normalizador del lote (`core.normaliza_nombre`, cacheado). Se pide en lote porque los literales de
     * la tabla oficial no tienen por qué haber aparecido antes: en el grupo 54322933 la tabla publica
     * «ARGENTONA, C.F. A» y el calendario dice «ARGENTONA, C.F. B».
     */
    normalizaVarios: (textos: string[]) => Promise<Map<string, string>>;
    /** Puntos de la reconstruida por inscripción, para contrastar. */
    reconstruida: Map<number, number>;
    /**
     * ¿Se puede contrastar? Sólo cuando la temporada está terminada. A mitad de temporada la tabla
     * oficial es una foto de otra fecha (la federación la publica más adelantada que nuestra última
     * jornada completa), así que las diferencias no significarían nada: se importa la oficial y se
     * dice que no se compara.
     */
    comparar: boolean;
  },
): Promise<ResumenOficial | null> {
  const contexto = `${datos.federacion} c${datos.competicion} g${datos.grupo}`;
  const rutaHtml = rutaClasificacionOficial(datos.raizCola, datos.temporada, datos.competicion, datos.grupo);
  const rutaJson = rutaClasificacionJson(datos.raizCola, datos.temporada, datos.competicion, datos.grupo);

  // Sin ninguna maqueta archivada no hay nada que importar. No es un error: hay federaciones que
  // todavía no publican la tabla, y algunas la publican sólo al final de la temporada.
  if (!rutaHtml && !rutaJson) return null;

  // Las dos fuentes se leen SIEMPRE que existan, aunque el HTML ya dé filas: es lo que permite
  // compararlas (requisito 9) en vez de elegir la primera que responda sin mirar la otra.
  const deHtml: ClasificacionOficialHtml[] = rutaHtml ? parseaClasificacionHtml(leeTexto(rutaHtml)) : [];
  let deJson: ClasificacionOficialHtml[] = [];
  if (rutaJson) {
    // Un JSON que no pasa las validaciones detiene el lote: no se escribe media tabla oficial y no se
    // convierte ningún valor raro (puntos fraccionarios, posiciones 0, columnas de puntos vacías).
    deJson = leeClasificacionJson(leeTexto(rutaJson), `${contexto} · ${rutaJson}`);
  }

  if (deHtml.length === 0 && deJson.length === 0) {
    // Ninguna de las dos publica filas: puede ser una tabla aún sin publicar o un array vacío —576 de
    // los 1.595 ficheros del corpus lo están—. No se escribe nada y no se inventa.
    return null;
  }

  let cotejada = false;
  if (deHtml.length > 0 && deJson.length > 0) {
    const diferencia = comparaTablasOficiales(deHtml, deJson);
    if (diferencia !== null) {
      throw new TablaOficialInvalida(
        'la misma tabla oficial se lee distinta en el HTML y en el JSON',
        `${contexto}: ${diferencia}. No se elige ninguna de las dos.`,
      );
    }
    cotejada = true;
  }

  const filas = deHtml.length > 0 ? deHtml : deJson;
  const fuente: FuenteOficial = deHtml.length > 0 ? 'pnfg-html' : 'json';
  const ruta = (fuente === 'pnfg-html' ? rutaHtml : rutaJson)!;
  const rutaAlternativa = fuente === 'pnfg-html' ? rutaJson : rutaHtml;

  /* --- resolución contra el catálogo DEL GRUPO ---
     Va ANTES de comprobar la jornada de corte a propósito: que la tabla no se pueda anclar es un
     problema de este canónico, y que la tabla sea ilegible o traiga equipos de otro grupo es un
     problema de la fuente. Lo segundo tiene que salir siempre, aunque lo primero impida escribir. */
  // Los literales de la tabla oficial se normalizan con la MISMA función que la base antes de buscar:
  // son formas que pueden no haber aparecido nunca en el calendario.
  const normalizadosOficiales = await datos.normalizaVarios(filas.map((f) => f.equipo));
  const normalizaOficial = (texto: string): string => normalizadosOficiales.get(texto) ?? texto;
  const resueltas = filas.map((fila) => resuelveEquipoOficial(fila, datos.catalogo, normalizaOficial));
  const sinResolver = resueltas.filter((r) => r === null).length;
  if (sinResolver > 0) {
    // Media tabla oficial no sirve para nada y además engañaría. Y no se resuelve por parecido: se
    // detiene el lote con los nombres exactos que no han casado.
    const nombres = filas.filter((_, i) => resueltas[i] === null).map((f) => `«${f.equipo}»`).slice(0, 8).join(', ');
    throw new TablaOficialInvalida(
      'la tabla oficial trae equipos que no se pueden resolver dentro de su propio grupo',
      `${contexto}: ${sinResolver} de ${filas.length} sin resolver (${nombres}). Fuente ${fuente}: ${ruta}`,
    );
  }
  const entradas = resueltas.map((r) => r!.teamEntryId);
  const resueltasPorClub = resueltas.filter((r) => r!.via === 'club').length;

  // Un mismo equipo dos veces en la tabla oficial es una tabla rota, aunque los nombres difieran.
  const duplicadas = entradas.filter((id, i) => entradas.indexOf(id) !== i);
  if (duplicadas.length > 0) {
    throw new TablaOficialInvalida(
      'dos filas de la tabla oficial apuntan al mismo equipo del grupo',
      `${contexto}: ${duplicadas.length} repeticiones · fuente ${fuente}: ${ruta}`,
    );
  }

  // La tabla oficial necesita una jornada del canónico a la que colgarse: es la última jornada
  // COMPLETA reconstruida, o sea una fecha que hemos verificado. Sin ella no se escribe nada, en vez
  // de colgarla de una jornada cualquiera y hacer pasar por «la tabla de J30» la foto de otro día.
  if (datos.matchdayId === null) {
    await registraAviso(cliente, datos.batchId, 'clasificacion_oficial_sin_jornada_de_corte', {
      federacion: datos.federacion, grupo: datos.grupo, fuente, ruta,
      filas: filas.length,
      motivo: 'la fuente publica tabla oficial pero el canónico no tiene ninguna jornada completa que sirva de corte',
    });
    return null;
  }

  /* --- diferencias y ajustes --- */
  const diferencias: DiferenciaClasificacion[] = [];
  const ajustes: ResumenOficial['ajustes'] = [];
  for (let i = 0; i < filas.length; i += 1) {
    const fila = filas[i]!;
    const deSusResultados = 3 * fila.ganados + fila.empatados;
    if (fila.puntos < deSusResultados) {
      // Un ajuste de la federación (sanción o corrección). Se guarda el valor PUBLICADO y se registra:
      // nunca se «arregla» sumando resultados ni se resta en silencio.
      ajustes.push({ equipo: fila.equipo, publicado: fila.puntos, deResultados: deSusResultados, sancion: fila.sancion });
      await registraAviso(cliente, datos.batchId, 'clasificacion_oficial_con_ajuste', {
        federacion: datos.federacion, grupo: datos.grupo, ...ajustes.at(-1)!,
      });
    }
    const reconstruidos = datos.reconstruida.get(entradas[i]!);
    if (datos.comparar && reconstruidos !== undefined && reconstruidos !== fila.puntos) {
      diferencias.push({ equipo: fila.equipo, oficial: fila.puntos, reconstruida: reconstruidos });
    }
  }

  await repo.upsertMasivo(
    'core.standing_snapshot',
    filas.map((fila, i) => ({
      valores: {
        phase_group_id: datos.phaseGroupId,
        matchday_id: datos.matchdayId,
        team_entry_id: entradas[i]!,
        posicion: fila.posicion,
        puntos: fila.puntos,
        jugados: fila.jugados,
        ganados: fila.ganados,
        empatados: fila.empatados,
        perdidos: fila.perdidos,
        goles_favor: 0,
        goles_contra: 0,
        origen: 'oficial',
      },
      conflicto: ['phase_group_id', 'matchday_id', 'team_entry_id', 'origen'],
    })),
    // Sin columna `id`: la clave primaria es la tupla completa (igual que en la reconstruida).
    { devolver: 'phase_group_id' },
  );

  // La tabla oficial no publica goles a favor y en contra en la vista resumen que se archiva: se
  // guardan a 0 para que el `check` de no negativos pase, y la web no los enseña cuando el origen es
  // oficial. Inventarlos sumando el calendario sería mezclar las dos tablas.
  for (const diferencia of diferencias) {
    await registraAviso(cliente, datos.batchId, 'clasificacion_oficial_vs_reconstruida', {
      federacion: datos.federacion, grupo: datos.grupo, ...diferencia,
    });
  }

  // Que la tabla venga del JSON en vez del HTML no puede quedar en el aire: se declara en el lote.
  await registraAviso(cliente, datos.batchId, 'clasificacion_oficial_importada', {
    federacion: datos.federacion,
    temporada: datos.temporada.etiqueta,
    competicion: datos.competicion,
    grupo: datos.grupo,
    fuente,
    ruta,
    ruta_alternativa: rutaAlternativa,
    cotejada_con_la_otra: cotejada,
    otra_maqueta_con_filas: deHtml.length > 0 && fuente === 'json' ? deHtml.length : (deJson.length > 0 && fuente === 'pnfg-html' ? deJson.length : 0),
    filas: filas.length,
    resueltas_por_codigo: resueltas.filter((r) => r!.via === 'codigo').length,
    resueltas_por_nombre: resueltas.filter((r) => r!.via === 'nombre').length,
    resueltas_por_club: resueltasPorClub,
    jornada_de_corte: datos.matchdayId,
    comparada: datos.comparar,
    ajustes: ajustes.length,
  });

  return {
    ruta, fuente, filas: filas.length, comparada: datos.comparar, diferencias, sinResolver: 0,
    resueltasPorClub, ajustes, rutaAlternativa, cotejadaConLaOtra: cotejada,
  };
}

/** Aviso medible del lote en `ops.normalizacion_error`. Es lo que hace auditable lo que se decidió. */
async function registraAviso(
  cliente: ClienteCanonico, batchId: number, codigo: string, parametros: Record<string, unknown>,
): Promise<void> {
  await cliente.query(
    `insert into ops.normalizacion_error (batch_id, codigo, parametros) values ($1, $2, $3::jsonb)`,
    [batchId, codigo, JSON.stringify(parametros)],
  );
}
