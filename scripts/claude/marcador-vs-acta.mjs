#!/usr/bin/env node
/**
 * ¿EL RESULTADO DEL PARTIDO CUADRA CON SU ACTA? Por temporada: partidos cuyo marcador (el de la jornada) es 0-0 o falta,
 * pero cuyo acta tiene goles. En las primeras temporadas de CyL la jornada publica «0-0» y el acta trae los goles
 * (medido 24/10: 2013-14, 8.179 de 8.451). Sólo cifras. Sólo lectura. Rápida: agrupa los goles una vez (no lee `datos`).
 *   node scripts/claude/marcador-vs-acta.mjs <cola-v2.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const filas = db.prepare(`with g as (select temporada, competicion, grupo, jornada, acta, count(*) n from eventos_acta
    where tipo='gol' group by 1,2,3,4,5)
  select t.etiqueta temporada, count(*) partidosConActa,
    sum(p.goles_local is null) sinResultado,
    sum(p.goles_local=0 and p.goles_visitante=0) p00,
    sum(p.goles_local=0 and p.goles_visitante=0 and g.n>0) p00ConGoles,
    sum(p.goles_local is null and g.n>0) sinResultadoConGoles,
    sum(p.goles_local is not null and coalesce(g.n,0) <> p.goles_local + p.goles_visitante) marcadorDistintoDeGoles
  from partidos p join temporadas t on t.codigo=p.temporada
  join actas a on a.temporada=p.temporada and a.competicion=p.competicion and a.grupo=p.grupo and a.jornada=p.jornada
    and a.codigo=p.codigo_acta and a.estado='hecha'
  left join g on g.temporada=p.temporada and g.competicion=p.competicion and g.grupo=p.grupo and g.jornada=p.jornada and g.acta=p.codigo_acta
  group by t.etiqueta order by t.etiqueta`).all();
for (const f of filas) console.log(JSON.stringify(f));
