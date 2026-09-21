#!/usr/bin/env node
/**
 * INVENTARIO de las filas de descanso que las colas guardan como si fueran partidos.
 *
 * Fase 1 del encargo: un inventario **reproducible** y **estable**, en JSON y legible, con una clase causal
 * por fila y todas sus señales conservadas. No corrige nada: sólo mide, para poder decidir después.
 *
 * ```powershell
 * node scripts/inventario-descansos.mjs                          # todas las federaciones
 * node scripts/inventario-descansos.mjs --federacion euskadi
 * node scripts/inventario-descansos.mjs --max-jornadas 200       # muestra acotada
 * ```
 *
 * Salida:
 * - `pruebas/reconstruccion/informes/descansos.inventario.json` — un caso por fila, con todos los campos;
 * - `pruebas/reconstruccion/informes/descansos.inventario.md`   — el mismo contenido, legible y agregado.
 *
 * La clasificación vive en `packages/ingesta/src/parsers/filas-informativas.ts` y es pura, para poder
 * probarla sin colas ni PostgreSQL. Aquí sólo se reúne la evidencia que esa función necesita.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import {
  CLASES, clasificaFilaDeDescanso, compruebaInvariantesDelInventario, esPalabraDeDescanso,
  recuentaInventario,
} from '../packages/ingesta/src/parsers/filas-informativas.js';
import { normalizaNombreEquipo, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';
import { extraePartidos, extraePartidosWidget } from './lib/recolector-local.mjs';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const soloFederacion = arg('federacion');
const maxJornadas = Number(arg('max-jornadas', 0));
const CARPETA_INFORMES = join(raiz, 'pruebas', 'reconstruccion', 'informes');

/** Adaptador declarado de cada federación, que NO es lo mismo que su maqueta. */
const adaptadores = new Map();
try {
  const config = JSON.parse(readFileSync(join(raiz, 'config', 'federaciones-espana.json'), 'utf8'));
  for (const f of config.fuentes ?? []) adaptadores.set(f.codigo, f.adaptador ?? 'pnfg');
} catch { /* sin catálogo: se asume pnfg, que es lo que declara la mayoría */ }
const maquetaDelAdaptador = (adaptador) => {
  if (adaptador === 'personalizado-fcf') return 'fcf';
  if (adaptador === 'personalizado-isquad') return 'isquad';
  return 'pnfg-clasica';
};

const leerArchivo = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (!existsSync(r)) continue;
    return { contenido: /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8'), ruta: r };
  }
  return null;
};

/** Palabras con las que se PRESELECCIONA en SQL. La pertenencia de verdad la decide `esPalabraDeDescanso`. */
const PRESELECCION = ['escans', 'tseden', 'eposa'];
const wherePreseleccion = PRESELECCION.flatMap((p) => [`local like '%${p}%'`, `visitante like '%${p}%'`]).join(' or ');

const casos = [];
const resumenJornadas = [];
const federaciones = readdirSync(raiz).filter((d) => d.startsWith('descargas-')).map((d) => d.replace(/^descargas-/, '')).sort();

for (const federacion of federaciones) {
  if (soloFederacion && federacion !== soloFederacion) continue;
  const rutaCola = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(rutaCola)) continue;
  const adaptador = adaptadores.get(federacion) ?? 'pnfg';
  const db = new DatabaseSync(rutaCola, { readOnly: true });

  const candidatas = db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta,
      equipo_local_codigo cl, equipo_visitante_codigo cv, local, visitante, goles_local gl, goles_visitante gv,
      fecha, hora, campo, campo_codigo, arbitro
    from partidos where ${wherePreseleccion} order by temporada, competicion, grupo, jornada, orden`).all();

  /** Cuántas filas de la misma jornada comparten acta / pareja: la evidencia de duplicado. */
  const porActa = new Map();
  const porPareja = new Map();
  for (const c of candidatas) {
    if (c.codigo_acta) {
      const k = `${c.temporada}|${c.competicion}|${c.grupo}|${c.jornada}|${c.codigo_acta}`;
      porActa.set(k, (porActa.get(k) ?? 0) + 1);
    }
    const kp = `${c.temporada}|${c.competicion}|${c.grupo}|${c.jornada}|${c.local}|${c.visitante}`;
    porPareja.set(kp, (porPareja.get(kp) ?? 0) + 1);
  }

  // El HTML se lee UNA vez por jornada, no una por fila.
  const cache = new Map();
  const jornadasVistas = new Set();
  for (const c of candidatas) {
    if (maxJornadas > 0 && jornadasVistas.size >= maxJornadas && !jornadasVistas.has(`${c.grupo}|${c.jornada}`)) continue;
    const kJornada = `${c.temporada}|${c.competicion}|${c.grupo}|${c.jornada}`;
    if (!cache.has(kJornada)) {
      const j = db.prepare('select archivo, hash from jornadas where temporada=? and competicion=? and grupo=? and numero=?')
        .get(c.temporada, c.competicion, c.grupo, c.jornada);
      const archivo = j?.archivo ? leerArchivo(j.archivo) : null;
      let maqueta = maquetaDelAdaptador(adaptador);
      let delHtml = null;
      if (archivo) {
        const widget = extraePartidosWidget(archivo.contenido);
        const clasicos = extraePartidos(archivo.contenido);
        // La vía que usa el worker: la clásica si encuentra tablas; si no, la del widget. `extraePartidos`
        // ya hace ese relevo por dentro, así que se distingue comparando con lo que ve el widget solo.
        delHtml = clasicos;
        const vinoDelWidget = clasicos.length > 0 && widget.length === clasicos.length
          && clasicos.every((p, i) => p.local === widget[i]?.local && p.visitante === widget[i]?.visitante);
        if (vinoDelWidget) maqueta = 'nova-widget';
        else if (adaptador === 'personalizado-fcf') maqueta = 'fcf';
        else if (adaptador === 'personalizado-isquad') maqueta = 'isquad';
        else maqueta = 'pnfg-clasica';
      }
      cache.set(kJornada, { archivo, hash: j?.hash ?? null, maqueta, delHtml });
      jornadasVistas.add(`${c.grupo}|${c.jornada}`);
    }
    const info = cache.get(kJornada);
    const maqueta = info.maqueta;

    // Pertenencia estricta: el nombre tiene que SER la palabra de descanso de SU maqueta.
    if (!esPalabraDeDescanso(c.local, maqueta) && !esPalabraDeDescanso(c.visitante, maqueta)) continue;

    // ¿La pareja de esta fila existe como partido en el HTML? ¿Y falta en la cola algún partido del HTML?
    //
    // OJO con el caso «el extractor no ve NADA en esta página»: pasa en Madrid y Valencia, cuyas páginas
    // iSquad no las entiende ni la maqueta clásica ni la del widget. Entonces no hay evidencia en ningún
    // sentido y el resultado es `null` (desconocido), NUNCA `false`. Confundirlos marcaba como «partido
    // desplazado» las 4.072 filas de descanso de Madrid y Valencia, que son exactamente lo que son: el
    // bloque de descanso.
    let parejaExisteEnElHtml = null;
    let hayPartidoDelHtmlAusente = false;
    if (info.delHtml && info.delHtml.length > 0) {
      const igual = (a, b) => normalizaNombreEquipo(separaNombreYEstado(a).nombreEquipo) === normalizaNombreEquipo(separaNombreYEstado(b).nombreEquipo);
      // Para una fila de descanso, que su pareja NO esté en el HTML es lo ESPERADO: el extractor ya la
      // excluye a propósito (`reconoceFilaInformativa`). Tomarlo por un desplazamiento sería un falso
      // positivo del inventario, no un hallazgo. El desplazamiento se mide con los partidos REALES que
      // falten, que es la comprobación de abajo.
      const esFilaDeDescanso = esPalabraDeDescanso(c.local, maqueta) || esPalabraDeDescanso(c.visitante, maqueta);
      parejaExisteEnElHtml = esFilaDeDescanso ? null : info.delHtml.some((p) => igual(p.local, c.local) && igual(p.visitante, c.visitante));
      const filasCola = db.prepare(`select local, visitante from partidos where temporada=? and competicion=? and grupo=? and jornada=?`)
        .all(c.temporada, c.competicion, c.grupo, c.jornada);
      hayPartidoDelHtmlAusente = info.delHtml.some((p) => !filasCola.some((f) => igual(f.local, p.local) && igual(f.visitante, p.visitante)));
    }

    // La pareja que publica el acta, si el acta está en la cola: es la comprobación independiente.
    let parejaDelActa = null;
    let actaDemuestraPartidoReal = null;
    if (c.codigo_acta) {
      const a = db.prepare('select datos from actas where codigo=? and temporada=? and competicion=? and grupo=?')
        .get(c.codigo_acta, c.temporada, c.competicion, c.grupo);
      if (a?.datos) {
        try {
          const d = JSON.parse(a.datos);
          if (d?.local && d?.visitante) {
            parejaDelActa = `${d.local} / ${d.visitante}`;
            // El acta sólo demuestra un partido real si su pareja es legible, NO contiene la palabra de
            // descanso y NO es la misma que la de esta fila. Medido: en Euskadi la acta del bloque de
            // descanso publica «DANOK BAT CLUB / DESCANSA», y en Madrid y Valencia el acta no tiene pareja.
            const actaConDescanso = esPalabraDeDescanso(d.local, maqueta) || esPalabraDeDescanso(d.visitante, maqueta);
            const mismaPareja = normalizaNombreEquipo(separaNombreYEstado(d.local).nombreEquipo) === normalizaNombreEquipo(separaNombreYEstado(c.local).nombreEquipo)
              && normalizaNombreEquipo(separaNombreYEstado(d.visitante).nombreEquipo) === normalizaNombreEquipo(separaNombreYEstado(c.visitante).nombreEquipo);
            actaDemuestraPartidoReal = !actaConDescanso && !mismaPareja;
          } else {
            actaDemuestraPartidoReal = false;
          }
        } catch { actaDemuestraPartidoReal = null; }
      } else if (a) {
        actaDemuestraPartidoReal = false;
      }
    }

    const r = clasificaFilaDeDescanso({
      maqueta,
      local: c.local,
      visitante: c.visitante,
      codigoActa: c.codigo_acta ?? null,
      golesLocal: c.gl ?? null,
      golesVisitante: c.gv ?? null,
      campo: c.campo ?? null,
      arbitro: c.arbitro ?? null,
      filasConLaMismaActa: c.codigo_acta ? (porActa.get(`${c.temporada}|${c.competicion}|${c.grupo}|${c.jornada}|${c.codigo_acta}`) ?? 0) : 0,
      filasConLaMismaPareja: porPareja.get(`${c.temporada}|${c.competicion}|${c.grupo}|${c.jornada}|${c.local}|${c.visitante}`) ?? 0,
      parejaExisteEnElHtml,
      hayPartidoDelHtmlAusente,
      actaDemuestraPartidoReal,
    });

    casos.push({
      federacion, adaptador, maqueta,
      temporada: c.temporada, competicion: c.competicion, grupo: c.grupo, jornada: c.jornada, orden: c.orden,
      literal_local: c.local, literal_visitante: c.visitante,
      codigo_local: c.cl ?? null, codigo_visitante: c.cv ?? null,
      codigo_acta: c.codigo_acta ?? null, marcador: c.gl === null && c.gv === null ? null : `${c.gl ?? '?'}-${c.gv ?? '?'}`,
      fecha: c.fecha ?? null, hora: c.hora ?? null, campo: c.campo ?? null, campo_codigo: c.campo_codigo ?? null,
      arbitro: c.arbitro ?? null,
      archivo_html: info.archivo?.ruta ?? null,
      hash_cola: info.hash,
      hash_archivo: info.archivo ? createHash('sha256').update(info.archivo.contenido).digest('hex') : null,
      pareja_existe_en_el_html: parejaExisteEnElHtml,
      partido_del_html_ausente_en_la_cola: hayPartidoDelHtmlAusente,
      pareja_publicada_por_el_acta: parejaDelActa,
      acta_demuestra_partido_real: actaDemuestraPartidoReal,
      filas_con_la_misma_acta: c.codigo_acta ? (porActa.get(`${c.temporada}|${c.competicion}|${c.grupo}|${c.jornada}|${c.codigo_acta}`) ?? 0) : 0,
      filas_con_la_misma_pareja: porPareja.get(`${c.temporada}|${c.competicion}|${c.grupo}|${c.jornada}|${c.local}|${c.visitante}`) ?? 0,
      clase: r.clase, senales: r.senales, certeza: r.certeza, explicacion: r.explicacion,
    });
  }
  db.close();
  const deEsta = casos.filter((x) => x.federacion === federacion);
  if (deEsta.length) resumenJornadas.push(`${federacion}: ${deEsta.length} casos`);
}

/* ---------------------------------------------------------------- */
/* Informe                                                          */
/* ---------------------------------------------------------------- */
const recuento = recuentaInventario(casos.map((c) => ({ clase: c.clase, federacion: c.federacion, maqueta: c.maqueta, certeza: c.certeza })));
const fallos = compruebaInvariantesDelInventario(casos.map((c) => ({ clase: c.clase, federacion: c.federacion, senales: c.senales })));

mkdirSync(CARPETA_INFORMES, { recursive: true });
const rutaJson = join(CARPETA_INFORMES, 'descansos.inventario.json');
writeFileSync(rutaJson, `${JSON.stringify({ generado_en: new Date().toISOString(), recuento, fallos, casos }, null, 1)}\n`);

const lineas = [];
lineas.push('# Inventario de filas de descanso guardadas como partido', '');
lineas.push(`Generado por \`scripts/inventario-descansos.mjs\`. Total de casos: **${recuento.total}**.`, '');
lineas.push('Una fila puede tener VARIAS señales, pero pertenece a UNA sola clase causal: la más específica.', '');
lineas.push('## Recuento por clase', '', '| clase | casos |', '|---|---:|');
const NOMBRE_CLASE = {
  A: 'descanso informativo puro', B: 'descanso unido a un equipo real', C: 'partido desplazado',
  D: 'duplicado de lectura', E: 'marcador de estado pegado al descanso', F: 'legítimo o no explicado',
};
for (const c of CLASES) lineas.push(`| **${c}** ${NOMBRE_CLASE[c]} | ${recuento.porClase[c]} |`);
lineas.push(`| **total** | **${recuento.total}** |`, '');
lineas.push('## Por federación y maqueta', '', '| federación | casos |', '|---|---:|');
for (const [f, n] of Object.entries(recuento.porFederacion).sort((a, b) => b[1] - a[1])) lineas.push(`| ${f} | ${n} |`);
lineas.push('', '| maqueta | casos |', '|---|---:|');
for (const [m, n] of Object.entries(recuento.porMaqueta).sort((a, b) => b[1] - a[1])) lineas.push(`| ${m} | ${n} |`);
lineas.push('', '| certeza | casos |', '|---|---:|');
for (const [c, n] of Object.entries(recuento.porCerteza)) lineas.push(`| ${c} | ${n} |`);
lineas.push('', '## Señales observadas', '', '| señal | casos |', '|---|---:|');
const porSenal = new Map();
for (const c of casos) for (const s of c.senales) porSenal.set(s, (porSenal.get(s) ?? 0) + 1);
for (const [s, n] of [...porSenal.entries()].sort((a, b) => b[1] - a[1])) lineas.push(`| ${s} | ${n} |`);
lineas.push('', '## Ejemplos por clase', '');
for (const clase of CLASES) {
  const deClase = casos.filter((c) => c.clase === clase);
  if (!deClase.length) continue;
  lineas.push(`### ${clase} · ${NOMBRE_CLASE[clase]} (${deClase.length})`, '');
  for (const c of deClase.slice(0, 5)) {
    lineas.push(`- \`${c.federacion}\` t${c.temporada} c${c.competicion} g${c.grupo} J${c.jornada} ord ${c.orden} · maqueta ${c.maqueta}`);
    lineas.push(`  - «${c.literal_local}» vs «${c.literal_visitante}» · acta ${c.codigo_acta ?? 'NULL'} · marcador ${c.marcador ?? 'NULL'} · campo ${JSON.stringify(c.campo)}`);
    lineas.push(`  - ${c.explicacion}`);
    if (c.pareja_publicada_por_el_acta) lineas.push(`  - el acta dice: ${c.pareja_publicada_por_el_acta}`);
    if (c.partido_del_html_ausente_en_la_cola) lineas.push('  - **falta en la cola un partido que el HTML sí publica en esta jornada**');
  }
  lineas.push('');
}
if (fallos.length) { lineas.push('## INVARIANTES INCUMPLIDOS', ''); for (const f of fallos.slice(0, 20)) lineas.push(`- ${f}`); }
const rutaMd = join(CARPETA_INFORMES, 'descansos.inventario.md');
writeFileSync(rutaMd, `${lineas.join('\n')}\n`);

console.log(`inventario: ${recuento.total} casos`);
console.log(`  por clase: ${CLASES.map((c) => `${c}=${recuento.porClase[c]}`).join(' · ')}`);
console.log(`  por certeza: ${Object.entries(recuento.porCerteza).map(([c, n]) => `${c}=${n}`).join(' · ')}`);
console.log(`  por maqueta: ${Object.entries(recuento.porMaqueta).map(([m, n]) => `${m}=${n}`).join(' · ')}`);
console.log(`  federaciones: ${Object.entries(recuento.porFederacion).map(([f, n]) => `${f}=${n}`).join(' · ')}`);
console.log(`  JSON: ${rutaJson}`);
console.log(`  informe: ${rutaMd}`);
if (fallos.length) { console.error(`✗ invariantes incumplidos:\n  ${fallos.slice(0, 10).join('\n  ')}`); process.exit(1); }
console.log('  invariantes: total = suma de clases ✓');
