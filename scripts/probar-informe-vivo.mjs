import assert from 'node:assert/strict';
import {readdirSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Builder,By,until} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
const base='http://127.0.0.1:4180';
const argument=process.argv.indexOf('--equipo'),equipo=argument>=0?Number(process.argv[argument+1]):8869;
function files(){return ['informes','informes/dashboard','output/pdf'].flatMap(dir=>readdirSync(dir).map(n=>join(dir,n)).filter(p=>statSync(p).isFile()).map(p=>[p,statSync(p).mtimeMs,statSync(p).size])).sort();}
const before=files();
const soloPdf=process.argv.includes('--solo-pdf');
const detalle=process.argv.includes('--detalle');
mkdirSync('tmp/informes-vivo',{recursive:true});
if(!soloPdf){
const first=await fetch(base+'/equipo/'+equipo);assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');
const html=await first.text();const snapshot=JSON.parse(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
assert(snapshot.datos.historial.some(x=>x.temporada==='2025-26'));
const driver=await new Builder().forBrowser('chrome').setChromeOptions(new chrome.Options().addArguments('--headless=new','--window-size=1440,1000','--disable-gpu')).build();
mkdirSync('tmp/informes-vivo',{recursive:true});
try{
 await driver.get(base+'/equipo/'+equipo);await driver.wait(until.elementLocated(By.css('#overview .kpi')),20000);
 const second=await driver.executeScript('return JSON.parse(document.querySelector("#report-data").textContent).generadoEn');assert.notEqual(second,snapshot.generadoEn);
 assert.equal(await driver.findElement(By.id('print')).getText(),'Descargar PDF');
 await driver.findElement(By.css('[data-tab=history]')).click();assert.match(await driver.findElement(By.id('history')).getText(),/2025-26/);
 writeFileSync('tmp/informes-vivo/dashboard.png',await driver.takeScreenshot(),'base64');
 assert.deepEqual((await driver.manage().logs().get('browser')).filter(x=>x.level.name==='SEVERE'),[]);
}finally{await driver.quit();}
}
const pdf=await fetch(base+'/equipo/'+equipo+'/pdf?temporada=2025-26'+(detalle?'&alcance=detalle':''));assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-disposition'),new RegExp('attachment; filename="[a-z0-9_-]+_2026-27_'+(detalle?'detalle':'resumen')+'_consulta-\\d{4}-\\d{2}-\\d{2}\\.pdf"'));
const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'%PDF');writeFileSync('tmp/informes-vivo/prueba'+(detalle?'-detalle':'')+'.pdf',bytes);
assert.deepEqual(files(),before,'Consultar y descargar no debe guardar informes ni modificar el catálogo');
console.log(JSON.stringify({equipo,consultasNuevas:!soloPdf,historico:!soloPdf,pdfBytes:bytes.length,nombre:pdf.headers.get('content-disposition'),archivosDeInformesSinCambios:true}));
