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
  siguienteTrabajo, claveTrabajo, reactiva, anioInicioDeTemporada, leeMetadato,
} from './lib/recolector-local.mjs';
// El día civil de Madrid, compartido con el supervisor y la flota (antes estaba copiado en tres guiones).
import { diaDeMadrid } from './lib/dia-madrid.mjs';
// Espera creciente para calendarios sin publicar y promociones aplazadas a abril (aprobado el 30/09/2026).
import { esperaSinPublicar, preparaRachaSinPublicar } from './lib/espera-publicacion.mjs';
// Suelo de temporadas: sólo de 2023-24 en adelante. Ver `scripts/lib/temporada-minima.mjs`.
import { TEMPORADA_MINIMA, sqlExcluyeTemporadasViejas } from './lib/temporada-minima.mjs';
// Sin publicidad ni rastreadores: es la palanca de CPU y memoria más directa (ver el comentario del fichero).
import { bloqueaTerceros } from './lib/bloqueo-terceros.mjs';
import { banderasDeChrome } from './lib/banderas-chrome.mjs';
import { RESERVA_GB } from './lib/presupuesto-memoria.mjs';
// Qué hacer cuando la pestaña de clasificación no trae tabla (grupo sin jugar, calendario sin leer o maquetación).
import { decideClasificacionSinTabla } from './lib/clasificacion-cataluna.mjs';
import { interpretaCabeceraJornadaFcf, jornadasTodasIguales, calendarioSinPartidos, calendarioIncompleto } from './lib/calendario-cataluna.mjs';
import { interpretaActa, decideActaSinJugar, evaluaCalidad, fechaIsoDeFicha } from './lib/acta-cataluna.mjs';
// Un calendario aplazado no se pide: es lo que corta el bucle del 02/10/2026, con su explicación entera.
import { decideLecturaDeGrupo, textoDeEspera, esCaidaQueRecicla, esEsperaAgotada, esperaTrasFalloDeNavegador } from './lib/grupo-cataluna.mjs';

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
// Relecturas que sólo ENRIQUECEN lo ya guardado (temporadas pasadas): detrás de todo lo demás (22/10/2026).
const CARRIL_RELECTURA = 500_000_000;
// Hasta aquí se leyeron las actas SIN tarjetas, cambios ni códigos (el código nuevo entró en la sesión de las 16:24).
const CORTE_ACTAS_SIN_ICONOS = '2026-10-22T14:20:00.000Z';

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
  const vivos = db.prepare(`select t.clave, t.tipo, t.temporada, t.prioridad, c.nombre competicionNombre
    from trabajos t left join competiciones c on c.temporada = t.temporada and c.codigo = t.competicion
    where t.estado in ('pendiente','bloqueado','en_curso')`).all();
  let reordenados = 0;
  enTransaccion(db, () => {
    const actualiza = db.prepare('update trabajos set prioridad=? where clave=? and prioridad<>?');
    for (const f of vivos) {
      // Una relectura (carril de relectura, ver `reencolaActasSinIconos`) se reordena DENTRO de su carril.
      const carril = Number(f.prioridad) >= CARRIL_RELECTURA ? CARRIL_RELECTURA : 0;
      const nueva = prioridadPlaneada(f.tipo, f.competicionNombre, f.temporada) + carril;
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

/**
 * Banner de consentimiento de cookies (15/10/2026). En 81 calendarios de las últimas sesiones la página se quedó
 * detrás del aviso («partners · MORE OPTIONS · DISAGREE · AGREE») y el calendario se daba por vacío durante 8
 * días. Se pulsa RECHAZAR, que es lo que menos datos cede, y se sigue. Si no hay aviso, no hace nada.
 */
async function rechazaConsentimiento(driver) {
  return driver.executeScript(`
    const rechazo = /^(disagree|reject all|rebutja|rebutjar|rebutja-ho tot|rechazar|rechazar todo|no acepto|denegar)$/i;
    const boton = [...document.querySelectorAll('button, [role="button"], a')]
      .find((x) => rechazo.test((x.innerText || x.textContent || '').trim()));
    if (boton) { boton.click(); return true; }
    return false;`).catch(() => false);
}

/** Espera a que la página deje de decir «Carregant dades…» y tenga contenido (y quita el aviso de cookies). */
async function esperaDatos(driver, ms = 40000) {
  await driver.wait(async () => (await rechazaConsentimiento(driver), true) && Boolean(await driver.executeScript(`
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
  /*
   * ── PRIMERO, LOS DATOS QUE LA PÁGINA YA TIENE: SIN CLICS (21/10/2026) ────────────────────────────────
   *
   * Desplegar jornada a jornada fallaba en el PC ~1 de cada 3 grupos aunque se esperase al clic (los clics se
   * pierden con la máquina cargada; medido con «diagnostica-calendario-cataluna.mjs», petición 174). Pero
   * desplegar NO pide nada a la web: el calendario ENTERO ya está en la página, en las props del componente de
   * React que pinta las jornadas (voltes → jornadas[] → matches[], con el código de acta, los dos equipos
   * con su código de club, el marcador y la fecha de la jornada). Se lee de ahí.
   *
   * Comprobado: en el grupo 54854177 (2025-26, 240 partidos) lo leído así es IDÉNTICO byte a byte (SHA-256 de
   * las 240 filas ordenadas) a lo que sacó el extractor de clics cuando funcionó; y en el 58161857 coincide con
   * las 8 filas de la jornada desplegada. Si la página cambia y no aparece «voltes», se sigue por los clics.
   */
  const desdeReact = (() => {
    try {
      const cabecera = cabeceras[0];
      const clave = cabecera && Object.keys(cabecera).find((k) => k.startsWith('__reactFiber'));
      if (!clave) return null;
      let fibra = cabecera[clave];
      for (let i = 0; fibra && i < 80 && !(fibra.memoizedProps && Array.isArray(fibra.memoizedProps.voltes)); i += 1) {
        fibra = fibra.return;
      }
      const voltes = fibra && fibra.memoizedProps && fibra.memoizedProps.voltes;
      if (!Array.isArray(voltes)) return null;
      const nombre = (t) => (t && typeof t.name === 'string' && t.name.trim() ? t.name.trim() : null);
      const club = (t) => (t && t.clubId != null && String(t.clubId) !== '' ? String(t.clubId) : null);
      const gol = (x) => (typeof x === 'number' ? x : (x != null && /^\\d+$/.test(String(x)) ? Number(x) : null));
      /*
       * La fecha, primero de la CABECERA de la jornada («JORNADA 1 2025-09-20», como el método de clics) y sólo si
       * no la trae, de la prop. Medido en el PC el 21/10: la prop no venía como texto y 187 calendarios se
       * guardaron sin fecha → 0 actas encoladas. Una fecha que falta no se inventa: se queda en null.
       */
      // Acepta AAAA-MM-DD y también DD/MM/AAAA o DD-MM-AAAA (en el PC, con la web en catalán, no venía en ISO).
      const aIso = (texto) => {
        const t = String(texto ?? '');
        const iso = t.match(/(\\d{4})-(\\d{2})-(\\d{2})/);
        if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
        const dma = t.match(/(?:^|\\D)(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{4})(?!\\d)/);
        if (dma) return dma[3] + '-' + dma[2].padStart(2, '0') + '-' + dma[1].padStart(2, '0');
        return null;
      };
      const fechaDeCabecera = new Map(cabeceras.map((c) => {
        const fila = c.closest('div[class*="cursor-pointer"]') || c.parentElement;
        return [interpretaCabecera(c.textContent).numero, aIso(c.textContent) ?? aIso(fila && fila.textContent)];
      }));
      const fechaDeProp = (d) => {
        if (typeof d === 'string') return aIso(d);
        if (d && typeof d.toISOString === 'function') { try { return d.toISOString().slice(0, 10); } catch { return null; } }
        if (typeof d === 'number' && Number.isFinite(d)) return new Date(d).toISOString().slice(0, 10);
        return null;
      };
      /*
       * 22/10/2026 — Cada partido trae además «isClosed» (acta cerrada) y «status»: un texto («Acta Tancada»,
       * «SUSPÈS») o, si aún no se ha jugado, un elemento de React con SU fecha y hora («29/10/2026», «20:30»).
       * Es la fecha de verdad del partido (la de la jornada es la del fin de semana): con ella el acta no se pide
       * antes de jugarse. Se guarda también el estado, para poder medirlo.
       */
      const textoDe = (n) => (typeof n === 'string' || typeof n === 'number' ? String(n)
        : Array.isArray(n) ? n.map(textoDe).join(' ') : (n && n.props ? textoDe(n.props.children) : ''));
      const lista = voltes.flatMap((v) => (v && Array.isArray(v.jornadas) ? v.jornadas : [])).map((j) => ({
        numero: Number(j.number),
        fecha: fechaDeCabecera.get(Number(j.number)) ?? fechaDeProp(j.date ?? j.fecha ?? j.data),
        partidos: (Array.isArray(j.matches) ? j.matches : []).map((m) => ({
          local: nombre(m.teamA),
          codigoLocal: club(m.teamA),
          visitante: nombre(m.teamB),
          codigoVisitante: club(m.teamB),
          golesLocal: gol(m.scoreA),
          golesVisitante: gol(m.scoreB),
          codacta: m.id != null && String(m.id) !== '' ? String(m.id) : null,
          ...(() => {
            const estado = textoDe(m.status).replace(/\s+/g, ' ').trim();
            const hora = estado.match(/(?:^|\D)(\d{1,2}):(\d{2})(?!\d)/);
            return {
              cerrada: typeof m.isClosed === 'boolean' ? m.isClosed : null,
              estado: estado ? estado.slice(0, 60) : null,
              fecha: aIso(estado),
              hora: hora ? hora[1].padStart(2, '0') + ':' + hora[2] : null,
            };
          })(),
        })).filter((p) => p.local && p.visitante),
      }));
      const numeros = lista.map((j) => j.numero);
      // Sólo vale si es coherente: números de jornada válidos y sin repetir, y la misma cantidad que cabeceras.
      if (!lista.length || numeros.some((n) => !Number.isInteger(n) || n < 1)) return null;
      if (new Set(numeros).size !== numeros.length || lista.length !== cabeceras.length) return null;
      return lista;
    } catch {
      return null;
    }
  })();
  if (desdeReact && desdeReact.some((j) => j.partidos.length)) return desdeReact;
  const salida = [];
  /*
   * ── ESPERAR A QUE EL CLIC HAGA EFECTO, NO 400 ms A CIEGAS (20/10/2026) ───────────────────────────────
   *
   * La página de la FCF es Next.js: llega pintada desde el servidor con la ÚLTIMA jornada desplegada y los
   * clics no hacen nada hasta que React se engancha. En el PC, con varias plazas de Chrome a la vez, eso
   * tarda: los clics caían antes, la espera fija de 400 ms terminaba, y 29 de 30 jornadas salían vacías.
   * Medido en la cola: 1.335 de 1.550 grupos de 2025-26 guardados así. En un navegador sin carga el mismo
   * código lee las 30 (240 actas distintas en el grupo 54492383; el bloque aparece a los ~25 ms del clic).
   *
   * Ahora: si la jornada ya está desplegada se lee sin pulsar (pulsar la cerraría); si no, se pulsa y se
   * mira cada 100 ms si ha aparecido SU bloque, y si no aparece se vuelve a pulsar (el primer clic pudo
   * perderse antes de la hidratación). Las esperas se cuentan, no se miden con el reloj, y tienen tope
   * total para no pasar del límite de guion de Selenium (120 s).
   */
  let hidratada = false;
  let esperado = 0;
  const TOPE_ESPERA_MS = 45000;
  for (const cabecera of cabeceras) {
    const interpretada = interpretaCabecera(cabecera.textContent);
    const numero = interpretada.numero;
    const cabeceraFila = cabecera.closest('div[class*="cursor-pointer"]') || cabecera.parentElement;
    const fecha = interpretada.fecha ?? (cabeceraFila.innerText.match(/\\d{4}-\\d{2}-\\d{2}/) || [])[0] ?? null;
    /*
     * ── EL BLOQUE DE ESTA JORNADA, Y NO EL DE LA JORNADA QUE ESTÉ ABIERTA ─────────────────────────────
     *
     * Antes se subía por el DOM hasta el primer bloque que tuviera enlaces de acta o dos nombres, sin mirar
     * de quién era ese bloque. Como la página mantiene una sola jornada desplegada, en cuanto el clic no
     * abría la jornada pedida —o tardaba más que los 400 ms de espera— la subida terminaba en el bloque de
     * la jornada que SÍ estaba abierta, y esa jornada se devolvía como si fuera la pedida. Resultado: las 30
     * jornadas con las mismas 8 parejas. Medido el 24/09/2026: 186 de los 447 grupos catalanes del canónico
     * (42 %) quedaron así, y el defecto estaba ya en la cola, no en el importador.
     *
     * Ahora la subida se corta antes de entrar en un bloque que contenga la cabecera de OTRA jornada: a
     * partir de ahí el bloque ya no es suyo. Si no se encuentra un bloque propio, la jornada se devuelve
     * vacía —que es un dato honesto: «no he podido leer esta jornada»— en vez de con las parejas de otra.
     */
    const esAjena = (nodo) => cabeceras.some((c) => c !== cabecera && nodo.contains(c));
    const tieneFilas = (nodo) => nodo.querySelectorAll('a[href*="/ca/competicio/acta/"]').length > 0
      || nodo.querySelectorAll('span[title]').length >= 2;
    /** Las filas de partido de un bloque, con su código de acta cuando la web lo enlaza. */
    const partidosDe = (bloque) => {
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
      return filas.map(({ fila, codacta }) => {
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
    };
    const buscaBloque = () => {
      for (let candidato = cabeceraFila.parentElement;
        candidato && candidato !== document.body;
        candidato = candidato.parentElement) {
        if (esAjena(candidato)) return null;
        if (tieneFilas(candidato)) return candidato;
      }
      return null;
    };
    let bloque = buscaBloque();
    if (!bloque) {
      const clics = 2;
      const pasos = hidratada ? 12 : 30;
      for (let clic = 0; clic < clics && !bloque && esperado < TOPE_ESPERA_MS; clic += 1) {
        cabeceraFila.click();
        for (let paso = 0; paso < pasos && !bloque; paso += 1) {
          await dormir(100);
          esperado += 100;
          bloque = buscaBloque();
        }
      }
      if (bloque) hidratada = true;
    }
    /*
     * Si no hay bloque propio, la jornada se devuelve VACÍA. Es lo honesto: «esta jornada no la he podido
     * leer». No se recurre a una lectura sin límite como plan B, y el motivo importa: desde aquí no se puede
     * distinguir «la jornada todavía no tiene partidos publicados» de «la página no la ha desplegado y sus
     * filas no están en ninguna parte». Las dos se ven igual —ninguna fila propia—, así que un plan B que
     * leyera el bloque compartido marcaría como sospechosa CADA jornada futura de CADA grupo, que es
     * muchísimo peor que no leerla. La decisión se toma fuera, mirando el calendario entero: si NINGUNA
     * jornada del grupo trae partidos, es que la lectura ha fallado, y eso sí se ve.
     */
    salida.push({ numero, fecha, partidos: bloque ? partidosDe(bloque) : [] });
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
      /*
       * 22/10/2026 — EL CÓDIGO DEL JUGADOR Y LOS EVENTOS DE CADA FILA.
       * La FCF no tiene secciones de tarjetas ni de cambios: los pinta como ICONOS junto al minuto en la fila de
       * cada jugador (amarilla = rectángulo #FFEB3B, roja = rectángulo #F30000, sale = flecha roja «M4 12H20»,
       * entra = flecha azul «M20 12H4», gol = balón). Hasta hoy sólo se guardaba el minuto y se perdía el tipo:
       * Cataluña tenía 0 % de tarjetas y de cambios. Y el componente del nombre lleva en sus props de React el
       * jugador entero ({id, dorsal, titular, capitan, portero}): de ahí sale el código, que faltaba (0 %).
       */
      let jugador = null;
      const elNombre = fila.querySelector('span.truncate');
      if (elNombre) {
        const clave = Object.keys(elNombre).find((k) => k.startsWith('__reactFiber'));
        let fibra = clave ? elNombre[clave] : null;
        for (let i = 0; fibra && i < 6 && !jugador; i += 1, fibra = fibra.return) {
          const p = fibra.memoizedProps;
          if (p && p.player && typeof p.player === 'object') {
            jugador = { id: p.player.id != null ? String(p.player.id) : null, titular: p.player.titular ?? null,
              capitan: p.player.capitan ?? null, portero: p.player.portero ?? null };
          }
        }
      }
      const eventos = [...fila.querySelectorAll('span')]
        .filter((sp) => /^\\d+\\s*['’]$/.test((sp.textContent || '').trim()))
        .map((sp) => {
          const icono = sp.nextElementSibling;
          const html = icono ? icono.outerHTML : '';
          let tipo = 'desconocido';
          if (/FFEB3B/i.test(html)) tipo = 'amarilla';
          else if (/M4 12H20/.test(html)) tipo = 'sale';
          else if (/M20 12H4/.test(html)) tipo = 'entra';
          else if (/<circle/i.test(html)) tipo = 'gol';
          else if (/bg-\\[#(F30000|E50011|FF0000)\\]/i.test(html)) tipo = 'roja';
          const ev = { minuto: Number(((sp.textContent || '').match(/\\d+/) || [])[0]), tipo };
          if (tipo === 'desconocido') ev.firma = html.replace(/\\s+/g, ' ').slice(0, 240);
          return ev;
        });
      return {
        texto: (fila.innerText || '').replace(/\\s+/g, ' ').trim(),
        dorsal, nombre, posicion, imagenes, spans, minutos, jugador, eventos,
      };
    }).filter((f) => f.texto);
    return { titulo: h.textContent.trim(), filas };
  });
  const textoPrincipal = principal.innerText || '';
  const marcador = textoPrincipal.match(/(\\d+)\\s*\\n\\s*-\\s*\\n\\s*(\\d+)/);
  // El bloque «Detalls de l'acta» trae la fecha, la hora y el campo exactos del partido, que es más
  // de lo que da el calendario (allí sólo hay la fecha de la jornada).
  const toma = (etiqueta) => {
    const m = textoPrincipal.match(new RegExp(etiqueta + '[ \\\\t]*:?[ \\\\t]*([^\\\\n]+)', 'i'));
    return m ? m[1].trim() : null;
  };
  // 22/10/2026 — El estado de la ficha («Pendent», «Acta Tancada»…) va entre el nombre del local y el marcador.
  // Con «Pendent» el partido aún no se ha jugado: el recolector no la da por hecha (ver decideActaSinJugar).
  const hojas = [...principal.querySelectorAll('*')].filter((e) => e.children.length === 0)
    .map((e) => (e.textContent || '').trim()).filter(Boolean);
  const iDetalls = hojas.findIndex((t) => /^detalls de l.acta$/i.test(t));
  const estado = iDetalls >= 0 ? (hojas.slice(iDetalls + 1, iDetalls + 6)
    .find((t) => /^(pendent|acta\\s|ajornat|aplaçat|susp|en joc|descans|finalitzat)/i.test(t)) ?? null) : null;
  return {
    titulo, url: location.href, secciones,
    marcador: marcador ? [Number(marcador[1]), Number(marcador[2])] : null,
    detalles: {
      // Con los dos puntos y SIN saltar de línea: en la ficha de un descanso «Estadi:» va vacío y el valor se tomaba
      // de la línea siguiente (la leyenda: «E»): 824 partidos con campo «E».
      estado, fecha: toma('DATA:'), hora: toma('HORA:'), estadio: toma('ESTADI:'),
      competicion: toma('COMPETICIÓ'), jornada: toma('JORNADA'),
    },
  };`;


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

    /*
     * ── COMPROBAR, Y SI NO HAY JORNADAS, PULSAR LA PESTAÑA (medido el 23/09/2026) ──────────────────────────
     *
     * El parámetro `tab=calendari` NO siempre basta: medido hoy, la página carga bien pero se queda en
     * RESULTATS y no aparece ni un «JORNADA». El diagnóstico lo dejaba claro: el texto de la ficha empieza por
     * «…GRUP 3 RESULTATS CLASSIFICACIÓ CALE…» y entre los botones están `RESULTATS`, `CLASSIFICACIÓ` y
     * `CALENDARI` — o sea que la pestaña del calendario está ahí, sin pulsar.
     *
     * Y eso no era una molestia: Cataluña tenía **90.832 ACTAS disponibles y recogibles paradas** detrás de
     * 1.209 calendarios rotos, porque `calendario` es fase 1 y va antes que `acta` (fase 2). La federación
     * gastaba todas sus peticiones en calendarios que no leía y no descargaba ni una acta.
     *
     * Así que ahora, si al primer intento no hay jornadas, se PULSA la pestaña «CALENDARI» y se vuelve a
     * esperar antes de darse por vencido. Pulsar es el plan B, no el A: si la ruta directa funciona, no se
     * toca nada.
     */
    /*
     * ── LA PREGUNTA «¿HAY JORNADAS?» LA CONTESTA EL EXTRACTOR, NO UNA EXPRESIÓN REGULAR (23/09/2026) ──────
     *
     * Antes se esperaba a que apareciera un elemento HOJA cuyo texto fuese «JORNADA N» a secas. Es frágil: si
     * la maqueta envuelve el número en otro elemento, o le añade la fecha, la comprobación NO CASA NUNCA
     * aunque el calendario esté perfectamente pintado. Y el diagnóstico usaba el mismo filtro, así que devolvía
     * `jornadas: []` — «no hay ninguna jornada» — con la página llena. Es exactamente lo que se veía.
     *
     * Así que ahora se espera a que la página TENGA CONTENIDO (algo que no depende de ninguna maqueta) y la
     * pregunta la contesta el EXTRACTOR de verdad, el mismo que después se usa para guardar. Si no saca nada, se
     * prueba a pulsar la pestaña «CALENDARI» —que puede no venir activa aunque la URL la pida— y se vuelve a
     * extraer. Sólo entonces se da por vencido, y con el diagnóstico puesto.
     */
    const espera = String(trabajo.temporada) === temporadaActual ? 15000 : 30000;
    try {
      await driver.wait(async () => Boolean(await driver.executeScript(`
        const principal = document.querySelector('main') || document.body;
        return (principal.innerText || '').trim().length > 200;
      `)), espera);
    } catch { /* se sigue igual: si no hay contenido, lo dirá el diagnóstico del final */ }
    return { detalle: 'página cargada' };
  });

  // El aviso de cookies tapa el calendario (81 calendarios «sin jornadas» por él): se rechaza antes de leer.
  if (await rechazaConsentimiento(driver)) await new Promise((r) => setTimeout(r, 1500));
  let jornadas = await driver.executeScript(EXTRAE_CALENDARIO);

  if (!jornadas.length) {
    // Plan B: pulsar la pestaña del calendario. En un SPA puede no venir activa aunque la URL la pida.
    const pulsada = await driver.executeScript(`
      const objetivo = [...document.querySelectorAll('button,a,[role=tab],li,span')]
        .find((e) => /^\\s*CALENDARI\\s*$/i.test((e.innerText || e.textContent || '').trim()));
      if (!objetivo) return false;
      objetivo.click();
      return true;
    `).catch(() => false);
    if (pulsada) {
      await new Promise((r) => setTimeout(r, 2000));
      jornadas = await driver.executeScript(EXTRAE_CALENDARIO);
    }
  }

  // Un calendario vacío puede ser una competición aún sin publicar. Nunca se descarta: si la
  // maqueta vuelve a cambiar quedará visible como pendiente, no como una cobertura falsamente cerrada.
  if (!jornadas.length) {
    const diagnostico = await driver.executeScript(`
      const principal = document.querySelector('main') || document.body;
      return {
        url: location.href,
        botones: [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim())
          .filter(Boolean).slice(0, 30),
        filasConJornada: [...principal.querySelectorAll('*')]
          .map((e) => (e.textContent || '').replace(/\\s+/g, ' ').trim())
          .filter((t) => /JORNADA/i.test(t)).slice(0, 8),
        texto: (principal.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 240),
      };
    `).catch(() => null);
    const pista = diagnostico ? ` [${JSON.stringify(diagnostico)}]` : '';
    throw new ErrorFuente(`el calendario no muestra ninguna jornada${pista}`, false, true);
  }

  /*
   * ── Y QUE NO SEAN TODAS LA MISMA JORNADA, NI TODAS VACÍAS ────────────────────────────────────────────
   *
   * Comprobar que hay jornadas no basta: el defecto caro era tenerlas todas con las mismas parejas. Estas
   * dos comprobaciones convierten una corrupción silenciosa —186 de los 447 grupos catalanes del canónico,
   * 42 %, con las 30 jornadas iguales— en un error visible.
   */
  if (calendarioSinPartidos(jornadas)) {
    throw new ErrorFuente(`el calendario trae ${jornadas.length} jornadas y ningún partido: la federación `
      + 'todavía no ha publicado los emparejamientos, o la página no los ha desplegado', false, true);
  }
  if (jornadasTodasIguales(jornadas)) {
    // Una segunda oportunidad dentro de la misma visita: casi siempre es que el clic no desplegó la jornada.
    await new Promise((r) => setTimeout(r, 1200));
    const segunda = await driver.executeScript(EXTRAE_CALENDARIO);
    if (jornadasTodasIguales(segunda)) {
      const parejas = (jornadas[0]?.partidos ?? []).length;
      throw new ErrorFuente(`el calendario devuelve la misma jornada en todas: ${jornadas.length} jornadas `
        + `con las mismas ${parejas} parejas. No se guarda, porque un calendario así es falso`, false, false);
    }
    jornadas = segunda;
  }

  /*
   * ── Y QUE NO FALTEN JORNADAS YA JUGADAS (20/10/2026) ────────────────────────────────────────────────
   *
   * El defecto que quedaba: la última jornada llena y las demás vacías (ver `calendarioIncompleto`). Se da
   * una segunda lectura en la misma visita; si sigue incompleto, NO se guarda (guardarlo borraría los
   * partidos que la cola ya tiene de esas jornadas) y se reintenta más tarde. Al tercer intento se guarda
   * lo que haya: las jornadas vacías no tocan lo que ya estaba en la cola (ver el guardado).
   */
  const hoyCalendario = new Date().toISOString().slice(0, 10);
  let huecos = calendarioIncompleto(jornadas, hoyCalendario);
  if (huecos.incompleto) {
    await new Promise((r) => setTimeout(r, 2000));
    const otra = await driver.executeScript(EXTRAE_CALENDARIO);
    const huecosOtra = calendarioIncompleto(otra, hoyCalendario);
    if (huecosOtra.vacias < huecos.vacias && !jornadasTodasIguales(otra) && !calendarioSinPartidos(otra)) {
      jornadas = otra;
      huecos = huecosOtra;
    }
    if (huecos.incompleto && Number(trabajo.intentos ?? 0) < 2) {
      throw new ErrorFuente(`calendario incompleto: ${huecos.vacias} de ${huecos.jugadas} jornadas ya jugadas `
        + 'vienen sin partidos (la página no las desplegó). No se guarda; se reintenta', false, false);
    }
  }

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
      // Una jornada que viene VACÍA no borra lo que la cola ya tenía de ella: vacía casi siempre es «no se
      // pudo desplegar», no «no hay partidos» (20/10/2026: así se perdían los partidos reconstruidos).
      if (!jornada.partidos?.length) continue;
      // Lo que de cada partido sólo da su ACTA (día y hora exactos, campo, árbitros) no está en el calendario: al
      // releerlo se borraba y el acta, ya hecha, no se vuelve a pedir (22/10/2026). Se guarda antes y se repone.
      const previos = new Map(db.prepare(`select codigo_acta, fecha, hora, campo, campo_codigo, arbitro from partidos
        where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta is not null and codigo_acta <> ''`)
        .all(trabajo.temporada, trabajo.competicion, trabajo.grupo, jornada.numero).map((r) => [r.codigo_acta, r]));
      db.prepare(`delete from partidos where temporada=? and competicion=? and grupo=? and jornada=?`)
        .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, jornada.numero);
      jornada.partidos.forEach((partido, orden) => {
        // La fecha y la hora PROPIAS del partido (si la página las da: partidos aún sin jugar) mandan sobre la
        // de la jornada, que es la del fin de semana (ver «status» en EXTRAE_CALENDARIO, 22/10/2026).
        const previo = partido.codacta ? previos.get(partido.codacta) : null;
        const fechaPartido = partido.fecha ?? previo?.fecha ?? jornada.fecha;
        db.prepare(`insert into partidos(temporada,competicion,grupo,jornada,orden,codigo_acta,
          equipo_local_codigo,equipo_visitante_codigo,local,visitante,goles_local,goles_visitante,
          fecha,hora,campo,campo_codigo,arbitro,actualizado_en) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, jornada.numero, orden,
            partido.codacta ?? null, partido.codigoLocal ?? null, partido.codigoVisitante ?? null,
            partido.local, partido.visitante, partido.golesLocal, partido.golesVisitante,
            fechaPartido, partido.hora ?? previo?.hora ?? null, previo?.campo ?? null, previo?.campo_codigo ?? null,
            previo?.arbitro ?? null, ahoraIso());
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
        // Y el acta de un DESCANSO (la FCF le da código; su ficha es «TBD - equipo», «Pendent», vacía) no se pide:
        // eran ~19.300 fichas vacías entre 2025-26 y 2026-27 (unas 60 h de recolector).
        if (partido.codacta && fechaPartido && fechaPartido <= hoy && !esDescanso(partido)) {
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
  const aviso = huecos.incompleto ? ` (guardado INCOMPLETO al ${Number(trabajo.intentos ?? 0) + 1}º intento: `
    + `${huecos.vacias} jornadas jugadas vacías)` : '';
  return `calendario: ${jornadas.length} jornadas, ${partidos} partidos, ${encoladas} actas encoladas${aviso}`;
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
    /*
     * Si la página no termina de cargar, esto NO es una caída de Chrome: es que esa clasificación no está
     * publicada, o tarda más de lo que se le concede. Antes el «Wait timed out» salía de aquí y el bucle lo
     * confundía con un navegador muerto: cerraba la sesión y abría otro Chrome 20 s después, para volver al
     * mismo grupo. Medido el 03/10/2026: 724 fallos de navegador y 6 aciertos en 24 h, con seis grupos
     * repitiéndose hasta 136 veces.
     *
     * Así que se sigue por el camino que YA existe para «la pestaña no trae tabla», que sabe distinguir «sin
     * publicar» de «formato» y aplaza con la escalera de espera.
     */
    let datos = null;
    try {
      await esperaDatos(driver);
      datos = await esperaTablaClasificacion(driver);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (!esEsperaAgotada(mensaje)) throw error;
      console.warn(`  ◷ la clasificación no terminó de cargar en 40 s: se decide con lo que hay.`);
    }
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

/** Fila de descanso del calendario: un lado es «Descans» (o «Descansa») y no tiene código de club. */
function esDescanso(partido) {
  const libre = (nombre, codigo) => /^descans/i.test(String(nombre ?? '').trim()) && !codigo;
  return libre(partido.local, partido.codigoLocal) || libre(partido.visitante, partido.codigoVisitante);
}

/** Fecha, hora y campo del partido según la ficha (el calendario sólo da la fecha de la jornada). */
function apuntaDetallesDelPartido(db, trabajo, detalles = {}) {
  const fecha = fechaDeFicha(detalles?.fecha);
  const hora = horaDeFicha(detalles?.hora);
  const campo = detalles?.estadio && String(detalles.estadio).trim().length > 2 ? String(detalles.estadio).trim() : null;
  if (!(fecha || hora || campo)) return;
  db.prepare(`update partidos set fecha=coalesce(?,fecha), hora=coalesce(?,hora), campo=coalesce(?,campo)
    where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta=?`)
    .run(fecha, hora, campo, trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
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
  // ¿Partido aún sin jugar? (ver decideActaSinJugar en lib/acta-cataluna.mjs). Entonces NO se da por hecha:
  // se apuntan su día, hora y campo (eso ya vale) y se vuelve a pedir el día siguiente al partido.
  const titularesLeidos = parseada.lineups.local.titulares.length + parseada.lineups.visitante.titulares.length;
  // Una RELECTURA que viene sin alineaciones no borra las que ya había (22/10/2026): la FCF vacía con el tiempo
  // datos de algunas categorías (menores de temporadas cerradas) y releer para enriquecer no puede empobrecer.
  if (titularesLeidos === 0 && acta.estado === 'hecha') {
    const previos = db.prepare(`select count(*) n from participaciones where temporada=? and competicion=? and grupo=?
      and jornada=? and acta=? and condicion='titulares'`)
      .get(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta)?.n ?? 0;
    if (previos > 0) {
      db.prepare(`update actas set comprobada_en=? where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`)
        .run(ahoraIso(), trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
      return `acta ${trabajo.acta}: la relectura viene sin alineaciones; se conserva lo guardado (${previos} titulares)`;
    }
  }
  const temporadaActual = db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c;
  const sinJugar = decideActaSinJugar({
    estado: leida.datos.detalles?.estado ?? null, marcador: leida.datos.marcador ?? null,
    fecha: fechaIsoDeFicha(leida.datos.detalles?.fecha), titulares: titularesLeidos,
    temporadaEnCurso: temporadaActual != null && Number(trabajo.temporada) === Number(temporadaActual),
    hoy: diaDeMadrid(), equipos,
  });
  if (sinJugar) {
    apuntaDetallesDelPartido(db, trabajo, leida.datos.detalles);
    db.prepare(`update actas set estado='pendiente' where temporada=? and competicion=? and grupo=? and jornada=?
      and codigo=? and estado='hecha'`).run(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
    throw Object.assign(new ErrorFuente(`acta ${trabajo.acta}: ${sinJugar.motivo}`), { hasta: sinJugar.hasta });
  }
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
  // «SENSE ÀRBITRES ASSIGNATS» no es un árbitro: es que no hay (se guardaba como nombre: 2.755 partidos).
  const arbitrosReales = arbitros.filter((a) => !/^sense\s+[àa]rbitres/i.test(String(a).trim()));
  if (arbitrosReales.length) {
    db.prepare(`update partidos set arbitro=? where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta=?`)
      .run(arbitrosReales.join(' / '), trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
  }
  // Del bloque de detalles de la ficha se completan fecha, hora y campo del partido: el calendario
  // sólo da la fecha de la jornada, así que esto es lo que pone a cada partido en su día y su campo.
  apuntaDetallesDelPartido(db, trabajo, leida.datos.detalles);
  if (parseada.golesLocal !== null || parseada.golesVisitante !== null) {
    db.prepare(`update partidos set goles_local=coalesce(?,goles_local), goles_visitante=coalesce(?,goles_visitante)
      where temporada=? and competicion=? and grupo=? and jornada=? and codigo_acta=?`)
      .run(parseada.golesLocal, parseada.golesVisitante, trabajo.temporada, trabajo.competicion,
        trabajo.grupo, trabajo.jornada, trabajo.acta);
  }
  const titulares = parseada.lineups.local.titulares.length + parseada.lineups.visitante.titulares.length;
  // Observabilidad de lo que trae cada ficha (22/10/2026): tarjetas, cambios y códigos salen de los iconos y de
  // las props de React; si la FCF cambia la maqueta, esto cae a 0 y en el log se ve enseguida. Un icono que no
  // se reconoce queda guardado con su «firma» en el JSON de la ficha para poder clasificarlo después.
  const plantilla = ['local', 'visitante'].flatMap((l) => [...parseada.lineups[l].titulares, ...parseada.lineups[l].suplentes]);
  const conCodigo = plantilla.filter((j) => j.codigoJugador).length;
  const desconocidos = (leida.datos.secciones ?? []).flatMap((s) => s.filas ?? [])
    .flatMap((f) => f.eventos ?? []).filter((e) => e.tipo === 'desconocido').length;
  return `acta ${trabajo.acta}: ${parseada.golesLocal ?? '?'}-${parseada.golesVisitante ?? '?'}, ` +
    `${titulares} titulares, ${resumen.jugadores} jugadores (${conCodigo} con código), ${resumen.eventos} eventos ` +
    `(${parseada.tarjetas.length} tarjetas, ${parseada.cambios.length} cambios${desconocidos ? `, ${desconocidos} ICONOS DESCONOCIDOS` : ''}), ` +
    `${resumen.tecnicos} técnicos`;
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

/** «Hecho» y, de paso, la racha de calendario sin publicar vuelve a cero (ver lib/espera-publicacion.mjs). */
function marcaHecho(db, clave) {
  marcaTrabajo(db, clave, 'hecho');
  db.prepare('update trabajos set sin_publicar_seguidos=0 where clave=? and sin_publicar_seguidos<>0').run(clave);
}

/** Cuándo volver a mirar un grupo sin publicar: escalera 48 h → 4 d → 8 d → 14 d; promociones al 1 de abril. */
function aplazaSinPublicar(db, clave) {
  const fila = db.prepare(`select t.temporada, t.sin_publicar_seguidos racha, c.nombre
    from trabajos t left join competiciones c on c.temporada=t.temporada and c.codigo=t.competicion
    where t.clave=?`).get(clave) ?? {};
  const actual = db.prepare('select max(cast(codigo as integer)) codigo from temporadas').get()?.codigo;
  const racha = Number(fila.racha ?? 0) + 1;
  db.prepare('update trabajos set sin_publicar_seguidos=? where clave=?').run(racha, clave);
  return esperaSinPublicar({
    racha,
    esTemporadaActual: actual != null && Number(fila.temporada) === Number(actual),
    anioInicio: fila.temporada != null ? anioInicioDeTemporada(fila.temporada) : null,
    nombreCompeticion: fila.nombre ?? null,
  });
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
  /*
   * ── LO QUE ESTABA HACIENDO QUE CATALUÑA NO BAJARA NI UN ACTA (medido el 02/10/2026) ──────────────────
   *
   * De la cola salía la clasificación de un grupo, y al abrirlo se leía TAMBIÉN su calendario. Para decidir si
   * lo leía sólo se miraba que no estuviera `hecho` ni `cancelado`: **no se miraba si estaba aplazado**. Así
   * que se volvía a pedir un calendario citado para abril, contestaba «sin publicar», el aplazamiento se
   * apuntaba al calendario (de ahí las rachas de 230) y la clasificación que había salido de la cola se
   * quedaba en `en_curso`.
   *
   * Como el selector sólo elige `pendiente` y `bloqueado`, esa clasificación no volvía a salir… hasta que la
   * línea de arriba devolvía los `en_curso` a `pendiente` al arrancar la sesión siguiente. Y vuelta a empezar,
   * gastando el cupo: 4.685 actas el 25/09 y 25-40 al día desde el 26/09, con 3.177 actas disponibles sin
   * tocarse.
   *
   * Esta pasada corta el bucle de raíz, y ANTES de abrir el navegador: las clasificaciones cuyo calendario ya
   * está aplazado se aplazan a la MISMA fecha sin pedir nada a la web. Es una operación de cola, no de red, y
   * por eso no cuenta para el cupo de la sesión ni consume una sola petición.
   */
  const gruposAplazados = db.prepare(`
    update trabajos set estado='pendiente', actualizado_en=?,
      siguiente_intento=(select c.siguiente_intento from trabajos c
        where c.tipo='calendario' and c.temporada=trabajos.temporada and c.competicion=trabajos.competicion
          and c.grupo=trabajos.grupo),
      ultimo_error='aplazado: el calendario de este grupo se vuelve a mirar en la misma fecha'
    where tipo='clasificacion' and estado in ('pendiente','bloqueado')
      and exists (select 1 from trabajos c
        where c.tipo='calendario' and c.temporada=trabajos.temporada and c.competicion=trabajos.competicion
          and c.grupo=trabajos.grupo and c.estado not in ('hecho','cancelado')
          and c.siguiente_intento is not null and c.siguiente_intento > ?)
      and (siguiente_intento is null or siguiente_intento <= ?)
  `).run(ahoraIso(), ahoraIso(), ahoraIso());
  if (gruposAplazados.changes) {
    console.log(`  · ${gruposAplazados.changes} clasificaciones aplazadas a la fecha de su calendario ` +
      'sin pedir nada a la web (su grupo todavía no tiene calendario publicado).');
  }
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
          /*
           * Y aquí la guarda, para lo que la pasada de antes no puede cubrir: un calendario que se aplaza
           * DURANTE esta misma sesión (porque acaba de fallar) ya no se vuelve a pedir en los grupos
           * siguientes. Sin esto, el bucle seguiría, sólo que más despacio. Ver `lib/grupo-cataluna.mjs`.
           */
          const decision = decideLecturaDeGrupo({ clave: trabajo.clave, calendario });
          if (decision.accion === 'aplazar') {
            marcaTrabajo(db, trabajo.clave, 'pendiente', decision.motivo, decision.hasta.toISOString());
            console.log(`  ◷ ${decision.motivo}: el grupo espera ${textoDeEspera(decision.hasta)}.`);
            continue;
          }
          if (vivo(calendario)) {
            trabajoActivo = calendario;
            partes.push(await capturaGrupo(driver, db, { ...calendario, url: calendario.url ?? url }, ritmo));
            marcaHecho(db, calendario.clave);
          }
          const clasificacion = deGrupo('clasificacion');
          if (vivo(clasificacion)) {
            trabajoActivo = clasificacion;
            try {
              partes.push(await capturaClasificacion(driver, db,
                { ...clasificacion, url: clasificacion.url ?? url }, ritmo));
              marcaHecho(db, clasificacion.clave);
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
        if (trabajo.tipo === 'acta') marcaHecho(db, trabajo.clave);
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
        /*
         * ── EL TRABAJO QUE SALIÓ DE LA COLA NO PUEDE QUEDARSE HUÉRFAO (medido el 02/10/2026) ──────────────
         *
         * Al abrir un grupo se leen el calendario Y la clasificación, así que el que falla (`trabajoActivo`)
         * suele NO ser el que salió de la cola. Todas las ramas de abajo devuelven el que falló a `pendiente`,
         * pero el de la cola se quedaba en `en_curso` — y el selector sólo elige `pendiente` y `bloqueado`, así
         * que no se volvía a coger nunca. Medido: 173 trabajos huérfanos en Cataluña, siempre los mismos
         * grupos, con la sesión gastando su cupo en dar vueltas sobre ellos sin bajar una sola acta.
         *
         * Se suelta aquí, antes de las ramas, para que valga también cuando la rama corta la sesión (Chrome
         * caído, bloqueo). La espera corta es deliberada: la fecha buena la pone, en cuanto se sepa, el
         * aplazamiento del trabajo que sí falló.
         */
        if (trabajoFallido.clave !== trabajo.clave) {
          marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje,
            new Date(Date.now() + 6 * 3_600_000).toISOString());
        }
        /*
         * ── UN «WAIT TIMED OUT» NO ES UN CHROME CAÍDO (medido el 03/10/2026) ────────────────────────────
         *
         * Aquí entraban juntos los errores de sesión de verdad y los tiempos agotados de una página lenta, y
         * todos acababan igual: trabajo a la cola para dentro de 5 minutos, sesión cerrada y Chrome nuevo 20 s
         * después. Con una página que no carga en 40 s, eso es un bucle perfecto: 724 «fallos de navegador» y
         * 6 aciertos en 24 h, seis grupos repitiéndose hasta 136 veces, y el PC abriendo y cerrando Chrome
         * unas 50 veces por hora sin sacar nada. Y como este camino NO sumaba intento, la espera nunca subía.
         *
         * Así que se pregunta al navegador si sigue vivo antes de tirar la sesión: si responde, el fallo es de
         * la página y sigue por el camino normal (con su intento y su escalera). Si no responde, es una caída
         * de verdad y se recicla como siempre.
         */
        let navegadorVivo = true;
        if (esEsperaAgotada(mensaje)) {
          navegadorVivo = await driver.executeScript('return 1').then(() => true, () => false);
          if (navegadorVivo) {
            console.warn('  · la página no cargó, pero el navegador responde: no se recicla la sesión.');
          }
        }
        if (esCaidaQueRecicla(mensaje, { navegadorVivo })) {
          db.prepare(`update peticiones set resultado='error_navegador',detalle=? where id=(
            select id from peticiones where trabajo=? order by id desc limit 1)`).run(mensaje, trabajo.clave);
          // El intento SE CUENTA: sin esto la espera no sube nunca y el mismo trabajo se repite cada cinco
          // minutos para siempre. Al tercero, 24 h como los demás errores.
          const intentosNavegador = Number(trabajoFallido.intentos ?? 0) + 1;
          marcaTrabajo(db, trabajoFallido.clave, 'pendiente', mensaje,
            new Date(Date.now() + esperaTrasFalloDeNavegador(intentosNavegador)).toISOString());
          console.warn(`  ↻ Chrome dejó de responder; se recicla la sesión y la tarea vuelve a la cola ` +
            `(${intentosNavegador}º intento).`);
          break;
        }
        const intentos = Number(trabajoFallido.intentos ?? 0) + 1;
        if (error?.publicacion) {
          db.prepare(`update peticiones set resultado='sin_publicar',detalle=? where id=(
            select id from peticiones where trabajo=? order by id desc limit 1)`).run(mensaje, trabajoFallido.clave);
        }
        if (error?.hasta) {
          // Partido sin jugar todavía: no es un fallo ni suma intento; vuelve el día que toca.
          db.prepare(`update trabajos set estado='pendiente', ultimo_error=?, siguiente_intento=?, actualizado_en=?
            where clave=?`).run(mensaje, error.hasta, ahoraIso(), trabajoFallido.clave);
          db.prepare(`update peticiones set resultado='sin_jugar',detalle=? where id=(
            select id from peticiones where trabajo=? order by id desc limit 1)`).run(mensaje, trabajoFallido.clave);
          console.log(`  ◷ ${mensaje}`);
          hechos += 1;
          continue;
        }
        if (error?.bloqueo) {
          marcaTrabajo(db, trabajoFallido.clave, 'bloqueado', mensaje, new Date(Date.now() + 24 * 60 * 60_000).toISOString());
          console.error(`  ⛔ ${mensaje}: se para y se reintenta mañana.`);
          break;
        }
        if (error?.publicacion) {
          // Antes: 48 h para siempre, y la temporada nueva (que va primero en la cola) ahogaba las actas.
          const espera = aplazaSinPublicar(db, trabajoFallido.clave);
          marcaTrabajo(db, trabajoFallido.clave, 'pendiente', mensaje, espera.hasta.toISOString());
          console.warn(`  ◷ ${mensaje.slice(0, 120)}: se vuelve a mirar ${espera.texto}.`);
          hechos += 1;
          continue;
        }
        if (intentos < 3) {
          const horas = intentos === 1 ? 6 : 24;
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
{
  const racha = preparaRachaSinPublicar(db);
  if (racha.creada) {
    console.log(`  · Espera creciente activada: ${racha.sembrados} grupos que ya llevaban tiempo sin publicar ` +
      'continúan la escalera donde les corresponde (no repiten otra vuelta de 48 h).');
  }
}

/**
 * ── CALENDARIOS CON TODAS LAS JORNADAS IGUALES, LEÍDOS ANTES DEL ARREGLO (15/10/2026) ────────────────────────
 *
 * El defecto de «todas las jornadas iguales» se detecta desde finales de septiembre, pero los calendarios que
 * se leyeron ANTES siguen en la cola con las mismas parejas copiadas en cada jornada: en 2025-26, 294 grupos y
 * 28.729 filas de `partidos` para sólo ~14.300 actas distintas. Esos grupos no pueden entrar bien en el
 * canónico. Se vuelve a leer su calendario (una petición por grupo); al guardarlo, `partidos` se reescribe por
 * jornada y las copias desaparecen solas. Si la web sigue devolviéndolo mal, se vuelve a intentar como mucho una
 * vez por semana.
 */
function reactivaCalendariosRepetidos(db) {
  // Como mucho una vez por semana. No vale mirar `trabajos.actualizado_en`: `encola` lo toca en cada `preparar`.
  const haceUnaSemana = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const ultima = leeMetadato(db, 'calendarios_repetidos_reactivados_en');
  if (ultima && ultima > haceUnaSemana) return { grupos: 0, reactivados: 0 };
  const grupos = db.prepare(`select temporada, competicion, grupo from partidos
    where codigo_acta is not null and codigo_acta <> ''
    group by temporada, competicion, grupo having count(*) >= 2 * count(distinct codigo_acta)`).all();
  let reactivados = 0;
  enTransaccion(db, () => {
    const actualiza = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=null, intentos=0,
        ultimo_error='calendario con las jornadas repetidas (leído antes del arreglo): se vuelve a leer',
        actualizado_en=?
      where clave=? and estado in ('hecho','cancelado')`);
    for (const g of grupos) {
      const clave = claveTrabajo('calendario', { temporada: g.temporada, competicion: g.competicion, grupo: g.grupo });
      reactivados += Number(actualiza.run(ahoraIso(), clave).changes ?? 0);
    }
    guardaMetadato(db, 'calendarios_repetidos_reactivados_en', ahoraIso());
  });
  return { grupos: grupos.length, reactivados };
}

/**
 * ── CALENDARIOS CON JORNADAS YA JUGADAS SIN PARTIDOS (20/10/2026) ──────────────────────────────────────
 *
 * `reactivaCalendariosRepetidos` busca copias, pero después de la limpieza del 25/09 ya no quedan copias:
 * quedan grupos con UNA jornada (la que venía desplegada) y el resto sin partidos. Se detectan comparando
 * las jornadas con fecha ya pasada (tabla `jornadas`) con las que tienen partidos, y se vuelven a leer con
 * el extractor que espera al clic. Como mucho una vez por semana; si la relectura vuelve incompleta, el
 * trabajo se queda en reintento (no en «hecho»), así que no entra en bucle.
 */
function reactivaCalendariosIncompletos(db) {
  const haceUnaSemana = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const ultima = leeMetadato(db, 'calendarios_incompletos_reactivados_en');
  if (ultima && ultima > haceUnaSemana) return { grupos: 0, reactivados: 0 };
  const hoy = new Date().toISOString().slice(0, 10);
  const grupos = db.prepare(`with jug as (
      select temporada, competicion, grupo, count(*) n from jornadas
      where fecha is not null and substr(fecha, 1, 10) <= ? group by 1, 2, 3
    ), conp as (
      select temporada, competicion, grupo, count(distinct jornada) n from partidos group by 1, 2, 3
    )
    select jug.temporada, jug.competicion, jug.grupo from jug
    left join conp on conp.temporada = jug.temporada and conp.competicion = jug.competicion and conp.grupo = jug.grupo
    where jug.n - coalesce(conp.n, 0) >= 2 and jug.n - coalesce(conp.n, 0) > jug.n * 0.1`).all(hoy);
  let reactivados = 0;
  enTransaccion(db, () => {
    const actualiza = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=null, intentos=0,
        ultimo_error='calendario con jornadas ya jugadas sin partidos (la página no las desplegó): se vuelve a leer',
        actualizado_en=?
      where clave=? and estado in ('hecho','cancelado')`);
    for (const g of grupos) {
      const clave = claveTrabajo('calendario', { temporada: g.temporada, competicion: g.competicion, grupo: g.grupo });
      reactivados += Number(actualiza.run(ahoraIso(), clave).changes ?? 0);
    }
    guardaMetadato(db, 'calendarios_incompletos_reactivados_en', ahoraIso());
  });
  return { grupos: grupos.length, reactivados };
}

/**
 * ── COMPETICIONES DE TEMPORADAS CERRADAS CUYAS ACTAS LA FCF YA NO PUBLICA (22/10/2026) ───────────────────────
 *
 * Medido con `scripts/vigia-colas.mjs` (regla «calidad_actas»): en 2025-26 la FCF sirve las actas de base
 * (cadetes, infantiles…) VACÍAS —sin alineaciones y «No hi ha gols registrats» con un 10-0 en el marcador—,
 * mientras que las mismas categorías de 2026-27 vienen completas: al cerrar la temporada borra los datos de los
 * menores. Y las nacionales (Primera y Segona Federació, División de Honor Juvenil) nunca traen datos: son de
 * la RFEF. Pedirlas es gastar peticiones: CADET PRIMERA DIVISIÓ S16 tenía 156 actas vacías, ninguna con datos y
 * 3.985 pendientes; en total ~10.500 actas pendientes así.
 *
 * Igual que `cierraCompeticionesSinDatos` de las PNFG: en una temporada CERRADA, si una competición ya tiene al
 * menos 20 actas hechas y vacías y NINGUNA con datos, el resto se cierra como `sin_datos` sin pedirlo, con el
 * motivo escrito. Basta una con datos para que siga. Una vez al día.
 */
function cierraCompeticionesSinDatosCataluna(db) {
  const haceUnDia = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const ultima = leeMetadato(db, 'competiciones_sin_datos_revisadas_en');
  if (ultima && ultima > haceUnDia) return { competiciones: 0, actas: 0 };
  guardaMetadato(db, 'competiciones_sin_datos_revisadas_en', ahoraIso());
  const actual = db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c;
  if (actual == null) return { competiciones: 0, actas: 0 };
  const vacia = `(estado='hecha' and coalesce(incidencias,'') like '%sin_alineaciones%' and coalesce(incidencias,'') like '%sin_goles_leidos%')`;
  const candidatas = db.prepare(`select temporada, competicion, sum(${vacia}) vacias,
      sum(estado='hecha' and not ${vacia}) conDatos, sum(estado='pendiente') pendientes
    from actas where cast(temporada as integer) < ? group by temporada, competicion
    having conDatos = 0 and vacias >= 20 and pendientes > 0`).all(actual);
  let actas = 0;
  enTransaccion(db, () => {
    for (const c of candidatas) {
      const motivo = `la FCF no publica datos de esta competición en una temporada cerrada: ${c.vacias} actas vacías y ninguna con datos; el resto no se pide`;
      actas += Number(db.prepare(`update actas set estado='sin_datos', incidencias=?, comprobada_en=?
        where temporada=? and competicion=? and estado='pendiente'`).run(JSON.stringify([motivo]), ahoraIso(), c.temporada, c.competicion).changes ?? 0);
      db.prepare(`update trabajos set estado='cancelado', ultimo_error=?, actualizado_en=?
        where tipo='acta' and temporada=? and competicion=? and estado in ('pendiente','bloqueado')`).run(motivo, ahoraIso(), c.temporada, c.competicion);
    }
  });
  return { competiciones: candidatas.length, actas };
}

/**
 * ── ACTAS CANCELADAS COMO «COPIA» QUE RESULTAN SER DE VERDAD (21/10/2026) ──────────────────────────────────
 *
 * La limpieza del 25/09 canceló ~125.000 trabajos de acta por ser copias del defecto de la jornada repetida.
 * Al releer los calendarios, un código puede aparecer AHORA en su jornada de verdad con la misma clave que se
 * canceló, y `encola` no revive un trabajo cancelado: esa acta no se descargaría nunca. Aquí se reviven sólo
 * los que (a) tienen hoy su partido en esa jornada con ese código y (b) no tienen el acta hecha en ninguna
 * jornada de la temporada. Medido hoy: 3.390 candidatos y 0 por revivir (todas sus actas ya están); la guarda
 * es para después de releer. Barato: un conjunto en memoria, sin cruzar tablas sin índice.
 */
function reactivaActasCopiaVerdaderas(db) {
  const hechas = new Set(db.prepare(`select temporada||'|'||codigo k from actas where estado <> 'pendiente'`).all().map((r) => r.k));
  const candidatos = db.prepare(`select t.clave, t.temporada, t.acta from trabajos t
    where t.tipo='acta' and t.estado='cancelado' and t.ultimo_error like 'el código de acta ya está en la cola en su jornada%'
      and exists (select 1 from partidos p where p.temporada=t.temporada and p.competicion=t.competicion
        and p.grupo=t.grupo and p.jornada=t.jornada and p.codigo_acta=t.acta)`).all()
    .filter((c) => !hechas.has(`${c.temporada}|${c.acta}`));
  if (!candidatos.length) return 0;
  enTransaccion(db, () => {
    const revive = db.prepare(`update trabajos set estado='pendiente', intentos=0, siguiente_intento=null,
        ultimo_error='era una copia, pero el calendario releído la pone en esta jornada y el acta no está: se descarga',
        actualizado_en=? where clave=? and estado='cancelado'`);
    for (const c of candidatos) revive.run(ahoraIso(), c.clave);
  });
  return candidatos.length;
}

/**
 * ── RELEER LAS ACTAS GUARDADAS SIN TARJETAS, CAMBIOS NI CÓDIGOS (22/10/2026) ───────────────────────────────
 *
 * Todo lo leído antes del 22/10 (16:24) tiene alineaciones y goles, pero ni tarjetas, ni cambios, ni código de
 * jugador: la ficha los pinta con iconos que no se leían, y el JSON guardado tampoco los tiene. Sólo se recuperan
 * volviendo a pedir la ficha. Se hace UNA vez (marca en `metadatos`) y sólo con las actas que tienen alineaciones:
 *   · temporada EN CURSO: con su prioridad normal (es lo que se consulta: ~12.000 actas, unos dos días);
 *   · temporada anterior: en el carril de relectura, DETRÁS de todo lo pendiente (no frena lo nuevo).
 * El acta sigue «hecha» mientras tanto (sus datos siguen visibles) y, si la relectura viniera sin alineaciones,
 * se conserva lo guardado (ver `capturaActa`). Reversible: son trabajos `pendiente` con su motivo escrito.
 */
function reencolaActasSinIconos(db) {
  if (leeMetadato(db, 'actas_sin_iconos_reencoladas_en')) return { actual: 0, anterior: 0 };
  const actual = db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c;
  if (actual == null) return { actual: 0, anterior: 0 };
  const filas = db.prepare(`select a.temporada, a.competicion, a.grupo, a.jornada, a.codigo acta, coalesce(co.nombre,'') nombre
    from actas a left join competiciones co on co.temporada=a.temporada and co.codigo=a.competicion
    where a.estado='hecha' and a.comprobada_en < ? and cast(a.temporada as integer) >= ?
      and coalesce(a.incidencias,'') not like '%sin_alineaciones%'`).all(CORTE_ACTAS_SIN_ICONOS, Number(actual) - 1);
  const cuenta = { actual: 0, anterior: 0 };
  enTransaccion(db, () => {
    const vuelve = db.prepare(`update trabajos set estado='pendiente', intentos=0, siguiente_intento=null, prioridad=?,
        ultimo_error='relectura: el acta se guardó sin tarjetas, cambios ni códigos de jugador', actualizado_en=?
      where clave=? and estado='hecho'`);
    for (const f of filas) {
      const enCurso = Number(f.temporada) === Number(actual);
      const prioridad = prioridadPlaneada('acta', f.nombre, f.temporada) + (enCurso ? 0 : CARRIL_RELECTURA);
      const cambios = Number(vuelve.run(prioridad, ahoraIso(), claveTrabajo('acta', f)).changes ?? 0);
      if (cambios) cuenta[enCurso ? 'actual' : 'anterior'] += 1;
    }
    guardaMetadato(db, 'actas_sin_iconos_reencoladas_en', ahoraIso());
  });
  return cuenta;
}

/**
 * ── LAS ACTAS DE LOS DESCANSOS NO SE PIDEN (22/10/2026) ──────────────────────────────────────────────────
 *
 * La FCF da código de acta también a la fila «Descans» del calendario (el equipo que libra). Su ficha es «TBD -
 * equipo», «Pendent» y vacía, siempre. Medido el 21/10: 19.299 descansos con código entre 2025-26 y 2026-27,
 * 11.528 actas de ésas en cola (~35 h de recolector) y 1.724 ya pedidas. Ya no se encolan (ver `esDescanso`);
 * aquí se retiran las que esperaban, con el motivo escrito. Se recorre desde los descansos (pocos) y cada trabajo
 * se busca por su clave: barato en cada `preparar`. Reversible: basta devolver esos trabajos a `pendiente`.
 */
function retiraActasDeDescansos(db) {
  const descansos = db.prepare(`select temporada, competicion, grupo, jornada, codigo_acta acta from partidos
    where codigo_acta is not null and codigo_acta <> ''
      and ((local like 'Descans%' and equipo_local_codigo is null) or (visitante like 'Descans%' and equipo_visitante_codigo is null))`).all();
  const motivo = 'descanso: la FCF da código de acta al equipo que libra, pero su ficha va siempre vacía; no se pide';
  let retiradas = 0;
  enTransaccion(db, () => {
    const trabajo = db.prepare(`update trabajos set estado='cancelado', ultimo_error=?, actualizado_en=?
      where clave=? and estado in ('pendiente','bloqueado')`);
    const acta = db.prepare(`update actas set estado='sin_datos', incidencias=? where temporada=? and competicion=?
      and grupo=? and jornada=? and codigo=? and estado='pendiente'`);
    for (const d of descansos) {
      const clave = claveTrabajo('acta', d);
      retiradas += Number(trabajo.run(motivo, ahoraIso(), clave).changes ?? 0);
      acta.run(JSON.stringify(['descanso']), d.temporada, d.competicion, d.grupo, d.jornada, d.acta);
    }
  });
  return retiradas;
}

/**
 * ── DÍA, HORA, CAMPO Y ÁRBITROS PERDIDOS AL RELEER CALENDARIOS (22/10/2026) ───────────────────────────────
 *
 * Releer un calendario borraba y volvía a escribir los partidos de cada jornada, y con ellos lo que sólo da el
 * acta (hora, campo, árbitros, día exacto). Ya no pasa (se reponen al releer), pero lo perdido hasta hoy era
 * ~8.300 partidos con acta leída y sin campo ni árbitro. Se recupera SIN PEDIR NADA: del JSON de la ficha que
 * está en disco. Por tandas de 2.000 actas en cada `preparar`, con un cursor (la clave de la última revisada)
 * para no repetir; al acabar, queda apuntado y no vuelve a mirar.
 */
function reponDetallesDesdeFichas(db, tanda = 2000) {
  if (leeMetadato(db, 'detalles_repuestos_en')) return { revisadas: 0, repuestas: 0 };
  const cursor = leeMetadato(db, 'detalles_repuestos_cursor') ?? '';
  const filas = db.prepare(`select a.temporada, a.competicion, a.grupo, a.jornada, a.codigo acta, a.archivo
    from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion and p.grupo=a.grupo
      and p.jornada=a.jornada and p.codigo_acta=a.codigo
    where a.estado='hecha' and a.archivo is not null and p.campo is null
      and (a.temporada||'|'||a.competicion||'|'||a.grupo||'|'||printf('%04d', a.jornada)||'|'||a.codigo) > ?
    order by a.temporada, a.competicion, a.grupo, a.jornada, a.codigo limit ?`).all(cursor, tanda);
  if (!filas.length) {
    guardaMetadato(db, 'detalles_repuestos_en', ahoraIso());
    return { revisadas: 0, repuestas: 0 };
  }
  let repuestas = 0;
  enTransaccion(db, () => {
    for (const f of filas) {
      try {
        const doc = JSON.parse((leeArchivo(f.archivo) ?? Buffer.from('{}')).toString('utf8').replace(/^\uFEFF/, ''));
        if (!doc.detalles && !doc.secciones) continue;
        apuntaDetallesDelPartido(db, f, doc.detalles);
        const equipos = (doc.equipos ?? []).map((n) => String(n).replace(/\s*\|\s*.*$/, '').trim());
        const { arbitros } = interpretaActa({ secciones: doc.secciones ?? [], marcador: doc.marcador ?? null }, equipos);
        const reales = arbitros.filter((a) => !/^sense\s+[àa]rbitres/i.test(String(a).trim()));
        if (reales.length) {
          db.prepare(`update partidos set arbitro=coalesce(arbitro, ?) where temporada=? and competicion=? and grupo=?
            and jornada=? and codigo_acta=?`).run(reales.join(' / '), f.temporada, f.competicion, f.grupo, f.jornada, f.acta);
        }
        repuestas += 1;
      } catch { /* ficha ilegible: se deja como está */ }
    }
    const u = filas[filas.length - 1];
    guardaMetadato(db, 'detalles_repuestos_cursor',
      `${u.temporada}|${u.competicion}|${u.grupo}|${String(u.jornada).padStart(4, '0')}|${u.acta}`);
  });
  return { revisadas: filas.length, repuestas };
}

/**
 * ── «TITULARES: 14» NO ES UN DEFECTO: ES FÚTBOL 7 (22/10/2026) ─────────────────────────────────────────────
 *
 * `evaluaCalidad` exigía 22 titulares, y el fútbol 7 (14), el 8 (16) y el sala (10) quedaban «a revisar»: en la
 * 2026-27, 4.100 de las 10.100 actas «revisar». Ya está corregido para lo que se lea; esto corrige UNA VEZ lo ya
 * guardado, contando los titulares de cada lado en `participaciones` (por clave primaria). Si los dos lados
 * alinean lo mismo y es una modalidad conocida, se quita esa incidencia (y si no queda ninguna, «correcta»).
 */
function recalificaTitularesPorModalidad(db) {
  if (leeMetadato(db, 'calidad_por_modalidad_aplicada_en')) return 0;
  const filas = db.prepare(`select temporada, competicion, grupo, jornada, codigo, incidencias from actas
    where estado='hecha' and incidencias like '%"titulares:%'`).all();
  const cuenta = db.prepare(`select sum(lado='local') l, sum(lado='visitante') v from participaciones
    where temporada=? and competicion=? and grupo=? and jornada=? and acta=? and condicion='titulares'`);
  const actualiza = db.prepare(`update actas set calidad=?, incidencias=? where temporada=? and competicion=?
    and grupo=? and jornada=? and codigo=?`);
  let corregidas = 0;
  enTransaccion(db, () => {
    for (const f of filas) {
      const c = cuenta.get(f.temporada, f.competicion, f.grupo, f.jornada, f.codigo);
      if (!(c && c.l === c.v && [5, 7, 8, 9, 11].includes(Number(c.l)))) continue;
      let incidencias = [];
      try { incidencias = JSON.parse(f.incidencias); } catch { continue; }
      const quedan = incidencias.filter((i) => !String(i).startsWith('titulares:'));
      actualiza.run(quedan.length ? 'revisar' : 'correcta', JSON.stringify(quedan),
        f.temporada, f.competicion, f.grupo, f.jornada, f.codigo);
      corregidas += 1;
    }
    guardaMetadato(db, 'calidad_por_modalidad_aplicada_en', ahoraIso());
  });
  return corregidas;
}

/**
 * ── ACTAS DADAS POR HECHAS ANTES DE JUGARSE EL PARTIDO (22/10/2026) ───────────────────────────────────────
 *
 * Hasta hoy, una ficha con «Pendent» (partido aún sin jugar, ver decideActaSinJugar) se guardaba como hecha y
 * vacía, y no se volvía a pedir. Aquí se devuelven a la cola las de la temporada EN CURSO que (a) están hechas
 * «sin alineaciones» y (b) se leyeron el día del partido o antes, según la fecha que hoy tiene el partido (la
 * propia ficha la corrigió al leerla). Vuelven para el día siguiente al partido (o ya, si fue antes). Medido el
 * 21/10 en la copia de la cola: ~1.650 actas. Idempotente: al volver a `pendiente` ya no cumplen (a), y tras
 * releerlas después del partido ya no cumplen (b). Sólo usa claves primarias: barato en cada `preparar`.
 */
function reactivaActasLeidasAntesDeJugarse(db) {
  const actual = db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c;
  if (actual == null) return 0;
  const candidatas = db.prepare(`select a.temporada, a.competicion, a.grupo, a.jornada, a.codigo acta,
      coalesce(p.fecha, j.fecha) fecha, coalesce(co.nombre, '') nombre
    from actas a
    left join competiciones co on co.temporada=a.temporada and co.codigo=a.competicion
    join partidos p on p.temporada=a.temporada and p.competicion=a.competicion and p.grupo=a.grupo
      and p.jornada=a.jornada and p.codigo_acta=a.codigo
    left join jornadas j on j.temporada=a.temporada and j.competicion=a.competicion and j.grupo=a.grupo and j.numero=a.jornada
    where a.temporada=? and a.estado='hecha' and coalesce(a.incidencias,'') like '%sin_alineaciones%'
      and a.comprobada_en is not null and coalesce(p.fecha, j.fecha) is not null
      and substr(a.comprobada_en,1,10) <= substr(coalesce(p.fecha, j.fecha),1,10)`).all(String(actual));
  if (!candidatas.length) return 0;
  const ahora = Date.now();
  enTransaccion(db, () => {
    const aPendiente = db.prepare(`update actas set estado='pendiente' where temporada=? and competicion=? and grupo=?
      and jornada=? and codigo=? and estado='hecha'`);
    const vuelve = db.prepare(`update trabajos set estado='pendiente', intentos=0, siguiente_intento=?,
        ultimo_error='el acta se leyó antes de jugarse el partido: se vuelve a pedir después', actualizado_en=?
      where clave=? and estado in ('hecho','cancelado','pendiente')`);
    for (const c of candidatas) {
      const datos = { temporada: c.temporada, competicion: c.competicion, grupo: c.grupo, jornada: c.jornada, acta: c.acta };
      const diaSiguiente = Date.parse(`${String(c.fecha).slice(0, 10)}T06:00:00Z`) + 24 * 60 * 60_000;
      const hasta = new Date(Math.max(ahora, Number.isFinite(diaSiguiente) ? diaSiguiente : ahora)).toISOString();
      aPendiente.run(c.temporada, c.competicion, c.grupo, c.jornada, c.acta);
      const clave = encola(db, 'acta', datos, prioridadPlaneada('acta', c.nombre, c.temporada));
      vuelve.run(hasta, ahoraIso(), clave);
    }
  });
  return candidatas.length;
}

/**
 * ── ACTAS DE PARTIDOS YA JUGADOS QUE NUNCA SE ENCOLARON (15/10/2026) ─────────────────────────────────────
 *
 * El calendario sólo encola el acta de las jornadas YA disputadas el día en que se lee. Pero cada calendario se
 * lee una vez: lo que era futuro ese día no se volvía a mirar, y esas actas no entraban nunca en la cola.
 *
 * Esto lo arregla sin pedir nada a la web: busca en la propia cola los partidos con código de acta, fecha ya
 * pasada y sin fila en `actas`, y los encola igual que lo haría el calendario (mismos menores, misma prioridad).
 *
 * OJO, medido después: de esas 41.646 filas sólo hay **14.293 códigos distintos**. Las otras ~27.000 son COPIAS
 * del defecto de «todas las jornadas iguales»: el mismo código repetido en cada jornada del grupo. Por eso sólo
 * se recupera un código que (a) no tenga acta en ninguna jornada de su temporada y (b) aparezca en UNA sola fila
 * de `partidos`: si aparece en varias, no se sabe cuál es su jornada de verdad y no se adivina.
 */
function encolaActasYaJugadas(db) {
  const hoy = new Date().toISOString().slice(0, 10);
  const filas = db.prepare(`with unicos as (
      select temporada, codigo_acta from partidos where codigo_acta is not null and codigo_acta <> ''
      group by temporada, codigo_acta having count(*) = 1
    ), con_acta as (select distinct temporada, codigo from actas)
    select p.temporada, p.competicion, p.grupo, p.jornada, p.codigo_acta, coalesce(c.nombre, '') nombre
    from partidos p
    join unicos u on u.temporada = p.temporada and u.codigo_acta = p.codigo_acta
    left join con_acta ca on ca.temporada = p.temporada and ca.codigo = p.codigo_acta
    left join jornadas j on j.temporada=p.temporada and j.competicion=p.competicion and j.grupo=p.grupo
      and j.numero=p.jornada
    left join competiciones c on c.temporada=p.temporada and c.codigo=p.competicion
    where ca.codigo is null
      and not ((p.local like 'Descans%' and p.equipo_local_codigo is null)
        or (p.visitante like 'Descans%' and p.equipo_visitante_codigo is null))
      and coalesce(p.fecha, j.fecha) is not null and substr(coalesce(p.fecha, j.fecha), 1, 10) <= ?`).all(hoy);
  if (!filas.length) return 0;
  enTransaccion(db, () => {
    const inserta = db.prepare(`insert into actas(codigo,temporada,competicion,grupo,jornada,menores,estado)
      values(?,?,?,?,?,?,'pendiente') on conflict(temporada,competicion,grupo,jornada,codigo)
      do update set menores=excluded.menores`);
    for (const f of filas) {
      const menores = /juvenil|cadet|infantil|alev|benjam|prebenjam|debutant|iniciacio|querubi/i.test(f.nombre) ? 1 : 0;
      inserta.run(f.codigo_acta, f.temporada, f.competicion, f.grupo, f.jornada, menores);
      encola(db, 'acta', {
        temporada: f.temporada, competicion: f.competicion, grupo: f.grupo, jornada: f.jornada, acta: f.codigo_acta,
      }, prioridadPlaneada('acta', f.nombre, f.temporada));
    }
  });
  return filas.length;
}

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
    const repetidos = reactivaCalendariosRepetidos(db);
    if (repetidos.reactivados) {
      console.log(`  · ${repetidos.reactivados} calendarios con las jornadas repetidas vuelven a leerse ` +
        `(${repetidos.grupos} grupos afectados).`);
    }
    const incompletos = reactivaCalendariosIncompletos(db);
    if (incompletos.reactivados) {
      console.log(`  · ${incompletos.reactivados} calendarios con jornadas ya jugadas sin partidos vuelven a leerse ` +
        `(${incompletos.grupos} grupos afectados).`);
    }
    // 21/10/2026: 187 calendarios releídos se guardaron con la fecha de partido vacía (ver la lectura desde React).
    // La jornada sí la conserva; se copia al partido para que el importador y `encolaActasYaJugadas` la vean.
    const conFecha = db.prepare(`update partidos set fecha = (select j.fecha from jornadas j where j.temporada=partidos.temporada
        and j.competicion=partidos.competicion and j.grupo=partidos.grupo and j.numero=partidos.jornada)
      where fecha is null and exists (select 1 from jornadas j where j.temporada=partidos.temporada
        and j.competicion=partidos.competicion and j.grupo=partidos.grupo and j.numero=partidos.jornada and j.fecha is not null)`).run();
    if (conFecha.changes) console.log(`  · ${conFecha.changes} partidos sin fecha toman la de su jornada.`);
    const sinDatos = cierraCompeticionesSinDatosCataluna(db);
    if (sinDatos.actas) console.log(`  · ${sinDatos.competiciones} competiciones de temporadas cerradas sin datos en la web: ${sinDatos.actas} actas no se piden.`);
    const revividas = reactivaActasCopiaVerdaderas(db);
    if (revividas) console.log(`  · ${revividas} actas canceladas como copia que el calendario releído confirma: vuelven a la cola.`);
    const repuestos = reponDetallesDesdeFichas(db);
    if (repuestos.revisadas) console.log(`  · ${repuestos.repuestas} de ${repuestos.revisadas} partidos recuperan día, hora, campo y árbitros desde la ficha guardada.`);
    // Lo que no es un dato: «SENSE ÀRBITRES ASSIGNATS» como árbitro y «E» como campo (la ficha de un descanso).
    const limpios = db.prepare(`update partidos set arbitro=null where arbitro like 'SENSE %RBITRES%'`).run().changes
      + db.prepare(`update partidos set campo=null where campo='E'`).run().changes;
    if (limpios) console.log(`  · ${limpios} árbitros o campos que no lo eran («SENSE ÀRBITRES ASSIGNATS», «E») se vacían.`);
    const recalificadas = recalificaTitularesPorModalidad(db);
    if (recalificadas) console.log(`  · ${recalificadas} actas de fútbol 7/8/sala dejan de estar «a revisar» por tener menos de 22 titulares.`);
    const antesDeJugarse = reactivaActasLeidasAntesDeJugarse(db);
    if (antesDeJugarse) console.log(`  · ${antesDeJugarse} actas leídas antes de jugarse el partido: vuelven a la cola para después del partido.`);
    // Después de devolver las leídas antes de tiempo: entre ellas hay descansos, que aquí salen.
    const descansos = retiraActasDeDescansos(db);
    if (descansos) console.log(`  · ${descansos} actas de descansos («Descans», sin equipo) salen de la cola: su ficha va siempre vacía.`);
    const sinIconos = reencolaActasSinIconos(db);
    if (sinIconos.actual || sinIconos.anterior) {
      console.log(`  · Relectura de actas guardadas sin tarjetas/cambios/códigos: ${sinIconos.actual} de la temporada en curso ` +
        `(prioridad normal) y ${sinIconos.anterior} de la anterior (detrás de todo lo pendiente).`);
    }
    const recuperadas = encolaActasYaJugadas(db);
    if (recuperadas) console.log(`  · ${recuperadas} actas de partidos ya jugados que nunca se habían encolado: a la cola.`);
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
