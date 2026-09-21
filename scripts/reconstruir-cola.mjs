#!/usr/bin/env node
/**
 * Reconstrucción reversible de filas DERIVADAS de la cola desde los HTML archivados.
 *
 * ## Qué reconstruye y qué no
 *
 * Reconstruye `partidos` (la fila derivada) a partir del HTML de la jornada que el recolector ya tiene
 * archivado. **No toca nunca** el HTML ni el JSON de origen, ni el acta, ni el catálogo. Tampoco
 * vuelve a descargar nada: el archivo es la evidencia.
 *
 * Y la evidencia tiene que ser **la de estas filas**: el worker reescribe el HTML en el sitio, así que una
 * jornada cuyo `jornadas.hash` ya no coincide con el archivo del disco **queda fuera del lote y se
 * declara**, nunca se compara en silencio. Una copia de la cola caduca en cuanto los workers vuelven a
 * comprobar una jornada, y con ella caducan las cifras medidas sobre esa copia.
 *
 * Está pensado para que cada federación use SU extractor —la maqueta «nova» de Euskadi, la clásica de
 * las PNFG— sin mezclarlos: el adaptador vive en
 * `packages/ingesta/src/reconstruccion-cola/adaptadores.ts`.
 *
 * ## Cómo se usa
 *
 * ```powershell
 * pnpm reconstruir-cola --federacion euskadi --simular
 * pnpm reconstruir-cola --federacion euskadi --aplicar <id-lote>
 * pnpm reconstruir-cola --federacion euskadi --verificar <id-lote>
 * pnpm reconstruir-cola --federacion euskadi --revertir <id-lote>
 * ```
 *
 * ## Las reglas que hacen que esto no sea peligroso
 *
 * 1. `--simular` **antes** de `--aplicar`, y la simulación deja un **manifiesto** con el hash de cada
 *    entrada (el HTML y la fila que se va a sustituir) y el resultado esperado.
 * 2. `--aplicar` **rechaza** el lote si no hay manifiesto, si el manifiesto está obsoleto, si cambió el
 *    esquema, el contrato o la versión de la herramienta, si cambió un HTML, si cambió la fila
 *    objetivo, si la jornada tiene un trabajo `en_curso`, o si sus contadores no cuadran entre sí.
 *    Nada de eso se avisa: se rechaza.
 * 3. **Una transacción por jornada.** Interrumpir entre jornadas deja lo ya confirmado coherente y se
 *    puede reanudar: el diario sólo contiene filas ya confirmadas y el fichero `.aplicado.json` dice
 *    qué jornadas están hechas.
 * 4. `busy_timeout` puesto, y la conexión es de escritura **solo** en `--aplicar`/`--revertir`.
 * 5. La copia previa se hace con la **API de backup de SQLite** (`sqlite.backup`), no copiando el
 *    fichero: copiar una SQLite en WAL a mano se lleva el diario a medias. Vive en
 *    `pruebas/reconstruccion/`, **fuera** de la carpeta que limpia el worker, y **no se borra nunca sola**.
 * 6. El **diario** guarda los valores anteriores y posteriores de cada fila, en un fichero aparte y no
 *    en la cola: el esquema de la cola es del worker y no se toca.
 * 7. Lo ambiguo **no entra**: se queda fuera del lote y sigue deteniendo su importación.
 * 8. Un **bloqueo cooperativo** por federación impide que dos procesos apliquen a la vez. No detiene a
 *    ningún worker: es un fichero de la herramienta, no de la cola.
 *
 * ## Versionado
 *
 * La versión NO se escribe a mano ni se deriva sólo del extractor. Se calcula sobre la huella
 * semántica de los módulos que deciden el resultado —adaptador, normalización, construcción de filas,
 * esquema del manifiesto y reglas de selección— más una versión explícita del contrato. Un cambio de
 * comentario no invalida nada; un cambio de regla sí. Ver
 * `packages/ingesta/src/reconstruccion-cola/version.ts`.
 *
 * ## Los contadores del informe
 *
 * `filas = identicas + cambios + ambiguos` tiene que cuadrar jornada a jornada, y el desglose de los
 * ambiguos por motivo tiene que sumar el total. Si no cuadra, el informe **no se imprime**: es lo que
 * impide volver a presentar a la vez la cifra del manifiesto y la suma de contadores de otro
 * diagnóstico. Ver `compruebaCoherencia` en `manifiesto.ts`.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync, rmSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * `node:sqlite` se carga con `createRequire` en vez de con un `import` normal, igual que hace
 * `packages/canonico/src/origen/sqlite.ts`: es un módulo interno reciente que el transformador de
 * módulos de Vite no reconoce, le quita el prefijo `node:` e intenta resolver `sqlite` como paquete de
 * `node_modules`, con lo que las pruebas ni arrancan («Failed to load url sqlite»). Con
 * `createRequire` se obtiene el módulo real tanto en las pruebas como bajo `tsx`.
 */
const requerir = createRequire(import.meta.url);
const { DatabaseSync, backup } = requerir('node:sqlite');

import { extraePartidos, extraePartidosWidget, extraeFilasInformativas } from './lib/recolector-local.mjs';
import { extraePartidosIsquad, extraeFilasInformativasIsquad } from './lib/filas-descanso-isquad.mjs';
import { normalizaNombreEquipo, resuelveEquipoNova, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';
import { veredictoDelActaDeDescanso } from '../packages/ingesta/src/parsers/filas-informativas.js';
import { apartaBloqueDeLaComparacion } from '../packages/ingesta/src/reconstruccion-cola/bloques-descanso.js';
import { huella } from '../packages/ingesta/src/reconstruccion-cola/digest.js';
import { createHash } from 'node:crypto';
import {
  construyeFilaDerivada, huellaFila, recuperaCodigo,
} from '../packages/ingesta/src/reconstruccion-cola/filas.js';
import { construyeCatalogo } from '../packages/ingesta/src/reconstruccion-cola/catalogo.js';
import { adaptadorDe, exigeAdaptadorListo } from '../packages/ingesta/src/reconstruccion-cola/adaptadores.js';
import { versionExtractor } from '../packages/ingesta/src/reconstruccion-cola/version.js';
import {
  compruebaCoherencia, compruebaVigencia, idDeManifiesto, recortaFila, resumenDe,
} from '../packages/ingesta/src/reconstruccion-cola/manifiesto.js';

const EXTRACTORES = { widget: extraePartidosWidget, clasica: extraePartidos, isquad: extraePartidosIsquad };

/*
 * Con qué se leen las filas INFORMATIVAS de la jornada, que es distinto por maqueta y es la pieza que
 * declara (y aparta) el bloque de descanso. En las PNFG y en nova la evidencia es el LITERAL; en iSquad es
 * el **código de equipo negativo** (medido: 3.386 de 3.386 filas en Madrid y 686 de 686 en Valencia con
 * negativo, y ninguna con negativo sin la palabra). Confundirlas haría que Madrid y Valencia se leyeran con
 * la regla de otra maqueta, que es justo el error que este trabajo existe para corregir.
 */
const FILAS_INFORMATIVAS = {
  widget: extraeFilasInformativas,
  clasica: extraeFilasInformativas,
  isquad: extraeFilasInformativasIsquad,
};

const CARPETA_FEDERACION = { 'castilla-leon': 'descargas-federacion' };

/**
 * Raíz del CÓDIGO: el checkout donde vive este fichero. Es de donde se leen los artefactos cuya huella
 * forma la versión, y **no** cambia con `FACYLF_RAIZ`.
 *
 * Esto no es un detalle: la versión describe las REGLAS QUE SE ESTÁN EJECUTANDO. Si se midiera sobre la
 * raíz de datos, ejecutar sobre una copia con `FACYLF_RAIZ` daría otra versión —o peor, no encontraría
 * los ficheros— y la comprobación de vigencia dejaría de significar lo que dice.
 */
const RAIZ_CODIGO = resolve(import.meta.dirname, '..');

/** Raíz de DATOS. `FACYLF_RAIZ` apunta a una copia, que es lo que usan las pruebas. */
export function raizDe(opciones = {}) {
  return resolve(opciones.raiz ?? process.env.FACYLF_RAIZ ?? RAIZ_CODIGO);
}
/** Raíz del código. Sólo se sustituye en las pruebas que demuestran que un cambio de extractor invalida. */
export function raizCodigoDe(opciones = {}) {
  return resolve(opciones.raizCodigo ?? RAIZ_CODIGO);
}
const versionDe = (opciones) => versionExtractor({ raiz: raizCodigoDe(opciones) });
const carpetaDe = (federacion) => CARPETA_FEDERACION[federacion] ?? `descargas-${federacion}`;
export const rutaCola = (federacion, opciones = {}) =>
  join(raizDe(opciones), carpetaDe(federacion), 'recolector-local', 'cola-v2.sqlite');
/** Todo lo del proceso vive aquí: fuera de la carpeta del worker, que la limpia. */
export const carpetaTrabajo = (opciones = {}) => join(raizDe(opciones), 'pruebas', 'reconstruccion');

/** sha256 recortado, reexportado para que las pruebas y los diagnósticos usen el mismo. */
export { huella };

/* ------------------------------------------------------------------ */
/* Bloqueo cooperativo                                                 */
/* ------------------------------------------------------------------ */

/**
 * Bloqueo por federación. Es un fichero de la HERRAMIENTA, no de la cola ni del worker: no cambia el
 * ritmo de nadie ni toca `trabajos`. Sólo impide que dos procesos de reconstrucción escriban a la vez.
 * Un bloqueo de más de 6 horas se considera abandonado y se puede quitar con `--desbloquear`.
 */
export function rutaBloqueo(federacion, opciones = {}) {
  return join(carpetaTrabajo(opciones), `bloqueo-${federacion}.lock`);
}

export function tomaBloqueo(federacion, opciones = {}) {
  const ruta = rutaBloqueo(federacion, opciones);
  mkdirSync(dirname(ruta), { recursive: true });
  if (existsSync(ruta)) {
    const previo = JSON.parse(readFileSync(ruta, 'utf8'));
    const horas = (Date.now() - new Date(previo.desde).getTime()) / 3600000;
    if (horas < 6) {
      throw new Error(`Ya hay una reconstrucción de ${federacion} en curso (pid ${previo.pid}, desde ${previo.desde}). `
        + `Si es un bloqueo abandonado, quítalo con --desbloquear ${federacion}.`);
    }
  }
  writeFileSync(ruta, JSON.stringify({ federacion, pid: process.pid, desde: new Date().toISOString() }, null, 1));
  return ruta;
}

export function sueltaBloqueo(federacion, opciones = {}) {
  rmSync(rutaBloqueo(federacion, opciones), { force: true });
}

/* ------------------------------------------------------------------ */
/* Lectura de archivos                                                 */
/* ------------------------------------------------------------------ */

export function leerArchivo(ruta) {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) {
      return {
        contenido: /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8'),
        ruta: r,
      };
    }
  }
  return null;
}

function abreCola(ruta, { escritura = false } = {}) {
  const db = new DatabaseSync(ruta, { readOnly: !escritura });
  if (escritura) {
    // El worker escribe con busy_timeout 5000. Se espera más para no coincidir con él.
    db.exec('pragma busy_timeout = 15000');
  }
  return db;
}

const CAMPOS = `jornada, orden, codigo_acta, equipo_local_codigo, equipo_visitante_codigo, local, visitante,
  goles_local, goles_visitante, fecha, hora, campo, campo_codigo, arbitro`;

/* ------------------------------------------------------------------ */
/* Simulación                                                          */
/* ------------------------------------------------------------------ */

/**
 * Lee la cola y produce el manifiesto. **No escribe nada**: la conexión es de sólo lectura y el
 * manifiesto se devuelve; quien lo persiste es `guardaManifiesto`.
 */
export function simula(federacion, opciones = {}) {
  const raiz = raizDe(opciones);
  const adaptador = exigeAdaptadorListo(federacion);
  const extrae = EXTRACTORES[adaptador.extractor];
  if (!extrae) throw new Error(`El extractor «${adaptador.extractor}» no está implementado en el CLI`);
  const extraeInformativas = FILAS_INFORMATIVAS[adaptador.extractor];
  if (!extraeInformativas) throw new Error(`El extractor «${adaptador.extractor}» no sabe leer filas informativas`);

  const db = abreCola(rutaCola(federacion, opciones));
  const version = versionDe(opciones);
  const jornadas = [];

  /* Catálogos por grupo, calculados UNA vez y sin mantener transacción abierta. */
  const literalesDeGrupo = new Map();
  for (const p of db.prepare('select temporada, competicion, grupo, local, visitante from partidos').all()) {
    const k = `${p.temporada}|${p.competicion}|${p.grupo}`;
    if (!literalesDeGrupo.has(k)) literalesDeGrupo.set(k, new Set());
    literalesDeGrupo.get(k).add(p.local);
    literalesDeGrupo.get(k).add(p.visitante);
  }
  const codigosDeGrupo = new Map();
  for (const p of db.prepare(`select temporada, competicion, grupo, local, equipo_local_codigo cl,
      visitante, equipo_visitante_codigo cv from partidos
      where equipo_local_codigo is not null or equipo_visitante_codigo is not null`).all()) {
    const k = `${p.temporada}|${p.competicion}|${p.grupo}`;
    if (!codigosDeGrupo.has(k)) codigosDeGrupo.set(k, []);
    if (p.cl) codigosDeGrupo.get(k).push({ literal: p.local, codigo: p.cl });
    if (p.cv) codigosDeGrupo.get(k).push({ literal: p.visitante, codigo: p.cv });
  }
  const dirDeGrupo = new Map();
  for (const j of db.prepare('select temporada, competicion, grupo, archivo from jornadas where archivo is not null').all()) {
    const k = `${j.temporada}|${j.competicion}|${j.grupo}`;
    if (dirDeGrupo.has(k)) continue;
    /*
     * ── DÓNDE ESTÁ LA CLASIFICACIÓN ──────────────────────────────────────────────────────────────────
     *
     * `jornadas.archivo` apunta a `<grupo>/jornadas/jornada-N.*`, y la clasificación del grupo NO está ahí:
     * vive un nivel más arriba (`<grupo>/clasificacion.html.gz` en las PNFG y en nova,
     * `<grupo>/clasificacion.json` en iSquad). Buscarla con `dirname(archivo)` la dejaba SIEMPRE sin
     * encontrar, así que el catálogo se quedaba sólo con los códigos del calendario —que funcionaba por
     * casualidad en casi todo, pero dejaba sin resolver justo a los equipos que el calendario no nombra—.
     *
     * Medido en Valencia, grupo `904326881`: `C.F. Gandia 'B'` no aparece en NINGUNA fila de su calendario
     * (su hueco lo ocupa «Descansa» en todas), así que sin la clasificación no se puede identificar y sus
     * **23 partidos desplazados** no se podían recuperar. Con la ruta bien, sí.
     */
    const dirJornadas = dirname(j.archivo);
    const tieneClasificacion = (d) => ['clasificacion.html', 'clasificacion.html.gz', 'clasificacion.json', 'clasificacion.json.gz']
      .some((n) => existsSync(join(d, n)));
    const dir = [dirname(dirJornadas), dirJornadas].find(tieneClasificacion) ?? dirJornadas;
    dirDeGrupo.set(k, dir);
  }
  const catalogos = new Map();
  for (const [k, dir] of dirDeGrupo) {
    const clasificacion = leerArchivo(join(dir, 'clasificacion.html'));
    const pares = new Map();
    if (clasificacion) {
      for (const m of clasificacion.contenido.matchAll(/<a[^>]+href="([^"]*codequipo=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const nombre = m[3].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').trim();
        if (nombre) pares.set(nombre, m[2]);
      }
    }
    /*
     * iSquad publica la clasificación en **JSON** (`clasificacion.json`, con `equipo` y `equipoCodigo`), no
     * en HTML. Y no es un detalle: ahí está el código de los equipos que el CALENDARIO NO NOMBRA —el equipo
     * cuyo hueco ocupa la palabra «Descansa»—. Sin esta fuente, ese equipo no resuelve, y entonces un partido
     * desplazado se puede declarar pero **no recuperar**: la herramienta se niega a escribir una pareja que no
     * puede identificar. Medido en Valencia: los 51 desplazados no resolvían por el calendario.
     */
    if (adaptador.maqueta === 'isquad' || pares.size === 0) {
      const json = leerArchivo(join(dir, 'clasificacion.json'));
      if (json) {
        try {
          for (const e of JSON.parse(json.contenido)) {
            if (e?.equipo && e?.equipoCodigo) pares.set(String(e.equipo), String(e.equipoCodigo));
          }
        } catch { /* una clasificación ilegible no detiene la simulación: sólo deja menos evidencia */ }
      }
    }
    catalogos.set(k, construyeCatalogo({
      filasConCodigo: codigosDeGrupo.get(k) ?? [],
      paresDeClasificacion: pares,
      literales: literalesDeGrupo.get(k) ?? new Set(),
    }));
  }

  /*
   * El acta de una fila fantasma. Abrirla es lo que convierte «no se puede descartar sin abrirla» en un
   * veredicto: medido en Euskadi, 12 de las 13 fantasma con acta tienen un acta cuya pareja es
   * `(equipo real, DESCANSA)` —la federación creó el acta del hueco— y ninguna nombra dos equipos reales.
   *
   * Se lee de la cola y NUNCA se escribe. Si la tabla no existiera, o el JSON no se puede interpretar, o el
   * acta no trae pareja, el veredicto es `no-demuestra` y la fila no se retira: no saber no autoriza.
   */
  const hayActas = db.prepare("select count(*) n from sqlite_master where type='table' and name='actas'").get().n > 0;
  const sentenciaActa = hayActas
    ? db.prepare('select datos from actas where codigo=? and temporada=? and competicion=? and grupo=?')
    : null;
  const veredictoDeActa = (fila, j) => {
    if (fila.codigo_acta === null || fila.codigo_acta === undefined) return { veredicto: 'sin-acta', pareja: null };
    if (!sentenciaActa) return { veredicto: 'no-demuestra', pareja: null };
    const acta = sentenciaActa.get(fila.codigo_acta, j.temporada, j.competicion, j.grupo);
    if (!acta?.datos) return { veredicto: 'no-demuestra', pareja: null };
    let datos;
    try { datos = JSON.parse(acta.datos); } catch { return { veredicto: 'no-demuestra', pareja: null }; }
    const pareja = datos?.local && datos?.visitante
      ? [String(datos.local).replace(/\s+/g, ' ').trim(), String(datos.visitante).replace(/\s+/g, ' ').trim()]
      : null;
    return { veredicto: veredictoDelActaDeDescanso(pareja), pareja };
  };

  /* Una entrada por jornada: es la unidad de transacción. */
  for (const j of db.prepare(`select temporada, competicion, grupo, numero, archivo, hash, comprobada_en
      from jornadas where archivo is not null order by temporada, competicion, grupo, numero`).all()) {
    const k = `${j.temporada}|${j.competicion}|${j.grupo}`;
    const catalogo = catalogos.get(k) ?? {
      inscripcionPorCodigo: new Map(), inscripcionPorNombreLimpio: new Map(), procedencia: new Map(), contextuales: new Set(),
    };
    const archivo = leerArchivo(j.archivo);
    const filas = db.prepare(`select ${CAMPOS} from partidos
      where temporada=? and competicion=? and grupo=? and jornada=? order by orden`)
      .all(j.temporada, j.competicion, j.grupo, j.numero);

    if (!archivo) {
      // Sin HTML archivado no se puede reconstruir NADA de esa jornada. No es un caso ambiguo —no hay
      // dos lecturas que comparar— así que no entra en `ambiguos`: se declara como jornada saltada y el
      // resumen dice cuántas quedaron fuera. Meterla en `ambiguos` inflaría la cifra que se publica con
      // casos que no son del mismo tipo, que es justo el error que este informe tiene que impedir.
      jornadas.push({
        temporada: j.temporada, competicion: j.competicion, grupo: j.grupo, numero: j.numero,
        archivo: j.archivo, huella_html: 'ausente', huella_jornada_guardada: j.hash,
        filas: 0, identicas: 0, cambios: [], ambiguos: [],
        saltada: 'no se pudo leer el HTML archivado',
        estado: 'sin-cambios',
      });
      continue;
    }

    /*
     * ── El HTML del disco tiene que ser el que produjo estas filas ────────────────────────────────
     *
     * `jornadas.hash` es el sha256 del contenido que el worker leyó cuando escribió estas filas. El
     * archivo, en cambio, lo reescribe el worker EN EL SITIO cada vez que vuelve a comprobar la jornada,
     * y la cola sobre la que se reconstruye es una foto. Si las dos huellas no coinciden, comparar filas
     * viejas contra un HTML nuevo fabrica diferencias que no son defectos del extractor: medido en
     * Euskadi, 5 de las 199 «correcciones» salían de 1 jornada así. Esas jornadas quedan FUERA del lote y
     * se declaran con las dos huellas, para que nadie las confunda con jornadas reconstruidas.
     *
     * OJO con el formato: `huella()` recorta a 16 hex porque es la huella de la herramienta, y lo que
     * guarda la cola es el sha256 COMPLETO. Comparar una con otra marca todas las jornadas como
     * desfasadas —pasó al escribir esto, y las 4.802 salieron «fuera del lote»—, así que se calcula el
     * sha256 entero y sólo se tolera la forma recortada cuando la cola guardó ésa.
     */
    const sha256Html = createHash('sha256').update(archivo.contenido).digest('hex');
    const huellaHtml = huella(archivo.contenido);
    // Sin huella en la cola no se puede demostrar el desfase, y no se declara lo que no se puede demostrar.
    const coincideConLaCola = !j.hash
      || j.hash === sha256Html
      || (j.hash.length >= 16 && sha256Html.startsWith(j.hash));
    if (!coincideConLaCola) {
      jornadas.push({
        temporada: j.temporada, competicion: j.competicion, grupo: j.grupo, numero: j.numero,
        archivo: archivo.ruta, huella_html: huellaHtml, huella_jornada_guardada: j.hash,
        filas: filas.length, identicas: 0, cambios: [], ambiguos: [],
        evidencia_desfasada: { huella_cola: j.hash, huella_disco: sha256Html, comprobada_en: j.comprobada_en ?? null },
        filas_no_comparables: filas.length,
        estado: 'sin-cambios',
      });
      continue;
    }

    const extraidos = extrae(archivo.contenido);
    /*
     * ── Las filas de descanso NO se comparan posición a posición ─────────────────────────────────
     *
     * El extractor corregido ya no emite el bloque de descanso, pero la cola todavía lo tiene. Si se
     * comparara por `orden` sin más, la fila del descanso ocuparía una posición y **desalinearía todas las
     * filas siguientes de la jornada**: medido en Euskadi, eso convertía 552 filas fantasma en 1.593
     * «ambiguas» y bajaba las correcciones de 199 a 196. Un artefacto, no un hallazgo.
     *
     * Se quitan del lado de la cola las filas que SON el bloque de descanso, y así las que quedan vuelven a
     * alinearse con lo que el extractor produce. Las retiradas se cuentan aparte, en `filasFantasma`.
     */
    const norm = (t) => normalizaNombreEquipo(separaNombreYEstado(String(t ?? '')).nombreEquipo);
    const parejaDe = (a, b) => [norm(a), norm(b)].sort().join(' || ');
    const informativas = extraeInformativas(archivo.contenido);
    /*
     * Se apartan de la comparación las filas que SON el bloque de descanso, y por TRES vías, todas con la
     * misma consecuencia: la fila sale de los dos lados —de la cola y de lo que el extractor produce— para
     * que las demás sigan alineándose.
     *
     *   1. `informativa === true`: el extractor ya no la emite. Es el caso de 539 filas en Euskadi.
     *   2. `sospechosa` cuyo acta NOMBRA EL DESCANSO: el extractor la sigue emitiendo porque la fila trae
     *      acta, pero el acta dice que ahí no hubo partido. Son 12 filas en Euskadi, invisibles hasta que se
     *      abrió el acta: antes se comparaban como si fueran un partido.
     *
     * Lo que NO se aparta nunca: una `sospechosa` cuyo acta nombra DOS EQUIPOS REALES (Valencia, 5 filas) o
     * que no demuestra nada (4.068 filas, casi todas de Madrid y Valencia, con acta sin pareja). Apartarlas
     * sería tratar como descanso un partido que el acta documenta, y ahí la fila tiene que seguir
     * comparándose y declarándose.
     */
    const parejasInformativas = new Map(
      informativas.filter((i) => i.informativa).map((i) => [parejaDe(i.local, i.visitante), i]),
    );
    /*
     * ── La vía (2) se reconoce en el HTML, NO en la cola ────────────────────────────────────────────
     *
     * Aquí se recorría la COLA buscando filas sospechosas y se abría SU acta. Funcionaba mientras la fila
     * seguía en la cola y dejó de funcionar en cuanto el lote retiró esas filas: **sin fila en la cola no hay
     * nada que recorrer**, el bloque del HTML se quedaba sin reconocer, seguía entrando en la comparación
     * posicional y desalineaba una posición TODAS las filas siguientes. Medido en Euskadi tras aplicar
     * `e698fde408abbfc4`: 54 «ambiguas» que eran puro artefacto —J19 ord 6..7 de t13 c2949 g7237: la cola
     * pone «GETXO vs LOGROÑES» donde el HTML publica el descanso—, porque el lado del HTML conservaba el
     * bloque y el de la cola ya no.
     *
     * La lección es la de siempre en esta herramienta: **lo que el extractor emite se deduce del HTML, no de
     * la cola**. El código de acta sale de la fila EMITIDA (`extraidos`), que es la única fuente que sigue
     * existiendo cuando la cola ya no tiene la fila; la cola se usa sólo como respaldo.
     *
     * Se aparta de los DOS lados en dos supuestos, y ninguno tapa un partido documentado:
     *
     *   a. el acta NOMBRA EL DESCANSO: probado, la federación creó el acta del hueco;
     *   b. la pareja está en el HTML y YA NO ESTÁ en la cola, y el acta no la sostiene como partido real:
     *      sin fila en la cola no hay nada que comparar y dejarla en un solo lado sólo desalinea.
     *
     * Un acta que nombra DOS EQUIPOS REALES no se aparta nunca: ahí hubo partido, y la fila tiene que seguir
     * comparándose y declarándose. La regla vive en `apartaBloqueDeLaComparacion`, con sus pruebas: aquí sólo
     * se le dan los dos datos que necesita.
     */
    const parejasDescansoConActa = new Map();
    for (const i of informativas.filter((x) => x.sospechosa)) {
      const clave = parejaDe(i.local, i.visitante);
      if (parejasInformativas.has(clave) || parejasDescansoConActa.has(clave)) continue;
      const emitida = extraidos.find((p) => parejaDe(p.local, p.visitante) === clave);
      const enLaCola = filas.find((f) => parejaDe(f.local, f.visitante) === clave);
      const codigo = emitida?.codActa ?? enLaCola?.codigo_acta ?? null;
      const veredicto = codigo === null ? 'sin-acta' : veredictoDeActa({ codigo_acta: codigo }, j).veredicto;
      if (apartaBloqueDeLaComparacion({ veredicto, enLaCola: Boolean(enLaCola) })) {
        parejasDescansoConActa.set(clave, i);
      }
    }
    const parejasApartadas = new Map([...parejasInformativas, ...parejasDescansoConActa]);
    /*
     * ── Y las filas que la fuente NO publica pero el ACTA sostiene ────────────────────────────────────
     *
     * Es lo que queda en la cola después de RECUPERAR un partido desplazado. La fuente sigue publicando
     * «Descansa» en esa posición —nunca publicó ese partido, el equipo que falta no tenía calendario—, así
     * que la cola tiene una fila que el origen no tiene. Si se comparara por posición, esa fila de más
     * desplazaría todas las siguientes: medido al recuperar las 28 de Valencia, **118 filas «ambiguas»** que
     * eran puro artefacto.
     *
     * Se aparta de la comparación —igual que el bloque de descanso— pero NO se silencia: queda declarada con
     * su acta y su pareja. La guarda es fuerte: sólo entra si el acta de ESA MISMA fila nombra exactamente
     * la pareja que la cola tiene, que es la firma de una recuperación y no la de un partido perdido.
     */
    const parejasRecuperadas = new Map();
    const parejasEnElOrigen = new Set(extraidos.map((p) => parejaDe(p.local, p.visitante)));
    for (const f of filas) {
      const clave = parejaDe(f.local, f.visitante);
      if (parejasApartadas.has(clave) || parejasRecuperadas.has(clave)) continue;
      if (parejasEnElOrigen.has(clave)) continue;
      if (!f.codigo_acta) continue;
      const { veredicto, pareja } = veredictoDeActa(f, j);
      if (veredicto !== 'partido-real' || !pareja) continue;
      if (parejaDe(pareja[0], pareja[1]) !== clave) continue;
      parejasRecuperadas.set(clave, { fila: f, pareja });
    }
    const filasComparables = filas.filter((f) => !parejasApartadas.has(parejaDe(f.local, f.visitante))
      && !parejasRecuperadas.has(parejaDe(f.local, f.visitante)));
    // El extractor emite las filas de (2) —no las de (1)—, así que hay que quitarlas también de su lado.
    const extraidosComparables = extraidos.filter((p) => !parejasDescansoConActa.has(parejaDe(p.local, p.visitante)));
    const cambios = [];
    const ambiguos = [];
    let identicas = 0;

    for (const [posicion, fila] of filasComparables.entries()) {
      // La MISMA fila del calendario, releída del HTML, se reconoce por el orden dentro de la jornada.
      const delHtml = extraidosComparables[posicion];
      if (!delHtml) {
        ambiguos.push({
          orden: fila.orden, actual: `${fila.local} vs ${fila.visitante}`, html: 'ausente',
          motivo: 'el-html-no-trae-una-fila-en-esa-posicion',
          vias: { local: 'sin-resolver', visitante: 'sin-resolver' },
          marcadores_fuera_de_posicion: [], marcadores_desconocidos: [],
        });
        continue;
      }
      const calLocal = resuelveEquipoNova({ literal: delHtml.local, codigoExplicito: delHtml.codLocal }, catalogo);
      const calVisit = resuelveEquipoNova({ literal: delHtml.visitante, codigoExplicito: delHtml.codVisitante }, catalogo);
      const acta = fila.codigo_acta
        ? db.prepare('select datos from actas where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?')
          .get(j.temporada, j.competicion, j.grupo, j.numero, fila.codigo_acta)?.datos
        : null;
      let declarado = null;
      if (acta) { try { declarado = JSON.parse(acta); } catch { declarado = null; } }

      const nueva = construyeFilaDerivada({ fila, delHtml, calLocal, calVisit });
      if (huellaFila(fila) === huellaFila(nueva)) { identicas++; continue; }

      // ¿El cambio está sostenido por el acta? El acta es la comprobación independiente: si su pareja no
      // coincide con la del HTML reparado, la fila NO se toca y queda como ambigua.
      let sostenidoPorActa = null;
      if (declarado?.local && declarado?.visitante) {
        const aL = resuelveEquipoNova({ literal: declarado.local, codigoExplicito: null }, catalogo);
        const aV = resuelveEquipoNova({ literal: declarado.visitante, codigoExplicito: null }, catalogo);
        sostenidoPorActa = aL.inscripcion !== null && aV.inscripcion !== null
          && aL.inscripcion === calLocal.inscripcion && aV.inscripcion === calVisit.inscripcion;
      }
      if (sostenidoPorActa === true) {
        cambios.push({
          orden: fila.orden,
          antes: recortaFila(fila),
          despues: recortaFila(nueva),
          huella_antes: huellaFila(fila),
          huella_despues: huellaFila(nueva),
          codigo_recuperado: recuperaCodigo(fila, nueva),
          via: { local: calLocal.via, visitante: calVisit.via },
          marcadores: [...calLocal.marcadoresEstado, ...calVisit.marcadoresEstado],
          referencia_contextual: calLocal.codigoExterno === null || calVisit.codigoExterno === null,
        });
      } else {
        ambiguos.push({
          orden: fila.orden,
          actual: `${fila.local} vs ${fila.visitante}`,
          html: `${delHtml.local} vs ${delHtml.visitante}`,
          motivo: sostenidoPorActa === false
            ? 'el-acta-no-sostiene-la-pareja'
            : 'el-acta-no-permite-comprobar-la-pareja',
          vias: { local: calLocal.via, visitante: calVisit.via },
          marcadores_fuera_de_posicion: [...calLocal.marcadoresFueraDePosicion, ...calVisit.marcadoresFueraDePosicion],
          marcadores_desconocidos: [...new Set([...calLocal.marcadoresDesconocidos, ...calVisit.marcadoresDesconocidos])],
        });
      }
    }
    /*
     * ── Diagnóstico de las FILAS DE DESCANSO (no entra en el lote) ──────────────────────────────
     *
     * El extractor corrigido ya NO emite el bloque de descanso como partido. Consecuencia: una fila de la
     * cola que sí lo es **no tiene correspondencia** en lo que el extractor produce hoy. Eso se puede
     * medir, y aquí se mide, pero **no se escribe**: `--aplicar` sigue aplicando sólo `cambios`, porque
     * borrar e insertar filas necesita su propio lote reversible y sus propias pruebas. Informar primero.
     *
     * Los tres contadores son disjuntos de la partición de arriba (`filas = identicas + cambios +
     * ambiguos`) y NO se suman a ella: son diagnósticos sobre lo mismo, no categorías nuevas.
     */
    /*
     * ¿La cola tiene hoy una fila con la pareja de este bloque? Se anota en el bloque porque la retirada de
     * esas filas es justo lo que se acaba de hacer, y un bloque que la fuente sigue publicando y la cola ya no
     * tiene es la huella de esa retirada. Se anota aquí y no en el extractor porque el extractor no ve la cola.
     */
    const informativasDetectadas = informativas.map((i) => ({
      ...i,
      en_la_cola: filas.some((f) => parejaDe(f.local, f.visitante) === parejaDe(i.local, i.visitante)),
    }));
    // Filas de la cola que son el bloque de descanso: las de las tres vías de arriba, ya con su veredicto.
    const fantasmaPorPareja = new Map();
    for (const f of filas) {
      const info = parejasApartadas.get(parejaDe(f.local, f.visitante));
      if (!info) continue;
      fantasmaPorPareja.set(f.orden, { fila: f, info });
    }
    const filasFantasma = [...fantasmaPorPareja.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([orden, { fila, info }]) => ({
        orden, local: fila.local, visitante: fila.visitante, codigo_acta: fila.codigo_acta,
        // Qué equipo descansa es información de la fuente, no basura: se conserva en el informe.
        equipo_que_descansa: info.equipoQueDescansa ?? null,
        motivo: info.motivo ?? null,
        tiene_acta: fila.codigo_acta !== null,
        acta: veredictoDeActa(fila, j).veredicto,
      }));
    /*
     * ── Partidos DESPLAZADOS ────────────────────────────────────────────────────────────────────────
     *
     * La fila pone el descanso en un lado y el acta de ESA MISMA fila nombra dos equipos reales. No es una
     * fantasma que se pueda retirar: ahí hubo partido, y lo que pasa es que la cola tiene el descanso donde
     * debería estar el equipo que el acta sí conoce. Se informa y NO se toca —recuperarlo es insertar o
     * corregir una pareja, no borrar una fila—.
     *
     * Medido en Valencia, grupo 904325856: 5 jornadas donde la cola pone «Descansa» en el lado que el acta
     * atribuye a `Canals Promeses C.F. 'A'`. Es el caso que Lot 3 buscaba y no encontraba.
     *
     * Y el bloque puede haber llegado por DOS vías, así que se miran las dos: el literal (PNFG y nova, donde
     * el bloque se declara `sospechosa` porque trae acta) y el **código negativo** de iSquad, donde el bloque
     * se declara `informativa` y el acta es la que dice que ahí hubo partido. Mirar sólo `sospechosa` dejaba
     * fuera los desplazados de Madrid y Valencia —medido el 17/09/2026: **51** bloques de Valencia con acta
     * que nombra dos equipos reales, contados pero no listados—, que es justo el lote de recuperación.
     */
    const desplazadasInternas = informativas
      .filter((i) => i.sospechosa || i.informativa)
      .map((i) => {
        const fila = filas.find((f) => parejaDe(f.local, f.visitante) === parejaDe(i.local, i.visitante));
        if (!fila || !fila.codigo_acta) return null;
        const { veredicto, pareja } = veredictoDeActa(fila, j);
        if (veredicto !== 'partido-real' || !pareja) return null;
        const enLaCola = new Set([normalizaNombreEquipo(fila.local), normalizaNombreEquipo(fila.visitante)]);
        const faltan = pareja.filter((x) => !enLaCola.has(normalizaNombreEquipo(x)));
        const parejaNormalizada = parejaDe(pareja[0], pareja[1]);
        const yaEstaEnLaJornada = filas.some((f) => f.orden !== fila.orden
          && parejaDe(f.local, f.visitante) === parejaNormalizada);
        return {
          orden: fila.orden,
          en_la_cola: `${fila.local} vs ${fila.visitante}`,
          dice_el_acta: pareja.join(' / '),
          codigo_acta: fila.codigo_acta,
          equipo_que_la_cola_no_tiene: faltan.length === 1 ? faltan[0] : null,
          la_pareja_del_acta_ya_esta_en_la_jornada: yaEstaEnLaJornada,
          // La PAREJA del acta, que es lo que hace falta para recuperar el partido. Va aquí para no volver
          // a abrir el acta después y para que el motivo del lote se pueda leer entero.
          pareja,
          fila,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.orden - b.orden);
    // Lo que se PUBLICA no lleva la fila entera ni la pareja suelta: eso es materia del lote, no del informe.
    const desplazadas = desplazadasInternas.map(({ fila, pareja, ...publicable }) => publicable);
    /*
     * ── Y lo que un lote puede RECUPERAR (no retirar) ────────────────────────────────────────────────
     *
     * Un partido desplazado no se borra: se CORRIGE. La fila ya existe y lo que está mal es la pareja —el
     * lado que dice «Descansa» donde el acta de esa misma fila nombra un equipo real—. La escritura es la
     * misma que la de una corrección cualquiera (un `update`), así que la reversión ya está probada.
     *
     * Tres condiciones, y las tres tienen que cumplirse para que la fila entre en el lote:
     *
     *   1. el acta nombra DOS EQUIPOS REALES (es lo que define el desplazamiento);
     *   2. los dos se resuelven en el catálogo del grupo: si un lado no resuelve, no se puede escribir una
     *      pareja a medias y la fila queda sólo declarada;
     *   3. la pareja del acta **no está ya** en esa jornada como otra fila. Si lo estuviera, corregir ésta
     *      DUPLICARÍA el partido, y duplicar es peor que faltar: eso no se hace nunca.
     */
    const recuperadas = desplazadasInternas
      .filter((d) => !d.la_pareja_del_acta_ya_esta_en_la_jornada)
      /*
       * Y un equipo NO juega contra sí mismo. El acta del hueco está rota cuando publica el mismo equipo en
       * los dos lados —medido en Valencia, `C.F. Gandia 'B' / C.F. Gandia 'B'` en
       * `t21 c29509582 g904326881 J7` y `Canals Promeses C.F. 'A' / Canals Promeses C.F. 'A'` en
       * `t21 c29509571 g904325856 J7`—: recuperarla escribiría un partido imposible, así que la fila se
       * declara y NO se toca.
       */
      .filter((d) => normalizaNombreEquipo(d.pareja[0]) !== normalizaNombreEquipo(d.pareja[1]))
      .map((d) => {
        const calLocal = resuelveEquipoNova({ literal: d.pareja[0], codigoExplicito: null }, catalogo);
        const calVisit = resuelveEquipoNova({ literal: d.pareja[1], codigoExplicito: null }, catalogo);
        if (calLocal.inscripcion === null || calVisit.inscripcion === null) return null;
        /*
         * El CÓDIGO sale del catálogo, nunca del aire. Cuando la resolución es por nombre, el catálogo
         * devuelve la INSCRIPCIÓN —y en este esquema la inscripción de un equipo con código ES su código—,
         * así que se usa ésa; lo que NO se hace es inventar uno cuando la inscripción es contextual
         * (`contexto:<nombre>`), que es el caso del equipo que la federación no codifica.
         */
        const conCodigo = (r) => ({
          ...r,
          codigoExterno: r.codigoExterno ?? (catalogo.contextuales.has(r.inscripcion) ? null : r.inscripcion),
        });
        const nueva = construyeFilaDerivada({
          fila: d.fila, delHtml: { local: d.pareja[0], visitante: d.pareja[1] },
          calLocal: conCodigo(calLocal), calVisit: conCodigo(calVisit),
        });
        if (huellaFila(d.fila) === huellaFila(nueva)) return null;
        return {
          orden: d.orden,
          antes: recortaFila(d.fila),
          despues: recortaFila(nueva),
          huella_antes: huellaFila(d.fila),
          huella_despues: huellaFila(nueva),
          codigo_recuperado: true,
          via: { local: calLocal.via, visitante: calVisit.via },
          marcadores: [...calLocal.marcadoresEstado, ...calVisit.marcadoresEstado],
          referencia_contextual: calLocal.codigoExterno === null || calVisit.codigoExterno === null,
          motivo: `el acta ${d.codigo_acta} nombra «${d.dice_el_acta}» donde la cola pone el descanso`,
        };
      })
      .filter(Boolean);
    /*
     * Lo que un lote puede RETIRAR. Dos vías, y las dos tienen que estar demostradas:
     *
     *   1. la fila no trae acta —nadie ha documentado un partido ahí—;
     *   2. la trae, pero el acta NOMBRA EL DESCANSO en uno de sus dos lados: la propia federación creó el
     *      acta del hueco, así que el acta no documenta un partido.
     *
     * Lo que NO se retira nunca: una fantasma cuyo acta nombra dos equipos reales (ahí sí hay partido) ni
     * una cuyo acta no demuestre nada (sin pareja, ilegible, o sin fila en la cola). La fila entera se
     * guarda porque retirar no es un `update`: es un `delete` que la reversión tiene que poder deshacer.
     */
    const retiradas = [...fantasmaPorPareja.entries()]
      .map(([orden, { fila, info }]) => ({ orden, fila, info, acta: veredictoDeActa(fila, j).veredicto }))
      .filter(({ acta }) => acta === 'sin-acta' || acta === 'descanso')
      .sort((a, b) => a.orden - b.orden)
      .map(({ orden, fila, info, acta }) => ({
        orden, antes: recortaFila(fila), huella_antes: huellaFila(fila),
        equipo_que_descansa: info.equipoQueDescansa ?? null,
        motivo: acta === 'sin-acta' ? 'bloque de descanso sin acta'
          : 'bloque de descanso cuyo acta nombra el descanso',
      }));
    /*
     * Partidos que el HTML sí publica y la cola no tiene: los que se podrían recuperar.
     *
     * Un bloque de descanso NO es uno de ellos, aunque el HTML lo publique y la cola no lo tenga: el bloque ya
     * está declarado en `informativas`, y si la fila se retiró lo dice el diario del lote. Medido en Euskadi
     * tras aplicar `e698fde408abbfc4`: sin este filtro salían «12 partidos recuperables» que eran ni más ni
     * menos que los 12 bloques que el lote acababa de retirar. Publicarlos así era una trampa: quien leyera el
     * informe habría ido a «recuperar» doce filas de descanso como si fueran partidos perdidos.
     */
    const parejasCola = new Set(filas.map((f) => parejaDe(f.local, f.visitante)));
    const partidosRecuperados = extraidos
      .filter((p) => !parejasCola.has(parejaDe(p.local, p.visitante)))
      .filter((p) => !parejasApartadas.has(parejaDe(p.local, p.visitante)))
      .map((p) => ({ local: p.local, visitante: p.visitante, codigo_acta: p.codActa ?? null }));
    // Filas de la cola que comparten acta con otra de la misma jornada: duplicados de lectura.
    const porActa = new Map();
    for (const f of filas) if (f.codigo_acta) porActa.set(f.codigo_acta, (porActa.get(f.codigo_acta) ?? 0) + 1);
    const filasDuplicadas = filas.filter((f) => f.codigo_acta && (porActa.get(f.codigo_acta) ?? 0) > 1)
      .map((f) => ({ orden: f.orden, codigo_acta: f.codigo_acta, local: f.local, visitante: f.visitante }));

    jornadas.push({
      temporada: j.temporada, competicion: j.competicion, grupo: j.grupo, numero: j.numero,
      archivo: archivo.ruta, huella_html: huella(archivo.contenido), huella_jornada_guardada: j.hash,
      filas: filas.length, identicas, cambios, ambiguos,
      informativas: informativasDetectadas, filasFantasma, partidosRecuperados, filasDuplicadas, retiradas, desplazadas,
      recuperadas,
      // Las filas que la fuente no publica y el acta sí sostiene: recuperaciones ya aplicadas. Se declaran
      // para que no se confundan con filas perdidas.
      recuperadasPorActa: [...parejasRecuperadas.values()]
        .sort((a, b) => a.fila.orden - b.fila.orden)
        .map(({ fila, pareja }) => ({
          orden: fila.orden,
          en_la_cola: `${fila.local} vs ${fila.visitante}`,
          dice_el_acta: pareja.join(' / '),
          codigo_acta: fila.codigo_acta,
        })),
      estado: cambios.length ? 'con-cambios' : 'sin-cambios',
    });
  }
  db.close();

  const manifiesto = {
    federacion,
    maqueta: adaptador.maqueta,
    version_extractor: version.version,
    version_contrato: version.contrato,
    esquema_manifiesto: version.esquema,
    artefactos: version.artefactos,
    generado_en: new Date().toISOString(),
    resumen: resumenDe(jornadas),
    jornadas,
  };
  manifiesto.id = idDeManifiesto({ federacion, version: version.version, jornadas });

  const fallos = compruebaCoherencia(manifiesto);
  if (fallos.length) {
    throw new Error(`La simulación produjo contadores incoherentes y no se guarda:\n  ${fallos.slice(0, 10).join('\n  ')}`);
  }
  return manifiesto;
}

/* ------------------------------------------------------------------ */
/* Manifiesto en disco                                                 */
/* ------------------------------------------------------------------ */

export function guardaManifiesto(manifiesto, opciones = {}) {
  const carpeta = carpetaTrabajo(opciones);
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, `${manifiesto.federacion}-${manifiesto.id}.manifiesto.json`);
  writeFileSync(ruta, JSON.stringify(manifiesto, null, 1));
  return ruta;
}

export function leeManifiesto(federacion, id, opciones = {}) {
  const carpeta = carpetaTrabajo(opciones);
  const ruta = join(carpeta, `${federacion}-${id}.manifiesto.json`);
  if (existsSync(ruta)) return JSON.parse(readFileSync(ruta, 'utf8'));
  // Si está en la carpeta de invalidados se dice por qué, en vez de decir que no existe.
  const carpetaInvalidados = join(carpeta, 'invalidados');
  if (existsSync(carpetaInvalidados)) {
    for (const f of readdirSync(carpetaInvalidados)) {
      if (!f.startsWith(`${federacion}-${id}`)) continue;
      const registro = f.endsWith('.invalidado.json') ? JSON.parse(readFileSync(join(carpetaInvalidados, f), 'utf8')) : null;
      throw new Error(`El manifiesto ${id} está INVALIDADO y no se puede aplicar`
        + `${registro?.motivo ? `: ${registro.motivo}` : ''}. Genera una simulación nueva.`);
    }
  }
  throw new Error(`No hay manifiesto de simulación: ${ruta}. La simulación es obligatoria antes de aplicar.`);
}

/**
 * Mueve un manifiesto a `invalidados/` dejando un registro con el motivo. No se borra nunca: el
 * artefacto obsoleto sigue siendo la prueba de qué se calculó y con qué reglas.
 */
export function invalidaManifiesto(federacion, id, motivo, opciones = {}) {
  const carpeta = carpetaTrabajo(opciones);
  const origen = join(carpeta, `${federacion}-${id}.manifiesto.json`);
  if (!existsSync(origen)) throw new Error(`No hay manifiesto que invalidar: ${origen}`);
  const destino = join(carpeta, 'invalidados');
  mkdirSync(destino, { recursive: true });
  const manifiesto = JSON.parse(readFileSync(origen, 'utf8'));
  manifiesto.obsoleto = true;
  manifiesto.motivo_obsolescencia = motivo;
  writeFileSync(join(destino, `${federacion}-${id}.manifiesto.json`), JSON.stringify(manifiesto, null, 1));
  writeFileSync(join(destino, `${federacion}-${id}.invalidado.json`), JSON.stringify({
    federacion, id, motivo,
    invalidado_en: new Date().toISOString(),
    version_extractor: manifiesto.version_extractor,
    resumen: manifiesto.resumen,
  }, null, 1));
  rmSync(origen, { force: true });
  return join(destino, `${federacion}-${id}.invalidado.json`);
}

/* ------------------------------------------------------------------ */
/* Aplicar                                                             */
/* ------------------------------------------------------------------ */

export const rutaAplicado = (federacion, id, opciones = {}) =>
  join(carpetaTrabajo(opciones), `${federacion}-${id}.aplicado.json`);

function leeDiario(ruta) {
  if (!existsSync(ruta)) return [];
  return readFileSync(ruta, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const claveJornada = (j) => `${j.temporada}|${j.competicion}|${j.grupo}|J${j.numero}`;

/**
 * Comprueba TODO antes de escribir nada. Devuelve la lista de problemas; vacía = se puede aplicar.
 *
 * Acepta dos estados por fila y no uno: la huella ANTERIOR si la jornada aún no se ha hecho, y la
 * POSTERIOR si ya se hizo. Sin eso, reanudar un lote interrumpido se rechazaría a sí mismo, que es la
 * forma más rápida de que alguien acabe aplicando con las comprobaciones desactivadas.
 */
/**
 * Problemas que impiden aplicar el lote. `hechas` son las jornadas ya confirmadas por una invocación
 * anterior y `previo` el fichero `.aplicado.json` de aquélla —de ahí sale si aquella vez se retiraron las
 * fantasma, que es lo que distingue «ya retirada» de «pendiente de retirar»—.
 */
export function revisaAplicacion(federacion, manifiesto, hechas, opciones = {}, previo = null) {
  const problemas = [];
  const db = abreCola(rutaCola(federacion, opciones));
  try {
    for (const j of manifiesto.jornadas) {
      // Una jornada entra en el lote si tiene algo que hacer: correcciones, retiradas o recuperaciones.
      if (!j.cambios.length && !(opciones.retirar && j.retiradas?.length)
        && !(opciones.recuperar && j.recuperadas?.length)) continue;
      const yaHecha = hechas.has(claveJornada(j));
      const archivo = leerArchivo(j.archivo);
      if (!archivo) problemas.push(`J${j.numero} g${j.grupo}: falta el HTML archivado`);
      else if (huella(archivo.contenido) !== j.huella_html) problemas.push(`J${j.numero} g${j.grupo}: el HTML cambió desde la simulación`);

      const filas = db.prepare(`select ${CAMPOS} from partidos
        where temporada=? and competicion=? and grupo=? and jornada=? order by orden`)
        .all(j.temporada, j.competicion, j.grupo, j.numero);
      /*
       * Las RECUPERACIONES se comprueban igual que las correcciones: la fila tiene que estar como la dejó la
       * simulación (antes, si la jornada no se ha hecho; después, si ya se hizo). Reanudar un lote
       * interrumpido no puede rechazarse a sí mismo.
       */
      for (const c of [...j.cambios, ...(opciones.recuperar ? (j.recuperadas ?? []) : [])]) {
        const actual = filas.find((f) => f.orden === c.orden);
        const esperada = yaHecha ? c.huella_despues : c.huella_antes;
        if (huellaFila(actual) !== esperada) {
          problemas.push(`J${j.numero} g${j.grupo} ord ${c.orden}: la fila ${yaHecha ? 'ya aplicada' : 'objetivo'} no está como `
            + `la dejó la simulación (${huellaFila(actual)} ≠ ${esperada})`);
        }
      }
      /*
       * Retiradas: la fila tiene que estar EXACTAMENTE como la simulación la vio. Si la jornada ya está
       * hecha, lo que se exige es lo contrario: que NO esté. Sin esta segunda mitad, reanudar un lote
       * interrumpido se rechazaría a sí mismo.
       *
       * Pero «ya hecha» no siempre significa «ya retirada»: un lote se puede haber aplicado SIN
       * `--retirar-fantasma`, y entonces la fantasma no falta porque ya no esté, sino porque esa
       * invocación no la tocó. Decir «ya retirada» ahí sería afirmar algo falso sobre lo que pasó, así que
       * el mensaje lo distingue y dice qué hace falta: un manifiesto nuevo (una simulación posterior al
       * lote ya aplicado), que es la forma de retirar sobre un estado que ya cambió.
       */
      if (opciones.retirar) {
        for (const r of j.retiradas ?? []) {
          const actual = filas.find((f) => f.orden === r.orden);
          if (yaHecha) {
            const conRetirada = previo?.retirada_fantasma === true;
            if (actual && conRetirada) {
              problemas.push(`J${j.numero} g${j.grupo} ord ${r.orden}: la fila fantasma ya retirada sigue en la cola`);
            } else if (actual) {
              problemas.push(`J${j.numero} g${j.grupo} ord ${r.orden}: la jornada ya está aplicada SIN retirada `
                + '(el lote se aplicó sin `--retirar-fantasma`), así que esta fantasma sigue pendiente; '
                + 'retirarla necesita un manifiesto nuevo: simula otra vez y aplica ese lote con `--retirar-fantasma`');
            }
          } else if (huellaFila(actual) !== r.huella_antes) {
            problemas.push(`J${j.numero} g${j.grupo} ord ${r.orden}: la fila a retirar cambió desde la simulación `
              + `(${huellaFila(actual)} ≠ ${r.huella_antes})`);
          }
        }
      } else if ((j.retiradas?.length ?? 0) > 0) {
        // Sin `--retirar-fantasma` las fantasma no se tocan, y se dice: que no se retiren no es que no existan.
        void 0;
      }
      if (!yaHecha) {
        const enCurso = db.prepare(`select count(*) n from trabajos where tipo='jornada' and estado='en_curso'
          and temporada=? and competicion=? and grupo=? and jornada=?`)
          .get(j.temporada, j.competicion, j.grupo, j.numero).n;
        if (enCurso > 0) problemas.push(`J${j.numero} g${j.grupo}: hay un trabajo en_curso del worker`);
      }
    }
  } finally {
    db.close();
  }
  return problemas;
}

/** Aplica el lote. Una transacción por jornada, diario en fichero aparte y copia previa por la API. */
export async function aplica(federacion, idManifiesto, opciones = {}) {
  const manifiesto = leeManifiesto(federacion, idManifiesto, opciones);
  const version = versionDe(opciones);
  const invalido = compruebaVigencia(manifiesto, version);
  if (invalido.length) {
    throw new Error(`El manifiesto ${idManifiesto} no está vigente:\n  ${invalido.join('\n  ')}\nGenera una simulación nueva.`);
  }
  const incoherente = compruebaCoherencia(manifiesto);
  if (incoherente.length) throw new Error(`El manifiesto no cuadra consigo mismo:\n  ${incoherente.slice(0, 8).join('\n  ')}`);

  const previo = existsSync(rutaAplicado(federacion, idManifiesto, opciones))
    ? JSON.parse(readFileSync(rutaAplicado(federacion, idManifiesto, opciones), 'utf8'))
    : null;
  const hechas = new Set(previo?.jornadas_hechas ?? []);

  tomaBloqueo(federacion, opciones);
  try {
    // Puertas de seguridad ANTES de copiar nada.
    const problemas = revisaAplicacion(federacion, manifiesto, hechas, opciones, previo);
    if (problemas.length) {
      throw new Error(`El lote no se puede aplicar (${problemas.length} problema(s)):\n  ${problemas.slice(0, 12).join('\n  ')}`);
    }
    fsPreparaCarpeta(opciones);

    // Copia previa con la API de backup de SQLite (consistente con el WAL abierto). Si se reanuda, se
    // conserva la del primer intento: es la copia de ANTES del lote, no de antes de la reanudación.
    const sello = previo?.sello ?? new Date().toISOString().replace(/[:.]/g, '-');
    const rutaBackup = previo?.ruta_backup ?? join(carpetaTrabajo(opciones), `${federacion}-${sello}.previa.sqlite`);
    if (!existsSync(rutaBackup)) {
      const origen = new DatabaseSync(rutaCola(federacion, opciones), { readOnly: true });
      await backup(origen, rutaBackup);
      origen.close();
    }
    const bytesBackup = statSync(rutaBackup).size;

    const rutaDiario = previo?.ruta_diario ?? join(carpetaTrabajo(opciones), `${federacion}-${sello}.diario.jsonl`);
    // `filas` es el acumulado de las filas que el lote ha escrito; `filas_nuevas` es lo que ha escrito
    // ESTA invocación. Sin separarlos, reaplicar un lote ya completo informaba de 2 filas aplicadas
    // cuando no había escrito ninguna, y eso es exactamente el tipo de cifra que no se puede publicar.
    let aplicadas = previo?.filas ?? 0;
    let recuperadasEscritas = previo?.recuperadas ?? 0;
    let jornadasHechas = hechas.size;
    const filasPrevias = aplicadas;
    const jornadasPrevias = jornadasHechas;
    const escritura = abreCola(rutaCola(federacion, opciones), { escritura: true });
    try {
      for (const j of manifiesto.jornadas) {
        const retiradasDeJornada = opciones.retirar ? (j.retiradas ?? []) : [];
        const recuperadasDeJornada = opciones.recuperar ? (j.recuperadas ?? []) : [];
        if (!j.cambios.length && !retiradasDeJornada.length && !recuperadasDeJornada.length) continue;
        if (hechas.has(claveJornada(j))) continue;
        // UNA transacción por jornada. Si se interrumpe aquí, lo anterior queda confirmado y coherente.
        const loteDiario = [];
        escritura.exec('begin immediate');
        try {
          // Las correcciones de siempre y las RECUPERACIONES son la misma escritura —un `update` de la
          // pareja— y por eso van juntas y con el mismo diario, que ya sabe deshacerse.
          for (const c of [...j.cambios, ...recuperadasDeJornada]) {
            const d = c.despues;
            escritura.prepare(`update partidos set equipo_local_codigo=?, equipo_visitante_codigo=?, local=?, visitante=?,
                actualizado_en=? where temporada=? and competicion=? and grupo=? and jornada=? and orden=?`)
              .run(d.equipo_local_codigo, d.equipo_visitante_codigo, d.local, d.visitante, new Date().toISOString(),
                j.temporada, j.competicion, j.grupo, j.numero, c.orden);
            loteDiario.push({
              lote: manifiesto.id, federacion,
              operacion: c.motivo ? 'recuperacion' : 'actualizacion',
              temporada: j.temporada, competicion: j.competicion,
              grupo: j.grupo, jornada: j.numero, orden: c.orden,
              antes: c.antes, despues: d, huella_antes: c.huella_antes, huella_despues: c.huella_despues,
              // El motivo viaja al diario: dentro de un año, «por qué se cambió esta pareja» tiene que
              // responderse sin abrir el manifiesto.
              motivo: c.motivo ?? null,
            });
          }
          /*
           * Retirada de filas fantasma. Va DENTRO de la misma transacción que las correcciones de la
           * jornada: o queda la jornada entera coherente, o no queda nada. El diario guarda la fila ENTERA
           * en `antes`, porque retirar no es un `update` y la reversión no puede restaurar lo que no copió.
           */
          for (const r of retiradasDeJornada) {
            escritura.prepare(`delete from partidos where temporada=? and competicion=? and grupo=? and jornada=? and orden=?`)
              .run(j.temporada, j.competicion, j.grupo, j.numero, r.orden);
            loteDiario.push({
              lote: manifiesto.id, federacion, operacion: 'retirada',
              temporada: j.temporada, competicion: j.competicion,
              grupo: j.grupo, jornada: j.numero, orden: r.orden,
              antes: r.antes, despues: null, huella_antes: r.huella_antes, huella_despues: 'ausente',
            });
          }
          escritura.exec('commit');
        } catch (error) {
          escritura.exec('rollback');
          throw new Error(`Jornada J${j.numero} g${j.grupo} revertida sin aplicar (${error.message}); `
            + 'las anteriores quedaron confirmadas y el lote se puede reanudar con el mismo id');
        }
        // Sólo se escribe en el diario lo YA confirmado: un diario con filas de una transacción
        // revertida haría que la reversión deshiciera cosas que nunca se hicieron.
        appendFileSync(rutaDiario, loteDiario.map((d) => JSON.stringify(d)).join('\n') + '\n');
        aplicadas += loteDiario.length;
        recuperadasEscritas += loteDiario.filter((d) => d.operacion === 'recuperacion').length;
        hechas.add(claveJornada(j));
        jornadasHechas = hechas.size;
        // El progreso se persiste tras CADA jornada: es lo que hace reanudable una interrupción.
        writeFileSync(rutaAplicado(federacion, idManifiesto, opciones), JSON.stringify({
          manifiesto: manifiesto.id, federacion, sello, ruta_backup: rutaBackup, bytes_backup: bytesBackup,
          ruta_diario: rutaDiario, filas: aplicadas, jornadas: jornadasHechas,
          filas_nuevas: aplicadas - filasPrevias,
          jornadas_nuevas: jornadasHechas - jornadasPrevias,
          retiradas: aplicadas,
          retirada_fantasma: Boolean(opciones.retirar),
          recuperadas: recuperadasEscritas,
          recuperar_desplazados: Boolean(opciones.recuperar),
          jornadas_hechas: [...hechas].sort(),
          ambiguos_excluidos: manifiesto.resumen.ambiguos,
          completo: false,
        }, null, 1));
      }
    } finally {
      escritura.close();
    }
    const aplicado = {
      manifiesto: manifiesto.id, federacion, sello, ruta_backup: rutaBackup, bytes_backup: bytesBackup,
      ruta_diario: rutaDiario, filas: aplicadas, jornadas: jornadasHechas,
      filas_nuevas: aplicadas - filasPrevias,
      jornadas_nuevas: jornadasHechas - jornadasPrevias,
      retirada_fantasma: Boolean(opciones.retirar),
      recuperadas: recuperadasEscritas,
      recuperar_desplazados: Boolean(opciones.recuperar),
      jornadas_hechas: [...hechas].sort(),
      ambiguos_excluidos: manifiesto.resumen.ambiguos,
      completo: true,
      terminado_en: new Date().toISOString(),
    };
    writeFileSync(rutaAplicado(federacion, idManifiesto, opciones), JSON.stringify(aplicado, null, 1));
    return aplicado;
  } finally {
    sueltaBloqueo(federacion, opciones);
  }
}

function fsPreparaCarpeta(opciones) {
  mkdirSync(carpetaTrabajo(opciones), { recursive: true });
}

/* ------------------------------------------------------------------ */
/* Verificar y revertir                                                */
/* ------------------------------------------------------------------ */

function leeAplicado(federacion, id, opciones = {}) {
  const ruta = rutaAplicado(federacion, id, opciones);
  if (!existsSync(ruta)) throw new Error(`No hay lote aplicado con el id ${id}`);
  return JSON.parse(readFileSync(ruta, 'utf8'));
}

export function verifica(federacion, idManifiesto, opciones = {}) {
  const aplicado = leeAplicado(federacion, idManifiesto, opciones);
  const diario = leeDiario(aplicado.ruta_diario);
  const db = abreCola(rutaCola(federacion, opciones));
  const malas = [];
  try {
    for (const d of diario) {
      const actual = db.prepare(`select ${CAMPOS} from partidos
        where temporada=? and competicion=? and grupo=? and jornada=? and orden=?`)
        .get(d.temporada, d.competicion, d.grupo, d.jornada, d.orden);
      if (huellaFila(actual) !== d.huella_despues) malas.push(`${d.grupo} J${d.jornada} ord ${d.orden}`);
    }
  } finally { db.close(); }
  return {
    filas: diario.length, correctas: diario.length - malas.length, malas,
    copia_previa: aplicado.ruta_backup, completo: aplicado.completo !== false,
  };
}

/**
 * Reversión. Se comprueba TODO antes de tocar nada: si una fila cambió después del lote, revertir a
 * ciegas borraría trabajo ajeno.
 */
export function revierte(federacion, idManifiesto, opciones = {}) {
  const aplicado = leeAplicado(federacion, idManifiesto, opciones);
  const diario = leeDiario(aplicado.ruta_diario);
  tomaBloqueo(federacion, opciones);
  try {
    const db = abreCola(rutaCola(federacion, opciones), { escritura: true });
    try {
      const conflictos = [];
      for (const d of diario) {
        const actual = db.prepare(`select ${CAMPOS} from partidos
          where temporada=? and competicion=? and grupo=? and jornada=? and orden=?`)
          .get(d.temporada, d.competicion, d.grupo, d.jornada, d.orden);
        if (huellaFila(actual) !== d.huella_despues) conflictos.push(`${d.grupo} J${d.jornada} ord ${d.orden}`);
      }
      if (conflictos.length && !opciones.forzar) {
        throw new Error(`La reversión se niega: ${conflictos.length} fila(s) cambiaron después del lote `
          + `(${conflictos.slice(0, 6).join(', ')}). Existe una opción explícita para forzarla, pero no debe `
          + 'usarse sin revisar antes qué las cambió.');
      }
      db.exec('begin immediate');
      try {
        for (const d of diario) {
          const a = d.antes;
          if (d.operacion === 'retirada') {
            /*
             * Retirada: la fila NO existe, así que no se restaura con un `update` —afectaría a cero filas y
             * la fila se perdería en silencio—, se vuelve a INSERTAR entera. Es la razón de que el diario
             * guarde la fila completa y no sólo los cuatro campos que se corrigen.
             */
            db.prepare(`insert into partidos (temporada, competicion, grupo, jornada, orden, codigo_acta,
                equipo_local_codigo, equipo_visitante_codigo, local, visitante, goles_local, goles_visitante,
                fecha, hora, campo, campo_codigo, arbitro, actualizado_en)
              values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
              .run(d.temporada, d.competicion, d.grupo, d.jornada, d.orden, a.codigo_acta,
                a.equipo_local_codigo, a.equipo_visitante_codigo, a.local, a.visitante, a.goles_local, a.goles_visitante,
                a.fecha, a.hora, a.campo, a.campo_codigo, a.arbitro, new Date().toISOString());
            continue;
          }
          db.prepare(`update partidos set equipo_local_codigo=?, equipo_visitante_codigo=?, local=?, visitante=?,
              actualizado_en=? where temporada=? and competicion=? and grupo=? and jornada=? and orden=?`)
            .run(a.equipo_local_codigo, a.equipo_visitante_codigo, a.local, a.visitante, new Date().toISOString(),
              d.temporada, d.competicion, d.grupo, d.jornada, d.orden);
        }
        db.exec('commit');
      } catch (error) {
        db.exec('rollback');
        throw error;
      }
    } finally {
      db.close();
    }
    // El lote deja de estar aplicado; el diario y la copia previa NO se borran: son el rastro.
    rmSync(rutaAplicado(federacion, idManifiesto, opciones), { force: true });
    return { filas: diario.length, conflictos: 0, copia_previa: aplicado.ruta_backup, copia_conservada: true };
  } finally {
    sueltaBloqueo(federacion, opciones);
  }
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function main() {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const federacion = arg('federacion');
  if (!federacion) {
    console.error('Uso: reconstruir-cola --federacion <fed> [--simular | --aplicar <id> | --revertir <id> | --verificar <id>] [--desbloquear]');
    process.exit(1);
  }
  const opciones = { raiz: arg('raiz') };

  if (process.argv.includes('--desbloquear')) {
    sueltaBloqueo(federacion, opciones);
    console.log(`Bloqueo de ${federacion} quitado`);
    return;
  }
  const tras = (bandera) => process.argv[process.argv.indexOf(bandera) + 1];

  if (process.argv.includes('--invalidar')) {
    const id = tras('--invalidar');
    const ruta = invalidaManifiesto(federacion, id, arg('motivo') ?? 'sin motivo declarado', opciones);
    console.log(`Manifiesto ${id} movido a invalidados con su registro: ${ruta}`);
    return;
  }

  if (process.argv.includes('--revertir')) {
    const id = tras('--revertir');
    const r = revierte(federacion, id, { ...opciones, forzar: process.argv.includes('--forzar') });
    console.log(`Lote ${id} revertido: ${r.filas} filas restauradas · copia previa conservada en ${r.copia_previa}`);
    return;
  }
  if (process.argv.includes('--verificar')) {
    const id = tras('--verificar');
    const v = verifica(federacion, id, opciones);
    console.log(`Lote ${id}: ${v.correctas}/${v.filas} filas como las dejó el lote`
      + `${v.completo ? '' : ' (lote INCOMPLETO: sólo se aplicaron esas jornadas)'}`
      + `${v.malas.length ? ` · MAL: ${v.malas.slice(0, 8).join(', ')}` : ''}`);
    if (v.malas.length) process.exit(1);
    return;
  }
  if (process.argv.includes('--aplicar')) {
    aplica(federacion, tras('--aplicar'), {
      ...opciones,
      retirar: process.argv.includes('--retirar-fantasma'),
      recuperar: process.argv.includes('--recuperar-desplazados'),
    }).then((a) => {
      console.log(`Aplicado: ${a.filas} filas en ${a.jornadas} jornadas (${a.filas_nuevas} nuevas en esta ejecución)`
        + ` · ${a.ambiguos_excluidos} casos ambiguos quedan fuera`
        + (a.retirada_fantasma ? ' · se retiraron las filas fantasma' : ' · NO se retiraron filas fantasma (usa --retirar-fantasma)')
        + (a.recuperar_desplazados
          ? ` · se RECUPERARON ${a.recuperadas} partidos desplazados`
          : ' · NO se recuperaron partidos desplazados (usa --recuperar-desplazados)'));
      console.log(`  copia previa: ${a.ruta_backup} (${(a.bytes_backup / 1048576).toFixed(1)} MB, no se borra sola)`);
      console.log(`  diario: ${a.ruta_diario}`);
    }).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
    return;
  }

  /* Por defecto: simular (y sin `--aplicar`, jamás escribe). */
  const manifiesto = simula(federacion, opciones);
  const ruta = guardaManifiesto(manifiesto, opciones);
  const r = manifiesto.resumen;
  console.log(`=== simulación · ${federacion} · maqueta ${manifiesto.maqueta}`);
  console.log(`  versión de la reconstrucción: ${manifiesto.version_extractor} (contrato ${manifiesto.version_contrato}, esquema ${manifiesto.esquema_manifiesto})`);
  console.log(`  manifiesto: ${ruta}`);
  console.log(`  id del lote: ${manifiesto.id}`);
  console.log(`  jornadas: ${r.jornadas} · filas: ${r.filas}`);
  console.log(`  partición de las filas: idénticas ${r.identicas} + correcciones ${r.cambios} + ambiguas ${r.ambiguos} + fantasma ${r.filas_fantasma} + recuperadas ${r.filas_recuperadas_por_acta} = ${r.identicas + r.cambios + r.ambiguos + r.filas_fantasma + r.filas_recuperadas_por_acta}`);
  if (r.jornadas_con_evidencia_desfasada > 0) {
    // Ni reconstruidas ni saltadas: fuera del lote porque la evidencia no es la de estas filas. Si no se
    // dijera, la partición anterior parecería cuadrar con la cola entera y no cuadra.
    console.log(`  FUERA del lote · evidencia desfasada: ${r.filas_no_comparables} filas en `
      + `${r.jornadas_con_evidencia_desfasada} jornadas (el HTML del disco ya no es el que la cola registró)`);
    for (const j of manifiesto.jornadas.filter((x) => x.evidencia_desfasada)) {
      const d = j.evidencia_desfasada;
      console.log(`      t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero} · ${j.filas} filas · `
        + `cola ${String(d.huella_cola).slice(0, 12)}… · disco ${d.huella_disco.slice(0, 12)}… · comprobada ${d.comprobada_en ?? '(sin sello)'}`);
    }
  }
  console.log(`  correcciones deterministas (sostenidas por el acta): ${r.cambios} en ${r.jornadas_con_cambios} jornadas`);
  console.log(`  ambiguas (quedan FUERA del lote): ${r.ambiguos}`);
  for (const [motivo, n] of Object.entries(r.ambiguos_por_motivo)) if (n > 0) console.log(`      ${motivo}: ${n}`);
  const conCodigo = manifiesto.jornadas.flatMap((j) => j.cambios).filter((c) => c.codigo_recuperado).length;
  const contextuales = manifiesto.jornadas.flatMap((j) => j.cambios).filter((c) => c.referencia_contextual).length;
  console.log(`  de las correcciones: ${conCodigo} recuperan código federativo · ${contextuales} quedan con referencia contextual (codigo_externo nulo)`);
  const marcadores = new Map();
  for (const c of manifiesto.jornadas.flatMap((j) => j.cambios)) for (const m of c.marcadores) marcadores.set(m, (marcadores.get(m) ?? 0) + 1);
  console.log(`  marcadores de estado quitados: ${[...marcadores.entries()].map(([m, n]) => `${m} ${n}`).join(' · ') || '(ninguno)'}`);
  /*
   * Diagnóstico del defecto de las filas de descanso. Se informa, pero NO entra en el lote: `--aplicar`
   * escribe sólo las correcciones deterministas. Retirar filas fantasma y recuperar partidos perdidos
   * necesita su propio lote reversible, con sus pruebas y su reversión, y eso no se improvisa aquí.
   */
  const f = manifiesto.resumen;
  console.log('\n  ── filas de descanso (diagnóstico, NO entra en el lote) ──');
  console.log(`  filas fantasma en la cola: ${f.filas_fantasma} en ${f.jornadas_con_filas_fantasma} jornadas`
    + ` (${f.filas_fantasma_sin_acta} sin acta, que son las retirables sin más comprobación)`);
  // Los bloques de descanso QUE TRAEN ACTA: el extractor no puede descartarlos sin abrir la acta, así que
  // siguen emitiéndose como partido. Quedan declarados aquí y en el manifiesto, no silenciados.
  const sospechosas = manifiesto.jornadas.flatMap((j) => (j.informativas ?? []).filter((i) => i.sospechosa));
  if (sospechosas.length) {
    console.log(`  bloques de descanso QUE TRAEN ACTA (no se pueden descartar sin abrirla): ${sospechosas.length}`);
    for (const s of sospechosas.slice(0, 3)) console.log(`      «${s.local}» vs «${s.visitante}»`);
    /*
     * Cuántos de esos bloques ya NO tienen fila en la cola. Es la huella que deja un lote de retirada, y se
     * publica porque es la única forma de verlo desde aquí. Lo que prueba es que la cola HOY no tiene esa
     * fila —no que la retirara este lote—, y por eso el texto lo dice así: quién la retiró lo dice el diario.
     */
    const sinFilaEnLaCola = sospechosas.filter((s) => s.en_la_cola === false).length;
    if (sinFilaEnLaCola > 0) {
      console.log(`      de ellos, ${sospechosas.length - sinFilaEnLaCola} siguen en la cola y ${sinFilaEnLaCola} ya no:`
        + ' la fuente sigue publicando el bloque y la cola no tiene la fila (retirada por un lote, o nunca guardada)');
    }
  }
  console.log(`  partidos que el HTML publica y la cola no tiene: ${f.partidos_recuperados}`);
  if (f.filas_desplazadas > 0) {
    /*
     * Un partido desplazado es lo contrario de una fantasma: la fila SÍ esconde un partido. Por eso se
     * publica aparte y con el equipo que falta: es la acción (recuperar, no borrar) la que cambia.
     */
    console.log(`  partidos DESPLAZADOS (el acta dice que ahí hubo partido): ${f.filas_desplazadas}`
      + ` · RECUPERABLES ${f.filas_recuperables} · NO se retiran`);
    for (const j of manifiesto.jornadas) {
      for (const d of j.desplazadas ?? []) {
        const recuperable = (j.recuperadas ?? []).some((r) => r.orden === d.orden);
        console.log(`      t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero} ord ${d.orden}: `
          + `la cola dice «${d.en_la_cola}» y el acta ${d.codigo_acta} dice «${d.dice_el_acta}»`
          + `${d.equipo_que_la_cola_no_tiene ? ` · falta «${d.equipo_que_la_cola_no_tiene}»` : ''}`
          + ` · ${recuperable ? 'SE RECUPERA con --recuperar-desplazados' : 'NO se recupera: la pareja del acta ya está en la jornada, o no resuelve'}`);
      }
    }
  }
  console.log(`  filas que comparten acta con otra de su jornada: ${f.filas_duplicadas}`);
  if (f.filas_fantasma > 0) {
    const ejemplos = manifiesto.jornadas.filter((j) => (j.filasFantasma?.length ?? 0) > 0).slice(0, 3);
    for (const j of ejemplos) {
      console.log(`    t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}:`);
      for (const fantasma of (j.filasFantasma ?? []).slice(0, 2)) {
        console.log(`      ord ${fantasma.orden}: «${fantasma.local}» vs «${fantasma.visitante}»`
          + ` · descansa «${fantasma.equipo_que_descansa ?? '?'}» · acta: ${fantasma.acta}`);
      }
    }
  }
  /*
   * El veredicto del acta, contado. Es lo que decide si una fantasma se puede retirar, así que se publica
   * aunque sea cero: «ninguna acta nombra dos equipos reales» es una afirmación, y tiene que verse.
   */
  if (f.filas_fantasma_con_acta > 0) {
    console.log(`  fantasma CON acta: ${f.filas_fantasma_con_acta}`
      + ` · el acta nombra el descanso ${f.filas_fantasma_con_acta_de_descanso}`
      + ` · el acta nombra DOS equipos reales ${f.filas_fantasma_con_acta_de_partido}`
      + ` · el acta no demuestra nada ${f.filas_fantasma_con_acta - f.filas_fantasma_con_acta_de_descanso - f.filas_fantasma_con_acta_de_partido}`);
    console.log(`  retirables: ${f.filas_retirables}`
      + ` (${f.filas_fantasma_sin_acta} sin acta + ${f.filas_fantasma_con_acta_de_descanso} con acta que nombra el descanso)`);
  }
  console.log('\n  primeras 8 jornadas con cambios:');
  for (const j of manifiesto.jornadas.filter((x) => x.cambios.length).slice(0, 8)) {
    console.log(`    t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}: ${j.cambios.length} corrección(es), ${j.ambiguos.length} ambigua(s)`);
    for (const c of j.cambios.slice(0, 2)) console.log(`        ord ${c.orden}: «${c.antes.local} vs ${c.antes.visitante}» → «${c.despues.local} vs ${c.despues.visitante}»`);
  }
  console.log('\n  nada se ha escrito: para aplicar hace falta `--aplicar ' + manifiesto.id + '`');
}

// En Windows y bajo `tsx` comparar cadenas de URL falla (dos barras contra tres), así que se compara
// con `pathToFileURL`, que es lo que usa el propio Node para construir `import.meta.url`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    // Los rechazos de esta herramienta son su razón de ser, así que se imprimen como un MENSAJE y no como
    // una traza de pila. Una traza de nueve líneas esconde la frase que explica por qué se ha rechazado el
    // lote, y un rechazo que el operador no entiende acaba con las comprobaciones desactivadas.
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
