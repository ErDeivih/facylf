#!/usr/bin/env node
/**
 * Cuenta, con la condición ACTUAL de la web, cuántas competiciones se publican en cada federación.
 * Sirve para dar un titular verificable (y compararlo con lo que enseña el visor o la web).
 *
 * Uso: node scripts/_diag-publicables-total.mjs
 */
import { readdirSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const condicionGrupo = (a, actaClausula) => `coalesce(${a}.jornadas,0)>0
  and (select count(*) from jornadas jp where jp.temporada=${a}.temporada and jp.competicion=${a}.competicion
    and jp.grupo=${a}.codigo and jp.archivo is not null)>=${a}.jornadas
  and exists(select 1 from trabajos tc where tc.temporada=${a}.temporada and tc.competicion=${a}.competicion
    and tc.grupo=${a}.codigo and tc.tipo='calendario' and tc.estado='hecho')
  and exists(select 1 from trabajos tcl where tcl.temporada=${a}.temporada and tcl.competicion=${a}.competicion
    and tcl.grupo=${a}.codigo and tcl.tipo='clasificacion' and tcl.estado='hecho')
  and not exists(select 1 from trabajos tp where tp.temporada=${a}.temporada and tp.competicion=${a}.competicion
    and tp.grupo=${a}.codigo and tp.tipo in ('indice_jornadas','calendario','clasificacion','jornada','acta')
    and tp.estado not in ('hecho','cancelado'))
  and not exists(select 1 from actas ap where ap.temporada=${a}.temporada and ap.competicion=${a}.competicion
    and ap.grupo=${a}.codigo and ${actaClausula})`;

const consulta = (actaClausula) => `select c.temporada, c.codigo from competiciones c
  where c.grupos_comprobados_en is not null
    -- Madrid no exige actas: su unidad de publicación se cierra con calendario, resultados y clasificación
    and exists(select 1 from grupos g0 where g0.temporada=c.temporada and g0.competicion=c.codigo
      and g0.estado<>'ausente_web')
    and not exists(select 1 from grupos gx where gx.temporada=c.temporada and gx.competicion=c.codigo
      and gx.estado<>'ausente_web' and not (${condicionGrupo('gx', actaClausula)}))`;

const ACTUAL = "ap.estado not in ('hecha','ausente_web','sin_datos')";
let totalActual = 0;
let totalAntigua = 0;
console.log('federación            publicables (condición actual)  (sólo hecha)  diferencia');
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  const ruta = `${d}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const fed = d.replace('descargas-', '');
  const clausula = fed === 'madrid'
    ? condicionGrupo('gx', ACTUAL).replace(/and not exists\(select 1 from actas ap[\s\S]*?\)$/, '')
    : null;
  const cuenta = (c) => db.prepare(`select count(*) n from (${consulta(c)})`).get().n;
  const actual = cuenta(clausula ?? ACTUAL);
  const antigua = cuenta(clausula ?? "ap.estado<>'hecha'");
  if (!actual && !antigua) { db.close(); continue; }
  totalActual += actual;
  totalAntigua += antigua;
  console.log(`${fed.padEnd(21)} ${String(actual).padStart(13)} ${String(antigua).padStart(21)} ${String(actual - antigua).padStart(11)}`);
  db.close();
}
console.log(`\nTOTAL competiciones publicables: ${totalActual} (con la condición actual) frente a ${totalAntigua} con la antigua (+${totalActual - totalAntigua}).`);
