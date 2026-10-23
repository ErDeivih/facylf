#!/usr/bin/env node
/*
 * ¿FALTA ALGÚN FICHERO EN DISCO? La pregunta que decide si algo se ha perdido de verdad.
 *
 * Por qué. La cola guarda, por cada acta `hecha`, la ruta del HTML archivado (`actas.archivo`) y el JSON del
 * análisis a su lado (`acta-<codigo>.json`). Esos ficheros son la EVIDENCIA de ingesta: si desaparecen, el acta
 * ya no se puede volver a analizar con un parser mejor —y eso ya pasó una vez, con 1.521 actas de Asturias—.
 * Hasta ahora se sabía cuántos grupos y cuántas actas hay, pero NO se había recorrido el disco acta a acta para
 * comprobar que el fichero que la cola dice tener está donde dice. Sin esa medida, «cuánto se ha perdido» era
 * una impresión, no un número.
 *
 * Cómo lo mira. Sólo lectura, y con la MISMA regla de rutas que usa el recolector para leer
 * (`leeArchivo`, scripts/lib/recolector-local.mjs): una ruta guardada vale si existe tal cual o si existe con
 * `.gz` detrás —el recolector comprime a partir de 8 KB y guarda una u otra—. Aquí se copia esa regla en vez de
 * importarla para no arrastrar el recolector entero (que exige `packages/ingesta` compilado) a una herramienta
 * que sólo mira el disco; si la regla cambia, cambia en los dos sitios y este comentario es el aviso.
 *
 * Y separa lo que NO es una pérdida, porque un fichero que falta no siempre es un dato perdido:
 *
 *   · la ruta plana no existe pero su `.gz` sí  → fila vieja, `leeArchivo` la resuelve; NO es pérdida;
 *   · el acta ya está en el canónico            → el dato vive en PostgreSQL; el fichero era la evidencia;
 *   · el análisis vive en la cola               → `actas.datos` (el JSON del parser) y las tablas
 *                                                 `participaciones`/`eventos_acta`/`tecnicos_acta`: el importador
 *                                                 lee de ahí, no del fichero, así que se reimporta igual;
 *   · no hay fichero, ni datos, ni canónico      → SÓLO volviendo a pedirlo. Esto es lo irrecoverable.
 *
 * Uso:
 *   node scripts/mide-archivos-que-faltan.mjs                    · todas las colas y el resumen
 *   node scripts/mide-archivos-que-faltan.mjs --federacion asturias
 *   node scripts/mide-archivos-que-faltan.mjs --actas 60         · cuántas actas lista al final
 *   node scripts/mide-archivos-que-faltan.mjs --json
 *
 * El detalle completo queda en pruebas/reconstruccion/archivos-que-faltan.json.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'archivos-que-faltan.json');
const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const { DatabaseSync } = requerir('node:sqlite');
const { Client } = requerir('pg');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const filtro = arg('federacion');
const cuantasActas = Number(arg('actas') ?? 40);
const soloJson = argumentos.includes('--json');

const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* sin .env no hay canónico */ }
}

/* ── La regla de rutas del recolector, copiada a propósito (v. la cabecera) ──────────────────────────── */

/**
 * ── LA RUTA PUEDE VENIR DEL CONTENEDOR, NO DE ESTE DISCO ──────────────────────────────────────────────
 *
 * Cuatro recolectores corren en Docker con el repositorio montado en `/app` (`docker/compose.yml`:
 * `../descargas-valencia:/app/descargas-valencia`) y guardan la ruta que ven ELLOS, que es la misma carpeta
 * vista desde dentro. Medido el 26/09/2026: la PRIMERA pasada de esta herramienta dio 24.524 «ficheros que
 * faltan» y los 24.524 empezaban por `/app/`; de los 16.616 de Valencia, el fichero estaba en su sitio. Sin
 * esta traducción el instrumento se inventa la pérdida entera — es el cuarto «hallazgo» de esta tarea que
 * resulta ser el instrumento, y por eso la traducción se cuenta y se dice en el parte, en vez de esconderse.
 *
 * Se prueba la ruta tal cual Y la traducida: el día que una cola guarde la ruta del disco, sigue valiendo.
 */
function rutaEnEsteDisco(ruta) {
  if (!ruta.startsWith('/app/')) return ruta;
  return join(RAIZ, ruta.slice('/app/'.length));
}

/** ¿Dónde está el archivo archivado: tal cual (`plano`), con `.gz` detrás, o en ningún sitio (`null`)? */
function dondeEsta(ruta) {
  if (ruta === null || ruta === undefined || ruta === '') return null;
  if (existsSync(ruta)) return 'plano';
  if (existsSync(`${ruta}.gz`)) return 'gz';
  return null;
}

/** El JSON del análisis que acompaña a un HTML archivado: quita el `.gz` ANTES de cambiar la extensión. */
function rutaJsonDeArchivo(ruta) {
  const sinComprimir = /\.gz$/i.test(ruta) ? ruta.slice(0, -3) : ruta;
  if (/\.json$/i.test(sinComprimir)) return sinComprimir;
  if (/\.html?$/i.test(sinComprimir)) return sinComprimir.replace(/\.html?$/i, '.json');
  return `${sinComprimir}.json`;
}

function colas() {
  const salida = [];
  for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
    if (entrada.name === 'descargas-federacion-sondeo' || entrada.name === 'descargas-prueba-10gb') continue;
    const ruta = join(RAIZ, entrada.name, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta)) continue;
    if (existsSync(join(RAIZ, entrada.name, '.PRUEBA'))) continue;
    const federacion = entrada.name === 'descargas-federacion' ? 'castilla-leon' : entrada.name.replace('descargas-', '');
    if (filtro && federacion !== filtro) continue;
    salida.push({ federacion, ruta });
  }
  return salida.sort((a, b) => a.federacion.localeCompare(b.federacion, 'es'));
}

/* ── 1. Los códigos de acta que el canónico YA TIENE (si hay lector configurado) ─────────────────────── */
const url = (process.env.DATABASE_URL_LECTOR ?? '').trim();
let cliente = null;
const enElCanonico = new Set();
if (url === '') {
  console.error('Aviso: sin DATABASE_URL_LECTOR no se puede decir cuáles de las que faltan ya están en el');
  console.error('       canónico (el dato no se perdería). El resto de la comprobación se hace igual.');
} else {
  cliente = new Client({ connectionString: url, statement_timeout: 300_000 });
  try {
    await cliente.connect();
    const { rows } = await cliente.query('select archivo_ruta from core.match_report where archivo_ruta is not null');
    for (const r of rows) {
      const m = /acta-(\d+)/.exec(r.archivo_ruta);
      if (m !== null) enElCanonico.add(m[1]);
    }
    await cliente.end();
    cliente = null;
  } catch (error) {
    console.error(`Aviso: no se pudo consultar el canónico (${error.message}); se sigue sin ese cruce.`);
    try { if (cliente !== null) await cliente.end(); } catch { /* ya estaba cerrado */ }
    cliente = null;
  }
}

/* ── 2. Recorrer las colas acta a acta y mirar el disco ─────────────────────────────────────────────── */

/** Las actas `hecha` cuyo fichero NO está donde la cola dice, con todo lo que hace falta para juzgarlas. */
const faltan = [];
const porFederacion = [];
let hechasTotales = 0;
let conFicheroTotales = 0;
let sinRutaTotales = 0;
let rescatesPorGz = 0;
let rutasDelContenedorTotales = 0;

for (const { federacion, ruta } of colas()) {
  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 10_000 });
  const suyo = {
    federacion, hechas: 0, conFichero: 0, sinRuta: 0, faltan: 0, rescatesPorGz: 0, rutasDelContenedor: 0,
    faltanEnElCanonico: 0, faltanConDatosEnLaCola: 0, faltanSinNada: 0,
  };
  try {
    /*
     * Se piden SÓLO columnas pequeñas: `datos` es el JSON del parser (decenas de KB por acta) y traerlo para
     * 427.000 actas serían gigas de lectura para nada. Si el acta falta, se va a por `datos` una por una.
     */
    const filas = db.prepare(`select codigo, temporada, competicion, grupo, jornada, archivo
        from actas where estado = 'hecha'`).all();
    for (const f of filas) {
      suyo.hechas += 1;
      hechasTotales += 1;
      if (f.archivo === null || f.archivo === '') {
        // `hecha` sin ruta de archivo: no hay nada que comprobar en disco. Es otra cosa, y se cuenta aparte,
        // porque un acta sin fichero archivado no se puede reanalizar pero puede estar perfectamente guardada.
        suyo.sinRuta += 1;
        sinRutaTotales += 1;
        continue;
      }
      const enDisco = rutaEnEsteDisco(f.archivo);
      if (enDisco !== f.archivo) {
        suyo.rutasDelContenedor += 1;
        rutasDelContenedorTotales += 1;
      }
      const donde = dondeEsta(enDisco);
      if (donde !== null) {
        suyo.conFichero += 1;
        conFicheroTotales += 1;
        if (donde === 'gz') { suyo.rescatesPorGz += 1; rescatesPorGz += 1; }
        continue;
      }
      suyo.faltan += 1;
      /*
       * El detalle se pide de una en una y sólo para las que faltan: es la única consulta de esta herramienta
       * que lee `datos`, y sirve para saber si el análisis sobrevive en la cola aunque el fichero no esté.
       */
      let detalle = { datosBytes: 0, participaciones: 0, eventos: 0, tecnicos: 0, calidad: null, incidencias: null, hash: null };
      try {
        detalle = db.prepare(`select
            case when a.datos is null then 0 else length(a.datos) end as datosBytes,
            a.calidad, a.incidencias, a.hash,
            (select count(*) from participaciones p where p.temporada = a.temporada and p.competicion = a.competicion
               and p.grupo = a.grupo and p.jornada = a.jornada and p.acta = a.codigo) as participaciones,
            (select count(*) from eventos_acta e where e.temporada = a.temporada and e.competicion = a.competicion
               and e.grupo = a.grupo and e.jornada = a.jornada and e.acta = a.codigo) as eventos,
            (select count(*) from tecnicos_acta t where t.temporada = a.temporada and t.competicion = a.competicion
               and t.grupo = a.grupo and t.jornada = a.jornada and t.acta = a.codigo) as tecnicos
          from actas a
         where a.temporada = ? and a.competicion = ? and a.grupo = ? and a.jornada = ? and a.codigo = ?`)
          .get(f.temporada, f.competicion, f.grupo, f.jornada, f.codigo) ?? detalle;
      } catch { /* una cola antigua sin alguna tabla: el detalle se queda a cero, la falta ya está contada */ }
      const json = rutaJsonDeArchivo(enDisco);
      const acta = {
        federacion,
        codigo: String(f.codigo),
        temporada: String(f.temporada),
        competicion: String(f.competicion),
        grupo: String(f.grupo),
        jornada: Number(f.jornada),
        archivo: f.archivo,
        // Si la ruta venía del contenedor, se dice cuál es la de este disco: sin eso, volver a mirar el caso
        // a mano lleva otra vez a un directorio que no existe aquí.
        archivoEnEsteDisco: enDisco,
        html: donde,
        json: dondeEsta(json),
        datosBytes: Number(detalle.datosBytes ?? 0),
        participaciones: Number(detalle.participaciones ?? 0),
        eventos: Number(detalle.eventos ?? 0),
        tecnicos: Number(detalle.tecnicos ?? 0),
        calidad: detalle.calidad ?? null,
        incidencias: detalle.incidencias ?? null,
        hash: detalle.hash ?? null,
        enElCanonico: enElCanonico.has(String(f.codigo)),
        url: null,
      };
      acta.sobreviveEnLaCola = acta.datosBytes > 0 || acta.participaciones > 0 || acta.eventos > 0 || acta.tecnicos > 0;
      /*
       * El juicio, en este orden: primero el canónico (el dato ya está en PostgreSQL), después la cola (el
       * análisis y las tablas estructuradas siguen ahí y el importador lee de ahí), y si no, queda pedirla.
       */
      acta.veredicto = acta.enElCanonico ? 'en el canónico'
        : acta.sobreviveEnLaCola ? 'el análisis vive en la cola'
          : 'SIN NADA: sólo volviendo a pedirla';
      // La URL con la que se pidió, para poder volver a pedirla: la guarda la propia cola en `peticiones`.
      try {
        const fila = db.prepare('select url from peticiones where trabajo = ? order by id desc limit 1')
          .get(`acta|${f.temporada}|${f.competicion}|${f.grupo}|${f.jornada}|${f.codigo}`);
        acta.url = fila?.url ?? null;
      } catch { /* sin tabla de peticiones no hay URL, pero la falta sigue contada */ }
      if (acta.enElCanonico) suyo.faltanEnElCanonico += 1;
      else if (acta.sobreviveEnLaCola) suyo.faltanConDatosEnLaCola += 1;
      else suyo.faltanSinNada += 1;
      faltan.push(acta);
    }
  } catch (error) {
    console.error(`  ${federacion}: no se pudo leer la cola (${error.message})`);
  } finally {
    db.close();
  }
  porFederacion.push(suyo);
  process.stderr.write(`  ${federacion.padEnd(20)} actas hechas ${String(suyo.hechas).padStart(7)} · faltan ${String(suyo.faltan).padStart(5)}\n`);
}

const sinNada = faltan.filter((a) => a.veredicto.startsWith('SIN NADA'));
const parte = {
  cuando: new Date().toISOString(),
  actasHechasEnLasColas: hechasTotales,
  actasConFicheroEnDisco: conFicheroTotales,
  actasQueFaltan: faltan.length,
  actasSinRutaDeArchivo: sinRutaTotales,
  rescatesPorGz: rescatesPorGz,
  /** Actas cuya ruta guardada venía del contenedor (`/app/…`) y se tradujo a la de este disco. */
  rutasDelContenedor: rutasDelContenedorTotales,
  canonicosConsultados: enElCanonico.size,
  actasQueSoloSeRecuperanVolviendoAPedir: sinNada.length,
  porFederacion: porFederacion.filter((f) => f.hechas > 0),
  faltan,
};
/*
 * ── Y NO SE SOBREESCRIBE LA LISTA COMPLETA CUANDO SE MIDE UNA SOLA FEDERACIÓN ──────────────────────────────
 *
 * `archivos-que-faltan.json` es la ENTRADA de `pnpm cola:volver-a-pedir`: si una medición con `--federacion`
 * la dejara con una sola federación dentro, la recuperación se quedaría corta sin que nadie lo note. Pasó el
 * 27/09/2026 (el autor de esta herramienta lo hizo): el fichero acabó con Cataluña sólo y la orden de recuperar
 * el resto dijo «no hay ninguna acta que devolver». Con filtro, el parte se imprime y no se toca el fichero.
 */
if (filtro === null) {
  writeFileSync(SALIDA, `${JSON.stringify(parte, null, 2)}\n`);
} else {
  console.error(`  (medición de sólo «${filtro}»: NO se sobreescribe ${SALIDA.replace(`${RAIZ}\\`, '')}.`);
  console.error('   La lista completa —que es la que usa `pnpm cola:volver-a-pedir`— se genera sin --federacion.)');
}

if (soloJson) {
  console.log(JSON.stringify(parte, null, 2));
  process.exit(0);
}

const pct = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(4)} %`);
console.log(`═══ ¿falta algún fichero en disco? · ${new Date().toLocaleString('es-ES')}`);
console.log('');
console.log(`  actas \`hecha\` en las colas                 ${String(hechasTotales).padStart(7)}`);
console.log(`    con su fichero donde la cola dice        ${String(conFicheroTotales).padStart(7)}   ${pct(conFicheroTotales, hechasTotales)}`);
console.log(`      (de ésas, la ruta plana no estaba y lo salvó el .gz: ${rescatesPorGz} — no son pérdidas)`);
console.log(`      (y ${rutasDelContenedorTotales} traían la ruta del contenedor —\`/app/…\`— y se tradujeron a la de este disco)`);
console.log(`    \`hecha\` sin ruta de archivo (nada que comprobar) ${String(sinRutaTotales).padStart(7)}`);
console.log(`    FICHERO QUE NO ESTÁ                     ${String(faltan.length).padStart(7)}   ${pct(faltan.length, hechasTotales)}`);
console.log(`      ya están en el canónico (el dato no se pierde)     ${String(parte.porFederacion.reduce((n, f) => n + f.faltanEnElCanonico, 0)).padStart(5)}`);
console.log(`      el análisis vive en la cola (se reimporta igual)   ${String(parte.porFederacion.reduce((n, f) => n + f.faltanConDatosEnLaCola, 0)).padStart(5)}`);
console.log(`      SIN NADA: sólo volviendo a pedirlas                ${String(sinNada.length).padStart(5)}`);
console.log('');
if (faltan.length > 0) {
  console.log('por federación (las que tienen algún fichero que falta):');
  for (const f of parte.porFederacion.filter((x) => x.faltan > 0).sort((a, b) => b.faltan - a.faltan)) {
    console.log(`  ${f.federacion.padEnd(20)} hechas ${String(f.hechas).padStart(7)} · faltan ${String(f.faltan).padStart(5)}  `
      + `(canónico ${f.faltanEnElCanonico}, en la cola ${f.faltanConDatosEnLaCola}, sin nada ${f.faltanSinNada})`);
  }
  console.log('');
  const orden = [...faltan].sort((a, b) => (a.veredicto === b.veredicto ? 0 : a.veredicto.startsWith('SIN NADA') ? -1 : 1));
  console.log(`las ${Math.min(cuantasActas, faltan.length)} acta(s) que faltan (de ${faltan.length}), con lo que queda de cada una:`);
  for (const a of orden.slice(0, cuantasActas)) {
    console.log(`  ${a.federacion.padEnd(18)} acta-${String(a.codigo).padEnd(10)} t${a.temporada} c${a.competicion} g${a.grupo} J${a.jornada}  `
      + `datos ${String(a.datosBytes).padStart(7)} B · partidos ${String(a.participaciones).padStart(3)} · eventos ${String(a.eventos).padStart(3)}  ${a.veredicto}`);
    if (a.veredicto.startsWith('SIN NADA')) console.log(`      ruta que no está: ${a.archivo}`);
  }
  if (sinNada.length > 0) {
    console.log('');
    console.log(`  ${sinNada.length} acta(s) sin fichero, sin datos en la cola y sin informe en el canónico. Son las únicas`);
    console.log('  que se pierden de verdad si no se vuelven a pedir, y están todas en el JSON de salida con su URL.');
  }
} else {
  console.log('  Ninguna acta `hecha` de ninguna cola tiene su fichero archivado en falta.');
}
console.log(`\n  el detalle completo: ${SALIDA.replace(`${RAIZ}\\`, '')}`);
