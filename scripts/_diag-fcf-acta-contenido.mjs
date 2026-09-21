#!/usr/bin/env node
/** ¿Qué trae de verdad la ficha de acta de la FCF? (sobre el HTML guardado) */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = join(import.meta.dirname, '..', 'descargas-cataluna', '_muestras');
const archivo = join(carpeta, readdirSync(carpeta).find((f) => f.startsWith('acta-fcf-')));
const h = readFileSync(archivo, 'utf8');
console.log(archivo, '·', h.length, 'B\n');

const texto = h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .split('\n').map((l) => l.trim()).filter(Boolean);
console.log(`líneas de texto: ${texto.length}`);
console.log(JSON.stringify(texto.slice(0, 120), null, 0).replace(/","/g, '", "'));

console.log('\n-- marcas --');
for (const marca of ['TITULARS', 'SUPLENTS', 'Titulars', 'Suplents', 'GOLS', 'Gols', 'TARGETES', 'Targetes', 'ÀRBITRES', 'Àrbitre',
  'ENTRENADOR', 'DELEGAT', 'dorsal', 'Dorsal', 'Canvis', 'CANVIS', 'expulsió', 'groga', 'vermella', 'alineaci']) {
  const n = (h.match(new RegExp(marca, 'g')) || []).length;
  if (n) console.log(`  ${marca}: ${n}`);
}

// Estructura: ¿hay listas de jugadores con dorsal?
const conDorsal = [...h.matchAll(/>\s*(\d{1,2})\s*</g)].length;
console.log(`\nnúmeros sueltos entre etiquetas (posibles dorsales): ${conDorsal}`);
const jugadores = [...new Set([...h.matchAll(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ' ,.-]{6,40}),\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ' ,.-]{2,30})/g)].map((m) => `${m[1]}, ${m[2]}`))];
console.log(`nombres con formato «APELLIDO, NOMBRE»: ${jugadores.length}`);
console.log(JSON.stringify(jugadores.slice(0, 25), null, 1));
