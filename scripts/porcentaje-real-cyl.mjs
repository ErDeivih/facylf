/*
 * ── EL PORCENTAJE REAL DE CADA TEMPORADA DE CASTILLA Y LEÓN ─────────────────────────────────────────────
 *
 * POR QUÉ EL ANTERIOR NO VALÍA (me lo dijo el responsable, y tenía razón): yo dividía actas guardadas entre
 * partidos **conocidos**, y los partidos conocidos son sólo los de los grupos que YA se han descubierto. Si de
 * una temporada la federación publica 40 competiciones y nosotros hemos descubierto 12, mi cuenta decía «98 %»
 * cuando en realidad faltaba más de la mitad por descubrir. El denominador era lo que teníamos, no lo que hay.
 *
 * EL DENOMINADOR BUENO es el **catálogo de la federación** (`descargas-federacion/competiciones-por-temporada.json`):
 * la lista de competiciones que la propia federación publica para cada temporada. Con eso se mide de verdad:
 *
 *   1. **% descubierto**   = competiciones con grupos en la cola / competiciones del catálogo de la federación;
 *   2. **% con grupos**    = de las descubiertas, cuántas tienen ya sus grupos comprobados;
 *   3. **% de actas**      = actas guardadas / partidos conocidos (dentro de lo descubierto);
 *   4. **% real estimado** = (1) × (3): el porcentaje de la temporada que se lleva, contando que lo no
 *      descubierto no se ha recolectado. Es una ESTIMACIÓN, y se dice: supone que las competiciones que faltan
 *      tienen de media los mismos partidos que las ya descubiertas.
 *
 * Uso:  node scripts/porcentaje-real-cyl.mjs <cola.sqlite> <catalogo.json> [etiqueta]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';

const [rutaCola, rutaCatalogo, etiqueta = rutaCola] = process.argv.slice(2);
if (!rutaCola || !rutaCatalogo || !existsSync(rutaCola) || !existsSync(rutaCatalogo)) {
  console.error('uso: node scripts/porcentaje-real-cyl.mjs <cola.sqlite> <catalogo.json> [etiqueta]');
  process.exit(2);
}
const catalogo = JSON.parse(readFileSync(rutaCatalogo, 'utf8'));
const db = new DatabaseSync(rutaCola, { readOnly: true });

// Las etiquetas de temporada de la propia cola.
const nombres = new Map();
try {
  for (const t of db.prepare('select codigo, etiqueta from temporadas').all()) nombres.set(String(t.codigo).trim(), t.etiqueta);
} catch { /* sin tabla de temporadas */ }

console.log(`\n════════ ${etiqueta} ════════`);
console.log('temporada    del catalogo   descubiertas   con grupos   grupos   partidos   actas   % descubierto   % actas   % REAL');
let acumulado = { catalogo: 0, descubiertas: 0, partidos: 0, actas: 0 };

for (const codigo of Object.keys(catalogo).sort((a, b) => Number(b) - Number(a))) {
  const delCatalogo = (catalogo[codigo] ?? []).length;
  if (delCatalogo === 0) continue;

  const descubiertas = db.prepare('select count(distinct codigo) as n from competiciones where temporada = ?').get(codigo).n;
  const conGrupos = db.prepare('select count(*) as n from competiciones where temporada = ? and grupos_comprobados_en is not null').get(codigo).n;
  const grupos = db.prepare('select count(*) as n from grupos where temporada = ?').get(codigo).n;
  const partidos = db.prepare('select count(*) as n from partidos where temporada = ?').get(codigo).n;
  const actas = db.prepare('select count(*) as n from actas where temporada = ?').get(codigo).n;

  const pctDesc = Math.round((100 * descubiertas) / delCatalogo);
  const pctActas = partidos > 0 ? Math.min(100, Math.round((100 * actas) / partidos)) : 0;
  // El porcentaje real: lo que se lleva de la temporada, con lo no descubierto contando como cero.
  const pctReal = Math.round((pctDesc / 100) * pctActas);

  acumulado.catalogo += delCatalogo;
  acumulado.descubiertas += Number(descubiertas);
  acumulado.partidos += Number(partidos);
  acumulado.actas += Number(actas);

  console.log(`${String(nombres.get(String(codigo)) ?? `t${codigo}`).padEnd(11)} ${String(delCatalogo).padStart(12)} ${String(descubiertas).padStart(14)} ${String(conGrupos).padStart(12)} ${String(grupos).padStart(8)} ${String(partidos).padStart(10)} ${String(actas).padStart(7)} ${String(pctDesc + ' %').padStart(14)} ${String(pctActas + ' %').padStart(9)} ${String(pctReal + ' %').padStart(8)}`);
}

const pctDescTotal = Math.round((100 * acumulado.descubiertas) / Math.max(1, acumulado.catalogo));
const pctActasTotal = Math.min(100, Math.round((100 * acumulado.actas) / Math.max(1, acumulado.partidos)));
console.log(`\n  TOTAL: ${acumulado.descubiertas} competiciones descubiertas de ${acumulado.catalogo} que publica la federación (${pctDescTotal} %)`);
console.log(`         ${acumulado.actas} actas de ${acumulado.partidos} partidos conocidos (${pctActasTotal} %)`);
console.log(`         PORCENTAJE REAL ESTIMADO: ${Math.round((pctDescTotal / 100) * pctActasTotal)} %`);
db.close();
