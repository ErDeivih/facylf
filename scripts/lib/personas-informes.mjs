import {normaliza} from './informes-consulta.mjs';
import {coberturaSql,temporadaActual} from './informes-politica.mjs';
import {minutosSql,movimientosSql} from './informe-minutos.mjs';
import {duracionSql,formatoPartido} from './informe-formato.mjs';
import {federacionPedida,codigosParaSql,codigosReales,nombreFederacion} from './informes-federaciones.mjs';

const current=temporadaActual();
const eligible=alias=>`s.etiqueta between '2021-22' and '${current}' and ${coberturaSql(alias,new Date(),'pg')}`;
// Duración y formato desde la edición, igual que el informe de equipo (lib/informe-formato.mjs).
const durationSql=duracionSql('ce_d');
const duration=category=>formatoPartido({categoria:category}).duracion;
const str=x=>String(x??''),num=x=>Number(x??0),esc=x=>str(x).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const regexLiteral=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const displayName=x=>{const [surname,given]=str(x).split(',');return given?`${given.trim()} ${surname.trim()}`:surname;};

/** Búsqueda privada, acotada por nombre normalizado e índices de persona/participación. */
export async function buscarPersonas(c,texto,opciones=30){
 const {limite=30,federacion=''}=typeof opciones==='number'?{limite:opciones}:opciones;
 const codigos=codigosParaSql(federacionPedida(federacion));
 const words=(await normaliza(c,texto)).split(/\s+/).filter(Boolean).slice(0,6);
 if(!words.length||words.join('').length<2)return [];
 const predicates=words.map((_,i)=>`(p.nombre_norm like $${2*i+1} and p.nombre_norm ~ $${2*i+2})`).join(' and ');
 const params=[...words.flatMap(w=>[`%${w}%`,`(^| )${regexLiteral(w)}( |$)`]),codigos,Math.max(1,Math.min(30,Number(limite)||30))];
 const pc=`$${params.length-1}::text[]`;
 const {rows}=await c.query(`with named as materialized (
  select p.id,p.nombre_mostrado,p.nombre_norm,p.es_menor from core.person p
  where ${predicates} and exists(select 1 from core.person_source_identity psi
   join core.federation f0 on f0.id=psi.federation_id
   where psi.person_id=p.id and f0.codigo = any(${pc}))
  order by p.id desc limit 300
 )
 select p.id,p.nombre_mostrado,p.es_menor,ref.team_entry_id,ref.clase,ref.federacion,
   ref.rol,ref.temporada,ref.equipo,ref.club,ref.categoria,ref.competicion
 from named p
 join lateral (
  select te.id as team_entry_id,r.clase,r.rol,s.etiqueta as temporada,f.codigo as federacion,
   te.nombre_en_fuente as equipo,cl.nombre_canonico as club,ce.categoria,ce.nombre_publicado as competicion
  from (
   select distinct a.team_entry_id,'jugador'::text clase,'jugador'::text rol from core.appearance a where a.person_id=p.id
   union all select distinct ms.team_entry_id,'tecnico',ms.rol from core.match_staff ms where ms.person_id=p.id and ms.team_entry_id is not null
   union all select distinct ss.team_entry_id,case when sm.role='player' then 'jugador' else 'tecnico' end,sm.role
    from core.squad_member sm join core.squad_snapshot ss on ss.id=sm.snapshot_id
    where sm.person_id=p.id and not exists(select 1 from core.squad_snapshot newer
      where newer.team_entry_id=ss.team_entry_id and (newer.captured_at,newer.id)>(ss.captured_at,ss.id))
   union all select distinct m.home_team_entry_id,'arbitro',mo.rol
    from core.match_official mo join core.match m on m.id=mo.match_id where mo.person_id=p.id
  ) r
  join core.team_entry te on te.id=r.team_entry_id
  join core.team_season ts on ts.id=te.team_season_id
  join core.club cl on cl.id=ts.club_id
  join core.phase_group pg on pg.id=te.phase_group_id
  join core.competition_edition ce on ce.id=pg.competition_edition_id
  join core.season s on s.id=ce.season_id
  join core.federation f on f.id=ce.federation_id
  where f.codigo = any(${pc}) and ${eligible('ce')}
  order by s.orden desc,case r.clase when 'jugador' then 0 when 'tecnico' then 1 else 2 end,te.id desc limit 1
 ) ref on true
 order by ref.temporada desc,p.nombre_norm,p.id limit $${params.length}` ,params);
 return rows.map(r=>({...r,id:num(r.id),team_entry_id:num(r.team_entry_id),nombre:displayName(r.nombre_mostrado)}));
}

const playerRows=`select a.match_id,a.team_entry_id,a.condition,${minutosSql(durationSql)} as minutos,
 te.nombre_en_fuente as equipo,cl.nombre_canonico as club,ce_d.categoria,ce_d.nombre_publicado as competicion,
 s.etiqueta as temporada,f.codigo as federacion
 from core.appearance a
 join core.team_entry te on te.id=a.team_entry_id
 join core.team_season ts on ts.id=te.team_season_id
 join core.club cl on cl.id=ts.club_id
 join core.phase_group pg on pg.id=te.phase_group_id
 join core.competition_edition ce_d on ce_d.id=pg.competition_edition_id
 join core.season s on s.id=ce_d.season_id
 join core.federation f on f.id=ce_d.federation_id
 ${movimientosSql(durationSql)}
 where a.person_id=$1 and f.codigo = any($2::text[]) and ${eligible('ce_d')}
 order by s.orden desc,a.match_id`;
const staffRows=`select ms.team_entry_id,ms.rol,ms.match_id,m.home_team_entry_id,
 m.goles_local,m.goles_visitante,te.nombre_en_fuente as equipo,cl.nombre_canonico as club,
 ce.categoria,ce.nombre_publicado as competicion,s.etiqueta as temporada,f.codigo as federacion
 from core.match_staff ms join core.match m on m.id=ms.match_id
 join core.team_entry te on te.id=ms.team_entry_id
 join core.team_season ts on ts.id=te.team_season_id join core.club cl on cl.id=ts.club_id
 join core.phase_group pg on pg.id=te.phase_group_id join core.competition_edition ce on ce.id=pg.competition_edition_id
 join core.season s on s.id=ce.season_id join core.federation f on f.id=ce.federation_id
 where ms.person_id=$1 and f.codigo = any($2::text[]) and ${eligible('ce')}
 order by s.orden desc,m.id`;
const squadRows=`select ss.team_entry_id,sm.role as rol,te.nombre_en_fuente as equipo,cl.nombre_canonico as club,
 ce.categoria,ce.nombre_publicado as competicion,s.etiqueta as temporada
 from core.squad_member sm join core.squad_snapshot ss on ss.id=sm.snapshot_id
 join core.team_entry te on te.id=ss.team_entry_id join core.team_season ts on ts.id=te.team_season_id
 join core.club cl on cl.id=ts.club_id join core.phase_group pg on pg.id=te.phase_group_id
 join core.competition_edition ce on ce.id=pg.competition_edition_id
 join core.season s on s.id=ce.season_id join core.federation f on f.id=ce.federation_id
 where sm.person_id=$1 and f.codigo = any($2::text[]) and ${eligible('ce')}
 and not exists(select 1 from core.squad_snapshot newer where newer.team_entry_id=ss.team_entry_id
 and (newer.captured_at,newer.id)>(ss.captured_at,ss.id))`;
const officialRows=`select mo.match_id,mo.rol,s.etiqueta as temporada,ce.nombre_publicado as competicion,
 ce.categoria,m.home_team_entry_id as team_entry_id
 from core.match_official mo join core.match m on m.id=mo.match_id
 join core.phase_group pg on pg.id=m.phase_group_id join core.competition_edition ce on ce.id=pg.competition_edition_id
 join core.season s on s.id=ce.season_id join core.federation f on f.id=ce.federation_id
 where mo.person_id=$1 and f.codigo = any($2::text[]) and ${eligible('ce')}`;

/** Ficha individual: ninguna unión por nombre; cada fila conserva temporada, rol y equipo. */
export async function consultarPersona(c,personId){
 const {rows:[person]}=await c.query('select id,nombre_mostrado,es_menor from core.person where id=$1',[personId]);
 if(!person)return null;
 const reales=codigosReales();
 const appearances=await c.query(playerRows,[personId,reales]);
 const staff=await c.query(staffRows,[personId,reales]);
 const squad=await c.query(squadRows,[personId,reales]);
 const officials=await c.query(officialRows,[personId,reales]);
 const events=await c.query(`select e.match_id,e.team_entry_id,e.event_type,e.subtipo,e.sujeto_tipo
    from core.match_event e where e.person_id=$1`,[personId]);
 const contexts=new Map(),appMatches=new Set(appearances.rows.map(a=>str(a.match_id)));
 const get=(row,clase,rol)=>{const key=[row.temporada,row.team_entry_id,clase,rol].join(':');
  if(!contexts.has(key))contexts.set(key,{teamEntry:num(row.team_entry_id),temporada:row.temporada,federacion:row.federacion,club:row.club,equipo:row.equipo,
   categoria:row.categoria,competicion:row.competicion,clase,rol,partidos:0,titularidades:0,suplencias:0,
   minutos:0,minutosSinResolver:0,goles:0,penaltis:0,amarillas:0,rojas:0,victorias:0,empates:0,derrotas:0});
  return contexts.get(key);};
 for(const row of appearances.rows){const x=get(row,'jugador','Jugador');x.partidos++;x.titularidades+=row.condition==='starter';x.suplencias+=row.condition==='substitute';
  if(row.minutos==null)x.minutosSinResolver++;else x.minutos+=num(row.minutos);}
 for(const row of squad.rows){const x=get(row,row.rol==='player'?'jugador':'tecnico',row.rol==='player'?'Jugador':row.rol==='coach'?'Entrenador':'Delegado');x.inscrito=true;}
 for(const row of staff.rows){const x=get(row,'tecnico',row.rol);if(row.goles_local==null||row.goles_visitante==null)continue;
  if(!x._matches)x._matches=new Set();if(x._matches.has(str(row.match_id)))continue;x._matches.add(str(row.match_id));x.partidos++;
  const home=str(row.home_team_entry_id)===str(row.team_entry_id),gf=num(home?row.goles_local:row.goles_visitante),gc=num(home?row.goles_visitante:row.goles_local);
  if(gf>gc)x.victorias++;else if(gf<gc)x.derrotas++;else x.empates++;}
 for(const row of events.rows){if(!appMatches.has(str(row.match_id))||row.sujeto_tipo!=='jugador')continue;
  const x=[...contexts.values()].find(c=>c.clase==='jugador'&&str(c.teamEntry)===str(row.team_entry_id));if(!x)continue;
  if(row.event_type==='gol'&&row.subtipo!=='propia_puerta'){x.goles++;if(row.subtipo==='penalti')x.penaltis++;}
  if(row.event_type==='tarjeta_amarilla'||row.event_type==='tarjeta_roja'&&row.subtipo==='doble_amarilla')x.amarillas++;
  if(row.event_type==='tarjeta_roja')x.rojas++;
 }
 const rows=[...contexts.values()].map(x=>{delete x._matches;if(x.minutosSinResolver)x.minutos=null;return x;})
  .sort((a,b)=>b.temporada.localeCompare(a.temporada)||a.club.localeCompare(b.club)||a.equipo.localeCompare(b.equipo));
 const refs=[...new Set(rows.map(x=>x.teamEntry))];
 if(refs.length){const {rows:coverage}=await c.query(`select te.id,count(distinct m.id) filter(where m.goles_local is not null and m.goles_visitante is not null) as resultados,
  count(distinct a.match_id) as alineaciones
  from core.team_entry te left join core.match m on m.home_team_entry_id=te.id or m.away_team_entry_id=te.id
  left join core.appearance a on a.match_id=m.id and a.team_entry_id=te.id
  where te.id=any($1::bigint[]) group by te.id`,[refs]);
  const byId=new Map(coverage.map(x=>[str(x.id),x]));for(const x of rows){const cover=byId.get(str(x.teamEntry));x.resultadosEquipo=num(cover?.resultados);x.alineacionesEquipo=num(cover?.alineaciones);x.duracion=duration(x.categoria);}}
 const officialGroups=new Map();for(const o of officials.rows){const key=[o.temporada,o.competicion,o.rol].join(':');if(!officialGroups.has(key))officialGroups.set(key,{temporada:o.temporada,competicion:o.competicion,rol:o.rol,partidos:0,teamEntry:num(o.team_entry_id)});officialGroups.get(key).partidos++;}
 let homonimos=[];
 if(rows.some(x=>x.clase==='tecnico')){const {rows:similar}=await c.query(`with candidatos as (
  select distinct on (otra.id) otra.id,otra.nombre_mostrado,s.etiqueta as temporada,
   cl.nombre_canonico as club,te.nombre_en_fuente as equipo,ms.rol
  from core.person actual join core.person otra on otra.nombre_norm=actual.nombre_norm and otra.id<>actual.id
  join core.match_staff ms on ms.person_id=otra.id join core.team_entry te on te.id=ms.team_entry_id
  join core.team_season ts on ts.id=te.team_season_id join core.club cl on cl.id=ts.club_id
  join core.phase_group pg on pg.id=te.phase_group_id join core.competition_edition ce on ce.id=pg.competition_edition_id
  join core.season s on s.id=ce.season_id join core.federation f on f.id=ce.federation_id
  where actual.id=$1 and f.codigo = any($2::text[]) and ${eligible('ce')}
  order by otra.id,s.orden desc,te.id desc
 ) select * from candidatos order by temporada desc,id limit 20`,[personId,reales]);
  homonimos=similar.map(x=>({...x,id:num(x.id),nombre:displayName(x.nombre_mostrado)}));}
 if(!rows.length&&!officialGroups.size)return null;
 return {persona:{id:num(person.id),nombre:displayName(person.nombre_mostrado),esMenor:person.es_menor},contextos:rows,arbitrajes:[...officialGroups.values()].sort((a,b)=>b.temporada.localeCompare(a.temporada)||a.competicion.localeCompare(b.competicion)),homonimos};
}

export function htmlPersona(data){const {persona,contextos,arbitrajes,homonimos=[]}=data;
 const fmt=n=>n==null?'—':Number(n).toLocaleString('es-ES'),pct=(a,b)=>a!=null&&b>0?`${(100*a/b).toFixed(1).replace('.',',')} %`:'—';
 const player=contextos.filter(x=>x.clase==='jugador'),staff=contextos.filter(x=>x.clase==='tecnico');
 const context=x=>`<article class="context"><div><span class="eyebrow">${esc(x.temporada)} · ${esc(x.categoria)} · ${esc(x.rol)}</span><h3>${esc(x.club)} · ${esc(x.equipo)}</h3><p>${esc(x.competicion)}</p></div>
 <div class="numbers">${x.clase==='jugador'?`<span><strong>${fmt(x.partidos)}</strong> en acta</span><span><strong>${fmt(x.titularidades)}</strong> titular</span><span><strong>${fmt(x.minutos)}</strong> min</span><span><strong>${fmt(x.goles)}</strong> goles</span><span><strong>${fmt(x.amarillas)}</strong> amarillas</span><span><strong>${fmt(x.rojas)}</strong> rojas</span>`:`<span><strong>${fmt(x.partidos)}</strong> partidos</span><span><strong>${fmt(x.victorias)} · ${fmt(x.empates)} · ${fmt(x.derrotas)}</strong> G · E · P</span>`}</div>
 <p class="note">${x.clase==='jugador'?`Alineaciones del equipo: ${fmt(x.alineacionesEquipo)} / ${fmt(x.resultadosEquipo)} partidos con resultado · ${pct(x.minutos,x.alineacionesEquipo*x.duracion)} de minutos disponibles${x.penaltis?` · ${fmt(x.penaltis)} gol(es) de penalti`:''}${x.minutosSinResolver?' · minutos no calculables en alguna acta':''}`:`Resultados del equipo en los partidos donde figura esta persona; no miden una contribución individual.`}</p>
 <a href="/equipo/${x.teamEntry}?vista=${x.clase==='jugador'?'history&persona='+persona.id:x.partidos?'staff&fichaTecnico='+persona.id:'staff'}">Abrir informe y detalle del equipo →</a></article>`;
 return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(persona.nombre)} · Observatorio</title>
 <style>*{box-sizing:border-box}body{font:15px/1.5 system-ui;color:#16303d;background:#f1f4f6;margin:0}main{max-width:1120px;margin:auto;padding:32px 20px}a{color:#087e83}h1{font-size:clamp(28px,4vw,44px);margin:12px 0}h2{margin:36px 0 14px}h3{margin:5px 0}.eyebrow{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#607381;font-weight:750}.intro,.context{background:#fff;border:1px solid #dce3e8;border-radius:14px;padding:22px;margin:12px 0}.note{font-size:12px;color:#607381}.numbers{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.numbers span{background:#eaf2f3;border-radius:9px;padding:8px 11px;font-size:12px}.numbers strong{font-size:18px;display:block}.context a{font-weight:700}.muted{color:#607381}</style>
 <style>.acciones{display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap}.pdf{background:#087e83;color:#fff;border-radius:9px;padding:9px 14px;text-decoration:none}
 @page{size:A4 portrait;margin:11mm}@media print{body{background:#fff;font-size:11px}main{padding:0;max-width:none}.acciones,.context a{display:none!important}
 .intro,.context{border:1px solid #cfd8de;padding:11px 13px;margin:7px 0;break-inside:avoid}h1{font-size:24px;margin:4px 0}h2{font-size:15px;margin:14px 0 6px;break-after:avoid}
 .numbers{margin:8px 0;gap:6px}.numbers span{padding:5px 8px;font-size:10px}.numbers strong{font-size:14px}.note{font-size:9px}
 .sello{display:block!important;font-size:9px;color:#607381}}.sello{display:none}</style>
 <main><div class="acciones"><a href="/">← Buscar equipos y personas</a><a class="pdf" href="/persona/${persona.id}/pdf" download>Descargar PDF</a></div><header class="intro"><span class="sello">Consulta del ${new Date().toLocaleDateString('es-ES',{dateStyle:'long'})} · datos de las actas disponibles en ese momento</span><span class="eyebrow">Ficha individual · ${esc([...new Set(contextos.map(x=>nombreFederacion(x.federacion)).filter(Boolean))].join(' · ')||'Sin federación')} · desde 2021-22</span><h1>${esc(persona.nombre)}</h1><p class="muted">${persona.esMenor?'Persona menor de edad · consulta privada local · ':''}Cada fila conserva su club, equipo, competición, categoría y temporada. Los grupos históricos figuran solo cuando están cerrados; el curso actual muestra lo recogido hasta hoy.</p><p class="note">Esta ficha agrupa únicamente registros vinculados al mismo identificador. Otras personas con nombre igual no se fusionan automáticamente. Minutos calculados desde actas; «en acta» no garantiza que entrara a jugar.</p></header>
 ${player.length?`<h2>Como jugador · ${player.length} contextos</h2>${player.map(context).join('')}`:''}
 ${staff.length?`<h2>En el cuerpo técnico · ${staff.length} contextos</h2>${staff.map(context).join('')}`:''}
 ${homonimos.length?`<h2>Otras fichas con el mismo nombre</h2><p class="note">Podrían ser la misma persona en otra temporada o un homónimo. No se suman a la ficha anterior sin un vínculo confirmado.</p>${homonimos.map(x=>`<article class="context"><span class="eyebrow">${esc(x.temporada)} · ${esc(x.rol)}</span><h3>${esc(x.nombre)}</h3><p>${esc(x.club)} · ${esc(x.equipo)}</p><a href="/persona/${x.id}">Abrir esta ficha separada →</a></article>`).join('')}`:''}
 ${arbitrajes.length?`<h2>Como árbitro</h2>${arbitrajes.map(x=>`<article class="context"><span class="eyebrow">${esc(x.temporada)} · ${esc(x.rol)}</span><h3>${esc(x.competicion)}</h3><p>${fmt(x.partidos)} partidos arbitrados</p><a href="/equipo/${x.teamEntry}?vista=matches">Ver un equipo de esta competición →</a></article>`).join('')}`:''}
 <p class="note">Los datos dependen de las actas disponibles. Un vacío no demuestra que la persona no participara en otros encuentros.</p></main></html>`;
}
