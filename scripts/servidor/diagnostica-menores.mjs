/*
 * diagnostica-menores.mjs — ¿por qué hay actas de niños marcadas como de adultos?
 *
 * ── EL FALLO QUE BUSCA (24/09/2026) ─────────────────────────────────────────────────────────────────────
 *
 * Se encontraron actas de competiciones «Aleví» y «Benjamí» (8-12 años) marcadas como de ADULTOS en la cola.
 * Importa de verdad: los invariantes del proyecto prohíben publicar nombres de menores, y esa protección se
 * aplica según esta marca. Si está mal, la protección no se está aplicando a esas fichas.
 *
 * La marca se calcula con `esCompeticionDeMenores(nombre)`, que SÍ reconoce «alevín» y «benjamín»… pero el
 * nombre se lee de la tabla `competiciones` y, si esa fila no existe, se le pasa una CADENA VACÍA: la expresión
 * regular no casa y el acta queda como adulta **sin ningún aviso**. Eso es lo que este guion comprueba.
 *
 * Compara, competición por competición:
 *   · el nombre que hay en `competiciones` (lo que usa el recolector para decidir);
 *   · cuántas actas tiene y cómo están marcadas.
 *
 * Y señala las que están MAL: nombre de base con actas marcadas como adultas, o nombre vacío.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/diagnostica-menores.mjs <ruta-cola.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) {
  console.error('uso: diagnostica-menores.mjs <ruta-cola.sqlite>');
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const n = (x) => Number(x ?? 0).toLocaleString('es-ES');

// La clasificación REAL, importada del recolector: una copia se desincroniza y esta comprobación mentiría.
// (Pasó justo con esto: la copia tenía la «n» final obligatoria y por eso no vio el fallo de «Aleví».)
const { esCompeticionDeMenores: esDeMenores } = await import('../lib/recolector-local.mjs');

const filas = db.prepare(`select a.temporada, a.competicion,
    count(*) actas,
    sum(case when a.menores = 1 then 1 else 0 end) comoMenores,
    sum(case when a.menores = 0 then 1 else 0 end) comoAdultos,
    (select nombre from competiciones c where c.temporada = a.temporada and c.codigo = a.competicion) nombre
  from actas a group by a.temporada, a.competicion`).all();

console.log(`cola: ${ruta}`);
console.log(`competiciones con actas: ${filas.length}\n`);

let malClasificadas = 0;
let sinNombre = 0;
let actasAfectadas = 0;

for (const f of filas) {
  const nombre = f.nombre ?? null;
  const deberia = esDeMenores(nombre);
  const esta = Number(f.comoMenores) > 0;
  const problema = (nombre === null || nombre === '') ? 'SIN NOMBRE en `competiciones`'
    : (deberia && !esta) ? 'debería ser de MENORES y está como adulta' : null;
  if (!problema) continue;
  if (nombre === null || nombre === '') sinNombre++; else malClasificadas++;
  actasAfectadas += Number(f.comoAdultos);
  if (malClasificadas + sinNombre <= 12) {
    console.log(`  t${f.temporada} c${f.competicion}: ${n(f.actas)} actas (${n(f.comoAdultos)} como adultas)`
      + `\n     nombre: ${nombre === null ? '(no hay fila)' : nombre === '' ? '(vacío)' : nombre}`
      + `\n     → ${problema}`);
  }
}

console.log('\n══ resumen ══');
console.log(`  competiciones con nombre de base marcadas como adultas: ${malClasificadas}`);
console.log(`  competiciones SIN nombre en \`competiciones\`:            ${sinNombre}`);
console.log(`  ACTAS afectadas (marcadas como adultas y no lo son):    ${n(actasAfectadas)}`);
console.log('');
console.log(actasAfectadas > 0
  ? '  → Hay que arreglarlo: esas actas son de menores y su protección no se está aplicando.'
  : '  → La clasificación está bien en esta cola.');
db.close();
