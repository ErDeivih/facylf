/*
 * MIRA UNA CLASIFICACIÓN ARCHIVADA: sus tablas, sus cabeceras y sus filas, celda a celda.
 *
 * Es la herramienta con la que se escribe (y se corrige) el lector de clasificaciones: sin ver la maqueta de
 * verdad no se puede decidir qué columna es qué, y adivinarlo es escribir puntos falsos con apariencia de
 * publicados. `scripts/mide-clasificaciones-archivadas.mts` dice CUÁNTAS no se leen; esto dice POR QUÉ.
 *
 * Uso:
 *   node --import tsx scripts/mira-clasificacion-archivada.mts --federacion euskadi --grupo 22619983
 *   node --import tsx scripts/mira-clasificacion-archivada.mts --federacion rioja --temporada 2025-26
 *   node --import tsx scripts/mira-clasificacion-archivada.mts --federacion baleares --grupo 22536410 --filas 3
 *   node --import tsx scripts/mira-clasificacion-archivada.mts --archivo "F:/ruta/clasificacion.html.gz"
 *
 * Sin `--grupo` ni `--archivo` busca la primera clasificación archivada que el lector NO sepa leer y la
 * muestra: es justo el caso que hay que mirar.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parse, type HTMLElement } from 'node-html-parser';
import { parseaClasificacionHtml } from '../packages/ingesta/src/parsers/clasificacion.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentos = process.argv.slice(2);
const arg = (n: string): string | null => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] ?? null : null; };
const federacion = arg('federacion');
const grupo = arg('grupo');
const archivo = arg('archivo');
const filas = Number(arg('filas') ?? 3);

const lee = (ruta: string): string => {
  const bytes = readFileSync(ruta);
  return (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8');
};

/** Todas las clasificaciones HTML archivadas de una federación. */
function deFederacion(nombre: string): string[] {
  const carpeta = nombre === 'castilla-leon' ? 'descargas-federacion' : `descargas-${nombre}`;
  const raizCola = join(RAIZ, carpeta, 'recolector-local');
  if (!existsSync(raizCola)) return [];
  const salida: string[] = [];
  const pila = [raizCola];
  while (pila.length > 0) {
    const actual = pila.pop()!;
    for (const hijo of readdirSync(actual, { withFileTypes: true })) {
      const ruta = join(actual, hijo.name);
      if (hijo.isDirectory()) { pila.push(ruta); continue; }
      if (/^clasificacion\.html(\.gz)?$/.test(hijo.name)) salida.push(ruta);
    }
  }
  return salida.sort();
}

const rutas: string[] = [];
if (archivo !== null) rutas.push(archivo);
else if (federacion !== null) {
  const todas = deFederacion(federacion);
  rutas.push(...(grupo === null ? todas : todas.filter((r) => r.includes(`grupo-${grupo}`))));
} else {
  console.error('Falta --federacion o --archivo.');
  process.exit(1);
}

let mostradas = 0;
for (const ruta of rutas) {
  const html = lee(ruta);
  const leidas = parseaClasificacionHtml(html);
  const interesante = grupo !== null || archivo !== null || leidas.length === 0;
  if (!interesante) continue;
  if (grupo === null && archivo === null && mostradas >= 1) break;
  mostradas += 1;

  console.log(`\n══ ${ruta.replace(`${RAIZ}\\`, '')}`);
  console.log(`   el lector saca ${leidas.length} fila(s)` + (leidas.length > 0
    ? `: ${leidas.slice(0, 2).map((f) => `${f.equipo} ${f.puntos}pts ${f.jugados}j`).join(' | ')}` : ''));

  const raiz = parse(html);
  raiz.querySelectorAll('table').forEach((tabla: HTMLElement, t: number) => {
    const trs = tabla.querySelectorAll('tr');
    console.log(`   ── tabla ${t}: ${trs.length} fila(s)`);
    for (const [j, fila] of trs.slice(0, filas + 2).entries()) {
      const celdas = fila.querySelectorAll('th,td');
      const texto = celdas.map((c, k) => {
        const limpio = c.textContent.replace(/\s+/g, ' ').trim().slice(0, 22);
        const href = c.querySelector('a')?.getAttribute('href') ?? '';
        return `[${k}]${limpio === '' ? '""' : `"${limpio}"`}${href === '' ? '' : '→'}`;
      }).join(' ');
      console.log(`      f${j} (${celdas.length}): ${texto}`);
    }
  });
}
if (mostradas === 0) console.log('No hay ninguna que mirar con esos filtros (¿todas se leen?).');
