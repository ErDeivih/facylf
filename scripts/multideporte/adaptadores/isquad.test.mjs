import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { creaAdaptadorIsquad, jornadasEnlazadas, opcionesDeSelect, partidosDePagina } from './_isquad-resultados.mjs';
import { abreCola, encola, ejecutaSesion } from '../motor.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n), 'utf8');
const VOLEI = F('isquad-voleibol-competicion.html');
const BM = F('isquad-balonmano-competicion.html');
const RFEBM = F('isquad-balonmano-rfebm.html');

test('los desplegables de navegación salen del HTML servido', () => {
  assert.equal(opcionesDeSelect(VOLEI, 'categorias').length, 23);
  assert.deepEqual(opcionesDeSelect(VOLEI, 'competiciones')[0], { valor: '1577', texto: "LLIGA CATALANA TAKEOFFPRO DIVISIÓ D'HONOR FEMENINA" });
  assert.equal(opcionesDeSelect(BM, 'competiciones').length, 14);
  assert.equal(opcionesDeSelect(BM, 'torneos')[2].texto, 'PRIMERA FASE - GRUPO A');
  assert.deepEqual(jornadasEnlazadas(VOLEI), [1, 2, 3]);
  assert.equal(jornadasEnlazadas(RFEBM).length, 26);
});

test('voleibol: marcador en sets y parciales de cada set', () => {
  const [p] = partidosDePagina(VOLEI);
  assert.deepEqual(p, {
    id_partido: '84857', local: { id: '3128', nombre: "CV VALL D'HEBRON SIGMA" }, visitante: { id: '5885', nombre: 'VOLEIBOL SANT JUST' },
    tanteo_local: 1, tanteo_visitante: 2, parciales: [[20, 25], [25, 17], [18, 25]], fecha: '2026-09-19', hora: '20:30',
    lugar: 'PAVELLO MUNICIPAL LA BONAIGUA · PAVELLO MUNICIPAL LA BONAIGUA - PISTA 1', estado: 'Finalizado',
  });
});

test('balonmano: goles, estado y huecos sin inventar (pendiente = null, no 0)', () => {
  const ps = partidosDePagina(RFEBM);
  assert.equal(ps.length, 7);
  const fin = ps.find((x) => x.estado === 'Finalizado');
  assert.equal(fin.tanteo_local, 24); assert.equal(fin.tanteo_visitante, 26);
  const pend = ps.find((x) => x.estado === 'Pendiente');
  assert.equal(pend.tanteo_local, null);
  const [cruce] = partidosDePagina(BM);            // cruce de fase final sin equipos todavía
  assert.equal(cruce.local.id, null);
  assert.equal(cruce.fecha, null);
});

test('de punta a punta con el motor: territorial → categoría → competición → grupo → jornadas → partidos', async () => {
  const ad = creaAdaptadorIsquad({ deporte: 'balonmano', territoriales: ['9999'], temporadas: ['2627'], actas: true,
    ahora: () => new Date('2026-09-30T12:00:00Z') });
  const db = abreCola(':memory:');
  for (const s of ad.semillas()) encola(db, ad.nombre, s);
  const pedidas = [];
  const pedir = async (u) => { pedidas.push(u); return { estado: 200, bruto: Buffer.from(u.includes('clasificacion_completa') || u.includes('acta_') ? 'x' : RFEBM) }; };
  const c = await ejecutaSesion({ db, adaptador: ad, max: 700, pedir, esperar: async () => {}, log: () => {} });
  assert.equal(c.fallidas, 0);
  const n = (tipo) => db.prepare(`select count(*) n from registros where tipo=?`).get(tipo).n;
  assert.equal(n('partido'), 7);                 // los mismos 7 partidos (el HTML de prueba es el mismo en todas las jornadas)
  assert.ok(pedidas.some((u) => u.includes('id_categoria=') && !u.includes('id_competicion=')));
  assert.ok(pedidas.some((u) => /&jornada=26$/.test(u)));
  // el único partido finalizado encola su acta en PDF
  assert.ok(db.prepare(`select 1 from paginas where tipo='acta' and url like '%id_partido=1590855'`).get());
  const d = JSON.parse(db.prepare(`select datos from registros where tipo='partido' and clave='1590855'`).get().datos);
  assert.equal(d.federacion, 'estatal'); assert.equal(d.deporte, 'balonmano'); assert.equal(d.temporada, '2627');
  // temporada en curso con partidos pendientes: la jornada se vuelve a mirar mañana
  const j = db.prepare(`select estado, siguiente_intento from paginas where tipo='jornada' limit 1`).get();
  assert.equal(j.estado, 'pendiente');
});
