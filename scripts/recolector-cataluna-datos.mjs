#!/usr/bin/env node
/**
 * Cola local de Cataluña (FCF).
 *
 * La FCF no usa PNFG ni iSquad y su `robots.txt` excluye `/api/`, así que sus datos sólo aparecen
 * cuando la propia página permitida los carga en un navegador real. El descubrimiento —temporadas,
 * disciplinas, competiciones y grupos, con su HTML ya renderizado— lo hace
 * `recolector-cataluna.mjs` y lo deja en `descargas-cataluna/catalogo-fcf.json`.
 *
 * Este script traduce ese catálogo a la MISMA cola SQLite que usan las demás federaciones
 * (`abreBase`), para que la web y el visor vean Cataluña como al resto: mismas tablas y mismos
 * estados de trabajo. No abre ninguna conexión de red.
 *
 * Uso:
 *   node scripts/recolector-cataluna-datos.mjs preparar   # vuelca el catálogo en la cola
 *   node scripts/recolector-cataluna-datos.mjs arrancar   # captura calendario, clasificación y actas
 *   node scripts/recolector-cataluna-datos.mjs estado     # resumen de la cola
 *
 * Lo que se midió en el portal antes de escribirlo (12/09/2026), porque condiciona el diseño:
 *   · la URL `?temporadaId&disciplinaId&competicioId&grupId` abre el grupo sin tocar desplegables;
 *   · el HTML que se guarda justo tras seleccionar aún dice «Carregant dades…»: hay que esperar;
 *   · desplegar una jornada del calendario NO pide nada al servidor (es trabajo del navegador), así
 *     que las 30-38 jornadas de un grupo se leen de una sola carga de página;
 *   · el calendario trae equipos y el código de acta, pero NO el marcador: el marcador y las
 *     alineaciones están en la ficha `/ca/competicio/acta/<codacta>`, que sólo se puede pedir con
 *     navegador (con `fetch` responde 202 y un desafío de JavaScript).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { freemem } from 'node:os';
import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import {
  abreBase, basePrioridadCompeticion, encola, enTransaccion, etiquetaTemporada, guardaActaEstructura,
  guardaAtomico, guardaMetadato, leeArchivo, marcaTrabajo, pausaGlobalActiva, registraPeticion, rutaGrupo,
  siguienteTrabajo, claveTrabajo, reactiva,
} from './lib/recolector-local.mjs';
// El día civil de Madrid, compartido con el supervisor y la flota (antes estaba copiado en tres guiones).
import { diaDeMadrid } from './lib/dia-madrid.mjs';
// Suelo de temporadas: sólo de 2023-24 en adelante. Ver `scripts/lib/temporada-minima.mjs`.
import { TEMPORADA_MINIMA, sqlExcluyeTemporadasViejas } from './lib/temporada-minima.mjs';
// Sin publicidad ni rastreadores: es la palanca de CPU y memoria más directa (ver el comentario del fichero).
import { bloqueaTerceros } from './lib/bloqueo-terceros.mjs';
import { banderasDeChrome } from './lib/banderas-chrome.mjs';
import { RESERVA_GB } from './lib/presupuesto-memoria.mjs';
// Qué hacer cuando la pestaña de clasificación no trae tabla (grupo sin jugar, calendario sin leer o maquetación).
import { decideClasificacionSinTabla } from './lib/clasificacion-cataluna.mjs';
import { interpretaCabeceraJornadaFcf } from './lib/calendario-cataluna.mjs';

const RAIZ = resolve(import.meta.dirname, '..');
// Los datos de cada grupo viven bajo `recolector-local/`, igual que en el resto de federaciones: es
// donde la web construye la ruta para leer el calendario y la clasificación. El catálogo y el HTML de
// los grupos los escribe el descubridor un nivel por encima (`descargas-cataluna/`), y ahí se quedan.
const CARPETA_BASE = join(RAIZ, 'descargas-cataluna');
const CARPETA = join(CARPETA_BASE, 'recolector-local');
const CATALOGO = join(CARPETA_BASE, 'catalogo-fcf.json');
const BASE_DATOS = join(CARPETA, 'cola-v2.sqlite');
const CONFIGURACION = join(RAIZ, 'recolector.cataluna.config.json');

/** Configuración del proyecto (`recolector.cataluna.config.json`), si existe. */
function config(ruta, defecto) {
  try {
    const doc = JSON.parse(readFileSync(CONFIGURACION, 'utf8').replace(/^\uFEFF/, ''));
    const valor = ruta.split('.').reduce((acc, clave) => (acc == null ? undefined : acc[clave]), doc);
    return valor === undefined ? defecto : valor;
  } catch { return defecto; }
}
const PORTAL = 'https://www.fcf.cat/ca/competicio';
/** Versión del intérprete de actas de la FCF. Súbela al corregir la interpretación: las actas
 *  guardadas con una versión anterior se vuelven a interpretar desde su fichero, sin pedir nada. */
const VERSION_PARSER = 3;
const comando = process.argv[2] ?? 'estado';
const fechaLocal = () => diaDeMadrid();

// Mismas fases que el resto del proyecto: un número menor se atiende antes. El descubrimiento
// (1.x) va antes que los datos (2.x) y, dentro de los datos, el calendario antes que el acta.
const FASES = {
  catalogo_temporada: { fase: 1, sub: 0 },
  grupos: { fase: 1, sub: 1 },
  calendario: { fase: 1, sub: 2 },
  clasificacion: { fase: 1, sub: 3 },
  jornada: { fase: 2, sub: 0 },
  acta: { fase: 2, sub: 1 },
};
const TIPOS_GLOBALES = new Set(['catalogo_temporada']);
const CARRIL_DESCUBRIMIENTO = -1_000_000_000;
const CARRIL_CATALOGO = -2_000_000_000;

function argumento(nombre, defecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : defecto;
}

const ahoraIso = () => new Date().toISOString();

/** Categoría de la competición adaptada a los nombres catalanes.
 *
 *  Dos cosas que la función compartida no ve en la FCF:
 *   · «ALEVÍ S11» o «BENJAMÍ S9» no coinciden con «alevín»/«benjamín» (piden la n final), así que no
 *     se reconocían como categorías de base;
 *   · casi todas las competiciones de base se llaman «Promoció ascens …» y la palabra «ascens» las
 *     mandaba al primer nivel, por delante de las ligas sénior;
 *   · y las ligas sénior catalanas («PRIMERA CATALANA», «SEGONA CATALANA», «TERCERA CATALANA») no
 *     encajaban en ningún patrón español y caían todas al mismo cajón de «otras».
 *
 *  Se corrige sólo aquí, sin tocar la función común, que ordena bien al resto de federaciones. */
function baseCatalana(nombre) {
  const competicion = String(nombre ?? '');
  const base = basePrioridadCompeticion(competicion);
  const esCategoriaDeBase = /alev[ií]|benjam[ií]|prebenjam|infantil|cadet|juvenil|xuvenil|debutant|iniciaci[oó]|querub[ií]/i
    .test(competicion);
  if (esCategoriaDeBase && base < 60) return 80;
  if (base !== 100) return base;
  if (/primera\s+catalana/i.test(competicion)) return 60;
  if (/segona\s+catalana/i.test(competicion)) return 70;
  if (/tercera\s+catalana/i.test(competicion)) return 90;
  return 100;
}

/** Prioridad con la misma forma que el resto de federaciones.
 *
 *  El término de categoría domina, así que una competición importante se termina entera antes de
 *  empezar la estructura de otra secundaria; la antigüedad ordena dentro de la misma categoría y la
 *  fase decide qué se hace antes dentro de la misma competición. */
function prioridadPlaneada(tipo, nombreCompeticion, temporada) {
  const fase = FASES[tipo] ?? { fase: 9, sub: 9 };
  const base = TIPOS_GLOBALES.has(tipo) ? 0 : baseCatalana(nombreCompeticion ?? '');
  const codigo = Number(temporada);
  const antiguedad = Number.isFinite(codigo) ? Math.max(0, 100 - codigo) : 100;
  const orden = base * 1_000_000 + antiguedad * 10_000 + fase.fase * 1_000 + fase.sub * 100;
  if (tipo === 'catalogo_temporada') return CARRIL_CATALOGO + orden;
  return tipo === 'grupos' ? CARRIL_DESCUBRIMIENTO + orden : orden;
}

function leeCatalogo() {
  if (!existsSync(CATALOGO)) throw new Error(`No existe el catálogo de Cataluña: ${CATALOGO}`);
  return JSON.parse(readFileSync(CATALOGO, 'utf8').replace(/^\uFEFF/, ''));
}

/**
 * Vuelca el catálogo descubierto en la cola.
 *
 *  Sólo entran los grupos que ya tienen identificador: los que aún no lo tienen siguen siendo
 *  trabajo del descubridor, que es quien sabe manejar los desplegables de la FCF. Es idempotente:
 *  `encola` conserva el estado de los trabajos existentes y los `on conflict` sólo refrescan el
 *  nombre y la fecha de comprobación.
 */
function preparaCola(db, datos) {
  let temporadas = 0; let competiciones = 0; let grupos = 0; let sinIdentificador = 0;
  const insertaTemporada = db.prepare(`insert into temporadas(codigo,etiqueta,origen,comprobada_en)
    values(?,?,?,?) on conflict(codigo) do update set etiqueta=excluded.etiqueta`);
  const insertaCompeticion = db.prepare(`insert into competiciones(temporada,codigo,nombre,origen,comprobada_en)
    values(?,?,?,?,?) on conflict(temporada,codigo) do update set nombre=excluded.nombre,
    comprobada_en=excluded.comprobada_en`);
  const insertaGrupo = db.prepare(`insert into grupos(temporada,competicion,codigo,nombre,estado,comprobado_en)
    values(?,?,?,?,'presente',?) on conflict(temporada,competicion,codigo) do update set
    nombre=excluded.nombre, comprobado_en=excluded.comprobado_en`);
  // La web sólo publica una competición si `grupos_comprobados_en` tiene fecha: es su forma de saber
  // que ya se conocen TODOS los grupos. En las federaciones pnfg lo marca el trabajo `grupos`; aquí
  // el equivalente es este volcado, y sin él Cataluña se habría quedado invisible para siempre por
  // muy completo que estuviera todo lo demás (medido el 12/09/2026: 291 competiciones, 0 marcadas).
  const marcaGruposComprobados = db.prepare(`update competiciones set grupos_comprobados_en=?
    where temporada=? and codigo=?`);
  let comprobadas = 0;
  enTransaccion(db, () => {
    for (const temporada of datos.temporadas ?? []) {
      if (!temporada.id) continue;
      insertaTemporada.run(temporada.id, etiquetaTemporada(temporada.id), 'fcf', ahoraIso());
      temporadas += 1;
      encola(db, 'catalogo_temporada', { temporada: temporada.id },
        prioridadPlaneada('catalogo_temporada', '', temporada.id));
      for (const disciplina of temporada.disciplinas ?? []) {
        for (const competicion of disciplina.competiciones ?? []) {
          if (!competicion.id) continue;
          insertaCompeticion.run(temporada.id, competicion.id, competicion.nombre, 'fcf', ahoraIso());
          competiciones += 1;
          encola(db, 'grupos', { temporada: temporada.id, competicion: competicion.id },
            prioridadPlaneada('grupos', competicion.nombre, temporada.id));
          const suyos = competicion.grupos ?? [];
          /*
           * Se marca cuando el catálogo tiene TODOS los grupos de la competición resueltos: si se marcara con
           * alguno sin identificador, la web podría publicar la competición creyendo que está entera y
           * faltándole un grupo.
           *
           * Y también cuando el catálogo dice EXPLÍCITAMENTE que no tiene grupos (lista vacía). Antes se exigía
           * `suyos.length > 0`, así que las competiciones sin grupos —fútbol playa, copas y ligas de base de
           * fútbol sala— se quedaban sin verificar para siempre: su trabajo `grupos` estaba hecho, la web no las
           * publica (exige `grupos_comprobados_en`) y no había forma de cerrar la cobertura. Medido el
           * 19/09/2026 en el catálogo de la FCF: **379 competiciones, las 379 con la clave `grupos`, y 19 con la
           * lista vacía**. Si la clave NO estuviera, no se marca: eso sería un volcado incompleto.
           */
          const listaConocida = Array.isArray(competicion.grupos);
          if (listaConocida && suyos.every((g) => g.id)) {
            marcaGruposComprobados.run(ahoraIso(), temporada.id, competicion.id);
            comprobadas += 1;
          }
          for (const grupo of suyos) {
            if (!grupo.id) { sinIdentificador += 1; continue; }
            insertaGrupo.run(temporada.id, competicion.id, grupo.id, grupo.nombre, ahoraIso());
            grupos += 1;
            // La URL completa queda en el propio trabajo: con los cuatro identificadores la página
            // abre el grupo directamente, sin manejar los desplegables (medido el 12/09/2026).
            const url = `${PORTAL}?temporadaId=${temporada.id}&disciplinaId=${disciplina.id}` +
              `&competicioId=${competicion.id}&grupId=${grupo.id}`;
            // El HTML del grupo ya está descargado por el descubridor: lo que falta son los datos.
            encola(db, 'calendario', { temporada: temporada.id, competicion: competicion.id, grupo: grupo.id },
              prioridadPlaneada('calendario', competicion.nombre, temporada.id), url);
            encola(db, 'clasificacion', { temporada: temporada.id, competicion: competicion.id, grupo: grupo.id },
              prioridadPlaneada('clasificacion', competicion.nombre, temporada.id), url);
          }
        }
      }
    }
  });
  guardaMetadato(db, 'catalogo_volcado_en', ahoraIso());
  // Las prioridades se congelan al encolar, así que si se afina la categoría de una competición hay
  // que reescribirlas: se recalculan los trabajos que siguen vivos con el nombre actual.
  const vivos = db.prepare(`select t.clave, t.tipo, t.temporada, c.nombre competicionNombre
    from trabajos t left join competiciones c on c.temporada = t.temporada and c.codigo = t.competicion
    where t.estado in ('pendiente','bloqueado','en_curso')`).all();
  let reordenados = 0;
  enTransaccion(db, () => {
    const actualiza = db.prepare('update trabajos set prioridad=? where clave=? and prioridad<>?');
    for (const f of vivos) {
      const nueva = prioridadPlaneada(f.tipo, f.competicionNombre, f.temporada);
      if (Number(actualiza.run(nueva, f.clave, nueva).changes ?? 0)) reordenados += 1;
    }
  });
  // El descubrimiento lo hace `recolector-cataluna.mjs`, así que estas fases ya están satisfechas
  // cuando el catálogo existe: se marcan hechas para no confundir a la cola de datos (que sólo
  // atiende calendario, clasificación y actas).
  const cerrados = enTransaccion(db, () => db.prepare(`update trabajos set estado='hecho',actualizado_en=?
    where tipo in ('catalogo_temporada','grupos') and estado<>'hecho'`).run(ahoraIso()).changes);
  return { temporadas, competiciones, grupos, sinIdentificador, comprobadas, reordenados, cerrados: Number(cerrados ?? 0) };
}

/** Cataluña obtiene todas las jornadas de un grupo con una visita. Si ese grupo se leyó antes de
 * que apareciesen resultados o actas, se vuelve a abrir tras el fin de semana como máximo cada
 * 18 horas. Las actas ya terminadas no se reabren. */
function preparaRepasoJornadasRecientes(db) {
  const actual = db.prepare('select max(cast(codigo as integer)) codigo from temporadas').get()?.codigo;
  if (actual == null) return { grupos: 0, clasificaciones: 0 };
  const temporada = String(actual);
  const hoy = fechaLocal();
  const desde = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' })
    .format(new Date(Date.now() - 4 * 24 * 60 * 60_000));
  const umbral = new Date(Date.now() - 18 * 60 * 60_000).toISOString();
  const recientes = db.prepare(`select distinct competicion,grupo from jornadas
    where temporada=? and fecha>=? and fecha<?`).all(temporada, desde, hoy);
  let grupos = 0;
  let clasificaciones = 0;
  enTransaccion(db, () => {
    for (const g of recientes) {
      for (const tipo of ['calendario', 'clasificacion']) {
        const datos = { temporada, competicion: g.competicion, grupo: g.grupo };
        const clave = claveTrabajo(tipo, datos);
        const anterior = db.prepare('select estado,actualizado_en,url from trabajos where clave=?').get(clave);
        if (anterior?.estado !== 'hecho' || (anterior.actualizado_en && anterior.actualizado_en >= umbral)) continue;
        encola(db, tipo, datos, tipo === 'calendario' ? 2 : 3, anterior.url);
        reactiva(db, clave);
        if (tipo === 'calendario') grupos += 1;
        else clasificaciones += 1;
      }
    }
  });
  return { grupos, clasificaciones };
}

function resumenCola(db) {
  const uno = (sql) => db.prepare(sql).get().n;
  const porTipo = db.prepare(`select tipo, count(*) total, sum(estado='hecho') hecho from trabajos
    group by tipo order by min(prioridad)`).all();
  return {
    total: uno('select count(*) n from trabajos'),
    hecho: uno("select count(*) n from trabajos where estado='hecho'"),
    pendiente: uno("select count(*) n from trabajos where estado='pendiente'"),
    bloqueado: uno("select count(*) n from trabajos where estado='bloqueado'"),
    cancelado: uno("select count(*) n from trabajos where estado='cancelado'"),
    temporadas: uno('select count(*) n from temporadas'),
    competiciones: uno('select count(*) n from competiciones'),
    grupos: uno('select count(*) n from grupos'),
    jornadas: uno('select count(*) n from jornadas'),
    partidos: uno('select count(*) n from partidos'),
    actas: uno('select count(*) n from actas'),
    actasHechas: uno("select count(*) n from actas where estado='hecha'"),
    porTipo,
    pausa: pausaGlobalActiva(db),
  };
}

/* ==================== Captura de datos ==================== */

/** Ritmo respetuoso: separa los comienzos de petición y para al llegar al tope diario. */
class Ritmo {
  constructor(db, minimo, maximo, maximoDia) {
    this.db = db; this.minimo = minimo; this.maximo = maximo; this.maximoDia = maximoDia;
    this.ultima = 0;
  }

  async antes() {
    const espera = this.ultima + this.minimo * 1000 - Date.now();
    const ms = Math.max(0, espera) + Math.round(Math.random() * (this.maximo - this.minimo) * 1000);
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    this.ultima = Date.now();
  }

  /** Petición registrada, con el mismo formato que las demás federaciones. */
  async pide(trabajo, url, accion) {
    await this.antes();
    const inicio = Date.now();
    const iniciadaEn = new Date(inicio).toISOString();
    try {
      const resultado = await accion();
      registraPeticion(this.db, { trabajo: trabajo.clave, url, iniciadaEn,
        duracionMs: Date.now() - inicio, resultado: 'ok', detalle: resultado?.detalle ?? null });
      return resultado;
    } catch (error) {
      registraPeticion(this.db, { trabajo: trabajo.clave, url, iniciadaEn,
        duracionMs: Date.now() - inicio, resultado: error?.publicacion ? 'sin_publicar' : 'error',
        detalle: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}

/** Error de fuente: `bloqueo` es una negativa explícita; `publicacion` que aún no está. */
class ErrorFuente extends Error {
  constructor(mensaje, bloqueo = false, publicacion = false) {
    super(mensaje);
    this.bloqueo = bloqueo;
    this.publicacion = publicacion;
  }
}

function opcionesChrome() {
  const op = new chrome.Options();
  /*
   * Las banderas viven en `lib/banderas-chrome.mjs`, compartidas con el recolector de las PNFG: así el
   * aislamiento de sitios apagado, el techo del montón de V8 y los servicios auxiliares que no se usan valen
   * para los dos y no se separan con el tiempo. Aquí sólo queda lo propio de Cataluña: siempre sin cabeza
   * (es un portal pesado y así se contiene la memoria), en catalán y con ventana más grande porque su
   * maquetación lo pide.
   */
  op.addArguments(...banderasDeChrome({
    variante: 'cataluna',
    lang: 'ca-ES',
    identidad: 'FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)',
  }));
  op.setUserPreferences({ 'profile.default_content_setting_values.notifications': 2 });
  return op;
}

/** Espera a que la página deje de decir «Carregant dades…» y tenga contenido. */
async function esperaDatos(driver, ms = 40000) {
  await driver.wait(async () => Boolean(await driver.executeScript(`
    const principal = document.querySelector('main') || document.body;
    const texto = principal.innerText || '';
    return !/Carregant dades/i.test(texto) && texto.trim().length > 400;`)), ms);
}

/**
 * Lee el calendario completo de un grupo en una sola pasada.
 *
 *  Se despliegan las jornadas una a una porque la página mantiene sólo una abierta, pero desplegar
 *  NO pide nada al servidor: son 30-38 operaciones locales sobre el DOM ya cargado, sin tráfico.
 */
const EXTRAE_CALENDARIO = `
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const interpretaCabecera = ${interpretaCabeceraJornadaFcf.toString()};
  const principal = document.querySelector('main') || document.body;
  const cabeceras = [...principal.querySelectorAll('span,div,h3,h4')]
    .filter((e) => e.children.length === 0 && interpretaCabecera(e.textContent));
  const salida = [];
  for (const cabecera of cabeceras) {
    const interpretada = interpretaCabecera(cabecera.textContent);
    const numero = interpretada.numero;
    const cabeceraFila = cabecera.closest('div[class*="cursor-pointer"]') || cabecera.parentElement;
    const fecha = interpretada.fecha ?? (cabeceraFila.innerText.match(/\\d{4}-\\d{2}-\\d{2}/) || [])[0] ?? null;
    cabeceraFila.click();
    await dormir(400);
    let bloque = cabecera.parentElement;
    while (bloque && bloque !== document.body
           && bloque.querySelectorAll('a[href*="/ca/competicio/acta/"]').length === 0
           && bloque.querySelectorAll('span[title]').length < 2) bloque = bloque.parentElement;
    if (!bloque) { salida.push({ numero, fecha, partidos: [] }); continue; }
    const enlaces = [...bloque.querySelectorAll('a[href*="/ca/competicio/acta/"]')];
    const filas = [];
    const contenedores = new Set();
    for (const enlace of enlaces) {
      const fila = enlace.parentElement;
      contenedores.add(fila.parentElement);
      filas.push({ fila, codacta: (enlace.getAttribute('href').match(/(\\d+)\\s*$/) || [])[1] ?? null });
    }
    for (const contenedor of contenedores) {
      for (const hija of contenedor.children) {
        if (filas.some((f) => f.fila === hija)) continue;
        if (hija.querySelectorAll('span[title]').length >= 2) filas.push({ fila: hija, codacta: null });
      }
    }
    const partidos = filas.map(({ fila, codacta }) => {
      const nombres = [...fila.querySelectorAll('span[title]')].map((s) => s.getAttribute('title').trim());
      // Cada equipo lleva su enlace de club: de ahí sale el código que usa la web para enlazarlos.
      const clubs = [...fila.querySelectorAll('a[href*="/ca/clubs/"]')]
        .map((a) => (a.getAttribute('href').match(/\\/ca\\/clubs\\/(\\d+)/) || [])[1] ?? null);
      const texto = (fila.innerText || '').replace(/\\s+/g, ' ').trim();
      const marcador = texto.match(/(\\d+)\\s*-\\s*(\\d+)/);
      return {
        local: nombres[0] ?? null,
        codigoLocal: clubs[0] ?? null,
        visitante: nombres.length > 1 ? nombres[nombres.length - 1] : null,
        codigoVisitante: clubs[1] ?? null,
        golesLocal: marcador ? Number(marcador[1]) : null,
        golesVisitante: marcador ? Number(marcador[2]) : null,
        codacta,
      };
    }).filter((p) => p.local && p.visitante);
    salida.push({ numero, fecha, partidos });
  }
  return salida;`;

/** Tabla de clasificación tal cual la pinta la web (se archiva el HTML de la sección). */
const EXTRAE_CLASIFICACION = `
  const principal = document.querySelector('main') || document.body;
  const tabla = principal.querySelector('table');
  if (!tabla) return null;
  const filas = [...tabla.querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('th,td')].map((c) => (c.innerText || '').replace(/\\s+/g, ' ').trim()));
  return { filas, html: tabla.outerHTML };`;

/**
 * Espera a que la pestaña de clasificación pinte su tabla, hasta `ms` milisegundos.
 *
 * `esperaDatos` (que espera a que el área principal tenga texto) da por buena la página en cuanto está el
 * calendario, y la tabla de clasificación se pinta después: medido el 19/09/2026, el recolector extraía la tabla
 * nada más pulsar la pestaña y, en los grupos donde tardaba un poco más, se quedaba sin ella y lo llamaba error.
 * Esto es sondear el DOM ya cargado, sin pedir nada al servidor: si la tabla acaba apareciendo, se aprovecha; y si
 * no aparece en el plazo, se decide con `decideClasificacionSinTabla` (que distingue «sin publicar» de «formato»).
 */
async function esperaTablaClasificacion(driver, ms = 20_000) {
  const limite = Date.now() + ms;
  let ultimo = null;
  for (;;) {
    ultimo = await driver.executeScript(EXTRAE_CLASIFICACION).catch(() => null);
    if (ultimo) return ultimo;
    if (Date.now() >= limite) return null;
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Lee una ficha de acta entera.
 *
 *  La página no usa tablas: son secciones con cabecera `<h3>` (Àrbitres, Gols, Alineacions,
 *  Suplents, Equip Tècnic, y —cuando las hay— TARGETES/ENTRA/SURT). Se devuelve cada sección con sus
 *  filas ya troceadas para poder interpretarlas en Node sin volver a pedir nada.
 */
const EXTRAE_ACTA = `
  const principal = document.querySelector('main') || document.body;
  const titulo = document.title || '';
  const secciones = [...principal.querySelectorAll('h3')].map((h) => {
    const raiz = h.closest('div[class*="rounded"]') || h.parentElement.parentElement;
    const cuerpos = raiz ? [...raiz.children].slice(1) : [];
    const filas = cuerpos.flatMap((c) => [...c.children]).map((fila) => {
      const imagenes = [...fila.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt'));
      const spans = [...fila.querySelectorAll('span')].map((s) => (s.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
      const minutos = (fila.innerText || '').match(/\\d+['’]/g) || [];
      const dorsal = fila.querySelector('span.absolute') ? (fila.querySelector('span.absolute').innerText || '').trim() : null;
      const nombre = fila.querySelector('span.truncate') ? fila.querySelector('span.truncate').innerText.trim() : null;
      const posicion = fila.querySelector('[title]') ? fila.querySelector('[title]').getAttribute('title') : null;
      return {
        texto: (fila.innerText || '').replace(/\\s+/g, ' ').trim(),
        dorsal, nombre, posicion, imagenes, spans, minutos,
      };
    }).filter((f) => f.texto);
    return { titulo: h.textContent.trim(), filas };
  });
  const textoPrincipal = principal.innerText || '';
  const marcador = textoPrincipal.match(/(\\d+)\\s*\\n\\s*-\\s*\\n\\s*(\\d+)/);
  // El bloque «Detalls de l'acta» trae la fecha, la hora y el campo exactos del partido, que es más
  // de lo que da el calendario (allí sólo hay la fecha de la jornada).
  const toma = (etiqueta) => {
    const m = textoPrincipal.match(new RegExp(etiqueta + '\\\\s*:?\\\\s*([^\\\\n]+)', 'i'));
    return m ? m[1].trim() : null;
  };
  return {
    titulo, url: location.href, secciones,
    marcador: marcador ? [Number(marcador[1]), Number(marcador[2])] : null,
    detalles: {
      fecha: toma('DATA'), hora: toma('HORA'), estadio: toma('ESTADI'),
      competicion: toma('COMPETICIÓ'), jornada: toma('JORNADA'),
    },
  };`;

/** Roles del cuerpo técnico tal como los escribe la FCF (leídos de su propio diccionario).
 *
 *  Van de más largo a más corto porque hay roles de dos palabras («DELEGAT CAMP») y cortar por la
 *  primera palabra dejaba el nombre a medias o el rol con un apellido dentro. */
const ROLES_TECNICOS = [
  'ENCARREGAT / DA MATERIAL O ALTRES', 'PREPARADOR FÍSIC, MERGE O A.T.S', 'ENTRENADOR/A AUXILIAR',
  'DELEGAT CAMP', 'DELEGAT EQUIP', 'COORDINADOR/A', 'PREPARADOR FÍSIC', 'ENTRENADOR/A', 'ENTRENADOR',
  'E.PORTERS', 'E. PORTERS', 'A.T.S.', 'AUXILIAR', 'MONITOR', 'DELEGAT',
].sort((a, b) => b.length - a.length);

function parteTecnico(texto) {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim();
  const mayusculas = limpio.toUpperCase();
  for (const rol of ROLES_TECNICOS) {
    if (mayusculas.startsWith(rol)) {
      return { rol, nombre: limpio.slice(rol.length).trim() };
    }
  }
  const palabras = limpio.split(' ');
  return { rol: (palabras[0] ?? '').toUpperCase(), nombre: palabras.slice(1).join(' ') };
}

/** Interpreta la ficha leída y la lleva a la estructura común del proyecto. */
function interpretaActa(acta, equipos) {
  const seccion = (patron, indice = 0) => {
    const encontradas = acta.secciones.filter((s) => patron.test(s.titulo));
    return encontradas[indice] ?? null;
  };
  const [local, visitante] = equipos;
  const lineups = {
    local: { titulares: [], suplentes: [], portero: null },
    visitante: { titulares: [], suplentes: [], portero: null },
  };
  const tecnicos = [];
  const goles = [];
  const tarjetas = [];
  const cambios = [];

  // Los bloques de cada equipo van seguidos y en el mismo orden que el marcador: primero el local.
  const TRIADAS = [['alineacions', 'suplents', 'equip tècnic'], ['alineacions', 'suplents', 'equip tècnic']];
  const usadas = new Set();
  for (const [indiceLado, lado] of ['local', 'visitante'].entries()) {
    for (const [posicion, nombreSeccion] of TRIADAS[indiceLado].entries()) {
      const bloque = acta.secciones.find((s, i) => !usadas.has(i) && s.titulo.toLowerCase().includes(nombreSeccion)
        && (posicion > 0 || s.filas.some((f) => f.nombre)));
      if (!bloque) continue;
      usadas.add(acta.secciones.indexOf(bloque));
      if (nombreSeccion.startsWith('alineacions') || nombreSeccion.startsWith('suplents')) {
        const destino = nombreSeccion.startsWith('alineacions') ? 'titulares' : 'suplentes';
        for (const fila of bloque.filas) {
          if (!fila.nombre) continue;
          const jugador = {
            codigoJugador: null,
            nombre: fila.nombre,
            dorsal: fila.dorsal ? Number(String(fila.dorsal).replace(/\D+/g, '')) || null : null,
          };
          lineups[lado][destino].push(jugador);
          if (fila.posicion && /porter/i.test(fila.posicion) && !lineups[lado].portero) {
            lineups[lado].portero = fila.nombre;
          }
        }
      } else {
        for (const fila of bloque.filas) {
          const texto = fila.texto.replace(/\s+/g, ' ').trim();
          const { rol, nombre } = parteTecnico(texto);
          if (nombre) tecnicos.push({ lado, rol, nombre });
        }
      }
    }
  }

  // Con las alineaciones ya leídas, el nombre del jugador resuelve de qué lado es cada evento: es
  // más fiable que el escudo, que a veces no aparece o no coincide letra a letra.
  const normaliza = (valor) => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  const ladoPorNombre = (nombre) => {
    const clave = normaliza(nombre);
    if (!clave) return null;
    for (const lado of ['local', 'visitante']) {
      const plantilla = [...lineups[lado].titulares, ...lineups[lado].suplentes];
      if (plantilla.some((j) => normaliza(j.nombre) === clave)) return lado;
    }
    return null;
  };

  // Goles: cada fila es «1 - 0 NOMBRE (42') GOL NORMAL (EQUIPO)». El lado sale del marcador
  // acumulado (sube el número del equipo que marca) y, si no cuadra, del nombre del jugador.
  //
  // Cuando el partido acaba sin goles, la sección NO viene vacía: trae una fila de relleno («No hi ha
  // gols registrats»). Si se toma por un gol se inventa un goleador con nombre de frase, así que se
  // descartan las filas sin marcador al principio ni minuto.
  const TIPOS_GOL = { 'GOL NORMAL': 'normal', 'GOL PENAL': 'penalti', 'GOL PENALTI': 'penalti', 'GOL EN PRÒPIA': 'propia-puerta' };
  const RELLENO = /no\s+hi\s+ha|no\s+hay|sense\s+(?:gols|dades)|cap\s+gol|sin\s+datos|no\s+disponible/i;
  let marcadorPrevio = [0, 0];
  const limpia = (texto) => texto.replace(/^\d+\s*-\s*\d+\s*/, '').split('(')[0]
    .replace(/\d+['’].*$/, '').trim();
  for (const fila of seccion(/^gols$/i)?.filas ?? []) {
    const texto = fila.texto.replace(/\s+/g, ' ').trim();
    if (RELLENO.test(texto)) continue;
    const marcador = texto.match(/^(\d+)\s*-\s*(\d+)/);
    if (!marcador) continue;
    const jugador = limpia(texto);
    if (!jugador) continue;
    let lado = null;
    {
      const localAhora = Number(marcador[1]);
      const visitanteAhora = Number(marcador[2]);
      if (localAhora > marcadorPrevio[0] && visitanteAhora === marcadorPrevio[1]) lado = 'local';
      else if (visitanteAhora > marcadorPrevio[1] && localAhora === marcadorPrevio[0]) lado = 'visitante';
      else if (localAhora > marcadorPrevio[0]) lado = 'local';
      else if (visitanteAhora > marcadorPrevio[1]) lado = 'visitante';
      marcadorPrevio = [localAhora, visitanteAhora];
    }
    lado ??= ladoPorNombre(jugador)
      ?? (fila.imagenes.includes(visitante) && visitante ? 'visitante' : 'local');
    const minuto = (fila.minutos[0] ?? '').replace(/[^0-9]/g, '');
    const tipo = Object.keys(TIPOS_GOL).find((clave) => texto.toUpperCase().includes(clave)) ?? 'normal';
    goles.push({ jugador, lado, minuto: minuto ? Number(minuto) : null, tipo: TIPOS_GOL[tipo] ?? 'normal' });
  }
  const TIPOS_TARJETA = [[/GROGUES/i, 'amarilla'], [/DOBLES/i, 'roja'], [/VERMELLES/i, 'roja']];
  for (const [patron, tipo] of TIPOS_TARJETA) {
    for (const fila of seccion(patron)?.filas ?? []) {
      const texto = fila.texto.replace(/\s+/g, ' ').trim();
      const jugador = limpia(texto);
      if (!jugador) continue;
      const minuto = (fila.minutos[0] ?? '').replace(/[^0-9]/g, '');
      const lado = ladoPorNombre(jugador) ?? (fila.imagenes.includes(visitante) && visitante ? 'visitante' : 'local');
      tarjetas.push({ jugador, lado, minuto: minuto ? Number(minuto) : null, tipo });
    }
  }
  // Cambios: se emparejan las listas de «entra al camp» y «surt del camp» del mismo lado por orden.
  for (const lado of ['local', 'visitante']) {
    const filasDe = (patron) => (seccion(patron)?.filas ?? []).filter((f) => {
      const quien = limpia(f.texto.replace(/\s+/g, ' ').trim());
      return (ladoPorNombre(quien) ?? (f.imagenes.includes(visitante) && visitante ? 'visitante' : 'local')) === lado;
    });
    const entran = filasDe(/ENTRA AL CAMP/i);
    const salen = filasDe(/SURT DEL CAMP/i);
    for (const [i, sale] of salen.entries()) {
      const entra = entran[i];
      if (!entra) break;
      cambios.push({
        lado,
        saliente: limpia(sale.texto.replace(/\s+/g, ' ').trim()),
        entrante: limpia(entra.texto.replace(/\s+/g, ' ').trim()),
        minuto: Number((entra.minutos[0] ?? sale.minutos[0] ?? '').replace(/[^0-9]/g, '')) || null,
      });
    }
  }

  const arbitros = (seccion(/^àrbitres$/i)?.filas ?? []).map((f) => f.texto);
  return {
    parseada: { lineups, tecnicos, goles, tarjetas, cambios, golesLocal: acta.marcador?.[0] ?? null,
      golesVisitante: acta.marcador?.[1] ?? null },
    arbitros,
  };
}

/** Lee el calendario de un grupo, guarda jornadas y partidos y encola las actas ya jugadas. */
async function capturaGrupo(driver, db, trabajo, ritmo) {
  const url = trabajo.url ?? `${PORTAL}?competicioId=${trabajo.competicion}&grupId=${trabajo.grupo}`;
  const urlCalendario = new URL(url);
  urlCalendario.searchParams.set('tab', 'calendari');
  const temporadaActual = String(db.prepare(
    'select max(cast(codigo as integer)) codigo from temporadas'
  ).get()?.codigo ?? '');
  const esperaGrupo = async () => {
    try {
      // Un grupo normal de la FCF queda listo en 1-2 s. En la temporada recién creada existen
      // muchos grupos cuyo selector ya está publicado pero cuyo contenido sigue indefinidamente en
      // «Carregant dades…». Quince segundos bastan para distinguirlos sin malgastar 40 s por ficha.
      await esperaDatos(driver, String(trabajo.temporada) === temporadaActual ? 15000 : 40000);
    } catch (error) {
      if (String(trabajo.temporada) === temporadaActual && /wait timed out/i.test(String(error?.message ?? error))) {
        throw new ErrorFuente('grupo de la temporada actual todavía sin datos publicados', false, true);
      }
      throw error;
    }
  };
  await ritmo.pide(trabajo, urlCalendario.toString(), async () => {
    // En Chrome visible el botón cambia a `tab=calendari`, pero en headless el `button.click()`
    // programático dejó repetidamente el DOM en RESULTATS. La ruta es pública y estable; entrar
    // directamente evita depender de un evento de React y sustituye (no añade) la carga del grupo.
    await driver.get(urlCalendario.toString());
    try {
      await driver.wait(async () => Boolean(await driver.executeScript(`
        const principal = document.querySelector('main') || document.body;
        return [...principal.querySelectorAll('span,div,h3,h4')].some((e) =>
          e.children.length === 0 && /^JORNADA\\s+\\d+\\b/i.test((e.textContent || '').trim()));
      `)), String(trabajo.temporada) === temporadaActual ? 15000 : 30000);
    } catch {
      const diagnostico = await driver.executeScript(`
        const principal = document.querySelector('main') || document.body;
        return {
          url: location.href,
          botones: [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim())
            .filter(Boolean).slice(0, 30),
          jornadas: [...principal.querySelectorAll('span,div,h3,h4')]
            .map((e) => (e.textContent || '').replace(/\\s+/g, ' ').trim())
            .filter((t) => /JORNADA/i.test(t)).slice(0, 8),
          texto: (principal.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 240),
        };
      `).catch(() => null);
      const pista = diagnostico ? ` [${JSON.stringify(diagnostico)}]` : '';
      throw new ErrorFuente(`el calendario no muestra ninguna jornada${pista}`, false, true);
    }
    return { detalle: 'calendario visible' };
  });
  const jornadas = await driver.executeScript(EXTRAE_CALENDARIO);
  // Un calendario vacío puede ser una competición aún sin publicar. Nunca se descarta: si la
  // maqueta vuelve a cambiar quedará visible como pendiente, no como una cobertura falsamente cerrada.
  if (!jornadas.length) throw new ErrorFuente('el calendario no muestra ninguna jornada', false, true);

  const nombreComp = db.prepare('select nombre from competiciones where temporada=? and codigo=?')
    .get(trabajo.temporada, trabajo.competicion)?.nombre ?? '';
  const menores = /juvenil|cadet|infantil|alev|benjam|prebenjam|debutant|iniciacio|querubi/i.test(nombreComp) ? 1 : 0;
  const hoy = new Date().toISOString().slice(0, 10);
  const carpeta = rutaGrupo(CARPETA, trabajo.temporada, trabajo.competicion, trabajo.grupo);
  const guardado = guardaAtomico(join(carpeta, 'calendario.json'), JSON.stringify(jornadas, null, 2), db, 'calendario');

  let partidos = 0; let encoladas = 0;
  enTransaccion(db, () => {
    for (const jornada of jornadas) {
      if (!jornada.numero) continue;
      db.prepare(`insert into jornadas(temporada,competicion,grupo,numero,fecha,archivo,hash,comprobada_en)
        values(?,?,?,?,?,?,?,?) on conflict(temporada,competicion,grupo,numero) do update set
        fecha=coalesce(excluded.fecha, jornadas.fecha), archivo=excluded.archivo, hash=excluded.hash,
        comprobada_en=excluded.comprobada_en`)
        .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, jornada.numero, jornada.fecha,
          join(carpeta, 'calendario.json'), guardado.hash, ahoraIso());
      db.prepare(`delete from partidos where temporada=? and competicion=? and grupo=? and jornada=?`)
        .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, jornada.numero);
      jornada.partidos.forEach((partido, orden) => {
        db.prepare(`insert into partidos(temporada,competicion,grupo,jornada,orden,codigo_acta,
          equipo_local_codigo,equipo_visitante_codigo,local,visitante,goles_local,goles_visitante,
          fecha,actualizado_en) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, jornada.numero, orden,
            partido.codacta ?? null, partido.codigoLocal ?? null, partido.codigoVisitante ?? null,
            partido.local, partido.visitante, partido.golesLocal, partido.golesVisitante,
            jornada.fecha, ahoraIso());
        partidos += 1;
        for (const [lado, codigo] of [['local', partido.codigoLocal], ['visitante', partido.codigoVisitante]]) {
          if (!codigo) continue;
          db.prepare(`insert into equipos(temporada,codigo,nombre,primera_jornada) values(?,?,?,?)
            on conflict(temporada,codigo) do update set nombre=excluded.nombre,
            primera_jornada=min(coalesce(equipos.primera_jornada, excluded.primera_jornada), excluded.primera_jornada)`)
            .run(trabajo.temporada, codigo, partido[lado], jornada.numero);
        }
        // Sólo se encola el acta de jornadas ya disputadas: el portal enlaza «VEURE ACTA» incluso en
        // partidos futuros, y pedir esas fichas sería gastar peticiones en actas vacías.
        if (partido.codacta && jornada.fecha && jornada.fecha <= hoy) {
          db.prepare(`insert into actas(codigo,temporada,competicion,grupo,jornada,menores,estado)
            values(?,?,?,?,?,?,'pendiente') on conflict(temporada,competicion,grupo,jornada,codigo)
            do update set menores=excluded.menores`)
            .run(partido.codacta, trabajo.temporada, trabajo.competicion, trabajo.grupo, jornada.numero, menores);
          encola(db, 'acta', {
            temporada: trabajo.temporada, competicion: trabajo.competicion, grupo: trabajo.grupo,
            jornada: jornada.numero, acta: partido.codacta,
          }, prioridadPlaneada('acta', nombreComp, trabajo.temporada));
          encoladas += 1;
        }
      });
    }
    db.prepare(`update grupos set jornadas=?,jornadas_comprobadas_en=? where temporada=? and competicion=? and codigo=?`)
      .run(jornadas.length, ahoraIso(), trabajo.temporada, trabajo.competicion, trabajo.grupo);
  });
  return `calendario: ${jornadas.length} jornadas, ${partidos} partidos, ${encoladas} actas encoladas`;
}

/**
 * Interpreta la tabla de clasificación de la FCF.
 *
 *  La web de la federación pinta en una sola celda las cifras de casa y de fuera PEGADAS: una fila
 *  con «1515» en la columna de partidos jugados son 15 en casa y 15 fuera, «107» son 10 y 7, y «98»
 *  son 9 y 8. Las columnas de goles (F y C) sí van como total. Eso se dedujo comparando tres filas
 *  de una misma tabla con la aritmética de la competición (victorias + empates + derrotas = jugados, y
 *  puntos = 3×victorias + empates).
 *
 *  Aquí no se adivina: se prueban todas las formas de partir cada cifra y se acepta la que cuadra
 *  con esas dos cuentas. Si ninguna cuadra, la fila se descarta en vez de inventar números.
 */
function interpretaClasificacionFcf(filas) {
  if (!Array.isArray(filas) || filas.length < 2) return [];
  const cabecera = filas[0].map((c) => String(c ?? '').trim().toUpperCase());
  const columna = (nombre) => cabecera.findIndex((c) => c === nombre);
  const columnaEmpieza = (prefijo) => cabecera.findIndex((c) => c.startsWith(prefijo));
  const iPosicion = columna('P');
  const iEquipo = columnaEmpieza('EQUIP');
  const iPuntos = columnaEmpieza('PUNT');
  const iJugados = columna('J');
  const iGanados = columna('G');
  const iEmpatados = columna('E');
  const iPerdidos = cabecera.map((c, i) => (c === 'P' ? i : -1)).filter((i) => i > iPosicion).pop() ?? -1;
  const iFavor = columna('F');
  const iContra = columna('C');
  const iUltimos = columnaEmpieza('ÚLTIM') >= 0 ? columnaEmpieza('ÚLTIM') : columnaEmpieza('ULTIM');
  const iSancion = columnaEmpieza('SANC');
  if ([iPosicion, iEquipo, iPuntos, iJugados, iGanados, iEmpatados, iPerdidos].some((i) => i < 0)) return [];

  // Todas las formas de partir una cifra pegada en dos números.
  const partes = (texto) => {
    const limpio = String(texto ?? '').replace(/[^0-9]/g, '');
    const opciones = [];
    for (let corte = 1; corte < limpio.length; corte += 1) {
      opciones.push([Number(limpio.slice(0, corte)), Number(limpio.slice(corte))]);
    }
    if (/^-?\d+$/.test(limpio)) opciones.push([Number(limpio), 0]);
    return opciones;
  };
  const total = ([a, b]) => a + b;

  const salida = [];
  for (const fila of filas.slice(1)) {
    const texto = (i) => String(fila[i] ?? '').replace(/\s+/g, ' ').trim();
    const posicion = Number(texto(iPosicion).replace(/[^0-9]/g, ''));
    const equipo = texto(iEquipo);
    const puntos = Number(texto(iPuntos).replace(/[^0-9.]/g, ''));
    if (!equipo || !Number.isFinite(posicion)) continue;
    const sancionTexto = iSancion >= 0 ? texto(iSancion) : '-';
    const sancion = /^\d+$/.test(sancionTexto.replace(/[^0-9-]/g, ''))
      ? Math.abs(Number(sancionTexto.replace(/[^0-9-]/g, ''))) : 0;
    const ultimos = iUltimos >= 0
      ? (texto(iUltimos).match(/\b[GEP]\b/g) ?? []) : [];
    // Búsqueda de la partición coherente: victorias + empates + derrotas = jugados. Se recogen
    // TODAS las que cumplen esa cuenta y, entre ellas, se prefiere la que además cuadra con los
    // puntos oficiales (3×victorias + empates); si ninguna cuadra con los puntos es porque la
    // federación aplicó una sanción, y entonces vale la que respeta la aritmética de los partidos.
    const candidatas = [];
    for (const j of partes(texto(iJugados))) {
      for (const g of partes(texto(iGanados))) {
        for (const e of partes(texto(iEmpatados))) {
          for (const p of partes(texto(iPerdidos))) {
            const jugados = total(j); const ganados = total(g);
            const empatados = total(e); const perdidos = total(p);
            if (ganados + empatados + perdidos !== jugados) continue;
            candidatas.push({ jugados, ganados, empatados, perdidos,
              cuadraPuntos: Math.abs(3 * ganados + empatados - (puntos + sancion)) < 0.5 });
          }
        }
      }
    }
    const elegida = candidatas.find((c) => c.cuadraPuntos) ?? candidatas[0];
    if (!elegida) continue; // sin partición creíble, la fila no se inventa
    delete elegida.cuadraPuntos;
    salida.push({
      posicion,
      equipoCodigo: null,
      equipo,
      puntos: Number.isFinite(puntos) ? puntos : 3 * elegida.ganados + elegida.empatados,
      ...elegida,
      ultimos,
      sancion,
    });
  }
  return salida;
}

/** Lee la clasificación del grupo (aprovecha la página si ya está abierta). */
async function capturaClasificacion(driver, db, trabajo, ritmo) {
  const base = trabajo.url ?? `${PORTAL}?competicioId=${trabajo.competicion}&grupId=${trabajo.grupo}`;
  const urlClasificacion = new URL(base);
  urlClasificacion.searchParams.set('tab', 'classificacio');
  const tabla = await ritmo.pide(trabajo, urlClasificacion.toString(), async () => {
    await driver.get(urlClasificacion.toString());
    await esperaDatos(driver);
    const datos = await esperaTablaClasificacion(driver);
    if (!datos) {
      /*
       * La pestaña no trae tabla. Antes se lanzaba un error de formato y, a los tres intentos, el trabajo quedaba
       * DESCARTADO: medido el 19/09/2026, 236 fallos en dos días contra grupos de la temporada recién empezada que
       * todavía no habían jugado su primer partido —no había nada que publicar—. La decisión de qué es cada caso
       * vive en `lib/clasificacion-cataluna.mjs`, con sus pruebas.
       */
      const jugados = db.prepare(`select count(*) conocido,
        coalesce(sum(case when goles_local is not null or goles_visitante is not null then 1 else 0 end), 0) jugado
        from partidos where temporada=? and competicion=? and grupo=?`)
        .get(trabajo.temporada, trabajo.competicion, trabajo.grupo);
      const decision = decideClasificacionSinTabla({
        partidosConocidos: jugados?.conocido, partidosJugados: jugados?.jugado,
      });
      throw new ErrorFuente(decision.mensaje, false, decision.publicacion);
    }
    return { detalle: `${datos.filas.length} filas`, datos };
  });
  const carpeta = rutaGrupo(CARPETA, trabajo.temporada, trabajo.competicion, trabajo.grupo);
  // Dos ficheros, y cada uno con su papel:
  //   · `clasificacion.json` es el que lee la web, y espera un ARRAY de filas con los campos
  //     oficiales (posición, equipo, puntos, jugados, ganados, empatados, perdidos, últimos,
  //     sanción). Si no es un array, la web lo ignora y calcula la tabla por su cuenta.
  //   · `clasificacion.html` guarda la tabla tal cual la pinta la federación, para poder revisar sin
  //     volver a pedirla y para reprocesarla si algún día se afina el intérprete.
  const filas = interpretaClasificacionFcf(tabla.datos.filas);
  const guardado = guardaAtomico(join(carpeta, 'clasificacion.json'), JSON.stringify(filas, null, 2),
    db, 'clasificacion');
  guardaAtomico(join(carpeta, 'clasificacion.html'), tabla.datos.html ?? '', db, 'clasificacion-bruta');
  const aviso = filas.length < tabla.datos.filas.length - 1
    ? ` (${tabla.datos.filas.length - 1 - filas.length} filas descartadas por no cuadrar)` : '';
  return `clasificación: ${filas.length} filas (${guardado.bytes} B)${aviso}`;
}

/**
 * Calidad de la interpretación: se compara con dos datos independientes que publica la propia ficha.
 *
 *  El marcador del cabecero y la lista de goles vienen del mismo origen, así que cuando no cuadran es
 *  que la web no dice lo mismo en los dos sitios. Ocurre de verdad: la ficha 3783726 (L'HOSPITALET
 *  2-1 ESPANYOL) lista goles para un 1-2, probablemente porque el marcador se ajustó después por una
 *  alineación indebida. No se corrige nada por nuestra cuenta: se guarda el marcador oficial con la
 *  incidencia anotada para que se vea en el visor y lo revise una persona.
 */
function evaluaCalidad(parseada) {
  const incidencias = [];
  if (parseada.golesLocal !== null && parseada.golesVisitante !== null) {
    const propios = { local: 0, visitante: 0 };
    for (const gol of parseada.goles ?? []) {
      // Un gol en propia puerta cuenta para el rival, que es como se refleja en el marcador.
      const lado = gol.tipo === 'propia-puerta' ? (gol.lado === 'local' ? 'visitante' : 'local') : gol.lado;
      if (lado === 'local' || lado === 'visitante') propios[lado] += 1;
    }
    if (!(parseada.goles ?? []).length && (parseada.golesLocal || parseada.golesVisitante)) {
      incidencias.push('sin_goles_leidos');
    } else if (propios.local !== parseada.golesLocal || propios.visitante !== parseada.golesVisitante) {
      incidencias.push(`goles_no_cuadran:${propios.local}-${propios.visitante}`);
    }
  }
  const titulares = (parseada.lineups?.local?.titulares?.length ?? 0)
    + (parseada.lineups?.visitante?.titulares?.length ?? 0);
  if (titulares === 0) incidencias.push('sin_alineaciones');
  else if (titulares !== 22) incidencias.push(`titulares:${titulares}`);
  return { calidad: incidencias.length ? 'revisar' : 'correcta', incidencias };
}

/** La ficha escribe la fecha como «20.09.2025» y la hora como «15.00H». */
function fechaDeFicha(valor) {
  const m = String(valor ?? '').match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!m) return null;
  const [, dia, mes, anio] = m;
  return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function horaDeFicha(valor) {
  const m = String(valor ?? '').match(/(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  const hora = Number(m[1]);
  if (hora > 23) return null;
  return `${String(hora).padStart(2, '0')}:${m[2]}`;
}

/** Lee una ficha de acta y la guarda con la misma estructura que las demás federaciones. */
async function capturaActa(driver, db, trabajo, ritmo) {
  const acta = db.prepare(`select menores, estado from actas where temporada=? and competicion=?
    and grupo=? and jornada=? and codigo=?`)
    .get(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
  if (!acta) throw new ErrorFuente('acta no registrada en la cola', false, true);
  const url = `${PORTAL.replace('/competicio', '')}/competicio/acta/${trabajo.acta}`;
  const leida = await ritmo.pide(trabajo, url, async () => {
    await driver.get(url);
    await esperaDatos(driver);
    const datos = await driver.executeScript(EXTRAE_ACTA);
    if (!datos.secciones.length) throw new ErrorFuente(`la ficha de acta ${trabajo.acta} no trae secciones`, false, true);
    return { detalle: `${datos.secciones.length} secciones`, datos };
  });
  // El título de la ficha es «Acta: LOCAL vs VISITANTE | Federació Catalana de Futbol»: se corta el
  // sufijo del sitio, que si no se cuela dentro del nombre del visitante.
  const equipos = leida.datos.titulo.replace(/^Acta:\s*/i, '').split(/\s+vs\s+/i)
    .map((s) => s.replace(/\s*\|\s*.*$/, '').trim());
  const { parseada, arbitros } = interpretaActa(leida.datos, equipos);
  const carpeta = rutaGrupo(CARPETA, trabajo.temporada, trabajo.competicion, trabajo.grupo);
  const ruta = join(carpeta, acta.menores ? 'actas-menores' : 'actas-adultos', `acta-${trabajo.acta}.json`);
  const guardado = guardaAtomico(ruta, JSON.stringify({ origen: 'acta-fcf', equipos, ...leida.datos }, null, 2), db, 'acta');
  const resumen = guardaActaEstructura(db, trabajo, acta, parseada);
  const calidad = evaluaCalidad(parseada);
  db.prepare(`update actas set estado='hecha',archivo=?,hash=?,datos=?,comprobada_en=?,version_parser=?,
    calidad=?,incidencias=? where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`)
    .run(ruta, guardado.hash, JSON.stringify(parseada), ahoraIso(), VERSION_PARSER,
      calidad.calidad, JSON.stringify(calidad.incidencias),
      trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
  if (arbitros.length) {
    db.prepare(`update partidos set arbitro=? where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta=?`)
      .run(arbitros.join(' / '), trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
  }
  // Del bloque de detalles de la ficha se completan fecha, hora y campo del partido: el calendario
  // sólo da la fecha de la jornada, así que esto es lo que pone a cada partido en su día y su campo.
  const detalles = leida.datos.detalles ?? {};
  const fecha = fechaDeFicha(detalles.fecha);
  const hora = horaDeFicha(detalles.hora);
  const campo = detalles.estadio ? String(detalles.estadio).trim() : null;
  if (fecha || hora || campo) {
    db.prepare(`update partidos set fecha=coalesce(?,fecha), hora=coalesce(?,hora), campo=coalesce(?,campo)
      where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta=?`)
      .run(fecha, hora, campo, trabajo.temporada, trabajo.competicion, trabajo.grupo,
        trabajo.jornada, trabajo.acta);
  }
  if (parseada.golesLocal !== null || parseada.golesVisitante !== null) {
    db.prepare(`update partidos set goles_local=coalesce(?,goles_local), goles_visitante=coalesce(?,goles_visitante)
      where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta=?`)
      .run(parseada.golesLocal, parseada.golesVisitante, trabajo.temporada, trabajo.competicion,
        trabajo.grupo, trabajo.jornada, trabajo.acta);
  }
  const titulares = parseada.lineups.local.titulares.length + parseada.lineups.visitante.titulares.length;
  return `acta ${trabajo.acta}: ${parseada.golesLocal ?? '?'}-${parseada.golesVisitante ?? '?'}, ` +
    `${titulares} titulares, ${resumen.jugadores} jugadores, ${resumen.eventos} eventos, ${resumen.tecnicos} técnicos`;
}

/**
 * Vuelve a interpretar las actas ya guardadas que se leyeron con una versión anterior del
 * intérprete. No pide nada a la federación: el JSON de la ficha está en disco. Va por lotes para no
 * dejar la sesión parada en silencio (lección aprendida con Castilla y León: 11.100 actas tardaron
 * 83 minutos sin decir nada).
 */
function reparaActas(db, limite = 200) {
  // `codigo acta`: `guardaActaEstructura` espera el campo ya con ese nombre.
  const actas = db.prepare(`select codigo acta,temporada,competicion,grupo,jornada,menores,archivo
    from actas where estado='hecha' and archivo is not null and coalesce(version_parser,0) < ?
    order by temporada desc, competicion, grupo, jornada limit ?`).all(VERSION_PARSER, limite);
  let procesadas = 0; let fallidas = 0; let primerFallo = null;
  for (const acta of actas) {
    try {
      const doc = JSON.parse((leeArchivo(acta.archivo) ?? readFileSync(acta.archivo)).toString('utf8').replace(/^\uFEFF/, ''));
      // Los ficheros guardados antes de limpiar el sufijo del sitio traen el nombre del visitante
      // con «| Federació Catalana de Futbol» pegado: se corrige al reinterpretar.
      const equipos = (doc.equipos ?? []).map((n) => String(n).replace(/\s*\|\s*.*$/, '').trim());
      const { parseada } = interpretaActa(doc, equipos);
      const resumen = guardaActaEstructura(db, acta, acta, parseada);
      const calidad = evaluaCalidad(parseada);
      db.prepare(`update actas set datos=?,comprobada_en=?,version_parser=?,calidad=?,incidencias=?
        where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`)
        .run(JSON.stringify(parseada), ahoraIso(), VERSION_PARSER,
          calidad.calidad, JSON.stringify(calidad.incidencias),
          acta.temporada, acta.competicion, acta.grupo, acta.jornada, acta.acta);
      procesadas += 1;
    } catch (error) {
      fallidas += 1;
      primerFallo ??= `${acta.acta}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return { procesadas, fallidas, primerFallo };
}

/** Recorre la cola: un grupo se resuelve entero con una sola carga de página. */
async function ejecutar(db) {
  const maximo = Math.max(1, Number(argumento('max', config('ritmo.maxActasSesion', 30))));
  const minimo = Math.max(5, Number(argumento('min-ms', config('ritmo.intervaloMinSeg', 8) * 1000)) / 1000);
  const maximoSeg = Math.max(minimo, Number(argumento('max-ms', config('ritmo.intervaloMaxSeg', 12) * 1000)) / 1000);
  const solo = argumento('solo', '');
  const repasoInicial = preparaRepasoJornadasRecientes(db);
  if (repasoInicial.grupos || repasoInicial.clasificaciones) {
    console.log(`  · Repaso reciente: ${repasoInicial.grupos} grupos y ` +
      `${repasoInicial.clasificaciones} clasificaciones reactivadas sin repetir actas completas.`);
  }
  db.exec("update trabajos set estado='pendiente' where estado='en_curso'");
  // `solo` sirve para probar una fase concreta (por ejemplo, las actas) sin tocar el resto.
  const tiposSoportados = "'calendario','clasificacion','acta'";
  const siguiente = () => (solo
    ? db.prepare(`select * from trabajos where tipo=? and estado in ('pendiente','bloqueado')
        and (siguiente_intento is null or siguiente_intento <= ?)
        and ${sqlExcluyeTemporadasViejas('trabajos')}
        order by prioridad, creado_en limit 1`).get(solo, ahoraIso(), TEMPORADA_MINIMA)
    : db.prepare(`select * from trabajos where estado in ('pendiente','bloqueado')
        and tipo in (${tiposSoportados}) and (siguiente_intento is null or siguiente_intento <= ?)
        and ${sqlExcluyeTemporadasViejas('trabajos')}
        order by prioridad, creado_en limit 1`).get(ahoraIso(), TEMPORADA_MINIMA));
  const pendientes = db.prepare(`select count(*) n from trabajos where estado in ('pendiente','bloqueado') and tipo='acta'`).get().n;
  const gruposPend = db.prepare(`select count(*) n from trabajos where estado in ('pendiente','bloqueado')
    and tipo in ('calendario','clasificacion')`).get().n;
  console.log(`Cola de datos: ${gruposPend} trabajos de grupo y ${pendientes} actas pendientes.`);
  const pausa = pausaGlobalActiva(db);
  if (pausa) {
    console.log(`Recolección en pausa hasta ${pausa.hasta}: ${pausa.motivo}`);
    return;
  }
  const siguientes = db.prepare(`select count(*) n from actas where estado='hecha' and archivo is not null
    and coalesce(version_parser,0) < ?`).get(VERSION_PARSER).n;
  if (siguientes) console.log(`Interpretación pendiente de ${siguientes} actas ya guardadas (sin pedir nada a la web).`);
  const reparadas = reparaActas(db);
  if (reparadas.procesadas || reparadas.fallidas) {
    console.log(`  · ${reparadas.procesadas} actas reinterpretadas, ${reparadas.fallidas} ilegibles.`);
  }
  /*
   * Cuánta memoria libre se exige para abrir Chrome.
   *
   * Aquí estaba en **6,5 GB**, y con diecisiete recolectores en la misma máquina eso **no se alcanza nunca**:
   * medido el 17/09/2026, con la máquina al 98-99 % este worker llevaba horas parado en este mismo bucle
   * —«esperando 6.5 GB de memoria libre»— sin recolectar nada, y parecía un worker averiado. Es la misma
   * lección que ya está escrita y aplicada en `recolector-local.mjs`: `freemem()` en Windows devuelve la memoria
   * LIBRE, no la disponible, así que un umbral alto no protege: bloquea.
   *
   * Y desde el 18/09/2026 se aplica la MISMA política que en el recolector PNFG, para que las tres plataformas
   * (PNFG, iSquad y Cataluña) no vuelvan a tener tres criterios distintos:
   *
   *   · **sin presupuesto declarado** (el PC, compartido con el escritorio) se exige la reserva completa (1,5 GB),
   *     que es lo que evita que los recolectores se coman la memoria del usuario;
   *   · **con presupuesto declarado** (`FACYLF_MEMORIA_GB`, o sea en el servidor) el control es el número de
   *     plazas —que ya lleva la reserva descontada— y aquí sólo se pide un suelo de emergencia de 0,25 GB. Con
   *     once navegadores dentro de un presupuesto de 10 GB, exigir 1,5 GB libres sería no abrir nunca.
   */
  const MIN_RAM_LIBRE_NUEVO_CHROME = (Number(process.env.FACYLF_MEMORIA_GB) > 0 ? 0.25 : RESERVA_GB) * 1024 ** 3;
  /*
   * Y CON TOPE. Un `while` sin salida fue exactamente el bloqueo de hoy: el worker llevaba horas imprimiendo
   * este mensaje, parecía averiado y **el supervisor no lo relanzaba porque nunca terminaba**, así que tampoco
   * podía coger ningún arreglo. Agotado el plazo se sale con código 0 y se reintenta en la próxima vuelta: la
   * cola queda intacta y el proceso no se queda atrapado.
   */
  /*
   * La espera de memoria se escribe UNA vez y se usa en los dos sitios que abren Chrome (el arranque de la
   * sesión y el reciclado preventivo). El reciclado tenía su propia copia con **6,5 GB escritos a mano** —el
   * mismo umbral inalcanzable que ya se había corregido en el arranque— y además sin tope ni mensaje: el
   * worker se quedaba callado hasta que hubiera 6,5 GB libres. Medido el 17/09/2026: Cataluña llevaba media
   * hora sin escribir una línea y con 3.708 trabajos disponibles, y el supervisor no la relanzaba porque el
   * proceso no terminaba nunca. Dos verdades distintas para lo mismo es como se cuela un bloqueo.
   */
  const TOPE_ESPERA_MEMORIA_MS = 15 * 60_000;
  const esperaMemoriaParaChrome = async (ocasion) => {
    const inicio = Date.now();
    while (freemem() < MIN_RAM_LIBRE_NUEVO_CHROME) {
      const minutos = Math.round((Date.now() - inicio) / 60000);
      if (Date.now() - inicio > TOPE_ESPERA_MEMORIA_MS) {
        console.log(`  · sin memoria libre en ${minutos} min (hacen falta ${(MIN_RAM_LIBRE_NUEVO_CHROME / 1024 ** 3).toFixed(1)} GB)`
          + ` antes del ${ocasion}: se termina la sesión en limpio y se reintenta en la próxima vuelta; la cola queda intacta.`);
        return false;
      }
      console.log(`  · esperando ${(MIN_RAM_LIBRE_NUEVO_CHROME / 1024 ** 3).toFixed(1)} GB de memoria libre antes del ${ocasion} (${minutos} min).`);
      await new Promise((r) => setTimeout(r, 20_000));
    }
    return true;
  };
  if (!(await esperaMemoriaParaChrome('arranque'))) { db.close(); return; }
  const creaDriver = async () => {
    const nuevo = await new Builder().forBrowser('chrome').setChromeOptions(opcionesChrome()).build();
    await nuevo.manage().setTimeouts({ pageLoad: 60000, script: 120000 });
    await bloqueaTerceros(nuevo);
    return nuevo;
  };
  let driver = await creaDriver();
  const ritmo = new Ritmo(db, minimo, maximoSeg, 200000);
  let hechos = 0; let fallosSeguidos = 0;
  try {
    while (hechos < maximo) {
      const trabajo = siguiente();
      if (!trabajo) { console.log('Sin trabajo pendiente.'); break; }
      db.prepare("update trabajos set estado='en_curso',actualizado_en=? where clave=?").run(ahoraIso(), trabajo.clave);
      console.log(`→ ${trabajo.clave}`);
      let trabajoActivo = trabajo;
      try {
        let detalle;
        if (trabajo.tipo === 'acta') {
          detalle = await capturaActa(driver, db, trabajo, ritmo);
        } else {
          // Calendario y clasificación del mismo grupo se leen en la misma visita, así que se
          // resuelven juntos: da igual cuál de los dos trabajos haya salido de la cola. Sólo se
          // vuelve a leer lo que esté realmente pendiente (antes, al atender la clasificación, se
          // releía el calendario entero sin necesidad).
          const url = trabajo.url ?? db.prepare(`select url from trabajos where clave=?`).get(trabajo.clave)?.url;
          const deGrupo = (tipo) => db.prepare(`select * from trabajos where tipo=? and temporada=?
            and competicion=? and grupo=?`).get(tipo, trabajo.temporada, trabajo.competicion, trabajo.grupo);
          const vivo = (t) => t && t.estado !== 'hecho' && t.estado !== 'cancelado';
          const partes = [];
          const calendario = deGrupo('calendario');
          if (vivo(calendario)) {
            trabajoActivo = calendario;
            partes.push(await capturaGrupo(driver, db, { ...calendario, url: calendario.url ?? url }, ritmo));
            marcaTrabajo(db, calendario.clave, 'hecho');
          }
          const clasificacion = deGrupo('clasificacion');
          if (vivo(clasificacion)) {
            trabajoActivo = clasificacion;
            try {
              partes.push(await capturaClasificacion(driver, db,
                { ...clasificacion, url: clasificacion.url ?? url }, ritmo));
              marcaTrabajo(db, clasificacion.clave, 'hecho');
            } catch (error) {
              const aviso = error instanceof Error ? error.message : String(error);
              // Si no se consiguió nada más, el fallo es de este trabajo y cuenta como tal.
              if (!partes.length) throw error;
              marcaTrabajo(db, clasificacion.clave, 'pendiente', aviso,
                new Date(Date.now() + 24 * 60 * 60_000).toISOString());
              trabajoActivo = null;
            }
          }
          if (!partes.length) throw new ErrorFuente('el grupo no tenía nada pendiente');
          detalle = partes.join(' · ');
        }
        // Los trabajos de grupo se marcan individualmente justo después de completar cada parte.
        // Marcar aquí el trabajo que abrió el grupo hacía que una clasificación fallida pudiera
        // quedar como hecha si el calendario sí se había leído.
        if (trabajo.tipo === 'acta') marcaTrabajo(db, trabajo.clave, 'hecho');
        console.log(`  ✓ ${detalle}`);
        hechos += 1;
        fallosSeguidos = 0;
        if (hechos % 10 === 0 && hechos < maximo) {
          console.log(`  · reciclado preventivo de Chrome tras ${hechos} trabajos.`);
          await driver.quit().catch(() => {});
          // Mismo umbral y mismo tope que al arrancar: si no hay memoria, se termina la sesión en limpio y
          // el supervisor la reanuda cuando la haya, en vez de quedarse esperando 6,5 GB que no llegan.
          if (!(await esperaMemoriaParaChrome('reciclado'))) break;
          driver = await creaDriver();
        }
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        const trabajoFallido = trabajoActivo ?? trabajo;
        if (/invalid session id|session deleted|chrome not reachable|not connected to devtools|disconnected|timed out receiving message from renderer|wait timed out|script timeout/i.test(mensaje)) {
          db.prepare(`update peticiones set resultado='error_navegador',detalle=? where id=(
            select id from peticiones where trabajo=? order by id desc limit 1)`).run(mensaje, trabajo.clave);
          db.prepare(`update trabajos set estado='pendiente',siguiente_intento=?,ultimo_error=?,actualizado_en=?
            where clave=?`).run(new Date(Date.now() + 5 * 60_000).toISOString(), mensaje, ahoraIso(), trabajoFallido.clave);
          console.warn('  ↻ Chrome dejó de responder; se recicla la sesión y la tarea vuelve a la cola.');
          break;
        }
        const intentos = Number(trabajoFallido.intentos ?? 0) + 1;
        if (error?.publicacion) {
          db.prepare(`update peticiones set resultado='sin_publicar',detalle=? where id=(
            select id from peticiones where trabajo=? order by id desc limit 1)`).run(mensaje, trabajoFallido.clave);
        }
        if (error?.bloqueo) {
          marcaTrabajo(db, trabajoFallido.clave, 'bloqueado', mensaje, new Date(Date.now() + 24 * 60 * 60_000).toISOString());
          console.error(`  ⛔ ${mensaje}: se para y se reintenta mañana.`);
          break;
        }
        if (error?.publicacion || intentos < 3) {
          const horas = error?.publicacion ? 48 : intentos === 1 ? 6 : 24;
          marcaTrabajo(db, trabajoFallido.clave, 'pendiente', mensaje, new Date(Date.now() + horas * 3_600_000).toISOString());
          console.warn(`  ◷ ${mensaje}: se reintenta en ${horas} h.`);
          hechos += 1;
          continue;
        }
        marcaTrabajo(db, trabajoFallido.clave, 'cancelado', mensaje, null);
        console.warn(`  ✗ ${mensaje}: descartado tras ${intentos} intentos.`);
        fallosSeguidos += 1;
        if (fallosSeguidos >= 5) { console.error('  Cinco fallos seguidos: se corta la sesión.'); break; }
      }
    }
  } finally {
    await driver.quit().catch(() => {});
  }
  console.log(`Sesión terminada: ${hechos} trabajos.`);
}

const db = abreBase(BASE_DATOS);
try {
  if (comando === 'preparar') {
    const r = preparaCola(db, leeCatalogo());
    console.log(`Catálogo volcado: ${r.temporadas} temporadas, ${r.competiciones} competiciones y ` +
      `${r.grupos} grupos con identificador.`);
    if (r.sinIdentificador) {
      console.log(`  (${r.sinIdentificador} grupos aún sin identificador; los sigue resolviendo el descubridor.)`);
    }
    console.log(`  ${r.comprobadas} competiciones con todos sus grupos comprobados (condición de la web).`);
    const c = resumenCola(db);
    console.log(`Cola: ${c.total} trabajos (${c.pendiente} pendientes).`);
    if (r.reordenados) console.log(`  · ${r.reordenados} trabajos reordenados según la categoría actual.`);
  } else if (comando === 'arrancar') {
    await ejecutar(db);
  } else if (comando === 'reparar') {
    const r = reparaActas(db, Number(argumento('max', 1000)));
    console.log(`Actas reinterpretadas: ${r.procesadas} (${r.fallidas} ilegibles).`);
    if (r.primerFallo) console.log(`  primer fallo: ${r.primerFallo}`);
  } else if (comando === 'repaso-reciente') {
    console.log(JSON.stringify(preparaRepasoJornadasRecientes(db), null, 2));
  } else if (comando === 'estado') {
    const c = resumenCola(db);
    console.log(`Cataluña · cola ${c.total} trabajos: ${c.hecho} hechos, ${c.pendiente} pendientes, ` +
      `${c.bloqueado} bloqueados, ${c.cancelado} descartados`);
    for (const t of c.porTipo) {
      console.log(`  ${String(t.tipo).padEnd(20)} ${String(t.hecho ?? 0).padStart(7)}/${String(t.total).padStart(7)}`);
    }
    console.log(`  ${c.temporadas} temporadas · ${c.competiciones} competiciones · ${c.grupos} grupos · ` +
      `${c.jornadas} jornadas · ${c.partidos} partidos · ${c.actasHechas}/${c.actas} actas`);
    if (c.pausa) console.log(`  PAUSA hasta ${c.pausa.hasta}: ${c.pausa.motivo}`);
  } else {
    console.error('Uso: node scripts/recolector-cataluna-datos.mjs preparar|arrancar|reparar|repaso-reciente|estado');
    process.exitCode = 2;
  }
} finally {
  db.close();
}
