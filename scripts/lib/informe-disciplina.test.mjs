import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeDisciplina } from './informe-disciplina.mjs';
const fila=(match_id,amarillas,extras={})=>({person_id:1,temporada:'2025-26',team_entry_id:8,match_id,jornada:match_id,amarillas,rojas:0,consta_en_acta:true,alineacion_disponible:true,...extras});
test('conserva una a cuatro amarillas sin exigir expulsión o cinco',()=>{
 for(let n=1;n<=4;n++) assert.equal(resumeDisciplina([fila(1,n)]).get('1:2025-26:8').amarillas,n);
});
test('separa equipos y temporadas y no duplica un partido por apariciones repetidas',()=>{
 const r=resumeDisciplina([fila(1,2),fila(1,2),fila(2,1,{team_entry_id:9}),fila(3,3,{temporada:'2024-25'})]);
 assert.equal(r.get('1:2025-26:8').amarillas,2); assert.equal(r.size,3);
});
test('detecta cruce de umbral con dos amarillas, sin perder rojas',()=>{
 const r=resumeDisciplina([fila(1,4),fila(2,2,{rojas:1}),fila(3,0,{consta_en_acta:false})]).get('1:2025-26:8');
 assert.equal(r.amarillas,6); assert.equal(r.quintas.length,1); assert.equal(r.rojas[0].sinAparicion,1);
 assert.equal(r.quintas[0].siguiente,'sin_aparicion');
});
test('una alineación ausente no se cuenta como ausencia del jugador',()=>{
 const r=resumeDisciplina([fila(1,0,{rojas:1}),fila(2,0,{consta_en_acta:false,alineacion_disponible:false})]).get('1:2025-26:8');
 assert.equal(r.rojas[0].sinAparicion,0);
 assert.equal(r.rojas[0].sinDatos,1);
});
