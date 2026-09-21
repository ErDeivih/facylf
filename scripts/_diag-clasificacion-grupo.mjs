/*
 * ¿POR QUÉ no se recuperan los 23 partidos desplazados del grupo 904326881 de Valencia?
 *
 * La hipótesis es que ese grupo no tiene clasificación publicada (`clasificacion.json` vacío), y sin ella el
 * equipo que el calendario no nombra no se puede identificar. Esto lo comprueba, y además mira si el
 * recolector tiene ese grupo en su plan (un trabajo de clasificación pendiente o aplazado).
 *
 * Sólo lee. Uso: node scripts/_diag-clasificacion-grupo.mjs valencia 21 29509582 904326881
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const [federacion, temporada, competicion, grupo] = process.argv.slice(2);
const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const jornada = db.prepare(`select archivo from jornadas where temporada=? and competicion=? and grupo=? order by numero limit 1`)
  .get(temporada, competicion, grupo);
console.log(`jornada de referencia: ${jornada?.archivo ?? '(no hay)'}`);
if (jornada?.archivo) {
  const dir = dirname(jornada.archivo);
  for (const nombre of ['clasificacion.json', 'clasificacion.html', 'clasificacion.html.gz']) {
    const ruta = join(dir, nombre);
    if (!existsSync(ruta)) { console.log(`  ${nombre}: NO EXISTE`); continue; }
    const bytes = statSync(ruta).size;
    let resumen = '';
    if (nombre.endsWith('.json')) {
      try {
        const datos = JSON.parse(readFileSync(ruta, 'utf8'));
        resumen = ` · ${Array.isArray(datos) ? `${datos.length} equipos` : 'no es una lista'}`;
        if (Array.isArray(datos) && datos.length > 0) resumen += ` · ejemplo: ${JSON.stringify(datos[0]).slice(0, 120)}`;
      } catch (e) { resumen = ` · ilegible: ${e.message}`; }
    }
    console.log(`  ${nombre}: ${bytes} bytes${resumen}`);
  }
}

console.log('\ntrabajos del recolector para ese grupo:');
const filas = db.prepare(`select tipo, estado, count(*) n, min(siguiente_intento) proximo from trabajos
  where temporada=? and competicion=? and grupo=? group by tipo, estado order by tipo, estado`)
  .all(temporada, competicion, grupo);
if (!filas.length) console.log('  (ninguno)');
for (const f of filas) console.log(`  ${f.tipo} · ${f.estado} · ${f.n} · próximo ${f.proximo ?? '—'}`);
db.close();
