/*
 * mide-archivo-original.mjs — ¿está guardada la ficha original de todo lo que damos por recogido?
 *
 * ── LA PREGUNTA DEL RESPONSABLE (24/09/2026) ────────────────────────────────────────────────────────────
 *
 * «Si los datos están correctamente cogidos, más adelante podemos ver si hay algún problema y arreglarlo
 * porque tenemos los datos originales de la web, ¿no?»
 *
 * La respuesta depende de UNA cosa medible: que la ficha original esté archivada para cada acta que damos por
 * hecha. Si lo está, cualquier error de análisis se puede corregir DESPUÉS y sin volver a molestar a los
 * portales —que es lo que permite arreglar cosas como la clasificación de menores o un descuadre de goles
 * sobre lo ya guardado—. Si falta, esa acta concreta se queda como está: no hay de dónde reprocesarla.
 *
 * Y hay un motivo real para medirlo en vez de suponerlo: al investigar el descuadre de goles de Euskadi
 * aparecieron dos actas (t13 y t14) cuya ficha original NO estaba. Eran temporadas antiguas, pero conviene
 * saber cuántas son.
 *
 * Lo que se comprueba, sobre una muestra AL AZAR (mirar las últimas enseñaría justo las que menos problemas
 * han dado):
 *
 *   · actas dadas por hecha;
 *   · si tienen ficha original archivada (por la columna `archivo`, y si no, por la ruta de siempre);
 *   · y si esa ficha tiene contenido de verdad (no un fichero vacío).
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/mide-archivo-original.mjs <raíz> [federación...] [--muestra 200]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const raiz = process.argv[2];
if (!raiz) { console.error('uso: mide-archivo-original.mjs <raíz> [federación...]'); process.exit(2); }
const iMuestra = process.argv.indexOf('--muestra');
const muestra = iMuestra > 0 ? Number(process.argv[iMuestra + 1]) : 150;
const pedidas = process.argv.slice(3).filter((a) => !a.startsWith('--') && Number.isNaN(Number(a)));

const federaciones = pedidas.length ? pedidas : readdirSync(raiz)
  .filter((d) => d.startsWith('descargas-') && existsSync(join(raiz, d, 'recolector-local', 'cola-v2.sqlite')))
  .map((d) => d.replace('descargas-', '')).sort();

const n = (x) => Number(x ?? 0).toLocaleString('es-ES');
console.log(`══ ¿está archivada la ficha original? · muestra de ${muestra} por federación ══\n`);
console.log('  federación            miradas   con original   sin original   vacías');

let totalMiradas = 0;
let totalSin = 0;

for (const fed of federaciones) {
  const carpeta = join(raiz, `descargas-${fed}`, 'recolector-local');
  const db = new DatabaseSync(join(carpeta, 'cola-v2.sqlite'), { readOnly: true, timeout: 120_000 });
  const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [String(t.codigo), t.etiqueta]));

  // Sólo las claves: leer `datos` para toda la tabla costaría minutos en disco duro.
  const filas = db.prepare(`select temporada, competicion, grupo, codigo, archivo
    from actas where estado='hecha' order by random() limit ?`).all(muestra);

  let conOriginal = 0, sinOriginal = 0, vacias = 0;
  for (const f of filas) {
    const candidatas = [];
    if (f.archivo) candidatas.push(String(f.archivo).startsWith('/') ? String(f.archivo) : join(carpeta, String(f.archivo)));
    const etiqueta = etiquetas.get(String(f.temporada));
    if (etiqueta) {
      const base = join(carpeta, `t${f.temporada}-${etiqueta}`, `comp-${f.competicion}`, `grupo-${f.grupo}`);
      for (const tipo of ['actas-adultos', 'actas-menores']) {
        for (const ext of ['html', 'json.gz', 'json']) candidatas.push(join(base, tipo, `acta-${f.codigo}.${ext}`));
      }
    }
    const encontrada = candidatas.find((p) => existsSync(p));
    if (!encontrada) { sinOriginal++; continue; }
    try {
      if (statSync(encontrada).size < 200) { vacias++; conOriginal++; } else conOriginal++;
    } catch { conOriginal++; }
  }

  totalMiradas += filas.length;
  totalSin += sinOriginal;
  const pct = (v) => `${((v / Math.max(1, filas.length)) * 100).toFixed(1)} %`;
  console.log(`  ${fed.padEnd(20)} ${String(n(filas.length)).padStart(7)}   ${pct(conOriginal).padStart(6)}         ${pct(sinOriginal).padStart(6)}        ${vacias}`);
  db.close();
}

console.log(`\n  total: ${n(totalMiradas)} actas miradas · ${n(totalSin)} sin ficha original (${((totalSin / Math.max(1, totalMiradas)) * 100).toFixed(1)} %)`);
console.log(totalSin === 0
  ? '  → Todo lo recogido se puede reprocesar más adelante sin volver a pedir nada a los portales.'
  : '  → Hay actas que NO se podrían reprocesar: sólo se arreglarían volviendo a descargarlas.');
