import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FEDERACIONES_PNFG, FEDERACION_SIN_PERFIL, planDeFederaciones, esperaTrasTanda, entornoParaHijos,
  lineaDeRegistro, huerfanosDeFederacion, conDescendientes, workerAjeno, nombreLegible,
  supervisorAntiguoVivo,
} from './plan-flota.mjs';
import { configuracionFlotaLocal } from './configuracion-flota.mjs';

/*
 * PRUEBAS DEL SUPERVISOR ÚNICO
 *
 * Cada caso defiende un comportamiento que los 19 supervisores de PowerShell ya tenían y que se perdería
 * al sustituirlos por un solo proceso: que estén las 19 federaciones y ninguna dos veces, que las ventanas
 * de espera sean las de cada una (Madrid tenía tope de 5 min, no de 1 h), que Cataluña siga con su paso
 * previo y su espera por pendientes, que el entorno de la flota llegue intacto a los hijos y que la limpieza
 * de navegadores huérfanos NO toque el Chrome del usuario ni el de otra federación.
 */

test('el plan cubre las 19 federaciones y ninguna se repite', () => {
  const plan = planDeFederaciones();
  assert.equal(plan.length, 19);
  const nombres = plan.map((e) => e.federacion);
  assert.equal(new Set(nombres).size, 19, 'ninguna federación puede aparecer dos veces');

  const esperadas = [
    ...FEDERACIONES_PNFG, FEDERACION_SIN_PERFIL, 'madrid', 'valencia', 'cataluna',
  ].sort();
  assert.deepEqual([...nombres].sort(), esperadas);
});

test('las federaciones que ya recolecta el servidor quedan fuera del plan del PC', () => {
  // Sin exclusiones, están todas.
  assert.equal(planDeFederaciones().length, 19);

  // Excluyendo una, esa no se lanza en el PC y las demás siguen (el traspaso es de una en una).
  const conUna = planDeFederaciones({ excluidas: ['melilla'] });
  assert.equal(conUna.length, 18);
  assert.equal(conUna.some((e) => e.federacion === 'melilla'), false);
  assert.equal(conUna.some((e) => e.federacion === 'murcia'), true);

  // Excluyendo varias y con espacios, igual de bien.
  const conVarias = planDeFederaciones({ excluidas: [' melilla ', 'madrid', 'cataluna'] });
  assert.equal(conVarias.length, 16);
  for (const fuera of ['melilla', 'madrid', 'cataluna']) {
    assert.equal(conVarias.some((e) => e.federacion === fuera), false, `${fuera} no debería estar`);
  }

  // Y con todas excluidas (el día que el servidor lo haga todo), el PC no lanza nada.
  const todas = [...FEDERACIONES_PNFG, FEDERACION_SIN_PERFIL, 'madrid', 'valencia', 'cataluna'];
  assert.equal(planDeFederaciones({ excluidas: todas }).length, 0);
  // Una lista vacía o con basura no excluye a nadie por accidente.
  assert.equal(planDeFederaciones({ excluidas: ['', '  '] }).length, 19);
});

test('cada federación sabe con qué guion y con qué argumentos se lanza', () => {
  const plan = planDeFederaciones();
  const porNombre = new Map(plan.map((e) => [e.federacion, e]));

  for (const f of FEDERACIONES_PNFG) {
    const e = porNombre.get(f);
    assert.equal(e.guion, 'scripts/recolector-local.mjs');
    assert.deepEqual(e.argumentos, ['arrancar', '--perfil', `perfiles/${f}.json`]);
    assert.equal(e.carpeta, `descargas-${f}/recolector-local`);
  }

  // Castilla y León es el recolector original: sin perfil y con su cola propia.
  const sinPerfil = porNombre.get(FEDERACION_SIN_PERFIL);
  assert.deepEqual(sinPerfil.argumentos, ['arrancar']);
  assert.equal(sinPerfil.carpeta, 'descargas-federacion/recolector-local');

  // Las tres que no son PNFG llevan su propio guion.
  assert.equal(porNombre.get('madrid').guion, 'scripts/recolector-madrid.mjs');
  assert.equal(porNombre.get('valencia').guion, 'scripts/recolector-valencia.mjs');
  assert.equal(porNombre.get('cataluna').guion, 'scripts/recolector-cataluna-datos.mjs');

  // Madrid y Valencia van por API JSON: no abren navegador, así que no hay nada que limpiar.
  assert.equal(porNombre.get('madrid').limpieza, 'ninguna');
  assert.equal(porNombre.get('valencia').limpieza, 'ninguna');
});

test('Cataluña conserva su paso previo y sus parámetros de tanda', () => {
  const cataluna = planDeFederaciones().find((e) => e.federacion === 'cataluna');
  assert.deepEqual(cataluna.pasoPrevio, ['preparar']);
  assert.deepEqual(cataluna.argumentos, ['arrancar', '--max', '400', '--min-ms', '6000', '--max-ms', '8000']);
  assert.equal(cataluna.limpieza, 'cataluna');
});

test('la espera tras cada tanda respeta la ventana de cada federación', () => {
  const plan = planDeFederaciones();
  const porNombre = new Map(plan.map((e) => [e.federacion, e]));

  // PNFG: 20 s - 1 h.
  assert.equal(esperaTrasTanda(porNombre.get('andalucia').espera, 5).segundos, 20);
  assert.equal(esperaTrasTanda(porNombre.get('andalucia').espera, 600).segundos, 600);
  assert.equal(esperaTrasTanda(porNombre.get('andalucia').espera, 9000).segundos, 3600);

  // Madrid: mismo cálculo pero con tope de 5 minutos (era así en su supervisor).
  assert.equal(esperaTrasTanda(porNombre.get('madrid').espera, 9000).segundos, 300);
  assert.equal(esperaTrasTanda(porNombre.get('madrid').espera, 120).segundos, 120);

  // Sin dato o con basura: valor por defecto, nunca un relanzamiento en bucle.
  assert.equal(esperaTrasTanda(porNombre.get('andalucia').espera, null).segundos, 300);
  assert.equal(esperaTrasTanda(porNombre.get('andalucia').espera, 'no es un número').segundos, 300);

  // Cataluña: 0 pendientes → media hora; con pendientes → 20 s; sin dato → 60 s.
  assert.equal(esperaTrasTanda(porNombre.get('cataluna').espera, 0).segundos, 1800);
  assert.equal(esperaTrasTanda(porNombre.get('cataluna').espera, 7).segundos, 20);
  assert.equal(esperaTrasTanda(porNombre.get('cataluna').espera, null).segundos, 60);
});

test('el entorno de la flota llega intacto a los hijos', () => {
  const entorno = entornoParaHijos(
    { memoriaGb: 5, reservaGb: 4, turnoMin: 20, chromeHeadless: '1', topeNavegadorMb: '500' },
    { PATH: 'C:\\Windows', OTRA: 'x' },
  );
  assert.equal(entorno.FACYLF_MEMORIA_GB, '5');
  assert.equal(entorno.FACYLF_RESERVA_GB, '4');
  assert.equal(entorno.FACYLF_TURNO_PLAZA_MIN, '20');
  assert.equal(entorno.FACYLF_CHROME_HEADLESS, '1');
  assert.equal(entorno.FACYLF_TOPE_NAVEGADOR_MB, '500');
  assert.equal(entorno.PATH, 'C:\\Windows', 'lo que ya había no se pisa');
  assert.equal(entorno.OTRA, 'x');

  // Si el fichero no declara una variable, no se inventa: el recolector usa su valor por defecto.
  const sinHeadless = entornoParaHijos({ memoriaGb: 5, reservaGb: 4, turnoMin: 20, chromeHeadless: null, topeNavegadorMb: null }, {});
  assert.equal('FACYLF_CHROME_HEADLESS' in sinHeadless, false);
  assert.equal('FACYLF_TOPE_NAVEGADOR_MB' in sinHeadless, false);
});

test('las líneas de registro mantienen el formato de los supervisores anteriores', () => {
  const linea = lineaDeRegistro('Arrancando o reanudando la ingesta.', new Date(2026, 8, 21, 9, 5, 3));
  assert.equal(linea, '2026-09-21 09:05:03  Arrancando o reanudando la ingesta.');
  assert.match(lineaDeRegistro('x'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} {2}x$/);
});

test('la limpieza de huérfanos de una federación PNFG no toca navegadores ajenos', () => {
  const andalucia = planDeFederaciones().find((e) => e.federacion === 'andalucia');
  const procesos = [
    { ProcessId: 10, Name: 'chrome.exe', CommandLine: 'chrome.exe --user-data-dir=F:\\EspacioCodigo\\facylf\\descargas-andalucia\\recolector-local\\perfil-chrome --headless' },
    { ProcessId: 11, Name: 'chrome.exe', CommandLine: 'chrome.exe --user-data-dir=F:\\EspacioCodigo\\facylf\\descargas-murcia\\recolector-local\\perfil-chrome' },
    { ProcessId: 12, Name: 'chrome.exe', CommandLine: '"C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"' },
    { ProcessId: 13, Name: 'chrome.exe', CommandLine: 'chrome.exe' },
    { ProcessId: 14, Name: 'node.exe', CommandLine: 'node recolector-local.mjs arrancar' },
  ];
  assert.deepEqual(huerfanosDeFederacion(andalucia, procesos), [10]);
});

test('la limpieza de Cataluña sólo retira raíces suyas que se quedaron sin padre', () => {
  const cataluna = planDeFederaciones().find((e) => e.federacion === 'cataluna');
  const procesos = [
    { ProcessId: 20, ParentProcessId: 999, Name: 'chrome.exe', CommandLine: 'chrome.exe --user-data-dir=C:\\...\\FacylfBot --lang=ca-ES --headless' },
    { ProcessId: 21, ParentProcessId: 20, Name: 'chrome.exe', CommandLine: 'chrome.exe --type=renderer --lang=ca-ES' },
    { ProcessId: 22, ParentProcessId: 77, Name: 'chrome.exe', CommandLine: 'chrome.exe --user-data-dir=C:\\...\\FacylfBot --lang=ca-ES' },
    { ProcessId: 77, ParentProcessId: 1, Name: 'node.exe', CommandLine: 'node recolector-cataluna-datos.mjs arrancar' },
    { ProcessId: 23, ParentProcessId: 999, Name: 'chrome.exe', CommandLine: 'chrome.exe --user-data-dir=C:\\...\\OtroPerfil --lang=ca-ES' },
  ];
  assert.deepEqual(huerfanosDeFederacion(cataluna, procesos), [20]);
  // Y al retirar la raíz se lleva a sus descendientes, no se dejan a medias.
  assert.deepEqual(conDescendientes([20], procesos).sort((a, b) => a - b), [20, 21]);
});

test('no se lanza un segundo worker si ya hay uno vivo de la misma federación', () => {
  const plan = planDeFederaciones();
  const porNombre = new Map(plan.map((e) => [e.federacion, e]));
  const procesos = [
    { ProcessId: 30, Name: 'node.exe', CommandLine: '"C:\\Program Files\\nodejs\\node.exe" "F:\\EspacioCodigo\\facylf\\scripts\\recolector-local.mjs" arrancar --perfil "F:\\EspacioCodigo\\facylf\\perfiles\\murcia.json"' },
    { ProcessId: 31, Name: 'node.exe', CommandLine: 'node "F:\\EspacioCodigo\\facylf\\scripts\\recolector-local.mjs" arrancar' },
    { ProcessId: 32, Name: 'node.exe', CommandLine: 'node "F:\\EspacioCodigo\\facylf\\scripts\\recolector-madrid.mjs" arrancar' },
  ];

  // Una federación PNFG ve al suyo y no al de otra.
  assert.equal(workerAjeno(porNombre.get('murcia'), procesos).ProcessId, 30);
  assert.equal(workerAjeno(porNombre.get('navarra'), procesos), null);
  // Castilla y León (sin perfil) ve al que va sin `--perfil`, no al de Murcia.
  assert.equal(workerAjeno(porNombre.get(FEDERACION_SIN_PERFIL), procesos).ProcessId, 31);
  // Madrid ve al suyo.
  assert.equal(workerAjeno(porNombre.get('madrid'), procesos).ProcessId, 32);
  // Los hijos propios de este supervisor no cuentan como ajenos.
  assert.equal(workerAjeno(porNombre.get('murcia'), procesos, new Set([30])), null);
  // Un proceso de otra cosa que no sea un recolector tampoco cuenta.
  assert.equal(workerAjeno(porNombre.get('murcia'), [{ ProcessId: 40, Name: 'node.exe', CommandLine: 'node scripts/vigilar-flota.mjs' }]), null);
});

test('el nombre legible sigue llamando Castilla y Leon a la federación sin perfil', () => {
  assert.equal(nombreLegible(FEDERACION_SIN_PERFIL), 'Castilla y Leon');
  assert.equal(nombreLegible('murcia'), 'murcia');
});

test('mientras el supervisor antiguo de una federación siga vivo, no se lanza su copia', () => {
  const plan = planDeFederaciones();
  const porNombre = new Map(plan.map((e) => [e.federacion, e]));
  const procesos = [
    { ProcessId: 50, Name: 'powershell.exe', CommandLine: 'powershell.exe -File "F:\\EspacioCodigo\\facylf\\scripts\\ejecutar-recolector-programado.ps1" -Federacion "murcia"' },
    { ProcessId: 51, Name: 'powershell.exe', CommandLine: 'powershell.exe -File "F:\\EspacioCodigo\\facylf\\scripts\\ejecutar-recolector-programado.ps1"' },
    { ProcessId: 52, Name: 'powershell.exe', CommandLine: 'powershell.exe -File "F:\\EspacioCodigo\\facylf\\scripts\\ejecutar-recolector-madrid.ps1"' },
    { ProcessId: 53, Name: 'node.exe', CommandLine: 'node scripts/recolector-local.mjs arrancar --perfil perfiles/murcia.json' },
  ];
  // Ve al de su federación (y no al de otra, ni al worker).
  assert.equal(supervisorAntiguoVivo(porNombre.get('murcia'), procesos).ProcessId, 50);
  assert.equal(supervisorAntiguoVivo(porNombre.get('navarra'), procesos), null);
  // Castilla y León es el programado SIN `-Federacion`.
  assert.equal(supervisorAntiguoVivo(porNombre.get(FEDERACION_SIN_PERFIL), procesos).ProcessId, 51);
  // Madrid tiene su propio guion.
  assert.equal(supervisorAntiguoVivo(porNombre.get('madrid'), procesos).ProcessId, 52);
  // Cuando ya no queda ninguno, se puede arrancar.
  assert.equal(supervisorAntiguoVivo(porNombre.get('murcia'), [procesos[3]]), null);
});

test('la configuración de la flota incluye el modo headless que declara entorno-flota.ps1', { skip: process.platform !== 'win32' }, () => {
  const raiz = mkdtempSync(join(tmpdir(), 'facylf-flota-'));
  mkdirSync(join(raiz, 'scripts'), { recursive: true });
  writeFileSync(join(raiz, 'scripts', 'entorno-flota.ps1'), [
    "$env:FACYLF_MEMORIA_GB = '5'",
    "$env:FACYLF_TURNO_PLAZA_MIN = '20'",
    "$env:FACYLF_RESERVA_GB = '4'",
    "$env:FACYLF_CHROME_HEADLESS = '1'",
  ].join('\n'), 'utf8');

  const config = configuracionFlotaLocal(raiz);
  assert.equal(config.memoriaGb, 5);
  assert.equal(config.reservaGb, 4);
  assert.equal(config.turnoMin, 20);
  assert.equal(config.chromeHeadless, '1');
  assert.equal(config.origen, 'entorno-flota.ps1');
});
