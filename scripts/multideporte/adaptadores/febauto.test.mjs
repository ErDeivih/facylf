import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { creaAdaptadorFebAutonomicas, esNacional, opciones, partidosDeCalendario, postback, siguientePagina } from './febauto.mjs';

const F = (n) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', n), 'utf8');
const ad = creaAdaptadorFebAutonomicas({ ahora: () => new Date('2026-10-05') });

test('febauto: nacionales fuera, regionales dentro', () => {
  for (const n of ['LF ENDESA', 'COPA ESPAÑA', 'SEGUNDA FEB', 'L.F.-2', 'TERCERA FEB', 'LIGA LEB ORO', 'Liga Femenina de Baloncesto', 'ADECCO ORO']) assert.equal(esNacional(n), true, n);
  for (const n of ['Copa Aragón Tercera FEB', 'Primera Nacional Masculina A1', 'Cº Aragón Junior Masculino 1ª', 'PRE-INFANTIL', 'DEPORTE-OCIO VETERANOS', '1ª Autonómica Mas.']) assert.equal(esNacional(n), false, n);
});

test('febauto: calendario (10 jornadas por página), cruces separados y sin marcador inventado', () => {
  const h = F('febauto-calendario.html');
  const ps = partidosDeCalendario(h);
  assert.equal(ps.length, 80);
  assert.deepEqual(ps[0], { jornada: 1, cruce: 'AZULMARINO MALLORCA PALMA - VALENCIA B.C.', resultado_texto: '-', puntos_local: null,
    puntos_visitante: null, jugado: false, fecha: '2026-10-03', hora: '18:30', local: { nombre: 'AZULMARINO MALLORCA PALMA' }, visitante: { nombre: 'VALENCIA B.C.' } });
  assert.ok(ps.every((p) => p.local && p.visitante));
  assert.equal(siguientePagina(h), 'calendarioDataGrid$_ctl1$_ctl1');
  const b = new URLSearchParams(postback(h, siguientePagina(h)));
  assert.equal(b.get('__EVENTTARGET'), 'calendarioDataGrid$_ctl1$_ctl1');
  assert.ok(b.get('__VIEWSTATE')?.length > 100);
  assert.equal(b.get('gruposDropDownList'), '89975');
});

test('febauto: la portada encola las categorías regionales de la temporada y un postback por temporada pasada', () => {
  const r = ad.tipos.portada.interpreta(F('febauto-portada.html'), { contexto: { a: 3, federacion: 'Aragón' } });
  const cal = r.enlaces.filter((e) => e.tipo === 'calendario');
  const temps = r.enlaces.filter((e) => e.tipo === 'temporada');
  assert.equal(cal.length, 16);                       // 21 categorías − 5 nacionales
  assert.ok(cal.every((e) => /Calendarios\.aspx\?a=3&c=\d+&med=0$/.test(e.url) && e.contexto.temporada === 2026));
  assert.equal(temps.length, opciones(F('febauto-portada.html'), 'temporadasDropDownList').length - 1);
  assert.equal(new URLSearchParams(temps[0].cuerpo).get('controlNavegacion:temporadasDropDownList'), '2025');
  assert.equal(temps[0].identidad, '3|t2025');
});

test('febauto: la página del calendario guarda partidos y encola la siguiente página con su propia clave', () => {
  const r = ad.tipos.calendario.interpreta(F('febauto-calendario.html'), { url: 'https://x/Calendarios.aspx?a=3&c=23467&med=0',
    contexto: { a: 3, federacion: 'Aragón', temporada: 2026, c: '23467', competicion: 'X', pagina: 1 } });
  assert.equal(r.registros.length, 80);
  assert.equal(r.enlaces[0].identidad, '23467|89975|p2');
  assert.equal(r.revisitarHoras, 48);
  const pasada = ad.tipos.calendario.interpreta(F('febauto-calendario.html'), { url: 'u', contexto: { a: 3, temporada: 2015, c: '1', pagina: 1 } });
  assert.equal(pasada.revisitarHoras, undefined);
});
