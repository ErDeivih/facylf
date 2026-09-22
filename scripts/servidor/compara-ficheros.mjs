#!/usr/bin/env node
/*
 * ¿QUÉ FICHEROS FALTAN EXACTAMENTE?
 *
 * La comparación de tamaños dice «falta archivo» pero no cuál. Esto lista el archivo de evidencia de una
 * federación en el PC y en el servidor y enseña los ficheros que están en uno y no en el otro. Sirve para
 * distinguir un problema de la copia (nombres raros, permisos) de un problema de la comparación (algo que se
 * cuenta en un lado y no en el otro).
 *
 * Uso: node scripts/servidor/compara-ficheros.mjs madrid [--limite 20]
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { spawn } from 'node:child_process';

const argumentos = process.argv.slice(2);
const federacion = argumentos.find((a) => !a.startsWith('--'));
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const LIMITE = Number(arg('limite', 20));
const RAIZ = resolve(process.env.FACYLF_RAIZ ?? '.');
const SERVIDOR = arg('servidor', 'david@servidor.local');
const DESTINO = arg('destino', '/srv/data/facylf');

/** Lista relativa + tamaño, saltando lo que no es archivo de evidencia. */
function listaLado(base, filtro) {
  const salida = new Map();
  const pila = [base];
  while (pila.length) {
    const carpeta = pila.pop();
    let entradas;
    try { entradas = readdirSync(carpeta, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      const ruta = join(carpeta, e.name);
      if (filtro(ruta)) continue;
      if (e.isDirectory()) { pila.push(ruta); continue; }
      try { salida.set(relative(base, ruta).replace(/\\/g, '/'), statSync(ruta).size); } catch { /* se fue */ }
    }
  }
  return salida;
}

const local = listaLado(join(RAIZ, `descargas-${federacion}`), (r) => /perfil-chrome|\.sqlite|\.log$/.test(r));

const remoto = await new Promise((listo) => {
  // `find` en el servidor: ruta relativa + tamaño, con los mismos descartes.
  const orden = `cd ${DESTINO}/descargas-${federacion} 2>/dev/null && `
    + `find . -type f ! -path '*perfil-chrome*' ! -name '*.sqlite*' ! -name '*.log' -printf '%s %P\\n'`;
  const hijo = spawn('ssh', ['-o', 'BatchMode=yes', SERVIDOR, orden], { windowsHide: true });
  let texto = '';
  hijo.stdout.on('data', (d) => { texto += d.toString(); });
  hijo.on('close', () => {
    const mapa = new Map();
    for (const linea of texto.split('\n')) {
      const i = linea.indexOf(' ');
      if (i < 0) continue;
      const tam = Number(linea.slice(0, i));
      const ruta = linea.slice(i + 1).trim();
      if (ruta) mapa.set(ruta, tam);
    }
    listo(mapa);
  });
  hijo.on('error', () => listo(new Map()));
});

const faltan = [];
for (const [ruta, tam] of local) if (!remoto.has(ruta)) faltan.push({ ruta, mb: tam / 1024 ** 2 });
const sobran = [];
for (const ruta of remoto.keys()) if (!local.has(ruta)) sobran.push(ruta);

console.log(`${federacion}: ${local.size} ficheros en el PC · ${remoto.size} en el servidor`);
console.log(`  faltan en el servidor: ${faltan.length} (${(faltan.reduce((a, f) => a + f.mb, 0)).toFixed(1)} MB)`);
console.log(`  sólo en el servidor:   ${sobran.length}`);
if (faltan.length) {
  console.log('\n  los que faltan (los más grandes primero):');
  for (const f of faltan.sort((a, b) => b.mb - a.mb).slice(0, LIMITE)) {
    console.log(`    ${f.mb.toFixed(2).padStart(8)} MB  ${f.ruta}`);
  }
  // Agrupar por carpeta: si todos están en la misma, el problema es de una carpeta concreta.
  const porCarpeta = {};
  for (const f of faltan) {
    const carpeta = f.ruta.split('/').slice(0, -1).join('/') || '.';
    porCarpeta[carpeta] = (porCarpeta[carpeta] ?? 0) + 1;
  }
  console.log('\n  por carpeta:');
  for (const [c, n] of Object.entries(porCarpeta).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${String(n).padStart(5)}  ${c}`);
  }
}
