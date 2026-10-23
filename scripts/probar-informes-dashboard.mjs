import {Builder,By,until} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const opts=new chrome.Options().addArguments('--headless=new','--window-size=1440,1000','--disable-gpu','--no-first-run');
const driver=await new Builder().forBrowser('chrome').setChromeOptions(opts).build();
const catalog=JSON.parse(readFileSync('informes/dashboard/catalogo.json','utf8'));
mkdirSync('tmp/informes-dashboard',{recursive:true});const results=[];
try{for(const item of catalog){
 await driver.get(pathToFileURL(resolve(`informes/dashboard/${item.slug}.html`)).href);
 await driver.wait(until.elementLocated(By.css('#overview .kpi')),15000);
 const count=await driver.findElements(By.css('#players tbody tr'));assert(count.length>0);
 await driver.findElement(By.css('[data-tab="players"]')).click();
 await driver.findElement(By.css('#players [data-person]')).click();
 assert.equal(await driver.executeScript('return document.querySelector("#profile").open'),true);
 await driver.findElement(By.css('.close')).click();
 const search=await driver.findElement(By.id('search'));await search.sendKeys('zzzzimposible');
 assert.equal((await driver.findElements(By.css('#players tbody tr'))).length,0);await search.clear();await driver.executeScript('document.querySelector("#search").dispatchEvent(new Event("input"))');
 await driver.findElement(By.css('#players [data-sort="yellows"]')).click();
 await driver.executeScript('const s=document.querySelector("#season");if(s.options.length>1){s.selectedIndex=1;s.dispatchEvent(new Event("input"));}');
 if(item.id===8873){
  await search.sendKeys('diego martin ortega');
  const cells=await driver.findElements(By.css('#players tbody tr td'));
  const expected=await driver.executeScript(`
   const d=JSON.parse(document.querySelector('#report-data').textContent).datos;
   const season=document.querySelector('#season').value;
   const p=d.plantilla.find(p=>p.nombre.toLowerCase().includes('diego')&&p.nombre.toLowerCase().includes('ortega'));
   const w=d.peso_en_su_equipo.filter(x=>String(x.person_id)===String(p.person_id)&&x.temporada===season).sort((a,b)=>Number(b.minutos)-Number(a.minutos))[0];
   if(!w)return '—';
   return String(d.disciplina_dashboard.find(x=>String(x.person_id)===String(p.person_id)&&x.temporada===season&&String(x.team_entry_id)===String(w.team_entry_id))?.amarillas||0);
  `);
  assert.equal(await cells[6].getText(),expected,'Tarjetas del contexto seleccionado, o ausencia si no es elegible');
  await search.clear();await driver.executeScript('document.querySelector("#search").dispatchEvent(new Event("input"))');
 }
 for(const tab of ['discipline','matches','staff','coverage','overview']){await driver.findElement(By.css(`[data-tab="${tab}"]`)).click();assert.equal(await driver.findElement(By.id(tab)).isDisplayed(),true);}
 assert(!/team_entry_id|person_id|core\./.test(await driver.findElement(By.id('coverage')).getAttribute('textContent')),'Sin detalles internos en la interfaz');
 writeFileSync(`tmp/informes-dashboard/${item.slug}.png`,await driver.takeScreenshot(),'base64');
 await driver.manage().window().setRect({width:390,height:844});
 assert.equal(await driver.executeScript('return document.documentElement.scrollWidth <= innerWidth + 2'),true,'No debe desbordar horizontalmente en móvil');
 writeFileSync(`tmp/informes-dashboard/${item.slug}-movil.png`,await driver.takeScreenshot(),'base64');
 await driver.manage().window().setRect({width:1440,height:1000});
 await driver.findElement(By.css('[data-tab="players"]')).click();
 writeFileSync(`tmp/informes-dashboard/${item.slug}-jugadores.png`,await driver.takeScreenshot(),'base64');
 await driver.findElement(By.css('#players [data-person]')).click();
 writeFileSync(`tmp/informes-dashboard/${item.slug}-ficha.png`,await driver.takeScreenshot(),'base64');
 await driver.findElement(By.css('.close')).click();
 await driver.findElement(By.css('[data-tab="staff"]')).click();
 writeFileSync(`tmp/informes-dashboard/${item.slug}-tecnicos.png`,await driver.takeScreenshot(),'base64');
 const logs=await driver.manage().logs().get('browser');const errors=logs.filter(x=>x.level.name==='SEVERE');assert.deepEqual(errors,[]);
 results.push({informe:item.slug,filas:count.length,pruebas:'navegación, búsqueda, ficha, ordenación, temporada, móvil y consola: OK'});console.log(JSON.stringify(results.at(-1)));
}}finally{await driver.quit();}
writeFileSync('tmp/informes-dashboard/verificacion.json',JSON.stringify(results,null,2));
