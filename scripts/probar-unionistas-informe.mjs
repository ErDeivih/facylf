import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Builder,By,until} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import {abreCanonico,contextoDeEquipo} from './lib/informes-consulta.mjs';
try{process.loadEnvFile('.env');}catch{}

const base='http://127.0.0.1:4180';
const response=await fetch(base+'/equipo/8874');
assert.equal(response.status,200);
const payload=(await response.text()).match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/);
assert(payload,'Falta la instantánea del informe');
const snapshot=JSON.parse(payload[1]),d=snapshot.datos;
assert.equal(new Set(d.plantilla.map(p=>String(p.person_id))).size,d.plantilla.length,'La plantilla debe tener una persona por identificador');
assert(d.historia_equipo.length>=4);
assert(d.historia_equipo.every(x=>String(x.equipo_codigo)==='16257'),'La trayectoria no debe mezclar juvenil A/B con C');
assert(d.historia_equipo.some(x=>x.temporada==='2023-24'&&x.competicion.includes('2ª División Provincial')));
assert(d.historia_equipo.some(x=>x.temporada==='2024-25'&&x.competicion.includes('1ª División Provincial')));
const scorer=d.historial.find(h=>String(h.person_id)==='17301'&&h.temporada==='2026-27'&&String(h.team_entry)==='8874');
const scorerMinutes=d.peso_en_su_equipo.find(w=>String(w.person_id)==='17301'&&w.temporada==='2026-27'&&String(w.team_entry_id)==='8874');
assert.equal(Number(scorer.goles),1);assert.equal(Number(scorerMinutes.minutos),10);

const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);
try{
 const context=await contextoDeEquipo(c,8874);
 assert.equal(Number(context.anterior.id),2492,'Las comillas y espacios no deben romper la identidad del juvenil C');
 const {rows}=await c.query(`select e.event_type,e.minute_base from core.appearance a
  join core.match_event e on e.match_id=a.match_id and e.person_id=a.person_id and e.team_entry_id=a.team_entry_id
  where a.person_id=$1 and a.team_entry_id=$2`,['17301','8874']);
 assert(rows.some(e=>e.event_type==='entra'&&e.minute_base===80));
 assert(rows.some(e=>e.event_type==='gol'&&e.minute_base===90));
 const {rows:[source]}=await c.query(`select r.quality,r.archivo_ruta,s.codigo_acta from core.match_report r
  left join core.match_source s on s.match_id=r.match_id where r.match_id=$1 limit 1`,[33962]);
 assert(source?.archivo_ruta,'Falta la referencia al acta archivada para contrastar el gol');
 const archivedJson=source.archivo_ruta.replace(/\.html$/i,'.json.gz');
 assert(existsSync(archivedJson),'Falta el JSON comprimido del acta original');
 const archived=JSON.parse(gunzipSync(readFileSync(archivedJson)));
 assert(archived.goles.some(g=>g.jugador==='DE LA VILLA MERINO, SERGIO'&&Number(g.minutoBase)===90&&g.lado==='visitante'));
 assert(archived.cambios.some(c=>c.entrante==='DE LA VILLA MERINO, SERGIO'&&Number(c.minutoBase)===80&&c.lado==='visitante'));
 console.log(JSON.stringify({actaCalidad:source.quality,actaCodigo:source.codigo_acta,actaOriginalComprimida:true}));
}finally{await c.end();}

const browser=await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--window-size=1440,1000','--disable-gpu')).build();
try{
 await browser.get(base+'/?texto=unionistas');
 await browser.wait(until.elementLocated(By.css('#results article')),20000);
 assert.equal(await browser.findElement(By.id('temporada')).getAttribute('value'),'2026-27');
 const currentCards=await browser.findElements(By.css('#results article'));
 assert(currentCards.length>0);
 for(const card of currentCards)assert((await card.getText()).includes('2026-27'),'El buscador predeterminado no debe listar temporadas pasadas');
 await browser.get(base+'/?texto=unionistas&temporada=todas');
 await browser.wait(until.elementLocated(By.css('#results article')),20000);
 assert.equal(await browser.findElement(By.id('temporada')).getAttribute('value'),'todas');
 assert((await browser.findElement(By.id('results')).getText()).includes('2025-26'),'El histórico debe seguir disponible si se pide expresamente');

 await browser.get(base+'/equipo/8874?texto=unionistas&provincia=Salamanca&vista=history');
 await browser.wait(until.elementLocated(By.css('#history details.history-person')),20000);
 const people=await browser.findElements(By.css('#history details.history-person'));
 assert.equal(people.length,d.plantilla.length,'Trayectorias debe listar cada integrante una vez');
 const person=await browser.findElement(By.css('#history details[data-history-person="17301"]'));
 await person.findElement(By.css('summary')).click();
 const goalRow=await browser.findElement(By.css('#history [data-compare="17301:2026-27:8874"]'));
 const cells=await goalRow.findElement(By.xpath('../..')).findElements(By.css('td'));
 assert.equal(await cells[6].getText(),'1');
 assert.equal(await cells[7].getText(),'—','Un gol en diez minutos no debe proyectarse como nueve por partido');
 mkdirSync('tmp/informes-vivo',{recursive:true});
 writeFileSync('tmp/informes-vivo/unionistas-trayectorias.png',await browser.takeScreenshot(),'base64');
 await browser.findElement(By.css('[data-tab=coverage]')).click();
 assert((await browser.findElement(By.id('coverage')).getText()).includes('División superior al curso anterior'));
 assert.deepEqual((await browser.manage().logs().get('browser')).filter(x=>x.level.name==='SEVERE'),[]);
 console.log(JSON.stringify({equipo:8874,jugadores:d.plantilla.length,temporadasMismoEquipo:d.historia_equipo.length,
  anterior:2492,metaReal:'1 gol en 10 minutos',tasaCorta:'oculta',busquedaActual:true,
  consultasMasLentas:Object.entries(snapshot.tiemposMs).sort((a,b)=>b[1]-a[1]).slice(0,3),erroresConsola:0}));
}finally{await browser.quit();}
