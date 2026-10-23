import test from 'node:test';
import assert from 'node:assert/strict';
import {temporadaActual,elegible,slugInforme,coberturaSql} from './informes-politica.mjs';
const septiembre = new Date(2026,8,27);
test('actual en curso, pasado completo, nunca futuro ni anterior a 2021',()=>{
 assert.equal(temporadaActual(septiembre),'2026-27');
 assert.equal(temporadaActual(new Date(2026,0,1)),'2025-26');
 assert.equal(elegible('2026-27','parcial_privada',septiembre),true);
 assert.equal(elegible('2025-26','parcial_privada',septiembre),false);
 assert.equal(elegible('2025-26','completa',septiembre),true);
 assert.equal(elegible('2020-21','completa',septiembre),false);
 assert.equal(elegible('2027-28','completa',septiembre),false);
 assert.match(coberturaSql('ce',septiembre),/2026-27/);
 assert.match(coberturaSql('ce',septiembre,'g'),/phase_group_id=g.id/);
 assert.doesNotMatch(coberturaSql('ce',septiembre,'g'),/ce.visibility_state/);
});
test('homónimos no pisan otro informe',()=>{
 assert.notEqual(slugInforme('Equipo A','juvenil','2026-27',1),slugInforme('Equipo A','juvenil','2026-27',2));
 assert.match(slugInforme('C.D. Ávila','juvenil','2026-27',1),/^c-d-avila-/);
});
