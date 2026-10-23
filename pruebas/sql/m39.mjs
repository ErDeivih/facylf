// 0039: métricas de uso propias (sin terceros) y su retención.
import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
await q(`insert into app.usuario (user_id) values ('ana'),('luis')`);
for (const [ruta, u, cache, ms] of [['/equipo/[id]', 'ana', false, 120], ['/equipo/[id]', 'ana', true, 8], ['/equipo/[id]', 'luis', true, 6], ['/ojeo', 'luis', false, 300], ['/mi', 'ana', false, 40]])
  await q(`select ops.anota_uso($1, $2, $3, $4)`, [ruta, u, cache, ms]);
await q(`select ops.anota_uso('https://fuera.example', 'ana', false, 1)`);           // URL completa: se ignora
await q(`select ops.anota_uso('/equipo/[id]', null, true, 5)`);                       // sin usuario (proceso): cuenta la vista
const pan = await q(`select * from ops.uso_por_pantalla(30)`);
console.table(pan);
const eq = pan.find((p) => p.ruta === '/equipo/[id]');
ok(eq && Number(eq.vistas) === 4 && Number(eq.pct_cache) === 75 && Number(eq.ms_medio) === 35, 'por pantalla: 4 vistas de equipo, 75 % de caché, 35 ms de media', eq);
ok(!pan.some((p) => p.ruta.startsWith('http')), 'una URL que no es ruta interna no se guarda');
const dia = (await q(`select * from ops.uso_resumen(7)`)).at(-1);
ok(Number(dia.vistas) === 6 && Number(dia.usuarios) === 2 && Number(dia.activos_7d) === 2, 'hoy: 6 vistas, 2 usuarios, 2 activos en 7 días', dia);
ok((await q(`select count(*)::int n from ops.uso_resumen(14)`))[0].n === 14, 'el resumen trae también los días sin visitas');
await q(`insert into ops.uso_usuario_dia (dia, user_id, vistas) values (current_date - 100, 'ana', 3)`);
await q(`insert into ops.uso_dia (dia, ruta, vistas) values (current_date - 500, '/mi', 9)`);
const pu = (await q(`select ops.purga() p`))[0].p;
ok(pu.uso_usuarios === 1 && pu.uso_dias === 1 && 'eventos' in pu && 'avisos_leidos' in pu, 'la purga general encadena datos + plataforma + uso', pu);
fin();
