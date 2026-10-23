#!/usr/bin/env node
/*
 * REPARA EL CALENDARIO DE UN GRUPO CATALÁN DESDE SUS ACTAS ARCHIVADAS.
 *
 * Por qué. El recolector de Cataluña repetía una jornada en todas las demás (§3.11 de la guía) y esos partidos
 * inventados están en la cola: **1.277 grupos y 170.012 partidos**. Volver a recolectar NO lo arregla, porque
 * la página sólo deja leer una jornada por carga. Lo que sí lo arregla es lo que ya está descargado: el archivo
 * de cada acta guarda su propia verdad —
 *
 *     "equipos": ["BADALONA, C.F.", "MONTAÑESA, C.F."],
 *     "detalles": { "jornada": "2", "fecha": "12.09.2026" },
 *     "marcador": [0, 1], "url": "…/acta/4106677"
 *
 * — así que el calendario de los partidos jugados se reconstruye sin pedir nada a la red y sin inventar nada.
 *
 * ── QUÉ NO HACE, Y ES DELIBERADO ─────────────────────────────────────────────────────────────────────────
 *
 * **No toca los grupos de la temporada EN CURSO.** El recolector los vuelve a leer solo —`preparaRepaso…`
 * reactiva el calendario de los grupos con jornada en los últimos cuatro días, como mucho cada 18 horas— y esa
 * relectura BORRA las filas de las jornadas que no consigue leer, que son todas menos una. Reparar uno de esos
 * grupos sería escribir para que lo borren al día siguiente. Se dice y se salta; cuando la temporada cierre, la
 * herramienta los cogerá sin cambiar nada.
 *
 * Tampoco inventa códigos de equipo: las filas reconstruidas se escriben SIN código, y el importador resuelve
 * los equipos por su nombre dentro del grupo, que es lo que ya hace con los que la fuente no publica con
 * código. Poner un código deducido del nombre sería inventar identidad.
 *
 * ── LA REPARACIÓN NO AGUANTA SOLA: HAY QUE QUITARLE EL TRABAJO AL RECOLECTOR ──────────────────────────────
 *
 * Reparar la cola no basta mientras el recolector siga descargando actas de ese grupo, porque cada descarga
 * reescribe las alineaciones de su jornada y vuelve a dejar las participaciones duplicadas. Medido el
 * 25/09/2026 en el grupo 55458432: reparado a las 22:37 con 921 filas duplicadas fuera, y a las 00:50 la
 * validación falló otra vez («participaciones 1032≠297») porque 52 actas suyas se terminaron de descargar
 * DESPUÉS de la reparación y 148 seguían pendientes.
 *
 * Y quedaban pendientes por el propio defecto: la página de cada jornada devolvía las actas de la jornada 1,
 * así que la cola guardó las mismas 8 actas bajo las 30 jornadas — 240 filas de acta para 16 actas distintas.
 * En toda la cola de Cataluña son 129.604 filas copiadas de 14.460 actas distintas, y de ahí salían los
 * 131.296 «pendientes»: el recolector estaba descargando la misma acta decenas de veces.
 *
 * Por eso la reparación retira también las filas de acta copiadas y CANCELA sus trabajos de descarga, dejando
 * una fila por acta (el código del acta es su identidad). No se pierde ninguna descarga: el archivo se queda y
 * su fila sigue apuntando a él. Lo que desaparece es trabajo inventado — y sin él la reparación ya no se
 * deshace. Además, si el archivo del acta dice una jornada distinta de la de su fila, la fila se recoloca: el
 * archivo es el documento.
 *
 * Uso:
 *   node scripts/repara-calendario-cataluna.mjs               · dice qué haría (no escribe nada)
 *   node scripts/repara-calendario-cataluna.mjs --aplicar     · lo escribe y lo anota
 *   node scripts/repara-calendario-cataluna.mjs --grupo 54322948
 */
import { createRequire } from 'node:module';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLA = join(RAIZ, 'descargas-cataluna', 'recolector-local', 'cola-v2.sqlite');
const IMPOSIBLES = join(RAIZ, 'pruebas', 'reconstruccion', 'calendarios-imposibles.json');
const DIARIO = join(RAIZ, 'pruebas', 'reconstruccion', 'reparaciones-calendario.jsonl');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const aplicar = argumentos.includes('--aplicar');
const grupoSuelto = arg('grupo');
const todasLasTemporadas = argumentos.includes('--todas-las-temporadas');

if (!existsSync(COLA)) { console.error(`No hay cola de Cataluña en ${COLA}`); process.exit(1); }
if (!existsSync(IMPOSIBLES)) {
  console.error('No hay lista de calendarios imposibles: lanza antes `pnpm importar:imposibles`.');
  process.exit(1);
}

const objetivos = grupoSuelto
  ? [{ grupo: grupoSuelto, temporada: null }]
  : JSON.parse(readFileSync(IMPOSIBLES, 'utf8')).lista.filter((d) => d.federacion === 'cataluna');

const db = new DatabaseSync(COLA);
// La cola está viva: el recolector escribe mientras esto borra. Sin espera, un bloqueo momentáneo aborta el
// grupo; con ella, el borrado espera su turno. No cambia nada del recolector: sólo no le quita el turno.
db.exec('pragma busy_timeout = 10000');
const temporadaEnCurso = String(db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c ?? '');
const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [t.codigo, t.etiqueta]));

/** Abre el archivo de un acta: la cola guarda la ruta sin `.gz`, y el fichero está comprimido. */
function leeArchivo(ruta) {
  for (const candidata of [ruta, `${ruta}.gz`]) {
    if (!existsSync(candidata)) continue;
    try {
      const bytes = readFileSync(candidata);
      const texto = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
      return JSON.parse(texto);
    } catch { return null; }
  }
  return null;
}

/** La fecha del archivo viene como `12.09.2026`; la cola la guarda como `AAAA-MM-DD`. */
function fechaIso(texto) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(texto ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * De las filas de acta de un grupo, cuáles son copias del defecto y hay que retirar, y cuál se queda.
 *
 * El código del acta es su identidad, así que dos filas con el mismo código son la misma acta. Se conserva
 * una: la de la jornada que dice el propio archivo del acta (`recuperadas`), y si el acta no se pudo leer,
 * la más temprana —que es la que el defecto no copió, porque copiaba la primera jornada hacia abajo—.
 */
function filasDeActaCopiadas(filas, recuperadas) {
  const porCodigo = new Map();
  for (const fila of filas) {
    if (!porCodigo.has(fila.codigo)) porCodigo.set(fila.codigo, []);
    porCodigo.get(fila.codigo).push(fila);
  }
  const sobran = [];
  const elegidas = [];
  for (const [codigo, candidatas] of porCodigo) {
    const jornadaVerdadera = recuperadas.get(codigo)?.jornada ?? null;
    const elegida = candidatas.find((c) => c.jornada === jornadaVerdadera)
      ?? [...candidatas].sort((a, b) => a.jornada - b.jornada)[0];
    elegidas.push({ fila: elegida, jornadaVerdadera });
    for (const candidata of candidatas) if (candidata !== elegida) sobran.push(candidata);
  }
  return { sobran, elegidas };
}

/** La clave de un trabajo de acta, tal y como la compone `claveTrabajo` del recolector. */
const claveDeActa = (fila) => ['acta', fila.temporada, fila.competicion, fila.grupo, fila.jornada, fila.codigo].join('|');

/** Borra una fila de acta por su clave natural, que es la primaria de la tabla. */
const borraActaCopiada = db.prepare(`delete from actas
  where temporada = ? and competicion = ? and grupo = ? and jornada = ? and codigo = ?`);

/*
 * El trabajo encolado de una copia TAMBIÉN sobra, y es lo que de verdad importa: mientras siga pendiente, el
 * recolector descargará otra vez la misma acta y reescribirá las alineaciones de esa jornada. Se marca
 * `cancelado` —un estado que el recolector ya usa— en vez de borrarlo, para que quede el rastro de que el
 * defecto encoló ese trabajo. `encola` no revive un trabajo cancelado: sólo refresca url y prioridad.
 */
const cancelaTrabajoDeActa = db.prepare(`update trabajos set estado = 'cancelado', ultimo_error = ?, actualizado_en = ?
  where clave = ? and estado <> 'hecho'`);
const mueveTrabajoDeActa = db.prepare('update trabajos set clave = ?, jornada = ?, actualizado_en = ? where clave = ?');

/**
 * Retira las copias de acta de un grupo y cancela sus trabajos. Devuelve lo que hizo, para poder contarlo.
 * Es idempotente: si ya está hecho, no encuentra copias y no hace nada.
 */
function podaActasCopiadas(filas, recuperadas, instante) {
  const { sobran, elegidas } = filasDeActaCopiadas(filas, recuperadas);
  const motivo = 'el código de acta ya está en la cola en su jornada: esta fila la copió el defecto de la '
    + 'jornada repetida (v. repara-calendario-cataluna.mjs)';
  let trabajosCancelados = 0;
  for (const copia of sobran) {
    borraActaCopiada.run(copia.temporada, copia.competicion, copia.grupo, copia.jornada, copia.codigo);
    trabajosCancelados += cancelaTrabajoDeActa.run(motivo, instante, claveDeActa(copia)).changes ?? 0;
  }
  /*
   * Y si el archivo del acta dice una jornada distinta de la que dice su fila, la fila se mueve: el archivo es
   * el documento. Sólo se mueve cuando la jornada se conoce (el acta se pudo leer) y el destino está libre
   * —lo está, porque las copias acaban de irse—.
   */
  let filasRecolocadas = 0;
  for (const { fila, jornadaVerdadera } of elegidas) {
    if (jornadaVerdadera === null || fila.jornada === jornadaVerdadera) continue;
    try {
      db.prepare(`update actas set jornada = ? where temporada = ? and competicion = ? and grupo = ? and jornada = ? and codigo = ?`)
        .run(jornadaVerdadera, fila.temporada, fila.competicion, fila.grupo, fila.jornada, fila.codigo);
      mueveTrabajoDeActa.run(
        claveDeActa({ ...fila, jornada: jornadaVerdadera }), jornadaVerdadera, instante, claveDeActa(fila),
      );
      filasRecolocadas += 1;
    } catch (error) {
      console.error(`  ⚠ g${fila.grupo} acta ${fila.codigo}: no se pudo recolocar a la jornada ${jornadaVerdadera} (${error.message})`);
    }
  }
  return { copiasRetiradas: sobran.length, trabajosCancelados, filasRecolocadas };
}

const resumen = [];
for (const objetivo of objetivos) {
  const grupo = objetivo.grupo;
  // `grupo` va en el select aunque ya lo sepamos: la poda borra y cancela por clave natural completa, y sin
  // esta columna las claves salían con un `undefined` que SQLite no puede enlazar (y el grupo entero se caía).
  const filas = db.prepare('select temporada, competicion, grupo, jornada, codigo, archivo, estado from actas where grupo = ?').all(grupo);
  if (filas.length === 0) { resumen.push({ grupo, accion: 'sin-actas', recuperados: 0 }); continue; }
  const temporada = filas[0].temporada;
  const etiqueta = etiquetas.get(temporada) ?? temporada;

  if (!todasLasTemporadas && temporada === temporadaEnCurso) {
    resumen.push({ grupo, temporada: etiqueta, accion: 'temporada-en-curso', recuperados: 0 });
    continue;
  }

  // Una fila por acta recuperada. Si el mismo código aparece en varias jornadas, manda la del archivo.
  /*
   * ── LA JORNADA: LA QUE DECLARA EL ACTA, O LA QUE DICEN LAS FECHAS DEL GRUPO ───────────────────────────
   *
   * La cabecera del acta trae `detalles.jornada` y con eso el acta se coloca sola. Pero medido el
   * 25/09/2026, las actas que el recolector estaba bajando entonces (grupo 55377511) traen
   * `detalles.jornada: null`: sin jornada, el reparador las descartaba TODAS y el grupo se quedaba sin
   * reparar para siempre. El acta sí trae su fecha —23 y 24 de mayo de 2026— y la cola tiene la fecha de
   * cada jornada del grupo (la J30 es del 23 de mayo), así que se sitúa por la fecha más cercana, con tres
   * días de tolerancia porque el partido se juega el fin de semana de la jornada.
   *
   * Si no hay ninguna jornada a menos de tres días, NO se adivina: el acta se descarta y se cuenta.
   */
  const fechasDeJornada = db.prepare('select numero, fecha from jornadas where grupo = ? and fecha is not null')
    .all(grupo).map((j) => ({ numero: Number(j.numero), fecha: String(j.fecha) }));
  const jornadaPorFecha = (fechaDelActa) => {
    if (!fechaDelActa) return null;
    const dias = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
    const candidatas = fechasDeJornada.filter((j) => dias(j.fecha, fechaDelActa) <= 3);
    return candidatas.length === 1 ? candidatas[0].numero : null;
  };

  const recuperadas = new Map();
  for (const fila of filas) {
    if (fila.estado !== 'hecha' || !fila.archivo) continue;
    const datos = leeArchivo(fila.archivo);
    if (!datos) continue;
    const m = /\/acta\/(\d+)/.exec(String(datos.url ?? ''));
    const codigo = m ? m[1] : null;
    const [local, visitante] = Array.isArray(datos.equipos) ? datos.equipos : [null, null];
    const fecha = fechaIso(datos.detalles?.fecha);
    const declarada = Number(datos.detalles?.jornada ?? 0);
    const jornada = declarada > 0 ? declarada : jornadaPorFecha(fecha);
    if (!codigo || !local || !visitante || !jornada) continue;
    recuperadas.set(codigo, {
      codigo, jornada, local, visitante, fecha,
      hora: String(datos.detalles?.hora ?? '').replace(/[^\d:]/g, '') || null,
      golesLocal: Array.isArray(datos.marcador) ? datos.marcador[0] : null,
      golesVisitante: Array.isArray(datos.marcador) ? datos.marcador[1] : null,
    });
  }
  if (recuperadas.size === 0) {
    /*
     * No se puede reconstruir el calendario (ninguna acta legible), pero las filas de acta copiadas sobran
     * igual: cada acta se sigue descargando una vez —su fila se queda— y desaparecen las repeticiones que
     * estaban gastando el ritmo del recolector. Se retiran aunque el grupo no se pueda reparar todavía.
     */
    const { sobran } = filasDeActaCopiadas(filas, recuperadas);
    let poda = { trabajosCancelados: 0, filasRecolocadas: 0 };
    if (aplicar && sobran.length > 0) {
      db.exec('begin');
      try {
        poda = podaActasCopiadas(filas, recuperadas, new Date().toISOString());
        db.exec('commit');
      } catch (error) {
        db.exec('rollback');
        console.error(`  ✗ g${grupo}: no se pudieron retirar las filas de acta copiadas (${error.message})`);
      }
    }
    resumen.push({ grupo, temporada: etiqueta, accion: 'sin-actas-legibles', recuperados: 0,
      filasDeActaCopiadasRetiradas: sobran.length, ...poda });
    continue;
  }

  const antes = db.prepare('select count(*) n from partidos where grupo = ?').get(grupo).n;
  // La competición sale de las filas que hay; el borrado se acota a (temporada, competición, grupo) aunque hoy
  // no haya ningún código de grupo repetido entre temporadas: si algún día lo hay, borrar por `grupo` a secas
  // se llevaría por delante los partidos de la otra.
  const deLaCola = db.prepare('select competicion from partidos where temporada = ? and grupo = ? limit 1').get(temporada, grupo);
  const competicion = deLaCola?.competicion ?? filas[0].competicion;
  const plan = [...recuperadas.values()].sort((a, b) => a.jornada - b.jornada || a.codigo.localeCompare(b.codigo));

  // Qué filas de acta sobran, calculado ANTES de tocar nada: así la simulación también lo dice.
  const { sobran } = filasDeActaCopiadas(filas, recuperadas);
  const anotacion = { cuando: new Date().toISOString(), grupo, temporada: etiqueta, accion: aplicar ? 'reparado' : 'simulado',
    partidosAntes: antes, partidosDespues: plan.length, filasDeActaCopiadasRetiradas: sobran.length };
  resumen.push({ ...anotacion, recuperados: plan.length });

  if (!aplicar) continue;

  db.exec('begin');
  try {
    /*
     * ── EL `orden` NO SE REPARTE DE NUEVO: SIGUE AL ACTA ──────────────────────────────────────────────
     *
     * El canónico identifica un partido por (grupo, jornada, orden), así que repartir los órdenes de 0 en
     * adelante en cada reparación hace que la identidad de los partidos BAILES: si entre dos reparaciones
     * entra un acta nueva en una jornada, todas las siguientes cambian de número, y el partido que antes era
     * el 3 pasa a ser el 4. El canónico guarda entonces el partido del acta A con los jugadores del acta B y
     * las apariciones viejas se quedan colgadas: medido el 25/09/2026, 23 grupos fallaron con
     * «participaciones 213≠426» —exactamente el doble— al reimportarlos.
     *
     * Se conserva el `orden` que el acta YA tenía en la cola (su código es la identidad del partido) y sólo
     * se reparte uno nuevo a las actas que no estaban. Así reparar dos veces deja el mismo calendario, y una
     * reimportación actualiza en vez de duplicar.
     */
    const ordenPrevioPorActa = new Map(
      db.prepare(`select codigo_acta, min(orden) orden from partidos
        where temporada = ? and competicion = ? and grupo = ? and codigo_acta is not null
        group by codigo_acta`).all(temporada, competicion, grupo).map((f) => [f.codigo_acta, Number(f.orden)]),
    );
    db.prepare('delete from partidos where temporada = ? and competicion = ? and grupo = ?').run(temporada, competicion, grupo);
    const inserta = db.prepare(`insert into partidos(temporada, competicion, grupo, jornada, orden, codigo_acta,
        equipo_local_codigo, equipo_visitante_codigo, local, visitante, goles_local, goles_visitante, fecha, hora,
        actualizado_en) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    /** Órdenes ya usados en cada jornada, para no repetir ninguno dentro de la misma. */
    const usadosPorJornada = new Map();
    const reserva = (jornada, orden) => {
      const usados = usadosPorJornada.get(jornada) ?? new Set();
      usadosPorJornada.set(jornada, usados);
      if (usados.has(orden)) return false;
      usados.add(orden);
      return true;
    };
    const siguienteLibre = (jornada) => {
      let orden = 0;
      while (!reserva(jornada, orden)) orden += 1;
      return orden;
    };
    for (const p of plan) {
      const previo = ordenPrevioPorActa.get(p.codigo);
      const orden = previo !== undefined && reserva(p.jornada, previo) ? previo : siguienteLibre(p.jornada);
      inserta.run(temporada, competicion, grupo, p.jornada, orden, p.codigo,
        null, null, p.local, p.visitante, p.golesLocal, p.golesVisitante, p.fecha, p.hora, new Date().toISOString());
    }
    anotacion.ordenesConservados = plan.filter((p) => ordenPrevioPorActa.has(p.codigo)).length;
    // La fila de la jornada, para que el importador la vea aunque el recolector no la hubiera escrito.
    const dias = new Map(plan.map((p) => [p.jornada, p.fecha]));
    const insertaJornada = db.prepare(`insert into jornadas(temporada, competicion, grupo, numero, fecha, archivo, hash, comprobada_en)
      values(?,?,?,?,?,?,?,?) on conflict(temporada, competicion, grupo, numero) do update set fecha = coalesce(excluded.fecha, jornadas.fecha)`);
    for (const [jornada, fecha] of dias) {
      insertaJornada.run(temporada, competicion, grupo, jornada, fecha, null, null, new Date().toISOString());
    }

    /*
     * ── Y LAS PARTICIPACIONES DUPLICADAS TAMBIÉN SE VAN ─────────────────────────────────────────────
     *
     * El defecto de copia no estaba sólo en `partidos`: la misma acta se guardó bajo las 34 jornadas, así que
     * sus alineaciones quedaron escritas 34 veces en `participaciones` (y sus goles y su cuerpo técnico, en
     * `eventos_acta` y `tecnicos_acta`). Medido el 24/09/2026 en el grupo 54322948: **11.832 participaciones**
     * donde hay 348, y por eso el lote no cuadraba («participaciones 11832≠348»).
     *
     * Se conservan las filas cuya pareja (jornada, acta) sobrevive en el calendario reparado, y se van las
     * demás. Es la misma regla que usa el importador para decidir qué está enlazado, así que origen y destino
     * vuelven a hablar de lo mismo.
     */
    let retiradas = 0;
    for (const tabla of ['participaciones', 'eventos_acta', 'tecnicos_acta']) {
      const antes = db.prepare(`select count(*) n from ${tabla} where temporada = ? and competicion = ? and grupo = ?`)
        .get(temporada, competicion, grupo).n;
      db.prepare(`delete from ${tabla}
        where temporada = ? and competicion = ? and grupo = ?
          and not exists (select 1 from partidos p
                 where p.temporada = ${tabla}.temporada and p.competicion = ${tabla}.competicion
                   and p.grupo = ${tabla}.grupo and p.jornada = ${tabla}.jornada
                   and p.codigo_acta = ${tabla}.acta)`)
        .run(temporada, competicion, grupo);
      const despues = db.prepare(`select count(*) n from ${tabla} where temporada = ? and competicion = ? and grupo = ?`)
        .get(temporada, competicion, grupo).n;
      retiradas += antes - despues;
    }
    anotacion.filasDuplicadasRetiradas = retiradas;

    /*
     * ── Y LAS FILAS DE ACTA COPIADAS, TAMBIÉN: SI NO, VUELVEN ──────────────────────────────────────
     *
     * Medido el 25/09/2026 en el grupo 55458432: se reparó a las 22:37 (921 filas duplicadas fuera) y a
     * las 00:50 la validación volvió a fallar con «participaciones 1032≠297». La causa no era el reparador:
     * era que el recolector SEGUÍA descargando actas de ese grupo —52 actas terminadas después de la
     * reparación, 148 aún pendientes— y cada descarga reescribe las participaciones de su jornada.
     *
     * El motivo de que quedaran 148 pendientes es el propio defecto: la página de cada jornada devolvía las
     * actas de la jornada 1, así que la cola guardó las mismas 8 actas bajo las 30 jornadas. Ese grupo tiene
     * **240 filas de acta para 16 actas distintas**: 224 copias. En toda la cola de Cataluña son **129.604
     * filas copiadas de 14.460 actas distintas**, y por eso el recolector tenía 131.296 «pendientes»: estaba
     * descargando la misma acta decenas de veces, y cada una reescribía alineaciones ya escritas.
     *
     * `codigo` es el número del acta, así que dos filas con el mismo código son la misma acta: se conserva
     * UNA (la de la jornada que dice el propio archivo del acta; si no se pudo leer, la más temprana, que es
     * la que el defecto no copió) y se retiran las demás. No se pierde ninguna descarga: el archivo se queda
     * donde está y su fila sigue apuntando a él. Lo que se retira es trabajo inventado.
     */
    const poda = podaActasCopiadas(filas, recuperadas, new Date().toISOString());
    anotacion.filasDeActaCopiadasRetiradas = poda.copiasRetiradas;
    anotacion.trabajosDeActaCopiadosCancelados = poda.trabajosCancelados;
    anotacion.filasDeActaRecolocadas = poda.filasRecolocadas;
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    console.error(`  ✗ g${grupo}: no se pudo reparar (${error.message})`);
    resumen.pop();
    resumen.push({ grupo, temporada: etiqueta, accion: 'error', recuperados: 0, motivo: error.message });
    continue;
  }
  appendFileSync(DIARIO, `${JSON.stringify(anotacion)}\n`, 'utf8');
}
db.close();

const cuenta = (accion) => resumen.filter((r) => r.accion === accion).length;
const reparables = resumen.filter((r) => r.recuperados > 0);
console.log(`${aplicar ? 'REPARACIÓN' : 'SIMULACIÓN'} sobre ${resumen.length} grupos con calendario imposible`);
console.log(`  ${reparables.length} grupos reparables · ${reparables.reduce((n, r) => n + r.recuperados, 0)} partidos de verdad`);
console.log(`  ${cuenta('temporada-en-curso')} se saltan por ser de la temporada EN CURSO (el recolector los relee y borraría la reparación)`);
console.log(`  ${cuenta('sin-actas-legibles')} no tienen ninguna acta legible · ${cuenta('sin-actas')} no tienen actas · ${cuenta('error')} con error`);
const copiasRetiradas = resumen.reduce((n, r) => n + (r.filasDeActaCopiadasRetiradas ?? 0), 0);
const trabajosCancelados = resumen.reduce((n, r) => n + (r.trabajosCancelados ?? 0), 0);
const filasRecolocadas = resumen.reduce((n, r) => n + (r.filasRecolocadas ?? 0), 0);
if (copiasRetiradas > 0) {
  console.log(`  ${copiasRetiradas} fila(s) de acta COPIADAS ${aplicar ? 'retiradas' : 'a retirar'}: `
    + 'el recolector ya no descargará la misma acta varias veces');
}
if (trabajosCancelados > 0) console.log(`  ${trabajosCancelados} trabajo(s) de descarga repetidos cancelados`);
if (filasRecolocadas > 0) console.log(`  ${filasRecolocadas} acta(s) recolocadas en la jornada que dice su propio archivo`);
console.log('');
for (const r of reparables.sort((a, b) => b.recuperados - a.recuperados).slice(0, 12)) {
  console.log(`  g${String(r.grupo).padEnd(10)} ${r.temporada} · ${String(r.partidosAntes).padStart(4)} partidos inventados → `
    + `${String(r.recuperados).padStart(3)} de verdad`);
}
if (aplicar && reparables.length) {
  console.log(`\n  anotado en pruebas/reconstruccion/reparaciones-calendario.jsonl`);
  console.log('  ahora se importan esos grupos:');
  const temporadas = [...new Set(reparables.map((r) => r.temporada))];
  for (const t of temporadas) {
    console.log(`      pnpm importar --federacion cataluna --temporada ${t} --grupo <cada uno>`);
  }
} else if (!aplicar) {
  console.log('\n  (simulación: no se ha escrito nada; añade --aplicar para hacerlo)');
}
