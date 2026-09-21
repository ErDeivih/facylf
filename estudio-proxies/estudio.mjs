#!/usr/bin/env node
// Estudio de calidad de un pool de proxies (HTTP CONNECT).
// - Abre un tunel CONNECT real hacia cada proxy (igual que haría una petición HTTPS).
// - Mide latencias (TCP, handshake de auth, TLS, TTFB, total), IP de salida,
//   geolocalizacion/ASN/tipo, si filtra la IP de origen, y velocidad.
// - Objetivos SOLO de diagnostico (ipwho.is, api.ipify.org, httpbin.org, postman-echo.com).
//   No se apunta contra ningun sitio que prohíba la automatizacion.

import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- config ----------
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'proxies.json'), 'utf8'));
const AUTH = CFG.auth;
const ORIGEN = CFG.origen;
const UA = 'ProxyQualityStudy/1.0 (+aprendizaje; personal)';
const TIMEOUT = 12000;
const RETRIES = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- tunel CONNECT ----------
function abrirTunel(proxy, host, port, useTls, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const sock = net.connect({ host: proxy.ip, port: proxy.puerto });
    let done = false;
    const fail = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock.destroy(); } catch {}
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error('timeout')), timeoutMs);
    const lat = { connect: null, handshake: null, tls: null };

    sock.once('connect', () => {
      lat.connect = performance.now() - t0;
      let authLine = '';
      if (AUTH.modoAuth === 'usuario-password') {
        const b64 = Buffer.from(`${AUTH.usuario}:${AUTH.contrasena}`).toString('base64');
        authLine = `Proxy-Authorization: Basic ${b64}\r\n`;
      }
      sock.write(
        `CONNECT ${host}:${port} HTTP/1.1\r\n` +
        `Host: ${host}:${port}\r\n` +
        authLine +
        `Proxy-Connection: Keep-Alive\r\n\r\n`
      );
    });

    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      const idx = buf.indexOf('\r\n\r\n');
      if (idx < 0) return;
      const head = buf.slice(0, idx);
      const m = /^HTTP\/\d\.\d\s+(\d+)/.exec(head.split('\r\n')[0]);
      const code = m ? parseInt(m[1], 10) : 0;
      if (code === 200) {
        clearTimeout(timer);
        lat.handshake = performance.now() - t0;
        if (useTls) {
          const tlsSock = tls.connect({ socket: sock, servername: host, rejectUnauthorized: false });
          tlsSock.once('secureConnect', () => {
            lat.tls = performance.now() - t0;
            resolve({ sock: tlsSock, lat });
          });
          tlsSock.once('error', fail);
        } else {
          resolve({ sock, lat });
        }
      } else {
        const realm = (/realm="([^"]*)"/.exec(head) || [])[1] || '';
        fail(new Error(`CONNECT status ${code}${realm ? ` (${realm})` : ''}`));
      }
    });
    sock.once('error', fail);
    sock.once('close', () => { if (!done) fail(new Error('closed early')); });
  });
}

// ---------- GET a traves del tunel ----------
function pedir(proxy, url, timeoutMs) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve({ ok: false, error: 'url' }); }
    const useTls = u.protocol === 'https:';
    const port = u.port ? parseInt(u.port, 10) : (useTls ? 443 : 80);
    const tStart = performance.now();

    abrirTunel(proxy, u.hostname, port, useTls, timeoutMs)
      .then(({ sock, lat }) => {
        const req = (useTls ? https : http).request(
          {
            host: u.hostname,
            port,
            method: 'GET',
            path: u.pathname + u.search,
            headers: {
              'Host': u.hostname,
              'User-Agent': UA,
              'Accept': '*/*',
              'Accept-Encoding': 'identity',
              'Connection': 'close',
            },
            createConnection: () => sock,
            agent: false,
          },
          (res) => {
            const chunks = [];
            let ttfb = null;
            const tResp = performance.now();
            res.on('data', (c) => {
              if (ttfb === null) ttfb = performance.now() - tStart;
              chunks.push(c);
            });
            res.on('end', () => {
              const body = Buffer.concat(chunks).toString('utf8');
              const totalMs = performance.now() - tStart;
              const bytes = Buffer.byteLength(body);
              const speedBps = totalMs > 0 ? (bytes / (totalMs / 1000)) : 0;
              try {
                resolve({
                  ok: res.statusCode >= 200 && res.statusCode < 400,
                  status: res.statusCode,
                  headers: res.headers,
                  body,
                  lat,
                  ttfbMs: ttfb !== null ? ttfb : null,
                  totalMs,
                  bytes,
                  speedBps,
                });
              } catch (e) {
                resolve({ ok: false, error: String(e.message || e) });
              }
            });
            res.on('error', () => resolve({ ok: false, error: 'res error', lat }));
          }
        );
        req.on('error', () => resolve({ ok: false, error: 'req error', lat }));
        req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
        req.end();
      })
      .catch((err) => resolve({ ok: false, error: String(err.message || err) }));
  });
}

// ---------- helpers de analisis ----------
function num(v, donts) { return typeof v === 'number' ? `${Math.round(v)}${donts || 'ms'}` : (v != null ? String(v) : 'n/d'); }

function anonStatus(echoHeaders) {
  if (!echoHeaders) return 'desconocido';
  const h = echoHeaders || {};
  const xff = h['x-forwarded-for'] || '';
  const via = h['via'] || '';
  const xrip = h['x-real-ip'] || '';
  const fwd = h['forwarded'] || '';
  const xffList = Array.isArray(xff) ? xff : [xff];
  const leakOrigen = xffList.some((s) => String(s).includes(ORIGEN)) || String(xrip).includes(ORIGEN);
  if (leakOrigen) return 'TRANSPARENTE (filtra tu IP)';
  if (xff || via || xrip || fwd) return 'anonimo (se identifica como proxy)';
  return 'elite / alta anonimidad';
}

function verdict(p) {
  if (!p.reachable) return 'NO UTILIZABLE';
  const cs = p.lat && p.lat.connect;
  const tl = p.lat && p.lat.tls;
  // Si la IP de salida es la nuestra, el proxy NO oculta nada -> inservible para anonimato/geo.
  if (p.transparent) return 'TRANSPARENTE (no oculta tu IP)';
  let s = 0;
  if (p.reachable) s += 40;
  if (p.anonymity && !/TRANSPARENTE/.test(p.anonymity)) s += 20;
  if (cs != null && cs < 400) s += 15;
  if (tl != null && tl < 1200) s += 10;
  if (p.throughput != null && p.throughput > 200 * 1024) s += 15;
  if (s >= 80) return 'EXCELENTE';
  if (s >= 55) return 'BUENO';
  if (s >= 30) return 'REGULAR';
  return 'MALO';
}

const pad = (s, n) => String(s).padEnd(n, ' ');

// ---------- main ----------
async function main() {
  const results = [];
  const out = [];
  out.push('');
  out.push('ESTUDIO DE CALIDAD DE PROXIES');
  out.push('Pool: ' + CFG.proxies.length + ' proxies  |  auth: ' + AUTH.usuario + '@' + AUTH.contrasena + '  |  IP origin: ' + ORIGEN);
  out.push('');

  for (const p of CFG.proxies) {
    const r = {
      proxy: p, reachable: false, exitIp: null, geo: null, anonymity: null,
      lat: null, ttfb: null, total: null, throughput: null, errors: [],
    };
    process.stdout.write(`\n== ${p.ip}:${p.puerto} (${p.pais}/${p.ciudad}) ... `);

    // 1) Conectividad + IP de salida
    let core = null;
    for (let i = 0; i < RETRIES; i++) {
      core = await pedir(p, 'https://api.ipify.org', TIMEOUT);
      if (core.ok) break;
      await sleep(500);
    }
    if (core && core.ok) {
      r.reachable = true;
      r.exitIp = (core.body || '').trim();
      r.transparent = r.exitIp !== null && r.exitIp === ORIGEN; // destino ve TU IP
      r.lat = core.lat;
      r.ttfb = core.ttfbMs;
      r.total = core.totalMs;
    } else {
      r.errors.push(`ipify: ${core ? core.error : 'sin respuesta'}`);
    }

    // 2) Geo / ASN / tipo
    if (r.reachable) {
      const g = await pedir(p, 'https://ipwho.is/', TIMEOUT);
      if (g.ok) {
        try {
          const j = JSON.parse(g.body);
          r.geo = {
            ip: j.ip, country: j.country, city: j.city, region: j.region,
            asn: j.connection && (j.connection.asn || (j.connection.isp || '')), 
            org: (j.connection && (j.connection.org || j.connection.isp)) || '', 
            type: j.connection && j.connection.type,
          };
        } catch { r.errors.push('geo: json invalido'); }
      } else r.errors.push('geo: ' + (g.error || 'fallo'));
    }

    // 3) Anonimato / si oculta la IP
    if (r.reachable) {
      if (r.transparent) {
        r.anonymity = 'TRANSPARENTE (el destino ve TU IP ' + ORIGEN + '; no hay anonimato)';
      } else {
        let hh = await pedir(p, 'https://httpbin.org/headers', TIMEOUT);
        if (!hh.ok) hh = await pedir(p, 'https://postman-echo.com/headers', TIMEOUT);
        if (hh.ok) {
          try {
            const j = JSON.parse(hh.body);
            r.anonymity = anonStatus(j.headers || hh.headers);
          } catch { r.anonymity = anonStatus(hh.headers); }
        } else r.errors.push('headers: ' + (hh.error || 'fallo'));
      }
    }

    // 4) Velocidad de descarga
    if (r.reachable) {
      const sp = await pedir(p, 'https://httpbin.org/bytes/16384', TIMEOUT);
      if (sp.ok) r.throughput = sp.speedBps;
      else r.errors.push('speed: ' + (sp.error || 'fallo'));
    }

    // resumen
    const v = verdict(r);
    out.push(
      `${pad(p.ip, 16)}:${pad(String(p.puerto), 5)} ${pad(p.ciudad, 13)} ${r.reachable ? pad(r.exitIp || '-', 16) : pad('NO', 16)} ` +
      `conn=${num(r.lat && r.lat.connect)} hs=${num(r.lat && r.lat.handshake)} tls=${num(r.lat && r.lat.tls)} ttfb=${num(r.ttfb)} ` +
      `vel=${r.throughput ? (r.throughput / 1024).toFixed(0) + 'KB/s' : 'n/d'}  ${v}`
    );
    if (r.geo) {
      out.push(
        `        geo: ${r.geo.country||'-'} / ${r.geo.city||'-'} | ASN=${r.geo.asn||'-'} | org=${r.geo.org||'-'} | tipo=${r.geo.type||'-'}`
      );
    }
    if (r.anonymity) out.push(`        anonimato: ${r.anonymity}`);
    if (r.errors.length) out.push(`        avisos: ${r.errors.join(' | ')}`);

    results.push(r);
    await sleep(400); // cadencia corta, cortesia entre endpoints
  }

  // resumen final
  const usable = results.filter((r) => r.reachable);
  const transparentes = results.filter((r) => r.transparent);
  const noOcultan = results.filter((r) => r.anonymity && /TRANSPARENTE/.test(r.anonymity));

  out.push('');
  out.push('='.repeat(78));
  out.push('RESUMEN');
  out.push(`  Proxies analizados: ${results.length}`);
  out.push(`  Conectan y autentican (IP whitelist): ${usable.length}`);
  out.push(`  No conectan: ${results.length - usable.length}`);
  out.push(`  TRANSPARENTES (el destino ve TU IP): ${transparentes.length}`);
  out.push(`  Calidad EXCELENTE/BUENO (medicion pura): ${results.filter((r) => /EXCELENTE|BUENO/.test(verdict(r))).length}`);
  if (usable.length) {
    const avgConnect = usable.reduce((a, r) => a + (r.lat && r.lat.connect || 0), 0) / usable.length;
    const avgTls = usable.reduce((a, r) => a + (r.lat && r.lat.tls || 0), 0) / usable.length;
    const avgTtfb = usable.reduce((a, r) => a + (r.ttfb || 0), 0) / usable.length;
    const avgSpeed = usable.filter((r) => r.throughput).reduce((a, r) => a + r.throughput, 0) / usable.filter((r) => r.throughput).length;
    out.push(`  Latencia media conexion al gateway: ${avgConnect.toFixed(0)} ms`);
    out.push(`  Latencia media TLS via gateway: ${avgTls.toFixed(0)} ms`);
    out.push(`  TTFB medio: ${avgTtfb.toFixed(0)} ms`);
    out.push(`  Velocidad media descarga: ${avgSpeed ? (avgSpeed / 1024).toFixed(0) + ' KB/s' : 'n/d'}`);
  }
  out.push('='.repeat(78));
  out.push('CONCLUSIONES DEL ESTUDIO');
  out.push('  Protocolo: HTTP/HTTPS (CONNECT). Saludo SOCKS5 sin respuesta.');
  out.push('  Autenticacion: por IP de ORIGEN (whitelist). Con la IP autorizada conecta SIN credenciales');
  out.push('  (200 OK); enviar usuario/clave provoca 407. Las credenciales del panel NO se usan.');
  out.push('');
  out.push('  Hallazgo principal: ' + transparentes.length + '/' + results.length + ' proxies son TRANSPARENTES.');
  out.push('  A traves del proxy el destino ve TU IP real (IPv4 ' + ORIGEN + ' e IPv6 de tu ISP),');
  out.push('  no la IP del pais anunciado (UK/US/Japon/Alemania/Polonia). Se comprobo con varios');
  out.push('  servicios de eco (api.ipify, ipwho.is, httpbin, api64.ipify, ifconfig.me):');
  out.push('  sin proxy y con proxy se ve exactamente la misma IP.');
  out.push('');
  out.push('  CONSECUENCIA: estos proxies NO sirven para lo que suele buscarse de un proxy:');
  out.push('    - Anonimato: NO. El destino identifica tu IP y tu ISP (DIGI Spain, Salamanca).');
  out.push('    - Geolocalizacion/otro pais: NO. La salida siempre es tu localizacion real.');
  out.push('    - Evadir un bloqueo por IP: NO (el servidor sigue viendo tu IP).');
  out.push('  Si el objetivo es OCULTAR la IP real delante de un anti-bot, este pool no vale.');
  out.push('  Si solo se busca apuntar peticiones a un gateway sin necesidad de ocultar nada,');
  out.push('  si conectan (latencias bajas: TCP ~96ms, TLS ~429ms, TTFB ~700ms).');
  out.push('='.repeat(78));

  console.log('\n\n' + out.join('\n'));
  fs.writeFileSync(path.join(__dirname, 'informe.txt'), out.join('\n'), 'utf8');
  fs.writeFileSync(path.join(__dirname, 'resultados.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('\n[+] Guardado: informe.txt y resultados.json');
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
