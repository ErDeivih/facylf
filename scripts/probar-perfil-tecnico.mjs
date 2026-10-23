import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Builder,By,until} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const browser=await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--window-size=1440,1050','--disable-gpu')).build();
try{
 const base='http://127.0.0.1:4180';
 await browser.get(base+'/equipo/17747?vista=staff&nombreJugador=David');
 await browser.wait(until.elementLocated(By.css('#staff [data-staff-person="124519"]')),20000);
 assert.equal(await browser.findElement(By.id('staff')).isDisplayed(),true);
 await browser.findElement(By.css('#staff [data-staff-person="124519"]')).click();
 await browser.wait(until.elementLocated(By.css('#profile[open] .staff-context')),20000);
 assert((await browser.getCurrentUrl()).includes('fichaTecnico=124519'));
 const profile=await browser.findElement(By.id('profile')).getText();
 assert(profile.includes('JESUS DE CASTRO BERMEJO'));
 assert(profile.includes('Trayectoria vinculada a esta ficha'));
 assert(profile.includes('Posibles antecedentes con el mismo nombre'));
 assert(profile.includes('U.D. Santa Marta de Tormes'));
 assert(profile.toLowerCase().includes('identidad por confirmar'));
 assert.match(await browser.findElement(By.css('#profile-content .kpi:nth-child(2) b')).getText(),/^\d+ · \d+ · \d+$/);
 const counted=await browser.executeScript(`const d=JSON.parse(document.querySelector('#report-data').textContent).datos;
  const direct=d.cuerpo_tecnico.filter(x=>String(x.person_id)==='124519');
  const directRows=document.querySelectorAll('#profile-content .card')[0].querySelectorAll('.staff-context').length;
  const candidates=document.querySelectorAll('#profile-content .card')[1].querySelectorAll('.staff-context').length;
  return {direct:direct.length,directRows,candidates};`);
 assert.equal(counted.directRows,counted.direct);
 assert(counted.candidates>=4);
 mkdirSync('tmp/informes-vivo',{recursive:true});
 writeFileSync('tmp/informes-vivo/trayectoria-tecnico.png',await browser.takeScreenshot(),'base64');
 await browser.navigate().refresh();
 await browser.wait(until.elementLocated(By.css('#profile[open] .staff-context')),20000);
 assert((await browser.findElement(By.id('profile')).getText()).includes('Posibles antecedentes'));
 await browser.findElement(By.css('#profile .close')).click();
 assert(!(await browser.getCurrentUrl()).includes('fichaTecnico='));
 await browser.findElement(By.css('#staff [data-staff-person="124518"]')).click();
 assert((await browser.findElement(By.id('profile')).getText()).includes('AITOR ARISTI MARTIN'));
 await browser.get(base+'/equipo/17747?persona=17301');
 await browser.wait(until.elementLocated(By.css('#profile[open] tbody tr')),20000);
 assert((await browser.findElement(By.id('profile')).getText()).includes('SERGIO DE LA VILLA MERINO'));
 for(const team of [8869,165]){
  await browser.get(base+'/equipo/'+team+'?vista=staff');
  await browser.wait(until.elementLocated(By.css('#staff [data-staff-person]')),20000);
  await browser.findElement(By.css('#staff [data-staff-person]')).click();
  await browser.wait(until.elementLocated(By.css('#profile[open] .staff-context')),20000);
  assert((await browser.findElement(By.id('profile')).getText()).includes('Trayectoria vinculada a esta ficha'));
 }
 assert.deepEqual((await browser.manage().logs().get('browser')).filter(x=>x.level.name==='SEVERE'),[]);
 console.log(JSON.stringify({equipo:17747,tecnico:124519,...counted,enlaceProfundo:true,delegado:true,jugadorIntacto:true,otrosEquipos:[8869,165],erroresConsola:0}));
}finally{await browser.quit();}
