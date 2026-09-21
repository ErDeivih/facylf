#!/usr/bin/env node
/**
 * ¿Cuánto se gana comprimiendo? Se mide con ficheros REALES ya archivados (sin escribir nada):
 * se leen y se comprimen en memoria para comparar tamaños.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const RAIZ = resolve(import.meta.dirname, '..');
const muestras = [];
const recoge = (carpeta, sufijo, limite, etiqueta) => {
  let n = 0;
  const pila = [carpeta];
  while (pila.length && n < limite) {
    const actual = pila.pop();
    let entradas;
    try { entradas = readdirSync(actual, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      const ruta = join(actual, e.name);
      if (e.isDirectory()) { pila.push(ruta); continue; }
      if (!e.name.endsWith(sufijo)) continue;
      try {
        const bytes = readFileSync(ruta);
        if (bytes.length < 8192) continue;
        muestras.push({ etiqueta, original: bytes.length, comprimido: gzipSync(bytes).length });
        if (++n >= limite) break;
      } catch { /* ilegible */ }
    }
  }
};
for (const [dir, etiqueta] of [['descargas-federacion', 'CyL (pnfg)'], ['descargas-asturias', 'Asturias (pnfg)'],
  ['descargas-cataluna', 'Cataluña (FCF)'], ['descargas-madrid', 'Madrid (iSquad)']]) {
  const base = join(RAIZ, dir, 'recolector-local');
  recoge(base, '.html', 6, `${etiqueta} html`);
  recoge(base, '.json', 6, `${etiqueta} json`);
}
const porEtiqueta = new Map();
for (const m of muestras) {
  const acc = porEtiqueta.get(m.etiqueta) ?? { n: 0, original: 0, comprimido: 0 };
  acc.n += 1; acc.original += m.original; acc.comprimido += m.comprimido;
  porEtiqueta.set(m.etiqueta, acc);
}
console.log('muestra real (ficheros archivados de más de 8 KB):');
for (const [etiqueta, v] of porEtiqueta) {
  console.log(`  ${etiqueta.padEnd(22)} ${v.n} ficheros · ${Math.round(v.original / 1024)} KB → ` +
    `${Math.round(v.comprimido / 1024)} KB (×${(v.original / v.comprimido).toFixed(1)} menos)`);
}
const total = [...porEtiqueta.values()].reduce((a, v) => ({ original: a.original + v.original, comprimido: a.comprimido + v.comprimido }), { original: 0, comprimido: 0 });
console.log(`  TOTAL: ${(total.original / 1048576).toFixed(1)} MB → ${(total.comprimido / 1048576).toFixed(1)} MB` +
  ` (×${(total.original / total.comprimido).toFixed(1)})`);
