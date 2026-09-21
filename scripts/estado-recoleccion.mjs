/*
 * ESTADO DE LA RECOLECCIÓN, federación a federación, en una sola pasada y en dos formatos.
 *
 * Es el programa que faltaba: hoy, para saber si una federación estaba trabajando, parada o esperando, había
 * que cruzar cuatro diagnósticos distintos y aun así se confundía «entre sesiones» con «averiada». Aquí se
 * dice **qué está haciendo cada una y por qué**, con el número que lo demuestra:
 *
 *   · trabajando      → peticiones en los últimos minutos y registro fresco;
 *   · esperando turno → su registro lo dice: plaza de navegador o memoria libre;
 *   · entre sesiones  → terminó limpia y tiene trabajo aplazado para más tarde (con la hora);
 *   · parada          → ni peticiones ni trabajo disponible: hay que mirarla.
 *
 * Además mide la MEMORIA del proyecto (node + chrome de las colas) y el reparto del gobernador, que es lo que
 * se mira cuando se quiere saber si cabe uno más.
 *
 * Sólo lee: no toca colas, ni ficheros, ni procesos. Escribe su informe y se va.
 *
 * Uso: node scripts/estado-recoleccion.mjs [--json <ruta>] [--md <ruta>] [--minutos 10]
 */
import { createRequire } from 'node:module';
import { readdirSync, existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { freemem, totalmem } from 'node:os';
import { repartePlazas, cabeOtroNavegador } from './lib/presupuesto-memoria.mjs';
import { TEMPORADA_MINIMA } from './lib/temporada-minima.mjs';
import { peticionesDelDia } from './lib/estado-cola.mjs';
import { diaDeMadrid } from './lib/dia-madrid.mjs';
import { configuracionFlotaLocal } from './lib/configuracion-flota.mjs';

/*
 * La ruta COMPLETA del PowerShell del sistema. Con `powershell` a secas, `spawnSync` no lo encuentra —el PATH
 * del proceso no es el de la consola— y la medición devolvía `null` en silencio: la primera versión de este
 * informe decía «memoria ? GB · huérfanos null» por eso. Es el mismo fallo que tuvo la tarea programada.
 */
const RUTA_POWERSHELL = process.env.SystemRoot
  ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  : 'powershell.exe';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const raiz = resolve(arg('raiz', process.env.FACYLF_RAIZ ?? '.'));
const configuracionFlota = configuracionFlotaLocal(raiz);
// Los supervisores reciben este presupuesto desde `entorno-flota.ps1`; este informe se ejecuta
// aparte y debe describir el mismo sistema aunque la consola no herede sus variables.
const presupuestoMemoriaGb = Number(arg('memoria-gb', configuracionFlota.memoriaGb));
const reservaMemoriaGb = Number(arg('reserva-gb', configuracionFlota.reservaGb));
const minutos = Number(arg('minutos', 10));
const desde = new Date(Date.now() - minutos * 60000).toISOString();
const ahora = new Date().toISOString();

/* ── Los procesos del proyecto: memoria gastada, plazas ocupadas y basura ──────────────────────── */

/**
 * Las plazas ocupadas NO se deducen de los procesos: se le preguntan al gobernador. `slots-chrome` es su
 * registro y una ficha cuyo proceso ya no existe no ocupa nada. Es igual en Windows y en Linux, así que se
 * cuenta antes de mirar la plataforma.
 */
function plazasOcupadas() {
  const carpetaSlots = join(raiz, '.estado-workers', 'slots-chrome');
  let ocupadas = 0;
  if (existsSync(carpetaSlots)) {
    for (const ficha of readdirSync(carpetaSlots).filter((x) => /^slot-.*\.lock$/.test(x))) {
      try {
        // La ficha guarda `pid contenedor` (el contenedor es opcional en fichas antiguas).
        const pid = Number(String(readFileSync(join(carpetaSlots, ficha), 'utf8')).trim().split(/\s+/)[0]);
        if (pid && processVivo(pid)) ocupadas += 1;
      } catch { /* ficha ilegible: no cuenta */ }
    }
  }
  return ocupadas;
}

/**
 * En Linux (el servidor) la memoria del proyecto se mide con `ps`: la suma del RSS de los procesos `node` y
 * `chromium` que llevan una carpeta de recolección en su línea de órdenes. En un contenedor, además, el número
 * que importa es el del contenedor, y para eso está `docker stats`; aquí se da el del sistema, que es lo que ve
 * el programa. Los huérfanos se dejan en `null`: en Linux el navegador muere con su worker y el contenedor se
 * lleva por delante lo que quede, así que no hay una herramienta equivalente al barrido de Windows.
 */
function memoriaDelProyectoLinux() {
  const salida = spawnSync('ps', ['-eo', 'rss=,args='], { encoding: 'utf8', timeout: 30000 });
  let kb = 0;
  for (const linea of String(salida.stdout ?? '').split('\n')) {
    if (!/perfil-chrome|recolector-[a-z-]+\.mjs|ingesta-fin-de-semana/.test(linea)) continue;
    const m = /^\s*(\d+)\s/.exec(linea);
    if (m) kb += Number(m[1]);
  }
  return kb > 0 ? Number((kb / 1024 ** 2).toFixed(2)) : null;
}

function procesosDelProyecto() {
  if (process.platform !== 'win32') {
    return { memoriaGb: memoriaDelProyectoLinux(), ocupadas: plazasOcupadas(), huerfanos: null };
  }
  /*
   * La memoria se mide con un `.ps1` propio, llamado con `-File`: una medición embebida en un `-Command` de
   * una línea se rompe al pasarla (comillas, `$_`) y falla en SILENCIO devolviendo vacío —que es lo que pasó
   * con la primera versión de este informe: «memoria ? GB»—.
   */
  const memoria = spawnSync(RUTA_POWERSHELL, ['-NoProfile', '-File', join(import.meta.dirname, 'medir-memoria-proyecto.ps1'), raiz],
    { encoding: 'utf8', timeout: 60000 });
  // OJO con la coma decimal: en un sistema en español, PowerShell devuelve «10,19» y `Number('10,19')` es
  // `NaN`. La medición era correcta y el informe decía «?» por esto.
  const gb = Number(String(memoria.stdout ?? '').trim().split(/\s+/).pop().replace(',', '.'));
  const ocupadas = plazasOcupadas();
  /*
   * Y la basura, preguntándosela a la herramienta que ya la mide y que ya sabe distinguir un navegador vivo
   * de un resto (sube la cadena de padres y excluye lo que no es de este proyecto). Duplicar esa lógica aquí
   * sería la forma más rápida de tener dos verdades distintas.
   */
  let huerfanos = null;
  const rutaLimpieza = join(import.meta.dirname, 'limpiar-chrome-huerfano.ps1');
  if (existsSync(rutaLimpieza)) {
    const salida = spawnSync(RUTA_POWERSHELL, ['-NoProfile', '-File', rutaLimpieza, '-Simular'], { encoding: 'utf8', timeout: 120000 });
    // Sin la tilde a propósito: la salida del proceso hijo no llega en UTF-8 y «huérfanos» puede venir con los
    // acentos rotos. Exigirlos era la razón de que este dato saliera `null` teniendo el número delante.
    const m = /rfanos de recolector: (\d+) procesos/.exec(String(salida.stdout ?? ''));
    huerfanos = m ? Number(m[1]) : (String(salida.stdout ?? '').includes('nada que limpiar') ? 0 : null);
  }
  return { memoriaGb: Number.isFinite(gb) ? gb : null, ocupadas, huerfanos };
}

function processVivo(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

const proyecto = procesosDelProyecto();
const reparto = repartePlazas({
  memoriaGb: presupuestoMemoriaGb,
  memoriaTotalGb: totalmem() / 1024 ** 3,
});

/* ── Una fila por federación ───────────────────────────────────────────────────────────────────── */
const filas = [];
const colasDePrueba = [];
for (const carpeta of readdirSync(raiz).filter((n) => n.startsWith('descargas-')).sort()) {
  const federacion = carpeta.replace('descargas-', '');
  const base = join(raiz, carpeta, 'recolector-local');
  if (!existsSync(join(base, 'cola-v2.sqlite'))) continue;
  /*
   * Las colas de PRUEBA no son federaciones: llevan una marca `.PRUEBA` en su carpeta y se omiten, para
   * que un ensayo (matar un worker, medir el gobernador) no aparezca como una federación más del informe
   * ni descuadre los totales de la flota.
   */
  if (existsSync(join(raiz, carpeta, '.PRUEBA'))) { colasDePrueba.push(federacion); continue; }
  const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });
  const uno = (sql, ...p) => db.prepare(sql).get(...p)?.n ?? 0;

  const partidos = uno('select count(*) n from partidos');
  const jornadas = uno('select count(*) n from jornadas');
  const actasHechas = uno("select count(*) n from actas where estado='hecha'");
  const actas = uno('select count(*) n from actas');
  const pendientes = uno("select count(*) n from trabajos where estado='pendiente'");
  const aplazados = uno("select count(*) n from trabajos where estado='pendiente' and siguiente_intento > ?", ahora);
  const disponibles = pendientes - aplazados;
  const proximo = db.prepare("select min(siguiente_intento) m from trabajos where estado='pendiente' and siguiente_intento > ?").get(ahora)?.m ?? null;
  /*
   * DE LO APLAZADO, POR QUÉ (17/09/2026). «2.658 pendientes y 0 disponibles» se leía como una avería y
   * no lo era: 1.818 de los de Euskadi están APARCADOS por una decisión del cliente (sólo se recogen las
   * temporadas 2023-24 en adelante) y no vuelven solos. Sin separar las tres causas, el informe mezcla
   * trabajo que espera su partido con trabajo que no se va a hacer nunca, y el operador no puede saber
   * cuál de las dos cosas está mirando. La partición es exacta: las tres suman los aplazados.
   */
  const horizonte = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
  const enElSuelo = '(temporada is null or temporada not in (select codigo from temporadas where etiqueta < ?))';
  const enSueloArgs = [TEMPORADA_MINIMA];
  const aplazamiento = {
    reintentos: uno(`select count(*) n from trabajos where estado='pendiente' and siguiente_intento > ?
      and siguiente_intento <= ? and ${enElSuelo}`, ahora, horizonte, ...enSueloArgs),
    deCalendario: uno(`select count(*) n from trabajos where estado='pendiente' and siguiente_intento > ?
      and ${enElSuelo}`, horizonte, ...enSueloArgs),
    aparcados: uno(`select count(*) n from trabajos where estado='pendiente' and siguiente_intento > ?
      and not ${enElSuelo}`, ahora, ...enSueloArgs),
  };
  aplazamiento.temporadaMinima = TEMPORADA_MINIMA;
  aplazamiento.coherente = (aplazamiento.reintentos + aplazamiento.deCalendario + aplazamiento.aparcados) === aplazados;
  const peticiones = uno('select count(*) n from peticiones where iniciada_en >= ?', desde);
  const correctas = uno("select count(*) n from peticiones where iniciada_en >= ? and resultado='ok'", desde);
  const incidencias = db.prepare(`select resultado, count(*) n from peticiones where iniciada_en >= ? and resultado <> 'ok'
    group by resultado order by n desc limit 3`).all(desde);
  const ultimaPeticion = db.prepare('select max(iniciada_en) m from peticiones').get()?.m ?? null;
  const ultimaJornada = db.prepare('select max(comprobada_en) m from jornadas').get()?.m ?? null;
  // ¿Se le ha acabado el cupo del día? Es la diferencia entre «parada y hay que mirarla» y «esperando a mañana».
  // Se cuenta con la misma función que usa el recolector (día civil de Madrid, con su columna y su índice).
  const limiteDiario = Number(db.prepare("select valor from metadatos where clave='diario_max'").get()?.valor ?? 0);
  const usadasHoy = peticionesDelDia(db, diaDeMadrid());
  const cupoGastado = limiteDiario > 0 && usadasHoy >= limiteDiario;
  // ¿Está en pausa preventiva? Es la otra razón legítima para no estar trabajando teniendo trabajo (la fuente no
  // atiende, un HTTP 503, y el propio recolector se aparta una hora). Medido el 19/09/2026: Valencia salía como
  // «parada con trabajo disponible» estando en pausa por 503, que manda a buscar el problema donde no está.
  const pausaHasta = db.prepare("select valor from metadatos where clave='pausa_global_hasta'").get()?.valor ?? null;
  const enPausa = Boolean(pausaHasta && pausaHasta > ahora);
  /*
   * Y si la última sesión no pudo abrir navegador, por qué: `memoria` (a la máquina le queda menos que su reserva)
   * o `turno` (hay más federaciones que plazas). Se mira en la cola y no en la última línea del registro porque esa
   * línea cambia según el momento en que se mire: medido el 19/09/2026, con cinco federaciones esperando memoria,
   * el informe llegó a leerles el cartel de arranque y las puso como «parada con trabajo disponible».
   */
  const salidaMotivo = db.prepare("select valor from metadatos where clave='ultima_salida_motivo'").get()?.valor ?? null;
  const salidaEn = Date.parse(db.prepare("select valor from metadatos where clave='ultima_salida_en'").get()?.valor ?? '');
  const salidaReciente = Number.isFinite(salidaEn) && (Date.now() - salidaEn) < 30 * 60_000;
  db.close();

  const registro = join(base, 'worker-programado.log');
  const edadRegistro = existsSync(registro) ? Math.round((Date.now() - statSync(registro).mtime.getTime()) / 60000) : null;
  const ultimaLinea = existsSync(registro) ? readFileSync(registro, 'utf8').trim().split('\n').pop()?.trim() ?? '' : '';

  let estado;
  /*
   * «Esperando» tiene dos motivos y el registro los dice con palabras distintas: turno de navegador («esperando
   * turno de navegador: 11 plaza(s)…») o memoria («esperando para abrir Chrome: … menos que la reserva»). Antes
   * sólo se reconocía el de memoria si decía literalmente «memoria», así que a quien esperaba por la reserva de la
   * máquina —cuyo mensaje habla de la reserva y de abrir Chrome— se le ponía «parada con trabajo disponible», que
   * manda a buscar el problema donde no está. Medido el 19/09/2026 con Murcia.
   */
  if (/esperando .*(turno)/.test(ultimaLinea)) estado = 'esperando turno de navegador';
  else if (/esperando .*(memoria|abrir Chrome|reserva)/.test(ultimaLinea)) estado = 'esperando memoria (reserva de la máquina)';
  else if (salidaReciente && salidaMotivo === 'memoria') estado = 'esperando memoria (reserva de la máquina)';
  else if (salidaReciente && salidaMotivo === 'turno') estado = 'esperando turno de navegador';
  else if (peticiones > 0) estado = 'trabajando';
  /*
   * «Parada con trabajo disponible» tiene que distinguir POR QUÉ: si el cupo diario está gastado, la federación
   * está haciendo lo correcto (esperar a mañana), y no es un aviso para que alguien vaya a mirarla. Medido el
   * 19/09/2026: Valencia salía como «parada con trabajo disponible» (8.889 trabajos) teniendo el cupo del día
   * agotado —su sesión había terminado con «siguiente intento en 3589 s»—, que es justo el falso positivo que el
   * informe intenta evitar.
   */
  else if (cupoGastado || /Presupuesto diario agotado/.test(ultimaLinea)) estado = 'cupo diario gastado (sigue mañana)';
  else if (enPausa) estado = `en pausa preventiva (hasta ${pausaHasta.slice(11, 16)}Z)`;
  else if (disponibles > 0) estado = 'parada con trabajo disponible';
  else if (aplazados > 0) estado = 'entre sesiones';
  else estado = 'sin trabajo pendiente';

  filas.push({
    federacion, estado, partidos, jornadas, actasHechas, actas,
    coberturaActas: actas ? Math.round((actasHechas / actas) * 100) : null,
    trabajos: { pendientes, disponibles, aplazados, proximo, aplazamiento },
    peticionesUltimosMinutos: peticiones, correctas, incidencias,
    ultimaPeticion, ultimaJornada, edadRegistroMinutos: edadRegistro,
    navegadoresVivos: null,
    ultimaLineaDelRegistro: ultimaLinea.slice(0, 120),
  });
}

const informe = {
  generadoEn: ahora,
  ventana: { minutos, desde },
  memoria: {
    libreGb: Number((freemem() / 1024 ** 3).toFixed(2)),
    totalEquipoGb: Number((totalmem() / 1024 ** 3).toFixed(1)),
    gastadaPorElProyectoGb: proyecto.memoriaGb,
    navegadoresHuerfanos: proyecto.huerfanos,
  },
  gobernador: {
    ...reparto,
    ocupadas: proyecto.ocupadas,
    veredicto: cabeOtroNavegador({
      plazas: reparto.plazas,
      ocupadas: proyecto.ocupadas,
      memoriaLibreGb: freemem() / 1024 ** 3,
      memoriaDeLaMaquinaGb: freemem() / 1024 ** 3,
      reservaDeLaMaquinaGb: reservaMemoriaGb,
    }),
    configuracion: configuracionFlota.origen,
  },
  resumen: {
    federaciones: filas.length,
    colasDePruebaOmitidas: colasDePrueba,
    porEstado: filas.reduce((m, f) => ({ ...m, [f.estado]: (m[f.estado] ?? 0) + 1 }), {}),
    peticionesEnLaVentana: filas.reduce((n, f) => n + f.peticionesUltimosMinutos, 0),
    trabajosPendientes: filas.reduce((n, f) => n + f.trabajos.pendientes, 0),
    aplazadosPorCausa: filas.reduce((m, f) => ({
      reintentos: m.reintentos + f.trabajos.aplazamiento.reintentos,
      deCalendario: m.deCalendario + f.trabajos.aplazamiento.deCalendario,
      aparcados: m.aparcados + f.trabajos.aplazamiento.aparcados,
    }), { reintentos: 0, deCalendario: 0, aparcados: 0 }),
    particionAplazadosCoherente: filas.every((f) => f.trabajos.aplazamiento.coherente),
    filas,
  },
};

const rutaJson = resolve(arg('json', join(raiz, 'pruebas', 'reconstruccion', 'estado-recoleccion.json')));
mkdirSync(join(rutaJson, '..'), { recursive: true });
writeFileSync(rutaJson, `${JSON.stringify(informe, null, 2)}\n`);

const lineas = [
  '# Estado de la recolección',
  '',
  `Medido: ${ahora} · ventana de ${minutos} min · ${informe.resumen.federaciones} federaciones.`,
  '',
  `Memoria: **${informe.memoria.libreGb} GB libres** de ${informe.memoria.totalEquipoGb} GB · el proyecto gasta ${informe.memoria.gastadaPorElProyectoGb ?? '?'} GB · navegadores huérfanos: **${informe.memoria.navegadoresHuerfanos}**.`,
  '',
  `Gobernador: **${informe.gobernador.plazas} plazas**, ${informe.gobernador.ocupadas} ocupadas · ${informe.gobernador.veredicto.motivo} (${informe.gobernador.motivo}).`,
  '',
  '| federación | estado | peticiones | ok | cobertura actas | pendientes | de ellos disponibles | próxima | plaza |',
  '|---|---|---|---|---|---|---|---|---|',
];
for (const f of filas) {
  lineas.push(`| ${f.federacion} | **${f.estado}** | ${f.peticionesUltimosMinutos} | ${f.correctas} | ${f.coberturaActas ?? '?'} % | ${f.trabajos.pendientes} | ${f.trabajos.disponibles} | ${f.trabajos.proximo ?? '—'} | — |`);
}

/*
 * Tabla aparte para lo aplazado, porque es donde estaba la trampa: un número grande de aplazados con cero
 * disponibles parece una federación averiada, y casi siempre es trabajo esperando su fecha o trabajo
 * aparcado a propósito. Con las tres columnas se ve de un vistazo cuál de las tres cosas es.
 */
const conAplazados = filas.filter((f) => f.trabajos.aplazados > 0)
  .sort((a, b) => b.trabajos.aplazados - a.trabajos.aplazados);
if (conAplazados.length) {
  lineas.push('', `## De lo aplazado, por qué (suelo de temporada: ${TEMPORADA_MINIMA})`, '',
    '| federación | aplazados | reintento (≤ 7 d) | calendario (partido futuro) | aparcado (decisión de temporada) | próxima fecha |',
    '|---|---|---|---|---|---|');
  for (const f of conAplazados) {
    const a = f.trabajos.aplazamiento;
    lineas.push(`| ${f.federacion} | ${f.trabajos.aplazados} | ${a.reintentos} | ${a.deCalendario} | ${a.aparcados} | ${f.trabajos.proximo ?? '—'} |`);
  }
  const coherencia = informe.resumen.particionAplazadosCoherente
    ? 'la partición cuadra en todas las federaciones'
    : 'OJO: en alguna federación las tres causas no suman los aplazados';
  lineas.push('', `_${coherencia}._`);
}
const rutaMd = resolve(arg('md', rutaJson.replace(/\.json$/, '.md')));
writeFileSync(rutaMd, `${lineas.join('\n')}\n`);

console.log(`estado de la recolección · ${informe.resumen.federaciones} federaciones · ventana ${minutos} min`);
for (const [estado, n] of Object.entries(informe.resumen.porEstado)) console.log(`  ${estado}: ${n}`);
console.log(`  peticiones en la ventana: ${informe.resumen.peticionesEnLaVentana} · trabajos pendientes: ${informe.resumen.trabajosPendientes}`);
console.log(`  aplazados: ${informe.resumen.aplazadosPorCausa.reintentos} en reintento · ${informe.resumen.aplazadosPorCausa.deCalendario} por calendario · ${informe.resumen.aplazadosPorCausa.aparcados} aparcados (temporada < ${TEMPORADA_MINIMA})${informe.resumen.particionAplazadosCoherente ? '' : ' · PARTICION INCOHERENTE'}`);
if (colasDePrueba.length) console.log(`  colas de prueba omitidas: ${colasDePrueba.join(', ')}`);
console.log(`  memoria libre ${informe.memoria.libreGb} GB · proyecto ${informe.memoria.gastadaPorElProyectoGb ?? '?'} GB · huérfanos ${informe.memoria.navegadoresHuerfanos}`);
console.log(`  gobernador: ${informe.gobernador.plazas} plazas, ${informe.gobernador.ocupadas} ocupadas (${informe.gobernador.veredicto.motivo})`);
console.log(`\ninforme: ${rutaJson}\nlegible: ${rutaMd}`);
