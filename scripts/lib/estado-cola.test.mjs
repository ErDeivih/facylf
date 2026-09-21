/*
 * Pruebas de la lectura de colas y de la decisión de flota.
 *
 * Cada prueba viene de un caso real: lo que se rompe cuando el criterio está mal es que se abran navegadores
 * para nada (memoria), que se paren contenedores que sí tenían trabajo (tiempo perdido) o que una federación
 * terminada siga ocupando capacidad del servidor meses después.
 *
 * Se ejecuta con:  node --test scripts/lib/estado-cola.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abreBase, encola, guardaMetadato, registraPeticion } from './recolector-local.mjs';
import { decideFlota, leeEstadoDeCola, msHastaMedianocheDeMadrid, segundosDeEspera } from './estado-cola.mjs';

/** Un mediodía fijo: así la fecha de Madrid y la de UTC coinciden y la prueba no depende de la hora de ejecución. */
const AHORA = Date.parse('2026-09-18T10:00:00.000Z');
const HORA_MADRID = '2026-09-18T09:00:00.000Z';

function conCola(prueba) {
  const carpeta = mkdtempSync(join(tmpdir(), 'facylf-estado-cola-'));
  const ruta = join(carpeta, 'cola-v2.sqlite');
  try {
    const db = abreBase(ruta);
    try { prueba(db, ruta); } finally { db.close(); }
  } finally {
    // En Windows el fichero de la cola puede seguir bloqueado un instante después de cerrarlo; la carpeta es
    // temporal y no importa si se queda, así que el borrado no puede hacer fallar una prueba.
    try { rmSync(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* se queda en el temporal */ }
  }
}

const trabajo = (db, datos) => encola(db, 'jornada', { temporada: '25-26', competicion: 'C', grupo: '1', jornada: '1', ...datos }, 100);
const estadoDe = (db, ruta) => leeEstadoDeCola(ruta, { ahoraMs: AHORA });
const marca = (db, clave, campos) => db.prepare(`update trabajos set ${campos} where clave=?`).run(clave);

test('una federación que ha terminado deja de ocupar contenedor', () => {
  conCola((db, ruta) => {
    // Una cola recién creada no tiene trabajo: es el estado al que se llega cuando se ha ingerido todo lo pedido,
    // y es justo el momento en el que este trabajo tiene que devolver capacidad a la máquina.
    const [decision] = decideFlota([{ federacion: 'prueba', servicio: 'prueba', estado: estadoDe(db, ruta) }], { ahoraMs: AHORA });
    assert.equal(decision.accion, 'abajo');
    assert.equal(decision.reanudarEn, null, 'si no queda nada, no hay nada que reanudar');
  });
});

test('no se para un contenedor por no poder leer su cola (desconocido no es cero)', () => {
  // Si la cola no está donde se espera (una ruta mal montada, un volumen que no existe), «no hay trabajo» y «no
  // lo sé» no son lo mismo: parar por error deja una federación sin recolectar hasta que alguien lo mire.
  const estado = leeEstadoDeCola(join(tmpdir(), 'facylf-cola-que-no-existe.sqlite'), { ahoraMs: AHORA });
  assert.equal(estado.legible, false);
  const [decision] = decideFlota([{ federacion: 'prueba', servicio: 'prueba', estado }], { ahoraMs: AHORA });
  assert.equal(decision.accion, 'no-tocar');
  assert.match(decision.motivo, /se deja como está/);
});

test('un trabajo bloqueado con la fecha vencida cuenta como disponible', () => {
  // El worker elige entre `pendiente` y `bloqueado` cuya fecha de reintento ya pasó (`siguienteTrabajo`). El
  // supervisor, en cambio, sólo miraba `pendiente`/`en_curso`: con un bloqueado vencido decía «espera 300 s» y la
  // federación se quedaba cinco minutos parada teniendo trabajo. Medido el 19/09/2026.
  conCola((db, ruta) => {
    const clave = trabajo(db);
    marca(db, clave, "estado='bloqueado', siguiente_intento='2026-09-18T09:00:00.000Z'");
    const estado = estadoDe(db, ruta);
    assert.equal(estado.listos, 1, 'un bloqueado vencido es trabajo disponible ahora');
    assert.equal(segundosDeEspera(estado, { ahoraMs: AHORA }), 0, 'no hay que esperar nada');
    const [decision] = decideFlota([{ federacion: 'prueba', servicio: 'prueba', estado }], { ahoraMs: AHORA });
    assert.equal(decision.accion, 'arriba');
  });
});

test('el trabajo de temporadas antiguas no mantiene despierta a una federación', () => {
  // Estas filas quedaron de antes del suelo de temporadas (2023-24) y están aplazadas a 2099. Si contaran como
  // trabajo, los diecisiete contenedores se quedarían levantados para siempre por trabajo que nadie va a hacer.
  conCola((db, ruta) => {
    db.prepare("insert into temporadas(codigo, etiqueta) values('77','2015-16')").run();
    const clave = trabajo(db);
    marca(db, clave, "temporada='77', siguiente_intento='2099-01-01T00:00:00.000Z'");
    const estado = estadoDe(db, ruta);
    assert.equal(estado.pendientes, 0, 'una temporada catalogada como antigua no es trabajo pendiente');
    assert.equal(estado.listos, 0);
    const [decision] = decideFlota([{ federacion: 'prueba', servicio: 'prueba', estado }], { ahoraMs: AHORA });
    assert.equal(decision.accion, 'abajo');
    assert.match(decision.motivo, /ha terminado/);
  });
});

test('un aplazado lejano para el contenedor y se vuelve a levantar cuando toca', () => {
  conCola((db, ruta) => {
    const clave = trabajo(db);
    marca(db, clave, "siguiente_intento='2026-09-21T09:00:00.000Z'"); // tres días
    const [decision] = decideFlota([{ federacion: 'prueba', servicio: 'prueba', estado: estadoDe(db, ruta) }], { ahoraMs: AHORA });
    assert.equal(decision.accion, 'abajo');
    assert.equal(decision.reanudarEn, '2026-09-21T09:00:00.000Z', 'hay que saber cuándo volver a levantarlo');
    assert.equal(decision.pendientes, 1, 'el trabajo no se pierde: sigue en la cola');
  });
});

test('un aplazado de media hora no compensa parar y levantar', () => {
  conCola((db, ruta) => {
    const clave = trabajo(db);
    marca(db, clave, "siguiente_intento='2026-09-18T10:30:00.000Z'");
    const [decision] = decideFlota([{ federacion: 'prueba', servicio: 'prueba', estado: estadoDe(db, ruta) }], { ahoraMs: AHORA });
    assert.equal(decision.accion, 'arriba', 'dentro del horizonte se deja levantado');
  });
});

test('con la pausa puesta no se espera en balde y se para si la pausa es larga', () => {
  // Una pausa preventiva de seis horas (la que provoca un bloqueo de la fuente) tenía al supervisor relanzando el
  // worker cada veinte segundos y al contenedor ocupando sitio sin poder recolectar.
  conCola((db, ruta) => {
    const clave = trabajo(db);
    assert.equal(estadoDe(db, ruta).listos, 1, 'hay trabajo pendiente…');
    guardaMetadato(db, 'pausa_global_hasta', '2026-09-18T16:00:00.000Z'); // seis horas
    const estado = estadoDe(db, ruta);
    assert.equal(estado.enPausa, true);
    assert.equal(segundosDeEspera(estado, { ahoraMs: AHORA }), 6 * 3600, 'se duerme hasta que acabe la pausa');
    const [decision] = decideFlota([{ federacion: 'prueba', servicio: 'prueba', estado }], { ahoraMs: AHORA });
    assert.equal(decision.accion, 'abajo');
    assert.equal(decision.reanudarEn, '2026-09-18T16:00:00.000Z');
    assert.equal(decision.pendientes, 1);
    void clave;
  });
});

test('una pausa corta no llega a parar el contenedor', () => {
  conCola((db, ruta) => {
    trabajo(db);
    guardaMetadato(db, 'pausa_global_hasta', '2026-09-18T10:20:00.000Z'); // veinte minutos
    const [decision] = decideFlota([{ federacion: 'prueba', servicio: 'prueba', estado: estadoDe(db, ruta) }], { ahoraMs: AHORA });
    assert.equal(decision.accion, 'arriba');
  });
});

test('con el presupuesto diario gastado se espera a mañana en vez de abrir navegadores', () => {
  conCola((db, ruta) => {
    trabajo(db);
    guardaMetadato(db, 'diario_max', '2');
    for (let i = 0; i < 2; i++) registraPeticion(db, { url: `https://x/${i}`, iniciadaEn: HORA_MADRID, resultado: 'ok' });
    const estado = estadoDe(db, ruta);
    assert.equal(estado.presupuestoGastado, true);
    assert.equal(segundosDeEspera(estado, { ahoraMs: AHORA }), 3600, 'una hora, como el supervisor de siempre');
    const [decision] = decideFlota([{ federacion: 'prueba', servicio: 'prueba', estado }], { ahoraMs: AHORA });
    assert.equal(decision.accion, 'abajo', 'no tiene sentido tener diecisiete contenedores esperando a mañana');
    const hastaMedianoche = Date.parse(decision.reanudarEn) - AHORA;
    assert.ok(Math.abs(hastaMedianoche - msHastaMedianocheDeMadrid(AHORA)) < 1000,
      'se reanuda pasada la medianoche de Madrid');
  });
});

test('cuando la máquina se queda sin memoria, el supervisor no relanza cada veinte segundos', () => {
  // Medido en el PC el 19/09/2026: cinco federaciones dando vueltas de quince minutos esperando plaza por falta de
  // memoria de la máquina (0,3-0,7 GB libres frente a la reserva de 1,5 GB) y relanzándose cada veinte segundos
  // para volver a esperar lo mismo. El trabajo estaba disponible: lo que no se podía era abrir el navegador.
  conCola((db, ruta) => {
    trabajo(db);
    guardaMetadato(db, 'ultima_salida_motivo', 'memoria');
    guardaMetadato(db, 'ultima_salida_en', new Date(AHORA - 60_000).toISOString());
    const estado = estadoDe(db, ruta);
    assert.equal(estado.listos, 1, 'hay trabajo disponible');
    assert.equal(estado.salidaPorMemoriaReciente, true);
    assert.equal(segundosDeEspera(estado, { ahoraMs: AHORA }), 300, 'cinco minutos, no veinte segundos');

    // Una salida por TURNO no cambia nada: en cuanto hay trabajo se relanza ya (es lo que hace que las federaciones
    // entren a lo largo del día).
    guardaMetadato(db, 'ultima_salida_motivo', 'turno');
    assert.equal(segundosDeEspera(estadoDe(db, ruta), { ahoraMs: AHORA }), 0);

    // Y una falta de memoria ya vieja tampoco frena el trabajo: la máquina ha podido liberarse.
    guardaMetadato(db, 'ultima_salida_motivo', 'memoria');
    guardaMetadato(db, 'ultima_salida_en', new Date(AHORA - 10 * 60_000).toISOString());
    assert.equal(segundosDeEspera(estadoDe(db, ruta), { ahoraMs: AHORA }), 0, 'pasados diez minutos, se reintenta ya');
  });
});

test('la medianoche de Madrid se calcula con el reloj de Madrid, no con el del servidor', () => {
  // El servidor puede estar en UTC. En septiembre Madrid va dos horas por delante: a las 22:00 UTC ya es el día
  // siguiente en Madrid, y el presupuesto diario se renueva con el día de Madrid (es lo que usa el recolector).
  assert.equal(msHastaMedianocheDeMadrid(Date.parse('2026-09-18T21:59:00.000Z')), 60_000 + 5 * 60_000);
  assert.equal(msHastaMedianocheDeMadrid(Date.parse('2026-09-18T10:00:00.000Z')), 12 * 3600_000 + 5 * 60_000);
});
