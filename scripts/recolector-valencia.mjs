#!/usr/bin/env node
/**
 * Recolector de la Federación de Fútbol de la Comunitat Valenciana (ffcv.es).
 *
 * Por qué existe un recolector aparte: Valencia NO usa la plataforma /pnfg/ como Castilla y León
 * y otras trece territoriales, sino iSquad, que publica los mismos datos como API JSON. Eso
 * cambia la forma de pedir las páginas, pero NO la forma de guardarlas: este recolector escribe
 * exactamente las mismas tablas que el recolector pnfg (comparte el esquema `abreBase`, la
 * escritura de actas `guardaActaEstructura` y la pausa global de la librería), de modo que la web
 * y el visor funcionan sin ningún cambio.
 *
 * Ventaja real del adaptador: no hace falta navegador. iSquad responde en 60-330 ms con JSON ya
 * estructurado, así que no se abre Chrome, no se interpreta HTML y cada petición cuesta mucho
 * menos. El ritmo respetuoso se mantiene igual: el mínimo duro es 4 s y la configuración de
 * Valencia es 4-6 s entre comienzos de petición, con identificación honesta y robots.txt respetado.
 *
 * Cadena verificada el 11 de septiembre de 2026:
 *   api/filtros/temporadas_fetch.php
 *   api/filtros/competiciones_fetch.php?temporada=
 *   api/filtros/grupos_fetch.php?cod_competicion=
 *   api/filtros/jornadas_fetch.php?cod_grupo=                          -> codjornada, nombre, fecha_jornada
 *   api/partidos/resultados_por_grupo_jornada_data.php?cod_grupo=&cod_jornada=  -> partidos con codacta
 *   api/clasificaciones/clasificaciones_ajax.php?cod_grupo=&cod_jornada=        -> tabla oficial
 *   api/partidos/ficha_partido_ajax.php?cod_partido=<codacta>                   -> acta completa
 *
 * Uso:
 *   node scripts/recolector-valencia.mjs preparar        # arma la cola desde el catálogo, sin red
 *   node scripts/recolector-valencia.mjs arrancar        # recorre la cola
 *   node scripts/recolector-valencia.mjs estado          # resumen de la cola
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  abreBase, encola, esCompeticionDeMenores, guardaActaEstructura, guardaAtomico,
  claveTrabajo, leeArchivo, leeMetadato, marcaTrabajo, pausaGlobalActiva, establecePausaGlobal,
  peticionesHoy, registraPeticion, rutaGrupo, siguienteTrabajo, ultimaPeticion,
  guardaMetadato, enTransaccion, etiquetaTemporada,
  /*
   * `reactiva` es la que devuelve a la cola un trabajo ya hecho o descartado, y `preparaRepasoJornadasRecientes`
   * la usa dos veces. Faltaba en esta lista y el recolector de Madrid y Valencia **moría al arrancar** con
   * `ReferenceError: reactiva is not defined`: los dos llevaban desde el 14-15/09 reintentando cada 20 s sin
   * recolectar nada. Una lista de importaciones no la comprueba nadie hasta que el proceso revienta.
   */
  reactiva,
} from './lib/recolector-local.mjs';
// El día civil de Madrid, compartido con el supervisor y la flota (antes estaba copiado en tres guiones).
import { diaDeMadrid } from './lib/dia-madrid.mjs';
// Suelo de temporadas: sólo de 2023-24 en adelante (Vale lo comparte Madrid). Ver `temporada-minima.mjs`.
import { TEMPORADA_MINIMA, sqlExcluyeTemporadasViejas } from './lib/temporada-minima.mjs';
import { separaDescansos, decideFilasDeJornada } from './lib/filas-descanso-isquad.mjs';
import { decideActaSinDatos } from './lib/acta-sin-datos.mjs';
import { decideActaAbierta } from './lib/acta-abierta.mjs';

const RAIZ = resolve(import.meta.dirname, '..');
const FEDERACION = argumento('federacion', 'valencia');
if (!['valencia', 'madrid'].includes(FEDERACION)) {
  throw new Error('--federacion debe ser valencia o madrid');
}
const ES_MADRID = FEDERACION === 'madrid';
const NOMBRE_FEDERACION = ES_MADRID ? 'Madrid' : 'Valencia';
const CARPETA = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local');
const BASE_DATOS = join(CARPETA, 'cola-v2.sqlite');
const CONFIGURACION = join(RAIZ, `recolector.${FEDERACION}.config.json`);
const CATALOGO = join(RAIZ, 'descargas-federacion-sondeo', `${FEDERACION}-isquad-sondeo.json`);
const PORTAL = ES_MADRID ? 'https://www.rffm.es' : 'https://ffcv.es/competiciones';
// Madrid publica en algunas categorías de base una lista de convocados con `titular=1` para
// todos, sin separar once/siete inicial y banquillo. Su versión 5 conserva esa incertidumbre sin
// inventar titularidades. Valencia sí distingue ambos campos y mantiene su versión 4.
const VERSION_PARSER = ES_MADRID ? 5 : 4;

const comando = process.argv[2] ?? 'estado';

function argumento(nombre, defecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : defecto;
}

const config = existsSync(CONFIGURACION) ? leeJson(CONFIGURACION) : {};

function valorConfig(ruta, defecto) {
  let actual = config;
  for (const parte of ruta.split('.')) actual = actual?.[parte];
  return actual ?? defecto;
}

const opcionesNumericas = {
  'intervalo-min': ['ritmo.intervaloMinSeg', 300],
  'intervalo-max': ['ritmo.intervaloMaxSeg', 420],
  'max-diario': ['ritmo.maxPeticionesDia', 400],
  max: ['ritmo.maxTrabajosSesion', 200],
  'desde-hora': ['ritmo.desdeHora', 0],
  'hasta-hora': ['ritmo.hastaHora', 24],
  desde: ['alcance.desdeAnio', 2015],
};

function numero(nombre, defecto) {
  const [ruta, base] = opcionesNumericas[nombre] ?? [null, defecto];
  const valor = Number(argumento(nombre, ruta ? valorConfig(ruta, base) : defecto));
  if (!Number.isFinite(valor)) throw new Error(`--${nombre} debe ser un número`);
  return valor;
}

function leeJson(ruta) {
  return JSON.parse(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, ''));
}

const ahoraIso = () => new Date().toISOString();
const texto = (v) => (v === undefined || v === null ? '' : String(v).trim());
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const sinAcentos = (v) => texto(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function entero(v) {
  const limpio = texto(v).replace(/[^\d-]/g, '');
  return /^-?\d+$/.test(limpio) ? Number(limpio) : null;
}

function minutoEvento(v, incidencias) {
  const minuto = entero(v);
  if (minuto == null) return null;
  if (minuto < 0 || minuto > 130) {
    incidencias.push(`minuto_fuera_rango:${minuto}`);
    return null;
  }
  return minuto;
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

/** '06-09-2026' o '06/09/2026' -> '2026-09-06'. Valencia usa día primero.
 *  Devuelve null para una fecha que no es creíble: una fecha absurda de la fuente aplazaría el
 *  trabajo fuera de alcance para siempre (se han visto 9999-01-01 y 2202-02-18 en otras
 *  territoriales). Si no es creíble, el trabajo queda disponible ya. */
function fechaIso(valor) {
  const m = texto(valor).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const iso = `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const instante = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(instante.getTime())) return null;
  if (instante.getTime() - Date.now() > 400 * 24 * 60 * 60_000) return null;
  return iso;
}

class PausaOperativa extends Error {
  constructor(mensaje) { super(mensaje); this.operativa = true; }
}
class PendientePublicacion extends Error {
  constructor(mensaje, dias = 7) { super(mensaje); this.pendientePublicacion = true; this.dias = dias; }
}
class ErrorFuente extends Error {
  /** `bloqueo`: la fuente nos ha negado el acceso (pausa larga, es una decisión sobre nosotros).
   *  `esperable`: no es un fallo, es que todavía no hay nada publicado.
   *  `horasPausa`: pausa corta propia para señales de sobrecarga (un 503), distinta de la de bloqueo. */
  constructor(mensaje, bloqueo = false, esperable = false, horasPausa = null) {
    super(mensaje);
    this.bloqueo = bloqueo;
    this.esperable = esperable;
    this.horasPausa = horasPausa;
  }
}
class ActaSinDatos extends ErrorFuente {
  constructor(mensaje) {
    // Una ficha existente pero sin `game` no demuestra un fallo global del portal. En Madrid es
    // la respuesta ordinaria de muchas actas aún no publicadas; por eso es esperable y lleva una
    // marca propia para resolver sólo ESA ficha sin alimentar la pausa preventiva de la federación.
    super(mensaje, false, true);
    this.actaSinDatos = true;
  }
}

/* ---------- Orden del trabajo ---------- */

// Igual que en las federaciones pnfg, y con los MISMOS números: fase 1 es todo el descubrimiento
// (temporadas, competiciones, grupos, índices de jornadas, calendarios y clasificaciones) y fase 2
// son las jornadas y las actas. Así se sabe cuántas actas existen antes de empezar a bajarlas y el
// visor puede estimar con datos propios. Los números importan: el visor clasifica `calendario` y
// `clasificacion` como descubrimiento y `jornada`/`acta` como datos, así que las fases tienen que
// coincidir con esa etiqueta o el orden real contradiría las barras.
//   prioridad = categoría * 1.000.000 + antigüedad * 10.000 + FASE * 1.000 + SUBFASE * 100
// Los códigos de grupo tienen un carril global anterior a la ingesta masiva: una competición
// no puede quedar meses medio descubierta detrás de sus jornadas y actas.
const CARRIL_DESCUBRIMIENTO = -1_000_000_000;
const CARRIL_CATALOGO = -2_000_000_000;
// Carril de la temporada en curso (11/10/2026): mismo criterio que `recolector-local.mjs` (ver allí la medida).
// Todo el trabajo de la temporada actual va antes que el histórico; al no quedar nada vencido, vuelve solo al histórico.
const CARRIL_EN_CURSO = -1_500_000_000;
function codigoTemporadaEnCurso(ahora = new Date()) {
  const forzada = Number(process.env.FACYLF_TEMPORADA_EN_CURSO);
  if (Number.isFinite(forzada) && forzada > 0) return forzada;
  const anio = ahora.getUTCFullYear();
  return (ahora.getUTCMonth() >= 6 ? anio : anio - 1) - 2004;
}
const FASES = {
  catalogo_temporada: { fase: 1, sub: 0 },
  grupos: { fase: 1, sub: 0 },
  indice_jornadas: { fase: 1, sub: 1 },
  calendario: { fase: 1, sub: 2 },
  clasificacion: { fase: 1, sub: 3 },
  jornada: { fase: 2, sub: 0 },
  acta: { fase: 2, sub: 1 },
};
// Estos dos tipos son globales: no dependen de la competición, así que no llevan su base.
const TIPOS_GLOBALES = new Set(['catalogo_temporada']);

/** Orden funcional de las competiciones valencianas. Menor = antes. */
function basePrioridadValencia(nombreCompeticion) {
  const c = sinAcentos(nombreCompeticion).toLowerCase();
  if (/valenta|femenin|futsal|sala|platja/.test(c)) return 150;
  if (/tercera federacion|segunda federacion|primera federacion|division de honor|liga nacional/.test(c)) return 15;
  if (/lliga comunitat|preferent|autonomica|autonomic/.test(c) && !/juvenil|cadet|infantil|alevi/.test(c)) return 15;
  if (/nostra copa|supercopa|copa/.test(c)) return 20;
  if (/primera ffcv/.test(c)) return 60;
  if (/segona ffcv|segunda ffcv/.test(c)) return 70;
  if (/juvenil|cadet|infantil|alevi|benjami|prebenjami|debutant|iniciacio|querubi/.test(c)) return 80;
  if (/tercera ffcv|tercera ffcv/.test(c)) return 90;
  if (/veteran/.test(c)) return 120;
  return 100;
}

function prioridadPlaneada(tipo, nombreCompeticion, temporada = null) {
  const fase = FASES[tipo] ?? { fase: 9, sub: 9 };
  const base = TIPOS_GLOBALES.has(tipo) ? 0 : basePrioridadValencia(nombreCompeticion ?? '');
  // Menor código de temporada = más antigua. La temporada ordena dentro de la misma categoría;
  // una competición importante conserva prioridad sobre una baja aunque sea de otro año.
  const codigoTemporada = Number(temporada);
  const antiguedad = Number.isFinite(codigoTemporada) ? Math.max(0, 100 - codigoTemporada) : 100;
  const orden = base * 1_000_000 + antiguedad * 10_000 + fase.fase * 1_000 + fase.sub * 100;
  if (tipo === 'catalogo_temporada') return CARRIL_CATALOGO + orden;
  if (Number.isFinite(codigoTemporada) && codigoTemporada >= codigoTemporadaEnCurso()) return CARRIL_EN_CURSO + orden;
  /*
   * El índice de jornadas también va por el carril de descubrimiento (05/10/2026). Antes sólo `grupos`: el índice
   * competía con las actas por la prioridad de su competición, y esa cifra (categoría × 1.000.000) pesa más que la
   * temporada y que la fase. Resultado medido: los grupos de las competiciones «de segunda» (provinciales, base,
   * sala) se quedaban SIN LEER sus jornadas durante semanas, mientras se servían actas de temporadas viejas de
   * las competiciones «de primera». En CyL 2025-26, 108 de 301 grupos (1ª Provincial Juvenil y Aficionados de
   * Valladolid, León, Burgos, El Bierzo…) llevaban pendientes desde el 07/09; en Andalucía 1.001 de 1.856; en
   * Madrid 2024-25, 1.060 de 1.201. Un índice es UNA petición por grupo y es lo que hace visible la liga entera.
   */
  return (tipo === 'grupos' || tipo === 'indice_jornadas') ? CARRIL_DESCUBRIMIENTO + orden : orden;
}

/**
 * Reordena los trabajos que siguen vivos según las fases actuales.
 *
 * Hace falta porque las prioridades se congelan al encolar: si se afina el orden (o se cambia qué
 * es descubrimiento y qué es dato), los trabajos ya creados conservarían el orden antiguo. Se
 * ejecuta al principio de cada sesión, igual que hace el recolector pnfg.
 */
function repriorizaPlan(db) {
  const filas = db.prepare(`
    select t.clave, t.tipo, t.temporada, c.nombre competicionNombre
    from trabajos t
    left join competiciones c on c.temporada = t.temporada and c.codigo = t.competicion
    where t.estado in ('pendiente', 'bloqueado', 'en_curso')
  `).all();
  let cambiados = 0;
  db.exec('begin immediate');
  try {
    const actualiza = db.prepare('update trabajos set prioridad=? where clave=? and prioridad<>?');
    for (const f of filas) {
      const nueva = prioridadPlaneada(f.tipo, f.competicionNombre, f.temporada);
      const r = actualiza.run(nueva, f.clave, nueva);
      if (Number(r.changes ?? 0)) cambiados += 1;
    }
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
  return cambiados;
}

/**
 * Actas de partidos SUSPENDIDOS guardadas como un 0-0 sin jugadores (antes del 23/10/2026). Una vez: se miran las
 * hechas «sin alineaciones», y si su JSON dice `suspendido: 1`, el marcador pasa a nulo y la calidad a
 * «administrativa» con la incidencia `partido_suspendido`. No pide nada a la web.
 */
function recalificaSuspendidas(db) {
  if (leeMetadato(db, 'actas_suspendidas_recalificadas_en')) return 0;
  const filas = db.prepare(`select temporada, competicion, grupo, jornada, codigo, archivo, datos from actas
    where estado='hecha' and archivo is not null and coalesce(incidencias,'') like '%sin_alineaciones%'`).all();
  let cambiadas = 0;
  enTransaccion(db, () => {
    const actualiza = db.prepare(`update actas set datos=?, calidad='administrativa', incidencias=? where temporada=?
      and competicion=? and grupo=? and jornada=? and codigo=?`);
    for (const f of filas) {
      let ficha = null;
      try { ficha = JSON.parse((leeArchivo(f.archivo) ?? readFileSync(f.archivo)).toString('utf8').replace(/^\uFEFF/, '')); } catch { continue; }
      if (texto(ficha?.suspendido) !== '1') continue;
      let datos = {};
      try { datos = JSON.parse(f.datos ?? '{}') ?? {}; } catch { datos = {}; }
      datos.golesLocal = null; datos.golesVisitante = null;
      actualiza.run(JSON.stringify(datos), JSON.stringify(['partido_suspendido']), f.temporada, f.competicion, f.grupo, f.jornada, f.codigo);
      cambiadas += 1;
    }
    guardaMetadato(db, 'actas_suspendidas_recalificadas_en', ahoraIso());
  });
  return cambiadas;
}

/**
 * Actas de la temporada en curso que se dieron por hechas con el acta todavía ABIERTA (ver lib/acta-abierta.mjs):
 * se vuelven a pedir. Una vez (marca en `metadatos`). Primero un filtro barato (leídas el día del partido o antes)
 * y luego el JSON guardado de cada una, que dice si `acta_cerrada` era «0». Medido el 22/10 en Madrid: 64.
 */
function reabreActasLeidasAbiertas(db) {
  if (leeMetadato(db, 'actas_abiertas_reabiertas_en')) return 0;
  const actual = texto(db.prepare('select max(cast(codigo as integer)) codigo from temporadas').get()?.codigo);
  if (!actual) return 0;
  const candidatas = db.prepare(`select a.temporada, a.competicion, a.grupo, a.jornada, a.codigo acta, a.archivo
    from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion and p.grupo=a.grupo
      and p.jornada=a.jornada and p.codigo_acta=a.codigo
    where a.temporada=? and a.estado='hecha' and a.archivo is not null and a.comprobada_en is not null
      and substr(a.comprobada_en,1,10) <= substr(p.fecha,1,10)`).all(actual);
  let reabiertas = 0;
  const motivo = 'el acta se leyó todavía abierta (sin cerrar o en juego): se vuelve a pedir';
  for (const c of candidatas) {
    let ficha = null;
    try { ficha = JSON.parse((leeArchivo(c.archivo) ?? readFileSync(c.archivo)).toString('utf8').replace(/^\uFEFF/, '')); } catch { continue; }
    if (String(ficha?.acta_cerrada ?? '').trim() !== '0' || String(ficha?.suspendido ?? '').trim() === '1') continue;
    const r = db.prepare(`update trabajos set estado='pendiente', intentos=0, siguiente_intento=null, ultimo_error=?,
      actualizado_en=? where clave=? and estado='hecho'`).run(motivo, ahoraIso(), claveTrabajo('acta', c));
    reabiertas += Number(r.changes ?? 0);
  }
  guardaMetadato(db, 'actas_abiertas_reabiertas_en', ahoraIso());
  return reabiertas;
}

/** Recupera clasificaciones de la temporada vigente que una versión anterior dio por terminadas
 * aunque la respuesta todavía fuese una lista vacía. Sólo toca trabajos ya hechos una vez; los
 * reintentos posteriores conservan su fecha y no se fuerzan en cada arranque. */
function reabreClasificacionesVaciasActuales(db) {
  const actual = texto(db.prepare('select max(cast(codigo as integer)) codigo from temporadas').get()?.codigo);
  if (!actual) return 0;
  const patron = new RegExp(`[\\\\/]t${actual}-[^\\\\/]+[\\\\/]comp-([^\\\\/]+)[\\\\/]grupo-([^\\\\/]+)[\\\\/]clasificacion\\.json$`);
  const siguiente = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
  let reabiertas = 0;
  for (const archivo of db.prepare("select ruta from archivos where tipo='clasificacion' and bytes<=4").all()) {
    const m = patron.exec(texto(archivo.ruta));
    if (!m) continue;
    const clave = claveTrabajo('clasificacion', { temporada: actual, competicion: m[1], grupo: m[2] });
    const r = db.prepare(`update trabajos set estado='pendiente',siguiente_intento=?,ultimo_error=?,actualizado_en=?
      where clave=? and estado='hecho'`).run(siguiente,
        'clasificación todavía vacía en la temporada vigente', ahoraIso(), clave);
    reabiertas += Number(r.changes ?? 0);
  }
  return reabiertas;
}

/** Revisión acotada tras cada fin de semana: vuelve a leer solamente jornadas ya disputadas en los
 * últimos cuatro días y no comprobadas durante 18 h. Las actas ya hechas permanecen hechas. */
function preparaRepasoJornadasRecientes(db) {
  const actual = texto(db.prepare('select max(cast(codigo as integer)) codigo from temporadas').get()?.codigo);
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
      encola(db, 'jornada', datos, 2);
      if (anterior && ['hecho', 'cancelado'].includes(anterior.estado)) {
        reactiva(db, clave);
        jornadas += 1;
        grupos.set(`${j.competicion}|${j.grupo}`, { competicion: j.competicion, grupo: j.grupo });
      }
    }
    for (const g of grupos.values()) {
      const datos = { temporada: actual, competicion: g.competicion, grupo: g.grupo };
      const clave = claveTrabajo('clasificacion', datos);
      const anterior = db.prepare('select estado,actualizado_en from trabajos where clave=?').get(clave);
      encola(db, 'clasificacion', datos, 3);
      if (anterior?.estado === 'hecho' && (!anterior.actualizado_en || anterior.actualizado_en < umbral)) {
        reactiva(db, clave);
        clasificaciones += 1;
      }
    }
  });
  return { jornadas, clasificaciones };
}

/* ---------- Ritmo y red ---------- */

class Ritmo {
  constructor(db) {
    this.db = db;
    this.minimo = numero('intervalo-min', 300) * 1_000;
    this.maximo = numero('intervalo-max', 420) * 1_000;
    this.maxDiario = numero('max-diario', 400);
    this.desdeHora = numero('desde-hora', 0);
    this.hastaHora = numero('hasta-hora', 24);
    if (this.minimo < 4_000 || this.maximo < this.minimo) {
      throw new Error('El intervalo debe ser como mínimo 4 s y el máximo no puede ser menor.');
    }
  }

  async antes() {
    const hora = horaMadrid();
    if (hora < this.desdeHora || hora >= this.hastaHora) {
      throw new PausaOperativa(`fuera de horario (${this.desdeHora}:00–${this.hastaHora}:00 Europe/Madrid)`);
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

function identidad() {
  const contacto = process.env.BOT_CONTACTO ?? valorConfig('identidad.contacto', '');
  const url = process.env.BOT_URL ?? valorConfig('identidad.urlProyecto', '');
  if (!contacto) {
    throw new Error('Falta el contacto real (identidad.contacto) en recolector.valencia.config.json.');
  }
  return url ? `FacylfBot/1.0 (+${url}; ${contacto})` : `FacylfBot/1.0 (contacto: ${contacto})`;
}

function compruebaPermiso() {
  if (process.env.RFCYLF_PERMISO === 'SI') return;
  const concedido = valorConfig('permiso.concedido', false) === true;
  const minimo = Number(valorConfig('ritmo.intervaloMinSeg', 300));
  const maximo = Number(valorConfig('ritmo.intervaloMaxSeg', 420));
  if (!concedido) {
    console.warn(`ℹ️  Proyecto personal/no comercial: ritmo configurado de ${minimo}-${maximo} s entre peticiones.`);
  }
}

function permiteActasAdultas() { return valorConfig('alcance.actasAdultas', false) === true; }
function permiteActasMenores() { return valorConfig('alcance.actasMenores', false) === true; }
/** Madrid: la ficha de acta vive en una ruta que su robots.txt excluye (ver `pideActaMadrid`). */
function permiteActasMadrid() { return !ES_MADRID || valorConfig('alcance.actasMadrid', false) === true; }

function rutaIndiceJornadas(grupo) {
  return ES_MADRID
    ? `api/group-rounds?idGroup=${encodeURIComponent(grupo)}&fetchBy=results`
    : `api/filtros/jornadas_fetch.php?cod_grupo=${encodeURIComponent(grupo)}`;
}

function rutaResultados(grupo, jornada) {
  return ES_MADRID
    ? `api/results?idGroup=${encodeURIComponent(grupo)}&round=${encodeURIComponent(jornada)}`
    : `api/partidos/resultados_por_grupo_jornada_data.php?cod_grupo=${encodeURIComponent(grupo)}` +
      `&cod_jornada=${encodeURIComponent(jornada)}`;
}

function rutaClasificacion(grupo, jornada) {
  return ES_MADRID
    ? `api/standings?idGroup=${encodeURIComponent(grupo)}&round=${encodeURIComponent(jornada)}`
    : `api/clasificaciones/clasificaciones_ajax.php?cod_grupo=${encodeURIComponent(grupo)}` +
      `&cod_jornada=${encodeURIComponent(jornada)}`;
}

/** robots.txt se lee una vez por ejecución y se guarda la decisión en metadatos. */
async function cargaRobots() {
  const url = new URL('/robots.txt', PORTAL);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': identidad() }, signal: AbortSignal.timeout(15_000) });
    const contenido = await r.text();
    const reglas = [];
    let aplica = false;
    for (const lineaBruta of contenido.split(/\r?\n/)) {
      const linea = lineaBruta.replace(/#.*$/, '').trim();
      if (!linea) continue;
      const [campoBruto, ...resto] = linea.split(':');
      const campo = campoBruto.toLowerCase().trim();
      const valor = resto.join(':').trim();
      if (campo === 'user-agent') aplica = valor === '*';
      else if (aplica && (campo === 'allow' || campo === 'disallow')) reglas.push({ tipo: campo, ruta: valor });
    }
    return { disponible: r.ok, reglas };
  } catch {
    return { disponible: false, reglas: [] };
  }
}

function rutaPermitida(ruta, robots) {
  if (!robots.disponible) return true;
  const candidatas = robots.reglas
    .filter((regla) => regla.ruta && ruta.startsWith(regla.ruta))
    .sort((a, b) => b.ruta.length - a.ruta.length || (a.tipo === 'allow' ? -1 : 1));
  return candidatas.length === 0 || candidatas[0].tipo === 'allow';
}

/* ---------- Peticiones ---------- */

let ROBOTS = { disponible: false, reglas: [] };

/**
 * Una petición JSON espaciada y registrada. Devuelve el objeto ya interpretado.
 * La fuente marca `estado` y `sesion_ok`; si no son 1, la respuesta no es válida y se trata como
 * error en vez de guardar datos a medias.
 */
/*
 * ── LA FICHA DE PÁGINA DE LA FFCV (decisión de David, 20/10/2026) ──────────────────────────────────────────────
 *
 * Desde el 06/10 la API de ffcv.es sólo contesta si la petición trae la «ficha de página» que la propia página
 * pública pone en `<meta name="ffcv-pt">` y que su guion añade como cabecera `X-FFCV-Page-Token`, junto con la
 * cookie de sesión `ffcv_sid` (petición 166). Sin ella: 403 INVALID_PAGE_TOKEN.
 *
 * David decide seguir el mismo camino que sigue cualquier visitante: abrir la página pública, leer su ficha y
 * enviarla en las consultas, uno a uno y despacio. Lo que NO cambia, y es la línea que no se cruza:
 *   · el agente sigue siendo FacylfBot con su contacto (no nos hacemos pasar por un navegador);
 *   · ritmo de 10-14 s entre peticiones (la página también cuenta como petición), una a la vez;
 *   · nunca se pide el enlace-trampa `/competiciones/api/__hpt__/` ni nada que no sea la API de datos;
 *   · si con ficha válida la web vuelve a negar (403/429), es una negativa contra NOSOTROS: se para 30 días.
 * La ficha se renueva al cumplir 20 min o cuando la web dice que ya no vale (una sola vez por petición).
 */
let SESION_FFCV = null;            // { ficha, cookie, desde }
const VIDA_SESION_FFCV_MS = 20 * 60_000;

function cookieDeRespuesta(respuesta) {
  const lista = typeof respuesta.headers.getSetCookie === 'function'
    ? respuesta.headers.getSetCookie() : [respuesta.headers.get('set-cookie') ?? ''];
  for (const c of lista) {
    const m = /(?:^|,\s*)ffcv_sid=([^;]+)/.exec(c ?? '');
    if (m) return m[1];
  }
  return null;
}

async function abreSesionFfcv(ritmo, db, trabajo) {
  const url = new URL(`${PORTAL}/`);
  await ritmo.antes();
  const inicio = Date.now();
  const iniciadaEn = new Date(inicio).toISOString();
  let respuesta;
  try {
    respuesta = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', 'User-Agent': identidad() },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs: Date.now() - inicio,
      resultado: 'error', detalle: `página para la ficha: ${error instanceof Error ? error.message : String(error)}` });
    throw error;
  }
  const html = await respuesta.text();
  const duracionMs = Date.now() - inicio;
  const ficha = /<meta[^>]+name=["']ffcv-pt["'][^>]+content=["']([0-9a-f]{16,})["']/i.exec(html)?.[1]
    ?? /<meta[^>]+content=["']([0-9a-f]{16,})["'][^>]+name=["']ffcv-pt["']/i.exec(html)?.[1] ?? null;
  const cookie = cookieDeRespuesta(respuesta);
  registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
    resultado: respuesta.ok && ficha ? 'ok' : 'error',
    detalle: `página para la ficha: HTTP ${respuesta.status}${ficha ? '' : ' sin ficha'}${cookie ? '' : ' sin cookie'}` });
  if ([401, 403, 429, 451].includes(respuesta.status)) {
    throw new ErrorFuente(`HTTP ${respuesta.status} en la página pública de competiciones`, true);
  }
  if (!respuesta.ok || !ficha) {
    throw new ErrorFuente(`la página pública no trae la ficha de página (HTTP ${respuesta.status})`, false, false, 1);
  }
  SESION_FFCV = { ficha, cookie, desde: Date.now() };
  return SESION_FFCV;
}

async function pideJson(ritmo, db, trabajo, ruta, { vacioEsperable = false, renovada = false } = {}) {
  const url = new URL(ruta, `${PORTAL}/`);
  if (!rutaPermitida(url.pathname, ROBOTS)) {
    throw new ErrorFuente(`robots.txt no permite consultar ${url.pathname} con un agente genérico`);
  }
  if (/__hpt__/i.test(url.pathname)) throw new ErrorFuente('ruta-trampa para robots: no se pide nunca');
  const cabeceras = { Accept: 'application/json,text/plain;q=0.9,*/*;q=0.1', 'User-Agent': identidad() };
  if (!ES_MADRID) {
    if (!SESION_FFCV || Date.now() - SESION_FFCV.desde > VIDA_SESION_FFCV_MS) await abreSesionFfcv(ritmo, db, trabajo);
    cabeceras['X-FFCV-Page-Token'] = SESION_FFCV.ficha;
    cabeceras['X-Requested-With'] = 'XMLHttpRequest';
    cabeceras.Referer = `${PORTAL}/`;
    if (SESION_FFCV.cookie) cabeceras.Cookie = `ffcv_sid=${SESION_FFCV.cookie}`;
  }
  await ritmo.antes();
  const inicio = Date.now();
  const iniciadaEn = new Date(inicio).toISOString();
  let respuesta;
  try {
    respuesta = await fetch(url, {
      headers: cabeceras,
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs: Date.now() - inicio,
      resultado: 'error', detalle: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  const cuerpo = await respuesta.text();
  const duracionMs = Date.now() - inicio;
  if (!ES_MADRID && SESION_FFCV) {
    const nueva = cookieDeRespuesta(respuesta);
    if (nueva) SESION_FFCV.cookie = nueva;
  }

  // Barrera real: la web nos frena de forma explícita. Son los códigos en los que la negativa es
  // una decisión sobre QUIÉN pedimos (sin autorización, prohibido, demasiadas peticiones).
  //
  // El 503 NO está aquí a propósito: «servicio no disponible» es la web diciendo que ahora mismo no
  // puede atender, no que nosotros no podamos pedir. Se comprobó el 11/09/2026: un solo 503 en
  // resultados_por_grupo_jornada_data.php dejó Valencia parada 24 horas enteras por un corte
  // momentáneo del servidor. Un 503 se trata como sobrecarga: intento fallido, reintento escalonado
  // y una pausa corta de una hora, que respeta la señal sin congelar la federación un día.
  if ([401, 403, 429, 451].includes(respuesta.status)) {
    /*
     * ── BLOQUEO DECLARADO POR LA WEB (20/10/2026) ──────────────────────────────────────────────────────────
     *
     * Desde el 06/10 la FFCV exige a su API una «ficha de página» (`X-FFCV-Page-Token`, la meta `ffcv-pt` de la
     * página, ligada a la cookie `ffcv_sid`) y ha puesto un enlace-trampa para robots (`/competiciones/api/__hpt__/`).
     * Sin ficha contesta 403 con `x-ffcv-reason-code: INVALID_PAGE_TOKEN` y `{"error":"blocked"}` (petición 165).
     * Es una medida deliberada contra el acceso automático a su API: imitar la ficha sería saltarse el bloqueo, y
     * eso no se hace. Se para la federación 30 días (no un sondeo diario que la web ve como insistencia) y se
     * guarda el motivo para que se vea. Se reabre a mano si la FFCV da permiso o cambia su política.
     */
    const motivoDeclarado = respuesta.headers.get('x-ffcv-reason-code');
    if (!ES_MADRID && motivoDeclarado === 'INVALID_PAGE_TOKEN' && !renovada) {
      registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
        resultado: 'error', detalle: `HTTP ${respuesta.status} ${motivoDeclarado}: se renueva la ficha de página` });
      SESION_FFCV = null;
      return pideJson(ritmo, db, trabajo, ruta, { vacioEsperable, renovada: true });
    }
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'bloqueo', detalle: `HTTP ${respuesta.status}${motivoDeclarado ? ` ${motivoDeclarado}` : ''}` });
    const error = new ErrorFuente(`HTTP ${respuesta.status} en ${url.pathname}${motivoDeclarado ? ` (${motivoDeclarado})` : ''}`, true);
    if (motivoDeclarado) {
      error.motivoDeclarado = motivoDeclarado;
      error.peticionId = respuesta.headers.get('x-ffcv-request-id');
    }
    throw error;
  }
  if (respuesta.status >= 500 && respuesta.status <= 599) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'error', detalle: `HTTP ${respuesta.status} (servicio no disponible)` });
    throw new ErrorFuente(`HTTP ${respuesta.status} en ${url.pathname}: la fuente no puede atender ahora mismo`, false, false, 1);
  }
  if (!respuesta.ok) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'error', detalle: `HTTP ${respuesta.status}` });
    throw new ErrorFuente(`HTTP ${respuesta.status} en ${url.pathname}`);
  }
  if (/captcha|access denied|acceso denegado|sonicwall|too many requests/i.test(cuerpo.slice(0, 4_000))) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'bloqueo', detalle: 'barrera o límite detectado' });
    throw new ErrorFuente('barrera o límite detectado', true);
  }

  // Respuesta legítimamente vacía (12/10/2026). La API de RFFM contesta `null` (4 B) a una
  // clasificación o a unos resultados de una jornada que todavía no existe. Eso no es un fallo de la
  // fuente: es «no hay nada aquí». Tratarlo como error sumaba al contador de fallos seguidos y dejó a
  // Madrid en pausa preventiva a 10 peticiones/hora con 647 trabajos vencidos. Sólo se acepta donde
  // la llamada lo pide (`vacioEsperable`); en el resto sigue siendo un error con su motivo.
  if (vacioEsperable && /^(null|\[\]|\{\}|""|)$/.test(cuerpo.trim())) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'ok', detalle: `${cuerpo.length} B vacío` });
    return {};
  }
  let datos = null;
  try { datos = JSON.parse(cuerpo); } catch { /* respuesta no JSON */ }
  if (datos === null) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'error', detalle: `${cuerpo.length} B sin JSON` });
    // Página vacía o sin contenido: NO es una barrera (lección de Murcia). Se reintenta y, si
    // sigue igual, se descarta con el motivo guardado.
    throw new ErrorFuente(`${ruta} no devolvió JSON utilizable (${cuerpo.length} B)`);
  }
  const estado = datos.estado === undefined ? null : String(datos.estado);
  const sesion = datos.sesion_ok === undefined ? null : String(datos.sesion_ok);
  if ((estado !== null && estado !== '1') || (sesion !== null && sesion !== '1')) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'error', detalle: `estado=${estado} sesion_ok=${sesion}` });
    throw new ErrorFuente(`La fuente devolvió estado=${estado} sesion_ok=${sesion}`);
  }
  registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
    resultado: 'ok', detalle: `${cuerpo.length} B` });
  return datos;
}

/**
 * Descarga la ficha de acta de Madrid.
 *
 * RFFM no publica la ficha como JSON en su API pública: el único sitio donde están las
 * alineaciones, los goles, las tarjetas y los árbitros es la página `/acta-partido/<codacta>`, y su
 * robots.txt excluye expresamente esa ruta (junto con `/fichaequipo/` y `/fichajugador/`).
 *
 * DECISIÓN DEL RESPONSABLE DEL PROYECTO (12/09/2026, elegida en el chat): obtenerlas igual que en
 * el resto de territoriales — la misma página pública que abre una persona, con agente
 * identificado, 4-6 s entre inicios cuando la propia respuesta lo permite, sin paralelismo y con
 * retroceso ante errores — porque
 * negarse sólo en Madrid dejaba el proyecto a medias teniendo ya el código de acta de los 38.916
 * partidos. No se rota IP, no se falsea el agente y no se resuelve ningún captcha. Se apaga con
 * `alcance.actasMadrid: false` en `recolector.madrid.config.json`, y la decisión queda anotada en la
 * propia cola (metadato `actas_madrid`).
 */
async function pideActaMadrid(ritmo, db, trabajo) {
  const url = new URL(`/acta-partido/${encodeURIComponent(trabajo.acta)}`, `${PORTAL}/`);
  await ritmo.antes();
  const inicio = Date.now();
  const iniciadaEn = new Date(inicio).toISOString();
  let respuesta;
  try {
    respuesta = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'User-Agent': identidad(),
      },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs: Date.now() - inicio,
      resultado: 'error', detalle: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  const cuerpo = await respuesta.text();
  const duracionMs = Date.now() - inicio;
  // Mismas barreras y mismo trato que en las APIs: la negativa explícita se respeta y un 503 es
  // sobrecarga momentánea (una hora de pausa), no una decisión sobre quién pide.
  if ([401, 403, 429, 451].includes(respuesta.status)) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'bloqueo', detalle: `HTTP ${respuesta.status}` });
    throw new ErrorFuente(`HTTP ${respuesta.status} en ${url.pathname}`, true);
  }
  if (respuesta.status >= 500 && respuesta.status <= 599) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'error', detalle: `HTTP ${respuesta.status} (servicio no disponible)` });
    throw new ErrorFuente(`HTTP ${respuesta.status} en ${url.pathname}: la fuente no puede atender ahora mismo`, false, false, 1);
  }
  if (!respuesta.ok) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'error', detalle: `HTTP ${respuesta.status}` });
    throw new ErrorFuente(`HTTP ${respuesta.status} en ${url.pathname}`);
  }
  if (/captcha|access denied|acceso denegado|sonicwall|too many requests/i.test(cuerpo.slice(0, 4_000))) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'bloqueo', detalle: 'barrera o límite detectado' });
    throw new ErrorFuente('barrera o límite detectado', true);
  }
  // La página se sirve renderizada en el servidor: el partido entero viaja en `__NEXT_DATA__`, con
  // la misma forma que la ficha JSON de Valencia (mismos nombres de campo), así que se reutiliza el
  // mismo intérprete en vez de escribir un parser de HTML que se rompería con cada rediseño.
  const incrustado = cuerpo.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  let datos = null;
  if (incrustado) {
    try { datos = JSON.parse(incrustado[1]); } catch { /* JSON ilegible */ }
  }
  const ficha = datos?.props?.pageProps?.game ?? null;
  if (!ficha) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'sin_publicar', detalle: `${cuerpo.length} B sin datos de partido` });
    throw new ActaSinDatos(`La ficha de acta ${trabajo.acta} no trae datos de partido (${cuerpo.length} B)`);
  }
  const estado = ficha.estado === undefined ? null : String(ficha.estado);
  const sesion = ficha.sesion_ok === undefined ? null : String(ficha.sesion_ok);
  if ((estado !== null && estado !== '1') || (sesion !== null && sesion !== '1')) {
    registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
      resultado: 'error', detalle: `estado=${estado} sesion_ok=${sesion}` });
    throw new ErrorFuente(`La ficha de acta devolvió estado=${estado} sesion_ok=${sesion}`);
  }
  registraPeticion(db, { trabajo: trabajo.clave, url: url.href, iniciadaEn, duracionMs,
    resultado: 'ok', detalle: `${cuerpo.length} B de HTML` });
  return ficha;
}

/* ---------- Estructura del catálogo ---------- */

function cargaCatalogo() {
  if (!existsSync(CATALOGO)) throw new Error(`No existe el catálogo de Valencia: ${CATALOGO}`);
  const doc = leeJson(CATALOGO);
  const porTemporada = new Map();
  for (const t of doc.temporadas ?? []) {
    porTemporada.set(String(t.codigo), t);
  }
  return { doc, porTemporada };
}

function guardaCompeticion(db, temporada, competicion) {
  db.prepare(`insert into competiciones(temporada,codigo,nombre,origen,comprobada_en)
    values(?,?,?,?,?) on conflict(temporada,codigo) do update set nombre=excluded.nombre,
    comprobada_en=excluded.comprobada_en`)
    .run(temporada, competicion.codigo, competicion.nombre, 'isquad', ahoraIso());
}

function guardaGrupo(db, temporada, competicion, grupo) {
  // A propósito NO se escribe `grupo.total_jornadas` (que el catálogo sí trae) en `grupos.jornadas`:
  // en todo el sistema `grupos.jornadas` significa "jornadas que tiene el grupo según su índice ya
  // leído", y el visor lo usa así para medir la estructura. Meter ahí un número estimado del
  // catálogo haría que Valencia apareciera con el 100 % de los índices leídos sin haber leído
  // ninguno, y el usuario pidió expresamente que lo real y lo estimado no se mezclen. El total del
  // catálogo sigue disponible en `descargas-federacion-sondeo/valencia-isquad-sondeo.json`.
  db.prepare(`insert into grupos(temporada,competicion,codigo,nombre,estado,comprobado_en)
    values(?,?,?,?,'presente',?) on conflict(temporada,competicion,codigo) do update set
    nombre=excluded.nombre, comprobado_en=excluded.comprobado_en`)
    .run(temporada, competicion, grupo.codigo, grupo.nombre, ahoraIso());
}

/** Arma la cola completa a partir del catálogo ya descubierto, sin abrir la red. */
function preparaCola(db) {
  const { porTemporada } = cargaCatalogo();
  const desde = numero('desde', 2015);
  let temporadas = 0;
  let competiciones = 0;
  let grupos = 0;
  enTransaccion(db, () => {
    for (const [codigo, t] of porTemporada) {
      const anio = 2004 + Number(codigo);
      if (anio < desde) continue;
      db.prepare(`insert into temporadas(codigo,etiqueta,origen,comprobada_en) values(?,?,?,?)
        on conflict(codigo) do update set etiqueta=excluded.etiqueta`)
        .run(codigo, etiquetaTemporada(codigo), 'isquad', ahoraIso());
      temporadas += 1;
      encola(db, 'catalogo_temporada', { temporada: codigo },
        prioridadPlaneada('catalogo_temporada', '', codigo));
      for (const c of t.competiciones ?? []) {
        guardaCompeticion(db, codigo, c);
        competiciones += 1;
        const prioridadGrupos = prioridadPlaneada('grupos', c.nombre, codigo);
        encola(db, 'grupos', { temporada: codigo, competicion: c.codigo }, prioridadGrupos);
        for (const g of c.grupos ?? []) {
          guardaGrupo(db, codigo, c.codigo, g);
          grupos += 1;
          encola(db, 'indice_jornadas', { temporada: codigo, competicion: c.codigo, grupo: g.codigo },
            prioridadPlaneada('indice_jornadas', c.nombre, codigo));
        }
      }
    }
  });
  return { temporadas, competiciones, grupos };
}

/** Nombre de la competición, para prioridades y para decidir si es de menores. */
function nombreCompeticion(db, trabajo) {
  return db.prepare('select nombre from competiciones where temporada=? and codigo=?')
    .get(trabajo.temporada, trabajo.competicion)?.nombre ?? '';
}

/* ---------- Trabajos ---------- */

function carpetaDe(trabajo) {
  return rutaGrupo(CARPETA, trabajo.temporada, trabajo.competicion, trabajo.grupo);
}

function guardaJson(ruta, datos, db, tipo) {
  return guardaAtomico(ruta, JSON.stringify(datos, null, 2), db, tipo);
}

function registraJornadas(db, trabajo, jornadas) {
  enTransaccion(db, () => {
    for (const j of jornadas) {
      const numeroJornada = entero(j.codjornada);
      if (numeroJornada === null) continue;
      db.prepare(`insert into jornadas(temporada,competicion,grupo,numero,fecha,comprobada_en)
        values(?,?,?,?,?,?) on conflict(temporada,competicion,grupo,numero) do update set
        fecha=coalesce(excluded.fecha, jornadas.fecha), comprobada_en=excluded.comprobada_en`)
        .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, numeroJornada,
          fechaIso(j.fecha_jornada), ahoraIso());
    }
    db.prepare('update grupos set jornadas=?, jornadas_comprobadas_en=? where temporada=? and competicion=? and codigo=?')
      .run(jornadas.length, ahoraIso(), trabajo.temporada, trabajo.competicion, trabajo.grupo);
  });
}

/** Lleva las dos variantes públicas de iSquad a una fila común de partido. */
function normalizaPartidos(partidos) {
  if (!ES_MADRID) return partidos;
  return partidos.map((p) => ({
    codacta: texto(p.codacta),
    cod_equipo_local: texto(p.CodEquipo_local),
    cod_equipo_visitante: texto(p.CodEquipo_visitante),
    local: texto(p.Nombre_equipo_local),
    visitante: texto(p.Nombre_equipo_visitante),
    resultado: p.Goles_casa === '' || p.Goles_visitante === ''
      ? '' : `${texto(p.Goles_casa)}-${texto(p.Goles_visitante)}`,
    fecha: texto(p.fecha),
    hora: texto(p.hora),
    campo: texto(p.campojuego),
    arbitro: texto(p.arbitro),
    hay_actas: texto(p.hay_actas),
  }));
}

/** Guarda los partidos de una jornada y encola el acta de cada uno. Devuelve el nº de partidos. */
function registraPartidos(db, trabajo, partidos, nombreComp) {
  const menores = esCompeticionDeMenores(nombreComp) ? 1 : 0;
  let conActa = 0;
  // El bloque de descanso no es un partido: se separa ANTES de escribir, para que no ocupe un `orden` ni
  // dé de alta un equipo en el catálogo. La regla está declarada y probada en `lib/filas-descanso-isquad.mjs`.
  const { descansos, sospechosas } = separaDescansos(partidos);
  /*
   * QUÉ se escribe lo decide `decideFilasDeJornada`, que es puro y está probado. Aquí sólo se le dan los
   * datos: las filas actuales de la jornada y el acta de cada bloque. La razón de que exista ese paso es la
   * RECUPERACIÓN: la reconstrucción puede haber corregido una fila —donde el calendario pone «Descansa», el
   * acta de esa misma fila nombra dos equipos reales— y reescribir la jornada compactando la borraría,
   * porque la fuente nunca publicó ese partido. Medido: los 28 partidos recuperados de Valencia.
   */
  const filasActuales = db.prepare(`select orden, codigo_acta, equipo_local_codigo, equipo_visitante_codigo,
    local, visitante, goles_local, goles_visitante, fecha, hora, campo, campo_codigo, arbitro from partidos
    where temporada=? and competicion=? and grupo=? and jornada=?`)
    .all(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada);
  const actaDe = (codigoActa) => {
    const codigo = texto(codigoActa);
    if (!codigo) return null;
    try {
      const fila = db.prepare(`select datos from actas where codigo=? and temporada=? and competicion=? and grupo=?`)
        .get(codigo, trabajo.temporada, trabajo.competicion, trabajo.grupo);
      const datos = JSON.parse(fila?.datos ?? '{}');
      return datos?.local && datos?.visitante ? [String(datos.local), String(datos.visitante)] : null;
    } catch { return null; }
  };
  const escritura = decideFilasDeJornada({ partidos, filasActuales, actaDe });
  enTransaccion(db, () => {
    db.prepare(`delete from partidos where temporada=? and competicion=? and grupo=? and jornada=?`)
      .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada);
    for (const { orden, partido, conservada } of escritura.filas) {
      /*
       * Una fila CONSERVADA se vuelve a escribir tal y como estaba: no se deduce de la fuente —la fuente no
       * la tiene— sino que es la que el acta sostiene y la cola ya tenía.
       */
      if (conservada) {
        db.prepare(`insert into partidos(temporada,competicion,grupo,jornada,orden,codigo_acta,
          equipo_local_codigo,equipo_visitante_codigo,local,visitante,goles_local,goles_visitante,
          fecha,hora,campo,campo_codigo,arbitro,actualizado_en) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, orden,
            conservada.codigo_acta, conservada.equipo_local_codigo, conservada.equipo_visitante_codigo,
            conservada.local, conservada.visitante, conservada.goles_local, conservada.goles_visitante,
            conservada.fecha, conservada.hora, conservada.campo, conservada.campo_codigo,
            conservada.arbitro, ahoraIso());
        continue;
      }
      const p = partido;
      const marcador = texto(p.resultado).match(/(\d+)\s*-\s*(\d+)/);
      const golesLocal = marcador ? Number(marcador[1]) : null;
      const golesVisitante = marcador ? Number(marcador[2]) : null;
      db.prepare(`insert into partidos(temporada,competicion,grupo,jornada,orden,codigo_acta,
        equipo_local_codigo,equipo_visitante_codigo,local,visitante,goles_local,goles_visitante,
        fecha,hora,campo,arbitro,actualizado_en) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, orden,
          texto(p.codacta) || null, texto(p.cod_equipo_local) || null, texto(p.cod_equipo_visitante) || null,
          texto(p.local), texto(p.visitante), golesLocal, golesVisitante,
          fechaIso(p.fecha), texto(p.hora) || null, texto(p.campo) || null,
          texto(p.arbitro) || null, ahoraIso());
      const codActa = texto(p.codacta);
      if (codActa && (!ES_MADRID || texto(p.hay_actas) === '1')) {
        conActa += 1;
        for (const lado of ['local', 'visitante']) {
          const codigoEquipo = texto(lado === 'local' ? p.cod_equipo_local : p.cod_equipo_visitante);
          if (codigoEquipo) {
            db.prepare(`insert into equipos(temporada,codigo,nombre,primera_jornada) values(?,?,?,?)
              on conflict(temporada,codigo) do update set nombre=excluded.nombre,
              primera_jornada=min(coalesce(equipos.primera_jornada, excluded.primera_jornada), excluded.primera_jornada)`)
              .run(trabajo.temporada, codigoEquipo, texto(lado === 'local' ? p.local : p.visitante),
                trabajo.jornada);
          }
        }
        // Madrid publica el código y el estado del acta en resultados; su ficha vive en una ruta
        // excluida por robots.txt y se obtiene con `pideActaMadrid` (ver la decisión allí anotada).
        // Apagado con `alcance.actasMadrid: false`, en cuyo caso sólo se conserva la relación del
        // partido con su código de acta, como antes.
        if (permiteActasMadrid()) {
          db.prepare(`insert into actas(codigo,temporada,competicion,grupo,jornada,menores,estado)
            values(?,?,?,?,?,?,'pendiente') on conflict(temporada,competicion,grupo,jornada,codigo)
            do update set menores=excluded.menores`)
            .run(codActa, trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, menores);
          encola(db, 'acta', {
            temporada: trabajo.temporada, competicion: trabajo.competicion, grupo: trabajo.grupo,
            jornada: trabajo.jornada, acta: codActa,
          }, prioridadPlaneada('acta', nombreComp, trabajo.temporada));
        }
      }
    }
  });
  return { partidos: escritura.filas.length, conActa, menores, descansos: descansos.length, sospechosas: sospechosas.length, equiposQueDescansan: descansos.map((d) => d.equipoQueDescansan).filter(Boolean), recuperadas: escritura.recuperadas };
}

/* ---------- Interpretación del acta ---------- */

// Códigos que publica iSquad. No están documentados: se dedujeron con actas reales el 11/09/2026.
//
// Tarjetas (verificado): de 153 amonestaciones leídas, las tres con `segunda_amarilla=1` llevaban
// código 100, así que 100 es la amarilla (también cuando es la segunda). El código 101 nunca lleva
// `segunda_amarilla`, así que no es una doble amarilla: es la roja.
//
// Goles (verificado por aritmética del marcador): el marcador es un dato independiente de la lista
// de goleadores, así que una lista que no suma lo que marca el marcador delata una propia puerta.
// De 45 actas, la única que descuadraba (26317226, 2-1 con listas 1 y 2) tenía un gol de código 102
// en el lado que sumaba de más: 102 es la propia puerta. El 101 nunca descuadra —es un gol normal a
// favor de quien lo marca— y con 100 y 102 ya asignados, 101 es el gol de penalti. Esto último es
// una deducción por eliminación, no una observación directa: si algún día aparece un acta que lo
// contradiga, se corrige aquí y se sube VERSION_PARSER para reprocesar sin volver a pedir nada.
const TIPO_AMONESTACION = { 100: 'amarilla', 101: 'roja' };
const TIPO_GOL = { 100: 'normal', 101: 'penalti', 102: 'propia-puerta' };

function nombreJugador(j) {
  return texto(j.nombre_visible) || texto(j.nombre_jugador) || texto(j.nombre_real) || '(sin nombre)';
}

const esAusenciaPersona = (valor) => /^(?:ez\s+du\s+aurkezten|no\s+presenta|no\s+se\s+presenta|sin\s+presentar|—|-)$/i
  .test(texto(valor));

function nombreTecnico(t) {
  const nombre = texto(t.nombre_visible) || texto(t.nombre) || texto(t.nombre_otros_tecnicos);
  return nombre && !esAusenciaPersona(nombre) ? nombre : '';
}

const ROLES_TECNICOS = {
  'Entrenador/a': 'entrenador',
  Entrenador: 'entrenador',
  'Delegado/a': 'delegado',
  Delegado: 'delegado',
  'Delegado/a de Campo': 'delegado-campo',
  'Encargado Material': 'encargado-material',
  'Preparador/a Físico': 'preparador-fisico',
  'Fisioterapeuta': 'fisioterapeuta',
  'Médico': 'medico',
  'Segundo Entrenador': 'segundo-entrenador',
};

function rolTecnico(tipo) {
  const t = texto(tipo);
  if (ROLES_TECNICOS[t]) return ROLES_TECNICOS[t];
  const generico = sinAcentos(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return generico || 'tecnico';
}

/** Convierte la ficha JSON de iSquad en la estructura común que guarda la librería. */
function interpretaFicha(ficha) {
  const incidencias = [];
  const lineups = {
    local: { titulares: [], suplentes: [], convocados: [], portero: null },
    visitante: { titulares: [], suplentes: [], convocados: [], portero: null },
  };
  for (const lado of ['local', 'visitante']) {
    for (const j of ficha[`jugadores_equipo_${lado}`] ?? []) {
      const entrada = {
        codigoJugador: texto(j.codjugador) || null,
        nombre: nombreJugador(j),
        dorsal: entero(j.dorsal),
      };
      const titular = texto(j.titular) === '1';
      const suplente = texto(j.suplente) === '1';
      if (titular) lineups[lado].titulares.push(entrada);
      else if (suplente) lineups[lado].suplentes.push(entrada);
      else {
        // Sin marca de titular/suplente: se conserva como suplente y se anota, en vez de perderlo.
        lineups[lado].suplentes.push(entrada);
        incidencias.push(`jugador_sin_condicion:${entrada.nombre}`);
      }
      // El portero del acta es el que sale de titular bajo palos. iSquad marca `portero=1` también
      // en el suplente, así que hay que exigir las dos cosas.
      if (texto(j.portero) === '1' && titular && !lineups[lado].portero) {
        lineups[lado].portero = entrada.nombre;
      }
    }
    // En estas fichas de Madrid la marca no significa "salió de inicio": aparecen 12-14 por
    // equipo, todos titular=1 y ninguno suplente. Se guardan como convocados de condición no
    // publicada; así cuentan en la convocatoria, pero no se les atribuyen partidos/minutos falsos.
    if (ES_MADRID && lineups[lado].suplentes.length === 0 && lineups[lado].titulares.length > 11) {
      lineups[lado].convocados.push(...lineups[lado].titulares.splice(0));
      incidencias.push(`fuente_no_distingue_titulares_suplentes:${lado}`);
    }
  }

  const tecnicos = [];
  for (const lado of ['local', 'visitante']) {
    const sufijo = lado === 'local' ? 'local' : 'visitante';
    for (const [campo, rol] of [['entrenador', 'entrenador'], ['entrenador2', 'segundo-entrenador']]) {
      const nombre = nombreTecnico({ nombre: ficha[`${campo}_${sufijo}`] });
      if (nombre) tecnicos.push({ lado, rol, nombre });
    }
    for (const rol of ['delegado', 'delegadocampo']) {
      const valor = rol === 'delegado' ? ficha[`delegado_${sufijo}`] : ficha.delegadocampo;
      const nombre = esAusenciaPersona(valor) ? '' : texto(valor);
      // El delegado de campo es único en el acta iSquad, no de un lado concreto.
      if (nombre && rol !== 'delegadocampo') tecnicos.push({ lado, rol: 'delegado', nombre });
      else if (nombre && !tecnicos.some((t) => t.rol === 'delegado-campo')) {
        tecnicos.push({ lado: null, rol: 'delegado-campo', nombre });
      }
    }
    for (const t of ficha[`otros_tecnicos_${sufijo}`] ?? []) {
      const nombre = nombreTecnico(t);
      if (nombre) tecnicos.push({ lado, rol: rolTecnico(t.tipo), nombre });
    }
  }

  const goles = [];
  for (const lado of ['local', 'visitante']) {
    for (const g of ficha[`goles_equipo_${lado}`] ?? []) {
      const codigo = entero(g.tipo_gol);
      let tipo = TIPO_GOL[codigo];
      if (!tipo) {
        tipo = `codigo-${codigo}`;
        incidencias.push(`tipo_gol_desconocido:${codigo}`);
      }
      const detalle = texto(g.minuto).match(/^(\d+)(?:\+(\d+))?/);
      const minuto = minutoEvento(detalle?.[1], incidencias);
      goles.push({
        jugador: nombreJugador(g), lado, tipo,
        minuto,
        minutoBase: minuto,
        minutoAnadido: minuto == null ? null : (detalle?.[2] ? Number(detalle[2]) : null),
      });
    }
  }
  // `goles_penalti` es la tanda de penaltis, no goles del partido: si la hay, esos lanzamientos no
  // cuentan para el marcador y se excluyen de la lista de goles del acta.
  const claveGol = (nombre, minuto) => `${sinAcentos(nombre).toLowerCase().replace(/[^a-z0-9]/g, '')}|${minuto}`;
  const tanda = new Set((ficha.goles_penalti ?? []).map((g) => claveGol(nombreJugador(g), entero(g.minuto))));
  const deTanda = goles.filter((g) => tanda.has(claveGol(g.jugador, g.minuto)));
  if (deTanda.length) {
    incidencias.push(`tanda_de_penaltis_excluida:${deTanda.length}`);
    for (let i = goles.length - 1; i >= 0; i -= 1) {
      if (tanda.has(claveGol(goles[i].jugador, goles[i].minuto))) goles.splice(i, 1);
    }
  }

  const tarjetas = [];
  for (const lado of ['local', 'visitante']) {
    for (const t of ficha[`tarjetas_equipo_${lado}`] ?? []) {
      const codigo = entero(t.codigo_tipo_amonestacion);
      let tipo = TIPO_AMONESTACION[codigo];
      if (texto(t.segunda_amarilla) === '1') tipo = 'doble-amarilla';
      if (!tipo) {
        tipo = `amonestacion-${codigo}`;
        incidencias.push(`tipo_amonestacion_desconocido:${codigo}`);
      }
      tarjetas.push({ tipo, jugador: nombreJugador(t), lado, minuto: minutoEvento(t.minuto, incidencias) });
    }
  }
  for (const t of ficha.otras_tarjetas ?? []) {
    incidencias.push('otras_tarjetas_presentes');
    tarjetas.push({ tipo: 'otra', jugador: nombreJugador(t), lado: null,
      minuto: minutoEvento(t.minuto, incidencias) });
  }

  const cambios = [];
  for (const lado of ['local', 'visitante']) {
    for (const c of ficha[`sustituciones_equipo_${lado}`] ?? []) {
      cambios.push({
        lado, minuto: minutoEvento(c.minuto, incidencias),
        saliente: texto(c.nombre_jugador_sale), entrante: texto(c.nombre_jugador_entra),
      });
    }
  }

  const arbitros = (ficha.arbitros_partido ?? []).map((a) => texto(a.nombre_arbitro)).filter(Boolean);

  // Algunas respuestas repiten literalmente la misma tarjeta. Se conserva una sola ocurrencia;
  // una doble amarilla real usa un tipo distinto y no se pierde con esta clave.
  const tarjetasUnicas = [...new Map(tarjetas.map((t) => [
    `${t.tipo}|${sinAcentos(t.jugador)}|${t.lado ?? ''}|${t.minuto ?? ''}`, t,
  ])).values()];

  // Partido SUSPENDIDO (23/10/2026): la ficha trae «0-0» y ningún jugador, y se guardaba como si hubiera
  // acabado 0-0 (Valencia 2026-27: cientos de partidos de fútbol sala base). Un suspendido no tiene resultado.
  const suspendido = texto(ficha.suspendido) === '1';
  if (suspendido) incidencias.push('partido_suspendido');
  return {
    parseada: {
      local: texto(ficha.equipo_local), visitante: texto(ficha.equipo_visitante),
      golesLocal: suspendido ? null : entero(ficha.goles_local),
      golesVisitante: suspendido ? null : entero(ficha.goles_visitante),
      lineups, tecnicos, goles, tarjetas: tarjetasUnicas, cambios,
    },
    arbitros,
    arbitroPrincipal: arbitros[0] ?? null,
    incidencias,
  };
}

/**
 * Criterio de calidad, con las mismas etiquetas que el recolector pnfg: `correcta`,
 * `administrativa` o `revisar`. Aquí es más fácil de comprobar que allí porque la fuente ya viene
 * estructurada: el marcador se puede contrastar con los goles detallados, la alineación con las
 * condiciones reales y los minutos con los que publica la ficha.
 */
function evaluaCalidad(parseada, incidencias) {
  const lista = [...incidencias];
  // Un partido suspendido sin jugadores no es un acta mala: es un hecho administrativo (no se jugó).
  const titularesSusp = parseada.lineups.local.titulares.length + parseada.lineups.visitante.titulares.length;
  if (lista.includes('partido_suspendido') && titularesSusp === 0) {
    return { calidad: 'administrativa', incidencias: ['partido_suspendido'] };
  }
  if (parseada.golesLocal == null || parseada.golesVisitante == null) lista.push('sin_marcador');
  const titulares = parseada.lineups.local.titulares.length + parseada.lineups.visitante.titulares.length;
  const convocados = (parseada.lineups.local.convocados?.length ?? 0)
    + (parseada.lineups.visitante.convocados?.length ?? 0);
  if (titulares === 0 && convocados === 0) lista.push('sin_alineaciones');
  // Un gol en propia puerta suma en el marcador del rival pero aparece en la lista del equipo que
  // lo marca, así que con ellos presentes el descuadre es esperado y no es una incidencia.
  const propios = parseada.goles.filter((g) => g.tipo === 'propia-puerta').length;
  const golesMarcador = (parseada.golesLocal ?? 0) + (parseada.golesVisitante ?? 0);
  if (parseada.golesLocal != null && propios === 0 && golesMarcador !== parseada.goles.length) {
    lista.push(`descuadre_goles:${golesMarcador}/${parseada.goles.length}`);
  }
  if (!parseada.tecnicos.length) lista.push('sin_cuerpo_tecnico');
  const sinMinuto = [...parseada.goles, ...parseada.cambios, ...parseada.tarjetas]
    .filter((e) => e.minuto == null).length;
  if (sinMinuto) lista.push(`eventos_sin_minuto:${sinMinuto}`);
  const unicas = [...new Set(lista)];
  return { calidad: unicas.length ? 'revisar' : 'correcta', incidencias: unicas };
}

/** Cuenta de actas por reparar, calculada una vez por sesión (ver el mantenimiento cada 25 trabajos). */
let actasDesactualizadasEnSesion = null;
function cuentaActasDesactualizadas(db) {
  return db.prepare(`select count(*) n from actas where estado='hecha' and archivo is not null
    and coalesce(version_parser,0)<?`).get(VERSION_PARSER).n;
}

function reparaActasDesactualizadas(db, limite = 50) {
  const actas = db.prepare(`select codigo acta,temporada,competicion,grupo,jornada,menores,archivo
    from actas where estado='hecha' and archivo is not null and coalesce(version_parser,0)<?
    order by temporada,competicion,grupo,jornada,codigo limit ?`).all(VERSION_PARSER, limite);
  let procesadas = 0;
  let fallidas = 0;
  for (const acta of actas) {
    try {
      const ficha = JSON.parse((leeArchivo(acta.archivo) ?? readFileSync(acta.archivo)).toString('utf8').replace(/^\uFEFF/, ''));
      const { parseada, arbitros, arbitroPrincipal, incidencias } = interpretaFicha(ficha);
      const calidad = evaluaCalidad(parseada, incidencias);
      guardaActaEstructura(db, acta, acta, parseada);
      if (arbitroPrincipal) {
        db.prepare(`update partidos set arbitro=? where temporada=? and competicion=? and grupo=?
          and jornada=? and codigo_acta=?`).run(arbitros.join(' / '), acta.temporada,
          acta.competicion, acta.grupo, acta.jornada, acta.acta);
      }
      db.prepare(`update actas set datos=?,comprobada_en=?,version_parser=?,calidad=?,incidencias=?
        where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?`)
        .run(JSON.stringify(parseada), ahoraIso(), VERSION_PARSER, calidad.calidad,
          JSON.stringify(calidad.incidencias), acta.temporada, acta.competicion, acta.grupo,
          acta.jornada, acta.acta);
      procesadas += 1;
    } catch (error) {
      fallidas += 1;
      db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`)
        .run(ahoraIso(), 'aviso', 'reparacion_parser_isquad',
          `${acta.acta}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { procesadas, fallidas };
}

/* ---------- Procesado por tipo de trabajo ---------- */

async function procesa(ritmo, db, trabajo) {
  const nombreComp = nombreCompeticion(db, trabajo);

  if (trabajo.tipo === 'catalogo_temporada') {
    // El descubridor iSquad es quien refresca el catálogo de forma reanudable. Aquí se importa su
    // instantánea local: evita pedir dos veces la misma lista y funciona igual para Madrid y
    // Valencia, cuyas APIs de catálogo tienen formas distintas.
    const { porTemporada } = cargaCatalogo();
    const lista = porTemporada.get(String(trabajo.temporada))?.competiciones ?? [];
    let nuevas = 0;
    enTransaccion(db, () => {
      for (const c of lista) {
        const codigo = texto(c.codigo ?? c.cod_competicion);
        if (!codigo) continue;
        const existia = db.prepare('select 1 x from competiciones where temporada=? and codigo=?')
          .get(trabajo.temporada, codigo);
        guardaCompeticion(db, trabajo.temporada, { codigo, nombre: texto(c.nombre) });
        if (!existia) {
          nuevas += 1;
          encola(db, 'grupos', { temporada: trabajo.temporada, competicion: codigo },
            prioridadPlaneada('grupos', texto(c.nombre), trabajo.temporada));
        }
      }
    });
    return `${lista.length} competiciones importadas del catálogo; ${nuevas} nuevas (sin petición)`;
  }

  if (trabajo.tipo === 'grupos') {
    const { porTemporada } = cargaCatalogo();
    const t = porTemporada.get(String(trabajo.temporada));
    const c = (t?.competiciones ?? []).find((x) => String(x.codigo) === String(trabajo.competicion));
    let grupos = c?.grupos ?? [];
    if (!grupos.length && ES_MADRID) {
      // El sondeo de Madrid ya recorrió el catálogo oficial completo. Algunas competiciones
      // históricas existen como ficha pero nunca llegaron a publicar grupos; no se debe caer en
      // el endpoint valenciano (que pertenece a otra plataforma) ni fabricar una ruta alternativa.
      db.prepare('update competiciones set grupos_comprobados_en=? where temporada=? and codigo=?')
        .run(ahoraIso(), trabajo.temporada, trabajo.competicion);
      return '0 grupos en el catálogo oficial; competición sin fase publicada (sin petición)';
    }
    if (!grupos.length) {
      // El catálogo no los tiene: se piden. Es el único caso en el que este trabajo usa la red.
      const datos = await pideJson(ritmo, db, trabajo,
        `api/filtros/grupos_fetch.php?cod_competicion=${encodeURIComponent(trabajo.competicion)}`);
      grupos = (datos.grupos ?? []).map((g) => ({
        codigo: texto(g.codigo ?? g.cod_grupo), nombre: texto(g.nombre),
        total_jornadas: entero(g.total_jornadas),
      }));
    }
    enTransaccion(db, () => {
      for (const g of grupos) {
        if (!g.codigo) continue;
        guardaGrupo(db, trabajo.temporada, trabajo.competicion, g);
        encola(db, 'indice_jornadas', {
          temporada: trabajo.temporada, competicion: trabajo.competicion, grupo: g.codigo,
        }, prioridadPlaneada('indice_jornadas', nombreComp, trabajo.temporada));
      }
      db.prepare('update competiciones set grupos_comprobados_en=? where temporada=? and codigo=?')
        .run(ahoraIso(), trabajo.temporada, trabajo.competicion);
    });
    return `${grupos.length} grupos (${c?.grupos?.length ? 'del catálogo, sin petición' : 'pedidos a la fuente'})`;
  }

  if (trabajo.tipo === 'indice_jornadas') {
    // `vacioEsperable` (15/10/2026): la API de RFFM contesta `null` (4 B) al índice de un grupo sin jornadas.
    // Tratarlo como «sin JSON» lo contaba como fallo sistémico: cinco seguidos y la federación entera se paraba
    // UNA HORA (en Madrid, 48 pausas así en dos días; es lo que la dejaba en ~80 peticiones/hora). Ahora llega
    // como lista vacía y sigue el camino de abajo: reintento y, si persiste, grupo ausente, sin pausar a nadie.
    const datos = await pideJson(ritmo, db, trabajo, rutaIndiceJornadas(trabajo.grupo), { vacioEsperable: true });
    const jornadas = datos.jornadas ?? [];
    // Un grupo puede devolver la lista vacía de forma transitoria: se comprobó el 11/09/2026 con seis
    // grupos que respondieron vacío y, al reintentarlos, tres devolvieron sus jornadas. Por eso NO se
    // marca ausente aquí: se trata como un fallo normal, se reintenta y sólo si sigue vacío tras
    // varios intentos se declara ausente (ver la rama de descarte en el bucle de sesión).
    if (!jornadas.length) {
      // Es una situación normal en catálogos históricos: hay grupos creados pero retirados,
      // competiciones sin comenzar y respuestas que temporalmente llegan vacías. Se reintenta y
      // finalmente se declara el grupo ausente, pero nunca debe contar como un fallo sistémico
      // capaz de detener toda la federación.
      throw new ErrorFuente('la fuente no publica ninguna jornada para este grupo', false, true);
    }
    const carpeta = carpetaDe(trabajo);
    const ruta = join(carpeta, 'calendario.json');
    guardaJson(ruta, { origen: 'jornadas_fetch', jornadas }, db, 'calendario');
    registraJornadas(db, trabajo, jornadas);
    // El índice de jornadas ES el calendario del grupo: se resuelve el mismo trabajo de calendario
    // con esta misma respuesta, sin gastar otra petición.
    const claveCalendario = claveTrabajo('calendario', {
      temporada: trabajo.temporada, competicion: trabajo.competicion, grupo: trabajo.grupo,
    });
    encola(db, 'calendario', {
      temporada: trabajo.temporada, competicion: trabajo.competicion, grupo: trabajo.grupo,
    }, prioridadPlaneada('calendario', nombreComp, trabajo.temporada));
    marcaTrabajo(db, claveCalendario, 'hecho');
    // Clasificación: una por grupo, con la última jornada conocida.
    encola(db, 'clasificacion', {
      temporada: trabajo.temporada, competicion: trabajo.competicion, grupo: trabajo.grupo,
    }, prioridadPlaneada('clasificacion', nombreComp, trabajo.temporada));

    // Una jornada futura no se consulta: se aplaza a la mañana siguiente a su fecha.
    const hoy = fechaLocal();
    let aplazadas = 0;
    for (const j of jornadas) {
      const numeroJornada = entero(j.codjornada);
      if (numeroJornada === null) continue;
      const fecha = fechaIso(j.fecha_jornada);
      const clave = claveTrabajo('jornada', {
        temporada: trabajo.temporada, competicion: trabajo.competicion,
        grupo: trabajo.grupo, jornada: numeroJornada,
      });
      encola(db, 'jornada', {
        temporada: trabajo.temporada, competicion: trabajo.competicion,
        grupo: trabajo.grupo, jornada: numeroJornada,
      }, prioridadPlaneada('jornada', nombreComp, trabajo.temporada));
      if (fecha && fecha >= hoy) {
        // La misma noche del partido (21:00 UTC), no a las 06:00 del día siguiente (11/10/2026). Lo que aún no
        // esté publicado lo recoge el repaso de jornadas recientes de cada sesión.
        const manana = new Date(`${fecha}T21:00:00.000Z`);
        db.prepare('update trabajos set siguiente_intento=? where clave=? and estado=\'pendiente\'')
          .run(manana.toISOString(), clave);
        aplazadas += 1;
      }
    }
    return `${jornadas.length} jornadas; calendario resuelto; ${aplazadas} aplazadas por fecha futura`;
  }

  if (trabajo.tipo === 'calendario') {
    // Lo resuelve `indice_jornadas` con la misma respuesta; si llega aquí es que se encoló aparte.
    const carpeta = carpetaDe(trabajo);
    if (existsSync(join(carpeta, 'calendario.json'))) return 'calendario ya guardado';
    const datos = await pideJson(ritmo, db, trabajo, rutaIndiceJornadas(trabajo.grupo));
    guardaJson(join(carpeta, 'calendario.json'), { origen: 'jornadas_fetch', jornadas: datos.jornadas ?? [] },
      db, 'calendario');
    registraJornadas(db, trabajo, datos.jornadas ?? []);
    return 'calendario guardado';
  }

  if (trabajo.tipo === 'clasificacion') {
    // La última jornada YA JUGADA, no la última del calendario (12/10/2026): en la temporada en curso
    // pedir la clasificación de la jornada 34 en octubre devolvía `null` y contaba como fallo.
    const hoyIso = new Date().toISOString().slice(0, 10);
    const ultima = db.prepare(`select max(numero) n from jornadas where temporada=? and competicion=? and grupo=?
        and (fecha is null or substr(fecha,1,10) <= ?)`)
      .get(trabajo.temporada, trabajo.competicion, trabajo.grupo, hoyIso)?.n
      ?? db.prepare(`select max(numero) n from jornadas where temporada=? and competicion=? and grupo=?`)
        .get(trabajo.temporada, trabajo.competicion, trabajo.grupo)?.n ?? 1;
    const datos = await pideJson(ritmo, db, trabajo, rutaClasificacion(trabajo.grupo, ultima), { vacioEsperable: true });
    const filas = (datos.clasificacion ?? []).map((f) => ({
      posicion: entero(f.posicion) ?? 0,
      equipoCodigo: texto(f.codequipo) || null,
      equipo: texto(f.nombre),
      puntos: entero(f.puntos) ?? 0,
      jugados: entero(f.jugados) ?? 0,
      ganados: entero(f.ganados) ?? 0,
      empatados: entero(f.empatados) ?? 0,
      perdidos: entero(f.perdidos) ?? 0,
      ultimos: (f.racha_partidos ?? []).map((r) => texto(r.tipo)).filter(Boolean),
      sancion: entero(f.puntos_sancion) ?? 0,
    }));
    const temporadaActual = Number(db.prepare(
      'select max(cast(codigo as integer)) codigo from temporadas'
    ).get()?.codigo);
    if (!filas.length && Number(trabajo.temporada) === temporadaActual) {
      throw new PendientePublicacion('la clasificación de la temporada vigente aún está vacía', 7);
    }
    const carpeta = carpetaDe(trabajo);
    guardaJson(join(carpeta, 'clasificacion.json'), filas, db, 'clasificacion');
    return `clasificación oficial de ${filas.length} equipos (jornada ${ultima})`;
  }

  if (trabajo.tipo === 'jornada') {
    const datos = await pideJson(ritmo, db, trabajo, rutaResultados(trabajo.grupo, trabajo.jornada), { vacioEsperable: true });
    const partidos = normalizaPartidos(datos.partidos ?? []);
    // Una jornada de descanso NO es una jornada sin publicar. En los grupos de número impar de
    // equipos, la API devuelve una fila cuyo equipo es «Descansa» (código -1) y sin resultado; y en
    // algunas jornadas históricas devuelve la lista vacía. Antes las dos cosas acababan en
    // «la fuente no publica partidos para esta jornada», que se reintentaba cada dos días para
    // siempre: 159 grupos de Valencia llevaban así desde 2015 y no podían publicarse nunca por una
    // jornada que no tiene partidos que jugar. Comprobado el 13/09/2026 pidiendo la jornada 26-28
    // del grupo 33483: la API contesta 200 con una única fila «Descansa» contra un equipo.
    const esDescanso = (p) => /descansa|descanso/i.test(texto(p.local)) || /descansa|descanso/i.test(texto(p.visitante)) ||
      texto(p.cod_equipo_local) === '-1' || texto(p.cod_equipo_visitante) === '-1';
    const soloDescansos = partidos.length > 0 && partidos.every(esDescanso);
    // Y sólo se da por vacía una jornada de una temporada YA TERMINADA cuyo grupo sí tenga otras
    // jornadas con partidos: eso prueba que la fuente publica ese grupo y que a esta jornada no le
    // corresponden partidos. En la temporada en curso se sigue esperando, porque puede aparecer.
    const temporadaActual = Number(db.prepare(
      'select max(cast(codigo as integer)) codigo from temporadas'
    ).get()?.codigo);
    const temporadaCerrada = Number(trabajo.temporada) < temporadaActual;
    const grupoPublicado = Number(db.prepare(`select count(*) n from partidos where temporada=?
      and competicion=? and grupo=?`).get(
      trabajo.temporada, trabajo.competicion, trabajo.grupo).n) > 0;
    const jornadaVacia = temporadaCerrada && grupoPublicado && (!partidos.length || soloDescansos);
    // Un JSON correcto con `partidos: []` sólo acredita que la API respondió, no que la jornada
    // esté completa. Valencia lo devuelve también para cruces aún no cargados y para algunos
    // grupos históricos retirados. Se reintenta de forma individual y, tras tres respuestas
    // iguales, se aparta con el motivo guardado; nunca se publica como una jornada completa vacía.
    if (!partidos.length && !jornadaVacia) {
      throw new ErrorFuente('la fuente no publica partidos para esta jornada', false, true);
    }
    // Si la jornada ya se jugó pero la fuente todavía no publica ningún resultado, no se guarda un
    // calendario a medias: se aplaza el trabajo y se vuelve a mirar en dos días.
    const conResultado = partidos.filter((p) => /\d+\s*-\s*\d+/.test(texto(p.resultado))).length;
    const fechaJornada = db.prepare(`select fecha from jornadas where temporada=? and competicion=?
      and grupo=? and numero=?`).get(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada)?.fecha;
    if (partidos.length && conResultado === 0 && !jornadaVacia && fechaJornada && fechaJornada < fechaLocal()) {
      throw new PendientePublicacion('la jornada ya se jugó pero la fuente aún no publica resultados', 2);
    }
    const carpeta = carpetaDe(trabajo);
    const ruta = join(carpeta, 'jornadas', `jornada-${trabajo.jornada}.json`);
    const guardado = guardaJson(ruta, { origen: 'resultados_por_grupo_jornada', grupo: datos.grupo,
      jornada: datos.jornada, partidos, ...(jornadaVacia ? {
        nota: soloDescansos
          ? 'jornada sin partidos: la fuente sólo publica el descanso de un equipo'
          : 'jornada sin partidos: la fuente no publica ninguno para esta jornada',
      } : {}) }, db, 'jornada');
    db.prepare(`update jornadas set archivo=?,hash=?,comprobada_en=? where temporada=? and competicion=?
      and grupo=? and numero=?`)
      .run(ruta, guardado.hash, ahoraIso(), trabajo.temporada, trabajo.competicion,
        trabajo.grupo, trabajo.jornada);
    if (jornadaVacia) {
      return `jornada sin partidos de ${soloDescansos ? 'descanso' : 'la fuente'}; guardada para que el grupo pueda publicarse`;
    }
    const r = registraPartidos(db, trabajo, partidos, nombreComp);
    const enlaces = ES_MADRID
      ? `${r.conActa} actas encoladas (ficha /acta-partido/)`
      : `${r.conActa} actas enlazadas`;
    return `${r.partidos} partidos; ${enlaces}${r.menores ? ' (categoría de base)' : ''}`
      + (r.descansos ? `; ${r.descansos} bloque(s) de descanso no guardados como partido` : '')
      + (r.sospechosas ? `; ${r.sospechosas} fila(s) con nombre de descanso que se conservan` : '');
  }

  if (trabajo.tipo === 'acta') {
    if (!permiteActasMadrid()) {
      const error = new Error('actas de Madrid desactivadas por alcance.actasMadrid=false');
      error.fueraDeAlcance = true;
      throw error;
    }
    const acta = db.prepare(`select menores from actas where temporada=? and competicion=?
      and grupo=? and jornada=? and codigo=?`)
      .get(trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
    if (!acta) throw new Error('acta no registrada');
    if (acta.menores ? !permiteActasMenores() : !permiteActasAdultas()) {
      // No es un fallo transitorio: la configuración dice que esta acta no se analiza. Se marca
      // como fuera de alcance para que no se reintente en cada sesión. El acta queda como
      // 'pendiente_ambito' (mismo valor que usa el recolector pnfg), y eso significa que su grupo
      // no cumplirá la condición de publicación: es la consecuencia deliberada de no analizarla.
      const error = new Error('acta fuera del alcance configurado');
      error.fueraDeAlcance = true;
      throw error;
    }
    // No se pide una ficha que sabemos que todavía no puede existir. iSquad publica el código de
    // acta al crear el calendario, incluso meses antes del partido; recorrerlo ahora gastaba una
    // petición por cada jornada futura y escondía las actas históricas que sí están disponibles.
    // Se aplaza hasta el día posterior al encuentro. Al llegar esa fecha, la misma cola la recoge.
    const fechaPartido = texto(db.prepare(`select fecha from partidos where temporada=? and competicion=?
      and grupo=? and jornada=? and codigo_acta=? limit 1`).get(
      trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta)?.fecha);
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaPartido) && fechaPartido > fechaLocal()) {
      const diasHastaDespues = Math.max(1, Math.ceil(
        (Date.parse(`${fechaPartido}T12:00:00.000Z`) - Date.now()) / (24 * 60 * 60_000),
      ) + 1);
      throw new PendientePublicacion(`el partido está previsto para ${fechaPartido}`, diasHastaDespues);
    }
    const ficha = ES_MADRID
      ? await pideActaMadrid(ritmo, db, trabajo)
      : await pideJson(ritmo, db, trabajo,
        `api/partidos/ficha_partido_ajax.php?cod_partido=${encodeURIComponent(trabajo.acta)}`);
    // Las fotos vienen incrustadas en base64 y son el 95 % del peso (362 KB -> 18 KB). Se guardan
    // fuera: son imágenes de personas y no aportan nada a los datos.
    const limpia = JSON.parse(JSON.stringify(ficha, (clave, valor) =>
      /foto|escudo|url_img|_debug/.test(clave) ? undefined : valor));
    const { parseada, arbitros, arbitroPrincipal, incidencias } = interpretaFicha(ficha);
    const calidad = evaluaCalidad(parseada, incidencias);
    const carpetaActas = join(carpetaDe(trabajo), acta.menores ? 'actas-menores' : 'actas-adultos');
    const ruta = join(carpetaActas, `acta-${trabajo.acta}.json`);
    const guardado = guardaJson(ruta, { origen: ES_MADRID ? 'acta-partido' : 'ficha_partido_ajax', ...limpia }, db, 'acta');
    const jugadores = parseada.lineups.local.titulares.length + parseada.lineups.local.suplentes.length +
      (parseada.lineups.local.convocados?.length ?? 0) + parseada.lineups.visitante.titulares.length +
      parseada.lineups.visitante.suplentes.length + (parseada.lineups.visitante.convocados?.length ?? 0);
    const sinContenidoDeportivo = parseada.golesLocal == null && parseada.golesVisitante == null &&
      jugadores === 0 && parseada.goles.length === 0 && parseada.tarjetas.length === 0 &&
      parseada.cambios.length === 0;
    // Acta todavía ABIERTA (partido en juego o sin cerrar): no se da por hecha (ver lib/acta-abierta.mjs).
    const abierta = decideActaAbierta({
      actaCerrada: ficha.acta_cerrada, enJuego: ficha.partido_en_juego, suspendido: ficha.suspendido,
      temporada: trabajo.temporada,
      temporadaActual: Number(db.prepare('select max(cast(codigo as integer)) codigo from temporadas').get()?.codigo),
      fechaPartido: /^\d{4}-\d{2}-\d{2}$/.test(fechaPartido) ? fechaPartido : null, hoy: fechaLocal(),
    });
    if (abierta) {
      db.prepare(`update actas set archivo=?,hash=?,incidencias=?,comprobada_en=? where temporada=?
        and competicion=? and grupo=? and jornada=? and codigo=? and estado<>'hecha'`).run(
        ruta, guardado.hash, JSON.stringify([abierta.motivo]), ahoraIso(),
        trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta,
      );
      throw new PendientePublicacion(abierta.motivo, abierta.dias);
    }
    if (sinContenidoDeportivo && !incidencias.includes('partido_suspendido')) {
      // iSquad crea la ficha antes de publicar el acta. La respuesta JSON es válida, pero darla por
      // terminada publicaría un partido sin marcador ni jugadores. El fichero queda archivado y la
      // cola vuelve a comprobarlo dentro de dos días.
      db.prepare(`update actas set archivo=?,hash=?,incidencias=?,comprobada_en=? where temporada=?
        and competicion=? and grupo=? and jornada=? and codigo=?`).run(
        ruta, guardado.hash, JSON.stringify(['la ficha existe pero todavía no publica datos']), ahoraIso(),
        trabajo.temporada, trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta,
      );
      throw new PendientePublicacion('la ficha del acta existe pero todavía no publica datos', 2);
    }
    guardaActaEstructura(db, trabajo, acta, parseada);
    if (arbitroPrincipal) {
      db.prepare(`update partidos set arbitro=? where temporada=? and competicion=? and grupo=?
        and jornada=? and codigo_acta=?`).run(arbitros.join(' / '), trabajo.temporada,
        trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
    }
    db.prepare(`update actas set estado='hecha',archivo=?,hash=?,datos=?,comprobada_en=?,
      version_parser=?,calidad=?,incidencias=? where temporada=? and competicion=? and grupo=?
      and jornada=? and codigo=?`)
      .run(ruta, guardado.hash, JSON.stringify(parseada), ahoraIso(), VERSION_PARSER,
        calidad.calidad, JSON.stringify(calidad.incidencias), trabajo.temporada,
        trabajo.competicion, trabajo.grupo, trabajo.jornada, trabajo.acta);
    const titulares = parseada.lineups.local.titulares.length + parseada.lineups.visitante.titulares.length;
    const suplentes = parseada.lineups.local.suplentes.length + parseada.lineups.visitante.suplentes.length;
    const convocados = (parseada.lineups.local.convocados?.length ?? 0)
      + (parseada.lineups.visitante.convocados?.length ?? 0);
    return `acta ${acta.menores ? 'de base' : 'adulta'} guardada y analizada; ` +
      `${parseada.golesLocal ?? '?'}-${parseada.golesVisitante ?? '?'}, ${titulares} titulares, ` +
      `${suplentes} suplentes${convocados ? `, ${convocados} convocados sin condición publicada` : ''}, ` +
      `${parseada.goles.length} goles, ${parseada.tecnicos.length} técnicos` +
      (calidad.calidad === 'revisar' ? `; revisar: ${calidad.incidencias.slice(0, 4).join(', ')}` : '');
  }

  throw new Error(`tipo no implementado: ${trabajo.tipo}`);
}

/* ---------- Bucle de sesión ---------- */

function liberaTrabajo(db, clave) {
  db.prepare(`update trabajos set estado='pendiente',actualizado_en=? where clave=?`).run(ahoraIso(), clave);
}

/**
 * Siguiente trabajo de la cola, con un filtro opcional por texto de la clave (`--solo`).
 *
 * Sirve para dos cosas: probar una cadena completa (temporada, competición o grupo concretos) sin
 * recorrer los 10.000 trabajos de descubrimiento que van antes, y volver a procesar una
 * competición suelta sin tocar el resto.
 */
function siguienteTrabajoFiltrado(db, solo) {
  if (!solo) return siguienteTrabajo(db);
  return db.prepare(`
    select * from trabajos
    where estado in ('pendiente', 'bloqueado')
      and (siguiente_intento is null or siguiente_intento <= ?)
      and clave like '%' || ? || '%'
      and ${sqlExcluyeTemporadasViejas('trabajos')}
    order by prioridad, coalesce(cast(temporada as integer), -1) desc,
      case when tipo='acta' then 0 else 1 end, creado_en
    limit 1
  `).get(ahoraIso(), solo, TEMPORADA_MINIMA);
}

function anotaUltimaPeticion(db, trabajo, resultado, detalle) {
  db.prepare(`update peticiones set resultado=?,detalle=? where id=(
    select id from peticiones where trabajo=? order by id desc limit 1)`).run(resultado, detalle, trabajo.clave);
}

/** Comprobación de una pasada sobre la cola (lo que hace el informe `estado`). */function resumenCola(db) {
  const uno = (sql) => db.prepare(sql).get().n;
  const total = uno('select count(*) n from trabajos');
  const hecho = uno("select count(*) n from trabajos where estado='hecho'");
  const pendiente = uno("select count(*) n from trabajos where estado='pendiente'");
  const bloqueado = uno("select count(*) n from trabajos where estado='bloqueado'");
  const cancelado = uno("select count(*) n from trabajos where estado='cancelado'");
  const porTipo = db.prepare(`select tipo, count(*) total, sum(estado='hecho') hecho from trabajos
    group by tipo order by min(prioridad)`).all();
  const grupos = uno('select count(*) n from grupos');
  const jornadas = uno('select count(*) n from jornadas');
  const partidos = uno('select count(*) n from partidos');
  const actas = uno('select count(*) n from actas');
  const actasHechas = uno("select count(*) n from actas where estado='hecha'");
  const pausa = pausaGlobalActiva(db);
  return { total, hecho, pendiente, bloqueado, cancelado, porTipo, grupos, jornadas, partidos, actas, actasHechas, pausa };
}

/** Encola las actas de las jornadas que ya estaban descargadas.
 *
 *  Mientras las actas de Madrid estuvieron fuera de alcance, sus jornadas se guardaron con el
 *  código de acta de cada partido pero SIN crear la fila en `actas` ni el trabajo `acta`. Esto
 *  recorre los JSON de jornada ya archivados —sin pedir nada a la federación— y crea lo que falta,
 *  respetando `hay_actas` cuando la fuente lo publica. Es idempotente: `encola` conserva el estado
 *  de los trabajos existentes y el `on conflict` de `actas` sólo actualiza `menores`, así que puede
 *  repetirse sin duplicar ni reabrir nada.
 */
function encolaActasAntiguas(db) {
  const jornadas = db.prepare(`select temporada,competicion,grupo,numero,archivo from jornadas
    where archivo is not null and archivo <> '' order by temporada,competicion,grupo,numero`).all();
  const nombres = new Map();
  const nombreCompeticion = (temporada, competicion) => {
    const clave = `${temporada}|${competicion}`;
    if (!nombres.has(clave)) {
      nombres.set(clave, texto(db.prepare(`select nombre from competiciones where temporada=? and codigo=?`)
        .get(temporada, competicion)?.nombre ?? ''));
    }
    return nombres.get(clave);
  };
  const actaConocida = db.prepare(`select 1 as hay from actas where temporada=? and competicion=?
    and grupo=? and jornada=? and codigo=?`);
  let leidas = 0; let encoladas = 0; let sinFichero = 0; let sinCodigo = 0; let sinPublicar = 0;
  enTransaccion(db, () => {
    for (const jornada of jornadas) {
      if (!existsSync(jornada.archivo)) { sinFichero += 1; continue; }
      let doc;
      try {
        doc = JSON.parse((leeArchivo(jornada.archivo) ?? readFileSync(jornada.archivo)).toString('utf8').replace(/^\uFEFF/, ''));
      } catch { sinFichero += 1; continue; }
      leidas += 1;
      const nombreComp = nombreCompeticion(jornada.temporada, jornada.competicion);
      const menores = esCompeticionDeMenores(nombreComp) ? 1 : 0;
      for (const partido of doc.partidos ?? []) {
        const codActa = texto(partido.codacta);
        if (!codActa) { sinCodigo += 1; continue; }
        // Madrid publica `hay_actas`: '1' cuando la ficha existe. Sin ese campo (Valencia) se acepta.
        if (partido.hay_actas !== undefined && texto(partido.hay_actas) !== '1') { sinPublicar += 1; continue; }
        const yaEstaba = Boolean(actaConocida.get(jornada.temporada, jornada.competicion, jornada.grupo,
          jornada.numero, codActa));
        db.prepare(`insert into actas(codigo,temporada,competicion,grupo,jornada,menores,estado)
          values(?,?,?,?,?,?,'pendiente') on conflict(temporada,competicion,grupo,jornada,codigo)
          do update set menores=excluded.menores`)
          .run(codActa, jornada.temporada, jornada.competicion, jornada.grupo, jornada.numero, menores);
        encola(db, 'acta', {
          temporada: jornada.temporada, competicion: jornada.competicion, grupo: jornada.grupo,
          jornada: jornada.numero, acta: codActa,
        }, prioridadPlaneada('acta', nombreComp, jornada.temporada));
        if (!yaEstaba) encoladas += 1;
      }
    }
  });
  console.log(`Actas antiguas: ${leidas} jornadas archivadas leídas, ${encoladas} actas encoladas` +
    (sinFichero ? `, ${sinFichero} sin fichero legible` : '') +
    (sinCodigo ? `, ${sinCodigo} partidos sin código de acta` : '') +
    (sinPublicar ? `, ${sinPublicar} sin acta publicada (hay_actas<>1)` : '') + '.');
  return { leidas, encoladas, sinFichero, sinCodigo, sinPublicar };
}

async function ejecutar(db) {
  compruebaPermiso();
  // El catálogo se actualiza en una tarea independiente. Una sesión de ingesta puede permanecer
  // viva durante días, así que no basta con preparar la cola manualmente una vez: al arrancar y
  // periódicamente se fusiona el catálogo local con la cola. `encola` es idempotente y conserva
  // los trabajos ya terminados; sólo aparecen las competiciones y grupos recién publicados.
  const sincronizacionInicial = preparaCola(db);
  console.log(`Catálogo local sincronizado: ${sincronizacionInicial.temporadas} temporadas, ` +
    `${sincronizacionInicial.competiciones} competiciones y ${sincronizacionInicial.grupos} grupos.`);
  const reparacion = reparaActasDesactualizadas(db, 50);
  if (reparacion.procesadas || reparacion.fallidas) {
    console.log(`Mantenimiento local iSquad: ${reparacion.procesadas} actas reparadas, ` +
      `${reparacion.fallidas} fallidas.`);
  }
  const suspendidas = recalificaSuspendidas(db);
  if (suspendidas) console.log(`  · ${suspendidas} actas de partidos suspendidos dejan de figurar como 0-0 (marcador nulo, «administrativa»).`);
  const actasAbiertas = reabreActasLeidasAbiertas(db);
  if (actasAbiertas) console.log(`  · ${actasAbiertas} actas leídas con el acta todavía abierta: vuelven a la cola.`);
  const reabiertas = reabreClasificacionesVaciasActuales(db);
  if (reabiertas) {
    console.log(`  · ${reabiertas} clasificaciones vacías de la temporada vigente aplazadas para revisión.`);
  }
  let repaso = preparaRepasoJornadasRecientes(db);
  if (repaso.jornadas || repaso.clasificaciones) {
    console.log(`  · Repaso reciente: ${repaso.jornadas} jornadas y ` +
      `${repaso.clasificaciones} clasificaciones vuelven a cola sin repetir actas completas.`);
  }
  const reordenados = repriorizaPlan(db);
  if (reordenados) console.log(`  · ${reordenados} trabajos reordenados según las fases actuales.`);
  const pausa = pausaGlobalActiva(db);
  if (pausa) {
    console.log(`Recolección en pausa hasta ${pausa.hasta}: ${pausa.motivo}`);
    return;
  }
  const max = numero('max', 200);
  const solo = argumento('solo', '');
  // Si la sesión anterior murió a mitad de un trabajo (un corte, un OOM, un reinicio), esa fila se quedó en
  // 'en_curso' sin nadie trabajándola: vuelve a la cola, no se pierde ni se da por hecha.
  const aMedias = db.prepare("update trabajos set estado='pendiente' where estado='en_curso'").run().changes;
  if (aMedias > 0) console.log(`  · ${aMedias} trabajo(s) que quedaron a medias en una sesión anterior vuelven a la cola.`);
  const siguiente = siguienteTrabajoFiltrado(db, solo);
  if (!siguiente) {
    const proximo = db.prepare(`select min(siguiente_intento) t from trabajos
      where estado='pendiente' and siguiente_intento is not null`).get()?.t ?? null;
    console.log('Sin trabajo disponible ahora' +
      (proximo ? `; el próximo está aplazado a ${proximo}` : '') + '. No se hacen peticiones.');
    return;
  }
  ROBOTS = await cargaRobots();
  guardaMetadato(db, 'robots_disponible', ROBOTS.disponible ? '1' : '0');
  console.log(ROBOTS.disponible
    ? `robots.txt consultado: ${ROBOTS.reglas.length} regla(s) para agente genérico.`
    : 'robots.txt no disponible: no hay reglas que respetar.');

  const ritmo = new Ritmo(db);
  let hechos = 0;
  let fallosSeguidos = 0;
  /*
   * ── LOS FALLOS DE RED NO SON FALLOS DE LA FEDERACIÓN ───────────────────────────────────────────────────
   *
   * Aquí abajo, en la pausa preventiva, ya está escrita la lección de este mismo caso: «Madrid encadenó cinco
   * `The operation was aborted due to timeout` y se quedó parada SEIS horas teniendo 30.000 trabajos
   * disponibles». Se bajó la pausa de seis horas a una, pero la CAUSA siguió igual: un tiempo de espera
   * agotado contaba como fallo de la federación. Medido el 24/09/2026 en Valencia: cinco sesiones de cinco
   * terminaron en pausa global, 18.812 s (5,2 h de cada 24) sin recolectar, y la última perdió una sesión
   * que ya había recogido 1.244 actas por cinco `fetch failed` seguidos —que es un fallo de red nuestro
   * (resolución de nombres o conexión cortada), no un rechazo del portal—.
   *
   * Un `fetch failed` o un tiempo agotado pertenecen a ESA dirección, y con la máquina a tope muchas veces
   * son de casa. Llevan su propio contador y un umbral mucho más alto, para que la federación siga con sus
   * miles de actas y una caída REAL del portal se siga detectando igual.
   */
  let fallosDeRed = 0;
  /*
   * ── Y LA CUENTA POR COMPETICIÓN, QUE ES LA QUE EVITA LA PAUSA INÚTIL (24/09/2026) ────────────────────────
   *
   * Medido en Madrid: el plan sirve actas de la MISMA competición una detrás de otra, así que cuando una
   * competición entera agota el tiempo (`acta|19|17145791|…`) se encadenan decenas de fallos de red seguidos y
   * la federación acaba en la pausa de una hora **teniendo miles de actas buenas esperando detrás**. Ese mismo
   * día Madrid llegó a los 30 fallos seguidos y se paró.
   *
   * Es el problema que ya tenía Cataluña con los calendarios y la misma solución: apartar lo que NO se puede
   * leer para que pase lo que SÍ. La diferencia es que aquí se aparta ESA competición, no el tipo de trabajo
   * entero: las actas son el producto, y de otras competiciones se leen perfectamente.
   */
  const fallosDeRedPorCompeticion = new Map();
  /** Fallos de red seguidos sobre la MISMA competición antes de apartarla. */
  const FALLOS_RED_POR_COMPETICION = 4;
  /** Cuánto se aparta. Corto a propósito: la competición puede volver a responder en un rato. */
  const HORAS_APARTAR_COMPETICION = 3;
  while (hechos < max) {
    const trabajo = siguienteTrabajoFiltrado(db, solo);
    if (!trabajo) break;
    db.prepare("update trabajos set estado='en_curso',actualizado_en=? where clave=?")
      .run(ahoraIso(), trabajo.clave);
    console.log(`→ ${trabajo.clave}`);
    try {
      const detalle = await procesa(ritmo, db, trabajo);
      marcaTrabajo(db, trabajo.clave, 'hecho');
      console.log(`  ✓ ${detalle}`);
      hechos += 1;
      fallosSeguidos = 0;
      fallosDeRed = 0;
      // Y si esa competición acaba de responder bien, se le borra la cuenta de fallos de red.
      fallosDeRedPorCompeticion.delete(trabajo.competicion);
      // Antes se CONTABAN las actas desactualizadas cada 25 trabajos, y ese `count(*)` recorre la tabla `actas`
      // entera (con el JSON de cada una): en las colas de 1,5-2 GB eran 2-4 minutos parado cada 25 trabajos
      // (medido el 16/10/2026: CyL y Madrid con un silencio así cada 5-8 min). Ahora se cuenta UNA vez por sesión
      // y luego se descuenta lo reparado: las actas nuevas ya se guardan con el parser actual.
      if (hechos % 25 === 0 && actasDesactualizadasEnSesion === null) actasDesactualizadasEnSesion = cuentaActasDesactualizadas(db);
      if (hechos % 25 === 0 && actasDesactualizadasEnSesion > 0) {
        const mantenimiento = reparaActasDesactualizadas(db, 5);
        actasDesactualizadasEnSesion = Math.max(0, actasDesactualizadasEnSesion - 5);
        console.log(`  · mantenimiento local iSquad: ${mantenimiento.procesadas} actas actualizadas` +
          (mantenimiento.fallidas ? `, ${mantenimiento.fallidas} pendientes de revisar` : '') + '.');
      }
      if (hechos % 250 === 0) {
        const sincronizacion = preparaCola(db);
        console.log(`  · catálogo local resincronizado: ${sincronizacion.competiciones} competiciones, ` +
          `${sincronizacion.grupos} grupos conocidos.`);
        repaso = preparaRepasoJornadasRecientes(db);
        if (repaso.jornadas || repaso.clasificaciones) {
          console.log(`  · Repaso reciente: ${repaso.jornadas} jornadas y ` +
            `${repaso.clasificaciones} clasificaciones reactivadas.`);
        }
      }
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (error?.operativa) {
        liberaTrabajo(db, trabajo.clave);
        console.log(`  ⏸ ${mensaje}. La cola queda intacta para la próxima ejecución.`);
        break;
      }
      if (error?.fueraDeAlcance) {
        // Se cancela el trabajo y se deja constancia en el acta: así no se reintenta cada sesión
        // y el visor puede contar cuántas quedaron excluidas por configuración.
        marcaTrabajo(db, trabajo.clave, 'cancelado', mensaje, null);
        if (trabajo.tipo === 'acta') {
          db.prepare(`update actas set estado='pendiente_ambito',incidencias=? where temporada=?
            and competicion=? and grupo=? and jornada=? and codigo=?`)
            .run(JSON.stringify([mensaje]), trabajo.temporada, trabajo.competicion, trabajo.grupo,
              trabajo.jornada, trabajo.acta);
        }
        const excluidas = Number(leeMetadato(db, 'actas_fuera_alcance') ?? 0) + 1;
        guardaMetadato(db, 'actas_fuera_alcance', String(excluidas));
        console.warn(`  ⊘ ${mensaje}. Descartada (${excluidas} en total).`);
        continue;
      }
      if (error?.pendientePublicacion) {
        const siguienteFecha = new Date(Date.now() + Number(error.dias) * 24 * 60 * 60_000).toISOString();
        anotaUltimaPeticion(db, trabajo, 'sin_publicar', mensaje);
        marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, siguienteFecha);
        console.log(`  ◷ Aún no publicado. Se volverá a comprobar después de ${siguienteFecha}.`);
        hechos += 1;
        continue;
      }
      if (error?.actaSinDatos && trabajo.tipo === 'acta') {
        const intentosActa = Number(trabajo.intentos ?? 0) + 1;
        const temporadaActual = Number(db.prepare(
          'select max(cast(codigo as integer)) codigo from temporadas'
        ).get()?.codigo);
        const decision = decideActaSinDatos({
          temporada: trabajo.temporada, temporadaActual, intentos: intentosActa,
        });
        if (decision.cerrar) {
          anotaUltimaPeticion(db, trabajo, 'sin_datos', mensaje);
          db.prepare(`update actas set estado='sin_datos',incidencias=?,comprobada_en=? where temporada=?
            and competicion=? and grupo=? and jornada=? and codigo=? and estado<>'hecha'`)
            .run(JSON.stringify(['la federación publica la ficha pero todavía no contiene datos de partido']),
              ahoraIso(), trabajo.temporada, trabajo.competicion, trabajo.grupo,
              trabajo.jornada, trabajo.acta);
          marcaTrabajo(db, trabajo.clave, 'cancelado', mensaje, null);
          console.warn(`  ℹ️ ${mensaje}. Tras dos comprobaciones en una temporada cerrada se conserva como ficha sin datos.`);
          continue;
        }
        const siguienteFecha = decision.siguiente;
        anotaUltimaPeticion(db, trabajo, 'sin_publicar', mensaje);
        marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, siguienteFecha);
        console.log(`  ◷ Ficha sin datos; se volverá a comprobar después de ${siguienteFecha}.`);
        hechos += 1;
        continue;
      }
      const bloqueo = Boolean(error?.bloqueo);
      const intentos = Number(trabajo.intentos ?? 0) + 1;
      anotaUltimaPeticion(db, trabajo, bloqueo ? 'bloqueo' : error?.esperable ? 'sin_publicar' : 'error', mensaje);

      if (bloqueo && error?.motivoDeclarado) {
        const hasta = establecePausaGlobal(db, 30 * 24, `${mensaje}: bloqueo declarado por la web; no se insiste`, trabajo);
        guardaMetadato(db, 'bloqueo_declarado', `${error.motivoDeclarado}|${new Date().toISOString()}|${error.peticionId ?? ''}`);
        marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, hasta);
        console.error(`  ⛔ ${mensaje}. La web declara el bloqueo (${error.motivoDeclarado}): pausa de 30 días hasta ${hasta}. `
          + 'Se reabre a mano si hay permiso (borrar los metadatos pausa_global_hasta y bloqueo_declarado).');
        break;
      }
      if (bloqueo) {
        /*
         * ── UNA NEGATIVA DE LA WEB SE RESPETA DONDE SE DA (16/10/2026) ──────────────────────────────────────
         *
         * Valencia lleva desde el 06/10 parada: la web contesta 403 a `clasificaciones_ajax.php`, la pausa de 24 h
         * vence, el primer trabajo que se coge es otra clasificación, otro 403 y otras 24 h. Nunca se llegaba a
         * saber si el resto (jornadas, actas) seguía abierto.
         *
         * Ahora la primera negativa sobre un TIPO de página se respeta dejando de pedir ESE tipo durante 7 días, y
         * se sigue con lo demás al mismo ritmo. No es esquivar el bloqueo: es no volver a pedir lo que la web ha
         * dicho que no da. Si la web niega también otro tipo distinto, entonces la negativa es contra nosotros y
         * se para TODO 24 h, como antes.
         */
        const ahoraMs = Date.now();
        const vetado = String(leeMetadato(db, 'tipo_vetado_por_bloqueo') ?? '');
        const [tipoVetado, hastaVeto] = vetado.split('|');
        const vetoVigente = tipoVetado && hastaVeto && Date.parse(hastaVeto) > ahoraMs;
        if (!vetoVigente || tipoVetado === trabajo.tipo) {
          const hastaNuevo = new Date(ahoraMs + 7 * 24 * 60 * 60_000).toISOString();
          guardaMetadato(db, 'tipo_vetado_por_bloqueo', `${trabajo.tipo}|${hastaNuevo}`);
          const aplazados = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=?,
              ultimo_error=? where tipo=? and estado in ('pendiente','bloqueado')`)
            .run(hastaNuevo, `la web niega este tipo de página (${mensaje}); no se pide hasta ${hastaNuevo.slice(0, 10)}`,
              trabajo.tipo).changes;
          console.error(`  ⛔ ${mensaje}. La web niega las páginas de tipo «${trabajo.tipo}»: no se piden en 7 días `
            + `(${aplazados} trabajos aplazados) y se sigue con lo demás.`);
          continue;
        }
        const siguienteFecha = new Date(ahoraMs + 24 * 60 * 60_000).toISOString();
        marcaTrabajo(db, trabajo.clave, 'bloqueado', mensaje, siguienteFecha);
        const hasta = establecePausaGlobal(db, 24, mensaje, trabajo);
        console.error(`  ⛔ ${mensaje}. La web niega también «${trabajo.tipo}» (ya negaba «${tipoVetado}»): `
          + `pausa global hasta ${hasta}.`);
        break;
      }

      // Sobrecarga de la fuente (un 503): se respeta la señal con una pausa corta en vez de seguir
      // insistiendo, pero sin congelar la federación 24 horas por un corte momentáneo del servidor.
      if (error?.horasPausa) {
        const horas = Number(error.horasPausa);
        anotaUltimaPeticion(db, trabajo, 'error', mensaje);
        marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje,
          new Date(Date.now() + horas * 60 * 60_000).toISOString());
        const hasta = establecePausaGlobal(db, horas, mensaje, trabajo);
        console.error(`  ⏳ ${mensaje}. Pausa de ${horas} h hasta ${hasta}.`);
        break;
      }

      // Los vacíos esperables de un grupo se gestionan individualmente. Mantenerlos fuera del
      // contador global permite que el worker continúe con los miles de grupos válidos.
      //
      // Igual que los vacíos, los fallos de RED o de CARGA van aparte: no cuentan como fallos de la
      // federación (ver `fallosDeRed` y la pausa de abajo). `fetch failed` es el error de la pila de red de
      // Node cuando no puede resolver o conectar; «aborted due to timeout» es un `AbortSignal.timeout`
      // agotado, es decir una página que no llegó a tiempo.
      const falloDeRed = /fetch failed|aborted due to timeout|timed out|timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|socket hang up|other side closed|network|net::ERR/i.test(mensaje);
      if (!error?.esperable) {
        if (falloDeRed) fallosDeRed += 1;
        else fallosSeguidos += 1;
      }

      /*
       * ── APARTAR LA COMPETICIÓN QUE NO RESPONDE, EN VEZ DE PARAR LA FEDERACIÓN ───────────────────────────
       *
       * Se cuenta por competición y, al llegar al tope, se le pone fecha a TODO lo que le queda pendiente: no se
       * borra ni se cancela nada, y vuelve solo. Así el recolector pasa a otra competición en vez de encadenar
       * fallos hasta la pausa de una hora, que es lo que medía Madrid: 30 fallos seguidos de una sola
       * competición paraban toda la federación teniendo miles de actas buenas disponibles.
       */
      if (falloDeRed) {
        const cuantos = (fallosDeRedPorCompeticion.get(trabajo.competicion) ?? 0) + 1;
        fallosDeRedPorCompeticion.set(trabajo.competicion, cuantos);
        if (cuantos >= FALLOS_RED_POR_COMPETICION) {
          const hasta = new Date(Date.now() + HORAS_APARTAR_COMPETICION * 60 * 60_000).toISOString();
          const apartados = db.prepare(`update trabajos set siguiente_intento=?, actualizado_en=?
            where temporada=? and competicion=? and estado in ('pendiente','bloqueado')
              and (siguiente_intento is null or siguiente_intento < ?)`)
            .run(hasta, ahoraIso(), trabajo.temporada, trabajo.competicion, hasta);
          fallosDeRedPorCompeticion.delete(trabajo.competicion);
          console.warn(`  ⏸ La competición ${trabajo.competicion} lleva ${cuantos} fallos de red seguidos: se aparta`
            + ` ${HORAS_APARTAR_COMPETICION} h (${Number(apartados.changes ?? 0)} trabajos) para que pasen otras.`);
        }
      } else {
        // Un fallo que NO es de red dice que la competición responde: se le borra la cuenta.
        fallosDeRedPorCompeticion.delete(trabajo.competicion);
      }
      if (intentos >= 3 && !falloDeRed) {
        marcaTrabajo(db, trabajo.clave, 'cancelado', mensaje, null);
        console.warn(`  ✗ ${mensaje}. Se descarta tras ${intentos} intentos (no es un bloqueo).`);
        // Si lo que se descarta es el índice de jornadas de un grupo, el grupo no tiene nada que
        // recolectar: se declara ausente y se cancelan sus trabajos, igual que hace el recolector
        // pnfg. Dejarlo como 'presente' con 0 jornadas bloquearía la publicación de su competición
        // para siempre, porque la web exige `jornadas > 0` para dar un grupo por procesado.
        if (trabajo.tipo === 'indice_jornadas') {
          const yaTiene = db.prepare(`select jornadas from grupos where temporada=? and competicion=?
            and codigo=?`).get(trabajo.temporada, trabajo.competicion, trabajo.grupo)?.jornadas;
          if (!yaTiene) {
            enTransaccion(db, () => {
              db.prepare(`update grupos set estado='ausente_web',comprobado_en=?
                where temporada=? and competicion=? and codigo=?`)
                .run(ahoraIso(), trabajo.temporada, trabajo.competicion, trabajo.grupo);
              db.prepare(`update trabajos set estado='cancelado',actualizado_en=?,
                ultimo_error='grupo sin jornadas tras varios intentos (ausente_web)' || coalesce(' · último error: ' || ultimo_error, '')
                where temporada=? and competicion=? and grupo=? and estado in ('pendiente','bloqueado')`)
                .run(ahoraIso(), trabajo.temporada, trabajo.competicion, trabajo.grupo);
              db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`)
                .run(ahoraIso(), 'aviso', 'grupo_ausente',
                  `${trabajo.clave}: sin jornadas tras ${intentos} intentos; grupo marcado ausente`);
            });
            console.warn('    · grupo marcado como ausente y sus trabajos cancelados.');
          }
        }
      } else {
        const horas = intentos === 1 ? 2 : 24;
        const siguienteFecha = new Date(Date.now() + horas * 60 * 60_000).toISOString();
        marcaTrabajo(db, trabajo.clave, 'pendiente', mensaje, siguienteFecha);
        /*
         * UN FALLO DE RED NO GASTA INTENTOS. Tres intentos repartidos en días significan «ahí no hay
         * contenido», y por eso el tercero cancela el trabajo. Si lo que pasó es que NUESTRA red no llegó a
         * tiempo, esa conclusión es falsa: el trabajo se queda pendiente y sigue su escalera de espera
         * (2 h, luego 24 h) sin declarar nada sobre la fuente. Es el mismo criterio con el que
         * `scripts/reparar-descartes-transitorios.mjs` tuvo que devolver a la cola, a mano, los descartes
         * cuyo último error era un tiempo de espera agotado.
         */
        if (falloDeRed) db.prepare(`update trabajos set intentos=0 where clave=?`).run(trabajo.clave);
        console.warn(`  ! ${mensaje}. Se reintentará después de ${siguienteFecha}${falloDeRed ? ' (fallo de red: no cuenta como intento)' : ''}.`);
      }
      if (!error?.esperable && (fallosSeguidos >= 5 || fallosDeRed >= 30)) {
        // UNA HORA, NO SEIS. Es la misma lección que se aplicó hoy en `recolector-local.mjs`: la pausa
        // preventiva existe para no insistirle a una web que va mal, no para castigar media jornada a una
        // federación por un fallo que muchas veces es de casa. Medido el 17/09/2026: al matar por error los
        // chromedriver del equipo, Madrid encadenó cinco `The operation was aborted due to timeout` y se
        // quedó parada SEIS horas (hasta las 02:12) teniendo 30.000 trabajos disponibles. Con una hora el
        // respiro sigue siendo el mismo y el coste de equivocarse, seis veces menor. Si el problema
        // persiste, la pausa se vuelve a poner sola.
        const motivo = fallosDeRed >= 30 ? `${fallosDeRed} fallos de red seguidos` : `${fallosSeguidos} fallos seguidos`;
        const hasta = establecePausaGlobal(db, 1, `${motivo}: ${mensaje}`, trabajo);
        console.error(`  Pausa global preventiva hasta ${hasta} por ${motivo}.`);
        break;
      }
      continue;
    }
  }
  console.log(`Sesión terminada: ${hechos}/${max} trabajos.`);
}

/* ---------- Entrada ---------- */

const db = abreBase(BASE_DATOS);
try {
  if (comando === 'preparar') {
    const r = preparaCola(db);
    const c = resumenCola(db);
    console.log(`Plan preparado: ${r.temporadas} temporadas, ${r.competiciones} competiciones, ${r.grupos} grupos.`);
    console.log(`Cola: ${c.total} trabajos (${c.pendiente} pendientes).`);
  } else if (comando === 'arrancar') {
    await ejecutar(db);
  } else if (comando === 'actas-antiguas') {
    // Una sola vez por federación, tras habilitar sus actas: pone en cola las fichas de las
    // jornadas que ya se habían descargado antes. No hace ninguna petición a la federación.
    encolaActasAntiguas(db);
    const c = resumenCola(db);
    console.log(`Cola: ${c.total} trabajos (${c.pendiente} pendientes) · actas ${c.actasHechas}/${c.actas}.`);
  } else if (comando === 'repaso-reciente') {
    console.log(JSON.stringify(preparaRepasoJornadasRecientes(db), null, 2));
  } else if (comando === 'estado') {
    const c = resumenCola(db);
    console.log(`${NOMBRE_FEDERACION} · cola ${c.total} trabajos: ${c.hecho} hechos, ${c.pendiente} pendientes, ` +
      `${c.bloqueado} bloqueados, ${c.cancelado} descartados`);
    for (const t of c.porTipo) {
      console.log(`  ${texto(t.tipo).padEnd(20)} ${String(t.hecho ?? 0).padStart(7)}/${String(t.total).padStart(7)}`);
    }
    console.log(`  grupos ${c.grupos} · jornadas ${c.jornadas} · partidos ${c.partidos} · actas ${c.actasHechas}/${c.actas}`);
    if (c.pausa) console.log(`  PAUSA hasta ${c.pausa.hasta}: ${c.pausa.motivo}`);
  } else {
    console.error('Uso: node scripts/recolector-valencia.mjs preparar|arrancar|estado|actas-antiguas|repaso-reciente [--federacion valencia|madrid]');
    process.exitCode = 2;
  }
} finally {
  db.close();
}
