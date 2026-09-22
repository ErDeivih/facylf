/**
 * ── MONITORIZACIÓN DE LA FLOTA: qué se vigila y cuándo se avisa ────────────────────────────────────────
 *
 * El objetivo no es hacer gráficas: es poder **depurar** y enterarse de lo que pasa sin estar mirando. Este
 * módulo es la parte que DECIDE (pura y probada); el que lee el sistema y escribe los ficheros es
 * `scripts/monitor-flota.mjs`.
 *
 * Lo que se vigila, y por qué cada cosa:
 *
 *   · **la rebanada de memoria** (`facylf.slice`): `memory.current`, `memory.peak` y `memory.events`. Es el
 *     tope duro de 10 GB del proyecto entero, así que un `oom_kill` aquí significa que alguien se quedó sin
 *     memoria y hay que mirarlo, aunque el recolector lo haya sobrevivido.
 *   · **cada federación**: si tiene trabajo pendiente y no pide, está atascada; si falla mucho, o el portal
 *     cambió o el recolector se rompió. Y el estado se distingue: «esperando memoria» y «esperando turno» NO
 *     son averías (es el gobernador y la rotación haciendo su trabajo).
 *   · **el canónico y el importador**: si la base no responde no hay plataforma; si un lote falla repetido, la
 *     importación masiva se queda parada sin que nadie lo note.
 *   · **el disco**: quedarse sin disco rompe las colas, que es lo único irrecuperable.
 *
 * Nada de esto cambia el comportamiento de los recolectores: sólo mira y avisa.
 */

/** Umbrales por defecto. Están aquí, juntos y con nombre, para poder discutirlos y ajustarlos. */
export const UMBRALES = {
  /** Minutos sin pedir con trabajo disponible para considerar una federación atascada. */
  minutosSinPedir: 20,
  /** Proporción de fallos de una federación en la ventana que dispara aviso. */
  proporcionFallos: 0.1,
  /** Minutos de la ventana para medir fallos. */
  minutosVentanaFallos: 30,
  /** Memoria de la rebanada a partir de la cual se avisa (el tope duro son 10 GB). */
  memoriaAvisoGb: 9,
  /** Minutos seguidos por encima de ese aviso para que merezca la pena decirlo. */
  minutosMemoriaAlta: 15,
  /** Disco libre por debajo del cual se avisa. */
  discoLibreProporcion: 0.15,
};

/** Estados de una federación que NO son una avería: son el gobernador y la rotación funcionando. */
const ESPERAS_LEGITIMAS = new Set(['memoria', 'turno', 'pausa', 'sin-trabajo']);

/** Lo que dice un registro cuando la federación se está cayendo de verdad. */
const LINEAS_DE_AVERIA = /termin[oó] con c[oó]digo [1-9]|error|malformed|enoent|no existe|traceback|fatal/i;

/**
 * Una federación está **atascada** si tiene trabajo disponible ahora y no ha pedido nada en la ventana.
 *
 * Ojo con el matiz: si está esperando memoria o turno, no está atascada, está en la cola. Y si no tiene trabajo
 * disponible, tampoco: no hay nada que pedir.
 *
 * ── Y EL MATIZ QUE FALTABA (22/09/2026) ──────────────────────────────────────────────────────────────────
 *
 * Con 19 federaciones y 3 plazas de navegador, una federación pasa buena parte del rato **esperando turno**, y
 * el estado se deduce de la última línea de su registro. El problema: entre dos mensajes de espera, la última
 * línea es la del PLAN («sesión limitada a 228 trabajos…»), así que la federación figuraba como `trabajando` y
 * el monitor avisaba «federación atascada» cada media hora por algo que es el reparto funcionando. Medido el
 * 22/09/2026: avisos falsos de Asturias (107 min), Melilla (51) y Navarra (26) mientras las tres esperaban
 * plaza, con el sistema perfectamente sano.
 *
 * Así que cuando el estado no basta, se mira lo que sólo pasa cuando hay un problema de verdad:
 *
 *   · **tiene plaza de navegador y no pide**: el navegador se ha quedado colgado, eso sí es un atasco;
 *   · **su registro dice que se cae** («terminó con código 1», `malformed`, `ENOENT`): es el bucle de caída que
 *     dejó Madrid/Murcia/Valencia con la cola ilegible, y hay que avisar;
 *   · **no se escribe en su registro desde hace media hora**: el worker murió y nadie lo relanzó.
 *
 * Sin ninguna de las tres, no pedir es esperar el turno, no estar atascada.
 */
export function estaAtascada(federacion, umbrales = UMBRALES) {
  if (!federacion || federacion.disponibles === 0) return false;
  if (ESPERAS_LEGITIMAS.has(federacion.estado)) return false;
  const minutos = Number(federacion.minutosSinPedir);
  if (!Number.isFinite(minutos) || minutos < umbrales.minutosSinPedir) return false;

  if (federacion.plaza) return true;
  if (LINEAS_DE_AVERIA.test(String(federacion.ultimaLinea ?? ''))) return true;
  const sinRegistro = Number(federacion.minutosSinRegistro);
  if (Number.isFinite(sinRegistro) && sinRegistro >= umbrales.minutosSinPedir) return true;
  return false;
}

/** La proporción de fallos de la ventana (0 si no hubo peticiones: no se inventa un cero de la nada). */
export function proporcionDeFallos(federacion) {
  const peticiones = Number(federacion?.peticionesVentana ?? 0);
  const fallos = Number(federacion?.fallosVentana ?? 0);
  if (!Number.isFinite(peticiones) || peticiones <= 0) return null;
  return fallos / peticiones;
}

/**
 * Las alertas que hay que dar ahora mismo.
 *
 * `estadoPrevio` trae lo que ya se avisó (`{ claves: {clave: {desde}} }`) para no repetir la misma alerta cada
 * minuto: una alerta que suena durante una hora seguida deja de ser una alerta. Se devuelve además el estado
 * nuevo, para guardarlo.
 */
export function decideAlertas(instantanea, estadoPrevio = { claves: {} }, umbrales = UMBRALES) {
  const alertas = [];
  const claves = {};
  const ahora = instantanea.cuando ?? new Date().toISOString();
  const previas = estadoPrevio?.claves ?? {};

  const anota = (clave, nivel, titulo, detalle, desde = ahora) => {
    const previa = previas[clave];
    claves[clave] = { desde: previa?.desde ?? desde, ultimaVez: ahora };
    // Se avisa la primera vez y, como mucho, una vez por hora mientras siga pasando.
    const yaAvisada = previa && (Date.parse(ahora) - Date.parse(previa.ultimaVez ?? 0)) < 60 * 60_000;
    if (!yaAvisada) alertas.push({ clave, nivel, titulo, detalle, desde: claves[clave].desde });
  };

  // 1. Memoria de la rebanada: el tope duro del proyecto entero.
  const memoriaGb = Number(instantanea.rebanada?.memoriaGb ?? 0);
  if (Number(instantanea.rebanada?.oomKills ?? 0) > 0) {
    anota('oom', 'critico', 'Sin memoria en la rebanada de facylf',
      `${instantanea.rebanada.oomKills} proceso(s) murieron por falta de memoria (pico ${instantanea.rebanada.picoGb ?? '?'} GB). `
      + 'Mira el reparto de plazas en el registro del monitor o baja FACYLF_MEMORIA_GB.');
  }
  if (memoriaGb >= umbrales.memoriaAvisoGb) {
    anota('memoria-alta', 'medio', 'La flota va cerca del tope de memoria',
      `${memoriaGb.toFixed(2)} GB en uso de 10 GB (aviso a partir de ${umbrales.memoriaAvisoGb} GB).`);
  }

  // 2. Federaciones atascadas o que fallan mucho.
  for (const f of instantanea.federaciones ?? []) {
    if (estaAtascada(f, umbrales)) {
      anota(`atascada:${f.federacion}`, 'alto', `Federación atascada: ${f.federacion}`,
        `Tiene ${f.disponibles} trabajos disponibles y lleva ${f.minutosSinPedir} min sin pedir (estado: ${f.estado}). `
        + `Última línea de su registro: ${f.ultimaLinea ?? '(sin registro)'}`);
    }
    const proporcion = proporcionDeFallos(f);
    if (proporcion !== null && proporcion > umbrales.proporcionFallos && Number(f.peticionesVentana) >= 10) {
      anota(`fallos:${f.federacion}`, 'alto', `Fallos en ${f.federacion}`,
        `${f.fallosVentana} de ${f.peticionesVentana} peticiones fallaron en la última media hora `
        + `(${(proporcion * 100).toFixed(0)} %). Último error: ${f.ultimoError ?? '(sin detalle)'}`);
    }
  }

  // 3. Canónico e importador: sin base no hay plataforma; con el importador parado, la web no crece.
  if (instantanea.canonico && instantanea.canonico.responde === false) {
    anota('postgres', 'alto', 'El canónico no responde',
      `PostgreSQL no contestó: ${instantanea.canonico.detalle ?? 'sin detalle'}`);
  }
  if (Number(instantanea.importador?.lotesFallidosSeguidos ?? 0) >= 3) {
    anota('importador', 'alto', 'La importación va fallando',
      `${instantanea.importador.lotesFallidosSeguidos} lotes fallidos seguidos. Último: ${instantanea.importador.ultimoFallo ?? ''}`);
  }

  // 4. Disco: sin disco se rompen las colas, que es lo único que no se puede recuperar.
  const libre = Number(instantanea.disco?.libreProporcion);
  if (Number.isFinite(libre) && libre < umbrales.discoLibreProporcion) {
    anota('disco', 'medio', 'Queda poco disco',
      `Al disco le queda ${(libre * 100).toFixed(1)} % libre (${instantanea.disco.libreGb?.toFixed(1)} GB).`);
  }

  // 5. Y la vigilancia en sí: si una federación espera memoria demasiado tiempo, es que el presupuesto no llega.
  const esperandoMemoria = (instantanea.federaciones ?? []).filter((f) => f.estado === 'memoria').length;
  if (esperandoMemoria >= Math.ceil(((instantanea.federaciones ?? []).length) * 0.75) && (instantanea.federaciones ?? []).length > 0) {
    anota('presupuesto-corto', 'medio', 'Casi toda la flota está esperando memoria',
      `${esperandoMemoria} de ${instantanea.federaciones.length} federaciones esperan plaza de navegador. `
      + 'El presupuesto declarado (FACYLF_MEMORIA_GB) no da para todas a la vez: es lo esperado si hay pocas plazas.');
  }

  return { alertas, estado: { claves, cuando: ahora } };
}

/** El resumen de una línea que va al histórico (para ver tendencias sin abrir el JSON entero). */
export function lineaDeHistorial(instantanea) {
  const f = instantanea.federaciones ?? [];
  const sum = (campo) => f.reduce((a, x) => a + (Number(x[campo]) || 0), 0);
  return {
    cuando: instantanea.cuando,
    memoriaGb: instantanea.rebanada?.memoriaGb ?? null,
    picoGb: instantanea.rebanada?.picoGb ?? null,
    oomKills: instantanea.rebanada?.oomKills ?? 0,
    contenedores: instantanea.contenedores?.longitud ?? null,
    federacionesPidiendo: f.filter((x) => (x.peticionesVentana ?? 0) > 0).length,
    peticionesVentana: sum('peticionesVentana'),
    fallosVentana: sum('fallosVentana'),
    pendientes: sum('pendientes'),
    disponibles: sum('disponibles'),
    discoLibreGb: instantanea.disco?.libreGb ?? null,
  };
}

/** El texto que se manda a ntfy (o al registro) a partir de una alerta. */
export function textoDeAlerta(alerta) {
  return `${alerta.titulo}\n${alerta.detalle}\n(desde ${alerta.desde})`;
}
