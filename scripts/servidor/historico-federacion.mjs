#!/usr/bin/env node
/*
 * ── ¿CUÁNTO VARÍA SOLA UNA FEDERACIÓN DE UNA HORA A OTRA? ────────────────────────────────────────────────
 *
 * Antes de decir «este cambio ha subido el ritmo» hay que saber cuánto se mueve el ritmo SIN cambiar nada. Una
 * federación que hace 477 peticiones en una hora y 178 en la siguiente no está rota: tiene trabajo de tipos
 * distintos (una acta pesa 300 KB y un calendario se sirve de una vez) y el importador le retiene la cola a
 * ratos. Sin esta referencia, cualquier experimento de cortesía se atribuiría un cambio que era del trabajo.
 *
 * Imprime una línea por hora con las peticiones de la federación, para ver la dispersión de un vistazo.
 *
 * Uso (dentro de un contenedor, el host no tiene Node):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/historico-federacion.mjs <federación> [horas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'valencia';
const HORAS = Number(process.argv[3] ?? 12);

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(1);
}

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 20_000 });
const desde = new Date(Date.now() - HORAS * 3600_000).toISOString();

// Se agrupa por hora de MADRID, que es la hora a la que se toman las decisiones, no por hora UTC.
const filas = db.prepare(`
  select substr(dia_madrid, 1, 10) dia, cast(substr(iniciada_en, 12, 2) as integer) horaUtc,
         count(*) n, avg(duracion_ms) durMedia
  from peticiones where iniciada_en >= ?
  group by dia, horaUtc order by dia, horaUtc
`).all(desde);

console.log(`peticiones por hora de ${FEDERACION} · últimas ${HORAS} h · (hora de Madrid)\n`);
console.log('  día         horaMadrid  peticiones  dur_media');

const cuenta = [];
for (const f of filas) {
  // `iniciada_en` está en UTC; Madrid va dos horas por delante en septiembre (CEST), así que +2.
  const horaMadrid = (Number(f.horaUtc) + 2) % 24;
  const n = Number(f.n);
  const dur = Number(f.durMedia) / 1000;
  cuenta.push(n);
  console.log(`  ${f.dia}   ${String(horaMadrid).padStart(2, '0')}:00      ${String(n).padStart(6)}   ${dur.toFixed(1)} s`);
}

if (cuenta.length) {
  const orden = [...cuenta].sort((a, b) => a - b);
  const media = cuenta.reduce((a, b) => a + b, 0) / cuenta.length;
  const desviacion = Math.sqrt(cuenta.reduce((a, b) => a + (b - media) ** 2, 0) / cuenta.length);
  console.log(`\n  horas medidas: ${cuenta.length} · mínimo ${orden[0]} · mediana ${orden[Math.floor(orden.length / 2)]}`
    + ` · máximo ${orden[orden.length - 1]}`);
  console.log(`  media ${media.toFixed(0)} pet/h · desviación ${desviacion.toFixed(0)}`
    + ` · coeficiente de variación ${(100 * desviacion / media).toFixed(0)} %`);
  console.log('  Una diferencia menor que esa variación NO se puede atribuir a ningún cambio.');
}

db.close();
