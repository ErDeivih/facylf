import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Builder,By,until} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const browser=await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--window-size=1440,1000','--disable-gpu')).build();
try{
 await browser.get('http://127.0.0.1:4180/equipo/17747?texto=unionistas&persona=17301');
 await browser.wait(until.elementLocated(By.css('#profile[open] tbody tr')),20000);
 const header=await browser.findElement(By.css('#profile thead')).getText();
 const body=await browser.findElement(By.id('profile')).getText();
 assert(header.includes('Minutos jugados / posibles'));
 assert(!header.includes('Puesto min.'));
 assert(!header.includes('ritmo'));
 assert(!body.includes('tasa no calculable'));
 const check=await browser.executeScript(`const d=JSON.parse(document.querySelector('#report-data').textContent).datos;
  const p=d.plantilla.find(x=>x.nombre.includes('VICENTE PÉREZ, MARCOS'));
  const cards=d.disciplina_dashboard.find(x=>String(x.person_id)===String(p?.person_id)&&String(x.team_entry_id)==='17747');
  return {name:p?.nombre,amarillas:Number(cards?.amarillas),dobles:Number(cards?.dobles_amarillas),rojas:Number(cards?.rojas)};`);
 const historicalTeams=await browser.executeScript(`return [...new Set(JSON.parse(document.querySelector('#report-data').textContent).datos.historial.filter(x=>String(x.person_id)==='17301').map(x=>String(x.team_entry)))];`);
 assert(check.name,'No se encuentra el jugador con doble amarilla');
 assert(check.dobles>=1&&check.amarillas>=2&&check.rojas>=1,'La segunda amarilla debe figurar también en las amarillas');
 mkdirSync('tmp/informes-vivo',{recursive:true});
 writeFileSync('tmp/informes-vivo/sergio-ficha-revisada.png',await browser.takeScreenshot(),'base64');
 assert.deepEqual((await browser.manage().logs().get('browser')).filter(x=>x.level.name==='SEVERE'),[]);
 console.log(JSON.stringify({perfil:17301,encabezadoClaro:true,ritmoOculto:true,tarjetasDobles:check,equiposHistoricos:historicalTeams,erroresConsola:0}));
}finally{await browser.quit();}
