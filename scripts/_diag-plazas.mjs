/*
 * PLAZAS, TURNOS Y ESTIMACIONES: la foto de capacidad de la flota.
 *
 * Responde a las preguntas que se hacen cuando la ingesta tiene que caber en un presupuesto:
 *   · ¿cuántas plazas de navegador hay y cuántas están ocupadas de verdad?
 *   · ¿qué federación tiene cada plaza, desde cuándo, y cuánto le queda de turno?
 *   · ¿quién está esperando turno (ficha en la cola) y desde cuándo?
 *   · ¿a qué ritmo trabaja cada una, cuánto tarda de verdad por trabajo y cuánto le queda?
 *   · ¿cuánta memoria gasta el proyecto y cuánta queda libre?
 *
 * Sólo lee. Uso: node scripts/_diag-plazas.mjs [minutos=60]
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { freemem, totalmem } from 'node:os';
import { repartePlazas, cabeOtroNavegador } from './lib/presupuesto-memoria.mjs';
import { configuracionFlotaLocal } from './lib/configuracion-flota.mjs';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const configuracionFlota = configuracionFlotaLocal(raiz);
const minutos = Number(process.argv[2] ?? 60);
const desde = new Date(Date.now() - minutos * 60000).toISOString();
const carpetaSlots = join(raiz, '.estado-workers', 'slots-chrome');

/* Procesos vivos con su línea de órdenes, para saber quién es cada PID. */
function procesos() {
  const ps = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const salida = execFileSync(ps, ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
    return salida.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf('|');
      return { pid: Number(l.slice(0, i)), linea: l.slice(i + 1) };
    });
  } catch { return []; }
}
const vivos = procesos();
const federacionDePid = (pid) => {
  const p = vivos.find((x) => x.pid === pid);
  if (!p) return null;
  return /perfiles\\?([a-z0-9\-]+)\.json/i.exec(p.linea)?.[1]
    ?? (/recolector-local\.mjs/.test(p.linea) ? 'federacion' : (/recolector-([a-z\-]+)\.mjs/.exec(p.linea)?.[1] ?? '?'));
};
const vivo = (pid) => vivos.some((x) => x.pid === pid);

const reparto = repartePlazas({
  memoriaGb: configuracionFlota.memoriaGb,
  memoriaTotalGb: totalmem() / 1024 ** 3,
});
console.log(`╔═ CAPACIDAD DE LA FLOTA · ventana ${minutos} min`);
console.log(`║  presupuesto: ${reparto.presupuestoTotalGb} GB · para navegadores ${reparto.paraNavegadoresGb} GB · coste ${reparto.costePorRecolectorGb} GB/plaza`);
console.log(`║  PLAZAS: ${reparto.plazas} · memoria libre ${(freemem() / 1024 ** 3).toFixed(2)} GB de ${(totalmem() / 1024 ** 3).toFixed(1)} GB (${reparto.motivo})`);
console.log('╚═');

/* Plazas ocupadas */
const plazas = [];
const fichas = [];
for (const f of existsSync(carpetaSlots) ? readdirSync(carpetaSlots) : []) {
  const ruta = join(carpetaSlots, f);
  if (f.endsWith('.lock')) {
    let pid = null;
    let host = null;
    try {
      const [p, h] = String(readFileSync(ruta, 'utf8')).trim().split(/\s+/);
      pid = Number(p); host = h ?? null;
    } catch { /* ilegible */ }
    plazas.push({ ficha: f, pid, host, viva: pid ? vivo(pid) : false, federacion: pid ? federacionDePid(pid) : null, minutos: Math.round((Date.now() - statSync(ruta).mtimeMs) / 60000) });
  } else if (f.endsWith('.ficha')) {
    fichas.push({ ficha: f, minutos: Math.round((Date.now() - statSync(ruta).mtimeMs) / 60000) });
  }
}
const ocupadas = plazas.filter((p) => p.viva);
console.log(`\nPLAZAS EN USO (${ocupadas.length} de ${reparto.plazas})`);
for (const p of ocupadas.sort((a, b) => b.minutos - a.minutos)) {
  console.log(`  ${p.ficha.padEnd(16)} PID ${String(p.pid).padEnd(7)} ${String(p.federacion ?? '?').padEnd(20)} la tiene desde hace ${p.minutos} min`);
}
const muertas = plazas.filter((p) => !p.viva);
if (muertas.length) console.log(`  (${muertas.length} ficha(s) de plazas con el proceso muerto: se recogen solas)`);
console.log(`\nESPERANDO TURNO: ${fichas.length}`);
for (const f of fichas.sort((a, b) => b.minutos - a.minutos)) console.log(`  ${f.ficha.padEnd(28)} esperando desde hace ${f.minutos} min`);
const hueco = cabeOtroNavegador({
  plazas: reparto.plazas,
  ocupadas: ocupadas.length,
  memoriaLibreGb: freemem() / 1024 ** 3,
  memoriaDeLaMaquinaGb: freemem() / 1024 ** 3,
  reservaDeLaMaquinaGb: configuracionFlota.reservaGb,
});
console.log(`  veredicto del gobernador para una plaza más: ${hueco.cabe ? 'SÍ' : 'NO'} (${hueco.motivo})`);

/* Ritmo y estimación por federación */
console.log(`\nRITMO Y TRABAJO PENDIENTE (ventana ${minutos} min)`);
console.log('  federación            pet.  pet/min  tiempo/trabajo  disponibles   horas estimadas   proceso');
let totalDisponibles = 0;
let totalHorasPonderadas = 0;
for (const carpeta of readdirSync(raiz).filter((n) => n.startsWith('descargas-')).sort()) {
  const base = join(raiz, carpeta, 'recolector-local');
  const ruta = join(base, 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const federacion = carpeta.replace('descargas-', '');
  const db = new DatabaseSync(ruta, { readOnly: true });
  const pet = db.prepare(`select count(*) n from peticiones where iniciada_en >= ?`).get(desde).n;
  const tiempos = db.prepare(`select iniciada_en, duracion_ms from peticiones where iniciada_en >= ? order by iniciada_en`).all(desde);
  const disponibles = db.prepare(`select count(*) n from trabajos where estado='pendiente'
    and (siguiente_intento is null or siguiente_intento <= ?)`).get(new Date().toISOString()).n;
  const hechos = db.prepare(`select count(*) n from trabajos where estado='hecho'`).get().n;
  db.close();
  if (!pet && !disponibles) continue;
  /*
   * ── EL RITMO SE MIDE SOBRE LA VENTANA, NO ENTRE LA PRIMERA Y LA ÚLTIMA PETICIÓN ────────────────────
   *
   * Antes se calculaba con el tramo entre la primera y la última petición (`(última − primera) / (n − 1)`), y
   * una sola pausa larga —una espera de memoria de quince minutos, que es lo normal en el PC compartido—
   * envenenaba la cuenta: medido el 18/09/2026, Andalucía salía a **112 s por trabajo y 960 horas de trabajo
   * pendiente** cuando en realidad estaba trabajando en bucle a siete partidos por jornada. El ritmo honesto es
   * «peticiones de la ventana ÷ minutos de la ventana», y el tiempo por trabajo, la MEDIANA de los huecos (que
   * no la mueve un pico).
   */
  const huecos = [];
  for (let i = 1; i < tiempos.length; i++) {
    huecos.push((new Date(tiempos[i].iniciada_en).getTime() - new Date(tiempos[i - 1].iniciada_en).getTime()) / 1000);
  }
  const mediana = huecos.length ? huecos.slice().sort((a, b) => a - b)[Math.floor(huecos.length / 2)] : null;
  const porMinuto = pet / minutos;
  const segPorPeticion = mediana;
  // Estimación: cada trabajo cuesta ~1,4 peticiones de media; se usa el ritmo medido de la ventana.
  const horas = porMinuto > 0 ? (disponibles / porMinuto) / 60 : null;
  totalDisponibles += disponibles;
  if (horas) totalHorasPonderadas += disponibles;
  const proc = vivos.find((v) => v.linea.includes(`perfiles\\${federacion}.json`) || (federacion === 'federacion' && /recolector-local\.mjs/.test(v.linea) && !v.linea.includes('--perfil')) || v.linea.includes(`recolector-${federacion}.mjs`));
  console.log(`  ${federacion.padEnd(20)} ${String(pet).padStart(4)}  ${porMinuto.toFixed(1).padStart(6)}  ${(segPorPeticion ? segPorPeticion.toFixed(1) + ' s' : '—').padStart(13)}  ${String(disponibles).padStart(11)}   ${(horas ? horas.toFixed(1) + ' h' : '—').padStart(13)}   ${proc ? `PID ${proc.pid}` : 'SIN PROCESO'}${hechos ? '' : ''}`);
}
console.log(`  disponibles en total: ${totalDisponibles} (ponderado ${totalHorasPonderadas})`);
