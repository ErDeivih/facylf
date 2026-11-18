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
/*
 * Banda de prioridad que adelanta un acta por delante del DESCUBRIMIENTO (índices de jornadas, grupos).
 * El recolector ordena con `case when tipo='acta' then case when prioridad < -1399000000 then prioridad
 * else -1399000000 end ...`, así que sólo un acta por debajo de -1.399.000.000 se sirve antes que el
 * descubrimiento. Medido el 17/11/2026: con prioridad normal las actas del finde esperaron 3 h detrás de
 * 579 índices; con esta banda empezaron a salir en el primer minuto (31 → 26 en 5 minutos).
 */
export const BANDA_ACTAS_RECIENTES = -1500000000;
/*
 * Banda para releer una jornada que tiene partidos sin acta. Va por debajo de la de actas (que siguen
 * mandando) pero por encima del descubrimiento normal, porque esto es lo único que puede desbloquear un
 * partido aplazado: cuando la federación publique el acta, el enlace aparecerá en la jornada.
 */
export const BANDA_JORNADAS_SIN_ACTA = -1450000000;

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
           coalesce(t.estado, 'pendiente') estado_acta, coalesce(t.intentos, 0) intentos, t.actualizado_en
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
    // Un acta apartada tras 3 fallos se reintentaba a los 7 días; en medio no la miraba nadie y muchas
    // se publican el lunes o el martes (revisión de Claude, 18/11/2026). Se le da otra oportunidad al día.
    if (estado === 'apartado' && p.actualizado_en && (ahora - Date.parse(p.actualizado_en)) > 24 * 3600e3
        && p.estado_acta === 'pendiente') {
      aplazados.push({ temporada: p.temporada, competicion: p.competicion, grupo: p.grupo, jornada: p.jornada, acta: p.codigo_acta, fecha: p.fecha, hora: p.hora, reintentoDiario: true });
    }
    if (estado === 'aplazado') aplazados.push({ temporada: p.temporada, competicion: p.competicion, grupo: p.grupo, jornada: p.jornada, acta: p.codigo_acta, fecha: p.fecha, hora: p.hora });
    // Sólo se adelanta lo que ya toca y sigue pendiente.
    if (estado === 'toca' && p.estado_acta === 'pendiente') tocaAdelantar.push(p);
  }

  if (!seco) {
    // La prioridad se pone en la BANDA de actas recientes (ver arriba): es la única forma de que el
    // recolector las sirva antes que el descubrimiento. No se usa un valor «normal» porque
    // `reprioritizaPlan` lo recalcula por categoría y volvería a dejarlas detrás.
    const adelanta = db.prepare(`update trabajos set prioridad = ?, siguiente_intento = ?, actualizado_en = ?
      where tipo = 'acta' and temporada = ? and competicion = ? and grupo = ? and jornada = ? and acta = ?`);
    const marca = new Date(ahora).toISOString();
    db.exec('begin');
    for (const p of tocaAdelantar) {
      adelanta.run(BANDA_ACTAS_RECIENTES, marca, marca, p.temporada, p.competicion, p.grupo, p.jornada, p.codigo_acta);
    }
    for (const a of aplazados) {
      if (!a.reintentoDiario) continue;
      adelanta.run(BANDA_ACTAS_RECIENTES, marca, marca, a.temporada, a.competicion, a.grupo, a.jornada, a.acta);
    }
    db.exec('commit');
  }

  // Lista de aplazados: se escribe si se pide, y sirve para la revisión semanal.
  const rutaAplazados = arg('aplazados');
  if (rutaAplazados && !seco) {
    writeFileSync(rutaAplazados, aplazados.map((a) => JSON.stringify(a)).join('\n') + (aplazados.length ? '\n' : ''));
  }
  // ── REINTENTO SEMANAL DE LOS APLAZADOS ────────────────────────────────────────────────────────
  // Sin esto la lista de aplazados sólo se mira: los partidos quedan apartados para siempre. Los lunes
  // se les da otra oportunidad; si el acta sigue sin estar, vuelven a apartarse solos por el clasificador.
  let aplazadosReintentados = 0;
  if (argumentos.includes('--reintentar-aplazados') && !seco) {
    const marca = new Date(ahora).toISOString();
    const reabre = db.prepare(`update trabajos set prioridad = ?, siguiente_intento = ?, actualizado_en = ?
      where tipo = 'acta' and temporada = ? and competicion = ? and grupo = ? and jornada = ? and acta = ?`);
    for (const a of aplazados) {
      reabre.run(BANDA_ACTAS_RECIENTES, marca, marca, a.temporada, a.competicion, a.grupo, a.jornada, a.acta);
      aplazadosReintentados++;
    }
  }

  // ── PARTIDOS SIN CÓDIGO DE ACTA (APLAZADOS / SUSPENDIDOS) ──────────────────────────────────────
  // Estos no aparecen en la consulta de arriba porque no tienen `codigo_acta`: no hay nada que pedir
  // hasta que la federación publique el acta. Lo único que se puede hacer es VOLVER A LEER la jornada,
  // que es donde aparecerá el enlace. Sin esto se quedan olvidados para siempre: comprobado el
  // 17/11/2026 con cinco partidos del 15/11 en la base sin resultado y sin trabajo asociado.
  let jornadasSinActa = 0;
  if (argumentos.includes('--sin-acta') && !seco) {
    const desde = new Date(ahora - 14 * 86400e3).toISOString().slice(0, 10);
    const hoy = new Date(ahora).toISOString().slice(0, 10);
    const sinActa = db.prepare(`
      select distinct temporada, competicion, grupo, jornada from partidos
       where codigo_acta is null and fecha >= ? and fecha <= ?
    `).all(desde, hoy);
    const marca = new Date(ahora).toISOString();
    const reabre = db.prepare(`update trabajos set prioridad = ?, siguiente_intento = ?, actualizado_en = ?
      where tipo = 'jornada' and temporada = ? and competicion = ? and grupo = ? and jornada = ?`);
    for (const j of sinActa) {
      reabre.run(BANDA_JORNADAS_SIN_ACTA, marca, marca, j.temporada, j.competicion, j.grupo, String(j.jornada));
      jornadasSinActa++;
    }
    console.log(`JORNADAS CON PARTIDOS SIN ACTA releídas: ${jornadasSinActa}`);
  }

  const informe = { cuando: new Date(ahora).toISOString(), cola: ruta, seco, partidos: partidos.length, ...cuenta, adelantados: tocaAdelantar.length, aplazados_listados: aplazados.length, aplazados_reintentados: aplazadosReintentados };
  if (json) {
    console.log(JSON.stringify(informe, null, 2));
  } else {
    console.log(`COLA DE PARTIDOS · ${informe.cuando}${seco ? ' (en seco)' : ''}`);
    console.log(`  partidos con código de acta: ${partidos.length}`);
    console.log(`  hechas: ${cuenta.hecha} · esperando su hora: ${cuenta.espera} · toca ahora: ${cuenta.toca}`);
    console.log(`  apartadas (3 fallos): ${cuenta.apartado ?? 0} · aplazadas (+7 días): ${cuenta.aplazado ?? 0}`);
    if (!seco) console.log(`  adelantadas en la cola: ${tocaAdelantar.length}`);
    if (aplazadosReintentados) console.log(`  aplazados reintentados: ${aplazadosReintentados}`);
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

  // ── RELEER LAS JORNADAS DE LA SEMANA (horarios y árbitros) ─────────────────────────────────────
  // Una jornada que se leyó antes de que la federación publicara los horarios se queda con `hora` nula
  // para siempre: su trabajo está 'hecho' o aplazado a la noche del partido, y nadie vuelve a pedir la
  // página. Comprobado el 18/11/2026 con la jornada del 22/11: el HTML publicado trae
  // `<span class="horario">18:15</span>` y la cola tenía `hora = null` en los 151 partidos.
  // La fecha se toma de los PARTIDOS: hay grupos cuya fila de `jornadas` no tiene fecha propia.
  const dias = Number(arg('dias', 8));
  let jornadasReleidas = 0;
  if (argumentos.includes('--releer-jornadas') && !seco) {
    const hoy = new Date(ahora).toISOString().slice(0, 10);
    const hasta = new Date(ahora + dias * 86400e3).toISOString().slice(0, 10);
    const marca = new Date(ahora).toISOString();
    /*
     * Una jornada aplazada al futuro no se liberaba NUNCA por esta vía, porque sólo se miraban las que ya
     * tenían partidos descubiertos. Medido el 18/11/2026: 4.259 jornadas seguían con `siguiente_intento`
     * hasta mayo de 2027, así que el recolector no iba a leer sus horarios hasta la noche del partido.
     * Ahora también cuentan las que están en el calendario (`jornadas`) con su fecha en la ventana.
     */
    const abrir = db.prepare(`
      select distinct t.temporada, t.competicion, t.grupo, t.jornada
        from trabajos t
       where t.tipo = 'jornada'
         and (exists (select 1 from partidos p
                       where p.temporada = t.temporada and p.competicion = t.competicion
                         and p.grupo = t.grupo and p.jornada = t.jornada
                         and p.fecha >= ? and p.fecha <= ?)
           or exists (select 1 from jornadas j
                       where j.temporada = t.temporada and j.competicion = t.competicion
                         and j.grupo = t.grupo and j.numero = t.jornada
                         and j.fecha >= ? and j.fecha <= ?))
         ${filtroTemporada ? 'and t.temporada in (select codigo from temporadas where etiqueta = ?)' : ''}
    `).all(hoy, hasta, hoy, hasta, ...(filtroTemporada ? [filtroTemporada] : []));
    const reabre = db.prepare(`update trabajos set estado = 'pendiente', siguiente_intento = ?, actualizado_en = ?,
        intentos = 0, ultimo_error = null, prioridad = ?
      where tipo = 'jornada' and estado != 'en_curso' and temporada = ? and competicion = ? and grupo = ? and jornada = ?`);
    db.exec('begin');
    for (const j of abrir) {
      // Prioridad alta, pero POR DEBAJO de las actas: el lunes a las 06:00 entran cientos de jornadas y un
      // acta que cumpla las 3 h esa mañana no puede quedar detrás (revisión de Claude, 18/11/2026).
      reabre.run(marca, marca, BANDA_JORNADAS_SIN_ACTA, j.temporada, j.competicion, j.grupo, String(j.jornada));
      jornadasReleidas++;
    }
    db.exec('commit');
    console.log(`JORNADAS DE LA SEMANA devueltas a la cola para releer horarios: ${jornadasReleidas}`);
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
