#!/usr/bin/env node
/**
 * DESPLIEGUE CONTINUO DE LA PLATAFORMA WEB EN EL PC (fase C en adelante). Ver docs/plataforma-web/DESPLIEGUE-CONTINUO.md.
 *
 * Azul/verde con carpetas, sin tocar la copia de trabajo del repositorio (que tiene cambios sin commit):
 *
 *   F:\facylf-web\versiones\<sha>\   una carpeta por versión (git worktree de origin/main en ese commit)
 *   F:\facylf-web\actual             unión (junction) → la versión que sirve la web
 *
 * Pasos (para al primero que falla; cada uno queda en ops.evento_app, origen 'mantenimiento'):
 *   0. guardias: memoria libre ≥ 3 GiB y nada de despliegues en sábado/domingo de 9 a 21 h (hay partidos)
 *   1. ¿hay versión nueva en origin/main? ¿pasó la integración continua (las 4 comprobaciones de test.yml)?
 *   2. worktree en versiones\<sha>, pnpm install --frozen-lockfile, pnpm --filter web build
 *   3. copia de seguridad comprobada (scripts/copia-seguridad.mjs); si falla, NO se migra
 *   4. migraciones (pnpm db:migrar desde la versión nueva): sólo añaden, nunca borran (regla del repo)
 *   5. cambia `actual` a la versión nueva, reinicia la tarea «FACyLF web» y pide /api/salud 10 veces
 *   6. si /api/salud no responde «ok»: vuelve `actual` a la anterior y reinicia (las migraciones se quedan:
 *      son compatibles hacia atrás por regla). Aviso por el canal de alertas.
 *   7. borra versiones de más de 5 despliegues atrás
 *
 *   node scripts/despliega-plataforma.mjs                 simula (dice lo que haría)
 *   node scripts/despliega-plataforma.mjs --de-verdad     despliega
 *   node scripts/despliega-plataforma.mjs --volver        vuelve a la versión anterior
 * Se lanza a mano o como tarea programada de madrugada (no se registra sola: decisión de David).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readlinkSync, rmSync, statSync } from 'node:fs';
import { freemem } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile('.env'); } catch { /* entorno externo */ }
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.FACYLF_WEB_DIR ?? 'F:\\facylf-web';
const VERSIONES = join(BASE, 'versiones');
const ACTUAL = join(BASE, 'actual');
const TAREA_WEB = process.env.FACYLF_TAREA_WEB ?? 'FACyLF web';
const SALUD = new URL('/api/salud', process.env.WEB_URL ?? 'http://127.0.0.1:3000').href;
const deVerdad = process.argv.includes('--de-verdad');
const volver = process.argv.includes('--volver');
const sinCi = process.argv.includes('--sin-ci');       // sólo si GitHub no responde y David lo autoriza

const log = (m) => console.log(`[${new Date().toLocaleTimeString('es-ES')}] ${m}`);
const corre = (cmd, args, cwd = REPO) => {
  log(`$ ${cmd} ${args.join(' ')}${cwd !== REPO ? `   (en ${cwd})` : ''}`);
  if (!deVerdad && !volver) return '';
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} → ${r.status}\n${(r.stderr || r.stdout || '').slice(-1500)}`);
  return r.stdout.trim();
};
const lee = (cmd, args) => execFileSync(cmd, args, { cwd: REPO, encoding: 'utf8' }).trim();
const versionActual = () => { try { return basename(readlinkSync(ACTUAL)); } catch { return null; } };
const enlaza = (destino) => {
  log(`actual → ${destino}`);
  if (!deVerdad && !volver) return;
  if (existsSync(ACTUAL)) rmSync(ACTUAL, { recursive: false, force: true });
  if (process.platform === 'win32') execFileSync('cmd', ['/c', 'mklink', '/J', ACTUAL, destino]);
  else execFileSync('ln', ['-sfn', destino, ACTUAL]);
};
const reinicia = () => process.platform === 'win32'
  ? (corre('schtasks', ['/End', '/TN', TAREA_WEB]), corre('schtasks', ['/Run', '/TN', TAREA_WEB]))
  : corre('systemctl', ['--user', 'restart', 'facylf-web']);
async function sana() {
  if (!deVerdad && !volver) { log(`(simulado) GET ${SALUD}`); return true; }
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    try { const r = await fetch(SALUD, { signal: AbortSignal.timeout(5000) }); if (r.ok && (await r.json()).estado === 'ok') return true; } catch { /* todavía arrancando */ }
  }
  return false;
}
async function anota(nivel, mensaje, detalle = {}) {
  if (!deVerdad && !volver) return;
  spawnSync(process.execPath, [join(REPO, 'scripts', 'vigilancia-plataforma.mjs'), '--evento', nivel, 'despliegue', mensaje, JSON.stringify(detalle)], { cwd: REPO });
}

// ── Volver a la anterior ────────────────────────────────────────────────────────────────────────────
const versiones = () => existsSync(VERSIONES)
  ? readdirSync(VERSIONES).map((d) => ({ d, t: statSync(join(VERSIONES, d)).mtimeMs })).sort((a, b) => b.t - a.t).map((x) => x.d) : [];
if (volver) {
  const act = versionActual(); const anterior = versiones().find((v) => v !== act);
  if (!anterior) { console.error('✗ No hay versión anterior.'); process.exit(2); }
  enlaza(join(VERSIONES, anterior)); reinicia();
  log((await sana()) ? `✓ De vuelta en ${anterior}` : '✗ Tampoco la anterior responde: mirar a mano');
  process.exit(0);
}

// ── 0. Guardias ─────────────────────────────────────────────────────────────────────────────────────
if (freemem() < 3 * 1024 ** 3) { console.error('✗ Menos de 3 GiB libres: no se despliega.'); process.exit(3); }
const ahora = new Date(); const finde = [0, 6].includes(ahora.getDay()) && ahora.getHours() >= 9 && ahora.getHours() < 21;
if (finde && !process.argv.includes('--tambien-finde')) { console.error('✗ Fin de semana con partidos (9-21 h): mejor de madrugada.'); process.exit(3); }

// ── 1. ¿Qué desplegar? ──────────────────────────────────────────────────────────────────────────────
corre('git', ['fetch', '--quiet', 'origin', 'main']);
const sha = lee('git', ['rev-parse', '--short=12', 'origin/main']);
const act = versionActual();
log(`origin/main = ${sha} · sirviendo ${act ?? '(nada)'}${deVerdad ? '' : '   [SIMULACIÓN: añade --de-verdad]'}`);
if (sha === act) { log('Nada nuevo.'); process.exit(0); }
if (!sinCi) {
  // Las cuatro comprobaciones de .github/workflows/test.yml tienen que estar en verde para ESTE commit.
  const json = lee('gh', ['api', `repos/{owner}/{repo}/commits/${sha}/check-runs`, '--jq', '[.check_runs[] | {name, conclusion}]']);
  const checks = JSON.parse(json || '[]');
  const malos = checks.filter((c) => c.conclusion !== 'success');
  if (checks.length < 4 || malos.length) {
    console.error(`✗ La integración continua no está en verde para ${sha}: ${JSON.stringify(checks)}`);
    process.exit(4);
  }
  log(`✓ CI en verde (${checks.map((c) => c.name).join(', ')})`);
}

// ── 2-7 ─────────────────────────────────────────────────────────────────────────────────────────────
const dir = join(VERSIONES, sha);
try {
  if (deVerdad) mkdirSync(VERSIONES, { recursive: true });
  if (!existsSync(dir)) corre('git', ['worktree', 'add', '--detach', dir, sha]);
  corre('pnpm', ['install', '--frozen-lockfile'], dir);
  corre('pnpm', ['--filter', 'web', 'build'], dir);
  corre(process.execPath, [join(REPO, 'scripts', 'copia-seguridad.mjs')]);       // 3. si falla, lanza y no se migra
  corre('pnpm', ['db:migrar'], dir);                                              // 4. con el .env del repo (variables de entorno)
  enlaza(dir); reinicia();                                                       // 5.
  if (!(await sana())) {                                                         // 6.
    log('✗ /api/salud no responde: vuelvo a la anterior');
    if (act) { enlaza(join(VERSIONES, act)); reinicia(); }
    await anota('error', `despliegue de ${sha} fallido: vuelta a ${act}`, { sha, anterior: act });
    process.exit(5);
  }
  await anota('info', `desplegado ${sha}`, { sha, anterior: act });
  log(`✓ Desplegado ${sha}`);
  for (const v of versiones().slice(5)) corre('git', ['worktree', 'remove', '--force', join(VERSIONES, v)]);   // 7.
} catch (e) {
  console.error(`✗ ${e.message}`);
  await anota('error', `despliegue de ${sha} parado: ${String(e.message).slice(0, 300)}`, { sha });
  process.exit(1);
}
