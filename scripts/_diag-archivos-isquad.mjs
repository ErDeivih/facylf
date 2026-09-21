/*
 * ¿Qué hay REALMENTE en las jornadas archivadas de Madrid y Valencia?
 *
 * Antes de escribir el extractor de una maqueta hay que mirar los ficheros, no suponerlos: extensión,
 * si el JSON parsea, si trae `partidos`, qué claves aparecen y cuántas filas llevan código NEGATIVO (que
 * es la evidencia del bloque de descanso en iSquad). Sólo lee.
 *
 * Uso: node scripts/_diag-archivos-isquad.mjs [madrid|valencia|ambas] [n]
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const requerir = createRequire(import.meta.url);
const zlib = requerir('node:zlib');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const federaciones = (process.argv[2] ?? 'ambas') === 'ambas' ? ['madrid', 'valencia'] : [process.argv[2]];
const muestras = Number(process.argv[3] ?? 40);

/** Todos los ficheros de jornada de una carpeta de federación, sin recorrer el árbol entero de golpe. */
function ficherosDeJornada(dir) {
  const salida = [];
  const pila = [dir];
  while (pila.length) {
    const actual = pila.pop();
    let entradas;
    try { entradas = readdirSync(actual, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      const ruta = join(actual, e.name);
      if (e.isDirectory()) pila.push(ruta);
      else if (/^jornada-\d+\.(json|html)(\.gz)?$/.test(e.name)) salida.push(ruta);
    }
  }
  return salida;
}

function lee(ruta) {
  const bruto = readFileSync(ruta);
  if (extname(ruta) === '.gz') return zlib.gunzipSync(bruto).toString('utf8');
  return bruto.toString('utf8');
}

for (const federacion of federaciones) {
  const base = join(raiz, `descargas-${federacion}`, 'recolector-local');
  let ficheros;
  try { ficheros = ficherosDeJornada(base); } catch { console.log(`${federacion}: no hay carpeta`); continue; }
  const extensiones = new Map();
  for (const f of ficheros) {
    const ext = f.replace(/^.*(jornada-\d+)/, '$1').replace(/^jornada-\d+/, '');
    extensiones.set(ext, (extensiones.get(ext) ?? 0) + 1);
  }
  console.log(`\n=== ${federacion}: ${ficheros.length} ficheros de jornada`);
  console.log(`  extensiones: ${[...extensiones.entries()].map(([e, n]) => `${e}=${n}`).join(' · ')}`);

  // Muestra repartida por todo el conjunto, no los primeros: los primeros suelen ser los más viejos.
  const salto = Math.max(1, Math.floor(ficheros.length / muestras));
  const elegidos = ficheros.filter((_, i) => i % salto === 0).slice(0, muestras);
  const claves = new Map();
  let conPartidos = 0; let sinPartidos = 0; let noJson = 0; let conNegativo = 0; let filas = 0; let descansos = 0;
  const ejemplos = [];
  for (const ruta of elegidos) {
    let contenido;
    try { contenido = lee(ruta); } catch { noJson += 1; continue; }
    let datos;
    try { datos = JSON.parse(contenido); } catch { noJson += 1; if (ejemplos.length < 3) ejemplos.push(`NO JSON: ${ruta}`); continue; }
    const partidos = datos?.partidos;
    if (!Array.isArray(partidos)) { sinPartidos += 1; if (ejemplos.length < 3) ejemplos.push(`SIN partidos: ${ruta} (claves ${Object.keys(datos ?? {}).join(',')})`); continue; }
    conPartidos += 1;
    filas += partidos.length;
    for (const p of partidos) {
      for (const k of Object.keys(p)) claves.set(k, (claves.get(k) ?? 0) + 1);
      const neg = String(p.cod_equipo_local ?? '').startsWith('-') || String(p.cod_equipo_visitante ?? '').startsWith('-');
      if (neg) { conNegativo += 1; descansos += 1; }
    }
  }
  console.log(`  muestra: ${elegidos.length} · con partidos ${conPartidos} · sin partidos ${sinPartidos} · no JSON ${noJson}`);
  console.log(`  filas de la muestra: ${filas} · con código NEGATIVO: ${conNegativo}`);
  const top = [...claves.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`  claves más frecuentes: ${top.slice(0, 14).map(([k, n]) => `${k}(${n})`).join(' ')}`);
  if (top.length) console.log(`  claves raras: ${top.slice(-6).map(([k, n]) => `${k}(${n})`).join(' ')}`);
  for (const e of ejemplos) console.log(`  · ${e}`);
}
