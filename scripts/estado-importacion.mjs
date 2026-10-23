#!/usr/bin/env node
/*
 * EL PARTE COMPLETO DE LA IMPORTACIÓN: cuánto hay, cuánto ha entrado, cuánto falta y por qué.
 *
 * Las tres preguntas del encargo —«¿cuánto es todo?», «¿qué ha entrado?», «¿qué falla y por qué?»— estaban
 * repartidas en tres herramientas (`importar:inventario`, `importar:resumen`, `importar:todo --plan`), y esa
 * división tiene un problema: **ninguna de las tres compara la cola con el canónico**. Saber que hay 28.386
 * grupos en las colas y que se han intentado 3.462 no dice cuántos están DENTRO; y eso es exactamente lo que
 * hace falta saber para que una consulta no se apoye en una base incompleta sin saberlo.
 *
 * Esto lo responde de una vez, con tres fuentes que no se pisan:
 *   · las COLAS (SQLite, una por federación) dicen cuántos grupos tienen datos, por federación y temporada;
 *   · el CANÓNICO (PostgreSQL) dice cuáles están dentro de verdad, con sus partidos, actas y apariciones;
 *   · el REGISTRO (jsonl) dice cuáles se intentaron y por qué fallaron, contando el ÚLTIMO intento de cada
 *     grupo y no todos (un grupo que falló y luego entró no es un fallo).
 *
 * Es de SÓLO LECTURA y no le pesa a la carga: abre las colas en modo lectura y hace tres consultas agregadas.
 *
 * Uso:
 *   node scripts/estado-importacion.mjs              · el parte, y el JSON completo
 *   node scripts/estado-importacion.mjs --federacion cataluna
 *   node scripts/estado-importacion.mjs --json       · sólo el JSON, para encadenarlo con otra cosa
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
// `pg` vive en el paquete canónico, no en la raíz: se resuelve desde su `package.json`, que es lo que hace
// también `scripts/informe-equipo.mjs`. Un `require('pg')` a secas desde `scripts/` no encuentra el módulo.
const { Client } = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'canonico', 'package.json'))('pg');

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRO = join(RAIZ, 'pruebas', 'reconstruccion', 'importacion-todo.jsonl');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'estado-importacion.json');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const soloJson = argumentos.includes('--json');
const filtroFederacion = arg('federacion');

const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* sin .env no se puede preguntar al canónico */ }
}

/* ── 1. Las colas: qué hay recolectado, por federación y temporada ───────────────────────────────────── */

/** Las colas de verdad: una por federación, con la carpeta excepcional de Castilla y León. */
function colas() {
  const salida = [];
  for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
    const carpeta = entrada.name;
    if (carpeta === 'descargas-federacion-sondeo' || carpeta === 'descargas-prueba-10gb') continue;
    const ruta = join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta)) continue;
    if (existsSync(join(RAIZ, carpeta, '.PRUEBA'))) continue;   // las colas de prueba no son federaciones
    const federacion = carpeta === 'descargas-federacion' ? 'castilla-leon' : carpeta.replace('descargas-', '');
    salida.push({ federacion, ruta });
  }
  return salida.sort((a, b) => a.federacion.localeCompare(b.federacion, 'es'));
}

/*
 * El criterio de «grupo con datos» es EXACTAMENTE el del importador (`gruposConDatos`): tiene alguna jornada
 * o algún partido. Si aquí se contara de otra forma, la resta «cola − canónico» no significaría nada.
 *
 * ── Y SE GUARDAN LOS CÓDIGOS, NO SÓLO EL RECUENTO (medido el 25/09/2026) ──────────────────────────────────
 *
 * Antes sólo se contaban grupos por federación y temporada, y los pendientes salían de RESTAR dos totales
 * (`enCola − enCanonico`). Esa resta esconde huecos: si el canónico tiene más grupos que la cola en esa
 * combinación —porque la cola cambió, o porque un grupo entró con otro código—, la diferencia sale cero y
 * los que faltan de verdad no aparecen. Ahora se comparan las CLAVES, grupo a grupo.
 */
const enLaCola = new Map();
const clavesDeLaCola = new Map();
/** Grupos que la cola CONOCE (estén recolectados o no), por federación y temporada. */
const sinDatosEnLaCola = new Map();
/** federación → estado de acta → cuántas. Los estados que no son trabajo pendiente se explican al imprimir. */
const actasPorEstado = new Map();
for (const cola of colas()) {
  if (filtroFederacion && cola.federacion !== filtroFederacion) continue;
  let db;
  try {
    db = new DatabaseSync(cola.ruta, { readOnly: true });
    /*
     * Los grupos que la cola conoce pero NO tiene datos suyos: ni jornadas ni partidos. No son un fallo de
     * importación —no hay nada que importar— pero sí son el techo de lo que se puede llegar a importar, y sin
     * contarlos el parte parece que la cola tiene 29.160 grupos cuando conoce 84.241.
     */
    const sinDatos = db.prepare(`
      select t.etiqueta as temporada, count(*) as n
        from grupos g
        join temporadas t on t.codigo = g.temporada
       where not exists (select 1 from jornadas j
               where j.temporada = g.temporada and j.competicion = g.competicion and j.grupo = g.codigo)
         and not exists (select 1 from partidos p
               where p.temporada = g.temporada and p.competicion = g.competicion and p.grupo = g.codigo)
       group by t.etiqueta`).all();
    for (const f of sinDatos) {
      sinDatosEnLaCola.set(`${cola.federacion}|${f.temporada}`, Number(f.n));
    }
    const filas = db.prepare(`
      select t.etiqueta as temporada, g.temporada as codigo, count(*) as grupos,
             sum(exists (select 1 from actas a where a.temporada = g.temporada
                   and a.competicion = g.competicion and a.grupo = g.codigo and a.estado = 'hecha')) as con_actas
        from grupos g
        join temporadas t on t.codigo = g.temporada
       where exists (select 1 from jornadas j
               where j.temporada = g.temporada and j.competicion = g.competicion and j.grupo = g.codigo)
          or exists (select 1 from partidos p
               where p.temporada = g.temporada and p.competicion = g.competicion and p.grupo = g.codigo)
       group by t.etiqueta, g.temporada order by t.etiqueta`).all();
    const suyos = db.prepare(`
      select t.etiqueta as temporada, g.codigo as grupo
        from grupos g
        join temporadas t on t.codigo = g.temporada
       where exists (select 1 from jornadas j
               where j.temporada = g.temporada and j.competicion = g.competicion and j.grupo = g.codigo)
          or exists (select 1 from partidos p
               where p.temporada = g.temporada and p.competicion = g.competicion and p.grupo = g.codigo)`).all();
    for (const f of suyos) {
      const clave = `${cola.federacion}|${f.temporada}`;
      const lista = clavesDeLaCola.get(clave) ?? [];
      lista.push(String(f.grupo));
      clavesDeLaCola.set(clave, lista);
    }
    for (const f of filas) {
      enLaCola.set(`${cola.federacion}|${f.temporada}`, { federacion: cola.federacion, temporada: f.temporada,
        grupos: Number(f.grupos), conActas: Number(f.con_actas) });
    }
    /*
     * ── LAS ACTAS DE LA COLA POR ESTADO: LA DIFERENCIA ENTRE «FALTA» Y «NO SE VA A RECOGER» ──────────────
     *
     * El importador sólo importa las actas `hecha`, y eso es correcto. Pero el número de actas que hay en la
     * cola no es el número de actas que se pueden llegar a importar: hay cuatro estados que NO son trabajo
     * pendiente, y sin separarlos cualquier consulta sobre una categoría concreta no puede saber si el hueco
     * es temporal o definitivo.
     *
     *   hecha              · descargada y analizada: es lo único importable
     *   pendiente          · dentro del alcance y sin descargar: trabajo pendiente de verdad
     *   pendiente_ambito   · FUERA del alcance por decisión de configuración (p. ej. actas de menores, que no
     *                        se recogen a propósito): no se descargará nunca mientras siga así
     *   pendiente_permiso  · falta el permiso de la federación para ese alcance
     *   sin_datos          · la federación publica la ficha pero vacía (sin alineaciones ni cuerpo técnico)
     *   ausente_web        · la federación la retiró de su web
     *
     * Medido el 25/09/2026: de las actas que la cola conoce, la mayoría NO son trabajo pendiente.
     */
    const estados = db.prepare('select estado, count(*) as n from actas group by estado').all();
    for (const e of estados) {
      const suyo = actasPorEstado.get(cola.federacion) ?? {};
      suyo[e.estado] = Number(e.n);
      actasPorEstado.set(cola.federacion, suyo);
    }
  } catch (error) {
    console.error(`  ${cola.federacion}: no se pudo leer la cola (${error.message})`);
  } finally {
    db?.close();
  }
}

/* ── 2. El canónico: qué está dentro de verdad ───────────────────────────────────────────────────────── */

/**
 * Un grupo cuenta como importado si tiene `phase_group` con `codigo_externo`. Se agrupa por federación y
 * temporada, que es como se pregunta luego por una consulta concreta.
 */
async function enElCanonico(federacion = null) {
  const url = (process.env.DATABASE_URL_LECTOR ?? '').trim();
  if (url === '') {
    console.error('  Sin DATABASE_URL_LECTOR no se puede comparar con el canónico: sólo se cuenta la cola.');
    return { porClave: new Map(), personas: null, dentro: new Set(), tablaOficial: new Map() };
  }
  const cliente = new Client({ connectionString: url, statement_timeout: 120_000 });
  await cliente.connect();
  try {
    // El filtro va a la consulta, no al resultado: si se filtrara después, las cifras del canónico seguirían
    // siendo las de todo el país y el porcentaje de cobertura saldría absurdo (3.852 % el 24/09/2026).
    const { rows } = await cliente.query(`
      select f.codigo as federacion, s.etiqueta as temporada, count(distinct pg.id) as grupos,
             count(distinct m.id) as partidos,
             count(distinct r.match_id) as actas,
             count(distinct a.id) as apariciones,
             count(distinct a.person_id) as personas
        from core.phase_group pg
        join core.competition_edition ce on ce.id = pg.competition_edition_id
        join core.federation f on f.id = ce.federation_id
        join core.season s on s.id = ce.season_id
        left join core.match m on m.phase_group_id = pg.id
        left join core.match_report r on r.match_id = m.id
        left join core.appearance a on a.match_id = m.id
       where pg.codigo_externo is not null
         and ($1::text is null or f.codigo = $1)
       group by 1, 2`, [federacion]);
    const porClave = new Map();
    for (const r of rows) {
      porClave.set(`${r.federacion}|${r.temporada}`, { grupos: Number(r.grupos), partidos: Number(r.partidos),
        actas: Number(r.actas), apariciones: Number(r.apariciones), personas: Number(r.personas) });
    }
    /*
     * Las personas NO se suman por federación ni por temporada: una persona aparece en varias (juega dos
     * temporadas, o cambia de equipo) y sumarlas daría una cifra inflada que no es «cuántas personas hay».
     * Se cuenta la tabla entera, que es lo que se quiere saber.
     */
    /*
     * Y las CLAVES de los grupos que están dentro, una a una. Hace falta para no llamar «fallido» a un grupo
     * que ya entró: el registro sólo sabe de los intentos que hizo el importador masivo, y una importación
     * suelta (`pnpm importar --grupo N`) no pasa por él. Medido el 25/09/2026: el parte decía 849 fallidos
     * cuando muchos de ellos ya estaban importados y validados.
     */
    const { rows: claves } = await cliente.query(`
      select f.codigo as federacion, s.etiqueta as temporada, pg.codigo_externo as grupo
        from core.phase_group pg
        join core.competition_edition ce on ce.id = pg.competition_edition_id
        join core.federation f on f.id = ce.federation_id
        join core.season s on s.id = ce.season_id
       where pg.codigo_externo is not null
         and ($1::text is null or f.codigo = $1)`, [federacion]);
    const dentro = new Set(claves.map((c) => `${c.federacion}|${c.temporada}|${c.grupo}`));

    const { rows: total } = await cliente.query(
      `select count(distinct p.id) n from core.person p
         join core.person_source_identity psi on psi.person_id = p.id
         join core.federation f on f.id = psi.federation_id
        where $1::text is null or f.codigo = $1`, [federacion]);
    /*
     * ── Y LA TABLA OFICIAL DE CADA GRUPO, QUE ES OTRA FAMILIA DE «RECOLECTADO Y SIN IMPORTAR» ─────────────
     *
     * Un grupo puede estar dentro con sus partidos, sus actas y sus jugadores, y NO tener la clasificación
     * que publicó la federación, porque se archivó después de importarlo. Ese hueco no lo veía nadie: la
     * ausencia de tabla oficial parecía «la federación no la publica».
     *
     * `ops.coverage_checkpoint.tabla_oficial_estado` (migración 0019) distingue los cuatro estados, y el
     * cuarto —`null`, es decir «hay archivo legible y no está importado»— es trabajo pendiente de importación.
     * Medido el 25/09/2026: 7.980 grupos, que es el 28 % del canónico.
     */
    const { rows: oficiales } = await cliente.query(`
      select f.codigo as federacion, s.etiqueta as temporada,
             count(*) filter (where cc.tabla_oficial_estado = 'importada') as importada,
             count(*) filter (where cc.tabla_oficial_estado = 'rechazada') as rechazada,
             count(*) filter (where cc.tabla_oficial_estado = 'sin_archivar') as sin_archivar,
             count(*) filter (where cc.tabla_oficial_estado = 'sin_filas') as sin_filas,
             count(*) filter (where cc.tabla_oficial_estado = 'ilegible') as ilegible,
             count(*) filter (where cc.tabla_oficial_estado = 'sin_corte') as sin_corte,
             count(*) filter (where cc.tabla_oficial_estado is null) as sin_importar
        from ops.coverage_checkpoint cc
        join core.phase_group pg on pg.id = cc.phase_group_id
        join core.competition_edition ce on ce.id = pg.competition_edition_id
        join core.federation f on f.id = ce.federation_id
        join core.season s on s.id = ce.season_id
       where pg.codigo_externo is not null
         and ($1::text is null or f.codigo = $1)
       group by 1, 2`, [federacion]);
    const tablaOficial = new Map();
    for (const r of oficiales) {
      tablaOficial.set(`${r.federacion}|${r.temporada}`, {
        importada: Number(r.importada), rechazada: Number(r.rechazada),
        sinArchivar: Number(r.sin_archivar), sinFilas: Number(r.sin_filas),
        ilegible: Number(r.ilegible), sinCorte: Number(r.sin_corte), sinImportar: Number(r.sin_importar),
      });
    }
    return { porClave, personas: Number(total[0].n), dentro, tablaOficial };
  } finally {
    await cliente.end();
  }
}

/* ── 3. El registro: qué se intentó y por qué falló ──────────────────────────────────────────────────── */

/** Un motivo se agrupa por su principio, quitando números y rutas: «actas analizadas N≠N». */
const familia = (motivo) => String(motivo)
  .replace(/[A-Z]:\\[^\s]+/g, '<ruta>')
  .replace(/\d+/g, 'N')
  .slice(0, 95)
  .trim();

function delRegistro(dentro = new Set()) {
  const ultimoPorGrupo = new Map();
  let intentos = 0;
  if (existsSync(REGISTRO)) {
    for (const linea of readFileSync(REGISTRO, 'utf8').split('\n')) {
      if (linea.trim() === '') continue;
      let r;
      try { r = JSON.parse(linea); } catch { continue; }   // una línea a medias de un corte no invalida el resto
      if (filtroFederacion && r.federacion !== filtroFederacion) continue;
      intentos += 1;
      ultimoPorGrupo.set(`${r.federacion}|${r.etiqueta}|${r.grupo}`, r);
    }
  }
  const fallidos = new Map();
  const motivos = new Map();
  let ok = 0;
  let dentroPeroFallido = 0;
  for (const [claveDelGrupo, r] of ultimoPorGrupo) {
    if (r.ok === true) { ok += 1; continue; }
    /*
     * Un grupo que YA está en el canónico no es un fallo, es un fallo SUPERADO: se importó después (a mano, o
     * en una pasada posterior). Contarlo como fallido hacía que el parte dijera 849 cuando faltaban muchos
     * menos.
     */
    if (dentro.has(claveDelGrupo)) { dentroPeroFallido += 1; continue; }
    const clave = `${r.federacion}|${r.etiqueta}`;
    fallidos.set(clave, (fallidos.get(clave) ?? 0) + 1);
    const f = familia(r.motivo);
    if (!motivos.has(f)) motivos.set(f, { causa: f, grupos: 0, federaciones: new Set(), ejemplo: null });
    const m = motivos.get(f);
    m.grupos += 1;
    m.federaciones.add(r.federacion);
    m.ejemplo ??= `${r.federacion} ${r.etiqueta} c${r.competicion} g${r.grupo}`;
  }
  return { intentos, gruposIntentados: ultimoPorGrupo.size, ok, fallidos, motivos, dentroPeroFallido };
}

/* ── 4. El parte ─────────────────────────────────────────────────────────────────────────────────────── */

const canonico = await enElCanonico(filtroFederacion);
const registro = delRegistro(canonico.dentro);

/** Todo lo que aparece en cualquiera de las dos fuentes, para no perder nada por el camino. */
const claves = new Set([...enLaCola.keys(), ...canonico.porClave.keys()]);
const filas = [...claves].map((clave) => {
  const [federacion, temporada] = clave.split('|');
  const cola = enLaCola.get(clave);
  const dentro = canonico.porClave.get(clave);
  const enCanonico = dentro?.grupos ?? 0;
  const enCola = cola?.grupos ?? 0;
  /*
   * Y los pendientes, GRUPO A GRUPO: de los que la cola tiene con datos, cuántos NO están en el canónico. Es
   * la única forma de que la cifra signifique «esto falta» y no «esta resta dio positivo».
   */
  const codigos = clavesDeLaCola.get(clave) ?? [];
  const faltan = codigos.filter((codigo) => !canonico.dentro.has(`${federacion}|${temporada}|${codigo}`)).length;
  const sinDatos = sinDatosEnLaCola.get(clave) ?? 0;
  const oficial = canonico.tablaOficial.get(clave) ?? { importada: 0, rechazada: 0, sinArchivar: 0, sinFilas: 0, ilegible: 0, sinCorte: 0, sinImportar: 0 };
  return {
    federacion, temporada,
    enCola, conActas: cola?.conActas ?? null,
    enCanonico,
    pendientes: faltan,
    sinDatos,
    conocidos: enCola + sinDatos,
    fallidos: registro.fallidos.get(clave) ?? 0,
    partidos: dentro?.partidos ?? 0,
    actas: dentro?.actas ?? 0,
    apariciones: dentro?.apariciones ?? 0,
    personas: dentro?.personas ?? null,
    tablaOficialImportada: oficial.importada,
    tablaOficialRechazada: oficial.rechazada,
    tablaOficialSinArchivar: oficial.sinArchivar,
    tablaOficialSinFilas: oficial.sinFilas,
    tablaOficialIlegible: oficial.ilegible,
    tablaOficialSinCorte: oficial.sinCorte,
    tablaOficialSinImportar: oficial.sinImportar,
  };
}).sort((a, b) => b.temporada.localeCompare(a.temporada, 'es') || a.federacion.localeCompare(b.federacion, 'es'));

const suma = (lista, campo) => lista.reduce((n, f) => n + (f[campo] ?? 0), 0);
const totales = {
  enCola: suma(filas, 'enCola'),
  conocidos: suma(filas, 'conocidos'),
  sinDatos: suma(filas, 'sinDatos'),
  conActas: suma(filas, 'conActas'),
  enCanonico: suma(filas, 'enCanonico'),
  pendientes: suma(filas, 'pendientes'),
  fallidos: suma(filas, 'fallidos'),
  partidos: suma(filas, 'partidos'),
  actas: suma(filas, 'actas'),
  apariciones: suma(filas, 'apariciones'),
  personasEnElCanonico: canonico.personas,
  gruposIntentados: registro.gruposIntentados,
  intentosRegistrados: registro.intentos,
  /*
   * Los cuatro estados de la clasificación oficial van PLANOS además de agrupados: `porFederacion` se calcula
   * a partir de las claves numéricas de aquí, y con el objeto anidado salía «undefined» en su columna.
   */
  tablaOficialImportada: suma(filas, 'tablaOficialImportada'),
  tablaOficialRechazada: suma(filas, 'tablaOficialRechazada'),
  tablaOficialSinArchivar: suma(filas, 'tablaOficialSinArchivar'),
  tablaOficialSinFilas: suma(filas, 'tablaOficialSinFilas'),
  tablaOficialIlegible: suma(filas, 'tablaOficialIlegible'),
  tablaOficialSinCorte: suma(filas, 'tablaOficialSinCorte'),
  tablaOficialSinImportar: suma(filas, 'tablaOficialSinImportar'),
  actasEnLasColas: {
    hecha: 0, pendiente: 0, pendienteAmbito: 0, pendientePermiso: 0, sinDatos: 0, ausenteWeb: 0,
  },
};
/*
 * Las actas de las colas por estado, sumadas a mano porque no vienen por federación|temporada: son de la cola
 * entera. `pendiente_ambito`, `pendiente_permiso`, `sin_datos` y `ausente_web` NO son trabajo pendiente.
 */
for (const [, suyo] of actasPorEstado) {
  totales.actasEnLasColas.hecha += suyo.hecha ?? 0;
  totales.actasEnLasColas.pendiente += suyo.pendiente ?? 0;
  totales.actasEnLasColas.pendienteAmbito += suyo.pendiente_ambito ?? 0;
  totales.actasEnLasColas.pendientePermiso += suyo.pendiente_permiso ?? 0;
  totales.actasEnLasColas.sinDatos += suyo.sin_datos ?? 0;
  totales.actasEnLasColas.ausenteWeb += suyo.ausente_web ?? 0;
}
totales.tablaOficial = {
  importada: totales.tablaOficialImportada,
  rechazada: totales.tablaOficialRechazada,
  sinArchivar: totales.tablaOficialSinArchivar,
  sinFilas: totales.tablaOficialSinFilas,
  ilegible: totales.tablaOficialIlegible,
  sinCorte: totales.tablaOficialSinCorte,
  sinImportar: totales.tablaOficialSinImportar,
};

const porFederacion = [...new Set(filas.map((f) => f.federacion))].sort().map((federacion) => {
  const suyas = filas.filter((f) => f.federacion === federacion);
  return { federacion, ...Object.fromEntries(Object.keys(totales).filter((k) => typeof totales[k] === 'number')
    .map((k) => [k, k === 'personasEnElCanonico' ? null : suma(suyas, k)])) };
});

const motivos = [...registro.motivos.values()]
  .map((m) => ({ causa: m.causa, grupos: m.grupos, federaciones: [...m.federaciones].sort(), ejemplo: m.ejemplo }))
  .sort((a, b) => b.grupos - a.grupos);

const parte = {
  cuando: new Date().toISOString(), totales, porFederacion, porTemporada: filas, motivosDeFallo: motivos,
  fallosSuperados: registro.dentroPeroFallido,
};
writeFileSync(SALIDA, `${JSON.stringify(parte, null, 2)}\n`);

if (soloJson) {
  console.log(JSON.stringify(parte, null, 2));
} else {
  const pct = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(1)} %`);
  console.log(`═══ ${new Date().toLocaleString('es-ES')} · parte de la importación`);
  console.log('');
  console.log(`  grupos con datos en las colas       ${String(totales.enCola).padStart(7)}`);
  console.log(`    de ellos, con actas               ${String(totales.conActas).padStart(7)}`);
  console.log(`  grupos dentro del canónico          ${String(totales.enCanonico).padStart(7)}   ${pct(totales.enCanonico, totales.enCola)} de la cola`);
  console.log(`  grupos pendientes                   ${String(totales.pendientes).padStart(7)}`);
  console.log(`  grupos con el último intento fallido${String(totales.fallidos).padStart(7)}`);
  /*
   * Y el techo: grupos que la cola CONOCE y no tienen datos suyos todavía. No son un fallo de importación
   * —no hay nada que importar— pero sin esta línea el parte parece decir que la cola tiene 29.160 grupos
   * cuando conoce 84.241.
   */
  console.log(`  grupos que la cola conoce            ${String(totales.conocidos).padStart(7)}`);
  console.log(`    de ellos, SIN datos recolectados   ${String(totales.sinDatos).padStart(7)}   (recolección pendiente, no fallo de importación)`);
  /*
   * ── LAS ACTAS: SÓLO `hecha` ES IMPORTABLE, Y ESO HAY QUE DECIRLO ──────────────────────────────────────
   *
   * «Faltan N actas» no significa nada si dentro de la N van las que NO se van a recoger nunca. Aquí se
   * separan las cuatro que no son trabajo pendiente, para que quien vea un hueco pueda saber si es temporal
   * o definitivo.
   */
  const ac = totales.actasEnLasColas;
  const conocidas = ac.hecha + ac.pendiente + ac.pendienteAmbito + ac.pendientePermiso + ac.sinDatos + ac.ausenteWeb;
  console.log('');
  console.log(`  actas que las colas conocen (${conocidas.toLocaleString('es-ES')})`);
  console.log(`    hecha, importable                 ${String(ac.hecha).padStart(7)}   ${pct(ac.hecha, conocidas)}`);
  console.log(`    pendiente, dentro del alcance     ${String(ac.pendiente).padStart(7)}   (trabajo de recolección de verdad)`);
  console.log(`    pendiente, FUERA del alcance      ${String(ac.pendienteAmbito).padStart(7)}   (no se recogerá mientras siga así: p. ej. actas de menores)`);
  console.log(`    pendiente, sin permiso            ${String(ac.pendientePermiso).padStart(7)}`);
  console.log(`    sin datos: la ficha está vacía    ${String(ac.sinDatos).padStart(7)}   (la federación la publica sin alineaciones ni cuerpo técnico)`);
  console.log(`    ausente en la web de la federación${String(ac.ausenteWeb).padStart(7)}   (publicada y luego retirada)`);
  /*
   * Y la OTRA familia de «recolectado y sin importar»: la clasificación oficial archivada de un grupo que ya
   * está dentro. Los cuatro estados se imprimen juntos porque separados no dicen nada: «faltan tablas
   * oficiales» es normal si la federación no las publica, y es trabajo pendiente si están archivadas.
   */
  const to = totales.tablaOficial;
  const conTabla = to.importada + to.rechazada + to.sinArchivar + to.sinFilas + to.ilegible + to.sinCorte + to.sinImportar;
  console.log('');
  console.log(`  clasificación oficial (${conTabla} grupos en el canónico)`);
  console.log(`    importada, se puede consultar     ${String(to.importada).padStart(7)}   ${pct(to.importada, conTabla)}`);
  console.log(`    ARCHIVADA Y SIN IMPORTAR          ${String(to.sinImportar).padStart(7)}   ← importación pendiente: hay archivo legible y no está dentro`);
  console.log(`    ILEGIBLE para el lector           ${String(to.ilegible).padStart(7)}   ← el archivo trae tabla y no se saca ni una fila: es hueco NUESTRO`);
  console.log(`    archivada y RECHAZADA             ${String(to.rechazada).padStart(7)}   (la descarta el validador o el resolutor de equipos: se dice cuál)`);
  console.log(`    archivada sin filas               ${String(to.sinFilas).padStart(7)}   (la federación aún no la publica)`);
  console.log(`    legible y sin jornada de corte    ${String(to.sinCorte).padStart(7)}`);
  console.log(`    la federación no la archiva       ${String(to.sinArchivar).padStart(7)}`);  console.log('');
  console.log(`  en el canónico: ${totales.partidos.toLocaleString('es-ES')} partidos · `
    + `${totales.actas.toLocaleString('es-ES')} actas · ${totales.apariciones.toLocaleString('es-ES')} apariciones`
    + `${totales.personasEnElCanonico === null ? '' : ` · ${totales.personasEnElCanonico.toLocaleString('es-ES')} personas`}`);

  console.log('\npor federación:');
  console.log(`  ${'federación'.padEnd(20)} ${'cola'.padStart(6)} ${'canónico'.padStart(9)} ${'pendiente'.padStart(10)} ${'fallidos'.padStart(9)} ${'tablaOf.'.padStart(9)}`);
  for (const f of porFederacion.sort((a, b) => b.pendientes - a.pendientes)) {
    console.log(`  ${f.federacion.padEnd(20)} ${String(f.enCola).padStart(6)} ${String(f.enCanonico).padStart(9)} `
      + `${String(f.pendientes).padStart(10)} ${String(f.fallidos).padStart(9)} ${String(f.tablaOficialSinImportar).padStart(9)}`);
  }
  console.log('  (la última columna son grupos ya importados cuya clasificación oficial está archivada y sin importar)');

  const huecos = filas.filter((f) => f.pendientes > 0).sort((a, b) => b.temporada.localeCompare(a.temporada, 'es') || b.pendientes - a.pendientes);
  console.log(`\ntemporadas con algo pendiente (${new Set(huecos.map((h) => h.temporada)).size} temporadas):`);
  for (const h of huecos.slice(0, 24)) {
    console.log(`  ${h.temporada}  ${h.federacion.padEnd(20)} cola ${String(h.enCola).padStart(5)} · `
      + `canónico ${String(h.enCanonico).padStart(5)} · faltan ${String(h.pendientes).padStart(5)}${h.fallidos ? ` · fallidos ${h.fallidos}` : ''}`);
  }
  if (huecos.length > 24) console.log(`  … y ${huecos.length - 24} combinaciones más (todas en el JSON)`);

  if (motivos.length > 0) {
    console.log(`\npor qué fallan (${motivos.length} causas, ${totales.fallidos} grupos):`);
    for (const m of motivos) {
      console.log(`  ${String(m.grupos).padStart(5)} × ${m.causa}`);
      console.log(`        ${m.federaciones.join(', ')} · p. ej. ${m.ejemplo}`);
    }
    /*
     * Y se dice lo que NO es un fallo: un grupo que falló y luego entró es un fallo SUPERADO, no una tarea
     * pendiente. Sin esta línea, el parte parecía dejar 100 grupos más de los que deja.
     */
    if (registro.dentroPeroFallido > 0) {
      console.log(`\n  (${registro.dentroPeroFallido} grupo(s) más fallaron alguna vez y YA están en el canónico: no se cuentan como fallidos)`);
    }
  }
  console.log(`\n  el parte completo: ${SALIDA.replace(`${RAIZ}\\`, '')}`);
}
