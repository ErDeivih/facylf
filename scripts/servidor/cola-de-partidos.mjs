#!/usr/bin/env node
/*
 * ── COLA DE PARTIDOS: COMPROBAR EL ACTA TRES HORAS DESPUÉS DEL INICIO ────────────────────────────────
 *
 * La idea (David, 17/11/2026): si un partido se juega a las 16:00, a las 19:00 se intenta su acta. Si no
 * está, se reintenta dos horas después; a los tres fallos se deja pasar unos días y luego se revisa una vez
 * a la semana. Lo que siga sin acta tras una semana es un APLAZADO y va a su lista.
 *
 * Este programa NO pide nada al portal: sólo ordena el trabajo de la cola. Lee los partidos ya descubiertos
 * (`partidos`, con `fecha` y `hora`) y los trabajos de acta, y adelanta los que ya toca comprobar. El
 * recolector sigue siendo el único que abre el navegador.
 *
 * Uso (dentro del contenedor del recolector, que es quien ve la cola):
 *   node scripts/servidor/cola-de-partidos.mjs --cola <ruta> [--temporada 2026-27] [--seco] [--json]
 *
 * Sale con 0 siempre que pueda leer la cola; los números van en el informe.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, writeFileSync } from 'node:fs';

export const HORAS_TRAS_INICIO = 3;
export const HORAS_REINTENTO = 2;
export const FALLOS_ANTES_DE_APARTAR = 3;
export const DIAS_APARTADO = 3;
export const DIAS_APLAZADO = 7;

/** ¿Cuándo toca comprobar el acta de este partido? `inicio` en ms, `intentos` ya hechos. */
export function cuandoToca({ inicio, intentos = 0 }) {
  const base = inicio + HORAS_TRAS_INICIO * 3600e3;
  // Cada intento fallido empuja la comprobación dos horas.
  return base + intentos * HORAS_REINTENTO * 3600e3;
}

/** Clasifica un partido según el reloj. Estados: espera, toca, apartado, aplazado. */
export function clasifica({ inicio, intentos, ahora, tieneActa }) {
  if (tieneActa) return 'hecha';
  if (intentos >= FALLOS_ANTES_DE_APARTAR) {
    const desde = cuandoToca({ inicio, intentos });
    const dias = (ahora - desde) / 86400e3;
    return dias >= DIAS_APLAZADO ? 'aplazado' : 'apartado';
  }
  return ahora >= cuandoToca({ inicio, intentos }) ? 'toca' : 'espera';
}

const argumentos = process.argv.slice(2);
const arg = (n, d = null) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };

function principal() {
  const ruta = arg('cola');
  const seco = argumentos.includes('--seco');
  const json = argumentos.includes('--json');
  const ahora = Date.now();
  if (!ruta || !existsSync(ruta)) {
    console.error(`No existe la cola: ${ruta ?? '(sin ruta)'}`);
    process.exit(1);
  }
  const db = new DatabaseSync(ruta, { readOnly: seco, timeout: 30_000 });

  const filtroTemporada = arg('temporada');
  const partidos = db.prepare(`
    select p.temporada, p.competicion, p.grupo, p.jornada, p.codigo_acta, p.fecha, p.hora,
           coalesce(t.estado, 'pendiente') estado_acta, coalesce(t.intentos, 0) intentos
      from partidos p
      left join trabajos t
        on t.tipo = 'acta' and t.temporada = p.temporada and t.competicion = p.competicion
       and t.grupo = p.grupo and t.jornada = p.jornada and t.acta = p.codigo_acta
     where p.codigo_acta is not null and p.fecha is not null
       ${filtroTemporada ? 'and p.temporada in (select codigo from temporadas where etiqueta = ?)' : ''}
  `).all(...(filtroTemporada ? [filtroTemporada] : []));

  const cuenta = { hecha: 0, espera: 0, toca: 0, apartado: 0, aplazado: 0 };
  const tocaAdelantar = [];
  const aplazados = [];
  for (const p of partidos) {
    const inicio = Date.parse(`${p.fecha}T${(p.hora || '00:00').slice(0, 5)}:00+01:00`);
    if (!Number.isFinite(inicio)) continue;
    const estado = clasifica({
      inicio, intentos: Number(p.intentos) || 0, ahora,
      tieneActa: p.estado_acta === 'hecho' || p.estado_acta === 'sin_datos',
    });
    cuenta[estado] = (cuenta[estado] ?? 0) + 1;
    if (estado === 'aplazado') aplazados.push({ temporada: p.temporada, competicion: p.competicion, grupo: p.grupo, jornada: p.jornada, acta: p.codigo_acta, fecha: p.fecha, hora: p.hora });
    // Sólo se adelanta lo que ya toca y sigue pendiente.
    if (estado === 'toca' && p.estado_acta === 'pendiente') tocaAdelantar.push(p);
  }

  if (!seco) {
    // NO se toca `prioridad`: el recolector la recalcula por categoría de competición
    // (`reprioritizaPlan`) y escribirla aquí sólo servía para pisarla con un valor peor. Lo único que hace
    // falta es que el trabajo esté DISPONIBLE: su `siguiente_intento` pasa a ahora.
    const adelanta = db.prepare(`update trabajos set siguiente_intento = ?, actualizado_en = ?
      where tipo = 'acta' and temporada = ? and competicion = ? and grupo = ? and jornada = ? and acta = ?`);
    const marca = new Date(ahora).toISOString();
    db.exec('begin');
    for (const p of tocaAdelantar) {
      adelanta.run(marca, marca, p.temporada, p.competicion, p.grupo, p.jornada, p.codigo_acta);
    }
    db.exec('commit');
  }

  // Lista de aplazados: se escribe si se pide, y sirve para la revisión semanal.
  const rutaAplazados = arg('aplazados');
  if (rutaAplazados && !seco) {
    writeFileSync(rutaAplazados, aplazados.map((a) => JSON.stringify(a)).join('\n') + (aplazados.length ? '\n' : ''));
  }
  const informe = { cuando: new Date(ahora).toISOString(), cola: ruta, seco, partidos: partidos.length, ...cuenta, adelantados: tocaAdelantar.length, aplazados_listados: aplazados.length };
  if (json) {
    console.log(JSON.stringify(informe, null, 2));
  } else {
    console.log(`COLA DE PARTIDOS · ${informe.cuando}${seco ? ' (en seco)' : ''}`);
    console.log(`  partidos con código de acta: ${partidos.length}`);
    console.log(`  hechas: ${cuenta.hecha} · esperando su hora: ${cuenta.espera} · toca ahora: ${cuenta.toca}`);
    console.log(`  apartadas (3 fallos): ${cuenta.apartado ?? 0} · aplazadas (+7 días): ${cuenta.aplazado ?? 0}`);
    if (!seco) console.log(`  adelantadas en la cola: ${tocaAdelantar.length}`);
  }
  // ── LA JORNADA DE ESTA SEMANA VA PRIMERO ────────────────────────────────────────────────────────
  // El calendario ya trae las jornadas futuras con su fecha, pero sus páginas no se han abierto todavía
  // (0 partidos descubiertos para el finde que viene). Con `--semana` se ponen disponibles AHORA las
  // jornadas de los próximos 7 días, para que el recolector las abra y traiga horarios antes del sábado.
  if (argumentos.includes('--semana') && !seco) {
    const hoy = new Date(ahora).toISOString().slice(0, 10);
    const dentroDe7 = new Date(ahora + 7 * 86400e3).toISOString().slice(0, 10);
    const marca = new Date(ahora).toISOString();
    const r = db.prepare(`
      update trabajos set siguiente_intento = ?, actualizado_en = ?
       where estado = 'pendiente' and tipo = 'jornada'
         and exists (select 1 from jornadas j
                      where j.temporada = trabajos.temporada and j.competicion = trabajos.competicion
                        and j.grupo = trabajos.grupo and j.numero = trabajos.jornada
                        and j.fecha >= ? and j.fecha <= ?)
    `).run(marca, marca, hoy, dentroDe7);
    console.log(`JORNADAS DE LA SEMANA adelantadas: ${r.changes}`);
  }

  // ── REPASO DEL LUNES: la jornada siguiente, con horario y si ya hay acta (árbitro) ─────────────
  if (argumentos.includes('--proxima')) {
    const hoy = new Date(ahora).toISOString().slice(0, 10);
    // El calendario trae las jornadas futuras con su fecha aunque todavía no se hayan abierto: de ahí sale
    // lo que hay que repasar el lunes (horarios) y lo que el planificador irá comprobando.
    const proximos = db.prepare(`
      select fecha, count(*) jornadas
        from jornadas
       where fecha >= ?
         ${filtroTemporada ? 'and temporada in (select codigo from temporadas where etiqueta = ?)' : ''}
       group by fecha order by fecha limit 5
    `).all(hoy, ...(filtroTemporada ? [filtroTemporada] : []));
    console.log('PRÓXIMAS FECHAS (repaso del lunes):');
    for (const d of proximos) {
      // Y de esos días, cuántos partidos ya están descubiertos y cuántos traen hora: es lo que se mira el lunes.
      const detalle = db.prepare(`
        select count(*) partidos, sum(case when hora is not null then 1 else 0 end) con_hora
          from partidos where fecha = ?
      `).get(d.fecha);
      console.log(`  ${d.fecha} · ${d.jornadas} jornadas en el calendario · ${detalle.partidos} partidos descubiertos, ${detalle.con_hora ?? 0} con hora`);
    }
  }
  return informe;
}

if (process.argv[1]?.endsWith('cola-de-partidos.mjs')) {
  try { principal(); } catch (error) { console.error(`✗ ${error.message}`); process.exit(1); }
}
