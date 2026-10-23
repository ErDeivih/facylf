#!/usr/bin/env node
/*
 * LIBERA ESPACIO EN EL DISCO DEL SISTEMA BORRANDO TEMPORALES VIEJOS.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────────────────────────────────
 *
 * El 24/09/2026, importando las diecinueve federaciones, `C:` se quedó a 0,4 GB y la importación se paró
 * sola. La conclusión fácil era «el canónico no cabe». No era eso: el disco virtual de Docker apenas había
 * crecido 0,48 GB, mientras que **`%TEMP%` había pasado de 12 GB a 20,45 GB**. El consumidor real eran los
 * perfiles temporales de Chrome (`scoped_dir*`) que van dejando los recolectores: cientos de carpetas de
 * ~100 MB que nadie borra.
 *
 * Medido: borrar lo que tenía más de cuatro horas **liberó 9,27 GB** de golpe. Con eso la importación sigue
 * en lugar de pararse.
 *
 * ── SEGURIDAD ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * · Sólo toca ficheros con más de N horas (4 por defecto). Lo que está en uso **no se puede borrar** y el
 *   error se cuenta, no se fuerza: los recolectores siguen trabajando mientras esto corre.
 * · Nada de `Compartir en uso`: si un proceso lo tiene abierto, se deja.
 * · Informa de lo que ha borrado y de lo que ha liberado. Un borrado que no se mide no se puede revisar.
 *
 * Uso:
 *   node scripts/limpiar-temp.mjs                 # borra lo de más de 4 horas
 *   node scripts/limpiar-temp.mjs --horas 8
 *   node scripts/limpiar-temp.mjs --plan          # sólo dice qué borraría y cuánto ocupa
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Borra de la carpeta de temporales lo que tenga más de `horas` horas.
 *
 * Se exporta para que la importación masiva pueda llamarla cuando se queda sin disco: si el consumidor
 * real es basura temporal, parar la importación para pedir ayuda a una persona sería absurdo.
 *
 * @returns cuántos elementos había, cuántos se borraron, cuántos estaban en uso y cuánto se liberó.
 */
export function limpiaTemporales({ horas = 4, plan = false, temp = process.env.TEMP ?? process.env.TMP } = {}) {
  if (!temp || !existsSync(temp)) return null;
  const corte = Date.now() - horas * 3600_000;
  const candidatos = readdirSync(temp).map((n) => join(temp, n)).filter((ruta) => {
    try { return statSync(ruta).mtimeMs < corte; } catch { return false; }
  });

  const tamano = (ruta) => {
    try {
      const s = statSync(ruta);
      if (!s.isDirectory()) return s.size;
      let total = 0;
      for (const hijo of readdirSync(ruta)) total += tamano(join(ruta, hijo));
      return total;
    } catch { return 0; }
  };
  let bytes = 0;
  for (const ruta of candidatos) bytes += tamano(ruta);

  if (plan) return { temp, candidatos: candidatos.length, bytes, plan: true, borrados: 0, enUso: 0, liberado: 0 };

  let borrados = 0;
  let enUso = 0;
  for (const ruta of candidatos) {
    // Lo que está en uso NO se puede borrar y no se fuerza: los recolectores siguen trabajando.
    try { rmSync(ruta, { recursive: true, force: true, maxRetries: 1 }); borrados += 1; }
    catch { enUso += 1; }
  }
  return { temp, candidatos: candidatos.length, bytes, plan: false, borrados, enUso };
}

/** Espacio libre de la unidad que contiene una ruta, en bytes. */
export function libreDe(ruta) {
  try {
    const salida = execFileSync('powershell', ['-NoProfile', '-Command',
      `(Get-PSDrive ${ruta[0]}).Free`], { encoding: 'utf8' }).trim();
    return Number(salida);
  } catch {
    return null;
  }
}

/* ── CLI ──────────────────────────────────────────────────────────────────────────────────────────── */
const esEjecucionDirecta = process.argv[1]?.replace(/\\/g, '/').endsWith('/limpiar-temp.mjs');
if (esEjecucionDirecta) {
  const argumentos = process.argv.slice(2);
  const arg = (nombre, defecto) => {
    const i = argumentos.indexOf(`--${nombre}`);
    return i >= 0 ? Number(argumentos[i + 1]) : defecto;
  };
  const horas = arg('horas', 4);
  const soloPlan = argumentos.includes('--plan');
  const gb = (n) => `${(n / 1024 ** 3).toFixed(2)} GB`;

  const antes = libreDe(process.env.TEMP ?? 'C:\\');
  const r = limpiaTemporales({ horas, plan: soloPlan });
  if (r === null) { console.error('No se encuentra la carpeta de temporales.'); process.exit(1); }

  console.log(`${r.candidatos} elemento(s) con más de ${horas} h en ${r.temp} · ocupan ${gb(r.bytes)}`);
  if (soloPlan) {
    console.log('--plan: no se borra nada. Vuelve a lanzarlo sin --plan.');
  } else {
    const despues = libreDe(process.env.TEMP ?? 'C:\\');
    console.log(`borrados ${r.borrados} · en uso (no se han tocado) ${r.enUso}`);
    if (antes !== null && despues !== null) console.log(`disco libre: ${gb(antes)} → ${gb(despues)}  (+${gb(despues - antes)})`);
  }
}
