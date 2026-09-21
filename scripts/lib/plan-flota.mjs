/**
 * ── PLAN DE LA FLOTA EN EL PC: quién es cada recolector y cómo se relanza ──────────────────────────────
 *
 * En el PC cada federación la sostenía su propia cadena de Windows:
 *
 *     Programador de tareas → wscript (oculta la ventana) → powershell (el bucle) → cmd → node (el worker)
 *
 * Medido el 21/09/2026 con las 19 federaciones en marcha: esa cadena costaba **18 `wscript` (464 MB
 * residentes) + 20 `powershell` (671 MB residentes, 1 454 MB privados) + 19 `cmd`**, más de un giga para
 * lanzar la flota — más que todos los navegadores juntos, y sin recolectar nada. En el servidor esto no
 * existe (un contenedor por federación). Este módulo es lo que permite sustituir esas 19 cadenas por **un
 * solo proceso Node** que lance y relance las 19 federaciones.
 *
 * Regla que no se toca: **el comportamiento de los workers es exactamente el mismo**. Aquí sólo se decide
 * a quién se lanza, con qué entorno, cada cuánto se reintenta y qué se limpia antes; los intervalos, pausas,
 * reintentos e idempotencia siguen viviendo en cada recolector y en el gobernador de memoria.
 *
 * Módulo PURO a propósito: no toca procesos, ni ficheros, ni el reloj. Todo lo que hace falta del sistema
 * entra como dato (la lista de procesos, la salida de los guiones de planificación, la fecha), así que el
 * plan entero se puede probar sin lanzar un solo navegador.
 */

/** Las 15 federaciones con perfil propio en `perfiles/` (todas PNFG, con navegador). */
export const FEDERACIONES_PNFG = [
  'andalucia', 'aragon', 'asturias', 'baleares', 'canarias', 'cantabria', 'castilla-la-mancha',
  'ceuta', 'euskadi', 'extremadura', 'galicia', 'melilla', 'murcia', 'navarra', 'rioja',
];

/**
 * Castilla y León no tiene perfil: es el comportamiento original del recolector (`RFCYLF`) y su cola vive
 * en `descargas-federacion`. Se lanza SIN `--perfil`, y precisamente por eso su comprobación de «worker
 * ajeno» tiene que ser «hay un recolector-local corriendo y ninguno lleva `--perfil`».
 */
export const FEDERACION_SIN_PERFIL = 'federacion';

const ESPERA_PNFG = { guion: 'scripts/proximo-trabajo.mjs', porDefecto: 300, minimo: 20, maximo: 3600 };

/**
 * El plan de las 19 federaciones del PC.
 *
 * Cada entrada dice: qué guion se lanza, con qué argumentos, dónde está su cola, qué ventana de espera usa
 * tras cada tanda y qué limpieza necesita antes de arrancar. Nada más: lo que el recolector hace por dentro
 * no se describe aquí.
 *
 * ── `excluidas`: EL TRASPASO AL SERVIDOR, FEDERACIÓN A FEDERACIÓN (21/09/2026) ────────────────────────────
 *
 * Cuando una federación pasa a recolectarse en el servidor, el PC **no puede seguir gestionándola**: dos flotas
 * sobre la misma cola son peticiones duplicadas a la misma federación. Con `FACYLF_EXCLUIR` (una lista de
 * nombres) el plan del PC deja fuera esas federaciones y el resto sigue igual. Así el traspaso se hace de una en
 * una —copiar su cola, arrancar su contenedor, excluirla aquí— y la memoria del PC se libera poco a poco en vez
 * de todo de golpe al final.
 */
export function planDeFederaciones({ excluidas = [] } = {}) {
  const fuera = new Set((excluidas ?? []).map((f) => String(f).trim()).filter(Boolean));
  const pnfg = FEDERACIONES_PNFG.map((federacion) => ({
    federacion,
    guion: 'scripts/recolector-local.mjs',
    argumentos: ['arrancar', '--perfil', `perfiles/${federacion}.json`],
    perfil: `perfiles/${federacion}.json`,
    carpeta: `descargas-${federacion}/recolector-local`,
    limpieza: 'pnfg',
    espera: ESPERA_PNFG,
  }));

  return [
    ...pnfg,
    {
      federacion: FEDERACION_SIN_PERFIL,
      guion: 'scripts/recolector-local.mjs',
      argumentos: ['arrancar'],
      perfil: null,
      carpeta: 'descargas-federacion/recolector-local',
      limpieza: 'pnfg',
      espera: ESPERA_PNFG,
    },
    {
      // Madrid va por la API JSON de iSquad: no abre navegador, así que no hay perfil de Chrome que
      // limpiar ni caché que vaciar. Lee páginas ligeras, de ahí que su ritmo sea 4-6 s.
      federacion: 'madrid',
      guion: 'scripts/recolector-madrid.mjs',
      argumentos: ['arrancar'],
      perfil: null,
      carpeta: 'descargas-madrid/recolector-local',
      limpieza: 'ninguna',
      // Ojo: Madrid tenía tope de 5 minutos, no de una hora como las PNFG. Se conserva.
      espera: { guion: 'scripts/proximo-trabajo.mjs', porDefecto: 300, minimo: 20, maximo: 300 },
    },
    {
      federacion: 'valencia',
      guion: 'scripts/recolector-valencia.mjs',
      argumentos: ['arrancar'],
      perfil: null,
      carpeta: 'descargas-valencia/recolector-local',
      limpieza: 'ninguna',
      espera: ESPERA_PNFG,
    },
    {
      // Cataluña (FCF) es la única con paso previo (`preparar`, que vuelca el catálogo descubierto a la
      // cola) y la única que decide la espera por PENDIENTES en vez de por el planificador: si no queda
      // nada, da una vuelta larga de media hora en vez de abrir un navegador para nada.
      federacion: 'cataluna',
      guion: 'scripts/recolector-cataluna-datos.mjs',
      argumentos: ['arrancar', '--max', '400', '--min-ms', '6000', '--max-ms', '8000'],
      pasoPrevio: ['preparar'],
      perfil: null,
      carpeta: 'descargas-cataluna/recolector-local',
      limpieza: 'cataluna',
      espera: { guion: 'scripts/contar-pendientes.mjs', sinPendientes: 1800, conPendientes: 20, porDefecto: 60 },
    },
  ].filter((entrada) => !fuera.has(entrada.federacion));
}
/**
 * Cuánto esperar tras terminar una tanda, a partir de lo que haya contestado el guion de planificación.
 *
 * Los tres comportamientos son los de los supervisores de PowerShell, tal cual:
 *
 *   · PNFG/Valencia: el número del planificador, acotado a 20 s - 1 h (una pausa de 6 h se duerme en tramos
 *     de una hora en vez de relanzar el proceso cada 20 s sin hacer nada);
 *   · Madrid: igual pero con tope de 5 minutos;
 *   · Cataluña: 0 pendientes → 30 min; con pendientes → 20 s; sin dato → 60 s.
 *
 * Si el guion no contesta, se usa el valor por defecto: un fallo de medición no puede convertirse en un
 * relanzamiento en bucle.
 */
export function esperaTrasTanda(espera, salidaDelGuion) {
  const texto = salidaDelGuion === null || salidaDelGuion === undefined ? '' : String(salidaDelGuion).trim();
  const numero = texto !== '' && Number.isFinite(Number(texto)) ? Number(texto) : null;

  if (espera.guion === 'scripts/contar-pendientes.mjs') {
    if (numero === null) return { segundos: espera.porDefecto, motivo: 'sin dato de pendientes' };
    if (numero === 0) return { segundos: espera.sinPendientes, motivo: 'sin trabajos pendientes' };
    return { segundos: espera.conPendientes, motivo: `${numero} pendientes` };
  }

  if (numero === null || numero < 0) return { segundos: espera.porDefecto, motivo: 'sin dato del planificador' };
  const segundos = Math.max(espera.minimo, Math.min(espera.maximo, Math.floor(numero)));
  return { segundos, motivo: `planificador: ${Math.floor(numero)} s` };
}

/**
 * El entorno que heredan los workers: exactamente las cuatro variables que ponía `entorno-flota.ps1`.
 *
 * No es cosmético: `FACYLF_MEMORIA_GB` decide cuántas plazas de navegador hay, `FACYLF_RESERVA_GB` cuándo
 * se deja de abrir navegador, `FACYLF_TURNO_PLAZA_MIN` cada cuánto se cede el turno y `FACYLF_CHROME_HEADLESS`
 * si el navegador es visible. Si el supervisor las perdiera, la flota entera cambiaría de comportamiento sin
 * que nadie lo pidiera.
 */
export function entornoParaHijos(configuracion, base = process.env) {
  const entorno = { ...base };
  const pon = (nombre, valor) => {
    if (valor === null || valor === undefined || valor === '') return;
    entorno[nombre] = String(valor);
  };
  pon('FACYLF_MEMORIA_GB', configuracion.memoriaGb);
  pon('FACYLF_RESERVA_GB', configuracion.reservaGb);
  pon('FACYLF_TURNO_PLAZA_MIN', configuracion.turnoMin);
  pon('FACYLF_CHROME_HEADLESS', configuracion.chromeHeadless);
  /*
   * El tope de reciclado del navegador viaja igual que las demás: si se quedara fuera, los 19 hijos usarían
   * el valor por defecto (900 MB) y el recorte que se haya decidido en `entorno-flota.ps1` no llegaría a
   * ninguno. Ausente no es cero: si no está declarado, no se pone y manda el valor por defecto del recolector.
   */
  pon('FACYLF_TOPE_NAVEGADOR_MB', configuracion.topeNavegadorMb);
  return entorno;
}

/** La línea de registro, con el mismo formato que escribían los supervisores de PowerShell. */
export function lineaDeRegistro(mensaje, fecha = new Date()) {
  const dos = (n) => String(n).padStart(2, '0');
  const sello = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
    + ` ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}`;
  return `${sello}  ${mensaje}`;
}

/** Las rutas de Windows llegan con barras invertidas en la línea de órdenes; se comparan normalizadas. */
function normaliza(texto) {
  return String(texto ?? '').replace(/\//g, '\\').toLowerCase();
}

/**
 * Qué procesos de Chrome hay que retirar antes de lanzar esta federación.
 *
 *   · PNFG: sólo los que llevan EL PERFIL DE ESTA FEDERACIÓN en la línea de órdenes. Chrome de usuario,
 *     otro navegador o el perfil de otra federación no se tocan jamás.
 *   · Cataluña: sólo raíces headless inequívocamente suyas (`FacylfBot` con `--lang=ca-ES`) **cuyo padre ya
 *     no existe**, que es la firma de «Windows o el worker se interrumpieron entre Selenium y `driver.quit()`».
 */
export function huerfanosDeFederacion(entrada, procesos) {
  const lista = Array.isArray(procesos) ? procesos : [];
  const esChrome = (p) => /^chrome(\.exe)?$/i.test(String(p?.Name ?? ''));

  if (entrada.limpieza === 'pnfg') {
    const perfil = normaliza(`${entrada.carpeta}/perfil-chrome`);
    return lista.filter((p) => esChrome(p) && normaliza(p.CommandLine).includes(perfil))
      .map((p) => Number(p.ProcessId));
  }

  if (entrada.limpieza === 'cataluna') {
    const vivos = new Set(lista.map((p) => Number(p.ProcessId)));
    return lista.filter((p) => {
      if (!esChrome(p)) return false;
      const orden = String(p.CommandLine ?? '');
      if (!orden.includes('FacylfBot') || !orden.includes('--lang=ca-ES')) return false;
      return !vivos.has(Number(p.ParentProcessId));
    }).map((p) => Number(p.ProcessId));
  }

  return [];
}

/** Un árbol de procesos (raíz + descendientes), para no dejar huérfanos a medias. */
export function conDescendientes(raices, procesos) {
  const lista = Array.isArray(procesos) ? procesos : [];
  const hijos = new Map();
  for (const p of lista) {
    const padre = Number(p.ParentProcessId);
    if (!hijos.has(padre)) hijos.set(padre, []);
    hijos.get(padre).push(Number(p.ProcessId));
  }
  const salida = new Set();
  const visita = (id) => {
    if (salida.has(id)) return;
    salida.add(id);
    for (const hijo of hijos.get(id) ?? []) visita(hijo);
  };
  for (const raiz of raices) visita(Number(raiz));
  return [...salida];
}

/**
 * ¿Hay ya un recolector VIVO de esta federación que no sea hijo de este supervisor?
 *
 * Es la guarda contra duplicar workers: si alguien lo lanzó a mano, si quedó uno huérfano de un supervisor
 * anterior o si la migración dejó procesos a medias, este supervisor **espera** en vez de lanzar un segundo.
 * Dos recolectores sobre la misma cola no se pisan los datos (la cola es transaccional) pero sí duplican
 * peticiones al portal, y eso es justo lo que el proyecto no hace.
 */
export function workerAjeno(entrada, procesos, propios = new Set()) {
  const lista = Array.isArray(procesos) ? procesos : [];
  const guion = normaliza(entrada.guion);
  const perfil = entrada.perfil ? normaliza(entrada.perfil) : null;
  return lista.find((p) => {
    if (!/^node(\.exe)?$/i.test(String(p?.Name ?? ''))) return false;
    if (propios.has(Number(p.ProcessId))) return false;
    const orden = normaliza(p.CommandLine);
    if (!orden.includes(guion) || !orden.includes('arrancar')) return false;
    if (perfil) return orden.includes(perfil);
    // Sin perfil propio (Castilla y León): cualquier recolector-local SIN `--perfil` es el suyo.
    if (entrada.guion === 'scripts/recolector-local.mjs') return !orden.includes('--perfil');
    return true;
  }) ?? null;
}

/** El nombre con el que se registra cada federación, para que los registros sigan siendo legibles. */
export function nombreLegible(federacion) {
  if (federacion === FEDERACION_SIN_PERFIL) return 'Castilla y Leon';
  return federacion;
}

/**
 * ── GUARDA DE MIGRACIÓN ────────────────────────────────────────────────────────────────────────────────
 *
 * Mientras las 19 tareas antiguas sigan vivas (o si alguien vuelve a arrancarlas), este supervisor no puede
 * lanzar su propia copia: serían dos workers sobre la misma cola. Se comprueba si queda algún supervisor de
 * PowerShell de ESA federación en la lista de procesos y, si lo hay, se espera en vez de arrancar.
 *
 * No es una comprobación de «está corriendo el worker» (eso es `workerAjeno`), sino de «sigue en pie el
 * supervisor viejo», que puede estar durmiendo entre tandas sin worker asociado.
 */
export function supervisorAntiguoVivo(entrada, procesos) {
  const lista = Array.isArray(procesos) ? procesos : [];
  /*
   * Cada federación tiene su supervisor antiguo, y hay que emparejarlos por guion: el de Madrid no puede
   * contar como el de Navarra (eso dejaría a Navarra esperando para siempre a un supervisor que no existe).
   * Los 16 PNFG comparten guion, así que dentro de él se mira la federación.
   */
  const antiguo = {
    'scripts/recolector-local.mjs': 'ejecutar-recolector-programado.ps1',
    'scripts/recolector-madrid.mjs': 'ejecutar-recolector-madrid.ps1',
    'scripts/recolector-valencia.mjs': 'ejecutar-recolector-valencia.ps1',
    'scripts/recolector-cataluna-datos.mjs': 'ejecutar-recolector-cataluna-datos.ps1',
  }[entrada.guion];
  if (!antiguo) return null;

  const federacion = normaliza(entrada.federacion);
  return lista.find((p) => {
    if (normaliza(p?.Name) === 'node.exe') return false;
    const orden = normaliza(p?.CommandLine);
    if (!orden.includes(antiguo)) return false;
    if (antiguo !== 'ejecutar-recolector-programado.ps1') return true;
    // En el programado, el guion es común a 16 federaciones: hay que mirar CUÁL.
    if (entrada.federacion === FEDERACION_SIN_PERFIL) return !orden.includes('-federacion');
    return new RegExp(`-federacion"?'?\\s*"?${federacion}"?`).test(orden);
  }) ?? null;
}
