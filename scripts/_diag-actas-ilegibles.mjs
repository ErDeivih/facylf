#!/usr/bin/env node
/**
 * Estado de las actas que bloquean un grupo por «maquetación distinta»: intentos acumulados, si el
 * trabajo está pendiente o cancelado y por qué no se ha cerrado todavía.
 *
 * Uso: node scripts/_diag-actas-ilegibles.mjs <federacion>
 */
import { DatabaseSync } from 'node:sqlite';

const fed = process.argv[2] ?? 'euskadi';
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
const filas = db.prepare(`select t.clave, t.estado, t.intentos, t.siguiente_intento, t.ultimo_error,
    a.estado estado_acta, a.incidencias, a.archivo is not null conArchivo, a.comprobada_en
  from trabajos t left join actas a on a.temporada=t.temporada and a.competicion=t.competicion
    and a.grupo=t.grupo and a.jornada=t.jornada and a.codigo=t.acta
  where t.tipo='acta' and t.estado in ('pendiente','bloqueado')
    and t.ultimo_error like '%no se puede interpretar%'
  order by t.intentos desc, t.siguiente_intento limit 25`).all();
console.log(`actas bloqueadas por maquetación distinta en ${fed}: ${filas.length}`);
const porIntentos = new Map();
for (const f of filas) {
  porIntentos.set(f.intentos, (porIntentos.get(f.intentos) ?? 0) + 1);
  console.log(`  ${f.clave.slice(0, 46)} · trabajo ${f.estado} intentos=${f.intentos} sig=${f.siguiente_intento ?? '-'} · acta=${f.estado_acta ?? '?'} archivo=${f.conArchivo}`);
}
console.log('reparto por intentos:', [...porIntentos.entries()].map(([k, v]) => `${k}=${v}`).join(' · '));
const total = db.prepare(`select count(*) n from trabajos where tipo='acta' and estado in ('pendiente','bloqueado')
  and ultimo_error like '%no se puede interpretar%'`).get().n;
const maxIntentos = db.prepare(`select max(intentos) m from trabajos where tipo='acta' and estado in ('pendiente','bloqueado')
  and ultimo_error like '%no se puede interpretar%'`).get().m;
console.log(`total en esa situación: ${total} · intentos máximos: ${maxIntentos}`);
db.close();
