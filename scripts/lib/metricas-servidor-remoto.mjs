/**
 * Sondeo de SÓLO LECTURA que se ejecuta en el servidor para las métricas del panel.
 *
 * No se copia al servidor ni se instala nada: `scripts/metricas-facylf.mjs` manda este texto por
 * `stdin` a `docker exec -i facylf-monitor node --input-type=module -` y lee una única línea JSON.
 * Así el servidor **se queda como está** (ni ficheros nuevos ni cron) y no se toca la ingesta.
 *
 * Devuelve:
 *   { peticiones: <peticiones en la ventana>, porFederacion: {...},
 *     cyl: { temporadas: [{codigo, etiqueta}], competiciones: [{temporada, codigo}] } }
 *
 * La ventana viene en `DESDE`/`HASTA` (ISO) para que el PC y el servidor midan el MISMO intervalo.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const desde = process.env.DESDE ?? new Date(Date.now() - 60_000).toISOString();
const hasta = process.env.HASTA ?? new Date().toISOString();
const salida = { peticiones: 0, porFederacion: {}, errores: [], cyl: null, desde, hasta };

try {
  for (const nombre of readdirSync(RAIZ)) {
    if (!nombre.startsWith('descargas-')) continue;
    const federacion = nombre.replace('descargas-', '');
    if (federacion.startsWith('prueba') || federacion.endsWith('-sondeo')) continue;
    const ruta = join(RAIZ, nombre, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta)) continue;
    let db;
    try {
      db = new DatabaseSync(ruta, { readOnly: true, timeout: 30_000 });
      const n = Number(db.prepare('select count(*) n from peticiones where iniciada_en >= ? and iniciada_en < ?')
        .get(desde, hasta).n ?? 0);
      if (n > 0) salida.porFederacion[federacion] = n;
      salida.peticiones += n;
    } catch (error) {
      // No se traga la cola: si una no se puede leer, el ritmo no es una medición completa y quien
      // llama tiene que enterarse (y no publicar un número más bajo sin avisar).
      salida.errores.push(`${federacion}: ${String(error?.message ?? error).slice(0, 120)}`);
    } finally {
      try { db?.close(); } catch { /* ya cerrada */ }
    }
  }

  const rutaCyl = join(RAIZ, 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(rutaCyl)) throw new Error('el servidor no tiene la cola de CyL (descargas-federacion)');
  const db = new DatabaseSync(rutaCyl, { readOnly: true, timeout: 20_000 });
  try {
    salida.cyl = {
      temporadas: db.prepare('select codigo, etiqueta from temporadas').all(),
      competiciones: db.prepare('select temporada, codigo from competiciones').all(),
    };
  } finally {
    db.close();
  }
} catch (error) {
  salida.error = String(error?.message ?? error);
}

console.log(JSON.stringify(salida));
