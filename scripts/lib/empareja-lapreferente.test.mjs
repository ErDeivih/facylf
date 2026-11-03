import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emparejaEquipos, emparejaGrupo, parecido, palabras } from './empareja-lapreferente.mjs';

// Medido el 25/10/2026: 1.ª Regional de Aficionados de CyL, grupo A, 2025-26 (La Preferente frente a la federación).
const LP = ['Calasanz de Soria', 'San José de Soria', 'Turégano C.F.', 'C.F. Briviesca', 'Intern. Vista Alegre', 'Burgos International',
  'Cultural Cebrereña', 'C.D. Villamuriel', 'Villarcayo Nela C.F.', 'C.D. Coca', 'C.D. Belorado', 'Golmayo-Camaretas', 'C.D. Venta de Baños',
  'Sporting Uxama', 'Capiscol C.F.', 'El Espinar-S. Rafael'];
const FED = ['C.D. Calasanz de Soria', 'C.D. San José', 'Turégano C.F.', 'C.F. Briviesca Morato Group', 'C.D. Internacional Vista Alegre',
  'Burgos International Football', 'C. y D. Cebrereña', 'C.D. Villamuriel', 'Villarcayo Nela C.F.', 'C.D. Belorado', 'C.D. Coca',
  'C.D. Golmayo-Camaretas', 'C.F. Venta de Baños', 'Sporting Club Uxama', 'Capiscol C.F.', 'C.D. El Espinar-San Rafael'];

test('palabras: sin tildes ni forma jurídica', () => {
  assert.deepEqual(palabras('C. y D. Cebrereña'), ['cebrerena']);
  assert.deepEqual(palabras('Intern. Vista Alegre'), ['intern', 'vista', 'alegre']);
});

test('los 16 equipos del grupo se emparejan bien, uno a uno', () => {
  const m = emparejaEquipos(LP, FED);
  assert.equal(m.size, 16);
  assert.equal(m.get('San José de Soria').federacion, 'C.D. San José');
  assert.equal(m.get('Calasanz de Soria').federacion, 'C.D. Calasanz de Soria');
  assert.equal(m.get('Intern. Vista Alegre').federacion, 'C.D. Internacional Vista Alegre');
  assert.equal(m.get('Cultural Cebrereña').federacion, 'C. y D. Cebrereña');
  assert.equal(m.get('El Espinar-S. Rafael').federacion, 'C.D. El Espinar-San Rafael');
  assert.equal(m.get('C.F. Briviesca').federacion, 'C.F. Briviesca Morato Group');
});

test('un filial no se confunde con el primer equipo', () => {
  assert.ok(parecido('Burgos C.F. Promesas', 'Burgos C.F. S.A.D.') < parecido('Burgos C.F. Promesas', 'Burgos C.F. Promesas'));
  assert.ok(parecido('C.D. Parquesol "B"', 'C.D. Parquesol') <= 0.5);
});

test('el grupo se da por emparejado sólo si los marcadores coinciden', () => {
  // Jornada 30 de las dos fuentes (8 de 8 iguales) más dos partidos inventados para que haya ≥ 10 comparables.
  const lp = [['Villarcayo Nela C.F.', 1, 1, 'C.D. Coca'], ['Capiscol C.F.', 1, 2, 'C.D. Venta de Baños'], ['San José de Soria', 3, 2, 'Burgos International'],
    ['Intern. Vista Alegre', 3, 2, 'Calasanz de Soria'], ['C.D. Villamuriel', 1, 3, 'Turégano C.F.'], ['El Espinar-S. Rafael', 0, 2, 'Cultural Cebrereña'],
    ['C.D. Belorado', 2, 1, 'Golmayo-Camaretas'], ['Sporting Uxama', 2, 1, 'C.F. Briviesca'], ['C.D. Coca', 2, 0, 'Capiscol C.F.'], ['Turégano C.F.', 4, 0, 'Sporting Uxama']]
    .map(([local, gl, gv, visitante]) => ({ local, visitante, gl, gv }));
  const fed = [['Villarcayo Nela C.F.', 1, 1, 'C.D. Coca'], ['Capiscol C.F.', 1, 2, 'C.F. Venta de Baños'], ['C.D. San José', 3, 2, 'Burgos International Football'],
    ['C.D. Internacional Vista Alegre', 3, 2, 'C.D. Calasanz de Soria'], ['C.D. Villamuriel', 1, 3, 'Turégano C.F.'], ['C.D. El Espinar-San Rafael', 0, 2, 'C. y D. Cebrereña'],
    ['C.D. Belorado', 2, 1, 'C.D. Golmayo-Camaretas'], ['Sporting Club Uxama', 2, 1, 'C.F. Briviesca Morato Group'], ['C.D. Coca', 2, 0, 'Capiscol C.F.'], ['Turégano C.F.', 4, 0, 'Sporting Club Uxama']]
    .map(([local, gl, gv, visitante]) => ({ local, visitante, gl, gv }));
  const r = emparejaGrupo(lp, fed);
  assert.equal(r.emparejado, true);
  assert.equal(r.comparables, 10); assert.equal(r.coinciden, 10);
  // Si los marcadores no cuadran (otro grupo con nombres parecidos), no se empareja.
  const otro = fed.map((p, i) => ({ ...p, gl: (p.gl + 1 + i) % 5 }));
  assert.equal(emparejaGrupo(lp, otro).emparejado, false);
});
