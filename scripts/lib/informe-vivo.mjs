import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {abreCanonico,contextoDeEquipo} from './informes-consulta.mjs';
import {renderDashboard} from './informe-dashboard.mjs';
import {cargarFotos} from './informe-fotos.mjs';
import {InformeNoConsultable} from './informe-errores.mjs';
import {temporadaActual} from './informes-politica.mjs';
import {codigosReales,nombreFederacion} from './informes-federaciones.mjs';
const ejecutar=promisify(execFile);
let cola=Promise.resolve();
export function consultarInforme(id){
 const tarea=cola.then(()=>extraer(id));
 cola=tarea.catch(()=>{});
 return tarea;
}
async function extraer(id){
 const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);
 let ctx;try{ctx=await contextoDeEquipo(c,id);}finally{await c.end();}
 // Tres motivos distintos, que antes salían con el mismo mensaje y como JSON crudo.
 if(!ctx)throw new InformeNoConsultable({status:404,titulo:'Esa inscripción no existe',
  detalle:'Puede que el enlace sea antiguo o esté mal copiado. Busca el equipo de nuevo.'});
 // Cualquiera de las 19 territoriales; las federaciones de prueba del canónico, no.
 if(!codigosReales().includes(ctx.federacion))throw new InformeNoConsultable({status:422,titulo:'Federación no disponible para informes',
  detalle:`«${ctx.federacion}» no es una de las 19 federaciones territoriales configuradas.`});
 if(!ctx.elegible){
  const fuera=ctx.temporada<'2021-22'||ctx.temporada>temporadaActual();
  throw new InformeNoConsultable({status:422,
   titulo:fuera?`Temporada ${ctx.temporada} fuera del periodo de informes`:`${ctx.equipo} · ${ctx.temporada}: grupo sin certificar`,
   detalle:fuera?`Los informes cubren de 2021-22 a ${temporadaActual()}.`
    :`${ctx.cobertura?.texto||'Cobertura incompleta'}. Mientras falten jornadas, resultados o actas del grupo, sus cifras no serían fiables y no se muestran.`});
 }
 const mayores=ctx.mayores.map(x=>`${x.id}:${x.equipo} ${x.competicion} ${x.etiqueta}`.replaceAll(',',' ')).join(',')||'0:Sin categoría superior localizada';
 const {stdout}=await ejecutar(process.execPath,['scripts/informe-equipo.mjs','--equipo',String(id),'--anterior',String(ctx.anterior.id),'--mayores',mayores,'--temporada',String(ctx.temporadaId),'--temporada-anterior',String(ctx.anterior.temporada||0),'--titulo',`${ctx.equipo} · ${ctx.categoria}`,'--slug',ctx.slug,'--stdout-json'],{cwd:resolve('.'),windowsHide:true,timeout:180000,maxBuffer:64*1024*1024});
 const snapshot=JSON.parse(stdout);
 const photosConnection=await abreCanonico(process.env.DATABASE_URL_LECTOR);
 try{snapshot.fotos=await cargarFotos(photosConnection,snapshot);}finally{await photosConnection.end();}
 return snapshot;
}
export function htmlVivo(snapshot){
 const {fotos,...data}=snapshot;
 let html=renderDashboard(data,{photo:(person,season)=>{
  if(fotos?.[`${person}:${season}`])return fotos[`${person}:${season}`];
  // Las fotografías son recursos archivados, no informes guardados.
  const prefixes=[snapshot.slug,snapshot.slug.replace(/-\d+$/,'')];
  for(const prefix of prefixes)for(const ext of ['jpg','jpeg','png','webp']){
   const path=resolve('informes/fotos',`${prefix}-${person}-${season}.${ext}`);
   if(existsSync(path))return `data:image/${ext==='jpg'?'jpeg':ext};base64,${readFileSync(path).toString('base64')}`;
  }return null;
 }});
 const id=Number(snapshot.datos.contexto[0].team_entry);
 html=html.replace('href="index.html"','href="/"');
 html=html.replace('</head>',`<style>@page{size:A4 landscape;margin:10mm}@media print{body{font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.panel{break-before:page}.panel:first-of-type{break-before:auto}.card{break-inside:auto;padding:14px}#overview .grid{break-before:page}.grid>.card{break-inside:avoid}.barrow{margin:6px 0;font-size:10px;line-height:1.2}.barrow .name{font-size:10px}.grid h2{font-size:18px}.chart{break-inside:avoid}.table{font-size:9px;width:100%;table-layout:auto}.table tr{break-inside:avoid}.table th{font-size:9px}thead{display:table-header-group}.chart{max-height:230px}h1{font-size:30px}h2{font-size:20px}.name{font-size:10px}.table .player{min-width:100px}.kpi b{font-size:26px}.scroll{overflow:visible}select,input,button.close{display:none!important}body.pdf-resumen #history,body.pdf-resumen #discipline,body.pdf-resumen #matches,body.pdf-resumen #staff,body.pdf-resumen #coverage{display:none!important}body.pdf-resumen #pdf-brief{display:block;break-before:page}body.pdf-resumen #overview .grid>.card{break-inside:avoid}}</style></head>`);
 html=html.replace('</head>','<style>@page{@bottom-right{content:"Página " counter(page) " / " counter(pages);font:9px system-ui;color:#607381}}@media print{body.pdf-resumen #overview .grid{break-before:auto}#pdf-brief .match{break-inside:avoid}}</style></head>');
 // El dashboard en pantalla usa paneles grandes; en papel fluyen sin forzar una hoja por sección.
 html=html.replace('</head>',`<style>@page{margin:8mm}@media print{
  body{font-size:10.5px;line-height:1.35}.panel,.panel:first-of-type,#overview .grid{break-before:auto!important;page-break-before:auto!important}
  .panel{margin:0 0 10px}.grid{gap:9px;margin:9px 0}.grid>.card{break-inside:avoid!important}
  .card{margin:7px 0;padding:12px;break-inside:auto!important}.kpis{margin:12px 0;gap:8px}.kpi{padding:12px}.kpi b{font-size:23px}
  .insights{gap:8px;margin:10px 0}.insight{padding:9px}.insight p{font-size:10px}
  h1{font-size:25px}h2{font-size:16px;margin-bottom:5px}h3{font-size:13px}.note{font-size:9px}
  .barrow{margin:4px 0;font-size:9px;gap:5px}.barrow .name{font-size:9px}.barrow.combined{grid-template-columns:minmax(90px,1.2fr) 2fr minmax(68px,80px)}
  .table{font-size:8.5px}.table th{font-size:8px}.table td,.table th{padding:3px 5px}.table tr{break-inside:avoid}
  .avatar{width:27px;height:34px}.player{gap:6px}.sub{font-size:9px}.match{padding:7px 0}.match strong{font-size:13px}
  #history details.history-person{break-inside:auto;margin:5px 0}#history details.history-person summary{padding:7px 9px}#history .history-body{padding:2px 9px 7px}
  #pdf-brief{break-before:auto!important}#footer{display:none!important}.print-stamp{font-size:9px;color:#607381;margin:2px 0 6px}
 }</style></head>`);
 return html.replace('</body>',`<script>
 const back=document.querySelector('.rail>a');back.href='/'+location.search;
 const refresh=document.createElement('button');refresh.className='print';refresh.textContent='Actualizar datos';refresh.onclick=()=>location.reload();document.querySelector('.toolbar').append(refresh);
 const pdfScope=document.createElement('label');pdfScope.textContent='Alcance del PDF';pdfScope.innerHTML+='<select id="pdf-scope"><option value="resumen">Resumen para preparar partido</option><option value="detalle">Detalle completo</option></select>';document.querySelector('.toolbar').append(pdfScope);
 const pdf=document.querySelector('#print');pdf.textContent='Descargar PDF';pdf.style.background='#087e83';pdf.style.color='white';pdf.onclick=async()=>{
  pdf.disabled=true;pdf.textContent='Preparando PDF…';
  try{const p=new URLSearchParams({historial:document.querySelector('#history-season').value,temporada:document.querySelector('#season').value,jugador:document.querySelector('#search').value,minutos:document.querySelector('#minimum').value,tecnico:document.querySelector('#staff-person').value,temporadaTecnico:document.querySelector('#staff-season').value,tabla:document.querySelector('#player-view').value,alcance:document.querySelector('#pdf-scope').value});const r=await fetch('/equipo/${id}/pdf?'+p);if(!r.ok)throw Error(await r.text());const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=r.headers.get('Content-Disposition')?.split('filename="')[1]?.split('"')[0]||'informe.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){alert('No se pudo descargar: '+e.message);}finally{pdf.disabled=false;pdf.textContent='Descargar PDF';}
 };
 document.querySelector('#footer').append(' · Consulta a la base al abrir o actualizar. No se guarda este informe.');
 const rivales=(JSON.parse(document.querySelector('#report-data').textContent).datos.resumen_liga||[]).filter(x=>String(x.team_entry)!=='${id}');
 if(rivales.length){const previa=document.createElement('label');previa.textContent='Preparar partido contra';const sel=document.createElement('select');sel.id='previa';
  sel.append(new Option('Elige rival…',''),...rivales.map(x=>new Option(x.equipo,x.team_entry)).sort((p,q)=>p.text.localeCompare(q.text,'es')));
  sel.onchange=()=>{if(sel.value)location.href='/previa/${id}/'+encodeURIComponent(sel.value);};previa.append(sel);document.querySelector('.toolbar').append(previa);}
 </script></body>`);
}
