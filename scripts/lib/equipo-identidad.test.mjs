import test from 'node:test';
import assert from 'node:assert/strict';
import {letraEquipo,mismoEquipoHistorico} from './equipo-identidad.mjs';

test('comillas y espacios no separan a Unionistas C entre temporadas',()=>{
 const club='Unionistas de Salamanca C.F.';
 const actual={club_id:83,club,categoria:'juvenil',equipo:'Unionistas de Salamanca C.F. " C "',codigo_externo:'16257'};
 const anterior={club_id:83,club,categoria:'juvenil',equipo:'Unionistas de Salamanca C.F. "C"',codigo_externo:'16257'};
 assert.equal(letraEquipo(actual.equipo,club),'C');
 assert(mismoEquipoHistorico(actual,anterior));
 assert(mismoEquipoHistorico(actual,{...anterior,codigo_externo:'otro'}));
 assert(!mismoEquipoHistorico(actual,{...anterior,equipo:'Unionistas de Salamanca C.F. "B"',codigo_externo:'15219'}));
 assert(!mismoEquipoHistorico(actual,{...anterior,categoria:'cadete'}));
});

test('el equipo sin letra es A solo si coincide con el nombre completo del club',()=>{
 assert.equal(letraEquipo('Unionistas de Salamanca C.F.','Unionistas de Salamanca C.F.'),'A');
 assert.equal(letraEquipo('Otro nombre','Unionistas de Salamanca C.F.'),null);
});
