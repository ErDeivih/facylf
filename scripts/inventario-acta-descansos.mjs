#!/usr/bin/env node
/**
 * INVENTARIO REPRODUCIBLE de las filas de descanso que llevan acta, y de qué dice el acta.
 *
 * ## Por qué existe
 *
 * El inventario por clases (`scripts/inventario-descansos.mjs`) dice qué filas son el bloque de descanso y
 * con cuánta certeza, pero deja una pregunta abierta: **las que traen acta**. La regla de retirada las
 * dejaba fuera por prudencia —«no se puede descartar sin abrirla»— y esa prudencia se apoyaba en una
 * suposición: que el acta podría describir un partido real. La suposición se puede comprobar, porque el
 * acta está en la cola, en la tabla `actas`.
 *
 * Aquí se abre, y se cuenta lo que dice. El resultado es una **taxonomía excluyente** con una consecuencia
 * distinta por clase, que es lo que permite decidir sin adivinar:
 *
 * | veredicto | qué dice el acta | consecuencia |
 * |---|---|---|
 * | `sin-acta` | no hay acta | se puede retirar |
 * | `descanso` | el acta nombra el descanso en un lado | se puede retirar (el acta no documenta partido) |
 * | `partido-real` | el acta nombra DOS equipos reales | NO se retira: ahí hubo partido (desplazado) |
 * | `no-demuestra` | acta sin pareja, ilegible o sin fila en la cola | no se retira y no se decide |
 *
 * ## Cómo se usa
 *
 * ```powershell
 * npx tsx scripts/inventario-acta-descansos.mjs --todas `
 *   --json pruebas/reconstruccion/informes/descansos-acta.json `
 *   --md   pruebas/reconstruccion/informes/descansos-acta.md
 * ```
 *
 * Sólo LEE: la cola se abre en modo lectura y no se escribe en ella. Se puede lanzar con los workers
 * corriendo.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  VOCABULARIO_DESCANSO, esPalabraDeDescanso, veredictoDelActaDeDescanso,
} from '../packages/ingesta/src/parsers/filas-informativas.js';

/*
 * Qué extractor y qué maqueta leen cada federación. Es la declaración de `adaptadores.ts` (la maqueta del
 * portal) cruzada con la tabla de extractores del recolector (`ADAPTADORES_EXTRACCION`, que es la que dice
 * con qué vocabulario y con qué evidencia se descarta una fila). Se escribe aquí porque una taxonomía
 * «por extractor y maqueta» tiene que decir de dónde sale cada fila, no sólo cuántas hay: sin esto, un
 * cambio en el vocabulario de una maqueta no se puede atribuir a las filas que produjo.
 */
const MAQUETA_POR_FEDERACION = {
  euskadi: 'nova-widget',
  aragon: 'pnfg-clasica',
  'castilla-la-mancha': 'pnfg-clasica',
  'castilla-leon': 'pnfg-clasica',
  rioja: 'pnfg-clasica',
  ceuta: 'pnfg-clasica',
  cantabria: 'pnfg-clasica',
  navarra: 'pnfg-clasica',
  murcia: 'pnfg-clasica',
  cataluna: 'fcf',
  madrid: 'isquad',
  valencia: 'isquad',
};
const maquetaDe = (fed) => MAQUETA_POR_FEDERACION[fed] ?? 'sin-declarar';
const EXTRACTOR_DE_MAQUETA = {
  'nova-widget': 'extraePartidosWidget (subtabla por `tr` interna)',
  'pnfg-clasica': 'extraePartidos (tabla con dos enlaces `NFG_VisEquipos`)',
  fcf: 'extraePartidos (maqueta clásica)',
  isquad: 'recolector-valencia (código de equipo negativo)',
  'sin-declarar': 'extractor desconocido',
};

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const raiz = arg('raiz') ?? '.';
const federacion = arg('federacion') ?? 'euskadi';
const todas = process.argv.includes('--todas');
const rutaJson = arg('json');
const rutaMd = arg('md');

const MAQUETAS = Object.keys(VOCABULARIO_DESCANSO);
const limpia = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const vocabulariosDe = (literal) => MAQUETAS.filter((m) => esPalabraDeDescanso(limpia(literal), m));

/** Todas las colas que hay en la raíz, leyendo el directorio en vez de una lista escrita a mano. */
function federacionesDisponibles() {
  return readdirSync(raiz, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('descargas-'))
    .map((d) => d.name.replace(/^descargas-/, ''))
    .filter((f) => existsSync(join(raiz, `descargas-${f}`, 'recolector-local', 'cola-v2.sqlite')))
    .sort();
}

function analiza(fed) {
  const rutaCola = join(raiz, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
  const db = new DatabaseSync(rutaCola, { readOnly: true });
  const casos = [];
  try {
    /*
     * Las filas candidatas se piden con `.all()` y NO con `.iterate()`, y la consulta del acta se prepara
     * una vez FUERA del bucle.
     *
     * No es estilo: con un cursor vivo (`.iterate()`) y una sentencia preparada dentro del bucle sobre la
     * MISMA conexión, algunas lecturas del acta devolvían «no hay fila» en silencio. Medido: el inventario
     * contaba 14 filas con acta de dos equipos reales en Valencia y 0 en Madrid, y el cruce por SQL —una
     * sola consulta con `join` y `json_extract`— cuenta **111 y 150**. Las que fallaban se declaraban
     * `no-demuestra`, que es un veredicto conservador y por eso no saltó ninguna alarma: el error se
     * escondía detrás de una respuesta prudente.
     *
     * El `like` es un prefiltro ancho: el vocabulario exacto lo decide el clasificador, fila a fila.
     */
    const candidatas = db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta, local, visitante
      from partidos
      where lower(local) like '%descans%' or lower(visitante) like '%descans%'
         or lower(local) like '%atsedena%' or lower(visitante) like '%atsedena%'
      order by temporada, competicion, grupo, jornada, orden`).all();
    const leeActa = db.prepare(`select datos, estado from actas
      where codigo=? and temporada=? and competicion=? and grupo=?`);
    for (const f of candidatas) {
      const maquetas = [...new Set([...vocabulariosDe(f.local), ...vocabulariosDe(f.visitante)])];
      if (!maquetas.length) continue;
      const acta = f.codigo_acta
        ? leeActa.get(f.codigo_acta, f.temporada, f.competicion, f.grupo)
        : null;
      let datos = null;
      let ilegible = false;
      if (acta?.datos) { try { datos = JSON.parse(acta.datos); } catch { ilegible = true; } }
      const pareja = datos?.local && datos?.visitante ? [limpia(datos.local), limpia(datos.visitante)] : null;
      const veredicto = !f.codigo_acta ? 'sin-acta'
        : ilegible ? 'no-demuestra'
          : !acta ? 'no-demuestra'
            : veredictoDelActaDeDescanso(pareja);
      let parejaEnLaJornada = 0;
      if (pareja && veredicto === 'partido-real') {
        parejaEnLaJornada = db.prepare(`select count(*) n from partidos
          where temporada=? and competicion=? and grupo=? and jornada=? and orden<>?
            and ((local=? and visitante=?) or (local=? and visitante=?))`)
          .get(f.temporada, f.competicion, f.grupo, f.jornada, f.orden,
            pareja[0], pareja[1], pareja[1], pareja[0]).n;
      }
      const enLaCola = new Set([limpia(f.local).toUpperCase(), limpia(f.visitante).toUpperCase()]);
      casos.push({
        federacion: fed,
        clave: `t${f.temporada} c${f.competicion} g${f.grupo} J${f.jornada} ord ${f.orden}`,
        temporada: f.temporada, competicion: f.competicion, grupo: f.grupo, jornada: f.jornada, orden: f.orden,
        local: limpia(f.local), visitante: limpia(f.visitante),
        vocabulario: maquetas.join('/'),
        codigo_acta: f.codigo_acta ?? null,
        estado_acta: acta?.estado ?? null,
        acta_ilegible: ilegible,
        pareja_del_acta: pareja,
        veredicto,
        // Sólo en `partido-real`: el equipo que el acta conoce y la fila no tiene.
        equipo_que_la_cola_no_tiene: veredicto === 'partido-real' && pareja
          ? (pareja.find((x) => !enLaCola.has(x.toUpperCase())) ?? null) : null,
        pareja_del_acta_ya_en_la_jornada: parejaEnLaJornada,
      });
    }
  } finally { db.close(); }
  return { federacion: fed, ruta_cola: rutaCola, casos };
}

const VEREDICTOS = ['sin-acta', 'descanso', 'partido-real', 'no-demuestra'];
const CONSECUENCIA = {
  'sin-acta': 'se retira',
  descanso: 'se retira',
  'partido-real': 'NO se retira: partido desplazado',
  'no-demuestra': 'no se retira y no se decide',
};

const federaciones = todas ? federacionesDisponibles() : [federacion];
const porFederacion = federaciones.map(analiza);
const casos = porFederacion.flatMap((f) => f.casos);
const totales = Object.fromEntries(VEREDICTOS.map((v) => [v, casos.filter((c) => c.veredicto === v).length]));

const inventario = {
  generado_en: new Date().toISOString(),
  raiz,
  definicion: {
    que_cuenta: 'filas de `partidos` con un lado EXACTAMENTE en el vocabulario de descanso de alguna maqueta',
    veredictos: Object.fromEntries(VEREDICTOS.map((v) => [v, CONSECUENCIA[v]])),
    vocabulario: VOCABULARIO_DESCANSO,
    nota: 'el veredicto sale del par que publica el acta de la propia fila; sin acta legible no se decide',
  },
  totales,
  filas_totales: casos.length,
  por_maqueta: Object.entries(casos.reduce((acc, c) => {
    const m = maquetaDe(c.federacion);
    acc[m] = acc[m] ?? { maqueta: m, extractor: EXTRACTOR_DE_MAQUETA[m] ?? '·', filas: 0, por_veredicto: Object.fromEntries(VEREDICTOS.map((v) => [v, 0])) };
    acc[m].filas++;
    acc[m].por_veredicto[c.veredicto]++;
    return acc;
  }, {})).map(([, v]) => v).sort((a, b) => b.filas - a.filas),
  por_federacion: porFederacion.map((f) => {
    const cuenta = Object.fromEntries(VEREDICTOS.map((v) => [v, f.casos.filter((c) => c.veredicto === v).length]));
    return { federacion: f.federacion, ruta_cola: f.ruta_cola, filas: f.casos.length, por_veredicto: cuenta };
  }).filter((f) => f.filas > 0),
  casos,
};

console.log(`inventario del acta de las filas de descanso · ${federaciones.length} colas · ${casos.length} filas`);
for (const f of inventario.por_federacion) {
  const detalle = VEREDICTOS.filter((v) => f.por_veredicto[v] > 0).map((v) => `${v} ${f.por_veredicto[v]}`).join(' · ');
  console.log(`  ${f.federacion.padEnd(20)} ${String(f.filas).padStart(5)}   ${detalle}`);
}
console.log('\npor extractor y maqueta');
for (const m of inventario.por_maqueta) {
  const detalle = VEREDICTOS.filter((v) => m.por_veredicto[v] > 0).map((v) => `${v} ${m.por_veredicto[v]}`).join(' · ');
  console.log(`  ${m.maqueta.padEnd(14)} ${String(m.filas).padStart(5)}   ${detalle}`);
}
const sumaMaquetas = inventario.por_maqueta.reduce((a, m) => a + m.filas, 0);
if (sumaMaquetas !== casos.length) console.error(`OJO: por maqueta suma ${sumaMaquetas} y hay ${casos.length} casos`);
console.log('\ntotales');
for (const v of VEREDICTOS) console.log(`  ${v.padEnd(14)} ${String(totales[v]).padStart(5)}   ${CONSECUENCIA[v]}`);
const desplazados = casos.filter((c) => c.veredicto === 'partido-real');
if (desplazados.length) {
  console.log(`\npartidos desplazados (${desplazados.length}): el acta dice que ahí hubo partido`);
  for (const c of desplazados) {
    console.log(`  ${c.clave} · cola «${c.local} vs ${c.visitante}» · acta «${c.pareja_del_acta.join(' / ')}»`
      + `${c.equipo_que_la_cola_no_tiene ? ` · falta «${c.equipo_que_la_cola_no_tiene}»` : ''}`
      + `${c.pareja_del_acta_ya_en_la_jornada ? ' · esa pareja ya está en la jornada' : ''}`);
  }
}

if (rutaJson) {
  mkdirSync(dirname(rutaJson), { recursive: true });
  writeFileSync(rutaJson, JSON.stringify(inventario, null, 1));
  console.log(`\nescrito ${rutaJson}`);
}
if (rutaMd) {
  const lineas = [
    '# Inventario del acta de las filas de descanso',
    '',
    `Generado: ${inventario.generado_en}`,
    '',
    'Cuenta las filas de `partidos` con un lado **exactamente** en el vocabulario de descanso de alguna',
    'maqueta, y dice qué publica el acta de esa misma fila. El veredicto decide qué se puede hacer con la',
    'fila, así que las cuatro clases son excluyentes y suman el total.',
    '',
    '| veredicto | qué dice el acta | filas | consecuencia |',
    '|---|---|---:|---|',
    ...VEREDICTOS.map((v) => `| \`${v}\` | ${CONSECUENCIA[v].split(':')[0]} | ${totales[v]} | ${CONSECUENCIA[v]} |`),
    `| **total** | | **${casos.length}** | |`,
    '',
    '## Por federación',
    '',
    '| federación | filas | sin acta | descanso | partido real | no demuestra |',
    '|---|---:|---:|---:|---:|---:|',
    ...inventario.por_federacion.map((f) => `| ${f.federacion} | ${f.filas} | ${f.por_veredicto['sin-acta']} `
      + `| ${f.por_veredicto.descanso} | ${f.por_veredicto['partido-real']} | ${f.por_veredicto['no-demuestra']} |`),
    '',
    '## Por extractor y maqueta',
    '',
    'La maqueta decide el vocabulario con el que se reconoce el descanso y la evidencia que autoriza a',
    'descartar la fila. Un cambio en el vocabulario de una maqueta se atribuye aquí a las filas que produjo.',
    '',
    '| maqueta | extractor | filas | sin acta | descanso | partido real | no demuestra |',
    '|---|---|---:|---:|---:|---:|---:|',
    ...inventario.por_maqueta.map((m) => `| \`${m.maqueta}\` | ${m.extractor} | ${m.filas} `
      + `| ${m.por_veredicto['sin-acta']} | ${m.por_veredicto.descanso} | ${m.por_veredicto['partido-real']} `
      + `| ${m.por_veredicto['no-demuestra']} |`),
    '',
  ];
  if (desplazados.length) {
    lineas.push(`## Partidos desplazados (${desplazados.length})`, '',
      'La fila pone el descanso y el acta de esa misma fila nombra dos equipos reales: **ahí hubo partido**,',
      'así que la fila no se retira y lo que falta es recuperar el partido.', '',
      '| fila | la cola dice | el acta dice | equipo que falta | ya en la jornada |',
      '|---|---|---|---|---|',
      ...desplazados.map((c) => `| ${c.clave} | ${c.local} vs ${c.visitante} | ${c.pareja_del_acta.join(' / ')} `
        + `| ${c.equipo_que_la_cola_no_tiene ?? '·'} | ${c.pareja_del_acta_ya_en_la_jornada ? 'sí' : 'no'} |`), '');
  }
  lineas.push('## Casos con acta que no demuestra nada', '',
    'Filas cuyo acta no se pudo leer (sin pareja, ilegible o sin fila en la cola). **No se decide nada con',
    'ellas**: no hay evidencia con la que decidir, y no saber no autoriza a borrar.', '',
    '| fila | la cola dice | acta | estado del acta |',
    '|---|---|---|---|',
    ...casos.filter((c) => c.veredicto === 'no-demuestra').slice(0, 200)
      .map((c) => `| ${c.clave} | ${c.local} vs ${c.visitante} | ${c.codigo_acta ?? '·'} | ${c.estado_acta ?? '·sin fila·'} |`),
    '', casos.filter((c) => c.veredicto === 'no-demuestra').length > 200
      ? `(se listan 200 de ${casos.filter((c) => c.veredicto === 'no-demuestra').length}; el JSON los lleva todos)` : '',
    '');
  mkdirSync(dirname(rutaMd), { recursive: true });
  writeFileSync(rutaMd, `${lineas.filter((l) => l !== undefined).join('\n')}\n`);
  console.log(`escrito ${rutaMd}`);
}
