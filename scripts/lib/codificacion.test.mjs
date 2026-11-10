/*
 * ── PRUEBAS DE LA COMPROBACIÓN DE CODIFICACIÓN ───────────────────────────────────────────────────────────────
 *
 * Estas pruebas vienen de daños REALES y de lo que cuesta no verlos:
 *
 *   · la doble codificación (UTF-8 leído como Latin-1: «Ã¡» por «á», «Ã©» por «é», «Â» por «Â») entra sin ruido
 *     por una fuente que devuelve bytes y un lector que los trata como texto. En la base NO falla nada: la cadena
 *     es UTF-8 válido, sólo es la cadena equivocada. Por eso hay que buscarla, no la detecta PostgreSQL;
 *   · el carácter de reemplazo U+FFFD dice que algo se perdió por el camino y ya no se puede reconstruir;
 *   · un fichero con bytes que no son UTF-8 válidos se lee hoy a medias y mañana revienta en otro sitio.
 *
 * El contrato es duro: si hay una sola muestra mal codificada, la comprobación devuelve fallo (y el CLI sale con
 * 1). No hay «avisos» que se puedan ignorar, porque este chequeo va dentro del ciclo diario.
 *
 * Se ejecuta con:  node --test scripts/lib/codificacion.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  analizaBytes, analizaFichero, analizaFicheros, analizaTexto, asciiSeguro, COLUMNAS_DE_NOMBRE,
  compruebaCanonico, esTextoASCII, esUTF8Valido, lineasDeProblemas, resumenDeComprobacion,
  sqlDeNombresSospechosos, TIPOS,
} from './codificacion.mjs';

const MODULO = join(dirname(fileURLToPath(import.meta.url)), 'codificacion.mjs');

/** Un directorio temporal por prueba: los ficheros que se escriben aquí no tocan el repositorio. */
function conCarpeta(prueba) {
  const carpeta = mkdtempSync(join(tmpdir(), 'facylf-codificacion-'));
  try {
    return prueba(carpeta);
  } finally {
    try { rmSync(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* se queda */ }
  }
}

const TIPOS_DE = (resultado) => resultado.problemas.map((p) => p.tipo);

test('el texto bien codificado no da problemas', () => {
  for (const bueno of ['Malaga CF', 'Málaga CF', 'Atlético de Madrid', 'Unión Deportiva Salamanca',
    'Peña Sport', 'Castilla y León', '1ª División Regional', '', 'Numancia 2-1 Burgos']) {
    const r = analizaTexto(bueno);
    assert.equal(r.ok, true, `«${bueno}» está bien y no debe dar problemas: ${JSON.stringify(r.problemas)}`);
    assert.deepEqual(r.problemas, []);
  }
});

test('el portugués bien escrito NO es corrupción (la «Ã» delante de una letra ASCII es legítima)', () => {
  /* Medido el 10/11/2026 sobre el canónico: 43 nombres con «Ã» o «Â» y casi todos son portugueses correctos. Si se
   * marcara la letra suelta, el ciclo diario saldría rojo todos los días por datos buenos y dejaría de mirarse. La
   * marca es el byte ALTO detrás de la letra (Ã + «¡»), no la letra sola. */
  for (const legitimo of ['JOÃO PEDRO', 'MAGALHÃES PEREIRA', 'QUINTÃO, PEDRO', 'CÂMARA MUNICIPAL',
    'SÃO PAULO', 'ESTEVÃO', 'CONCEIÇÃO', 'ÃLEX']) {
    const r = analizaTexto(legitimo);
    assert.equal(r.ok, true, `«${legitimo}» está bien escrito y no debe dar problemas: ${JSON.stringify(r.problemas)}`);
  }
});

test('la doble codificación se ve: Ã¡, Ã©, Ã³, Ã±, Â y la raya', () => {
  /* Cada cadena es el daño real de leer UTF-8 como Latin-1. La lista cubre las que han aparecido en el repositorio:
   * acentos (Ã¡, Ã©, Ã³, Ã±), la «Â» de los signos de dos bytes (Â«, Â», Â + espacio duro) y la raya (â€”) que rompía
   * los .ps1 al leerse como ANSI. */
  const corrompidas = ['MÃ¡laga CF', 'AtlÃ©tico', 'UniÃ³n', 'PeÃ±a', 'Â«Fondo PopularÂ»', 'precioÂ\u00A020',
    'raya â€” y mÃ¡s', 'competiciÃ³n', 'SÃ?NCHEZ PERERA', 'JIMÃ?NEZ'];
  for (const mala of corrompidas) {
    const r = analizaTexto(mala);
    assert.equal(r.ok, false, `«${mala}» está doblemente codificada y debe fallar`);
    assert.ok(TIPOS_DE(r).includes(TIPOS.DOBLE), `«${mala}» debe marcarse como doble codificación: ${JSON.stringify(r.problemas)}`);
  }
});

test('el carácter de reemplazo U+FFFD es un fallo, no un aviso', () => {
  const r = analizaTexto('Real \uFFFDoviedo');
  assert.equal(r.ok, false);
  assert.ok(TIPOS_DE(r).includes(TIPOS.REEMPLAZO));
});

test('los controles C1 (U+0080-U+009F) delatan una conversión mal hecha', () => {
  // «Ã\x81» es el daño de «Á» (C3 81) leído como Latin-1: el segundo byte cae en los controles C1.
  const r = analizaTexto('Ã\u0081lava');
  assert.equal(r.ok, false);
  assert.ok(TIPOS_DE(r).includes(TIPOS.DOBLE) || TIPOS_DE(r).includes(TIPOS.CONTROL),
    `debe marcarse como doble codificación o control C1: ${JSON.stringify(r.problemas)}`);
  // Y el control C1 suelto, sin la «Ã» delante, también se marca.
  assert.ok(TIPOS_DE(analizaTexto('Alava\u0081')).includes(TIPOS.CONTROL));
});

test('UTF-8 inválido: se detecta sobre BYTES, no sobre el texto ya decodificado', () => {
  const valido = Buffer.from('Málaga', 'utf8');
  assert.equal(esUTF8Valido(valido), true);
  // 0xC3 sin su byte de continuación: la secuencia más típica de un fichero cortado a mitad de carácter.
  const roto = Buffer.from([0x4d, 0xc3, 0x28, 0x41]);
  assert.equal(esUTF8Valido(roto), false);
  const r = analizaBytes(roto);
  assert.equal(r.ok, false);
  assert.ok(TIPOS_DE(r).includes(TIPOS.UTF8_INVALIDO), JSON.stringify(r.problemas));
});

test('un byte 0x00 o un BOM no se confunden con corrupción', () => {
  // Un fichero UTF-8 con BOM es válido (y frecuente en PowerShell 5.1): no debe fallar por el BOM.
  const conBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Málaga', 'utf8')]);
  assert.equal(esUTF8Valido(conBom), true);
  assert.equal(analizaBytes(conBom).ok, true, JSON.stringify(analizaBytes(conBom).problemas));
});

test('un fichero limpio pasa y un fichero con una sola cadena corrupta falla', () => {
  conCarpeta((carpeta) => {
    const limpio = join(carpeta, 'limpio.txt');
    writeFileSync(limpio, 'Federación de Castilla y León\nMálaga CF\n', 'utf8');
    const rLimpio = analizaFichero(limpio);
    assert.equal(rLimpio.existe, true);
    assert.equal(rLimpio.ok, true, JSON.stringify(rLimpio.problemas));

    const corrupto = join(carpeta, 'corrupto.txt');
    writeFileSync(corrupto, 'FederaciÃ³n de Castilla y LeÃ³n\n', 'utf8');
    const rCorrupto = analizaFichero(corrupto);
    assert.equal(rCorrupto.ok, false);
    assert.ok(TIPOS_DE(rCorrupto).includes(TIPOS.DOBLE));

    // Los bytes rotos de verdad (no el texto): 0xC3 0x28 en medio.
    const bytesRotos = join(carpeta, 'bytes-rotos.txt');
    writeFileSync(bytesRotos, Buffer.from([0x41, 0xc3, 0x28, 0x42]));
    assert.equal(analizaFichero(bytesRotos).ok, false);
    assert.ok(TIPOS_DE(analizaFichero(bytesRotos)).includes(TIPOS.UTF8_INVALIDO));
  });
});

test('un fichero que no existe no es un fallo: se omite y se dice', () => {
  // El ciclo diario comprueba ficheros que se crean a partir de la primera pasada (su propio registro). El
  // primer día no existen y eso no puede tumbar el ciclo.
  const r = analizaFichero(join(tmpdir(), 'facylf-no-existe-jamas.txt'));
  assert.equal(r.existe, false);
  assert.equal(r.ok, true);
  assert.equal(r.omitido, true);
});

test('el modo ASCII exige que TODO byte sea ASCII (los .ps1 de PowerShell 5.1)', () => {
  assert.equal(esTextoASCII('param() # solo ASCII'), true);
  assert.equal(esTextoASCII('Málaga'), false);
  conCarpeta((carpeta) => {
    const ascii = join(carpeta, 'ascii.ps1');
    writeFileSync(ascii, 'param([switch]$SoloComprobar)\r\nWrite-Host "ok"\r\n', 'ascii');
    assert.equal(analizaFichero(ascii, { soloASCII: true }).ok, true);

    const noAscii = join(carpeta, 'no-ascii.ps1');
    writeFileSync(noAscii, 'Write-Host "Málaga"\n', 'utf8');
    const r = analizaFichero(noAscii, { soloASCII: true });
    assert.equal(r.ok, false);
    assert.ok(TIPOS_DE(r).includes(TIPOS.NO_ASCII), JSON.stringify(r.problemas));
  });
});

test('el veredicto de varios ficheros cae si UNO solo falla', () => {
  conCarpeta((carpeta) => {
    const a = join(carpeta, 'a.txt');
    const b = join(carpeta, 'b.txt');
    writeFileSync(a, 'Málaga CF\n', 'utf8');
    writeFileSync(b, 'MÃ¡laga CF\n', 'utf8');
    const r = analizaFicheros([a, b]);
    assert.equal(r.ok, false);
    assert.equal(r.ficheros.length, 2);
    const resumen = resumenDeComprobacion({ ficheros: r });
    assert.equal(resumen.ok, false);
    assert.ok(resumen.problemas >= 1);
  });
});

test('asciiSeguro deja el texto en ASCII y se puede volver a leer', () => {
  assert.equal(asciiSeguro('MÃ¡laga'), 'M\\u00c3\\u00a1laga');
  assert.equal(esTextoASCII(asciiSeguro('Peña · «OK»')), true);
  assert.equal(asciiSeguro('texto normal'), 'texto normal');
});

test('los avisos de problema son ASCII seguro: se escriben en el registro, que también se comprueba', () => {
  // Si un aviso copiara la cadena corrupta tal cual, el registro quedaría contaminado y al día siguiente el ciclo
  // fallaría por su propio aviso. Este es el caso que pasó el 10/11/2026 (y que el propio registro delató).
  const bd = compruebaCanonico({ consulta: () => [{ tabla: 'core.person', columna: 'nombre_mostrado', id: '1', valor: 'SÃ?NCHEZ PERERA' }] });
  const lineas = lineasDeProblemas(resumenDeComprobacion({ bd }), bd, null);
  assert.ok(lineas.length > 0);
  for (const linea of lineas) assert.equal(esTextoASCII(linea), true, `el aviso debe ser ASCII: ${linea}`);
  assert.match(lineas.join('\n'), /\\u00c3/);
});

test('el CLI sale con 1 si el fichero que se le pasa está corrupto (y con 0 si está limpio)', () => {
  conCarpeta((carpeta) => {
    const limpio = join(carpeta, 'limpio.txt');
    writeFileSync(limpio, 'Peña Sport\n', 'utf8');
    const ok = spawnSync(process.execPath, [MODULO, '--ficheros', limpio], { encoding: 'utf8' });
    assert.equal(ok.status, 0, `un fichero limpio debe dar exit 0: ${ok.stdout}${ok.stderr}`);

    const corrupto = join(carpeta, 'corrupto.txt');
    writeFileSync(corrupto, 'PeÃ±a Sport\n', 'utf8');
    const mal = spawnSync(process.execPath, [MODULO, '--ficheros', corrupto], { encoding: 'utf8' });
    assert.equal(mal.status, 1, `un fichero corrupto debe dar exit 1: ${mal.stdout}${mal.stderr}`);
    assert.match(`${mal.stdout}${mal.stderr}`, /FALLO|doble/i);
  });
});

test('el CLI no toca la base si no se le pide (--bd)', () => {
  // Sin `--bd` el CLI no debe invocar psql/docker: así la prueba corre en cualquier máquina y el ciclo diario
  // puede comprobar sólo ficheros cuando la base está de mantenimiento.
  conCarpeta((carpeta) => {
    const limpio = join(carpeta, 'limpio.txt');
    writeFileSync(limpio, 'ok\n', 'utf8');
    const r = spawnSync(process.execPath, [MODULO, '--ficheros', limpio, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const salida = JSON.parse(r.stdout);
    assert.equal(salida.ok, true);
    assert.equal(salida.bd, null, 'sin --bd no debe haber comprobación de la base');
  });
});

test('la comprobación del canónico distingue lo benigno de la corrupción (sin Docker)', () => {
  // `consulta` inyectada: el filtro SQL devuelve lo que devolvería en la base real, y la autoridad es el detector
  // fino. Un portugués bien escrito que sale del filtro NO es un fallo; una «Ã?» sí.
  const filas = [
    { tabla: 'core.person', columna: 'nombre_mostrado', id: '1', valor: 'JOÃO PEDRO' },
    { tabla: 'core.person', columna: 'nombre_mostrado', id: '2', valor: 'SÃ?NCHEZ PERERA, JOSE MARÃ?A' },
    { tabla: 'core.club', columna: 'nombre_canonico', id: '9', valor: 'MÃ¡laga CF' },
  ];
  const r = compruebaCanonico({ consulta: () => filas });
  assert.equal(r.ok, false);
  assert.equal(r.benignas, 1, 'el portugués bien escrito no cuenta como problema');
  // Una fila puede llevar MÁS de una marca («SÃ?NCHEZ … MARÃ?A» lleva dos): lo que importa es que salgan todas
  // y que no se cuele ni una sola línea benigna como problema.
  const filasConProblema = new Set(r.problemas.map((p) => `${p.tabla}.${p.columna}#${p.id}`));
  assert.deepEqual([...filasConProblema].sort(), ['core.club.nombre_canonico#9', 'core.person.nombre_mostrado#2']);
  assert.ok(r.problemas.every((p) => p.tipo === TIPOS.DOBLE));

  const limpias = compruebaCanonico({ consulta: () => [filas[0]] });
  assert.equal(limpias.ok, true, 'sólo lo benigno no puede hacer fallar el ciclo');
});

test('el SQL del canónico acota a Castilla y León por defecto y puede pedirse global', () => {
  const cyl = sqlDeNombresSospechosos();
  assert.match(cyl, /castilla-leon/);
  for (const columna of COLUMNAS_DE_NOMBRE) {
    assert.ok(cyl.includes(columna.tabla) && cyl.includes(columna.columna), `falta ${columna.tabla}.${columna.columna}`);
  }
  // El SQL viaja por la entrada estándar de psql dentro del contenedor: tiene que ser ASCII puro o depende de la
  // codificación del cliente. Las marcas van con chr().
  assert.equal(/^[\x00-\x7F]*$/.test(cyl), true, 'el SQL debe ser ASCII puro');
  assert.equal(sqlDeNombresSospechosos(COLUMNAS_DE_NOMBRE, { alcance: 'global' }).includes('castilla-leon'), false);
});
