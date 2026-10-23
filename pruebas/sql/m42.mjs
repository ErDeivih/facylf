// 0042: publicidad medida (vistas, eventos validados, reparto uniforme, tope diario, interruptor, informe).
import { base29, ok, fin } from './m29.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
const elige = async (esp = 'competicion-lateral', menores = false, usuario = null) =>
  (await q(`select * from app.elige_campana($1, 1::smallint, null, null, $2, $3)`, [esp, usuario, menores]))[0] ?? null;
const evento = async (esp, c, t) => (await q(`select ops.cuenta_anuncio_evento($1, $2, $3) ok`, [esp, c, t]))[0].ok;
await db.exec(`
 insert into core.federation (codigo,nombre,adaptador) values ('madrid','Madrid','pnfg');
 update app.espacio_anuncio set activo = true, proveedor = 'directo' where codigo = 'competicion-lateral';
 update app.espacio_anuncio set activo = true, proveedor = 'adsense', adsense_slot = '123' where codigo = 'acta-pie';
 insert into app.campana_anuncio (patrocinador,titulo,imagen_url,destino_url,espacios,desde,hasta,tope_impresiones,precio_cpm,creada_por)
   values ('Deportes Sur','Botas','/p/1.webp','https://ejemplo.es',array['competicion-lateral'],current_date,current_date+9,1000,8,'admin');`);

ok((await elige())?.campana_id === 1, 'hueco directo activo: sale la campaña');
ok(await elige('competicion-lateral', true) === null, 'nunca en páginas con menores');
ok((await elige('acta-pie'))?.proveedor === 'adsense', 'hueco de AdSense: lo pinta la web con su slot');

ok(await evento('competicion-lateral', 1, 'vista') === false, 'una vista sin impresión servida ese día no cuenta');
ok(await evento('no-existe', null, 'impresion') === false && await evento('competicion-lateral', 99, 'impresion') === false
   && await evento('competicion-lateral', 1, 'otra') === false, 'códigos inventados, campañas ajenas o eventos raros: no se cuentan');
ok(await evento('competicion-lateral', 1, 'impresion') && await evento('competicion-lateral', 1, 'vista') && await evento('competicion-lateral', 1, 'clic'),
   'impresión, vista y clic se cuentan en ese orden');

// Reparto uniforme: 10 días y 1.000 de tope → el primer día, hasta ~110 (10 % de adelanto).
await q(`update ops.anuncio_dia set impresiones = 109 where campana_id = 1`);
ok((await elige())?.campana_id === 1, 'reparto uniforme: por debajo del ritmo, sigue saliendo');
await q(`update ops.anuncio_dia set impresiones = 111 where campana_id = 1`);
ok(await elige() === null, 'reparto uniforme: adelantada más de un 10 %, espera al día siguiente');
await q(`update app.campana_anuncio set reparto = 'lo_antes_posible' where id = 1`);
ok((await elige())?.campana_id === 1, '«lo antes posible» no frena');
await q(`update app.campana_anuncio set tope_diario = 100 where id = 1`);
ok(await elige() === null, 'tope diario alcanzado');
await q(`update app.campana_anuncio set tope_diario = null where id = 1`);

await q(`update ops.parametro set valor = 0 where clave = 'anuncios_encendidos'`);
ok(await elige() === null && await elige('acta-pie') === null && await evento('competicion-lateral', 1, 'impresion') === true,
   'interruptor general apagado: ningún hueco (los eventos ya en vuelo se cuentan)');
await q(`update ops.parametro set valor = 1 where clave = 'anuncios_encendidos'`);

await db.exec(`insert into app.paquete (codigo,nombre,descripcion) values ('pro','Pro','x') on conflict do nothing;
         update app.paquete set sin_anuncios = true where codigo = 'pro';
         insert into app.usuario (user_id, paquete) values ('u1', 'pro')`);
ok(await elige('competicion-lateral', false, 'u1') === null, 'paquete sin anuncios');

// Informe: 1.000 vistas a 8 € CPM = 8 €; AdSense 2.000 vistas a 1,5 € = 3 € (estimado).
await db.exec(`update ops.anuncio_dia set impresiones = 1500, vistas = 1000, clics = 15 where campana_id = 1;
         insert into ops.anuncio_dia (dia, espacio, campana_id, impresiones, vistas, clics) values (current_date, 'acta-pie', 0, 4000, 2000, 8)`);
const inf = await q(`select * from ops.informe_anuncios(current_date - 30, current_date) order by espacio`);
const ad = inf.find((r) => r.espacio === 'acta-pie'), di = inf.find((r) => r.campana_id == 1);
ok(Number(di.ingresos) === 8 && !di.estimado && Number(di.pct_visible) === 66.7 && Number(di.ctr) === 1,
   'informe del patrocinio: 8 € por CPM, 66,7 % visibles, CTR 1 %', di);
ok(Number(ad.ingresos) === 3 && ad.estimado, 'informe de AdSense: 3 € estimados', ad);
await q(`update app.campana_anuncio set precio_cpm = null, importe_fijo = 500 where id = 1`);
const fijo = (await q(`select ingresos from ops.informe_anuncios(current_date, current_date) where campana_id = 1`))[0];
ok(Number(fijo.ingresos) === 50, 'importe fijo: 500 € en 10 días → 50 € el día del informe', fijo);
let e = null; try { await q(`update app.campana_anuncio set precio_cpm = 3 where id = 1`); } catch (x) { e = x.message; }
ok(e?.includes('campana_precio_check'), 'precio por CPM o importe fijo, no los dos');

// Consultas del panel (admin.ts) sobre lo mismo
const src = readFileSync(join(RAIZ, 'apps', 'web', 'src', 'consultas', 'admin.ts'), 'utf8');
const sqlDe = (n) => { const i = src.indexOf(`nombre: '${n}'`); const a = src.indexOf('sql: `', i) + 6; return src.slice(a, src.indexOf('`,\n};', a)); };
await q(`update app.campana_anuncio set importe_fijo = null, precio_cpm = 8, reparto = 'uniforme' where id = 1`);
const ca = (await q(sqlDe('admin-campanas-anuncio')))[0];
ok(ca.vistas === 1000 && ca.ingresos === 8 && ca.ritmo_estado === 'adelantada', 'panel · campañas: vistas, importe y ritmo (1.500 servidas el día 1 de 10 → adelantada)', ca);
const sd = await q(sqlDe('admin-anuncios-por-dia'), [7]);
ok(sd.length === 7 && sd[6].vistas === 3000 && sd[6].ingresos_estimados === 11 && sd[0].vistas === 0,
   'panel · serie diaria: 7 días, hoy 3.000 vistas y 11 € (8 + 3), días sin anuncios a 0', sd[6]);
const es = (await q(sqlDe('admin-espacios-anuncio'))).find((r) => r.codigo === 'acta-pie');
ok(es.vistas_30d === 2000 && es.pct_visible_30d === 50, 'panel · huecos: vistas y % visible de 30 días', es);
fin();
