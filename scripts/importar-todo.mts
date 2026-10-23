#!/usr/bin/env node
/*
 * IMPORTA TODO LO RECOLECTADO, DE TODAS LAS FEDERACIONES Y TODAS LAS TEMPORADAS.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Medido el 24/09/2026: las diecinueve colas tenían **28.382 grupos con datos** y el canónico tenía **227**
 * importados. Un 0,8 %. Y nadie lo sabía.
 *
 * Eso no es un problema de rendimiento, es un problema de verdad. Un informe que compara la plantilla de
 * este año con la del año pasado se apoya en el archivo, y si el archivo tiene la centésima parte de los
 * datos, el informe dice cosas falsas con toda la apariencia de ser ciertas. Pasó con Adrián Pereira, del
 * Ciudad Rodrigo Juvenil: el informe decía que había jugado 1 partido la temporada anterior cuando había
 * jugado 23, porque su competición estaba recolectada, completa, y sin importar. Y si le pasó a él le puede
 * pasar a cualquiera de los 55.408 jugadores que hay ya en la base.
 *
 * ── CÓMO LO HACE ───────────────────────────────────────────────────────────────────────────────────────
 *
 * 1. Saca de cada cola la lista de grupos con algo que importar, con su temporada y cuántas actas tiene.
 * 2. La ordena por lo que más vale: temporada más reciente primero, y dentro de cada temporada los grupos
 *    **con actas antes que los que sólo tienen calendario** — las actas son las que traen jugadores, goles y
 *    minutos; un grupo sin actas sólo aporta resultados y clasificación.
 * 3. Importa grupo a grupo en UN SOLO PROCESO (no uno por grupo: el arranque de `pnpm`+`tsx` cuesta más que
 *    la importación) y con `continuar: true`, para que un grupo roto no tumbe los demás pero quede anotado.
 * 4. Escribe cada resultado en `pruebas/reconstruccion/importacion-todo.jsonl`. **Ese fichero es la memoria
 *    del trabajo**: al volver a arrancar, lo ya importado con éxito se salta. Se puede cortar a voluntad.
 *
 * ── USO ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   node --import tsx scripts/importar-todo.mts                 # todo lo que falte
 *   node --import tsx scripts/importar-todo.mts --federacion galicia
 *   node --import tsx scripts/importar-todo.mts --temporada 2025-26
 *   node --import tsx scripts/importar-todo.mts --plan          # sólo dice qué haría, no importa
 *   node --import tsx scripts/importar-todo.mts --rehacer       # vuelve a importar también lo ya hecho
 */
import { createRequire } from 'node:module';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { diagnosticaTablaOficial, mtimeDelArchivo } from '../packages/canonico/src/clasificacion-oficial.js';
import { creaPool } from '../packages/canonico/src/destino/pool.js';
import { importaFederacion } from '../packages/canonico/src/lote.js';
import { limpiaTemporales } from './limpiar-temp.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRO = join(RAIZ, 'pruebas', 'reconstruccion', 'importacion-todo.jsonl');
const AVANCE = join(RAIZ, 'pruebas', 'reconstruccion', 'importacion-todo-avance.json');

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const soloPlan = argumentos.includes('--plan');
const rehacer = argumentos.includes('--rehacer');
const filtroFederacion = arg('federacion');
const filtroTemporada = arg('temporada');

const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* sin .env no hay a dónde importar */ }
}

/** Carpeta de datos de cada federación. Castilla y León es la excepción histórica. */
const CARPETA_ESPECIAL = { 'castilla-leon': 'descargas-federacion' };
const federaciones = (() => {
  const { readdirSync } = requerir('node:fs');
  const salida = [];
  for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
    if (entrada.name === 'descargas-federacion-sondeo' || entrada.name === 'descargas-prueba-10gb') continue;
    const rutaCola = join(RAIZ, entrada.name, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(rutaCola)) continue;
    if (existsSync(join(RAIZ, entrada.name, '.PRUEBA'))) continue;
    const federacion = entrada.name === 'descargas-federacion' ? 'castilla-leon' : entrada.name.replace('descargas-', '');
    if (filtroFederacion && federacion !== filtroFederacion) continue;
    salida.push({ federacion, rutaCola });
  }
  return salida.sort((a, b) => a.federacion.localeCompare(b.federacion, 'es'));
})();
if (federaciones.length === 0) {
  console.error(filtroFederacion ? `No hay ninguna cola para la federación ${filtroFederacion}.` : 'No se ha encontrado ninguna cola.');
  process.exit(1);
}

/* ── 1. El plan: qué hay que importar y en qué orden ──────────────────────────────────────────────── */
const plan = [];
/** Ruta de la cola de cada federación: la usa la huella del calendario para no repetir fallos deterministas. */
const colas = new Map(federaciones.map((f) => [f.federacion, f.rutaCola]));
for (const { federacion, rutaCola } of federaciones) {
  // La cola la está escribiendo su recolector: sin `timeout`, un bloqueo momentáneo tumba el plan entero
  // con «database is locked» (medido el 25/09/2026, al reiniciar la carga).
  const db = new DatabaseSync(rutaCola, { readOnly: true, timeout: 10_000 });
  const filas = db.prepare(`
    select g.temporada, t.etiqueta as etiqueta, g.competicion, g.codigo as grupo,
           (select count(*) from partidos p where p.temporada = g.temporada
              and p.competicion = g.competicion and p.grupo = g.codigo) as partidos,
           (select count(*) from actas a where a.temporada = g.temporada
              and a.competicion = g.competicion and a.grupo = g.codigo and a.estado = 'hecha') as actas,
           (select count(*) from partidos p where p.temporada = g.temporada
              and p.competicion = g.competicion and p.grupo = g.codigo and p.goles_local is not null) as con_resultado,
           g.temporada as codigo_temporada
    from grupos g
    join temporadas t on t.codigo = g.temporada
    where exists (select 1 from jornadas j
            where j.temporada = g.temporada and j.competicion = g.competicion and j.grupo = g.codigo)
       or exists (select 1 from partidos p
            where p.temporada = g.temporada and p.competicion = g.competicion and p.grupo = g.codigo)`).all();
  db.close();
  for (const f of filas) {
    if (filtroTemporada && f.etiqueta !== filtroTemporada) continue;
    plan.push({ federacion, etiqueta: f.etiqueta, competicion: f.competicion, grupo: f.grupo,
      partidos: Number(f.partidos), actas: Number(f.actas), conResultado: Number(f.con_resultado),
      codigoTemporada: String(f.codigo_temporada) });
  }
}

// Lo que más vale primero: temporada más reciente, y dentro de ella los grupos con actas.
plan.sort((a, b) => (b.etiqueta.localeCompare(a.etiqueta, 'es'))
  || (b.actas > 0 ? 1 : 0) - (a.actas > 0 ? 1 : 0)
  || (b.actas - a.actas)
  || (b.partidos - a.partidos)
  || a.grupo.localeCompare(b.grupo, 'es'));

/* ── 2. Lo ya hecho: manda el CANÓNICO, y el registro es sólo la memoria fina ──────────────────────── */
const hechos = new Set();
/** El último intento de cada grupo, para no repetir un fallo que ya se sabe determinista (abajo). */
const ultimoIntento = new Map<string, Record<string, unknown>>();
if (!rehacer && existsSync(REGISTRO)) {
  for (const linea of readFileSync(REGISTRO, 'utf8').split('\n')) {
    if (linea.trim() === '') continue;
    try {
      const r = JSON.parse(linea);
      if (r.ok === true) hechos.add(`${r.federacion}|${r.etiqueta}|${r.grupo}`);
      // El ÚLTIMO intento de cada grupo, para saber también lo que falló y por qué.
      ultimoIntento.set(`${r.federacion}|${r.etiqueta}|${r.grupo}`, r);
    } catch { /* una línea a medias de un corte no invalida el resto */ }
  }
}
/*
 * ── Y ADEMÁS SE LE PREGUNTA A LA BASE, PORQUE EL REGISTRO NO ES LA VERDAD ─────────────────────────────
 *
 * El registro sólo sabe de los grupos que ha importado ESTA herramienta. Los que entraron por otra vía
 * —el bucle grupo a grupo con `scripts/importar-temporada.ps1`, que fue como se recuperó 2025-26 de
 * Castilla y León— no están en él. Medido el 24/09/2026: la herramienta decía «175 grupos pendientes» de
 * una temporada que ya estaba entera en el canónico, y habría vuelto a importarlos todos.
 *
 * Lo que de verdad se ha importado lo dice el canónico: si el grupo tiene `phase_group`, está dentro. Se
 * consulta una vez y se une al registro. Con `--rehacer` se ignora todo, que es lo que hace falta cuando
 * lo que se quiere es volver a pasar por encima.
 */
const pool = creaPool();
/*
 * ── SI EL CANÓNICO SE VA, SE PARA CON UN MENSAJE QUE SE ENTIENDA (medido el 24/09/2026) ────────────────
 *
 * Docker Desktop se cayó a las 23:26, en mitad de una carga de cuatro horas y media. La importación murió con
 * «Connection terminated unexpectedly» y una traza de `node:events:487` que no decía ni qué había pasado ni
 * qué hacer; el que se había caído era Docker, y la base estaba intacta detrás.
 *
 * Se para A PROPÓSITO en vez de seguir: sin base, cada grupo fallaría y el registro se llenaría de cientos de
 * fallos que no son fallos de los datos —exactamente lo que hace ilegible el parte—. Parar deja el trabajo
 * reanudable, que es como está diseñado todo esto.
 */
pool.on('error', (error: Error) => {
  console.error(`\n✗ El canónico ha dejado de responder: ${error.message}`);
  console.error('  Lo más probable es que Docker no esté arrancado. Se comprueba y se levanta con:');
  console.error('      docker info    ·    pnpm db:arrancar');
  console.error('  No se ha perdido nada: lo importado está en el registro y esto se reanuda volviendo a lanzarlo.');
  process.exit(1);
});
/*
 * ── Y LOS QUE TIENEN MÁS DATOS QUE DENTRO VUELVEN AL PLAN (medido el 25/09/2026) ───────────────────────
 *
 * El recolector no para: sigue bajando actas de grupos que YA están importados —y cada acta nueva trae su
 * informe, sus alineaciones y sus eventos— y sigue LEYENDO JORNADAS, que añaden partidos al calendario. Dos
 * ejemplos medidos ese día:
 *
 *   · 429 grupos con 6.660 actas descargadas después de importarlos (Castilla y León 3.563, Madrid 911,
 *     Cataluña 790): el plan sólo miraba si el grupo estaba dentro y no si había crecido;
 *   · 765 grupos con 8.433 partidos de más en la cola que dentro (Madrid 3.468, Rioja 647, Navarra 293), uno
 *     de ellos con 99 partidos en la cola y 7 dentro.
 *
 * La comparación es directa: lo que la cola tiene hoy (partidos y actas `hecha`) contra lo que el canónico
 * tiene de ese grupo (partidos y informes). Si la cola tiene más, el grupo vuelve al plan.
 */
const enElCanonico = new Map<string, { partidos: number; informes: number; conResultado: number; oficiales: number; archivoEn: string | null }>();
if (!rehacer) {
  const { rows } = await pool.query(`
    select f.codigo as federacion, s.etiqueta, pg.codigo_externo as grupo,
           count(distinct m.id)::int as partidos,
           count(distinct r.match_id)::int as informes,
           (count(distinct m.id) filter (where m.goles_local is not null))::int as con_resultado,
           (select count(*)::int from core.standing_snapshot ss
             where ss.phase_group_id = pg.id and ss.origen = 'oficial') as oficiales,
           (select cc.tabla_oficial_archivo_en from ops.coverage_checkpoint cc
             where cc.phase_group_id = pg.id) as archivo_en
      from core.phase_group pg
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.federation f on f.id = ce.federation_id
      join core.season s on s.id = ce.season_id
      left join core.match m on m.phase_group_id = pg.id
      left join core.match_report r on r.match_id = m.id
     where pg.codigo_externo is not null
     group by 1, 2, 3, pg.id`);
  for (const r of rows) {
    const clave = `${r.federacion}|${r.etiqueta}|${r.grupo}`;
    hechos.add(clave);
    enElCanonico.set(clave, {
      partidos: Number(r.partidos), informes: Number(r.informes), conResultado: Number(r.con_resultado),
      oficiales: Number(r.oficiales),
      archivoEn: r.archivo_en === null || r.archivo_en === undefined ? null : new Date(r.archivo_en).toISOString(),
    });
  }
}

/*
 * ── UN FALLO DETERMINISTA NO SE REINTENTA HASTA QUE CAMBIE LA COLA (medido el 24/09/2026) ──────────────
 *
 * El importador rechaza un grupo cuyo calendario es imposible (ver `calendario-imposible.ts`), y ese rechazo
 * es determinista: con la misma cola, el mismo grupo vuelve a fallar. Pero el plan sólo da por hechos los que
 * entraron, así que **cada arranque vuelve a intentar los mismos 1.277 grupos catalanes**: a ~6 s por grupo
 * son unas **2 horas tiradas en cada vuelta**, y creciendo.
 *
 * Se saltan sólo si se cumplen DOS cosas: que el último intento fallara por ese motivo exacto, y que la
 * huella del calendario en la cola sea la misma que entonces. Si alguien repara la cola, la huella cambia y el
 * grupo vuelve al plan solo. Nunca se salta nada en silencio: se cuenta y se dice.
 */
const MOTIVO_IMPOSIBLE = 'calendario de la cola es imposible';
const huellaCalendario = (p: { federacion: string; etiqueta: string; grupo: string }): string => {
  const cola = colas.get(p.federacion);
  if (!cola) return '';
  const db = new DatabaseSync(cola);      // sólo lectura
  try {
    const f = db.prepare(`select count(*) n, count(distinct jornada) j,
        count(distinct local||'|'||visitante) parejas from partidos where grupo = ?`).get(p.grupo) as
      { n: number; j: number; parejas: number } | undefined;
    return f ? `${f.n}|${f.j}|${f.parejas}` : '';
  } catch { return ''; } finally { db.close(); }
};

/*
 * El plan: los que NO están en el canónico, MÁS los que tienen más datos en la cola que dentro. Nunca se
 * salta nada en silencio: lo que vuelve se cuenta y se dice.
 *
 * ── SE COMPARAN PARTIDOS CON RESULTADO, NO FILAS NI JORNADAS (corregido el 25/09/2026, tras dos intentos) ─
 *
 * Comparar `partidos` de la cola contra partidos del canónico marcaba cientos de grupos que estaban bien: la
 * cola guarda una fila por partido Y por descanso («Descansa vs X»), y el importador descarta los descansos a
 * propósito. Medido en el grupo riojano 331665: **99 filas, de las que 92 son descansos, y el canónico tiene
 * los 7 partidos de verdad**. Comparar jornadas tampoco vale: la tabla `jornadas` tiene filas de jornadas que
 * el recolector todavía no ha leído, y marcaba 17.451 grupos.
 *
 * Un partido CON RESULTADO no se puede fingir: un descanso no tiene marcador. Así que la señal es el número
 * de partidos con resultado a cada lado.
 */
const crecidos: Array<{ federacion: string; etiqueta: string; grupo: string; partidos: number; actas: number; motivo: string }> = [];
/*
 * ── TERCERA SEÑAL: LA CLASIFICACIÓN OFICIAL ARCHIVADA Y SIN IMPORTAR (medido el 25/09/2026) ────────────
 *
 * El recolector archiva la clasificación oficial de cada grupo en
 * `recolector-local/t<código>-<etiqueta>/comp-<competición>/grupo-<código>/clasificacion.json.gz`, y el
 * importador la mete en el canónico como `standing_snapshot.origen = 'oficial'`.
 *
 * Pero se archiva DESPUÉS: cuando un grupo se importó, su tabla oficial todavía no estaba descargada, y el
 * plan sólo miraba partidos con resultado y actas. Medido hoy: **7.980 grupos están dentro con partidos y
 * actas y sin su tabla oficial, teniendo el archivo legible en disco**. No es un fallo del importador, es
 * un hueco que nadie veía: la clasificación existe, es la que publicó la federación, y no está.
 *
 * Sólo vuelven al plan los que tienen archivo LEGIBLE y con filas: si el archivo lo rechaza el mismo
 * validador del canónico, reimportar no lo arregla (es un problema de captura, no de importación) y si el
 * JSON es una lista vacía, la federación aún no publicaba tabla. El estado de esos casos ya lo dice la
 * cobertura (`ops.coverage_checkpoint.tabla_oficial_estado`), y `scripts/revisa-tabla-oficial.mts` lo
 * recalcula sin reimportar.
 */
const raicesCola = new Map(federaciones.map((f) => [f.federacion, dirname(f.rutaCola)]));
function tablaOficialSinImportar(
  p: { federacion: string; etiqueta: string; competicion: string; grupo: string; codigoTemporada: string },
  archivoEn: string | null,
): boolean {
  const raizCola = raicesCola.get(p.federacion);
  if (raizCola === undefined) return false;
  const temporada = { codigo: p.codigoTemporada, etiqueta: p.etiqueta };
  const datos = { raizCola, temporada, competicion: p.competicion, grupo: p.grupo };
  /*
   * ── PRIMERO SE MIRA SI ESE ARCHIVO YA SE MIRÓ (migración 0021, medido el 25/09/2026) ──────────────────
   *
   * La fecha del archivo con el que se decidió el estado evita el bucle: 1.394 grupos volvían al plan en
   * CADA pasada porque su clasificación es legible pero el importador decidió no escribirla por motivos que
   * sólo se ven al importar (equipos que no se resuelven dentro de su grupo, dos filas al mismo equipo, o
   * ninguna jornada completa a la que colgar la foto). Si el archivo es el MISMO, no hay nada nuevo que
   * intentar; si la federación lo ha vuelto a publicar, la fecha cambia y el grupo vuelve solo.
   */
  const suyo = mtimeDelArchivo(datos);
  const ahoraEn = suyo === null ? null : suyo.toISOString();
  if (archivoEn !== null && ahoraEn !== null && archivoEn === ahoraEn) return false;
  /*
   * Se pregunta con el MISMO diagnóstico que usa el importador (`diagnosticaTablaOficial`): no hay dos
   * reglas sobre qué es una tabla oficial legible. Sólo vuelve al plan si el archivo da filas de verdad.
   *
   * ── Y ESO SE APRENDIÓ MIDIENDO ────────────────────────────────────────────────────────────────────────
   *
   * La primera versión de esta señal daba por buena la EXISTENCIA del archivo —y el HTML lo fiaba sin
   * probarlo, porque el de Cataluña es una cáscara sin tabla—. Con esa regla entraban al plan galicia (1.264),
   * euskadi (863) y baleares (440) con la clasificación archivada… y CERO tablas oficiales dentro, porque la
   * publican con otra maqueta y el lector saca cero filas. Habría reimportado 2.567 grupos para no traer ni un
   * dato. Ahora se prueban las filas: si no hay filas, no hay nada que importar y el grupo se queda quieto,
   * con su estado escrito en la cobertura (`ilegible`, migración 0020) para que el hueco se vea igual.
   */
  const { estado } = diagnosticaTablaOficial(datos);
  return estado === 'legible';
}

const sinTablaOficial: typeof plan = [];
const pendientes = plan.filter((p) => {
  const clave = `${p.federacion}|${p.etiqueta}|${p.grupo}`;
  if (!hechos.has(clave)) return true;
  const dentro = enElCanonico.get(clave) ?? { partidos: 0, informes: 0, conResultado: 0, oficiales: 0, archivoEn: null };
  const resultadosDeMas = p.conResultado - dentro.conResultado;
  const actasDeMas = p.actas - dentro.informes;
  if (resultadosDeMas > 0 || actasDeMas > 0) {
    const motivo = resultadosDeMas > 0 && actasDeMas > 0 ? 'más partidos con resultado y más actas'
      : resultadosDeMas > 0 ? 'más partidos con resultado' : 'más actas descargadas';
    crecidos.push({ federacion: p.federacion, etiqueta: p.etiqueta, grupo: p.grupo, partidos: p.partidos, actas: p.actas, motivo });
    return true;
  }
  if (dentro.oficiales === 0 && tablaOficialSinImportar(p, dentro.archivoEn)) {
    sinTablaOficial.push(p);
    return true;
  }
  return false;
});
const saltados: typeof pendientes = [];
const deVerdad = pendientes.filter((p) => {
  const anterior = ultimoIntento.get(`${p.federacion}|${p.etiqueta}|${p.grupo}`);
  if (!anterior || anterior.ok === true) return true;
  if (!String(anterior.motivo ?? '').includes(MOTIVO_IMPOSIBLE)) return true;
  if (anterior.huella === undefined) return true;      // registro viejo, sin huella: se reintenta
  if (huellaCalendario(p) !== anterior.huella) return true;   // la cola cambió: vuelve al plan
  saltados.push(p);
  return false;
});
pendientes.length = 0;
pendientes.push(...deVerdad);

const conActas = pendientes.filter((p) => p.actas > 0).length;

console.log(`═══ importación completa · ${plan.length} grupo(s) en el plan · ${hechos.size} ya en el canónico · ${pendientes.length} por hacer`);
if (crecidos.length > 0) {
  const porMotivo = new Map<string, number>();
  for (const c of crecidos) porMotivo.set(c.motivo, (porMotivo.get(c.motivo) ?? 0) + 1);
  console.log(`    ${crecidos.length} de ellos YA estaban en el canónico y vuelven porque la cola tiene más: `
    + [...porMotivo].map(([m, n]) => `${n} con ${m}`).join(', '));
  console.log(`    (${crecidos.reduce((n, p) => n + p.partidos, 0)} partidos y ${crecidos.reduce((n, p) => n + p.actas, 0)} actas en total)`);
}
if (sinTablaOficial.length > 0) {
  const cuentaOficial = new Map<string, number>();
  for (const p of sinTablaOficial) cuentaOficial.set(p.federacion, (cuentaOficial.get(p.federacion) ?? 0) + 1);
  console.log(`    ${sinTablaOficial.length} grupo(s) YA estaban con partidos y actas pero SIN su clasificación oficial, `
    + 'teniéndola archivada y legible: vuelven al plan sólo por la tabla oficial');
  console.log(`    (${[...cuentaOficial].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')})`);
}
if (saltados.length > 0) {
  console.log(`    ${saltados.length} grupo(s) NO se reintentan: su último fallo fue «${MOTIVO_IMPOSIBLE}» y la cola `
    + 'sigue exactamente igual. Se vuelven a mirar solos en cuanto el calendario de la cola cambie.');
}
console.log(`    de los pendientes, ${conActas} tienen actas (jugadores, goles, minutos) y ${pendientes.length - conActas} sólo calendario`);
for (const { federacion } of federaciones) {
  const suyos = pendientes.filter((p) => p.federacion === federacion);
  if (suyos.length > 0) console.log(`      ${federacion.padEnd(20)} ${String(suyos.length).padStart(5)} pendientes`);
}

/*
 * ── CUÁNTO QUEDA, EN HORAS Y NO EN GRUPOS ────────────────────────────────────────────────────────────
 *
 * Contar grupos no dice nada: un grupo de calendario se importa en un tercio de segundo y uno con 240 actas
 * tarda once. Y el orden del plan no es el orden del coste —va por temporada, de la más reciente a la más
 * vieja—, así que la primera hora vuela (temporada en curso, casi todo calendario) y la segunda se arrastra
 * (temporadas cerradas, casi todo con actas).
 *
 * Los números salen de medir, no de suponer. Sobre los 4.298 grupos ya intentados el 24/09/2026, el tiempo
 * que declara cada tanda, agrupado por cuántas actas trae el grupo:
 *
 *      0 actas    1.175 grupos · 0,36 s
 *      1-20       1.595 grupos · 0,89 s
 *      21-100       982 grupos · 3,37 s
 *      101-200      274 grupos · 7,08 s
 *      201+         272 grupos · 11,19 s
 *
 * El tramo 21-100 bajó de 8,52 s a 3,37 s al medirlo con más grupos: la primera cifra salió de 184 grupos de
 * las temporadas recientes, que son los caros, y daba una estimación pesimista para el resto del plan.
 *
 * Primera versión de esta estimación, y por qué estaba mal: se midió el tiempo de reloj entre el primer y el
 * último grupo del registro y se le restó la suma de las tandas, y la diferencia —1,60 s por grupo— se
 * atribuyó a «abrir conexión y leer catálogo». Era falso. Aquellos 185 minutos de ventana contenían **71,7
 * minutos de paradas** (arranques y paradas del proceso, esperas de disco): el trabajo real fueron 113,5
 * minutos para 2.288 grupos, y la suma de las tandas son 123,7 minutos, que cuadra con el reloj. No hay coste
 * fijo: cada grupo cuesta lo que cuesta su tanda.
 */
const SEGUNDOS_POR_TRAMO = { sinActas: 0.36, hasta20: 0.89, hasta100: 3.37, hasta200: 7.08, mas: 11.19 };
function tramoDeActas(actas: number): string {
  if (actas === 0) return 'sinActas';
  if (actas <= 20) return 'hasta20';
  if (actas <= 100) return 'hasta100';
  if (actas <= 200) return 'hasta200';
  return 'mas';
}
const porEtiqueta = new Map();
for (const p of pendientes) {
  const acumulado = porEtiqueta.get(p.etiqueta) ?? { grupos: 0, conActas: 0, segundos: 0 };
  acumulado.grupos += 1;
  if (p.actas > 0) acumulado.conActas += 1;
  acumulado.segundos += SEGUNDOS_POR_TRAMO[tramoDeActas(p.actas) as keyof typeof SEGUNDOS_POR_TRAMO];
  porEtiqueta.set(p.etiqueta, acumulado);
}
const ordenadas = [...porEtiqueta].sort((a, b) => b[0].localeCompare(a[0], 'es'));
let segundosTotales = 0;
console.log('');
for (const [etiqueta, a] of ordenadas) {
  segundosTotales += a.segundos;
  const horas = a.segundos / 3600;
  console.log(`      ${etiqueta.padEnd(10)} ${String(a.grupos).padStart(5)} grupos · `
    + `${String(a.conActas).padStart(5)} con actas · ~${horas < 1 ? `${(a.segundos / 60).toFixed(0)} min` : `${horas.toFixed(1)} h`}`);
}
console.log(`      ${'TOTAL'.padEnd(10)} ${String(pendientes.length).padStart(5)} grupos · `
  + `${String(conActas).padStart(5)} con actas · ~${(segundosTotales / 3600).toFixed(1)} h de reloj`);

if (soloPlan) {
  console.log('\n--plan: no se importa nada. Vuelve a lanzarlo sin --plan.');
  process.exit(0);
}
if (pendientes.length === 0) {
  console.log('\nNo queda nada por importar. Usa --rehacer para volver a importarlo todo.');
  process.exit(0);
}

/* ── 3. Importar: un proceso, un pool, grupo a grupo ──────────────────────────────────────────────── */
mkdirSync(dirname(REGISTRO), { recursive: true });
// El pool ya se ha creado arriba, al preguntarle al canónico qué está importado: se reutiliza.
const inicio = Date.now();

/*
 * ── EL TECHO DEL DISCO, VIGILADO ──────────────────────────────────────────────────────────────────────
 *
 * PostgreSQL vive en un volumen de Docker, y ese volumen vive dentro de un disco virtual (.vhdx) que en
 * este PC está en `C:`. Medido el 24/09/2026: `C:` tenía **1,5 GB libres** con el disco virtual en 63 GB,
 * mientras que por dentro el sistema de ficheros declaraba 921 GB disponibles. Es decir: el techo real no
 * es el que parece, pero tampoco es infinito, y quedarse sin espacio en `C:` no rompe este trabajo: rompe
 * el equipo entero.
 *
 * Por eso se mide antes de cada tanda y se para en seco si el disco del anfitrión baja del umbral. Parar
 * a tiempo deja el trabajo reanudable —el registro dice lo ya hecho— y no deja la máquina al borde.
 */
const VHDX = process.env.FACYLF_DISCO_DOCKER
  ?? join(process.env.LOCALAPPDATA ?? 'C:\\', 'Docker', 'wsl', 'disk', 'docker_data.vhdx');
const LIBRES_MINIMOS_GB = Number(process.env.FACYLF_LIBRES_MINIMOS_GB ?? 1);
/**
 * Por debajo de esto se limpian los temporales del sistema antes de seguir.
 *
 * Medido el 24/09/2026: de cada 460 MB que perdía `C:`, **340 eran `%TEMP%`** (perfiles de Chrome que van
 * dejando los recolectores) y sólo 120 el disco de Docker. Parar la importación para pedirle a una persona
 * que borre basura temporal sería absurdo: el consumidor es recuperable y la herramienta puede
 * recuperarlo. Se limpia lo que tenga más de 2 horas, y lo que esté en uso no se toca.
 */
const LIBRES_PARA_LIMPIAR_GB = Number(process.env.FACYLF_LIBRES_PARA_LIMPIAR_GB ?? 6);

function estadoDelDisco() {
  try {
    const raiz = parse(VHDX).root || 'C:\\';
    const s = statfsSync(raiz);
    const virtualGb = existsSync(VHDX) ? statSync(VHDX).size / 1024 ** 3 : null;
    return { raiz, libresGb: (s.bavail * s.bsize) / 1024 ** 3, virtualGb };
  } catch {
    return null;   // sin poder medir no se detiene nada: se avisa y se sigue
  }
}

const discoInicial = estadoDelDisco();
if (discoInicial) {
  console.log(`    disco del anfitrion ${discoInicial.raiz} · ${discoInicial.libresGb.toFixed(1)} GB libres`
    + `${discoInicial.virtualGb === null ? '' : ` · disco virtual de Docker ${discoInicial.virtualGb.toFixed(1)} GB`}`
    + ` · se detiene si baja de ${LIBRES_MINIMOS_GB} GB`);
}

let ok = 0;
let fallos = 0;
let detenidoPorDisco = false;
const fallidos = [];
const porFederacion = new Map();

try {
  for (const [i, trabajo] of pendientes.entries()) {
    // La comprobación va en CADA grupo, no cada tantos: el disco virtual puede crecer varios gigas en una
    // sola tanda y quedarse sin margen entre dos comprobaciones.
    const disco = estadoDelDisco();
    if (disco && disco.libresGb < LIBRES_PARA_LIMPIAR_GB) {
      // Antes de darse por vencida, recupera lo que es suyo: la basura temporal del sistema.
      const limpieza = limpiaTemporales({ horas: 2 });
      if (limpieza !== null && limpieza.borrados > 0) {
        const ahora = estadoDelDisco();
        console.log(`  · disco bajo (${disco.libresGb.toFixed(1)} GB): limpiados ${limpieza.borrados} temporales`
          + ` de más de 2 h${ahora ? ` → ${ahora.libresGb.toFixed(1)} GB libres` : ''}`);
      }
    }
    const discoTrasLimpiar = estadoDelDisco();
    if (discoTrasLimpiar && discoTrasLimpiar.libresGb < LIBRES_MINIMOS_GB) {
      detenidoPorDisco = true;
      console.error(`\n✗ PARADO: a ${discoTrasLimpiar.raiz} le quedan ${discoTrasLimpiar.libresGb.toFixed(2)} GB y el suelo es ${LIBRES_MINIMOS_GB} GB.`);
      console.error('  No se ha perdido nada: lo importado está en el registro y se salta al volver a arrancar.');
      console.error('');
      console.error('  ANTES DE TOCAR DOCKER, MIRA EL DISCO DEL SISTEMA. Medido el 24/09/2026: la conclusión');
      console.error('  fácil era «el canónico no cabe», y era falsa — el disco virtual de Docker había crecido');
      console.error('  0,48 GB mientras %TEMP% pasaba de 12 a 20,45 GB por los perfiles de Chrome que dejan los');
      console.error('  recolectores. Borrar lo de más de cuatro horas liberó 9,27 GB de golpe:');
      console.error('');
      console.error('      node scripts/limpiar-temp.mjs          (y vuelve a lanzar esta importación)');
      console.error('');
      console.error('  Si aun así no basta, entonces sí: hay que darle espacio al disco donde vive Docker.');
      break;
    }
    const etiqueta = `t${trabajo.etiqueta} c${trabajo.competicion} g${trabajo.grupo}`;
    let registro;
    const t0 = Date.now();
    try {
      const informes = await importaFederacion(pool, {
        raiz: RAIZ, federacion: trabajo.federacion, temporada: trabajo.etiqueta,
        grupo: trabajo.grupo, continuar: true,
        // Carga masiva: sin diario de cambios. Medido el 24/09/2026, el diario era la MITAD de la base
        // (601 MB de 1.196 MB) con 242 grupos; con 28.382 sería impagable en disco y en tiempo. El lote
        // sigue siendo una transacción, pero no se podrá revertir después con `--revertir`: por eso el
        // lote lo declara y esta herramienta escribe su propio registro reanudable. Ver `Repositorio`.
        diario: false,
      });
      const informe = informes[0];
      if (informe === undefined) {
        // El grupo ya no tiene nada que importar en la cola: no es un fallo, es que se quedó sin datos.
        registro = { ok: true, vacio: true, milisegundos: Date.now() - t0 };
      } else if (informe.error !== undefined) {
        registro = { ok: false, motivo: informe.error, milisegundos: Date.now() - t0 };
      } else {
        registro = {
          ok: true,
          batchId: informe.batchId,
          milisegundos: informe.milisegundos,
          cobertura: {
            jornadas: informe.cobertura.jornadas_descubiertas,
            partidos: informe.cobertura.partidos_conocidos,
            actas: informe.cobertura.actas_parseadas,
            hasta: informe.cobertura.complete_through_matchday,
          },
        };
      }
    } catch (error) {
      // Sólo se llega aquí por algo que no es un grupo concreto (la base caída, por ejemplo). Se anota y
      // se sigue: parar el trabajo entero por eso dejaría sin importar lo que queda.
      registro = { ok: false, motivo: error instanceof Error ? error.message : String(error), milisegundos: Date.now() - t0 };
    }

    /*
     * Si el fallo es el determinista del calendario imposible, se guarda la HUELLA del calendario de la cola.
     * Es lo que permite saltárselo en el siguiente arranque sin riesgo: si la cola cambia —porque alguien la
     * repare—, la huella deja de coincidir y el grupo vuelve al plan él solo.
     */
    if (registro.ok === false && String(registro.motivo ?? '').includes(MOTIVO_IMPOSIBLE)) {
      registro = { ...registro, huella: huellaCalendario(trabajo) };
    }
    registro = { cuando: new Date().toISOString(), ...trabajo, ...registro };
    appendFileSync(REGISTRO, `${JSON.stringify(registro)}\n`, 'utf8');

    const suyo = porFederacion.get(trabajo.federacion) ?? { ok: 0, fallos: 0 };
    if (registro.ok) { ok += 1; suyo.ok += 1; } else { fallos += 1; suyo.fallos += 1; fallidos.push({ ...trabajo, motivo: registro.motivo }); }
    porFederacion.set(trabajo.federacion, suyo);

    if ((i + 1) % 25 === 0 || i + 1 === pendientes.length) {
      const minutos = (Date.now() - inicio) / 60_000;
      const ritmo = (i + 1) / Math.max(minutos, 0.01);
      const restan = (pendientes.length - i - 1) / Math.max(ritmo, 0.01);
      console.log(`  ${String(i + 1).padStart(5)}/${pendientes.length} · ok ${ok} · fallos ${fallos} · `
        + `${ritmo.toFixed(0)} grupos/min · quedan ~${(restan / 60).toFixed(1)} h · último: ${trabajo.federacion} ${etiqueta}`);
    }
  }
} finally {
  await pool.end();
}

/* ── 4. El parte ──────────────────────────────────────────────────────────────────────────────────── */
const minutos = (Date.now() - inicio) / 60_000;
const parte = {
  cuando: new Date().toISOString(),
  minutos: Number(minutos.toFixed(1)),
  planificados: pendientes.length,
  importados: ok,
  fallidos: fallos,
  detenidoPorDisco,
  disco: estadoDelDisco(),
  porFederacion: Object.fromEntries(porFederacion),
  // Los que no han entrado, con su motivo. Es cobertura que FALTA y no se esconde.
  fallos: fallidos.slice(0, 200),
};
writeFileSync(AVANCE, `${JSON.stringify(parte, null, 2)}\n`, 'utf8');

console.log(`\nRESUMEN: ${ok} grupo(s) importados · ${fallos} fallidos · ${minutos.toFixed(1)} minutos${detenidoPorDisco ? ' · DETENIDO POR FALTA DE ESPACIO EN EL DISCO' : ''}`);
for (const [federacion, cuenta] of [...porFederacion].sort()) {
  console.log(`  ${federacion.padEnd(20)} ok ${String(cuenta.ok).padStart(5)} · fallos ${cuenta.fallos}`);
}
if (fallidos.length > 0) {
  console.log(`\nGRUPOS QUE NO HAN ENTRADO (${fallidos.length}), los primeros 20:`);
  for (const f of fallidos.slice(0, 20)) {
    console.log(`  ✗ ${f.federacion} t${f.etiqueta} c${f.competicion} g${f.grupo}: ${f.motivo}`);
  }
  console.log(`\n  La lista completa está en ${AVANCE.replace('.json', '-avance.json')} y el detalle en importacion-todo.jsonl`);
}
console.log(`\n  registro: ${REGISTRO}`);
