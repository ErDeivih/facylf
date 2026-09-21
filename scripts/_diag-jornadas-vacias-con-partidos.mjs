#!/usr/bin/env node
/**
 * Busca grupos que SÍ tienen partidos publicados y a la vez alguna jornada aplazada por
 * «la fuente no publica partidos» o «aún no publica resultados»: son los casos en los que la jornada
 * es de descanso o está vacía y el arreglo del 13/09/2026 la guarda vacía para que el grupo cierre.
 *
 * Uso: node scripts/_diag-jornadas-vacias-con-partidos.mjs <federacion>
 */
import { DatabaseSync } from 'node:sqlite';

const [fed] = process.argv.slice(2);
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
const filas = db.prepare(`select t.temporada, t.competicion, t.grupo, t.jornada, t.estado, t.intentos,
    t.ultimo_error,
    (select count(*) from partidos p where p.temporada=t.temporada and p.competicion=t.competicion
      and p.grupo=t.grupo) partidos,
    (select count(*) from jornadas j where j.temporada=t.temporada and j.competicion=t.competicion
      and j.grupo=t.grupo and j.numero=t.jornada and j.archivo is not null) archivada
  from trabajos t
  where t.tipo='jornada' and t.estado in ('pendiente','bloqueado')
    and (t.ultimo_error like '%no publica partidos para esta jornada%'
      or t.ultimo_error like '%aún no publica resultados%')
  order by partidos desc limit 30`).all();
let conPartidos = 0;
for (const f of filas) {
  if (f.partidos > 0) conPartidos++;
  console.log(`t${f.temporada} c${f.competicion} g${f.grupo} J${f.jornada} · ${f.estado} intentos=${f.intentos} · partidos del grupo=${f.partidos} · jornada archivada=${f.archivada} · ${String(f.ultimo_error).slice(0, 60)}`);
}
console.log(`\nde ${filas.length} casos listados, ${conPartidos} son de grupos con partidos publicados (les aplica el arreglo).`);
const total = db.prepare(`select count(*) n from trabajos t where t.tipo='jornada' and t.estado in ('pendiente','bloqueado')
  and (t.ultimo_error like '%no publica partidos para esta jornada%' or t.ultimo_error like '%aún no publica resultados%')
  and exists (select 1 from partidos p where p.temporada=t.temporada and p.competicion=t.competicion and p.grupo=t.grupo)`).get().n;
console.log(`en total, ${total} trabajos aplazados están en grupos que sí tienen partidos.`);
db.close();
