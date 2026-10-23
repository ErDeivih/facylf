import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { creaAdaptadorMyGol } from './mygol.mjs';
import { abreCola, encola, ejecutaSesion } from '../motor.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n), 'utf8');

test('MyGol: torneos → detalle + partidos por POST JSON; un 0-0 sin jugar no es un resultado', async () => {
  const ad = creaAdaptadorMyGol({ organizaciones: [['futbol7amistad', 'Santa Cruz de Tenerife']] });
  const db = abreCola(':memory:');
  for (const s of ad.semillas()) encola(db, ad.nombre, s);
  const partidos = JSON.parse(F('mygol-partidos.json'));
  const torneoConPartidos = String(partidos[0].idTournament);
  const cuerpos = [];
  const pedir = async (u, { cuerpo } = {}) => {
    if (cuerpo) cuerpos.push(JSON.parse(cuerpo));
    if (u.endsWith('/api/tournaments')) return { estado: 200, bruto: Buffer.from(F('mygol-torneos.json').replace(/"id": 204}/, `"id": ${torneoConPartidos}}`)) };
    if (u.includes('/api/tournaments/')) return { estado: 200, bruto: Buffer.from(JSON.stringify({ id: 1, name: 'x', teams: [], stages: [], groups: [] })) };
    return { estado: 200, bruto: Buffer.from(F('mygol-partidos.json')) };
  };
  const c = await ejecutaSesion({ db, adaptador: ad, max: 50, pedir, esperar: async () => {}, log: () => {} });
  assert.equal(c.fallidas, 0);
  assert.ok(cuerpos.every((b) => b.idTournament && b.startTime && b.endTime));
  const filas = db.prepare(`select datos from registros where tipo='partido'`).all().map((r) => JSON.parse(r.datos));
  assert.ok(filas.length > 0);
  assert.ok(filas.every((p) => String(p.torneo.id) === torneoConPartidos));         // sólo los de su torneo
  for (const p of filas.filter((x) => !x.jugado)) { assert.equal(p.goles_local, null); assert.equal(p.goles_visitante, null); }
});
