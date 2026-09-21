import net from 'node:net';
import fs from 'node:fs';
const CFG = JSON.parse(fs.readFileSync(new URL('./proxies.json', import.meta.url), 'utf8'));
const { usuario: user, contrasena: pass } = CFG.auth;
const b64 = Buffer.from(`${user}:${pass}`).toString('base64');

function test(p) {
  return new Promise((res) => {
    const t0 = Date.now();
    const s = net.connect({ host: p.ip, port: p.puerto });
    let done = false;
    const fin = (o) => { if (!done) { done = true; try { s.destroy(); } catch {} res(o); } };
    s.once('connect', () => {
      s.write(
        `CONNECT api.ipify.org:443 HTTP/1.1\r\nHost: api.ipify.org:443\r\n` +
        `Proxy-Authorization: Basic ${b64}\r\nProxy-Connection: close\r\n\r\n`
      );
    });
    let buf = '';
    s.on('data', (d) => {
      buf += d.toString('latin1');
      const i = buf.indexOf('\r\n\r\n');
      if (i >= 0) {
        const head = buf.slice(0, i);
        const code = parseInt((/^HTTP\/\d\.\d\s+(\d+)/.exec(head.split('\r\n')[0]) || [])[1], 10);
        const realm = (/realm="([^"]*)"/.exec(head) || [])[1] || '';
        fin({ code: code || 0, realm, ms: Date.now() - t0 });
      }
    });
    s.on('error', (e) => fin({ err: e.message, ms: Date.now() - t0 }));
    s.on('close', () => fin({ err: 'closed', ms: Date.now() - t0 }));
    setTimeout(() => fin({ err: 'timeout', ms: Date.now() - t0 }), 8000);
  });
}

const r = await Promise.all(CFG.proxies.map((p) => test(p).then((x) => ({ p, x }))));
console.log('\n  IP:puerto      code | realm | err | ms');
console.log('  ' + '-'.repeat(58));
for (const { p, x } of r) {
  const code = x.code ?? '-';
  const realm = x.realm || '-';
  const err = x.err || '-';
  console.log(`  ${String(p.ip).padEnd(15)}:${String(p.puerto).padEnd(5)} ${String(code).padEnd(5)} ${realm.slice(0, 40).padEnd(40)} ${String(err).padEnd(10)} ${x.ms}ms`);
}
process.exit(0);
