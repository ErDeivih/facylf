#!/usr/bin/env tsx
/**
 * Vigilante de descargas: comprueba cada pocos minutos la carpeta donde sueltas
 * los .xls que te bajas a mano de la web de la federación y procesa sólo lo que
 * haya cambiado.
 *
 *   pnpm ingesta:vigilar                       # bucle continuo, cada 60 s
 *   pnpm ingesta:vigilar --minutos 5           # cada 5 minutos
 *   pnpm ingesta:vigilar --una                 # una pasada y sale
 *   pnpm ingesta:vigilar --carpeta otra/ruta
 *
 * No hace ninguna petición de red. El único paso humano es descargar el .xls;
 * todo lo demás (detección de cambios por hash, parseo, resumen) es automático.
 * Cuando llegue el permiso de la delegación, este mismo flujo se conecta al
 * cliente HTTP y deja de necesitar manos.
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseaCalendario } from '../src/parsers/calendario.js';
import { parseaClasificacionCruda } from '../src/parsers/clasificacion.js';
import { validaCalendario } from '../src/validacion.js';
import {
  diferencias, hashBytes, sinDiferencias, tipoDeFichero,
} from '../src/vigilante.js';
import type { EstadoVigilante } from '../src/vigilante.js';

const RAIZ = resolve(import.meta.dirname, '../../..');

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const carpeta = resolve(RAIZ, argumento('carpeta') ?? 'descargas-federacion');
const minutos = Number(argumento('minutos') ?? 1);
const unaSolaPasada = process.argv.includes('--una');
const ficheroEstado = join(carpeta, '.estado-vigilante.json');

if (!existsSync(carpeta)) {
  mkdirSync(carpeta, { recursive: true });
  console.log(
    `He creado ${carpeta}. Suéta ahí los .xls que descargues de rfcylf.es\n` +
    '(botones "Calendario Excel" y "Clasificación Excel") y relanza el vigilante.',
  );
  process.exit(0);
}

const leeEstado = (): EstadoVigilante =>
  existsSync(ficheroEstado)
    ? JSON.parse(readFileSync(ficheroEstado, 'utf8')) as EstadoVigilante
    : {};

function procesa(nombre: string, bytes: Uint8Array): void {
  const tipo = tipoDeFichero(nombre);
  try {
    if (tipo === 'calendario' || tipo === 'desconocido') {
      const c = parseaCalendario(bytes);
      if (c.partidos.length > 0 || tipo === 'calendario') {
        console.log(`  calendario: ${c.equipos.length} equipos, ` +
          `${c.jornadas} jornadas, ${c.partidos.length} partidos`);
        const problemas = validaCalendario(c.partidos);
        if (problemas.length) {
          console.log(problemas.map((p) => `  · [${p.regla}] ${p.detalle}`).join('\n'));
        }
        return;
      }
    }
    const filas = parseaClasificacionCruda(bytes);
    console.log(`  clasificación: ${filas.length} filas`);
  } catch (e) {
    console.error(`  ERROR al parsear (${e instanceof Error ? e.message : e})`);
    console.error('  El fichero no se marca como procesado; revisa si es el formato esperado.');
    throw e;
  }
}

function pasada(): void {
  const previo = leeEstado();
  const nombres = readdirSync(carpeta)
    .filter((n) => /\.xlsx?$/i.test(n))
    .sort();

  const actual: EstadoVigilante = {};
  for (const n of nombres) actual[n] = hashBytes(readFileSync(join(carpeta, n)));

  const d = diferencias(previo, actual);
  if (sinDiferencias(d)) return;

  console.log(new Date().toLocaleTimeString('es-ES') +
    ` — nuevos: ${d.nuevos.length}, cambiados: ${d.cambiados.length}, borrados: ${d.borrados.length}`);

  for (const n of [...d.nuevos, ...d.cambiados]) {
    console.log(`· ${n}`);
    try {
      procesa(n, readFileSync(join(carpeta, n)));
    } catch {
      continue; // sin marcar en el estado: la próxima pasada lo reintenta
    }
    previo[n] = actual[n]!;
  }

  // Los borrados salen del estado para que reaparezcan si vuelven a soltarse.
  for (const n of d.borrados) delete previo[n];
  writeFileSync(ficheroEstado, JSON.stringify(previo, null, 2));
}

console.log(
  `Vigilando ${carpeta}` + (unaSolaPasada ? '' : ` cada ${minutos} min`) +
  '\nSuelta ahí los .xls de la federación cuando los descargues.\n',
);

pasada();
if (!unaSolaPasada) setInterval(pasada, minutos * 60_000).unref?.();
else console.log('Pasada única terminada.');
