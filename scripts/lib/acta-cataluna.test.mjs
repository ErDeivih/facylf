/**
 * Prueba de interpretaActa (Cataluña) con la forma REAL que devuelve EXTRAE_ACTA de la FCF de hoy.
 *
 * La maqueta sale del acta 4108648 (2025-26) leída en el navegador el 22/10/2026, con los nombres y los
 * códigos sustituidos (JUGADOR N, 90000NN): se conserva la estructura, los minutos y los tipos de icono.
 * La FCF ya no tiene secciones de tarjetas ni de cambios; van como iconos en la fila de cada jugador.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpretaActa, parteTecnico } from './acta-cataluna.mjs';

let codigo = 9000000;
/** Una fila de jugador: [dorsal, n, eventos 'min:tipo,...', banderas 'C'/'P'] */
function fila(dorsal, n, eventos = '', banderas = '', titular = '1') {
  const evs = eventos ? eventos.split(',').map((e) => { const [m, tipo] = e.split(':'); return { minuto: Number(m), tipo }; }) : [];
  const nombre = `JUGADOR ${n}`;
  return {
    texto: `${dorsal} ${nombre}${banderas.includes('C') ? ' C' : ''} ${evs.map((e) => `${e.minuto}’`).join(' ')}`.trim(),
    dorsal: String(dorsal), nombre, posicion: banderas.includes('C') ? 'Capità' : null, imagenes: [], spans: [],
    minutos: evs.map((e) => `${e.minuto}’`),
    jugador: { id: String(++codigo), titular, capitan: banderas.includes('C') ? '1' : '0', portero: banderas.includes('P') ? 1 : 0 },
    eventos: evs,
  };
}
const tecnico = (texto) => ({ texto, dorsal: null, nombre: null, posicion: null, imagenes: [], spans: [], minutos: [], jugador: null, eventos: [] });
const gol = (texto, minuto, escudo) => ({ ...tecnico(texto), minutos: [`${minuto}'`], imagenes: [escudo] });

const LOCAL = 'CLUB LOCAL, U.E';
const VISITANTE = 'CLUB VISITANTE FC';
function actaDePrueba() {
  codigo = 9000000;
  return {
    titulo: `Acta: ${LOCAL} vs ${VISITANTE} | Federació Catalana de Futbol`,
    marcador: [1, 2],
    secciones: [
      { titulo: 'Àrbitres', filas: [tecnico('ARBITRE PRIMER, PERSONA')] },
      { titulo: 'Gols', filas: [
        gol(`1 - 0 JUGADOR 4 (GOL PENAL (3')) GOL PENAL (${LOCAL}) 10`, 3, LOCAL),
        gol(`1 - 1 JUGADOR 28 (GOL (20')) GOL (${VISITANTE}) 25`, 20, VISITANTE),
        gol(`1 - 2 JUGADOR 24 (GOL (57')) GOL (${VISITANTE}) 10`, 57, VISITANTE),
      ] },
      { titulo: 'Alineacions', filas: [
        fila(1, 2, '', 'CP'), fila(9, 3), fila(10, 4, '3:gol,58:sale'), fila(4, 5), fila(23, 6, '58:sale'),
        fila(25, 7, '40:amarilla,83:sale'), fila(2, 8, '72:sale'), fila(5, 9), fila(16, 10, '69:amarilla,72:sale'),
        fila(21, 11, '83:sale'), fila(11, 12, '83:sale'),
      ] },
      { titulo: 'Suplents', filas: [
        fila(13, 13, '', 'P', '0'), fila(3, 14, '72:entra', '', '0'), fila(17, 15, '58:entra', '', '0'),
        fila(6, 16, '83:entra', '', '0'), fila(14, 17, '83:entra,89:amarilla', '', '0'),
        fila(7, 18, '72:entra,84:amarilla', '', '0'), fila(24, 19, '58:entra', '', '0'), fila(20, 20, '83:entra', '', '0'),
      ] },
      { titulo: 'Equip Tècnic', filas: [tecnico('DELEGAT CAMP PERSONA A'), tecnico('ENTRENADOR PERSONA B')] },
      { titulo: 'Alineacions', filas: [
        fila(12, 21, '', 'P'), fila(8, 22, '66:sale', 'C'), fila(2, 23), fila(10, 24, '10:amarilla,57:gol,66:sale'),
        fila(7, 25, '87:sale'), fila(13, 26), fila(6, 27), fila(25, 28, '20:gol,71:amarilla'), fila(9, 29, '46:sale'),
        fila(20, 30), fila(3, 31, '35:amarilla,66:sale'),
      ] },
      { titulo: 'Suplents', filas: [
        fila(1, 32, '', 'P', '0'), fila(5, 33, '66:entra', '', '0'), fila(17, 34, '66:entra', '', '0'),
        fila(4, 35, '87:entra', '', '0'), fila(11, 36, '46:entra', '', '0'), fila(14, 37, '', '', '0'),
        fila(18, 40, '66:entra', '', '0'), fila(19, 41, '61:roja', '', '0'),
      ] },
      { titulo: 'Equip Tècnic', filas: [tecnico('ENTRENADOR PERSONA C')] },
    ],
  };
}

test('alineaciones con código de jugador, capitán y portero', () => {
  const { parseada } = interpretaActa(actaDePrueba(), [LOCAL, VISITANTE]);
  assert.equal(parseada.lineups.local.titulares.length, 11);
  assert.equal(parseada.lineups.local.suplentes.length, 8);
  assert.equal(parseada.lineups.visitante.titulares.length, 11);
  const todos = ['local', 'visitante'].flatMap((l) => [...parseada.lineups[l].titulares, ...parseada.lineups[l].suplentes]);
  assert.ok(todos.every((j) => /^900\d{4}$/.test(j.codigoJugador)), 'todos con código');
  assert.equal(new Set(todos.map((j) => j.codigoJugador)).size, todos.length, 'códigos únicos');
  assert.deepEqual(parseada.lineups.local.titulares[0], { codigoJugador: '9000001', nombre: 'JUGADOR 2', dorsal: 1, capitan: true });
  assert.equal(parseada.lineups.local.portero, 'JUGADOR 2');
  assert.equal(parseada.lineups.visitante.portero, 'JUGADOR 21', 'portero por la prop aunque no lleve título');
  assert.equal(parseada.lineups.visitante.titulares[1].capitan, true);
});

test('tarjetas desde los iconos de cada fila, con su lado', () => {
  const { parseada } = interpretaActa(actaDePrueba(), [LOCAL, VISITANTE]);
  const t = parseada.tarjetas.map((x) => `${x.lado}:${x.jugador}:${x.minuto}:${x.tipo}`).sort();
  assert.deepEqual(t, [
    'local:JUGADOR 10:69:amarilla', 'local:JUGADOR 17:89:amarilla', 'local:JUGADOR 18:84:amarilla',
    'local:JUGADOR 7:40:amarilla', 'visitante:JUGADOR 24:10:amarilla', 'visitante:JUGADOR 28:71:amarilla',
    'visitante:JUGADOR 31:35:amarilla', 'visitante:JUGADOR 41:61:roja',
  ].sort());
});

test('cambios emparejados por minuto dentro de cada lado', () => {
  const { parseada } = interpretaActa(actaDePrueba(), [LOCAL, VISITANTE]);
  const porMinuto = (lado) => parseada.cambios.filter((c) => c.lado === lado)
    .reduce((acc, c) => { (acc[c.minuto] ??= []).push(c); return acc; }, {});
  const local = porMinuto('local');
  assert.deepEqual(Object.keys(local).map(Number).sort((a, b) => a - b), [58, 72, 83]);
  assert.equal(local[58].length, 2);
  assert.equal(local[83].length, 3);
  assert.deepEqual(local[58].map((c) => c.saliente).sort(), ['JUGADOR 4', 'JUGADOR 6']);
  assert.deepEqual(local[58].map((c) => c.entrante).sort(), ['JUGADOR 15', 'JUGADOR 19']);
  const visitante = porMinuto('visitante');
  assert.deepEqual(visitante[46], [{ lado: 'visitante', saliente: 'JUGADOR 29', entrante: 'JUGADOR 36', minuto: 46 }]);
  assert.equal(visitante[66].length, 3);
  assert.equal(parseada.cambios.length, 7 + 5);
  // Nadie entra y sale del mismo lado contrario: cada saliente es titular o entró antes en su equipo.
  for (const c of parseada.cambios) assert.notEqual(c.saliente, c.entrante);
});

test('goles: lado por el marcador acumulado, tipo y minuto', () => {
  const { parseada } = interpretaActa(actaDePrueba(), [LOCAL, VISITANTE]);
  assert.deepEqual(parseada.goles, [
    { jugador: 'JUGADOR 4', lado: 'local', minuto: 3, tipo: 'penalti' },
    { jugador: 'JUGADOR 28', lado: 'visitante', minuto: 20, tipo: 'normal' },
    { jugador: 'JUGADOR 24', lado: 'visitante', minuto: 57, tipo: 'normal' },
  ]);
  assert.equal(parseada.golesLocal, 1);
  assert.equal(parseada.golesVisitante, 2);
});

test('sin iconos (temporadas viejas o actas vacías) no se inventa nada', () => {
  const acta = actaDePrueba();
  for (const s of acta.secciones) for (const f of s.filas) { f.eventos = []; delete f.jugador; }
  const { parseada } = interpretaActa(acta, [LOCAL, VISITANTE]);
  assert.equal(parseada.tarjetas.length, 0);
  assert.equal(parseada.cambios.length, 0);
  assert.equal(parseada.lineups.local.titulares[0].codigoJugador, null);
  assert.equal(parseada.lineups.local.titulares.length, 11);
});

test('un «sale» sin «entra» del mismo minuto se empareja con el entra sobrante por orden', () => {
  const acta = actaDePrueba();
  // Local: el entra de 72' de JUGADOR 14 se apunta a 73' (desfase de la propia acta).
  acta.secciones[3].filas[1].eventos = [{ minuto: 73, tipo: 'entra' }];
  const { parseada } = interpretaActa(acta, [LOCAL, VISITANTE]);
  const local = parseada.cambios.filter((c) => c.lado === 'local');
  assert.equal(local.length, 7);
  assert.ok(local.some((c) => c.entrante === 'JUGADOR 14'));
});

test('parteTecnico separa roles de dos palabras', () => {
  assert.deepEqual(parteTecnico('DELEGAT CAMP PERSONA A'), { rol: 'DELEGAT CAMP', nombre: 'PERSONA A' });
});

test('acta leída antes de jugarse: se aplaza al día siguiente del partido', async () => {
  const { decideActaSinJugar, fechaIsoDeFicha } = await import('./acta-cataluna.mjs');
  assert.equal(fechaIsoDeFicha('Data: 22.10.2026'), '2026-10-22');
  assert.equal(fechaIsoDeFicha('5.1.2027'), '2027-01-05');
  const hoy = '2026-10-22';
  // Caso real 4378513: «Pendent», partido hoy a las 20:45.
  assert.deepEqual(decideActaSinJugar({ estado: 'Pendent', marcador: null, fecha: '2026-10-22', titulares: 0, temporadaEnCurso: true, hoy }).hasta,
    '2026-10-23T06:00:00.000Z');
  // Caso real 4378488: citado para diciembre.
  assert.equal(decideActaSinJugar({ estado: 'Pendent', fecha: '2026-12-05', titulares: 0, temporadaEnCurso: true, hoy }).hasta.slice(0, 10), '2026-12-06');
  // Sin estado (maqueta vieja) pero fecha futura y sin marcador: también.
  assert.ok(decideActaSinJugar({ estado: null, marcador: null, fecha: '2026-10-25', titulares: 0, temporadaEnCurso: true, hoy }));
  // «Pendent» de una fecha ya pasada (hace días): otra vuelta dentro de 3 días.
  assert.equal(decideActaSinJugar({ estado: 'Pendent', fecha: '2026-10-18', titulares: 0, temporadaEnCurso: true, hoy }).hasta.slice(0, 10), '2026-10-25');
});

test('acta que NO se aplaza: con alineaciones, cerrada, temporada cerrada o pendiente muy vieja', async () => {
  const { decideActaSinJugar } = await import('./acta-cataluna.mjs');
  const hoy = '2026-10-22';
  assert.equal(decideActaSinJugar({ estado: 'Pendent', fecha: hoy, titulares: 22, temporadaEnCurso: true, hoy }), null);
  assert.equal(decideActaSinJugar({ estado: 'Acta Tancada', marcador: [2, 1], fecha: '2026-10-05', titulares: 0, temporadaEnCurso: true, hoy }), null);
  assert.equal(decideActaSinJugar({ estado: 'Pendent', fecha: '2026-10-25', titulares: 0, temporadaEnCurso: false, hoy }), null);
  assert.equal(decideActaSinJugar({ estado: 'Pendent', fecha: '2026-09-01', titulares: 0, temporadaEnCurso: true, hoy }), null);
  // Fecha de hoy con marcador ya puesto y sin estado conocido: se guarda (se jugó y no hay alineaciones).
  assert.equal(decideActaSinJugar({ estado: null, marcador: [1, 0], fecha: hoy, titulares: 0, temporadaEnCurso: true, hoy }), null);
});

test('calidad: fútbol 7, 8 y sala con los mismos titulares por lado son correctos; 10 contra 11 se revisa', async () => {
  const { evaluaCalidad } = await import('./acta-cataluna.mjs');
  const acta = (l, v, gl = 0, gv = 0, goles = []) => ({ golesLocal: gl, golesVisitante: gv, goles,
    lineups: { local: { titulares: Array(l).fill({}) }, visitante: { titulares: Array(v).fill({}) } } });
  assert.deepEqual(evaluaCalidad(acta(11, 11)), { calidad: 'correcta', incidencias: [] });
  assert.equal(evaluaCalidad(acta(7, 7)).calidad, 'correcta');
  assert.equal(evaluaCalidad(acta(8, 8)).calidad, 'correcta');
  assert.equal(evaluaCalidad(acta(5, 5)).calidad, 'correcta');
  assert.deepEqual(evaluaCalidad(acta(10, 11)).incidencias, ['titulares:21']);
  assert.deepEqual(evaluaCalidad(acta(0, 0)).incidencias, ['sin_alineaciones']);
  assert.deepEqual(evaluaCalidad(acta(11, 11, 1, 0, [])).incidencias, ['sin_goles_leidos']);
  assert.deepEqual(evaluaCalidad(acta(11, 11, 1, 0, [{ lado: 'visitante' }])).incidencias, ['goles_no_cuadran:0-1']);
  assert.equal(evaluaCalidad(acta(11, 11, 0, 1, [{ lado: 'local', tipo: 'propia-puerta' }])).calidad, 'correcta');
});

test('estado de la ficha: «Acta Oberta» espera, «SUSPÈS» no; un descanso nunca espera', async () => {
  const { decideActaSinJugar } = await import('./acta-cataluna.mjs');
  const hoy = '2026-10-22';
  const base = { titulares: 0, temporadaEnCurso: true, hoy, fecha: '2026-10-19' };
  assert.ok(decideActaSinJugar({ ...base, estado: 'Acta Oberta' }));
  assert.equal(decideActaSinJugar({ ...base, estado: 'SUSPÈS' }), null);
  assert.equal(decideActaSinJugar({ ...base, estado: 'Acta Tancada' }), null);
  assert.equal(decideActaSinJugar({ ...base, estado: 'Pendent', equipos: ['undefined', 'CORNELLA, U.E. SAD'] }), null);
  assert.equal(decideActaSinJugar({ ...base, estado: 'Pendent', equipos: ['TBD', 'X'] }), null);
  assert.ok(decideActaSinJugar({ ...base, estado: 'Pendent', equipos: ['CABRILS, C.E.', 'ESCOLA FUTBOL MATARO C.E'] }));
});
