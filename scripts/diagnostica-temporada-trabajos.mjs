/*
 * ¿Qué trabajos tiene una temporada? Para entender por qué una temporada «descubierta» se queda con uno solo.
 *
 * Medido el 08/10/2026: Melilla tiene las temporadas 11 a 15 con **un único trabajo hecho** y nada más
 * (`h1`, cero pendientes, cero cancelados), frente a la 18 con 3.387 o la 21 con 4.566. Una temporada que entra
 * en el catálogo y no se desarrolla — el mismo patrón que Cataluña, con otra causa por averiguar.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/diagnostica-temporada-trabajos.mjs <cola.sqlite> <temporada...>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, ...temporadas] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) { console.error('uso: diagnostica-temporada-trabajos.mjs <cola.sqlite> <temporada...>'); process.exit(2); }
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
try {
  for (const t of temporadas) {
    const etiqueta = db.prepare('select etiqueta from temporadas where codigo = ?').get(String(t))?.etiqueta ?? '?';
    console.log(`\n════ temporada ${t} (${etiqueta}) ════`);
    // Por tipo y estado: aquí se ve si sólo se hizo el catálogo y nada más.
    for (const r of db.prepare(`select tipo, estado, count(*) n from trabajos where temporada = ?
      group by 1, 2 order by tipo, estado`).all(String(t))) {
      console.log(`  ${String(r.tipo).padEnd(20)} ${String(r.estado).padEnd(12)} ${String(r.n).padStart(6)}`);
    }
    // Y las claves del trabajo hecho, que dicen de qué es.
    const hechos = db.prepare(`select clave, tipo, ultimo_error from trabajos where temporada = ? and estado='hecho' limit 4`).all(String(t));
    for (const h of hechos) console.log(`    hecho: ${h.clave}${h.ultimo_error ? '  · ' + String(h.ultimo_error).slice(0, 60) : ''}`);
    // ¿Hay competiciones de esa temporada en el catálogo?
    const comps = db.prepare('select count(*) n from competiciones where temporada = ?').get(String(t))?.n ?? '?';
    const grupos = db.prepare('select count(*) n from trabajos where temporada = ? and tipo = ?').get(String(t), 'grupos')?.n ?? 0;
    console.log(`    competiciones en catálogo: ${comps}   ·   trabajos de tipo «grupos»: ${grupos}`);
  }
} finally {
  db.close();
}
