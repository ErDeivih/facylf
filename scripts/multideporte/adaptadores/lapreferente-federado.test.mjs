import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { creaAdaptadorLaPreferenteFederado, CATEGORIAS_LP } from './lapreferente-federado.mjs';
const cp = (n) => new TextDecoder('windows-1252').decode(readFileSync(new URL(`../fixtures/${n}`, import.meta.url)));
const utf = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

test('region: encola el calendario de TODAS las competiciones (sin baloncesto) y las temporadas desde 2010-11', () => {
  const a = creaAdaptadorLaPreferenteFederado();
  const r = a.tipos.region.interpreta(cp('lapreferente-competicion.html'));
  const cal = r.enlaces.filter((e) => e.tipo === 'calendario');
  assert.equal(cal.length, 1055);                       // 1.062 competiciones únicas menos 7 de baloncesto
  assert.ok(cal.every((e) => /index\.php\?comp=\d+&accion=calendario$/.test(e.url)));
  const primera = cal.find((e) => /comp=22267&/.test(e.url));
  assert.equal(primera.contexto.categoria, 'aficionados'); assert.equal(primera.contexto.temporada, '2025-26');
  assert.ok(!cal.some((e) => /comp=22454&/.test(e.url)));   // Liga ACB fuera
  const temps = r.enlaces.filter((e) => e.tipo === 'region');
  // Las temporadas salen de la LÍNEA de la competición de la página: esta (no federado) tiene 11, desde 2014-15.
  // Las semillas son grupos de Tercera, cuya línea llega a 1929-30: por eso con ellas sale el histórico entero.
  assert.equal(temps.length, 10);                       // las 11 menos la propia 2025-26
  const desde2016 = creaAdaptadorLaPreferenteFederado({ desde: 20162017 }).tipos.region.interpreta(cp('lapreferente-competicion.html'));
  assert.equal(desde2016.enlaces.filter((e) => e.tipo === 'region').length, 8);
});

test('calendario: competición y partidos de todas las jornadas; fichas sólo si se piden', () => {
  const ctx = { competicion: 22615, temporada: '2025-26', categoria: 'aficionados', categoria_lp: 1 };
  const url = 'https://www.lapreferente.com/index.php?comp=22615&accion=calendario';
  const sin = creaAdaptadorLaPreferenteFederado().tipos.calendario.interpreta(utf('lapreferente-calendario-sintetico.html'), { contexto: ctx, url });
  assert.equal(sin.registros[0].tipo, 'competicion'); assert.equal(sin.registros[0].datos.jornadas, 2);
  const partidos = sin.registros.filter((r) => r.tipo === 'partido');
  assert.equal(partidos.length, 3);
  assert.equal(partidos[0].clave, 'P4071790');
  assert.match(partidos[1].clave, /^22615\|1\|7597\|5137$/);   // sin ficha: clave compuesta
  assert.equal(sin.enlaces.length, 0);
  assert.equal(sin.revisitarHoras, 24 * 90);           // temporada pasada
  const con = creaAdaptadorLaPreferenteFederado({ fichas: (c) => c.categoria === 'aficionados' }).tipos.calendario
    .interpreta(utf('lapreferente-calendario-sintetico.html'), { contexto: ctx, url });
  assert.deepEqual(con.enlaces.map((e) => e.url.replace(/^.*\.com\//, '').slice(0, 16)), ['P4071790C22615/2', 'P4071801C22615/2']);
});

test('ficha: registro con el acta y la marca de menores en base', () => {
  const a = creaAdaptadorLaPreferenteFederado();
  const r = a.tipos.ficha.interpreta(utf('lapreferente-ficha-sintetica.html'), { contexto: { clave: 'P4072005', categoria: 'aficionados' } });
  assert.equal(r.registros[0].clave, 'P4072005');
  assert.equal(r.registros[0].datos.equipos.length, 2); assert.equal(r.registros[0].datos.menores, false);
  const b = a.tipos.ficha.interpreta(utf('lapreferente-ficha-sintetica.html'), { contexto: {}, url: 'https://www.lapreferente.com/P123C9/x' });
  assert.equal(b.registros[0].clave, 'P123');
  assert.equal(a.tipos.ficha.interpreta('<html></html>', { contexto: {} }).sinPublicar, true);
  assert.equal(CATEGORIAS_LP[45].genero, 'femenina');
});

test('metaCompleta: línea, comunidad, nacional y la URL de la federación de la que carga LP', async () => {
  const { metaCompleta } = await import('./lapreferente-federado.mjs');
  const m = metaCompleta(cp('lapreferente-competicion.html'));
  assert.equal(m.id, '23862'); assert.equal(m.id_ccaa, '1'); assert.equal(m.linea, '1773'); assert.equal(m.nacional, false);
  assert.equal(m.url_federacion, null);
  const h = `<select onChange="onChangeTemporada(this,{&quot;ID&quot;:&quot;22615&quot;,&quot;IDccaa&quot;:&quot;8&quot;,&quot;nacional&quot;:&quot;0&quot;,&quot;organizador&quot;:&quot;RFCYLF&quot;,&quot;IDgrupo&quot;:&quot;1328&quot;,&quot;flagDataLoader&quot;:&quot;1&quot;,&quot;urlDataLoaderResultados&quot;:&quot;https:\\/\\/www.rfcylf.es\\/pnfg\\/NPcd\\/NFG_VisCalendario_Vis?cod_primaria=1000120&amp;amp;codtemporada=21&amp;amp;codcompeticion=22911132&amp;amp;codgrupo=22911133&amp;amp;CodJornada=1&quot;},'x')">`;
  const c = metaCompleta(h);
  assert.equal(c.organizador, 'RFCYLF'); assert.equal(c.carga_automatica, true);
  assert.match(c.url_federacion, /^https:\/\/www\.rfcylf\.es\/pnfg\/NPcd\/NFG_VisCalendario_Vis\?cod_primaria=1000120&codtemporada=21&codcompeticion=22911132&codgrupo=22911133/);
  const n = metaCompleta(h.replace('&quot;IDccaa&quot;:&quot;8&quot;', '&quot;IDccaa&quot;:&quot;0&quot;'));
  assert.equal(n.nacional, true);
});

test('fichas por fichero: comunidades, nacionales y desde qué temporada', async () => {
  const { prioridadFichasDesdeFichero } = await import('./lapreferente-federado.mjs');
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const ruta = join(mkdtempSync(join(tmpdir(), 'lpf-')), 'f.json');
  const f = prioridadFichasDesdeFichero(ruta);
  assert.equal(f({ ccaa_lp: '9', temporada: '2020-21' }), false);           // sin fichero, nada
  writeFileSync(ruta, JSON.stringify({ ccaa: [9], nacionales: false, desde: '2019-20' }));
  assert.equal(f({ ccaa_lp: '9', temporada: '2020-21' }), true);
  assert.equal(f({ ccaa_lp: '9', temporada: '2018-19' }), false);
  assert.equal(f({ ccaa_lp: '8', temporada: '2020-21' }), false);
  assert.equal(f({ nacional: true, ccaa_lp: '0', temporada: '2020-21' }), false);
});

test('fichas para todas las comunidades: ventanas propias, temporada en curso, excluidas y prioridad por tramo', async () => {
  const { prioridadFichasDesdeFichero, prioridadFicha } = await import('./lapreferente-federado.mjs');
  const { temporadaEnCurso } = await import('./lapreferente.mjs');
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const ruta = join(mkdtempSync(join(tmpdir(), 'lpf-')), 'f.json');
  const t = String(temporadaEnCurso());
  const enCurso = `${t.slice(0, 4)}-${t.slice(6, 8)}`;
  writeFileSync(ruta, JSON.stringify({ ccaa: 'todas', nacionales: true, desde: '2010-11', por_ccaa: { 9: { hasta: '2024-25' } },
    en_curso: [15, 0], primero: [9, 15, 1, 13, 0], excluidas: [777] }));
  const f = prioridadFichasDesdeFichero(ruta);
  assert.equal(f({ id: 1, ccaa_lp: '9', temporada: '2024-25' }), true);
  assert.equal(f({ id: 1, ccaa_lp: '9', temporada: '2025-26' }), false, 'Cataluña sólo hasta 2024-25');
  assert.equal(f({ id: 1, ccaa_lp: '8', temporada: '2018-19' }), true, 'todas las comunidades');
  assert.equal(f({ id: 1, ccaa_lp: '8', temporada: '2009-10' }), false, 'desde 2010-11');
  assert.equal(f({ id: 1, ccaa_lp: '8', temporada: enCurso }), false, 'en curso sólo las de en_curso');
  assert.equal(f({ id: 1, ccaa_lp: '15', temporada: enCurso }), true, 'Madrid en curso (su federación no da actas)');
  assert.equal(f({ id: 1, nacional: true, ccaa_lp: '0', temporada: enCurso }), true);
  assert.equal(f({ id: 777, ccaa_lp: '1', temporada: '2020-21' }), false, 'excluida: la federación ya tiene sus actas');
  const año = new Date().getFullYear();
  assert.equal(prioridadFicha(`${año - 1}-${String(año % 100).padStart(2, '0')}`, { ccaa_lp: '1' }, ruta), 61);
  assert.equal(prioridadFicha(`${año - 1}-${String(año % 100).padStart(2, '0')}`, { ccaa_lp: '8' }, ruta), 71);
  assert.equal(prioridadFicha('2001-02', { ccaa_lp: '8' }, ruta), 79);
});
