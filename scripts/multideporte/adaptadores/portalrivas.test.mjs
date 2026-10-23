import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import adaptador, { codigoDeCategoria, fasesDe, paginasDeCategoria, partidosDelCalendario, temporadasDe } from './portalrivas.mjs';
import { abreCola, encola, ejecutaSesion } from '../motor.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n), 'utf8');

test('portalrivas: categoría, temporadas y fases', () => {
  const c = F('portalrivas-categoria.html');
  assert.equal(codigoDeCategoria(c), '1F7');
  assert.equal(temporadasDe(c)[0], '2025/2026');
  assert.equal(temporadasDe(c).at(-1), '2009/2010');
  assert.ok(paginasDeCategoria(c).includes('futbol7-veteranos-primera-rivas.php'));
  assert.deepEqual(fasesDe(F('portalrivas-fases.html')), ['1F7', '1F7-GA', '1F7-GB']);
});

test('portalrivas: calendario con ids, marcador y descanso (sin 0-0 inventado)', () => {
  const ps = partidosDelCalendario(F('portalrivas-calendario.html'));
  assert.equal(ps.length, 24);
  assert.deepEqual(ps[0], { jornada: 1, id_partido: '23094', local: { id: '1110', nombre: 'MOKAI BEACH CLUB' },
    visitante: { id: '25', nombre: 'EL RINCON DEL ZOCO - JANTERS FC' }, goles_local: 1, goles_visitante: 9, jugado: true,
    fecha: '2024-09-14', hora: null, campo: 'CAMPO DE FUTBOL 7 - D - SUR C.TELEG.' });
  const d = ps.find((p) => p.descanso);
  assert.equal(d.goles_local, null);
  assert.equal(ps.find((p) => p.jornada === 2 && p.hora).hora, '16:00');
});

test('portalrivas: categoría → fases (POST) → calendarios (POST), cada uno con su clave', async () => {
  const db = abreCola(':memory:');
  for (const s of adaptador.semillas()) encola(db, 'portalrivas', s);
  const web = (u) => (u.includes('otras-fases') ? F('portalrivas-fases.html') : u.includes('calendario-js') ? F('portalrivas-calendario.html') : F('portalrivas-categoria.html'));
  const cuerpos = [];
  const c = await ejecutaSesion({ db, adaptador, max: 60, pedir: async (u, o) => { if (o?.cuerpo) cuerpos.push(o.cuerpo); return { estado: 200, bruto: Buffer.from(web(u)) }; },
    esperar: async () => {}, log: () => {} });
  assert.equal(c.fallidas, 0);
  assert.equal(db.prepare(`select count(*) n from paginas where tipo='fases'`).get().n, 17);   // una por temporada
  assert.ok(cuerpos.some((b) => b.includes('queryString=2025%2F2026') && b.includes('queryString2=1F7')));
  assert.ok(db.prepare(`select count(*) n from paginas where tipo='calendario'`).get().n >= 3);
});
