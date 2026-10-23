import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cabeceraDePartido, campeonatosEnlazados, creaAdaptadorServerSports, equiposEnlazados, esDeMenores, fichaDePartido,
  nombreCampeonato, nombresDeCampeonatos, partidosDeEquipo, temporadasDelMenu } from './serversports.mjs';
import { abreCola, encola, ejecutaSesion } from '../motor.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n), 'utf8');

test('Futormes: campeonatos, equipos y nombre del campeonato', () => {
  assert.equal(campeonatosEnlazados(F('serversports-competiciones.html')).length, 20);
  assert.equal(equiposEnlazados(F('serversports-situacion.html')).length, 14);
  assert.equal(nombreCampeonato(F('serversports-situacion.html')), 'F11 - SUPERLIGA FUTORMES');
});

test('calendario completo del equipo: jugados con marcador y pendientes sin inventar', () => {
  const ps = partidosDeEquipo(F('serversports-equipo.html'));
  assert.equal(ps.length, 26);                 // ida y vuelta (las filas alternas llevan class="alternate")
  assert.deepEqual(ps[0], { id_partido: '1362697', fecha: '2026-09-12', hora: '16:00',
    lugar: 'La Aldehuela A1 · Ciudad Deportiva La Aldehuela · Parque de la Aldehuela s/n · Salamanca',
    local: { id: '178648', nombre: 'N8-LEYMA' }, visitante: { id: '178652', nombre: 'PELABRAVO' },
    goles_local: 2, goles_visitante: 5, finalizado: true });
  const ultimo = ps.at(-1);
  assert.equal(ultimo.finalizado, false);
  assert.equal(ultimo.goles_local, null);
});

test('ficha de partido: jornada, categoría y estado', () => {
  assert.deepEqual(cabeceraDePartido(F('serversports-partido.html')), { jornada: 3, categoria: 'Senior', estado: 'Finalizado' });
});

test('de punta a punta: competiciones → situación → equipo → fichas de los partidos jugados', async () => {
  const ad = creaAdaptadorServerSports({ ligas: [['futormes', 'Salamanca', 'https://www.futormes.com']] });
  const db = abreCola(':memory:');
  for (const s of ad.semillas()) encola(db, ad.nombre, s);
  const web = (u) => u.includes('competitions') ? F('serversports-competiciones.html')
    : u.includes('situation') ? F('serversports-situacion.html') : u.includes('team') ? F('serversports-equipo.html') : F('serversports-partido.html');
  const c = await ejecutaSesion({ db, adaptador: ad, max: 400, pedir: async (u) => ({ estado: 200, bruto: Buffer.from(web(u)) }), esperar: async () => {}, log: () => {} });
  assert.equal(c.fallidas, 0);
  const n = (t) => db.prepare('select count(*) n from registros where tipo=?').get(t).n;
  assert.equal(n('partido'), 26);
  assert.equal(n('ficha-partido'), 3);            // los tres ya jugados
  const d = JSON.parse(db.prepare(`select datos from registros where tipo='partido' and clave='1362697'`).get().datos);
  assert.equal(d.campeonato.nombre, 'F11 - SUPERLIGA FUTORMES');
  assert.equal(d.provincia, 'Salamanca');
});

test('ficha de partido con jugadores: dorsal, goles y tarjetas; nada del «tooltip» (edad, altura, peso, foto)', () => {
  const f = fichaDePartido(F('serversports-ficha.html'));
  assert.equal(f.jornada, 1);
  assert.deepEqual(f.local, { id: '179128', nombre: 'MALS FC' });
  assert.deepEqual(f.visitante, { id: '179135', nombre: 'WT-GESTICASA' });
  assert.equal(f.competicion, 'F7 - LIGA SKODA MOTOR PACÍFICO');
  assert.equal(f.menores, false);
  assert.equal(f.jugadores.length, 14);
  assert.deepEqual(f.totales.local, { jugadores: 10, goles: 1, goles_propia_puerta: 0, amarillas: 0, rojas: 0 });
  assert.deepEqual(f.totales.visitante, { jugadores: 4, goles: 2, goles_propia_puerta: 0, amarillas: 1, rojas: 0 });
  assert.deepEqual(f.jugadores.find((j) => j.amarillas), { lado: 'V', id: '2825052', nombre: 'Jugador 11', dorsal: 17,
    goles: 1, goles_propia_puerta: 0, goles_recibidos: 0, amarillas: 1, rojas: 0 });
  assert.equal(f.jugadores[0].dorsal, null);       // «-» en la web: sin dorsal, no 0
});

test('menores: se guardan también los jugadores, con el partido marcado (decisión del 05/10/2026)', () => {
  const f = fichaDePartido(F('serversports-ficha.html'), { campeonato: { nombre: 'F7 - LIGA ALEVÍN' } });
  assert.equal(f.menores, true);
  assert.equal(f.jugadores.length, 14);
  assert.equal(f.totales.visitante.goles, 2);
  for (const t of ['Juvenil', 'CADETE F11', 'Sub-12', 'Prebenjamín', 'Fútbol base']) assert.equal(esDeMenores(t), true, t);
  for (const t of ['Senior', 'Veteranos', 'Sub-23', 'Sin definir', 'F11 - SUPERLIGA FUTORMES', null]) assert.equal(esDeMenores(t), false, String(t));
});

test('histórico: el tipo «temporadas» encola un POST por temporada pasada, cada uno con su propia clave', () => {
  const ad = creaAdaptadorServerSports({ ligas: [['futormes', 'Salamanca', 'https://www.futormes.com']] });
  const html = F('serversports-ficha.html');         // el menú de temporadas va en todas las páginas
  assert.equal(temporadasDelMenu(html).length, 13);
  const ctx = { liga: 'futormes', provincia: 'Salamanca', base: 'https://www.futormes.com' };
  const r = ad.tipos.temporadas.interpreta(html, { contexto: ctx });
  assert.equal(r.enlaces.length, 12);               // 2013-2025; la de 2026 es la portada normal
  assert.deepEqual(r.enlaces.map((e) => e.contexto.temporada).slice(0, 3), [2025, 2024, 2023]);
  assert.equal(r.enlaces.at(-1).contexto.temporada, 2013);
  assert.ok(r.enlaces.every((e) => e.tipo === 'campeonatos' && e.identidad === `temporada:${e.contexto.id_temporada}`));
  assert.match(r.enlaces[0].cuerpo, /__EVENTARGUMENT=menuTemporada%5C1137/);
  const db = abreCola(':memory:');
  for (const e of r.enlaces) encola(db, ad.nombre, e);
  for (const e of r.enlaces) encola(db, ad.nombre, e);   // otra vuelta (VIEWSTATE distinto): sin duplicados
  assert.equal(db.prepare('select count(*) n from paginas').get().n, 12);
  // Una temporada pasada no se revisita cada semana, y sus equipos no se revisitan aunque quedaran partidos sin jugar.
  const camp = ad.tipos.campeonatos.interpreta(F('serversports-competiciones.html'), { contexto: { ...ctx, temporada: 2019 } });
  assert.equal(camp.revisitarHoras, 24 * 90);
  const eq = ad.tipos.equipo.interpreta(F('serversports-equipo.html'), { contexto: { ...ctx, temporada: 2019, campeonato: { id: '1' } } });
  assert.equal(eq.revisitarHoras, undefined);
  assert.equal(eq.registros[0].datos.temporada, 2019);
});

test('semillas: portada de campeonatos y menú de temporadas de cada liga', () => {
  const ad = creaAdaptadorServerSports({ ligas: [['futormes', 'Salamanca', 'https://www.futormes.com']] });
  assert.deepEqual(ad.semillas().map((s) => s.tipo), ['campeonatos', 'temporadas']);
});

test('nombre del campeonato desde el menú (las páginas de temporadas pasadas no lo traen)', () => {
  const n = nombresDeCampeonatos(F('serversports-ficha.html'));
  assert.equal(n['15813'], 'F11 - SUPERLIGA FUTORMES');
  const ad = creaAdaptadorServerSports({ ligas: [] });
  const r = ad.tipos.situacion.interpreta('<html>sin nombre</html>', { contexto: { base: 'https://x', temporada: 2019, campeonato: { id: '9733', nombre: 'F11 - LIGA FORD ADARSA' } } });
  assert.equal(r.registros[0].datos.campeonato.nombre, 'F11 - LIGA FORD ADARSA');
  assert.equal(r.revisitarHoras, 24 * 90);
});
