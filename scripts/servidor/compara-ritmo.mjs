// ¿Se piden más páginas ahora o antes? Con el histórico del monitor (una línea por minuto).
//
// `peticionesVentana` cuenta las peticiones INICIADAS en los últimos 30 minutos (lo dice el propio monitor:
// `UMBRALES.minutosVentanaFallos`), así que peticiones/minuto = peticionesVentana / 30. Y como la foto se toma
// cada minuto, promediar esas ventanas solapadas da el ritmo sin depender de un minuto concreto.
import { readFileSync } from 'node:fs';

const ruta = process.argv[2];
const filas = readFileSync(ruta, 'utf8').trim().split('\n')
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean)
  .map((f) => ({ ...f, ms: Date.parse(f.cuando) }))
  .sort((a, b) => a.ms - b.ms);

const VENTANA_MIN = 30;
// Madrid es UTC+2 en septiembre.
const madrid = (ms) => new Date(ms + 2 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

console.log(`histórico: ${filas.length} fotos · de ${madrid(filas[0].ms)} a ${madrid(filas[filas.length - 1].ms)} (hora de Madrid)\n`);

/** Un tramo = filas consecutivas con la misma «forma» (misma memoria declarada, redondeada a 0,5 GB). */
const tramos = [];
for (const f of filas) {
  const memoria = f.memoriaGb === null ? null : Math.round(f.memoriaGb * 2) / 2;
  const ultimo = tramos[tramos.length - 1];
  // Un hueco de más de 20 minutos corta el tramo: entre medias el monitor no estaba mirando.
  if (!ultimo || ultimo.memoria !== memoria || f.ms - ultimo.ultimaMs > 20 * 60_000) {
    tramos.push({ memoria, desdeMs: f.ms, ultimaMs: f.ms, filas: [f] });
  } else {
    ultimo.ultimaMs = f.ms;
    ultimo.filas.push(f);
  }
}

const media = (arr, k) => {
  const vals = arr.map((f) => f[k]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};
const fmt = (v, d = 0) => (v === null ? '—' : v.toFixed(d));
const horas = (ms) => ((ms - filas[0].ms) / 3600_000).toFixed(1);

console.log('  desde (Madrid)   hasta            min  memoria  pidiendo  pet/ventana  pet/min  pet/fed·min  pendientes');
for (const t of tramos) {
  if (t.filas.length < 3) continue;   // menos de 3 minutos no es un tramo, es un parpadeo
  const pidiendo = media(t.filas, 'federacionesPidiendo');
  const ventana = media(t.filas, 'peticionesVentana');
  const pendientes = t.filas[t.filas.length - 1].pendientes;
  console.log(`  ${madrid(t.desdeMs)}  ${madrid(t.ultimaMs).slice(11)}  ${String(t.filas.length).padStart(4)}  `
    + `${String(t.memoria).padStart(6)} GB  ${fmt(pidiendo, 1).padStart(8)}  ${fmt(ventana).padStart(11)}  `
    + `${fmt(ventana / VENTANA_MIN, 1).padStart(7)}  ${fmt(pidiendo ? ventana / VENTANA_MIN / pidiendo : null, 1).padStart(12)}  `
    + `${String(pendientes).padStart(10)}`);
}

// Y el balance de trabajo: cuánto pendiente se ha consumido en cada mitad del histórico.
console.log('\n── balance de trabajo pendiente ──');
const mitad = Math.floor(filas.length / 2);
for (const [nombre, trozo] of [['primera mitad', filas.slice(0, mitad)], ['segunda mitad', filas.slice(mitad)]]) {
  const a = trozo[0], b = trozo[trozo.length - 1];
  const horasTramo = (b.ms - a.ms) / 3600_000;
  const petMin = media(trozo, 'peticionesVentana') / VENTANA_MIN;
  const consumido = a.pendientes - b.pendientes;
  console.log(`  ${nombre}: ${horasTramo.toFixed(1)} h · ${fmt(petMin, 1)} pet/min · pendientes ${a.pendientes} → ${b.pendientes} `
    + `(${consumido >= 0 ? 'baja' : 'sube'} ${Math.abs(consumido).toLocaleString('es-ES')})`);
}

console.log('\n── las horas de hoy, una a una ──');
const porHora = new Map();
for (const f of filas) {
  const h = madrid(f.ms).slice(0, 13);
  if (!porHora.has(h)) porHora.set(h, []);
  porHora.get(h).push(f);
}
for (const [h, grupo] of porHora) {
  const pidiendo = media(grupo, 'federacionesPidiendo');
  const petMin = media(grupo, 'peticionesVentana') / VENTANA_MIN;
  const mem = media(grupo, 'memoriaGb');
  const pico = Math.max(...grupo.map((f) => f.picoGb ?? 0));
  console.log(`  ${h}:00  ${String(grupo.length).padStart(2)} fotos · pidiendo ${fmt(pidiendo, 1).padStart(4)} · `
    + `${fmt(petMin, 1).padStart(5)} pet/min · memoria ${fmt(mem, 1).padStart(4)} GB (pico ${fmt(pico, 1)}) · `
    + `fallos ${fmt(media(grupo, 'fallosVentana'), 1)}`);
}
