/*
 * ── ¿SE ESTÁ RESPETANDO EL RITMO DE CORTESÍA? ─────────────────────────────────────────────────────────────
 *
 * Un recolector con navegador y pausas de 8-12 s no puede hacer más de ~300-450 peticiones en una hora: eso es
 * un límite físico, no una opinión. Así que si en una hora aparecen **miles** de trabajos marcados como hechos,
 * o el ritmo se ha dejado de aplicar —y se está consultando la web más rápido de lo acordado, que es lo que el
 * proyecto no puede permitirse— o esos trabajos se están cerrando **sin pedir nada** a la web.
 *
 * Las dos cosas se distinguen mirando dos tablas a la vez, que es lo que hace esto:
 *   · `peticiones` — las peticiones que de verdad se han hecho, con su hora;
 *   · `trabajos`    — los que se han cerrado, por tipo.
 *
 * Si las peticiones cuadran con el ritmo configurado y los trabajos hechos son muchos más, se están cerrando
 * en local (bien, si de verdad ya estaban leídos). Si las peticiones se van a miles, hay que frenarlo.
 *
 * Uso:  node scripts/mira-ritmo-cola.mjs <cola.sqlite> [horas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, horasArg] = process.argv.slice(2);
const horas = Math.max(1, Number(horasArg) || 1);
if (!ruta || !existsSync(ruta)) {
  console.error('uso: node scripts/mira-ritmo-cola.mjs <cola.sqlite> [horas]');
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true });
const ventana = `-${horas} hours`;

console.log(`\n════════ ${ruta} · últimas ${horas} h ════════\n`);

const pet = db.prepare(`select count(*) n from peticiones where datetime(iniciada_en) >= datetime('now', ?)`).get(ventana).n;
const porHora = pet / horas;
const entre = porHora > 0 ? (3600 / porHora).toFixed(1) : '-';
const ultima = db.prepare('select max(iniciada_en) u from peticiones').get().u;
console.log(`PETICIONES A LA WEB · ${pet}  →  ${Math.round(porHora)}/hora  ·  una cada ${entre} s`);
console.log(`última petición: ${ultima}`);
console.log(porHora > 900
  ? '  *** MÁS DE 900/HORA: eso no lo da un navegador con pausas de 8-12 s. HAY QUE FRENARLO ***'
  : porHora > 600
    ? '  ⚠ por encima de lo esperable (300-450): revisar'
    : '  ✓ dentro de lo que permite el ritmo configurado');

console.log('\nTRABAJOS CERRADOS EN LA MISMA VENTANA, POR TIPO');
const hechos = db.prepare(`select tipo, count(*) n from trabajos
  where estado='hecho' and datetime(actualizado_en) >= datetime('now', ?) group by tipo order by n desc`).all(ventana);
let totalHechos = 0;
for (const h of hechos) { totalHechos += h.n; console.log(`  ${String(h.tipo).padEnd(20)} ${String(h.n).padStart(7)}`); }
if (!hechos.length) console.log('  (ninguno)');
console.log(`  ${'TOTAL'.padEnd(20)} ${String(totalHechos).padStart(7)}`);

if (totalHechos > pet * 2 && totalHechos > 100) {
  console.log(`\n  → Se han cerrado ${totalHechos} trabajos con sólo ${pet} peticiones: **se están cerrando en ` +
    'local, sin pedir nada**. Es correcto sólo si esos trabajos ya estaban leídos (el paso `preparar` marca los ' +
    'grupos del catálogo, por ejemplo). Hay que confirmar cuáles.');
} else if (totalHechos > 0) {
  console.log('\n  → Los trabajos cerrados y las peticiones cuadran: el ritmo se está aplicando.');
}

console.log('\nDETALLE POR MINUTO (peticiones) — para ver si hay ráfagas');
for (const f of db.prepare(`select strftime('%H:%M', iniciada_en) m, count(*) n from peticiones
  where datetime(iniciada_en) >= datetime('now', ?) group by 1 order by 1`).all(ventana)) {
  console.log(`  ${f.m}  ${'#'.repeat(Math.min(60, f.n))} ${f.n}`);
}
db.close();
