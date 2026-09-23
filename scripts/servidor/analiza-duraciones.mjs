#!/usr/bin/env node
/*
 * ── ¿HAY PETICIONES QUE SE CUELGAN? ──────────────────────────────────────────────────────────────────────
 *
 * El análisis de huecos dice que un tercio o más del reloj se va en espacios de más de un minuto. Y se han
 * descartado dos explicaciones fáciles: las sesiones duran 160-220 trabajos con esperas de supervisor de 20 s
 * (o sea que no son relevos), y las federaciones tienen decenas de miles de trabajos DISPONIBLES (o sea que no
 * es falta de trabajo).
 *
 * Queda una pregunta directa: **¿cuánto tarda cada petición?** La tabla `peticiones` guarda `duracion_ms` de
 * cada una, así que si unas pocas se cuelgan —una página que nunca termina de cargar, una espera del bloqueo
 * de la cola— se verá aquí, y con su URL y su tipo de trabajo, que es lo que permite arreglarlo.
 *
 * El `pageLoad` de Selenium está en 30 s y `busy_timeout` de SQLite en 120 s: cualquiera de los dos puede
 * producir exactamente este síntoma, y se distinguen por el tipo de trabajo y por si la URL es del portal.
 *
 * Uso (dentro de un contenedor):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/analiza-duraciones.mjs [federación] [horas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'andalucia';
const HORAS = Number(process.argv[3] ?? 3);

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(2);
}

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 30_000 });
const desde = new Date(Date.now() - HORAS * 3600_000).toISOString();
const filas = db.prepare(`select trabajo, url, iniciada_en, duracion_ms, resultado, detalle
  from peticiones where iniciada_en >= ? order by iniciada_en`).all(desde);
db.close();

if (!filas.length) {
  console.log(`${FEDERACION}: sin peticiones en ${HORAS} h`);
  process.exit(0);
}

const duraciones = filas.map((f) => Number(f.duracion_ms ?? 0)).filter((d) => Number.isFinite(d) && d >= 0)
  .sort((a, b) => a - b);
const p = (q) => duraciones[Math.min(duraciones.length - 1, Math.floor(q * duraciones.length))];
const suma = duraciones.reduce((a, b) => a + b, 0);

console.log(`══ ${FEDERACION} · ${filas.length} peticiones · últimas ${HORAS} h ══\n`);
console.log(`  duración de una petición:  mediana ${(p(0.5) / 1000).toFixed(1)} s · `
  + `p90 ${(p(0.9) / 1000).toFixed(1)} s · p99 ${(p(0.99) / 1000).toFixed(1)} s · `
  + `máxima ${(duraciones[duraciones.length - 1] / 1000).toFixed(1)} s`);
console.log(`  suma de todas:             ${(suma / 60000).toFixed(1)} min\n`);

console.log('  ── cuánto tiempo se va en peticiones lentas ──');
console.log('  umbral           cuántas     tiempo total     % del tiempo en peticiones');
for (const umbral of [15, 30, 60, 120]) {
  const lentas = filas.filter((f) => Number(f.duracion_ms ?? 0) >= umbral * 1000);
  const total = lentas.reduce((a, f) => a + Number(f.duracion_ms ?? 0), 0);
  console.log(`  >= ${String(umbral).padStart(3)} s       ${String(lentas.length).padStart(7)}     `
    + `${(total / 60000).toFixed(1).padStart(7)} min      ${(100 * total / (suma || 1)).toFixed(0).padStart(4)} %`);
}

// Y las diez peores, con su tipo de trabajo: ahí se ve si es el portal o algo nuestro.
console.log('\n  ── las 10 peticiones más lentas ──');
console.log('  duración   tipo de trabajo                                       resultado');
for (const f of [...filas].sort((a, b) => Number(b.duracion_ms ?? 0) - Number(a.duracion_ms ?? 0)).slice(0, 10)) {
  const tipo = String(f.trabajo ?? '(sin trabajo)').split('|')[0];
  console.log(`  ${(Number(f.duracion_ms) / 1000).toFixed(1).padStart(7)} s   ${tipo.padEnd(20)} `
    + `${String(f.resultado ?? '').padEnd(18)} ${String(f.detalle ?? '').slice(0, 40)}`);
}

// ¿Y los resultados distintos de 'ok'? Un fallo que se repite cuesta tiempo y no trae nada.
console.log('\n  ── resultados ──');
for (const f of dbResultados(filas)) {
  console.log(`  ${String(f.resultado).padEnd(20)} ${String(f.n).padStart(6)}   media `
    + `${(Number(f.media) / 1000).toFixed(1)} s`);
}

function dbResultados(lista) {
  const porResultado = new Map();
  for (const f of lista) {
    const clave = String(f.resultado ?? '(sin resultado)');
    if (!porResultado.has(clave)) porResultado.set(clave, { resultado: clave, n: 0, suma: 0 });
    const r = porResultado.get(clave);
    r.n += 1;
    r.suma += Number(f.duracion_ms ?? 0);
  }
  return [...porResultado.values()].map((r) => ({ ...r, media: r.suma / r.n }))
    .sort((a, b) => b.n - a.n);
}
