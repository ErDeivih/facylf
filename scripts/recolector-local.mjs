#!/usr/bin/env node
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  repartePlazas, cabeOtroNavegador, tocaReciclar, decideEsperaDePlaza,
  decideTurnoDePlaza, plazaAbandonada, RESERVA_GB, TURNO_PLAZA_MIN,
} from './lib/presupuesto-memoria.mjs';
import { freemem, hostname, totalmem } from 'node:os';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { actaSinContenidoDeportivo } from './lib/acta-vacia.mjs';
// Sin publicidad ni rastreadores en el navegador: es la palanca de CPU y memoria más directa (medido 20/09/2026).
import { bloqueaTerceros } from './lib/bloqueo-terceros.mjs';
import { banderasDeChrome, topeDeNavegadorMb } from './lib/banderas-chrome.mjs';
import {
  URL_RESULTADOS, abreBase, encola, esCompeticionDeMenores, extraeCompeticiones,
  basePrioridadCompeticion, enTransaccion, establecePausaGlobal, extraeGrupos, extraeJornadas,
  extraePartidos, extraeTemporadas, guardaActaEstructura, guardaAtomico, guardaMetadato,
  inspeccionaActa, claveTrabajo, leeArchivo, leeMetadato, pausaGlobalActiva,
  marcaTrabajo, peticionesHoy, preparaDesdeCatalogo, preparaGruposDesdeCatalogo,
  reactiva, registraPeticion, resumen, seleccionaMuestrasCompeticion,
  rutaGrupo, rutaJsonDeArchivo, siguienteTrabajo, ultimaPeticion, urlActa, urlCalendario,
  urlClasificacion, urlGrupos, urlJornada, validaPagina, setPerfil,
} from './lib/recolector-local.mjs';
// El día civil de Madrid, compartido con el supervisor y la flota (antes estaba copiado en tres guiones).
import { diaDeMadrid } from './lib/dia-madrid.mjs';
// Parser de actas (TypeScript) compilado a `packages/ingesta/dist`. Es el mismo que usa la
// ingesta (una sola fuente de verdad). Requiere `pnpm --filter @facylf/ingesta build` (o `pnpm
// build`) para existir, ya que `dist/` no se guarda en git.
import { parseaActa, VERSION_PARSER_ACTA } from '../packages/ingesta/dist/src/parsers/acta.js';
import { parseaJornada } from '../packages/ingesta/dist/src/parsers/jornada.js';
import { decodificaHtml } from '../packages/ingesta/dist/src/texto.js';
import { decideFilaDeDescanso, esPalabraDeDescanso, evaluaYCompara } from '../packages/ingesta/dist/src/index.js';
import {
  decisionesPendientesPorActa, guardaDecisionDescanso, leeDecisionDescanso,
} from './lib/persistencia-descansos.mjs';

const RAIZ = resolve(import.meta.dirname, '..');
let CARPETA = join(RAIZ, 'descargas-federacion', 'recolector-local');
let BASE = join(CARPETA, 'cola-v2.sqlite');
let CATALOGO_EXISTENTE = join(RAIZ, 'descargas-federacion', 'competiciones-por-temporada.json');
let GRUPOS_EXISTENTES = join(RAIZ, 'descargas-federacion', 'selenium', 'grupos-por-temporada.json');
let CONFIGURACION = join(RAIZ, 'recolector.config.json');
let PERFIL_NOMBRE = 'castilla-leon';
const comando = process.argv[2] ?? 'estado';
const CARPETA_SLOTS_CHROME = join(RAIZ, '.estado-workers', 'slots-chrome');
// Un navegador por federación PNFG. En este equipo de 32 GB caben los 14
// perfiles genéricos con margen; Castilla y León conserva además su plaza
// reservada para que la prioridad del proyecto no dependa de la cola general.
const MAX_CHROMES_PNFG = 14;
// No abrir una nueva sesión si el sistema ya está bajo presión. El ordenador también se usa mientras ingesta,
// y en un servidor dedicado esta comprobación es la que impide que la última plaza se lleve por delante la
// memoria del propio sistema operativo.
//
// EL MISMO NÚMERO QUE USA EL GOBERNADOR. Antes eran dos criterios distintos: el reparto decidía con una
// reserva de 1,5 GB y el worker exigía 2,5 GB libres antes de abrir Chrome. Dos verdades para lo mismo se
// contradicen justo cuando importa: medido el 18/09/2026 en esta máquina, con el presupuesto dando 19 plazas y
// de sobra por reparto, los workers con sesión nueva se quedaban esperando 2,5 GB que el escritorio del usuario
// nunca deja libres, así que la flota se apagaba sola de una en una. En un servidor de 10 GB con once
// navegadores abiertos pasa lo mismo: quedan menos de 2,5 GB libres SIEMPRE, y con ese umbral no arrancaría
// nunca nadie. La reserva del presupuesto (1,5 GB) es el número honesto: el resto lo decide el reparto, que es
// quien cuenta las plazas.
/**
 * Y cuánto se le exige al sistema CUANDO HAY PRESUPUESTO DECLARADO.
 *
 * La reserva no se cuenta dos veces. El reparto ya descuenta 1,5 GB del presupuesto antes de calcular plazas
 * (`paraNavegadoresGb = 10 − 1,5 = 8,5 → 11 plazas`), así que exigir ADEMÁS 1,5 GB libres en cada apertura es
 * pedir lo mismo dos veces: en un servidor de 10 GB con once navegadores dentro del presupuesto quedan ~1-2 GB
 * libres, y con el umbral en 1,5 GB el resultado sería que casi nadie abre navegador y las sesiones se pasan el
 * día esperando memoria para salir a los 15 minutos. Medido el 18/09/2026 en el PC, con presupuesto declarado de
 * 1 GB y 0,32 GB libres: el worker se quedaba en «esperando memoria» con la plaza libre de par en par.
 *
 * Con presupuesto declarado, el control es el NÚMERO DE PLAZAS (que ya lleva la reserva dentro) y aquí sólo se
 * pide un suelo de emergencia: que al sistema no le queden menos de 0,25 GB, que es cuando ya no hay margen ni
 * para respirar. Sin presupuesto —en el PC compartido con el escritorio— se mantiene la reserva completa, que es
 * la que evita que los recolectores se coman la memoria del usuario.
 */
const RESERVA_AIRE_GB = Number(process.env.FACYLF_MEMORIA_GB) > 0 ? 0.25 : RESERVA_GB;

/**
 * Y la reserva del SISTEMA, que es lo que hace que la flota encoja sola cuando el servidor tiene otras cosas que
 * hacer (PostgreSQL, la web, el propio sistema) o cuando el trabajo escasea. Configurable con
 * `FACYLF_RESERVA_GB`; por defecto la misma reserva con la que se calcula el reparto (1,5 GB).
 */
const RESERVA_MAQUINA_GB = Number(process.env.FACYLF_RESERVA_GB) > 0
  ? Number(process.env.FACYLF_RESERVA_GB)
  : RESERVA_GB;

/**
 * Plazo máximo que un worker puede tener una plaza de navegador cuando hay federaciones esperando.
 *
 * En un servidor encendido 24/7 no caben las 19 federaciones a la vez (en 10 GB caben 11), así que sin
 * rotación las que no entran no entran nunca: el que tiene plaza la conserva sesión tras sesión. Agotado el
 * turno se termina la sesión en limpio —la plaza vuelve a la cola y su supervisor relanza más tarde— y el
 * hueco circula. Configurable con `FACYLF_TURNO_PLAZA_MIN`. Si no hay nadie esperando, el turno no caduca.
 */
const TURNO_PLAZA_MS = Number(process.env.FACYLF_TURNO_PLAZA_MIN) > 0
  ? Number(process.env.FACYLF_TURNO_PLAZA_MIN) * 60_000
  : TURNO_PLAZA_MIN * 60_000;

/**
 * Tope de espera de plaza de navegador: agotado, la sesión sale limpia en vez de quedarse en bucle.
 * Configurable con `FACYLF_TOPE_ESPERA_MS` para poder PROBAR el bloqueo sin esperar quince minutos.
 */
const TOPE_ESPERA_NAVEGADOR_MS = Number(process.env.FACYLF_TOPE_ESPERA_MS) > 0
  ? Number(process.env.FACYLF_TOPE_ESPERA_MS)
  : 15 * 60_000;

/**
 * Tope de memoria del navegador de un worker: a partir de aquí se recicla aunque no toque por trabajos.
 *
 * ── EL TOPE DE 450 MB ERA INALCANZABLE, Y ESO FRENÓ LA RECOLECCIÓN A UN TERCIO ─────────────────────────
 *
 * Medido el 17/09/2026 a las 23:20, con la flota en marcha: los registros imprimían «reciclado de Chrome tras
 * 110, 111, 112, 113… trabajos», es decir **un reciclado por trabajo**, y el navegador medía 490-930 MB en
 * cuanto llevaba unas páginas del portal encima. Con el tope en 450 MB la medición SIEMPRE lo superaba, así que
 * el reciclado por consumo se disparaba en cada comprobación: cada trabajo pagaba cerrar el navegador, limpiar
 * el perfil (un PowerShell), abrirlo otra vez y volver a pedir plaza. Resultado: **1,4-2,4 peticiones por
 * minuto** donde el ritmo configurado permite ~8, y el 80 % del tiempo del worker gastado en arranques.
 *
 * El tope tiene que estar por ENCIMA de lo que ocupa el navegador cuando ya está cargado (250-650 MB medidos)
 * y por debajo de lo que justifica un reciclado (930 MB). 900 MB cumple las dos cosas y deja que el suelo por
 * trabajos —40, ver `cadaRecicladoNavegador`— sea el que marque el paso.
 *
 * ── Y POR QUÉ EN EL PC SE BAJA (21/09/2026) ─────────────────────────────────────────────────────────────
 *
 * El pico de cada navegador decide cuántas plazas caben en el presupuesto de memoria: con las banderas nuevas
 * el navegador se queda en ~500 MB, así que reciclar a 900 MB deja crecer un pico que ya no hace falta. Con
 * `FACYLF_TOPE_NAVEGADOR_MB` el PC puede reciclar antes (500 MB) y cambiar algo de arranque de Chrome por un
 * pico más bajo; el servidor, que no declara la variable, sigue con los 900 MB de siempre. La decisión de
 * reciclar es la misma de `lib/presupuesto-memoria.mjs`, con otro número.
 */
const TOPE_NAVEGADOR_MB = topeDeNavegadorMb(process.env.FACYLF_TOPE_NAVEGADOR_MB, 900);

/** Y la medición se refresca cada diez trabajos, no cada cinco: son 2-4 s de PowerShell cada vez. */
const CADA_MEDICION_NAVEGADOR = 10;

/**
 * Antigüedad (en días) a partir de la cual una ficha de acta VACÍA se da por no publicada.
 *
 * Dos meses: por debajo de eso la federación puede estar tardando en publicar (y se reintenta), y muy por encima ya
 * no aparece nunca. Medido el 19/09/2026 en Navarra: las fichas vacías eran de partidos de mayo de 2024.
 */
const DIAS_ACTA_ANTIGUA_SIN_FICHA = 60;

function procesoVivo(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * Quién es este proceso para el semáforo de plazas: su identificador y su CONTENEDOR.
 *
 * El `hostname` de un contenedor lo pone Docker (es el identificador del contenedor), así que dos contenedores
 * nunca comparten nombre, y en el PC es el nombre de la máquina. Sirve para lo que el identificador de proceso
 * no puede: saber si la ficha de una plaza la escribió un proceso de MI espacio de identificadores o de otro.
 */
const MI_CONTENEDOR = hostname();

/** Lee una ficha de plaza: `pid contenedor` (el contenedor es opcional en fichas antiguas). */
function fichaDePlaza(ruta) {
  const [pid, host] = String(readFileSync(ruta, 'utf8')).trim().split(/\s+/);
  return [Number(pid), host ?? null];
}

/**
 * Cuándo empezó a esperar quien escribió una ficha de espera.
 *
 * El orden de llegada va en el CONTENIDO de la ficha (`pid contenedor hora`), no en su fecha de modificación: la
 * fecha se refresca como latido para que no den por abandonada a una federación que lleva rato esperando, y si
 * sirviera también de orden, refrescar la propia ficha pondría a su dueño el ÚLTIMO de la cola.
 *
 * Una ficha antigua, que sólo tenía la hora, sigue valiendo por su fecha de modificación.
 */
export function horaDeLlegadaDeEspera(ruta) {
  try {
    const campos = String(readFileSync(ruta, 'utf8')).trim().split(/\s+/);
    const hora = Number(campos[campos.length - 1]);
    if (campos.length >= 3 && Number.isFinite(hora)) return hora;
  } catch { /* se cae a la fecha del fichero */ }
  try { return statSync(ruta).mtimeMs; } catch { return 0; }
}

/**
 * Memoria libre de VERDAD para quien decide: la del contenedor si estamos en uno, la del sistema si no.
 *
 * `os.freemem()` en un contenedor devuelve la memoria libre del HOST, no la que le queda al contenedor. En el
 * servidor de 10 GB eso da un número engañoso por los dos lados: con once navegadores dentro del presupuesto
 * el host puede estar justo (y el contenedor tener aire), o al revés. Los cgroups v2 dicen exactamente cuánto
 * queda (`memory.max` − `memory.current`), así que se prefiere eso cuando existe: es el mismo número que usa
 * el propio Docker para decidir a quién matar.
 */
function memoriaLibreDelEntorno() {
  try {
    const max = readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    const usada = Number(readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim());
    if (max !== 'max' && Number.isFinite(Number(max)) && Number.isFinite(usada)) {
      return { gb: Math.max(0, (Number(max) - usada) / 1024 ** 3), fuente: 'contenedor (cgroup)' };
    }
  } catch { /* no hay cgroups v2 legibles: se usa la memoria del sistema */ }
  return { gb: freemem() / 1024 ** 3, fuente: process.platform === 'win32' ? 'Windows' : 'sistema' };
}

/**
 * Pide turno para abrir un navegador, con cola de espera por orden de llegada.
 *
 * Hay una cola por carril (PNFG general y Castilla y León) para que el reciclado
 * de Chrome no permita que un proceso adelante indefinidamente a los demás.
 * Además se conserva un pequeño margen de RAM: con memoria suficiente trabajan
 * todas las federaciones; si baja, la siguiente sesión espera sin afectar a las
 * que ya están realizando una petición.
 */
async function adquiereSlotChrome(db) {
  mkdirSync(CARPETA_SLOTS_CHROME, { recursive: true });
  /*
   * ── TOPE DE ESPERA ────────────────────────────────────────────────────────────────────────────────
   *
   * Antes esto era un `while (true)` sin salida: si el reparto no concedía plaza —o el umbral era
   * inalcanzable, como el de 6,5 GB que tenía Cataluña—, el worker se quedaba dentro para siempre,
   * imprimiendo el mismo mensaje cada 15-25 s, sin que nadie pudiera distinguirlo de un worker averiado y
   * **sin que el supervisor lo relanzara nunca, porque nunca terminaba**.
   *
   * Ahora la espera tiene tope: agotado el plazo se sale con un error marcado como OPERATIVO, que el llamador
   * trata como «hoy no se puede recolectar»: la cola queda intacta y la próxima sesión lo reintenta. Es la
   * diferencia entre esperar y bloquearse.
   */
  const inicioEspera = Date.now();
  const prefijoFicha = PERFIL_NOMBRE === 'castilla-leon' ? 'espera-prioridad-' : 'espera-pnfg-';
  const nombreMiFicha = `${prefijoFicha}${process.pid}.ficha`;
  const miFicha = join(CARPETA_SLOTS_CHROME, nombreMiFicha);
  /*
   * La ficha de espera guarda `pid contenedor`, igual que la de la plaza, y por el mismo motivo: dentro de Docker
   * el identificador de proceso NO significa lo mismo en un contenedor que en otro. Con sólo el pid, una ficha
   * que dejó un contenedor muerto podía parecer viva —el pid 42 existe en todos los contenedores— y los demás
   * cedían su turno por un fantasma (ver `hayFederacionesEsperando`). Medido el 19/09/2026.
   */
  if (!existsSync(miFicha)) writeFileSync(miFicha, `${process.pid} ${MI_CONTENEDOR} ${Date.now()}`);
  let aviso = false;
  while (true) {
    /*
     * Se retiran las fichas de espera ABANDONADAS: las de un proceso que ya no existe (en este contenedor) y las
     * de un contenedor que lleva cinco minutos sin dar señales. Si un worker muere esperando, su ficha no puede
     * bloquear a los demás; y si el que espera está vivo, no se toca, por mucho que tarde.
     */
    for (const ficha of readdirSync(CARPETA_SLOTS_CHROME).filter((x) => x.startsWith('espera-'))) {
      if (ficha === nombreMiFicha) continue;
      const rutaFicha = join(CARPETA_SLOTS_CHROME, ficha);
      let pid = null;
      let host = null;
      try {
        [pid, host] = fichaDePlaza(rutaFicha);
      } catch {
        rmSync(rutaFicha, { force: true }); // ilegible: no puede representar a nadie
        continue;
      }
      const estado = plazaAbandonada({
        pid, host, miHost: MI_CONTENEDOR,
        procesoVivo: procesoVivo(pid), ultimoLatidoMs: statSync(rutaFicha).mtimeMs, ahoraMs: Date.now(),
      });
      if (estado.abandonada) rmSync(rutaFicha, { force: true });
    }
    // Y la mía se refresca para que no me la quiten mientras espero legítimamente. Eso toca su FECHA, no el orden
    // de llegada: el turno se decide por la hora que lleva escrita dentro (`horaDeLlegadaDeEspera`).
    try { const ahora = new Date(); utimesSync(miFicha, ahora, ahora); } catch { /* sin latido, valdrá el pid */ }
    const miHora = horaDeLlegadaDeEspera(miFicha);
    const masAntiguas = readdirSync(CARPETA_SLOTS_CHROME)
      .filter((x) => x.startsWith(prefijoFicha) && x !== nombreMiFicha)
      .filter((x) => horaDeLlegadaDeEspera(join(CARPETA_SLOTS_CHROME, x)) < miHora);
    /*
     * ── Cuántas plazas hay, y si cabe uno más ────────────────────────────────────────────────────────
     *
     * Las plazas NO son un número escrito a mano: salen de un PRESUPUESTO repartido (ver
     * `lib/presupuesto-memoria.mjs`). Con `FACYLF_MEMORIA_GB=10` en el servidor, son las que caben en 10 GB;
     * sin la variable, la mitad de la memoria del equipo, que en una máquina grande no limita nada y en una
     * pequeña aprieta. Y se cuentan las plazas OCUPADAS de verdad, así que diecisiete workers no pueden
     * decidir a la vez que hay sitio: el reparto es compartido, no individual.
     */
    const reparto = repartePlazas({
      memoriaGb: Number(process.env.FACYLF_MEMORIA_GB),
      memoriaTotalGb: totalmem() / 1024 ** 3,
    });
    const slots = Array.from({ length: reparto.plazas }, (_, i) => `slot-${i + 1}.lock`);
    /*
     * ── LIMPIAR PLAZAS NO PUEDE DEPENDER DE TENER RAM ─────────────────────────────────────────────────
     *
     * Y, sobre todo, **no puede tirar la plaza de un worker vivo**. Aquí había una caducidad de 60 minutos
     * pensada para que Windows reutilice identificadores sin dejar plazas fantasma, y hacía justo lo contrario
     * de lo que prometía: un worker con sesiones largas (horas) perdía su ficha al cumplir la hora, sus
     * compañeros la daban por libre, y el reparto admitía un navegador de más **mientras el primero seguía
     * abierto**. Medido el 18/09/2026: nueve navegadores trabajando con sólo tres fichas de plaza, y el
     * gobernador creyendo que había dieciséis huecos libres.
     *
     * Ahora la plaza se considera abandonada por lo que dice `plazaAbandonada`: su dueño ya no existe o lleva
     * cinco minutos sin dar señales (cada worker refresca su ficha con cada trabajo, ver `refrescaLatidoDePlaza`).
     * Un worker vivo conserva su plaza por muchas horas que dure su sesión.
     *
     * Y la ficha guarda TAMBIÉN el contenedor que la escribió, porque dentro de Docker el identificador de
     * proceso no significa lo mismo en un contenedor que en otro (ver el comentario de `plazaAbandonada`).
     */
    const primerSlotLibre = slots.filter((s) => !existsSync(join(CARPETA_SLOTS_CHROME, s)));
    const ocupadas = slots.length - primerSlotLibre.length;
    for (const nombreSlot of slots) {
      const ruta = join(CARPETA_SLOTS_CHROME, nombreSlot);
      if (!existsSync(ruta)) continue;
      try {
        const [pid, host] = fichaDePlaza(ruta);
        const estado = plazaAbandonada({
          pid, host, miHost: MI_CONTENEDOR,
          procesoVivo: procesoVivo(pid), ultimoLatidoMs: statSync(ruta).mtimeMs, ahoraMs: Date.now(),
        });
        if (estado.abandonada) {
          rmSync(ruta, { force: true });
          console.log(`  · plaza ${nombreSlot} liberada (${estado.motivo}).`);
        }
      } catch { rmSync(ruta, { force: true }); }
    }
    const hueco = cabeOtroNavegador({
      plazas: reparto.plazas,
      ocupadas: slots.filter((s) => existsSync(join(CARPETA_SLOTS_CHROME, s))).length,
      memoriaLibreGb: memoriaLibreDelEntorno().gb,
      reservaGb: RESERVA_AIRE_GB,
      // La del sistema, no la del contenedor: si el servidor tiene otras cosas, se les deja su sitio.
      memoriaDeLaMaquinaGb: freemem() / 1024 ** 3,
      reservaDeLaMaquinaGb: RESERVA_MAQUINA_GB,
    });
    const memoriaSuficiente = hueco.cabe;
    /*
     * EL ORDEN DE LLEGADA SÓLO MANDA CUANDO NO HAY SITIO. Si queda una plaza libre dentro del presupuesto, el
     * que llega la toma: la cola de espera existe para repartir un recurso escaso, no para frenar a quien
     * cabría. Antes bastaba con que hubiera alguien esperando —aunque fuese esperando MEMORIA, no plaza— para
     * que un worker con sitio de sobra se quedase fuera hasta quince minutos, y eso en un servidor se nota.
     * Cuando no hay plaza libre, sí manda la antigüedad: el que lleva más tiempo esperando entra primero.
     */
    const hayPlazaLibre = slots.some((s) => !existsSync(join(CARPETA_SLOTS_CHROME, s)));
    if ((hayPlazaLibre || !masAntiguas.length) && memoriaSuficiente) {
      for (const nombreSlot of slots) {
        const ruta = join(CARPETA_SLOTS_CHROME, nombreSlot);
        try {
          const fd = openSync(ruta, 'wx');
          writeFileSync(fd, `${process.pid} ${MI_CONTENEDOR}`); closeSync(fd);
          rmSync(miFicha, { force: true }); // ya no espera: deja pasar a los siguientes
          const desde = Date.now();
          if (aviso) console.log(`  · turno de navegador concedido (${nombreSlot}).`);
          return { ruta, desde, nombre: nombreSlot };
        } catch (error) {
          if (error?.code !== 'EEXIST') throw error;
        }
      }
    }
    if (!aviso) {
      /*
       * El mensaje tiene que decir POR QUÉ espera, no sólo que espera. Antes se elegía por «¿cabe?», así que un
       * worker sin plaza libre —con memoria de sobra— decía «esperando memoria libre», y eso manda a buscar el
       * problema donde no está. Ahora el motivo sale del propio veredicto, que distingue las tres condiciones:
       * el reparto de plazas, la memoria de este contenedor y la del sistema.
       */
      console.log(!hueco.cabe
        ? `  · esperando para abrir Chrome: ${hueco.motivo}`
        : `  · esperando turno de navegador: ${reparto.plazas} plaza(s) en el presupuesto` +
          `${masAntiguas.length ? `, ${masAntiguas.length} federación(es) por delante` : ''}.`);
    }
    aviso = true;
    const espera = decideEsperaDePlaza({
      esperandoDesdeMs: inicioEspera, ahoraMs: Date.now(), topeMs: TOPE_ESPERA_NAVEGADOR_MS, motivoDelHueco: hueco.motivo,
    });
    if (espera.salir) {
      /*
       * Se sale con un error OPERATIVO («hoy no se puede»): la cola queda intacta y la próxima sesión lo
       * reintenta. Y se deja escrito POR QUÉ, porque no es lo mismo no tener plaza que no tener memoria:
       *
       *   · `turno`   → hay más federaciones que plazas y le ha tocado esperar (lo normal en el servidor);
       *   · `memoria` → a la MÁQUINA le queda menos de su reserva (ver `FACYLF_RESERVA_GB`).
       *
       * El supervisor lo lee en `proximo-trabajo.mjs` y, si fue por memoria, espera un poco más antes de
       * relanzar: relanzar cada veinte segundos cuando el problema es que la máquina está llena no arregla nada.
       * Medido en el PC el 19/09/2026: cinco federaciones dando vueltas de quince minutos en espera sin avanzar.
       */
      try {
        guardaMetadato(db, 'ultima_salida_motivo', /memoria|reserva/i.test(espera.motivo) ? 'memoria' : 'turno');
        guardaMetadato(db, 'ultima_salida_en', new Date().toISOString());
      } catch { /* sin constancia, el supervisor usará su espera de siempre */ }
      const error = new Error(espera.motivo);
      error.operativa = true; // el llamador la trata como «hoy no se puede»: la cola queda intacta
      throw error;
    }
    await dormir(15_000 + Math.floor(Math.random() * 10_000));
  }
}

function liberaSlotChrome(ruta) {
  if (ruta) rmSync(ruta, { force: true });
  for (const prefijo of ['espera-', 'espera-pnfg-', 'espera-prioridad-']) {
    rmSync(join(CARPETA_SLOTS_CHROME, `${prefijo}${process.pid}.ficha`), { force: true });
  }
}

/**
 * Refresca la ficha de la plaza que tiene este worker.
 *
 * Es lo que hace que una plaza con dueño vivo NO se pueda dar por abandonada: sin latido, la única forma de
 * distinguir «worker trabajando desde hace tres horas» de «worker que murió y dejó la ficha» sería el tiempo,
 * y ya se vio adónde lleva eso (una caducidad de 60 minutos tirando plazas de workers vivos).
 */
function refrescaLatidoDePlaza(turno) {
  if (!turno?.ruta) return;
  try {
    const ahora = new Date();
    utimesSync(turno.ruta, ahora, ahora);
  } catch { /* si no se puede tocar, el latido envejece y la plaza acabará liberándose: fallo seguro */ }
}

/**
 * ¿Hay alguna federación esperando plaza? Se miran las fichas de espera, que es la cola de verdad.
 *
 * Y se mira que su dueño VIVA: una ficha de un proceso muerto no es alguien esperando, y contarla haría que
 * todos los workers fuesen cediendo su turno por un fantasma. Las fichas muertas las retira el propio bucle de
 * adquisición, pero aquí no se puede esperar a que pase por ahí.
 */
function hayFederacionesEsperando() {
  try {
    return readdirSync(CARPETA_SLOTS_CHROME).some((x) => {
      if (!x.startsWith('espera-') || !x.endsWith('.ficha')) return false;
      const rutaFicha = join(CARPETA_SLOTS_CHROME, x);
      try {
        const [pid, host] = fichaDePlaza(rutaFicha);
        // El mismo criterio que para las plazas: en mi contenedor manda el identificador de proceso; en otro, el
        // latido. Sin esto, una ficha de un contenedor muerto con un pid que aquí existe hace que todos cedan su
        // turno por un fantasma.
        return !plazaAbandonada({
          pid, host, miHost: MI_CONTENEDOR,
          procesoVivo: procesoVivo(pid), ultimoLatidoMs: statSync(rutaFicha).mtimeMs, ahoraMs: Date.now(),
        }).abandonada;
      } catch { return false; }
    });
  } catch { return false; }
}

function argumento(nombre, defecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : defecto;
}

function leeJson(ruta) {
  return JSON.parse(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, ''));
}

// Perfil opcional de federación: --perfil <json> o RFCYLF_PERFIL=<json>. Sin perfil, todo es
// Castilla y León (comportamiento por defecto, sin cambios). Con perfil, cambia base/cod_primaria
// y las carpetas de datos a `descargas-<nombre>/recolector-local`, con su propia config.
const PERFIL_RUTA = process.env.RFCYLF_PERFIL || argumento('perfil', '');
if (PERFIL_RUTA) {
  const p = leeJson(PERFIL_RUTA);
  PERFIL_NOMBRE = p.nombre;
  setPerfil({ nombre: p.nombre, base: p.base, codPrimaria: p.codPrimaria });
  CARPETA = join(RAIZ, p.carpeta || `descargas-${p.nombre}`, 'recolector-local');
  BASE = join(CARPETA, 'cola-v2.sqlite');
  CONFIGURACION = join(RAIZ, p.config || `recolector.${p.nombre}.config.json`);
  CATALOGO_EXISTENTE = p.catalogo || CATALOGO_EXISTENTE;
  GRUPOS_EXISTENTES = p.grupos || GRUPOS_EXISTENTES;
  console.log(`Perfil: ${p.nombre} (${p.base}), carpeta ${CARPETA}`);
}

const config = existsSync(CONFIGURACION) ? leeJson(CONFIGURACION) : {};

/**
 * Limpia los procesos Chrome que se han quedado VIVOS con el perfil de ESTE worker.
 *
 * Por qué hace falta: `driver.quit()` cierra la sesión, pero en Chrome 152 los renderers y los procesos de
 * caché de ese perfil se quedan vivos y nadie los recoge. Medido el 17/09/2026 en esta máquina: **103
 * procesos Chrome huérfanos** de los recolectores, **8,5 GB**, con la memoria libre bajando a 1,5 GB — y
 * Euskadi y Extremadura parados en «esperando memoria libre antes de abrir Chrome». Matarlos de una vez
 * liberó **4,07 GB**.
 *
 * Tres cosas que hace a propósito, y son las que lo hacen seguro:
 *
 *   1. **sólo toca SU perfil**: el filtro es la ruta `<federación>/recolector-local/perfil-chrome`, así que un
 *      worker no puede matar el navegador de otro ni, mucho menos, el del usuario;
 *   2. **no toca el navegador de una sesión viva**: se llama justo después de `quit()`, cuando ya no hay
 *      ninguna sesión propia que proteger;
 *   3. **si falla, no tumba la recolección**: una limpieza es una mejora, no un requisito para recolectar.
 *
 * Se ejecuta en cada reciclado preventivo y al terminar la sesión. El coste es de un par de segundos cada
 * diez trabajos, y el silencio de las pausas ya lo absorbe.
 */
function mideNavegadorDeEstePerfil() {
  if (process.platform !== 'win32') return null;
  try {
    const ruta = join(import.meta.dirname, 'medir-navegador-perfil.ps1');
    const ps = process.env.SystemRoot ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
    const r = spawnSync(ps, ['-NoProfile', '-File', ruta, join(CARPETA, 'perfil-chrome')], { encoding: 'utf8', timeout: 30000 });
    const mb = Number(String(r.stdout ?? '').trim().split(/\s+/).pop().replace(',', '.'));
    return Number.isFinite(mb) && mb > 0 ? mb : null;
  } catch { return null; }
}

function limpiaChromeHuerfanoDeEstePerfil() {
  if (process.platform !== 'win32') return;
  const perfil = join(CARPETA, 'perfil-chrome');
  try {
    const guion = [
      `$todos = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'"`,
      `$mios = $todos | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${perfil}') }`,
      'if (-not $mios) { Write-Output "0|0"; exit 0 }',
      '$mb = 0',
      'foreach ($x in $mios) { $q = Get-Process -Id $x.ProcessId -ErrorAction SilentlyContinue; if ($q) { $mb += $q.WorkingSet64 } }',
      '$n = @($mios).Count',
      'foreach ($x in $mios) { Stop-Process -Id $x.ProcessId -Force -ErrorAction SilentlyContinue }',
      'Write-Output ("{0}|{1}" -f $n, [math]::Round($mb / 1MB))',
    ].join('; ');
    /*
     * LA RUTA COMPLETA DEL POWERSHELL DEL SISTEMA, no `powershell` a secas.
     *
     * Medido el 17/09/2026 con la prueba 3: lanzado desde un supervisor cuya cuenta no tiene
     * `System32\WindowsPowerShell\v1.0` en el PATH, `spawnSync('powershell', ...)` NO lanza una excepción
     * —devuelve un objeto con `.error` y `stdout` vacío—, así que el `catch` no se enteraba, `Number('')` daba
     * 0 y la función terminaba **en silencio sin limpiar nada**: la red de limpieza tenía un agujero mudo.
     * Es el mismo fallo que ya se corrigió en la medición de memoria (`mideNavegadorDeEstePerfil`) y en el
     * informe de estado. Aquí se cierra igual: ruta completa y aviso cuando el proceso no arranca.
     */
    const ps = process.env.SystemRoot
      ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe';
    const salida = spawnSync(ps, ['-NoProfile', '-Command', guion], { encoding: 'utf8', timeout: 30000 });
    if (salida.error) {
      console.log(`  · no se pudo limpiar el navegador de su perfil (${salida.error.code ?? salida.error.message}); se sigue recolectando.`);
      return;
    }
    const [numero, megas] = String(salida.stdout ?? '').trim().split('|');
    const n = Number(numero);
    if (Number.isFinite(n) && n > 0) {
      console.log(`  · limpieza del navegador: ${n} proceso(s) de su propio perfil, ${megas} MB liberados.`);
    }
  } catch {
    // Una limpieza que falla no puede tumbar la recolección: se avisa y se sigue.
    console.log('  · no se pudo limpiar el navegador de su perfil (se sigue recolectando).');
  }
}

function valorConfig(ruta, defecto) {
  let actual = config;
  for (const parte of ruta.split('.')) actual = actual?.[parte];
  return actual ?? defecto;
}

const opcionesNumericas = {
  'intervalo-min': ['ritmo.intervaloMinSeg', 180],
  'intervalo-max': ['ritmo.intervaloMaxSeg', 300],
  'max-diario': ['ritmo.maxPeticionesDia', 20],
  max: ['ritmo.maxTrabajosSesion', 20],
  'desde-hora': ['ritmo.desdeHora', 8],
  'hasta-hora': ['ritmo.hastaHora', 22],
  desde: ['alcance.desdeAnio', 2015],
  'catalogo-cada-dias': ['vigilancia.catalogoActualCadaDias', 7],
  'grupos-cada-dias': ['vigilancia.gruposActualesCadaDias', 14],
};

function numero(nombre, defecto) {
  const [ruta, base] = opcionesNumericas[nombre] ?? [null, defecto];
  const valor = Number(argumento(nombre, ruta ? valorConfig(ruta, base) : defecto));
  if (!Number.isFinite(valor)) throw new Error(`--${nombre} debe ser un número`);
  return valor;
}

// El día civil de Madrid vive en la librería (lo comparten el cupo diario, el supervisor y la flota).
function fechaLocal() {
  return diaDeMadrid();
}

function horaMadrid() {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false,
  }).format(new Date()));
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

class PausaOperativa extends Error {
  constructor(message) {
    super(message);
    this.operativa = true;
  }
}

class PendientePublicacion extends Error {
  constructor(message, dias = 7) {
    super(message);
    this.pendientePublicacion = true;
    this.dias = dias;
  }
}

class Ritmo {
  constructor(db) {
    this.db = db;
    this.minimo = numero('intervalo-min', 180) * 1_000;
    this.maximo = numero('intervalo-max', 300) * 1_000;
    this.maxDiario = numero('max-diario', 20);
    this.desdeHora = numero('desde-hora', 8);
    this.hastaHora = numero('hasta-hora', 22);
    if (this.minimo < 4_000 || this.maximo < this.minimo) {
      throw new Error('El intervalo debe ser como mínimo 4 s y el máximo no puede ser menor.');
    }
    if (this.maxDiario < 1 || this.maxDiario > 200_000) {
      throw new Error('El máximo diario debe estar entre 1 y 200000.');
    }
  }

  async antes() {
    const hora = horaMadrid();
    if (hora < this.desdeHora || hora >= this.hastaHora) {
      throw new PausaOperativa(`fuera de horario (${this.desdeHora}:00—${this.hastaHora}:00 Europe/Madrid)`);
    }
    const usadas = peticionesHoy(this.db, fechaLocal());
    if (usadas >= this.maxDiario) {
      throw new PausaOperativa(`presupuesto diario agotado (${usadas}/${this.maxDiario})`);
    }
    const ultima = ultimaPeticion(this.db);
    if (!ultima) return;
    const jitter = Math.floor(Math.random() * (this.maximo - this.minimo + 1));
    const espera = Math.max(0, new Date(ultima.iniciada_en).getTime() + this.minimo + jitter - Date.now());
    if (espera > 0) {
      console.log(`  … pausa respetuosa de ${Math.ceil(espera / 1_000)} s`);
      await dormir(espera);
    }
  }
}

function opcionesChrome() {
  const urlBot = process.env.BOT_URL ?? valorConfig('identidad.urlProyecto', '');
  const contacto = process.env.BOT_CONTACTO ?? valorConfig('identidad.contacto', '');
  // El CONTACTO es la identidad mínima y honesta (la federación puede escribir para que
  // pare). La URL del proyecto es opcional: si no hay, se identifica solo con el contacto.
  if (!contacto) {
    throw new Error('Falta el contacto real (identidad.contacto) en recolector.config.json.');
  }
  const identidad = urlBot ? `FacylfBot/1.0 (+${urlBot}; ${contacto})` : `FacylfBot/1.0 (contacto: ${contacto})`;
  const perfil = join(CARPETA, 'perfil-chrome');
  const op = new chrome.Options();
  /*
   * ── SIN PANTALLA CUANDO NO HAY PANTALLA ──────────────────────────────────────────────────────────────
   *
   * En Windows el navegador se abre «de verdad» pero fuera de la vista (ventana en −32000,−32000): así el
   * portal no ve nada raro y el usuario no ve nada en absoluto. En un contenedor Linux no hay servidor
   * gráfico, así que Chrome tiene que ir en modo sin cabeza; y dentro de Docker hacen falta `--no-sandbox`
   * (el contenedor ya está aislado) y `--disable-dev-shm-usage` (el `/dev/shm` de Docker son 64 MB por
   * defecto y Chrome se queda sin memoria compartida a la tercera página).
   *
   * Se activa con `FACYLF_CHROME_HEADLESS=1`, que es lo que pone el compose. En el PC no se pone: allí la
   * ventana fuera de la vista funciona y está probada.
   */
  /*
   * ── LAS BANDERAS VIVEN EN `lib/banderas-chrome.mjs`, CON SU MOTIVO Y SU PRUEBA ───────────────────────
   *
   * Ahí está cada grupo y por qué está: el aislamiento de sitios apagado (medido el 19/09/2026: sin él cada
   * dominio acababa en su propio renderer y un navegador llegaba a 36 renderers y 3.279 MB), el techo del
   * montón de JavaScript de V8 y los servicios auxiliares que este proyecto no usa (medido el 21/09/2026:
   * los 2 renderers se llevaban 308 MB de los 627 MB de una plaza). Tenerlas una sola vez evita que las dos
   * listas —ésta y la de Cataluña— se separen, y permite probarlas sin abrir un navegador.
   *
   * Aquí sólo queda lo que depende de DÓNDE corre: en el PC la ventana se abre fuera de la vista (el portal
   * no ve nada raro y el usuario no ve nada); en un contenedor Linux no hay servidor gráfico y Chrome tiene
   * que ir sin cabeza.
   */
  op.addArguments(...banderasDeChrome({
    variante: 'pnfg',
    perfil,
    identidad,
    headless: process.env.FACYLF_CHROME_HEADLESS === '1',
  }));
  op.setUserPreferences({
    'download.default_directory': CARPETA,
    'download.prompt_for_download': false,
  });
  return op;
}

function compruebaPermiso() {
  // Uso personal y NO comercial: las reglas no exigen permiso (solo para uso
  // público/comercial). Se mantiene el ritmo respetuoso (configuración) y la identidad.
  if (process.env.RFCYLF_PERMISO === 'SI') return;
  const concedido = valorConfig('permiso.concedido', false) === true;
  const fecha = String(valorConfig('permiso.fecha', '')).trim();
  const referencia = String(valorConfig('permiso.referencia', '')).trim();
  if (!concedido || !fecha || !referencia) {
    const minimo = Number(valorConfig('ritmo.intervaloMinSeg', 180));
    const maximo = Number(valorConfig('ritmo.intervaloMaxSeg', 300));
    console.warn(`ℹ️  Proyecto personal/no comercial: ritmo configurado de ${minimo}-${maximo} s entre peticiones.`);
  }
}

function permiteActasAdultas() {
  return valorConfig('alcance.actasAdultas', false) === true;
}

function permiteActasMenores() {
  return valorConfig('alcance.actasMenores', false) === true;
}

// FASES de la recolección. Lo importante: primero se completa TODO el descubrimiento
// (temporadas, competiciones, grupos, índices de jornadas, calendarios y clasificaciones) y sólo
// después se pasa a las JORNADAS y las ACTAS. Así, cuando arranque la fase de datos, ya se conoce
// la estructura completa y se puede estimar con precisión cuántas actas quedan.
// Los códigos de grupo son inventario: sin ellos una competición no está descubierta. Por eso
// `grupos` tiene un carril global anterior a la ingesta masiva. Dentro de ese carril se conserva
// el orden por importancia y temporada; al cerrarlo vuelve a mandar la prioridad deportiva.
const CARRIL_DESCUBRIMIENTO = -1_000_000_000;
const CARRIL_CATALOGO = -2_000_000_000;
const FASES = {
  catalogo_temporada: { fase: 1, sub: 0 },
  grupos: { fase: 1, sub: 0 },
  muestra_competicion: { fase: 1, sub: 0 },
  indice_jornadas: { fase: 1, sub: 1 },
  muestra_jornadas: { fase: 1, sub: 1 },
  calendario: { fase: 1, sub: 2 },
  muestra_calendario: { fase: 1, sub: 2 },
  clasificacion: { fase: 1, sub: 3 },
  jornada: { fase: 2, sub: 0 },
  acta: { fase: 2, sub: 1 },
};

function prioridadDesdeNombres(tipo, temporada, comp, nombreGrupo, defecto = 120) {
  const etapa = FASES[tipo];
  if (!etapa) return defecto;
  const global = tipo === 'catalogo_temporada';
  const base = global ? 0 : basePrioridadCompeticion(comp, nombreGrupo);
  const codigoTemporada = Number(temporada);
  const antiguedad = Number.isFinite(codigoTemporada) ? Math.max(0, 100 - codigoTemporada) : 100;
  const orden = base * 1_000_000 + antiguedad * 10_000 + etapa.fase * 1_000 + etapa.sub * 100;
  if (tipo === 'catalogo_temporada') return CARRIL_CATALOGO + orden;
  return tipo === 'grupos' ? CARRIL_DESCUBRIMIENTO + orden : orden;
}

function prioridadPlaneada(db, tipo, temporada, competicion, grupo, defecto = 120) {
  const comp = tipo === 'catalogo_temporada' ? '' : (db.prepare(
    'select nombre from competiciones where temporada=? and codigo=?'
  ).get(temporada, competicion)?.nombre ?? '');
  const nombreGrupo = tipo === 'catalogo_temporada' ? '' : (db.prepare(
    'select nombre from grupos where temporada=? and competicion=? and codigo=?'
  ).get(temporada, competicion, grupo)?.nombre ?? '');
  return prioridadDesdeNombres(tipo, temporada, comp, nombreGrupo, defecto);
}

function reprioritizaPlan(db) {
  // Una sola lectura con JOIN: antes se hacían dos SELECT por cada uno de los decenas de miles de
  // trabajos. El cálculo es local, pero ese patrón retrasaba varios minutos la vuelta a la ingesta.
  const filas = db.prepare(`select t.clave,t.tipo,t.temporada,t.prioridad,
    coalesce(c.nombre,'') competicionNombre,coalesce(g.nombre,'') grupoNombre
    from trabajos t
    left join competiciones c on c.temporada=t.temporada and c.codigo=t.competicion
    left join grupos g on g.temporada=t.temporada and g.competicion=t.competicion and g.codigo=t.grupo
    where t.estado in ('pendiente','bloqueado','en_curso')`).all();
  let cambiados = 0;
  const actualiza = db.prepare('update trabajos set prioridad=? where clave=?');
  enTransaccion(db, () => {
    for (const f of filas) {
      const nuevo = prioridadDesdeNombres(f.tipo, f.temporada, f.competicionNombre,
        f.grupoNombre, f.prioridad);
      if (nuevo !== f.prioridad) {
        actualiza.run(nuevo, f.clave);
        cambiados++;
      }
    }
  });
  if (cambiados) console.log(`  · ${cambiados} trabajos ordenados: descubrimiento de grupos → competiciones prioritarias recientes → resto.`);
}

/**
 * ── REPRIORIZAR SÓLO SI HACE FALTA (medido el 23/09/2026) ────────────────────────────────────────────────
 *
 * `reprioritizaPlan` recorre TODOS los trabajos pendientes con dos JOIN y recalcula la prioridad de cada uno. Se
 * llama en CADA arranque de sesión, y medido con `mide-arranque-sesion.mjs`: desde «Arrancando o reanudando la
 * ingesta» hasta la PRIMERA petición pasan **3,6 minutos de mediana en Andalucía** (hasta 7,3) y 1,9 en Galicia.
 * Con 66.038 trabajos pendientes, esa lectura sola ya tarda minutos.
 *
 * Y las prioridades son una función PURA del catálogo (el nombre de la competición, el del grupo y la
 * temporada): **si el catálogo no ha cambiado, no pueden haber cambiado**. Además, cuando se encola un trabajo
 * nuevo, `encola` ya le pone la prioridad buena. Así que rehacerlo en cada arranque es pagar minutos por nada
 * casi siempre.
 *
 * La huella es barata —dos tablas pequeñas— y detecta lo único que puede cambiar las prioridades: que aparezcan
 * competiciones o grupos nuevos. Y se rehace igualmente cada 12 horas, porque un CAMBIO DE NOMBRE sin filas
 * nuevas la huella no lo vería, y esa ventana acota el daño sin volver a pagar el recorrido en cada arranque.
 */
function huellaDelCatalogo(db) {
  const c = db.prepare('select count(*) n, coalesce(max(rowid),0) r from competiciones').get();
  const g = db.prepare('select count(*) n, coalesce(max(rowid),0) r from grupos').get();
  return `${c.n}:${c.r}|${g.n}:${g.r}`;
}

const HORAS_ENTRE_REPRIORIZADOS = Number(process.env.FACYLF_HORAS_REPRIORIZAR ?? 12);

function reprioritizaPlanSiHaceFalta(db) {
  const huella = huellaDelCatalogo(db);
  const guardada = leeMetadato(db, 'plan_huella');
  const cuando = Number(leeMetadato(db, 'plan_huella_en') ?? 0);
  const horas = cuando > 0 ? (Date.now() - cuando) / 3_600_000 : Infinity;

  if (guardada === huella && horas < HORAS_ENTRE_REPRIORIZADOS) {
    console.log(`  · El catálogo no ha cambiado (${horas.toFixed(1)} h desde el último repaso): `
      + 'no se reprioriza el plan, y así no se recorre entero en cada arranque.');
    return;
  }

  reprioritizaPlan(db);
  guardaMetadato(db, 'plan_huella', huella);
  guardaMetadato(db, 'plan_huella_en', String(Date.now()));
}

async function htmlActual(driver) {
  return String(await driver.executeScript('return document.documentElement.outerHTML'));
}

/*
 * El bloqueo de publicidad y rastreadores vive en `lib/bloqueo-terceros.mjs`: lo usan este recolector y el de
 * Cataluña, y la lista de dominios tiene que ser la misma para los dos.
 */
async function aceptaAvisoCookie(driver) {  const patron = /^(aceptar todo|aceptar|accept all|accept|de acuerdo|d'acord|onartu|permitir todas)$/i;
  let botones = [];
  try { botones = await driver.findElements(By.css('a,button,input[type=submit],[role=button]')); } catch { return false; }
  for (const boton of botones.slice(0, 80)) {
    let etiqueta = '';
    try { etiqueta = ((await boton.getText()) || '').trim(); } catch { continue; }
    if (!etiqueta) {
      try { etiqueta = ((await boton.getAttribute('value')) || '').trim(); } catch { /* sin etiqueta */ }
    }
    if (!patron.test(etiqueta)) continue;
    try {
      await boton.click();
      await dormir(1_200);
      return true;
    } catch { /* se prueba el siguiente control */ }
  }
  return false;
}

/*
 * ── MEDICIÓN DEL CICLO POR FASES (opt-in) ───────────────────────────────────────────────────────────────
 *
 * El traspaso del 22/09/2026 dejaba ~16 s por petición sin explicar y proponía buscarlos aquí: marcar por
 * fases dónde va el tiempo de cada trabajo y volcar un resumen. Esto lo hace.
 *
 * ── POR QUÉ NO SE PUEDE SABER SIN ESTO ──────────────────────────────────────────────────────────────────
 *
 * Las dos cosas que sí se saben están medidas y NO explican el hueco: la petición en sí cuesta 3-4 s
 * (`peticiones.duracion_ms`) y el análisis del acta 20 ms (`mide-analisis-acta.mjs`). Entre una petición y la
 * siguiente quedan ~9 s que la cola no registra: porque **una cosa es lo que dura la petición y otra lo que
 * tarda el worker en estar listo para la siguiente**, y eso sólo se ve marcando el ciclo entero.
 *
 * Las fases están elegidas para que cada una se pueda atacar de una forma distinta:
 *
 *   · `cortesia`          — la pausa de `ritmo.antes()`. Si manda, se toca el ritmo (apartado B).
 *   · `red_render`        — `driver.get` + espera + `outerHTML`. Si manda, el enemigo es el portal o Chrome.
 *   · `analisis_guardado` — validar, analizar, comprimir y escribir el HTML, y las escrituras en SQLite.
 *   · `consulta`          — `siguienteTrabajo`. Medido aparte: 76 ms, no puede ser el culpable.
 *   · `cierre`            — LO QUE NADIE HABÍA MIRADO: lo que queda entre acabar un trabajo y empezar el
 *                           siguiente. Aquí caen `marcaTrabajo`, el **reciclado de Chrome** (cerrar y abrir el
 *                           navegador cuesta 15-25 s, medido el 17/09/2026) y el mantenimiento local. Un
 *                           reciclado cada 40 trabajos, si de verdad cuesta 20 s, son 0,5 s por trabajo; si
 *                           cuesta más, aquí se verá.
 *
 * ── CÓMO SE ACTIVA Y QUÉ GARANTIZA ──────────────────────────────────────────────────────────────────────
 *
 * Con `FACYLF_PERF=1` en el entorno del contenedor. **Sin esa variable no se ejecuta ni una línea**: las
 * funciones salen en la primera comprobación, así que las 18 federaciones que no se están midiendo siguen
 * igual. La medición escribe en `descargas-<fed>/recolector-local/perf-fases.jsonl`, una línea por trabajo.
 *
 * Y NUNCA puede impedir recolectar: si no se puede escribir el fichero, el error se traga y el worker sigue.
 * Un instrumento que tumba lo que mide no sirve de nada.
 */
const PERF = process.env.FACYLF_PERF ? {
  ruta: join(CARPETA, 'perf-fases.jsonl'),
  fases: {},
  anterior: process.hrtime.bigint(),
  trabajo: null,
  pendientesDeVolcar: [],
  trabajos: 0,
  trabajoIniciadoEn: null,
} : null;

/** Cierra la fase anterior y abre la que empieza ahora. */
function perfMarca(fase) {
  if (!PERF) return;
  const ahora = process.hrtime.bigint();
  const ms = Number(ahora - PERF.anterior) / 1e6;
  PERF.anterior = ahora;
  if (fase) PERF.fases[fase] = (PERF.fases[fase] ?? 0) + ms;
}

/** Empieza a medir un trabajo. No reinicia el reloj: la marca `cierre` del bucle mide la cola del anterior. */
function perfEmpieza(clave) {
  if (!PERF) return;
  PERF.trabajo = clave;
  PERF.fases = {};
  PERF.trabajoIniciadoEn = Date.now();
}

/** Cierra el trabajo en curso y lo apunta para volcar. */
function perfCierra(resultado) {
  if (!PERF) return;
  perfMarca('cola_del_bucle');
  PERF.trabajos += 1;
  const fases = PERF.fases;
  const total = Object.values(fases).reduce((a, b) => a + b, 0);
  PERF.pendientesDeVolcar.push({
    t: new Date().toISOString(),
    trabajo: PERF.trabajo,
    resultado,
    totalMs: Math.round(total),
    ...Object.fromEntries(Object.entries(fases).map(([k, v]) => [k, Math.round(v)])),
  });
  PERF.fases = {};
  if (PERF.pendientesDeVolcar.length >= 10) perfVuelca();
}

/** Escribe lo acumulado. Cada 10 trabajos y al terminar la sesión, para no perder la medición si se corta. */
function perfVuelca() {
  if (!PERF || PERF.pendientesDeVolcar.length === 0) return;
  try {
    mkdirSync(CARPETA, { recursive: true });
    appendFileSync(PERF.ruta, PERF.pendientesDeVolcar.map((f) => JSON.stringify(f)).join('\n') + '\n');
  } catch { /* la medición nunca puede impedir recolectar */ }
  PERF.pendientesDeVolcar = [];
}

async function navega(driver, ritmo, db, trabajo, url) {
  perfMarca('preparacion');
  await ritmo.antes();
  perfMarca('cortesia');
  const inicio = Date.now();
  const iniciadaEn = new Date(inicio).toISOString();
  try {
    await driver.get(url);
    await driver.wait(until.elementLocated(By.css('body')), 20_000);
    let html = await htmlActual(driver);
    perfMarca('red_render');
    const sinCookie = html.length < 3_000 && /no se ha aceptado el cookie/i.test(html);
    const conCartel = /cmpbox|consentimiento para cookies|aceptar todo/i.test(html);
    /*
     * ── EL AVISO DE COOKIES NO SIEMPRE ES UN MURO (medido el 20/09/2026) ─────────────────────────────────
     *
     * El aviso de consentimiento viaja DENTRO de la página: los portales PNFG sirven el acta o la jornada
     * entera (200-230 KB en Andalucía, 111-115 KB en Murcia) con el cartel de cookies dentro del HTML. Aquello
     * no bloquea nada: el contenido está ahí y el intérprete lo lee sin problema.
     *
     * Pero el código trataba cualquier cartel como un muro: registraba `requiere_cookie`, intentaba aceptarlo y
     * **volvía a pedir la página completa**. Medido en la cola de Andalucía: cada navegación producía DOS filas
     * —`requiere_cookie` (2-7 s) y luego `ok` (12-58 s) de la MISMA URL—, 44 y 44 en media hora. Es decir, la
     * federación pagaba el doble de peticiones y el doble de tiempo por el mismo dato, y la mitad del registro
     * eran avisos que parecían fallos sin serlo.
     *
     * La distinción es el TAMAÑO: un muro de verdad devuelve una página vacía o de cortesía (Melilla: 117 bytes;
     * el aviso de «no se ha aceptado el cookie»: menos de 3 KB). Una página de decenas de KB ya trae el
     * contenido. Con esto, el caso de Melilla se sigue resolviendo igual que antes y los demás no pagan dos
     * veces por lo mismo.
     */
    const esMuro = sinCookie || (conCartel && html.length < 20_000);
    if (esMuro) {
      registraPeticion(db, {
        trabajo: trabajo.clave, url, iniciadaEn, duracionMs: Date.now() - inicio,
        resultado: 'requiere_cookie', detalle: `${html.length} bytes; se inicia la sesión anónima del portal`,
      });
      // Algunos PNFG (Melilla) responden con sólo 117 bytes en una URL interna. La portada sí
      // presenta el aviso que ve cualquier visitante; se acepta una vez y la cookie queda en el
      // perfil propio de esta federación. No es autenticación ni se comparte entre workers.
      if (sinCookie) {
        perfMarca('preparacion');
        await ritmo.antes();
        perfMarca('cortesia');
        await driver.get(new URL('/pnfg/', url).href);
        await driver.wait(until.elementLocated(By.css('body')), 20_000);
        perfMarca('red_render');
      }
      const aceptada = await aceptaAvisoCookie(driver);
      if (aceptada) {
        perfMarca('preparacion');
        await ritmo.antes();
        perfMarca('cortesia');
        await driver.get(url);
        await driver.wait(until.elementLocated(By.css('body')), 20_000);
        html = await htmlActual(driver);
        perfMarca('red_render');
      }
    }
    // Nova crea primero JSESSIONID y devuelve a la portada. En Melilla esa primera respuesta ya
    // es una portada completa (no el aviso corto), por lo que no contiene ninguna de las marcas
    // anteriores. Si pedimos una ruta NPcd y acabamos fuera de ella, repetimos UNA vez: la sesión
    // anónima ya existe y el segundo acceso entrega el selector solicitado.
    let rutaActual = '';
    try { rutaActual = new URL(await driver.getCurrentUrl()).pathname; } catch { /* URL no legible */ }
    const rutaEsperada = new URL(url).pathname;
    if (/\/NPcd\//i.test(rutaEsperada) && !/\/NPcd\//i.test(rutaActual)) {
      registraPeticion(db, {
        trabajo: trabajo.clave, url, iniciadaEn, duracionMs: Date.now() - inicio,
        resultado: 'inicio_sesion', detalle: `redirección inicial a ${rutaActual || 'portada'}; se repite con la sesión anónima`,
      });
      perfMarca('preparacion');
      await ritmo.antes();
      perfMarca('cortesia');
      await driver.get(url);
      await driver.wait(until.elementLocated(By.css('body')), 20_000);
      html = await htmlActual(driver);
      perfMarca('red_render');
    }
    registraPeticion(db, {
      trabajo: trabajo.clave, url, iniciadaEn, duracionMs: Date.now() - inicio,
      resultado: 'ok', detalle: `${html.length} bytes`,
    });
    return html;
  } catch (error) {
    registraPeticion(db, {
      trabajo: trabajo.clave, url, iniciadaEn, duracionMs: Date.now() - inicio,
      resultado: 'error', detalle: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function carpetaDe(trabajo) {
  return rutaGrupo(CARPETA, trabajo.temporada, trabajo.competicion, trabajo.grupo);
}

function guardaJson(ruta, datos, db, tipo) {
  return guardaAtomico(ruta, JSON.stringify(datos, null, 2), db, tipo);
}

function temporadaActual(db) {
  return db.prepare(`select codigo from temporadas
    order by cast(codigo as integer) desc limit 1`).get()?.codigo ?? null;
}

/** Devuelve la mañana posterior a una jornada. Así no se consulta una página
 * futura y se deja tiempo para que resultados y actas estén publicados. */
function disponibleTrasJornada(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? ''))) return null;
  const instante = new Date(`${fecha}T00:00:00.000Z`);
  if (Number.isNaN(instante.getTime())) return null;
  // Fechas absurdas de la fuente (se han visto 9999-01-01 en La Rioja y 2202-02-18 en Ceuta) no se
  // usan para aplazar: aplazarían el trabajo miles de años y esa jornada no se recogería nunca.
  // Si la fecha no es creíble se devuelve null y el trabajo queda disponible ya.
  if (instante.getTime() - Date.now() > 400 * 24 * 60 * 60_000) return null;
  instante.setUTCDate(instante.getUTCDate() + 1);
  instante.setUTCHours(6, 0, 0, 0);
  return instante.toISOString();
}

function aplazaClave(db, clave, siguiente) {
  if (!siguiente) return;
  db.prepare(`update trabajos set estado='pendiente',siguiente_intento=?,ultimo_error=null,
    actualizado_en=? where clave=? and estado!='cancelado'`)
    .run(siguiente, new Date().toISOString(), clave);
}

/** Corrige también la cola ya creada antes de introducir el aplazamiento. Los
 * HTML vacíos que se hubieran guardado antes de jugarse se volverán a consultar
 * después de la fecha real, sin afectar a temporadas terminadas. */
function aplazaFuturoTemporadaActual(db) {
  const actual = temporadaActual(db);
  if (!actual) return { jornadas: 0, clasificaciones: 0 };
  const hoy = fechaLocal();
  let jornadasAplazadas = 0;
  let clasificacionesAplazadas = 0;
  enTransaccion(db, () => {
    const futuras = db.prepare(`select temporada,competicion,grupo,numero,fecha from jornadas
      where temporada=? and fecha>?`).all(actual, hoy);
    for (const jornada of futuras) {
      const datos = {
        temporada: jornada.temporada,
        competicion: jornada.competicion,
        grupo: jornada.grupo,
        jornada: jornada.numero,
      };
      const clave = encola(db, 'jornada', datos,
        prioridadPlaneada(db, 'jornada', datos.temporada, datos.competicion, datos.grupo, 50),
        urlJornada(datos.temporada, datos.competicion, datos.grupo, datos.jornada));
      aplazaClave(db, clave, disponibleTrasJornada(jornada.fecha));
      jornadasAplazadas++;
    }

    const grupos = db.prepare(`select competicion,grupo,min(fecha) primera_fecha from jornadas
      where temporada=? and fecha is not null group by competicion,grupo
      having min(fecha)>?`).all(actual, hoy);
    for (const grupo of grupos) {
      const datos = { temporada: actual, competicion: grupo.competicion, grupo: grupo.grupo };
      const ultima = db.prepare(`select max(numero) numero from jornadas
        where temporada=? and competicion=? and grupo=?`)
        .get(actual, grupo.competicion, grupo.grupo)?.numero;
      const clave = encola(db, 'clasificacion', datos,
        prioridadPlaneada(db, 'clasificacion', actual, grupo.competicion, grupo.grupo, 40),
        urlClasificacion(actual, grupo.competicion, grupo.grupo, ultima));
      aplazaClave(db, clave, disponibleTrasJornada(grupo.primera_fecha));
      clasificacionesAplazadas++;
    }
  });
  return { jornadas: jornadasAplazadas, clasificaciones: clasificacionesAplazadas };
}

/**
 * Repasa la jornada recién jugada sin convertir el fin de semana en un barrido completo.
 *
 * La primera visita programada puede adelantarse a la publicación del acta o de un resultado
 * aplazado. Por eso se reabren únicamente las jornadas de los cuatro días anteriores que llevan
 * al menos 18 horas sin comprobarse. La jornada vuelve a descubrir sus códigos de acta, pero
 * `encola` conserva como hechos los que ya están descargados: no se repite ninguna ficha completa.
 */
function preparaRepasoJornadasRecientes(db) {
  const actual = temporadaActual(db);
  if (!actual) return { jornadas: 0, clasificaciones: 0 };
  const hoy = fechaLocal();
  const desde = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' })
    .format(new Date(Date.now() - 4 * 24 * 60 * 60_000));
  const umbral = new Date(Date.now() - 18 * 60 * 60_000).toISOString();
  const grupos = new Map();
  let jornadas = 0;
  let clasificaciones = 0;
  enTransaccion(db, () => {
    for (const j of db.prepare(`select temporada,competicion,grupo,numero,fecha,comprobada_en
      from jornadas where temporada=? and fecha>=? and fecha<?
      and (comprobada_en is null or comprobada_en<?)`).all(actual, desde, hoy, umbral)) {
      const datos = { temporada: j.temporada, competicion: j.competicion, grupo: j.grupo, jornada: j.numero };
      const clave = claveTrabajo('jornada', datos);
      const anterior = db.prepare('select estado from trabajos where clave=?').get(clave);
      encola(db, 'jornada', datos, 2, urlJornada(j.temporada, j.competicion, j.grupo, j.numero));
      if (anterior && ['hecho', 'cancelado'].includes(anterior.estado)) {
        reactiva(db, clave);
        jornadas += 1;
        grupos.set(`${j.competicion}|${j.grupo}`, { competicion: j.competicion, grupo: j.grupo });
      }
    }
    for (const g of grupos.values()) {
      const datos = { temporada: actual, competicion: g.competicion, grupo: g.grupo };
      const clave = claveTrabajo('clasificacion', datos);
      const anterior = db.prepare('select estado,actualizado_en,url from trabajos where clave=?').get(clave);
      encola(db, 'clasificacion', datos, 3, anterior?.url ?? null);
      if (anterior?.estado === 'hecho' && (!anterior.actualizado_en || anterior.actualizado_en < umbral)) {
        reactiva(db, clave);
        clasificaciones += 1;
      }
    }
  });
  return { jornadas, clasificaciones };
}

function vencido(fecha, dias) {
  return !fecha || new Date(fecha).getTime() <= Date.now() - dias * 24 * 60 * 60_000;
}

function registraTemporadasDisponibles(db, temporadas) {
  const desde = numero('desde', 2015);
  enTransaccion(db, () => {
    for (const temporada of temporadas) {
      const inicio = Number(temporada.nombre.slice(0, 4));
      if (inicio < desde) continue;
      db.prepare(`insert into temporadas(codigo,etiqueta,origen)
        values(?,?,'web') on conflict(codigo) do update set etiqueta=excluded.etiqueta`)
        .run(temporada.codigo, `${inicio}-${String(inicio + 1).slice(-2)}`);
      encola(db, 'catalogo_temporada', { temporada: temporada.codigo }, 1, URL_RESULTADOS);
    }
  });
}

function preparaVigilanciaActual(db) {
  const actual = temporadaActual(db);
  if (!actual) return;
  const cadaCatalogo = numero('catalogo-cada-dias', 7);
  const cadaGrupos = numero('grupos-cada-dias', 14);
  const temporada = db.prepare('select comprobada_en from temporadas where codigo=?').get(actual);
  if (vencido(temporada?.comprobada_en, cadaCatalogo)) {
    const clave = encola(db, 'catalogo_temporada', { temporada: actual }, 1, URL_RESULTADOS);
    reactiva(db, clave);
  }
  for (const competicion of db.prepare(`select codigo,grupos_comprobados_en from competiciones
    where temporada=? and origen!='ausente_web'`).all(actual)) {
    if (!vencido(competicion.grupos_comprobados_en, cadaGrupos)) continue;
    const clave = encola(db, 'grupos', { temporada: actual, competicion: competicion.codigo }, 1,
      urlGrupos(actual, competicion.codigo));
    reactiva(db, clave);
  }
}

function exportaInventario(db) {
  const temporadas = [];
  for (const temporada of db.prepare(`select * from temporadas
    order by cast(codigo as integer)`).all()) {
    const competiciones = [];
    for (const competicion of db.prepare(`select * from competiciones where temporada=?
      and origen!='ausente_web' order by nombre,codigo`).all(temporada.codigo)) {
      const grupos = db.prepare(`select codigo,nombre,estado,jornadas,comprobado_en,
        jornadas_comprobadas_en from grupos where temporada=? and competicion=?
        and estado!='ausente_web' order by nombre,codigo`).all(temporada.codigo, competicion.codigo);
      competiciones.push({
        codigo: competicion.codigo,
        nombre: competicion.nombre,
        origen: competicion.origen,
        comprobadaEn: competicion.comprobada_en,
        gruposComprobadosEn: competicion.grupos_comprobados_en,
        grupos,
      });
    }
    temporadas.push({
      codigo: temporada.codigo,
      etiqueta: temporada.etiqueta,
      comprobadaEn: temporada.comprobada_en,
      competiciones,
    });
  }
  const cobertura = {
    temporadas: temporadas.length,
    temporadasVerificadas: temporadas.filter((t) => t.comprobadaEn).length,
    competiciones: temporadas.reduce((n, t) => n + t.competiciones.length, 0),
    competicionesConGruposVerificados: temporadas.reduce((n, t) => n +
      t.competiciones.filter((c) => c.gruposComprobadosEn).length, 0),
    grupos: temporadas.reduce((n, t) => n +
      t.competiciones.reduce((m, c) => m + c.grupos.length, 0), 0),
    gruposVerificados: temporadas.reduce((n, t) => n +
      t.competiciones.reduce((m, c) => m + c.grupos.filter((g) => g.comprobado_en).length, 0), 0),
    gruposConJornadasVerificadas: temporadas.reduce((n, t) => n +
      t.competiciones.reduce((m, c) => m + c.grupos.filter((g) => g.jornadas_comprobadas_en).length, 0), 0),
  };
  cobertura.trabajosPendientes = Number(db.prepare(`select count(*) n from trabajos
    where estado in ('pendiente','bloqueado','en_curso')`).get().n);
  cobertura.trabajosBloqueados = Number(db.prepare(`select count(*) n from trabajos
    where estado='bloqueado'`).get().n);
  cobertura.calendariosGuardados = Number(db.prepare(`select count(*) n from trabajos
    where tipo='calendario' and estado='hecho'`).get().n);
  cobertura.jornadasDescubiertas = Number(db.prepare('select count(*) n from jornadas').get().n);
  cobertura.jornadasGuardadas = Number(db.prepare(`select count(*) n from jornadas
    where archivo is not null`).get().n);
  cobertura.inventarioCodigosCompleto =
    cobertura.temporadas === cobertura.temporadasVerificadas &&
    cobertura.competiciones === cobertura.competicionesConGruposVerificados &&
    cobertura.grupos === cobertura.gruposConJornadasVerificadas;
  cobertura.calendariosYJornadasCompletos = cobertura.inventarioCodigosCompleto &&
    cobertura.calendariosGuardados >= cobertura.gruposVerificados &&
    cobertura.jornadasDescubiertas === cobertura.jornadasGuardadas;
  const salida = { generadoEn: new Date().toISOString(), cobertura, temporadas };
  guardaJson(join(CARPETA, 'inventario-codigos.json'), salida, db, 'inventario');
  return salida;
}

function generaPlanMuestras(db) {
  if (!existsSync(CATALOGO_EXISTENTE)) throw new Error(`No existe ${CATALOGO_EXISTENTE}`);
  const catalogo = leeJson(CATALOGO_EXISTENTE);
  const desde = numero('desde', 2015);
  const muestras = [];
  for (const [temporada, competiciones] of Object.entries(catalogo)) {
    const inicio = 2004 + Number(temporada);
    if (inicio < desde) continue;
    for (const competicion of seleccionaMuestrasCompeticion(competiciones, 3)) {
      muestras.push({
        temporada,
        etiquetaTemporada: `${inicio}-${String(inicio + 1).slice(-2)}`,
        competicion: String(competicion.codCompeticion),
        nombre: competicion.nombre,
        urlGrupos: urlGrupos(temporada, String(competicion.codCompeticion)),
        comprobacionPosterior: {
          grupo: 'usar el primer grupo real devuelto por urlGrupos',
          jornada: 'abrir CodJornada=1 y comprobar el desplegable completo',
          calendario: 'abrir NFG_VisCalendario_Vis con temporada, competición y grupo',
        },
      });
    }
  }
  const plan = {
    generadoEn: new Date().toISOString(),
    ejecutado: false,
    motivo: 'Plan preparado sin red; requiere permiso escrito para ejecutarse.',
    muestrasPorTemporada: 3,
    totalMuestras: muestras.length,
    peticionesEstimadas: muestras.length * 3,
    maximoDiario: numero('max-diario', 20),
    muestras,
  };
  enTransaccion(db, () => {
    for (const muestra of muestras) {
      encola(db, 'muestra_competicion', {
        temporada: muestra.temporada,
        competicion: muestra.competicion,
      }, 11, muestra.urlGrupos);
    }
  });
  guardaJson(join(CARPETA, 'plan-muestras.json'), plan, db, 'plan_muestras');
  return plan;
}

function insertaCompeticiones(db, temporada, competiciones) {
  enTransaccion(db, () => {
    const ahora = new Date().toISOString();
    const recibidas = new Set(competiciones.map((c) => c.codigo));
    const anteriores = db.prepare('select codigo from competiciones where temporada=?').all(temporada);
    if (anteriores.length >= 10 && competiciones.length < anteriores.length / 2) {
      throw Object.assign(
        new Error(`catálogo sospechosamente incompleto: ${competiciones.length}/${anteriores.length}`),
        { catalogoIncompleto: true },
      );
    }
    for (const anterior of anteriores) {
      if (recibidas.has(anterior.codigo)) continue;
      db.prepare(`update competiciones set origen='ausente_web',comprobada_en=?
        where temporada=? and codigo=?`).run(ahora, temporada, anterior.codigo);
      db.prepare(`update trabajos set estado='cancelado',actualizado_en=?
        where temporada=? and competicion=? and estado in ('pendiente','bloqueado')`)
        .run(ahora, temporada, anterior.codigo);
    }
    for (const c of competiciones) {
      db.prepare(`insert into competiciones(temporada,codigo,nombre,origen,comprobada_en)
        values(?,?,?,'web',?) on conflict(temporada,codigo) do update set
        nombre=excluded.nombre,origen='web',comprobada_en=excluded.comprobada_en`)
        .run(temporada, c.codigo, c.nombre, ahora);
      const clave = encola(db, 'grupos', { temporada, competicion: c.codigo }, 1,
        urlGrupos(temporada, c.codigo));
      const estado = db.prepare('select estado from trabajos where clave=?').get(clave)?.estado;
      if (estado === 'cancelado') reactiva(db, clave);
    }
  });
}

function insertaGruposYTrabajos(db, trabajo, grupos) {
  const nombreCompeticion = db.prepare('select nombre from competiciones where temporada=? and codigo=?')
    .get(trabajo.temporada, trabajo.competicion)?.nombre ?? '';
  const menores = esCompeticionDeMenores(nombreCompeticion);
  const esActual = trabajo.temporada === temporadaActual(db);
  const cadaGrupos = numero('grupos-cada-dias', 14);
  enTransaccion(db, () => {
    const recibidos = new Set(grupos.map((g) => g.codigo));
    const anteriores = db.prepare(`select codigo,estado,jornadas_comprobadas_en from grupos
      where temporada=? and competicion=?`).all(trabajo.temporada, trabajo.competicion);
    const anterioresPorCodigo = new Map(anteriores.map((g) => [g.codigo, g]));
    for (const anterior of anteriores) {
      if (recibidos.has(anterior.codigo)) continue;
      db.prepare(`update grupos set estado='ausente_web',comprobado_en=?
        where temporada=? and competicion=? and codigo=?`)
        .run(new Date().toISOString(), trabajo.temporada, trabajo.competicion, anterior.codigo);
      db.prepare(`update trabajos set estado='cancelado',actualizado_en=?
        where temporada=? and competicion=? and grupo=? and estado in ('pendiente','bloqueado')`)
        .run(new Date().toISOString(), trabajo.temporada, trabajo.competicion, anterior.codigo);
    }
    for (const grupo of grupos) {
      db.prepare(`insert into grupos(temporada,competicion,codigo,nombre,estado,jornadas,comprobado_en)
        values(?,?,?,?,'presente',?,?) on conflict(temporada,competicion,codigo) do update set
        nombre=excluded.nombre,estado='presente',jornadas=coalesce(excluded.jornadas,grupos.jornadas),
        comprobado_en=excluded.comprobado_en`)
        .run(trabajo.temporada, trabajo.competicion, grupo.codigo, grupo.nombre,
          null, new Date().toISOString());
      const base = { temporada: trabajo.temporada, competicion: trabajo.competicion, grupo: grupo.codigo };
      const claveIndice = encola(db, 'indice_jornadas', { ...base, jornada: 1 },
        prioridadPlaneada(db, 'indice_jornadas', base.temporada, base.competicion, base.grupo, 25),
        urlJornada(base.temporada, base.competicion, base.grupo, 1));
      const anterior = anterioresPorCodigo.get(grupo.codigo);
      if (anterior?.estado === 'ausente_web' ||
          (esActual && vencido(anterior?.jornadas_comprobadas_en, cadaGrupos))) {
        reactiva(db, claveIndice);
      }
      if (menores && !permiteActasMenores()) {
        db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`)
          .run(new Date().toISOString(), 'info', 'privacidad',
            `Las actas de ${trabajo.temporada}/${trabajo.competicion}/${grupo.codigo} no se encolarán: categoría de menores.`);
      }
    }
    db.prepare(`update competiciones set grupos_comprobados_en=?
      where temporada=? and codigo=?`).run(new Date().toISOString(), trabajo.temporada, trabajo.competicion);
  });
}

function registraIndiceJornadas(db, trabajo, jornadas) {
  const base = {
    temporada: trabajo.temporada,
    competicion: trabajo.competicion,
    grupo: trabajo.grupo,
  };
  const esActual = base.temporada === temporadaActual(db);
  const hoy = fechaLocal();
  enTransaccion(db, () => {
    const anteriores = db.prepare(`select jornadas from grupos where temporada=?
      and competicion=? and codigo=?`).get(base.temporada, base.competicion, base.grupo)?.jornadas ?? null;
    db.prepare(`update grupos set jornadas=?,comprobado_en=?,jornadas_comprobadas_en=?
      where temporada=? and competicion=? and codigo=?`)
      .run(jornadas.length, new Date().toISOString(), new Date().toISOString(),
        base.temporada, base.competicion, base.grupo);
    for (const j of jornadas) {
      db.prepare(`insert into jornadas(temporada,competicion,grupo,numero,fecha)
        values(?,?,?,?,?) on conflict(temporada,competicion,grupo,numero) do update set
        fecha=coalesce(excluded.fecha,jornadas.fecha)`)
        .run(base.temporada, base.competicion, base.grupo, j.numero, j.fecha);
      const futura = esActual && j.fecha && j.fecha > hoy;
      if (j.numero !== 1 || futura) {
        const claveJornada = encola(db, 'jornada', { ...base, jornada: j.numero },
          prioridadPlaneada(db, 'jornada', base.temporada, base.competicion, base.grupo, 50),
          urlJornada(base.temporada, base.competicion, base.grupo, j.numero));
        if (futura) aplazaClave(db, claveJornada, disponibleTrasJornada(j.fecha));
      }
    }
    const claveCalendario = encola(db, 'calendario', base,
      prioridadPlaneada(db, 'calendario', base.temporada, base.competicion, base.grupo, 30),
      urlCalendario(base.temporada, base.competicion, base.grupo));
    const claveClasificacion = encola(db, 'clasificacion', base,
      prioridadPlaneada(db, 'clasificacion', base.temporada, base.competicion, base.grupo, 40),
      urlClasificacion(base.temporada, base.competicion, base.grupo, jornadas.at(-1)?.numero));
    if (anteriores !== null && anteriores !== jornadas.length) {
      reactiva(db, claveCalendario);
      reactiva(db, claveClasificacion);
    }
    const primeraFecha = jornadas.map((j) => j.fecha).filter(Boolean).sort()[0];
    if (esActual && primeraFecha > hoy) {
      aplazaClave(db, claveClasificacion, disponibleTrasJornada(primeraFecha));
    }
  });
}

function registraJornada(db, trabajo, html, ruta, hash) {
  const basicos = extraePartidos(html);
  const detallados = parseaJornada(html, trabajo.jornada);
  const claveNombre = (local, visitante) => `${local.toLocaleLowerCase('es')}|${visitante.toLocaleLowerCase('es')}`;
  const cantidadPorActa = new Map();
  for (const partido of detallados.filter((p) => p.codActa)) {
    cantidadPorActa.set(partido.codActa, (cantidadPorActa.get(partido.codActa) ?? 0) + 1);
  }
  const porActa = new Map(detallados
    .filter((p) => p.codActa && cantidadPorActa.get(p.codActa) === 1)
    .map((p) => [p.codActa, p]));
  const porEquipos = new Map(detallados.map((p) => [claveNombre(p.local, p.visitante), p]));
  const candidatos = basicos.map((p) => {
    // Los equipos son la señal primaria. CodActa sólo es un fallback si es único.
    //
    // Tercer caso: cuando el parser detallado no entiende la maqueta (portales con el tema nova,
    // como Euskadi), la propia extracción básica ya trae el marcador, la fecha, la hora y el campo.
    // En ese caso el partido es su propio detalle, en vez de quedarse sin marcador.
    const detalle = porEquipos.get(claveNombre(p.local, p.visitante)) ??
      (p.codActa ? porActa.get(p.codActa) : null) ??
      (p.golesLocal != null || p.golesVisitante != null ? p : null) ?? null;
    const codigoBruto = p.codActa ?? detalle?.codActa ?? null;
    // Algunos portales nova publican enlaces como CodActa=-2307. Abren una plantilla vacía,
    // sin equipos ni árbitro: son identificadores internos de partido, no actas públicas.
    const codActa = /^\d+$/.test(String(codigoBruto ?? '')) && Number(codigoBruto) > 0
      ? String(codigoBruto) : null;
    return { ...p, codActa, detalle };
  });
  const comprobadaEn = new Date().toISOString();
  const partidos = [];
  const descansos = [];
  for (const [ordenFuente, p] of candidatos.entries()) {
    const maqueta = PERFIL_NOMBRE === 'euskadi' ? 'nova-widget' : 'pnfg-clasica';
    const esDescanso = esPalabraDeDescanso(p.local, maqueta) ||
      esPalabraDeDescanso(p.visitante, maqueta);
    if (!esDescanso) {
      partidos.push(p);
      continue;
    }
    const entrada = {
      federacion: PERFIL_NOMBRE,
      temporada: String(trabajo.temporada), competicion: String(trabajo.competicion),
      grupo: String(trabajo.grupo), jornada: Number(trabajo.jornada), orden: ordenFuente,
      codigo_acta: p.codActa, literal_local: p.local, literal_visitante: p.visitante,
      archivo_html: ruta, huella_html: hash, enlaceDeActa: Boolean(p.codActa),
      parejaDelActa: null, huella_acta: null, comprobada_en: comprobadaEn,
    };
    const primera = decideFilaDeDescanso(entrada);
    descansos.push({ p, entrada, resultado: primera });
  }
  const nombreCompeticion = db.prepare('select nombre from competiciones where temporada=? and codigo=?')
    .get(trabajo.temporada, trabajo.competicion)?.nombre ?? '';
  const menores = esCompeticionDeMenores(nombreCompeticion);
  const actasPermitidas = menores ? permiteActasMenores() : permiteActasAdultas();
  const fecha = db.prepare(`select fecha from jornadas where temporada=? and competicion=? and grupo=? and numero=?`)
    .get(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada)?.fecha ?? null;
  enTransaccion(db, () => {
    db.prepare(`insert into jornadas(temporada,competicion,grupo,numero,fecha,archivo,hash,comprobada_en)
      values(?,?,?,?,?,?,?,?) on conflict(temporada,competicion,grupo,numero) do update set
      archivo=excluded.archivo,hash=excluded.hash,comprobada_en=excluded.comprobada_en`)
      .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada,
        fecha, ruta, hash, new Date().toISOString());
    // La página completa es la fuente de verdad de la jornada. Eliminar primero
    // evita conservar filas espurias de una versión anterior del parser.
    db.prepare(`delete from partidos where temporada=? and competicion=? and grupo=? and jornada=?`)
      .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada);
    for (const { p, entrada } of descansos) {
      const comparada = evaluaYCompara(entrada, leeDecisionDescanso(db,
        decideFilaDeDescanso(entrada).decision.clave));
      if (comparada.escribir) {
        guardaDecisionDescanso(db, comparada.resultado.decision, comparada.resultado.motivo);
      }
      // Aunque no sea un partido, el enlace se conserva y se analiza: el acta es la evidencia que
      // permite distinguir un descanso confirmado de un partido desplazado.
      if (!p.codActa) continue;
      db.prepare(`insert into actas(codigo,temporada,competicion,grupo,jornada,menores,estado)
        values(?,?,?,?,?,?,?) on conflict(temporada,competicion,grupo,jornada,codigo) do nothing`)
        .run(p.codActa, trabajo.temporada, trabajo.competicion, trabajo.grupo,
          trabajo.jornada, menores ? 1 : 0, actasPermitidas ? 'pendiente' : 'pendiente_ambito');
      if (actasPermitidas) encola(db, 'acta', {
        temporada: trabajo.temporada, competicion: trabajo.competicion, grupo: trabajo.grupo,
        jornada: trabajo.jornada, acta: p.codActa,
      }, prioridadPlaneada(db, 'acta', trabajo.temporada, trabajo.competicion, trabajo.grupo, 60),
      urlActa(p.codActa));
    }
    for (const [orden, p] of partidos.entries()) {
      const d = p.detalle;
      db.prepare(`insert into partidos(temporada,competicion,grupo,jornada,orden,codigo_acta,
        equipo_local_codigo,equipo_visitante_codigo,local,visitante,goles_local,goles_visitante,
        fecha,hora,campo,campo_codigo,arbitro,actualizado_en)
        values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        on conflict(temporada,competicion,grupo,jornada,orden) do update set
        codigo_acta=excluded.codigo_acta,equipo_local_codigo=excluded.equipo_local_codigo,
        equipo_visitante_codigo=excluded.equipo_visitante_codigo,local=excluded.local,
        visitante=excluded.visitante,goles_local=excluded.goles_local,goles_visitante=excluded.goles_visitante,
        fecha=excluded.fecha,hora=excluded.hora,campo=excluded.campo,campo_codigo=excluded.campo_codigo,
        arbitro=excluded.arbitro,actualizado_en=excluded.actualizado_en`)
        .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, orden,
          p.codActa, p.codLocal ?? d?.codLocal ?? null,
          p.codVisitante ?? d?.codVisitante ?? null, p.local, p.visitante,
          d?.golesLocal ?? null, d?.golesVisitante ?? null, d?.fecha ?? fecha,
          d?.hora ?? null, d?.campo ?? null, d?.codCampo ?? null, d?.arbitro ?? null,
          new Date().toISOString());
      for (const [codigo, nombre] of [[p.codLocal, p.local], [p.codVisitante, p.visitante]]) {
        if (!codigo) continue;
        db.prepare(`insert into equipos(temporada,codigo,nombre,primera_jornada) values(?,?,?,?)
          on conflict(temporada,codigo) do update set nombre=excluded.nombre`)
          .run(trabajo.temporada, codigo, nombre, trabajo.jornada);
      }
      if (!p.codActa) continue;
      db.prepare(`insert into actas(codigo,temporada,competicion,grupo,jornada,menores,estado)
        values(?,?,?,?,?,?,?)
        on conflict(temporada,competicion,grupo,jornada,codigo) do nothing`)
        .run(p.codActa, trabajo.temporada, trabajo.competicion, trabajo.grupo,
          trabajo.jornada, menores ? 1 : 0,
          actasPermitidas ? 'pendiente' : 'pendiente_ambito');
      if (actasPermitidas) {
        encola(db, 'acta', {
          temporada: trabajo.temporada, competicion: trabajo.competicion,
          grupo: trabajo.grupo, jornada: trabajo.jornada, acta: p.codActa,
        }, prioridadPlaneada(db, 'acta', trabajo.temporada, trabajo.competicion, trabajo.grupo, 60), urlActa(p.codActa));
      }
    }
  });
  return partidos;
}

function activaActasPermitidas(db) {
  if (!permiteActasAdultas() && !permiteActasMenores()) return 0;
  let activadas = 0;
  enTransaccion(db, () => {
    for (const acta of db.prepare(`select * from actas where estado in ('pendiente_permiso','pendiente_ambito')`).all()) {
      if (acta.menores ? !permiteActasMenores() : !permiteActasAdultas()) continue;
      encola(db, 'acta', {
        temporada: acta.temporada,
        competicion: acta.competicion,
        grupo: acta.grupo,
        jornada: acta.jornada,
        acta: acta.codigo,
      }, prioridadPlaneada(db, 'acta', acta.temporada, acta.competicion, acta.grupo, 60), urlActa(acta.codigo));
      db.prepare(`update actas set estado='pendiente' where temporada=? and competicion=?
        and grupo=? and jornada=? and codigo=?`).run(
        acta.temporada, acta.competicion, acta.grupo, acta.jornada, acta.codigo,
      );
      activadas++;
    }
  });
  return activadas;
}

/** Recalcula el ámbito de actas ya descubiertas cuando ampliamos el vocabulario de
 * categorías. Corrige también las tablas derivadas y cancela únicamente descargas
 * pendientes que la configuración actual no permite; nunca borra HTML ya guardado. */
function reconciliaAmbitoActas(db) {
  // No cargar datos/HTML/JSON de todas las actas para revisar ocho campos de contexto.
  const actas = db.prepare(`select a.temporada,a.competicion,a.grupo,a.jornada,a.codigo,
    a.menores,a.estado,c.nombre competicion_nombre from actas a
    left join competiciones c on c.temporada=a.temporada and c.codigo=a.competicion`).all();
  let corregidas = 0;
  enTransaccion(db, () => {
    for (const acta of actas) {
      const menores = esCompeticionDeMenores(acta.competicion_nombre ?? '') ? 1 : 0;
      if (menores !== acta.menores) {
        db.prepare(`update actas set menores=? where temporada=? and competicion=? and grupo=?
          and jornada=? and codigo=?`).run(menores, acta.temporada, acta.competicion,
          acta.grupo, acta.jornada, acta.codigo);
        for (const tabla of ['participaciones', 'tecnicos_acta', 'eventos_acta']) {
          db.prepare(`update ${tabla} set menores=? where temporada=? and competicion=? and grupo=?
            and jornada=? and acta=?`).run(menores, acta.temporada, acta.competicion,
            acta.grupo, acta.jornada, acta.codigo);
        }
        corregidas++;
      }
      const permitida = menores ? permiteActasMenores() : permiteActasAdultas();
      if (!permitida && acta.estado !== 'hecha') {
        db.prepare(`update actas set estado='pendiente_ambito' where temporada=? and competicion=?
          and grupo=? and jornada=? and codigo=?`).run(acta.temporada, acta.competicion,
          acta.grupo, acta.jornada, acta.codigo);
        db.prepare(`update trabajos set estado='cancelado',actualizado_en=? where tipo='acta'
          and temporada=? and competicion=? and grupo=? and jornada=? and acta=?
          and estado in ('pendiente','bloqueado','en_curso')`).run(new Date().toISOString(),
          acta.temporada, acta.competicion, acta.grupo, acta.jornada, acta.codigo);
      } else if (permitida && acta.estado === 'pendiente_ambito') {
        db.prepare(`update actas set estado='pendiente' where temporada=? and competicion=?
          and grupo=? and jornada=? and codigo=?`).run(acta.temporada, acta.competicion,
          acta.grupo, acta.jornada, acta.codigo);
      }
    }
  });
  return corregidas;
}

function marcaEquivalenteHecho(db, tipo, datos) {
  db.prepare(`update trabajos set estado='hecho',siguiente_intento=null,ultimo_error=null,
    actualizado_en=? where clave=? and estado!='hecho'`)
    .run(new Date().toISOString(), claveTrabajo(tipo, datos));
}


function claveEquipoActa(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Completa la cabecera con el contexto inequívoco de la cola.
 * Algunas páginas incluyen antes del acta el selector de la temporada actual; si se toma esa
 * primera aparición, un acta histórica puede acabar rotulada como 2026/27. Los códigos del
 * trabajo sí identifican de forma estable temporada, competición, grupo y jornada. */
function contextualizaActa(db, referencia, parseada) {
  const contexto = db.prepare(`select t.etiqueta temporada,c.nombre competicion,g.nombre grupo
    from temporadas t
    left join competiciones c on c.temporada=t.codigo and c.codigo=?
    left join grupos g on g.temporada=t.codigo and g.competicion=? and g.codigo=?
    where t.codigo=?`).get(
    referencia.competicion, referencia.competicion, referencia.grupo, referencia.temporada,
  );
  const resultado = { ...parseada };
  if (contexto?.temporada) {
    if (resultado.temporada && resultado.temporada !== contexto.temporada) {
      resultado.temporadaFuente = resultado.temporada;
    }
    resultado.temporada = contexto.temporada;
  }
  resultado.jornada = Number(referencia.jornada);
  if (contexto?.competicion) resultado.competicion = contexto.competicion;
  if (contexto?.grupo) resultado.grupo = contexto.grupo;
  return resultado;
}

/** Si el portal reutilizó un CodActa en varias filas, conserva el enlace únicamente en el
 * partido cuyos equipos (o, como segundo criterio, marcador) coinciden con el acta real. */
function reconciliaEnlaceActa(db, trabajo, parseada) {
  const partidos = db.prepare(`select orden,local,visitante,goles_local,goles_visitante from partidos
    where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta=?`).all(
    trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta,
  );
  if (partidos.length <= 1) return 0;
  const local = claveEquipoActa(parseada.local);
  const visitante = claveEquipoActa(parseada.visitante);
  let candidatas = partidos.filter((p) => claveEquipoActa(p.local) === local &&
    claveEquipoActa(p.visitante) === visitante);
  if (candidatas.length !== 1 && parseada.golesLocal != null && parseada.golesVisitante != null) {
    candidatas = partidos.filter((p) => p.goles_local === parseada.golesLocal &&
      p.goles_visitante === parseada.golesVisitante);
  }
  if (candidatas.length !== 1) return 0;
  const correcta = candidatas[0].orden;
  const resultado = db.prepare(`update partidos set codigo_acta=null where temporada=? and competicion=?
    and grupo=? and jornada=? and codigo_acta=? and orden<>?`).run(
    trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta, correcta,
  );
  return Number(resultado.changes ?? 0);
}

function titularesEsperados(db, referencia, titularesLocal, titularesVisitante) {
  const contexto = db.prepare(`select c.nombre competicion,g.nombre grupo from competiciones c
    left join grupos g on g.temporada=c.temporada and g.competicion=c.codigo and g.codigo=?
    where c.temporada=? and c.codigo=?`).get(
    referencia.grupo, referencia.temporada, referencia.competicion,
  );
  const nombre = `${contexto?.competicion ?? ''} ${contexto?.grupo ?? ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/futbol\s*sala|futsal|(?:^|[\s.-])f\.?\s*s\.?(?:[\s.-]|$)|zagal[ií]n|chupet[ií]n|biber[oó]n/.test(nombre)) return 5;
  if (/futbol\s*8|\bf-?8\b/.test(nombre)) return 8;
  if (/futbol\s*7|\bf-?7\b/.test(nombre)) return 7;
  if (/alevin|benjamin|benxamin|prebenjamin|prebenxamin|debutante|iniciacion/.test(nombre)) {
    // Según la territorial, estas edades juegan F7 o F8. Si ambos onces publicados tienen ocho,
    // el propio acta resuelve la modalidad sin depender de una lista territorial mantenida a mano.
    return titularesLocal === 8 && titularesVisitante === 8 ? 8 : 7;
  }
  // Veteranos y torneos cortos también pueden ser F8 sin indicarlo en el nombre.
  if (titularesLocal === 8 && titularesVisitante === 8) return 8;
  return 11;
}

function evaluaCalidadActa(db, referencia, parseada, html) {
  const incidencias = [];
  if (parseada.golesLocal == null || parseada.golesVisitante == null) incidencias.push('sin_marcador');
  if (!parseada.local || !parseada.visitante) incidencias.push('sin_equipos');
  if (!parseada.arbitro) incidencias.push('sin_arbitro');

  const titularesLocal = parseada.lineups?.local?.titulares?.length ?? 0;
  const titularesVisitante = parseada.lineups?.visitante?.titulares?.length ?? 0;
  const suplentesLocal = parseada.lineups?.local?.suplentes?.length ?? 0;
  const suplentesVisitante = parseada.lineups?.visitante?.suplentes?.length ?? 0;
  if (titularesLocal + titularesVisitante === 0) incidencias.push('sin_alineaciones');
  else {
    const esperados = titularesEsperados(db, referencia, titularesLocal, titularesVisitante);
    if (titularesLocal !== esperados || titularesVisitante !== esperados) {
      incidencias.push(`titulares_atipicos:${titularesLocal}/${titularesVisitante};esperados:${esperados}`);
    }
  }
  // Algunas actas contienen una fila con enlace de jugador pero sin nombre visible.
  // No es una participación utilizable; comparamos solo las filas con nombre para no
  // atribuir al parser una ausencia que ya está en la propia ficha.
  const inspeccion = inspeccionaActa(html);
  const filasFuente = inspeccion.conNombre;
  const filasParseadas = titularesLocal + titularesVisitante + suplentesLocal + suplentesVisitante;
  // Algunas territoriales (Navarra, entre otras) no enlazan las filas a una ficha de jugador.
  // En ese formato `inspeccionaActa` no puede contar la alineación fuente; cero significa
  // "recuento no disponible", no que el parser haya inventado los jugadores.
  if (inspeccion.jugadores > 0 && filasFuente !== filasParseadas) {
    incidencias.push(`descuadre_alineacion_parser:${filasParseadas}/${filasFuente}`);
  }
  if ((parseada.goles?.length ?? 0) !== inspeccion.goles) {
    incidencias.push(`descuadre_goles_parser:${parseada.goles?.length ?? 0}/${inspeccion.goles}`);
  }
  if ((parseada.cambios?.length ?? 0) !== inspeccion.cambios) {
    incidencias.push(`descuadre_cambios_parser:${parseada.cambios?.length ?? 0}/${inspeccion.cambios}`);
  }
  if ((parseada.tarjetas?.length ?? 0) !== inspeccion.tarjetas) {
    incidencias.push(`descuadre_tarjetas_parser:${parseada.tarjetas?.length ?? 0}/${inspeccion.tarjetas}`);
  }
  const eventosSinMinuto = [...(parseada.goles ?? []), ...(parseada.cambios ?? []),
    ...(parseada.tarjetas ?? [])].filter((evento) => evento.minuto == null).length;
  if (eventosSinMinuto) incidencias.push(`eventos_sin_minuto:${eventosSinMinuto}`);
  const minutosFueraRango = [...(parseada.goles ?? []), ...(parseada.cambios ?? []),
    ...(parseada.tarjetas ?? [])]
    .map((evento) => evento.minuto).filter((minuto) => minuto != null && (minuto < 0 || minuto > 130));
  // No se corrige el dato publicado: 120'+13 y 80'+81 existen literalmente en dos actas
  // archivadas. Se conserva y se marca para revisión para que una estadística de minutos no lo
  // trate como un valor ordinario.
  if (minutosFueraRango.length) incidencias.push(`minuto_fuera_rango:${minutosFueraRango.join(',')}`);
  if (!(parseada.tecnicos?.length ?? 0)) incidencias.push('sin_cuerpo_tecnico');

  const golesMarcador = parseada.golesLocal == null || parseada.golesVisitante == null
    ? null : parseada.golesLocal + parseada.golesVisitante;
  const golesDetallados = parseada.goles?.length ?? 0;
  const administrativo = golesMarcador === 3 && golesDetallados === 0
    && Math.min(titularesLocal, titularesVisitante) <= 6;
  if (golesMarcador != null && golesMarcador !== golesDetallados && !administrativo) {
    incidencias.push(`descuadre_goles:${golesMarcador}/${golesDetallados}`);
  }
  return {
    calidad: administrativo ? 'administrativa' : incidencias.length ? 'revisar' : 'correcta',
    incidencias,
  };
}

/** Actas guardadas con una versión de parser anterior a la actual. Es la cola del mantenimiento. */
function cuentaActasDesactualizadas(db) {
  return db.prepare(`select count(*) n from actas
    where archivo is not null and estado!='ausente_web' and coalesce(version_parser,0) < ?`).get(VERSION_PARSER_ACTA).n;
}

/**
 * Vuelve a interpretar las actas guardadas con un parser antiguo. Devuelve cuántas ha tratado.
 *
 * `limite` es importante: sin él repara TODAS de golpe, y quien la llama en el arranque se queda
 * callado horas antes de recolectar nada. Se comprobó el 11/09/2026: al subir VERSION_PARSER_ACTA de
 * 15 a 16, ocho federaciones se quedaron mudas (Castilla y León tenía 11.100 actas pendientes) y el
 * aviso sólo se imprimía al terminar, así que desde fuera parecía que estaban colgadas.
 */
function reparaActasDesactualizadas(db, limite = Infinity) {
  const actas = db.prepare(`select codigo acta,temporada,competicion,grupo,jornada,menores,archivo,hash
    from actas where archivo is not null and estado!='ausente_web' and coalesce(version_parser,0) < ?
    order by temporada,competicion,grupo,jornada,codigo limit ?`)
    .all(VERSION_PARSER_ACTA, limite);
  let procesadas = 0;
  let fallidas = 0;
  for (const acta of actas) {
    try {
      const html = decodificaHtml(leeArchivo(acta.archivo) ?? readFileSync(acta.archivo));
      const parseada = contextualizaActa(db, acta, parseaActa(html));
      const calidad = evaluaCalidadActa(db, acta, parseada, html);
      guardaJson(rutaJsonDeArchivo(acta.archivo), parseada, db, 'acta');
      guardaActaEstructura(db, acta, acta, parseada);
      reconciliaEnlaceActa(db, acta, parseada);
      // Si la ficha se cerró como 'sin_datos' (publicada sin alineaciones) y ahora el parser SÍ saca
      // algo, vuelve a 'hecha': es la vía de recuperación sin red que justifica guardar el HTML.
      const util = ((parseada.lineups?.local?.titulares?.length ?? 0) +
        (parseada.lineups?.local?.suplentes?.length ?? 0) +
        (parseada.lineups?.visitante?.titulares?.length ?? 0) +
        (parseada.lineups?.visitante?.suplentes?.length ?? 0) > 0) ||
        (parseada.goles?.length ?? 0) > 0 || (parseada.tecnicos?.length ?? 0) > 0;
      const estadoActual = db.prepare(`select estado from actas where temporada=? and competicion=?
        and grupo=? and jornada=? and codigo=?`)
        .get(acta.temporada, acta.competicion, acta.grupo, acta.jornada, acta.acta)?.estado;
      const recupera = util && estadoActual === 'sin_datos';
      db.prepare(`update actas set datos=?,comprobada_en=?,version_parser=?,calidad=?,incidencias=?
        ${recupera ? ", estado='hecha'" : ''}
        where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`)
        .run(JSON.stringify(parseada), new Date().toISOString(), VERSION_PARSER_ACTA,
          calidad.calidad, JSON.stringify(calidad.incidencias), acta.temporada, acta.competicion,
          acta.grupo, acta.jornada, acta.acta);
      if (recupera) {
        db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`)
          .run(new Date().toISOString(), 'info', 'acta_recuperada',
            `${acta.acta}: la ficha sin datos se ha podido analizar con el parser ${VERSION_PARSER_ACTA}`);
      }
      procesadas++;
    } catch (error) {
      fallidas++;
      db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`)
        .run(new Date().toISOString(), 'aviso', 'reparacion_parser',
          `${acta.acta}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { procesadas, fallidas };
}

async function procesa(driver, ritmo, db, trabajo) {
  let html;
  if (trabajo.tipo === 'catalogo_temporada') {
    html = await navega(driver, ritmo, db, trabajo, URL_RESULTADOS);
    let temporadas = extraeTemporadas(html);
    // En Nova/Melilla el primer acceso a una ruta interna puede crear la sesión y devolver la
    // portada conservando la URL solicitada. No hay una redirección fiable que detectar. La
    // segunda navegación, con JSESSIONID ya establecido, entrega el selector. Se limita a UNA
    // repetición y pasa por el mismo ritmo/registro que cualquier petición.
    if (temporadas.length === 0) {
      html = await navega(driver, ritmo, db, trabajo, URL_RESULTADOS);
      temporadas = extraeTemporadas(html);
    }
    if (temporadas.length === 0) throw new Error('la página base no expone temporadas');
    registraTemporadasDisponibles(db, temporadas);
    guardaJson(join(CARPETA, 'temporadas.json'), temporadas, db, 'catalogo_temporadas');
    const carpeta = join(CARPETA, `t${trabajo.temporada}`);
    /*
     * En algunos PNFG el valor «-- Todas --» de `Sch_Cod_Agrupacion` NO devuelve la unión. Ceuta,
     * medido el 20/09/2026, daba 4 competiciones con «Todas» y 53 al sumar Federadas, Selecciones y
     * Veteranos. Por eso no basta con limpiar el filtro: se recorren sus valores reales y se unen por
     * código. `leerCompAgrupacion` deja «-- Cargando --» mientras actualiza el selector, lo que permite
     * esperar el AJAX sin confundir las opciones antiguas con la respuesta nueva.
     */
    const agrupaciones = await driver.executeScript(() => {
      const opciones = [...(document.querySelector('#Sch_Cod_Agrupacion')?.options ?? [])];
      const valores = opciones.map((o) => String(o.value ?? ''));
      return [...new Set(valores.length ? valores : [''])];
    });
    const porCodigo = new Map();
    for (const agrupacion of agrupaciones) {
      await ritmo.antes();
      const inicio = Date.now();
      const iniciadaEn = new Date(inicio).toISOString();
      await driver.executeScript((temporadaValor, agrupacionValor) => {
        const temporada = document.querySelector('#temporada');
        const tipoJuego = document.querySelector('#Sch_Tipo_Juego');
        const selectorAgrupacion = document.querySelector('#Sch_Cod_Agrupacion');
        if (temporada) temporada.value = temporadaValor;
        if (tipoJuego) tipoJuego.value = '';
        if (selectorAgrupacion) selectorAgrupacion.value = agrupacionValor;
        if (typeof window.BuscarCompeticiones === 'function') window.BuscarCompeticiones(temporadaValor);
        else temporada?.dispatchEvent(new Event('change', { bubbles: true }));
      }, trabajo.temporada, agrupacion);
      await driver.wait(async () => {
        return driver.executeScript((agrupacionValor) => {
          const marco = window.frames.NFG_ControlExec;
          if (!marco) return false;
          try {
            const url = String(marco.location.href ?? '');
            return marco.document.readyState === 'complete'
              && url.includes(`cod_agrupacion=${encodeURIComponent(agrupacionValor)}`);
          } catch { return false; }
        }, agrupacion);
      }, 20_000);
      // El documento del iframe ejecuta las llamadas `Select_Add` sobre la página padre al terminar.
      // Se deja un margen mínimo para que el último cambio de DOM sea visible en `outerHTML`.
      await dormir(250);
      html = await htmlActual(driver);
      const parcial = extraeCompeticiones(html);
      // Una agrupación concreta puede existir y no tener competiciones (en Ceuta ocurre con
      // «Selecciones»). Eso no invalida el catálogo completo: sólo se rechaza si además falta la
      // estructura de selectores, señal de que llegó una portada, un error o una página distinta.
      const tieneEstructuraCatalogo = /id=["']temporada["']/i.test(html)
        && /id=["']competicion["']/i.test(html);
      const validacion = parcial.length || tieneEstructuraCatalogo
        ? { ok: true }
        : validaPagina(trabajo.tipo, html);
      if (!validacion.ok) {
        throw Object.assign(new Error(validacion.motivo), { bloqueo: validacion.bloqueo });
      }
      for (const competicion of parcial) porCodigo.set(competicion.codigo, competicion);
      const etiquetaAgrupacion = agrupacion || 'todas';
      guardaAtomico(join(carpeta, `catalogo-agrupacion-${etiquetaAgrupacion}.html`), html, db, trabajo.tipo);
      registraPeticion(db, {
        trabajo: trabajo.clave,
        url: `${URL_RESULTADOS}#temporada=${trabajo.temporada}&agrupacion=${encodeURIComponent(agrupacion)}`,
        iniciadaEn, duracionMs: Date.now() - inicio, resultado: 'ok',
        detalle: `${html.length} bytes; ${parcial.length} competiciones`,
      });
    }
    const datos = [...porCodigo.values()];
    guardaAtomico(join(carpeta, 'catalogo.html'), html, db, trabajo.tipo);
    guardaJson(join(carpeta, 'competiciones.json'), datos, db, trabajo.tipo);
    insertaCompeticiones(db, trabajo.temporada, datos);
    db.prepare('update temporadas set origen=\'web\',comprobada_en=? where codigo=?')
      .run(new Date().toISOString(), trabajo.temporada);
    return `${datos.length} competiciones`;
  }

  html = await navega(driver, ritmo, db, trabajo, trabajo.url);
  const validacion = validaPagina(trabajo.tipo, html);
  if (!validacion.ok) {
    // Se guarda la página RECHAZADA con su tamaño. Sin esto, un fallo de validación era
    // indiagnosticable: el HTML no se archiva (sólo se guarda lo que valida) y el registro de
    // peticiones se sobrescribe con el error, así que se perdía incluso cuántos bytes llegaron.
    // Con estos ficheros se puede mirar después, sin volver a molestar a la web, qué devolvió
    // exactamente: Andalucía acumulaba 191 «página vacía» sin forma de saber qué eran.
    const tamano = `${html.length} bytes`;
    try {
      const rutaRechazo = join(CARPETA, 'rechazadas',
        `${trabajo.clave.replace(/[^a-zA-Z0-9._-]/g, '_')}.html`);
      guardaAtomico(rutaRechazo, html, db, 'rechazada');
    } catch { /* si no se puede archivar, el trabajo sigue su curso igual */ }
    const motivo = `${validacion.motivo} (${tamano})`;
    if (validacion.requiereCookie) {
      // Condición de TODO el portal, no de este trabajo: el portal no sirve la página a nadie que no
      // haya aceptado su cookie. Se aparta el trabajo una semana y, sobre todo, NO se cuenta como
      // fallo seguido: si contara, cinco actas seguidas pararían la federación entera 6 horas y
      // Euskadi se quedaba sin recolectar jornadas por un aviso de cookie. Así el resto sigue.
      throw Object.assign(new Error(motivo), { requiereCookie: true });
    }
    if (validacion.sobrecarga) {
      // El servidor dice que no puede atender ahora mismo. Es sobrecarga, no una decisión sobre
      // quién pide: se deja el trabajo para más tarde y se baja el ritmo (pausa corta), en vez de
      // seguir pidiendo como si la página estuviera vacía.
      throw Object.assign(new Error(motivo), { sobrecarga: true });
    }
    if (!validacion.bloqueo &&
        ['grupos', 'indice_jornadas', 'muestra_competicion', 'muestra_jornadas'].includes(trabajo.tipo)) {
      throw new PendientePublicacion(`${motivo}; puede no estar publicado todavía`);
    }
    throw Object.assign(new Error(motivo), { bloqueo: validacion.bloqueo });
  }

  if (trabajo.tipo === 'grupos' || trabajo.tipo === 'muestra_competicion') {
    const grupos = extraeGrupos(html);
    const carpeta = join(CARPETA, `t${trabajo.temporada}`, `comp-${trabajo.competicion}`);
    guardaAtomico(join(carpeta, 'grupos.html'), html, db, trabajo.tipo);
    guardaJson(join(carpeta, 'grupos.json'), grupos, db, trabajo.tipo);
    insertaGruposYTrabajos(db, trabajo, grupos);
    if (trabajo.tipo === 'muestra_competicion') {
      const primero = grupos[0];
      const datos = {
        temporada: trabajo.temporada,
        competicion: trabajo.competicion,
        grupo: primero.codigo,
        jornada: 1,
      };
      encola(db, 'muestra_jornadas', datos, 12,
        urlJornada(datos.temporada, datos.competicion, datos.grupo, 1));
      marcaEquivalenteHecho(db, 'grupos', {
        temporada: trabajo.temporada, competicion: trabajo.competicion,
      });
      return `${grupos.length} grupos; muestra continuará por ${primero.codigo}`;
    }
    return `${grupos.length} grupos; índices de jornadas encolados`;
  }

  const carpeta = carpetaDe(trabajo);
  if (trabajo.tipo === 'indice_jornadas' || trabajo.tipo === 'muestra_jornadas') {
    const jornadas = extraeJornadas(html);
    // Algunos grupos (fases de ascenso, copas o grupos creados a mitad de temporada) numeran su
    // primera jornada con un valor distinto de 1. El trabajo pide `jornada=1` únicamente para abrir
    // el índice; exigir que el desplegable contenga literalmente el 1 convertía cinco grupos
    // perfectamente válidos en un fallo global. Conservamos la página bajo la primera jornada real.
    const jornadaInicial = jornadas.find((j) => j.numero === 1) ?? jornadas[0];
    guardaJson(join(carpeta, 'jornadas.json'), jornadas, db, trabajo.tipo);
    registraIndiceJornadas(db, trabajo, jornadas);
    const ruta = join(carpeta, 'jornadas', `jornada-${jornadaInicial.numero}.html`);
    const guardado = guardaAtomico(ruta, html, db, 'jornada');
    const partidos = registraJornada(db, { ...trabajo, jornada: jornadaInicial.numero }, html, ruta, guardado.hash);
    if (trabajo.tipo === 'muestra_jornadas') {
      const base = {
        temporada: trabajo.temporada,
        competicion: trabajo.competicion,
        grupo: trabajo.grupo,
      };
      encola(db, 'muestra_calendario', base, 13,
        urlCalendario(base.temporada, base.competicion, base.grupo));
      marcaEquivalenteHecho(db, 'indice_jornadas', { ...base, jornada: 1 });
    }
    return `${jornadas.length} jornadas; jornada ${jornadaInicial.numero} guardada; ${partidos.length} partidos`;
  }
  if (trabajo.tipo === 'calendario' || trabajo.tipo === 'muestra_calendario') {
    guardaAtomico(join(carpeta, 'calendario.html'), html, db, trabajo.tipo);
    if (trabajo.tipo === 'muestra_calendario') {
      marcaEquivalenteHecho(db, 'calendario', {
        temporada: trabajo.temporada,
        competicion: trabajo.competicion,
        grupo: trabajo.grupo,
      });
    }
    return 'calendario guardado';
  }
  if (trabajo.tipo === 'clasificacion') {
    guardaAtomico(join(carpeta, 'clasificacion.html'), html, db, trabajo.tipo);
    return 'clasificación guardada';
  }
  if (trabajo.tipo === 'jornada') {
    const ruta = join(carpeta, 'jornadas', `jornada-${trabajo.jornada}.html`);
    const guardado = guardaAtomico(ruta, html, db, trabajo.tipo);
    const partidos = registraJornada(db, trabajo, html, ruta, guardado.hash);
    return `${partidos.length} partidos; ${partidos.filter((p) => p.codActa).length} actas enlazadas`;
  }
  if (trabajo.tipo === 'acta') {
    const acta = db.prepare(`select menores from actas where temporada=? and competicion=?
      and grupo=? and jornada=? and codigo=?`)
      .get(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
    if (!acta) throw new Error('acta no registrada');
    if (acta.menores ? !permiteActasMenores() : !permiteActasAdultas()) {
      throw new Error('acta fuera del alcance configurado');
    }
    const carpetaActas = join(carpeta, acta.menores ? 'actas-menores' : 'actas-adultos');
    const ruta = join(carpetaActas, `acta-${trabajo.acta}.html`);
    const guardado = guardaAtomico(ruta, html, db, trabajo.tipo);
    perfMarca('acta_guardar_html');
    // Análisis estructurado de la ficha (marcador, equipos, alineaciones, goles, sustituciones,
    // cuerpo técnico y tarjetas). En estos grupos apenas hay tarjetas, así que puede salir vacío;
    // lo importante es el marcador y las alineaciones. Se guarda como JSON junto al HTML y en la
    // columna `datos` de la tabla `actas` para reprocesar sin red.
    const parseada = contextualizaActa(db, trabajo, parseaActa(html));
    perfMarca('acta_analizar');
    for (const guardada of decisionesPendientesPorActa(db, trabajo)) {
      const entrada = {
        federacion: guardada.federacion, temporada: guardada.temporada,
        competicion: guardada.competicion, grupo: guardada.grupo, jornada: guardada.jornada,
        orden: guardada.orden, codigo_acta: guardada.codigo_acta,
        literal_local: guardada.literal_local, literal_visitante: guardada.literal_visitante,
        archivo_html: guardada.archivo_html, huella_html: guardada.huella_html,
        enlaceDeActa: true, parejaDelActa: [parseada.local, parseada.visitante],
        huella_acta: guardado.hash, comprobada_en: new Date().toISOString(),
      };
      const comparada = evaluaYCompara(entrada, guardada);
      if (comparada.escribir) {
        guardaDecisionDescanso(db, comparada.resultado.decision, comparada.resultado.motivo);
      }
    }
    perfMarca('acta_decisiones');
    // Una página que se ha descargado pero de la que no sale NADA no es un acta que hayamos
    // entendido: es una maquetación distinta (Euskadi sirve sus actas con el tema nova y en
    // euskera, y el parser no las lee). Marcarla como 'hecha' con cero alineaciones es peor que no
    // hacerlo: publica el grupo sin plantillas, da por hecho un trabajo que no se ha hecho y no se
    // volvería a intentar. El HTML ya queda archivado, así que se puede recuperar sin red con
    // `recolector:reprocesar` en cuanto exista un parser para esa maqueta.
    const titulares = (parseada.lineups?.local?.titulares?.length ?? 0) +
      (parseada.lineups?.visitante?.titulares?.length ?? 0);
    const suplentes = (parseada.lineups?.local?.suplentes?.length ?? 0) +
      (parseada.lineups?.visitante?.suplentes?.length ?? 0);
    const nadaUtil = titulares + suplentes === 0 && (parseada.goles?.length ?? 0) === 0 &&
      (parseada.tecnicos?.length ?? 0) === 0;
    if (nadaUtil) {
      // Se deja ENLAZADO el HTML en la fila del acta (archivo y hash) aunque el análisis falle: es
      // lo que permite recuperarla después sin red con `recolector:reprocesar`, que busca las actas
      // por esa columna. Sin este enlace el fichero quedaba en disco pero la base no sabía de él.
      db.prepare(`update actas set archivo=?,hash=?,incidencias=?,comprobada_en=?
        where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`)
        .run(ruta, guardado.hash, JSON.stringify(['acta_ilegible']), new Date().toISOString(),
          trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
      const partido = db.prepare(`select goles_local,goles_visitante,fecha from partidos where temporada=?
        and competicion=? and grupo=? and jornada=? and codigo_acta=? limit 1`).get(
        trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta,
      );
      const marcadorSinPublicar = partido && partido.goles_local == null && partido.goles_visitante == null &&
        (parseada.golesLocal == null || parseada.golesLocal === 0) &&
        (parseada.golesVisitante == null || parseada.golesVisitante === 0);
      /*
       * OJO con el árbitro: antes esto exigía `!parseada.arbitro`, y por eso no servía. El árbitro se designa
       * ANTES del partido, así que aparece en fichas que no publican nada más (medido: Navarra devuelve
       * `{"goles":0,"tarjetas":0,"cambios":0,"tecnicos":0,"locales":0,"arbitro":"sí"}`). Lo que importa es que el
       * marcador no esté publicado, y eso ya lo dice el calendario.
       */
      if (marcadorSinPublicar) {
        throw new PendientePublicacion('la ficha del acta existe pero todavía no publica datos', 2);
      }
      /*
       * ── ACTA VACÍA: ¿ANTIGUA O TODAVÍA SIN PUBLICAR? ───────────────────────────────────────────────────────
       *
       * Cuando la página llega sin contenido deportivo hay dos casos MUY distintos, y se distinguen por la fecha
       * del partido (que ya está en el calendario de la cola, sin pedir nada):
       *
       *   · **partido antiguo** (más de dos meses): la federación ya no publica esa ficha. Gastar los otros dos
       *     intentos sólo cuesta peticiones —medido el 19/09/2026 en Navarra: **1.910 peticiones en 24 horas**
       *     contra actas de la 2023-24, partidos de mayo de 2024, con ~1.900 trabajos aún en la cola—, así que se
       *     descarta a la primera y el acta queda `ausente_web` para que su grupo pueda publicarse sin ella;
       *   · **partido reciente**: puede ser que la federación publique los datos en unos días. Se trata como
       *     publicación pendiente (se reintenta cada 24 h, sin descartar y sin marcar ausente) y, si a los dos
       *     meses sigue vacía, entra sola por el camino anterior.
       */
      const paginaVacia = actaSinContenidoDeportivo(parseada);
      const diasDelPartido = partido?.fecha ? (Date.now() - Date.parse(partido.fecha)) / 86_400_000 : null;
      const antiguaSinFicha = paginaVacia && diasDelPartido !== null && diasDelPartido > DIAS_ACTA_ANTIGUA_SIN_FICHA;
      if (paginaVacia && !antiguaSinFicha) {
        throw new PendientePublicacion('la página del acta viene vacía: la federación todavía no ha publicado sus datos', 24);
      }
      throw Object.assign(
        new Error(paginaVacia
          ? 'la página del acta viene vacía y el partido es de hace más de dos meses: la fuente ya no la publica'
          : 'la página del acta se descargó pero no se puede interpretar (maquetación distinta)'),
        { actaSinInterpretar: true, ausenteDefinitiva: antiguaSinFicha },
      );
    }
    const calidad = evaluaCalidadActa(db, trabajo, parseada, html);
    perfMarca('acta_calidad');
    guardaJson(join(carpetaActas, `acta-${trabajo.acta}.json`), parseada, db, 'acta');
    perfMarca('acta_guardar_json');
    // ── `acta_estructura` SE PARTE EN TRES (medido el 23/09/2026) ─────────────────────────────────────────
    //
    // En Andalucía, `acta_estructura` se llevaba 5,24 s de un ciclo de 11,1 s (el 47 %) con
    // `synchronous=NORMAL`, o sea SIN el coste de sincronizar el disco: eso ya no era el `fsync`. Dentro hay
    // tres cosas que se arreglan de forma distinta, así que se separan:
    //
    //   · `acta_guardar_estructura` — los `insert` de participaciones, eventos, técnicos y personas, con sus
    //     índices. Si manda esto, el problema es el VOLUMEN de escrituras o los índices, y se ataca ahí;
    //   · `acta_reconciliar` — el enlace del acta con su partido;
    //   · `acta_marcar_hecha` — el `update` final del acta.
    //
    // Y quedan dentro los dos sitios donde puede esconderse una PAUSA que no es trabajo: la confirmación de la
    // transacción de `guardaActaEstructura` (que en WAL puede incluir un punto de control automático, y eso sí
    // escribe en el disco duro) y la confirmación del `update` final.
    guardaActaEstructura(db, trabajo, acta, parseada);
    perfMarca('acta_guardar_estructura');
    reconciliaEnlaceActa(db, trabajo, parseada);
    perfMarca('acta_reconciliar');
    db.prepare(`update actas set estado='hecha',archivo=?,hash=?,datos=?,comprobada_en=?,
      version_parser=?,calidad=?,incidencias=?
      where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`)
      .run(ruta, guardado.hash, JSON.stringify(parseada), new Date().toISOString(),
        VERSION_PARSER_ACTA, calidad.calidad, JSON.stringify(calidad.incidencias),
        trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
    perfMarca('acta_marcar_hecha');
    return `acta ${acta.menores ? 'de base' : 'adulta'} guardada y analizada; ${parseada.golesLocal ?? '?'}-${parseada.golesVisitante ?? '?'}, ` +
      `${titulares} titulares, ${suplentes} suplentes, ${parseada.goles?.length ?? 0} goles, ` +
      `${parseada.tecnicos?.length ?? 0} técnicos${calidad.calidad === 'revisar' ?
        `; revisar: ${calidad.incidencias.join(', ')}` : ''}`;
  }
  throw new Error(`tipo no implementado: ${trabajo.tipo}`);
}

function liberaTrabajo(db, clave) {
  db.prepare(`update trabajos set estado='pendiente',actualizado_en=? where clave=?`)
    .run(new Date().toISOString(), clave);
}

function anotaUltimaPeticion(db, trabajo, resultado, detalle) {
  db.prepare(`update peticiones set resultado=?,detalle=? where id=(
    select id from peticiones where trabajo=? order by id desc limit 1
  )`).run(resultado, detalle, trabajo.clave);
}

async function ejecutar(db) {
  compruebaPermiso();
  console.log('  · Preparando vigilancia y ámbito de actas (trabajo local).');
  preparaVigilanciaActual(db);
  const ambitosCorregidos = reconciliaAmbitoActas(db);
  if (ambitosCorregidos) console.log(`  · ${ambitosCorregidos} actas reclasificadas por categoría.`);
  activaActasPermitidas(db);
  console.log('  · Revisando calendario futuro y jornadas recientes (trabajo local).');
  const aplazadas = aplazaFuturoTemporadaActual(db);
  if (aplazadas.jornadas || aplazadas.clasificaciones) {
    console.log(`  · Temporada actual: ${aplazadas.jornadas} jornadas futuras y ` +
      `${aplazadas.clasificaciones} clasificaciones sin resultados quedan aplazadas.`);
  }
  const repaso = preparaRepasoJornadasRecientes(db);
  if (repaso.jornadas || repaso.clasificaciones) {
    console.log(`  · Repaso reciente: ${repaso.jornadas} jornadas y ` +
      `${repaso.clasificaciones} clasificaciones vuelven a cola sin repetir actas completas.`);
  }
  // Aquí estaba `reprioritizaPlan(db)` a secas, y era el grueso del retraso del arranque. Ahora sólo se recorre
  // el plan entero si el catálogo ha cambiado o si hace más de 12 h. Ver `reprioritizaPlanSiHaceFalta`.
  reprioritizaPlanSiHaceFalta(db);
  const pausa = pausaGlobalActiva(db);
  if (pausa) {
    console.log(`Recolección en pausa hasta ${pausa.hasta}: ${pausa.motivo}`);
    return;
  }
  // Chrome acumula procesos renderer tras miles de navegaciones. Con muchas federaciones
  // simultáneas eso termina provocando paginación de memoria y reduce el ritmo real aunque la
  // pausa configurada no cambie. Cerramos limpiamente cada sesión tras un lote moderado; el
  // supervisor la reanuda desde SQLite sin repetir trabajos hechos.
  const maxConfigurado = numero('max', 20);
  // Lotes distintos por federación evitan que todos los navegadores se reciclen a la vez.
  const desfase = [...PERFIL_NOMBRE].reduce((n, c) => (n + c.charCodeAt(0)) % 91, 0);
  const limiteReciclado = 220 + desfase;
  const max = Math.min(maxConfigurado, limiteReciclado);
  if (max < 1 || max > 200_000) throw new Error('--max debe estar entre 1 y 200000');
  if (maxConfigurado > max) console.log(`  · sesión limitada a ${max} trabajos para reciclar Chrome y contener la memoria.`);
  // Si la sesión anterior murió a mitad de un trabajo (un corte, un OOM, un reinicio), esa fila se quedó en
  // 'en_curso' sin nadie trabajándola: vuelve a la cola, no se pierde ni se da por hecha.
  const aMedias = db.prepare("update trabajos set estado='pendiente' where estado='en_curso'").run().changes;
  if (aMedias > 0) console.log(`  · ${aMedias} trabajo(s) que quedaron a medias en una sesión anterior vuelven a la cola.`);
  // Si no hay ningún trabajo disponible AHORA (todo lo que queda está aplazado a la fecha de su
  // jornada), no se abre el navegador: se evita arrancar Chrome cada pocos minutos para nada.
  if (!siguienteTrabajo(db)) {
    const proximo = db.prepare(`SELECT MIN(siguiente_intento) t FROM trabajos
      WHERE estado='pendiente' AND siguiente_intento IS NOT NULL`).get()?.t ?? null;
    console.log('Sin trabajo disponible ahora' +
      (proximo ? `; el próximo está aplazado a ${proximo}` : '') + '. No se abre el navegador.');
    return;
  }
  const ritmo = new Ritmo(db);
  /*
   * Y si el PRESUPUESTO DIARIO de peticiones ya está gastado, tampoco se abre el navegador.
   *
   * Esto se comprobaba dentro de `ritmo.antes()`, o sea en el primer trabajo: cuando el worker se enteraba, ya
   * había pedido plaza de navegador, la tenía y había arrancado Chrome para no pedir nada. Medido el 18/09/2026
   * en la prueba de fondo de Docker: **24 sesiones en doce minutos, cada una con su arranque de Chrome, y cero
   * peticiones** («presupuesto diario agotado (200/200)»). Con el supervisor relanzando cada 20 s, eso es un
   * navegador abriéndose y cerrándose para nada. Se comprueba antes, como el trabajo disponible.
   */
  const usadasHoy = peticionesHoy(db, fechaLocal());
  // El tope diario se deja escrito en la cola: es lo que necesita `proximo-trabajo.mjs` (que no conoce la
  // configuración de la federación) para no relanzar la sesión cada veinte segundos cuando ya está agotado.
  guardaMetadato(db, 'diario_max', String(ritmo.maxDiario));
  if (usadasHoy >= ritmo.maxDiario) {
    console.log(`Presupuesto diario agotado (${usadasHoy}/${ritmo.maxDiario}) y no hay nada más que hacer hoy. `
      + 'No se abre el navegador: la cola queda intacta para la próxima sesión.');
    return;
  }
  const creaDriver = async () => {
    const nuevo = await new Builder().forBrowser('chrome').setChromeOptions(opcionesChrome()).build();
    await nuevo.manage().setTimeouts({ pageLoad: 30_000, script: 15_000, implicit: 0 });
    await bloqueaTerceros(nuevo);
    return nuevo;
  };
  /*
   * ── LIMPIEZA AL ARRANCAR ──────────────────────────────────────────────────────────────────────────
   *
   * Antes de pedir plaza y de abrir el primer navegador se recogen los restos de la sesión ANTERIOR. Es la
   * única red que queda cuando el worker no pudo limpiar al salir: un `kill`, un corte de luz, un reinicio de
   * la máquina o un `driver.quit()` que no terminó. Sin esto, esos restos se suman a los de las demás
   * federaciones y acaban siendo la memoria que necesitaban los workers que esperan.
   */
  limpiaChromeHuerfanoDeEstePerfil();
  let memoriaNavegadorMb = null;
  const slotChrome = await adquiereSlotChrome(db);
  let driver = null;
  let hechos = 0;
  // Fallos seguidos en esta sesión. Un fallo suelto no debe parar la federación: sólo una barrera
  // real, o varios fallos seguidos (que sí apuntan a un problema del sitio), activan la pausa.
  let fallosSeguidos = 0;
  // Veces que se ha caído la sesión del navegador en esta ejecución (ver el manejador de sesión caída).
  let recreacionesDeSesion = 0;
  try {
    driver = await creaDriver();
    while (hechos < max) {
      // La marca `cierre` mide la COLA del trabajo anterior: `marcaTrabajo`, el reciclado de Chrome y el
      // mantenimiento local. Es la fase que nadie había mirado y donde puede estar el hueco.
      perfMarca('cierre');
      const trabajo = siguienteTrabajo(db);
      perfMarca('consulta');
      if (!trabajo) break;
      db.prepare("update trabajos set estado='en_curso',actualizado_en=? where clave=?")
        .run(new Date().toISOString(), trabajo.clave);
      perfMarca('marcar_en_curso');
      perfEmpieza(trabajo.clave);
      console.log(`→ ${trabajo.clave}`);
      try {
        const detalle = await procesa(driver, ritmo, db, trabajo);
        perfMarca('analisis_guardado');
        perfCierra('hecho');
        marcaTrabajo(db, trabajo.clave, 'hecho');
        console.log(`  ✓ ${detalle}`);
        hechos++;
        fallosSeguidos = 0;
        // El PNFG de Castilla y León deja renderers antiguos vivos al navegar entre actas. En una
        // sesión observada pasó de 7 a 23 procesos en ocho trabajos. Reciclar sólo el navegador
        // mantiene la misma cola/slot y evita que el sistema vuelva a paginar memoria.
        // En Chrome 152 los PNFG territoriales acumulan renderers y cachés, pero reciclar cada cinco o diez
        // trabajos sale carísimo: cerrar el navegador, limpiar su perfil (un PowerShell), abrirlo y volver a
        // pedir plaza cuesta 15-25 s, y a 12 s por trabajo eso es un tercio del tiempo del worker. Medido el
        // 17/09/2026: con el reciclado disparándose en cada trabajo, cada federación hacía 1,4-2,4 peticiones
        // por minuto donde su ritmo permite 8. Cuarenta trabajos por vuelta dejan el reciclado en el 3 % del
        // tiempo y el navegador se queda muy por debajo del tope de 900 MB. Castilla y León, que es la cola
        // prioritaria, recicla antes para no arriesgar su plaza reservada.
        // Melilla/Nova crece mucho más deprisa: en su primera tanda llegó a 2.086 MB al trabajo
        // 20 y, medido después, todavía alcanzaba 1.827 MB al trabajo 10. En el servidor cada
        // contenedor tiene 1.600 MB, así que allí no alcanzaría siquiera el reciclado por consumo.
        // Se recicla cada cinco páginas; el resto conserva su cadencia.
        const cadaRecicladoNavegador = PERFIL_NOMBRE === 'melilla' ? 5
          : PERFIL_NOMBRE === 'castilla-leon' ? 20 : 40;
        /*
         * ── RECICLADO POR CONSUMO ────────────────────────────────────────────────────────────────────
         *
         * El número de trabajos es el SUELO (un arranque de Chrome cuesta y no se recicla por capricho), pero
         * quien decide de verdad es lo que ha engordado el navegador: cuarenta páginas ligeras lo dejan como
         * nuevo y cuarenta pesadas pueden acercarlo al giga. Se mide el Chrome de ESTE perfil —lo único que
         * este worker puede devolver al reciclarlo— cada diez trabajos.
         *
         * OJO con la medición VIEJA: `memoriaNavegadorMb` sólo vale para el navegador que se midió. Si se
         * recicla y se sigue usando el número anterior, la regla de consumo vuelve a dispararse en el trabajo
         * siguiente con el dato de un navegador que ya no existe —y esa es exactamente la forma del bucle de
         * «un reciclado por trabajo» que se midió hoy—. Por eso se pasa `null` salvo en el trabajo en que se
         * acaba de medir, y se borra al reciclar: sin medición fresca, manda el suelo por trabajos.
         */
        let medicionFresca = false;
        if (hechos % CADA_MEDICION_NAVEGADOR === 0) {
          memoriaNavegadorMb = mideNavegadorDeEstePerfil();
          medicionFresca = true;
        }
        const decisionReciclado = tocaReciclar({
          hechos, cada: cadaRecicladoNavegador, memoriaMb: medicionFresca ? memoriaNavegadorMb : null,
          topeMb: TOPE_NAVEGADOR_MB,
        });
        if (decisionReciclado.reciclar && hechos < max) {
          console.log(`  · reciclado de Chrome tras ${hechos} trabajos (${decisionReciclado.motivo}).`);
          await driver.quit().catch(() => {});
          // Y se limpia lo que `quit()` deja detrás. Medido el 17/09/2026: había **103 procesos Chrome
          // huérfanos** de los recolectores ocupando **8,5 GB**; `quit()` cierra la sesión, pero los
          // renderers y los procesos de caché de ESE perfil se quedaban vivos y nadie los recogía. Es la
          // basura que va acumulándose hasta que el sistema paginna y los recolectores fallan.
          memoriaNavegadorMb = null;
          limpiaChromeHuerfanoDeEstePerfil();
          driver = await creaDriver();
        }
        // La recolección no debe dejar para el final las mejoras del parser. Cada 25 respuestas
        // válidas se reparan cinco actas ya archivadas, sin red y usando esta misma conexión. El
        // coste es pequeño y evita otro proceso escritor que pudiera competir por SQLite.
        if (hechos % 25 === 0 && cuentaActasDesactualizadas(db) > 0) {
          const mantenimiento = reparaActasDesactualizadas(db, 5);
          if (mantenimiento.procesadas || mantenimiento.fallidas) {
            console.log(`  · mantenimiento local: ${mantenimiento.procesadas} actas actualizadas` +
              (mantenimiento.fallidas ? `, ${mantenimiento.fallidas} pendientes de revisar` : '') + '.');
          }
        }
        /*
         * ── LA PLAZA SE CEDE SI HAY QUIEN LA ESPERA ──────────────────────────────────────────────────
         *
         * Se comprueba ENTRE trabajos (nunca a mitad de uno) y sólo cuando hay federaciones en la cola de
         * espera: en un servidor donde no caben todas a la vez, el que tiene plaza no puede quedársela sesión
         * tras sesión. Al ceder, la sesión termina en limpio y su supervisor la relanzará más tarde, entrando
         * por el final de la cola. Antes de irse, el latido se refresca para que la plaza no se dé por
         * abandonada en el hueco entre el cierre y el siguiente turno.
         */
        refrescaLatidoDePlaza(slotChrome);
        const turno = decideTurnoDePlaza({
          desdeMs: slotChrome.desde, ahoraMs: Date.now(), topeMs: TURNO_PLAZA_MS, hayEspera: hayFederacionesEsperando(),
        });
        if (turno.ceder) {
          console.log(`  · ${turno.motivo}.`);
          break;
        }
      } catch (error) {
        // Se cierra la medición del trabajo TAMBIÉN cuando falla: un trabajo que falla también gasta tiempo, y
        // si no se apuntara, el resumen sólo hablaría de los que salen bien (que es justo lo contrario de lo
        // que hace falta para entender un cuello de botella).
        perfCierra('error');
        const mensaje = error instanceof Error ? error.message : String(error);
        if (error?.operativa) {
          liberaTrabajo(db, trabajo.clave);
          console.log(`  ⏸ ${mensaje}. La cola queda intacta para la próxima ejecución.`);
          break;
        }
        if (error?.pendientePublicacion) {
          const siguiente = new Date(Date.now() + Number(error.dias) * 24 * 60 * 60_000).toISOString();
          anotaUltimaPeticion(db, trabajo, 'sin_publicar', mensaje);
          marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, siguiente);
          console.log(`  ◷ Aún no publicado. Se volverá a comprobar después de ${siguiente}.`);
          hechos++;
          continue;
        }
        /*
         * ── LA SESIÓN SE HA CAÍDO: EL FALLO ES NUESTRO, NO DE LA FUENTE ──────────────────────────────
         *
         * Aquí entra todo lo que significa «este navegador ya no existe»: el renderer que se cayó, la sesión
         * de WebDriver que ya no vale y —el caso que faltaba— la conexión RECHAZADA al chromedriver de casa
         * (`ECONNREFUSED 127.0.0.1:<puerto>`), que es lo que devuelve Selenium cuando el proceso del
         * conductor ha muerto.
         *
         * Por qué importa tanto: el 17/09/2026, al matar por error todos los chromedriver del equipo, NUEVE
         * federaciones encadenaron cinco `ECONNREFUSED` seguidos, cayeron en el manejador genérico y se
         * pusieron en PAUSA PREVENTIVA una hora (Madrid, seis) con 10.000-30.000 trabajos disponibles en la
         * cola. Un conductor muerto no dice nada malo de la federación: lo que hay que hacer es reabrir la
         * sesión y seguir, y no castigar a la fuente por un problema de casa.
         *
         * Con tope: si la sesión se cae más de seis veces en una misma ejecución, se termina en limpio y el
         * supervisor la reanuda (nada de reintentar sin fin).
         */
        const sesionCaida = /ECONNREFUSED (?:\d{1,3}\.){3}\d{1,3}|ECONNREFUSED \[?::1\]?|ECONNREFUSED localhost|invalid session id|no such session|valid session ID|timed out receiving message from renderer|chrome not reachable|disconnected|not connected to devtools|tab crashed|no such window|target window already closed|cannot determine loading status|chrome failed to start|session not created/i.test(mensaje);
        if (sesionCaida) {
          recreacionesDeSesion++;
          if (recreacionesDeSesion > 6) {
            console.error('  ⛔ La sesión del navegador se ha caído siete veces en esta ejecución: se termina en limpio y el supervisor la reanudará.');
            break;
          }
          const siguiente = new Date(Date.now() + 10 * 60_000).toISOString();
          anotaUltimaPeticion(db, trabajo, 'error_navegador', mensaje);
          marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, siguiente);
          console.warn(`  ↻ La sesión del navegador se cayó (${recreacionesDeSesion}.ª vez): se recrea y la tarea vuelve a la cola para ${siguiente}.`);
          try { await driver.quit(); } catch { /* la sesión ya estaba caída */ }
          driver = await creaDriver();
          continue;
        }
        if (error?.sobrecarga) {
          // La fuente no puede atender ahora: se aparta el trabajo una hora y se para la sesión para
          // no insistir. Mismo criterio que el recolector iSquad con un HTTP 503.
          const siguiente = new Date(Date.now() + 60 * 60_000).toISOString();
          anotaUltimaPeticion(db, trabajo, 'error', mensaje);
          marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, siguiente);
          const hasta = establecePausaGlobal(db, 1, `${mensaje} (sobrecarga de la fuente)`, trabajo);
          console.error(`  ⏳ ${mensaje}. Pausa de 1 h hasta ${hasta}.`);
          break;
        }
        if (error?.actaSinInterpretar) {
          // Página descargada pero sin nada que analizar. Se distingue por temporada, porque no es lo
          // mismo una ficha de una competición en curso (puede llenarse cuando se juegue) que una de
          // una temporada cerrada desde hace años.
          //
          //  · En la temporada en curso: se aparta un mes y NO cuenta como fallo seguido, para no
          //    parar la federación entera por esto. El HTML queda archivado.
          //  · En una temporada cerrada: tras dos intentos se da por «ficha sin datos». Comprobado el
          //    14/09/2026 en el HTML archivado de la Copa del Rey de Euskadi (acta 1838084): la página
          //    llega entera, con los encabezados («Titularrak», «Langile Teknikikoak») y las TABLAS
          //    VACÍAS, y el entrenador como «Ez du aurkezten». No hay nada que analizar: no es un
          //    fallo nuestro ni una ficha que la fuente no publique, es una ficha publicada sin datos.
          //    Antes se reintentaba cada mes para siempre y su grupo no se publicaba nunca. Ahora se
          //    marca 'sin_datos': la web la cuenta como resuelta para dejar publicar el grupo, dice lo
          //    que pasa de verdad y el HTML sigue archivado (version_parser=0) para recuperarla cuando
          //    el parser sepa leerla.
          const intentosActa = Number(trabajo.intentos ?? 0) + 1;
          const temporadaCerrada = Number(trabajo.temporada) < Number(temporadaActual(db));
          if (temporadaCerrada && intentosActa >= 2) {
            anotaUltimaPeticion(db, trabajo, 'sin_datos', mensaje);
            db.prepare(`update actas set estado='sin_datos',incidencias=?,comprobada_en=? where temporada=?
              and competicion=? and grupo=? and jornada=? and codigo=? and estado<>'hecha'`)
              .run(JSON.stringify(['la federación publica la ficha pero sin datos: alineaciones y cuerpo técnico vacíos']),
                new Date().toISOString(), trabajo.temporada, trabajo.competicion, trabajo.grupo,
                trabajo.jornada, trabajo.acta);
            marcaTrabajo(db, trabajo.clave, 'cancelado', mensaje, null);
            console.warn(`  ℹ️ ${mensaje}. La ficha viene sin datos: se cierra y su grupo podrá publicarse (el HTML queda archivado por si un parser mejor la lee).`);
            continue;
          }
          const siguiente = new Date(Date.now() + (temporadaCerrada ? 2 : 30) * 24 * 60 * 60_000).toISOString();
          anotaUltimaPeticion(db, trabajo, 'acta_ilegible', mensaje);
          marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, siguiente);
          console.error(`  ⚠️ ${mensaje}. Archivada para reprocesar; se reintentará el ${siguiente.slice(0, 10)}.`);
          continue;
        }
        if (error?.requiereCookie) {
          // El portal no entrega esta página sin que se acepte su cookie. No es un fallo del
          // recolector ni un bloqueo: es una condición del portal que hay que resolver una vez,
          // aceptando el aviso en el navegador del recolector. Se aparta una semana y no se cuenta
          // como fallo seguido, para que la federación siga con el resto del trabajo.
          const siguiente = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
          anotaUltimaPeticion(db, trabajo, 'requiere_cookie', mensaje);
          marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, siguiente);
          console.error(`  ◷ ${mensaje} (se reintentará el ${siguiente.slice(0, 10)}).`);
          continue;
        }
        if (error?.catalogoIncompleto && trabajo.tipo === 'catalogo_temporada') {
          // La web ha dejado de exponer buena parte de un catálogo que ya conocíamos. Nunca se
          // reemplaza el inventario completo por esa foto parcial y tampoco se repite cada hora:
          // se conserva lo anterior y se vuelve a comprobar con la cadencia semanal del catálogo.
          const dias = numero('catalogo-cada-dias', 7);
          const siguiente = new Date(Date.now() + dias * 24 * 60 * 60_000).toISOString();
          anotaUltimaPeticion(db, trabajo, 'catalogo_parcial', mensaje);
          marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, siguiente);
          fallosSeguidos = 0;
          console.warn(`  ◷ ${mensaje}. Se conservan todas las competiciones conocidas y se volverá a comprobar el ${siguiente.slice(0, 10)}.`);
          continue;
        }
        const bloqueo = Boolean(error?.bloqueo);
        const intentos = Number(trabajo.intentos ?? 0) + 1;
        /*
         * ACTA ANTIGUA SIN FICHA (ver el comentario donde se lanza): la página viene vacía y el partido es de hace
         * meses. Se descarta A LA PRIMERA y el acta queda como `ausente_web` —igual que hace el camino de los tres
         * intentos—, así que su grupo puede publicarse sin ella. No se cuenta como fallo seguido: no es un fallo
         * nuestro ni de la federación, es una ficha que ya no existe, y contarla cortaría sesiones enteras cuando
         * aparecen en racha.
         */
        if (error?.ausenteDefinitiva && trabajo.tipo === 'acta') {
          anotaUltimaPeticion(db, trabajo, 'sin_datos', mensaje);
          marcaTrabajo(db, trabajo.clave, 'cancelado', mensaje, null);
          const marcada = db.prepare(`update actas set estado='ausente_web',incidencias=? where temporada=?
            and competicion=? and grupo=? and jornada=? and codigo=? and estado<>'hecha'`)
            .run(JSON.stringify([`la fuente no publica esta acta: ${mensaje}`]), trabajo.temporada,
              trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
          console.warn(`  ✗ ${mensaje}: se descarta sin más intentos`
            + `${Number(marcada.changes ?? 0) ? ' y el acta queda como ausente en la web' : ''}.`);
          continue;
        }
        anotaUltimaPeticion(db, trabajo, bloqueo ? 'bloqueo' : 'error', mensaje);

        if (bloqueo) {
          // Barrera declarada (captcha, acceso denegado, límite explícito): aquí sí se para todo.
          const siguiente = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
          marcaTrabajo(db, trabajo.clave, 'bloqueado', mensaje, siguiente);
          const hasta = establecePausaGlobal(db, 24, mensaje, trabajo);
          console.error(`  ⛔ ${mensaje}. Pausa global preventiva hasta ${hasta}.`);
          break;
        }

        // Una ausencia de contenido pertenece a ESA dirección (grupo retirado, jornada no
        // publicada, etc.). Varias direcciones vacías consecutivas no prueban que haya fallado la
        // federación completa y no deben detener miles de trabajos válidos que vienen detrás.
        const ausenciaEsperable = /página vacía o sin contenido|no parece una página|catálogo sin competiciones|competición sin grupos|no se pudo descubrir/i.test(mensaje);
        if (ausenciaEsperable) fallosSeguidos = 0;
        else fallosSeguidos++;
        if (intentos >= 3) {
          // La misma dirección ha fallado tres veces repartidas en días: no es una barrera, es que
          // ahí no hay contenido. Se descarta con el motivo guardado en vez de reintentarla siempre.
          marcaTrabajo(db, trabajo.clave, 'cancelado', mensaje, null);
          console.warn(`  ✗ ${mensaje}. Se descarta tras ${intentos} intentos (no es un bloqueo).`);
          // ACTA QUE LA FUENTE NO SIRVE: cuando la página llega vacía tres veces no es que hayamos
          // fallado, es que esa ficha no existe en la web (Murcia sirve
          // `<html><head></head><body></body></html>`, 39 bytes, para actas de temporadas antiguas).
          // Dejarla en 'pendiente' era peor que un fallo: la web sólo publica un grupo cuando
          // NINGUNA de sus actas está fuera de 'hecha', así que una sola ficha inexistente dejaba su
          // grupo sin publicar para siempre. Se marca como ausente —igual que se hace con los grupos
          // que la fuente ya no publica— y el grupo puede salir con el resto de sus actas.
          if (trabajo.tipo === 'acta') {
            const r = db.prepare(`update actas set estado='ausente_web',incidencias=? where temporada=?
              and competicion=? and grupo=? and jornada=? and codigo=? and estado<>'hecha'`)
              .run(JSON.stringify([`la fuente no publica esta acta: ${mensaje}`]), trabajo.temporada,
                trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
            if (Number(r.changes ?? 0)) {
              console.warn('    · acta marcada como ausente en la web: su grupo podrá publicarse sin ella.');
            }
          }
          // GRUPO QUE LA FEDERACIÓN LISTA SIN JORNADAS: hay competiciones cuyo desplegable de grupos
          // trae entradas a las que no les corresponde ninguna jornada (el relleno «GRUPO - 1», cuyo
          // código es el de la competición, y categorías base o fases que la federación dejó sin
          // cargar). Comprobado el 13/09/2026 pidiendo una de esas páginas: llega entera (111.875
          // bytes) con el desplegable de jornadas vacío. El trabajo se cancela tras tres intentos,
          // pero el grupo seguía `presente` con 0 jornadas, y la web exige `jornadas > 0` a TODOS los
          // grupos de una competición: una sola entrada así dejaba la competición entera invisible
          // para siempre aunque el resto estuviera completa. Se marca el grupo como ausente —el mismo
          // criterio que ya se usa con los grupos retirados y con las actas que la fuente no sirve—,
          // y sólo en temporadas ya cerradas: en la temporada en curso se sigue esperando, porque la
          // federación puede publicarlas más adelante.
          if (trabajo.tipo === 'indice_jornadas' && Number(trabajo.temporada) < Number(temporadaActual(db))) {
            const r = db.prepare(`update grupos set estado='ausente_web',comprobado_en=?
              where temporada=? and competicion=? and codigo=? and estado<>'ausente_web'`)
              .run(new Date().toISOString(), trabajo.temporada, trabajo.competicion, trabajo.grupo);
            if (Number(r.changes ?? 0)) {
              db.prepare(`update trabajos set estado='cancelado',siguiente_intento=null,actualizado_en=?
                where temporada=? and competicion=? and grupo=? and estado in ('pendiente','bloqueado')`)
                .run(new Date().toISOString(), trabajo.temporada, trabajo.competicion, trabajo.grupo);
              db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`)
                .run(new Date().toISOString(), 'aviso', 'grupo_sin_jornadas',
                  `${trabajo.temporada}/${trabajo.competicion}/${trabajo.grupo}: la federación lista el grupo pero no publica jornadas; marcado ausente para que su competición pueda publicarse`);
              console.warn('    · grupo marcado como «la fuente no publica este grupo» y sus trabajos cerrados.');
            }
          }
        } else {
          // Primer reintento pronto (una respuesta vacía suele ser momentánea) y el segundo al día
          // siguiente, sin frenar el resto de la federación.
          const horas = intentos === 1 ? 2 : 24;
          const siguiente = new Date(Date.now() + horas * 60 * 60_000).toISOString();
          marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, siguiente);
          console.warn(`  ! ${mensaje}. Se reintentará después de ${siguiente}.`);
        }
        if (!ausenciaEsperable && fallosSeguidos >= 5) {
          // Una hora, no seis. Evidencia del 11/09/2026: cuatro federaciones (Asturias, Extremadura,
          // Murcia y Navarra) se pusieron en pausa en menos de dos horas por «página vacía o sin
          // contenido», y todas ellas mientras la máquina estaba a tope (16 recolectores con su
          // Chrome y menos de 2 GB de RAM libre). Es poco creíble que cuatro webs distintas fallen a
          // la vez y mucho más que el fallo sea nuestro: cuando a Chrome le falta memoria devuelve
          // páginas vacías. Con la pausa de 6 h, un problema local dejaba cuatro federaciones paradas
          // media jornada. Una hora sigue dando el respiro que pide una web que va mal, y si el
          // problema persiste la pausa se vuelve a poner sola.
          const hasta = establecePausaGlobal(db, 1, `${fallosSeguidos} fallos seguidos: ${mensaje}`, trabajo);
          console.error(`  Pausa global preventiva hasta ${hasta} por fallos repetidos.`);
          break;
        }
        continue;
      }
    }
  } finally {
    // Y se vuelca lo que quede sin escribir: si la sesión se corta (un fallo, un reinicio del contenedor), lo
    // medido hasta ahí no se pierde.
    perfVuelca();
    if (driver) await driver.quit().catch(() => {});
    // Al cerrar la sesión se limpia lo que el navegador deja detrás. Es el momento en que NADIE usa este
    // perfil, así que no hay ninguna sesión viva que proteger, y evita que la basura de esta sesión se sume a
    // la de las demás federaciones hasta que el sistema empiece a paginar.
    limpiaChromeHuerfanoDeEstePerfil();
    liberaSlotChrome(slotChrome?.ruta);
  }
  exportaInventario(db);
  console.log(`Sesión terminada: ${hechos}/${max} trabajos.`);
}

function preparaPlan(db) {
  if (!existsSync(CATALOGO_EXISTENTE)) throw new Error(`No existe ${CATALOGO_EXISTENTE}`);
  const r = preparaDesdeCatalogo(db, leeJson(CATALOGO_EXISTENTE), numero('desde', 2015));
  const grupos = existsSync(GRUPOS_EXISTENTES)
    ? preparaGruposDesdeCatalogo(db, leeJson(GRUPOS_EXISTENTES), numero('desde', 2015))
    : 0;
  console.log(`Plan local preparado: ${r.temporadas} temporadas y ${r.competiciones} competiciones candidatas.`);
  if (grupos) console.log(`También se cargaron ${grupos} códigos de grupo candidatos ya existentes.`);
  return { ...r, grupos };
}

function reprocesaDescargas(db) {
  const jornadas = db.prepare(`select temporada,competicion,grupo,numero jornada,archivo,hash
    from jornadas where archivo is not null order by temporada,competicion,grupo,numero`).all();
  let procesadas = 0;
  let fallidas = 0;
  for (const j of jornadas) {
    try {
      const html = decodificaHtml(leeArchivo(j.archivo) ?? readFileSync(j.archivo));
      registraJornada(db, j, html, j.archivo, j.hash ?? 'reprocesado');
      procesadas++;
    } catch (error) {
      fallidas++;
      db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`)
        .run(new Date().toISOString(), 'aviso', 'reprocesado',
          `${j.temporada}/${j.competicion}/${j.grupo}/J${j.jornada}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const actas = db.prepare(`select codigo acta,temporada,competicion,grupo,jornada,menores,archivo,hash
    from actas where archivo is not null order by temporada,competicion,grupo,jornada,codigo`).all();
  let actasProcesadas = 0;
  let actasFallidas = 0;
  let actasCerradas = 0;
  for (const acta of actas) {
    try {
      const html = decodificaHtml(leeArchivo(acta.archivo) ?? readFileSync(acta.archivo));
      const parseada = contextualizaActa(db, acta, parseaActa(html));
      const calidad = evaluaCalidadActa(db, acta, parseada, html);
      guardaJson(rutaJsonDeArchivo(acta.archivo), parseada, db, 'acta');
      guardaActaEstructura(db, acta, acta, parseada);
      reconciliaEnlaceActa(db, acta, parseada);
      // Un acta que se archivó sin analizar (porque el parser no entendía su maquetación) se queda
      // en 'pendiente' —o en 'sin_datos' si la ficha venía vacía— y sin marca de hecha, así que no se
      // publica ni se ve en la web. Al reprocesarla con un parser mejor hay que cerrarla de verdad.
      // Sólo se hace si el análisis ha sacado algo utilizable y si el acta estaba pendiente o sin
      // datos: nunca se reabre ni se cierra una acta que estuviera en otro estado por una decisión de
      // alcance.
      const util = ((parseada.lineups?.local?.titulares?.length ?? 0) +
        (parseada.lineups?.local?.suplentes?.length ?? 0) +
        (parseada.lineups?.visitante?.titulares?.length ?? 0) +
        (parseada.lineups?.visitante?.suplentes?.length ?? 0) > 0) ||
        (parseada.goles?.length ?? 0) > 0 || (parseada.tecnicos?.length ?? 0) > 0;
      const estadoActual = db.prepare(`select estado from actas where temporada=? and competicion=?
        and grupo=? and jornada=? and codigo=?`)
        .get(acta.temporada, acta.competicion, acta.grupo, acta.jornada, acta.acta)?.estado;
      const cierra = util && (estadoActual === 'pendiente' || estadoActual === 'sin_datos');
      db.prepare(`update actas set datos=?,comprobada_en=?,version_parser=?,calidad=?,incidencias=?
        ${cierra ? ", estado='hecha'" : ''}
        where temporada=? and competicion=?
        and grupo=? and jornada=? and codigo=?`).run(JSON.stringify(parseada), new Date().toISOString(),
        VERSION_PARSER_ACTA, calidad.calidad, JSON.stringify(calidad.incidencias),
        acta.temporada, acta.competicion, acta.grupo, acta.jornada, acta.acta);
      if (cierra) {
        db.prepare(`update trabajos set estado='hecho',siguiente_intento=null,ultimo_error=null,
          actualizado_en=? where tipo='acta' and temporada=? and competicion=? and grupo=? and jornada=?
          and acta=? and estado!='hecho'`)
          .run(new Date().toISOString(), acta.temporada, acta.competicion, acta.grupo, acta.jornada, acta.acta);
        actasCerradas++;
      }
      actasProcesadas++;
    } catch (error) {
      actasFallidas++;
      db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`)
        .run(new Date().toISOString(), 'aviso', 'reprocesado_acta',
          `${acta.acta}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const legacy = readdirSync(join(RAIZ, 'descargas-federacion'), { withFileTypes: true })
    .filter((e) => e.isFile() && /^comp-(\d+)-gr-(\d+)-acta-(\d+)\.html$/i.test(e.name));
  let legacyProcesadas = 0;
  for (const entrada of legacy) {
    const m = /^comp-(\d+)-gr-(\d+)-acta-(\d+)\.html$/i.exec(entrada.name);
    if (!m) continue;
    const grupo = db.prepare(`select g.temporada,c.nombre from grupos g join competiciones c
      on c.temporada=g.temporada and c.codigo=g.competicion where g.competicion=? and g.codigo=?
      order by cast(g.temporada as integer) desc limit 1`).get(m[1], m[2]);
    if (!grupo) continue;
    const archivo = join(RAIZ, 'descargas-federacion', entrada.name);
    const html = decodificaHtml(leeArchivo(archivo) ?? readFileSync(archivo));
    const parseadaInicial = parseaActa(html);
    if (!parseadaInicial.jornada) continue;
    const trabajo = { temporada: grupo.temporada, competicion: m[1], grupo: m[2],
      jornada: parseadaInicial.jornada, acta: m[3] };
    const parseada = contextualizaActa(db, trabajo, parseadaInicial);
    const acta = { ...trabajo, menores: esCompeticionDeMenores(grupo.nombre) ? 1 : 0 };
    const calidad = evaluaCalidadActa(db, trabajo, parseada, html);
    db.prepare(`insert into actas(codigo,temporada,competicion,grupo,jornada,menores,estado,archivo,datos,
      comprobada_en,version_parser,calidad,incidencias)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(temporada,competicion,grupo,jornada,codigo) do update set
      estado='hecha',archivo=excluded.archivo,datos=excluded.datos,comprobada_en=excluded.comprobada_en,
      version_parser=excluded.version_parser,calidad=excluded.calidad,incidencias=excluded.incidencias`)
      .run(trabajo.acta, trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada,
        acta.menores, 'hecha', archivo, JSON.stringify(parseada), new Date().toISOString(),
        VERSION_PARSER_ACTA, calidad.calidad, JSON.stringify(calidad.incidencias));
    guardaActaEstructura(db, trabajo, acta, parseada);
    reconciliaEnlaceActa(db, trabajo, parseada);
    legacyProcesadas++;
  }
  reprioritizaPlan(db);
  console.log(JSON.stringify({ jornadas: jornadas.length, procesadas, fallidas,
    actas: actas.length, actasProcesadas, actasFallidas, actasCerradas, legacyProcesadas }, null, 2));
}

const db = abreBase(BASE);
try {
  if (comando === 'preparar') {
    preparaPlan(db);
    console.log(JSON.stringify(resumen(db), null, 2));
  } else if (comando === 'estado') {
    console.log(JSON.stringify({
      ...resumen(db),
      pausaGlobalHasta: leeMetadato(db, 'pausa_global_hasta') || null,
      pausaGlobalMotivo: leeMetadato(db, 'pausa_global_motivo') || null,
    }, null, 2));
  } else if (comando === 'exportar') {
    console.log(JSON.stringify(exportaInventario(db).cobertura, null, 2));
  } else if (comando === 'plan-muestras') {
    const plan = generaPlanMuestras(db);
    console.log(JSON.stringify({
      temporadas: new Set(plan.muestras.map((m) => m.temporada)).size,
      muestras: plan.totalMuestras,
      peticionesEstimadas: plan.peticionesEstimadas,
    }, null, 2));
  } else if (comando === 'reprocesar') {
    reprocesaDescargas(db);
  } else if (comando === 'reparar-actas') {
    // Mantenimiento puramente local y acotable: actualiza actas ya archivadas al parser vigente
    // sin recorrer jornadas ni realizar ninguna petición a la federación.
    const limite = Math.max(1, Number(argumento('limite', Number.MAX_SAFE_INTEGER)) || 1);
    const pendientes = cuentaActasDesactualizadas(db);
    const reparacion = reparaActasDesactualizadas(db, Math.min(pendientes, limite));
    console.log(JSON.stringify({ pendientesAntes: pendientes, limite,
      reparadas: reparacion.procesadas, fallidas: reparacion.fallidas,
      pendientesDespues: cuentaActasDesactualizadas(db) }, null, 2));
  } else if (comando === 'repaso-reciente') {
    console.log(JSON.stringify(preparaRepasoJornadasRecientes(db), null, 2));
  } else if (comando === 'ejecutar') {
    await ejecutar(db);
  } else if (comando === 'arrancar') {
    preparaPlan(db);
    // La red es prioritaria. La reparación usa únicamente HTML ya archivado y se ejecuta al final,
    // con Chrome cerrado, para que una actualización masiva del parser no hunda el ritmo visible.
    const LOTE_REPARACION = 150;
    const pendientesReparar = cuentaActasDesactualizadas(db);
    await ejecutar(db);
    if (pendientesReparar) {
      const lote = Math.min(pendientesReparar, LOTE_REPARACION);
      console.log(`Mantenimiento local posterior: ${pendientesReparar} actas con versión antigua; ` +
        `se reparan ${lote} con el navegador ya cerrado.`);
      const reparacion = reparaActasDesactualizadas(db, lote);
      console.log(`  · reparadas ${reparacion.procesadas}, fallidas ${reparacion.fallidas}.`);
    }
  } else {
    console.error('Uso: node scripts/recolector-local.mjs preparar|estado|exportar|plan-muestras|reprocesar|reparar-actas|repaso-reciente|ejecutar|arrancar [opciones]');
    process.exitCode = 1;
  }
} finally {
  db.close();
}
