/* ¿Se está descubriendo todo? Se compara lo que hay en cada base con el catálogo que se obtuvo del
 * propio desplegable de la web (los ficheros de sondeo). Cualquier competición que esté en el
 * catálogo y NO en la base es un hueco de descubrimiento.
 *
 * Todo local: no se hace ninguna petición. */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SONDEO = 'descargas-federacion-sondeo';
const ahora = new Date().toISOString();

function leeJson(ruta) {
  try { return JSON.parse(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; }
}

/** Catálogo del desplegable: { temporada: Set(competiciones) } */
function catalogoDeSonodeo(nombre) {
  const posibles = [
    join(SONDEO, `${nombre}-sondeo.json`),
    join(SONDEO, `${nombre}-isquad-sondeo.json`),
  ];
  for (const p of posibles) {
    if (!existsSync(p)) continue;
    const d = leeJson(p);
    if (!d) continue;
    const porTemporada = new Map();
    for (const t of d.temporadas ?? []) {
      const set = new Set();
      for (const c of t.competiciones ?? []) set.add(String(c.codigo ?? c.codCompeticion ?? ''));
      porTemporada.set(String(t.codigo), set);
    }
    if (porTemporada.size) return { ruta: p, porTemporada };
  }
  return null;
}

const federaciones = readdirSync('.').filter((d) => d.startsWith('descargas-') && d !== SONDEO).sort();
console.log('federación           temporadas  competiciones   grupos    ¿faltan del catálogo?');
console.log('-'.repeat(88));

for (const dir of federaciones) {
  const nombre = dir === 'descargas-federacion' ? 'castilla-leon' : dir.replace(/^descargas-/, '');
  const ruta = join(dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const n = (s, ...a) => db.prepare(s).get(...a).n;

  const temporadas = n('select count(*) n from temporadas');
  const competiciones = n('select count(*) n from competiciones');
  const grupos = n("select count(*) n from grupos where estado != 'ausente_web'");
  const compsBd = new Set(db.prepare('select temporada, codigo from competiciones').all()
    .map((r) => `${r.temporada}|${r.codigo}`));
  db.close();

  const catalogo = catalogoDeSonodeo(nombre);
  let faltan = 0; let enCatalogo = 0; const ejemplos = [];
  const porTemporadaFaltan = new Map();
  if (catalogo) {
    for (const [temporada, comps] of catalogo.porTemporada) {
      for (const c of comps) {
        if (!c) continue;
        enCatalogo += 1;
        if (!compsBd.has(`${temporada}|${c}`)) {
          faltan += 1;
          porTemporadaFaltan.set(temporada, (porTemporadaFaltan.get(temporada) ?? 0) + 1);
          if (ejemplos.length < 3) ejemplos.push(`t${temporada}/${c}`);
        }
      }
    }
  }
  // Se resume POR TEMPORADA: si todo lo que falta es de temporadas anteriores al año de inicio
  // configurado, no es un hueco de descubrimiento sino alcance deliberado.
  const detalleTemporadas = [...porTemporadaFaltan.entries()]
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([t, n]) => `t${t}:${n}(=${2004 + Number(t)})`).slice(0, 5).join(' ');
  const aviso = !catalogo ? '(sin catálogo de sondeo)'
    : faltan === 0 ? 'no, todo presente'
      : `faltan ${faltan}/${enCatalogo} -> ${detalleTemporadas}`;
  console.log(`${nombre.padEnd(20)} ${String(temporadas).padStart(9)} ${String(competiciones).padStart(13)} ${String(grupos).padStart(8)}   ${aviso}`);
}

console.log('\nPistas sobre el sondeo disponible:');
for (const f of readdirSync(SONDEO).filter((x) => x.endsWith('.json')).sort()) {
  const d = leeJson(join(SONDEO, f));
  if (!d) continue;
  const comps = (d.temporadas ?? []).reduce((s2, t) => s2 + (t.competiciones ?? []).length, 0);
  const gr = (d.temporadas ?? []).reduce((s2, t) => s2 + (t.competiciones ?? []).reduce((s3, c) => s3 + (c.grupos ?? []).length, 0), 0);
  console.log(`   ${f.padEnd(34)} temporadas=${String((d.temporadas ?? []).length).padStart(3)} competiciones=${String(comps).padStart(6)} grupos=${String(gr).padStart(6)}`);
}
