#!/usr/bin/env node
/*
 * ¿CUÁNTAS CLASIFICACIONES ARCHIVADAS SE PUEDEN LEER DE VERDAD? — y con qué lector.
 *
 * Por qué existe. `scripts/revisa-tabla-oficial.mts` mira si hay ARCHIVO y, para el HTML, se fía de que esté
 * ahí: «el HTML de Cataluña es una cáscara sin la tabla, así que no se prueba». Con esa regla, una federación
 * que archiva una maqueta que el lector del canónico NO sabe leer sale contada como «hay archivo legible», y
 * el grupo se queda sin tabla oficial sin que nadie lo vea. Medido el 25/09/2026: baleares, galicia y euskadi
 * tienen la clasificación archivada y **cero** tablas oficiales dentro.
 *
 * Esto pasa el lector DE VERDAD (`parseaClasificacionHtml`, el mismo del importador) por cada clasificación
 * archivada y dice cuántas dan filas y cuántas no. Nada de «hay archivo»: **cuántas filas salen**.
 *
 * Es de SÓLO LECTURA y no toca la base.
 *
 * Uso:
 *   node --import tsx scripts/mide-clasificaciones-archivadas.mts
 *   node --import tsx scripts/mide-clasificaciones-archivadas.mts --federacion baleares --ejemplos 3
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
// El paquete se importa por RUTA y no por nombre: este script vive en `scripts/`, fuera del espacio de
// trabajo del paquete canónico, y desde aquí `@facylf/ingesta` no se resuelve (medido el 25/09/2026).
import { parseaClasificacionHtml } from '../packages/ingesta/src/parsers/clasificacion.js';
import { rutaClasificacionOficial } from '../packages/canonico/src/clasificacion-oficial.js';
import { leeClasificacionJson, leeTexto, rutaClasificacionJson } from '../packages/canonico/src/clasificacion-oficial-json.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const { DatabaseSync } = requerir('node:sqlite');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const filtro = arg('federacion');
const ejemplos = Number(arg('ejemplos') ?? 3);
const soloJson = argumentos.includes('--json');

/** Recorre las carpetas `t<código>-<etiqueta>/comp-<c>/grupo-<g>` de una cola sin abrir la base. */
function gruposArchivados(raizCola) {
  const salida = [];
  for (const temporada of readdirSync(raizCola, { withFileTypes: true })) {
    if (!temporada.isDirectory() || !/^t\d+-/.test(temporada.name)) continue;
    const m = /^t(\d+)-(.+)$/.exec(temporada.name);
    if (m === null) continue;
    const carpetaTemporada = join(raizCola, temporada.name);
    for (const competicion of readdirSync(carpetaTemporada, { withFileTypes: true })) {
      if (!competicion.isDirectory() || !competicion.name.startsWith('comp-')) continue;
      const carpetaCompeticion = join(carpetaTemporada, competicion.name);
      for (const grupo of readdirSync(carpetaCompeticion, { withFileTypes: true })) {
        if (!grupo.isDirectory() || !grupo.name.startsWith('grupo-')) continue;
        salida.push({
          temporada: { codigo: m[1], etiqueta: m[2] },
          competicion: competicion.name.replace('comp-', ''),
          grupo: grupo.name.replace('grupo-', ''),
        });
      }
    }
  }
  return salida;
}

const colas = [];
for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  if (entrada.name === 'descargas-federacion-sondeo' || entrada.name === 'descargas-prueba-10gb') continue;
  const raizCola = join(RAIZ, entrada.name, 'recolector-local');
  if (!existsSync(join(raizCola, 'cola-v2.sqlite'))) continue;
  if (existsSync(join(RAIZ, entrada.name, '.PRUEBA'))) continue;
  const federacion = entrada.name === 'descargas-federacion' ? 'castilla-leon' : entrada.name.replace('descargas-', '');
  if (filtro && federacion !== filtro) continue;
  colas.push({ federacion, raizCola });
}

const resumen = new Map();
const malos = [];
for (const { federacion, raizCola } of colas.sort((a, b) => a.federacion.localeCompare(b.federacion, 'es'))) {
  const suyo = { federacion, conHtml: 0, htmlConFilas: 0, htmlSinFilas: 0, soloJson: 0, jsonRechazado: 0, sinArchivo: 0 };
  for (const g of gruposArchivados(raizCola)) {
    const rutaHtml = rutaClasificacionOficial(raizCola, g.temporada, g.competicion, g.grupo);
    const rutaJson = rutaClasificacionJson(raizCola, g.temporada, g.competicion, g.grupo);
    if (rutaHtml === null && rutaJson === null) { suyo.sinArchivo += 1; continue; }
    if (rutaHtml !== null) {
      suyo.conHtml += 1;
      let filas = 0;
      try {
        filas = parseaClasificacionHtml(leeTexto(rutaHtml)).length;
      } catch (error) {
        filas = -1;
        if (malos.length < 200) malos.push(`${federacion} g${g.grupo}: el lector de HTML lanza (${error instanceof Error ? error.message : String(error)})`);
      }
      if (filas > 0) suyo.htmlConFilas += 1;
      else {
        suyo.htmlSinFilas += 1;
        const tamano = statSync(rutaHtml).size;
        if (malos.length < 200) malos.push(`${federacion} t${g.temporada.codigo} c${g.competicion} g${g.grupo}: `
          + `el HTML archivado (${tamano} bytes) no da ni una fila`);
      }
    }
    if (rutaJson !== null) {
      let filas = -1;
      try { filas = leeClasificacionJson(leeTexto(rutaJson), `${federacion} g${g.grupo}`).length; }
      catch { suyo.jsonRechazado += 1; }
      if (filas === 0) suyo.soloJson += 1;      // JSON válido pero vacío: la federación aún no la publica
    }
  }
  resumen.set(federacion, suyo);
}

const todo = [...resumen.values()];
const suma = (campo) => todo.reduce((n, f) => n + f[campo], 0);

if (soloJson) {
  console.log(JSON.stringify({ porFederacion: todo, problemas: malos.slice(0, 60) }, null, 2));
  process.exit(0);
}

console.log(`═══ clasificaciones archivadas, leídas con el LECTOR DEL IMPORTADOR · ${todo.length} cola(s)`);
console.log('');
console.log(`  ${'federación'.padEnd(20)} ${'con HTML'.padStart(9)} ${'dan filas'.padStart(10)} ${'SIN filas'.padStart(10)} ${'sólo JSON'.padStart(10)} ${'JSON malo'.padStart(10)}`);
for (const f of todo.sort((a, b) => b.htmlSinFilas - a.htmlSinFilas)) {
  console.log(`  ${f.federacion.padEnd(20)} ${String(f.conHtml).padStart(9)} ${String(f.htmlConFilas).padStart(10)} `
    + `${String(f.htmlSinFilas).padStart(10)} ${String(f.soloJson).padStart(10)} ${String(f.jsonRechazado).padStart(10)}`);
}
console.log('');
console.log(`  TOTAL: ${suma('conHtml')} clasificaciones en HTML archivadas · ${suma('htmlConFilas')} dan filas · `
  + `${suma('htmlSinFilas')} NO dan ni una fila`);
console.log('  (una clasificación archivada que no da filas es una tabla oficial que NO se puede importar con el');
console.log('   lector de hoy: o la maqueta es otra, o la página no trae la tabla. Las dos cosas se ven en el fichero.)');
if (malos.length > 0) {
  console.log(`\n  hasta ${Math.min(ejemplos, malos.length)} ejemplo(s) de las que no dan filas:`);
  for (const m of malos.slice(0, ejemplos)) console.log(`    ${m}`);
}
