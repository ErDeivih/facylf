import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { bloquePorId, calendario, fichaPartido } from './_lapreferente-ficha.mjs';
const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

test('bloquePorId: corta en el cierre equilibrado', () => {
  const h = '<div id="a"><div>x</div><div>y</div></div><div>fuera</div>';
  assert.equal(bloquePorId(h, 'a', 'div'), '<div id="a"><div>x</div><div>y</div></div>');
  assert.equal(bloquePorId(h, 'nada'), null);
});

test('calendario: todas las jornadas de una página, sin repetir la jornada en curso', () => {
  const c = calendario(fx('lapreferente-calendario-sintetico.html'), 22615);
  assert.deepEqual(c.map((j) => j.jornada), [1, 2]);
  assert.equal(c[0].fecha, '2025-09-13');
  assert.equal(c[0].partidos.length, 2);
  const [p, q] = c[0].partidos;
  assert.equal(p.local.nombre, 'C.D. Belorado'); assert.equal(p.goles_local, 1); assert.equal(p.goles_visitante, 0);
  assert.equal(p.partido_id, '4071790'); assert.equal(p.ficha_disponible, true);
  assert.match(p.ficha_url, /^P4071790C22615\/2025-2026\//);
  assert.equal(q.jugado, false); assert.equal(q.marcador_texto, 'Aplaz.'); assert.equal(q.ficha_disponible, false); assert.equal(q.visitante.nombre, 'C.D. Venta de Baños');
  assert.equal(c[1].partidos.length, 1);
});

test('ficha: fecha, estadio, árbitro, alineaciones, cambios, goles y tarjetas', () => {
  const f = fichaPartido(fx('lapreferente-ficha-sintetica.html'));
  assert.equal(f.fecha, '2026-05-09'); assert.equal(f.hora, '17:30');
  assert.deepEqual(f.estadio, { id: '3159', nombre: 'Municipal El Soto (Villarcayo - Burgos)' });
  assert.deepEqual(f.arbitro, { id: '8447', nombre: 'Rivas Palma, Alejandro', delegacion: 'Sevilla' });
  const [loc, vis] = f.equipos;
  assert.equal(loc.id, '18694'); assert.equal(loc.nombre, 'VILLARCAYO NELA C.F.');
  assert.deepEqual(loc.titulares.map((p) => p.dorsal), [1, 2, 8]);
  assert.equal(loc.titulares[0].id, '702016'); assert.equal(loc.titulares[0].nombre, 'Aketza Zarate Santamaria');
  assert.equal(loc.cambios.length, 1);
  assert.equal(loc.cambios[0].minuto, 81); assert.equal(loc.cambios[0].sale.alias, 'Lander'); assert.equal(loc.cambios[0].entra.id, '579981');
  assert.equal(loc.suplentes.length, 1);
  assert.equal(loc.tecnicos[0].rol, 'Entrenador'); assert.equal(loc.tecnicos[0].codigo, 'E');
  assert.equal(vis.nombre, 'C.D. COCA'); assert.equal(vis.titulares.length, 1);
  assert.deepEqual(f.goles.map((g) => [g.id, g.minuto, g.parcial.join('-')]), [['197927', 12, '1-0'], ['641931', 95, '1-1']]);
  assert.deepEqual(f.marcador_por_goles, [1, 1]);
  assert.deepEqual(f.tarjetas.map((t) => [t.alias, t.tipo, t.minuto, t.dorsal ?? t.codigo]),
    [['Rodrigo', 'amarilla', 43, 10], ['Pablo Martín', 'roja', 46, 9], ['Jose Maria Valbuena', 'amarilla', 75, 'E']]);
});
