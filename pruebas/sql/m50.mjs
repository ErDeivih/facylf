// 0050: cada consulta de la web funciona con SU rol (lector para lo público, facylf_app para lo de una cuenta),
// y los dos roles siguen sin poder lo que no deben (el lector no ve datos de usuarios; la web no escribe en core).
import { base29, ok, fin } from './m29.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(RAIZ, 'apps', 'web', 'src', 'consultas');
const db = await base29();
const comoRol = async (rol, sql, params = []) => {
  try { await db.exec(`reset role; set role ${rol}`); await db.query(sql, params); return null; }
  catch (e) { return e.message; }
  finally { await db.exec('reset role'); }
};

let total = 0; const fallos = []; const sinParametros = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.ts') && x !== 'contratos.ts')) {
  const src = readFileSync(join(DIR, f), 'utf8');
  const params = {};
  const bloque = src.match(/export const PARAMETROS_\w+[^=]*= \{([\s\S]*?)\n\};/);
  if (bloque) for (const l of bloque[1].split('\n')) {
    const x = l.match(/^\s*'([^']+)':\s*(\[.*\]),?\s*(\/\/.*)?$/);
    if (x) { try { params[x[1]] = eval(x[2]); } catch { /* parámetros calculados: se salta */ } }
  }
  const re = /\n  nombre: '([^']+)',([\s\S]*?)sql: `([\s\S]*?)`,\n};/g; let m;
  while ((m = re.exec(src))) {
    const [, nombre, cabecera, sqlCrudo] = m;
    if (!params[nombre]) { sinParametros.push(nombre); continue; }
    const rol = /\n  rol: 'app',/.test(cabecera) ? 'facylf_app' : 'facylf_lector';
    const e = await comoRol(rol, sqlCrudo.replaceAll('${SQL_FEDERACION_NO_EXCLUIDA}', 'true'), params[nombre]);
    total++;
    if (e && /permission denied|permiso/i.test(e)) fallos.push(`${f} · ${nombre} (${rol}): ${e}`);
  }
}
ok(total >= 60 && fallos.length === 0, `las ${total} consultas con parámetros de ejemplo se ejecutan con su rol, sin permisos que falten`, fallos);
if (sinParametros.length) console.log(`  (sin parámetros de ejemplo, no medidas: ${sinParametros.join(', ')})`);

ok(/permission denied/.test(await comoRol('facylf_lector', 'select * from app.usuario')), 'el rol público no ve las cuentas (app.usuario)');
ok(/permission denied/.test(await comoRol('facylf_lector', 'select * from app.notificacion')), 'ni los avisos de nadie');
ok(/permission denied/.test(await comoRol('facylf_app', `insert into core.federation (codigo, nombre, adaptador) values ('x', 'x', 'pnfg')`)), 'la web con cuenta no escribe en core');
const miembro = (await db.query(`select m.inherit_option, m.set_option from pg_auth_members m
  join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member
  where r.rolname = 'facylf_lector' and u.rolname = 'facylf_app'`)).rows[0];
ok(miembro?.inherit_option === true && miembro?.set_option === false, 'facylf_app hereda la lectura pero no puede hacerse pasar por el lector (SET desactivado)', miembro);
ok(await comoRol('facylf_app', 'select * from ops.chequeos()') === null, 'el panel ve los chequeos en vivo');
fin();
