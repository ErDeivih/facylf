/*
 * ── LA SALA DE ESPERA DE MADRID ─────────────────────────────────────────────────────────────────────────
 *
 * Madrid no va lento cuando pide (5,9 s entre peticiones en la última hora, dentro de su ritmo de 4-6 s). Lo
 * que tiene son PARONES: 119 de 360 minutos sin pedir nada, frente a los 7 de Castilla y León. La causa está
 * en su cola: de 76.707 pendientes, **35.269 esperan un reintento**, así que el recolector se queda sin trabajo
 * disponible y espera.
 *
 * Antes de tocar nada hay que ver POR QUÉ esperan, porque el `siguiente_intento` lejano es a veces legítimo
 * (el mecanismo que aparta un trabajo a 12 o 48 horas para que pasen los que sí se pueden leer) y a veces no
 * (un trabajo que nunca se intentó y quedó aplazado al año 2099 por el «suelo» de temporadas antiguas).
 *
 * Uso:  node scripts/mejora-cola-madrid.mjs [--aplicar]
 */
import { DatabaseSync } from 'node:sqlite';

const APLICAR = process.argv.includes('--aplicar');
const db = new DatabaseSync('descargas-madrid/recolector-local/cola-v2.sqlite');

const ahora = db.prepare(`select count(*) as n from trabajos where estado='pendiente'`).get().n;
console.log(`=== MADRID · pendientes: ${ahora} ===`);

console.log('\n=== POR QUÉ ESPERAN (tramos de espera) ===');
const tramos = db.prepare(`
  select case
      when siguiente_intento is null then 'sin cita: disponibles YA'
      when datetime(siguiente_intento) <= datetime('now') then 'cita vencida: disponibles YA'
      when datetime(siguiente_intento) <= datetime('now','+1 hour') then 'en menos de 1 hora'
      when datetime(siguiente_intento) <= datetime('now','+12 hours') then 'entre 1 y 12 horas'
      when datetime(siguiente_intento) <= datetime('now','+48 hours') then 'entre 12 y 48 horas'
      when datetime(siguiente_intento) <  datetime('2100-01-01') then 'entre 48 horas y 2099'
      else 'aplazados a 2099 (el suelo de temporadas)'
    end as tramo, count(*) as n
  from trabajos where estado='pendiente' group by 1 order by 2 desc`).all();
const total = tramos.reduce((a, x) => a + Number(x.n), 0);
for (const t of tramos) {
  console.log(`  ${String(t.n).padStart(7)}  ${((100 * t.n) / total).toFixed(1).padStart(5)} %  ${t.tramo}`);
}

/*
 * EL CRITERIO PARA MEJORARLA, dicho antes de aplicarlo:
 *
 *   · lo aplazado a 2099 NO se toca: es el «suelo» que aparta las temporadas antiguas a propósito, y
 *     adelantarlo sería volver a llenar la cola de trabajo que el proyecto decidió no pedir todavía;
 *   · lo que sí se adelanta es lo que está esperando **más de 12 horas habiendo fallado como mucho una vez**:
 *     eso no es una pausa de cortesía, es un trabajo que se quedó atrás sin motivo. Se le quita la cita y
 *     vuelve a estar disponible.
 */
const candidatos = db.prepare(`select count(*) as n from trabajos
  where estado='pendiente'
    and siguiente_intento is not null
    and datetime(siguiente_intento) > datetime('now','+12 hours')
    and datetime(siguiente_intento) < datetime('2100-01-01')
    and intentos <= 1`).get().n;

console.log(`\n=== LO QUE SE ADELANTARÍA (esperando más de 12 h con 1 intento o ninguno): ${candidatos} ===`);
for (const t of db.prepare(`select tipo, count(*) as n from trabajos
  where estado='pendiente' and siguiente_intento is not null
    and datetime(siguiente_intento) > datetime('now','+12 hours')
    and datetime(siguiente_intento) < datetime('2100-01-01') and intentos <= 1
  group by 1 order by 2 desc`).all()) {
  console.log(`  ${String(t.tipo).padEnd(18)} ${t.n}`);
}
console.log('\n  --- 3 ejemplos con su motivo ---');
for (const t of db.prepare(`select tipo, substr(clave,1,38) as clave, siguiente_intento, intentos,
    substr(coalesce(ultimo_error,'(sin error)'),1,54) as err
  from trabajos where estado='pendiente' and siguiente_intento is not null
    and datetime(siguiente_intento) > datetime('now','+12 hours')
    and datetime(siguiente_intento) < datetime('2100-01-01') and intentos <= 1 limit 3`).all()) {
  console.log(`  ${t.siguiente_intento} int=${t.intentos} ${t.tipo} ${t.clave}`);
  console.log(`      ${t.err}`);
}

const disponibles = db.prepare(`select count(*) as n from trabajos where estado='pendiente'
  and (siguiente_intento is null or datetime(siguiente_intento) <= datetime('now'))`).get().n;
console.log(`\n=== DISPONIBLES AHORA MISMO: ${disponibles} ===`);
console.log(`  (si el recolector tiene trabajo disponible y no pide, el problema no es la cola sino el worker)`);

if (APLICAR && candidatos > 0) {
  const r = db.prepare(`update trabajos set siguiente_intento = null, actualizado_en = datetime('now')
    where estado='pendiente' and siguiente_intento is not null
      and datetime(siguiente_intento) > datetime('now','+12 hours')
      and datetime(siguiente_intento) < datetime('2100-01-01') and intentos <= 1`).run();
  console.log(`\n=== APLICADO: ${r.changes} trabajos vuelven a estar disponibles ===`);
  const despues = db.prepare(`select count(*) as n from trabajos where estado='pendiente'
    and (siguiente_intento is null or datetime(siguiente_intento) <= datetime('now'))`).get().n;
  console.log(`  disponibles: ${disponibles} -> ${despues}`);
} else if (!APLICAR) {
  console.log('\n(medición: no se ha cambiado nada. Con --aplicar se hace.)');
}
db.close();
