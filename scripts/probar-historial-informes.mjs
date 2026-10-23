import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {abreCanonico,buscarEquipos,catalogoDeFiltros} from './lib/informes-consulta.mjs';
import {Builder,By,until} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
process.loadEnvFile('.env');
const slug='alba-de-tormes-c-f-juvenil-2026-27-8869';
const d=JSON.parse(readFileSync(`informes/${slug}.datos.json`)).datos;
const c=await abreCanonico(process.env.DATABASE_URL_LECTOR);
try{
 const ids=d.plantilla.map(x=>x.person_id);
 const expected=(await c.query(`select distinct a.person_id,te.id team_entry,s.etiqueta temporada from core.appearance a
 join core.team_entry te on te.id=a.team_entry_id join core.phase_group g on g.id=te.phase_group_id
 join core.competition_edition ce on ce.id=g.competition_edition_id join core.season s on s.id=ce.season_id
 join ops.coverage_checkpoint cp on cp.phase_group_id=g.id
 where a.person_id=any($1::bigint[]) and s.etiqueta>='2021-22' and s.etiqueta<'2026-27' and cp.visibility_state='completa' and cp.completitud_historica`,[ids])).rows;
 const key=x=>[x.person_id,x.team_entry,x.temporada].join(':');
 assert.deepEqual(d.historial.filter(x=>x.temporada<'2026-27').map(key).sort(),expected.map(key).sort(),'Se incluyen todos y solo los contextos completos de la plantilla');
 assert(expected.some(x=>x.temporada==='2025-26'));
 assert(d.cuerpo_tecnico_por_nombre.length>0);
 const search=await buscarEquipos(c,{texto:'Alba de Tormes',temporada:'2025-26',categoria:'juvenil'});
 assert(search.length>0,'Grupo completo visible aunque la edición no lo esté');
 await catalogoDeFiltros(c);
 console.log(JSON.stringify({historialPorTemporada:d.historial.reduce((a,x)=>(a[x.temporada]=(a[x.temporada]||0)+1,a),{}),jugadoresConPasado:new Set(expected.map(x=>x.person_id)).size,contextosTecnicos:d.cuerpo_tecnico_por_nombre.length,contextosSuperiores:d.cruce_senior.length,sql:'OK'}));
}finally{await c.end();}
const driver=await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--window-size=1440,1000','--disable-gpu')).build();
mkdirSync('tmp/informes-dashboard',{recursive:true});
try{
 await driver.get(pathToFileURL(resolve(`informes/dashboard/${slug}.html`)).href);
 await driver.wait(until.elementLocated(By.css('#overview .kpi')),15000);
 assert.match(await driver.findElement(By.id('overview')).getText(),/Ritmo de gol/);
 await driver.findElement(By.css('[data-tab=history]')).click();
 assert.match(await driver.findElement(By.id('history')).getText(),/2025-26/);
 assert.match(await driver.findElement(By.id('history')).getText(),/2023-24/);
 writeFileSync('tmp/informes-dashboard/alba-historial.png',await driver.takeScreenshot(),'base64');
 await driver.findElement(By.css('#history [data-person]')).click();
 assert.match(await driver.findElement(By.id('profile-content')).getText(),/Tarjetas y ausencias posteriores/);
 await driver.findElement(By.css('.close')).click();
 await driver.findElement(By.css('[data-tab=staff]')).click();
 assert.match(await driver.findElement(By.id('staff')).getText(),/2025-26/);
 const errors=(await driver.manage().logs().get('browser')).filter(x=>x.level.name==='SEVERE');assert.deepEqual(errors,[]);
 await driver.manage().window().setRect({width:390,height:844});
 assert(await driver.executeScript('return document.documentElement.scrollWidth<=innerWidth+2'));
 console.log('Navegación histórica, técnicos, ficha, móvil y consola: OK');
}finally{await driver.quit();}
