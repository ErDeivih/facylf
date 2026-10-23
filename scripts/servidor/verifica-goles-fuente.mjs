/*
 * verifica-goles-fuente.mjs — ¿la FUENTE publica los goleadores, o solo el marcador?
 *
 * ── POR QUÉ NO BASTA CON MIRAR NUESTRA PROPIA MARCA ─────────────────────────────────────────────────────
 *
 * El muestreo dice que el 64 % de las actas de adultos de Valencia traen `descuadre_goles`: el marcador dice N
 * goles y no hay ni un goleador. Ante eso hay dos explicaciones incompatibles —la fuente no los publica, o
 * nuestro analizador no los lee— y **preguntarle a nuestro propio analizador no sirve para distinguirlas**: si
 * fuera nuestro fallo, su marca sería exactamente la misma.
 *
 * Así que se va al dato crudo: los ficheros `.json.gz` archivados SON la respuesta literal del portal (llevan
 * `"origen": "ficha_partido_ajax"`). Aquí se leen muchos y se compara el MARCADOR con los GOLES que la propia
 * fuente devuelve:
 *
 *   · marcador con goles y lista de goleadores VACÍA  → la fuente no publica autores; el aviso es honesto.
 *   · marcador con goles y lista LLENA                → la fuente sí los publica, y entonces el hueco es NUESTRO.
 *
 * SÓLO LEE ficheros archivados.
 *
 * Uso:  node scripts/servidor/verifica-goles-fuente.mjs <carpeta-de-temporada> [cuántas]
 *       node scripts/servidor/verifica-goles-fuente.mjs /app/descargas-valencia/recolector-local/t21-2025-26 400
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const carpeta = process.argv[2];
if (!carpeta || !existsSync(carpeta)) {
  console.error('uso: verifica-goles-fuente.mjs <carpeta-de-temporada> [cuántas]');
  process.exit(2);
}
const tope = Number(process.argv[3] ?? 300);

// Los ficheros viven en `comp-*/grupo-*/actas-adultos/acta-*.json.gz` (y `actas-menores`).
function busca(carpeta, salida, limite) {
  if (salida.length >= limite) return;
  let entradas = [];
  try { entradas = readdirSync(carpeta, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    if (salida.length >= limite) return;
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) busca(ruta, salida, limite);
    else if (e.isFile() && e.name.endsWith('.json.gz') && statSync(ruta).size > 200) salida.push(ruta);
  }
}

const ficheros = [];
busca(carpeta, ficheros, tope);
console.log(`carpeta: ${carpeta}`);
console.log(`ficheros leídos: ${ficheros.length}\n`);

let conMarcador = 0;       // actas con algún gol en el marcador
let sinGoleadores = 0;     // …y la fuente NO devuelve ni un goleador
let conGoleadores = 0;     // …y la fuente SÍ los devuelve
let ceroACero = 0;
const ejemplos = [];

for (const fichero of ficheros) {
  let d;
  try { d = JSON.parse(gunzipSync(readFileSync(fichero)).toString('utf8')); } catch { continue; }
  const gl = Number(d.goles_local ?? 0) || 0;
  const gv = Number(d.goles_visitante ?? 0) || 0;
  const total = gl + gv;
  if (total === 0) { ceroACero++; continue; }
  conMarcador++;
  const autores = (Array.isArray(d.goles_equipo_local) ? d.goles_equipo_local.length : 0)
    + (Array.isArray(d.goles_equipo_visitante) ? d.goles_equipo_visitante.length : 0);
  if (autores === 0) {
    sinGoleadores++;
    if (ejemplos.length < 4) {
      ejemplos.push(`${d.codacta}  ${d.nombre_competicion ?? '?'} → ${gl}-${gv} y la fuente devuelve ${
        JSON.stringify(d.goles_equipo_local ?? null)}`);
    }
  } else conGoleadores++;
}

const pct = (v) => `${((v / Math.max(1, conMarcador)) * 100).toFixed(1)} %`;
console.log(`  actas con marcador 0-0 (sin goles que buscar): ${ceroACero}`);
console.log(`  actas con ALGÚN gol en el marcador:            ${conMarcador}`);
console.log(`     de ellas, la fuente NO devuelve goleadores: ${sinGoleadores}  (${pct(sinGoleadores)})`);
console.log(`     de ellas, la fuente SÍ los devuelve:        ${conGoleadores}  (${pct(conGoleadores)})`);
console.log('');
if (ejemplos.length) {
  console.log('  ejemplos de la fuente devolviendo la lista VACÍA con marcador:');
  for (const e of ejemplos) console.log(`     ${e}`);
  console.log('');
}
if (conGoleadores === 0) {
  console.log('  CONCLUSIÓN: la fuente NO publica los goleadores en estas actas. El aviso es suyo, no nuestro.');
} else if (sinGoleadores > conGoleadores * 3) {
  console.log('  CONCLUSIÓN: la fuente los publica solo en una minoría; el aviso apunta sobre todo a un hueco suyo.');
} else {
  console.log('  CONCLUSIÓN: la fuente SÍ publica goleadores en buena parte de las actas → HAY QUE REVISAR EL PARSER.');
}
