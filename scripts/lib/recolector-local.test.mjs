import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import {
  abreBase, anioInicioDeTemporada, basePrioridadCompeticion, claveTrabajo, esCompeticionDeMenores,
  encola, extraeCompeticiones, extraeGrupos, extraeJornadas, extraePartidos, extraeTemporadas,
  guardaAtomico, inspeccionaActa, leeArchivo, peticionesHoy, preparaDesdeCatalogo,
  preparaGruposDesdeCatalogo, reactiva, registraPeticion, resumen, rutaJsonDeArchivo,
  seleccionaMuestrasCompeticion, siguienteTrabajo, validaPagina,
} from './recolector-local.mjs';
import { aplazaTemporadasViejas, reactivaTemporadasViejas } from './temporada-minima.mjs';

/** Marca de tiempo como la que usa la cola, para no depender del reloj del test. */
const ahoraIso = () => new Date().toISOString();

test('el JSON del análisis nunca se escribe sobre el HTML archivado (comprimido o no)', () => {
  // El 13/09/2026 se perdieron 1.521 HTML de actas por esto: `guardaAtomico` guarda el HTML como
  // `acta-1.html.gz`, y el reparador calculaba el JSON con `.replace(/\\.html$/i, '.json')`, que no
  // cambia nada cuando la ruta ya termina en `.gz`. El JSON se escribía encima del HTML comprimido.
  assert.equal(rutaJsonDeArchivo('C:/x/acta-1.html'), 'C:/x/acta-1.json');
  assert.equal(rutaJsonDeArchivo('C:/x/acta-1.html.gz'), 'C:/x/acta-1.json',
    'quitar el .gz antes de cambiar la extensión');
  assert.equal(rutaJsonDeArchivo('C:/x/acta-1.json.gz'), 'C:/x/acta-1.json');
  assert.equal(rutaJsonDeArchivo('C:/x/clasificacion.html'), 'C:/x/clasificacion.json');
  assert.notEqual(rutaJsonDeArchivo('C:/x/acta-1.html.gz'), 'C:/x/acta-1.html.gz',
    'la ruta del JSON no puede ser la del HTML: sería sobreescribirlo');
});

test('los ficheros grandes se archivan comprimidos y se vuelven a leer igual', () => {
  // El disco es el recurso que se agota en silencio: el HTML de las federaciones pesa 24-202 KB por
  // acta y el trabajo que queda son millones de ficheros. Se comprime, pero sin perder la capacidad de
  // reinterpretar el HTML original sin volver a pedirlo.
  const carpeta = mkdtempSync(join(tmpdir(), 'facylf-archivo-'));
  try {
    const db = abreBase(join(carpeta, 'cola-v2.sqlite'));
    const grande = `<html><body>${'<tr><td>partido</td></tr>'.repeat(1200)}</body></html>`;
    const ruta = join(carpeta, 'acta-1.html');
    const guardado = guardaAtomico(ruta, grande, db, 'acta');
    assert.equal(guardado.comprimido, true, 'un HTML de ~40 KB debe comprimirse');
    assert.equal(existsSync(ruta), false, 'no se deja además una copia sin comprimir');
    assert.equal(existsSync(`${ruta}.gz`), true);
    assert.ok(guardado.bytes < grande.length / 5, 'debe ocupar bastante menos');
    assert.equal((leeArchivo(ruta) ?? '').toString('utf8'), grande, 'se lee igual que se escribió');
    assert.equal((leeArchivo(`${ruta}.gz`) ?? '').toString('utf8'), grande,
      'también se descomprime cuando SQLite guarda la ruta física terminada en .gz');
    assert.ok(gunzipSync(readFileSync(`${ruta}.gz`)).length === Buffer.byteLength(grande));

    const pequeno = '{"a":1}';
    const rutaPequena = join(carpeta, 'acta-2.json');
    const guardadoPequeno = guardaAtomico(rutaPequena, pequeno, db, 'acta');
    assert.equal(guardadoPequeno.comprimido, false, 'lo pequeño no compensa comprimirlo');
    assert.equal(existsSync(rutaPequena), true);
    assert.equal((leeArchivo(rutaPequena) ?? '').toString('utf8'), pequeno);
    assert.equal(leeArchivo(join(carpeta, 'no-existe.html')), null);

    // Y aunque alguien pida una ruta `.gz` con contenido pequeño, el fichero es gzip de verdad:
    // `.gz` significa siempre gzip, así que `leeArchivo` nunca se encuentra un plano disfrazado.
    const rutaForzada = join(carpeta, 'acta-9.html.gz');
    const guardadoForzado = guardaAtomico(rutaForzada, pequeno, db, 'acta');
    assert.equal(guardadoForzado.comprimido, true, 'una ruta .gz se comprime aunque el contenido sea pequeño');
    assert.equal(guardadoForzado.ruta, rutaForzada, 'y se guarda exactamente en esa ruta');
    assert.equal(readFileSync(rutaForzada).subarray(0, 2).toString('hex'), '1f8b', 'la cabecera es gzip');
    assert.equal((leeArchivo(rutaForzada) ?? '').toString('utf8'), pequeno);
    db.close();
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
});


test('los códigos se acotan por temporada, no se consideran globales', () => {
  assert.notEqual(
    claveTrabajo('grupos', { temporada: '11', competicion: '2316' }),
    claveTrabajo('grupos', { temporada: '12', competicion: '2316' }),
  );
  assert.equal(anioInicioDeTemporada('11'), 2015);
});

test('las actas de categorías de menores quedan bloqueadas por defecto', () => {
  assert.equal(esCompeticionDeMenores('1ª División Provincial de Juveniles'), true);
  assert.equal(esCompeticionDeMenores('2ª División Regional Cadete'), true);
  assert.equal(esCompeticionDeMenores('Liga Galega Xuvenil'), true);
  assert.equal(esCompeticionDeMenores('Primeira Benxamín'), true);
  assert.equal(esCompeticionDeMenores('Prebenxamín Fútbol 8'), true);
  assert.equal(esCompeticionDeMenores('Campeonato Regional Zagalín'), true);
  assert.equal(esCompeticionDeMenores('Liga de Iniciación'), true);
  assert.equal(esCompeticionDeMenores('1ª División Provincial de Aficionados'), false);
});

test('prioriza Tercera RFEF y ascensos sin confundirlos con terceras provinciales', () => {
  assert.equal(basePrioridadCompeticion('Tercera Federación', 'Grupo VIII'), 5);
  assert.equal(basePrioridadCompeticion('Campeonato Nacional de Liga de 3ª División', 'Grupo VIII'), 5);
  assert.equal(basePrioridadCompeticion('1ª División Regional Play Off de Ascenso', 'Único'), 5);
  assert.equal(basePrioridadCompeticion('Play Off de Ascenso a Tercera Federación', 'Único'), 5);
  assert.equal(basePrioridadCompeticion('3ª División Provincial de Cadetes', 'Play Off Ascenso - Valladolid'), 5);
  assert.equal(basePrioridadCompeticion('3ª División Provincial de Alevines', 'Primera - Salamanca Grupo 4'), 5);
  assert.equal(basePrioridadCompeticion('2ª División Provincial de Benjamines', 'Primera - Salamanca'), 5);
  assert.equal(basePrioridadCompeticion('Liga Nacional Juvenil', 'Primera - III'), 5);
  assert.equal(basePrioridadCompeticion('1ª División Provincial de Aficionados', 'Primera - Zamora'), 60);
  assert.equal(basePrioridadCompeticion('2ª División Provincial de Juveniles', 'Primera - León'), 70);
  assert.equal(basePrioridadCompeticion('3ª División Provincial de Alevines', 'Primera - León'), 80);
  assert.equal(basePrioridadCompeticion('3ª División Provincial de Aficionados', 'Primera - León'), 90);
  assert.equal(basePrioridadCompeticion('Tercera Federación de Fútbol Femenino', 'Grupo único'), 150);
});

test('extrae la jerarquía de los controles reales', () => {
  const html = `<html><body>
    <select id="temporada"><option value="22">2026-2027</option></select>
    <select id="competicion"><option value="0">Elige</option><option value="2316">Aficionados</option></select>
    <select id="grupo"><option value="8652">Primera - Salamanca</option></select>
    <select id="jornada"><option value="22">22 - 01-05-2016</option></select>
  </body></html>${' '.repeat(1200)}`;
  assert.deepEqual(extraeCompeticiones(html), [{ codigo: '2316', nombre: 'Aficionados' }]);
  assert.deepEqual(extraeTemporadas(html), [{ codigo: '22', nombre: '2026-2027' }]);
  assert.deepEqual(extraeGrupos(html), [{ codigo: '8652', nombre: 'Primera - Salamanca' }]);
  assert.deepEqual(extraeJornadas(html), [{ numero: 22, fecha: '2016-05-01' }]);
  assert.equal(validaPagina('catalogo_temporada', html).ok, true);
});

test('una página vacía no se confunde con un bloqueo de la web', () => {
  // Regresión: una respuesta corta se etiquetaba como barrera y activaba una pausa global de 24 h,
  // así que una sola página sin contenido paraba una federación entera. No es un bloqueo.
  for (const html of ['', '<html></html>', '<html><body>sin contenido</body></html>']) {
    const r = validaPagina('indice_jornadas', html);
    assert.equal(r.ok, false);
    assert.equal(r.bloqueo, false, 'una página vacía no es una barrera');
  }
  // El texto de una barrera real sí debe seguir marcándose como bloqueo.
  const reto = `<html><body>${'x'.repeat(1500)} access denied</body></html>`;
  const r = validaPagina('indice_jornadas', reto);
  assert.equal(r.ok, false);
  assert.equal(r.bloqueo, true, 'un acceso denegado sí es una barrera');
});

test('la página 503 de la fuente se marca como sobrecarga, no como página vacía', () => {
  // Andalucía acumulaba 191 rechazos de 310 bytes con esta pinta: la página de Apache diciendo que
  // el servidor no puede atender. Se trataba como «página vacía» y se seguía pidiendo al mismo
  // ritmo a un servidor que acababa de pedir que se le dejara en paz.
  const apache = `<html><head>
<title>503 Service Unavailable</title>
</head><body>
<h1>Service Unavailable</h1>
<p>The server is temporarily unable to service your
request due to maintenance downtime or capacity
problems. Please try again later.</p>
<hr>
<address>Apache Server at www.rfaf.es Port 443</address>

</body></html>`;
  const r = validaPagina('acta', apache);
  assert.equal(r.ok, false);
  assert.equal(r.sobrecarga, true, 'un 503 de la fuente es sobrecarga');
  assert.notEqual(r.bloqueo, true, 'no es una barrera contra nosotros');
});

test('la fecha centinela de una jornada sin fecha se guarda como desconocida', () => {
  // La Rioja publica 01-01-9999 en las jornadas que aún no tienen fecha. Guardarla tal cual hacía
  // que la web y los informes mostraran «última jornada prevista 9999-01-01».
  const html = `<html><body><select id="jornada">
    <option value="1">1 - 05-09-2026</option>
    <option value="21">21 - 01-01-9999</option>
    <option value="22">22 - 01-01-9999</option>
  </select>${' '.repeat(1200)}</body></html>`;
  assert.deepEqual(extraeJornadas(html), [
    { numero: 1, fecha: '2026-09-05' },
    { numero: 21, fecha: null },
    { numero: 22, fecha: null },
  ]);
});

test('deduplica partidos de tablas anidadas por código de acta', () => {
  const partido = `<table><tr><td><a href="NFG_VisEquipos?Codigo_Equipo=1">Local</a></td>
    <td><a href="NFG_VisEquipos?Codigo_Equipo=2">Visitante</a></td>
    <td><a href="NFG_CmpPartido?CodActa=99">Acta</a></td></tr></table>`;
  const html = `<html><body><table><tr><td>${partido}</td></tr></table>${partido}</body></html>`;
  assert.deepEqual(extraePartidos(html), [{
    local: 'Local', visitante: 'Visitante', codLocal: '1', codVisitante: '2', codActa: '99',
  }]);
});

test('conserva dos partidos distintos aunque el portal repita por error el código de acta', () => {
  const partido = (local, visitante, codLocal, codVisitante) => `<table><tr>
    <td><a href="NFG_VisEquipos?Codigo_Equipo=${codLocal}">${local}</a></td>
    <td><a href="NFG_VisEquipos?Codigo_Equipo=${codVisitante}">${visitante}</a></td>
    <td><a href="NFG_CmpPartido?CodActa=99">Acta</a></td></tr></table>`;
  const encontrados = extraePartidos(`<html><body>
    ${partido('Local A', 'Visitante A', '1', '2')}
    ${partido('Local B', 'Visitante B', '3', '4')}
  </body></html>`);
  assert.equal(encontrados.length, 2);
  assert.deepEqual(encontrados.map((p) => [p.local, p.visitante, p.codActa]), [
    ['Local A', 'Visitante A', '99'],
    ['Local B', 'Visitante B', '99'],
  ]);
});

test('distingue filas de jugador sin nombre visible al inspeccionar un acta', () => {
  const html = `<table>
    <tr onclick="location.href='?jugador=1'"><td>1</td><td>ANA MARTÍN</td></tr>
    <tr onclick="location.href='?jugador=2'"><td>14</td><td></td><td></td></tr>
  </table>`;
  assert.deepEqual(inspeccionaActa(html), {
    jugadores: 2, conIdentificador: 2, conNombre: 1, goles: 0, cambios: 0, tarjetas: 0,
  });
});

test('prepara sólo las temporadas que se van a trabajar y separa las competiciones por año', () => {
  const db = abreBase(':memory:');
  // El catálogo trae tres temporadas; sólo entran las que están por encima del suelo de trabajo
  // (2023-24 en adelante). Las antiguas ni se registran ni encolan: no se va a ir a por ellas.
  const resultado = preparaDesdeCatalogo(db, {
    '18': [{ codCompeticion: '1', nombre: 'vieja' }],
    '21': [{ codCompeticion: '2316', nombre: 'uno' }],
    '22': [{ codCompeticion: '2316', nombre: 'dos' }],
  }, 2015);
  assert.deepEqual(resultado, { temporadas: 2, competiciones: 2 });
  const r = resumen(db);
  assert.equal(r.temporadas, 2);
  assert.equal(r.competiciones, 2);
  assert.equal(r.trabajos.reduce((n, x) => n + Number(x.n), 0), 4);
  assert.equal(db.prepare("select count(*) n from temporadas where codigo='18'").get().n, 0);
  assert.equal(db.prepare("select count(*) n from trabajos where temporada='18'").get().n, 0);
  assert.equal(preparaGruposDesdeCatalogo(db, {
    '21': [{ codCompeticion: '2316', grupos: [
      { codGrupo: '8652', nombre: 'Salamanca' },
      { codGrupo: '8653', nombre: 'Segovia' },
    ] }],
  }, 2015), 2);
  assert.equal(resumen(db).grupos, 2);
  assert.equal(db.prepare('select estado from grupos limit 1').get().estado, 'candidato');
  db.close();
});

test('actas y trabajos no dependen de que un código sea global', () => {
  const db = abreBase(':memory:');
  const inserta = db.prepare(`insert into actas
    (codigo,temporada,competicion,grupo,jornada,menores,estado) values(?,?,?,?,?,?,?)`);
  inserta.run('99', '11', '2316', '8652', 1, 0, 'pendiente');
  inserta.run('99', '12', '2316', '9000', 1, 0, 'pendiente');
  assert.equal(db.prepare('select count(*) n from actas where codigo=?').get('99').n, 2);

  const datos = { temporada: '11', competicion: '2316' };
  const clave = encola(db, 'grupos', datos, 20, 'https://example.test/primera');
  db.prepare("update trabajos set estado='cancelado' where clave=?").run(clave);
  encola(db, 'grupos', datos, 20, 'https://example.test/segunda');
  reactiva(db, clave);
  const trabajo = db.prepare('select estado,url from trabajos where clave=?').get(clave);
  assert.deepEqual({ ...trabajo }, { estado: 'pendiente', url: 'https://example.test/segunda' });
  db.close();
});

test('el presupuesto diario usa el día civil de Madrid, no el día UTC', () => {
  // El 19/09/2026 esta prueba estaba en rojo: se guardaba la marca de tiempo en UTC y se contaba comparando la
  // fecha de Madrid contra `substr(iniciada_en, 1, 10)`, así que una petición de las 23:30 UTC del 31 de enero
  // (00:30 del 1 de febrero en Madrid) contaba para el 31. El cupo se renovaba a medianoche UTC y en esa hora se
  // podían colar peticiones de más. Ahora la cola guarda el día de Madrid de cada petición.
  const db = abreBase(':memory:');
  registraPeticion(db, {
    url: 'https://example.test', iniciadaEn: '2026-01-31T23:30:00.000Z', resultado: 'ok',
  });
  assert.equal(peticionesHoy(db, '2026-02-01'), 1, 'en Madrid esa petición es del 1 de febrero');
  assert.equal(peticionesHoy(db, '2026-01-31'), 0);
  db.close();
});

test('el día de Madrid se calcula igual en verano y en invierno', () => {
  // Con el cambio de hora el desfase es de una o dos horas: si se contara con una regla fija, el cupo se
  // renovaría a una hora distinta según el mes.
  const db = abreBase(':memory:');
  registraPeticion(db, { url: 'https://example.test/1', iniciadaEn: '2026-07-31T22:30:00.000Z' }); // 00:30 del 1
  registraPeticion(db, { url: 'https://example.test/2', iniciadaEn: '2026-07-31T21:30:00.000Z' }); // 23:30 del 31
  assert.equal(peticionesHoy(db, '2026-08-01'), 1);
  assert.equal(peticionesHoy(db, '2026-07-31'), 1);
  db.close();
});

test('una cola de antes recibe la columna del día de Madrid y sus peticiones se rellenan', () => {
  // En el servidor no se migra nada a mano: la primera vez que el recolector abre la cola, la columna se añade,
  // se rellenan las peticiones que ya había y el índice del cupo pasa a ser el nuevo. Si esto fallara, el
  // presupuesto diario se contaría con dos criterios distintos según la antigüedad de cada línea.
  const carpeta = mkdtempSync(join(tmpdir(), 'facylf-cola-vieja-'));
  const ruta = join(carpeta, 'cola-v2.sqlite');
  try {
    const vieja = new DatabaseSync(ruta);
    vieja.exec(`create table peticiones (
      id integer primary key, trabajo text, url text not null, iniciada_en text not null,
      duracion_ms integer, resultado text, detalle text);
      insert into peticiones(url, iniciada_en) values('https://example.test/vieja', '2026-01-31T23:30:00.000Z');
      create index peticiones_dia on peticiones(substr(iniciada_en, 1, 10));`);
    vieja.close();

    const db = abreBase(ruta);
    const columnas = db.prepare('pragma table_info(peticiones)').all().map((c) => c.name);
    assert.ok(columnas.includes('dia_madrid'), 'la columna se añade sola');
    assert.equal(db.prepare("select dia_madrid from peticiones where url like '%vieja'").get().dia_madrid, '2026-02-01');
    const sqlIndice = db.prepare("select sql from sqlite_master where type='index' and name='peticiones_dia'").get()?.sql ?? '';
    assert.match(sqlIndice, /dia_madrid/);
    assert.doesNotMatch(sqlIndice, /substr/i, 'el índice viejo (de la expresión) se sustituye por el nuevo');
    assert.equal(peticionesHoy(db, '2026-02-01'), 1);
    db.close();
  } finally {
    try { rmSync(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* temporal */ }
  }
});

test('un relleno que se quedó a medias se termina en el siguiente arranque', () => {
  // Medido el 19/09/2026: la cola de `federacion` tenía la columna del día de Madrid puesta y 36.768 peticiones
  // SIN rellenar, porque el relleno se cortó a medias (una sesión que muere, un bloqueo) y la condición era «sólo
  // si la columna acaba de crearse». Un relleno que no se puede reanudar deja el cupo diario mal contado para
  // siempre: las peticiones de esos días no se contarían nunca.
  const carpeta = mkdtempSync(join(tmpdir(), 'facylf-relleno-a-medias-'));
  const ruta = join(carpeta, 'cola-v2.sqlite');
  try {
    const aMedias = new DatabaseSync(ruta);
    aMedias.exec(`create table peticiones (
      id integer primary key, trabajo text, url text not null, iniciada_en text not null,
      duracion_ms integer, resultado text, detalle text, dia_madrid text);
      create index peticiones_dia on peticiones(dia_madrid);
      insert into peticiones(url, iniciada_en, dia_madrid) values
        ('https://example.test/hecha', '2026-01-31T12:00:00.000Z', '2026-01-31'),
        ('https://example.test/a-medias', '2026-01-31T23:30:00.000Z', null);`);
    aMedias.close();

    const db = abreBase(ruta);
    assert.equal(db.prepare('select count(*) n from peticiones where dia_madrid is null').get().n, 0,
      'no puede quedar ninguna petición sin su día');
    assert.equal(db.prepare("select dia_madrid from peticiones where url like '%a-medias'").get().dia_madrid, '2026-02-01');
    assert.equal(peticionesHoy(db, '2026-02-01'), 1, 'y el cupo del día las cuenta');
    assert.ok(db.prepare("select valor from metadatos where clave='dia_madrid_relleno'").get()?.valor, 'queda constancia del relleno');
    db.close();
  } finally {
    try { rmSync(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* temporal */ }
  }
});

test('una cola nueva se crea entera: la tabla de peticiones va antes que su índice', () => {
  // El 19/09/2026, en una cola recién creada, `create index ... on peticiones(...)` iba ANTES de la tabla y
  // `db.exec` cortaba ahí la lista: no se creaban `peticiones`, ni `archivos`, ni `eventos`, ni nada de lo que
  // venía detrás. En el PC no se notó porque las colas son de antes; en un servidor nuevo, la primera
  // federación que arranca se queda sin tablas y el recolector no puede guardar nada.
  const carpeta = mkdtempSync(join(tmpdir(), 'facylf-cola-nueva-'));
  try {
    const db = abreBase(join(carpeta, 'cola-v2.sqlite'));
    const tablas = db.prepare("select name from sqlite_master where type='table'").all().map((f) => f.name);
    for (const esperada of ['metadatos', 'temporadas', 'trabajos', 'peticiones', 'archivos', 'eventos', 'actas']) {
      assert.ok(tablas.includes(esperada), `falta la tabla ${esperada} en una cola nueva`);
    }
    assert.ok(db.prepare("select count(*) n from sqlite_master where type='index' and name='peticiones_dia'").get().n > 0,
      'el índice del cupo diario existe desde el principio');
    db.close();
  } finally {
    try { rmSync(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* temporal */ }
  }
});

test('elige muestras variadas y sin repetir códigos', () => {
  const muestras = seleccionaMuestrasCompeticion([
    { codCompeticion: '1', nombre: '1ª División Provincial de Aficionados' },
    { codCompeticion: '2', nombre: 'Liga Femenina Regional' },
    { codCompeticion: '3', nombre: 'Tercera División de Fútbol Sala' },
    { codCompeticion: '4', nombre: 'Liga Nacional Juvenil' },
  ], 3);
  assert.deepEqual(muestras.map((m) => m.codCompeticion), ['1', '2', '3']);
});

test('el suelo de temporadas: no se crea ni se coge trabajo anterior a 2023-24', () => {
  // Decisión del cliente (14/9/2026): de momento sólo se recogen 23-24 en adelante, para terminar
  // antes la ingesta. Lo ya recogido de antes no se tira: queda aplazado.
  const db = abreBase(':memory:');
  const temporada = db.prepare('insert into temporadas(codigo,etiqueta,origen) values(?,?,?)');
  temporada.run('11', '2015-16', 'web');
  temporada.run('19', '2023-24', 'web');
  temporada.run('22', '2026-27', 'web');

  // No se encola trabajo de una temporada por debajo del suelo…
  encola(db, 'jornada', { temporada: '11', competicion: '1', grupo: '1', jornada: 1 }, 13, 'https://example.test/vieja');
  assert.equal(db.prepare("select count(*) n from trabajos where temporada='11'").get().n, 0);
  // …y sí de las que entran, incluida la que está justo en el suelo.
  encola(db, 'jornada', { temporada: '19', competicion: '1', grupo: '1', jornada: 1 }, 13, 'https://example.test/limite');
  encola(db, 'jornada', { temporada: '22', competicion: '1', grupo: '1', jornada: 1 }, 13, 'https://example.test/actual');
  assert.equal(db.prepare("select count(*) n from trabajos where temporada in ('19','22')").get().n, 2);

  // Si quedara trabajo viejo encolado de antes, no se coge: se coge el reciente.
  db.prepare(`insert into trabajos(clave,tipo,temporada,competicion,grupo,jornada,prioridad,creado_en,actualizado_en)
    values('vieja|1','jornada','11','1','1',1,0,?,?)`).run(ahoraIso(), ahoraIso());
  assert.notEqual(siguienteTrabajo(db).temporada, '11', 'un trabajo de 2015-16 no se debe coger');

  // Aplazar deja el trabajo viejo donde está, pero fuera de juego, y se puede deshacer.
  const aplazados = aplazaTemporadasViejas(db);
  assert.equal(aplazados, 1);
  const viejo = db.prepare("select siguiente_intento from trabajos where temporada='11'").get();
  assert.ok(viejo.siguiente_intento > '2090', 'queda aplazado, no cancelado ni borrado');
  assert.equal(db.prepare("select count(*) n from trabajos where temporada='11' and estado='pendiente'").get().n, 1);
  assert.equal(reactivaTemporadasViejas(db), 1);
  assert.equal(db.prepare("select siguiente_intento from trabajos where temporada='11'").get().siguiente_intento, null);
  db.close();
});

test('una temporada que el catálogo todavía no conoce no se descarta', () => {
  // No se tira trabajo por un catálogo incompleto: las federaciones nuevas se descubren sobre la marcha.
  const db = abreBase(':memory:');
  encola(db, 'jornada', { temporada: '99', competicion: '1', grupo: '1', jornada: 1 }, 13, 'https://example.test/nueva');
  assert.equal(db.prepare("select count(*) n from trabajos where temporada='99'").get().n, 1);
  assert.equal(siguienteTrabajo(db).temporada, '99');
  db.close();
});

test('a igual prioridad elige la temporada reciente y completa antes sus actas', () => {
  const db = abreBase(':memory:');
  encola(db, 'jornada', { temporada: '11', competicion: '1', grupo: '1', jornada: 1 }, 13, 'https://example.test/antigua');
  encola(db, 'jornada', { temporada: '22', competicion: '2', grupo: '2', jornada: 1 }, 13, 'https://example.test/reciente');
  const claveActa = encola(db, 'acta', { temporada: '22', competicion: '2', grupo: '2', jornada: 1, acta: '99' }, 13, 'https://example.test/acta');
  assert.equal(siguienteTrabajo(db).clave, claveActa);
  db.prepare("update trabajos set estado='hecho' where clave=?").run(claveActa);
  assert.deepEqual(
    (({ temporada, tipo }) => ({ temporada, tipo }))(siguienteTrabajo(db)),
    { temporada: '22', tipo: 'jornada' },
  );
  db.close();
});
