// Pruebas de la tubería La Preferente → canónico (piezas puras, sin base). Claude, 26/10/2026.
//   node --test scripts/lapreferente/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { grupoDeUrlFederacion, etiquetaTemporada, federacionPrincipal } from './lib.mjs';
import { filasExterno, ladoBeneficiado } from './a-externo.mjs';
import { decide, mapeaPartidos } from './empareja.mjs';
import { decideExcluidas } from './elige-fichas.mjs';
import { parseadaDesdeFicha, nombreParaImportador, construyeCola } from './cola-lp.mjs';
import { fichaPartido } from '../multideporte/adaptadores/_lapreferente-ficha.mjs';

const ficha = fichaPartido(readFileSync(new URL('../multideporte/fixtures/lapreferente-ficha-sintetica.html', import.meta.url), 'utf8'));
const hosts = new Map([['www.rfcylf.es', 'castilla-leon'], ['resultadosffcv.isquad.es', 'valencia'], ['resultados.rfef.es', 'rfef']]);

test('la URL de carga de LP dice el grupo de la federación (PNFG, iSquad, FCF, RFEF)', () => {
  const pnfg = grupoDeUrlFederacion('https://www.rfcylf.es/pnfg/NPcd/NFG_VisCalendario_Vis?cod_primaria=1000120&codtemporada=21&CodCompeticion=22911132&codgrupo=22911133', hosts);
  assert.deepEqual([pnfg.plataforma, pnfg.federacion, pnfg.competicion, pnfg.grupo], ['pnfg', 'castilla-leon', '22911132', '22911133']);
  const isq = grupoDeUrlFederacion('https://resultadosffcv.isquad.es/total_partidos.php?id_temp=21&id_modalidad=33327&id_competicion=29509433', hosts);
  assert.deepEqual([isq.plataforma, isq.federacion, isq.competicion], ['isquad', 'valencia', '29509433']);
  const fcf = grupoDeUrlFederacion('https://www.fcf.cat/calendari/2526/futbol-11/preferent-juvenils/grup-1', hosts);
  assert.deepEqual([fcf.plataforma, fcf.federacion, fcf.competicion, fcf.grupo], ['fcf', 'cataluna', 'futbol-11/preferent-juvenils', 'grup-1']);
  assert.equal(grupoDeUrlFederacion('https://resultados.rfef.es/pnfg/NPcd/NFG_VisCalendario_Vis?codgrupo=1', hosts).plataforma, 'rfef');
  assert.equal(grupoDeUrlFederacion(null), null);
  assert.equal(grupoDeUrlFederacion('no es una url'), null);
});

test('temporadas y federación de la casa', () => {
  assert.equal(etiquetaTemporada('20252026'), '2025-26');
  assert.equal(etiquetaTemporada('2018-19'), '2018-19');
  assert.equal(etiquetaTemporada('x'), null);
  assert.equal(federacionPrincipal(9), 'cataluna');
  assert.equal(federacionPrincipal('19'), 'euskadi');
  assert.equal(federacionPrincipal(0), null);
});

test('el lado de cada gol sale del marcador parcial, no del encabezado', () => {
  assert.deepEqual(ladoBeneficiado([{ parcial: [1, 0] }, { parcial: [1, 1] }, { parcial: [2, 1] }]), ['local', 'visitante', 'local']);
  // Desordenados (LP los agrupa por equipo): igual.
  assert.deepEqual(ladoBeneficiado([{ parcial: [1, 0] }, { parcial: [2, 1] }, { parcial: [1, 1] }]), ['local', 'local', 'visitante']);
  // Sin parcial o con un hueco: null (se usa el encabezado).
  assert.deepEqual(ladoBeneficiado([{ parcial: null }, { parcial: [2, 2] }]), [null, null]);
});

test('filasExterno: competición, partidos, alineaciones y eventos con lado y tipo de gol', () => {
  const datos = {
    competiciones: [{ id: 9799, temporada: '2018-19', ccaa_lp: '9', nombre: 'Preferente Grupo 1', categoria_lp: 2, modalidad: 'futbol11' },
      { id: 500, temporada: '2025-26', nacional: true, ccaa_lp: '0', nombre: 'Tercera RFEF', url_federacion: 'https://resultados.rfef.es/pnfg/NPcd/NFG_VisCalendario_Vis?codgrupo=7' }],
    partidos: [{ clave: 'P200', competicion: 9799, jornada: 1, partido_id: '200', local: { id: '18694', nombre: 'Villarcayo' }, visitante: { id: '19348', nombre: 'Coca' }, goles_local: 1, goles_visitante: 1, ficha_disponible: true },
      { clave: 'P999', competicion: 1234, jornada: 1 }],
    fichas: [{ clave: 'P200', ...ficha, goles: [...ficha.goles, { equipo: 'C.D. COCA', id: '197927', minuto: 96, parcial: [2, 1], propia: true }] }],
  };
  const f = filasExterno(datos, (c) => ({ cataluna: 2, rfef: 9 })[c] ?? null);
  assert.equal(f.competiciones.length, 2);
  const [cat, nac] = f.competiciones;
  assert.equal(cat.federation_id, 2);
  assert.equal(nac.federation_id, 9, 'una nacional cargada de la web de la RFEF es de la fuente «rfef»');
  assert.equal(nac.plataforma_federacion, 'rfef');
  assert.equal(f.partidos.length, 1, 'el partido de una competición desconocida se descarta');
  assert.ok(f.participaciones.every((p) => p.lado === 'local' || p.lado === 'visitante'));
  const goles = f.eventos.filter((e) => e.tipo === 'gol');
  assert.deepEqual(goles.map((g) => [g.lado, g.subtipo]), [['local', 'normal'], ['visitante', 'normal'], ['local', 'propia-puerta']]);
  // El gol en propia puerta se apunta al equipo beneficiado (local) aunque aparezca bajo «GOLEADORES C.D. COCA».
  assert.equal(goles[2].equipo_lp_id, 18694);
  assert.ok(f.eventos.some((e) => e.tipo === 'cambio' && e.entra_lp_id === 579981));
});

test('parseadaDesdeFicha: doble amarilla, propia puerta y técnicos', () => {
  const part = [
    { jugador_lp_id: 1, nombre: 'Ana A', lado: 'local', condicion: 'titular', orden: 0, dorsal: 1 },
    { jugador_lp_id: 2, nombre: 'Bea B', lado: 'local', condicion: 'suplente', orden: 1, dorsal: 12 },
    { jugador_lp_id: 3, nombre: 'Cris C', lado: 'visitante', condicion: 'titular', orden: 0, dorsal: 9 },
    { jugador_lp_id: 4, nombre: 'Dani D', lado: 'visitante', condicion: 'tecnico', orden: 0, rol: 'Entrenador' },
  ];
  const ev = [
    { orden: 0, tipo: 'amarilla', jugador_lp_id: 3, minuto: 10, lado: 'visitante' },
    { orden: 1, tipo: 'roja', jugador_lp_id: 3, minuto: 60, lado: 'visitante' },
    { orden: 2, tipo: 'roja', jugador_lp_id: 1, minuto: 70, lado: 'local' },
    { orden: 3, tipo: 'gol', subtipo: 'propia-puerta', jugador_lp_id: 3, minuto: 80, lado: 'local' },
    { orden: 4, tipo: 'cambio', jugador_lp_id: 1, entra_lp_id: 2, minuto: 85, lado: 'local' },
  ];
  const p = parseadaDesdeFicha(part, ev);
  assert.deepEqual(p.lineups.local.titulares.map((x) => x.codigoJugador), ['lpJ1']);
  assert.equal(p.lineups.local.suplentes[0].dorsal, 12);
  assert.deepEqual(p.tecnicos, [{ lado: 'visitante', rol: 'Entrenador', nombre: 'Dani D' }]);
  assert.deepEqual(p.tarjetas.map((t) => t.tipo), ['amarilla', 'doble-amarilla', 'roja']);
  // Propia puerta: el goleador (Cris, visitante) da el gol al local.
  assert.deepEqual(p.goles[0], { jugador: 'Cris C', minuto: 80, lado: 'visitante', tipo: 'propia-puerta', ladoBeneficiado: 'local' });
  assert.deepEqual(p.cambios[0], { saliente: 'Ana A', entrante: 'Bea B', minuto: 85, lado: 'local' });
});

test('nombreParaImportador añade la categoría que LP no pone en el nombre', () => {
  assert.equal(nombreParaImportador({ nombre: 'Preferente Grupo 1', categoria_lp: 2, deporte: 'futbol' }), 'Preferente Grupo 1 Juvenil');
  assert.equal(nombreParaImportador({ nombre: 'Juvenil Preferente', categoria_lp: 2, deporte: 'futbol' }), 'Juvenil Preferente');
  assert.equal(nombreParaImportador({ nombre: '1ª Regional', categoria_lp: 1, deporte: 'futbol' }), '1ª Regional');
});

test('decide: por código de grupo, por marcadores o sin contraparte', () => {
  const lp = Array.from({ length: 12 }, (_, i) => ({ local: `Equipo ${i % 4}`, visitante: `Equipo ${(i + 1) % 4}`, gl: i % 3, gv: 1 }));
  const igual = lp.map((p) => ({ ...p }));
  assert.equal(decide({ lpPartidos: lp, porCodigo: { id: 7, partidos: igual }, candidatos: [] }).estado, 'emparejado');
  const otro = lp.map((p) => ({ ...p, gl: p.gl + 2 }));
  assert.equal(decide({ lpPartidos: lp, porCodigo: { id: 7, partidos: otro }, candidatos: [] }).estado, 'dudoso');
  const r = decide({ lpPartidos: lp, porCodigo: null, candidatos: [{ id: 1, partidos: otro }, { id: 2, partidos: igual }] });
  assert.deepEqual([r.estado, r.phase_group_id], ['emparejado', 2]);
  assert.equal(decide({ lpPartidos: lp, porCodigo: null, candidatos: [] }).estado, 'sin_contraparte');
});

test('construyeCola escribe una cola que el importador sabe leer, con códigos «lp»', () => {
  const ruta = join(mkdtempSync(join(tmpdir(), 'cola-lp-')), 'c.sqlite');
  const comp = { id: 9799, nombre: 'Preferente Grupo 1', categoria_lp: 2, deporte: 'futbol', grupo: 'Grupo 1' };
  const partidos = [{ clave: 'P200', jornada: 1, fecha: '2018-10-01', local_id: 1, local_nombre: 'Uno', visitante_id: 2, visitante_nombre: 'Dos', goles_local: 1, goles_visitante: 0, ficha_leida_en: '2026-10-26' },
    { clave: 'P201', jornada: 2, local_id: 2, local_nombre: 'Dos', visitante_id: 1, visitante_nombre: 'Uno', goles_local: null, goles_visitante: null }];
  const participaciones = [{ partido_clave: 'P200', jugador_lp_id: 5, nombre: 'Eva E', lado: 'local', condicion: 'titular', orden: 0 }];
  const eventos = [{ partido_clave: 'P200', orden: 0, tipo: 'gol', subtipo: 'normal', jugador_lp_id: 5, minuto: 30, lado: 'local' }];
  const r = construyeCola(ruta, { temporada: '2018-19', competiciones: [{ comp, partidos, participaciones, eventos }] });
  assert.equal(r.partidos, 2);
  const db = new DatabaseSync(ruta, { readOnly: true });
  assert.deepEqual({ ...db.prepare('select codigo, etiqueta from temporadas').get() }, { codigo: 'lp2018', etiqueta: '2018-19' });
  assert.equal(db.prepare('select codigo from grupos').get().codigo, 'lp9799');
  assert.ok(db.prepare('select codigo from equipos').all().every((e) => e.codigo.startsWith('lp')));
  assert.equal(db.prepare('select count(*) n from eventos_acta').get().n, 1);
  db.close();
});

test('mapeaPartidos: cada partido de LP con el suyo del canónico, también con cruces repetidos', () => {
  const equipos = { 'Uno LP': { federacion: 'UNO' }, 'Dos LP': { federacion: 'DOS' } };
  const lp = [{ clave: 'P1', jornada: 1, local: 'Uno LP', visitante: 'Dos LP' }, { clave: 'P2', jornada: 3, local: 'Uno LP', visitante: 'Dos LP' },
    { clave: 'P3', jornada: 2, local: 'Dos LP', visitante: 'Uno LP' }, { clave: 'P4', jornada: 2, local: 'Otro', visitante: 'Uno LP' }];
  const fed = [{ id: 10, jornada: 1, local: 'UNO', visitante: 'DOS' }, { id: 30, jornada: 3, local: 'UNO', visitante: 'DOS' }, { id: 20, jornada: 2, local: 'DOS', visitante: 'UNO' }];
  assert.deepEqual(mapeaPartidos(lp, fed, equipos), [{ clave: 'P1', match_id: 10 }, { clave: 'P3', match_id: 20 }, { clave: 'P2', match_id: 30 }]);
});

test('decideExcluidas: fuera las competiciones cuyo grupo de la federación ya tiene las actas', () => {
  const { excluidas, resumen } = decideExcluidas([
    { id: 5, federacion: 'galicia', jugados: 100, actas: 95 },
    { id: 6, federacion: 'galicia', jugados: 100, actas: 40 },
    { id: 7, federacion: null, jugados: 0, actas: 0 },
  ]);
  assert.deepEqual(excluidas, [5]);
  assert.deepEqual(resumen, { galicia: { emparejadas: 2, excluidas: 1 }, nacional: { emparejadas: 1, excluidas: 0 } });
});
