import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import adaptador, { anioInicio, fechaIso, jornadasDe, ligasEnlazadas, partidosDeJornada, provinciasEnlazadas } from './mytorneo.mjs';
import { abreCola, encola, ejecutaSesion } from '../motor.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n), 'utf8');

test('mytorneo: fechas de la temporada y enlaces', () => {
  assert.equal(anioInicio('caceres/veteranos/liga-futbol-7-2026-2027-grupo-1'), 2026);
  assert.equal(fechaIso('Vie 25 Sep', 2026), '2026-09-25');
  assert.equal(fechaIso('Dom 14 Feb', 2026), '2027-02-14');
  assert.equal(fechaIso('Dom 14 Feb', null), null);           // sin temporada no se inventa el año
  assert.deepEqual(ligasEnlazadas(F('mytorneo-portada.html')).sort(),
    ['caceres/veteranos/liga-futbol-7-2026-2027-grupo-1', 'caceres/veteranos/liga-futbol-7-2026-2027-grupo-2']);
  assert.ok(provinciasEnlazadas(F('mytorneo-portada.html')).includes('torneos-ligas-en-caceres'));
  assert.deepEqual(jornadasDe(F('mytorneo-jornada.html')), [1, 2, 3]);
});

test('mytorneo: jornada con horarios y resultados cruzados', () => {
  const ps = partidosDeJornada(F('mytorneo-jornada.html'), 2026);
  assert.equal(ps.length, 5);
  assert.deepEqual(ps[0], { id_partido: '8792', local: { id: '1667', nombre: 'CD Nuevo Cáceres - Fricáceres' },
    visitante: { id: '1670', nombre: 'Volapié Cáceres' }, fecha: '2026-09-25', fecha_texto: 'Vie 25 Sep', hora: '20:30',
    campo: 'NuevoCC Fútbol7', goles_local: 3, goles_visitante: 3, jugado: true });
  assert.equal(ps[1].fecha_texto, 'Sáb 26 Sep');
});

test('mytorneo: de la jornada 1 (índice) a las demás jornadas', async () => {
  const db = abreCola(':memory:');
  encola(db, 'mytorneo', { tipo: 'liga', url: 'https://www.mytorneo.com/caceres/veteranos/liga-futbol-7-2026-2027-grupo-1/jornada-1.html',
    contexto: { liga: 'caceres/veteranos/liga-futbol-7-2026-2027-grupo-1' } });
  const c = await ejecutaSesion({ db, adaptador, pedir: async () => ({ estado: 200, bruto: Buffer.from(F('mytorneo-jornada.html')) }),
    esperar: async () => {}, log: () => {} });
  assert.equal(c.fallidas, 0);
  assert.equal(db.prepare(`select count(*) n from paginas where tipo='jornada'`).get().n, 2);   // jornadas 2 y 3
  assert.equal(db.prepare(`select count(*) n from registros where tipo='partido'`).get().n, 5);
  const d = JSON.parse(db.prepare(`select datos from registros where tipo='liga'`).get().datos);
  assert.equal(d.jornadas, 3);
});
