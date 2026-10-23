/*
 * compara-colas.mjs — cuánto trabajo hay hecho y pendiente en las colas de varias federaciones
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * El 24/09/2026 se decide que Valencia, Madrid y Cataluña recojan en el PC y el resto en el servidor. Antes de
 * mover nada hay que saber CUÁL DE LOS DOS VA MÁS AVANZADO, porque elegir mal significa volver a descargar
 * miles de actas ya descargadas o —peor— dar por hechas actas que no lo están. Este guion da la misma foto en
 * los dos sitios para poder compararlas línea a línea.
 *
 * Cuenta, por federación:
 *   · `actas` por estado, que es la medida REAL del avance (una acta hecha es una ficha analizada);
 *   · `trabajos` pendientes y disponibles AHORA, que es lo que queda por hacer;
 *   · cuántas actas hay por temporada, para ver si una máquina conoce temporadas que la otra no.
 *
 * SÓLO LEE: abre las colas en readOnly.
 *
 * Uso:
 *   # en el PC (por defecto la raíz es el directorio actual)
 *   node scripts/servidor/compara-colas.mjs valencia madrid cataluna
 *
 *   # en el servidor, dentro de un contenedor con el repositorio montado
 *   FACYLF_RAIZ=/app docker exec facylf-monitor node /app/scripts/servidor/compara-colas.mjs valencia madrid
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? resolve(import.meta.dirname, '..', '..');
const federaciones = process.argv.slice(2);
if (!federaciones.length) {
  console.error('uso: compara-colas.mjs <federación...>');
  process.exit(2);
}
const n = (x) => Number(x ?? 0).toLocaleString('es-ES');

/** La cola puede estar en la ruta de siempre o en el SSD (enlace en la misma ruta), así que se prueba esa. */
function rutaCola(fed) {
  const candidatas = [
    join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite'),
    join('/srv/ssd/facylf', `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite'),
  ];
  return candidatas.find((p) => existsSync(p)) ?? null;
}

const ahora = new Date().toISOString();
console.log(`══ comparación de colas · raíz ${RAIZ} · ${ahora} ══\n`);

for (const fed of federaciones) {
  const ruta = rutaCola(fed);
  if (!ruta) { console.log(`── ${fed}: NO HAY COLA\n`); continue; }
  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });

  console.log(`── ${fed}`);
  console.log(`   cola: ${ruta}`);

  // ── 1. ACTAS POR ESTADO: la medida real del avance ───────────────────────────────────────────────────
  const actas = db.prepare(`select estado, count(*) n from actas group by estado order by n desc`).all();
  const totalActas = actas.reduce((s, a) => s + Number(a.n), 0);
  console.log(`   actas (total ${n(totalActas)}): ` + (actas.length
    ? actas.map((a) => `${a.estado}=${n(a.n)}`).join('  ')
    : 'ninguna'));

  // ── 2. TRABAJOS: lo que queda por hacer ─────────────────────────────────────────────────────────────
  const trabajos = db.prepare(`select estado, count(*) n from trabajos group by estado order by n desc`).all();
  const disponible = db.prepare(`select count(*) n from trabajos where estado in ('pendiente','bloqueado')
    and (siguiente_intento is null or siguiente_intento <= ?)`).get(ahora)?.n;
  console.log(`   trabajos: ` + (trabajos.length ? trabajos.map((t) => `${t.estado}=${n(t.n)}`).join('  ') : 'ninguno'));
  console.log(`   disponibles AHORA: ${n(disponible)}`);

  // ── 3. POR TIPO Y ESTADO: distingue descubrimiento (fase 1) de datos (fase 2) ────────────────────────
  for (const t of db.prepare(`select tipo,
      sum(case when estado='hecho' then 1 else 0 end) hechos,
      sum(case when estado in ('pendiente','bloqueado') then 1 else 0 end) pendientes
    from trabajos group by tipo order by pendientes desc limit 6`).all()) {
    if (!Number(t.pendientes) && !Number(t.hechos)) continue;
    console.log(`     ${String(t.tipo).padEnd(20)} hechos=${String(n(t.hechos)).padStart(8)}  por hacer=${String(n(t.pendientes)).padStart(8)}`);
  }

  // ── 4. TEMPORADAS CONOCIDAS: que una máquina no ignore una temporada que la otra sí tiene ────────────
  const temps = db.prepare(`select temporada, count(*) n from actas where estado='hecha'
    group by temporada order by temporada`).all();
  if (temps.length) {
    console.log(`   temporadas: ` + temps.map((t) => `${t.temporada}=${n(t.n)}`).join('  '));
  }

  /*
   * ── 5. REPARTO POR TEMPORADAS: cuánto QUEDA en cada una ────────────────────────────────────────────────
   *
   * Añadido el 24/09/2026 para poder repartir Castilla y León entre las dos máquinas por temporadas: una
   * máquina toma una temporada entera, la recoge y luego bloquea otra. Para repartir así no basta con saber lo
   * HECHO por temporada (que es lo que da el apartado anterior): hace falta lo que QUEDA, porque de eso depende
   * que el reparto sea equilibrado. Se cuenta por temporada:
   *
   *   · actas hechas y actas por hacer;
   *   · trabajos de `acta` disponibles AHORA (los que el recolector puede elegir en este momento);
   *   · el total de trabajos por hacer de cualquier tipo, que dice si la temporada está solo a medias de datos
   *     o si además le falta descubrimiento.
   *
   * La etiqueta legible de la temporada sale de la tabla `temporadas` si existe (la cola guarda un número).
   */
  let etiquetas = new Map();
  try {
    for (const t of db.prepare(`select id, etiqueta from temporadas`).all()) etiquetas.set(String(t.id), t.etiqueta);
  } catch { /* colas antiguas sin esa tabla: se enseña el número y ya está */ }

  const reparto = db.prepare(`select a.temporada,
      sum(case when a.estado='hecha' then 1 else 0 end) hechas,
      sum(case when a.estado not in ('hecha') then 1 else 0 end) porHacer,
      (select count(*) from trabajos w where w.temporada = a.temporada and w.tipo='acta'
         and w.estado in ('pendiente','bloqueado')
         and (w.siguiente_intento is null or w.siguiente_intento <= ?)) actasDisponibles,
      (select count(*) from trabajos w where w.temporada = a.temporada
         and w.estado in ('pendiente','bloqueado')) trabajosPorHacer
    from actas a group by a.temporada order by a.temporada`, ).all(ahora);
  if (reparto.length) {
    console.log('   ── reparto por temporada (para dividir el trabajo) ──');
    console.log('      temporada      etiqueta     hechas   por hacer   actas disp.   trabajos');
    for (const r of reparto) {
      console.log(`      ${String(r.temporada).padEnd(14)} ${String(etiquetas.get(String(r.temporada)) ?? '—').padEnd(12)}`
        + `${String(n(r.hechas)).padStart(7)} ${String(n(r.porHacer)).padStart(12)}`
        + `${String(n(r.actasDisponibles)).padStart(14)} ${String(n(r.trabajosPorHacer)).padStart(11)}`);
    }
  }

  const meta = db.prepare(`select clave, valor from metadatos where clave in
    ('plan_huella_en','pausa_global_hasta','pausa_global_motivo')`).all();
  for (const m of meta) if (m.valor) console.log(`   ${m.clave}: ${String(m.valor).slice(0, 90)}`);

  db.close();
  console.log('');
}
