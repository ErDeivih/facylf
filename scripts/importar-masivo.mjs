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
 *   1. **Castilla y León primero**. En cada tramo, primero las temporadas recientes y, dentro de ellas,
 *      los grupos con más actas;
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
/* Permite una tanda de temporadas concretas: la cola del PC puede estar por detrás del canónico en la
 * temporada en curso (la trae el servidor) y no debe reimportarla. */
const TEMPORADAS = arg('temporadas', '').split(',').filter(Boolean);

/** Federación de la cola → nombre que espera el importador (sólo uno cambia; ver `origen/cola.ts`). */
/*
 * Todas las carpetas de Castilla y León (federacion, federacion-2 y federacion-3) son la MISMA federación
 * para el importador: son tres colas del mismo reparto por temporadas. Antes solo se traducía `federacion`,
 * así que lo que bajaban el segundo y el tercer navegador no llegaba nunca a la base: 2019-20, 2021-22 y
 * 2023-24 se quedaban clavadas (medido el 20/11/2026) mientras la base no crecía.
 */
const nombreParaImportador = (federacion) =>
  (/^federacion(-[0-9]+)?$/.test(federacion) ? 'castilla-leon' : federacion);

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
        if (TEMPORADAS.length > 0 && !TEMPORADAS.includes(etiqueta)) continue;
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

/**
 * El motivo de un fallo, con las líneas que EXPLICAN algo.
 *
 * Antes se guardaban los últimos 400 caracteres de la salida, y eso es casi siempre el final del resumen
 * («…completa hasta J30 · completa»), no la causa: medido el 25/09/2026, los fallos de Aragón se leían como
 * «fallo aragon|2026-27|23200330 (intento 3) · sificacion.html.gz», un recorte que no dice nada. Ahora se
 * buscan las líneas de error; sólo si no hay ninguna se cae a las últimas.
 */
function motivoDeSalida(salida) {
  const lineas = String(salida).split('\n').map((l) => l.trim()).filter(Boolean);
  /*
   * Primero la causa REAL de que el grupo no entre (01/10/2026): «✗ R1…»/«✗ R4…» son AVISOS de la tabla oficial
   * —el grupo se importa igual, sólo pierde su tabla—, y al salir los primeros tapaban la línea que de verdad
   * revierte el lote («La validación del lote … ha fallado: …» o la lista de GRUPOS QUE NO HAN ENTRADO).
   */
  const causa = lineas.filter((l) => /La validación del lote|NO HAN ENTRADO|^✗ t\d|^✗ (?!R\d)/.test(l));
  if (causa.length) return causa.slice(-4).join('\n').slice(-400);
  const conError = lineas.filter((l) => /✗|error|Error|ERROR|no ha entrado|failed|ENOENT|malformed|timeout|agot/i.test(l));
  return (conError.length ? conError.slice(-6).join('\n') : lineas.slice(-6).join('\n')).slice(-400);
}

/** Un grupo, con el importador de verdad. Devuelve { ok, filas, salida }. */
/*
 * ── 20 MINUTOS SE QUEDABAN CORTOS (01/10/2026) ───────────────────────────────────────────────────────────────
 * Un grupo de Andalucía 2025-26 (~10.000 filas) tardaba 16-20 min el 29/09 y 35-40 min el 30/09, con el
 * servidor a carga 14 sobre 4 núcleos. Con el corte en 20 min se mataba a `pnpm`, pero el `tsx` hijo seguía
 * escribiendo y el grupo acababa entrando… y se contaba como fallo y se repetía tres veces (2 h por grupo).
 * Ahora el corte es configurable y por defecto de 60 min.
 */
const TIMEOUT_GRUPO_MS = Number(process.env.FACYLF_IMPORTAR_TIMEOUT_MIN ?? 60) * 60_000;
/*
 * Windows abre una consola por cada `cmd.exe` intermedio. `pnpm` es un `.cmd`, así que `spawn('pnpm')`
 * y `shell: true` lanzaban cmd.exe por cada grupo y la ventana aparecía mientras David trabajaba
 * (visto 07/11/2026). Se lanza directamente el CLI de tsx con el node actual: ni pnpm, ni shell, ni cmd.
 * En el servidor y en el PC la ruta del paquete es la misma dentro del monorepo.
 */
const TSX_CLI = join(RAIZ, 'packages', 'canonico', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_CANONICO = join(RAIZ, 'packages', 'canonico', 'src', 'cli.ts');
function importaUnidad(unidad, { timeoutMs = TIMEOUT_GRUPO_MS } = {}) {
  return new Promise((listo) => {
    const orden = spawn(process.execPath, [TSX_CLI, CLI_CANONICO,
      '--federacion', unidad.federacion, '--temporada', unidad.temporada, '--grupo', unidad.grupo],
    // Grupo de procesos propio (Linux): al cortar por tiempo hay que matar también al hijo de tsx.
    // En Windows no se usa shell y `windowsHide` evita la consola.
    { cwd: RAIZ, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let salida = '';
    let matadoPorTiempo = false;
    const recoge = (d) => { salida += d.toString(); };
    orden.stdout.on('data', recoge);
    orden.stderr.on('data', recoge);
    const reloj = setTimeout(() => {
      matadoPorTiempo = true;
      try { if (process.platform !== 'win32') process.kill(-orden.pid, 'SIGTERM'); else orden.kill(); }
      catch { try { orden.kill(); } catch { /* ya murió */ } }
    }, timeoutMs);
    orden.on('error', (error) => { clearTimeout(reloj); listo({ ok: false, salida: `no se pudo lanzar: ${error.message}` }); });
    orden.on('close', (codigo) => {
      clearTimeout(reloj);
      const filas = Number(/(\d+)\s*filas?\s*(insertadas|escritas)/i.exec(salida)?.[1] ?? 0);
      /*
       * ── UN CÓDIGO DISTINTO DE CERO NO SIEMPRE ES UN FALLO (arreglado el 25/09/2026) ──────────────────
       *
       * El CLI del canónico sale con 1 cuando la validación de calidad del grupo no es correcta en todos sus
       * grupos (`packages/canonico/src/cli.ts`: `correctos !== informes.length → process.exit(1)`). Es una
       * señal legítima, no un fallo de importación… y el importador masivo la tomaba por fallo, reintentaba
       * el grupo tres veces y lo contaba en «conFallos» **con el grupo ya dentro**. Medido en el servidor:
       *   fallo andalucia|2025-26|45983670 (intento 1) · /30 · partidos 240 … · completa
       *   RESUMEN: 1 grupo(s) · 11506 filas insertadas · 9 actualizadas · 0 rechazadas · validación correcta en 1/1
       *
       * Si el resumen dice que el grupo entró entero y no lo hemos matado por tiempo, el trabajo ESTÁ HECHO:
       * se cuenta como hecho. Reintentarlo no aportaba nada y gastaba la tanda en trabajo ya hecho.
       */
      const resumen = /RESUMEN:[\s\S]*?validación correcta en (\d+)\s*\/\s*(\d+)/.exec(salida);
      const gruposCorrectos = resumen === null ? 0 : Number(resumen[1]);
      const gruposTotales = resumen === null ? 0 : Number(resumen[2]);
      /*
       * Y `0/0` NO cuenta: es el resumen de un grupo que no entró nada («0 filas insertadas … validación
       * correcta en 0/0»), y ahí el 0 = 0 cuadraría y lo daríamos por hecho. Hace falta que haya al menos un
       * grupo validado, que no queden grupos sin entrar, y que no lo hayamos matado por tiempo.
       */
      const entroEntero = gruposCorrectos > 0 && gruposCorrectos === gruposTotales
        && !/GRUPOS QUE NO HAN ENTRADO/.test(salida);
      listo({ ok: codigo === 0 || (entroEntero && !matadoPorTiempo), salida, filas, codigo, matadoPorTiempo, entroEntero });
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
      estado.hechos[clave] = { cuando: new Date().toISOString(), filas: resultado.filas, segundos,
        ...(resultado.codigo === 0 ? {} : { nota: `el grupo entró entero y el proceso salió con código ${resultado.codigo}` }) };
      hechas += 1;
      anota(`hecho ${clave} · ${resultado.filas} filas · ${segundos} s`
        + `${resultado.codigo === 0 ? '' : ` (código ${resultado.codigo}, pero el grupo entró entero)`}`);
    } else if (esIncidenciaQueAparta(resultado.salida)) {
      // La incidencia conocida: se aparta, se lista y se sigue. Nada de pararlo todo ni de saltárselo callando.
      estado.apartados[clave] = { cuando: new Date().toISOString(), motivo: motivoDeSalida(resultado.salida) };
      apartadas += 1;
      anota(textoDeApartado(unidad, resultado.salida));
    } else {
      const previo = estado.fallos[clave] ?? { intentos: 0 };
      // La cabecera dice POR QUÉ se cuenta como fallo (código de salida, corte por tiempo, ¿entró entero?):
      // sin ella, el 30/09 no había forma de distinguirlo desde el registro.
      const cabecera = `[código ${resultado.codigo ?? '—'}${resultado.matadoPorTiempo ? ' · cortado por tiempo' : ''}`
        + `${resultado.entroEntero ? ' · el resumen dice que entró entero' : ''} · ${segundos} s] `;
      const motivo = cabecera + (resultado.matadoPorTiempo
        ? `se agotó el tiempo por grupo (${Math.round(TIMEOUT_GRUPO_MS / 60_000)} min) y se mató el proceso: el grupo es grande o el servidor iba cargado`
        : motivoDeSalida(resultado.salida));
      estado.fallos[clave] = { intentos: previo.intentos + 1, cuando: new Date().toISOString(), motivo };
      fallos += 1;
      anota(`fallo ${clave} (intento ${previo.intentos + 1}) · ${motivo.slice(0, 200)}`);
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
