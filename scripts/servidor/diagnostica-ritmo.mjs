#!/usr/bin/env node
/*
 * ¿POR QUÉ CADA FEDERACIÓN HACE TAN POCAS PETICIONES?
 *
 * Cada federación es UNA pestaña: pide una página, la analiza, guarda y espera el turno para la siguiente. Si
 * cada página tarda 25 s de reloj, el techo de esa federación es 2,4 peticiones/min haga lo que haga la máquina.
 * Este programa mira las peticiones de la última hora en cada cola y dice cuánto duran, para distinguir:
 *
 *   · **espera del portal** (la petición tarda mucho pero nuestro procesador está ocioso) → el techo lo pone el
 *     portal y el único camino es más pestañas en paralelo;
 *   · **trabajo nuestro** (la petición tarda mucho porque analizar y guardar cuesta) → se optimiza el análisis.
 *
 * Se ejecuta DENTRO de un contenedor con la imagen del recolector (el host no tiene Node) y con el repositorio
 * montado:
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/diagnostica-ritmo.mjs [minutos]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const MINUTOS = Number(process.argv[2] ?? 60);
const desde = new Date(Date.now() - MINUTOS * 60_000).toISOString();

const federaciones = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo'))
  .sort();

/** Mediana y percentiles de una lista de números. */
function percentil(ordenados, p) {
  if (!ordenados.length) return null;
  const i = Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length));
  return ordenados[i];
}

console.log(`peticiones de los últimos ${MINUTOS} min · ${federaciones.length} federaciones\n`);
console.log('  federación            pet  dur_media  hueco_med  seg_dentro  %reloj  sesiones/h  esperas_plaza/h  pend_acta');

/**
 * Cuenta en el registro del recolector cuántas veces ha arrancado sesión y cuántas ha tenido que esperar plaza.
 *
 * Importa porque el trabajador NO está siempre pidiendo: entre petición y petición hay la pausa de cortesía, y
 * además la sesión del navegador se cierra cada N trabajos (para reciclar Chrome). Cada arranque de sesión
 * cuesta un Chrome nuevo y, en el lanzador del contenedor, una espera mínima de 20 s. Si eso pasa muchas veces
 * por hora, el hueco entre peticiones no lo manda la cortesía, lo mandan los reinicios.
 */
function cuentaEnRegistro(federacion, minutos) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'worker-programado.log');
  if (!existsSync(ruta)) return null;
  // Se leen sólo las últimas 200 KB: la ventana de minutos está de sobra ahí y el fichero crece sin fin.
  const tamano = statSync(ruta).size;
  const desde = Math.max(0, tamano - 200 * 1024);
  const trozo = readFileSync(ruta, 'utf8').slice(desde);
  const cuenta = (re) => (trozo.match(re) ?? []).length;
  return {
    arranques: cuenta(/Arrancando o reanudando la ingesta/g),
    plazas: cuenta(/esperando para abrir Chrome|no cabe por reparto/g),
    reciclados: cuenta(/sesión limitada a|sesion limitada a/g),
    minutosDelTrozo: minutos,
  };
}

let totalPet = 0;
const duracionesGlobales = [];
for (const federacion of federaciones) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 20_000 });
    const filas = db.prepare('select ini.iniciada_en t, ini.duracion_ms d, ini.resultado r from peticiones ini where ini.iniciada_en >= ? order by ini.iniciada_en').all(desde);
    const duraciones = filas.map((f) => Number(f.d)).filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
    const errores = filas.filter((f) => String(f.r ?? '').startsWith('error')).length;
    const sumaMs = duraciones.reduce((a, b) => a + b, 0);
    duracionesGlobales.push(...duraciones);
    totalPet += filas.length;

    // Hueco entre peticiones consecutivas: es lo que de verdad limita el ritmo de cada federación.
    const huecos = [];
    for (let i = 1; i < filas.length; i += 1) {
      const h = (Date.parse(filas[i].t) - Date.parse(filas[i - 1].t)) / 1000;
      if (Number.isFinite(h) && h >= 0) huecos.push(h);
    }
    huecos.sort((a, b) => a - b);

    const pendientesActa = db.prepare("select count(*) n from trabajos where tipo = 'acta' and estado in ('pendiente','bloqueado')").get().n;
    const registro = cuentaEnRegistro(federacion, MINUTOS);
    const porHora = (n) => (n === null ? '—' : (n * 60 / MINUTOS).toFixed(1));

    const media = duraciones.length ? sumaMs / duraciones.length / 1000 : null;
    const reloj = MINUTOS * 60;
    console.log(`  ${federacion.padEnd(22)} ${String(filas.length).padStart(4)}  `
      + `${media === null ? '    —' : media.toFixed(1).padStart(7)}  `
      + `${(percentil(huecos, 50) ?? 0).toFixed(1).padStart(9)}  `
      + `${String(Math.round(sumaMs / 1000)).padStart(10)}  `
      + `${(duraciones.length ? (100 * sumaMs / 1000 / reloj) : 0).toFixed(0).padStart(5)} %  `
      + `${String(registro ? registro.arranques * 60 / MINUTOS : '—').padStart(11)}  `
      + `${(registro ? porHora(registro.plazas) : '—').padStart(16)}  `
      + `${String(pendientesActa).padStart(9)}`);
  } catch (error) {
    console.log(`  ${federacion.padEnd(22)} no se pudo leer: ${error.message.slice(0, 60)}`);
  } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}

duracionesGlobales.sort((a, b) => a - b);
const mediaGlobal = duracionesGlobales.length
  ? duracionesGlobales.reduce((a, b) => a + b, 0) / duracionesGlobales.length / 1000 : null;
console.log(`\n  total de peticiones: ${totalPet} · ritmo agregado: ${(totalPet / MINUTOS).toFixed(1)} pet/min`);
if (mediaGlobal !== null) {
  console.log(`  duración media global: ${mediaGlobal.toFixed(1)} s · mediana ${(percentil(duracionesGlobales, 50) / 1000).toFixed(1)} s `
    + `· p95 ${(percentil(duracionesGlobales, 95) / 1000).toFixed(1)} s`);
  console.log(`  «% del reloj» es la fracción del tiempo que esa federación está DENTRO de una petición: `
    + `si es bajo, espera entre peticiones o espera plaza.`);
}
