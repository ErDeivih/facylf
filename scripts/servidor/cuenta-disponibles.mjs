#!/usr/bin/env node
// ¿Cuántos trabajos de un tipo quedan DISPONIBLES ahora mismo en una federación? Sirve para comprobar si un
// apartado masivo ha hecho efecto de verdad.
//
// Uso: docker exec facylf-monitor node /app/scripts/servidor/cuenta-disponibles.mjs <federación>
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2];
if (!FEDERACION) { console.error('uso: cuenta-disponibles.mjs <federación>'); process.exit(2); }

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) { console.error('no existe la cola'); process.exit(2); }

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const ahora = new Date().toISOString();

console.log(`══ ${FEDERACION} · disponible AHORA (${ahora.slice(11, 19)}) ══`);
console.log('  tipo                 pendiente   disponible   aplazado   el primero vuelve');
for (const t of db.prepare(`select tipo,
    sum(case when estado in ('pendiente','bloqueado') then 1 else 0 end) pend,
    sum(case when estado in ('pendiente','bloqueado')
      and (siguiente_intento is null or siguiente_intento <= ?) then 1 else 0 end) disp,
    min(case when estado in ('pendiente','bloqueado') and siguiente_intento > ? then siguiente_intento end) prox
  from trabajos group by tipo order by disp desc`).all(ahora, ahora)) {
  const pend = Number(t.pend);
  if (!pend) continue;
  console.log(`  ${String(t.tipo).padEnd(20)} ${String(pend).padStart(9)} ${String(Number(t.disp)).padStart(12)} `
    + `${String(pend - Number(t.disp)).padStart(11)}   ${t.prox ?? '—'}`);
}

// Y qué elegiría el recolector AHORA MISMO: la misma consulta que usa `siguienteTrabajo`.
const siguiente = db.prepare(`select clave, tipo, prioridad from trabajos
  where estado in ('pendiente','bloqueado') and (siguiente_intento is null or siguiente_intento <= ?)
  order by prioridad, coalesce(cast(temporada as integer), -1) desc,
    case when tipo='acta' then 0 else 1 end, creado_en limit 3`).all(ahora);
console.log('\n  ── los 3 siguientes que elegiría el recolector ──');
for (const s of siguiente) console.log(`     ${String(s.tipo).padEnd(16)} prioridad ${s.prioridad}  ${s.clave}`);
db.close();
