/**
 * Clasificación OFICIAL leída del `clasificacion.json` archivado.
 *
 * ## Por qué hay dos lectores y no uno
 *
 * El recolector archiva la tabla oficial de dos maneras según el portal:
 *
 * | federaciones | archivo | quién lo entiende |
 * |---|---|---|
 * | las PNFG (Castilla y León, Asturias, Aragón, Canarias…) | `clasificacion.html[.gz]` | `parseaClasificacionHtml` de `@facylf/ingesta` |
 * | Cataluña (adaptador propio), **Madrid** y **Valencia** (iSquad) | `clasificacion.json` | este módulo |
 *
 * Medido sobre las colas el 15/09/2026: hay **1.595 `clasificacion.json`** (Cataluña 282, Madrid 656,
 * Valencia 657) y **Cataluña es la única federación donde coexisten los dos** (282 de 283 grupos). En
 * los 282, el parser PNFG lee **0 filas** del HTML: la maqueta es otra. Y en Madrid y Valencia **no hay
 * ningún `clasificacion.html`**, así que este JSON no es un plan B: es la única fuente posible de la
 * tabla oficial.
 *
 * Por eso es un lector hermano y no una excepción dentro del parser PNFG: devuelve el MISMO tipo
 * (`ClasificacionOficialHtml`) y quien decide cuál se usa es el orquestador, no un `if` escondido.
 *
 * ## Vocabulario medido (1.595 ficheros, 11.677 filas)
 *
 * Claves, siempre las diez, siempre presentes, sin variantes:
 * `posicion`, `equipoCodigo`, `equipo`, `puntos`, `jugados`, `ganados`, `empatados`, `perdidos`,
 * `ultimos`, `sancion`.
 *
 * - `equipoCodigo`: `null` en 3.909 filas (toda Cataluña) y **string numérico** en 7.768 (Madrid y
 *   Valencia). Cuando hay código se usa: la regla de identidad del proyecto prefiere el código
 *   federativo con su federación y su ámbito.
 * - `ultimos`: array de `P|G|E`. **No se persiste**: no hay columna para él en el canónico y
 *   inventarla sería inventar. Se acepta y se ignora, que no es lo mismo que convertirlo.
 * - No hay goles a favor ni en contra: la tabla se guarda con 0 y la web no los enseña cuando el
 *   origen es `oficial` (igual que en la vista resumida PNFG).
 * - `sancion ≠ 0` en 38 filas, y `puntos` admite **valores negativos** (7 filas medidas, todas con
 *   `puntos = 3·G + E − sanción`). Un `check` de no negatividad habría rechazado datos legítimos.
 * - `puntos` por debajo de `3·G + E` aparece en 212 filas. **No todas son sanciones declaradas**: en
 *   el grupo 54322935 el JSON publica 40 puntos donde el registro da 41 y `sancion` es 0. Ese ajuste
 *   es un hecho de la fuente: se guarda el valor publicado y se registra la diferencia.
 *
 * ## Reglas de integridad (por eso se detiene el lote)
 *
 * Medidas sobre las 11.677 filas y los 1.595 ficheros, no supuestas:
 *
 * | regla | qué exige | qué pasa en el corpus |
 * |---|---|---|
 * | R1 | `posicion` entero, ≥1, ≤ nº de filas, ≤ su índice+1 y secuencia no decreciente | 212 ficheros de Cataluña 2026-27 publican `posicion: 0` → rechazados |
 * | R2 | `equipo` no vacío y sin duplicados | 0 duplicados en el corpus |
 * | R3 | `jugados = ganados + empatados + perdidos` | se cumple en las 11.677 filas |
 * | R4 | `puntos ≤ 3·ganados + empatados` | 1 fichero lo incumple → rechazado |
 * | R5 | no todas las filas con 0 puntos habiendo victorias o empates | 31 ficheros con la columna de puntos vacía → rechazados |
 * | R6 | puntos negativos sólo si `puntos = 3·G + E − sancion` con `sancion > 0` | los 7 negativos medidos lo cumplen |
 * | R7 | los seis numéricos son enteros | 5 ficheros publican `puntos: 0.25` → rechazados (redondear sería inventar) |
 *
 * Resultado medido del validador: **768 ficheros pasan · 251 se rechazan · 576 son arrays vacíos** (la
 * fuente aún no publica tabla). Los tres grupos catalanes afectados pasan.
 *
 * Un fichero que no pasa **detiene el lote**: no se escribe media tabla oficial ni se «arregla» a mano.
 */

import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import type { ClasificacionOficialHtml } from '@facylf/ingesta';

/** Una tabla que no supera las validaciones: ni se usa ni se convierte. */
export class TablaOficialInvalida extends Error {
  constructor(
    /** Qué regla se ha incumplido, en una línea. */
    readonly motivo: string,
    /** La evidencia: fichero, fila y valores, para poder mirarlo sin volver a reproducirlo. */
    readonly detalle: string,
  ) {
    super(`${motivo} — ${detalle}`);
    this.name = 'TablaOficialInvalida';
  }
}

/** Ruta del `clasificacion.json` archivado para un grupo, tal y como la escribe el recolector. */
export function rutaClasificacionJson(
  raizCola: string, temporada: { codigo: string; etiqueta: string }, competicion: string, grupo: string,
): string | null {
  const carpeta = join(raizCola, `t${temporada.codigo}-${temporada.etiqueta}`, `comp-${competicion}`, `grupo-${grupo}`);
  for (const nombre of ['clasificacion.json.gz', 'clasificacion.json']) {
    const ruta = join(carpeta, nombre);
    if (existsSync(ruta)) return ruta;
  }
  return null;
}

export function leeTexto(ruta: string): string {
  const crudo = readFileSync(ruta);
  return (ruta.endsWith('.gz') ? gunzipSync(crudo) : crudo).toString('utf8');
}

/** Nombres de equipo del club, sin la letra de equipo final (`ARGENTONA, C.F. A` → `argentonA c f`). */
export function nombreDeClub(nombreNormalizado: string): string {
  // Sólo se quita un token que sea UNA letra: así `CD TERUEL` se queda como está y `VILLARREAL CF B`
  // pierde la `b`. Sin esta precisión, un nombre que acaba en letra suelta perdería una letra real.
  return nombreNormalizado.replace(/\s+[a-z]$/, '');
}

const entero = (valor: unknown): number | null =>
  (typeof valor === 'number' && Number.isInteger(valor) ? valor : null);

/**
 * Lee y valida el JSON de clasificación. Lanza `TablaOficialInvalida` con la evidencia si no pasa.
 *
 * `contexto` es sólo para el mensaje de error: federación, temporada, competición y grupo.
 */
export function leeClasificacionJson(crudo: string, contexto: string): ClasificacionOficialHtml[] {
  let analizado: unknown;
  try {
    analizado = JSON.parse(crudo);
  } catch (error) {
    throw new TablaOficialInvalida(
      'el clasificacion.json archivado no es JSON válido',
      `${contexto}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(analizado)) {
    throw new TablaOficialInvalida('el clasificacion.json no es una lista de filas', `${contexto}: es ${typeof analizado}`);
  }
  if (analizado.length === 0) return [];

  const filas: ClasificacionOficialHtml[] = [];
  const vistos = new Set<string>();
  let anterior = 0;
  let algunaConResultado = false;
  let todasCero = true;

  for (const [i, bruta] of analizado.entries()) {
    if (bruta === null || typeof bruta !== 'object' || Array.isArray(bruta)) {
      throw new TablaOficialInvalida('una fila no es un objeto', `${contexto}: fila ${i}`);
    }
    const fila = bruta as Record<string, unknown>;
    const equipo = String(fila.equipo ?? '').replace(/\s+/g, ' ').trim();
    const posicion = entero(fila.posicion);
    const puntos = entero(fila.puntos);
    const jugados = entero(fila.jugados);
    const ganados = entero(fila.ganados);
    const empatados = entero(fila.empatados);
    const perdidos = entero(fila.perdidos);
    const sancion = entero(fila.sancion ?? 0);

    // R7: los seis numéricos tienen que ser enteros. Medido: 5 ficheros publican `puntos: 0.25`.
    if ([posicion, puntos, jugados, ganados, empatados, perdidos, sancion].some((v) => v === null)) {
      throw new TablaOficialInvalida(
        'R7: hay un valor no entero en la tabla oficial',
        `${contexto}: fila ${i} «${equipo}» posicion=${JSON.stringify(fila.posicion)} puntos=${JSON.stringify(fila.puntos)} `
        + `jugados=${JSON.stringify(fila.jugados)} ganados=${JSON.stringify(fila.ganados)} `
        + `empatados=${JSON.stringify(fila.empatados)} perdidos=${JSON.stringify(fila.perdidos)} sancion=${JSON.stringify(fila.sancion)}`,
      );
    }
    // R2: sin nombre no hay equipo al que atribuir la fila, y dos veces el mismo equipo es una tabla rota.
    if (equipo === '') {
      throw new TablaOficialInvalida('R2: una fila de la tabla oficial no trae equipo', `${contexto}: fila ${i}`);
    }
    if (vistos.has(equipo)) {
      throw new TablaOficialInvalida('R2: el mismo equipo aparece dos veces en la tabla oficial', `${contexto}: «${equipo}»`);
    }
    vistos.add(equipo);
    // R1: la posición es la que publica la fuente; se comprueba su coherencia, no se recalcula.
    if (posicion! < 1 || posicion! > analizado.length || posicion! > i + 1 || posicion! < anterior) {
      throw new TablaOficialInvalida(
        'R1: la posición publicada no es coherente',
        `${contexto}: fila ${i} «${equipo}» posicion=${posicion} (filas=${analizado.length}, anterior=${anterior})`,
      );
    }
    anterior = Math.max(anterior, posicion!);
    // R3: el registro tiene que sumar.
    if (jugados !== ganados! + empatados! + perdidos!) {
      throw new TablaOficialInvalida(
        'R3: los partidos jugados no son ganados + empatados + perdidos',
        `${contexto}: «${equipo}» jugados=${jugados} ${ganados}-${empatados}-${perdidos}`,
      );
    }
    // R4: nadie saca más puntos que los que dan sus resultados.
    if (puntos! > 3 * ganados! + empatados!) {
      throw new TablaOficialInvalida(
        'R4: la puntuación publicada supera la que dan los resultados',
        `${contexto}: «${equipo}» puntos=${puntos} pero 3·${ganados}+${empatados}=${3 * ganados! + empatados!}`,
      );
    }
    // R6: un valor negativo sólo se acepta si lo explica una sanción declarada.
    if (puntos! < 0 && !(puntos === 3 * ganados! + empatados! - sancion! && sancion! > 0)) {
      throw new TablaOficialInvalida(
        'R6: hay puntos negativos que ninguna sanción declarada explica',
        `${contexto}: «${equipo}» puntos=${puntos} sancion=${sancion} ${ganados}-${empatados}-${perdidos}`,
      );
    }
    if (puntos !== 0) todasCero = false;
    if (ganados! + empatados! > 0) algunaConResultado = true;

    filas.push({
      posicion: posicion!,
      equipoCodigo: fila.equipoCodigo === null || fila.equipoCodigo === undefined ? null : String(fila.equipoCodigo),
      equipo,
      puntos: puntos!,
      jugados: jugados!,
      ganados: ganados!,
      empatados: empatados!,
      perdidos: perdidos!,
      // `ultimos` se acepta tal cual y NO se persiste (no hay columna): se documenta, no se convierte.
      ultimos: Array.isArray(fila.ultimos) ? fila.ultimos.map((x) => String(x)) : [],
      sancion: sancion!,
    });
  }

  // R5: una tabla en la que nadie tiene puntos habiendo victorias y empates no es una tabla.
  if (todasCero && algunaConResultado) {
    throw new TablaOficialInvalida(
      'R5: todas las filas traen 0 puntos aunque haya victorias y empates',
      `${contexto}: ${filas.length} filas, la primera «${filas[0]?.equipo}» con ${filas[0]?.ganados}-${filas[0]?.empatados}-${filas[0]?.perdidos}`,
    );
  }
  return filas;
}

/**
 * Compara dos lecturas de la misma tabla. Devuelve `null` si dicen lo mismo.
 *
 * Se usa cuando el HTML y el JSON del mismo grupo producen filas (requisito 9): si difieren, no se
 * elige ninguna, se detiene el lote. La comparación es por equipo y por los seis valores persistidos.
 */
export function comparaTablasOficiales(
  a: ClasificacionOficialHtml[], b: ClasificacionOficialHtml[],
): string | null {
  if (a.length !== b.length) return `una trae ${a.length} filas y la otra ${b.length}`;
  const porEquipo = new Map(b.map((f) => [f.equipo, f]));
  for (const fila of a) {
    const otra = porEquipo.get(fila.equipo);
    if (!otra) return `«${fila.equipo}» sólo está en una de las dos`;
    for (const campo of ['puntos', 'jugados', 'ganados', 'empatados', 'perdidos', 'sancion', 'posicion'] as const) {
      if (fila[campo] !== otra[campo]) return `«${fila.equipo}»: ${campo} ${fila[campo]} en una y ${otra[campo]} en la otra`;
    }
  }
  return null;
}
