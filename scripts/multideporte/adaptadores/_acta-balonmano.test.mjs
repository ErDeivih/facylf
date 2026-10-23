import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { leeActaBalonmano, textosDelPdf } from './_acta-balonmano.mjs';
import { creaAdaptadorIsquad } from './_isquad-resultados.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n));

test('acta de balonmano: equipos, marcador, jugadores con goles y exclusiones; la suma cuadra con el marcador', () => {
  const a = leeActaBalonmano(F('isquad-balonmano-acta.pdf'));
  assert.equal(a.temporada, '2026/2027');
  assert.equal(a.jornada, 3);
  assert.equal(a.fecha, '2026-08-29'); assert.equal(a.hora, '10:30');
  assert.equal(a.pabellon, 'PAVILLÓN LALÍN ARENA');
  assert.equal(a.menores, true);                         // juvenil: se lee igual, marcado
  assert.deepEqual([a.local.nombre, a.local.goles, a.visitante.nombre, a.visitante.goles], ['EMBUTIDOS LALINENSE', 27, 'BM ABEGONDO ANOVAR', 18]);
  assert.equal(a.local.jugadores.length, 16); assert.equal(a.visitante.jugadores.length, 14);
  assert.equal(a.cuadra, true);
  assert.deepEqual(a.local.jugadores[2], { dorsal: 7, cupo_adicional: false, nombre: 'EDUARD IGLESIAS PEREZ', goles: 2,
    amonestacion: null, exclusiones: ['27:21'], descalificacion: null, descalificacion_informe: null });
  assert.equal(a.visitante.jugadores.find((j) => j.dorsal === 6).cupo_adicional, true);
  assert.deepEqual(a.local.tecnicos.map((t) => t.rol), ['ENTRENADOR', 'OFICIAL']);
  assert.equal(a.arbitros.length, 2);
});

test('acta vacía (amistoso sin alineaciones): se lee sin inventar jugadores', () => {
  const a = leeActaBalonmano(F('isquad-balonmano-acta-vacia.pdf'));
  assert.equal(a.local.jugadores.length, 0);
  assert.equal(a.visitante.jugadores.length, 0);
  assert.ok(textosDelPdf(F('isquad-balonmano-acta-vacia.pdf')).some((t) => /BALONMANO/.test(t.t)));
});

test('el adaptador de balonmano guarda el acta como registro (desde los bytes, no desde el texto)', () => {
  const ad = creaAdaptadorIsquad({ deporte: 'balonmano', territoriales: [], actas: true });
  const r = ad.tipos.acta.interpreta('basura utf8', { contexto: { id_partido: '123' }, bruto: F('isquad-balonmano-acta.pdf') });
  assert.equal(r.registros[0].tipo, 'acta');
  assert.equal(r.registros[0].datos.local.goles, 27);
  const v = creaAdaptadorIsquad({ deporte: 'voleibol', territoriales: [] });
  assert.deepEqual(v.tipos.acta.interpreta('', { contexto: {}, bruto: F('isquad-balonmano-acta.pdf') }), {});
});
