import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Builder,By,until} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import {abreCanonico,buscarEquipos,catalogoDeFiltros} from './lib/informes-consulta.mjs';
import {buscarPersonas,consultarPersona,htmlPersona} from './lib/personas-informes.mjs';
import {consultarInforme,htmlVivo} from './lib/informe-vivo.mjs';
import {nombrePdf,nombrePdfPersona} from './lib/informe-nombre-pdf.mjs';
import {InformeNoConsultable,respuestaDeError} from './lib/informe-errores.mjs';
import {consultarPrevia} from './lib/previa.mjs';
import {htmlPrevia} from './lib/previa-html.mjs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const pg=createRequire(resolve('packages/canonico/package.json'))('pg');
try{process.loadEnvFile('.env');}catch{}
const args=process.argv.slice(2),port=Number(args[args.indexOf('--puerto')+1])||4180;
const impresiones=new Map();let colaPdf=Promise.resolve();
function enviar(res,code,data,type='application/json; charset=utf-8'){res.writeHead(code,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(type.startsWith('application/json')?JSON.stringify(data):data);}
async function pdf(snapshot,filtros){
 const token=randomUUID();impresiones.set(token,htmlVivo(snapshot));let driver;
 try{
  driver=await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--disable-gpu','--window-size=1440,1000')).build();
  await driver.get(`http://127.0.0.1:${port}/impresion/${token}`);
  await driver.wait(until.elementLocated(By.css('#overview .kpi')),20000);
  await driver.executeScript(`const [season,player,minutes]=arguments;const s=document.querySelector('#season');if([...s.options].some(o=>o.value===season))s.value=season;document.querySelector('#search').value=player;document.querySelector('#minimum').value=minutes;s.dispatchEvent(new Event('input'));`,filtros.temporada||'',filtros.jugador||'',Math.max(0,Number(filtros.minutos)||0));
  if(filtros.historial)await driver.executeScript(`const s=document.querySelector('#history-season');if([...s.options].some(o=>o.value===arguments[0])){s.value=arguments[0];s.dispatchEvent(new Event('change',{bubbles:true}));}`,filtros.historial);
  for(const [id,value] of [['staff-person',filtros.tecnico],['staff-season',filtros.temporadaTecnico]])if(value)await driver.executeScript(`const s=document.getElementById(arguments[0]);if([...s.options].some(o=>o.value===arguments[1])){s.value=arguments[1];s.dispatchEvent(new Event('change',{bubbles:true}));}`,id,value);
  if(filtros.tabla)await driver.executeScript(`const s=document.getElementById('player-view');if([...s.options].some(o=>o.value===arguments[0])){s.value=arguments[0];s.dispatchEvent(new Event('change',{bubbles:true}));}`,filtros.tabla);
  await driver.executeScript(`document.body.classList.add('pdf-print');const stamp=document.createElement('p');stamp.className='print-stamp';stamp.textContent='Consulta actualizada: '+new Date().toLocaleString('es-ES',{dateStyle:'medium',timeStyle:'short'});document.querySelector('#header').append(stamp);`);
  if(filtros.alcance!=='detalle')await driver.executeScript(`
    document.body.classList.add('pdf-resumen');
    const playerTable=document.querySelector('#players .table');
    const playerRows=[...(playerTable?.querySelectorAll('tbody tr')||[])];
    if(playerRows.length>16){playerRows.slice(16).forEach(row=>row.remove());const note=document.createElement('p');note.className='note';note.textContent='Resumen: se muestran los 16 primeros jugadores de la tabla. La plantilla íntegra está en el PDF de detalle y en la web.';playerTable.closest('.card').insertBefore(note,playerTable.parentElement);}
    const brief=document.createElement('section');brief.id='pdf-brief';brief.className='panel';
    const heading=document.createElement('h2');heading.textContent='Historial relevante y últimos partidos';brief.append(heading);
    const histories=[...document.querySelectorAll('#history details.history-person')];
    const history=histories.find(x=>x.querySelector('.table'))?.querySelector('.table')?.cloneNode(true);
    if(history){history.querySelector('th:first-child').textContent='Jugador / temporada';history.querySelector('tbody').replaceChildren();
      for(const detail of histories){const person=detail.querySelector('summary strong')?.textContent||'';
       for(const row of detail.querySelectorAll('tbody tr')){const copy=row.cloneNode(true);copy.dataset.person=detail.dataset.historyPerson;copy.dataset.season=copy.cells[0].textContent.match(/[0-9]{4}-[0-9]{2}/g)?.at(-1)||'';copy.cells[0].prepend(document.createTextNode(person+' · '));history.querySelector('tbody').append(copy);}}
      const roster=[...document.querySelectorAll('#players [data-person]')].map(x=>x.dataset.person).filter((x,i,a)=>a.indexOf(x)===i).slice(0,10);
      const current=JSON.parse(document.querySelector('#report-data').textContent).datos.contexto[0].temporada;
      const count=new Map();for(const row of [...history.querySelectorAll('tbody tr')]){const person=row.dataset.person,season=row.dataset.season,used=count.get(person)||0;
       if(!roster.includes(person)||!season||season>=current||row.cells[0].textContent.includes(current)||used>=2)row.remove();else count.set(person,used+1);}
      if(history.querySelector('tbody tr')){const card=document.createElement('article');card.className='card';card.innerHTML='<h3>Antecedentes de los jugadores visibles</h3><p class="note">Hasta dos contextos anteriores por jugador de los diez primeros de la tabla mostrada. El detalle completo está en la versión web.</p>';card.append(history);brief.append(card);}}
    const staff=document.querySelector('#staff .card')?.cloneNode(true);if(staff){staff.querySelector('h2').textContent='Cuerpo técnico actual';brief.append(staff);}
    const matches=[...document.querySelectorAll('#matches .match')].slice(-6);
    if(matches.length){const card=document.createElement('article');card.className='card';const edition=JSON.parse(document.querySelector('#report-data').textContent).datos.contexto[0];card.innerHTML='<h3>Últimos partidos con resultado</h3><p class="note">'+(edition.estado_edicion==='activa'?'La temporada puede seguir en curso.':'Temporada anterior; se muestran los resultados publicados.')+'</p>';for(const match of matches){const copy=match.cloneNode(true);copy.querySelector('details')?.remove();card.append(copy);}brief.append(card);}
    document.querySelector('main').insertBefore(brief,document.querySelector('#footer'));
  `);
  else await driver.executeScript(`document.querySelectorAll('#history details.history-person').forEach(x=>x.open=true);`);
  await driver.executeScript(`document.querySelectorAll('.note').forEach(e=>{e.textContent=e.textContent.replace('Pulsa un punto para ver al jugador. ','').replace('Pulsa el nombre para ver TODOS sus equipos y temporadas. ','').replace('la ficha desglosa los demás.','la sección Trayectorias desglosa los demás.').replace('desgloses completos en su ficha.','desgloses completos en Trayectorias.');});`);
  // Las cabeceras ordenables son controles en pantalla, pero texto en papel.
  await driver.executeScript(`document.querySelectorAll('th button').forEach(button=>{const label=document.createElement('span');label.textContent=button.textContent.replace(' ↕','');button.replaceWith(label);});document.querySelectorAll('label').forEach(label=>{if(label.querySelector('select,input'))label.hidden=true;});`);
  await driver.executeAsyncScript('const done=arguments[arguments.length-1];Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,3000))]).then(()=>done(),()=>done());');
  return Buffer.from(await driver.printPage({orientation:'landscape',background:true,width:21,height:29.7,top:1,bottom:1,left:1,right:1,shrinkToFit:true}),'base64');
 }finally{impresiones.delete(token);if(driver)await driver.quit();}
}
/** Imprime cualquier página ya compuesta. La página se sirve una sola vez por un token efímero. */
async function pdfDePagina(html,{orientation='portrait',esperar='main'}={}){
 const token=randomUUID();impresiones.set(token,html);let driver;
 try{
  driver=await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--disable-gpu','--window-size=1100,1400')).build();
  await driver.get(`http://127.0.0.1:${port}/impresion/${token}`);
  await driver.wait(until.elementLocated(By.css(esperar)),20000);
  return Buffer.from(await driver.printPage({orientation,background:true,width:21,height:29.7,top:1,bottom:1,left:1,right:1,shrinkToFit:true}),'base64');
 }finally{impresiones.delete(token);if(driver)await driver.quit();}
}
createServer(async(req,res)=>{
 try{
  if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host))return enviar(res,403,{error:'Host no permitido'});
  const url=new URL(req.url,`http://127.0.0.1:${port}`),path=decodeURIComponent(url.pathname);
  if(path==='/favicon.ico'){res.writeHead(204);return res.end();}
  if(req.method!=='GET')return enviar(res,405,{error:'Abre el equipo directamente; ya no se guardan informes.'});
  if(['/', '/dashboard/index.html','/dashboard/pedir.html'].includes(path))return enviar(res,200,readFileSync('scripts/lib/consultar-informes.html'),'text/html; charset=utf-8');
  if(path.startsWith('/impresion/')){const h=impresiones.get(path.slice(11));return enviar(res,h?200:404,h||'Caducado','text/html; charset=utf-8');}
  if(path==='/api/filtros'||path==='/api/buscar'){
   const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);
   try{
    if(path==='/api/filtros')return enviar(res,200,await catalogoDeFiltros(c,{federacion:url.searchParams.get('federacion')}));
    const offset=Math.max(0,Math.min(10000,Number(url.searchParams.get('offset'))||0));
    const encontrados=await buscarEquipos(c,{...Object.fromEntries(url.searchParams),offset,limite:61});
    const personas=offset||!url.searchParams.get('texto')?[]:await buscarPersonas(c,url.searchParams.get('texto'),{federacion:url.searchParams.get('federacion')});
    return enviar(res,200,{equipos:encontrados.slice(0,60),personas,hayMas:encontrados.length>60,offset});
   }finally{await c.end();}
  }
  const person=/^\/persona\/(\d+)(\/pdf)?$/.exec(path);
  if(person){const id=Number(person[1]);if(!Number.isSafeInteger(id)||id<=0)return enviar(res,400,{error:'Persona no válida'});
   const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);let data;
   try{data=await consultarPersona(c,id);}finally{await c.end();}
   if(!data)throw new InformeNoConsultable({status:404,titulo:'Sin información consultable para esta persona',detalle:'No figura en ningún grupo certificado desde 2021-22 ni en la temporada en curso.'});
   if(!person[2])return enviar(res,200,htmlPersona(data),'text/html; charset=utf-8');
   // La ficha se imprime en vertical: es una columna de contextos, no un dashboard.
   const job=colaPdf.then(async()=>({bytes:await pdfDePagina(htmlPersona(data)),filename:nombrePdfPersona(data)}));colaPdf=job.catch(()=>{});
   const {bytes,filename}=await job;res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);return enviar(res,200,bytes,'application/pdf');}
  // Previa: dos inscripciones del mismo grupo, frente a frente. Misma cola que los PDF de equipo.
  const previa=/^\/previa\/(\d+)\/(\d+)(\/pdf)?$/.exec(path);
  if(previa){
   const datos=await consultarPrevia(pg,process.env.DATABASE_URL_LECTOR,previa[1],previa[2]);
   const html=htmlPrevia(datos,{a:previa[1],b:previa[2]});
   if(!previa[3])return enviar(res,200,html,'text/html; charset=utf-8');
   const limpio=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50);
   const job=colaPdf.then(async()=>({bytes:await pdfDePagina(html),filename:`previa_${limpio(datos.a.equipo)}_vs_${limpio(datos.b.equipo)}_consulta-${datos.generadoEn.slice(0,10)}.pdf`}));colaPdf=job.catch(()=>{});
   const {bytes,filename}=await job;res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);return enviar(res,200,bytes,'application/pdf');
  }
  const match=/^\/equipo\/(\d+)(\/pdf)?$/.exec(path);
  if(match){
   const id=Number(match[1]);if(!Number.isSafeInteger(id)||id<=0)return enviar(res,400,{error:'Equipo no válido'});
   if(!match[2])return enviar(res,200,htmlVivo(await consultarInforme(id)),'text/html; charset=utf-8');
   const job=colaPdf.then(async()=>{const snapshot=await consultarInforme(id);const filtros=Object.fromEntries(url.searchParams);return {bytes:await pdf(snapshot,filtros),filename:nombrePdf(snapshot,filtros.alcance==='detalle'?'detalle':'resumen')};});colaPdf=job.catch(()=>{});
   const {bytes,filename}=await job;res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);return enviar(res,200,bytes,'application/pdf');
  }
  if(path.startsWith('/dashboard/')&&path.endsWith('.html')){
   const slug=path.slice(11,-5);let id=Number(/-\d{4}-\d{2}-(\d+)$/.exec(slug)?.[1]);
   if(!id){try{id=Number(JSON.parse(readFileSync('informes/dashboard/catalogo.json')).find(x=>x.slug===slug)?.id);}catch{}}
   if(id){res.writeHead(302,{location:`/equipo/${id}`,'cache-control':'no-store'});return res.end();}
  }
  return enviar(res,404,{error:'No encontrado'});
 }catch(error){
  // El motivo viaja tipado: la página lo explica; un error inesperado no enseña su mensaje interno.
  const {status,html}=respuestaDeError(error);if(status>=500)console.error(error.message);
  const conocido=error instanceof InformeNoConsultable?error.titulo:null;
  if(String(req.url).startsWith('/api/'))return enviar(res,status,{error:conocido||'No se pudo completar la consulta.'});
  if(/\/pdf(\?|$)/.test(String(req.url)))return enviar(res,status,conocido||'No se pudo generar el PDF.','text/plain; charset=utf-8');
  return enviar(res,status,html,'text/html; charset=utf-8');
 }
}).listen(port,'127.0.0.1',()=>console.log(`Consulta viva en http://127.0.0.1:${port} · sin informes guardados`));
