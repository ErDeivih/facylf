import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  UMBRALES, estaAtascada, proporcionDeFallos, decideAlertas, lineaDeHistorial, textoDeAlerta,
} from './monitor-flota.mjs';

/*
 * PRUEBAS DE LA MONITORIZACIÓN
 *
 * Lo que defienden: que «esperando memoria» no se confunda con «averiada» (una federación que espera plaza no
 * está atascada, está en la cola del gobernador), que no se avise de fallos cuando no hubo peticiones (un cero
 * inventado sería una falsa alarma), que las alertas no se repitan cada minuto y que el OOM de la rebanada
 * —el tope de 10 GB del proyecto— no pase nunca desapercibido.
 */

const federacion = (extra = {}) => ({
  federacion: 'murcia', disponibles: 0, pendientes: 100, estado: 'trabajando',
  minutosSinPedir: 0, peticionesVentana: 0, fallosVentana: 0, ...extra,
});

test('una federación con trabajo que no pide está atascada', () => {
  // Sin señales de vida en su registro y con trabajo delante: eso es un atasco.
  assert.equal(estaAtascada(federacion({ disponibles: 50, minutosSinPedir: 25, minutosSinRegistro: 25 })), true);
  assert.equal(estaAtascada(federacion({ disponibles: 50, minutosSinPedir: 5, minutosSinRegistro: 5 })), false);
  assert.equal(estaAtascada(federacion({ disponibles: 0, minutosSinPedir: 600, minutosSinRegistro: 600 })), false,
    'sin trabajo disponible no hay nada que pedir');
});

test('esperar memoria o turno NO es estar atascada', () => {
  for (const estado of ['memoria', 'turno', 'pausa', 'sin-trabajo']) {
    assert.equal(estaAtascada(federacion({ disponibles: 900, minutosSinPedir: 300, estado })), false, `estado ${estado}`);
  }
  // Y si el estado dice que trabaja pero lleva media hora callada (sin plaza, sin error y sin escribir en su
  // registro), tampoco se avisa: con 19 federaciones y 3 plazas, esperar turno es lo normal.
  assert.equal(estaAtascada(federacion({ disponibles: 900, minutosSinPedir: 300, estado: 'trabajando' })), false);
});

/*
 * ── LA FALSA ALARMA QUE HABÍA QUE QUITAR (22/09/2026) ────────────────────────────────────────────────────
 *
 * Con 3 plazas, entre dos mensajes de espera la última línea del registro es la del PLAN, así que la federación
 * figuraba como `trabajando` y el monitor avisaba «atascada» por algo que era el reparto funcionando: Asturias
 * 107 min, Melilla 51, Navarra 26, las tres esperando plaza y el sistema sano.
 */
test('esperar plaza con el registro vivo no es estar atascada', () => {
  const esperando = federacion({
    disponibles: 13215, minutosSinPedir: 107, minutosSinRegistro: 1, estado: 'trabajando',
    ultimaLinea: '· sesión limitada a 228 trabajos para reciclar Chrome y contener la memoria.',
    plaza: null,
  });
  assert.equal(estaAtascada(esperando), false, 'el registro se escribe: la federación está viva, esperando turno');
});

test('una caída en bucle sí avisa, aunque el registro esté recién escrito', () => {
  const cayendose = federacion({
    disponibles: 900, minutosSinPedir: 40, minutosSinRegistro: 1, estado: 'trabajando',
    ultimaLinea: '2026-09-22 11:47:58  El worker termino con codigo 1; siguiente intento en 300 s.',
    plaza: null,
  });
  assert.equal(estaAtascada(cayendose), true, 'es el bucle de caída que dejó tres colas ilegibles');
});

test('con plaza de navegador y sin pedir, es un atasco de verdad', () => {
  const conPlaza = federacion({
    disponibles: 900, minutosSinPedir: 45, minutosSinRegistro: 1, estado: 'trabajando',
    ultimaLinea: '… pausa respetuosa de 4 s', plaza: { contenido: '1322 645feb623e50' },
  });
  assert.equal(estaAtascada(conPlaza), true, 'tiene el navegador y no lo usa: algo se ha colgado');
});

test('la proporción de fallos no se inventa cuando no hubo peticiones', () => {
  assert.equal(proporcionDeFallos({ peticionesVentana: 0, fallosVentana: 0 }), null);
  assert.equal(proporcionDeFallos({ peticionesVentana: 0, fallosVentana: 7 }), null);
  assert.equal(proporcionDeFallos({ peticionesVentana: 100, fallosVentana: 25 }), 0.25);
});

test('el OOM de la rebanada es siempre crítico', () => {
  const { alertas } = decideAlertas({
    cuando: '2026-09-21T16:00:00.000Z',
    rebanada: { memoriaGb: 6, picoGb: 9.8, oomKills: 1 },
    federaciones: [],
  });
  const oom = alertas.find((a) => a.clave === 'oom');
  assert.ok(oom, 'tiene que avisar del OOM');
  assert.equal(oom.nivel, 'critico');
  assert.match(textoDeAlerta(oom), /Sin memoria/);
});

test('la misma alerta no se repite cada minuto', () => {
  const instantanea = {
    cuando: '2026-09-21T16:00:00.000Z',
    rebanada: { memoriaGb: 9.4, oomKills: 0 },
    // Con la evidencia que hace falta: su registro dice que se cae (si sólo fuese «lleva 30 min sin pedir», no
    // se avisaría: con 3 plazas, esperar turno es lo normal).
    federaciones: [federacion({
      disponibles: 40, minutosSinPedir: 30, minutosSinRegistro: 1,
      ultimaLinea: 'El worker termino con codigo 1; siguiente intento en 300 s.',
    })],
  };
  const primera = decideAlertas(instantanea);
  assert.ok(primera.alertas.some((a) => a.clave === 'atascada:murcia'));
  assert.ok(primera.alertas.some((a) => a.clave === 'memoria-alta'));

  // Un minuto después, con lo mismo, no se vuelve a avisar.
  const segunda = decideAlertas({ ...instantanea, cuando: '2026-09-21T16:01:00.000Z' }, primera.estado);
  assert.equal(segunda.alertas.length, 0);

  // Y una hora después, si sigue pasando, se recuerda.
  const tercera = decideAlertas({ ...instantanea, cuando: '2026-09-21T17:05:00.000Z' }, segunda.estado);
  assert.ok(tercera.alertas.some((a) => a.clave === 'atascada:murcia'));
});

test('los fallos sostenidos de una federación avisan, y una petición suelta no', () => {
  const base = {
    cuando: '2026-09-21T16:00:00.000Z', rebanada: { memoriaGb: 5, oomKills: 0 },
  };
  const conFallos = decideAlertas({ ...base, federaciones: [federacion({ disponibles: 5, peticionesVentana: 100, fallosVentana: 30, ultimoError: 'timeout' })] });
  assert.ok(conFallos.alertas.some((a) => a.clave === 'fallos:murcia'));

  const pocas = decideAlertas({ ...base, federaciones: [federacion({ disponibles: 5, peticionesVentana: 8, fallosVentana: 4 })] });
  assert.equal(pocas.alertas.some((a) => a.clave === 'fallos:murcia'), false, 'con 8 peticiones no se concluye nada');
});

test('si PostgreSQL no responde o el importador encadena fallos, se avisa', () => {
  const { alertas } = decideAlertas({
    cuando: '2026-09-21T16:00:00.000Z',
    rebanada: { memoriaGb: 4, oomKills: 0 },
    federaciones: [],
    canonico: { responde: false, detalle: 'connection refused' },
    importador: { lotesFallidosSeguidos: 3, ultimoFallo: 'grupo 11379752: calendario y acta sin equipos en común' },
  });
  assert.ok(alertas.some((a) => a.clave === 'postgres'));
  assert.ok(alertas.some((a) => a.clave === 'importador'));
});

test('el disco lleno avisa antes de romper las colas', () => {
  const { alertas } = decideAlertas({
    cuando: '2026-09-21T16:00:00.000Z',
    rebanada: { memoriaGb: 3, oomKills: 0 }, federaciones: [],
    disco: { libreProporcion: 0.08, libreGb: 16 },
  });
  assert.ok(alertas.some((a) => a.clave === 'disco'));
});

test('casi toda la flota esperando memoria se cuenta como presupuesto corto, no como avería', () => {
  const federaciones = Array.from({ length: 19 }, (_, i) => federacion({
    federacion: `fed-${i}`, estado: i < 18 ? 'memoria' : 'trabajando', disponibles: 100,
  }));
  const { alertas } = decideAlertas({ cuando: '2026-09-21T16:00:00.000Z', rebanada: { memoriaGb: 3, oomKills: 0 }, federaciones });
  assert.ok(alertas.some((a) => a.clave === 'presupuesto-corto'));
  assert.equal(alertas.some((a) => a.clave.startsWith('atascada:')), false, 'esperar memoria no es estar atascada');
});

test('el histórico resume lo que hace falta para ver tendencias', () => {
  const linea = lineaDeHistorial({
    cuando: '2026-09-21T16:00:00.000Z',
    rebanada: { memoriaGb: 6.2, picoGb: 7.1, oomKills: 0 },
    contenedores: { longitud: 22 },
    federaciones: [
      federacion({ federacion: 'murcia', peticionesVentana: 100, fallosVentana: 2, pendientes: 50, disponibles: 10 }),
      federacion({ federacion: 'rioja', peticionesVentana: 0, fallosVentana: 0, pendientes: 20, disponibles: 0 }),
    ],
    disco: { libreGb: 190 },
  });
  assert.equal(linea.peticionesVentana, 100);
  assert.equal(linea.fallosVentana, 2);
  assert.equal(linea.pendientes, 70);
  assert.equal(linea.federacionesPidiendo, 1);
  assert.equal(linea.memoriaGb, 6.2);
});
