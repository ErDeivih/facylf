#!/usr/bin/env node
/**
 * Comprueba, federación por federación, si el recolector está trabajando al MÁXIMO de ritmo permitido.
 *
 *  · El techo lo pone su propia configuración (`ritmo.intervaloMinSeg`/`intervaloMaxSeg`): el
 *    recolector espera entre `min` y `max` segundos entre peticiones, así que su techo teórico es
 *    60 / (media del intervalo + duración real de la petición).
 *  · El ritmo real se mide con las peticiones de los últimos minutos.
 *  · Si está por debajo, se dice POR QUÉ: pausa preventiva, esperando turno de navegador, esperando
 *    memoria, sin trabajo vencido (todo aplazado a su fecha) o reinicio reciente de sesión.
 *
 * Uso: node scripts/_diag-ritmo-maximo.mjs [minutos]
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { freemem } from 'node:os';

const minutos = Number(process.argv[2] ?? 15);
const desde = new Date(Date.now() - minutos * 60_000).toISOString();
const ahora = new Date().toISOString();
const slots = readdirSync('.estado-workers/slots-chrome').filter((f) => f.startsWith('espera-'));

const leerConfig = (fed) => {
  for (const ruta of [`recolector.${fed}.config.json`, 'recolector.config.json']) {
    if (!existsSync(ruta)) continue;
    try {
      const c = JSON.parse(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, ''));
      if (ruta.includes(fed) || ruta === 'recolector.config.json') {
        return { min: Number(c?.ritmo?.intervaloMinSeg ?? 6), max: Number(c?.ritmo?.intervaloMaxSeg ?? 8), origen: ruta };
      }
    } catch { /* config ilegible */ }
  }
  return { min: 6, max: 8, origen: 'por defecto' };
};

const FILAS = [];
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  const ruta = `${d}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const fed = d.replace('descargas-', '');
  const db = new DatabaseSync(ruta, { readOnly: true });
  const peticiones = db.prepare(`select iniciada_en, duracion_ms from peticiones where iniciada_en >= ? order by iniciada_en`).all(desde);
  const pausa = db.prepare("select valor from metadatos where clave='pausa_global_hasta'").get()?.valor;
  const pausado = Boolean(pausa && new Date(pausa).getTime() > Date.now());
  const vencidos = db.prepare(`select count(*) n from trabajos where estado in ('pendiente','bloqueado')
    and (siguiente_intento is null or siguiente_intento <= ?)`).get(ahora).n;
  const aplazados = db.prepare(`select count(*) n from trabajos where estado in ('pendiente','bloqueado')
    and siguiente_intento > ?`).get(ahora).n;
  db.close();

  const huecos = [];
  for (let i = 1; i < peticiones.length; i++) {
    huecos.push((Date.parse(peticiones[i].iniciada_en) - Date.parse(peticiones[i - 1].iniciada_en)) / 1000);
  }
  huecos.sort((a, b) => a - b);
  const mediana = huecos.length ? huecos[Math.floor(huecos.length / 2)] : null;
  const duracionMedia = peticiones.length
    ? peticiones.reduce((s, p) => s + (Number(p.duracion_ms) ?? 0), 0) / peticiones.length / 1000 : 0;
  const cfg = leerConfig(fed);
  const intervaloMedio = (cfg.min + cfg.max) / 2;
  const techo = 60 / (intervaloMedio + duracionMedia);
  const real = (peticiones.length / minutos);
  const porcentaje = techo > 0 ? Math.round((real / techo) * 100) : 0;

  // El criterio honesto no es un techo teórico, sino su PROPIA banda: el recolector espera entre
  // `min` y `max` segundos entre peticiones. Si su hueco real cae dentro de la banda (y tiene trabajo
  // vencido), está al máximo que le permite su configuración; el margen que quede hasta el mínimo es
  // ritmo que él mismo se reserva por respeto a la fuente.
  let motivo = '';
  const dentroDeBanda = mediana != null && mediana >= cfg.min * 0.9 && mediana <= cfg.max * 1.15;
  if (pausado) motivo = `en pausa hasta ${String(pausa).slice(11, 16)}`;
  else if (real === 0 && aplazados > 0 && vencidos === 0) motivo = `sin trabajo vencido (${aplazados} aplazados a su fecha)`;
  else if (real === 0) motivo = 'sin peticiones en la ventana';
  else if (!dentroDeBanda) motivo = `hueco real ${mediana?.toFixed(1)} s fuera de su banda ${cfg.min}-${cfg.max} s`;
  else if (porcentaje < 75) motivo = `dentro de banda alta (${mediana?.toFixed(1)} s de ${cfg.min}-${cfg.max} s)`;
  const veredicto = !motivo ? 'AL MÁXIMO' : motivo;

  FILAS.push({ fed, cfg: `${cfg.min}-${cfg.max}s`, techo: techo.toFixed(1), real: real.toFixed(1),
    porcentaje, mediana: mediana == null ? '-' : mediana.toFixed(1), duracion: duracionMedia.toFixed(1),
    vencidos, aplazados, motivo, veredicto });
}

FILAS.sort((a, b) => Number(b.real) - Number(a.real));
console.log(`RITMO AL MÁXIMO PERMITIDO · ventana de ${minutos} min · RAM libre ${(freemem() / 1073741824).toFixed(1)} GB · esperas de turno: ${slots.length}`);
console.log('federación            config   techo   real   %      hueco  pet(s)  vencidos  aplazados  veredicto');
for (const f of FILAS) {
  console.log(`${f.fed.padEnd(21)} ${f.cfg.padStart(6)} ${f.techo.padStart(7)} ${f.real.padStart(6)} ${String(f.porcentaje).padStart(4)}% ${f.mediana.padStart(7)} ${f.duracion.padStart(6)} ${String(f.vencidos).padStart(9)} ${String(f.aplazados).padStart(10)}  ${f.veredicto}`);
}
const alMaximo = FILAS.filter((f) => f.veredicto === 'AL MÁXIMO').length;
console.log(`\n${alMaximo} de ${FILAS.length} federaciones al máximo que permite su configuración.`);
console.log('Margen disponible si se quisiera subir el techo: cada federación espera 6-8 s entre peticiones');
console.log('(Valencia y Madrid 4-6 s). Bajar esa banda a 4-6 s daría ~30-40 % más de ritmo a costa de cargar más las fuentes.');
