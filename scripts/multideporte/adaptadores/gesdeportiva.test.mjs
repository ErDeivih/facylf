import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { cuerpoCambio, desplegable, nivelesDe, partidosDelGrupo, creaAdaptadorGesdeportiva } from './gesdeportiva.mjs';
const fbm = readFileSync(new URL('../fixtures/fbm-grupo.html', import.meta.url), 'utf8');
const can = readFileSync(new URL('../fixtures/gesdeportiva-canarias.html', import.meta.url), 'utf8');
const a = creaAdaptadorGesdeportiva();

test('gesdeportiva: niveles y postback (FBM con prefijo ctl00$, Canarias sin él)', () => {
  assert.deepEqual(nivelesDe(fbm), ['DDLDelegacion', 'DDLCompeticiones', 'DDLCategorias', 'DDLFases', 'DDLGrupos']);
  assert.deepEqual(nivelesDe(can), ['DDLTemporadas', 'DDLCompeticiones', 'DDLCategorias', 'DDLFases', 'DDLGrupos']);
  const p = new URLSearchParams(cuerpoCambio(can, 'DDLGrupos', '5257'));
  assert.equal(p.get('__EVENTTARGET'), 'DDLGrupos'); assert.equal(p.get('DDLGrupos'), '5257'); assert.equal(p.get('DDLTemporadas'), '2026');
  assert.equal(desplegable(fbm, 'DDLDelegacion').opciones.length, 17);
});

test('gesdeportiva: calendario con enlaces (FBM) y sin ellos (Canarias)', () => {
  const f = partidosDelGrupo(fbm)[0];
  assert.equal(f.local.nombre, 'ADC BOADILLA'); assert.equal(f.local.id, '835995'); assert.equal(f.id_grupo, '17424');
  assert.equal(f.puntos_local, 69); assert.equal(f.fecha, '2026-09-12'); assert.match(f.pista, /REY FELIPE VI/);
  const c = partidosDelGrupo(can);
  assert.ok(c.length > 5);
  assert.equal(c[0].local.nombre, 'Escuela De Baloncesto Felipe Anton'); assert.equal(c[0].local.id, null);
  assert.equal(c[0].puntos_local, null); assert.equal(c[0].jugado, false); assert.equal(c[0].fecha, '2026-10-17'); assert.equal(c[0].jornada, 1);
});

test('gesdeportiva: recorrido por niveles, temporadas desde 2023 y FEB fuera', () => {
  const t = a.tipos.nivel.interpreta(can, { contexto: { sitio: 'canarias' }, url: 'https://gesdeportiva.fcbaloncesto.es/competiciones-6/FederacionCanaria' });
  assert.deepEqual(t.enlaces.map((e) => e.contexto.temporada.id), ['2026', '2025', '2024', '2023']);
  assert.equal(t.enlaces[0].url, 'https://gesdeportiva.fcbaloncesto.es/competiciones-6/FederacionCanaria');
  const c = a.tipos.nivel.interpreta(can, { contexto: { sitio: 'canarias', temporada: { id: '2026' } }, url: 'https://gesdeportiva.fcbaloncesto.es/competiciones-6/FederacionCanaria' });
  assert.deepEqual(c.enlaces.map((e) => e.contexto.competicion.nombre), ['COMPETICIÓN AUTONOMICA', 'COMPETICIÓN LIIC', 'COMPETICION NACIONAL']);
  assert.equal(c.enlaces[0].identidad, 'canarias:2026/17661');
  const d = a.tipos.nivel.interpreta(fbm, { contexto: { sitio: 'fbm', delegacion: { id: '1' } }, url: 'https://www.fbm.es/es/horarios-y-resultados' });
  assert.deepEqual(d.enlaces.map((e) => e.contexto.competicion.nombre), ['COMPETICIONES FEDERADAS FBM', 'TORNEOS FBM']);
  const g = a.tipos.nivel.interpreta(fbm, { contexto: { sitio: 'fbm', delegacion: { id: '1' }, competicion: { id: '15657' }, categoria: { id: '17017' }, fase: { id: '7806' } }, url: 'https://www.fbm.es/es/horarios-y-resultados' });
  assert.equal(g.enlaces[0].tipo, 'grupo');
  assert.equal(g.enlaces[0].url, 'https://www.fbm.es/es/horarios-y-resultados');
  const r = a.tipos.grupo.interpreta(fbm, { contexto: { sitio: 'fbm', grupo: { id: '17424' } } });
  assert.equal(new Set(r.registros.map((x) => x.clave)).size, r.registros.length);
});
