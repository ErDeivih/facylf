/*
 * INGESTA DEL FIN DE SEMANA · todas las federaciones, de una pasada.
 *
 * Las ligas ya están en marcha: cada fin de semana se juegan jornadas en las diecinueve federaciones y, desde
 * el lunes, hay que asegurarse de que esos partidos —y sus actas— están recogidos. Este programa es esa vuelta:
 *
 *   1. calcula la ventana del último fin de semana (sábado 00:00 → domingo 23:59, hora de Madrid);
 *   2. en cada federación REABRE las jornadas de esa ventana, aunque ya estuvieran hechas: una jornada se
 *      descarga en cuanto hay resultados, pero el acta puede publicarse dos días después, así que «hecha» el
 *      domingo no significa «completa» el lunes. Se reabren con prioridad 2 (delante del trabajo histórico) y
 *      también la clasificación de su grupo, que cambia con los resultados;
 *   3. mide y cuenta lo que FALTA: por federación, cuántas jornadas del finde están comprobadas y cuántas de
 *      sus actas están descargadas y analizadas, para que se vea de un vistazo si el fin de semana quedó
 *      completo o no.
 *
 * NO inventa trabajo ni datos: sólo pone en la cola lo que el planificador ya sabía encolar y deja un informe.
 * Las actas no se encolan aquí: las encola la propia jornada cuando se parsea, que es quien conoce sus códigos.
 *
 * Uso:
 *   node scripts/ingesta-fin-de-semana.mjs                 → planifica, reabre y informa (todas)
 *   node scripts/ingesta-fin-de-semana.mjs --informe       → sólo informa (no escribe nada)
 *   node scripts/ingesta-fin-de-semana.mjs --federaciones euskadi,valencia
 *   node scripts/ingesta-fin-de-semana.mjs --fin-semana 2026-09-12    (el sábado de esa semana)
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { claveTrabajo, encola, reactiva, setPerfil, urlJornada } from './lib/recolector-local.mjs';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const arg = (nombre, defecto = null) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : defecto;
};
const soloInforme = argumentos.includes('--informe');
const filtro = arg('federaciones');
const federacionesPedidas = filtro ? filtro.split(',').map((f) => f.trim()).filter(Boolean) : null;

/* ── La ventana: el fin de semana más reciente, en hora de Madrid ──────────────────────────────────── */
const fechaMadrid = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(d);
function ultimoSabado(hoyTexto) {
  const [a, m, d] = hoyTexto.split('-').map(Number);
  const hoy = new Date(Date.UTC(a, m - 1, d));
  if (argumentos.includes('--fin-semana')) {
    const [sa, sm, sd] = String(arg('fin-semana')).split('-').map(Number);
    const sabado = new Date(Date.UTC(sa, sm - 1, sd));
    if (Number.isNaN(sabado.getTime())) throw new Error('--fin-semana necesita una fecha AAAA-MM-DD');
    return sabado;
  }
  // 6 = sábado en getUTCDay()
  const atras = (hoy.getUTCDay() + 1) % 7;
  return new Date(hoy.getTime() - atras * 24 * 60 * 60_000);
}
const sabado = ultimoSabado(fechaMadrid(new Date()));
const domingo = new Date(sabado.getTime() + 24 * 60 * 60_000);
const ventana = { desde: fechaMadrid(sabado), hasta: fechaMadrid(domingo) };   // fechas inclusivas (YYYY-MM-DD)

console.log(`═══ ingesta del fin de semana · ventana ${ventana.desde} (sábado) → ${ventana.hasta} (domingo)${soloInforme ? ' · SÓLO INFORME' : ''}`);

const carpetaDe = (federacion) => join(raiz, `descargas-${federacion}`, 'recolector-local');

/*
 * ── LA URL DE CADA JORNADA, CON EL PORTAL DE SU FEDERACIÓN (21/10/2026) ───────────────────────────────────────
 *
 * `urlJornada` construye la dirección con el perfil ACTIVO de la librería, y aquí nadie lo cambiaba: el perfil era
 * siempre el de Castilla y León. Cada fin de semana, las jornadas de Galicia, Aragón, Baleares… se reencolaban
 * con `https://www.rfcylf.es/...&CodCompeticion=<código gallego>` —y `encola` sobrescribe la URL—, así que el
 * worker pedía a la web de CyL competiciones que no son suyas, recibía una página sin partidos y daba la jornada
 * por «hecha» vacía. Medido con `scripts/claude/jornadas-vacias.mjs` (petición 180a): 333 jornadas de Galicia
 * 2026-27 así. Ahora cada federación usa su perfil (`perfiles/<fed>.json`); la de CyL, el de por defecto; y una
 * federación sin perfil PNFG no recibe URL nueva (se conserva la que ya tenía el trabajo).
 */
function perfilDe(federacion) {
  if (federacion === 'federacion') return { nombre: 'cyl' };
  const ruta = join(raiz, 'perfiles', `${federacion}.json`);
  if (!existsSync(ruta)) return null;
  try {
    const p = JSON.parse(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, ''));
    return p?.base ? p : null;
  } catch { return null; }
}
/*
 * ── LAS FEDERACIONES QUE ESTA MÁQUINA NO SE OCUPA ───────────────────────────────────────────────────────
 *
 * `FACYLF_EXCLUIR` es la misma variable que usa el supervisor del PC (`scripts/entorno-flota.ps1`): significa
 * «de estas no me ocupo yo». En el PC evita que dos flotas pidan a la misma federación; aquí, desde el
 * 24/09/2026, dice cuáles se recogen en OTRO equipo.
 *
 * Importa de verdad desde que Valencia, Madrid y Cataluña se recogen en el PC: sin esto, este repaso abriría
 * cada fin de semana las jornadas de esas tres para que alguien las revisara —y ese alguien ya no está en este
 * servidor—, dejando trabajos pendientes en colas que nadie consume y un informe que diría que faltan actas
 * cuando lo que pasa es que las trae otro equipo. Un informe que miente es peor que no tenerlo.
 */
const excluidas = new Set(String(process.env.FACYLF_EXCLUIR ?? '')
  .split(',').map((f) => f.trim()).filter(Boolean));

const federaciones = readdirSync(raiz)
  .filter((n) => n.startsWith('descargas-') && existsSync(join(raiz, n, 'recolector-local', 'cola-v2.sqlite')))
  .filter((n) => !existsSync(join(raiz, n, '.PRUEBA')))     // las colas de prueba no son federaciones
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !federacionesPedidas || federacionesPedidas.includes(f))
  .filter((f) => !excluidas.has(f))
  .sort();

if (excluidas.size) {
  console.log(`   (se dejan fuera ${excluidas.size} federación(es) de otro equipo: ${[...excluidas].sort().join(', ')})`);
}

const resumen = [];
for (const federacion of federaciones) {
  const perfilFed = perfilDe(federacion);
  setPerfil(perfilFed?.base ? { nombre: perfilFed.nombre, base: perfilFed.base, codPrimaria: perfilFed.codPrimaria } : {});
  const urlDeJornada = (j) => (perfilFed ? urlJornada(j.temporada, j.competicion, j.grupo, j.numero) : null);
  const db = new DatabaseSync(join(carpetaDe(federacion), 'cola-v2.sqlite'));
  // Los workers están escribiendo en la misma cola: sin `busy_timeout`, SQLite devuelve «database is locked»
  // y la federación se quedaba sin planificar (pasó el 18/09/2026 con Andalucía y Cantabria, justo las que
  // tenían el fin de semana a medias). Se espera el turno de escritura como hace el propio recolector.
  db.exec('pragma busy_timeout = 60000;');
  if (!soloInforme && federacion === 'cataluna') {
    // Restos de la versión anterior del planificador. Se conservan como descartes explicados (no se
    // borran), pero dejan de competir por turno con el calendario de grupo que los sustituye.
    db.prepare(`update trabajos set estado='cancelado',
      ultimo_error='obsoleto: Cataluña repasa el calendario completo del grupo', siguiente_intento=null,
      actualizado_en=? where tipo='jornada' and estado in ('pendiente','bloqueado','en_curso')`)
      .run(new Date().toISOString());
  }
  const uno = (sql, ...p) => db.prepare(sql).get(...p)?.n ?? 0;

  // Todas las jornadas del fin de semana de CUALQUIER temporada que siga en el plan (la mínima la aplica `encola`).
  const jornadas = db.prepare(`select temporada, competicion, grupo, numero, fecha, comprobada_en, archivo
    from jornadas where fecha >= ? and fecha <= ? order by temporada, competicion, grupo, numero`)
    .all(ventana.desde, ventana.hasta);

  /*
   * ¿Qué se reabre? SÓLO lo que falta. Reabrir el fin de semana entero cada día costaría una vuelta completa
   * de peticiones al portal por un trabajo que ya está hecho, y el ritmo respetuoso no se gasta en eso. Se
   * reabre una jornada cuando:
   *   · no se ha comprobado desde que empezó el fin de semana (nunca, o antes), o
   *   · le falta alguna acta: la jornada se descarga con los resultados, pero el acta puede publicarse dos
   *     días después, así que «hecha» no significa «completa».
   * Una jornada con todas sus actas hechas no se toca.
   */
  const necesitaRepaso = (j) => {
    if (!j.comprobada_en || j.comprobada_en.slice(0, 10) < ventana.desde) return true;
    const faltan = db.prepare(`select count(*) n from actas where temporada=? and competicion=? and grupo=?
      and jornada=? and estado in ('pendiente','sin_datos')`).get(j.temporada, j.competicion, j.grupo, j.numero).n;
    return faltan > 0;
  };

  /*
   * LO QUE FALTA SE CUENTA SIEMPRE, también en `--informe`. Antes sólo se contaba al planificar, así que el
   * informe de un fin de semana por jugar decía «0 por repasar» teniendo 659 jornadas sin comprobar: justo el
   * dato que se mira el lunes. Contar es una consulta por jornada y no escribe nada.
   */
  const porRepasar = jornadas.filter(necesitaRepaso);

  let reabiertas = 0;
  let clasificaciones = 0;
  const planificadas = porRepasar.length;
  let fallo = null;
  if (!soloInforme && jornadas.length) {
    /*
     * SIN TRANSACCIÓN GRANDE, A PROPÓSITO. La primera versión envolvía las veinte o treinta jornadas de una
     * federación en un `begin`/`commit`: mientras esa transacción estaba abierta, el worker de esa federación
     * no podía escribir, y al revés —si el worker estaba reparando actas, que es un trabajo largo— la pasada se
     * quedaba fuera con «database is locked» y esa federación se saltaba entera. Cada escritura de aquí es
     * idempotente y se puede repetir, así que se hacen sueltas: si el worker está escribiendo, se espera por
     * esa escritura (busy_timeout de un minuto) y la pasada sigue adelante.
     */
    try {
      const grupos = new Map();
      for (const j of jornadas) {
        // Cataluña obtiene todas las jornadas del grupo en una sola visita a CALENDARI. Crear un
        // trabajo `jornada` (formato PNFG/iSquad) dejaba basura que su worker no sabe ni necesita
        // procesar. Para FCF se reactiva una sola vez el calendario completo del grupo.
        if (federacion === 'cataluna') {
          const datosGrupo = { temporada: j.temporada, competicion: j.competicion, grupo: j.grupo };
          const idGrupo = `${j.temporada}|${j.competicion}|${j.grupo}`;
          if (!grupos.has(idGrupo) && necesitaRepaso(j)) {
            const claveCalendario = claveTrabajo('calendario', datosGrupo);
            const anterior = db.prepare('select estado,url from trabajos where clave=?').get(claveCalendario);
            encola(db, 'calendario', datosGrupo, 2, anterior?.url ?? null);
            if (anterior?.estado && anterior.estado !== 'pendiente') {
              reactiva(db, claveCalendario, null);
              reabiertas += 1;
            }
            grupos.set(idGrupo, datosGrupo);
          }
          continue;
        }
        const datos = { temporada: j.temporada, competicion: j.competicion, grupo: j.grupo, jornada: j.numero };
        const clave = claveTrabajo('jornada', datos);
        const antes = db.prepare('select estado from trabajos where clave=?').get(clave);
        encola(db, 'jornada', datos, 2, urlDeJornada(j));
        if (necesitaRepaso(j)) {
          if (antes?.estado && antes.estado !== 'pendiente') { reactiva(db, clave, null); reabiertas += 1; }
          grupos.set(`${j.temporada}|${j.competicion}|${j.grupo}`, { temporada: j.temporada, competicion: j.competicion, grupo: j.grupo });
        }
      }
      for (const g of grupos.values()) {
        const clave = claveTrabajo('clasificacion', g);
        const antes = db.prepare('select estado from trabajos where clave=?').get(clave);
        encola(db, 'clasificacion', g, 3, null);
        if (antes && antes.estado !== 'pendiente') { reactiva(db, clave, null); clasificaciones += 1; }
      }
    } catch (error) {
      fallo = error.message;
      console.log(`  ${federacion}: planificación incompleta (${error.message}); lo ya escrito queda en la cola`);
    }
  }

  // Lo que falta: estado de esas jornadas y de sus actas.
  let comprobadas = 0;
  let actasTotales = 0;
  const actasPorEstado = new Map();
  const faltan = [];
  for (const j of jornadas) {
    if (j.comprobada_en && j.comprobada_en.slice(0, 10) >= ventana.desde) comprobadas += 1;
    const actas = db.prepare(`select estado, count(*) n from actas
      where temporada=? and competicion=? and grupo=? and jornada=? group by estado`)
      .all(j.temporada, j.competicion, j.grupo, j.numero);
    let enEstaJornada = 0;
    for (const a of actas) {
      actasTotales += a.n;
      enEstaJornada += a.n;
      actasPorEstado.set(a.estado, (actasPorEstado.get(a.estado) ?? 0) + a.n);
    }
    const pendientes = (actasPorEstado.get('pendiente') ?? 0);
    if (!enEstaJornada || (!j.comprobada_en || j.comprobada_en.slice(0, 10) < ventana.desde)) {
      faltan.push(`${j.temporada}/${j.competicion}/${j.grupo}/J${j.numero}${enEstaJornada ? '' : ' (sin actas encoladas)'}`);
    }
    void pendientes;
  }
  const partidos = uno(`select count(*) n from partidos where (temporada, competicion, grupo, jornada) in
    (select temporada, competicion, grupo, numero from jornadas where fecha >= ? and fecha <= ?)`, ventana.desde, ventana.hasta);
  db.close();

  const fila = {
    federacion,
    jornadasDelFinde: jornadas.length,
    jornadasComprobadas: comprobadas,
    planificadas,
    reabiertas,
    clasificaciones,
    partidos,
    actas: actasTotales,
    actasPorEstado: Object.fromEntries(actasPorEstado),
    faltan: faltan.slice(0, 8),
    fallo,
  };
  resumen.push(fila);

  if (!jornadas.length) { console.log(`  ${federacion.padEnd(20)} sin jornadas en la ventana`); continue; }
  const estados = [...actasPorEstado.entries()].map(([k, v]) => `${k}=${v}`).join(' ') || 'sin actas encoladas';
  console.log(`  ${federacion.padEnd(20)} jornadas ${String(jornadas.length).padStart(3)} · comprobadas ${String(comprobadas).padStart(3)} · faltan por repasar ${String(planificadas).padStart(3)} (reabiertas ${reabiertas}) · partidos ${String(partidos).padStart(4)} · actas ${String(actasTotales).padStart(4)} (${estados})`);
}

/* ── Informe ───────────────────────────────────────────────────────────────────────────────────────── */
const conJornadas = resumen.filter((r) => r.jornadasDelFinde > 0);
const totales = {
  federaciones: conJornadas.length,
  jornadas: conJornadas.reduce((n, r) => n + r.jornadasDelFinde, 0),
  comprobadas: conJornadas.reduce((n, r) => n + r.jornadasComprobadas, 0),
  planificadas: conJornadas.reduce((n, r) => n + r.planificadas, 0),
  reabiertas: conJornadas.reduce((n, r) => n + r.reabiertas, 0),
  partidos: conJornadas.reduce((n, r) => n + r.partidos, 0),
  actas: conJornadas.reduce((n, r) => n + r.actas, 0),
  actasHechas: conJornadas.reduce((n, r) => n + (r.actasPorEstado.hecha ?? 0), 0),
  actasPendientes: conJornadas.reduce((n, r) => n + (r.actasPorEstado.pendiente ?? 0), 0),
};
console.log(`\n  TOTAL: ${totales.federaciones} federaciones con jornadas del finde · ${totales.jornadas} jornadas (${totales.comprobadas} comprobadas) · ${totales.partidos} partidos · ${totales.actas} actas (${totales.actasHechas} hechas, ${totales.actasPendientes} pendientes)${soloInforme ? '' : ` · faltan por repasar ${totales.planificadas} jornadas (${totales.reabiertas} reabiertas ahora)`}`);

const carpetaPruebas = join(raiz, 'pruebas', 'reconstruccion');
mkdirSync(carpetaPruebas, { recursive: true });
const rutaJson = join(carpetaPruebas, `fin-de-semana-${ventana.desde}.json`);
writeFileSync(rutaJson, `${JSON.stringify({ ventana, cuando: new Date().toISOString(), soloInforme, totales, federaciones: resumen }, null, 2)}\n`);

const lineas = [
  `# Ingesta del fin de semana ${ventana.desde} → ${ventana.hasta}`,
  '',
  `Medido: ${new Date().toISOString()}${soloInforme ? ' (sólo informe)' : ''}`,
  '',
  `**${totales.federaciones} federaciones** con jornadas en la ventana · **${totales.jornadas} jornadas** (${totales.comprobadas} comprobadas) · **${totales.partidos} partidos** · **${totales.actas} actas** (${totales.actasHechas} hechas, ${totales.actasPendientes} pendientes)`,
  '',
  '| federación | jornadas | comprobadas | por repasar | partidos | actas | hechas | pendientes | reabiertas |',
  '|---|---|---|---|---|---|---|---|---|',
];
for (const r of resumen) {
  lineas.push(`| ${r.federacion} | ${r.jornadasDelFinde} | ${r.jornadasComprobadas} | ${r.planificadas} | ${r.partidos} | ${r.actas} | ${r.actasPorEstado.hecha ?? 0} | ${r.actasPorEstado.pendiente ?? 0} | ${r.reabiertas} |`);
}
const rutaMd = rutaJson.replace(/\.json$/, '.md');
writeFileSync(rutaMd, `${lineas.join('\n')}\n`);
console.log(`\n  informe: ${rutaJson}\n  legible: ${rutaMd}`);
