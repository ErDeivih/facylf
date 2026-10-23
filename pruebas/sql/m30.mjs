import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`insert into core.federation (codigo,nombre,adaptador) values ('cyl','CyL','pnfg'),('mad','Madrid','pnfg');
  insert into core.season (etiqueta,anio_inicio,orden) values ('2025-26',2025,25);
  insert into ops.batch (federation_id,sqlite_origen,parser_version,normalizador_version,estado,terminado_en) values
   (1,'a',1,1,'publicado',now()-interval '1 hour'),(2,'b',1,1,'publicado',now()-interval '80 hours'),(2,'c',1,1,'fallido',null);`);
let t = performance.now();
const ch = await q('select * from ops.chequeos()');
console.log('chequeos', ch.length, Math.round(performance.now() - t), 'ms');
console.table(ch.map((c) => ({ n: c.nombre, a: c.area, e: c.estado, v: c.valor })));
ok(ch.find((c) => c.nombre === 'federacion_sin_lote:mad').estado === 'aviso', 'Madrid sin lote 80 h → aviso');
ok(ch.find((c) => c.nombre === 'federacion_sin_lote:cyl').estado === 'ok', 'CyL fresca');
ok(ch.find((c) => c.nombre === 'lotes_fallidos_24h').estado === 'aviso', 'lote fallido → aviso');
ok(ch.find((c) => c.nombre === 'copia_de_seguridad').estado === 'fallo', 'sin copia → fallo');
let r = await q('select * from ops.registra_chequeos()');
ok(r.filter((x) => x.accion === 'abre').length === 4, 'abre 4 alertas (Madrid, lote fallido, copia, restauración)', r.map((x) => x.accion + ':' + x.nombre));
await q('select ops.marca_notificada($1)', [r.map((x) => x.nombre)]);
r = await q('select * from ops.registra_chequeos()');
ok(r.length === 0, 'segunda pasada: nada nuevo que notificar', r);
await db.exec(`insert into ops.copia (tipo, terminada_en, correcta) values ('copia', now(), true), ('restauracion_prueba', now(), true);
  insert into ops.evento_app (nivel, origen, tipo, mensaje) select 'error','web','pagina_500','x' from generate_series(1,6);`);
r = await q('select * from ops.registra_chequeos()');
ok(r.some((x) => x.accion === 'cierra' && x.nombre === 'copia_de_seguridad') && r.some((x) => x.accion === 'abre' && x.nombre === 'errores_web_15min' && x.severidad === 'fallo'),
   'copia hecha → cierra; 6 errores web → abre fallo', r.map((x) => x.accion + ':' + x.nombre + ':' + x.severidad));
ok((await q('select count(*)::int n from ops.salud'))[0].n === 3, 'salud: 3 alertas abiertas');
ok((await q('select count(*)::int n from ops.chequeo_diario'))[0].n === ch.length, 'histórico diario');
console.log(await q('select ops.purga() p'));
fin();
