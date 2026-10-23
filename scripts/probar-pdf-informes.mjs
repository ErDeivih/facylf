#!/usr/bin/env node
// Comprueba legibilidad semántica y paginación de ambos modos del informe vivo.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';

const base='http://127.0.0.1:4180';
mkdirSync('tmp/pdfs',{recursive:true});
const result=[];
for(const scope of ['resumen','detalle']){
 const response=await fetch(`${base}/equipo/165/pdf?alcance=${scope}`);
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type')||'',/application\/pdf/);
 const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 const file=`tmp/pdfs/verificacion-${scope}.pdf`;
 writeFileSync(file,bytes);
 const info=execFileSync('pdfinfo',[file],{encoding:'utf8'});
 const pages=Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
 assert(pages>0&&pages<=(scope==='resumen'?5:30),`${scope}: ${pages} páginas`);
 const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8',maxBuffer:10*1024*1024});
 assert(text.includes('Consulta actualizada:'));
 assert(text.includes('Minutos y peso en el equipo'));
 if(scope==='resumen'){
  assert(text.includes('La plantilla íntegra está en el PDF de detalle'));
  const history=text.split('Antecedentes de los jugadores visibles')[1]?.split('Cuerpo técnico actual')[0]||'';
  assert(history.includes('2025-26'),'El resumen debe contener antecedentes reales');
  assert(!history.includes('2026-27'),'El resumen no debe repetir el curso actual como antecedente');
 }else{
  assert(text.includes('SERGIO PASCUAL DE LA FUENTE'),'El detalle debe conservar toda la plantilla');
 }
 result.push({scope,pages,bytes:bytes.length});
}
const older=await fetch(`${base}/equipo/166871/pdf?alcance=resumen`);
assert.equal(older.status,200);
const oldFile='tmp/pdfs/verificacion-historico-parcial.pdf';
writeFileSync(oldFile,Buffer.from(await older.arrayBuffer()));
const oldText=execFileSync('pdftotext',['-layout',oldFile,'-'],{encoding:'utf8',maxBuffer:10*1024*1024});
assert(oldText.includes('Estadísticas personales incompletas'));
assert(oldText.includes('1 de 26'));
console.log(JSON.stringify({pdfs:result,historicoParcialAdvertido:true}));
