import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import fs from 'node:fs';

const CFG = JSON.parse(fs.readFileSync(new URL('./proxies.json', import.meta.url), 'utf8'));
const proxy = CFG.proxies[0]; // London
const b64 = () => ''; // ip-whitelist, sin credenciales

function abrirTunel(host, port) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: proxy.ip, port: proxy.puerto });
    const fail = (e) => { try { s.destroy(); } catch {} reject(e); };
    s.once('connect', () => s.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\nProxy-Connection: Keep-Alive\r\n\r\n`));
    let buf = '';
    s.on('data', (d) => {
      buf += d.toString('latin1');
      const i = buf.indexOf('\r\n\r\n');
      if (i >= 0 && buf.slice(0, i).startsWith('HTTP/1.0 200')) {
        const tlsS = tls.connect({ socket: s, servername: host, rejectUnauthorized: false });
        tlsS.once('secureConnect', () => resolve(tlsS));
        tlsS.once('error', fail);
      } else if (i >= 0) { fail(new Error('CONNECT no 200')); }
    });
    s.on('error', fail);
    setTimeout(() => fail(new Error('timeout tunel')), 10000);
  });
}

function getViaProxy(host, path) {
  return new Promise((resolve) => {
    abrirTunel(host, 443).then((sock) => {
      const req = https.request({
        host, port: 443, method: 'GET', path,
        headers: { 'Host': host, 'User-Agent': 'pp', 'Accept': '*/*', 'Connection': 'close', 'Accept-Encoding': 'identity' },
        createConnection: () => sock, agent: false,
      }, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve({ ok: true, body: d })); });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.end();
    }).catch((e) => resolve({ ok: false, error: String(e.message || e) }));
  });
}

console.log(`\n# a traves del proxy ${proxy.ip}:${proxy.puerto} (anunciado: ${proxy.pais}/${proxy.ciudad})\n`);
const targets = [
  ['api.ipify.org', '/', 'api.ipify (ip text)'],
  ['ipwho.is', '/', 'ipwho.is (ip+geo)'],
  ['httpbin.org', '/ip', 'httpbin/ip'],
  ['api64.ipify.org', '/', 'api64.ipify'],
  ['ifconfig.me', '/ip', 'ifconfig.me'],
];
for (const [host, path, label] of targets) {
  const r = await getViaProxy(host, path);
  if (r.ok) {
    // extrae solo lo mas relevante
    let s = r.body.trim().slice(0, 200);
    console.log(`  ${label.padEnd(18)} -> ${s}`);
  } else {
    console.log(`  ${label.padEnd(18)} -> ERR ${r.error}`);
  }
}
process.exit(0);
