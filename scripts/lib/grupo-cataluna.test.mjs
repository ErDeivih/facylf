import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decideLecturaDeGrupo, esCaidaDeNavegador, esCaidaQueRecicla, esEsperaAgotada,
  esperaTrasFalloDeNavegador, estaAplazado, textoDeEspera,
} from './grupo-cataluna.mjs';

/*
 * El bucle que estas pruebas fijan, medido el 02/10/2026: Cataluña pedía el calendario de un grupo aunque
 * estuviera citado para el 1 de abril, porque sólo miraba que no estuviera `hecho` ni `cancelado`. El
 * calendario contestaba «sin publicar», el aplazamiento se apuntaba al calendario (rachas de 230) y la
 * clasificación que había salido de la cola se quedaba en `en_curso`, huérfana. 173 trabajos así, y las 3.177
 * actas disponibles sin tocarse.
 */

const AHORA = new Date('2026-10-02T12:00:00.000Z');
const enDias = (n) => new Date(AHORA.getTime() + n * 86_400_000).toISOString();

test('un calendario aplazado NO se pide, y el grupo espera a su misma fecha', () => {
  // Es el caso exacto del bucle: sale la clasificación y el calendario está citado para abril.
  const r = decideLecturaDeGrupo({
    clave: 'clasificacion|22|58163046|58163052',
    calendario: {
      clave: 'calendario|22|58163046|58163052',
      estado: 'pendiente',
      siguiente_intento: '2027-03-31T22:00:00.000Z',
    },
    ahora: AHORA,
  });
  assert.equal(r.accion, 'aplazar');
  assert.equal(r.hasta.toISOString(), '2027-03-31T22:00:00.000Z');
});

test('un calendario sin aplazar sí se pide', () => {
  const base = { clave: 'clasificacion|22|1|2', ahora: AHORA };
  assert.equal(decideLecturaDeGrupo({ ...base, calendario: { clave: 'calendario|22|1|2', estado: 'pendiente', siguiente_intento: null } }).accion, 'pedir');
  // Citado en el pasado (vencido): también se pide.
  assert.equal(decideLecturaDeGrupo({ ...base, calendario: { clave: 'calendario|22|1|2', estado: 'pendiente', siguiente_intento: enDias(-1) } }).accion, 'pedir');
  // Y si no hay trabajo de calendario para ese grupo, no hay nada que decidir.
  assert.equal(decideLecturaDeGrupo({ ...base, calendario: null }).accion, 'pedir');
});

test('un calendario ya cerrado no bloquea la lectura del grupo', () => {
  for (const estado of ['hecho', 'cancelado']) {
    const r = decideLecturaDeGrupo({
      clave: 'clasificacion|22|1|2',
      calendario: { clave: 'calendario|22|1|2', estado, siguiente_intento: enDias(30) },
      ahora: AHORA,
    });
    assert.equal(r.accion, 'pedir', `un calendario ${estado} no debe aplazar el grupo`);
  }
});

test('si el que salió de la cola es el propio calendario, manda la cola y se pide', () => {
  // No debería ocurrir —el selector respeta `siguiente_intento`—, pero si ocurre no se le da la vuelta a la
  // decisión de la cola en silencio: se pide.
  const clave = 'calendario|22|1|2';
  const r = decideLecturaDeGrupo({
    clave,
    calendario: { clave, estado: 'pendiente', siguiente_intento: enDias(30) },
    ahora: AHORA,
  });
  assert.equal(r.accion, 'pedir');
});

test('estaAplazado no se cree una fecha ilegible', () => {
  assert.equal(estaAplazado({ siguiente_intento: null }, AHORA), false);
  assert.equal(estaAplazado({ siguiente_intento: 'no es una fecha' }, AHORA), false);
  assert.equal(estaAplazado({ siguiente_intento: enDias(1) }, AHORA), true);
  assert.equal(estaAplazado(null, AHORA), false);
});

test('el texto de la espera se lee como una persona lo escribiría', () => {
  assert.equal(textoDeEspera(new Date(AHORA.getTime() + 6 * 3_600_000), AHORA), '6 h');
  assert.equal(textoDeEspera(new Date(AHORA.getTime() + 47 * 3_600_000), AHORA), '47 h');
  assert.equal(textoDeEspera(new Date(AHORA.getTime() + 14 * 86_400_000), AHORA), '14 días');
});

/*
 * El bucle del 03/10/2026: 724 «fallos de navegador» y 6 aciertos en 24 h, siempre las mismas 6
 * clasificaciones, porque un «Wait timed out» de una página lenta se trataba como un Chrome caído.
 */

test('se distingue «la página no cargó» de «el navegador se cayó»', () => {
  assert.equal(esEsperaAgotada('TimeoutError: Wait timed out after 40000ms'), true);
  assert.equal(esCaidaDeNavegador('TimeoutError: Wait timed out after 40000ms'), false);
  assert.equal(esCaidaDeNavegador('invalid session id'), true);
  assert.equal(esCaidaDeNavegador('chrome not reachable'), true);
  assert.equal(esEsperaAgotada('invalid session id'), false);
});

test('un tiempo agotado sólo recicla la sesión si el navegador NO responde', () => {
  const lento = 'TimeoutError: Wait timed out after 40000ms';
  // La página no cargó pero Chrome está vivo: NO se recicla (es lo que abría un Chrome cada 20 s).
  assert.equal(esCaidaQueRecicla(lento, { navegadorVivo: true }), false);
  // El navegador ya no contesta: es una caída de verdad.
  assert.equal(esCaidaQueRecicla(lento, { navegadorVivo: false }), true);
  // Los errores de sesión reciclan siempre, responda lo que responda.
  assert.equal(esCaidaQueRecicla('invalid session id', { navegadorVivo: true }), true);
  assert.equal(esCaidaQueRecicla('disconnected: not connected to DevTools', { navegadorVivo: true }), true);
  // Y un error que no es de navegador no recicla nunca.
  assert.equal(esCaidaQueRecicla('el grupo no tenía nada pendiente', { navegadorVivo: false }), false);
  assert.equal(esCaidaQueRecicla(undefined), false);
});

test('la espera tras un fallo de navegador escala al tercer intento', () => {
  assert.equal(esperaTrasFalloDeNavegador(1), 5 * 60_000);
  assert.equal(esperaTrasFalloDeNavegador(2), 5 * 60_000);
  // Sin contar el intento, este trabajo se repetía cada 5 minutos para siempre.
  assert.equal(esperaTrasFalloDeNavegador(3), 24 * 3_600_000);
  assert.equal(esperaTrasFalloDeNavegador(137), 24 * 3_600_000);
});
