import assert from 'node:assert/strict';
import {Builder,By,until} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const browser=await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--window-size=1400,900','--disable-gpu')).build();
try{
 const checked=[];
 for(const id of [127762,170922,177874,128250,167286,103021,174618,166655,10768,2537,38998,18568,20626]){
  await browser.get(`http://127.0.0.1:4180/equipo/${id}`);
  await browser.wait(until.elementLocated(By.css('#header h1')),20000);
  const state=await browser.executeScript(`const d=JSON.parse(document.querySelector('#report-data').textContent).datos;
   const c=d.cobertura[0];return {played:Number(c.partidos_equipo_con_marcador),lineups:Number(c.partidos_con_alineacion),players:d.plantilla.length};`);
  const scope=await browser.findElement(By.id('scope')).getText();
  assert.equal(scope.includes('Estadísticas personales incompletas'),state.played>state.lineups);
  await browser.findElement(By.css('[data-tab="players"]')).click();
  const players=await browser.findElement(By.id('players')).getText();
  if(!state.players)assert(players.includes('Esto no significa que no tuviera plantilla'));
  await browser.findElement(By.css('[data-tab="history"]')).click();
  if(state.players)assert((await browser.findElement(By.id('history')).getText()).includes('Actas / partidos'));
  checked.push({id,...state,warning:state.played>state.lineups});
 }
 assert.deepEqual((await browser.manage().logs().get('browser')).filter(x=>x.level.name==='SEVERE'),[]);
 console.log(JSON.stringify({checked,consoleErrors:0}));
}finally{await browser.quit();}
