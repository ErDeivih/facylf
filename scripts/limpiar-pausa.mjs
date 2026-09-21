/* Limpia una pausa global y devuelve a la cola los trabajos marcados 'bloqueado' que en realidad
 * no eran una barrera (páginas vacías, "no parece una página de jornada", códigos retirados).
 *
 * Contexto: hasta ahora una respuesta corta se etiquetaba como bloqueo y activaba una pausa global
 * de 24 h, de modo que una sola página vacía paraba una federación entera. Eso ya está corregido;
 * este script sirve para deshacer el efecto de lo que se marcó antes de la corrección.
 *
 * Uso:
 *   node scripts/limpiar-pausa.mjs --federacion murcia
 *   node scripts/limpiar-pausa.mjs --todas
 *   node scripts/limpiar-pausa.mjs --federacion murcia --seco
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');

function argumento(nombre, porDefecto = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : porDefecto;
}
const seco = process.argv.includes('--seco');
const federacion = argumento('federacion');
const todas = process.argv.includes('--todas');

if (!federacion && !todas) {
  console.error('Indica --federacion <nombre> o --todas.');
  process.exit(1);
}

const CARPETAS = {
  'castilla-leon': 'descargas-federacion',
  valencia: 'descargas-valencia',
  madrid: 'descargas-madrid',
};
function carpetaDe(nombre) {
  return CARPETAS[nombre] ?? `descargas-${nombre}`;
}

const nombres = todas
  ? ['castilla-leon', 'andalucia', 'aragon', 'asturias', 'canarias', 'cantabria', 'castilla-la-mancha',
    'ceuta', 'euskadi', 'extremadura', 'galicia', 'madrid', 'murcia', 'navarra', 'rioja', 'valencia']
  : [federacion];

for (const nombre of nombres) {
  const dbPath = join(RAIZ, carpetaDe(nombre), 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(dbPath)) { console.log(`${nombre}: no hay cola en ${dbPath}`); continue; }

  let db;
  try { db = new DatabaseSync(dbPath); } catch (e) { console.log(`${nombre}: no se pudo abrir (${e.message})`); continue; }
  db.exec('pragma busy_timeout=5000');

  const metadatos = Object.fromEntries(db.prepare('select clave, valor from metadatos').all().map((f) => [f.clave, f.valor]));
  const hasta = metadatos.pausa_global_hasta || '';
  const vigente = hasta && new Date(hasta) > new Date();

  const bloqueados = db.prepare(
    "select clave, tipo, intentos, ultimo_error, siguiente_intento from trabajos where estado='bloqueado'"
  ).all();

  // Sólo se reabren los que no son barreras de verdad: una barrera se reconoce por su motivo.
  const esBarrera = (m) => /barrera o límite detectado|captcha|access denied|acceso denegado|sonicwall|too many requests/i.test(m ?? '');
  const reabribles = bloqueados.filter((b) => !esBarrera(b.ultimo_error));

  console.log(`== ${nombre} ==`);
  console.log(`   pausa global: ${vigente ? `ACTIVA hasta ${hasta}` : 'no activa'}${hasta ? ` (motivo: ${metadatos.pausa_global_motivo || '—'})` : ''}`);
  console.log(`   bloqueados: ${bloqueados.length} · reabribles (no son barrera): ${reabribles.length}`);
  for (const b of reabribles) console.log(`     · ${b.clave}  intentos=${b.intentos}  ${b.ultimo_error}`);

  if (seco) { console.log('   (modo seco: sin cambios)'); continue; }

  if (vigente) {
    db.prepare("update metadatos set valor='' where clave='pausa_global_hasta'").run();
    db.prepare("update metadatos set valor='' where clave='pausa_global_motivo'").run();
    console.log('   pausa global retirada.');
  }
  if (reabribles.length) {
    const stmt = db.prepare("update trabajos set estado='pendiente', siguiente_intento=NULL, actualizado_en=? where clave=?");
    for (const b of reabribles) stmt.run(new Date().toISOString(), b.clave);
    console.log(`   ${reabribles.length} trabajo(s) devueltos a la cola para reintento inmediato.`);
  }
  db.close();
}
console.log('\nHecho. Los reintentos se verán en el registro de cada federación.');
