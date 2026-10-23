#!/usr/bin/env node
// Contrasta diez informes vivos con filas base del canónico. Solo lectura.
import {randomBytes,createHash} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {abreCanonico} from './lib/informes-consulta.mjs';
import {temporadaActual} from './lib/informes-politica.mjs';
import {consultarInforme,htmlVivo} from './lib/informe-vivo.mjs';

try{process.loadEnvFile('.env');}catch{}
const seed=process.argv.includes('--semilla')?process.argv[process.argv.indexOf('--semilla')+1]:randomBytes(8).toString('hex');
const total=Number(process.argv.includes('--cantidad')?process.argv[process.argv.indexOf('--cantidad')+1]:10);
if(!seed||!Number.isInteger(total)||total<1||total>30)throw Error('Semilla o cantidad inválida');
const number=x=>Number(x??0),id=x=>String(x),score=x=>createHash('sha256').update(seed+':'+x).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const results=[];
const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);
try{
 const onlySeason=process.argv.includes('--temporada')?process.argv[process.argv.indexOf('--temporada')+1]:null;
 const pool=(await c.query(`select te.id,te.phase_group_id,s.etiqueta,ce.categoria,ce.nombre_publicado,
   te.nombre_en_fuente,pg.nombre as grupo_nombre,ce.provincia,cp.visibility_state,
   cp.partidos_con_resultado,cp.actas_disponibles,cp.actas_parseadas
   from core.team_entry te
   join core.phase_group pg on pg.id=te.phase_group_id
   join core.competition_edition ce on ce.id=pg.competition_edition_id
   join core.season s on s.id=ce.season_id
   join core.federation f on f.id=ce.federation_id
   left join ops.coverage_checkpoint cp on cp.phase_group_id=pg.id
   where f.codigo='castilla-leon' and s.etiqueta between '2021-22' and $1
    and ($2::text is null or s.etiqueta=$2)
    and (s.etiqueta=$1 or (cp.visibility_state='completa' and cp.completitud_historica))
    and exists(select 1 from core.match m where (m.home_team_entry_id=te.id or m.away_team_entry_id=te.id)
      and m.goles_local is not null and m.goles_visitante is not null)`,[temporadaActual(),onlySeason])).rows;
 const chosen=[],groups=new Set();
 for(const row of pool.sort((a,b)=>score(a.id).localeCompare(score(b.id)))){
  if(groups.has(id(row.phase_group_id)))continue;
  groups.add(id(row.phase_group_id));chosen.push(row);if(chosen.length===total)break;
 }
 if(chosen.length<total)throw Error(`Solo ${chosen.length} grupos elegibles para ${total} informes`);
 console.log(JSON.stringify({semilla:seed,universo:pool.length,grupos:groups.size,seleccion:chosen.map(x=>({id:x.id,temporada:x.etiqueta,categoria:x.categoria,grupo:x.phase_group_id,grupoNombre:x.grupo_nombre,provincia:x.provincia}))}));
 for(const row of chosen){
  const started=Date.now(),issues=[],warnings=[];
  try{
   const snapshot=await consultarInforme(number(row.id));
   const d=snapshot.datos,ctx=d.contexto?.[0],team=id(row.id),group=id(row.phase_group_id);
   if(!ctx||id(ctx.team_entry)!==team||id(ctx.grupo)!==group)issues.push('contexto equivocado');
   const html=htmlVivo(snapshot),embedded=html.match(/<script id="report-data" type="application\/json">([^<]*)<\/script>/);
   if(!embedded||JSON.parse(embedded[1]).datos.contexto[0].team_entry!==ctx?.team_entry)
    issues.push('HTML sin datos o con otro equipo');
   const matches=(await c.query(`select m.id,j.numero as jornada,m.home_team_entry_id,m.away_team_entry_id,
      m.goles_local,m.goles_visitante from core.match m join core.matchday j on j.id=m.matchday_id
      where m.phase_group_id=$1`,[group])).rows;
   const played=matches.filter(m=>m.goles_local!=null&&m.goles_visitante!=null);
   const own=played.filter(m=>id(m.home_team_entry_id)===team||id(m.away_team_entry_id)===team);
   const ownReport=d.partidos_temporada||[];
   if(ownReport.length!==own.length)issues.push(`partidos del equipo ${ownReport.length}/${own.length}`);
   const ownById=new Map(own.map(m=>[id(m.id),m]));
   for(const p of ownReport){const m=ownById.get(id(p.match_id));
    if(!m){issues.push(`partido ajeno ${p.match_id}`);continue;}
    const home=id(m.home_team_entry_id)===team;
    if(number(p.goles_favor)!==number(home?m.goles_local:m.goles_visitante)||
       number(p.goles_contra)!==number(home?m.goles_visitante:m.goles_local)||
       number(p.jornada)!==number(m.jornada)||p.en_casa!==home)issues.push(`marcador/jornada ${p.match_id}`);
   }
   const coverage=d.cobertura?.[0];
   if(coverage&&number(coverage.partidos_equipo_con_marcador)!==own.length)issues.push('cobertura de partidos con marcador');
   if(number(row.actas_parseadas)<number(row.actas_disponibles))issues.push(`grupo publicado con actas disponibles sin analizar: ${row.actas_parseadas}/${row.actas_disponibles}`);
   if(number(row.actas_disponibles)<number(row.partidos_con_resultado))warnings.push(`La fuente ofrece ${row.actas_disponibles}/${row.partidos_con_resultado} actas del grupo: los resultados sí están, pero el historial personal solo cubre las actas publicadas`);
   const lineups=number(coverage?.partidos_con_alineacion);
   if(own.length&&!lineups)warnings.push('Resultados disponibles, pero ninguna alineación de este equipo: plantilla y cuerpo técnico pueden estar vacíos');
   else if(lineups<own.length)warnings.push(`Alineaciones disponibles en ${lineups}/${own.length} partidos: estadísticas personales parciales`);
   const reportRows=(await c.query(`select mr.match_id,mr.quality,mr.incidencias,m.home_team_entry_id,
      m.goles_local,m.goles_visitante from core.match_report mr join core.match m on m.id=mr.match_id
      where (m.home_team_entry_id=$1 or m.away_team_entry_id=$1) and m.goles_local is not null`,[team])).rows;
   const reports=reportRows.length,review=reportRows.filter(r=>r.quality!=='correct').length;
   if(!reports)warnings.push('Ninguna acta importada para este equipo');
   if(review)warnings.push(`${review} acta(s) requieren revisión de algún campo; comprobar incidencias antes de interpretar todos sus datos`);
   const table=new Map((d.resumen_liga||[]).map(x=>[id(x.team_entry),x]));
   const teams=new Set(matches.flatMap(m=>[id(m.home_team_entry_id),id(m.away_team_entry_id)]));
   for(const t of teams){const summary=table.get(t);if(!summary){issues.push(`equipo ${t} ausente de resumen liga`);continue;}
    const games=played.filter(m=>id(m.home_team_entry_id)===t||id(m.away_team_entry_id)===t);
    const want={jugados:games.length,ganados:0,empatados:0,perdidos:0,gf:0,gc:0,puntos:0};
    for(const m of games){const home=id(m.home_team_entry_id)===t,gf=number(home?m.goles_local:m.goles_visitante),gc=number(home?m.goles_visitante:m.goles_local);
     want.gf+=gf;want.gc+=gc;if(gf>gc)want.ganados++;else if(gf<gc)want.perdidos++;else want.empatados++;}
    want.puntos=3*want.ganados+want.empatados;
    const got=Object.fromEntries(Object.keys(want).map(k=>[k,number(summary[k])]));
    if(!same(got,want))issues.push(`resumen liga ${t}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
   }
   const appearances=(await c.query(`select a.id,a.person_id,a.match_id,a.condition
     from core.appearance a where a.team_entry_id=$1`,[team])).rows;
   const roster=(await c.query(`select person_id from core.current_squad_member
     where team_entry_id=$1 and role='player' and person_id is not null`,[team])).rows;
   const rawPeople=new Set([...appearances.map(a=>id(a.person_id)),...roster.map(r=>id(r.person_id))]);
   const reportPeople=new Map((d.plantilla||[]).map(p=>[id(p.person_id),p]));
   for(const p of rawPeople)if(!reportPeople.has(p))issues.push(`falta jugador ${p}`);
   for(const p of reportPeople.keys())if(!rawPeople.has(p))issues.push(`jugador extra ${p}`);
   const events=(await c.query(`select e.id,e.person_id,e.match_id,e.event_type,e.subtipo,e.sujeto_tipo,
     e.minute_base,e.lado_beneficiado from core.match_event e where e.team_entry_id=$1`,[team])).rows;
   const goalEvents=(await c.query(`select e.match_id,e.lado_beneficiado from core.match_event e
      join core.match m on m.id=e.match_id where (m.home_team_entry_id=$1 or m.away_team_entry_id=$1)
      and e.event_type='gol'`,[team])).rows;
   const goalDiff=m=>{const home=id(m.home_team_entry_id)===team,side=home?'local':'visitante',expected=number(home?m.goles_local:m.goles_visitante);
    return goalEvents.filter(e=>id(e.match_id)===id(m.id??m.match_id)&&e.lado_beneficiado===side).length!==expected;};
   const goalMismatch=reportRows.filter(goalDiff).length;
   if(goalMismatch)warnings.push(`${goalMismatch} actas con goles desglosados distintos del marcador; no usar cuota goleadora sin verificar`);
   const teamGoals=d.goles_y_tarjetas_del_equipo?.find(x=>id(x.team_entry_id)===team);
   const allGoalMismatch=own.some(goalDiff)||matches.some(m=>(id(m.home_team_entry_id)===team||id(m.away_team_entry_id)===team)&&
      (m.goles_local==null||m.goles_visitante==null)&&goalEvents.some(e=>id(e.match_id)===id(m.id)));
   if(teamGoals&&Boolean(teamGoals.goles_eventos_cuadran)===allGoalMismatch)
    issues.push('Indicador de cuadre de goles incoherente con actas y marcadores');
   const appearanceMatches=new Set(appearances.map(a=>id(a.match_id)));
   for(const [person,p] of reportPeople){const apps=appearances.filter(a=>id(a.person_id)===person);
    const ev=events.filter(e=>id(e.person_id)===person&&e.sujeto_tipo==='jugador'&&appearanceMatches.has(id(e.match_id)));
    const want={convocatorias:apps.length,titularidades:apps.filter(a=>a.condition==='starter').length,
     suplencias:apps.filter(a=>a.condition==='substitute').length,
     goles:ev.filter(e=>e.event_type==='gol'&&e.subtipo!=='propia_puerta').length,
     amarillas:ev.filter(e=>e.event_type==='tarjeta_amarilla'||e.event_type==='tarjeta_roja'&&e.subtipo==='doble_amarilla').length,
     rojas:ev.filter(e=>e.event_type==='tarjeta_roja').length};
    for(const [key,val] of Object.entries(want))if(number(p[key])!==val)issues.push(`jugador ${person} ${key} ${p[key]}/${val}`);
    let minutes=0,unknown=0,entered=0,notEntered=0;
    const duration=/prebenjam/i.test(ctx.categoria)?40:/benjam/i.test(ctx.categoria)?50:/alev/i.test(ctx.categoria)?60:/infantil/i.test(ctx.categoria)?70:/cadete/i.test(ctx.categoria)?80:90;
    for(const a of apps){const movement=events.filter(e=>id(e.person_id)===person&&id(e.match_id)===id(a.match_id)&&['entra','sale','tarjeta_roja'].includes(e.event_type)&&e.sujeto_tipo==='jugador');
     const entries=movement.filter(e=>e.event_type==='entra'),exits=movement.filter(e=>e.event_type==='sale');
     const entry=Math.min(...entries.map(e=>number(e.minute_base))),exit=Math.min(...movement.filter(e=>['sale','tarjeta_roja'].includes(e.event_type)).map(e=>number(e.minute_base)));
     if(a.condition==='substitute'){if(entries.length)entered++;else notEntered++;}
     if(a.condition==='substitute'&&!entries.length&&!exits.length)continue;
     const bad=a.condition!=='starter'&&a.condition!=='substitute'||movement.some(e=>e.minute_base==null||e.minute_base<0||e.minute_base>duration+30)||entries.length>1||exits.length>1||
      a.condition==='starter'&&entries.length>0||a.condition==='substitute'&&!entries.length||apps.filter(b=>id(b.match_id)===id(a.match_id)).length>1||
      a.condition==='substitute'&&exit<entry;
     if(bad){unknown++;continue;}
     minutes+=Math.min(Number.isFinite(exit)?exit:duration,duration)-(a.condition==='starter'?0:Math.min(entry,duration));
    }
    if(number(p.minutos_sin_resolver)!==unknown||p.minutos_derivados!=null&&number(p.minutos_derivados)!==minutes||
      (unknown>0&&p.minutos_derivados!=null)||number(p.entro)!==entered||number(p.no_entro)!==notEntered)
     issues.push(`jugador ${person} minutos/cambios ${p.minutos_derivados},${p.minutos_sin_resolver},${p.entro},${p.no_entro} / ${minutes},${unknown},${entered},${notEntered}`);
   }
   const duration=/prebenjam/i.test(ctx.categoria)?40:/benjam/i.test(ctx.categoria)?50:/alev/i.test(ctx.categoria)?60:/infantil/i.test(ctx.categoria)?70:/cadete/i.test(ctx.categoria)?80:90;
   for(const w of (d.peso_en_su_equipo||[]).filter(x=>id(x.team_entry_id)===team&&x.temporada===ctx.temporada)){
    const p=reportPeople.get(id(w.person_id));
    if(!p){issues.push(`peso de jugador ajeno ${w.person_id}`);continue;}
    const rawApps=appearances.filter(a=>id(a.person_id)===id(w.person_id));
    if(number(w.partidos_equipo)!==lineups||number(w.partidos)!==rawApps.length||number(w.titularidades)!==rawApps.filter(a=>a.condition==='starter').length)
     issues.push(`denominador/partidos del peso ${w.person_id}: ${w.partidos_equipo},${w.partidos},${w.titularidades} / ${lineups},${rawApps.length},${rawApps.filter(a=>a.condition==='starter').length}`);
    if(w.minutos==null&&p.minutos_derivados!=null||w.minutos!=null&&number(w.minutos)!==number(p.minutos_derivados))
     issues.push(`minutos del peso ${w.person_id}: ${w.minutos}/${p.minutos_derivados}`);
    const expected=w.minutos!=null&&lineups?Math.round(1000*number(w.minutos)/(lineups*duration))/10:null;
    if(expected==null&&w.porcentaje_disponible!=null||expected!=null&&Math.abs(number(w.porcentaje_disponible)-expected)>.11)
     issues.push(`porcentaje de minutos ${w.person_id}: ${w.porcentaje_disponible}/${expected}`);
   }
   const staff=(await c.query(`select s.person_id,s.rol,s.match_id,m.home_team_entry_id,m.away_team_entry_id,m.goles_local,m.goles_visitante
     from core.match_staff s join core.match m on m.id=s.match_id where s.team_entry_id=$1 and m.goles_local is not null`,[team])).rows;
   for(const person of (d.cuerpo_tecnico||[]).filter(x=>x.temporada===ctx.temporada&&id(x.team_entry_id)===team)){
    const rows=staff.filter(s=>id(s.person_id)===id(person.person_id)&&s.rol===person.rol),unique=new Map(rows.map(s=>[id(s.match_id),s]));
    const counts={partidos:unique.size,victorias:0,empates:0,derrotas:0};
    for(const m of unique.values()){const gf=id(m.home_team_entry_id)===team?number(m.goles_local):number(m.goles_visitante),gc=id(m.home_team_entry_id)===team?number(m.goles_visitante):number(m.goles_local);
     if(gf>gc)counts.victorias++;else if(gf<gc)counts.derrotas++;else counts.empates++;}
    for(const [key,val] of Object.entries(counts))if(number(person[key])!==val)issues.push(`técnico ${person.person_id} ${key} ${person[key]}/${val}`);
   }
   const historicalIds=[...new Set((d.historial||[]).filter(h=>h.temporada!==ctx.temporada).map(h=>id(h.team_entry)))];
   if(historicalIds.length){const statuses=(await c.query(`select te.id,cp.visibility_state,cp.completitud_historica
      from core.team_entry te left join ops.coverage_checkpoint cp on cp.phase_group_id=te.phase_group_id
      where te.id=any($1::bigint[])`,[historicalIds])).rows;
    const byId=new Map(statuses.map(s=>[id(s.id),s]));
    for(const entry of historicalIds){const status=byId.get(entry);
     if(!status||status.visibility_state!=='completa'||!status.completitud_historica)issues.push(`histórico parcial ${entry}`);}
   }
   results.push({id:row.id,temporada:row.etiqueta,categoria:row.categoria,grupo:group,grupoNombre:row.grupo_nombre,provincia:row.provincia,partidos:own.length,alineaciones:lineups,actas:reports,actasRevisar:review,actasDisponiblesGrupo:number(row.actas_disponibles),partidosConResultadoGrupo:number(row.partidos_con_resultado),descuadresGol:goalMismatch,jugadores:reportPeople.size,tecnicos:(d.cuerpo_tecnico||[]).length,advertencias:warnings,incidencias:issues,ms:Date.now()-started});
  }catch(error){issues.push(`ERROR: ${error.stack||error}`);results.push({id:row.id,temporada:row.etiqueta,categoria:row.categoria,grupo:row.phase_group_id,grupoNombre:row.grupo_nombre,provincia:row.provincia,advertencias:warnings,incidencias:issues,ms:Date.now()-started});}
  console.log(JSON.stringify(results.at(-1)));
 }
 mkdirSync('pruebas/informes',{recursive:true});
 const path=`pruebas/informes/auditoria-${new Date().toISOString().slice(0,10)}-${seed}.json`;
 writeFileSync(path,JSON.stringify({semilla:seed,universo:pool.length,informes:results},null,2));
 console.log(JSON.stringify({archivo:path,informes:results.length,incidencias:results.reduce((n,x)=>n+x.incidencias.length,0)}));
 if(results.some(x=>x.incidencias.length))process.exitCode=1;
}finally{await c.end();}
