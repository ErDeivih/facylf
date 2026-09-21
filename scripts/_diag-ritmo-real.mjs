/*
 * ¿POR QUÉ VA A ESTE RITMO? Mide, en una ventana, dónde se va el tiempo de cada recolector.
 *
 * De la propia cola salen dos cosas que se confunden con facilidad:
 *   · el HUECO entre una petición y la siguiente (ritmo respetuoso + trabajo local del worker);
 *   · lo que DURA cada petición (la carga de la página).
 * Si la suma de duraciones es pequeña y los huecos son enormes, el freno no es la fuente ni la red: es el
 * worker. Y del registro se cuentan los reciclados de navegador, las limpiezas y los mantenimientos locales,
 * que son los sospechosos de comerse esos huecos.
 *
 * Sólo lee. Uso: node scripts/_diag-ritmo-real.mjs [minutos=60]
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const minutos = Number(process.argv[2] ?? 60);
const desde = new Date(Date.now() - minutos * 60000).toISOString();
const mediana = (v) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : null);

console.log(`═══ ritmo real por federación · últimos ${minutos} min (${desde} → ahora)`);
console.log(`    peticiones | hueco mediano entre peticiones | duración mediana | % de la ventana pidiendo | reciclados/limpiezas/mantenimientos en el registro`);

for (const carpeta of readdirSync(raiz).filter((n) => n.startsWith('descargas-')).sort()) {
  const base = join(raiz, carpeta, 'recolector-local');
  const ruta = join(base, 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const federacion = carpeta.replace('descargas-', '');
  const db = new DatabaseSync(ruta, { readOnly: true });
  const filas = db.prepare(`select iniciada_en, duracion_ms from peticiones where iniciada_en >= ? order by iniciada_en`).all(desde);
  db.close();
  if (filas.length < 2) continue;

  const tiempos = filas.map((f) => new Date(f.iniciada_en).getTime());
  const huecos = [];
  for (let i = 1; i < tiempos.length; i++) huecos.push((tiempos[i] - tiempos[i - 1]) / 1000);
  const duraciones = filas.map((f) => Number(f.duracion_ms ?? 0) / 1000);
  const ocupado = duraciones.reduce((a, b) => a + b, 0);
  const ventana = (tiempos[tiempos.length - 1] - tiempos[0]) / 1000 || 1;

  const registro = join(base, 'worker-programado.log');
  let reciclados = 0; let limpiezas = 0; let mantenimientos = 0; let arranques = 0;
  if (existsSync(registro)) {
    const lineas = readFileSync(registro, 'utf8').split('\n');
    for (const l of lineas.slice(-4000)) {
      if (l.includes('reciclado de Chrome tras')) reciclados++;
      else if (l.includes('limpieza del navegador')) limpiezas++;
      else if (l.includes('Mantenimiento local posterior') || l.includes('mantenimiento local:')) mantenimientos++;
      else if (l.includes('Arrancando o reanudando')) arranques++;
    }
  }

  console.log(`\n  ${federacion}`);
  console.log(`    ${String(filas.length).padStart(4)} peticiones · hueco mediano ${mediana(huecos)?.toFixed(1) ?? '?'} s (p90 ${huecos.slice().sort((a, b) => a - b)[Math.floor(huecos.length * 0.9)]?.toFixed(1)} s · máximo ${Math.max(...huecos).toFixed(0)} s)`);
  console.log(`    duración mediana ${mediana(duraciones)?.toFixed(1) ?? '?'} s · tiempo pidiendo ${ocupado.toFixed(0)} s de ${ventana.toFixed(0)} s = ${Math.round((ocupado / ventana) * 100)} %`);
  console.log(`    en las últimas 4.000 líneas del registro: ${arranques} arranques de sesión · ${reciclados} reciclados de Chrome · ${limpiezas} limpiezas · ${mantenimientos} mantenimientos locales`);
  console.log(`    ritmo efectivo: ${(filas.length / (ventana / 60)).toFixed(1)} peticiones/min · teórico con pausa de 6-8 s: ~8/min`);
}
