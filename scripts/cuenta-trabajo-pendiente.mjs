/*
 * ── ¿CUÁNTO TRABAJO QUEDA DE VERDAD, Y CUÁNTOS DÍAS SON? ────────────────────────────────────────────────
 *
 * Cuenta el trabajo pendiente de una cola por tipo y por temporada, y estima días con el ritmo REAL medido
 * (peticiones por hora), no con uno supuesto. Un plazo calculado con un ritmo optimista es peor que no darlo.
 *
 * Ojo con lo que significa «pendiente»: no todo es trabajo por hacer. Una parte está APLAZADA a propósito
 * (la fuente aún no ha publicado esa jornada) y otra está VENCIDA y esperando turno. Se informan por separado
 * porque son cosas distintas: lo vencido es lo que la máquina no da abasto a hacer; lo aplazado es espera.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/cuenta-trabajo-pendiente.mjs <cola.sqlite> <etiqueta> [peticiones-por-hora]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, etiqueta, ritmo] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) { console.log(`${etiqueta ?? ruta}: no encuentro la cola`); process.exit(0); }
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
try {
  const ahora = new Date().toISOString();
  const porTipo = db.prepare(`select tipo, count(*) n from trabajos where estado = 'pendiente'
    group by 1 order by n desc`).all();
  const total = porTipo.reduce((a, r) => a + Number(r.n), 0);
  const vencidos = db.prepare(`select count(*) n from trabajos where estado = 'pendiente'
    and siguiente_intento <= ?`).get(ahora).n;
  const hechos = db.prepare(`select count(*) n from trabajos where estado = 'hecho'`).get().n;

  // Actas pendientes por temporada: es donde está el grueso y lo que interesa de verdad.
  const actas = db.prepare(`select temporada, count(*) n from trabajos
    where estado = 'pendiente' and tipo = 'acta' group by 1 order by 1`).all();

  console.log(`  ${etiqueta}: ${total} pendientes (${vencidos} vencidos, ${total - vencidos} aplazados) · ${hechos} hechos`);
  console.log(`    por tipo: ${porTipo.map((r) => `${r.tipo}=${r.n}`).join(' · ')}`);
  if (actas.length) {
    console.log(`    actas pendientes por temporada: ${actas.map((r) => `${r.temporada}=${r.n}`).join(' · ')}`);
  }

  // Estimación con el ritmo real, si se ha dado. Cada acta cuesta ~1 petición; el resto de tipos, unas 3.
  const p = Number(ritmo);
  if (Number.isFinite(p) && p > 0) {
    const peticiones = total; // estimación conservadora: 1 petición por trabajo pendiente
    const horas = peticiones / p;
    console.log(`    a ${p} peticiones/hora → ${Math.round(horas)} horas = ${(horas / 24).toFixed(1)} días de trabajo`);
  }
} finally {
  db.close();
}
