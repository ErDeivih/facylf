import { describe, expect, it } from 'vitest';
import { repartePlazas, cabeOtroNavegador, tocaReciclar, decideEsperaDePlaza, decideTurnoDePlaza, plazaAbandonada, plazasCompartidas, cedePorPrioridad, PLAZA_PRIORITARIA, COSTE_POR_RECOLECTOR_GB, RESERVA_GB, TURNO_PLAZA_MIN, SIN_LATIDO_MS } from '../../../scripts/lib/presupuesto-memoria.mjs';

/**
 * El gobernador de memoria: cuántos recolectores pueden tener navegador a la vez.
 *
 * Estas pruebas fijan el reparto que sustituye a los dos números escritos a mano que había (14 plazas y
 * «2,5 GB libres»), y que fallaban de dos maneras: la decisión era individual —diecisiete workers podían ver
 * hueco a la vez y pasarse entre todos— y el umbral no dependía de la máquina, así que el mismo 2,5 GB
 * gobernaba una de 32 GB y un servidor de 10.
 */
describe('repartePlazas: el presupuesto manda, no un número escrito a mano', () => {
  it('un servidor de 10 GB declarados da las plazas que caben, con reserva', () => {
    const r = repartePlazas({ memoriaGb: 10, memoriaTotalGb: 10 });
    // (10 - 1,5) / 0,75 = 11,33 → 11 plazas
    expect(r.presupuestoTotalGb).toBe(10);
    expect(r.paraNavegadoresGb).toBe(8.5);
    expect(r.plazas).toBe(11);
    expect(r.motivo).toMatch(/presupuesto declarado/);
  });

  it('sin presupuesto declarado usa la mitad del equipo: en una máquina grande no limita', () => {
    const r = repartePlazas({ memoriaTotalGb: 32 });
    // (16 - 1,5) / 0,75 = 19,33 → 19 plazas, más que las 18 federaciones: donde no hay techo, no aprieta
    expect(r.plazas).toBe(19);
    expect(r.plazas).toBeGreaterThan(18);
    expect(r.motivo).toMatch(/mitad/);
  });

  it('un presupuesto diminuto deja al menos una plaza: nunca cero, que sería no poder recolectar', () => {
    expect(repartePlazas({ memoriaGb: 1, memoriaTotalGb: 32 }).plazas).toBe(1);
    expect(repartePlazas({ memoriaGb: RESERVA_GB, memoriaTotalGb: 32 }).plazas).toBe(1);
  });

  it('el coste por recolector es el MEDIDO, y está a la vista para poder revisarlo', () => {
    expect(COSTE_POR_RECOLECTOR_GB).toBe(0.75);
    const r = repartePlazas({ memoriaGb: 10, memoriaTotalGb: 10, costePorRecolectorGb: 1 });
    expect(r.plazas).toBe(8); // con navegadores de 1 GB, en 8,5 GB caben 8
  });
});

/**
 * El reciclado del navegador por CONSUMO, con el número de trabajos como suelo.
 *
 * La regla anterior era «cada 10 trabajos» y es una aproximación que se queda corta o larga según el portal:
 * diez páginas ligeras dejan el navegador como nuevo y diez pesadas lo dejan en 600 MB. Pero el suelo se
 * mantiene a propósito: reciclar cada dos páginas costaría más en arranques de Chrome que lo que ahorra.
 */
describe('tocaReciclar: manda el consumo, con el número de trabajos como suelo', () => {
  it('recicla por consumo cuando el navegador pasa del tope, aunque no toque por trabajos', () => {
    const r = tocaReciclar({ hechos: 3, cada: 10, memoriaMb: 640, topeMb: 500 });
    expect(r.reciclar).toBe(true);
    expect(r.motivo).toMatch(/va por 640 MB/);
  });

  it('recicla por trabajos aunque el navegador vaya ligero', () => {
    const r = tocaReciclar({ hechos: 10, cada: 10, memoriaMb: 200, topeMb: 500 });
    expect(r.reciclar).toBe(true);
    expect(r.motivo).toMatch(/número de trabajos/);
  });

  it('no recicla si ni toca por trabajos ni ha pasado el tope', () => {
    expect(tocaReciclar({ hechos: 4, cada: 10, memoriaMb: 300, topeMb: 500 }).reciclar).toBe(false);
  });

  it('si NO se pudo medir, no se recicla: un fallo de medición no cambia el comportamiento', () => {
    for (const memoriaMb of [null, undefined, NaN, 0, -1, 'no lo sé']) {
      const r = tocaReciclar({ hechos: 4, cada: 10, memoriaMb, topeMb: 500 });
      expect(r.reciclar, String(memoriaMb)).toBe(false);
      expect(r.medidoMb).toBeNull();
    }
    // Y el suelo por trabajos sigue funcionando sin medición.
    expect(tocaReciclar({ hechos: 10, cada: 10, memoriaMb: null, topeMb: 500 }).reciclar).toBe(true);
  });

  it('el tope justo cuenta como alcanzado, y un tope absurdo no recicla nunca', () => {
    expect(tocaReciclar({ hechos: 1, cada: 10, memoriaMb: 500, topeMb: 500 }).reciclar).toBe(true);
    expect(tocaReciclar({ hechos: 1, cada: 10, memoriaMb: 400, topeMb: 100000 }).reciclar).toBe(false);
  });
});

/**
 * El 17/09/2026 el reciclado se disparaba EN CADA TRABAJO y dejó la recolección a un tercio de su ritmo
 * (1,4-2,4 peticiones por minuto donde el ritmo permite ~8). Fueron dos causas juntas, y estas pruebas fijan
 * las dos para que no vuelvan:
 *
 *   · el tope estaba en 450 MB, por debajo de lo que ocupa el navegador ya cargado (250-650 MB medidos, y
 *     hasta 930 MB con páginas pesadas), así que la medición lo superaba siempre → **900 MB**;
 *   · la medición vieja se seguía usando después de reciclar, con lo que la regla de consumo volvía a
 *     dispararse en el trabajo siguiente con el dato de un navegador que ya no existía → sólo cuenta la
 *     medición RECIÉN hecha, y el resto del tiempo manda el suelo por trabajos (40).
 */
describe('el tope real (900 MB) y la medición fresca: el reciclado deja de ser un bucle', () => {
  const TOPE_REAL = 900;
  const CADA_REAL = 40;

  it('con el navegador cargado por debajo del tope NO se recicla: es el caso normal', () => {
    for (const memoriaMb of [250, 400, 650, 899]) {
      expect(tocaReciclar({ hechos: 17, cada: CADA_REAL, memoriaMb, topeMb: TOPE_REAL }).reciclar, String(memoriaMb)).toBe(false);
    }
  });

  it('cuando de verdad se hincha (930 MB medidos hoy), sí recicla', () => {
    const r = tocaReciclar({ hechos: 17, cada: CADA_REAL, memoriaMb: 930, topeMb: TOPE_REAL });
    expect(r.reciclar).toBe(true);
    expect(r.motivo).toMatch(/930 MB/);
  });

  it('sin medición fresca manda el suelo por trabajos: eso es lo que rompía el bucle', () => {
    // Un trabajo cualquiera después de reciclar: no se sabe cuánto ocupa el navegador nuevo, así que no se
    // recicla (con 450 MB de tope y el dato viejo, aquí se reciclaba OTRA VEZ, y así en cada trabajo).
    expect(tocaReciclar({ hechos: 41, cada: CADA_REAL, memoriaMb: null, topeMb: TOPE_REAL }).reciclar).toBe(false);
    expect(tocaReciclar({ hechos: 80, cada: CADA_REAL, memoriaMb: null, topeMb: TOPE_REAL }).reciclar).toBe(true);
  });
});

describe('cabeOtroNavegador: el reparto es compartido, no individual', () => {
  it('con plazas libres y aire en el sistema, cabe', () => {
    expect(cabeOtroNavegador({ plazas: 14, ocupadas: 3, memoriaLibreGb: 6 }).cabe).toBe(true);
  });

  it('sin plazas libres NO cabe, aunque sobre memoria: es el reparto lo que decide', () => {
    const r = cabeOtroNavegador({ plazas: 14, ocupadas: 14, memoriaLibreGb: 20 });
    expect(r.cabe).toBe(false);
    expect(r.motivo).toMatch(/no cabe por reparto/);
  });

  it('con plaza libre pero sin aire para el sistema, tampoco: la reserva no se toca', () => {
    const r = cabeOtroNavegador({ plazas: 14, ocupadas: 1, memoriaLibreGb: 0.4 });
    expect(r.cabe).toBe(false);
    expect(r.motivo).toMatch(/reserva/);
  });

  it('la última plaza se concede y se cierra el paso', () => {
    expect(cabeOtroNavegador({ plazas: 14, ocupadas: 13, memoriaLibreGb: 5 }).cabe).toBe(true);
    expect(cabeOtroNavegador({ plazas: 14, ocupadas: 14, memoriaLibreGb: 5 }).cabe).toBe(false);
  });

  /**
   * Y la memoria del SISTEMA, que es lo que hace que la flota encoja sola. En el servidor de 10 GB no vive sólo
   * la recolección: están PostgreSQL, la web y el sistema. El presupuesto dice cuántos navegadores caben; esta
   * reserva dice cuánto hay que dejarle a lo demás, y cuando se agota los recolectores dejan de abrir
   * navegadores nuevos (los que están siguen, y al acabar su sesión el hueco no se vuelve a ocupar). Así, cuando
   * el trabajo escasea o cuando otro servicio crece, la recolección suelta memoria sin que nadie la apague.
   */
  it('con plaza y con aire en el contenedor, pero sin aire en el SISTEMA, no se abre otro navegador', () => {
    const r = cabeOtroNavegador({
      plazas: 11, ocupadas: 4, memoriaLibreGb: 3, reservaGb: 0.25,
      memoriaDeLaMaquinaGb: 0.6, reservaDeLaMaquinaGb: 1.5,
    });
    expect(r.cabe).toBe(false);
    expect(r.motivo).toMatch(/al SISTEMA le quedan 0.60 GB/);
    expect(r.motivo).toMatch(/se deja sitio a lo demás/);
  });

  it('y con aire en el sistema, sí: el reparto y las dos memorias tienen que cuadrar', () => {
    expect(cabeOtroNavegador({
      plazas: 11, ocupadas: 4, memoriaLibreGb: 3, reservaGb: 0.25,
      memoriaDeLaMaquinaGb: 2.2, reservaDeLaMaquinaGb: 1.5,
    }).cabe).toBe(true);
    // Sin el dato del sistema no se inventa nada: manda lo que sí se sabe.
    expect(cabeOtroNavegador({ plazas: 11, ocupadas: 4, memoriaLibreGb: 3 }).cabe).toBe(true);
  });
});

/**
 * PRUEBA 4 del encargo de 10 GB: con el presupuesto agotado, el worker ESPERA y SALE —no se bloquea—.
 *
 * Tres intentos de comprobarlo contra una cola real no llegaron al reparto, porque el planificador reaplaza
 * el trabajo en cada arranque y el recolector nunca pide plaza. La lección es la de siempre: si una prueba
 * depende de un entorno que se resiste, se saca la DECISIÓN a una función pura y se prueba la decisión. El
 * reloj entra como dato, así que esto corre en milisegundos y no en quince minutos.
 */
describe('decideEsperaDePlaza: cuando no hay plaza, se espera; cuando se agota el plazo, se sale', () => {
  const t0 = 1_000_000;

  it('antes del tope, sigue esperando', () => {
    const r = decideEsperaDePlaza({ esperandoDesdeMs: t0, ahoraMs: t0 + 5_000, topeMs: 20_000, motivoDelHueco: 'no cabe por reparto' });
    expect(r.salir).toBe(false);
    expect(r.motivo).toBe('sigue esperando');
  });

  it('agotado el tope, sale con el motivo, y NO es un fallo: la cola queda intacta', () => {
    const r = decideEsperaDePlaza({ esperandoDesdeMs: t0, ahoraMs: t0 + 20_000, topeMs: 20_000, motivoDelHueco: 'no cabe por reparto: 1 plazas ocupadas de 1' });
    expect(r.salir).toBe(true);
    expect(r.motivo).toMatch(/no se consiguió plaza/);
    expect(r.motivo).toMatch(/plazas ocupadas/);
  });

  it('el caso exacto del bloqueo de hoy: presupuesto agotado y tope cumplido', () => {
    // Con una plaza y ya ocupada, el reparto dice que no cabe…
    const hueco = cabeOtroNavegador({ plazas: 1, ocupadas: 1, memoriaLibreGb: 6 });
    expect(hueco.cabe).toBe(false);
    // …y la espera, con el tope cumplido, termina en salida limpia en vez de bucle infinito.
    const espera = decideEsperaDePlaza({ esperandoDesdeMs: t0, ahoraMs: t0 + 900_000, topeMs: 900_000, motivoDelHueco: hueco.motivo });
    expect(espera.salir).toBe(true);
    expect(espera.minutos).toBe(15);
  });

  it('sin tope válido no se sale por reloj: la salida no puede depender de un dato ausente', () => {
    for (const topeMs of [0, -1, NaN, undefined, null]) {
      expect(decideEsperaDePlaza({ esperandoDesdeMs: t0, ahoraMs: t0 + 10_000_000, topeMs, motivoDelHueco: 'x' }).salir, String(topeMs)).toBe(false);
    }
  });
});

/**
 * ROTACIÓN DE PLAZAS: en un servidor de 10 GB caben 11 navegadores y hay 18 federaciones, así que el que no
 * entra tiene que entrar algún día. Sin turno, el que consigue plaza la conserva sesión tras sesión y las
 * demás no recolectan nunca: es el problema que aparece justo cuando esto pasa de una máquina de escritorio a
 * un servidor encendido 24/7.
 */
describe('decideTurnoDePlaza: el turno caduca sólo si hay quien espere', () => {
  const t0 = 5_000_000;
  const tope = TURNO_PLAZA_MIN * 60_000;

  it('sin nadie esperando NO se cede: no se reparte nada y cuesta un arranque de Chrome', () => {
    const r = decideTurnoDePlaza({ desdeMs: t0, ahoraMs: t0 + tope * 3, topeMs: tope, hayEspera: false });
    expect(r.ceder).toBe(false);
    expect(r.motivo).toMatch(/nadie esperando/);
  });

  it('con alguien esperando y el turno cumplido, se cede la plaza', () => {
    const r = decideTurnoDePlaza({ desdeMs: t0, ahoraMs: t0 + tope, topeMs: tope, hayEspera: true });
    expect(r.ceder).toBe(true);
    expect(r.motivo).toMatch(/turno agotado/);
    expect(r.minutos).toBe(TURNO_PLAZA_MIN);
  });

  it('dentro del plazo se sigue trabajando, y se dice cuánto queda', () => {
    const r = decideTurnoDePlaza({ desdeMs: t0, ahoraMs: t0 + 10 * 60_000, topeMs: tope, hayEspera: true });
    expect(r.ceder).toBe(false);
    expect(r.minutos).toBe(10);
    expect(r.motivo).toMatch(/turno en curso/);
  });

  it('sin plazo válido no se cede nunca: la rotación no puede depender de un dato ausente', () => {
    for (const topeMs of [0, -1, NaN, undefined, null]) {
      expect(decideTurnoDePlaza({ desdeMs: t0, ahoraMs: t0 + tope * 9, topeMs, hayEspera: true }).ceder, String(topeMs)).toBe(false);
    }
  });
});

/**
 * Y la plaza de un worker VIVO no se puede tirar. Aquí estuvo el fallo más caro del 18/09/2026: una caducidad
 * de 60 minutos borraba la ficha de un worker que llevaba una hora trabajando, el reparto creía que esa plaza
 * estaba libre y abría otro navegador. Nueve navegadores con tres fichas: el gobernador contando dieciséis
 * huecos que no existían.
 */
describe('plazaAbandonada: sólo se libera la plaza de quien no está', () => {
  const ahora = 9_000_000;

  it('un worker vivo con latido fresco conserva su plaza, por larga que sea la sesión', () => {
    const r = plazaAbandonada({ pid: 1234, procesoVivo: true, ultimoLatidoMs: ahora - 60_000, ahoraMs: ahora });
    expect(r.abandonada).toBe(false);
    // Y seis horas después sigue siendo suya: porque sigue latiendo (el latido es fresco respecto a ESE
    // momento, no respecto al arranque). Lo que caduca no es la sesión, es el latido.
    const larga = plazaAbandonada({
      pid: 1234, procesoVivo: true, ultimoLatidoMs: ahora + 6 * 3600_000 - 60_000, ahoraMs: ahora + 6 * 3600_000,
    });
    expect(larga.abandonada).toBe(false);
    // En cambio, si dejó de latir hace horas (murió sin avisar), la plaza se libera.
    const sinLatir = plazaAbandonada({ pid: 1234, procesoVivo: true, ultimoLatidoMs: ahora - 60_000, ahoraMs: ahora + 6 * 3600_000 });
    expect(sinLatir.abandonada).toBe(true);
  });

  it('si el proceso dueño ya no existe, la plaza se libera', () => {
    const r = plazaAbandonada({ pid: 1234, procesoVivo: false, ultimoLatidoMs: ahora, ahoraMs: ahora });
    expect(r.abandonada).toBe(true);
    expect(r.motivo).toMatch(/ya no existe/);
  });

  it('sin señales durante más de quince minutos, también (murió sin poder avisar)', () => {
    const r = plazaAbandonada({ pid: 1234, procesoVivo: true, ultimoLatidoMs: ahora - SIN_LATIDO_MS - 60_000, ahoraMs: ahora });
    expect(r.abandonada).toBe(true);
    expect(r.motivo).toMatch(/sin señales/);
  });

  it('una ficha sin dueño se recoge', () => {
    expect(plazaAbandonada({ pid: 0, procesoVivo: true, ultimoLatidoMs: ahora, ahoraMs: ahora }).abandonada).toBe(true);
  });

  /**
   * Y el caso de DOCKER, que no es el mismo: cada contenedor tiene su propio espacio de identificadores, así que
   * el PID de una ficha escrita en un contenedor puede existir —con otro significado— dentro del contenedor de
   * al lado. Comprobado el 18/09/2026 con la flota en contenedores. Por eso la ficha lleva también el contenedor:
   * si es de otro, no se puede preguntar por el proceso y manda el latido.
   */
  it('la plaza de OTRO contenedor no se juzga por el identificador de proceso: manda el latido', () => {
    const viva = plazaAbandonada({
      pid: 27, host: 'otro-contenedor', miHost: 'el-mio', procesoVivo: true, ultimoLatidoMs: ahora - 30_000, ahoraMs: ahora,
    });
    expect(viva.abandonada).toBe(false);
    expect(viva.motivo).toMatch(/latido/);
    // Aunque el proceso «exista» en mi espacio de identificadores, no es el mismo proceso: no cuenta.
    const muerta = plazaAbandonada({
      pid: 27, host: 'otro-contenedor', miHost: 'el-mio', procesoVivo: true,
      ultimoLatidoMs: ahora - SIN_LATIDO_MS - 1000, ahoraMs: ahora,
    });
    expect(muerta.abandonada).toBe(true);
    expect(muerta.motivo).toMatch(/sin señales/);
  });

  it('la plaza de MI contenedor sí se comprueba por el proceso, y se libera en seguida', () => {
    const muerta = plazaAbandonada({
      pid: 27, host: 'el-mio', miHost: 'el-mio', procesoVivo: false, ultimoLatidoMs: ahora, ahoraMs: ahora,
    });
    expect(muerta.abandonada).toBe(true);
    expect(muerta.motivo).toMatch(/ya no existe/);
  });
});

describe('la federación prioritaria (Castilla y León) tiene plaza reservada sin abrir navegadores de más', () => {
  it('mientras la prioritaria trabaja, las demás reparten una plaza menos', () => {
    expect(plazasCompartidas({ plazas: 5, prioritariaActiva: true })).toBe(4);
    expect(plazasCompartidas({ plazas: 5, prioritariaActiva: false })).toBe(5);
  });
  it('nunca se queda nadie sin plaza: con una sola, se comparte', () => {
    expect(plazasCompartidas({ plazas: 1, prioritariaActiva: true })).toBe(1);
    expect(plazasCompartidas({ plazas: 0 })).toBe(1);
  });
  it('cuando entra la prioritaria, suelta la plaza sólo quien ocupa la que sobra', () => {
    expect(cedePorPrioridad({ nombreSlot: 'slot-5.lock', plazas: 5, prioritariaActiva: true }).ceder).toBe(true);
    expect(cedePorPrioridad({ nombreSlot: 'slot-4.lock', plazas: 5, prioritariaActiva: true }).ceder).toBe(false);
  });
  it('sin prioritaria activa nadie cede, y la plaza reservada no cuenta como numerada', () => {
    expect(cedePorPrioridad({ nombreSlot: 'slot-5.lock', plazas: 5, prioritariaActiva: false }).ceder).toBe(false);
    expect(cedePorPrioridad({ nombreSlot: PLAZA_PRIORITARIA, plazas: 5, prioritariaActiva: true }).ceder).toBe(false);
  });
});
