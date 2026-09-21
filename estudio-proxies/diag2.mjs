import net from 'node:net';
import fs from 'node:fs';
const CFG = JSON.parse(fs.readFileSync(new URL('./proxies.json', import.meta.url), 'utf8'));
const user = CFG.auth.usuario, pass = CFG.auth.contrasena;
const b64 = Buffer.from(`${user}:${pass}`).toString('base64');
const proxies = [CFG.proxies[3], CFG.proxies[0], CFG.proxies[4]]; // Madrid, London, LA

function test(ip, port, label, authHeader) {
  return new Promise((res) => {
    const s = net.connect({ host: ip, port });
    let buf = '';
    const done = (o) => { try { s.destroy(); } catch {} res(o); };
    s.once('connect', () => {
      const extra = authHeader ? `Proxy-Authorization: ${authHeader}\r\n` : '';
      s.write(`CONNECT api.ipify.org:443 HTTP/1.1\r\nHost: api.ipify.org:443\r\n${extra}Proxy-Connection: close\r\n\r\n`);
    });
    s.on('data', (d) => {
      buf += d.toString('latin1');
      const i = buf.indexOf('\r\n\r\n');
      if (i >= 0) {
        const head = buf.slice(0, i).split('\r\n');
        done({ label, line: head[0] });
      }
    });
    s.on('error', (e) => done({ label, line: 'ERR ' + e.message }));
    setTimeout(() => done({ label, line: 'timeout' }), 7000);
  });
}

for (const p of proxies) {
  console.log(`\n# ${p.ip}:${p.puerto}`);
  const noAuth = await test(p.ip, p.puerto, 'A) SIN credenciales (solo IP whitelist)', null);
  const withAuth = await test(p.ip, p.puerto, 'B) CON credenciales', `Basic ${b64}`);
  console.log('  ' + noAuth.line);
  console.log('  ' + withAuth.line);
}
process.exit(0);
