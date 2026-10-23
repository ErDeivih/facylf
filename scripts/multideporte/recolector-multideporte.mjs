#!/usr/bin/env node
/**
 * Recolector multideporte: un adaptador (plataforma) por proceso, sobre el motor común (motor.mjs).
 *
 *   node scripts/multideporte/recolector-multideporte.mjs estado    --adaptador isquad-voleibol
 *   node scripts/multideporte/recolector-multideporte.mjs sembrar   --adaptador isquad-voleibol
 *   node scripts/multideporte/recolector-multideporte.mjs arrancar  --adaptador isquad-voleibol [--max 300]
 *        [--min-seg 5 --max-seg 8] [--continuo]   (continuo: sesiones de --max páginas con 2 min de respiro)
 *
 * Datos: descargas-multideporte/<adaptador>/cola.sqlite y evidencias/ (páginas tal cual, comprimidas).
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { abreCola, encola, ejecutaSesion, resumen } from './motor.mjs';
import { carpetasEvidencias } from './archivo.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : (process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d); };
const orden = process.argv[2];
const nombre = arg('adaptador');
const rutaAdaptador = join(AQUI, 'adaptadores', `${nombre}.mjs`);
if (!nombre || !existsSync(rutaAdaptador)) {
  console.error('Uso: recolector-multideporte.mjs estado|sembrar|arrancar --adaptador <nombre>  (ver scripts/multideporte/adaptadores/)');
  process.exit(2);
}
const adaptador = (await import(pathToFileURL(rutaAdaptador).href)).default;
const dir = join(RAIZ, 'descargas-multideporte', adaptador.nombre);
const db = abreCola(join(dir, 'cola.sqlite'));

function siembra() {
  const semillas = adaptador.semillas({});
  for (const s of semillas) encola(db, adaptador.nombre, s);
  return semillas.length;
}

try {
  if (orden === 'estado') {
    console.log(JSON.stringify(resumen(db, adaptador.nombre), null, 2));
  } else if (orden === 'sembrar') {
    console.log(`${siembra()} semillas encoladas para ${adaptador.nombre}.`);
  } else if (orden === 'arrancar') {
    /*
     * ── UN SOLO TRABAJADOR POR ADAPTADOR (11/10/2026) ───────────────────────────────────────────────────────
     * No había cerrojo: lanzar a mano `arrancar` de un adaptador que el supervisor ya tenía vivo ponía DOS
     * trabajadores pidiendo a los mismos sitios (el doble de peticiones, sin ningún error visible). Ahora el que
     * llega segundo ve el cerrojo de un proceso vivo y se va. Un cerrojo de un proceso muerto se hereda.
     * `estado` y `sembrar` no hacen peticiones y no lo necesitan.
     */
    mkdirSync(dir, { recursive: true });
    const cerrojo = join(dir, 'arrancar.pid');
    const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; } };
    try {
      writeFileSync(cerrojo, String(process.pid), { flag: 'wx' });
    } catch {
      const otro = Number(String(readFileSync(cerrojo, 'utf8')).trim());
      if (otro && otro !== process.pid && vivo(otro)) {
        console.log(`Ya hay un trabajador de ${adaptador.nombre} en marcha (PID ${otro}); este no arranca para no duplicar peticiones.`);
        process.exit(0);
      }
      writeFileSync(cerrojo, String(process.pid));
    }
    process.on('exit', () => {
      try { if (Number(readFileSync(cerrojo, 'utf8')) === process.pid) unlinkSync(cerrojo); } catch { /* ya no está */ }
    });
    for (const senal of ['SIGINT', 'SIGTERM']) process.on(senal, () => process.exit(0));
    // Siempre (es idempotente): así una liga o un tipo de semilla nuevos en el adaptador entran al reiniciar.
    // Hasta el 02/10/2026 sólo se sembraba con la cola vacía y lo añadido después nunca llegaba a pedirse.
    console.log(`${siembra()} semillas comprobadas para ${adaptador.nombre}.`);
    const max = Number(arg('max', 300));
    const minSeg = Math.max(4, Number(arg('min-seg', 5)));   // suelo de 4 s, como la flota
    const maxSeg = Math.max(minSeg, Number(arg('max-seg', 8)));
    do {
      // Las evidencias van donde diga archivo.json (por defecto, junto a la cola, como siempre). Ver archivo.mjs.
      const c = await ejecutaSesion({ db, adaptador, max, minSeg, maxSeg, dirEvidencias: carpetasEvidencias(adaptador.nombre)[0] });
      console.log(`${new Date().toISOString()} ${adaptador.nombre}: ${JSON.stringify(c)}`);
      if (c.parada && c.parada !== null && !process.argv.includes('--continuo')) break;
      if (process.argv.includes('--continuo')) await new Promise((r) => setTimeout(r, c.parada === 'sin trabajo' ? 30 * 60_000 : 120_000));
    } while (process.argv.includes('--continuo'));
  } else {
    console.error('orden desconocida'); process.exitCode = 2;
  }
} finally { db.close(); }
