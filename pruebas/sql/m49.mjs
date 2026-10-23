// 0049: retención del diario de lotes (apagada por defecto; lote entero o nada; marca «podado»).
import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
const err = async (s, p) => { try { await q(s, p); return null; } catch (e) { return e.message; } };
await db.exec(`
 insert into core.federation (codigo,nombre,adaptador) values ('madrid','Madrid','pnfg');
 insert into ops.batch (federation_id, sqlite_origen, parser_version, normalizador_version, estado, terminado_en) values
   (1, 'cola', 1, 1, 'validado',  now() - interval '100 days'),   -- 1: viejo, 3 filas
   (1, 'cola', 1, 1, 'publicado', now() - interval '60 days'),    -- 2: viejo, 2 filas
   (1, 'cola', 1, 1, 'validado',  now() - interval '3 days'),     -- 3: reciente
   (1, 'cola', 1, 1, 'fallido',   now() - interval '100 days'),   -- 4: fallido: no se toca
   (1, 'cola', 1, 1, 'en_curso',  null);                          -- 5: en curso: no se toca
 insert into ops.batch_cambio (batch_id, tabla, accion, clave)
   select b, 'core.match', 'insert', jsonb_build_object('id', g)
     from (values (1, 3), (2, 2), (3, 4), (4, 2), (5, 1)) v(b, n), generate_series(1, v.n) g;`);
const filas = async (b) => (await q(`select count(*)::int n from ops.batch_cambio where batch_id = $1`, [b]))[0].n;

ok((await q(`select ops.purga() p`))[0].p.diario_lotes === 'apagado' && await filas(1) === 3, 'apagado por defecto: la purga de cada noche no toca el diario');
ok((await err(`select ops.poda_diario_lotes(3)`))?.includes('DIAS_MINIMO_7'), 'menos de 7 días: se niega');
const cuenta = (await q(`select ops.poda_diario_lotes(30) r`))[0].r;
ok(cuenta.lotes === 2 && cuenta.filas === 5 && cuenta.borradas === 0 && await filas(1) === 3, 'sin aplicar sólo cuenta: 2 lotes viejos, 5 filas', cuenta);
const tanda = (await q(`select ops.poda_diario_lotes(30, 4, true) r`))[0].r;
ok(tanda.lotes === 1 && tanda.borradas === 3 && await filas(1) === 0 && await filas(2) === 2,
   'tanda de 4: entra el lote 1 (3 filas) y el 2 no se parte (se queda entero para la siguiente)', tanda);
ok((await q(`select validacion->>'diario' d from ops.batch where id = 1`))[0].d === 'podado', 'el lote podado queda marcado (para que --revertir lo explique)');
await q(`update ops.parametro set valor = 30 where clave = 'diario_lote_dias'`);
const noche = (await q(`select ops.purga() p`))[0].p.diario_lotes;
ok(noche.borradas === 2 && await filas(2) === 0 && await filas(3) === 4 && await filas(4) === 2 && await filas(5) === 1,
   'encendido a 30 días: poda el lote 2; el reciente, el fallido y el que está en curso se quedan', noche);
const res = await q(`select * from ops.diario_lotes_resumen()`);
ok(res.some((r) => r.antiguedad === 'menos de 7 días' && Number(r.filas) === 4) && res.some((r) => r.antiguedad.startsWith('(fallido')),
   'resumen por antigüedad', res);
fin();
