#!/usr/bin/env node
/** Generación reproducible: metadatos -> SQL existente -> instantánea -> visor sin servidor. */
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {renderDashboard} from './lib/informe-dashboard.mjs';
import {elegible,slugInforme} from './lib/informes-politica.mjs';
try {process.loadEnvFile('.env');} catch {}
const args=process.argv.slice(2),arg=(n,d=null)=>args.includes('--'+n)?args[args.indexOf('--'+n)+1]:d;
const ids=args.includes('--demo')?[8873,17745,20324,20390]:String(arg('equipos',arg('equipo',''))).split(',').map(Number).filter(Number.isSafeInteger).filter(x=>x>0);
if(!ids.length) throw Error('Usa --demo o --equipo <inscripción> o --equipos <id,id>.');
const {Client}=createRequire(resolve('packages/canonico/package.json'))('pg');
const c=new Client({connectionString:process.env.DATABASE_URL_LECTOR,statement_timeout:120000,application_name:'informes-dashboard'});
const soloRender=args.includes('--solo-render');
/*
 * El PDF se imprime con Chrome y cuesta unos segundos más, así que no se hace siempre: la página de pedir
 * informes lo pide con `--pdf` (es lo que ofrece el botón de descargar) y el uso por línea de comandos sigue
 * rápido por defecto. El fichero va a `output/pdf/<slug>.pdf`, junto a los demás.
 */
const conPdf=args.includes('--pdf')||args.includes('--pdf-si');
if(!soloRender)await c.connect();
mkdirSync('informes/dashboard',{recursive:true});
const salidas=[];
function ejecutar(script, params){const r=spawnSync(process.execPath,[script,...params],{encoding:'utf8',stdio:'pipe',timeout:600000,windowsHide:true});if(r.status!==0)throw Error(r.stderr||r.stdout||r.error);console.log(r.stdout.trim());}
function guardarVisor(snapshot,slug){
 const html=renderDashboard(snapshot,{photo:(person,season)=>{
  for(const ext of ['jpg','jpeg','png','webp']){const p=`informes/fotos/${slug}-${person}-${season}.${ext}`;if(existsSync(p))return `data:image/${ext==='jpg'?'jpeg':ext};base64,${readFileSync(p).toString('base64')}`;}
  return null;
 }});
 writeFileSync(`informes/dashboard/${slug}.html`,html);
}
try{
 for(const id of ids){
  if(soloRender){
   const catalog=JSON.parse(readFileSync('informes/dashboard/catalogo.json','utf8'));
   const item=catalog.find(x=>x.id===id);if(!item)throw Error('Genera primero el informe del equipo '+id);
   const snapshot=JSON.parse(readFileSync(`informes/${item.slug}.datos.json`,'utf8'));
   guardarVisor(snapshot,item.slug);salidas.push(item);continue;
  }
  const {rows:[ctx]}=await c.query(`select te.id,te.nombre_en_fuente equipo,ce.categoria,ce.federation_id,ce.nombre_publicado competicion,
  s.id temporada,s.etiqueta,ts.club_id,f.codigo federacion,(select visibility_state from ops.coverage_checkpoint where phase_group_id=g.id) visibility_state from core.team_entry te join core.team_season ts on ts.id=te.team_season_id
  join core.phase_group g on g.id=te.phase_group_id join core.competition_edition ce on ce.id=g.competition_edition_id
  join core.season s on s.id=ce.season_id join core.federation f on f.id=ce.federation_id where te.id=$1`,[id]);
  if(!ctx)throw Error('No existe la inscripción '+id);
  if(!elegible(ctx.etiqueta,ctx.visibility_state))throw Error('Esta competición histórica todavía no está completa. No se genera el informe.');
  const year=Number(ctx.etiqueta.slice(0,4)),prev=`${year-1}-${String(year).slice(-2)}`;
  const {rows:anteriores}=await c.query(`select te.id,s.id temporada from core.team_entry te join core.team_season ts on ts.id=te.team_season_id
   join core.phase_group g on g.id=te.phase_group_id join core.competition_edition ce on ce.id=g.competition_edition_id
   join core.season s on s.id=ce.season_id where ts.club_id=$1 and ce.categoria=$2 and s.etiqueta=$3 and te.nombre_en_fuente=$4 and exists(select 1 from ops.coverage_checkpoint where phase_group_id=g.id and visibility_state='completa' and completitud_historica) and ce.federation_id=$5`,[ctx.club_id,ctx.categoria,prev,ctx.equipo,ctx.federation_id]);
  const slug=slugInforme(ctx.equipo,ctx.categoria,ctx.etiqueta,id);
  const categorias=['prebenjamin','benjamin','alevin','infantil','cadete','juvenil','aficionados'];
  const rango=categorias.indexOf(ctx.categoria.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
  const {rows:mayores}=await c.query(`select te.id,te.nombre_en_fuente equipo,ce.nombre_publicado competicion,s.etiqueta from core.team_entry te
   join core.team_season ts on ts.id=te.team_season_id join core.phase_group g on g.id=te.phase_group_id
   join core.competition_edition ce on ce.id=g.competition_edition_id join core.season s on s.id=ce.season_id
   where ts.club_id=$1 and ce.categoria=any($2::text[]) and s.etiqueta>='2021-22'`,[ctx.club_id,rango<0?[]:categorias.slice(rango+1)]);
  const ruta=`informes/${slug}.datos.json`;
  if(!args.includes('--solo-render')){
   if(args.includes('--actualizar-plantilla'))ejecutar('scripts/plantilla-equipo-pnfg.mjs',['--equipo',String(id)]);
   if(args.includes('--fotos'))ejecutar('scripts/fotos-historicas-equipo.mjs',['--equipo',String(id),'--slug',slug,'--federacion',ctx.federacion]);
   ejecutar('scripts/informe-equipo.mjs',['--equipo',String(id),'--anterior',String(anteriores.length===1?anteriores[0].id:0),'--mayores',mayores.length?mayores.map(m=>`${m.id}:${m.equipo} ${m.competicion} ${m.etiqueta}`.replaceAll(',',' ')).join(','):'0:Sin equipo de categoría superior localizado',
    '--temporada',String(ctx.temporada),'--temporada-anterior',String(anteriores[0]?.temporada||0),'--titulo',`${ctx.equipo} · ${ctx.categoria}`,'--slug',slug,...(conPdf?[]:['--sin-pdf'])]);
  }
  if(!existsSync(ruta))throw Error('Genera primero los datos: '+ruta);
  const snapshot=JSON.parse(readFileSync(ruta,'utf8'));
  guardarVisor(snapshot,slug);
  salidas.push({slug,id,pdf:snapshot.pdfArchivo||null,nombre:snapshot.titulo,categoria:ctx.categoria,generadoEn:snapshot.generadoEn,plantilla:snapshot.datos.plantilla.length+snapshot.datos.plantilla_publicada.filter(x=>x.role==='player'&&!x.person_id).length});
 }
}finally{if(!soloRender)await c.end();}
const prevIndex=existsSync('informes/dashboard/catalogo.json')?JSON.parse(readFileSync('informes/dashboard/catalogo.json','utf8')):[];
const catalogo=[...new Map([...prevIndex,...salidas].map(x=>[x.id,x])).values()];
writeFileSync('informes/dashboard/catalogo.json',JSON.stringify(catalogo,null,2));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
writeFileSync('informes/dashboard/index.html',`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Observatorio · Pizarrales</title><style>body{background:#f2f4f6;color:#142b38;font:17px system-ui;max-width:1100px;margin:70px auto;padding:20px}h1{font-size:48px;letter-spacing:-2px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}a{background:white;padding:30px;border-radius:18px;color:inherit;text-decoration:none;border-top:5px solid #b92038;box-shadow:0 10px 35px #142b3809}a:hover{transform:translateY(-3px)}small{color:#657581}strong{display:block;font-size:24px;margin:15px 0}footer{margin-top:40px;color:#657581}</style><p>CDM PIZARRALES / DIRECCIÓN DEPORTIVA</p><h1>El rival, en perspectiva.</h1><p>Informes de equipo · exploración interactiva · desde 2021-22</p><p style="margin:26px 0"><a href="pedir.html" style="background:#b92038;color:#fff;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:600;border:0;border-top:0;box-shadow:none;display:inline-block">Pedir un informe de otro equipo →</a></p><main>${catalogo.map(x=>{const pdfNombre=x.pdf??(Object.hasOwn(x,'pdf')?null:x.slug+'.pdf');const tienePdf=pdfNombre&&existsSync(join('output','pdf',pdfNombre));return `<div style="background:white;border-radius:18px;border-top:5px solid #b92038;box-shadow:0 10px 35px #142b3809;display:flex;flex-direction:column;overflow:hidden"><a href="${esc(x.slug)}.html" style="padding:26px 28px 6px;text-decoration:none;color:inherit;border:0;background:transparent;box-shadow:none"><small>${esc(x.categoria.toUpperCase())}</small><strong>${esc(x.nombre)}</strong><p>${x.plantilla} jugadores conocidos</p><small>Actualizado ${esc(x.generadoEn.slice(0,10))} →</small></a>${tienePdf?`<a href="../../output/pdf/${esc(pdfNombre)}" style="padding:6px 28px 22px;text-decoration:none;color:#b92038;font-weight:600;font-size:15px">Descargar el PDF</a>`:'<span style="padding:6px 28px 22px;color:#657581;font-size:14px">PDF no generado</span>'}</div>`;}).join('')}</main><footer>Uso interno. Selecciona un informe para explorar jugadores, partidos y cuerpo técnico. Para otro equipo, «Pedir un informe».</footer></html>`);
console.log(JSON.stringify({informes:salidas,visor:resolve('informes/dashboard/index.html')},null,2));
