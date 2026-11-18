
import { ipDe } from '../src/lib/limites';
import { describe as d2, expect as e2, it as i2 } from 'vitest';
d2('IP de confianza', () => {
  i2('usa la última IP añadida por el proxy, no la primera del cliente', () => {
    const r = new Request('http://x', { headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } });
    e2(ipDe(r)).toBe('2.2.2.2');
  });
  i2('CF-Connecting-IP manda sobre X-Forwarded-For si el proxy es de confianza', () => {
    process.env.FACYLF_CONFIANZA_PROXY = '1';
    const r = new Request('http://x', { headers: { 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' } });
    e2(ipDe(r)).toBe('9.9.9.9');
    delete process.env.FACYLF_CONFIANZA_PROXY;
  });
});
