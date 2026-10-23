import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { boxScore, creaAdaptadorFeb, cuerpoPostback, partidosDelCalendario } from './feb.mjs';
import { abreCola, encola, ejecutaSesion } from '../motor.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n), 'utf8');

test('calendario: partidos con jornada, equipos y fecha; sin marcador inventado', () => {
  const ps = partidosDelCalendario(F('feb-calendario.html'));
  assert.equal(ps.length, 16);
  assert.deepEqual(ps[0], { id_partido: '2522775', jornada: 1, local: { id: '1008705', nombre: 'AZULMARINO MALLORCA PALMA' },
    visitante: { id: '1008686', nombre: 'VALENCIA B.C.' }, puntos_local: null, puntos_visitante: null, jugado: false,
    fecha: '2026-10-03', hora: '18:30' });
});

test('postback: lleva el VIEWSTATE, el destino del evento y el grupo elegido', () => {
  const p = new URLSearchParams(cuerpoPostback(F('feb-calendario.html'), 'grupo', '999'));
  assert.equal(p.get('__EVENTTARGET'), '_ctl0$MainContentPlaceHolderMaster$gruposDropDownList');
  assert.equal(p.get('_ctl0:MainContentPlaceHolderMaster:gruposDropDownList'), '999');
  assert.equal(p.get('_ctl0:MainContentPlaceHolderMaster:temporadasDropDownList'), '2026');
  assert.ok(p.get('__VIEWSTATE').length > 1000);
});

test('box score: marcador, cuartos, árbitros y jugadores; en base, sin nombres', () => {
  const b = boxScore(F('feb-partido.html'));
  assert.equal(b.puntos_local, 68); assert.equal(b.puntos_visitante, 74);
  assert.equal(b.parciales.length, 4);
  assert.equal(b.jugadores_local.length, 12);
  assert.equal(b.jugadores_local.reduce((s, j) => s + j.puntos, 0), 68);
  assert.equal(b.jugadores_visitante.reduce((s, j) => s + j.puntos, 0), 74);
  const base = boxScore(F('feb-partido.html'), { sinNombres: true });
  assert.ok(base.jugadores_local.every((j) => !('nombre' in j)));
});

test('de punta a punta: un grupo abre los demás por POST y no vuelve a abrirlos', async () => {
  const ad = creaAdaptadorFeb({ temporadas: [2026], competiciones: [{ g: 57, nm: 'ligaeba', nombre: 'Liga EBA' }], ahora: () => new Date('2026-10-01T12:00:00Z') });
  const db = abreCola(':memory:');
  for (const s of ad.semillas()) encola(db, ad.nombre, s);
  // Calendario con dos grupos: el elegido y uno más
  const cal = F('feb-calendario.html').replace(/(gruposDropDownList"[\s\S]*?)<\/select>/, '$1<option value="77777">Grupo B</option></select>');
  const posts = [];
  const pedir = async (u, { cuerpo } = {}) => { if (cuerpo) posts.push(cuerpo); return { estado: 200, bruto: Buffer.from(cal) }; };
  const c = await ejecutaSesion({ db, adaptador: ad, max: 50, pedir, esperar: async () => {}, log: () => {} });
  assert.equal(c.fallidas, 0);
  assert.ok(posts.length >= 1);
  assert.ok(posts.every((b) => !b.includes('&EOF')));
  assert.equal(db.prepare(`select count(*) n from paginas where tipo='calendario'`).get().n, 2);  // el GET y un POST para el otro grupo, nada más
  assert.equal(db.prepare(`select count(*) n from registros where tipo='partido'`).get().n, 16);
});
