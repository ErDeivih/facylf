/*
 * por-que-aplazados.mjs — SÓLO LEE. Los trabajos pendientes con `siguiente_intento` en el futuro: ¿cuándo vencen y
 * por qué? Separa los aplazados «esperando a que la federación publique» (temporada en curso, jornada futura) de
 * los que no tienen esa excusa (temporadas pasadas: todo está publicado).
 * Uso: node por-que-aplazados.mjs <cola-v2.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true, timeout: 120000 });
const et = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [String(t.codigo), t.etiqueta]));
const ahora = new Date().toISOString();
const en1 = new Date(Date.now() + 86400000).toISOString();
const en7 = new Date(Date.now() + 7 * 86400000).toISOString();
console.log('== pendientes por temporada: vencidos / aplazados, y cuándo vencen los aplazados ==');
for (const r of db.prepare(`select temporada, count(*) n,
    sum(case when siguiente_intento is null or siguiente_intento <= ? then 1 else 0 end) vencidos,
    sum(case when siguiente_intento > ? and siguiente_intento <= ? then 1 else 0 end) en1d,
    sum(case when siguiente_intento > ? and siguiente_intento <= ? then 1 else 0 end) en7d,
    sum(case when siguiente_intento > ? and siguiente_intento < '2090' then 1 else 0 end) masTarde,
    sum(case when siguiente_intento >= '2090' then 1 else 0 end) a2099,
    min(case when siguiente_intento > ? then siguiente_intento end) proximo
  from trabajos where estado in ('pendiente','bloqueado') group by 1 order by 1 desc`).all(ahora, ahora, en1, en1, en7, en7, ahora)) {
  console.log(`  ${et.get(String(r.temporada)) ?? r.temporada}: ${r.n} · vencidos ${r.vencidos} · en 24 h ${r.en1d} · en 7 días ${r.en7d} · más tarde ${r.masTarde} · 2099 ${r.a2099} · próximo ${String(r.proximo ?? '—').slice(0, 16)}`);
}
console.log('\n== aplazados por tipo y último error (los 15 grupos más grandes) ==');
for (const r of db.prepare(`select tipo, coalesce(substr(ultimo_error,1,70),'(sin error)') err, count(*) n, max(intentos) imax,
    min(siguiente_intento) desde, max(siguiente_intento) hasta
  from trabajos where estado in ('pendiente','bloqueado') and siguiente_intento > ? group by 1,2 order by 3 desc limit 15`).all(ahora)) {
  console.log(`  ${String(r.n).padStart(6)} ${r.tipo.padEnd(14)} intentos≤${r.imax} ${String(r.desde).slice(0, 16)} → ${String(r.hasta).slice(0, 16)} · ${r.err}`);
}
console.log('\n== servidos en las últimas 24 h por tipo ==');
const hace = new Date(Date.now() - 86400000).toISOString();
console.log('  ' + db.prepare(`select tipo, count(*) n from trabajos where estado in ('hecho','hecha') and actualizado_en >= ? group by 1 order by 2 desc`).all(hace).map((r) => `${r.tipo} ${r.n}`).join(' · '));
db.close();
