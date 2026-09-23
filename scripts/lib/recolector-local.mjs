import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parse } from 'node-html-parser';
// El descifrador de los números ofuscados del portal (eval empaquetado + clase ntype). Es el mismo
// que usa el parser de actas para la cabecera de todas las fichas; se reutiliza para no tener dos
// descifradores que puedan divergir. Requiere `pnpm --filter @facylf/ingesta build`.
import { numeroOfuscadoHtml } from '../../packages/ingesta/dist/src/parsers/ofuscacion.js';
// Suelo de temporadas: sólo se trabaja de 2023-24 en adelante. Compara por ETIQUETA porque el código
// de temporada no significa lo mismo en cada federación. Ver `scripts/lib/temporada-minima.mjs`.
import {
  TEMPORADA_MINIMA, esTemporadaDeTrabajo, esTemporadaDeTrabajoDeLaCola, sqlExcluyeTemporadasViejas,
} from './temporada-minima.mjs';
// El día civil de Madrid, en un solo sitio: lo usan el recolector (cupo diario), el supervisor y la flota.
import { diaDeMadrid } from './dia-madrid.mjs';
// El cupo diario se cuenta con la misma consulta que usa el supervisor y la flota (una sola definición).
import { peticionesDelDia } from './estado-cola.mjs';

// Perfil de federación. Por defecto Castilla y León; con setPerfil() se cambia a otra federación
// que use la misma plataforma /pnfg/, sin duplicar la lógica de recolección.
const PERFIL_CYL = { nombre: 'cyl', base: 'https://www.rfcylf.es/pnfg/NPcd', codPrimaria: '1000120' };
let PERFIL = { ...PERFIL_CYL };

export function setPerfil(p) {
  PERFIL = { ...PERFIL_CYL, ...p };
  URL_BASE = PERFIL.base;
  URL_RESULTADOS = `${PERFIL.base}/NFG_CmpJornada?cod_primaria=${PERFIL.codPrimaria}`;
  return PERFIL;
}
export function perfil() { return PERFIL; }

export let URL_BASE = PERFIL_CYL.base;
export let URL_RESULTADOS = `${PERFIL_CYL.base}/NFG_CmpJornada?cod_primaria=${PERFIL_CYL.codPrimaria}`;

const TIPOS = [
  'catalogo_temporada', 'grupos', 'indice_jornadas', 'calendario',
  'clasificacion', 'jornada', 'acta', 'muestra_competicion',
  'muestra_jornadas', 'muestra_calendario',
];

const ahoraIso = () => new Date().toISOString();
const texto = (elemento) => (elemento?.textContent ?? '').replace(/\s+/g, ' ').trim();

export function anioInicioDeTemporada(codigo) {
  return 2004 + Number(codigo);
}

export function etiquetaTemporada(codigo) {
  const inicio = anioInicioDeTemporada(codigo);
  return `${inicio}-${String(inicio + 1).slice(-2)}`;
}

/** Clasificación deliberadamente conservadora: ante la duda no se descarga el acta. */
export function esCompeticionDeMenores(nombre) {
  return /juvenil|xuvenil|cadete|infantil|alev[ií]n|benjam[ií]n|benxam[ií]n|prebenjam[ií]n|prebenxam[ií]n|zagal[ií]n|debutante|iniciaci[oó]n|chupet[ií]n|biber[oó]n|sub[- ]?\d+/i.test(nombre);
}

/** Orden funcional de las competiciones. Un número menor se procesa antes. */
export function basePrioridadCompeticion(nombreCompeticion, nombreGrupo = '') {
  const competicion = String(nombreCompeticion ?? '');
  const texto = `${competicion} ${String(nombreGrupo ?? '')}`;
  if (/femenin|f[uú]tbol\s+sala|futsal|\bsala\b/i.test(texto)) return 150;

  const esSalamanca = /salamanca/i.test(texto);
  const esAscenso = /ascenso|promoci[oó]n|play[- ]?off/i.test(texto);
  const esTerceraNacional = !/provincial/i.test(competicion)
    && /^(?:campeonato\s+nacional\s+de\s+liga\s+de\s+)?(?:tercera|3[.ªº]?)\s*(?:divisi[oó]n|federaci[oó]n|rfef)\b/i.test(competicion);
  const esNacionalDestacada = esTerceraNacional
    || /divisi[oó]n\s+de\s+honor|liga\s+nacional|nacional\s+juvenil|(?:primera|segunda)\s+federaci[oó]n/i.test(texto);
  const esRegionalOImportante = /regional|preferente|copa\s+castilla|copa\s+rfef/i.test(texto);
  const esTerceraProvincial = /(?:tercera|3[.ªº]?)\s+divisi[oó]n\s+provincial/i.test(competicion);
  const esPrimeraProvincial = /(?:primera|1[.ªº]?)\s+divisi[oó]n\s+provincial/i.test(competicion);
  const esSegundaProvincial = /(?:segunda|2[.ªº]?)\s+divisi[oó]n\s+provincial/i.test(competicion);
  const esBaseSolicitada = /alev[ií]n|benjam[ií]n|prebenjam[ií]n/i.test(competicion);

  // Se completa primero todo el fútbol 11/7 de Salamanca. Como la cola desempata
  // por temporada descendente, termina la temporada salmantina más reciente antes
  // de pasar a la anterior. Femenino y sala ya quedaron apartados al principio.
  if (esSalamanca) return 5;
  // Salamanca, regionales, nacionales destacadas y ascensos forman el mismo primer nivel. La
  // antigüedad y la fase del trabajo desempatan después; ninguno de esos cuatro bloques queda
  // relegado por el nombre de la competición.
  if (esNacionalDestacada) return 5;
  if (esRegionalOImportante) return 5;
  if (esAscenso) return 5;
  if (esPrimeraProvincial) return 60;
  if (esSegundaProvincial) return 70;
  if (esBaseSolicitada) return 80;
  if (esTerceraProvincial) return 90;
  return 100;
}

export function seleccionaMuestrasCompeticion(lista, cantidad = 3) {
  const validas = (lista ?? []).filter((c) => /^\d+$/.test(String(c.codCompeticion ?? c.codigo ?? '')));
  const elegidas = [];
  const agrega = (item) => {
    if (!item) return;
    const codigo = String(item.codCompeticion ?? item.codigo);
    if (!elegidas.some((e) => String(e.codCompeticion ?? e.codigo) === codigo)) elegidas.push(item);
  };
  agrega(validas.find((c) => /divisi[oó]n (regional|provincial) de aficionados$/i.test(c.nombre) &&
    !/sala|femenin/i.test(c.nombre)));
  agrega(validas.find((c) => /femenin/i.test(c.nombre) && !esCompeticionDeMenores(c.nombre)));
  agrega(validas.find((c) => /f[uú]tbol sala/i.test(c.nombre) && !esCompeticionDeMenores(c.nombre)));
  for (const indice of [0, Math.floor(validas.length / 2), validas.length - 1]) agrega(validas[indice]);
  for (const item of validas) agrega(item);
  return elegidas.slice(0, Math.max(0, cantidad));
}

export function claveTrabajo(tipo, datos = {}) {
  if (!TIPOS.includes(tipo)) throw new Error(`tipo de trabajo desconocido: ${tipo}`);
  return [tipo, datos.temporada, datos.competicion, datos.grupo, datos.jornada, datos.acta]
    .map((v) => String(v ?? ''))
    .join('|');
}

export function urlGrupos(temporada, competicion) {
  const q = new URLSearchParams({
    cod_primaria: PERFIL.codPrimaria, CodCompeticion: competicion,
    CodTemporada: temporada, CodJornada: '1',
  });
  return `${PERFIL.base}/NFG_CmpJornada?${q}`;
}

export function urlCalendario(temporada, competicion, grupo) {
  const q = new URLSearchParams({
    cod_primaria: PERFIL.codPrimaria, codtemporada: temporada,
    codcompeticion: competicion, codgrupo: grupo,
  });
  return `${PERFIL.base}/NFG_VisCalendario_Vis?${q}`;
}

export function urlClasificacion(temporada, competicion, grupo, jornada) {
  const q = new URLSearchParams({
    cod_primaria: PERFIL.codPrimaria, codtemporada: temporada,
    codcompeticion: competicion, codgrupo: grupo,
  });
  if (jornada) q.set('codjornada', String(jornada));
  return `${PERFIL.base}/NFG_VisClasificacion?${q}`;
}

export function urlJornada(temporada, competicion, grupo, jornada) {
  const q = new URLSearchParams({
    cod_primaria: PERFIL.codPrimaria, CodCompeticion: competicion, CodGrupo: grupo,
    CodTemporada: temporada, CodJornada: String(jornada),
  });
  return `${PERFIL.base}/NFG_CmpJornada?${q}`;
}

export function urlActa(acta) {
  const q = new URLSearchParams({ cod_primaria: PERFIL.codPrimaria, CodActa: acta, cod_acta: acta });
  return `${PERFIL.base}/NFG_CmpPartido?${q}`;
}

export function abreBase(ruta) {
  mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  /*
   * ── SINCRONIZACION DEL DISCO EN CADA CONFIRMACION (medido el 23/09/2026) ──────────────────────────────
   *
   * SQLite, con `synchronous = FULL` (su valor por defecto), SINCRONIZA EL DISCO en cada confirmacion. En el
   * servidor eso cuesta, medido con `mide-commit-cola.mjs` sobre `/srv/data`, que es un disco DURO:
   *
   *     1 fila = 1 confirmacion, con FULL    -> 540 ms de mediana (hasta 1.312 ms)
   *     1 fila = 1 confirmacion, con NORMAL  ->   0,0 ms
   *     400 filas = 1 confirmacion, con FULL -> 883 ms
   *     (en el SSD del sistema, con FULL:      3,8 ms)
   *
   * Y guardar un acta hacia VARIAS confirmaciones sueltas, asi que el coste se multiplicaba: la medicion por
   * fases ponia 6,01 s de 10,0 s en las fases de escritura. No era el volumen de datos ni la CPU (sha256 1,3 ms
   * y gzip 4,8 ms): era sincronizar el disco una y otra vez en un disco duro compartido por 19 recolectores y el
   * importador.
   *
   * QUE CAMBIA EXACTAMENTE `NORMAL`. En modo WAL, `NORMAL` sigue siendo seguro frente a la CORRUPCION — la base
   * nunca queda rota—, pero si se va la luz o se cae el sistema operativo se pueden perder las ULTIMAS
   * confirmaciones (segundos). Frente a la caida del propio proceso, sigue siendo seguro.
   *
   * Para este proyecto eso significa: en el peor caso se repiten unas cuantas peticiones ya hechas, porque la
   * cola es idempotente y los trabajos vuelven a 'pendiente'. Es una decision del responsable, no un detalle
   * tecnico, asi que va por variable y por federacion:
   *
   *     FACYLF_SINCRONO=NORMAL   -> sin sincronizacion en cada confirmacion (mucho mas rapido)
   *     sin la variable           -> FULL, que es el comportamiento de siempre
   *
   * Se pone DESPUES de `journal_mode = WAL` a proposito: el valor de `synchronous` depende del modo de diario, y
   * cambiar el modo lo reinicia.
   */
  const sincrono = String(process.env.FACYLF_SINCRONO ?? '').toUpperCase() === 'NORMAL' ? 'NORMAL' : 'FULL';
  db.exec(`
    pragma journal_mode = WAL;
    pragma synchronous = ${sincrono};
    pragma foreign_keys = ON;
    -- ── ESPERAR A QUE EL OTRO TERMINE (medido el 21/09/2026) ────────────────────────────────────────────
    --
    -- Estaba en 5 s, y en el servidor no alcanzaba: el importador masivo mantiene la cola abierta mientras
    -- importa un grupo —hasta tres minutos por unidad, medido— y la preparación del esquema de un recolector
    -- que arranca en ese momento (crear tablas e índices, que necesita bloqueo exclusivo) moría con
    -- ERR_SQLITE_ERROR: database is locked. Pasó con Baleares: el contenedor arrancaba y el worker salía con
    -- código 1 cada 20 segundos.
    --
    -- Con dos minutos, el recolector aguanta a que el importador acabe su lectura y sigue. Conviven a propósito
    -- en el mismo servidor, así que la espera es parte del contrato, no un parche.
    --
    -- OJO al editar esto: va dentro de una plantilla de JavaScript. Un acento grave aquí cierra la plantilla y
    -- rompe el fichero entero con «SyntaxError: missing ) after argument list» — pasó el 21/09/2026 y se llevó
    -- por delante cuatro federaciones hasta que se vio el registro. Por eso el texto no lleva acentos graves.
    pragma busy_timeout = 120000;

    create table if not exists metadatos (
      clave text primary key,
      valor text not null
    );
    create table if not exists temporadas (
      codigo text primary key,
      etiqueta text not null,
      origen text not null default 'existente',
      comprobada_en text
    );
    create table if not exists competiciones (
      temporada text not null,
      codigo text not null,
      nombre text not null,
      origen text not null default 'existente',
      comprobada_en text,
      grupos_comprobados_en text,
      primary key (temporada, codigo),
      foreign key (temporada) references temporadas(codigo)
    );
    create table if not exists grupos (
      temporada text not null,
      competicion text not null,
      codigo text not null,
      nombre text not null,
      estado text not null default 'presente',
      jornadas integer,
      comprobado_en text,
      jornadas_comprobadas_en text,
      primary key (temporada, competicion, codigo),
      foreign key (temporada, competicion) references competiciones(temporada, codigo)
    );
    create table if not exists jornadas (
      temporada text not null,
      competicion text not null,
      grupo text not null,
      numero integer not null,
      fecha text,
      archivo text,
      hash text,
      comprobada_en text,
      primary key (temporada, competicion, grupo, numero)
    );
    create table if not exists actas (
      codigo text not null,
      temporada text not null,
      competicion text not null,
      grupo text not null,
      jornada integer not null,
      menores integer not null,
      estado text not null,
      archivo text,
      hash text,
      datos text,
      comprobada_en text,
      primary key (temporada, competicion, grupo, jornada, codigo)
    );
    create table if not exists equipos (
      temporada text not null,
      codigo text not null,
      nombre text not null,
      primera_jornada integer,
      primary key (temporada, codigo)
    );
    create table if not exists partidos (
      temporada text not null,
      competicion text not null,
      grupo text not null,
      jornada integer not null,
      orden integer not null,
      codigo_acta text,
      equipo_local_codigo text,
      equipo_visitante_codigo text,
      local text not null,
      visitante text not null,
      goles_local integer,
      goles_visitante integer,
      fecha text,
      hora text,
      campo text,
      campo_codigo text,
      arbitro text,
      actualizado_en text not null,
      primary key (temporada, competicion, grupo, jornada, orden)
    );
    create index if not exists partidos_acta on partidos(codigo_acta);
    create index if not exists partidos_equipos on partidos(temporada, equipo_local_codigo, equipo_visitante_codigo);
    create table if not exists personas (
      codigo text primary key,
      nombre text not null,
      primera_acta text,
      ultima_acta text,
      actualizado_en text not null
    );
    create table if not exists participaciones (
      temporada text not null,
      competicion text not null,
      grupo text not null,
      jornada integer not null,
      acta text not null,
      lado text not null,
      condicion text not null,
      orden integer not null,
      jugador_codigo text,
      nombre text not null,
      dorsal integer,
      portero integer not null default 0,
      menores integer not null default 0,
      primary key (temporada, competicion, grupo, jornada, acta, lado, condicion, orden)
    );
    create index if not exists participaciones_jugador on participaciones(jugador_codigo, temporada);
    create table if not exists tecnicos_acta (
      temporada text not null, competicion text not null, grupo text not null,
      jornada integer not null, acta text not null, lado text, rol text not null,
      nombre text not null, menores integer not null default 0,
      primary key (temporada, competicion, grupo, jornada, acta, lado, rol, nombre)
    );
    create index if not exists tecnicos_nombre on tecnicos_acta(nombre, temporada);
    create table if not exists eventos_acta (
      temporada text not null, competicion text not null, grupo text not null,
      jornada integer not null, acta text not null, orden integer not null,
      tipo text not null, minuto integer, lado text, jugador_codigo text, nombre text,
      menores integer not null default 0,
      primary key (temporada, competicion, grupo, jornada, acta, orden)
    );
    create index if not exists eventos_jugador on eventos_acta(jugador_codigo, tipo, temporada);
    create table if not exists trabajos (
      clave text primary key,
      tipo text not null,
      temporada text,
      competicion text,
      grupo text,
      jornada integer,
      acta text,
      url text,
      prioridad integer not null,
      estado text not null default 'pendiente',
      intentos integer not null default 0,
      siguiente_intento text,
      ultimo_error text,
      creado_en text not null,
      actualizado_en text not null
    );
    create index if not exists trabajos_pendientes
      on trabajos(estado, prioridad, siguiente_intento, creado_en);
    create index if not exists trabajos_tipo on trabajos(tipo, estado);
    -- La web comprueba la integridad de una competición por temporada/grupo. Sin este índice,
    -- cada tarjeta recorría la tabla de trabajos completa una vez por grupo y la portada podía
    -- tardar más de un minuto mientras los workers escribían.
    create index if not exists trabajos_contexto
      on trabajos(temporada, competicion, grupo, tipo, estado);
    create index if not exists jornadas_grupo on jornadas(temporada, competicion, grupo);
    create index if not exists partidos_grupo on partidos(temporada, competicion, grupo);
    create index if not exists actas_estado on actas(estado);
    -- La tabla va ANTES que su índice: crear un índice sobre una tabla que todavía no existe falla con «no such
    -- table: main.peticiones» y db.exec corta ahí la lista entera. Medido el
    -- 19/09/2026 en una cola nueva: no se creaban peticiones, ni archivos, ni eventos, ni nada de lo que
    -- venía detrás. En el PC no se notó porque las colas son de antes de que existiera el índice; en un servidor
    -- nuevo, la primera federación que arranca se queda sin tablas.
    create table if not exists peticiones (
      id integer primary key,
      trabajo text,
      url text not null,
      iniciada_en text not null,
      duracion_ms integer,
      resultado text,
      detalle text,
      -- Día civil de Madrid al que pertenece la petición. Se guarda calculado (y no se deduce al consultar)
      -- porque SQLite no sabe de husos horarios: así el cupo diario se cuenta con una igualdad y un índice, y
      -- el día cambia a medianoche de Madrid y no a medianoche UTC.
      dia_madrid text
    );
    -- El índice de esta columna NO se crea aquí: en una cola que ya existía, la tabla no tiene todavía la
    -- columna y crear el índice sobre ella cortaría la lista entera (el mismo error que dejó a las colas nuevas
    -- sin tablas). Se crea más abajo, después de asegurar la columna.
    create table if not exists archivos (
      ruta text primary key,
      tipo text not null,
      hash text not null,
      bytes integer not null,
      guardado_en text not null
    );
    create table if not exists eventos (
      id integer primary key,
      creado_en text not null,
      nivel text not null,
      tipo text not null,
      detalle text not null
    );
    create table if not exists decisiones_descanso (
      clave text primary key,
      federacion text not null,
      temporada text not null,
      competicion text not null,
      grupo text not null,
      jornada integer not null,
      orden integer not null,
      codigo_acta text,
      decision_json text not null,
      actualizado_en text not null
    );
    create index if not exists decisiones_descanso_acta
      on decisiones_descanso(temporada,competicion,grupo,jornada,codigo_acta);
  `);
  const aseguraColumna = (tabla, columna, definicion) => {
    const existe = db.prepare(`pragma table_info(${tabla})`).all().some((c) => c.name === columna);
    if (!existe) db.exec(`alter table ${tabla} add column ${columna} ${definicion}`);
    return !existe;
  };
  aseguraColumna('competiciones', 'grupos_comprobados_en', 'text');
  aseguraColumna('grupos', 'jornadas_comprobadas_en', 'text');
  aseguraColumna('actas', 'datos', 'text');
  aseguraColumna('actas', 'version_parser', 'integer not null default 0');
  aseguraColumna('actas', 'calidad', 'text');
  aseguraColumna('actas', 'incidencias', 'text');
  aseguraColumna('eventos_acta', 'subtipo', 'text');
  aseguraColumna('eventos_acta', 'minuto_base', 'integer');
  aseguraColumna('eventos_acta', 'minuto_anadido', 'integer');
  aseguraColumna('eventos_acta', 'sujeto_tipo', 'text');
  aseguraColumna('eventos_acta', 'lado_beneficiado', 'text');
  /*
   * El día de Madrid de cada petición: la columna se añade sola a las colas que ya existían y sus peticiones se
   * rellenan por lotes.
   *
   * El relleno NO es «sólo la primera vez»: se reintenta en cada arranque mientras queden filas sin día. Medido el
   * 19/09/2026, la cola de `federacion` tenía la columna puesta y **36.768 peticiones sin rellenar**: el relleno
   * se había cortado a medias (una sesión que muere, un bloqueo de otra escritura) y, como la columna ya estaba,
   * nadie volvía a mirarlo. Un relleno que no se puede reanudar deja datos incompletos para siempre.
   *
   * Y si falla, no puede impedir que el recolector arranque: se reintenta en el siguiente arranque.
   */
  aseguraColumna('peticiones', 'dia_madrid', 'text');
  try {
    const rellenadas = rellenaDiasDeMadrid(db);
    if (rellenadas > 0) {
      db.prepare('insert or replace into metadatos(clave, valor) values (?, ?)')
        .run('dia_madrid_relleno', `${rellenadas}|${new Date().toISOString()}`);
    }
  } catch {
    // Se deja constancia y se sigue: sin presupuesto diario exacto se puede vivir; sin arrancar, no.
    try {
      db.prepare('insert or replace into metadatos(clave, valor) values (?, ?)')
        .run('dia_madrid_relleno_pendiente', new Date().toISOString());
    } catch { /* si tampoco se puede escribir esto, el siguiente arranque lo intentará igual */ }
  }
  // Y el índice del cupo diario pasa a ser sobre la columna nueva: el anterior indexaba la expresión
  // `substr(iniciada_en, 1, 10)` que ya no se usa. Se borra y se vuelve a crear (mismo nombre, otra definición).
  const indice = db.prepare("select sql from sqlite_master where type='index' and name='peticiones_dia'").get()?.sql ?? '';
  if (/substr/i.test(indice)) {
    db.exec('drop index if exists peticiones_dia');
  }
  db.exec('create index if not exists peticiones_dia on peticiones(dia_madrid)');

  /*
   * ── Y EL ÍNDICE DE LA HORA DE CADA PETICIÓN (medido el 21/09/2026) ──────────────────────────────────────
   *
   * No existía, y todas las consultas «¿qué ha pasado en la última media hora?» pagaban un barrido completo de
   * `peticiones`. Medido en la cola de Murcia (379 MB, 35 749 peticiones): `select max(iniciada_en)` tardaba
   * **9,9 s**, y hacerlo sobre las 19 federaciones dejaba al monitor de la flota en más de tres minutos por
   * vuelta — con el disco apretado y sin caché, que es justo cuando más falta hace mirar.
   *
   * Con este índice las mismas consultas son de milisegundos y no cambian nada del comportamiento: es sólo una
   * forma de encontrar filas por fecha. Se crea sola al abrir la cola, como el resto del esquema.
   */
  db.exec('create index if not exists peticiones_iniciada on peticiones(iniciada_en)');
  db.prepare('insert or replace into metadatos(clave, valor) values (?, ?)')
    .run('version_esquema', '5');
  return db;
}

/**
 * Ejecuta `operacion` dentro de una transacción. **Reentrante**: si ya hay una abierta, participa en ella.
 *
 * ── POR QUÉ ES REENTRANTE (medido el 23/09/2026) ────────────────────────────────────────────────────────
 *
 * Porque cada confirmación cuesta, en el servidor, **540 ms de mediana** (hasta 1.312 ms). No es escribir: es
 * que SQLite en modo WAL con `synchronous = FULL` **sincroniza el disco en cada confirmación**, y `/srv/data` es
 * un disco DURO que comparten 19 recolectores y el importador. Medido con `mide-commit-cola.mjs`: la misma
 * confirmación en el SSD cuesta 3,8 ms, y con `synchronous = NORMAL` cuesta 0,0 ms.
 *
 * Guardar un acta hacía SIETE confirmaciones sueltas (el `upsert` de `archivos` del HTML, el del JSON, la
 * transacción del guardado estructurado, las decisiones de descanso, la reconciliación, el `update actas` y el
 * `update trabajos`): siete por 540 ms son casi cuatro segundos **por acta**, que es justo el hueco que la
 * medición por fases encontraba en `acta_estructura` (2,72 s) y en las fases de escritura (6,01 s de 10,0 s).
 *
 * Agruparlas no cambia DÓNDE viven los datos ni su durabilidad: sigue habiendo una confirmación, sólo que una
 * en vez de siete. Y para poder agrupar desde fuera hace falta esto: sin reentrancia, la transacción interna de
 * `guardaActaEstructura` abortaría con «cannot start a transaction within a transaction».
 *
 * El anidamiento mejora la atomicidad, que es lo que se quiere: si algo falla a mitad, se deshace el acta
 * entera en vez de dejarla a medias. El dueño de la transacción externa es quien la confirma.
 */
const TRANSACCIONES_ABIERTAS = new WeakMap();

export function enTransaccion(db, operacion) {
  const abiertas = TRANSACCIONES_ABIERTAS.get(db) ?? 0;
  if (abiertas > 0) {
    // Ya hay una transacción en curso en esta base: se participa en ella, no se abre otra.
    TRANSACCIONES_ABIERTAS.set(db, abiertas + 1);
    try {
      return operacion();
    } finally {
      TRANSACCIONES_ABIERTAS.set(db, abiertas);
    }
  }
  db.exec('begin immediate');
  TRANSACCIONES_ABIERTAS.set(db, 1);
  try {
    const resultado = operacion();
    db.exec('commit');
    return resultado;
  } catch (error) {
    try { db.exec('rollback'); } catch { /* la transacción ya no estaba */ }
    throw error;
  } finally {
    TRANSACCIONES_ABIERTAS.set(db, 0);
  }
}

export function encola(db, tipo, datos, prioridad, url = null) {
  const instante = ahoraIso();
  const clave = claveTrabajo(tipo, datos);
  // Suelo de temporadas: por debajo de la mínima no se crea trabajo. Las temporadas ya recogidas
  // siguen en su sitio, aplazadas, para cuando se retome el histórico.
  if (!esTemporadaDeTrabajoDeLaCola(db, datos.temporada)) return clave;
  db.prepare(`
    insert into trabajos(
      clave, tipo, temporada, competicion, grupo, jornada, acta, url,
      prioridad, creado_en, actualizado_en
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(clave) do update set
      url = coalesce(excluded.url, trabajos.url),
      prioridad = min(excluded.prioridad, trabajos.prioridad),
      actualizado_en = excluded.actualizado_en
  `).run(
    clave, tipo, datos.temporada ?? null, datos.competicion ?? null,
    datos.grupo ?? null, datos.jornada ?? null, datos.acta ?? null,
    url, prioridad, instante, instante,
  );
  return clave;
}

export function reactiva(db, clave, siguiente = null) {
  db.prepare(`update trabajos set estado='pendiente',siguiente_intento=?,ultimo_error=null,
    actualizado_en=? where clave=? and estado in ('hecho','cancelado')`)
    .run(siguiente, ahoraIso(), clave);
}

export function leeMetadato(db, clave) {
  return db.prepare('select valor from metadatos where clave=?').get(clave)?.valor ?? null;
}

export function guardaMetadato(db, clave, valor) {
  db.prepare(`insert into metadatos(clave,valor) values(?,?)
    on conflict(clave) do update set valor=excluded.valor`).run(clave, String(valor));
}

/** Pausa preventiva de toda la federación. Vive en la librería porque las dos plataformas
 *  (pnfg e iSquad) deben parar con el mismo criterio y poder leer la misma marca. */
export function pausaGlobalActiva(db) {
  const hasta = leeMetadato(db, 'pausa_global_hasta');
  if (!hasta) return null;
  if (new Date(hasta).getTime() <= Date.now()) {
    guardaMetadato(db, 'pausa_global_hasta', '');
    guardaMetadato(db, 'pausa_global_motivo', '');
    return null;
  }
  return { hasta, motivo: leeMetadato(db, 'pausa_global_motivo') ?? 'pausa preventiva' };
}

export function establecePausaGlobal(db, horas, motivo, trabajo) {
  const hasta = new Date(Date.now() + horas * 60 * 60_000).toISOString();
  guardaMetadato(db, 'pausa_global_hasta', hasta);
  guardaMetadato(db, 'pausa_global_motivo', `${trabajo.clave}: ${motivo}`);
  db.prepare(`insert into eventos(creado_en,nivel,tipo,detalle) values(?,?,?,?)`)
    .run(ahoraIso(), 'error', 'pausa_global', `${trabajo.clave} detenido hasta ${hasta}: ${motivo}`);
  return hasta;
}

/**
 * Escribe la estructura de un acta ya interpretada en las tablas normalizadas que consume la web.
 *
 * Vive aquí, y no en cada recolector, porque hay dos plataformas que producen la misma estructura
 * por caminos distintos: /pnfg/ la obtiene interpretando HTML y la API iSquad la recibe ya en JSON.
 * `referencia` sólo necesita temporada, competicion, grupo, jornada y acta; `acta` necesita
 * `menores`. `parseada` es la estructura común:
 *   { local, visitante, golesLocal, golesVisitante,
 *     lineups: { local|visitante: { titulares: [], suplentes: [], convocados?: [], portero } },
 *     tecnicos: [{ lado, rol, nombre }],
 *     goles: [{ jugador, minuto, minutoBase?, minutoAnadido?, tipo?, lado? }],
 *     tarjetas: [{ tipo, jugador, minuto, lado? }],
 *     cambios: [{ saliente, entrante, minuto, lado? }] }
 * Devuelve un resumen con lo que se ha insertado, para poder registrarlo.
 */
export function guardaActaEstructura(db, referencia, acta, parseada) {
  let resumenActa = { jugadores: 0, tecnicos: 0, eventos: 0 };
  enTransaccion(db, () => {
    const parametros = [referencia.temporada, referencia.competicion, referencia.grupo,
      referencia.jornada, referencia.acta];
    db.prepare(`delete from participaciones where temporada=? and competicion=? and grupo=?
      and jornada=? and acta=?`).run(...parametros);
    db.prepare(`delete from tecnicos_acta where temporada=? and competicion=? and grupo=?
      and jornada=? and acta=?`).run(...parametros);
    db.prepare(`delete from eventos_acta where temporada=? and competicion=? and grupo=?
      and jornada=? and acta=?`).run(...parametros);
    const jugadoresActa = [];
    for (const lado of ['local', 'visitante']) {
      for (const condicion of ['titulares', 'suplentes', 'convocados']) {
        for (const [orden, jugador] of (parseada.lineups?.[lado]?.[condicion] ?? []).entries()) {
          jugadoresActa.push({ ...jugador, lado });
          if (jugador.codigoJugador) {
            db.prepare(`insert into personas(codigo,nombre,primera_acta,ultima_acta,actualizado_en)
              values(?,?,?,?,?) on conflict(codigo) do update set nombre=excluded.nombre,
              ultima_acta=excluded.ultima_acta,actualizado_en=excluded.actualizado_en`)
              .run(jugador.codigoJugador, jugador.nombre, referencia.acta, referencia.acta, ahoraIso());
          }
          db.prepare(`insert into participaciones(temporada,competicion,grupo,jornada,acta,lado,
            condicion,orden,jugador_codigo,nombre,dorsal,portero,menores) values(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(referencia.temporada, referencia.competicion, referencia.grupo, referencia.jornada,
              referencia.acta, lado, condicion, orden, jugador.codigoJugador ?? null, jugador.nombre,
              jugador.dorsal, parseada.lineups?.[lado]?.portero === jugador.nombre ? 1 : 0,
              acta.menores ? 1 : 0);
          resumenActa.jugadores += 1;
        }
      }
    }
    for (const tecnico of parseada.tecnicos ?? []) {
      db.prepare(`insert or ignore into tecnicos_acta(temporada,competicion,grupo,jornada,acta,
        lado,rol,nombre,menores) values(?,?,?,?,?,?,?,?,?)`).run(
        referencia.temporada, referencia.competicion, referencia.grupo, referencia.jornada,
        referencia.acta, tecnico.lado ?? null, tecnico.rol, tecnico.nombre, acta.menores ? 1 : 0);
      resumenActa.tecnicos += 1;
    }
    let ordenEvento = 0;
    const clavePersona = (valor) => String(valor ?? '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const insertaEvento = (tipo, detalle, nombre, ladoSugerido = null, subtipo = null) => {
      const clave = clavePersona(nombre);
      const jugador = jugadoresActa.find((j) => clavePersona(j.nombre) === clave);
      const tecnico = (parseada.tecnicos ?? []).find((t) => clavePersona(t.nombre) === clave);
      const lado = ladoSugerido ?? jugador?.lado ?? tecnico?.lado ?? null;
      const sujetoTipo = jugador ? 'jugador' : tecnico ? 'tecnico' : 'desconocido';
      const ladoBeneficiado = tipo !== 'gol' ? null
        : detalle?.ladoBeneficiado ?? (subtipo === 'propia-puerta'
          ? lado === 'local' ? 'visitante' : lado === 'visitante' ? 'local' : null
          : lado);
      db.prepare(`insert into eventos_acta(temporada,competicion,grupo,jornada,acta,orden,tipo,
        minuto,lado,jugador_codigo,nombre,menores,subtipo,minuto_base,minuto_anadido,sujeto_tipo,
        lado_beneficiado) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        referencia.temporada, referencia.competicion, referencia.grupo, referencia.jornada,
        referencia.acta, ordenEvento++, tipo, detalle?.minuto ?? null, lado,
        jugador?.codigoJugador ?? null, nombre ?? null, acta.menores ? 1 : 0, subtipo,
        detalle?.minutoBase ?? null, detalle?.minutoAnadido ?? null, sujetoTipo, ladoBeneficiado);
      resumenActa.eventos += 1;
    };
    for (const gol of parseada.goles ?? []) {
      insertaEvento('gol', gol, gol.jugador, gol.lado ?? null, gol.tipo ?? 'normal');
    }
    for (const tarjeta of parseada.tarjetas ?? []) {
      insertaEvento(tarjeta.tipo, tarjeta, tarjeta.jugador, tarjeta.lado ?? null);
    }
    for (const cambio of parseada.cambios ?? []) {
      insertaEvento('sale', cambio, cambio.saliente, cambio.lado ?? null);
      insertaEvento('entra', cambio, cambio.entrante, cambio.lado ?? null);
    }
  });
  return resumenActa;
}

/** ¿Esta temporada entra en el plan? Dos suelos: el histórico del catálogo y el suelo de trabajo. */
function temporadaEnElPlan(temporada, desdeAnio) {
  return anioInicioDeTemporada(temporada) >= desdeAnio
    && esTemporadaDeTrabajo(etiquetaTemporada(temporada));
}

export function preparaDesdeCatalogo(db, porTemporada, desdeAnio = 2015) {
  return enTransaccion(db, () => {
    let temporadas = 0;
    let competiciones = 0;
    for (const [temporada, lista] of Object.entries(porTemporada)) {
      if (!temporadaEnElPlan(temporada, desdeAnio)) continue;
      db.prepare(`insert into temporadas(codigo, etiqueta, origen)
        values (?, ?, 'existente') on conflict(codigo) do nothing`)
        .run(temporada, etiquetaTemporada(temporada));
      temporadas++;
      encola(db, 'catalogo_temporada', { temporada }, 10, URL_RESULTADOS);
      for (const item of lista ?? []) {
        if (!/^\d+$/.test(String(item.codCompeticion ?? ''))) continue;
        db.prepare(`insert into competiciones(temporada, codigo, nombre, origen)
          values (?, ?, ?, 'existente')
          on conflict(temporada, codigo) do update set nombre=excluded.nombre`)
          .run(temporada, String(item.codCompeticion), String(item.nombre ?? '').trim());
        encola(db, 'grupos', {
          temporada, competicion: String(item.codCompeticion),
        }, 20, urlGrupos(temporada, String(item.codCompeticion)));
        competiciones++;
      }
    }
    return { temporadas, competiciones };
  });
}

export function preparaGruposDesdeCatalogo(db, porTemporada, desdeAnio = 2015) {
  return enTransaccion(db, () => {
    let grupos = 0;
    for (const [temporada, competiciones] of Object.entries(porTemporada)) {
      if (!temporadaEnElPlan(temporada, desdeAnio)) continue;
      for (const competicion of competiciones ?? []) {
        const codigoCompeticion = String(competicion.codCompeticion ?? '');
        const existe = db.prepare(`select 1 from competiciones where temporada=? and codigo=?`)
          .get(temporada, codigoCompeticion);
        if (!existe) continue;
        for (const grupo of competicion.grupos ?? []) {
          const codigo = String(grupo.codGrupo ?? '');
          if (!/^\d+$/.test(codigo)) continue;
          db.prepare(`insert into grupos(temporada,competicion,codigo,nombre,estado)
            values(?,?,?,?,'candidato') on conflict(temporada,competicion,codigo) do update set
            nombre=case when grupos.estado='candidato' then excluded.nombre else grupos.nombre end`)
            .run(temporada, codigoCompeticion, codigo, String(grupo.nombre ?? '').trim());
          grupos++;
        }
      }
    }
    return grupos;
  });
}

export function siguienteTrabajo(db) {
  return db.prepare(`
    select * from trabajos
    where estado in ('pendiente', 'bloqueado')
      and (siguiente_intento is null or siguiente_intento <= ?)
      and ${sqlExcluyeTemporadasViejas('trabajos')}
    order by prioridad, coalesce(cast(temporada as integer), -1) desc,
      case when tipo='acta' then 0 else 1 end, creado_en
    limit 1
  `).get(ahoraIso(), TEMPORADA_MINIMA);
}

export function marcaTrabajo(db, clave, estado, error = null, siguiente = null) {
  db.prepare(`update trabajos set estado=?, ultimo_error=?, siguiente_intento=?,
    actualizado_en=?, intentos=intentos+1 where clave=?`)
    .run(estado, error, siguiente, ahoraIso(), clave);
}

export function registraPeticion(db, datos) {
  const iniciadaEn = datos.iniciadaEn ?? ahoraIso();
  db.prepare(`insert into peticiones(trabajo,url,iniciada_en,duracion_ms,resultado,detalle,dia_madrid)
    values (?,?,?,?,?,?,?)`)
    .run(
      datos.trabajo ?? null, datos.url, iniciadaEn,
      datos.duracionMs ?? null, datos.resultado ?? null, datos.detalle ?? null,
      diaDeMadrid(iniciadaEn),
    );
}

/**
 * Rellena `peticiones.dia_madrid` en las filas que no lo tengan: las de una cola que existía antes de que la
 * columna existiera, y las de un relleno anterior que se quedó a medias. Se hace por lotes.
 *
 * Se calcula en JavaScript a propósito: SQLite no sabe de husos horarios y la conversión tiene que ser la misma
 * que la de las peticiones nuevas (`diaDeMadrid`), o el cupo diario contaría dos cosas distintas.
 */
export function rellenaDiasDeMadrid(db, { lote = 2000 } = {}) {
  const pendientes = db.prepare('select count(*) n from peticiones where dia_madrid is null').get()?.n ?? 0;
  if (pendientes === 0) return 0;
  const lee = db.prepare('select id, iniciada_en from peticiones where dia_madrid is null limit ?');
  const escribe = db.prepare('update peticiones set dia_madrid = ? where id = ?');
  let hechas = 0;
  for (;;) {
    const filas = lee.all(lote);
    if (filas.length === 0) break;
    enTransaccion(db, () => {
      for (const fila of filas) escribe.run(diaDeMadrid(fila.iniciada_en), fila.id);
    });
    hechas += filas.length;
  }
  return hechas;
}

/**
 * Peticiones hechas hoy, contadas por el día civil de Madrid.
 *
 * ── POR QUÉ ES UN `COUNT` DE SQL Y NO UN `SELECT` DE TODO ────────────────────────────────────────────────
 *
 * Esto se llama **antes de cada petición** (lo primero que hace el ritmo respetuoso) y antes leía la tabla
 * `peticiones` ENTERA y filtraba en JavaScript: con las 36.000 peticiones de una federación como Valencia, eso
 * es traer 36.000 filas por petición, y en las colas grandes (cientos de miles) el coste dejaba de ser una
 * anécdota. Ahora es un `count` que resuelve el índice `peticiones_dia` sobre `dia_madrid`.
 *
 * Si la cola todavía no tiene la columna (una cola que no ha pasado por `abreBase` en esta versión, o abierta en
 * sólo lectura), se cuenta como antes para no dejar sin presupuesto a nadie: peor es no poder contar.
 */
export function peticionesHoy(db, dia = diaDeMadrid()) {
  return peticionesDelDia(db, dia);
}

export function ultimaPeticion(db) {
  return db.prepare('select * from peticiones order by id desc limit 1').get() ?? null;
}

export function resumen(db) {
  const cuenta = (tabla) => Number(db.prepare(`select count(*) n from ${tabla}`).get().n);
  const trabajos = db.prepare('select estado, tipo, count(*) n from trabajos group by estado,tipo order by estado,tipo').all();
  return {
    temporadas: cuenta('temporadas'), competiciones: cuenta('competiciones'),
    grupos: cuenta('grupos'), jornadas: cuenta('jornadas'), actas: cuenta('actas'),
    equipos: cuenta('equipos'), peticiones: cuenta('peticiones'), trabajos,
  };
}

export function extraeCompeticiones(html) {
  const raiz = parse(html);
  return raiz.querySelectorAll('#competicion option')
    .map((o) => ({ codigo: (o.getAttribute('value') ?? '').trim(), nombre: texto(o) }))
    .filter((o) => /^\d{3,}$/.test(o.codigo) && o.nombre);
}

export function extraeTemporadas(html) {
  const raiz = parse(html);
  return raiz.querySelectorAll('#temporada option')
    .map((o) => ({ codigo: (o.getAttribute('value') ?? '').trim(), nombre: texto(o) }))
    .filter((o, i, a) => /^\d+$/.test(o.codigo) && /^20\d{2}[-/]20\d{2}$/.test(o.nombre) &&
      a.findIndex((x) => x.codigo === o.codigo) === i);
}

export function extraeGrupos(html) {
  const raiz = parse(html);
  return raiz.querySelectorAll('#grupo option, select[name="grupo"] option')
    .map((o) => ({ codigo: (o.getAttribute('value') ?? '').trim(), nombre: texto(o) }))
    .filter((o, i, a) => /^\d+$/.test(o.codigo) && o.codigo !== '0' && o.nombre &&
      a.findIndex((x) => x.codigo === o.codigo) === i);
}

export function extraeJornadas(html) {
  const raiz = parse(html);
  return raiz.querySelectorAll('#jornada option, select[name="jornada"] option')
    .map((o) => {
      const codigo = (o.getAttribute('value') ?? '').trim();
      const contenido = texto(o);
      const fecha = /(\d{2})-(\d{2})-(\d{4})/.exec(contenido);
      // Hay portales que rellenan con una fecha centinela las jornadas que todavía no tienen fecha:
      // La Rioja publica 01-01-9999 en media docena de jornadas de cada grupo. Guardarla tal cual
      // hacía que la web y los informes hablaran de «última jornada prevista 9999-01-01». Si la fecha
      // no es creíble, se guarda sin fecha, que es la verdad: aún no se sabe cuándo se juega.
      const anio = fecha ? Number(fecha[3]) : null;
      const creible = anio !== null && anio >= 2000 && anio <= new Date().getFullYear() + 3;
      return {
        numero: Number(codigo),
        fecha: creible ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null,
      };
    })
    .filter((j, i, a) => Number.isInteger(j.numero) && j.numero > 0 &&
      a.findIndex((x) => x.numero === j.numero) === i);
}

function parametro(href, nombre) {
  const u = new URL(href, 'https://www.rfcylf.es/pnfg/NPcd/');
  for (const [k, v] of u.searchParams) if (k.toLowerCase() === nombre.toLowerCase()) return v;
  return null;
}

/**
 * Extrae los partidos de la maqueta "widget" que usa la plataforma pnfg cuando el portal sirve la
 * versión nova (o en otro idioma, como el euskera de Euskadi).
 *
 * Por qué hace falta una segunda vía: la extracción clásica busca dos enlaces
 * `NFG_VisEquipos?Codigo_Equipo=`, y esta maqueta NO enlaza los equipos. Los pone como texto en
 * `<div class="font_widgetL"><h4>…</h4></div>` (local) y `<div class="font_widgetV">` (visitante), y
 * los códigos de equipo sólo aparecen en el enlace de comparativa (`equipo1=`/`equipo2=`).
 *
 * El marcador va ofuscado. Para leerlo se usa `numeroOfuscadoHtml`, el MISMO descifrador que ya usa
 * el parser de actas para la cabecera de todas las fichas: reconoce el `eval()` empaquetado, saca la
 * tabla de sustitución y resuelve la clase `fa-N` que calcula `ntype()`. En su propio orden de
 * prioridad esa clase es «la fuente definitiva» y los `<span style="display:none">` quedan como
 * último recurso porque «suelen ser señuelos».
 *
 * Aun así, aquí se es más estricto que allí a propósito: SÓLO se acepta el marcador cuando las dos
 * celdas traen una señal de las fiables (una llamada `ntype(...)` o una clase `fa-N`). Se midió que
 * un 21 % de las celdas no traen ninguna, y esas son justo las que producían un 22,7 % de partidos
 * 0-0, imposible en fútbol real. En ese caso se deja el marcador como desconocido en AMBOS lados, en
 * vez de rellenarlo con el señuelo: un marcador inventado se propaga a la clasificación y a las
 * estadísticas sin que se note, y lo rellena después la propia acta, que es la fuente autoritativa.
 */
/* ------------------------------------------------------------------ */
/* Filas INFORMATIVAS de la jornada: el bloque de descanso             */
/* ------------------------------------------------------------------ */

/**
 * ADAPTADORES DE EXTRACCIÓN de jornada, declarados UNO A UNO.
 *
 * En una liga de número impar de equipos cada jornada deja a uno descansando y el portal publica ese
 * bloque con la MISMA forma que un partido. Medido sobre las dieciocho colas el 15/09/2026, con
 * `scripts/inventario-descansos.mjs`: 5.683 filas afectadas en once federaciones. **No es el mismo
 * defecto en todas**, y por eso el reconocimiento se declara por maqueta y no en una función global.
 *
 * | maqueta | cómo delimita una fila de partido | por qué el descanso entra |
 * |---|---|---|
 * | `pnfg-clasica` | tabla con exactamente dos enlaces `NFG_VisEquipos` | la federación publica el bloque como una tabla más, y **da de alta un pseudo-equipo** para el descanso, con `Codigo_Equipo` propio: `<a href="NFG_VisEquipos?…&Codigo_Equipo=4807245"> DESCANSA </a>` |
 * | `nova-widget` | `tr` más interna con `font_widgetL` y `font_widgetV` | el bloque tiene las dos celdas: el equipo que descansa y la palabra `Atsedena`, con un **escudo de plantilla** (`escudo_sm_resultados_.jpg`) en lugar de un escudo de club |
 *
 * Los adaptadores `fcf` (Cataluña) e `isquad` (Madrid, Valencia) tienen su propio registrador y **están
 * declarados como pendientes**: en ellos el descanso se publica con **código negativo** (`-1`), y en
 * Madrid y Valencia un código negativo es EXACTAMENTE el lado del descanso (3.386 y 686 filas, ninguna
 * sin la palabra). Esa regla es suya y no se aplica aquí: no se presume que compartan el defecto.
 *
 * ## Qué evidencia se exige para NO emitir la fila como partido
 *
 * 1. el texto de un lado es **EXACTAMENTE** una palabra del vocabulario declarado por su maqueta, nunca
 *    «contiene»: un club llamado `C.D. DESCANSO` no es un descanso, y hay que poder demostrarlo
 *    (`scripts/_diag-equipos-palabra-descanso.mjs` comprueba que ningún equipo del catálogo con código
 *    positivo se llama así);
 * 2. la fila **no tiene enlace de acta**. Si lo tiene, la fila NO se descarta: se emite como partido y se
 *    declara sospechosa, porque el extractor no puede saber si esa acta describe un partido real —haría
 *    falta abrirla— y descartarla destruiría evidencia.
 *
 * Se quitan antes los marcadores de estado, porque la fuente también los pega al descanso: medido,
 * `Descansa (Ganador)` aparece así en La Rioja (83 casos en el inventario).
 */
export const ADAPTADORES_EXTRACCION = {
  'pnfg-clasica': {
    maqueta: 'pnfg-clasica',
    vocabularioDescanso: ['descansa', 'descans'],
    delimitaFilaDePartido: 'tabla con exactamente dos enlaces `NFG_VisEquipos`; los nombres son los textos de esos dos enlaces',
    extraeCeldasDirectas: 'los dos enlaces de equipo de la propia tabla, y el enlace `NFG_CmpPartido` como acta',
    ignoraSubtablas: 'no baja a tablas anidadas: la tabla que se acepta es la que tiene los dos enlaces, y las de dentro se recorren por separado',
    marcadoresDeEstado: 'se separan del nombre antes de comparar; no cambian el número de lados ni el código',
    evidenciaParaCorregir: 'palabra de descanso exacta en un lado y SIN enlace de acta en la fila',
    cuandoDevuelveIncidencia: 'cuando la palabra aparece y la fila SÍ trae acta: no se descarta, se declara sospechosa',
  },
  'nova-widget': {
    maqueta: 'nova-widget',
    vocabularioDescanso: ['descansa', 'atsedena'],
    delimitaFilaDePartido: 'la `tr` más interna que tiene a la vez `.font_widgetL` y `.font_widgetV`',
    extraeCeldasDirectas: 'el `<h4>` de cada una de las dos celdas, en el orden del documento',
    ignoraSubtablas: 'sólo se aceptan las `tr` que no están dentro de otra `tr` candidata, para no contar dos veces el mismo partido',
    marcadoresDeEstado: 'se separan del nombre antes de comparar',
    evidenciaParaCorregir: 'palabra de descanso exacta en un lado y SIN enlace de acta en la fila',
    cuandoDevuelveIncidencia: 'cuando la palabra aparece y la fila SÍ trae acta: no se descarta, se declara sospechosa',
  },
};

/** Marcadores de estado, en minúsculas: la misma lista cerrada que `nova-equipos.ts`. */
const MARCADORES_ESTADO_EN_FILA = ['(sailkatua)', '(irabazlea)', '(ganador)', '(clasificado)', '(p)'];

/**
 * El nombre de un lado, sin marcadores de estado y normalizado, para compararlo con el vocabulario.
 *
 * Se implementa aquí en vez de importarlo de `@facylf/ingesta` porque este fichero lo ejecutan los
 * recolectores y el `dist` del paquete no está construido para esos módulos; una prueba comprueba que las
 * dos listas y las dos normalizaciones coinciden, para que no puedan separarse en silencio.
 */
export function normalizaNombreDeFila(literal) {
  let trabajo = String(literal ?? '').trim();
  const quitados = new Set();
  let cambiado = true;
  while (cambiado) {
    cambiado = false;
    for (const token of MARCADORES_ESTADO_EN_FILA) {
      if (quitados.has(token)) continue;
      const escapado = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const alPrincipio = new RegExp(`^\\s*${escapado}\\s*`, 'i');
      const alFinal = new RegExp(`\\s*${escapado}\\s*$`, 'i');
      if (alPrincipio.test(trabajo)) { trabajo = trabajo.replace(alPrincipio, ' '); quitados.add(token); cambiado = true; } else if (alFinal.test(trabajo)) { trabajo = trabajo.replace(alFinal, ' '); quitados.add(token); cambiado = true; }
    }
  }
  return trabajo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** ¿El literal es EXACTAMENTE una palabra de descanso de esa maqueta? */
export function esPalabraDeDescansoDeMaqueta(literal, maqueta) {
  const vocabulario = ADAPTADORES_EXTRACCION[maqueta]?.vocabularioDescanso ?? [];
  const normalizado = normalizaNombreDeFila(literal);
  return normalizado !== '' && vocabulario.includes(normalizado);
}

/**
 * ¿Esta fila es el bloque de descanso y NO un partido? Devuelve el motivo, o `null`.
 *
 * `informativa` sólo es `true` cuando se cumplen las dos condiciones declaradas por el adaptador: palabra
 * exacta y ausencia de acta. Si hay acta, la fila se conserva y se devuelve `sospechosa` para que quien
 * llame lo registre: descartarla podría borrar un partido real.
 */
export function reconoceFilaInformativa({ maqueta, local, visitante, tieneActa }) {
  const adaptador = ADAPTADORES_EXTRACCION[maqueta];
  if (!adaptador) return null;
  const ladoLocal = esPalabraDeDescansoDeMaqueta(local, maqueta);
  const ladoVisitante = esPalabraDeDescansoDeMaqueta(visitante, maqueta);
  if (!ladoLocal && !ladoVisitante) return null;
  const lados = ladoLocal && ladoVisitante ? 'los dos lados' : (ladoLocal ? 'el local' : 'el visitante');
  // Qué equipo descansa es información de la fuente, no basura: el bloque lo dice. Cuando los DOS lados son
  // la palabra de descanso no hay equipo que anotar.
  //
  // OJO: `texto()` espera un NODO del DOM, no una cadena —devuelve `''` con una cadena—, así que aquí se
  // normaliza a mano. Es exactamente el fallo que dejaba este campo vacío.
  const limpia = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim();
  const equipoQueDescansa = ladoLocal && ladoVisitante ? null : (ladoLocal ? limpia(visitante) : limpia(local));
  if (tieneActa) {
    return {
      informativa: false, sospechosa: true, maqueta, local, visitante, equipoQueDescansa: null,
      motivo: `${lados} es exactamente una palabra de descanso, pero la fila trae acta: no se descarta, se declara`,
    };
  }
  return {
    informativa: true, sospechosa: false, maqueta, local, visitante, equipoQueDescansa,
    motivo: `${lados} es exactamente una palabra de descanso de la maqueta ${maqueta} y la fila no trae acta`,
  };
}

/**
 * Las filas informativas de una jornada, sin emitir ningún partido.
 *
 * Es la vía para REGISTRAR el descanso en vez de perderlo: el bloque dice qué equipo descansa en esa
 * jornada, y eso es información de la fuente aunque no sea un partido.
 */
export function extraeFilasInformativas(html) {
  const raiz = parse(html);
  const clasicas = [];
  const tablasDePartido = raiz.querySelectorAll('table').filter((t) => t.querySelectorAll('a[href*="NFG_VisEquipos"]').length === 2);
  // Maqueta clásica: tablas con dos enlaces de equipo.
  for (const tabla of tablasDePartido) {
    const enlaces = tabla.querySelectorAll('a[href*="NFG_VisEquipos"]');
    const reconocida = reconoceFilaInformativa({
      maqueta: 'pnfg-clasica', local: texto(enlaces[0]), visitante: texto(enlaces[1]),
      tieneActa: Boolean(tabla.querySelector('a[href*="NFG_CmpPartido"]')),
    });
    if (reconocida) clasicas.push(reconocida);
  }
  // La maqueta se elige como la elige el worker: la clásica si ve tablas de partido, y si no la del
  // widget. Sin esto, una página de la maqueta clásica —que también usa `font_widgetL`/`font_widgetV`—
  // contaría dos veces sus mismas filas, una por cada pasada.
  if (tablasDePartido.length > 0) return clasicas;

  const filas = [];
  const candidatas = raiz.querySelectorAll('tr').filter((tr) =>
    tr.querySelector('.font_widgetL') && tr.querySelector('.font_widgetV'));
  const soloInternas = candidatas.filter((tr) =>
    !candidatas.some((otra) => otra !== tr && tr.querySelectorAll('tr').includes(otra)));
  for (const tr of soloInternas) {
    const nombreDe = (selector) => texto(tr.querySelector(selector)?.querySelector('h4') ?? tr.querySelector(selector));
    const reconocida = reconoceFilaInformativa({
      maqueta: 'nova-widget', local: nombreDe('.font_widgetL'), visitante: nombreDe('.font_widgetV'),
      tieneActa: Boolean(tr.querySelector('a[href*="CodActa"], a[href*="cod_acta"]')),
    });
    if (reconocida) filas.push(reconocida);
  }
  return filas;
}

export function extraePartidosWidget(html) {
  const raiz = parse(html);
  const salida = [];
  const vistos = new Set();
  // La tabla de sustitución se declara una sola vez por página, así que se saca del HTML completo y
  // se pasa como contexto a cada celda (igual que hace `marcadorDe` en el parser de actas).
  const tabla = /\[((?:\d+\s*,\s*){9,}\d+)\]/.exec(html)?.[0] ?? '';
  const contexto = tabla ? `<script>${tabla}</script>` : '';

  // Cada partido vive en la fila MÁS INTERNA que contiene los dos nombres: la fila exterior las
  // contiene también y sin este filtro cada partido se contaría dos veces.
  const candidatas = raiz.querySelectorAll('tr').filter((tr) =>
    tr.querySelector('.font_widgetL') && tr.querySelector('.font_widgetV'));
  const filas = candidatas.filter((tr) =>
    !candidatas.some((otra) => otra !== tr && tr.querySelectorAll('tr').includes(otra)));

  const nombreDe = (fila, selector) =>
    texto(fila.querySelector(selector)?.querySelector('h4') ?? fila.querySelector(selector));

  const digitoDe = (span) => {
    if (!span) return null;
    const bruto = span.innerHTML;
    // Sólo las dos señales fiables: la llamada ntype(...) o la clase fa-N que deja en el DOM.
    const tieneSenalFiable = /ntype\s*\(/i.test(bruto) || /(?:^|\s)fa-\d(?:\s|"|')/i.test(bruto);
    if (!tieneSenalFiable) return null;
    const valor = numeroOfuscadoHtml(`${contexto}${bruto}`);
    return Number.isInteger(valor) ? valor : null;
  };

  for (const fila of filas) {
    const local = nombreDe(fila, '.font_widgetL');
    const visitante = nombreDe(fila, '.font_widgetV');
    if (!local || !visitante) continue;

    const htmlFila = fila.innerHTML;
    const actaA = fila.querySelector('a[href*="CodActa"], a[href*="cod_acta"]');
    const codActa = actaA ? (parametro(actaA.getAttribute('href') ?? '', 'CodActa') ??
      parametro(actaA.getAttribute('href') ?? '', 'cod_acta')) : null;
    // El bloque de descanso NO es un partido. Ver `ADAPTADORES_EXTRACCION`: aquí el bloque tiene las dos
    // celdas de nombre que busca este selector y su «visitante» es la palabra `Atsedena` con un escudo de
    // plantilla. Si la fila trae acta no se descarta: se emite y se declara sospechosa.
    const informativa = reconoceFilaInformativa({ maqueta: 'nova-widget', local, visitante, tieneActa: Boolean(actaA) });
    if (informativa?.informativa) continue;
    const comparativa = /equipo1=(\d+)[^"]*?equipo2=(\d+)/.exec(htmlFila);
    const codLocal = comparativa?.[1] ?? null;
    const codVisitante = comparativa?.[2] ?? null;

    // Marcador: los dos spans de resultado, en orden.
    const marcador = [...fila.querySelectorAll('td')]
      .find((td) => td.querySelector('[class*="wid2_resultado"]'));
    const spans = marcador ? marcador.querySelectorAll('[class*="wid2_resultado"]') : [];
    // El marcador sólo se da por bueno si se resuelven los DOS lados. Con uno solo, la clasificación
    // y los goles a favor/contra quedarían descuadrados, así que se deja entero como desconocido.
    const golesLocalBruto = spans.length >= 1 ? digitoDe(spans[0]) : null;
    const golesVisitanteBruto = spans.length >= 2 ? digitoDe(spans[1]) : null;
    const marcadorCompleto = golesLocalBruto !== null && golesVisitanteBruto !== null;
    const golesLocal = marcadorCompleto ? golesLocalBruto : null;
    const golesVisitante = marcadorCompleto ? golesVisitanteBruto : null;

    // Fecha, hora, campo y árbitro: el partido y, si no están ahí, su fila hermana de detalle.
    const leerDetalles = (nodo) => {
      const horarios = nodo.querySelectorAll('.horario').map((s) => texto(s));
      const campoA = nodo.querySelector('a[href*="VisCampos"]');
      const arbitroM = /(?:Epailea|Árbitro|Arbitro)\s*:?\s*([^<]+)/i.exec(nodo.innerHTML.replace(/<[^>]*>/g, ' '));
      // La maqueta publica la fecha como DD-MM-YYYY; en la base se guarda siempre YYYY-MM-DD.
      const fechaBruta = horarios.find((h) => /^\d{2}-\d{2}-\d{4}$/.test(h)) ?? null;
      const f = fechaBruta ? /^(\d{2})-(\d{2})-(\d{4})$/.exec(fechaBruta) : null;
      return {
        fecha: f ? `${f[3]}-${f[2]}-${f[1]}` : null,
        hora: horarios.find((h) => /^\d{1,2}:\d{2}$/.test(h)) ?? null,
        campo: campoA ? texto(campoA) : null,
        campoCodigo: campoA ? parametro(campoA.getAttribute('href') ?? '', 'Codigo_Campo') : null,
        arbitro: arbitroM ? arbitroM[1].replace(/\s+/g, ' ').trim() : null,
      };
    };
    let detalles = leerDetalles(fila);
    if (!detalles.fecha || !detalles.campo) {
      const hermanas = fila.parentNode?.querySelectorAll?.('tr') ?? [];
      for (const h of hermanas) {
        if (h === fila || candidatas.includes(h)) continue;
        const d = leerDetalles(h);
        detalles = {
          fecha: detalles.fecha ?? d.fecha, hora: detalles.hora ?? d.hora,
          campo: detalles.campo ?? d.campo, campoCodigo: detalles.campoCodigo ?? d.campoCodigo,
          arbitro: detalles.arbitro ?? d.arbitro,
        };
        if (detalles.fecha && detalles.campo) break;
      }
    }

    const clave = `${codLocal ?? ''}|${codVisitante ?? ''}|${local}|${visitante}|${codActa ?? ''}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({
      local, visitante, codLocal, codVisitante, codActa,
      golesLocal, golesVisitante,
      fecha: detalles.fecha, hora: detalles.hora, campo: detalles.campo,
      campoCodigo: detalles.campoCodigo, arbitro: detalles.arbitro,
    });
  }
  return salida;
}

export function extraePartidos(html) {
  const raiz = parse(html);
  const salida = [];
  const vistos = new Set();
  for (const tabla of raiz.querySelectorAll('table')) {
    const enlaces = tabla.querySelectorAll('a[href*="NFG_VisEquipos"]');
    if (enlaces.length !== 2) continue;
    const local = texto(enlaces[0]);
    const visitante = texto(enlaces[1]);
    const codLocal = parametro(enlaces[0].getAttribute('href') ?? '', 'Codigo_Equipo') ??
      parametro(enlaces[0].getAttribute('href') ?? '', 'codequipo');
    const codVisitante = parametro(enlaces[1].getAttribute('href') ?? '', 'Codigo_Equipo') ??
      parametro(enlaces[1].getAttribute('href') ?? '', 'codequipo');
    const actaA = tabla.querySelector('a[href*="NFG_CmpPartido"]');
    const codActa = actaA ? parametro(actaA.getAttribute('href') ?? '', 'CodActa') : null;
    // El bloque de descanso NO es un partido. Ver `ADAPTADORES_EXTRACCION`: la federación lo publica como
    // una tabla más y da de alta un pseudo-equipo para el descanso, con `Codigo_Equipo` propio. Si la fila
    // trae acta no se descarta —podría ser un partido real desplazado—; se emite y se declara aparte.
    const informativa = reconoceFilaInformativa({ maqueta: 'pnfg-clasica', local, visitante, tieneActa: Boolean(actaA) });
    if (informativa?.informativa) continue;
    // Una federación puede publicar por error el mismo CodActa en dos partidos. Se
    // deduplica la tabla anidada por encuentro, no sólo por acta, para no perder uno.
    const clave = `${codLocal ?? ''}|${codVisitante ?? ''}|${local}|${visitante}|${codActa ?? ''}`;
    if (!local || !visitante || vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ local, visitante, codLocal, codVisitante, codActa });
  }
  // Si la maqueta clásica no ve nada, se prueba la maqueta "widget" (Euskadi y otros portales con
  // el tema nova). Sin esta segunda vía, esas federaciones descargaban jornadas y no guardaban
  // ningún partido: 3.482 páginas de Euskadi se quedaron sin usar.
  if (!salida.length) return extraePartidosWidget(html);
  return salida;
}

export function inspeccionaActa(html) {
  const raiz = parse(html);
  const jugadores = [];
  for (const fila of raiz.querySelectorAll('tr[onclick*="jugador="]')) {
    const onclick = fila.getAttribute('onclick') ?? '';
    const codigo = /[?&]jugador=(\d+)/i.exec(onclick)?.[1] ?? null;
    const celdas = fila.querySelectorAll('td').map((c) => texto(c)).filter(Boolean);
    const dorsal = celdas.map((c) => /^\d{1,2}$/.test(c) ? Number(c) : null).find((x) => x !== null) ?? null;
    const conNombre = celdas.some((c) => !/^\d{1,2}$/.test(c) && /\p{L}/u.test(c));
    if (codigo) jugadores.push({ codigo, dorsal, conNombre });
  }
  const hermanosHastaH4 = (cabecera) => {
    const hermanos = cabecera.parentNode?.childNodes ?? [];
    const salida = [];
    for (let i = hermanos.indexOf(cabecera) + 1; i < hermanos.length; i++) {
      const nodo = hermanos[i];
      if (!nodo?.tagName) continue;
      if (nodo.tagName.toLowerCase() === 'h4') break;
      salida.push(nodo);
    }
    return salida;
  };
  const nombreEvento = (valor) => String(valor ?? '')
    .replace(/^.*?\(\s*\d+\s*['’′]?\s*(?:\+\s*\d+\s*)?['’′]?\s*\)\s*/, '')
    .replace(/\s+/g, ' ').trim();
  const goles = raiz.querySelectorAll('.number').filter((n) => /^(?:Goles|Golak)$/i.test(texto(n)))
    .reduce((n, titulo) => n + titulo.parentNode.querySelectorAll('tr')
      .filter((fila) => /\p{L}/u.test(nombreEvento(texto(fila.querySelectorAll('td').at(-1))))).length, 0);
  const cambios = raiz.querySelectorAll('h4').filter((h) => /^(?:Sustituciones|Ordezkapenak)$/i.test(texto(h)))
    .reduce((n, h) => n + hermanosHastaH4(h)
      .filter((x) => {
        if (x.tagName.toLowerCase() !== 'table') return false;
        const filas = x.querySelectorAll('tr');
        return filas.length >= 2 && filas.slice(0, 2).every((fila) =>
          /\p{L}/u.test(nombreEvento(texto(fila.querySelectorAll('td')[1]))));
      }).length, 0);
  const tarjetas = raiz.querySelectorAll('h4').filter((h) => /^(?:Tarjetas|Txartelak)$/i.test(texto(h)))
    .reduce((n, h) => n + hermanosHastaH4(h)
      .filter((x) => x.tagName.toLowerCase() === 'table')
      .reduce((m, tabla) => m + tabla.querySelectorAll('tr').filter((fila) => {
        const detalle = texto(fila.querySelectorAll('td')[1]);
        return /\(\s*\d+/.test(detalle) && /\p{L}/u.test(nombreEvento(detalle));
      }).length, 0), 0);
  return {
    jugadores: jugadores.length,
    conIdentificador: jugadores.filter((j) => j.codigo).length,
    conNombre: jugadores.filter((j) => j.conNombre).length,
    goles,
    cambios,
    tarjetas,
  };
}

export function validaPagina(tipo, html) {
  // Una página corta o vacía NO es una barrera: significa que esa dirección no tiene contenido
  // (un grupo sin índice, un código retirado, una respuesta a medias). Confundirlo con un bloqueo
  // hacía que una sola página vacía parase una federación entera 24 horas. Las barreras de verdad
  // son las de más abajo: texto de reto, captcha o límite explícito.
  if (!html || html.length < 1_000) {
    // Antes de darla por vacía: algunos portales pnfg contestan a las actas con un aviso de cookie
    // de 117 bytes, y el aviso va DENTRO DE UN COMENTARIO HTML. Como el texto visible de un
    // comentario no existe, el detector de barreras no lo veía, y el trabajó se quedaba sin explicar.
    // Se busca sobre el HTML en bruto, no sobre el texto.
    if (/no se ha aceptado el cookie/i.test(html)) {
      return { ok: false, bloqueo: false, requiereCookie: true,
        motivo: 'el portal pide aceptar su cookie antes de servir esta página' };
    }
    // Y hay una página corta que NO es «sin contenido»: el servidor del portal diciendo que no puede
    // atender ahora mismo. Andalucía acumulaba 191 rechazos con esta pinta (310 bytes, Apache,
    // «503 Service Unavailable») que se estaban tratando como página vacía: se reintentaba sin bajar
    // el ritmo, insistiendo a un servidor que acababa de pedir que se le dejara en paz.
    if (/503\s+service\s+unavailable|service\s+unavailable|maintenance\s+downtime|capacity\s+problems/i.test(html)) {
      return { ok: false, bloqueo: false, sobrecarga: true,
        motivo: 'la fuente responde 503 (servicio no disponible)' };
    }
    return { ok: false, bloqueo: false, motivo: 'página vacía o sin contenido' };
  }
  const plano = texto(parse(html));
  if (/no se ha aceptado el cookie/i.test(plano)) {
    return { ok: false, bloqueo: false, requiereCookie: true,
      motivo: 'el portal pide aceptar su cookie antes de servir esta página' };
  }
  if (/no se ha aceptado el cookie|access denied|acceso denegado|sonicwall|captcha|too many requests/i.test(plano)) {
    return { ok: false, bloqueo: true, motivo: 'barrera o límite detectado' };
  }
  if (tipo === 'catalogo_temporada' && extraeCompeticiones(html).length === 0)
    return { ok: false, bloqueo: false, motivo: 'catálogo sin competiciones' };
  if ((tipo === 'grupos' || tipo === 'muestra_competicion') && extraeGrupos(html).length === 0)
    return { ok: false, bloqueo: false, motivo: 'competición sin grupos verificables' };
  // Los marcadores de "esto es una página del tipo X" estaban escritos sólo en castellano, y hay
  // territoriales que publican en su idioma cooficial: Euskadi sirve todo en euskera (Jardunaldia,
  // Emaitzak, Sailkapena, Egutegia, Titularrak) y por eso sus actas se descargaban correctamente y
  // se rechazaban igualmente, con el motivo engañoso «no parece un acta». Se aceptan las variantes
  // y, cuando existe una señal ESTRUCTURAL, se prefiere ésa porque no depende del idioma.
  if ((tipo === 'indice_jornadas' || tipo === 'jornada' || tipo === 'muestra_jornadas') &&
      !/Visualizaci[oó]n de Partidos|Resultados|Emaitzak|Jardunaldia/i.test(plano) &&
      extraePartidos(html).length === 0)
    return { ok: false, bloqueo: false, motivo: 'no parece una página de jornada' };
  if ((tipo === 'indice_jornadas' || tipo === 'muestra_jornadas') && extraeJornadas(html).length === 0)
    return { ok: false, bloqueo: false, motivo: 'no se pudo descubrir el índice de jornadas' };
  if ((tipo === 'calendario' || tipo === 'muestra_calendario') &&
      !/Visualizaci[oó]n del Calendario|Calendario|Egutegia|Calendari/i.test(plano))
    return { ok: false, bloqueo: false, motivo: 'no parece una página de calendario' };
  if (tipo === 'clasificacion' && !/Clasificaci[oó]n|Clasificacio|Sailkapena/i.test(plano))
    return { ok: false, bloqueo: false, motivo: 'no parece una página de clasificación' };
  if (tipo === 'acta' && !/Ficha Partido|Titulares|Suplentes|Fitxa|Titularrak|Suplenteak|Ordezkoak/i.test(plano)) {
    // Señal estructural: un acta de pnfg lleva filas de jugador con `onclick="...jugador=CODIGO"`.
    // Es lo que ya usa `inspeccionaActa`, así que si hay filas, hay acta, en cualquier idioma.
    // OJO: `inspeccionaActa` devuelve el NÚMERO de jugadores, no la lista.
    const inspeccion = inspeccionaActa(html);
    if (Number(inspeccion?.jugadores ?? 0) === 0) {
      return { ok: false, bloqueo: false, motivo: 'no parece un acta' };
    }
  }
  return { ok: true, bloqueo: false, motivo: null };
}

/**
 * Guarda un fichero de forma atómica, comprimido si merece la pena.
 *
 *  Por qué se comprime: el HTML de las federaciones pnfg pesa 24-202 KB por acta y 51-227 KB por
 *  jornada (medido el 12/09/2026 con los tamaños reales), y el trabajo que queda son millones de
 *  ficheros: sin comprimir son cientos de GB y el disco se llena en semanas. Comprimiendo se queda
 *  en una décima parte y **no se pierde nada**: el HTML sigue archivado y se puede reinterpretar sin
 *  volver a pedirlo, que es la razón de guardarlo.
 *
 *  Los ficheros pequeños se dejan tal cual (no compensa) y los ya guardados sin comprimir siguen
 *  leyéndose: `leeArchivo` busca el fichero normal y, si no está, su versión `.gz`.
 */
export function guardaAtomico(ruta, contenido, db, tipo, umbral = 8192) {
  mkdirSync(dirname(ruta), { recursive: true });
  const bytes = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
  const hash = createHash('sha256').update(bytes).digest('hex');
  // Si la ruta ya termina en `.gz`, el contenido se comprime aunque sea pequeño y se escribe en ESA
  // ruta (nunca en `.gz.gz`): así `.gz` significa siempre gzip y `leeArchivo` nunca se encuentra un
  // fichero plano disfrazado. Ocurrió el 13/09/2026: se escribió el JSON del análisis (426 B) sobre
  // `acta-X.html.gz`, esa ruta dejó de poder leerse y se perdió el HTML archivado de 1.521 actas.
  const yaComprimido = /\.gz$/i.test(ruta);
  const comprimir = bytes.length >= umbral || yaComprimido;
  const destino = yaComprimido ? ruta : comprimir ? `${ruta}.gz` : ruta;
  const salida = comprimir ? gzipSync(bytes) : bytes;
  const temporal = `${destino}.tmp`;
  writeFileSync(temporal, salida);
  renameSync(temporal, destino);
  db.prepare(`insert into archivos(ruta,tipo,hash,bytes,guardado_en) values(?,?,?,?,?)
    on conflict(ruta) do update set tipo=excluded.tipo,hash=excluded.hash,
    bytes=excluded.bytes,guardado_en=excluded.guardado_en`)
    .run(destino, tipo, hash, salida.length, ahoraIso());
  return { hash, bytes: salida.length, ruta: destino, comprimido: comprimir };
}

/**
 * Ruta del JSON de análisis que acompaña a una página archivada.
 *
 *  El archivo archivado puede estar comprimido (`acta-1.html.gz`) porque `guardaAtomico` añade `.gz`
 *  cuando pasa de 8 KB. Por eso hay que quitar el `.gz` ANTES de cambiar la extensión: si no, la
 *  ruta no cambia y el JSON del análisis se escribe ENCIMA del HTML comprimido. Pasó el 13/09/2026
 *  con 1.521 actas (Asturias 1.475, Aragón 39, Ceuta 5, Canarias 2): el HTML archivado se perdió y,
 *  al reprocesar otra vez, el análisis se leyó a sí mismo y quedó vacío.
 */
export function rutaJsonDeArchivo(ruta) {
  const sinComprimir = /\.gz$/i.test(ruta) ? ruta.slice(0, -3) : ruta;
  if (/\.json$/i.test(sinComprimir)) return sinComprimir;
  if (/\.html?$/i.test(sinComprimir)) return sinComprimir.replace(/\.html?$/i, '.json');
  return `${sinComprimir}.json`;
}

/** Lee un fichero archivado, esté comprimido o no. Devuelve `null` si no existe ninguno de los dos. */
export function leeArchivo(ruta) {
  try {
    // `guardaAtomico` devuelve y persiste el destino real, que puede terminar ya en `.gz`.
    // En ese caso no hay que tratarlo como un archivo plano: los reparadores guardan esa ruta
    // exacta en SQLite y necesitan recuperar el contenido original sin volver a pedirlo.
    if (existsSync(ruta)) {
      const contenido = readFileSync(ruta);
      return ruta.toLowerCase().endsWith('.gz') ? gunzipSync(contenido) : contenido;
    }
    if (existsSync(`${ruta}.gz`)) return gunzipSync(readFileSync(`${ruta}.gz`));
  } catch { /* ilegible */ }
  return null;
}

export function rutaGrupo(raiz, temporada, competicion, grupo) {
  return join(raiz, `t${temporada}-${etiquetaTemporada(temporada)}`, `comp-${competicion}`, `grupo-${grupo}`);
}
