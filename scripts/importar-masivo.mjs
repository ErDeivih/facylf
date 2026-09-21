#!/usr/bin/env node
/*
 * ── IMPORTACIÓN MASIVA: de las colas al canónico, por tandas y sin pararse en los atasco conocidos ──────
 *
 * El importador hace un grupo por lote (una transacción) y tarda entre 43 s y 2 min por grupo. Con las colas
 * reales hay **del orden de 29 500 unidades** (federación + temporada + grupo): son días de máquina, y por eso
 * esto va por tandas (`--minutos`) con prioridad baja, no de una sentada.
 *
 * Tres decisiones que están en el código, no en la cabeza de quien lo lanza:
 *
 *   1. **Lo reciente primero** (temporada 2026-27, luego 2025-26) y, dentro de eso, los grupos con más actas: es
 *      lo que hace que la plataforma enseñe algo cuanto antes;
 *   2. **La incidencia conocida del calendario y el acta NO para la importación**: la unidad se aparta, queda
 *      listada con su motivo en `estado/importacion.json` y el resto sigue. Saltársela en silencio sería perder
 *      datos de vista, y parar en cada una dejaría la carga a medias para siempre;
 *   3. **Nada se reimporta sin motivo**: lo hecho se salta, lo apartado no se reintenta, y un fallo normal se
 *      reintenta como mucho tres veces. El importador es idempotente, pero la CPU es de todos.
 *
 * Se ejecuta DENTRO del contenedor del importador (que es la imagen de los recolectores: tiene Node, pnpm y el
 * programa), nunca en el host, porque el servidor no tiene Node instalado.
 *
 * Uso:
 *   node scripts/importar-masivo.mjs --minutos 120            # una tanda de dos horas
 *   node scripts/importar-masivo.mjs --federaciones murcia --limite 5
 *   node scripts/importar-masivo.mjs --estado                 # sólo el resumen, sin importar
 *   node scripts/importar-masivo.mjs --seco                   # dice qué haría
 */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  ordenaUnidades, claveDeUnidad, esIncidenciaQueAparta, unidadesPendientes,
  resumenDeImportacion, textoDeApartado,
} from './lib/importacion-masiva.mjs';

const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };

const RAIZ = resolve(process.env.FACYLF_RAIZ ?? '.');
const ESTADO_DIR = process.env.FACYLF_ESTADO_DIR ?? join(RAIZ, 'estado');
const ESTADO = join(ESTADO_DIR, 'importacion.json');
const REGISTRO = join(ESTADO_DIR, 'importacion.log');
const NTFY = process.env.FACYLF_NTFY ?? '';
const MINUTOS = Number(arg('minutos', 0));
const LIMITE = Number(arg('limite', 0));
const SECO = argumentos.includes('--seco');
const SOLO_ESTADO = argumentos.includes('--estado');
const REINTENTAR_APARTADOS = argumentos.includes('--reintentar-apartados');
const PEDIDAS = arg('federaciones', '').split(',').filter(Boolean);

/** Federación de la cola → nombre que espera el importador (sólo uno cambia; ver `origen/cola.ts`). */
const nombreParaImportador = (federacion) => (federacion === 'federacion' ? 'castilla-leon' : federacion);

function lee(ruta, porDefecto) {
  try { return JSON.parse(readFileSync(ruta, 'utf8')); } catch { return porDefecto; }
}
const guarda = (ruta, datos) => { mkdirSync(ESTADO_DIR, { recursive: true }); writeFileSync(ruta, JSON.stringify(datos, null, 2), 'utf8'); };

function anota(mensaje) {
  const linea = `${new Date().toISOString()}  ${mensaje}`;
  try { mkdirSync(ESTADO_DIR, { recursive: true }); appendFileSync(REGISTRO, `${linea}\n`, 'utf8'); } catch { /* sin registro */ }
  console.log(linea);
}

async function avisa(titulo, detalle, prioridad = 'default') {
  if (!NTFY) return;
  try {
    await fetch(NTFY, { method: 'POST', headers: { Title: titulo, Priority: prioridad }, body: detalle });
  } catch { /* el aviso nunca puede tumbar la importación */ }
}

/** Las unidades que hay en las colas: federación + temporada + grupo, con cuántas actas tiene cada una. */
function unidadesDeLasColas() {
  const unidades = [];
  let directorios = [];
  try { directorios = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-')); } catch { return unidades; }
  for (const dir of directorios) {
    const federacion = dir.replace('descargas-', '');
    if (federacion.startsWith('prueba')) continue;
    if (PEDIDAS.length && !PEDIDAS.includes(federacion)) continue;
    const base = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(base)) continue;
    let db;
    try {
      db = new DatabaseSync(base, { readOnly: true });
      /*
       * ── CÓDIGO O ETIQUETA: NO ES LO MISMO ───────────────────────────────────────────────────────────────
       *
       * La cola guarda la temporada por CÓDIGO (`21`, `22`) y el importador se invoca con la ETIQUETA
       * (`2025-26`, `2026-27`): `lote.ts` resuelve `--temporada` con `temporadaPorEtiqueta`. Pasarle el código
       * no falla con un error claro: diría «la federación no tiene la temporada 22» y la carga masiva se
       * quedaría a cero sin avanzar. La traducción se hace aquí, con la tabla `temporadas` de la propia cola.
       */
      const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all()
        .map((t) => [String(t.codigo), String(t.etiqueta)]));

      // Las actas hechas: es lo que alimenta al canónico. `tipo` y las columnas de contexto las escribe el
      // recolector al planificar, así que no hay que interpretar la clave.
      const filas = db.prepare(`select temporada, grupo, count(*) actas from trabajos
        where tipo = 'acta' and estado = 'hecho' and temporada is not null and grupo is not null
        group by 1, 2`).all();
      for (const fila of filas) {
        const codigo = String(fila.temporada);
        const etiqueta = etiquetas.get(codigo);
        if (!etiqueta) {
          anota(`  (aviso) ${federacion}: la temporada ${codigo} no está en la tabla de temporadas de la cola; se salta`);
          continue;
        }
        unidades.push({
          federacion: nombreParaImportador(federacion),
          federacionCola: federacion,
          temporada: etiqueta,
          temporadaCodigo: codigo,
          grupo: String(fila.grupo),
          actas: Number(fila.actas) || 0,
        });
      }
    } catch (error) {
      anota(`no se pudo leer la cola de ${federacion}: ${error.message.slice(0, 120)}`);
    } finally {
      try { db?.close(); } catch { /* ya cerrada */ }
    }
  }
  return ordenaUnidades(unidades);
}

/** Un grupo, con el importador de verdad. Devuelve { ok, filas, salida }. */
function importaUnidad(unidad, { timeoutMs = 20 * 60_000 } = {}) {
  return new Promise((listo) => {
    const orden = spawn('pnpm', ['--filter', '@facylf/canonico', 'importar',
      '--federacion', unidad.federacion, '--temporada', unidad.temporada, '--grupo', unidad.grupo],
    { cwd: RAIZ, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    const recoge = (d) => { salida += d.toString(); };
    orden.stdout.on('data', recoge);
    orden.stderr.on('data', recoge);
    const reloj = setTimeout(() => { try { orden.kill(); } catch { /* ya murió */ } }, timeoutMs);
    orden.on('error', (error) => { clearTimeout(reloj); listo({ ok: false, salida: `no se pudo lanzar: ${error.message}` }); });
    orden.on('close', (codigo) => {
      clearTimeout(reloj);
      const filas = Number(/(\d+)\s*filas?\s*(insertadas|escritas)/i.exec(salida)?.[1] ?? 0);
      listo({ ok: codigo === 0, salida, filas, codigo });
    });
  });
}

async function main() {
  mkdirSync(ESTADO_DIR, { recursive: true });
  const estado = lee(ESTADO, { hechos: {}, apartados: {}, fallos: {} });
  const unidades = unidadesDeLasColas();

  if (SOLO_ESTADO) {
    console.log(JSON.stringify(resumenDeImportacion(estado, unidades), null, 2));
    return;
  }

  const pendientes = unidadesPendientes(unidades, estado, { reintentarApartados: REINTENTAR_APARTADOS });
  const resumen = resumenDeImportacion(estado, unidades);
  anota(`importación masiva · ${unidades.length} unidades en las colas · ${resumen.hechas} hechas · `
    + `${resumen.apartadas} apartadas · ${pendientes.length} pendientes · ${resumen.filasImportadas} filas importadas`);

  if (SECO) {
    console.log(`\nlo siguiente que se importaría (${Math.min(10, pendientes.length)} de ${pendientes.length}):`);
    for (const u of pendientes.slice(0, 10)) {
      console.log(`  ${u.federacion.padEnd(20)} ${u.temporada} grupo ${u.grupo.padStart(10)} · ${u.actas} actas`);
    }
    return;
  }

  const limiteTiempo = MINUTOS > 0 ? Date.now() + MINUTOS * 60_000 : Infinity;
  let hechas = 0;
  let apartadas = 0;
  let fallos = 0;

  for (const unidad of pendientes) {
    if (LIMITE > 0 && hechas + apartadas + fallos >= LIMITE) break;
    if (Date.now() >= limiteTiempo) { anota('tanda agotada por tiempo: se sigue en la siguiente'); break; }

    const clave = claveDeUnidad(unidad);
    const antes = Date.now();
    const resultado = await importaUnidad(unidad);
    const segundos = Math.round((Date.now() - antes) / 1000);

    if (resultado.ok) {
      estado.hechos[clave] = { cuando: new Date().toISOString(), filas: resultado.filas, segundos };
      hechas += 1;
      anota(`hecho ${clave} · ${resultado.filas} filas · ${segundos} s`);
    } else if (esIncidenciaQueAparta(resultado.salida)) {
      // La incidencia conocida: se aparta, se lista y se sigue. Nada de pararlo todo ni de saltárselo callando.
      estado.apartados[clave] = { cuando: new Date().toISOString(), motivo: resultado.salida.slice(-400) };
      apartadas += 1;
      anota(textoDeApartado(unidad, resultado.salida));
    } else {
      const previo = estado.fallos[clave] ?? { intentos: 0 };
      estado.fallos[clave] = { intentos: previo.intentos + 1, cuando: new Date().toISOString(), motivo: resultado.salida.slice(-400) };
      fallos += 1;
      anota(`fallo ${clave} (intento ${previo.intentos + 1}) · ${resultado.salida.slice(-200)}`);
    }

    estado.actualizado = new Date().toISOString();
    guarda(ESTADO, estado);
    guarda(join(ESTADO_DIR, 'importacion-resumen.json'), resumenDeImportacion(estado, unidades));
  }

  const final = resumenDeImportacion(estado, unidades);
  anota(`tanda terminada · hechas ${hechas} · apartadas ${apartadas} · fallos ${fallos} · `
    + `total ${final.hechas}/${final.unidades} (${final.apartadas} apartadas, ${final.pendientes} pendientes)`);
  if (apartadas || fallos) {
    await avisa('facylf: importación con incidencias',
      `Tanda terminada: ${hechas} hechas, ${apartadas} apartadas y ${fallos} fallos.\n`
      + `Detalle: estado/importacion.json (los apartados llevan su motivo).`, 'default');
  }
}

await main();
