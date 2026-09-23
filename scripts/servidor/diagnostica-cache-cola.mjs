#!/usr/bin/env node
/*
 * ── ¿CABE LA COLA EN LA CACHÉ DE SQLITE? ─────────────────────────────────────────────────────────────────
 *
 * De los 5,24 s de `acta_estructura` en Andalucía, lo que manda son los `insert` de `guardaActaEstructura`
 * (participaciones, eventos, técnicos y personas, con sus índices): la reconciliación y el `update` final son
 * milisegundos. Y son muchísimos `insert` pequeños contra una cola de cientos de megas.
 *
 * Eso apunta a un sospechoso concreto: **cada `insert` toca páginas del árbol B que pueden no estar en la
 * caché de SQLite**, y en un disco duro cada fallo de caché cuesta decenas de milisegundos. La caché por
 * defecto de SQLite son 2.000 páginas (~8 MB con páginas de 4 KB): en una base de 438 MB eso es el 2 %.
 *
 * Este programa mide las tres cifras que lo confirman o lo tiran: tamaño de página, número de páginas (o sea
 * el tamaño de la base) y caché configurada. Y de paso el registro WAL, que en modo WAL es donde van las
 * escrituras nuevas.
 *
 * SÓLO LEE.
 *
 * Uso (dentro de un contenedor):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/diagnostica-cache-cola.mjs [federación…]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACIONES = process.argv.slice(2).length ? process.argv.slice(2) : ['andalucia', 'murcia'];

console.log('  federación            base MB   página  páginas   caché       caché MB   ¿cabe?');
for (const federacion of FEDERACIONES) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) { console.log(`  ${federacion.padEnd(20)} (no existe)`); continue; }

  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 30_000 });
    const leer = (pragma) => {
      const fila = db.prepare(`pragma ${pragma}`).get();
      return fila ? Object.values(fila)[0] : null;
    };
    const pagina = Number(leer('page_size'));
    const paginas = Number(leer('page_count'));
    const cache = Number(leer('cache_size'));   // negativo = KiB; positivo = páginas

    const cachePaginas = cache < 0 ? Math.abs(cache) * 1024 / pagina : cache;
    const cacheMb = cachePaginas * pagina / 1024 / 1024;
    const baseMb = paginas * pagina / 1024 / 1024;
    const porcentaje = 100 * cacheMb / (baseMb || 1);

    // El WAL es donde caen las escrituras nuevas; si es grande, los puntos de control pesan.
    let walMb = 0;
    try { walMb = statSync(`${ruta}-wal`).size / 1024 / 1024; } catch { /* sin WAL */ }

    console.log(`  ${federacion.padEnd(20)} ${baseMb.toFixed(0).padStart(7)}   ${String(pagina).padStart(6)}  `
      + `${String(paginas).padStart(8)}   ${String(cache).padStart(6)}   ${cacheMb.toFixed(1).padStart(8)}   `
      + `${porcentaje.toFixed(1).padStart(5)} %` + (walMb ? `   (WAL ${walMb.toFixed(1)} MB)` : ''));
    db.close();
  } catch (error) {
    console.log(`  ${federacion.padEnd(20)} no se pudo leer: ${String(error.message).slice(0, 40)}`);
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}

console.log('\n  «¿cabe?» es qué porcentaje de la base entra en la caché. Si es de un dígito, cada consulta y cada');
console.log('  `insert` van a buscar páginas al DISCO, y en un disco duro eso son decenas de milisegundos por');
console.log('  página. Subir `cache_size` es barato —es memoria, no disco— y se mide: ver FACYLF_CACHE_MB.');
