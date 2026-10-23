import assert from 'node:assert/strict';
import { test } from 'node:test';
import { abreCola, encola, ejecutaSesion, resumen } from './motor.mjs';

const sinEspera = async () => {};
const adaptador = {
  nombre: 'prueba', deporte: 'voleibol',
  tipos: {
    portada: { interpreta: (html) => ({ enlaces: [...html.matchAll(/grupo=(\d+)/g)].map((m) => ({ tipo: 'grupo', url: `https://x/g?grupo=${m[1]}` })) }) },
    grupo: {
      revisitarHoras: 24,
      interpreta: (html, { url }) => html.includes('VACIO') ? { sinPublicar: true }
        : { registros: [{ tipo: 'partido', clave: url.split('=')[1], datos: { resultado: html } }] },
    },
  },
};

test('recorre portada → grupos, guarda registros, re-visita los grupos y respeta «sin publicar»', async () => {
  const db = abreCola(':memory:');
  encola(db, 'prueba', { tipo: 'portada', url: 'https://x/', prioridad: 1 });
  const web = { 'https://x/': 'grupo=1 grupo=2 grupo=3', 'https://x/g?grupo=1': '3-1', 'https://x/g?grupo=2': 'VACIO' };
  const pedir = async (u) => (u in web ? { estado: 200, bruto: Buffer.from(web[u]) } : { estado: 404, bruto: Buffer.from('') });
  const c = await ejecutaSesion({ db, adaptador, pedir, esperar: sinEspera, log: () => {} });
  assert.equal(c.hechas, 2);         // portada + grupo 1
  assert.equal(c.sinPublicar, 1);    // grupo 2
  assert.equal(c.descartadas, 1);    // grupo 3 → 404
  assert.equal(c.parada, 'sin trabajo');
  const g1 = db.prepare(`select estado, siguiente_intento from paginas where url='https://x/g?grupo=1'`).get();
  assert.equal(g1.estado, 'pendiente');                       // re-visita programada
  assert.ok(new Date(g1.siguiente_intento) > new Date(Date.now() + 23 * 3_600_000));
  const g2 = db.prepare(`select sin_publicar_seguidos, siguiente_intento from paginas where url='https://x/g?grupo=2'`).get();
  assert.equal(g2.sin_publicar_seguidos, 1);
  assert.ok(new Date(g2.siguiente_intento) > new Date(Date.now() + 47 * 3_600_000));
  assert.deepEqual(resumen(db, 'prueba').registros.map((x) => ({ ...x })), [{ tipo: 'partido', n: 1 }]);
});

test('el mismo registro dos veces con otro contenido cuenta un cambio', async () => {
  const db = abreCola(':memory:');
  let marcador = '1-0';
  const pedir = async () => ({ estado: 200, bruto: Buffer.from(marcador) });
  encola(db, 'prueba', { tipo: 'grupo', url: 'https://x/g?grupo=9' });
  await ejecutaSesion({ db, adaptador, pedir, esperar: sinEspera, log: () => {} });
  db.prepare(`update paginas set siguiente_intento=null`).run();
  marcador = '2-0';
  await ejecutaSesion({ db, adaptador, pedir, esperar: sinEspera, log: () => {} });
  const r = db.prepare(`select cambios, datos from registros`).get();
  assert.equal(r.cambios, 1);
  assert.equal(JSON.parse(r.datos).resultado, '2-0');
});

test('tres respuestas malas del mismo sitio aplazan una hora sólo ese sitio; los demás siguen', async () => {
  const db = abreCola(':memory:');
  for (let i = 0; i < 5; i += 1) encola(db, 'prueba', { tipo: 'grupo', url: `https://caido.es/g?grupo=${i}` });
  for (let i = 0; i < 2; i += 1) encola(db, 'prueba', { tipo: 'grupo', url: `https://vivo.es/g?grupo=${i}`, prioridad: 60 });
  const pedir = async (u) => (u.includes('caido') ? { estado: 0, error: 'fetch failed' } : { estado: 200, bruto: Buffer.from('1-0') });
  const c = await ejecutaSesion({ db, adaptador, pedir, esperar: async () => {}, log: () => {} });
  assert.equal(c.fallidas, 3);
  assert.deepEqual(c.sitiosAplazados, ['caido.es']);
  assert.equal(c.hechas, 2);                       // vivo.es no se ha parado
  assert.equal(c.parada, 'sin trabajo');
  const espera = db.prepare(`select min(siguiente_intento) m from paginas where url like 'https://caido.es/%'`).get().m;
  assert.ok(new Date(espera) > new Date(Date.now() + 50 * 60_000));
});

test('el ritmo espera entre peticiones lo que diga min/max', async () => {
  const db = abreCola(':memory:');
  for (let i = 0; i < 3; i += 1) encola(db, 'prueba', { tipo: 'grupo', url: `https://x/g?grupo=${i}` });
  const esperas = [];
  await ejecutaSesion({ db, adaptador, minSeg: 4, maxSeg: 6, pedir: async () => ({ estado: 200, bruto: Buffer.from('1-0') }),
    esperar: async (ms) => { esperas.push(ms); }, log: () => {} });
  assert.equal(esperas.length, 2);
  for (const ms of esperas) assert.ok(ms > 3900 && ms <= 6000, String(ms));
});

test('carriles: varios sitios a la vez, nunca dos peticiones al mismo sitio, y cada sitio con su pausa', async () => {
  const db = abreCola(':memory:');
  for (const s of ['a.es', 'b.es', 'c.es']) for (let i = 0; i < 4; i += 1) encola(db, 'prueba', { tipo: 'grupo', url: `https://${s}/g?grupo=${s}${i}` });
  const enCurso = new Map(); let maxSimultaneas = 0; let simultaneas = 0; const ultimaPorSitio = new Map(); let pisadas = 0; let pegadas = 0;
  const pedir = async (u) => {
    const s = new URL(u).host;
    if (enCurso.get(s)) pisadas += 1;
    if (ultimaPorSitio.has(s) && Date.now() - ultimaPorSitio.get(s) < 25) pegadas += 1;
    enCurso.set(s, true); simultaneas += 1; maxSimultaneas = Math.max(maxSimultaneas, simultaneas);
    await new Promise((r) => setTimeout(r, 15));
    enCurso.set(s, false); simultaneas -= 1; ultimaPorSitio.set(s, Date.now());
    return { estado: 200, bruto: Buffer.from('1-0') };
  };
  const c = await ejecutaSesion({ db, adaptador, carriles: 3, minSeg: 0.03, maxSeg: 0.04, pedir, log: () => {} });
  assert.equal(c.hechas, 12);
  assert.equal(c.parada, 'sin trabajo');
  assert.equal(pisadas, 0);                 // nunca dos a la vez al mismo sitio
  assert.equal(pegadas, 0);                 // y cada sitio respeta su pausa
  assert.ok(maxSimultaneas >= 2, String(maxSimultaneas));
});

test('carriles con un solo sitio: va de uno en uno, como un carril', async () => {
  const db = abreCola(':memory:');
  for (let i = 0; i < 4; i += 1) encola(db, 'prueba', { tipo: 'grupo', url: `https://solo.es/g?grupo=${i}` });
  let simultaneas = 0; let max = 0;
  const pedir = async () => { simultaneas += 1; max = Math.max(max, simultaneas); await new Promise((r) => setTimeout(r, 10)); simultaneas -= 1; return { estado: 200, bruto: Buffer.from('1-0') }; };
  const c = await ejecutaSesion({ db, adaptador, carriles: 3, minSeg: 0.01, maxSeg: 0.02, pedir, log: () => {} });
  assert.equal(c.hechas, 4);
  assert.equal(max, 1);
});
