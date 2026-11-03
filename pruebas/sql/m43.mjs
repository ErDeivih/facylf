// 0043: ciclo de cuentas (invitaciones, alta, aprobación, rechazo, bloqueo, caducidad, freno por contraseñas,
// estado de acceso por petición, vigilancia de administradores sin doble verificación).
import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
const err = async (s, p) => { try { await q(s, p); return null; } catch (e) { return e.message; } };
const estado = async (u, dosf = null) => (await q(`select * from app.estado_acceso($1, $2)`, [u, dosf]))[0];
await db.exec(`insert into app.usuario (user_id, rol, paquete, estado) values ('adm', 'administrador', 'analista', 'activo'), ('u0', 'usuario', 'esencial', 'activo');`);

console.log('1 · invitaciones');
const cod = (await q(`select app.crea_invitacion('adm', 'ojeador', 1, 14, 'Ana@Ejemplo.es', 'para Ana') c`))[0].c;
ok(/^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/.test(cod), 'código de 20 caracteres sin letras confusas, en grupos', cod);
ok((await err(`select app.crea_invitacion('u0', 'ojeador')`))?.includes('SIN_PERMISO'), 'sólo quien administra usuarios crea invitaciones');
ok((await err(`select app.crea_invitacion('adm', 'ojeador', 5, 14, 'a@b.es')`))?.includes('INVITACION_PERSONAL_DE_UN_USO'), 'una invitación personal es de un solo uso');
ok((await err(`select app.alta_usuario('x1', $1, 'Otro', 'otro@ejemplo.es')`, [cod]))?.includes('INVITACION_DE_OTRO_CORREO'), 'invitación personal: otro correo no la puede usar');
ok((await q(`select app.alta_usuario('ana', lower($1), ' Ana ', ' ana@ejemplo.ES ') r`, [cod]))[0].r === 'activo', 'su dueña sí (sin importar mayúsculas ni espacios)');
ok((await q(`select paquete, nombre_visible from app.usuario where user_id = 'ana'`))[0].paquete === 'ojeador', 'entra con el paquete de la invitación');
ok((await err(`select app.alta_usuario('x2', $1, 'X', 'ana@ejemplo.es')`, [cod]))?.includes('INVITACION_AGOTADA'), 'gastada');
const cod2 = (await q(`select app.crea_invitacion('adm', 'esencial', 10) c`))[0].c;
await q(`select app.anula_invitacion('adm', $1)`, [cod2]);
ok((await err(`select app.alta_usuario('x3', $1, 'X', 'x@y.es')`, [cod2]))?.includes('INVITACION_NO_EXISTE'), 'anulada: como si no existiera');
ok((await q(`select to_regprocedure('app.alta_usuario(text,text,text)') is not null v`))[0].v, 'la firma antigua de 3 argumentos sigue existiendo');
ok((await err(`select app.alta_usuario('x4')`))?.includes('REGISTRO_SOLO_CON_INVITACION'), 'modo invitación: sin código no hay alta');

console.log('2 · aprobación, rechazo, bloqueo');
await q(`update app.ajuste set valor = 'aprobacion' where clave = 'registro_modo'`);
ok((await q(`select app.alta_usuario('p1', null, 'Pepe', 'p@e.es') r`))[0].r === 'pendiente', 'modo aprobación: queda pendiente');
ok((await estado('p1')).estado === 'pendiente', 'estado_acceso: pendiente (la web enseña «esperando aprobación»)');
ok((await err(`select app.cambia_estado_usuario('adm', 'p1', 'rechazado', '')`))?.includes('FALTA_MOTIVO'), 'rechazar pide motivo');
await q(`select app.cambia_estado_usuario('adm', 'p1', 'rechazado', 'No es del club')`);
const r1 = await estado('p1');
ok(r1.estado === 'rechazado' && r1.motivo === 'No es del club', 'rechazado, con su motivo para enseñarlo', r1);
await q(`select app.aprueba_usuario('p1', 'adm', 'ojeador')`);
ok((await estado('p1')).estado === 'ok' && (await q(`select count(*)::int n from app.notificacion where user_id = 'p1' and clave = 'cuenta:aprobada'`))[0].n === 1,
   'se puede aprobar después; el usuario recibe el aviso «cuenta aprobada»');
await q(`select app.cambia_estado_usuario('adm', 'p1', 'bloqueado', 'Comparte la cuenta')`);
ok((await estado('p1')).estado === 'bloqueado' && (await q(`select app.puede('p1', 'ver_fichas') v`))[0].v === false, 'bloqueado: sin permisos');
ok((await err(`select app.cambia_estado_usuario('adm', 'adm', 'bloqueado', 'prueba')`))?.includes('NO_A_UNO_MISMO'), 'un administrador no se bloquea a sí mismo');
await q(`select app.cambia_estado_usuario('adm', 'p1', 'activo')`);
ok((await estado('p1')).estado === 'ok', 'reactivado');

console.log('3 · caducidad y doble verificación');
await q(`update app.usuario set valido_hasta = current_date - 1 where user_id = 'u0'`);
ok((await estado('u0')).estado === 'caducado', 'paquete vencido: caducado');
await q(`update app.usuario set valido_hasta = current_date + 7 where user_id = 'u0'`);
ok((await estado('u0')).dias_para_caducar === 7 && (await q(`select app.avisa_caducidades() n`))[0].n === 1
   && (await q(`select app.avisa_caducidades() n`))[0].n === 0, 'aviso a 7 días, una sola vez');
ok((await estado('adm', false)).estado === 'requiere_2fa' && (await estado('adm', true)).estado === 'ok' && (await estado('u0', false)).estado === 'ok',
   'administrador sin doble verificación: la web le obliga a activarla (al resto no)');
ok((await estado('nadie')).estado === 'sin_alta', 'cuenta de Better Auth sin alta en la plataforma: sin_alta');
await db.exec(`create table auth."user" (id text primary key, "twoFactorEnabled" boolean); insert into auth."user" values ('adm', false);`);
const ch = (await q(`select * from ops.chequeos() where nombre = 'administradores_sin_2fa'`))[0];
ok(ch.estado === 'fallo' && ch.valor == 1, 'vigilancia: administrador sin doble verificación = fallo', ch);

console.log('4 · freno por contraseñas fallidas');
for (let i = 0; i < 7; i++) await q(`select app.anota_entrada('victima@x.es', false)`);
ok((await q(`select app.espera_entrada('VICTIMA@x.es') s`))[0].s === 0, '7 fallos: aún se puede');
await q(`select app.anota_entrada('victima@x.es', false)`);
const s8 = (await q(`select app.espera_entrada('victima@x.es') s`))[0].s;
ok(s8 > 800 && s8 <= 900, '8 fallos seguidos: 15 minutos de espera', s8);
ok((await q(`select count(*)::int n from app.intento_entrada where correo_sha like '%@%'`))[0].n === 0, 'no se guarda el correo, sólo su resumen');
ok((await q(`select estado from ops.chequeos() where nombre = 'cuentas_frenadas'`))[0].estado === 'info', 'vigilancia: una cuenta frenada = info');
await q(`update app.intento_entrada set en = en - interval '20 minutes'`);
ok((await q(`select app.espera_entrada('victima@x.es') s`))[0].s === 0, 'pasada la ventana, se puede otra vez');
for (let i = 0; i < 5; i++) await q(`select app.anota_entrada('otra@x.es', false)`);
await q(`select app.anota_entrada('otra@x.es', true)`);
for (let i = 0; i < 5; i++) await q(`select app.anota_entrada('otra@x.es', false)`);
ok((await q(`select app.espera_entrada('otra@x.es') s`))[0].s === 0, 'un acierto pone la cuenta a cero');
console.log('5 · consultas del panel');
const { readFileSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'web', 'src', 'consultas', 'admin.ts'), 'utf8').replaceAll('\r\n', '\n');
const sqlDe = (n) => { const i = src.indexOf(`nombre: '${n}'`); const a = src.indexOf('sql: `', i) + 6; return src.slice(a, src.indexOf('`,\n};', a)); };
const cr = (await q(sqlDe('admin-cuentas-resumen')))[0];
ok(cr.admins_sin_2fa === 1 && cr.invitaciones_vigentes === 0 && cr.caducan_en_30_dias === 1 && cr.pendientes === 0,
   'panel · cuentas: sin 2FA, invitaciones vigentes, caducidades próximas', cr);
const cd = await q(sqlDe('admin-caducidades'), [30]);
ok(cd.length === 1 && cd[0].user_id === 'u0' && cd[0].dias === 7, 'panel · caducidades: u0 en 7 días', cd);
const iv = await q(sqlDe('admin-invitaciones'), [false, 10]);
ok(iv.some((r) => r.estado === 'anulada') && iv.some((r) => r.personal), 'panel · invitaciones: anulada y personal', iv.map((r) => r.estado));
ok('intentos_entrada' in (await q(`select ops.purga() p`))[0].p, 'la purga general también limpia los intentos');
fin();
