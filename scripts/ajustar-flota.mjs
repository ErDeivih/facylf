#!/usr/bin/env node
/*
 * AJUSTAR LA FLOTA: que la recolección ocupe lo que necesita, ni más ni menos.
 *
 * El problema que resuelve. En un servidor de 10 GB, la flota arranca con las diecisiete federaciones levantadas
 * y el gobernador de plazas repartiendo los navegadores. Eso está bien mientras hay trabajo: la cola entera son
 * cientos de miles de peticiones y el cuello de botella es la máquina. Pero según las federaciones van terminando
 * —y terminan: cada una tiene su cola y su fecha— quedan contenedores despiertos sin nada que hacer, ocupando
 * memoria que necesita el resto del servidor (la web, el importador, la base de datos). Lo que se le pide a este
 * guion es exactamente eso: **que la recolección vaya soltando capacidad según acaba**, y que la vuelva a coger
 * sola cuando le toque.
 *
 * Qué hace, en una pasada:
 *   1. lee la cola de cada federación (trabajo disponible ahora, aplazado, pausa, cupo diario);
 *   2. decide si su contenedor debe estar levantado (`lib/estado-cola.mjs`, la misma decisión que usa el
 *      supervisor para saber cuándo relanzar el worker: un solo criterio);
 *   3. informa de la memoria que ocupa cada contenedor y cuánta queda del presupuesto declarado;
 *   4. con `--aplicar`, para los que no tienen nada que hacer y levanta los que vuelven a tener trabajo.
 *
 * Seguro por defecto: sin `--aplicar` no toca nada, sólo dice lo que haría. Y una federación cuya cola no se
 * puede leer no se toca nunca: desconocido no es cero.
 *
 * Uso:
 *   node scripts/ajustar-flota.mjs                     # informe (qué haría)
 *   node scripts/ajustar-flota.mjs --aplicar           # lo aplica
 *   node scripts/ajustar-flota.mjs --json
 *   node scripts/ajustar-flota.mjs --solo euskadi,valencia
 *
 * En el servidor, en el cron cada quince minutos (una pasada es idempotente: no hay idas y venidas porque una
 * federación con trabajo a menos de dos horas no se para).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { leeEstadoDeCola, decideFlota } from './lib/estado-cola.mjs';
import {
  interpretaComposePs, puedeActuar, serviciosDeComposeJson, serviciosDeComposeYaml,
} from './lib/compose-flota.mjs';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const aplicar = argumentos.includes('--aplicar');
const enJson = argumentos.includes('--json');
const rutaCompose = resolve(arg('compose', join(raiz, 'docker', 'compose.yml')));
const horizonteMs = Number(arg('horizonte-h', 2)) * 3600_000;
const memoriaDeclaradaGb = Number(arg('memoria-gb', process.env.FACYLF_MEMORIA_GB ?? 10));
const solo = String(arg('solo', '')).split(',').map((f) => f.trim()).filter(Boolean);
const rutaPlan = resolve(arg('salida', join(raiz, 'pruebas', 'reconstruccion', 'flota-plan.json')));
const carpetaDatos = join(dirname(rutaCompose), '..');

const docker = (args, timeout = 120000) => {
  try { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout }); }
  catch (error) { return String(error.stdout ?? ''); }
};

/** Los servicios de recolección del compose, con su federación (de la propia configuración de Compose). */
function serviciosDeRecoleccion() {
  if (!existsSync(rutaCompose)) {
    throw new Error(`no existe el compose: ${rutaCompose}`);
  }
  /*
   * Con `--solo` se piden TODOS los perfiles: así se puede ajustar una federación que vive en un perfil (la de
   * prueba, por ejemplo) sin que eso la meta en el ajuste normal del servidor. Sin `--solo`, la lista es la del
   * arranque de verdad, que es lo que se quiere vigilar.
   */
  const perfiles = solo.length ? ['--profile', '*'] : [];
  const comoJson = docker(['compose', '-f', rutaCompose, ...perfiles, 'config', '--format', 'json'], 180000).trim();
  if (comoJson.startsWith('{')) {
    try { return serviciosDeComposeJson(JSON.parse(comoJson)); } catch { /* se prueba en YAML */ }
  }
  const comoYaml = docker(['compose', '-f', rutaCompose, ...perfiles, 'config'], 180000);
  const servicios = serviciosDeComposeYaml(comoYaml);
  if (servicios.length === 0) throw new Error('el compose no tiene servicios de recolección reconocibles');
  return servicios;
}

/** ¿Está vivo el demonio de Docker? Sin esto no se sabe qué contenedores hay, y a ciegas no se toca nada. */
function versionDelDemonio() {
  const salida = docker(['version', '--format', '{{.Server.Version}}'], 30000).trim();
  return /^\d+\./.test(salida) ? salida : null;
}

/** Estado de los contenedores de la flota, por servicio. Sólo los que llevan la etiqueta de Compose. */
function estadoDeContenedores(serviciosDeLaFlota) {
  const salida = docker(['ps', '-a', '--format',
    '{{.Names}}|{{.State}}|{{.Status}}|{{.Label "com.docker.compose.service"}}']);
  const filas = salida.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [nombre, state, status, servicio] = l.split('|');
    return JSON.stringify({ Name: nombre, Service: servicio, State: state, Status: status });
  });
  // Sólo los servicios de ESTA flota: en la misma máquina hay otras cosas (el canónico, el importador) y su
  // memoria no es la de la recolección. Contarla daría un «memoria medida» que no habla de lo que se ajusta.
  const estado = interpretaComposePs(filas.join('\n'));
  return new Map([...estado.entries()].filter(([servicio]) => serviciosDeLaFlota.has(servicio)));
}

/** Memoria que está usando ahora mismo cada contenedor de la flota (cgroups, la cuenta de Docker). */
function memoriaPorContenedor(nombres) {
  if (nombres.length === 0) return new Map();
  const salida = docker(['stats', '--no-stream', '--format', '{{.Name}}|{{.MemUsage}}', ...nombres], 180000);
  const memoria = new Map();
  for (const linea of salida.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [nombre, uso] = linea.split('|');
    memoria.set(nombre, String(uso ?? '').split('/')[0].trim());
  }
  return memoria;
}

const enGb = (texto) => {
  const valor = Number(String(texto ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(valor)) return null;
  return /GiB/i.test(texto) ? valor : valor / 1024;
};

let servicios;
try {
  servicios = serviciosDeRecoleccion();
} catch (error) {
  console.error(`No se puede ajustar la flota: ${error.message}`);
  process.exit(2);
}
if (solo.length) servicios = servicios.filter((s) => solo.includes(s.federacion));

// Primero el demonio: si no contesta, ni se pregunta por los contenedores (una consulta que se queda colgada dos
// minutos para acabar en «ninguno» es peor que saber desde el principio que no se sabe).
const versionDocker = versionDelDemonio();
const demonioVivo = versionDocker !== null;
const contenedores = demonioVivo
  ? estadoDeContenedores(new Set(servicios.map((s) => s.servicio)))
  : new Map();
const entradas = servicios.map(({ servicio, federacion }) => {
  const rutaCola = join(carpetaDatos, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  return { federacion, servicio, estado: leeEstadoDeCola(rutaCola) };
});
const decisiones = decideFlota(entradas, { horizonteMs });
const porServicio = new Map(decisiones.map((d) => [d.servicio, d]));

// ── El informe ────────────────────────────────────────────────────────────────────────────────────────────
const enMarcha = [...contenedores.entries()].filter(([, c]) => c.enMarcha).map(([, c]) => c.nombre).filter(Boolean);
const memoria = memoriaPorContenedor(enMarcha);
let memoriaEnMarchaGb = 0;
for (const nombre of enMarcha) {
  const gb = enGb(memoria.get(nombre));
  if (gb !== null) memoriaEnMarchaGb += gb;
}

const filas = decisiones.map((d) => {
  const contenedor = contenedores.get(d.servicio);
  return {
    federacion: d.federacion,
    servicio: d.servicio,
    decision: d.accion,
    motivo: d.motivo,
    disponibleAhora: d.listos,
    pendientes: d.pendientes,
    reanudarEn: d.reanudarEn,
    contenedor: contenedor?.nombre ?? null,
    enMarcha: Boolean(contenedor?.enMarcha),
    memoria: contenedor?.enMarcha ? (memoria.get(contenedor.nombre) ?? null) : null,
  };
});

const aParar = filas.filter((f) => f.decision === 'abajo' && f.enMarcha);
const aLevantar = filas.filter((f) => f.decision === 'arriba' && f.contenedor && !f.enMarcha);
// Sin saber qué contenedores hay, «no tiene contenedor» es mentira: no se dice nada de eso.
const sinContenedor = demonioVivo
  ? filas.filter((f) => f.decision === 'arriba' && !f.contenedor)
  : [];
const terminadas = filas.filter((f) => f.decision === 'abajo' && !f.enMarcha);
const sinDatos = filas.filter((f) => f.decision === 'no-tocar');

if (!enJson) {
  console.log(`flota de recolección · ${filas.length} federaciones · presupuesto declarado ${memoriaDeclaradaGb} GB`
    + ` · horizonte ${horizonteMs / 3600_000} h${aplicar ? '' : ' · SÓLO INFORME (--aplicar para actuar)'}`);
  if (!demonioVivo) {
    console.log('  ⚠ el demonio de Docker no responde: no se sabe qué contenedores están en marcha.'
      + ' Las decisiones de trabajo son válidas, pero el estado de los contenedores no.');
  }
  console.log('');
  const cabecera = ['federación', 'decisión', 'ahora', 'pendientes', 'próximo trabajo', 'contenedor', 'memoria', 'motivo'];
  console.log(cabecera.map((c, i) => c.padEnd([12, 8, 7, 11, 21, 11, 9, 0][i] || 0)).join(' '));
  for (const f of filas) {
    console.log([
      f.federacion.padEnd(12),
      f.decision.padEnd(8),
      String(f.disponibleAhora ?? '?').padEnd(7),
      String(f.pendientes ?? '?').padEnd(11),
      (f.reanudarEn ? f.reanudarEn.slice(0, 16).replace('T', ' ') : '—').padEnd(21),
      (f.enMarcha ? 'en marcha' : (f.contenedor ? 'parado' : '—')).padEnd(11),
      String(f.memoria ?? '—').padEnd(9),
      f.motivo,
    ].join(' '));
  }
  console.log('');
}

// ── Actuar (sólo con --aplicar y sólo sobre contenedores que ya existen) ───────────────────────────────────
const permiso = puedeActuar({ demonioVivo, decisiones });
const acciones = [];
if (aplicar && !permiso.ok) {
  console.error(`No se aplica ningún cambio: ${permiso.motivo}`);
  process.exitCode = 3;
} else if (aplicar) {
  if (aParar.length) {
    docker(['compose', '-f', rutaCompose, 'stop', ...aParar.map((f) => f.servicio)], 600000);
    acciones.push(`parados ${aParar.length}: ${aParar.map((f) => f.federacion).join(', ')}`);
  }
  if (aLevantar.length) {
    docker(['compose', '-f', rutaCompose, 'start', ...aLevantar.map((f) => f.servicio)], 600000);
    acciones.push(`levantados ${aLevantar.length}: ${aLevantar.map((f) => f.federacion).join(', ')}`);
  }
} else {
  if (aParar.length) acciones.push(`se pararían ${aParar.length}: ${aParar.map((f) => f.federacion).join(', ')}`);
  if (aLevantar.length) acciones.push(`se levantarían ${aLevantar.length}: ${aLevantar.map((f) => f.federacion).join(', ')}`);
}

const resumen = {
  cuando: new Date().toISOString(),
  aplicado: aplicar && permiso.ok,
  demonioDocker: { vivo: demonioVivo, version: versionDocker },
  horizonteHoras: horizonteMs / 3600_000,
  memoriaDeclaradaGb,
  memoriaEnMarchaGb: Number(memoriaEnMarchaGb.toFixed(2)),
  contenedoresEnMarcha: enMarcha.length,
  federaciones: filas.length,
  decisiones: {
    arriba: filas.filter((f) => f.decision === 'arriba').length,
    abajo: filas.filter((f) => f.decision === 'abajo').length,
    'no-tocar': sinDatos.length,
  },
  terminadas: terminadas.map((f) => f.federacion),
  sinContenedor: sinContenedor.map((f) => f.federacion),
  sinDatos: sinDatos.map((f) => ({ federacion: f.federacion, motivo: f.motivo })),
  acciones,
  plan: filas,
};
mkdirSync(dirname(rutaPlan), { recursive: true });
writeFileSync(rutaPlan, `${JSON.stringify(resumen, null, 2)}\n`);

if (enJson) {
  console.log(JSON.stringify(resumen, null, 2));
} else {
  console.log(demonioVivo
    ? `  contenedores en marcha: ${enMarcha.length} · memoria medida: ${memoriaEnMarchaGb.toFixed(2)} GB`
      + ` de ${memoriaDeclaradaGb} GB declarados`
    : '  contenedores: estado DESCONOCIDO (el demonio de Docker no responde)');
  console.log(`  federaciones: ${resumen.decisiones.arriba} con trabajo, ${resumen.decisiones.abajo} sin nada que hacer`
    + ` (${terminadas.length} ya terminadas), ${sinDatos.length} sin datos`);
  for (const linea of acciones) console.log(`  · ${linea}`);
  if (sinContenedor.length) {
    console.log(`  · sin contenedor creado (habría que levantarlas con docker compose up -d): ${sinContenedor.map((f) => f.federacion).join(', ')}`);
  }
  console.log(`  plan guardado en ${rutaPlan}`);
}
