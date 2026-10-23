/*
 * ── CUÁNTO HAY YA DE CASTILLA Y LEÓN, TEMPORADA A TEMPORADA ─────────────────────────────────────────────
 *
 * Responde a «¿qué porcentaje de cada temporada está ingestado?» midiendo sobre la cola (que es donde vive el
 * trabajo de recolección) tres cosas por temporada:
 *
 *   · **partidos**: los conocidos del calendario;
 *   · **actas**: las que ya están guardadas en la cola (tabla `actas`);
 *   · **% de actas**: actas guardadas / partidos. Suele haber más de un acta por partido en categorías con
 *     acta de local y visitante, así que el porcentaje se topa al 100 % para no engañar: lo que mide es
 *     «¿queda algún partido sin su acta?».
 *
 * Además dice cuántos trabajos siguen PENDIENTES en esa temporada, que es lo que falta por hacer.
 *
 * Uso:  node scripts/progreso-cyl-por-temporada.mjs <cola.sqlite> [etiqueta]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
const etiqueta = process.argv[3] ?? ruta;
if (!ruta || !existsSync(ruta)) {
  console.error('uso: node scripts/progreso-cyl-por-temporada.mjs <cola.sqlite> [etiqueta]');
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true });

console.log(`\n════════ ${etiqueta} ════════`);

// Las temporadas tal y como las conoce la propia cola (su tabla `temporadas`).
let nombre = new Map();
try {
  for (const t of db.prepare('select codigo, etiqueta from temporadas').all()) {
    nombre.set(String(t.codigo).trim(), t.etiqueta);
  }
} catch { /* cola sin tabla de temporadas: se usan los códigos */ }

const filas = db.prepare(`
  select t.temporada as codigo,
         count(*) as trabajos,
         sum(case when t.estado = 'hecho' then 1 else 0 end) as hechos,
         sum(case when t.estado = 'pendiente' then 1 else 0 end) as pendientes,
         sum(case when t.tipo = 'acta' then 1 else 0 end) as trabajos_acta,
         sum(case when t.tipo = 'acta' and t.estado = 'hecho' then 1 else 0 end) as actas_hechas
    from trabajos t group by t.temporada order by t.temporada desc`).all();

console.log('temporada     trabajos   hechos   pendientes   actas hechas   partidos   % actas');
let totalPartidos = 0;
let totalActas = 0;
for (const f of filas) {
  // Partidos de esa temporada y actas guardadas, por separado (son tablas distintas).
  let partidos = 0;
  let actasGuardadas = 0;
  try {
    partidos = db.prepare('select count(*) as n from partidos where temporada = ?').get(f.codigo).n;
  } catch { /* sin tabla partidos */ }
  try {
    actasGuardadas = db.prepare('select count(*) as n from actas where temporada = ?').get(f.codigo).n;
  } catch { /* sin tabla actas */ }
  totalPartidos += Number(partidos);
  totalActas += Number(actasGuardadas);
  const pct = partidos > 0 ? Math.min(100, Math.round((100 * actasGuardadas) / partidos)) : null;
  const etq = nombre.get(String(f.codigo)) ?? `t${f.codigo}`;
  console.log(`${String(etq).padEnd(12)} ${String(f.trabajos).padStart(9)} ${String(f.hechos).padStart(8)} ${String(f.pendientes).padStart(12)} ${String(actasGuardadas).padStart(14)} ${String(partidos).padStart(10)} ${pct === null ? '   (sin partidos)' : String(pct + ' %').padStart(9)}`);
}
const pctTotal = totalPartidos > 0 ? Math.min(100, Math.round((100 * totalActas) / totalPartidos)) : null;
console.log(`\n  TOTAL: ${totalActas} actas guardadas de ${totalPartidos} partidos${pctTotal === null ? '' : ` → ${pctTotal} %`}`);
db.close();
