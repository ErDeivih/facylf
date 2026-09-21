/*
 * VIGILANCIA DE LA FLOTA: una línea por vuelta, para poder demostrar con datos que la ingesta aguanta horas.
 *
 * Lo que mide en cada vuelta, y por qué:
 *   · **ritmo por federación** (peticiones de la última ventana): que no se caiga nadie por el camino;
 *   · **plazas ocupadas y quién las tiene**: el semáforo del presupuesto, y si hay quien espera;
 *   · **memoria del proyecto y navegadores huérfanos**: que no se acumule basura;
 *   · **federaciones atascadas**: con trabajo disponible y sin una petición en más de tres veces su ritmo;
 *   · **pausas preventivas**: cuántas y desde cuándo.
 *
 * Escribe JSONL (una línea por vuelta, se puede cortar y seguir) y, con `--informe`, resume el fichero: mínimos,
 * máximos, tendencia de huérfanos y qué federación se quedó atascada y cuánto tiempo.
 *
 * Sólo lee. Uso:
 *   node scripts/vigilar-flota.mjs [--cada-min 10] [--duracion-min 600] [--salida <ruta.jsonl>]
 *   node scripts/vigilar-flota.mjs --informe [--salida <ruta.jsonl>]
 */
import { createRequire } from 'node:module';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { freemem, totalmem } from 'node:os';
import { repartePlazas, cabeOtroNavegador } from './lib/presupuesto-memoria.mjs';
import { configuracionFlotaLocal } from './lib/configuracion-flota.mjs';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const configuracionFlota = configuracionFlotaLocal(raiz);
const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const soloInforme = argumentos.includes('--informe');
const cadaMin = Number(arg('cada-min', 10));
const duracionMin = Number(arg('duracion-min', 600));
const rutaSalida = resolve(arg('salida', join(raiz, 'pruebas', 'reconstruccion', 'vigilancia-flota.jsonl')));

/*
 * Cuándo arrancó esta vigilancia y cuándo se tocó por última vez el guion: sirve para avisar de que estamos
 * midiendo con código viejo (ver el comentario de `vuelta`).
 */
const ARRANQUE_MS = Date.now();
let avisadoDelCambio = false;
function existeGuionMasNuevo() {
  try { return statSync(new URL(import.meta.url)).mtimeMs > ARRANQUE_MS; } catch { return false; }
}
const carpetaSlots = join(raiz, '.estado-workers', 'slots-chrome');
const RUTA_POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Plazas ocupadas y su dueño (por la línea de órdenes del proceso). */
function plazas(procs = []) {
  const fichas = existsSync(carpetaSlots) ? readdirSync(carpetaSlots).filter((f) => /^slot-.*\.lock$/.test(f)) : [];
  const esperando = existsSync(carpetaSlots) ? readdirSync(carpetaSlots).filter((f) => f.startsWith('espera-') && f.endsWith('.ficha')) : [];
  const lineas = procs.filter((x) => x.nombre === 'node.exe').map((x) => `${x.pid}|${x.linea}`);
  const federacionDe = (pid) => {
    const l = lineas.find((x) => x.startsWith(`${pid}|`))?.split('|').slice(1).join('|') ?? '';
    return /perfiles\\?([a-z0-9-]+)\.json/i.exec(l)?.[1]
      ?? (/recolector-([a-z-]+)\.mjs/.exec(l)?.[1] ?? null);
  };
  return {
    ocupadas: fichas.map((f) => {
      let pid = 0;
      let host = null;
      try {
        const [p, h] = String(readFileSync(join(carpetaSlots, f), 'utf8')).trim().split(/\s+/);
        pid = Number(p); host = h ?? null;
      } catch { /* ilegible */ }
      return { ficha: f, pid, host, viva: pid ? vivo(pid) : false, federacion: pid ? federacionDe(pid) : null };
    }).filter((p) => p.viva),
    esperando: esperando.length,
  };
}

/** Lista de procesos con su padre, para poder agrupar por federación y detectar huérfanos de una sola pasada. */
function procesos() {
  if (process.platform !== 'win32') return [];
  try {
    const salida = execFileSync(RUTA_POWERSHELL, ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.Name)|$($_.CommandLine)" }`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000 });
    return salida.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [pid, padre, nombre, ...resto] = l.split('|');
      return { pid: Number(pid), padre: Number(padre), nombre, linea: resto.join('|') };
    });
  } catch { return []; }
}

/**
 * Navegadores por federación y HUÉRFANOS: un navegador de recolector que ya no tiene ningún `node` vivo por
 * encima es basura que nadie va a recoger (y ocupando memoria). Es la métrica de «se acumula o no se acumula»,
 * medida con la misma regla que usa el barrido: la cadena de padres, no el padre directo, porque el padre de un
 * Chrome de Selenium es `chromedriver`.
 */
function navegadores(procs) {
  const porId = new Map(procs.map((p) => [p.pid, p]));
  const nodeVivo = (pid) => porId.has(pid);
  const tieneNodePorEncima = (p) => {
    let actual = p;
    for (let i = 0; i < 8 && actual; i++) {
      const padre = porId.get(actual.padre);
      if (!padre) return false;
      if (padre.nombre === 'node.exe') return nodeVivo(padre.pid);
      actual = padre;
    }
    return false;
  };
  const porFederacion = {};
  let total = 0;
  let huerfanos = 0;
  /*
   * Y los NAVEGADORES de verdad: el proceso raíz de un Chrome es el que no lleva `--type=`; los demás son
   * renderers, gpu y auxiliares. Es el divisor que hacía falta: el 19/09/2026 este vigilante contaba «86
   * navegadores» cuando en realidad eran **11 navegadores con 23 procesos cada uno** (36 renderers en uno solo,
   * por el aislamiento de sitios de Chrome), con el PC a 0,68 GB libres y el rendimiento por los suelos. Con la
   * proporción a la vista, ese día se habría visto en la primera vuelta.
   */
  let raices = 0;
  for (const p of procs) {
    if (p.nombre !== 'chrome.exe' && p.nombre !== 'chromedriver.exe') continue;
    const f = /descargas-([a-z0-9-]+)\\recolector-local\\perfil-chrome/.exec(p.linea)?.[1];
    if (!f) continue;
    total += 1;
    porFederacion[f] = (porFederacion[f] ?? 0) + 1;
    if (p.nombre === 'chrome.exe' && !/--type=/.test(p.linea)) raices += 1;
    if (!tieneNodePorEncima(p)) huerfanos += 1;
  }
  const porNavegador = raices > 0 ? Number((total / raices).toFixed(1)) : null;
  return { total, huerfanos, raices, porNavegador, porFederacion };
}

/** Una vuelta: la foto completa. */
function vuelta() {
  const ahora = new Date();
  const desde10 = new Date(ahora.getTime() - 10 * 60000).toISOString();
  const desde30 = new Date(ahora.getTime() - 30 * 60000).toISOString();
  /*
   * AVISO SI EL GUION HA CAMBIADO DESDE QUE ARRANQUÉ. Un vigilante largo ejecuta el código que cargó al arrancar:
   * si se corrige este fichero a mitad de la vigilancia, sigue midiendo con las reglas viejas y puede informar de
   * un mundo que ya no existe, con toda la apariencia de estar midiendo. Pasó el 19/09/2026: siete horas diciendo
   * «0 plazas» con 86 navegadores vivos porque las fichas cambiaron de formato y este proceso no se enteró.
   */
  if (!avisadoDelCambio && existeGuionMasNuevo()) {
    avisadoDelCambio = true;
    console.log('  ⚠ el guion ha cambiado en disco desde que arrancó esta vigilancia:'
      + ' sigue midiendo con el código viejo. Reiníciala para que las vueltas nuevas valgan.');
  }
  const procs = procesos();
  const p = plazas(procs);
  const n = navegadores(procs);
  const reparto = repartePlazas({
    memoriaGb: configuracionFlota.memoriaGb,
    memoriaTotalGb: totalmem() / 1024 ** 3,
  });
  const federaciones = [];
  for (const carpeta of readdirSync(raiz).filter((x) => x.startsWith('descargas-')).sort()) {
    const base = join(raiz, carpeta, 'recolector-local');
    if (!existsSync(join(base, 'cola-v2.sqlite'))) continue;
    const federacion = carpeta.replace('descargas-', '');
    if (existsSync(join(raiz, carpeta, '.PRUEBA'))) continue;
    const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });
    const uno = (sql, ...a) => db.prepare(sql).get(...a)?.n ?? 0;
    const pet10 = uno('select count(*) n from peticiones where iniciada_en >= ?', desde10);
    const pet30 = uno('select count(*) n from peticiones where iniciada_en >= ?', desde30);
    const ultima = db.prepare('select max(iniciada_en) m from peticiones').get()?.m ?? null;
    const disponibles = uno(`select count(*) n from trabajos where estado='pendiente'
      and (siguiente_intento is null or siguiente_intento <= ?)`, ahora.toISOString());
    const pausa = db.prepare(`select valor from metadatos where clave='pausa_global_hasta'`).get()?.valor ?? '';
    db.close();
    const registro = join(base, 'worker-programado.log');
    const edad = existsSync(registro) ? Math.round((Date.now() - statSync(registro).mtimeMs) / 60000) : null;
    const minutosSinPedir = ultima ? Math.round((Date.now() - new Date(ultima).getTime()) / 60000) : null;
    const plaza = p.ocupadas.find((x) => x.federacion === federacion)?.ficha ?? null;
    const navegadores = n.porFederacion[federacion] ?? 0;
    /*
     * ATASCADA es una cosa concreta: TIENE con qué trabajar (navegador abierto) y no lo usa. Una federación
     * entre sesiones —sin navegador, con su supervisor esperando— no está atascada: está esperando a que su
     * trabajo esté disponible, y eso es lo que dice su registro. La primera versión de esta vigilancia las
     * mezclaba y marcaba como atascadas a Canarias y Valencia estando las dos bien.
     */
    const atascada = Boolean((plaza || navegadores > 0) && disponibles > 0 && minutosSinPedir !== null && minutosSinPedir > 20);
    const entreSesiones = Boolean(!plaza && !navegadores && disponibles > 0 && (edad ?? 0) > 20);
    federaciones.push({
      federacion, pet10, pet30, disponibles, minutosSinPedir, edadRegistro: edad,
      pausaActiva: pausa && new Date(pausa).getTime() > Date.now() ? pausa : null,
      navegadores, plaza, atascada, entreSesiones,
    });
  }
  const so = process.platform === 'win32'
    ? Number(execFileSync(RUTA_POWERSHELL, ['-NoProfile', '-Command',
      '"{0:N2}" -f ((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB)'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }).trim().replace(',', '.'))
    : freemem() / 1024 ** 3;
  return {
    cuando: ahora.toISOString(),
    memoriaLibreGb: Number.isFinite(so) ? so : null,
    plazas: {
      presupuesto: reparto.plazas,
      declarado: configuracionFlota.origen !== 'predeterminado',
      ocupadas: p.ocupadas.length,
      esperando: p.esperando,
      veredicto: cabeOtroNavegador({
        plazas: reparto.plazas,
        ocupadas: p.ocupadas.length,
        memoriaLibreGb: so,
        memoriaDeLaMaquinaGb: so,
        reservaDeLaMaquinaGb: configuracionFlota.reservaGb,
      }).cabe,
    },
    navegadores: n.total,
    huerfanos: n.huerfanos,
    navegadoresRaiz: n.raices,
    procesosPorNavegador: n.porNavegador,
    federaciones,
  };
}

if (soloInforme) {
  if (!existsSync(rutaSalida)) { console.error(`  no hay fichero de vigilancia en ${rutaSalida}`); process.exit(1); }
  const vueltas = readFileSync(rutaSalida, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const primera = vueltas[0];
  const ultima = vueltas[vueltas.length - 1];
  const suma = (v, f) => v.federaciones.reduce((n, x) => n + f(x), 0);
  console.log(`═══ vigilancia: ${vueltas.length} vueltas · de ${primera.cuando} a ${ultima.cuando}`);
  console.log(`  peticiones por 10 min: min ${Math.min(...vueltas.map((v) => suma(v, (f) => f.pet10)))} · max ${Math.max(...vueltas.map((v) => suma(v, (f) => f.pet10)))} · media ${Math.round(vueltas.reduce((n, v) => n + suma(v, (f) => f.pet10), 0) / vueltas.length)}`);
  console.log(`  plazas ocupadas: min ${Math.min(...vueltas.map((v) => v.plazas.ocupadas))} · max ${Math.max(...vueltas.map((v) => v.plazas.ocupadas))} · presupuesto ${ultima.plazas.presupuesto}${ultima.plazas.declarado === false ? ' (SIN DECLARAR en este entorno: se usa la mitad de la máquina; los recolectores llevan el suyo)' : ''}`);
  console.log(`  esperando turno: max ${Math.max(...vueltas.map((v) => v.plazas.esperando))}`);
  console.log(`  navegadores: primero ${primera.navegadores} · último ${ultima.navegadores} · max ${Math.max(...vueltas.map((v) => v.navegadores ?? 0))}`);
  console.log(`  navegadores RAÍZ (los de verdad, sin contar renderers): último ${ultima.navegadoresRaiz ?? '?'} · procesos por navegador: ${ultima.procesosPorNavegador ?? '?'} (lo sano es 6-10)`);
  console.log(`  navegadores HUÉRFANOS (sin node vivo por encima): primero ${primera.huerfanos ?? 0} · último ${ultima.huerfanos ?? 0} · max ${Math.max(...vueltas.map((v) => v.huerfanos ?? 0))}`);
  console.log(`  memoria libre: min ${Math.min(...vueltas.map((v) => v.memoriaLibreGb ?? 99)).toFixed(2)} GB · última ${ultima.memoriaLibreGb?.toFixed(2)} GB`);
  const atascos = new Map();
  for (const v of vueltas) for (const f of v.federaciones) if (f.atascada) atascos.set(f.federacion, (atascos.get(f.federacion) ?? 0) + 1);
  console.log(`  federaciones atascadas (alguna vuelta): ${atascos.size ? [...atascos.entries()].map(([f, n]) => `${f}×${n}`).join(' ') : 'ninguna'}`);
  const sinSesion = new Map();
  for (const v of vueltas) for (const f of v.federaciones) if (f.entreSesiones) sinSesion.set(f.federacion, (sinSesion.get(f.federacion) ?? 0) + 1);
  console.log(`  entre sesiones con trabajo disponible: ${sinSesion.size ? [...sinSesion.entries()].map(([f, n]) => `${f}×${n}`).join(' ') : 'ninguna'}`);
  const pausas = new Map();
  for (const v of vueltas) for (const f of v.federaciones) if (f.pausaActiva) pausas.set(f.federacion, (pausas.get(f.federacion) ?? 0) + 1);
  console.log(`  con pausa preventiva: ${pausas.size ? [...pausas.entries()].map(([f, n]) => `${f}×${n}`).join(' ') : 'ninguna'}`);
  const sinPeticiones = new Map();
  for (const v of vueltas) for (const f of v.federaciones) if (!f.pet30) sinPeticiones.set(f.federacion, (sinPeticiones.get(f.federacion) ?? 0) + 1);
  console.log(`  vueltas sin peticiones en 30 min: ${sinPeticiones.size ? [...sinPeticiones.entries()].map(([f, n]) => `${f}×${n}`).join(' ') : 'ninguna'}`);
  process.exit(0);
}

mkdirSync(join(raiz, 'pruebas', 'reconstruccion'), { recursive: true });
const fin = Date.now() + duracionMin * 60000;
console.log(`═══ vigilando la flota cada ${cadaMin} min durante ${duracionMin} min · fichero ${rutaSalida}`);
while (Date.now() < fin) {
  try {
    const v = vuelta();
    appendFileSync(rutaSalida, `${JSON.stringify(v)}\n`);
    const pet = v.federaciones.reduce((n, f) => n + f.pet10, 0);
    const atascadas = v.federaciones.filter((f) => f.atascada).map((f) => f.federacion);
    const dormidas = v.federaciones.filter((f) => f.entreSesiones).map((f) => f.federacion);
    console.log(`  ${v.cuando.slice(11, 16)}Z · pet/10min ${String(pet).padStart(4)} · plazas ${v.plazas.ocupadas}/${v.plazas.presupuesto}${v.plazas.declarado === false ? ' sin declarar' : ''}${v.plazas.esperando ? ` (+${v.plazas.esperando} esperando)` : ''} · navegadores ${v.navegadoresRaiz ?? '?'} raíz / ${v.navegadores} procesos${v.procesosPorNavegador > 12 ? ` ← ${v.procesosPorNavegador} POR NAVEGADOR, REVISAR` : ''} (huérfanos ${v.huerfanos}) · libre ${v.memoriaLibreGb?.toFixed(2)} GB${atascadas.length ? ` · ATASCADAS: ${atascadas.join(', ')}` : ''}${dormidas.length ? ` · entre sesiones: ${dormidas.join(', ')}` : ''}`);
  } catch (error) {
    console.log(`  ${new Date().toISOString().slice(11, 16)}Z · error en la vuelta: ${error.message}`);
  }
  await new Promise((r) => setTimeout(r, cadaMin * 60000));
}
console.log('  (fin de la vigilancia)');
