#!/usr/bin/env node
/** Cuenta los trabajos bloqueados de un tipo por mensaje de error, federación a federación. */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync } from 'node:fs';

const tipo = process.argv[2] ?? 'indice_jornadas';
const total = new Map();
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  const ruta = `${d}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const filas = db.prepare(`select ultimo_error, count(*) n, min(siguiente_intento) minSig, max(siguiente_intento) maxSig,
      sum(case when siguiente_intento is not null and siguiente_intento <= ? then 1 else 0 end) vencidos
    from trabajos where tipo=? and estado in ('pendiente','bloqueado') and ultimo_error is not null
    group by ultimo_error order by n desc`).all(new Date().toISOString(), tipo);
  if (filas.length) {
    console.log(`== ${d.replace('descargas-', '')}`);
    for (const f of filas) {
      console.log(`   ${String(f.n).padStart(5)} · vencidos ${String(f.vencidos).padStart(5)} · ${String(f.ultimo_error).slice(0, 100)}`);
      const clave = String(f.ultimo_error).replace(/\d+/g, 'N').slice(0, 80);
      total.set(clave, (total.get(clave) ?? 0) + f.n);
    }
  }
  db.close();
}
console.log('\n== TOTAL por mensaje (dígitos normalizados) ==');
for (const [k, v] of [...total.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(6)} · ${k}`);
