#!/usr/bin/env node
/*
 * ── ¿QUÉ CUESTA EL TRABAJO LOCAL DEL ARRANQUE DE SESIÓN? ─────────────────────────────────────────────────
 *
 * Medido con `mide-arranque-sesion.mjs`: desde «Arrancando o reanudando la ingesta» hasta la PRIMERA petición
 * pasan **3,6 minutos de mediana en Andalucía** (hasta 7,3) y 1,9 en Galicia. En ese rato el worker escribe en
 * el registro, en este orden:
 *
 *     Plan local preparado: 4 temporadas y 3288 competiciones candidatas.     ← preparaPlan
 *       · Preparando vigilancia y ámbito de actas (trabajo local).            ← preparaVigilanciaActual + …
 *       · Revisando calendario futuro y jornadas recientes (trabajo local).   ← aplazaFuturoTemporadaActual + …
 *       · Temporada actual: 4529 jornadas futuras y 131 clasificaciones …
 *       · sesión limitada a 240 trabajos para reciclar Chrome …
 *     → acta|…                                                                ← primera petición
 *
 * Y entre esas líneas y la primera petición hay más cosas que no escriben nada: `reprioritizaPlan`, pedir plaza
 * de navegador y ABRIR CHROME. Sin saber cuál de todas manda no se puede arreglar nada, así que aquí se
 * cronometran las que se pueden medir SIN escribir: las consultas de lectura.
 *
 * ── POR QUÉ SÓLO LAS LECTURAS ────────────────────────────────────────────────────────────────────────────
 *
 * Porque las otras son UPDATE y esto corre sobre la cola VIVA: medirlas sería tocarla. Las lecturas, en cambio,
 * son exactamente las que hacen el trabajo pesado de `reprioritizaPlan` (una lectura con dos JOIN sobre TODOS
 * los trabajos pendientes) y de `aplazaFuturoTemporadaActual`.
 *
 * Uso (dentro de un contenedor):
 *   docker run --rm -v /srv/data/facylf:/app -v /srv/ssd/facylf:/srv/ssd/facylf \
 *     --entrypoint node facylf-recolectores:local /app/scripts/servidor/mide-arranque-local.mjs [federación…]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACIONES = process.argv.slice(2).length ? process.argv.slice(2) : ['andalucia', 'galicia', 'murcia'];

/** Cronometra una función y devuelve los milisegundos. */
function cronometra(fn) {
  const t = process.hrtime.bigint();
  const r = fn();
  return [Number(process.hrtime.bigint() - t) / 1e6, r];
}

console.log('  federación            trabajos   LEER todos   calcular   TOTAL arranque local');
for (const federacion of FEDERACIONES) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) { console.log(`  ${federacion.padEnd(20)} (no existe la cola)`); continue; }

  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 30_000 });

    /*
     * Ésta es, palabra por palabra, la consulta de `reprioritizaPlan`: una lectura con dos JOIN sobre TODOS los
     * trabajos pendientes, bloqueados o en curso. Es el trabajo pesado del arranque y por eso se mide aparte.
     */
    const SQL_REPRIORIZA = `select t.clave,t.tipo,t.temporada,t.prioridad,
        coalesce(c.nombre,'') competicionNombre,coalesce(g.nombre,'') grupoNombre
      from trabajos t
      left join competiciones c on c.temporada=t.temporada and c.codigo=t.competicion
      left join grupos g on g.temporada=t.temporada and g.competicion=t.competicion and g.codigo=t.grupo
      where t.estado in ('pendiente','bloqueado','en_curso')`;

    const leer = db.prepare(SQL_REPRIORIZA);
    const [msLeer, filas] = cronometra(() => leer.all());

    // Y el cálculo que hace después con esas filas, en JavaScript: es lo que decide si merece la pena
    // cambiarlas de prioridad. Se reproduce la misma función para que el tiempo sea comparable.
    const basePrioridad = (comp, grupo) => {
      const t = `${comp} ${grupo}`.toLowerCase();
      if (/preferente|primera|division de honor|honor/.test(t)) return 10;
      if (/segunda|autonomica/.test(t)) return 30;
      if (/copa|eliminatoria/.test(t)) return 60;
      return 120;
    };
    const [msCalcular] = cronometra(() => {
      let cambiados = 0;
      for (const f of filas) {
        const base = basePrioridad(f.competicionNombre, f.grupoNombre);
        const codigoTemporada = Number(f.temporada);
        const antiguedad = Number.isFinite(codigoTemporada) ? Math.max(0, 100 - codigoTemporada) : 100;
        const nuevo = base * 1_000_000 + antiguedad * 10_000;
        if (nuevo !== f.prioridad) cambiados += 1;
      }
      return cambiados;
    });

    db.close();
    console.log(`  ${federacion.padEnd(20)} ${String(filas.length).padStart(9)}   `
      + `${(msLeer / 1000).toFixed(2).padStart(8)} s   ${(msCalcular / 1000).toFixed(2).padStart(6)} s   `
      + `${((msLeer + msCalcular) / 1000).toFixed(2).padStart(8)} s`);
  } catch (error) {
    console.log(`  ${federacion.padEnd(20)} no se pudo medir: ${String(error.message).slice(0, 40)}`);
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}

console.log('\n  «LEER todos» es la lectura de `reprioritizaPlan`; «calcular» es el bucle de prioridades que hace');
console.log('  después con esas filas. Si entre las dos suman minutos, ése es el agujero del arranque de sesión —');
console.log('  y se arregla NO repitiéndolo en cada arranque, que es lo que hace hoy.');
