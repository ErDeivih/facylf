// 0035 (vigilancia de la plataforma, purga, panel) y consultas de admin.ts sobre el caso de m29.
import { base29, ok, fin } from './m29.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;

console.log('1 · chequeos de la plataforma');
const ch = await q(`select nombre, area, estado, valor from ops.chequeos()`);
const de = (n) => ch.find((c) => c.nombre === n);
ok(de('copia_de_seguridad') && de('avisos_generador'), 'ops.chequeos() une los de datos (0030) y los de plataforma (0035)');
ok(de('administradores_activos')?.estado === 'info', 'sin ningún usuario (plataforma por montar) = info');
await q(`insert into app.usuario (user_id) values ('u0')`);
ok((await q(`select estado from ops.chequeos() where nombre = 'administradores_activos'`))[0].estado === 'fallo', 'con usuarios y sin administrador = fallo');
ok(de('avisos_generador')?.estado === 'info', 'generador que nunca corrió = info');
await q(`insert into app.usuario (user_id, rol) values ('admin','administrador')`);
await q(`insert into app.usuario (user_id, estado, creado_en) values ('p1','pendiente', now() - interval '3 days')`);
await q(`update app.estado_generador set ultima_pasada = now() - interval '3 hours', pasadas = 5`);
await q(`insert into ops.evento_app (nivel, origen, tipo, mensaje) select 'aviso','avisos','correo_fallido','smtp' from generate_series(1,3)`);
await q(`insert into ops.evento_app (nivel, origen, tipo, mensaje) select 'aviso','auth','entrada_fallida','x' from generate_series(1,12)`);
await q(`insert into app.espacio_anuncio (codigo, pagina, posicion, formato, proveedor, activo) values ('prueba','/x','pie','nativo','directo',true)`);
const ch2 = await q(`select nombre, estado, valor from ops.chequeos()`);
const de2 = (n) => ch2.find((c) => c.nombre === n);
ok(de2('administradores_activos').estado === 'ok', 'con un administrador = ok');
ok(de2('registros_sin_aprobar').estado === 'aviso' && +de2('registros_sin_aprobar').valor === 1, 'registro esperando 3 días = aviso');
ok(de2('avisos_generador').estado === 'aviso', 'generador parado 3 h = aviso');
ok(de2('correos_fallidos_24h').estado === 'aviso', '3 correos fallidos = aviso');
ok(de2('errores_entrada_15min').estado === 'aviso', '12 errores de entrada en 15 min = aviso');
ok(de2('publicidad_activa').estado === 'info', 'hueco de anuncio encendido = info (que se sepa)');
const reg = await q(`select accion, nombre from ops.registra_chequeos()`);
ok(reg.some((r) => r.accion === 'abre' && r.nombre === 'registros_sin_aprobar'), 'registra_chequeos abre la alerta nueva');

console.log('2 · purga');
await q(`insert into app.notificacion (user_id, tipo, clave, titulo, creada_en, leida_en) values
  ('admin','resultado','a','viejo leído', now() - interval '200 days', now() - interval '199 days'),
  ('admin','resultado','b','viejo sin leer', now() - interval '200 days', null),
  ('admin','resultado','c','nuevo', now(), null)`);
const pu = (await q(`select ops.purga() p`))[0].p;
ok(pu.avisos_leidos === 1 && 'eventos' in pu, 'purga une la de datos y la de plataforma; borra el aviso leído viejo', pu);
ok((await q(`select count(*)::int n from app.notificacion`))[0].n === 2, 'el aviso sin leer de 200 días se queda (se borra a los 365)');

console.log('3 · consultas de admin.ts');
const src = readFileSync(join(RAIZ, 'apps', 'web', 'src', 'consultas', 'admin.ts'), 'utf8').replaceAll('\r\n', '\n');
const sqlDe = (n) => { const i = src.indexOf(`nombre: '${n}'`); const a = src.indexOf('sql: `', i) + 6; return src.slice(a, src.indexOf('`,\n};', a)); };
const params = {
  'admin-panel-resumen': [], 'admin-usuarios': [null, null, 100], 'admin-invitaciones': [false, 100],
  'admin-auditoria': [null, null, null, 100], 'admin-casos-resumen': [], 'admin-casos-lista': [null, 'abierto', null, 100],
  'cobertura-por-federacion': [null], 'admin-chequeos-ahora': [], 'admin-avisos-por-dia': [30], 'admin-espacios-anuncio': [],
  'admin-campanas-anuncio': [], 'admin-accesos-sensibles': [30], 'admin-procesos': [],
  'admin-informe-anuncios': ['2026-01-01', '2026-12-31'], 'admin-anuncios-por-dia': [30],
};
for (const [n, p] of Object.entries(params)) {
  try { const r = await q(sqlDe(n), p); ok(true, `${n}: ${r.length} filas`); }
  catch (e) { ok(false, `${n}: ${e.message}`); }
}
const us = await q(sqlDe('admin-usuarios'), [null, null, 100]);
ok(us[0].user_id === 'p1', 'usuarios: los pendientes primero');
const pr = (await q(sqlDe('admin-panel-resumen'), []))[0];
ok(pr.usuarios_pendientes === 1 && pr.huecos_anuncio_activos === 1, 'panel-resumen cuenta pendientes y huecos activos', pr);
await db.exec(`begin; select set_config('facylf.usuario','admin',true); update app.ajuste set valor='aprobacion' where clave='registro_modo'; commit;`);
const au = await q(sqlDe('admin-auditoria'), ['app.ajuste', null, null, 10]);
ok(au.length === 1 && au[0].cambios?.valor?.despues === 'aprobacion', 'auditoría: sólo el campo que cambió, con antes y después', au[0]?.cambios);
fin();
