#!/usr/bin/env node
/*
 * ACTAS DESCARGADAS Y ANALIZADAS QUE NO ESTÁN EN NINGÚN INFORME DEL CANÓNICO.
 *
 * Por qué. Todo el trabajo de importación se ha medido *por grupos*: el grupo está o no está, el grupo ha
 * crecido o no. Pero un grupo puede estar dentro con el 90 % de sus actas, y ninguna de las señales por grupo
 * lo ve: el grupo «está», las actas que la cola tiene son menos que las que el canónico tiene, y la resta sale
 * negativa. La comparación por grupo NO puede encontrar actas sueltas que se quedaron fuera.
 *
 * Esto compara acta a acta por su CÓDIGO. Los dos lados lo tienen:
 *
 *   · la cola, en `actas.codigo` (filas con `estado = 'hecha'`: descargadas y analizadas);
 *   · el canónico, en `core.match_report.archivo_ruta`, que guarda la ruta del archivo archivado
 *     (`…/acta-26096133.html`) y por tanto lleva el código dentro.
 *
 * No inventa nada: si el código no está, el acta no se importó. Y dice de qué grupo es, sacándolo de la propia
 * cola, para poder ir a mirarlo.
 *
 * Uso:
 *   node scripts/mide-actas-sin-informe.mjs                 · el resumen y los grupos con más actas fuera
 *   node scripts/mide-actas-sin-informe.mjs --federacion galicia
 *   node scripts/mide-actas-sin-informe.mjs --grupos 40     · cuántos grupos lista al final
 *   node scripts/mide-actas-sin-informe.mjs --json
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'actas-sin-informe.json');
const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const { DatabaseSync } = requerir('node:sqlite');
const { Client } = requerir('pg');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const filtro = arg('federacion');
const cuantosGrupos = Number(arg('grupos') ?? 25);
const soloJson = argumentos.includes('--json');

const rutaEnv = join(RAIZ, '.env');
if (existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch { /* sin .env no hay canónico */ }
}

/* ── 1. Los códigos de acta que el canónico TIENE ────────────────────────────────────────────────────── */
const url = (process.env.DATABASE_URL_LECTOR ?? '').trim();
if (url === '') {
  console.error('Sin DATABASE_URL_LECTOR no hay con qué comparar.');
  process.exit(1);
}
const cliente = new Client({ connectionString: url, statement_timeout: 300_000 });
await cliente.connect();
let enElCanonico;
/** federación|temporada|grupo → informes que el canónico tiene de ese grupo. */
const informesPorGrupo = new Map();
try {
  const { rows } = await cliente.query(
    "select archivo_ruta from core.match_report where archivo_ruta is not null");
  enElCanonico = new Set();
  for (const r of rows) {
    const m = /acta-(\d+)/.exec(r.archivo_ruta);
    if (m !== null) enElCanonico.add(m[1]);
  }
  /*
   * Y los informes por grupo, que es la señal que YA usa el plan (`importar-todo.mts`): si la cola tiene más
   * actas `hecha` que informes el canónico, el grupo vuelve al plan solo. Sirve para partir este hallazgo en
   * dos: lo que el plan ya va a arreglar, y lo que el plan NO PUEDE VER —un grupo con el mismo número de
   * actas pero distintas, porque el recolector reparó o sustituyó alguna—.
   *
   * Se cuenta además cuántos informes de ese grupo NO dicen de qué archivo salieron (`archivo_ruta` nulo).
   * Medido el 25/09/2026: son 60 en todo el canónico, y explican todos los casos de «cuentas cuadradas» —
   * el acta SÍ se importó, pero el informe no guardó su procedencia, así que comparar por código de archivo la
   * da por perdida. Es un falso positivo del instrumento, y por eso se dice en vez de contarse como hallazgo.
   */
  const { rows: porGrupo } = await cliente.query(`
    select f.codigo as federacion, s.etiqueta, pg.codigo_externo as grupo,
           count(distinct r.match_id)::int as informes,
           (count(*) filter (where r.match_id is not null and r.archivo_ruta is null))::int as sin_ruta
      from core.phase_group pg
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.federation f on f.id = ce.federation_id
      join core.season s on s.id = ce.season_id
      left join core.match m on m.phase_group_id = pg.id
      left join core.match_report r on r.match_id = m.id
     where pg.codigo_externo is not null
     group by 1, 2, 3`);
  for (const r of porGrupo) {
    informesPorGrupo.set(`${r.federacion}|${r.etiqueta}|${r.grupo}`,
      { informes: Number(r.informes), sinRuta: Number(r.sin_ruta) });
  }
} finally {
  await cliente.end();
}

/* ── 2. Los códigos de acta `hecha` que la cola TIENE, con su grupo ──────────────────────────────────── */
function colas() {
  const salida = [];
  for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
    if (entrada.name === 'descargas-federacion-sondeo' || entrada.name === 'descargas-prueba-10gb') continue;
    const ruta = join(RAIZ, entrada.name, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta)) continue;
    if (existsSync(join(RAIZ, entrada.name, '.PRUEBA'))) continue;
    const federacion = entrada.name === 'descargas-federacion' ? 'castilla-leon' : entrada.name.replace('descargas-', '');
    if (filtro && federacion !== filtro) continue;
    salida.push({ federacion, ruta });
  }
  return salida.sort((a, b) => a.federacion.localeCompare(b.federacion, 'es'));
}

/** federación → { hechas, fuera, porGrupo: Map } */
const porFederacion = new Map();
const porGrupo = new Map();
/** federación|etiqueta|grupo → cuántas actas `hecha` tiene la cola de ese grupo. */
const hechasPorGrupo = new Map();
let hechasTotales = 0;
let fueraTotales = 0;
for (const { federacion, ruta } of colas()) {
  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 10_000 });
  const suyo = { federacion, hechas: 0, fuera: 0 };
  try {
    const filas = db.prepare(`select a.codigo as acta, a.temporada, a.competicion, a.grupo, a.hash, t.etiqueta
        from actas a join temporadas t on t.codigo = a.temporada
       where a.estado = 'hecha'`).all();
    /*
     * El hash de cada acta, por grupo: sirve para reconocer el ÚLTIMO caso que parece un hueco y no lo es.
     * Medido el 25/09/2026 en Castilla-La Mancha (c22001085 g22001535, jornada 9): las actas 523907 y 523909
     * tienen el MISMO hash —es la misma acta descargada dos veces con dos códigos— y el canónico guardó una.
     * Comparando por código, la otra parece perdida; comparando por hash, se ve que es la misma.
     */
    const porHash = new Map();
    for (const f of filas) {
      if (f.hash === null || f.hash === undefined) continue;
      const clave = `${f.grupo}|${f.hash}`;
      const codigos = porHash.get(clave) ?? [];
      codigos.push(String(f.acta));
      porHash.set(clave, codigos);
    }
    for (const f of filas) {
      suyo.hechas += 1;
      hechasTotales += 1;
      const claveGrupo = `${federacion}|${f.etiqueta}|${f.grupo}`;
      hechasPorGrupo.set(claveGrupo, (hechasPorGrupo.get(claveGrupo) ?? 0) + 1);
      if (enElCanonico.has(String(f.acta))) continue;
      suyo.fuera += 1;
      fueraTotales += 1;
      // ¿Hay otra acta del mismo grupo, con el mismo contenido, que SÍ está en el canónico?
      const gemelos = (porHash.get(`${f.grupo}|${f.hash}`) ?? []).filter((c) => c !== String(f.acta));
      const gemeloEnElCanonico = gemelos.find((c) => enElCanonico.has(c)) ?? null;
      const clave = `${federacion}|${f.etiqueta}|${f.competicion}|${f.grupo}`;
      const grupo = porGrupo.get(clave) ?? { federacion, etiqueta: f.etiqueta, competicion: String(f.competicion),
        grupo: String(f.grupo), actasFuera: 0, actasDuplicadas: 0, gemelos: [], hechas: 0, informes: 0,
        loVeraElPlan: false, elInformeNoDiceDeDonde: false, invisible: false, codigos: [] };
      grupo.actasFuera += 1;
      if (gemeloEnElCanonico !== null) {
        grupo.actasDuplicadas += 1;
        grupo.gemelos.push(`${f.acta}=${gemeloEnElCanonico}`);
      }
      grupo.codigos.push(String(f.acta));         // la evidencia: qué actas son, no sólo cuántas
      porGrupo.set(clave, grupo);
    }
  } catch (error) {
    console.error(`  ${federacion}: no se pudo leer la cola (${error.message})`);
  } finally {
    db.close();
  }
  porFederacion.set(federacion, suyo);
}

/*
 * La clasificación que hace útil el hallazgo: el plan ya mira `actas hecha de la cola > informes del canónico`
 * en cada grupo. Los que cumplen eso se arreglan solos en la siguiente pasada; los que NO, son actas que
 * ninguna señal por grupo puede ver… salvo que el informe exista sin decir de qué archivo salió, que es un
 * falso positivo de este instrumento y se cuenta aparte.
 */
for (const grupo of porGrupo.values()) {
  const clave = `${grupo.federacion}|${grupo.etiqueta}|${grupo.grupo}`;
  const canonico = informesPorGrupo.get(clave) ?? { informes: 0, sinRuta: 0 };
  grupo.hechas = hechasPorGrupo.get(clave) ?? 0;
  grupo.informes = canonico.informes;
  grupo.informesSinRuta = canonico.sinRuta;
  /*
   * Y el orden de las explicaciones importa: cada una quita actas de la anterior, para que lo que quede sin
   * explicar sea lo mínimo posible y no una suma de cosas ya sabidas.
   */
  grupo.loVeraElPlan = grupo.hechas > grupo.informes;
  grupo.elInformeNoDiceDeDonde = !grupo.loVeraElPlan && canonico.sinRuta >= grupo.actasFuera;
  grupo.elRestoEsDuplicado = !grupo.loVeraElPlan && !grupo.elInformeNoDiceDeDonde
    && grupo.actasDuplicadas >= grupo.actasFuera;
  grupo.invisible = !grupo.loVeraElPlan && !grupo.elInformeNoDiceDeDonde && !grupo.elRestoEsDuplicado;
}

const grupos = [...porGrupo.values()].sort((a, b) => b.actasFuera - a.actasFuera);
const invisibles = grupos.filter((g) => g.invisible);
const sinRuta = grupos.filter((g) => g.elInformeNoDiceDeDonde);
const duplicadas = grupos.filter((g) => g.elRestoEsDuplicado);
const actasInvisibles = invisibles.reduce((n, g) => n + g.actasFuera, 0);
const actasSinRuta = sinRuta.reduce((n, g) => n + g.actasFuera, 0);
const actasDuplicadas = duplicadas.reduce((n, g) => n + g.actasFuera, 0);
const parte = {
  cuando: new Date().toISOString(),
  actasHechasEnLasColas: hechasTotales,
  codigosDeActaEnElCanonico: enElCanonico.size,
  actasSinInforme: fueraTotales,
  gruposConActasFuera: grupos.length,
  gruposQueElPlanNoVe: invisibles.length,
  actasQueElPlanNoVe: actasInvisibles,
  actasConInformeSinRuta: actasSinRuta,
  actasDuplicadasConOtroCodigo: actasDuplicadas,
  porFederacion: [...porFederacion.values()].filter((f) => f.fuera > 0),
  grupos,
};
writeFileSync(SALIDA, `${JSON.stringify(parte, null, 2)}\n`);

if (soloJson) {
  console.log(JSON.stringify(parte, null, 2));
  process.exit(0);
}

const pct = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(2)} %`);
console.log(`═══ actas descargadas y analizadas que NO están en el canónico · ${new Date().toLocaleString('es-ES')}`);
console.log('');
console.log(`  actas \`hecha\` en las colas        ${String(hechasTotales).padStart(7)}`);
console.log(`  códigos de acta en el canónico    ${String(enElCanonico.size).padStart(7)}   ${pct(enElCanonico.size, hechasTotales)} de las hechas`);
console.log(`  actas hechas SIN informe          ${String(fueraTotales).padStart(7)}   ${pct(fueraTotales, hechasTotales)}   en ${grupos.length} grupo(s)`);
console.log(`    en grupos donde la cola tiene MÁS actas que informes el canónico (el plan las ve)  ${String(fueraTotales - actasInvisibles - actasSinRuta - actasDuplicadas).padStart(6)}`);
console.log(`    el informe EXISTE pero no dice de qué archivo salió (el canónico no guardó la ruta)  ${String(actasSinRuta).padStart(6)}   en ${sinRuta.length} grupo(s)`);
console.log(`    es la MISMA acta con otro código (mismo hash), y el canónico ya la tiene  ${String(actasDuplicadas).padStart(6)}   en ${duplicadas.length} grupo(s)`);
console.log(`    sin explicación: ninguna señal por grupo lo ve                            ${String(actasInvisibles).padStart(6)}   en ${invisibles.length} grupo(s)`);
console.log('');
console.log('por federación (las que tienen alguna fuera):');
for (const f of parte.porFederacion.sort((a, b) => b.fuera - a.fuera)) {
  console.log(`  ${f.federacion.padEnd(20)} hechas ${String(f.hechas).padStart(7)} · fuera ${String(f.fuera).padStart(6)}  ${pct(f.fuera, f.hechas)}`);
}
if (grupos.length > 0) {
  console.log(`\nlos ${Math.min(cuantosGrupos, grupos.length)} grupo(s) con más actas fuera (de ${grupos.length}):`);
  for (const g of grupos.slice(0, cuantosGrupos)) {
    const marca = g.loVeraElPlan ? 'lo ve el plan'
      : g.elInformeNoDiceDeDonde ? 'informe sin ruta (no es un hueco)'
        : g.elRestoEsDuplicado ? 'acta duplicada con otro código (no es un hueco)'
          : 'SIN EXPLICACIÓN';
    console.log(`  ${g.federacion.padEnd(18)} ${g.etiqueta}  c${g.competicion} g${g.grupo}  ${String(g.actasFuera).padStart(4)} acta(s) `
      + `· cola ${String(g.hechas).padStart(4)} / canónico ${String(g.informes).padStart(4)} · ${marca}`);
  }
  console.log('\n  (un grupo entero suele ser «no importado» o «ha crecido»: eso el plan lo ve. Las filas marcadas');
  console.log('   SIN EXPLICACIÓN tienen las cuentas cuadradas y sólo se ven comparando acta a acta, como aquí)');
}
if (invisibles.length > 0) {
  console.log(`\n  los ${Math.min(cuantosGrupos, invisibles.length)} grupo(s) SIN EXPLICACIÓN con más actas fuera (de ${invisibles.length}):`);
  for (const g of invisibles.slice(0, cuantosGrupos)) {
    console.log(`  ${g.federacion.padEnd(18)} ${g.etiqueta}  c${g.competicion} g${g.grupo}  ${g.actasFuera} acta(s) de ${g.hechas}`);
  }
}
console.log(`\n  el detalle completo: ${SALIDA.replace(`${RAIZ}\\`, '')}`);
