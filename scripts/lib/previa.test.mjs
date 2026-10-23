import test from 'node:test';
import assert from 'node:assert/strict';
import { componPrevia } from './previa.mjs';

// Grupo de 3 equipos (1, 2, 3). Juvenil fútbol 11: 90 minutos, tramos de 15.
const ctx = (id, equipo) => ({ id, phase_group_id: 7, equipo, club_id: id, categoria: 'juvenil', modalidad: 'futbol11', temporada: '2026-27', competicion: 'Primera', grupo: 'A', federacion: 'castilla-leon' });
const m = (id, jornada, local, visitante, gl, gv, apL = 11, apV = 11) => ({ id, jornada, fecha: `2026-10-0${jornada}`, local, visitante, goles_local: gl, goles_visitante: gv, apariciones_local: apL, apariciones_visitante: apV });
const filas = {
  contexto: [ctx(1, 'UNO'), ctx(2, 'DOS')],
  nombres: [{ id: 1, equipo: 'UNO' }, { id: 2, equipo: 'DOS' }, { id: 3, equipo: 'TRES' }],
  // En el 11 el acta sólo trae la alineación del local (TRES): UNO, visitante, no la tiene.
  partidos: [m(10, 1, 1, 2, 2, 1), m(11, 2, 3, 1, 0, 0, 11, 0), m(12, 3, 2, 3, 3, 0, 0, 0), m(13, 4, 2, 1, null, null)],
  oficial: [],
  goles: [
    // Partido 10 (UNO 2-1 DOS): uno de UNO en el 10', uno de UNO sin minuto, uno de DOS en el 80'.
    { match_id: 10, minute_base: 10, lado_beneficiado: 'local', subtipo: 'normal', sujeto_tipo: 'jugador', person_id: 101, equipo_autor: 1, local: 1, visitante: 2, nombre: 'PEREZ, ANA' },
    { match_id: 10, minute_base: null, lado_beneficiado: 'local', subtipo: 'normal', sujeto_tipo: 'jugador', person_id: 101, equipo_autor: 1, local: 1, visitante: 2, nombre: 'PEREZ, ANA' },
    { match_id: 10, minute_base: 80, lado_beneficiado: 'visitante', subtipo: 'normal', sujeto_tipo: 'jugador', person_id: 201, equipo_autor: 2, local: 1, visitante: 2, nombre: 'GIL, LUIS' },
    // Partido 12 (DOS 3-0 TRES): sólo dos goles con acta, uno en propia puerta de un jugador de TRES.
    { match_id: 12, minute_base: 30, lado_beneficiado: 'local', subtipo: 'normal', sujeto_tipo: 'jugador', person_id: 201, equipo_autor: 2, local: 2, visitante: 3, nombre: 'GIL, LUIS' },
    { match_id: 12, minute_base: 44, lado_beneficiado: 'local', subtipo: 'propia_puerta', sujeto_tipo: 'jugador', person_id: 301, equipo_autor: 3, local: 2, visitante: 3, nombre: 'RIVAL, X' },
  ],
  tarjetas: [{ equipo: 1, event_type: 'tarjeta_amarilla', subtipo: null, n: 3 }, { equipo: 1, event_type: 'tarjeta_roja', subtipo: 'doble_amarilla', n: 1 }],
  once: [{ equipo: 1, person_id: 101, nombre: 'PEREZ, ANA', titularidades: 2, convocatorias: 2 }],
  previos: [],
};

test('clasificación por resultados: sólo partidos con marcador, 3-1-0', () => {
  const d = componPrevia(filas, 1, 2);
  // UNO: gana a DOS y empata con TRES (4). DOS: pierde con UNO y gana a TRES (3). TRES: 1. El DOS–UNO pendiente no cuenta.
  assert.deepEqual(d.clasificacion.map((x) => [x.equipo, x.pts, x.pj]), [['UNO', 4, 2], ['DOS', 3, 2], ['TRES', 1, 2]]);
  assert.equal(d.a.total.pj, 2);
  assert.equal(d.a.posicion.pos, 1);
});

test('forma: cronológica, con rival y resultado desde el punto de vista de cada equipo', () => {
  const d = componPrevia(filas, 1, 2);
  assert.deepEqual(d.a.forma.map((x) => `${x.r}${x.gf}-${x.gc}`), ['V2-1', 'E0-0']);
  assert.deepEqual(d.b.forma.map((x) => `${x.r}${x.gf}-${x.gc}`), ['D1-2', 'V3-0']);
});

test('tramos: un gol sin minuto se cuenta aparte, nunca en el primer tramo', () => {
  const d = componPrevia(filas, 1, 2);
  assert.equal(d.a.sinMinuto, 1);
  assert.equal(d.a.tramos[0].favor, 1, '10\' → tramo 0-15');
  assert.equal(d.a.tramos[5].contra, 1, '80\' → tramo 75-90');
});

test('si los goles con acta no cuadran con los marcadores, se sabe', () => {
  const d = componPrevia(filas, 1, 2);
  assert.equal(d.a.cuadranGoles, true, 'UNO: 3 goles en marcador (2-1 y 0-0), 3 con acta');
  assert.equal(d.b.cuadranGoles, false, 'DOS: 6 en marcador, 5 con acta');
});

test('goleadores: la propia puerta no es mérito de nadie del equipo beneficiado', () => {
  const d = componPrevia(filas, 1, 2);
  assert.deepEqual(d.b.goleadores.map((g) => [g.nombre, g.goles]), [['GIL, LUIS', 2]]);
  assert.deepEqual(d.a.goleadores.map((g) => [g.nombre, g.goles]), [['PEREZ, ANA', 2]]);
});

test('disciplina: la doble amarilla suma a amarillas y a rojas', () => {
  const d = componPrevia(filas, 1, 2);
  assert.equal(d.a.amarillas, 4);
  assert.equal(d.a.rojas, 1);
  assert.equal(d.b.amarillas, 0);
});

test('próximo enfrentamiento: el pendiente entre los dos, con su local', () => {
  const d = componPrevia(filas, 1, 2);
  assert.equal(d.proximo.jornada, 4);
  assert.equal(d.proximo.local, 2);
  assert.equal(d.entreEllos.length, 1);
});

test('el once cuenta los partidos donde ESTE equipo tiene alineación, no el rival', () => {
  const d = componPrevia(filas, 1, 2);
  assert.equal(d.a.conAlineacion, 1, 'en el 3-1 (TRES–UNO) sólo hay alineación de TRES');
  assert.equal(d.b.conAlineacion, 1, 'DOS–TRES no tiene alineaciones');
});
