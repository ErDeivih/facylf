/*
 * ── ¿ESTÁN SANAS TODAS LAS COLAS? ────────────────────────────────────────────────────────────────────────
 *
 * Las SQLite de cada federación son **la evidencia de la ingesta**: si el canónico se pierde, se reconstruye
 * desde ellas; si una cola se pierde, lo que había dentro no se recupera de ningún sitio (el HTML archivado sí
 * se queda, pero la cola sabe qué falta, qué falló y por qué).
 *
 * Así que «¿no hemos perdido datos?» se contesta con dos preguntas por cada cola:
 *
 *   1. **¿Abre y está íntegra?** Un fichero cortado por un apagón a lo bruto da «database disk image is
 *      malformed» al consultarlo. `pragma quick_check` lo dice en segundos sin bloquear a nadie: es la
 *      comprobación que hay que hacer SIEMPRE después de un apagón, no sólo cuando algo va mal.
 *   2. **¿Sigue teniendo lo que tenía?** Los recuentos por estado (actas hechas, pendientes, trabajos) son la
 *      firma de la cola: si mañana aparecen a cero, es que se ha perdido, no que se haya terminado.
 *
 * Uso:  node scripts/verifica-colas.mjs <directorio o fichero> [...]
 *       Busca `cola-v2.sqlite` y `cola.sqlite` dentro de los directorios que se le pasen.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, statSync, lstatSync, readlinkSync } from 'node:fs';
import { join, basename } from 'node:path';

const raices = process.argv.slice(2);
if (raices.length === 0) {
  console.error('uso: node scripts/verifica-colas.mjs <directorio o fichero> [...]');
  process.exit(2);
}

/** Encuentra las colas: directamente el fichero, o dentro del árbol hasta dos niveles (la estructura cambia). */
function encuentraColas(raiz, salida = [], profundidad = 0) {
  if (!existsSync(raiz)) return salida;
  const st = lstatSync(raiz);
  if (st.isFile()) {
    if (/^cola(-v2)?\.sqlite$/.test(basename(raiz))) salida.push(raiz);
    return salida;
  }
  if (profundidad > 3) return salida;
  for (const e of readdirSync(raiz, { withFileTypes: true })) {
    const p = join(raiz, e.name);
    if (e.isFile()) { if (/^cola(-v2)?\.sqlite$/.test(e.name)) salida.push(p); continue; }
    if (e.isDirectory() || e.isSymbolicLink()) encuentraColas(p, salida, profundidad + 1);
  }
  return salida;
}

const colas = [...new Set(raices.flatMap((r) => encuentraColas(r)))].sort();
if (colas.length === 0) { console.log('no he encontrado ninguna cola'); process.exit(0); }

console.log(`${colas.length} colas encontradas\n`);
console.log('cola                           tamano   actas(hechas/pend/sindatos)  trabajos(hechos/pend)   quick_check');
let malas = 0;
let totalActas = 0;
const resumen = [];
for (const ruta of colas) {
  const real = (() => { try { return lstatSync(ruta).isSymbolicLink() ? readlinkSync(ruta) : ruta; } catch { return ruta; } })();
  let linea = { ruta, ok: true };
  let db = null;
  try {
    db = new DatabaseSync(real, { readOnly: true });
    let integridad = 'no comprobado';
    try { integridad = db.prepare('pragma quick_check').get()?.quick_check ?? 'sin resultado'; } catch (e) { integridad = `ERROR: ${e.message}`; }
    const cta = (sql, ...p) => { try { return db.prepare(sql).get(...p)?.n ?? 0; } catch { return null; }; };
    const hechas = cta("select count(*) n from actas where estado='hecha'");
    const pend = cta("select count(*) n from actas where estado='pendiente'");
    const sin = cta("select count(*) n from actas where estado='sin_datos'");
    const tHechos = cta("select count(*) n from trabajos where estado='hecho'");
    const tPend = cta("select count(*) n from trabajos where estado in ('pendiente','bloqueado')");
    const tam = statSync(real).size;
    totalActas += (hechas ?? 0);
    const nombre = basename(ruta) === basename(real) ? ruta : `${ruta} -> ${real}`;
    console.log(`${nombre.slice(-70).padEnd(30)} ${String((tam / 1048576).toFixed(0) + ' MB').padStart(7)}   ` +
      `${String(hechas).padStart(7)}/${String(pend).padStart(7)}/${String(sin).padStart(4)}   ` +
      `${String(tHechos).padStart(8)}/${String(tPend).padStart(8)}   ${integridad}`);
    if (integridad !== 'ok') malas += 1;
    linea = { ruta, ok: integridad === 'ok', hechas, pend, tHechos, tPend, integridad, tam };
  } catch (error) {
    malas += 1;
    console.log(`${ruta.slice(-70).padEnd(30)}   NO SE PUDO ABRIR: ${error.message}`);
    linea = { ruta, ok: false, error: error.message };
  } finally {
    try { db?.close(); } catch { /* nada */ }
  }
  resumen.push(linea);
}

console.log(`\nactas hechas en total (suma de todas las colas): ${totalActas.toLocaleString('es-ES')}`);
if (malas) {
  console.log(`\n*** ${malas} COLA(S) CON PROBLEMA — revisar antes de dar nada por bueno ***`);
  for (const r of resumen.filter((x) => !x.ok)) console.log(`   ${r.ruta}  ${r.integridad ?? r.error}`);
  process.exit(1);
}
console.log('\ntodas las colas abren y pasan `quick_check`: no hay corrupcion.');
