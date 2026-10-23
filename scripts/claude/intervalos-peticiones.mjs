#!/usr/bin/env node
// SOLO LEE. Intervalo entre peticiones de la última hora, por federación.
// Uso: node scripts/claude/intervalos-peticiones.mjs madrid federacion ...
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
const RAIZ = process.env.FACYLF_RAIZ ?? process.cwd();
const desde = new Date(Date.now() - 3600e3).toISOString();
for (const fed of process.argv.slice(2)) {
  const db = new DatabaseSync(join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true, timeout: 60000 });
  const t = db.prepare('select iniciada_en from peticiones where iniciada_en >= ? order by iniciada_en').all(desde)
    .map((r) => Date.parse(r.iniciada_en));
  const d = t.slice(1).map((x, i) => (x - t[i]) / 1000).sort((a, b) => a - b);
  const enMarcha = d.filter((x) => x <= 60);
  const p = (q) => enMarcha.length ? enMarcha[Math.floor(q * (enMarcha.length - 1))].toFixed(1) : '—';
  console.log(`${fed.padEnd(12)} ${t.length} peticiones · intervalo p10 ${p(0.1)} s · mediana ${p(0.5)} s · p90 ${p(0.9)} s · menores de 4 s: ${enMarcha.filter((x) => x < 4).length} · silencios de más de 60 s: ${d.length - enMarcha.length} (${Math.round(d.filter((x) => x > 60).reduce((a, b) => a + b, 0) / 60)} min)`);
  db.close();
}
