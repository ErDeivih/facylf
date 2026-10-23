/*
 * recalcula-menores.mjs — pone bien la marca de «acta de menores» en lo ya recogido
 *
 * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────────────────────────────────
 *
 * Medido el 24/09/2026: la regla que decide si una competición es de menores exigía una «n» final («Alevín»),
 * pero en valenciano y catalán la categoría se escribe SIN ella («Aleví», «Benjamí»). Resultado: **31.677 actas
 * de Valencia**, en 35 competiciones de alevines, benjamines y prebenjamines, quedaron marcadas como de ADULTOS.
 *
 * La regla ya está corregida, y eso arregla lo que se recoja a partir de ahora. Lo ya guardado no: su marca está
 * escrita en la base. Este guion la RECALCULA usando el nombre de la competición que ya tenemos, así que no hay
 * que volver a pedirle nada a ningún portal.
 *
 * ── QUÉ CONSECUENCIAS TIENE, DICHAS CLARO ───────────────────────────────────────────────────────────────
 *
 * Marcar bien esas actas significa que pasan a estar sujetas a la protección de menores que pide el proyecto
 * (no publicar nombres de menores). Es decir: **el arreglo no es cosmético, y por eso se enseña primero lo que
 * haría** —sin `--aplicar` no toca nada— y sólo después se escribe.
 *
 * Uso:
 *   node scripts/servidor/recalcula-menores.mjs <ruta-cola.sqlite>              (sólo informa)
 *   node scripts/servidor/recalcula-menores.mjs <ruta-cola.sqlite> --aplicar    (lo escribe)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
const aplicar = process.argv.includes('--aplicar');
if (!ruta || !existsSync(ruta)) {
  console.error('uso: recalcula-menores.mjs <ruta-cola.sqlite> [--aplicar]');
  process.exit(2);
}

// La clasificación REAL, importada: una copia se desincronizaría (y ya pasó con la «n» final).
const { esCompeticionDeMenores } = await import('../lib/recolector-local.mjs');

const db = new DatabaseSync(ruta, { readOnly: !aplicar, timeout: 60_000 });
const n = (x) => Number(x ?? 0).toLocaleString('es-ES');

const filas = db.prepare(`select a.temporada, a.competicion,
    sum(case when a.menores = 1 then 1 else 0 end) marcadasMenores,
    sum(case when a.menores = 0 then 1 else 0 end) marcadasAdultos,
    (select nombre from competiciones c where c.temporada = a.temporada and c.codigo = a.competicion) nombre
  from actas a group by a.temporada, a.competicion`).all();

let aMenores = 0;      // de adultas a menores
let aAdultos = 0;      // de menores a adultas (por si la regla anterior se pasó)
let actasAMenores = 0;
let actasAAdultos = 0;
const ejemplos = [];

const cambios = [];
for (const f of filas) {
  const deberia = esCompeticionDeMenores(f.nombre ?? '') ? 1 : 0;
  if (deberia === 1 && Number(f.marcadasAdultos) > 0) {
    aMenores++; actasAMenores += Number(f.marcadasAdultos);
    cambios.push({ temporada: f.temporada, competicion: f.competicion, valor: 1, cuantas: Number(f.marcadasAdultos) });
    if (ejemplos.length < 6) ejemplos.push(`  → MENORES  ${n(f.marcadasAdultos).padStart(7)} actas · «${f.nombre}»`);
  } else if (deberia === 0 && Number(f.marcadasMenores) > 0) {
    aAdultos++; actasAAdultos += Number(f.marcadasMenores);
    cambios.push({ temporada: f.temporada, competicion: f.competicion, valor: 0, cuantas: Number(f.marcadasMenores) });
    if (ejemplos.length < 6) ejemplos.push(`  → ADULTAS  ${n(f.marcadasMenores).padStart(7)} actas · «${f.nombre}»`);
  }
}

console.log(`cola: ${ruta}`);
console.log(`  competiciones que pasan a MENORES: ${aMenores}   (${n(actasAMenores)} actas)`);
console.log(`  competiciones que pasan a ADULTAS: ${aAdultos}   (${n(actasAAdultos)} actas)`);
for (const e of ejemplos) console.log(e);

if (!cambios.length) { console.log('\n  nada que corregir.'); db.close(); process.exit(0); }

if (!aplicar) {
  console.log('\n  MODO CONSULTA: añade --aplicar para escribirlo.');
  db.close();
  process.exit(0);
}

db.exec('begin immediate');
try {
  const actualiza = db.prepare(`update actas set menores = ? where temporada = ? and competicion = ? and menores <> ?`);
  let tocadas = 0;
  for (const c of cambios) {
    tocadas += Number(actualiza.run(c.valor, c.temporada, c.competicion, c.valor).changes ?? 0);
  }
  db.exec('commit');
  console.log(`\n  ✓ corregidas ${n(tocadas)} actas.`);
} catch (error) {
  db.exec('rollback');
  throw error;
}
db.close();
