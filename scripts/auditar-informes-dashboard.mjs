#!/usr/bin/env node
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {resumeDisciplina} from './lib/informe-disciplina.mjs';
import {temporadaActual} from './lib/informes-politica.mjs';
process.loadEnvFile('.env');
const {Client}=createRequire(resolve('packages/canonico/package.json'))('pg');
const c=new Client({connectionString:process.env.DATABASE_URL_LECTOR,statement_timeout:60000});
await c.connect();const resultados=[];
try{
 for(const item of JSON.parse(readFileSync('informes/dashboard/catalogo.json','utf8')).filter(x=>!process.argv.includes('--equipo')||Number(x.id)===Number(process.argv[process.argv.indexOf('--equipo')+1]))){
  const snap=JSON.parse(readFileSync(`informes/${item.slug}.datos.json`,'utf8')),d=snap.datos;
  const ids=d.plantilla.map(x=>x.person_id),entries=[...new Set(d.peso_en_su_equipo.map(x=>x.team_entry_id))];
  const {rows:raw}=await c.query(`select e.person_id,e.team_entry_id,s.etiqueta temporada,
   count(*) filter(where e.event_type='tarjeta_amarilla')::int amarillas,
   count(*) filter(where e.event_type='tarjeta_roja')::int rojas
   from core.match_event e join core.team_entry te on te.id=e.team_entry_id
   join core.phase_group g on g.id=te.phase_group_id join core.competition_edition ce on ce.id=g.competition_edition_id
   join core.season s on s.id=ce.season_id
   where e.person_id=any($1::bigint[]) and e.sujeto_tipo='jugador'
    and e.event_type in ('tarjeta_amarilla','tarjeta_roja') and s.etiqueta>='2021-22'
    and s.etiqueta<=$2
    and (exists(select 1 from ops.coverage_checkpoint cp where cp.phase_group_id=g.id and cp.visibility_state='completa' and cp.completitud_historica) or s.etiqueta=$3)
   group by e.person_id,e.team_entry_id,s.etiqueta`,[ids,d.contexto[0].temporada,temporadaActual()]);
  assert.equal(raw.length,d.disciplina_dashboard.length,'Cantidad de contextos disciplinarios');
  for(const r of raw){const s=d.disciplina_dashboard.find(x=>x.person_id===r.person_id&&x.team_entry_id===r.team_entry_id&&x.temporada===r.temporada);
   assert(s,'Falta una fila de disciplina');assert.equal(Number(s.amarillas),r.amarillas);assert.equal(Number(s.rojas),r.rojas);
   assert.equal(Number(s.rojas_directas)+Number(s.dobles_amarillas),r.rojas);
  }
  const {rows:counts}=await c.query('select team_entry_id,count(distinct match_id)::int n from core.appearance where team_entry_id=any($1::bigint[]) group by team_entry_id',[entries]);
  for(const w of d.peso_en_su_equipo){assert.equal(Number(w.partidos_equipo),counts.find(x=>x.team_entry_id===w.team_entry_id).n,'Denominador debe incluir todos los partidos de todos los compañeros');
   assert(Number(w.porcentaje_disponible)>=0&&Number(w.porcentaje_disponible)<=100,'Porcentaje fuera de rango');
  }
  const resumen=resumeDisciplina(d.secuencia_de_partidos),antesOcultas=[...resumen.values()].filter(x=>x.amarillas>0&&x.amarillas<5&&!x.rojas.length);
  const own=d.eventos_dashboard.filter(x=>String(x.team_entry_id)===String(item.id)&&x.subtipo==='propia_puerta').length;
  const published=d.plantilla_publicada.filter(x=>x.role==='player');
  resultados.push({equipo:item.nombre,inscritos:published.length,identidadesPendientes:published.filter(x=>!x.person_id).length,
   jugadoresConocidos:item.plantilla,contextosTarjetasComprobados:raw.length,
   amarillas:raw.reduce((s,x)=>s+x.amarillas,0),rojas:raw.reduce((s,x)=>s+x.rojas,0),
   contextosDe1a4AmarillasAntesOcultos:antesOcultas.length,amarillasAntesOcultas:antesOcultas.reduce((s,x)=>s+x.amarillas,0),
   denominadoresComprobados:d.peso_en_su_equipo.length,golesPropiaActual:own,
   minutosActuales:d.plantilla.reduce((s,x)=>s+Number(x.minutos_derivados),0),
   consultasMs:Object.values(snap.tiemposMs||{}).reduce((s,x)=>s+x,0),
   masLentas:Object.entries(snap.tiemposMs||{}).sort((a,b)=>b[1]-a[1]).slice(0,3),resultado:'OK'});
  console.log(JSON.stringify(resultados.at(-1)));
 }
}finally{await c.end();}
mkdirSync('pruebas/informes',{recursive:true});writeFileSync('pruebas/informes/dashboard-auditoria.json',JSON.stringify({fecha:new Date().toISOString(),resultados},null,2));
