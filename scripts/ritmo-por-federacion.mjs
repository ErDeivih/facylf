#!/usr/bin/env node
/*
 * RITMO POR FEDERACIÓN: lo configurado frente a lo que de verdad se mide.
 *
 * Cada federación tiene su ritmo en `recolector.<federación>.config.json` (`ritmo.intervaloMinSeg`,
 * `ritmo.intervaloMaxSeg`): es la pausa entre peticiones, la parte que se controla como respeto a la fuente. Lo que
 * este guion responde es la pregunta de todos los días: **¿va cada una al ritmo que tiene puesto, o se está
 * quedando por el camino?**
 *
 * Y de paso dice POR QUÉ no pide, cuando no pide: entre sesiones, esperando turno de navegador, esperando memoria
 * o con el cupo del día gastado. «No pide» y «está averiada» no son lo mismo.
 *
 * Mide la PAUSA (del final de una petición al inicio de la siguiente), que es lo comparable con el intervalo
 * configurado; la página (duración) se informa aparte porque es tiempo del portal, no del programa.
 *
 * Uso:  node scripts/ritmo-por-federacion.mjs [--minutos 30] [--json]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const minutos = Number(arg('minutos', 30));
const enJson = argumentos.includes('--json');
const desde = new Date(Date.now() - minutos * 60_000).toISOString();

const mediana = (valores) => {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.floor(orden.length / 2)];
};

const federaciones = readdirSync(raiz).filter((n) => n.startsWith('descargas-'))
  .map((n) => ({ federacion: n.replace('descargas-', ''), base: join(raiz, n, 'recolector-local') }))
  .filter((f) => existsSync(join(f.base, 'cola-v2.sqlite')))
  .sort((a, b) => a.federacion.localeCompare(b.federacion));

const filas = [];
for (const { federacion, base } of federaciones) {
  // 1. Lo configurado (si no hay config propia, se usan los valores por defecto del recolector).
  let config = null;
  try { config = JSON.parse(readFileSync(join(raiz, `recolector.${federacion}.config.json`), 'utf8')).ritmo; } catch { /* por defecto */ }
  const minSeg = Number(config?.intervaloMinSeg ?? 6);
  const maxSeg = Number(config?.intervaloMaxSeg ?? 8);
  const esperado = ((minSeg + maxSeg) / 2) * 1000;

  // 2. Lo medido.
  const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });
  const uno = (sql, ...a) => { try { return db.prepare(sql).get(...a) ?? {}; } catch { return {}; } };
  const peticiones = db.prepare('select iniciada_en, duracion_ms, resultado from peticiones where iniciada_en >= ? order by iniciada_en')
    .all(desde);
  const hechos = uno("select count(*) n from trabajos where estado='hecho'").n ?? 0;
  const pendientes = uno("select count(*) n from trabajos where estado in ('pendiente','bloqueado')").n ?? 0;
  const disponibles = uno(`select count(*) n from trabajos where estado in ('pendiente','bloqueado')
    and (siguiente_intento is null or siguiente_intento <= ?)`, new Date().toISOString()).n ?? 0;
  const cupo = uno("select valor from metadatos where clave='diario_max'").valor ?? null;
  const pausa = uno("select valor from metadatos where clave='pausa_global_hasta'").valor ?? null;
  const salida = uno("select valor from metadatos where clave='ultima_salida_motivo'").valor ?? null;
  const ultimaPeticion = uno('select max(iniciada_en) m from peticiones').m ?? null;
  db.close();

  /*
   * ── QUÉ SE COMPARA CON EL INTERVALO CONFIGURADO (y qué no) ────────────────────────────────────────────
   *
   * El recolector garantiza que **entre el INICIO de una petición y el inicio de la siguiente** pasen al menos
   * `intervaloMinSeg` (más un jitter hasta el máximo): el ritmo respetuoso es un suelo sobre el intervalo entre
   * peticiones, no una pausa añadida al final. Por eso lo que se compara con lo configurado es el hueco
   * INICIO→INICIO. Si se mira el hueco FIN→INICIO (la «pausa» a secas) sale casi cero en cuanto las páginas tardan
   * más que el intervalo, y se saca la conclusión contraria a la verdad: medido el 20/09/2026, el conjunto daba
   * «pausa 0,5 s = 8 % de lo configurado» cuando el intervalo real entre peticiones era de 6-7 s, justo lo puesto.
   */
  const intervalos = [];
  const pausas = [];
  for (let i = 1; i < peticiones.length; i++) {
    const inicioAnterior = Date.parse(peticiones[i - 1].iniciada_en);
    const finAnterior = inicioAnterior + (Number(peticiones[i - 1].duracion_ms) || 0);
    const inicio = Date.parse(peticiones[i].iniciada_en);
    intervalos.push(inicio - inicioAnterior);
    if (inicio - finAnterior >= 0) pausas.push(inicio - finAnterior);
  }
  const paginas = peticiones.map((p) => Number(p.duracion_ms) || 0).filter((x) => x > 0);
  const intervaloMediano = mediana(intervalos);
  const pausaMediana = mediana(pausas);
  const paginasMediana = mediana(paginas);
  const ritmo = peticiones.length / minutos;
  const techo = paginasMediana ? 60_000 / (esperado + paginasMediana) : null;

  // 3. Estado: por qué no pide cuando no pide.
  let estado = 'trabajando';
  if (!peticiones.length) {
    if (pausa && pausa > new Date().toISOString()) estado = `en pausa hasta ${pausa.slice(11, 16)}Z`;
    else if (disponibles > 0 && salida === 'memoria') estado = 'esperando memoria';
    else if (disponibles > 0 && salida === 'turno') estado = 'esperando turno';
    else if (disponibles > 0) estado = 'parada con trabajo pendiente';
    else estado = 'entre sesiones (sin trabajo disponible)';
  }
  filas.push({
    federacion, configuradoSeg: `${minSeg}-${maxSeg}`,
    intervaloInicioSeg: intervaloMediano === null ? null : Number((intervaloMediano / 1000).toFixed(1)),
    cumplimiento: intervaloMediano === null ? null : Math.round((intervaloMediano / esperado) * 100),
    pausaSeg: pausaMediana === null ? null : Number((pausaMediana / 1000).toFixed(1)),
    paginaMs: paginasMediana === null ? null : Math.round(paginasMediana),
    peticiones: peticiones.length, porMinuto: Number(ritmo.toFixed(2)),
    techoPorMinuto: techo === null ? null : Number(techo.toFixed(2)),
    hechos, pendientes, disponibles, cupoDia: cupo, estado, ultimaPeticion,
    /*
     * OJO CON CONFUNDIR «NO ES OK» CON «FALLA». `sin_publicar` es una respuesta legítima del portal (el grupo
     * existe pero aún no tiene calendario), y en Cataluña es la mayoría de lo que se pide en un rato: contarlo
     * como error da un informe alarmante y falso (medido el 21/09/2026: salían «61 mal» de 63 peticiones cuando
     * el único error real era 1). Aquí se cuentan aparte.
     */
    errores: peticiones.filter((p) => /^error/.test(String(p.resultado ?? ''))).length,
    sinPublicar: peticiones.filter((p) => p.resultado === 'sin_publicar').length,
  });
}

if (enJson) {
  console.log(JSON.stringify({ cuando: new Date().toISOString(), minutos, filas }, null, 2));
} else {
  console.log(`═══ ritmo por federación · últimos ${minutos} min · ${new Date().toISOString().slice(11, 19)}Z`);
  console.log('  federación          config   inicio→inicio  %cfg   (pausa)  página    pet  pet/min  techo  err  sinpub  estado');
  for (const f of filas) {
    console.log(`  ${f.federacion.padEnd(18)} ${f.configuradoSeg.padEnd(8)}`
      + ` ${String(f.intervaloInicioSeg ?? '—').padStart(10)} s ${String(f.cumplimiento ?? '—').padStart(6)}`
      + ` ${String(f.pausaSeg ?? '—').padStart(7)} s ${String(f.paginaMs ?? '—').padStart(7)} ms ${String(f.peticiones).padStart(5)}`
      + ` ${String(f.porMinuto).padStart(7)} ${String(f.techoPorMinuto ?? '—').padStart(6)}`
      + ` ${String(f.errores).padStart(4)} ${String(f.sinPublicar).padStart(7)}  ${f.estado}`);
  }
  const total = filas.reduce((a, f) => a + f.peticiones, 0);
  const techo = filas.reduce((a, f) => a + (f.techoPorMinuto ?? 0), 0);
  const trabajando = filas.filter((f) => f.peticiones > 0).length;
  const pidiendo = filas.filter((f) => f.intervaloInicioSeg !== null);
  const cumplen = pidiendo.filter((f) => f.cumplimiento >= 80 && f.cumplimiento <= 120).length;
  const excedidas = pidiendo.filter((f) => f.cumplimiento > 120).length;
  console.log(`\n  ${trabajando} de ${filas.length} pidiendo · ${total} peticiones = ${(total / minutos).toFixed(1)} pet/min`
    + ` (techo de esas federaciones: ${techo.toFixed(1)} pet/min)`);
  console.log(`  intervalo inicio→inicio en el rango configurado (80-120 %): ${cumplen} de ${pidiendo.length}`
    + ` · por encima (piden más despacio de lo configurado): ${excedidas}`);
  console.log('  (lo que se compara con el intervalo es el INICIO→INICIO, que es lo que el recolector garantiza;'
    + ' «pausa» es el hueco tras la página, que se acorta cuando el portal tarda)');
}
