/*
 * compara-goles-parseados.mjs — cara a cara: lo que la FUENTE devuelve y lo que NOSOTROS guardamos
 *
 * ── LA PREGUNTA, PLANTEADA PARA QUE NO SE PUEDA ESCAPAR ─────────────────────────────────────────────────
 *
 * Medido el 24/09/2026 sobre Valencia: nuestra cola marca `descuadre_goles` —«el marcador dice N y no hemos
 * leído ni un goleador»— en el 64 % de las actas de adultos. Y midiendo la respuesta CRUDA de la fuente en 3.000
 * actas archivadas, resulta que la fuente SÍ publica los goleadores en el 88,7 % de las que tienen goles.
 *
 * Esas dos medidas no pueden ser verdad a la vez si nuestro analizador está bien. Este guion coge actas
 * CONCRETAS marcadas con descuadre y pone una al lado de la otra:
 *
 *   · qué devuelve la fuente        → los ficheros `.json.gz` archivados (`goles_equipo_local`…);
 *   · qué hemos guardado nosotros   → la columna `datos` de la cola.
 *
 * Si la fuente trae goleadores y en nuestro `datos` hay cero, el fallo es NUESTRO y está localizado. Si la
 * fuente viene vacía, el aviso era honesto. No hay tercera posibilidad.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/compara-goles-parseados.mjs <raíz> <federación> [cuántas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const [, , raiz, federacion, cuantasArg] = process.argv;
if (!raiz || !federacion) {
  console.error('uso: compara-goles-parseados.mjs <raíz> <federación> [cuántas]');
  process.exit(2);
}
const cuantas = Number(cuantasArg ?? 6);
const carpeta = join(raiz, `descargas-${federacion}`, 'recolector-local');
const db = new DatabaseSync(join(carpeta, 'cola-v2.sqlite'), { readOnly: true, timeout: 60_000 });

const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all()
  .map((t) => [String(t.codigo), t.etiqueta]));

/*
 * ── EN DOS PASOS, PORQUE LEER EL JSON DE TODAS TARDA UNA ETERNIDAD (medido el 24/09/2026) ────────────────
 *
 * La primera versión pedía `datos` —el JSON completo de cada acta, que es grande— en la MISMA consulta que
 * filtraba y ordenaba al azar. Eso obliga a leer ese campo para todas las filas candidatas: cientos de megas
 * desde un disco duro ya cargado, y el guion no terminó ni en cuatro minutos.
 *
 * Ahora primero se eligen las CINCO claves (consulta ligera: no toca `datos`) y después se lee `datos` sólo de
 * esas cinco. El resultado es el mismo y tarda una milésima parte.
 */
const claves = db.prepare(`select temporada, competicion, grupo, jornada, codigo, incidencias
  from actas
  where estado='hecha' and menores = 0 and incidencias like '%descuadre_goles%'
  order by random() limit ?`).all(cuantas);

const filas = claves.map((c) => ({ ...c, datos: db.prepare(`select datos from actas
  where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`)
  .get(c.temporada, c.competicion, c.grupo, c.jornada, c.codigo)?.datos ?? null }));

console.log(`federación: ${federacion}`);
console.log(`actas de adultos con descuadre de goles, al azar: ${filas.length}\n`);

let fuenteConGoles = 0;
let nuestroCero = 0;
let sinArchivo = 0;

for (const a of filas) {
  const etiqueta = etiquetas.get(String(a.temporada)) ?? null;
  const candidatos = [];
  if (etiqueta) {
    for (const tipo of ['actas-adultos', 'actas-menores']) {
      candidatos.push(join(carpeta, `t${a.temporada}-${etiqueta}`, `comp-${a.competicion}`,
        `grupo-${a.grupo}`, tipo, `acta-${a.codigo}.json.gz`));
    }
  }
  const archivo = candidatos.find((p) => existsSync(p));

  let fuente = null;
  if (archivo) {
    try {
      const d = JSON.parse(gunzipSync(readFileSync(archivo)).toString('utf8'));
      fuente = {
        marcador: `${d.goles_local ?? '?'}-${d.goles_visitante ?? '?'}`,
        locales: Array.isArray(d.goles_equipo_local) ? d.goles_equipo_local.length : 'sin campo',
        visitantes: Array.isArray(d.goles_equipo_visitante) ? d.goles_equipo_visitante.length : 'sin campo',
        competicion: d.nombre_competicion ?? '?',
      };
    } catch (e) { fuente = { error: e.message }; }
  } else sinArchivo++;

  // Lo que hemos guardado: se cuenta lo que haya en `datos` bajo las claves de goles.
  let nuestro = 'sin datos';
  try {
    const d = typeof a.datos === 'string' ? JSON.parse(a.datos) : a.datos;
    const cuenta = (v) => (Array.isArray(v) ? v.length : typeof v === 'number' ? v : null);
    nuestro = JSON.stringify({
      goles: cuenta(d?.goles),
      golesLocal: cuenta(d?.golesLocal ?? d?.goles_local),
      golesVisitante: cuenta(d?.golesVisitante ?? d?.goles_visitante),
      claves: Object.keys(d ?? {}).slice(0, 8),
    });
  } catch { nuestro = 'datos ilegibles'; }

  console.log(`acta ${a.codigo}  t${a.temporada} c${a.competicion} g${a.grupo}`);
  console.log(`   aviso nuestro:    ${String(a.incidencias).slice(0, 70)}`);
  console.log(`   FUENTE devuelve:  ${fuente ? JSON.stringify(fuente) : 'no hay archivo archivado'}`);
  console.log(`   NOSOTROS guardamos: ${nuestro}`);
  if (fuente && typeof fuente.locales === 'number' && typeof fuente.visitantes === 'number') {
    if (fuente.locales + fuente.visitantes > 0) fuenteConGoles++;
  }
  if (/\"goles\":0/.test(nuestro)) nuestroCero++;
  console.log('');
}

console.log('══ veredicto ══');
console.log(`  actas miradas:                              ${filas.length}`);
console.log(`  sin archivo archivado (no se puede juzgar): ${sinArchivo}`);
console.log(`  la FUENTE traía goleadores:                 ${fuenteConGoles}`);
console.log(`  y nosotros guardamos CERO goles:            ${nuestroCero}`);
console.log('');
if (fuenteConGoles > 0 && fuenteConGoles === nuestroCero) {
  console.log('  → FALLO NUESTRO: la fuente los traía y no los guardamos. Hay que arreglar el analizador.');
} else if (fuenteConGoles === 0 && sinArchivo < filas.length) {
  console.log('  → El aviso es honesto: la fuente venía sin goleadores.');
} else {
  console.log('  → Casos mezclados: revisar los ejemplos de arriba uno a uno.');
}
db.close();
