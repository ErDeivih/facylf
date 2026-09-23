#!/usr/bin/env node
/*
 * ── ¿EN QUÉ SE VA DE VERDAD EL TIEMPO DE CADA TRABAJO? ──────────────────────────────────────────────────
 *
 * Lee el fichero que escribe el recolector cuando se le pone `FACYLF_PERF=1`
 * (`descargas-<fed>/recolector-local/perf-fases.jsonl`, una línea por trabajo) y reparte el ciclo entre fases.
 *
 * Para qué sirve, en una frase: **decidir el siguiente cambio con datos**. Cada fase se arregla de una manera
 * distinta y ninguna sirve para las demás:
 *
 *   · si manda `cortesia`      → se toca el ritmo por federación (apartado B del traspaso);
 *   · si manda `red_render`    → el enemigo es el portal o Chrome, y la salida es abaratar la página
 *                                (bloquear recursos, o dejar de renderizar);
 *   · si manda `analisis_guardado` → hay que mirar el análisis, la compresión o las escrituras en SQLite;
 *   · si manda `cierre`        → está en el reciclado de Chrome o en el mantenimiento local, no en la red.
 *
 * Y una comprobación que evita engañarse: el ciclo medio que sale de aquí tiene que parecerse al que se mide
 * desde fuera (`mide-huecos.mjs`, que sólo mira la tabla `peticiones`). Si no se parecen, la instrumentación
 * se ha dejado tiempo fuera y hay que arreglarla antes de creerse nada.
 *
 * Uso (dentro de un contenedor, el host no tiene Node):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/analiza-fases.mjs [federación|todas] [minutos]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const QUE = process.argv[2] ?? 'todas';
const MINUTOS = Number(process.argv[3] ?? 240); // la ventana por defecto cubre una sesión entera

/** El orden en que se le enseña al lector, que es el orden real del ciclo. */
const ORDEN_FASES = [
  'cierre', 'consulta', 'marcar_en_curso', 'preparacion', 'cortesia',
  'red_render',
  // Dentro de lo que pasa DESPUÉS de tener la página, que es donde está el 55 % del ciclo medido en Murcia:
  'acta_guardar_html', 'acta_analizar', 'acta_decisiones', 'acta_calidad',
  'acta_guardar_json', 'acta_estructura',
  'analisis_guardado', 'cola_del_bucle',
];

const QUE_EXPLICA = {
  cierre: 'cola del trabajo anterior: marcaTrabajo, reciclado de Chrome, mantenimiento',
  consulta: 'elegir el siguiente trabajo (siguienteTrabajo)',
  marcar_en_curso: 'marcar el trabajo como en curso',
  preparacion: 'lo que hay entre elegir el trabajo y pedir la página',
  cortesia: 'la pausa respetuosa de ritmo.antes()',
  red_render: 'driver.get + espera + leer el outerHTML (la petición y el render)',
  acta_guardar_html: 'sha256 + gzip + escribir el HTML en el archivo y anotarlo en `archivos`',
  acta_analizar: 'parseaActa + contextualizaActa (medido aparte: milisegundos)',
  acta_decisiones: 'decisiones de descanso pendientes de esta acta',
  acta_calidad: 'evaluaCalidadActa',
  acta_guardar_json: 'gzip + escribir el JSON del análisis',
  acta_estructura: 'guardaActaEstructura + reconciliaEnlaceActa + marcar el acta como hecha',
  analisis_guardado: 'resto de la fase (validación y lo que no se haya marcado arriba)',
  cola_del_bucle: 'lo que sobra al cerrar el trabajo (debería ser casi nada)',
};

function mediana(ordenados) {
  if (!ordenados.length) return 0;
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[medio] : (ordenados[medio - 1] + ordenados[medio]) / 2;
}

/** Lee el volcado de una federación y devuelve los registros de la ventana. */
function lee(federacion) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'perf-fases.jsonl');
  if (!existsSync(ruta)) return null;
  const desde = Date.now() - MINUTOS * 60_000;
  const filas = [];
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    if (!linea.trim()) continue;
    try {
      const f = JSON.parse(linea);
      if (Date.parse(f.t) >= desde) filas.push(f);
    } catch { /* una línea a medias no invalida el resto */ }
  }
  return { ruta, filas, bytes: statSync(ruta).size };
}

const federaciones = QUE === 'todas'
  ? readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
    .map((n) => n.replace('descargas-', ''))
    .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo'))
    .filter((f) => existsSync(join(RAIZ, `descargas-${f}`, 'recolector-local', 'perf-fases.jsonl')))
    .sort()
  : [QUE];

if (federaciones.length === 0) {
  console.log('No hay ninguna federación con medición por fases.');
  console.log('Se activa poniendo FACYLF_PERF=1 en el entorno de su contenedor y recreándolo.');
  process.exit(0);
}

for (const federacion of federaciones) {
  const datos = lee(federacion);
  if (!datos || datos.filas.length === 0) {
    console.log(`\n══ ${federacion} ══  sin trabajos medidos en los últimos ${MINUTOS} min`);
    continue;
  }

  const { filas } = datos;
  const errores = filas.filter((f) => f.resultado !== 'hecho').length;
  const totales = filas.map((f) => f.totalMs).sort((a, b) => a - b);
  const cicloMedio = totales.reduce((a, b) => a + b, 0) / totales.length;

  console.log(`\n══ ${federacion} ══  ${filas.length} trabajos medidos (${errores} con error) · `
    + `ventana ${MINUTOS} min`);
  console.log(`  ciclo medio por trabajo: ${(cicloMedio / 1000).toFixed(1)} s `
    + `(mediana ${(mediana(totales) / 1000).toFixed(1)} s) → ${(3600 / (cicloMedio / 1000)).toFixed(0)} pet/h`);
  console.log(`  fichero: ${datos.ruta} (${(datos.bytes / 1024).toFixed(0)} KB)\n`);

  console.log('  fase                       media      mediana    % del ciclo   qué es');
  for (const fase of ORDEN_FASES) {
    const valores = filas.map((f) => Number(f[fase] ?? 0)).filter((v) => Number.isFinite(v));
    if (valores.length === 0) continue;
    const orden = [...valores].sort((a, b) => a - b);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    if (media < 0.5) continue; // por debajo de medio milisegundo no se enseña: es ruido
    const porcentaje = cicloMedio > 0 ? (100 * media / cicloMedio) : 0;
    console.log(`  ${fase.padEnd(24)} ${(media / 1000).toFixed(2).padStart(7)} s  `
      + `${(mediana(orden) / 1000).toFixed(2).padStart(7)} s  `
      + `${porcentaje.toFixed(0).padStart(9)} %   ${QUE_EXPLICA[fase] ?? ''}`);
  }

  // ── EL RESUMEN QUE DECIDE, POR GRUPOS ──────────────────────────────────────────────────────────────────
  //
  // Mirar sólo «la fase que más pesa» engaña, y pasó el 23/09/2026: `red_render` era la mayor (39 %) y el
  // programa concluía «el enemigo es el portal», cuando en realidad NUESTRAS escrituras, repartidas en tres
  // fases, sumaban el 60 %. Lo que decide el siguiente cambio es el GRUPO, no la fase suelta.
  const media = (fase) => filas.reduce((a, f) => a + Number(f[fase] ?? 0), 0) / filas.length;
  const grupos = {
    portal: ['red_render'],
    'escrituras nuestras (disco y SQLite)': [
      'acta_guardar_html', 'acta_guardar_json', 'acta_estructura', 'analisis_guardado',
    ],
    'análisis del acta (CPU)': ['acta_analizar', 'acta_calidad', 'acta_decisiones'],
    'espera de cortesía': ['cortesia'],
    'bucle y planificación': ['cierre', 'consulta', 'marcar_en_curso', 'preparacion', 'cola_del_bucle'],
  };
  console.log('\n  ── por grupos (esto es lo que decide qué atacar) ──');
  const porGrupo = [];
  for (const [nombre, fases] of Object.entries(grupos)) {
    const total = fases.reduce((a, f) => a + media(f), 0);
    porGrupo.push({ nombre, total });
  }
  porGrupo.sort((a, b) => b.total - a.total);
  for (const g of porGrupo) {
    if (g.total <= 0) continue;
    console.log(`  ${g.nombre.padEnd(38)} ${(g.total / 1000).toFixed(2).padStart(6)} s  `
      + `${(100 * g.total / cicloMedio).toFixed(0).padStart(4)} %`);
  }

  const manda = porGrupo[0];
  console.log(`\n  → Manda «${manda.nombre}»: ${(manda.total / 1000).toFixed(1)} s de `
    + `${(cicloMedio / 1000).toFixed(1)} s (${(100 * manda.total / cicloMedio).toFixed(0)} %).`);

  const consejo = {
    portal: 'El enemigo es el portal o Chrome: abaratar la página (bloquear recursos, no renderizar) es la palanca.',
    'escrituras nuestras (disco y SQLite)': 'El tiempo está en ESCRIBIR: el archivo HTML, el JSON y la cola. '
      + 'Si esa cola y ese archivo viven en un disco duro compartido, moverlos al SSD es la palanca.',
    'análisis del acta (CPU)': 'El análisis del acta manda: hay que optimizar el parser o el guardado estructurado.',
    'espera de cortesía': 'Está esperando de verdad: aquí sí sirve bajar el intervalo (apartado B).',
    'bucle y planificación': 'El tiempo está en la lógica del bucle (consulta del siguiente trabajo, reciclado).',
  }[manda.nombre];
  if (consejo) console.log(`     ${consejo}`);

  // Comprobación de coherencia: si `cortesia` no aparece y el ciclo es mucho mayor que la cortesía
  // configurada, la medición está completa; si el ciclo saliera MENOR que la cortesía, algo no cuadra.
  const cortesias = filas.map((f) => Number(f.cortesia ?? 0));
  const conCortesia = cortesias.filter((c) => c > 50).length;
  console.log(`  trabajos en los que la cortesía se esperó de verdad (>50 ms): ${conCortesia} de ${filas.length}`);
}
