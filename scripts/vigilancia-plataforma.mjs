#!/usr/bin/env node
/**
 * VIGILANCIA DE LA PLATAFORMA: comprueba la salud cada 15 minutos y avisa al móvil cuando algo se rompe.
 *
 * Qué mira (migración 0030, función ops.chequeos(); ~25 comprobaciones):
 *   · procesos: grupos pendientes de proyectar, lotes fallidos o colgados, federaciones sin lote en 48 h;
 *   · calidad: actas «a revisar», goles que no cuadran, amarillas duplicadas, titular en dos partidos a la vez,
 *     % de minutos no calculables por federación, edades incoherentes, expulsado que juega el siguiente;
 *   · base: tamaño, conexiones, bloqueos, consultas largas, tuplas muertas;
 *   · rendimiento: consultas de la web por encima de su presupuesto, errores de la web, sentencias lentas;
 *   · copias: última copia y última restauración de prueba.
 * Y desde aquí (no se puede en SQL): memoria libre del equipo, disco libre donde van las copias y, si se
 * configura, que la web responde (`/api/salud`).
 *
 * Cómo avisa (variables en .env; se puede usar más de un canal):
 *   ALERTAS_TELEGRAM_TOKEN + ALERTAS_TELEGRAM_CHAT   → bot de Telegram (lo más simple en el móvil)
 *   ALERTAS_NTFY_URL  (p. ej. http://127.0.0.1:8090/facylf-alertas, ntfy en Docker, privado)
 *   ALERTAS_WEBHOOK_URL  → POST JSON genérico
 * Sin ningún canal, escribe en consola y en ops.evento_app (se ve en la pantalla «Salud»).
 * Avisa al ABRIR una alerta, al CERRARLA y, si sigue abierta, un recordatorio cada 6 h (no spam).
 * `--resumen` manda el parte diario (pensado para las 8:00): alertas abiertas y lo peor de las últimas 24 h.
 *
 * Uso:
 *   node scripts/vigilancia-plataforma.mjs                 una pasada (Programador de tareas cada 15 min)
 *   node scripts/vigilancia-plataforma.mjs --bucle 15      se queda corriendo, una pasada cada 15 min
 *   node scripts/vigilancia-plataforma.mjs --resumen       parte diario
 *   node scripts/vigilancia-plataforma.mjs --probar-aviso  manda un aviso de prueba por los canales
 * Rol: DATABASE_URL_PUBLICADOR (nunca admin). No escribe nada fuera de ops.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freemem, totalmem, loadavg, hostname } from 'node:os';
import { statfsSync, existsSync } from 'node:fs';

try { process.loadEnvFile('.env'); } catch { /* el entorno puede venir de fuera */ }
const { Client } = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'canonico', 'package.json'))('pg');

const args = process.argv.slice(2);
const valor = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const bucle = valor('--bucle', null);
const resumen = args.includes('--resumen');
const probar = args.includes('--probar-aviso');
const url = (process.env.DATABASE_URL_PUBLICADOR ?? '').trim();
const DESTINO_COPIAS = process.env.FACYLF_COPIAS ?? (process.platform === 'win32' ? 'D:\\facylf-copias' : '/srv/data/facylf-copias');
const GB = 1024 ** 3;

const EMOJI = { abre: '🔴', cierra: '✅', sigue: '🟠', resumen: '📋', prueba: '🧪' };
const TEXTO_AREA = { procesos: 'Procesos', frescura: 'Frescura de datos', calidad: 'Calidad de datos', identidad: 'Identidad',
  base: 'Base de datos', rendimiento: 'Rendimiento web', copias: 'Copias', equipo: 'Equipo' };

async function avisa(titulo, cuerpo, tipo = 'abre') {
  const texto = `${EMOJI[tipo] ?? ''} ${titulo}\n${cuerpo}`.trim();
  const envios = [];
  const tg = process.env.ALERTAS_TELEGRAM_TOKEN, chat = process.env.ALERTAS_TELEGRAM_CHAT;
  if (tg && chat) {
    envios.push(fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto.slice(0, 4000), disable_web_page_preview: true }),
    }).then((r) => { if (!r.ok) throw new Error(`telegram ${r.status}`); }));
  }
  if (process.env.ALERTAS_NTFY_URL) {
    envios.push(fetch(process.env.ALERTAS_NTFY_URL, {
      method: 'POST', body: cuerpo.slice(0, 4000),
      // Las cabeceras HTTP sólo admiten ASCII: el título va en RFC 2047 (ntfy lo entiende).
      headers: { Title: `=?UTF-8?B?${Buffer.from(titulo.slice(0, 120)).toString('base64')}?=`, Priority: tipo === 'abre' ? 'high' : 'default', Tags: tipo },
    }).then((r) => { if (!r.ok) throw new Error(`ntfy ${r.status}`); }));
  }
  if (process.env.ALERTAS_WEBHOOK_URL) {
    envios.push(fetch(process.env.ALERTAS_WEBHOOK_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ titulo, cuerpo, tipo, equipo: hostname() }),
    }).then((r) => { if (!r.ok) throw new Error(`webhook ${r.status}`); }));
  }
  console.log(texto);
  const res = await Promise.allSettled(envios);
  const fallidos = res.filter((r) => r.status === 'rejected').map((r) => r.reason?.message);
  return { canales: envios.length, fallidos };
}

/** Lo que no se puede mirar desde SQL: memoria, carga, disco de copias y la web. */
async function chequeosDelEquipo() {
  const out = [];
  const libre = freemem() / GB;
  out.push({ nombre: 'memoria_libre_gb', area: 'equipo', estado: libre < 3 ? 'aviso' : 'ok', valor: +libre.toFixed(1),
    detalle: { total_gb: +(totalmem() / GB).toFixed(1) } });
  if (process.platform !== 'win32') {
    const carga = loadavg()[0];
    out.push({ nombre: 'carga_1min', area: 'equipo', estado: carga > 14 ? 'aviso' : 'ok', valor: +carga.toFixed(1), detalle: {} });
  }
  if (existsSync(DESTINO_COPIAS)) {
    const s = statfsSync(DESTINO_COPIAS);
    const libreDisco = (s.bavail * s.bsize) / GB;
    out.push({ nombre: 'disco_copias_gb', area: 'equipo', estado: libreDisco < 50 ? 'aviso' : 'ok', valor: +libreDisco.toFixed(0),
      detalle: { ruta: DESTINO_COPIAS } });
  }
  if (process.env.WEB_URL) {
    const t = Date.now();
    let estado = 'ok', detalle = {};
    try {
      const r = await fetch(new URL('/api/salud', process.env.WEB_URL), { signal: AbortSignal.timeout(10000) });
      detalle = { http: r.status, ms: Date.now() - t };
      if (!r.ok) estado = 'fallo'; else if (Date.now() - t > 3000) estado = 'aviso';
    } catch (e) { estado = 'fallo'; detalle = { error: e.message }; }
    out.push({ nombre: 'web_responde', area: 'rendimiento', estado, valor: Date.now() - t, detalle });
  }
  return out;
}

function lineaAlerta(a) {
  const det = a.detalle && Object.keys(a.detalle).length ? ` · ${JSON.stringify(a.detalle).slice(0, 300)}` : '';
  return `${TEXTO_AREA[a.area] ?? a.area}: ${a.nombre}${a.valor !== null && a.valor !== undefined ? ` = ${a.valor}` : ''}${det}`;
}

async function pasada(cliente) {
  // Los chequeos del equipo se guardan como eventos y como alertas igual que los de SQL.
  const delEquipo = await chequeosDelEquipo();
  // La Preferente (L5): resultados que LP ya tiene y la federación no, marcadores distintos y emparejados dudosos.
  // Una vez por hora (la pasada es cada 15 min): la consulta recorre externo.lp_partido entero.
  if (new Date().getMinutes() < 15) try { const { chequeosLaPreferente } = await import('./lapreferente/vigia.mjs'); delEquipo.push(...await chequeosLaPreferente(cliente)); }
  catch (e) { console.error(`(vigía de La Preferente: ${e.message})`); }
  const transiciones = [];
  await cliente.query('begin');
  try {
    const { rows } = await cliente.query('select * from ops.registra_chequeos()');
    transiciones.push(...rows);
    for (const c of delEquipo) {
      const { rows: [prev] } = await cliente.query(`select estado from ops.alerta where nombre = $1`, [c.nombre]);
      const mal = c.estado === 'aviso' || c.estado === 'fallo';
      if (mal && prev?.estado !== 'abierta') {
        await cliente.query(`insert into ops.alerta (nombre, area, estado, severidad, valor, detalle) values ($1,$2,'abierta',$3,$4,$5)
          on conflict (nombre) do update set estado='abierta', severidad=excluded.severidad, abierta_en=now(), ultima_vez=now(),
            cerrada_en=null, veces=ops.alerta.veces+1, valor=excluded.valor, detalle=excluded.detalle, notificada_en=null`,
          [c.nombre, c.area, c.estado, c.valor, c.detalle]);
        transiciones.push({ accion: 'abre', ...c, severidad: c.estado });
      } else if (!mal && prev?.estado === 'abierta') {
        await cliente.query(`update ops.alerta set estado='cerrada', cerrada_en=now() where nombre=$1`, [c.nombre]);
        transiciones.push({ accion: 'cierra', ...c });
      } else if (mal) {
        await cliente.query(`update ops.alerta set ultima_vez=now(), valor=$2, detalle=$3 where nombre=$1`, [c.nombre, c.valor, c.detalle]);
      }
    }
    await cliente.query('commit');
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    throw e;
  }
  if (transiciones.length === 0) { console.log(`${new Date().toISOString()} · sin cambios`); return; }

  const abre = transiciones.filter((t) => t.accion === 'abre');
  const sigue = transiciones.filter((t) => t.accion === 'sigue');
  const cierra = transiciones.filter((t) => t.accion === 'cierra');
  const partes = [];
  if (abre.length) partes.push(['abre', `${abre.length} problema(s) nuevo(s)`, abre.map(lineaAlerta).join('\n')]);
  if (sigue.length) partes.push(['sigue', `${sigue.length} problema(s) siguen abiertos`, sigue.map(lineaAlerta).join('\n')]);
  if (cierra.length) partes.push(['cierra', `${cierra.length} resuelto(s)`, cierra.map((c) => `${TEXTO_AREA[c.area] ?? c.area}: ${c.nombre}`).join('\n')]);
  for (const [tipo, titulo, cuerpo] of partes) {
    const r = await avisa(`facylf · ${titulo}`, cuerpo, tipo);
    if (r.fallidos.length) {
      await cliente.query(`insert into ops.evento_app (nivel, origen, tipo, mensaje, detalle) values ('aviso','vigilancia','aviso_no_enviado',$1,$2)`,
        [`No se pudo avisar por ${r.fallidos.join(', ')}`, { titulo }]).catch(() => {});
    }
  }
  const avisadas = [...abre, ...sigue].map((t) => t.nombre);
  if (avisadas.length) await cliente.query('select ops.marca_notificada($1)', [avisadas]);
}

async function parteDiario(cliente) {
  const { rows: abiertas } = await cliente.query(`select * from ops.salud order by severidad desc, abierta_en`);
  const { rows: peor } = await cliente.query(`select nombre, area, peor, valor from ops.chequeo_diario
     where dia >= current_date - 1 and peor in ('aviso','fallo') order by peor desc, nombre limit 20`);
  const { rows: [web] } = await cliente.query(`select coalesce(sum(n),0)::int n, coalesce(sum(errores),0)::int errores,
     coalesce(max(ms_p95),0)::int p95 from ops.consulta_minuto where minuto > now() - interval '24 hours'`);
  const { rows: [copia] } = await cliente.query(`select max(terminada_en) t, (array_agg(bytes order by terminada_en desc))[1] b
     from ops.copia where tipo='copia' and correcta`);
  const cuerpo = [
    abiertas.length ? `Abiertas (${abiertas.length}):\n${abiertas.map(lineaAlerta).join('\n')}` : 'Sin alertas abiertas ✓',
    peor.length ? `Últimas 24 h, lo peor:\n${peor.map((p) => `${p.peor} · ${p.nombre} = ${p.valor}`).join('\n')}` : '',
    `Web 24 h: ${web.n} consultas, ${web.errores} errores, p95 máx ${web.p95} ms`,
    `Última copia: ${copia.t ? new Date(copia.t).toLocaleString('es-ES') : 'NINGUNA'}${copia.b ? ` (${(copia.b / GB).toFixed(2)} GB)` : ''}`,
  ].filter(Boolean).join('\n\n');
  await avisa('facylf · parte diario', cuerpo, 'resumen');
}

if (probar) { const r = await avisa('facylf · aviso de prueba', `Si lees esto, los avisos funcionan. Equipo: ${hostname()}`, 'prueba'); console.log(r); process.exit(r.fallidos.length ? 1 : 0); }
if (!url || /facylf_admin/.test(url)) { console.error('✗ Falta DATABASE_URL_PUBLICADOR (y no puede ser facylf_admin).'); process.exit(2); }

// Evento suelto de otro script (p. ej. despliega-plataforma.mjs):  --evento <nivel> <tipo> <mensaje> [detalle JSON]
// Queda en ops.evento_app (origen 'mantenimiento') y, si es un error, avisa por el canal de alertas.
if (args.includes('--evento')) {
  const i = args.indexOf('--evento');
  const [nivel, tipo, mensaje, detalle] = args.slice(i + 1, i + 5);
  const cliente = new Client({ connectionString: url, application_name: 'vigilancia-evento' });
  try {
    await cliente.connect();
    await cliente.query(`insert into ops.evento_app (nivel, origen, tipo, mensaje, detalle) values ($1, 'mantenimiento', $2, $3, $4)`,
      [nivel, tipo, String(mensaje ?? '').slice(0, 500), detalle ? JSON.parse(detalle) : {}]);
  } catch (e) { console.error(`✗ ${e.message}`); }
  finally { await cliente.end().catch(() => {}); }
  if (nivel === 'error' || nivel === 'critico') await avisa(`facylf · ${tipo}`, `${mensaje}
Equipo: ${hostname()}`, 'abre');
  process.exit(0);
}

async function una() {
  const cliente = new Client({ connectionString: url, application_name: 'vigilancia-plataforma' });
  try {
    await cliente.connect();
    await cliente.query(`set statement_timeout = '60s'`);
    const ok = (await cliente.query(`select to_regprocedure('ops.registra_chequeos()') is not null as ok`)).rows[0].ok;
    if (!ok) { console.error('✗ Falta la migración 0030.'); return 2; }
    if (resumen) await parteDiario(cliente); else await pasada(cliente);
    return 0;
  } catch (e) {
    // Si no hay base, eso ES la alerta más importante.
    await avisa('facylf · la vigilancia no puede entrar en la base', `${e.message}\n¿Docker parado? ¿Contraseña? Equipo: ${hostname()}`, 'abre');
    return 1;
  } finally {
    await cliente.end().catch(() => {});
  }
}

if (bucle) {
  const minutos = Math.max(5, Number(bucle));
  console.log(`Vigilancia cada ${minutos} min (Ctrl+C para parar).`);
  for (;;) { await una(); await new Promise((r) => setTimeout(r, minutos * 60000)); }
} else {
  process.exit(await una());
}
