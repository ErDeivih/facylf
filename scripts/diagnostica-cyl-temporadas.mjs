/*
 * ── QUÉ HAY DE VERDAD EN LA COLA DE CASTILLA Y LEÓN, TEMPORADA A TEMPORADA ──────────────────────────────
 *
 * Responde a la única pregunta que importa antes de repartir trabajo: **¿de esta temporada queda algo que el
 * recolector pueda hacer AHORA MISMO?** No basta con contar trabajos pendientes, porque el suelo de temporadas
 * (2023-24) y el reparto por temporadas dejan miles de tareas `pendiente` con `siguiente_intento` fechado en
 * 2099: están en la cola, se ven en los recuentos, y el recolector NO las toca.
 *
 * Por eso cada temporada sale con tres columnas distintas:
 *   · APLAZADOS  → pendientes con `siguiente_intento` a partir de 2099 (los dejó el suelo; no se trabajan).
 *   · DISPONIBLE → pendientes/bloqueados que el selector puede elegir ya (sin aplazamiento, o ya vencido).
 *   · POR TIPO   → el desglose de lo disponible, que dice en qué FASE está esa temporada: si domina `grupos`
 *                  o `catalogo_temporada`, esa temporada todavía está descubriéndose; si dominan `jornada` y
 *                  `acta`, está ingiriendo datos.
 *
 * Uso:  node scripts/diagnostica-cyl-temporadas.mjs <cola.sqlite> [etiqueta]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, etiqueta = ruta] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) {
  console.error('uso: node scripts/diagnostica-cyl-temporadas.mjs <cola.sqlite> [etiqueta]');
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true });
const ahora = new Date().toISOString();
const LEJOS = '2099-01-01T00:00:00.000Z';

const nombres = new Map();
for (const t of db.prepare('select codigo, etiqueta from temporadas').all()) {
  nombres.set(String(t.codigo).trim(), String(t.etiqueta).trim());
}
const nombre = (t) => nombres.get(String(t).trim()) ?? `t${t}`;

console.log(`\n════════ ${etiqueta} ════════`);
console.log('temporada     total   hechos  cancelados  apartados  EN_CURSO  aplazados  DISPONIBLE   %hechos   tipos disponibles');

const filas = db.prepare(`
  select temporada,
    count(*) n,
    sum(case when estado='hecho' then 1 else 0 end) hechos,
    sum(case when estado='cancelado' then 1 else 0 end) cancelados,
    sum(case when estado='apartado' then 1 else 0 end) apartados,
    sum(case when estado='en_curso' then 1 else 0 end) encurso,
    sum(case when estado in ('pendiente','bloqueado') and siguiente_intento >= ? then 1 else 0 end) aplazados,
    sum(case when estado in ('pendiente','bloqueado')
              and (siguiente_intento is null or siguiente_intento < ?) then 1 else 0 end) disponibles
  from trabajos group by temporada order by cast(temporada as integer) desc`).all(LEJOS, ahora);

let tot = { n: 0, hechos: 0, cancelados: 0, apartados: 0, encurso: 0, aplazados: 0, disponibles: 0 };
for (const f of filas) {
  const tipos = db.prepare(`
    select tipo, count(*) n from trabajos
    where temporada = ? and estado in ('pendiente','bloqueado')
      and (siguiente_intento is null or siguiente_intento < ?)
    group by tipo order by n desc`).all(f.temporada, ahora);
  const detalle = tipos.map((t) => `${t.tipo}:${t.n}`).join(' ');
  const pct = Number(f.n) > 0 ? Math.round((100 * Number(f.hechos)) / Number(f.n)) : 0;
  for (const k of Object.keys(tot)) tot[k] += Number(f[k] ?? 0);
  console.log(`${nombre(f.temporada).padEnd(11)} ${String(f.n).padStart(7)} ${String(f.hechos).padStart(8)} ` +
    `${String(f.cancelados).padStart(11)} ${String(f.apartados).padStart(10)} ${String(f.encurso).padStart(9)} ` +
    `${String(f.aplazados).padStart(10)} ${String(f.disponibles).padStart(11)} ${String(pct + ' %').padStart(9)}   ${detalle}`);
}
const pctTot = tot.n > 0 ? Math.round((100 * tot.hechos) / tot.n) : 0;
console.log(`\n  TOTAL trabajos: ${tot.n} · hechos ${tot.hechos} (${pctTot} %) · cancelados ${tot.cancelados} · ` +
  `apartados ${tot.apartados} · EN_CURSO ${tot.encurso} · aplazados ${tot.aplazados} · DISPONIBLES AHORA ${tot.disponibles}`);
/*
 * Un trabajo `en_curso` es el que un recolector cogió y no llegó a cerrar: murió, se le cortó la sesión o el
 * proceso se quedó colgado. El selector sólo elige `pendiente` y `bloqueado`, así que **un `en_curso` viejo no
 * se vuelve a coger nunca**: queda huérfano y su trabajo no se hace, sin que nada lo diga. Por eso se cuenta y
 * se avisa aparte.
 */
const encursoViejos = db.prepare(`select count(*) n from trabajos where estado='en_curso'
  and (actualizado_en is null or datetime(actualizado_en) < datetime('now','-2 hours'))`).get().n;
if (encursoViejos) {
  console.log(`  ⚠ ${encursoViejos} trabajos EN_CURSO con más de 2 h sin tocarse: están huérfanos y no se ` +
    `volverán a elegir solos. Los libera scripts/servidor/aparta-trabajos-atascados.mjs.`);
}

const actas = db.prepare(`select estado, count(*) n from actas group by estado order by n desc`).all();
console.log(`  ACTAS: ${actas.map((a) => `${a.estado}:${a.n}`).join(' ') || '(ninguna)'}`);

db.close();
