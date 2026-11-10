// Pruebas de las piezas puras de `scripts/claude/lista-escudos.mjs`.
//
// No tocan la base ni la red: comprueban lo que decide la lista —qué es un escudo servible, cuándo dos
// filas de `core.club` son el mismo club de verdad y qué causa se le pone a un club sin escudo—.
//
//   node --test scripts/claude/lista-escudos.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  causaDeClubSinEscudo,
  clasifica,
  detectaMimeImagen,
  mismoNombreReal,
  relacionDeNombre,
  tokensSignificativos,
  validaEscudo,
} from './lista-escudos.mjs';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');

test('detectaMimeImagen reconoce las firmas admitidas y no se cree un texto cualquiera', () => {
  assert.equal(detectaMimeImagen(png), 'image/png');
  assert.equal(detectaMimeImagen(jpeg), 'image/jpeg');
  assert.equal(detectaMimeImagen(webp), 'image/webp');
  assert.equal(detectaMimeImagen(svg), 'image/svg+xml');
  assert.equal(detectaMimeImagen(Buffer.from('esto no es una imagen')), null);
  assert.equal(detectaMimeImagen(Buffer.alloc(0)), null);
});

test('validaEscudo: un PNG cuyo sha256 coincide con la huella guardada está bien', () => {
  const sha = createHash('sha256').update(png).digest('hex');
  const veredicto = validaEscudo({ mime_type: 'image/png', sha256: sha, bytes: png.length, contenido: png });
  assert.equal(veredicto.problema, null);
  assert.equal(veredicto.mime_real, 'image/png');
});

test('validaEscudo distingue «binario vacío», «mime mentiroso» y «huella que no cuadra»', () => {
  const shaBueno = createHash('sha256').update(png).digest('hex');
  assert.equal(
    validaEscudo({ mime_type: 'image/png', sha256: shaBueno, bytes: 0, contenido: Buffer.alloc(0) }).problema,
    'binario-vacio');
  assert.equal(
    validaEscudo({ mime_type: 'image/jpeg', sha256: shaBueno, bytes: png.length, contenido: png }).problema,
    'mime-no-coincide');
  assert.equal(
    validaEscudo({ mime_type: 'image/png', sha256: 'a'.repeat(64), bytes: png.length, contenido: png }).problema,
    'sha-no-coincide');
  assert.equal(
    validaEscudo({ mime_type: 'image/png', sha256: shaBueno, bytes: png.length, contenido: Buffer.from('no soy png') }).problema,
    'mime-no-coincide');
});

test('tokensSignificativos se queda con lo que distingue un club de otro', () => {
  assert.deepEqual(tokensSignificativos('C.D. Peñaranda de Bracamonte'), ['bracamonte', 'penaranda']);
  // `UDS` es sigla del tipo de club («Unión Deportiva Salamanca»), no un distintivo: se cae con `C.D.`.
  assert.deepEqual(tokensSignificativos('C.F. Salamanca UDS'), ['salamanca']);
  assert.deepEqual(tokensSignificativos('C. y D. Leonesa S.A.D.'), ['leonesa']);
  assert.deepEqual(tokensSignificativos(''), []);
});

test('mismoNombreReal: sí al prefijo o al orden distinto, no a dos clubes distintos', () => {
  assert.equal(mismoNombreReal('C.D. Peñaranda de Bracamonte', 'Peñaranda Bracamonte'), true);
  assert.equal(mismoNombreReal('Gimnástica Segoviana', 'Gimnástica Segoviana C.F.'), true);
  assert.equal(mismoNombreReal('C.F. Salamanca UDS', 'Salamanca C.F. UDS'), true);
  assert.equal(mismoNombreReal('S.D. Ponferradina', 'S.D. Ponferradina S.A.D.'), true);
  // Dos clubes de la misma ciudad y nombre parecido, pero distintos: aquí no se puede «regalar» un escudo.
  assert.equal(mismoNombreReal('Real Burgos C.F. S.A.D.', 'Burgos C.F. S.A.D.'), false);
  assert.equal(mismoNombreReal('Real Valladolid C.F. S.A.D. Femenino', 'Real Valladolid C.F. S.A.D.'), false);
  // Con un solo token significativo manda la sigla: `U.D.` y `C.F.` son clubs distintos, no variantes.
  assert.equal(mismoNombreReal('Burgos U.D.', 'Burgos C.F. S.A.D.'), false);
  assert.equal(mismoNombreReal('F.S. Salamanca', 'Salamanca C.F. UDS'), false);
  assert.equal(mismoNombreReal('C.D. Isoba', 'C.D. Isoba'), true);
  assert.equal(mismoNombreReal('C.D. Isoba', 'C.D. Guijuelo'), false);
});

test('relacionDeNombre separa la evidencia firme de la que hay que revisar a mano', () => {
  assert.equal(relacionDeNombre('C.D. Guijuelo', 'Guijuelo'), 'firme');
  assert.equal(relacionDeNombre('S.D. Ponferradina', 'S.D. Ponferradina S.A.D.'), 'firme');
  // Siglas que no encajan del todo: candidato, no prueba.
  assert.equal(relacionDeNombre('C.D. Isoba Real', 'C.F. Isoba Real'), 'dudosa');
  assert.equal(relacionDeNombre('Burgos U.D.', 'Burgos C.F. S.A.D.'), null);
  assert.equal(relacionDeNombre('C.D. Isoba', 'C.D. Guijuelo'), null);
  // Con una sola palabra que identifique al club, un prefijo distinto no basta para afirmar nada.
  assert.equal(relacionDeNombre('C.D. Victoria C.F.', 'Victoria C.F.'), null);
});

test('causaDeClubSinEscudo: la causa es la fila que falta, no una impresión', () => {
  assert.equal(causaDeClubSinEscudo({ filas_asset: 0 }).causa, 'sin-fila-en-club_asset');
  assert.equal(causaDeClubSinEscudo({ filas_asset: 1, filas_no_vigentes: 1 }).causa, 'fila-no-vigente');
  assert.equal(causaDeClubSinEscudo({ filas_asset: 1, filas_vigentes_sin_binario: 1 }).causa, 'fila-sin-binario');
  assert.equal(causaDeClubSinEscudo({ filas_asset: 1, filas_otro_tipo: 1 }).causa, 'otro-tipo');
});

test('clasifica: separa «el escudo ya está en otra fila del mismo club» de «no hay escudo»', () => {
  const clubes = [
    { id: 1, nombre: 'C.D. Guijuelo', tiene_escudo: true, filas_asset: 1, filas_no_vigentes: 0,
      filas_vigentes_sin_binario: 0, filas_otro_tipo: 0, codigos: ['4203'], equipos: 10, inscripciones: 20 },
    { id: 2, nombre: 'C.D. Guijuelo', tiene_escudo: false, filas_asset: 0, filas_no_vigentes: 0,
      filas_vigentes_sin_binario: 0, filas_otro_tipo: 0, codigos: ['4203'], equipos: 3, inscripciones: 5 },
    { id: 3, nombre: 'C.D. Peñaranda Bracamonte', tiene_escudo: false, filas_asset: 0, filas_no_vigentes: 0,
      filas_vigentes_sin_binario: 0, filas_otro_tipo: 0, codigos: [], equipos: 1, inscripciones: 1 },
    { id: 4, nombre: 'C.D. Peñaranda de Bracamonte', tiene_escudo: true, filas_asset: 1, filas_no_vigentes: 0,
      filas_vigentes_sin_binario: 0, filas_otro_tipo: 0, codigos: [], equipos: 2, inscripciones: 2 },
    { id: 5, nombre: 'C.D. Isoba', tiene_escudo: false, filas_asset: 0, filas_no_vigentes: 0,
      filas_vigentes_sin_binario: 0, filas_otro_tipo: 0, codigos: ['7'], equipos: 1, inscripciones: 1 },
  ];
  const resultado = clasifica(clubes);
  assert.equal(resultado.con_escudo, 2);
  assert.equal(resultado.sin_escudo, 3);
  // El 2 comparte código de equipo con el 1: el escudo ya está en la base, en otra fila del mismo club.
  assert.equal(resultado.motivoPorClub.get(2), 'hermano-con-escudo-por-codigo');
  // El 3 solo coincide por nombre con el 4: evidencia de nombre, no de código.
  assert.equal(resultado.motivoPorClub.get(3), 'hermano-con-escudo-por-nombre');
  // El 5 es único: aquí sí falta el escudo de verdad.
  assert.equal(resultado.motivoPorClub.get(5), 'falta-de-verdad');
});
