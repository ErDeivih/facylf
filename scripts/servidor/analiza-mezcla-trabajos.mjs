#!/usr/bin/env node
/*
 * ── ¿QUÉ SE ESTÁ PIDIENDO? (la mezcla de trabajo manda el coste por página) ───────────────────────────────
 *
 * El ritmo de la flota no dice nada por sí solo. Medido el 23/09/2026: a las 00:15 la máquina hacía 64,5
 * peticiones/min con 3,9 núcleos ocupados (3,64 s de procesador por petición) y a las 12:15 hacía 46,6 con 3,7
 * núcleos (4,77 s por petición). El procesador era el mismo; lo que había cambiado era QUÉ se pedía.
 *
 * Y tiene sentido: una jornada de un grupo es una página, y un ACTA son 112-380 KB con su parser y sus
 * escrituras. No cuesta lo mismo. Así que comparar dos ritmos separados en el tiempo sin mirar la mezcla de
 * trabajos es comparar cosas distintas — y es una trampa fácil de cometer al leer «el ritmo subió o bajó».
 *
 * Esto cuenta las peticiones de la última ventana por TIPO de trabajo, para poder decir «se hicieron X actas y
 * Y jornadas» en vez de sólo «Z peticiones».
 *
 * Uso (dentro de un contenedor):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/analiza-mezcla-trabajos.mjs [minutos]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const MINUTOS = Number(process.argv[2] ?? 60);
const desde = new Date(Date.now() - MINUTOS * 60_000).toISOString();

const federaciones = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo'))
  .sort();

const porTipo = new Map();
let total = 0;
let segundos = 0;

for (const federacion of federaciones) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 30_000 });
    // El tipo de trabajo va al principio de la clave: «acta|21|...» o «jornada|22|...».
    const filas = db.prepare(`select trabajo, count(*) n, sum(duracion_ms) ms from peticiones
      where iniciada_en >= ? group by substr(trabajo, 1, instr(trabajo || '|', '|') - 1)`).all(desde);
    for (const f of filas) {
      const tipo = String(f.trabajo ?? '').split('|')[0] || '(sin tipo)';
      if (!porTipo.has(tipo)) porTipo.set(tipo, { n: 0, ms: 0 });
      const acumulado = porTipo.get(tipo);
      acumulado.n += Number(f.n);
      acumulado.ms += Number(f.ms ?? 0);
      total += Number(f.n);
      segundos += Number(f.ms ?? 0) / 1000;
    }
  } catch { /* cola ilegible: se omite */ } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}

console.log(`mezcla de trabajo · últimos ${MINUTOS} min · ${total} peticiones\n`);
console.log('  tipo de trabajo              peticiones      %      dentro de la petición');
for (const [tipo, v] of [...porTipo.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${tipo.padEnd(24)} ${String(v.n).padStart(8)}   ${(100 * v.n / (total || 1)).toFixed(0).padStart(4)} %   `
    + `${(v.ms / 1000 / v.n).toFixed(2).padStart(7)} s de media`);
}

// OJO con este número: es la suma del tiempo de TODAS las federaciones a la vez, así que puede superar el
// reloj. Con 19 federaciones pidiendo en paralelo, 114 min de suma en 30 min de reloj significa que de media
// había 3,8 federaciones dentro de una petición a la vez. No es un porcentaje del reloj; es carga acumulada.
console.log(`\n  tiempo acumulado DENTRO de las peticiones (las 19 federaciones juntas): `
  + `${(segundos / 60).toFixed(1)} min en ${MINUTOS} min de reloj`);
console.log('  Suma entre federaciones concurrentes, así que puede pasar del reloj: es carga acumulada, no un');
console.log('  porcentaje. Con 19 federaciones en paralelo, X min de suma significa X/' + MINUTOS + ' federaciones');
console.log('  ocupadas a la vez de media.');
console.log('  Una acta pesa mucho más que una jornada: para comparar dos ritmos separados en el tiempo hay que');
console.log('  mirar esta tabla, no sólo el número de peticiones por minuto.');
