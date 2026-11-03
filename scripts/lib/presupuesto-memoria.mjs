/**
 * Gobernador de memoria: cuántos recolectores pueden tener navegador a la vez, a partir de un PRESUPUESTO.
 *
 * ## Por qué no basta con lo que había
 *
 * Hasta ahora cada recolector decidía por su cuenta: un número fijo de plazas (`MAX_CHROMES_PNFG`) y un
 * umbral fijo de memoria libre (`freemem() >= 2,5 GB`). Eso tiene dos problemas, y los dos se vieron el
 * 17/09/2026 en la máquina de desarrollo:
 *
 *   1. **La decisión es individual**: diecisiete workers pueden mirar a la vez, ver 2,5 GB libres y abrir
 *      todos su navegador. La suma se pasa del presupuesto aunque cada uno haya mirado bien.
 *   2. **El umbral es fijo y no depende de la máquina**: en un servidor de 10 GB, 2,5 GB libres significa que
 *      ya se ha gastado el 75 %; en una de 32 GB, significa que no se ha gastado casi nada. El mismo número
 *      gobierna dos realidades opuestas. Y si el umbral es inalcanzable (Cataluña esperaba 6,5 GB), el worker
 *      se queda en un bucle infinito: proteger deja de proteger y pasa a bloquear.
 *
 * ## Qué hace esto en su lugar
 *
 * Un presupuesto explícito, repartido en plazas, y **contado con aritmética**: cada plaza de navegador vale
 * un coste medido (~0,75 GB), así que el número de admitidos se calcula, no se adivina. Quien llama cuenta las
 * plazas ocupadas (las fichas de `slots-chrome`) y sólo admite una más si cabe en el presupuesto.
 *
 * Módulo PURO a propósito: ni toca el sistema de ficheros ni consulta la memoria del equipo. Así se puede
 * probar el reparto entero sin abrir un navegador de verdad.
 */

/**
 * Coste medido de un recolector con su navegador abierto, en GB.
 *
 * El 0,6 de la primera medición (17 workers ≈ 9-10 GB) se quedó corto y se corrigió el 17/09/2026 midiendo el
 * navegador de cada perfil, uno a uno, en plena faena: entre **250 y 646 MB** con 7-9 procesos, y **hasta
 * 930 MB** en los que llevaban más páginas pesadas encima; el `node` del recolector suma 70-115 MB. O sea que
 * un recolector PNFG cuesta de verdad entre 0,35 y 1,0 GB, y **0,75 GB de media** es lo que hay que reservar
 * por plaza. Sobreestimar aquí no es prudencia: es admitir recolectores que no caben y volver al problema que
 * este gobernador existe para evitar.
 */
export const COSTE_POR_RECOLECTOR_GB = 0.75;

/** Reserva que no se toca nunca: el sistema operativo, la base de datos y el propio agente necesitan aire. */
export const RESERVA_GB = 1.5;

/**
 * Plazas de navegador según el presupuesto.
 *
 * El presupuesto, por orden de precedencia:
 *
 *   1. `FACYLF_MEMORIA_GB`, si está puesto: es el número que se usa en el servidor («esto corre en 10 GB»);
 *   2. si no, la MITAD de la memoria del equipo. En la máquina de desarrollo son ~16 GB, que dan más plazas
 *      que federaciones y por tanto no limitan nada: el gobernador sólo aprieta cuando de verdad hay un
 *      techo. En un servidor de 10 GB, la mitad serían 5 GB (8 plazas) y con la variable puesta se ajusta.
 *
 * Se devuelve `plazas` junto con `motivo`, porque un límite que no se explica acaba pareciendo una avería.
 */
export function repartePlazas({ memoriaGb, memoriaTotalGb, costePorRecolectorGb = COSTE_POR_RECOLECTOR_GB, reservaGb = RESERVA_GB } = {}) {
  const total = Number(memoriaTotalGb);
  const declarada = Number(memoriaGb);
  const presupuestoTotalGb = Number.isFinite(declarada) && declarada > 0
    ? declarada
    : (Number.isFinite(total) && total > 0 ? total / 2 : 0);
  const paraNavegadores = Math.max(0, presupuestoTotalGb - reservaGb);
  const plazas = Math.floor(paraNavegadores / costePorRecolectorGb);
  return {
    presupuestoTotalGb,
    reservaGb,
    paraNavegadoresGb: Number(paraNavegadores.toFixed(2)),
    costePorRecolectorGb,
    plazas: Math.max(1, plazas),
    motivo: Number.isFinite(declarada) && declarada > 0
      ? `presupuesto declarado de ${presupuestoTotalGb} GB para todo`
      : `sin presupuesto declarado: se usa la mitad de los ${total.toFixed(1)} GB del equipo`,
  };
}

/**
 * ¿Toca reciclar el navegador?
 *
 * Antes la única regla era un número fijo de trabajos (`hechos % 10 === 0`). Es una aproximación que se queda
 * corta o larga según el portal: diez actas de una federación que sirve páginas ligeras dejan el navegador
 * como nuevo, y diez páginas de un portal pesado lo dejan en 600 MB. Medido el 17/09/2026: un recolector con
 * su Chrome va de ~250 MB recién abierto a ~500-600 MB tras una tanda.
 *
 * Ahora manda el CONSUMO, y el número de trabajos queda como **suelo** (no se recicla por debajo de él: un
 * arranque de Chrome cuesta, y reciclar cada dos páginas sería peor que no reciclar).
 *
 * Las dos guardas son deliberadas:
 *
 *   1. **si no se pudo medir, no se recicla**: `memoriaMb` nulo o no numérico significa «no lo sé», y
 *      reciclar por lo que no se sabe es peor que esperar al suelo por trabajos. Un fallo de medición no
 *      puede cambiar el comportamiento.
 *   2. **el tope es por navegador, no por máquina**: se mide el Chrome de ESTE worker, que es lo único que
 *      éste puede devolver al reciclarlo.
 */
export function tocaReciclar({ hechos, cada, memoriaMb, topeMb }) {
  const porTrabajos = Number.isFinite(Number(cada)) && Number(cada) > 0 && Number(hechos) % Number(cada) === 0;
  const medido = Number(memoriaMb);
  const sabe = Number.isFinite(medido) && medido > 0;
  const porConsumo = sabe && Number.isFinite(Number(topeMb)) && medido >= Number(topeMb);
  return {
    reciclar: porTrabajos || porConsumo,
    motivo: porConsumo ? `el navegador va por ${Math.round(medido)} MB (tope ${topeMb} MB)`
      : (porTrabajos ? `toca por número de trabajos (${hechos})` : 'no toca'),
    medidoMb: sabe ? medido : null,
  };
}

/**
 * ¿Seguir esperando plaza de navegador, o salir?
 *
 * Es la pieza que convierte «esperar» en algo que termina. Antes esto era un `while (true)`: si el reparto no
 * concedía plaza —o el umbral era inalcanzable, como el de 6,5 GB que tenía Cataluña—, el worker se quedaba
 * dentro para siempre, imprimiendo el mismo mensaje cada 15-25 s, sin que nadie pudiera distinguirlo de uno
 * averiado y **sin que el supervisor lo relanzara nunca, porque nunca terminaba**.
 *
 * El reloj entra como dato (`ahoraMs`), no se lee aquí: así la espera se puede probar en milisegundos en vez
 * de esperar quince minutos de verdad, que es la diferencia entre una prueba que se ejecuta siempre y una que
 * se ejecuta cuando alguien tiene paciencia.
 *
 * Salir NO es fallar: el llamador lo trata como «hoy no se puede recolectar», deja la cola intacta y la
 * próxima sesión lo reintenta.
 */
export function decideEsperaDePlaza({ esperandoDesdeMs, ahoraMs, topeMs, motivoDelHueco }) {
  const esperadoMs = Math.max(0, Number(ahoraMs) - Number(esperandoDesdeMs));
  const tope = Number(topeMs);
  if (Number.isFinite(tope) && tope > 0 && esperadoMs >= tope) {
    return {
      salir: true,
      esperadoMs,
      minutos: Math.round(esperadoMs / 60000),
      motivo: `no se consiguió plaza de navegador en ${Math.round(esperadoMs / 60000)} min`
        + `${motivoDelHueco ? ` (${motivoDelHueco})` : ''}`,
    };
  }
  return { salir: false, esperadoMs, minutos: Math.round(esperadoMs / 60000), motivo: 'sigue esperando' };
}

/**
 * ¿Cabe un navegador más?
 *
 * `ocupadas` son las plazas que ya están repartidas (fichas vivas en `slots-chrome`). La comprobación es de
 * reparto, no de suerte: si las ocupadas más ésta no caben, el worker espera.
 *
 * `memoriaLibreGb` es la segunda red, y sólo la segunda: aunque quepan por reparto, un navegador no se abre
 * si al sistema le queda menos que la reserva. En la máquina compartida del usuario es la que evita que los
 * recolectores se coman el escritorio; en el servidor dedicado casi nunca es la que decide.
 */
export function cabeOtroNavegador({ plazas, ocupadas, memoriaLibreGb, reservaGb = RESERVA_GB, memoriaDeLaMaquinaGb, reservaDeLaMaquinaGb = RESERVA_GB } = {}) {
  const reparto = Number(ocupadas) + 1 <= Number(plazas);
  const aire = !Number.isFinite(Number(memoriaLibreGb)) || Number(memoriaLibreGb) >= reservaGb;
  /*
   * ── Y EL AIRE DE LA MÁQUINA, QUE ES OTRA COSA ──────────────────────────────────────────────────────────
   *
   * `memoriaLibreGb` es lo que le queda al contenedor (cgroups) cuando la flota va en Docker: es lo que decide
   * si cabe un Chrome MÁS dentro de su límite. Pero en el servidor de 10 GB no vive sólo la recolección: están
   * PostgreSQL, la web y el propio sistema. Si los recolectores llenan su presupuesto y además el resto crece,
   * alguien se queda sin memoria; y al revés, cuando el trabajo escasea —porque ya se ha ingerido casi todo— los
   * recolectores tienen que SOLTAR memoria, no aferrarse al presupuesto.
   *
   * Por eso se mira también la memoria libre del SISTEMA contra una reserva propia. No es lo mismo que el
   * reparto: el reparto dice «caben once», y esto dice «y al sistema le quedan 1,5 GB para lo suyo». Cuando esa
   * reserva se agota, los recolectores dejan de abrir navegadores nuevos (los que están siguen, y al terminar su
   * sesión el hueco no se vuelve a ocupar). Encoge solo, sin que nadie lo apague a mano.
   */
  const maquina = Number(memoriaDeLaMaquinaGb);
  const aireDeLaMaquina = !Number.isFinite(maquina) || maquina >= reservaDeLaMaquinaGb;
  return {
    cabe: reparto && aire && aireDeLaMaquina,
    motivo: !reparto
      ? `no cabe por reparto: ${ocupadas} plazas ocupadas de ${plazas}`
      : (!aire
        ? `cabe por reparto (${ocupadas}/${plazas}) pero a este contenedor le quedan ${Number(memoriaLibreGb).toFixed(2)} GB, menos que la reserva de ${reservaGb} GB`
        : (!aireDeLaMaquina
          ? `cabe por reparto (${ocupadas}/${plazas}) pero al SISTEMA le quedan ${maquina.toFixed(2)} GB y su reserva es ${reservaDeLaMaquinaGb} GB: se deja sitio a lo demás`
          : 'cabe')),
  };
}

/**
 * ── TURNO DE PLAZA CON ROTACIÓN ──────────────────────────────────────────────────────────────────────
 *
 * Cuando la flota no cabe entera en el presupuesto —en un servidor de 10 GB caben 11 plazas y hay 18
 * federaciones— el que llega tarde espera. Sin rotación, el que consigue plaza **no la suelta**: sus sesiones
 * se encadenan una tras otra y las federaciones sin hueco no entran nunca. En una máquina de escritorio eso se
 * disimula; en un servidor encendido 24/7 es una federación condenada a no recolectar.
 *
 * El turno es un plazo, no un castigo: agotado, el worker **termina su sesión en limpio** (cierra el
 * navegador, libera la plaza, deja la cola intacta) y su supervisor lo relanzará más tarde, entrando por el
 * final de la cola de espera. Así el hueco circula.
 *
 * Tres decisiones que están en la firma a propósito:
 *
 *   1. **sólo se cede si hay alguien esperando** (`hayEspera`): si no hay nadie en la cola, ceder la plaza no
 *      reparte nada y sí cuesta un arranque de Chrome. Se sigue trabajando.
 *   2. **no se cede a mitad de trabajo**: se comprueba entre trabajos, nunca dentro de uno, para no dejar una
 *      ficha a medias.
 *   3. **un plazo sin tope válido no caduca** (`topeMs` ausente o no numérico → nunca cede): la rotación no
 *      puede depender de un dato que falta, igual que la espera no depende de un reloj ausente.
 */
export const TURNO_PLAZA_MIN = 150;

export function decideTurnoDePlaza({ desdeMs, ahoraMs, topeMs, hayEspera = false } = {}) {
  const tope = Number(topeMs);
  const desde = Number(desdeMs);
  const ahora = Number(ahoraMs);
  const minutos = Number.isFinite(desde) && Number.isFinite(ahora) ? Math.max(0, Math.round((ahora - desde) / 60000)) : null;
  if (!hayEspera) return { ceder: false, motivo: 'no hay nadie esperando plaza', minutos };
  if (!Number.isFinite(tope) || tope <= 0 || !Number.isFinite(desde) || !Number.isFinite(ahora)) {
    return { ceder: false, motivo: 'sin plazo de turno válido: no se cede', minutos };
  }
  const agotado = ahora - desde >= tope;
  return {
    ceder: agotado,
    motivo: agotado
      ? `turno agotado tras ${minutos} min con federaciones esperando: se libera la plaza`
      : `turno en curso (${minutos} min de ${Math.round(tope / 60000)} min)`,
    minutos,
  };
}

/** ¿Se puede dar por muerta una plaza cuyo dueño no da señales? Un worker vivo late su ficha. */
export const SIN_LATIDO_MS = 5 * 60_000;

/**
 * ¿Está abandonada la plaza de otro worker?
 *
 * ── POR QUÉ NO BASTA CON EL IDENTIFICADOR DE PROCESO ─────────────────────────────────────────────────
 *
 * En el PC, la ficha de la plaza guarda el identificador del worker y `process.kill(pid, 0)` responde si vive.
 * En Docker **no sirve**: cada contenedor tiene su propio espacio de identificadores, así que el PID 27 de una
 * federación puede ser perfectamente otro proceso dentro del contenedor de al lado. Comprobado el 18/09/2026 con
 * la flota en contenedores: el PID de una ficha no existía en el contenedor que la había escrito (se había
 * muerto el worker) y, sin embargo, podía existir en cualquier otro. Con esa confusión, una plaza muerta parece
 * viva, el reparto cree que hay un navegador menos de los que hay y **abre uno de más** — justo lo que el
 * presupuesto de 10 GB no puede permitirse.
 *
 * Por eso la ficha lleva también el **contenedor** que la escribió (`hostname`, que en Docker es único por
 * contenedor):
 *
 *   · si la escribió MI contenedor, se comprueba el proceso (`procesoVivo`), que es rápido y exacto;
 *   · si la escribió OTRO contenedor, no se puede comprobar el proceso: manda el **latido**, que el worker
 *     refresca con cada trabajo;
 *   · en los dos casos, un latido viejo libera la plaza.
 */
export function plazaAbandonada({ pid, host, miHost, procesoVivo: sigueVivo, ultimoLatidoMs, ahoraMs, sinLatidoMs = SIN_LATIDO_MS } = {}) {
  if (!Number(pid)) return { abandonada: true, motivo: 'ficha sin dueño' };
  const ultimo = Number(ultimoLatidoMs);
  const ahora = Number(ahoraMs);
  const sinLatir = Number.isFinite(ultimo) && Number.isFinite(ahora) && ahora - ultimo > sinLatidoMs;
  const mismoContenedor = !host || !miHost || host === miHost;
  if (mismoContenedor && sigueVivo === false) return { abandonada: true, motivo: 'el proceso dueño ya no existe' };
  if (sinLatir) return { abandonada: true, motivo: `sin señales desde hace ${Math.round((ahora - ultimo) / 60000)} min` };
  if (!mismoContenedor) return { abandonada: false, motivo: `viva en el contenedor ${host} (comprobada por latido)` };
  return { abandonada: false, motivo: 'viva' };
}

/**
 * ── LA FEDERACIÓN PRIORITARIA: UNA PLAZA RESERVADA ───────────────────────────────────────────────────
 *
 * Decisión de David (15/10/2026): Castilla y León es la primera que tiene que terminar, en el PC y en el
 * servidor. Hasta ahora competía por las plazas como una más: con 5 plazas y 14 federaciones en el servidor,
 * esperaba su turno y lo cedía como las demás.
 *
 * Ahora tiene una plaza RESERVADA (`slot-prioridad.lock`), que no se cede por turno. Para no abrir un navegador
 * de más (el servidor se ha caído por sobrecarga), mientras esa plaza está ocupada las demás reparten UNA
 * MENOS: el total de navegadores sigue siendo el del presupuesto. Si la prioritaria no está trabajando, su
 * plaza vuelve al reparto general y nadie pierde nada.
 */
export const PLAZA_PRIORITARIA = 'slot-prioridad.lock';

/** Cuántas plazas reparten las federaciones normales. Nunca menos de una. */
export function plazasCompartidas({ plazas, prioritariaActiva = false } = {}) {
  const p = Math.max(1, Math.floor(Number(plazas)) || 1);
  return prioritariaActiva && p > 1 ? p - 1 : p;
}

/**
 * ¿Tiene que soltar su plaza una federación normal porque la prioritaria acaba de entrar? Sólo la que ocupa
 * una plaza que ya no está en el reparto (la última), y se comprueba entre trabajos, nunca a mitad de uno.
 */
export function cedePorPrioridad({ nombreSlot, plazas, prioritariaActiva = false } = {}) {
  const m = /^slot-(\d+)\.lock$/.exec(String(nombreSlot ?? ''));
  if (!prioritariaActiva || !m) return { ceder: false, motivo: 'sin prioritaria activa o plaza no numerada' };
  const limite = plazasCompartidas({ plazas, prioritariaActiva });
  const n = Number(m[1]);
  return n > limite
    ? { ceder: true, motivo: `la federación prioritaria ocupa su plaza reservada: se libera la plaza ${n} (quedan ${limite} compartidas)` }
    : { ceder: false, motivo: `plaza ${n} dentro de las ${limite} compartidas` };
}
/** PIDs repeat across Docker namespaces; queue tickets need the host as well. */
export function nombreFichaEspera(prefijo, pid, host) {
  if (!/^espera-[a-z-]*$/.test(prefijo) || !Number.isInteger(pid) || pid <= 0 || !/^[a-zA-Z0-9_.-]+$/.test(host)) {
    throw new Error('Identidad de espera invalida');
  }
  return `${prefijo}${host}-${pid}.ficha`;
}
