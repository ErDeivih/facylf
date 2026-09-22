#!/usr/bin/env node
/*
 * ── ¿HACE FALTA UN NAVEGADOR PARA LEER ESTAS PÁGINAS? ────────────────────────────────────────────────────
 *
 * El recolector abre Chrome, navega y luego lee `document.documentElement.outerHTML`. Eso cuesta segundos de
 * procesador POR PÁGINA (medido: 2-10 s de CPU frente a 0,05 s de las federaciones que van por API). Si el
 * HTML que sirve el portal ya viene entero del servidor —sin que el JavaScript tenga que construirlo—, ese
 * procesador no hace ninguna falta: la misma página se puede traer con una petición normal.
 *
 * Este programa lo comprueba con datos, no por intuición: coge peticiones REALES ya hechas por el recolector
 * (su URL y los bytes que devolvió el navegador, que están guardados en la cola), vuelve a pedir esa misma
 * URL con `fetch` y compara TAMAÑO y CONTENIDO.
 *
 *   · si el HTML coincide (o falta sólo lo que añade el JavaScript), la página es «estática» y el navegador
 *     sobra para leerla;
 *   · si llega vacío o sin los datos, esa página SÍ necesita navegador.
 *
 * Va con la MISMA identidad que el recolector y con pausa entre peticiones: es una comprobación de lectura, no
 * una recolección. Por defecto sólo mira 3 páginas.
 *
 * Uso (dentro de un contenedor, con el repositorio montado):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/prueba-html-sin-navegador.mjs [federación] [cuántas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'andalucia';
const CUANTAS = Number(process.argv[3] ?? 3);
const PAUSA_MS = Number(process.env.FACYLF_PAUSA_MS ?? 3000);

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(1);
}

// La identidad con la que se pide: la misma que usa el recolector, para que la federación vea lo mismo.
let identidad = 'FacylfBot/1.0';
try {
  const cfg = JSON.parse(
    (await import('node:fs')).readFileSync(join(RAIZ, `recolector.${FEDERACION}.config.json`), 'utf8'),
  );
  const contacto = cfg?.identidad?.contacto ?? '';
  identidad = contacto ? `FacylfBot/1.0 (contacto: ${contacto})` : 'FacylfBot/1.0';
} catch { /* sin configuración se usa la identidad mínima */ }

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 20_000 });

/*
 * Se eligen peticiones de acta que salieron BIEN y de las que se sabe cuántos bytes devolvió el navegador:
 * `detalle` guarda «N bytes» y `duracion_ms` cuánto tardó allí. Así la comparación es contra el mismo dato,
 * pedido por el mismo camino, y no contra una suposición.
 */
const filas = db.prepare(`
  select trabajo, url, detalle, duracion_ms from peticiones
  where resultado = 'ok' and trabajo like 'acta|%' and detalle like '% bytes'
  order by id desc limit ?
`).all(CUANTAS * 6);

db.close();

console.log(`prueba de HTML sin navegador · ${FEDERACION} · ${CUANTAS} página(s) · pausa ${PAUSA_MS} ms\n`);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let elegidas = 0;

for (const fila of filas) {
  if (elegidas >= CUANTAS) break;
  const bytesNavegador = Number(String(fila.detalle).match(/(\d+) bytes/)?.[1] ?? 0);
  if (!bytesNavegador) continue;
  elegidas += 1;

  const t0 = Date.now();
  let html = '';
  let error = null;
  try {
    const respuesta = await fetch(fila.url, {
      headers: { 'user-agent': identidad, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    html = await respuesta.text();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const ms = Date.now() - t0;

  console.log(`── ${fila.trabajo}`);
  console.log(`   url: ${fila.url}`);
  if (error) {
    console.log(`   ✗ la petición normal falló: ${error}`);
  } else {
    const bytesCurl = Buffer.byteLength(html, 'utf8');
    const proporcion = bytesNavegador ? (bytesCurl / bytesNavegador) : 0;
    console.log(`   navegador: ${bytesNavegador} bytes en ${(Number(fila.duracion_ms) / 1000).toFixed(1)} s`
      + ` · petición normal: ${bytesCurl} bytes en ${(ms / 1000).toFixed(1)} s`
      + ` (${(100 * proporcion).toFixed(0)} % del tamaño)`);
    /*
     * Las señales de que el HTML sirve tal cual: que traiga las mismas marcas de contenido que el parser
     * necesita. No se compara el texto entero (el navegador añade atributos y el portal mete ruido), se
     * comprueba que están las TABLAS y los encabezados de la ficha.
     */
    const marcas = [
      ['tabla', /<table/i],
      ['marcador o resultado', /\d+\s*[-–]\s*\d+/],
      ['encabezado de alineación', /alineaci|titular|jugador/i],
      ['cuerpo completo', /<\/html>/i],
    ];
    for (const [nombre, re] of marcas) {
      console.log(`   ${re.test(html) ? '✓' : '✗'} ${nombre}`);
    }
  }
  console.log('');
  if (elegidas < CUANTAS) await dormir(PAUSA_MS);
}

if (!elegidas) console.log('no se encontraron peticiones de acta con tamaño registrado en la cola');
