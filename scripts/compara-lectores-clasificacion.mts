/*
 * COMPARA EL LECTOR VIEJO DE CLASIFICACIONES CON EL NUEVO, fichero a fichero, para no perder lo ganado.
 *
 * El lector por índices fijos leía 4.595 clasificaciones archivadas; el nuevo, por anclas, lee más. Pero
 * «lee más» no basta: hay que comprobar que **no lee menos** en ningún sitio, y saber POR QUÉ en los casos
 * que cambian. Esto recorre todas las clasificaciones archivadas, pasa los dos lectores y cuenta ganados,
 * perdidos y cambiados, con ejemplos.
 *
 * Uso: node --import tsx scripts/_compara-lectores.mts [--federacion X] [--ejemplos 5]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parse } from 'node-html-parser';
import { parseaClasificacionHtml, type ClasificacionOficialHtml } from '../packages/ingesta/src/parsers/clasificacion.js';
import { normalizaTextoFederacion } from '../packages/ingesta/src/texto.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentos = process.argv.slice(2);
const arg = (n: string) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : null; };
const filtro = arg('federacion');
const ejemplos = Number(arg('ejemplos') ?? 6);

const lee = (ruta: string): string => {
  const bytes = readFileSync(ruta);
  return (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8');
};

/** El lector VIEJO, copiado tal cual estaba antes del cambio (índices fijos y guarda de ocho celdas). */
function viejo(entrada: string): ClasificacionOficialHtml[] {
  const raiz = parse(entrada);
  const entero = (valor: string): number | null => {
    const limpio = valor.replace(/[^\d-]/g, '');
    return /^-?\d+$/.test(limpio) ? Number(limpio) : null;
  };
  for (const tabla of raiz.querySelectorAll('table')) {
    const filas = tabla.querySelectorAll('tr');
    const cabecera = filas.slice(0, 2).flatMap((fila) =>
      fila.querySelectorAll('th,td').map((c) => normalizaTextoFederacion(c.textContent)))
      .join(' ').replace(/\s+/g, ' ');
    if (!/\bPts\b/.test(cabecera) || !/\bJ\b/.test(cabecera) || !/Sanci[oó]n/i.test(cabecera)) continue;
    if ((filas[1]?.querySelectorAll('th,td').length ?? 0) !== 8) continue;
    const salida: ClasificacionOficialHtml[] = [];
    for (const fila of filas.slice(2)) {
      const celdas = fila.querySelectorAll('th,td');
      if (celdas.length < 10) continue;
      const posicion = entero(celdas[1]?.textContent ?? '');
      const puntos = entero(celdas[3]?.textContent ?? '');
      const jugados = entero(celdas[4]?.textContent ?? '');
      const ganados = entero(celdas[5]?.textContent ?? '');
      const empatados = entero(celdas[6]?.textContent ?? '');
      const perdidos = entero(celdas[7]?.textContent ?? '');
      const equipo = normalizaTextoFederacion(celdas[2]?.textContent ?? '');
      if (posicion == null || puntos == null || jugados == null || ganados == null ||
          empatados == null || perdidos == null || !equipo) continue;
      salida.push({ posicion, equipoCodigo: null, equipo, puntos, jugados, ganados, empatados, perdidos,
        ultimos: [], sancion: entero(celdas[9]?.textContent ?? '') ?? 0 });
    }
    if (salida.length) return salida;
  }
  return [];
}

const archivos: Array<{ federacion: string; ruta: string }> = [];
for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  if (entrada.name === 'descargas-federacion-sondeo' || entrada.name === 'descargas-prueba-10gb') continue;
  const raizCola = join(RAIZ, entrada.name, 'recolector-local');
  if (!existsSync(raizCola)) continue;
  const federacion = entrada.name === 'descargas-federacion' ? 'castilla-leon' : entrada.name.replace('descargas-', '');
  if (filtro && federacion !== filtro) continue;
  const pila = [raizCola];
  while (pila.length > 0) {
    const actual = pila.pop()!;
    for (const hijo of readdirSync(actual, { withFileTypes: true })) {
      const ruta = join(actual, hijo.name);
      if (hijo.isDirectory()) { pila.push(ruta); continue; }
      if (/^clasificacion\.html(\.gz)?$/.test(hijo.name)) archivos.push({ federacion, ruta });
    }
  }
}

let ganados = 0;
let perdidos = 0;
let cambiados = 0;
const ejemplosPerdidos: string[] = [];
const ejemplosCambiados: string[] = [];
for (const { federacion, ruta } of archivos) {
  const html = lee(ruta);
  const a = viejo(html);
  const b = parseaClasificacionHtml(html);
  if (a.length === 0 && b.length > 0) ganados += 1;
  else if (a.length > 0 && b.length === 0) {
    perdidos += 1;
    if (ejemplosPerdidos.length < ejemplos) ejemplosPerdidos.push(`${federacion} ${ruta.replace(`${RAIZ}\\`, '')} · viejo ${a.length} filas`);
  } else if (a.length > 0 && b.length > 0) {
    const iguales = a.length === b.length
      && a.every((f, i) => f.equipo === b[i]!.equipo && f.puntos === b[i]!.puntos
        && f.jugados === b[i]!.jugados && f.ganados === b[i]!.ganados);
    if (!iguales) {
      cambiados += 1;
      if (ejemplosCambiados.length < ejemplos) {
        const max = Math.max(a.length, b.length);
        let primera = -1;
        for (let i = 0; i < max && primera < 0; i += 1) {
          const x = a[i]; const y = b[i];
          if (x === undefined || y === undefined || x.equipo !== y.equipo || x.puntos !== y.puntos
            || x.jugados !== y.jugados || x.ganados !== y.ganados) primera = i;
        }
        const describe = (f: ClasificacionOficialHtml | undefined) => f === undefined
          ? '(no hay fila)'
          : `${f.equipo} ${f.puntos}pts ${f.jugados}j ${f.ganados}g ${f.empatados}e ${f.perdidos}p`;
        ejemplosCambiados.push(`${federacion} ${ruta.replace(`${RAIZ}\\`, '')}\n      viejo ${a.length} filas · nuevo ${b.length} filas · primera diferencia en la fila ${primera}\n      viejo: ${describe(a[primera])}\n      nuevo: ${describe(b[primera])}`);
      }
    }
  }
}

console.log(`═══ ${archivos.length} clasificación(es) archivada(s)${filtro ? ` de ${filtro}` : ''}`);
console.log(`  el lector nuevo LEE donde el viejo no:  ${ganados}`);
console.log(`  el lector nuevo NO LEE donde el viejo sí: ${perdidos}`);
console.log(`  los dos leen pero dicen cosas distintas:  ${cambiados}`);
if (ejemplosPerdidos.length > 0) {
  console.log('\n  pérdidas:');
  for (const e of ejemplosPerdidos) console.log(`    ${e}`);
}
if (ejemplosCambiados.length > 0) {
  console.log('\n  cambios:');
  for (const e of ejemplosCambiados) console.log(`    ${e}`);
}
