/*
 * ── ¿COINCIDE NUESTRO CATÁLOGO DE CATALUÑA CON LA API DE LA FCF? ────────────────────────────────────────
 *
 * El 08/10/2026 se encontró la API completa de la FCF (ver `FEDERACIONES-CON-PROBLEMAS-2026-10-08.md`):
 *
 *   GET /api/competition/temporadas                          → las dos temporadas que existen
 *   GET /api/competition/disciplines                         → las 7 modalidades
 *   GET /api/competition/competicions?temporadaId&disciplinaId → la lista de competiciones
 *
 * Y eso permite algo que hasta ahora no se podía: **verificar el catálogo que construyó el descubrimiento con
 * navegador contra una fuente independiente**. Si la API devuelve más competiciones de las que tenemos, al
 * catálogo le faltan y el descubrimiento se dejó cosas por el camino.
 *
 * Pide sólo lo necesario y con pausa entre peticiones, como todo lo de este proyecto. Imprime **números**, no
 * listas: lo que importa es si cuadran.
 *
 * Uso:  node scripts/compara-catalogo-api.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

const API = 'https://www.fcf.cat/api/competition';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const CATALOGO = 'descargas-cataluna/catalogo-fcf.json';

const pide = async (ruta) => {
  const r = await fetch(`${API}/${ruta}`, { headers: { Accept: 'application/json', 'User-Agent': 'FACyLF/1.0 (proyecto personal sin animo de lucro)' }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

try {
  const temporadas = await pide('temporadas');
  const disciplinas = await pide('disciplines');
  console.log(`  API: ${temporadas.length} temporada(s) · ${disciplinas.length} disciplinas`);

  // Nuestro catálogo, para comparar.
  const catalogo = existsSync(CATALOGO) ? JSON.parse(readFileSync(CATALOGO, 'utf8').replace(/^\uFEFF/, '')) : null;
  const nuestras = new Map();
  if (catalogo) {
    for (const t of catalogo.temporadas ?? []) {
      nuestras.set(String(t.nombre ?? t.id), (t.competiciones ?? []).length);
    }
    console.log(`  catálogo: ${[...nuestras.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`);
  }

  let totalApi = 0;
  console.log('\n  competiciones por temporada y disciplina (API):');
  for (const t of temporadas) {
    let porTemp = 0;
    const detalle = [];
    for (const d of disciplinas) {
      await dormir(4000); // la misma prudencia que el resto del proyecto
      try {
        const lista = await pide(`competicions?temporadaId=${encodeURIComponent(t.value)}&disciplinaId=${encodeURIComponent(d.value)}`);
        porTemp += lista.length;
        detalle.push(`${d.label}:${lista.length}`);
      } catch (e) {
        detalle.push(`${d.label}:ERR(${String(e.message).slice(0, 20)})`);
      }
    }
    totalApi += porTemp;
    const nuestra = nuestras.get(t.label) ?? nuestras.get(t.value) ?? nuestras.get(t.label.replace('-', '-')) ?? '?';
    console.log(`    ${t.label}  API=${String(porTemp).padStart(4)}  catálogo=${String(nuestra).padStart(4)}  ${porTemp === nuestra ? '✓ COINCIDE' : '← DIFERENCIA'}`);
    console.log(`      ${detalle.join(' · ')}`);
  }
  console.log(`\n  TOTAL API: ${totalApi}   ·   TOTAL catálogo: ${[...nuestras.values()].reduce((a, b) => a + b, 0)}`);
} catch (e) {
  console.error(`  *** ${e.message} ***`);
}
