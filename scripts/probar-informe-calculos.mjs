import assert from 'node:assert/strict';
import {abreCanonico} from './lib/informes-consulta.mjs';
import {consultarInforme} from './lib/informe-vivo.mjs';
import {minutosSql,movimientosSql} from './lib/informe-minutos.mjs';
try{process.loadEnvFile('.env');}catch{}
const id=Number(process.argv[2]||165);
const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);
try{
 // Mismos fragmentos SQL que el informe, con filas sintéticas de solo lectura.
 const tests=[
  ['titular completo','starter',[],90],['sale en 60','starter',[['sale',60]],60],
  ['suplente entra','substitute',[['entra',60]],30],['suplente sale','substitute',[['entra',40],['sale',70]],30],
  ['roja','starter',[['tarjeta_roja',35]],35],['roja tras cambio','starter',[['sale',60],['tarjeta_roja',80]],60],
  ['banquillo','substitute',[],0],['desconocido','called_up_unknown',[],null],
  ['999','substitute',[['entra',999]],null],['sin minuto','starter',[['sale',null]],null],
  ['secuencia imposible','substitute',[['entra',70],['sale',50]],null],
  ['reentrada','substitute',[['entra',30],['sale',50],['entra',70]],null],
  ['descuento','substitute',[['entra',93]],0],
  ['evento otro equipo','starter',[['sale',30,'jugador',2]],90],
  ['evento técnico','starter',[['tarjeta_roja',30,'tecnico']],90],
 ];
 for(const [label,condition,events,expected] of tests){
  const sql=`with fixture_appearance as(select -1::bigint id,1::bigint match_id,1::bigint person_id,1::bigint team_entry_id,$1::text condition),
   fixture_events as(select 1::bigint match_id,1::bigint person_id,coalesce(e.team,1)::bigint team_entry_id,e.type event_type,e.minute minute_base,coalesce(e.subject,'jugador') sujeto_tipo
     from jsonb_to_recordset($2::jsonb) as e(type text,minute int,subject text,team int))
   select ${minutosSql('90')} as minutos from fixture_appearance a ${movimientosSql('90')}`;
  const {rows}=await c.query(sql.replaceAll('core.appearance','fixture_appearance').replaceAll('core.match_event','fixture_events'),[condition,JSON.stringify(events.map(([type,minute,subject,team])=>({type,minute,subject,team})))]);
  assert.equal(rows[0].minutos,expected,label);
 }
 const snapshot=await consultarInforme(id),d=snapshot.datos;
 const entries=[...new Set([String(id),...d.peso_en_su_equipo.map(w=>String(w.team_entry_id))])];
 const {rows:apps}=await c.query(`select a.*,ce.categoria,s.etiqueta temporada from core.appearance a
 join core.team_entry te on te.id=a.team_entry_id join core.phase_group g on g.id=te.phase_group_id
 join core.competition_edition ce on ce.id=g.competition_edition_id join core.season s on s.id=a.season_id
 where a.team_entry_id=any($1::bigint[])`,[entries]);
 const {rows:events}=await c.query(`select * from core.match_event where team_entry_id=any($1::bigint[]) and sujeto_tipo='jugador'`,[entries]);
 const byAppearance=new Map(),byEvents=new Map();
 const key=x=>`${x.match_id}:${x.team_entry_id}:${x.person_id}`;
 for(const a of apps){if(!byAppearance.has(key(a)))byAppearance.set(key(a),[]);byAppearance.get(key(a)).push(a);}
 for(const e of events){if(!byEvents.has(key(e)))byEvents.set(key(e),[]);byEvents.get(key(e)).push(e);}
 const duration=category=>{const s=String(category).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return /prebenjamin/.test(s)?40:/benjamin/.test(s)?50:/alevin/.test(s)?60:/infantil/.test(s)?70:/cadete/.test(s)?80:90;};
 function minutes(a){
  const dur=duration(a.categoria),ev=byEvents.get(key(a))||[],ins=ev.filter(e=>e.event_type==='entra'),outs=ev.filter(e=>e.event_type==='sale'),reds=ev.filter(e=>e.event_type==='tarjeta_roja');
  if(!['starter','substitute'].includes(a.condition))return null;
  if(a.condition==='substitute'&&!ins.length&&!outs.length)return 0;
  if([...ins,...outs,...reds].some(e=>e.minute_base==null||e.minute_base<0||e.minute_base>dur+30)||ins.length>1||outs.length>1)return null;
  if(a.condition==='starter'&&ins.length||a.condition==='substitute'&&!ins.length||byAppearance.get(key(a)).length>1)return null;
  const start=a.condition==='starter'?0:ins[0].minute_base,end=Math.min(dur,...outs.map(e=>e.minute_base),...reds.map(e=>e.minute_base));
  if(end<Math.min(start,dur))return null;
  return end-Math.min(start,dur);
 }
 let checked=0,unknown=0;
 for(const w of d.peso_en_su_equipo){
  const rows=apps.filter(a=>a.person_id===w.person_id&&a.team_entry_id===w.team_entry_id),ms=rows.map(minutes);
  const expected=ms.includes(null)?null:ms.reduce((a,b)=>a+b,0);
  assert.equal(w.minutos==null?null:Number(w.minutos),expected,`${w.person_id} ${w.temporada} ${w.team_entry_id}`);
  const teamGames=new Set(apps.filter(a=>a.team_entry_id===w.team_entry_id).map(a=>a.match_id)).size;
  assert.equal(Number(w.partidos_equipo),teamGames);
  if(expected==null)unknown++;checked++;
 }
 for(const row of d.disciplina_dashboard){
  const es=events.filter(e=>e.person_id===row.person_id&&e.team_entry_id===row.team_entry_id);
  assert.equal(Number(row.amarillas),es.filter(e=>e.event_type==='tarjeta_amarilla'||(e.event_type==='tarjeta_roja'&&e.subtipo==='doble_amarilla')).length);
  assert.equal(Number(row.rojas),es.filter(e=>e.event_type==='tarjeta_roja').length);
  assert.equal(Number(row.rojas_directas)+Number(row.dobles_amarillas),Number(row.rojas));
 }
 for(const p of d.plantilla){
  const cards=d.disciplina_dashboard.find(x=>String(x.person_id)===String(p.person_id)&&String(x.team_entry_id)===String(id));
  assert.equal(Number(p.amarillas),Number(cards?.amarillas??0),`Amarillas actuales de ${p.nombre}`);
  assert.equal(Number(p.rojas),Number(cards?.rojas??0),`Expulsiones actuales de ${p.nombre}`);
 }
 for(const h of d.historial){
  const matches=new Set(apps.filter(a=>a.person_id===h.person_id&&a.team_entry_id===h.team_entry).map(a=>a.match_id));
  const goals=events.filter(e=>e.person_id===h.person_id&&e.team_entry_id===h.team_entry&&matches.has(e.match_id)&&e.event_type==='gol'&&e.subtipo!=='propia_puerta');
  assert.equal(Number(h.goles),goals.length,'Goles sin propia puerta y sin mezclar equipos');
  const cards=d.disciplina_dashboard.find(x=>String(x.person_id)===String(h.person_id)&&String(x.team_entry_id)===String(h.team_entry)&&x.temporada===h.temporada);
  assert.equal(Number(h.amarillas),Number(cards?.amarillas??0),`Amarillas históricas ${h.person_id} ${h.team_entry}`);
  assert.equal(Number(h.rojas),Number(cards?.rojas??0),`Expulsiones históricas ${h.person_id} ${h.team_entry}`);
 }
 const goalEntries=[...new Set(d.goles_y_tarjetas_del_equipo.map(x=>String(x.team_entry_id)))];
 const {rows:goalMatches}=await c.query(`select id,home_team_entry_id,away_team_entry_id,goles_local,goles_visitante from core.match
   where home_team_entry_id=any($1::bigint[]) or away_team_entry_id=any($1::bigint[])`,[goalEntries]);
 const {rows:goalEvents}=await c.query(`select match_id,lado_beneficiado from core.match_event
   where event_type='gol' and match_id=any($1::bigint[])`,[goalMatches.map(x=>String(x.id))]);
 const goalsByMatch=new Map();for(const event of goalEvents){const key=String(event.match_id);if(!goalsByMatch.has(key))goalsByMatch.set(key,[]);goalsByMatch.get(key).push(event);}
 for(const team of d.goles_y_tarjetas_del_equipo){
  const teamId=String(team.team_entry_id),matches=goalMatches.filter(m=>String(m.home_team_entry_id)===teamId||String(m.away_team_entry_id)===teamId);
  const complete=matches.every(m=>{const goals=goalsByMatch.get(String(m.id))||[];
   if(m.goles_local==null||m.goles_visitante==null)return goals.length===0;
   const home=String(m.home_team_entry_id)===teamId,side=home?'local':'visitante';
   return goals.filter(e=>e.lado_beneficiado===side).length===Number(home?m.goles_local:m.goles_visitante);
  });
  assert.equal(team.goles_eventos_cuadran,complete,`Cobertura de goles del equipo ${teamId}`);
 }
 console.log(JSON.stringify({equipo:id,nombre:d.contexto[0].nombre_en_fuente,casosSinteticos:tests.length,contextosMinutos:checked,minutosNoCalculables:unknown,
  contextosDisciplina:d.disciplina_dashboard.length,contextosGoles:d.historial.length,fotosPorTemporada:Object.keys(snapshot.fotos||{}).length,tecnicosHistoricos:d.cuerpo_tecnico_por_nombre.length,
  consultasMs:Object.values(snapshot.tiemposMs).reduce((a,b)=>a+b,0),resultado:'OK'}));
}finally{await c.end();}
