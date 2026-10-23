#!/usr/bin/env node
/*
 * QUÉ FORMA TIENE UNA CLASIFICACIÓN ARCHIVADA, sin interpretarla.
 *
 * Por qué. El resolutor de la tabla oficial se apoya en el CÓDIGO de equipo que publica cada fila. Antes de
 * escribirlo hay que saber si el archivo lo trae, y eso no lo puede contestar ningún lector de los que ya hay
 * (contestaría «cuántas filas saca», no «qué publica»). Aquí se mira el archivo crudo: la cabecera del JSON y
 * sus claves, o los enlaces `codequipo=` del HTML. No sustituye a ningún lector ni decide nada.
 *
 * Uso: node scripts/_diag-forma-archivo-clasificacion.mjs <ruta del archivo, con o sin .gz> [filas]
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const rutaPedida = process.argv[2];
const cuantas = Number(process.argv[3] ?? 3);
const indiceCrudo = process.argv.indexOf('--crudo');
const cuantosCrudo = indiceCrudo >= 0 ? Number(process.argv[indiceCrudo + 1] ?? 3000) : 0;
if (!rutaPedida) {
  console.error('Falta la ruta del archivo archivado.');
  process.exit(1);
}
// La misma regla que `leeArchivo`: la ruta guardada, o esa misma con `.gz` detrás.
let ruta = null;
for (const candidata of [rutaPedida, `${rutaPedida}.gz`, rutaPedida.replace(/\.gz$/, '')]) {
  if (existsSync(candidata)) { ruta = candidata; break; }
}
if (ruta === null) {
  console.error(`No existe: ${rutaPedida}`);
  process.exit(1);
}
const bytes = readFileSync(ruta);
const texto = ruta.toLowerCase().endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
console.log(`${ruta.replace(process.cwd(), '.')} · ${statSync(ruta).size} B en disco · ${texto.length} B de texto`);

if (cuantosCrudo > 0) {
  // Un trozo CRUDO: es lo único que deja ver cómo publica la fuente los valores (texto de celda, CSS
  // `content`, o un script que los pinta después). `--desde <patrón>` elige dónde empieza el trozo.
  const indiceDesde = process.argv.indexOf('--desde');
  const patron = indiceDesde >= 0 ? process.argv[indiceDesde + 1] : null;
  const indiceOcurrencia = process.argv.indexOf('--ocurrencia');
  const ocurrencia = indiceOcurrencia >= 0 ? Number(process.argv[indiceOcurrencia + 1] ?? 1) : 1;
  let desde = Math.max(0, texto.search(/<table/i));
  if (patron !== null) {
    let posicion = -1;
    for (let n = 0; n < ocurrencia; n += 1) posicion = texto.indexOf(patron, posicion + 1);
    desde = Math.max(0, (posicion < 0 ? 0 : posicion) - 400);
  }
  console.log(`\n-- crudo ${patron === null ? 'desde la primera <table>' : `alrededor de «${patron}» (ocurrencia ${ocurrencia})`} (${cuantosCrudo} caracteres) --`);
  console.log(texto.slice(desde, desde + cuantosCrudo));
  process.exit(0);
}

const recortado = texto.trimStart();
if (recortado.startsWith('{') || recortado.startsWith('[')) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (error) {
    console.log(`  es JSON y NO se puede parsear: ${error.message}`);
    process.exit(1);
  }
  const filas = Array.isArray(datos) ? datos : (Array.isArray(datos.clasificacion) ? datos.clasificacion
    : Array.isArray(datos.datos) ? datos.datos : (Array.isArray(datos.equipos) ? datos.equipos : []));
  console.log(`  JSON · clave(s) de arriba: ${Array.isArray(datos) ? '(array)' : Object.keys(datos).join(', ')}`);
  console.log(`  filas: ${filas.length}`);
  for (const f of filas.slice(0, cuantas)) {
    console.log(`   · ${JSON.stringify(f).slice(0, 220)}`);
  }
  // ¿Trae código de equipo? Se busca cualquier clave que lo nombre: es la pregunta de esta herramienta.
  const claves = new Set();
  for (const f of filas) if (f && typeof f === 'object') for (const k of Object.keys(f)) claves.add(k);
  const conCodigo = [...claves].filter((k) => /cod|equipo_?id|team/i.test(k));
  console.log(`  claves de las filas: ${[...claves].join(', ')}`);
  console.log(`  claves que parecen un código de equipo: ${conCodigo.length > 0 ? conCodigo.join(', ') : 'NINGUNA'}`);
  if (conCodigo.length > 0) {
    const conValor = filas.filter((f) => f && conCodigo.some((k) => f[k] !== null && f[k] !== undefined && String(f[k]).trim() !== '')).length;
    console.log(`  filas con algún código no vacío: ${conValor} de ${filas.length}`);
  }
} else {
  const enlaces = [...texto.matchAll(/codequipo=(\d+)/gi)];
  const unicos = new Set(enlaces.map((m) => m[1]));
  const tablas = (texto.match(/<table/gi) ?? []).length;
  console.log(`  HTML · ${tablas} tabla(s) · enlaces con codequipo=: ${enlaces.length} (${unicos.size} códigos distintos)`);
  for (const codigo of [...unicos].slice(0, 6)) {
    const i = texto.indexOf(`codequipo=${codigo}`);
    const trozo = texto.slice(i, i + 220).replace(/\s+/g, ' ');
    console.log(`   · ${codigo}: …${trozo.slice(trozo.indexOf('codequipo'), trozo.indexOf('codequipo') + 160)}`);
  }
}
