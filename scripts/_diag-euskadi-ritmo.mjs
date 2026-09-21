/*
 * ¿Se consume el trabajo histórico de Euskadi o el planificador lo vuelve a aplazar cada arranque?
 *
 * Sólo lee. Uso: node scripts/_diag-euskadi-ritmo.mjs [federacion]
 *
 * Distingue tres cosas que se confunden con facilidad:
 *   1. aplazado a una fecha FUTURA del calendario (una jornada que aún no se ha jugado): es diseño;
 *   2. aplazado a una fecha futura CERCANA siendo HISTÓRICO (temporada < actual): es la cola de ritmo;
 *   3. aplazado al centinela 2099 (no se vuelve a intentar): es una decisión, no un reintento.
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const federacion = process.argv[2] ?? 'euskadi';
const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const ahora = new Date();
const hoy = ahora.toISOString().slice(0, 10);

const temporadaActual = db.prepare(`select max(temporada) t from jornadas where temporada < 30`).get().t ?? 0;
console.log(`═══ ${federacion} · temporada más alta de la cola: t${temporadaActual} · hoy ${hoy}`);

console.log('\n  1) pendientes HISTÓRICOS (temporada < actual) por tipo y día de vencimiento:');
const historicos = db.prepare(`select tipo, substr(coalesce(siguiente_intento, 'SIN FECHA'), 1, 10) dia, count(*) n
  from trabajos where estado = 'pendiente' and temporada < ? group by tipo, dia order by dia, tipo`).all(temporadaActual);
for (const r of historicos) console.log(`     ${String(r.dia).padEnd(12)} ${String(r.tipo).padEnd(15)} ${r.n}`);

const totalHist = db.prepare(`select count(*) n from trabajos where estado = 'pendiente' and temporada < ?`).get(temporadaActual).n;
const vencidos = db.prepare(`select count(*) n from trabajos where estado = 'pendiente' and temporada < ?
  and (siguiente_intento is null or siguiente_intento <= ?)`).get(temporadaActual, ahora.toISOString()).n;
const centinela = db.prepare(`select count(*) n from trabajos where estado = 'pendiente' and siguiente_intento like '2099%'`).get().n;
console.log(`\n  · pendientes históricos: ${totalHist} · vencidos y disponibles AHORA: ${vencidos} · centinela 2099: ${centinela}`);

console.log('\n  2) reparto por días del trabajo histórico (¿cuántos por día es el ritmo?):');
const porDia = db.prepare(`select substr(siguiente_intento, 1, 10) dia, count(*) n from trabajos
  where estado = 'pendiente' and temporada < ? and siguiente_intento not like '2099%'
  group by dia order by dia limit 40`).all(temporadaActual);
if (!porDia.length) console.log('     (ninguno con fecha futura: no hay cola de ritmo)');
for (const r of porDia) console.log(`     ${r.dia}  ${'#'.repeat(Math.min(60, r.n))} ${r.n}`);

console.log('\n  3) jornadas nunca comprobadas, por temporada:');
for (const r of db.prepare(`select temporada, count(*) total, sum(case when comprobada_en is null then 1 else 0 end) sin
  from jornadas group by temporada order by temporada`).all()) {
  console.log(`     t${String(r.temporada).padEnd(4)} ${String(r.sin).padStart(6)} sin comprobar de ${String(r.total).padStart(6)}`);
}

console.log('\n  4) actas pendientes nunca descargadas, por temporada:');
for (const r of db.prepare(`select temporada, count(*) total, sum(case when descargada_en is null then 1 else 0 end) sin
  from actas group by temporada order by temporada`).all()) {
  console.log(`     t${String(r.temporada).padEnd(4)} ${String(r.sin).padStart(6)} sin descargar de ${String(r.total).padStart(6)}`);
}
db.close();
