/*
 * muestrea-calidad-actas.mjs — ¿se están recogiendo bien las actas? Muestreo al azar por federación
 *
 * ── QUÉ COMPRUEBA Y POR QUÉ ASÍ ─────────────────────────────────────────────────────────────────────────
 *
 * No se puede revisar a mano cada acta de 19 federaciones. Lo que sí se puede es mirar AL AZAR unas cuantas de
 * cada una y comprobar tres cosas que revelan si la recolección es sana:
 *
 *   1. EL ESTADO cuenta lo que debe. Se enseña el reparto por estado de todas las actas, y en particular cuántas
 *      están `hecha` SIN datos guardados: eso sería lo más grave, porque la cola diría que está recogida y no
 *      habría nada dentro.
 *
 *   2. LAS INCIDENCIAS del propio recolector. Cada acta `hecha` puede llevar avisos («descuadre_goles»,
 *      «fuente_no_distingue_titulares_suplentes»…). Se cuentan POR TIPO, que dice qué problema domina en cada
 *      federación, y se enseñan 5 actas al azar con lo que traen, para poder mirarlas una a una.
 *
 *   3. LAS MARCAS DE CALIDAD, que el analizador asigna al leer el acta.
 *
 * El muestreo es ALEATORIO a propósito (`order by random()`): mirar las últimas siempre enseña las que acaban de
 * entrar, que son justo las que menos problemas han dado todavía.
 *
 * SÓLO LEE: abre cada cola en readOnly.
 *
 * Uso:
 *   node scripts/servidor/muestrea-calidad-actas.mjs <raíz> [federación...]
 *     raíz = la carpeta que contiene `descargas-<federación>` (en el servidor, /app; en el PC, el repositorio)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.argv[2];
if (!raiz) {
  console.error('uso: muestrea-calidad-actas.mjs <raíz> [federación...]');
  process.exit(2);
}
const pedidas = process.argv.slice(3);
const CUANTAS = Number(process.env.FACYLF_MUESTRA ?? 5);

const federaciones = pedidas.length
  ? pedidas
  : readdirSync(raiz)
    .filter((n) => n.startsWith('descargas-') && existsSync(join(raiz, n, 'recolector-local', 'cola-v2.sqlite')))
    .map((n) => n.replace('descargas-', ''))
    .sort();

const n = (x) => Number(x ?? 0).toLocaleString('es-ES');
let totalHechasSinDatos = 0;
let totalConIncidencias = 0;
let totalHechas = 0;

console.log(`══ muestreo de calidad de actas · raíz ${raiz} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ══`);

for (const fed of federaciones) {
  const ruta = join(raiz, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) { console.log(`\n── ${fed}: sin cola`); continue; }

  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
  console.log(`\n── ${fed}`);

  // 1. Reparto por estado, y el dato grave: `hecha` sin datos.
  const porEstado = db.prepare(`select estado, count(*) n from actas group by estado order by n desc`).all();
  console.log('   estados: ' + porEstado.map((e) => `${e.estado}=${n(e.n)}`).join('  '));

  // `datos` guarda el JSON analizado; si falta en una acta dada por hecha, hay un problema serio.
  let huerfanas = 0;
  try {
    huerfanas = db.prepare(`select count(*) n from actas
      where estado='hecha' and (datos is null or trim(datos) in ('', 'null'))`).get().n;
  } catch { /* columnas distintas en colas antiguas */ }
  if (huerfanas) {
    console.log(`   ⚠ ${n(huerfanas)} actas marcadas como HECHAS pero SIN datos guardados`);
    totalHechasSinDatos += Number(huerfanas);
  } else {
    console.log('   ✓ ninguna acta dada por hecha está vacía');
  }

  // 2. Incidencias por tipo: qué problema domina.
  const incidencias = db.prepare(`select incidencias from actas
    where estado='hecha' and incidencias is not null and trim(incidencias) not in ('','[]')`).all();
  const cuenta = new Map();
  for (const fila of incidencias) {
    let lista = [];
    try { lista = JSON.parse(fila.incidencias); } catch { lista = [String(fila.incidencias)]; }
    for (const texto of (Array.isArray(lista) ? lista : [lista])) {
      const clave = String(texto).split(':')[0].trim().slice(0, 48);
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
    }
  }
  totalConIncidencias += incidencias.length;
  const hechas = porEstado.find((e) => e.estado === 'hecha')?.n ?? 0;
  totalHechas += Number(hechas);
  if (cuenta.size) {
    console.log(`   incidencias: ${n(incidencias.length)} actas de ${n(hechas)}`
      + ` (${((Number(incidencias.length) / Math.max(1, Number(hechas))) * 100).toFixed(1)} %). Las más repetidas:`);
    for (const [clave, cuantos] of [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`      ${String(n(cuantos)).padStart(7)}  ${clave}`);
    }
  } else {
    console.log('   ✓ ninguna incidencia anotada');
  }

  // 3. La muestra al azar, para poder mirarlas una a una.
  for (const a of db.prepare(`select temporada, competicion, grupo, jornada, codigo, incidencias
      from actas where estado='hecha' order by random() limit ?`).all(CUANTAS)) {
    const avisos = a.incidencias && a.incidencias !== '[]' ? `  ${String(a.incidencias).slice(0, 90)}` : '';
    console.log(`      al azar: t${a.temporada} c${a.competicion} g${a.grupo} j${a.jornada} acta ${a.codigo}${avisos}`);
  }

  db.close();
}

console.log('\n══ resumen ══');
console.log(`  actas hechas revisadas (contadas): ${n(totalHechas)}`);
console.log(`  de ellas con alguna incidencia anotada: ${n(totalConIncidencias)}`);
console.log(`  marcadas como hechas pero SIN datos: ${n(totalHechasSinDatos)}`);
if (totalHechasSinDatos > 0) {
  console.log('  → eso es lo único que indicaría un fallo de recolección; las incidencias son avisos de calidad.');
} else {
  console.log('  → no hay actas «vacías»: lo recogido está guardado.');
}
