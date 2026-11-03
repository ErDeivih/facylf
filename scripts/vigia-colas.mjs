#!/usr/bin/env node
/*
 * ── VIGÍA DE LAS COLAS: mide cada federación y avisa de lo que va mal (22/10/2026) ───────────────────────────
 *
 * SÓLO LEE las colas. Mide, por federación: a qué portal se pide, cómo responde la web (1 h y 24 h), errores
 * nuestros frente a «la fuente no lo publica», si está parada o en pausa, cuánto trabajo le queda, qué parte de
 * las jornadas jugadas que se leyeron vienen VACÍAS, si lo leído deja actas en cola y su ritmo frente a su semana.
 * Las reglas están en `lib/vigia-colas.mjs` (puras y con pruebas).
 *
 * Deja en `estado/vigia/`:
 *   · `<máquina>.json`          métricas y avisos de esta pasada (para mirar o para una web)
 *   · `<máquina>.txt`           el mismo resumen en texto
 *   · `<máquina>-estado.json`   los avisos vivos (para no repetir: nuevo, recordatorio cada 6 h, resuelto)
 *   · `alertas.log`             una línea por aviso nuevo, recordado o resuelto
 * y, si hay canal configurado (las mismas variables que `vigilancia-plataforma.mjs`: ALERTAS_TELEGRAM_TOKEN +
 * ALERTAS_TELEGRAM_CHAT, ALERTAS_NTFY_URL o ALERTAS_WEBHOOK_URL), manda los críticos y avisos NUEVOS.
 *
 * Uso:
 *   node scripts/vigia-colas.mjs                        mide las colas de esta máquina, evalúa, escribe y avisa
 *   node scripts/vigia-colas.mjs --solo-medir           imprime sólo las métricas en JSON (para el servidor)
 *   node scripts/vigia-colas.mjs --desde m.json         evalúa unas métricas ya medidas (las del servidor, en el PC)
 *   opciones: --maquina pc|servidor · --sin-avisos · --federacion <f> (repetible)
 * FACYLF_RAIZ = raíz del repositorio (o /app en el servidor).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statfsSync, writeFileSync } from 'node:fs';
import { freemem, platform, uptime } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { PORTAL_FIJO, REPARTO, comparaConAnteriores, esErrorDeLaFuente, evaluaFederacion, evaluaMaquina } from './lib/vigia-colas.mjs';

const RAIZ = resolve(process.env.FACYLF_RAIZ ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const args = process.argv.slice(2);
const arg = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const MAQUINA = arg('maquina', platform() === 'win32' ? 'pc' : 'servidor');
const SOLO_MEDIR = args.includes('--solo-medir');
const DESDE = arg('desde');
const SIN_AVISOS = args.includes('--sin-avisos');
const PEDIDAS = args.flatMap((a, i) => (a === '--federacion' ? [args[i + 1]] : []));
const MINIMA = process.env.FACYLF_TEMPORADA_MINIMA ?? '2010-11';
const DIR = join(RAIZ, 'estado', 'vigia');

const iso = (ms) => new Date(ms).toISOString();
const host = (u) => { try { return new URL(u).host; } catch { return '?'; } };

function portalDe(fed) {
  if (PORTAL_FIJO[fed]) return PORTAL_FIJO[fed];
  const ruta = join(RAIZ, 'perfiles', `${fed}.json`);
  if (!existsSync(ruta)) return null;
  try { return host(JSON.parse(readFileSync(ruta, 'utf8').replace(/^﻿/, '')).base); } catch { return null; }
}

/** Métricas de UNA cola. Todas las consultas van por índice o por tablas pequeñas: < 1 s por federación. */
function mideCola(fed, ruta, ahora) {
  const m = { federacion: fed, portal: portalDe(fed) };
  const t0 = Date.now();
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 20_000 });
    const h1 = iso(ahora - 3600e3); const h24 = iso(ahora - 86400e3);
    m.ultimaPeticion = db.prepare('select max(iniciada_en) u from peticiones').get()?.u ?? null;

    const filas = db.prepare(`select iniciada_en, resultado, substr(coalesce(detalle,''),1,160) detalle, url, trabajo
      from peticiones where iniciada_en >= ?`).all(h24);
    m.peticiones24 = filas.length;
    m.hosts24 = {}; m.hosts6 = {}; m.resultados1h = {}; m.resultados24 = {};
    const h6 = iso(ahora - 6 * 3600e3);
    const malos1h = {};
    let calLeidos = 0; let calIncompletos = 0;
    for (const f of filas) {
      if (/^https?:/.test(f.url ?? '')) {
        const h = host(f.url); m.hosts24[h] = (m.hosts24[h] ?? 0) + 1;
        if (f.iniciada_en >= h6) m.hosts6[h] = (m.hosts6[h] ?? 0) + 1;
      }
      m.resultados24[f.resultado] = (m.resultados24[f.resultado] ?? 0) + 1;
      if (f.iniciada_en >= h1) {
        m.resultados1h[f.resultado] = (m.resultados1h[f.resultado] ?? 0) + 1;
        if (!['ok', 'sin_publicar', 'bloqueo', 'sin_datos', 'sin_jugar'].includes(f.resultado) && !esErrorDeLaFuente(f.detalle)) {
          const clave = f.detalle.replace(/\d+/g, 'N').slice(0, 90);
          malos1h[clave] = (malos1h[clave] ?? 0) + 1;
        }
      }
      if (String(f.trabajo ?? '').startsWith('calendario|')) {
        if (/^calendario incompleto/.test(f.detalle)) calIncompletos += 1; else if (f.resultado === 'ok') calLeidos += 1;
      }
    }
    m.errores1hNuestros = Object.values(malos1h).reduce((s, n) => s + n, 0);
    m.errorTop1h = Object.entries(malos1h).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (calLeidos || calIncompletos) { m.calendariosLeidos24 = calLeidos; m.calendariosIncompletos24 = calIncompletos; }

    // Peticiones por día de las 7 jornadas completas anteriores (índice por día).
    // Por día (UTC, que para comparar días entre sí vale): no todas las colas rellenan `dia_madrid` (Valencia no).
    const dias = db.prepare(`select substr(iniciada_en,1,10) d, count(*) n from peticiones where iniciada_en >= ? and iniciada_en < ?
      group by 1 order by 1`).all(iso(ahora - 8 * 86400e3), `${new Date(ahora).toISOString().slice(0, 10)}T00:00:00`);
    m.peticionesPorDia7 = dias.slice(-7).map((x) => x.n);
    // Parte de «aún no publicado» por día: si la web cambia de maqueta y el lector deja de ver lo que hay, casi
    // todo pasa a «sin publicar» (no a «error»), y eso no lo vería la regla de errores.
    const sp = db.prepare(`select substr(iniciada_en,1,10) d, avg(resultado='sin_publicar') p from peticiones
      where iniciada_en >= ? and iniciada_en < ? group by 1 order by 1`).all(iso(ahora - 8 * 86400e3), `${new Date(ahora).toISOString().slice(0, 10)}T00:00:00`);
    m.sinPublicarPorDia7 = sp.slice(-7).map((x) => x.p);
    m.sinPublicar24 = m.peticiones24 ? (m.resultados24.sin_publicar ?? 0) / m.peticiones24 : null;

    const meta = (k) => { try { return db.prepare('select valor from metadatos where clave=?').get(k)?.valor || null; } catch { return null; } };
    m.pausaHasta = meta('pausa_global_hasta'); m.pausaMotivo = meta('pausa_global_motivo');

    const viejas = `(temporada is null or temporada not in (select codigo from temporadas where etiqueta < ?))`;
    const t = db.prepare(`select tipo, sum(siguiente_intento is null or siguiente_intento <= ?) ya, sum(siguiente_intento > ?) luego
      from trabajos where estado in ('pendiente','bloqueado') and ${viejas} group by 1`).all(iso(ahora), iso(ahora), MINIMA);
    m.vencido = t.reduce((s, x) => s + (x.ya ?? 0), 0); m.aplazado = t.reduce((s, x) => s + (x.luego ?? 0), 0);
    m.vencidoPorTipo = Object.fromEntries(t.filter((x) => x.ya).map((x) => [x.tipo, x.ya]));

    // Jornadas YA JUGADAS de las dos últimas temporadas leídas en 24 h: cuántas vienen sin partidos y cuántas,
    // con partidos con código, no dejan ni un acta (en cola o hecha). Se sale de las PETICIONES de 24 h (índice por
    // fecha) y se busca cada jornada por su clave: recorrer `jornadas` o `actas` enteras en colas de 2 GB tarda
    // minutos (22/10/2026: la primera versión se cortaba a los 300 s en el PC).
    const ayer = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(ahora - 86400e3));
    const recientes = new Set(db.prepare('select codigo from temporadas order by cast(codigo as integer) desc limit 2').all().map((x) => String(x.codigo)));
    const claves = new Map();
    const deGrupo = db.prepare('select numero, fecha, comprobada_en from jornadas where temporada=? and competicion=? and grupo=?');
    const unaJornada = db.prepare('select fecha from jornadas where temporada=? and competicion=? and grupo=? and numero=?');
    for (const f of filas) {
      if (f.resultado !== 'ok' || !f.trabajo) continue;
      const [tipo, t, c, g, j] = String(f.trabajo).split('|');
      if (!recientes.has(t)) continue;
      if (tipo === 'jornada' && j) {
        const fecha = unaJornada.get(t, c, g, Number(j))?.fecha;
        if (fecha && String(fecha).slice(0, 10) <= ayer) claves.set(`${t}|${c}|${g}|${j}`, [t, c, g, Number(j)]);
      } else if (tipo === 'calendario') {
        // Sólo las jornadas ya LEÍDAS (con `comprobada_en`): en las PNFG el calendario apunta las jornadas sin sus
        // partidos, que llegan después con la página de cada jornada. Contarlas era una falsa alarma (Araba, 22/10:
        // «388 de 650 vacías» justo tras leer calendarios). En Cataluña el calendario trae los partidos y la marca.
        for (const x of deGrupo.all(t, c, g)) {
          if (x.fecha && x.comprobada_en && String(x.fecha).slice(0, 10) <= ayer) claves.set(`${t}|${c}|${g}|${x.numero}`, [t, c, g, x.numero]);
        }
      }
    }
    const partidosDe = db.prepare(`select count(*) n, sum(codigo_acta is not null and codigo_acta <> '') conCodigo
      from partidos where temporada=? and competicion=? and grupo=? and jornada=?`);
    const actasDe = db.prepare('select 1 from actas where temporada=? and competicion=? and grupo=? and jornada=? limit 1');
    // Una jornada vacía de un grupo que NO tiene partidos en ninguna jornada no cuenta: es un grupo que la fuente
    // no publica (las ligas nacionales que las territoriales pintan con «Descansa», p. ej. Castilla-La Mancha). Lo
    // que delata un lector roto es lo de Cataluña: el grupo tiene partidos en una jornada y las demás, vacías.
    const grupoConPartidos = db.prepare('select 1 from partidos where temporada=? and competicion=? and grupo=? limit 1');
    let vacias = 0; let conCodigo = 0; let sinActas = 0; let gruposSinDatos = 0;
    for (const k of claves.values()) {
      const p = partidosDe.get(...k);
      if (!p?.n) {
        if (grupoConPartidos.get(k[0], k[1], k[2])) vacias += 1; else gruposSinDatos += 1;
        continue;
      }
      if (p.conCodigo) { conCodigo += 1; if (!actasDe.get(...k)) sinActas += 1; }
    }
    m.jornadasLeidas24 = claves.size - gruposSinDatos; m.jornadasDeGruposSinDatos24 = gruposSinDatos; m.jornadasVacias24 = vacias; m.jornadasConPartidos24 = conCodigo; m.jornadasSinActas24 = sinActas;

    // Resultados de la temporada en curso jugados hace 2-9 días: jornadas con partidos pero SIN un solo marcador.
    // Si sube, la recogida del fin de semana no está trayendo resultados (repaso parado, página cambiada…).
    const actual = db.prepare('select codigo from temporadas order by cast(codigo as integer) desc limit 1').get()?.codigo;
    const desde9 = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(ahora - 9 * 86400e3));
    const hasta2 = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(ahora - 2 * 86400e3));
    if (actual != null) {
      const r = db.prepare(`select count(*) jornadas, sum(not exists (select 1 from partidos p where p.temporada=j.temporada and p.competicion=j.competicion
            and p.grupo=j.grupo and p.jornada=j.numero and p.goles_local is not null)) sinResultados
        from jornadas j where j.temporada=? and substr(j.fecha,1,10) between ? and ?
          and exists (select 1 from partidos p where p.temporada=j.temporada and p.competicion=j.competicion and p.grupo=j.grupo and p.jornada=j.numero)
          -- sólo grupos que SÍ publican resultados en otras jornadas: en base (F7/F8) muchas federaciones no los publican
          and exists (select 1 from partidos p where p.temporada=j.temporada and p.competicion=j.competicion and p.grupo=j.grupo and p.goles_local is not null)`)
        .get(actual, desde9, hasta2);
      m.semanaPasada = { jornadas: r?.jornadas ?? 0, sinResultados: r?.sinResultados ?? 0 };
    }

    // Actas: cuántas se cerraron en 24 h y, por temporada, qué parte salen sin alineaciones o ilegibles frente a
    // los 7 días anteriores, sólo en las competiciones que aparecen en las dos ventanas (mezclar engaña: las
    // nacionales y las de base de temporadas cerradas vienen vacías de la fuente). También desde las peticiones.
    const pet8 = db.prepare(`select trabajo, iniciada_en >= ? reciente from peticiones
      where iniciada_en >= ? and resultado = 'ok' and trabajo like 'acta|%' order by id desc`).all(h24, iso(ahora - 8 * 86400e3));
    const unaActa = db.prepare('select estado, incidencias from actas where temporada=? and competicion=? and grupo=? and jornada=? and codigo=?');
    const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((x) => [String(x.codigo), x.etiqueta]));
    const porComp = new Map();
    const vistas = new Set();
    m.actas24 = {};
    // Riqueza (22/10/2026): de las actas CON alineaciones, cuántas traen tarjetas, cambios y código de jugador.
    // Un lector roto no siempre deja actas vacías: Cataluña guardó meses de actas con alineaciones y goles pero
    // con 0 tarjetas, 0 cambios y 0 códigos sin que nada avisara. Muestra acotada (400 + 1.200 actas) por coste.
    const tiposDe = db.prepare(`select tipo, count(*) n from eventos_acta where temporada=? and competicion=? and grupo=?
      and jornada=? and acta=? group by tipo`);
    const jugadoresDe = db.prepare(`select count(*) n, sum(jugador_codigo is not null and jugador_codigo <> '') k
      from participaciones where temporada=? and competicion=? and grupo=? and jornada=? and acta=?`);
    const riqueza = new Map();
    let muestra24 = 0; let muestra7 = 0;
    // Muestra acotada (24/10/2026): con el PC cargado, recorrer TODAS las actas de 8 días (40.000+ en las colas grandes)
    // llevó al vigía por encima de sus 300 s. Se toman como mucho 3.000 de las últimas 24 h y 6.000 de los 7 días
    // anteriores, repartidas por todo el periodo (una de cada k), que para proporciones es de sobra.
    const n24 = pet8.filter((f) => f.reciente).length; const n7 = pet8.length - n24;
    const paso24 = Math.max(1, Math.ceil(n24 / 3000)); const paso7 = Math.max(1, Math.ceil(n7 / 6000));
    let i24 = 0; let i7 = 0;
    for (const f of pet8) {
      if (f.reciente ? (i24++ % paso24) : (i7++ % paso7)) continue;
      if (vistas.has(f.trabajo)) continue; vistas.add(f.trabajo);
      const [, t, c, g, j, cod] = String(f.trabajo).split('|');
      const a = unaActa.get(t, c, g, Number(j), cod);
      if (!a) continue;
      if (f.reciente) m.actas24[a.estado] = (m.actas24[a.estado] ?? 0) + 1;
      if (!['hecha', 'sin_datos'].includes(a.estado)) continue;
      const mala = /sin_alineaciones|ilegible/.test(a.incidencias ?? '');
      const k = `${t}|${c}`;
      const x = porComp.get(k) ?? { t, n24: 0, m24: 0, n7: 0, m7: 0 };
      if (f.reciente) { x.n24 += 1; x.m24 += mala ? 1 : 0; } else { x.n7 += 1; x.m7 += mala ? 1 : 0; }
      porComp.set(k, x);
      if (a.estado === 'hecha' && !mala && (f.reciente ? muestra24 < 250 : muestra7 < 750)) {
        const tipos = Object.fromEntries(tiposDe.all(t, c, g, Number(j), cod).map((r) => [r.tipo, r.n]));
        const js = jugadoresDe.get(t, c, g, Number(j), cod);
        if (js?.n) {
          if (f.reciente) muestra24 += 1; else muestra7 += 1;
          const v = f.reciente ? '24' : '7';
          const y = riqueza.get(k) ?? { t, n24: 0, tarj24: 0, camb24: 0, jug24: 0, cod24: 0, n7: 0, tarj7: 0, camb7: 0, jug7: 0, cod7: 0 };
          y[`n${v}`] += 1;
          if (Object.keys(tipos).some((x2) => /amarill|roj/.test(x2))) y[`tarj${v}`] += 1;
          if (tipos.sale || tipos.entra) y[`camb${v}`] += 1;
          y[`jug${v}`] += js.n; y[`cod${v}`] += js.k ?? 0;
          riqueza.set(k, y);
        }
      }
    }
    const porTemp = new Map();
    for (const x of porComp.values()) {
      if (!x.n24 || !x.n7) continue;
      const y = porTemp.get(x.t) ?? { etiqueta: etiquetas.get(x.t) ?? x.t, n24: 0, m24: 0, n7: 0, m7: 0 };
      y.n24 += x.n24; y.m24 += x.m24; y.n7 += x.n7; y.m7 += x.m7; porTemp.set(x.t, y);
    }
    m.calidadPorTemporada = [...porTemp.values()];
    const nombreComp = db.prepare('select nombre from competiciones where temporada=? and codigo=?');
    m.calidadPorCompeticion = [...porComp.entries()].filter(([, x]) => x.n24 && x.n7).map(([k, x]) => {
      const c = k.split('|')[1];
      let nombre = null; try { nombre = nombreComp.get(x.t, c)?.nombre ?? null; } catch { /* sin tabla */ }
      return { etiqueta: etiquetas.get(x.t) ?? x.t, c, nombre, n24: x.n24, m24: x.m24, n7: x.n7, m7: x.m7 };
    });
    // Como la calidad: sólo las competiciones que están en las dos ventanas (la base no trae tarjetas ni cambios,
    // y una tanda de base en 24 h frente a una semana de sénior parecería una caída).
    const riquezaTemp = new Map();
    for (const x of riqueza.values()) {
      if (!x.n24 || !x.n7) continue;
      const y = riquezaTemp.get(x.t) ?? { etiqueta: etiquetas.get(x.t) ?? x.t, n24: 0, tarj24: 0, camb24: 0, jug24: 0, cod24: 0, n7: 0, tarj7: 0, camb7: 0, jug7: 0, cod7: 0 };
      for (const c of Object.keys(y)) if (c !== 'etiqueta') y[c] += x[c];
      riquezaTemp.set(x.t, y);
    }
    m.riquezaPorTemporada = [...riquezaTemp.values()];
    m.riquezaPorCompeticion = [...riqueza.entries()].filter(([, x]) => x.n24 && x.n7).map(([k, x]) => ({ ...x, c: k.split('|')[1] }));
  } catch (e) {
    m.error = e.message;
  } finally {
    try { db?.close(); } catch { /* nada */ }
  }
  m.msMedir = Date.now() - t0;
  return m;
}

function mideMaquina() {
  const r = { memoriaLibreGb: freemem() / 2 ** 30, uptimeMin: Math.round(uptime() / 60) };
  try { const s = statfsSync(RAIZ); r.discoLibreGb = (s.bavail * s.bsize) / 2 ** 30; } catch { /* sin statfs */ }
  return r;
}

function mideTodo() {
  const ahora = Date.now();
  const federaciones = [];
  for (const d of readdirSync(RAIZ).filter((n) => n.startsWith('descargas-') && !/prueba|sondeo|multideporte|aficionado/.test(n)).sort()) {
    const fed = d.replace('descargas-', '');
    if (PEDIDAS.length && !PEDIDAS.includes(fed)) continue;
    const ruta = join(RAIZ, d, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta)) continue;
    // Sólo las de este reparto: las demás carpetas son copias viejas de la otra máquina (medirlas cuesta minutos).
    if (!PEDIDAS.length && !(REPARTO[MAQUINA] ?? []).includes(fed)) continue;
    federaciones.push(mideCola(fed, ruta, ahora));
  }
  return { maquina: MAQUINA, ahora: iso(ahora), maquinaMetricas: mideMaquina(), federaciones };
}

const N = (x) => (x == null ? '—' : Number(x).toLocaleString('es-ES'));
function resumenTexto(med, avisos) {
  const l = [`════ vigía de colas · ${med.maquina} · ${new Date(med.ahora).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })} ════`];
  const crit = avisos.filter((a) => a.nivel === 'critico'); const av = avisos.filter((a) => a.nivel === 'aviso');
  l.push(crit.length || av.length ? `${crit.length} CRÍTICOS · ${av.length} avisos` : 'todo en orden');
  for (const a of [...crit, ...av]) l.push(`  ${a.nivel === 'critico' ? '‼' : '!'} ${a.federacion}: ${a.codigo} — ${a.texto}`);
  for (const a of avisos.filter((x) => x.nivel === 'info' && x.codigo !== 'sin_trabajo')) l.push(`  · ${a.federacion}: ${a.codigo} — ${a.texto}`);
  const mq = med.maquinaMetricas ?? {};
  l.push(`máquina: disco ${mq.discoLibreGb?.toFixed?.(0) ?? '—'} GB libres · memoria ${mq.memoriaLibreGb?.toFixed?.(1) ?? '—'} GB · encendida ${N(mq.uptimeMin)} min`);
  l.push('federación          últ.  1h   24h  med7d  vencido  aplaz.  vacías24  sinActas24  errores1h');
  const propias = new Set(REPARTO[med.maquina] ?? []);
  for (const m of med.federaciones) {
    if (!propias.has(m.federacion)) continue;
    const hace = m.ultimaPeticion ? Math.round((Date.parse(med.ahora) - Date.parse(m.ultimaPeticion)) / 60000) : null;
    const v7 = [...(m.peticionesPorDia7 ?? [])].sort((a, b) => a - b); const med7 = v7.length ? v7[Math.floor(v7.length / 2)] : null;
    const tot1h = Object.values(m.resultados1h ?? {}).reduce((s, n) => s + n, 0);
    l.push(`${m.federacion.padEnd(18)} ${String(hace == null ? '—' : hace < 120 ? `${hace}m` : `${Math.round(hace / 60)}h`).padStart(5)} ${String(tot1h).padStart(4)} ${String(m.peticiones24 ?? 0).padStart(5)} ${String(med7 ?? '—').padStart(6)} ${String(m.vencido ?? '—').padStart(8)} ${String(m.aplazado ?? '—').padStart(7)} `
      + `${String(`${m.jornadasVacias24 ?? 0}/${m.jornadasLeidas24 ?? 0}`).padStart(9)} ${String(`${m.jornadasSinActas24 ?? 0}/${m.jornadasConPartidos24 ?? 0}`).padStart(11)} ${String(m.errores1hNuestros ?? 0).padStart(10)}`
      + `${m.pausaHasta && Date.parse(m.pausaHasta) > Date.parse(med.ahora) ? `  PAUSA→${m.pausaHasta.slice(5, 16)}` : ''}${m.error ? `  ERROR ${m.error.slice(0, 60)}` : ''}`);
  }
  return l.join('\n');
}

async function avisa(titulo, cuerpo) {
  const envios = [];
  const tg = process.env.ALERTAS_TELEGRAM_TOKEN; const chat = process.env.ALERTAS_TELEGRAM_CHAT;
  if (tg && chat) envios.push(fetch(`https://api.telegram.org/bot${tg}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: `${titulo}\n${cuerpo}` }) }));
  if (process.env.ALERTAS_NTFY_URL) envios.push(fetch(process.env.ALERTAS_NTFY_URL, { method: 'POST', headers: { Title: titulo }, body: cuerpo }));
  if (process.env.ALERTAS_WEBHOOK_URL) envios.push(fetch(process.env.ALERTAS_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ titulo, cuerpo }) }));
  if (!envios.length) return 'sin canal';
  const r = await Promise.allSettled(envios);
  return r.every((x) => x.status === 'fulfilled') ? 'enviado' : 'fallo al enviar';
}

async function evaluaYEscribe(med) {
  const ahora = Date.parse(med.ahora);
  // El PC se suspende de noche y el reloj de «encendido» de Windows puede contar el tiempo dormido: se toma como
  // arranque también el hueco desde la pasada anterior del vigía (si pasó más de media hora, la máquina dormía).
  mkdirSync(DIR, { recursive: true });
  const rutaPasada = join(DIR, `${med.maquina}-despierta.json`);
  let pasada = {};
  try { pasada = JSON.parse(readFileSync(rutaPasada, 'utf8')); } catch { /* primera */ }
  const anterior = pasada.ultima ? Date.parse(pasada.ultima) : null;
  // Despierta desde: la primera pasada tras un hueco de más de media hora (o desde que arrancó el sistema).
  const despierta = !anterior || ahora - anterior > 30 * 60000 ? ahora : Date.parse(pasada.despiertaDesde ?? med.ahora);
  writeFileSync(rutaPasada, JSON.stringify({ ultima: med.ahora, despiertaDesde: new Date(despierta).toISOString() }));
  const uptimeMin = Math.min((ahora - despierta) / 60000, med.maquinaMetricas?.uptimeMin ?? Infinity);
  const ctx = { maquina: med.maquina, ahora, uptimeMin, propias: new Set(REPARTO[med.maquina] ?? []) };
  const avisos = [...evaluaMaquina(med.maquinaMetricas ?? {}), ...med.federaciones.flatMap((m) => evaluaFederacion(m, ctx))];
  mkdirSync(DIR, { recursive: true });
  const rutaEstado = join(DIR, `${med.maquina}-estado.json`);
  let previos = {};
  try { previos = JSON.parse(readFileSync(rutaEstado, 'utf8')); } catch { /* primera vez */ }
  if (PEDIDAS.length) return resumenTexto(med, avisos); // prueba parcial: no toca el estado ni avisa
  const { estado, nuevos, recordar, resueltos } = comparaConAnteriores(avisos, previos, ahora);
  writeFileSync(rutaEstado, JSON.stringify(estado, null, 2));
  writeFileSync(join(DIR, `${med.maquina}.json`), JSON.stringify({ ...med, avisos }, null, 2));
  const texto = resumenTexto(med, avisos);
  writeFileSync(join(DIR, `${med.maquina}.txt`), `${texto}\n`);
  const lineas = [
    ...nuevos.map((a) => `NUEVO     ${a.nivel.padEnd(7)} ${med.maquina}/${a.federacion} ${a.codigo}: ${a.texto}`),
    ...recordar.map((a) => `SIGUE     ${a.nivel.padEnd(7)} ${med.maquina}/${a.federacion} ${a.codigo} (desde ${a.desde.slice(0, 16)}): ${a.texto}`),
    ...resueltos.map((a) => `RESUELTO          ${med.maquina}/${a.federacion} ${a.codigo} (desde ${a.desde.slice(0, 16)})`),
  ];
  if (lineas.length) appendFileSync(join(DIR, 'alertas.log'), lineas.map((x) => `${med.ahora.slice(0, 16)}  ${x}`).join('\n') + '\n');
  if (!SIN_AVISOS && (nuevos.length || recordar.length || resueltos.length)) {
    const importantes = [...nuevos, ...recordar];
    const titulo = importantes.some((a) => a.nivel === 'critico') ? `facylf ‼ ${med.maquina}` : `facylf · ${med.maquina}`;
    const r = await avisa(titulo, lineas.join('\n').slice(0, 3500));
    if (r !== 'enviado' && r !== 'sin canal') appendFileSync(join(DIR, 'alertas.log'), `${med.ahora.slice(0, 16)}  (aviso no enviado: ${r})\n`);
  }
  return texto;
}

if (SOLO_MEDIR) {
  process.stdout.write(JSON.stringify(mideTodo()));
} else {
  const med = DESDE ? JSON.parse(readFileSync(DESDE, 'utf8')) : mideTodo();
  console.log(await evaluaYEscribe(med));
}
