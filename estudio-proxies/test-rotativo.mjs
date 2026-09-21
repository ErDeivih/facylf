import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import http from 'node:http';
import { performance } from 'node:perf_hooks';

const ORIGEN = '79.117.136.24';

function basic(u, p) { return Buffer.from(`${u}:${p}`).toString('base64'); }

// Abre tunel CONNECT a traves de un proxy {host,port,user?,pass?}
function abrirTunel(proxy, targetHost, targetPort, useTls, timeout) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const s = net.connect({ host: proxy.host, port: proxy.port });
    const fail = (e) => { try { s.destroy(); } catch {} reject(e); };
    const lat = {};
    s.once('connect', () => {
      lat.connect = performance.now() - t0;
      const auth = proxy.user ? `Proxy-Authorization: Basic ${basic(proxy.user, proxy.pass)}\r\n` : '';
      s.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${auth}Proxy-Connection: Keep-Alive\r\n\r\n`);
    });
    let buf = '';
    s.on('data', (d) => {
      buf += d.toString('latin1');
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      const head = buf.slice(0, i);
      const m = /^HTTP\/\d\.\d\s+(\d+)/.exec(head.split('\r\n')[0]);
      const code = m ? parseInt(m[1], 10) : 0;
      if (code === 200) {
        lat.handshake = performance.now() - t0;
        if (useTls) {
          const ts = tls.connect({ socket: s, servername: targetHost, rejectUnauthorized: false });
          ts.once('secureConnect', () => { lat.tls = performance.now() - t0; resolve({ sock: ts, lat }); });
          ts.once('error', fail);
        } else resolve({ sock: s, lat });
      } else {
        fail(new Error(`${code}${(/realm="([^"]*)"/.exec(head) || [])[1] ? ' (' + /realm="([^"]*)"/.exec(head)[1] + ')' : ''}`));
      }
    });
    s.on('error', fail);
    setTimeout(() => fail(new Error('timeout')), timeout);
  });
}

function getViaProxy(proxy, url, timeout) {
  return new Promise((resolve) => {
    let u; try { u = new URL(url); } catch { return resolve({ ok: false, error: 'url' }); }
    const useTls = u.protocol === 'https:';
    const port = u.port ? +u.port : (useTls ? 443 : 80);
    const t0 = performance.now();
    abrirTunel(proxy, u.hostname, port, useTls, timeout).then(({ sock, lat }) => {
      const req = (useTls ? https : http).request({
        host: u.hostname, port, method: 'GET', path: u.pathname + u.search,
        headers: { 'Host': u.hostname, 'User-Agent': 'pp', 'Accept': '*/*', 'Accept-Encoding': 'identity', 'Connection': 'close' },
        createConnection: () => sock, agent: false,
      }, (res) => {
        let d = ''; res.on('data', (c) => d += c);
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body: d, lat, total: performance.now() - t0 }));
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message, lat }));
      req.end();
    }).catch((e) => resolve({ ok: false, error: String(e.message || e) }));
  });
}

const ROT = { host: 'p.webshare.io', port: 80, user: 'ftzzvlhh-rotate', pass: 'c8olvksl2bg' };
const STATIC = [
  { host: '31.59.20.176', port: 6754, user: 'ftzzvlhh', pass: 'c8olvksl2bg' },
  { host: '64.137.96.74', port: 6641, user: 'ftzzvlhh', pass: 'c8olvksl2bg' },
];

async function serie(proxy, label, n) {
  console.log(`\n### ${label}  (proxy ${proxy.host}:${proxy.port})`);
  const ips = new Set();
  for (let i = 0; i < n; i++) {
    const r = await getViaProxy(proxy, 'https://ipwho.is/', 12000);
    if (r.ok && r.body) {
      try {
        const j = JSON.parse(r.body);
        const conn = r.lat && r.lat.connect != null ? Math.round(r.lat.connect) + 'ms' : '-';
        const tls = r.lat && r.lat.tls != null ? Math.round(r.lat.tls) + 'ms' : '-';
        ips.add(j.ip || '-');
        const geo = `${j.country || '-'}/${j.city || '-'}`;
        console.log(`  #${i + 1} ip_salida=${(j.ip || '-').padEnd(24)} geo=${geo.padEnd(24)} conn=${conn} tls=${tls} total=${Math.round(r.total)}ms`);
      } catch {
        console.log(`  #${i + 1} (json) ${r.body.slice(0, 60)}`);
      }
    } else {
      console.log(`  #${i + 1} ERR ${r.error} (${r.status ?? ''})`);
    }
  }
  const distinct = [...ips];
  const esMiIP = distinct.every((x) => x === ORIGEN);
  console.log(`  -> IPs distintas observadas: ${distinct.length}`);
  console.log(`  -> coinciden con tu IP ${ORIGEN}? ${esMiIP ? 'SI (transparente)' : 'NO (oculta la IP)'}`);
}

await serie(ROT, 'ENDPOINT ROTATIVO (p.webshare.io:80, user ftzzvlhh-rotate)', 6);
await serie({ host: 'p.webshare.io', port: 80 }, 'ENDPOINT ROTATIVO SIN credenciales (solo IP whitelist)', 3);
for (const sp of STATIC) await serie(sp, 'ESTATICA con usuario/contraseña (ftzzvlhh)', 3);
process.exit(0);
