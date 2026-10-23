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
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cuentaTablasDeClasificacion, parseaClasificacionHtml, type ClasificacionOficialHtml } from '@facylf/ingesta';
import { esFilaDeDescanso } from './origen/cola.js';
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
  /**
   * Filas que NO estaban en el catálogo del grupo y se han resuelto por el CÓDIGO que la propia tabla publica,
   * creando la inscripción como hace el camino del calendario (v. `resuelvePorCodigoPublicado`).
   *
   * Y filas que no se han escrito porque no son un equipo sino el bloque de descanso de la fuente.
   */
  resueltasPorCodigoPublicado: number;
  filasDeDescanso: number;
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

export type ViaResolucion = 'codigo' | 'nombre' | 'club' | 'codigo-publicado';

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

/**
 * POR QUÉ NO ESTÁ LA TABLA OFICIAL DE UN GRUPO, dicho con el MISMO lector que la importa.
 *
 * Es la respuesta que necesita quien consulta: `ops.coverage_checkpoint.tabla_oficial_estado` guarda uno de
 * estos seis valores, y cada uno apunta a un sitio distinto (v. migración `0020`).
 *
 *   'importada'    · está en el canónico.
 *   'rechazada'    · se archivó y el validador la descarta (posiciones con huecos, puntos imposibles, valores
 *                    no enteros): es la federación la que la publica mal.
 *   'sin_archivar' · no hay archivo: la federación no la publica, o el recolector no la ha bajado.
 *   'sin_filas'    · hay archivo y no trae filas de clasificación.
 *   'ilegible'     · hay archivo, trae TABLA, y el lector de hoy no saca ni una fila: es un hueco NUESTRO.
 *   'sin_corte'    · se lee bien, pero no hay jornada completa a la que colgar la foto.
 *
 * El caso que obligó a separarlas: baleares, galicia y euskadi archivan la clasificación con otra maqueta
 * (`NFG_VisClasificacion` del marco «nova2») y `parseaClasificacionHtml` devuelve cero filas en las 448 de
 * baleares. Llamarlo «sin_archivar» era falso y «rechazada» también.
 */
export type EstadoTablaOficial =
  | 'importada' | 'rechazada' | 'sin_archivar' | 'sin_filas' | 'ilegible' | 'sin_corte';

/** Los estados que se pueden decidir MIRANDO EL ARCHIVO, sin importar nada. */
export type EstadoDelArchivo = 'rechazada' | 'sin_archivar' | 'sin_filas' | 'ilegible' | 'legible';

/**
 * La fecha del archivo (su `mtime`), la más reciente de las dos maquetas. `null` si no hay archivo.
 *
 * Es lo que permite distinguir «este archivo no lo he mirado» de «este archivo ya lo miré y no se puede
 * usar»: sin eso, el plan del importador volvía a pedir los mismos 1.394 grupos en cada pasada (medido el
 * 25/09/2026, v. migración 0021).
 */
export function mtimeDelArchivo(datos: {
  raizCola: string; temporada: { codigo: string; etiqueta: string }; competicion: string; grupo: string;
}): Date | null {
  const rutas = [
    rutaClasificacionOficial(datos.raizCola, datos.temporada, datos.competicion, datos.grupo),
    rutaClasificacionJson(datos.raizCola, datos.temporada, datos.competicion, datos.grupo),
  ].filter((r): r is string => r !== null);
  let ultima: Date | null = null;
  for (const ruta of rutas) {
    try {
      const suya = statSync(ruta).mtime;
      if (ultima === null || suya > ultima) ultima = suya;
    } catch { /* un archivo que desaparece entre la lista y el stat no invalida el resto */ }
  }
  return ultima;
}

export function diagnosticaTablaOficial(datos: {
  raizCola: string; temporada: { codigo: string; etiqueta: string }; competicion: string; grupo: string;
}): { estado: EstadoDelArchivo; filasHtml: number; filasJson: number; motivo: string } {
  const contexto = `c${datos.competicion} g${datos.grupo}`;
  const rutaHtml = rutaClasificacionOficial(datos.raizCola, datos.temporada, datos.competicion, datos.grupo);
  const rutaJson = rutaClasificacionJson(datos.raizCola, datos.temporada, datos.competicion, datos.grupo);
  if (rutaHtml === null && rutaJson === null) {
    return { estado: 'sin_archivar', filasHtml: 0, filasJson: 0, motivo: 'no hay clasificación archivada' };
  }
  let filasHtml = 0;
  let filasJson = 0;
  let textoHtml = '';
  if (rutaHtml !== null) {
    try {
      textoHtml = leeTexto(rutaHtml);
      filasHtml = parseaClasificacionHtml(textoHtml).length;
    } catch (error) {
      return { estado: 'ilegible', filasHtml: 0, filasJson: 0,
        motivo: `el lector de HTML lanza: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  if (rutaJson !== null) {
    try {
      filasJson = leeClasificacionJson(leeTexto(rutaJson), contexto).length;
    } catch (error) {
      // Un JSON que no pasa las validaciones es una tabla publicada mal, y se dice con su motivo.
      return { estado: 'rechazada', filasHtml, filasJson: 0,
        motivo: error instanceof Error ? error.message : String(error) };
    }
  }
  if (filasHtml > 0 || filasJson > 0) {
    return { estado: 'legible', filasHtml, filasJson, motivo: 'el archivo trae filas y se lee' };
  }
  /*
   * Ni una fila por ninguno de los dos lectores. Aquí está la diferencia que importa, y son TRES casos:
   *
   *   · el archivo NO trae ninguna tabla de clasificación (sólo resultados, o una página de otra vista): la
   *     federación aún no la publicaba, o el recolector guardó otra cosa. No hay nada que leer;
   *   · el archivo trae tabla y el lector de hoy no saca filas: el problema es del lector;
   *   · no hay HTML (sólo un JSON vacío): tampoco hay nada.
   *
   * Medido el 25/09/2026: contar «¿tiene alguna <table>?» no distinguía los dos primeros casos, porque la
   * tabla de RESULTADOS también es una `<table>`. Euskadi 2014-15 (comp 2837, grupo 513242) se contaba como
   * «el lector no la sabe leer» cuando el archivo no trae clasificación ninguna.
   */
  const traeTablaDeClasificacion = textoHtml !== '' && cuentaTablasDeClasificacion(textoHtml) > 0;
  return traeTablaDeClasificacion
    ? { estado: 'ilegible', filasHtml, filasJson, motivo: 'el archivo trae tabla de clasificación y el lector no saca filas' }
    : { estado: 'sin_filas', filasHtml, filasJson, motivo: 'el archivo no trae tabla de clasificación' };
}

export async function importaClasificacionOficial(  cliente: ClienteCanonico,
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
    /**
     * ── LA TABLA OFICIAL PUBLICA EL CÓDIGO DE SUS EQUIPOS: SE RESUELVE POR ÉL ─────────────────────────────
     *
     * Por qué existe esto. El catálogo del grupo se monta con los equipos que HAN JUGADO (las citas del
     * calendario y del acta), y la tabla oficial lista a TODOS los inscritos. Al principio de temporada —o en
     * un grupo donde alguien todavía no ha jugado— media tabla no está en el catálogo, y el resolutor
     * descartaba la tabla ENTERA: correcto (no se escribe media tabla), pero el dato se perdía. Medido el
     * 26/09/2026: **1.358 grupos** rechazados por esto, con 4.595 avisos, en quince federaciones (Madrid,
     * Valencia, Aragón y Cataluña son los que más).
     *
     * Y no hacía falta perderlo: cada fila trae el código federativo de su equipo —el JSON en `equipoCodigo`,
     * el HTML en el enlace `codequipo=`—, y un código federativo es identidad fuerte dentro de su federación y
     * su ámbito. Con él la inscripción se BUSCA O SE CREA igual que en el camino del calendario, en vez de
     * exigir que ya esté en el catálogo.
     *
     * Quien la implementa recibe la fila y devuelve la inscripción, o `null`. Se llama SÓLO cuando las tres
     * vías de `resuelveEquipoOficial` han fallado y la fila publica un código, así que no cambia nada de lo
     * que ya se resolvía: una fila sin código sigue descartando la tabla, como hasta hoy.
     */
    resuelvePorCodigoPublicado?: (fila: { equipo: string; equipoCodigo: string }) => Promise<number | null>;
    /** Puntos de la reconstruida por inscripción, para contrastar. */
    reconstruida: Map<number, number>;
    /**
     * ¿Se puede contrastar? Sólo cuando la temporada está terminada. A mitad de temporada la tabla
     * oficial es una foto de otra fecha (la federación la publica más adelantada que nuestra última
     * jornada completa), así que las diferencias no significarían nada: se importa la oficial y se
     * dice que no se compara.
     */
    comparar: boolean;
    /**
     * ── ¿LA JORNADA DE CORTE ESTÁ COMPLETA? (decisión del 27/09/2026, migración 0022) ─────────────────────
     *
     * Antes, sin jornada completa no se escribía NADA: colgar la foto de una jornada incompleta sería hacerla
     * pasar por «la tabla de J30» cuando es la de otro día. La negativa era razonable, pero se llevaba por
     * delante **1.404 grupos** con el archivo legible y los equipos resueltos.
     *
     * Desde ahora la tabla se escribe igual —anclada a la última jornada que exista— y lo que cambia es que
     * **la salvedad viaja con la foto**: el lote la guarda en `ops.coverage_checkpoint.tabla_oficial_corte_completo`
     * (lo ve el rol de lectura) y aquí se registra el aviso. Un dato sin su fecha se lee como si la tuviera.
     */
    corteCompleto: boolean;
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

  const filasPublicadas = deHtml.length > 0 ? deHtml : deJson;
  const fuente: FuenteOficial = deHtml.length > 0 ? 'pnfg-html' : 'json';
  const ruta = (fuente === 'pnfg-html' ? rutaHtml : rutaJson)!;
  const rutaAlternativa = fuente === 'pnfg-html' ? rutaJson : rutaHtml;

  /*
   * ── EL BLOQUE DE DESCANSO NO ES UN EQUIPO, Y LA TABLA OFICIAL LO PUBLICA COMO UNO MÁS ──────────────────
   *
   * La fuente da de alta un pseudo-equipo para la jornada de descanso y le asigna código: medido el
   * 26/09/2026 en el grupo 5199185 de Aragón, la tabla publica la fila «DESCANSA» con `codequipo=5199186` y 0
   * puntos. Reconocerlo no es un detalle de limpieza: con el resolutor por código (v.
   * `resuelvePorCodigoPublicado`) esa fila se resolvería como cualquier otra y crearía una INSCRIPCIÓN
   * FANTASMA con su fila en la tabla, que es exactamente lo que `retirada.ts` documenta haber tenido que
   * retirar después («un pseudo-equipo que era el bloque de descanso»). Se aparta ANTES de resolver, con la
   * MISMA regla que usa la cola para no meterlo en el catálogo de equipos del grupo
   * (`esFilaDeDescanso`, la palabra entera y declarada por la maqueta: `C.D. DESCANSO` es un club).
   *
   * Y se cuenta: la fila apartada se declara en el aviso de la importación, no desaparece en silencio.
   */
  const filasDeDescanso = filasPublicadas.filter((f) => esFilaDeDescanso(f.equipo));
  const filas = filasPublicadas.filter((f) => !esFilaDeDescanso(f.equipo));
  if (filas.length === 0) {
    await registraAviso(cliente, datos.batchId, 'clasificacion_oficial_solo_descansos', {
      federacion: datos.federacion, grupo: datos.grupo, fuente, ruta,
      filas_publicadas: filasPublicadas.length,
      motivo: 'la tabla archivada sólo trae el bloque de descanso: no hay clasificación que escribir',
    });
    return null;
  }

  /* --- resolución contra el catálogo DEL GRUPO ---
     Va ANTES de comprobar la jornada de corte a propósito: que la tabla no se pueda anclar es un
     problema de este canónico, y que la tabla sea ilegible o traiga equipos de otro grupo es un
     problema de la fuente. Lo segundo tiene que salir siempre, aunque lo primero impida escribir. */
  // Los literales de la tabla oficial se normalizan con la MISMA función que la base antes de buscar:
  // son formas que pueden no haber aparecido nunca en el calendario.
  const normalizadosOficiales = await datos.normalizaVarios(filas.map((f) => f.equipo));
  const normalizaOficial = (texto: string): string => normalizadosOficiales.get(texto) ?? texto;
  /*
   * La resolución va en orden de evidencia, y el último escalón es el código publicado: código del catálogo,
   * literal exacto, nombre de club sin la letra… y sólo si los tres fallan, la inscripción por el código que
   * publica la propia tabla. Se recorre fila a fila porque el último escalón es asíncrono.
   */
  const resueltas: Array<{ teamEntryId: number; via: ViaResolucion } | null> = [];
  for (const fila of filas) {
    const directa = resuelveEquipoOficial(fila, datos.catalogo, normalizaOficial);
    if (directa !== null) {
      resueltas.push(directa);
      continue;
    }
    const codigo = String(fila.equipoCodigo ?? '').trim();
    if (codigo === '' || datos.resuelvePorCodigoPublicado === undefined) {
      resueltas.push(null);
      continue;
    }
    const porCodigoPublicado = await datos.resuelvePorCodigoPublicado({ equipo: fila.equipo, equipoCodigo: codigo });
    resueltas.push(porCodigoPublicado === null ? null : { teamEntryId: porCodigoPublicado, via: 'codigo-publicado' });
  }
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
  const resueltasPorCodigoPublicado = resueltas.filter((r) => r!.via === 'codigo-publicado').length;

  // Un mismo equipo dos veces en la tabla oficial es una tabla rota, aunque los nombres difieran.
  const duplicadas = entradas.filter((id, i) => entradas.indexOf(id) !== i);
  if (duplicadas.length > 0) {
    throw new TablaOficialInvalida(
      'dos filas de la tabla oficial apuntan al mismo equipo del grupo',
      `${contexto}: ${duplicadas.length} repeticiones · fuente ${fuente}: ${ruta}`,
    );
  }

  // La tabla oficial necesita una jornada del canónico a la que colgarse: la última que exista del grupo. Si
  // está COMPLETA es una foto verificada; si no, la tabla es igual de buena —es la que publica la federación—
  // pero su fecha de corte no está confirmada, y eso se declara (v. `corteCompleto` y la migración 0022).
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
    resueltas_por_codigo_publicado: resueltasPorCodigoPublicado,
    filas_de_descanso: filasDeDescanso.length,
    jornada_de_corte: datos.matchdayId,
    corte_completo: datos.corteCompleto,
    comparada: datos.comparar,
    ajustes: ajustes.length,
  });

  /*
   * Y cuando la foto va colgada de una jornada que NO está completa, se dice aparte y con nombre propio: es la
   * clase de cosa que dentro de tres meses nadie recuerda haber decidido. El lote lo deja además en la cobertura
   * (`tabla_oficial_corte_completo`), que es lo que ve el rol de lectura.
   */
  if (!datos.corteCompleto) {
    await registraAviso(cliente, datos.batchId, 'clasificacion_oficial_anclada_a_jornada_incompleta', {
      federacion: datos.federacion, grupo: datos.grupo, fuente, ruta,
      jornada_de_corte: datos.matchdayId,
      filas: filas.length,
      motivo: 'la federación publica la tabla y el canónico no tiene ninguna jornada completa: se ancla a la '
        + 'última jornada existente, que NO está confirmada, y la salvedad queda en la cobertura',
    });
  }

  return {
    ruta, fuente, filas: filas.length, comparada: datos.comparar, diferencias, sinResolver: 0,
    resueltasPorClub, resueltasPorCodigoPublicado, filasDeDescanso: filasDeDescanso.length,
    ajustes, rutaAlternativa, cotejadaConLaOtra: cotejada,
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
