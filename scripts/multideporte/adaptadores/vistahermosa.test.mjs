import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import adaptador, { competicionesDelMenu, partidosDelGrupo, temporadaDe } from './vistahermosa.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n), 'utf8');

test('vistahermosa: menú con todas las competiciones y su temporada', () => {
  const cs = competicionesDelMenu(F('vistahermosa-grupo.html'));
  assert.equal(cs.length, 127);
  assert.deepEqual(cs[0], { idcomp: 247, campeonato: 'LIGA 2026-2027', nombre: 'PRIMERA' });
  assert.equal(temporadaDe('LIGA 2018-2019'), '2018-2019');
  assert.equal(temporadaDe('TORNEO JULIO 2019'), '2019');
  const r = adaptador.tipos.menu.interpreta(F('vistahermosa-grupo.html'));
  assert.equal(r.enlaces.length, 127);
});

test('vistahermosa: jornadas con marcador; «---» es sin jugar (no 0-0)', () => {
  const ps = partidosDelGrupo(F('vistahermosa-grupo.html'));
  assert.equal(ps.length, 6);
  assert.deepEqual(ps[0], { jornada: 1, local: { nombre: 'IRA IRA IRA F.C.' }, visitante: { nombre: 'HERMANOS SQUAD' }, goles_local: 2, goles_visitante: 1, jugado: true });
  const sinJugar = partidosDelGrupo('<th style="x" colspan="2" >Jornada 1</th></tr></thead><tr><td> A </td><td> B</td><td> --- </td></tr></table>');
  assert.deepEqual(sinJugar[0], { jornada: 1, local: { nombre: 'A' }, visitante: { nombre: 'B' }, goles_local: null, goles_visitante: null, jugado: false });
});
