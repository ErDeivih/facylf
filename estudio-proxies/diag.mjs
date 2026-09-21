import net from 'node:net';
import fs from 'node:fs';
const CFG = JSON.parse(fs.readFileSync(new URL('./proxies.json', import.meta.url), 'utf8'));
const user = CFG.auth.usuario, pass = CFG.auth.contrasena;
const proxy = CFG.proxies[3]; // Madrid 64.137.96.74
const ip = proxy.ip, port = proxy.puerto;
const b64 = (u, p) => Buffer.from(`${u}:${p}`).toString('base64');

await new Promise((res) => {
  console.log(`\n# Proxy: ${ip}:${port}`);
  // --- A) SOCKS5 greeting (detectar protocolo) ---
  const s = net.connect({ host: ip, port });
  let so = '';
  s.once('connect', () => { console.log('  [A] TCP OK. Envio saludo SOCKS5...'); s.write(Buffer.from([0x05, 0x01, 0x00])); });
  s.on('data', (d) => {
    so += d.toString('hex') + ' ';
    if (so.length >= 4 * 2) {
      s.destroy();
      const bytes = Buffer.from(so.replace(/\s/g, ''), 'hex');
      console.log(`  [A] Respuesta SOCKS5: bytes=${so.trim()}  -> ${bytes.length === 2 ? 'reply valido (es SOCKS)' : 'NO es SOCKS (respuesta no valida, es proxy HTTP)'}`);
      res();
    }
  });
  s.on('error', (e) => { console.log('  [A] err ' + e.message); res(); });
  setTimeout(() => { s.destroy(); console.log('  [A] timeout'); res(); }, 5000);
});

// --- B) CONNECT con password INCORRECTA ---
await new Promise((res) => {
  const s = net.connect({ host: ip, port });
  let buf = '';
  s.once('connect', () => {
    const bad = b64(user, 'contraseña-incorrecta-xxxx');
    s.write(`CONNECT api.ipify.org:443 HTTP/1.1\r\nHost: api.ipify.org:443\r\nProxy-Authorization: Basic ${bad}\r\nProxy-Connection: close\r\n\r\n`);
  });
  s.on('data', (d) => { buf += d.toString('latin1'); const i = buf.indexOf('\r\n\r\n'); if (i >= 0) {
    const head = buf.slice(0, i).split('\r\n'); console.log('  [B] Password INCORRECTA -> ' + head[0]); s.destroy(); res(); } });
  s.on('error', (e) => { console.log('  [B] err ' + e.message); res(); });
  setTimeout(() => { s.destroy(); console.log('  [B] timeout'); res(); }, 5000);
});

// --- C) GET HTTP simple (endpoint http, sin CONNECT) con creds correctas ---
await new Promise((res) => {
  const s = net.connect({ host: ip, port });
  let buf = '';
  s.once('connect', () => {
    const ok = b64(user, pass);
    s.write(`GET http://api.ipify.org/ HTTP/1.1\r\nHost: api.ipify.org\r\nProxy-Authorization: Basic ${ok}\r\nConnection: close\r\n\r\n`);
  });
  s.on('data', (d) => {
    buf += d.toString('latin1');
    const i = buf.indexOf('\r\n\r\n');
    if (i >= 0) {
      const head = buf.slice(0, i).split('\r\n');
      console.log('  [C] GET http (creds correctas) -> ' + head[0]);
      const body = buf.slice(i + 4);
      console.log('  [C]    body: ' + JSON.stringify(body.trim().slice(0, 60)));
      s.destroy(); res();
    }
  });
  s.on('error', (e) => { console.log('  [C] err ' + e.message); res(); });
  setTimeout(() => { s.destroy(); console.log('  [C] timeout'); res(); }, 5000);
});
process.exit(0);
