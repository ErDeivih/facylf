// 0046: las ocho federaciones que se recogen en el servidor salen de «sin medir».
// Se prueba lo que la migración promete y, sobre todo, que no se inventa lo que no se midió.
import { base29, ok, fin } from './m29.mjs';
const db = await base29();
const q = async (s, p) => (await db.query(s, p)).rows;
const av = async (f, e) => (await q(`select codigo from analytics.avisos_de_datos($1, $2::bigint)`, [f, e])).map((r) => r.codigo);
const perfil = async (c) => (await q(`select * from core.federacion_perfil where codigo = $1`, [c]))[0];

console.log('1 · las 24 fuentes, medidas');
ok((await q(`select count(*)::int n from core.federacion_perfil where medido_en is null`))[0].n === 0,
  'ninguna fuente queda «sin medir»');
ok((await q(`select count(*)::int n from core.federacion_perfil where medido_en = '2026-10-23'`))[0].n === 8,
  'las ocho del servidor llevan la fecha de la medición');

console.log('2 · lo que dice cada una de las ocho');
const esperado = {
  aragon: [true, '87 %'], asturias: [true, '100 %'], baleares: [true, '97 %'], cantabria: [true, '99 %'],
  'castilla-la-mancha': [true, '100 %'], extremadura: [false, '42 %'], galicia: [true, '74 %'], murcia: [false, '35 %'],
};
for (const [codigo, [conCodigo, cifra]] of Object.entries(esperado)) {
  const p = await perfil(codigo);
  ok(p && p.codigo_jugador === conCodigo, `${codigo}: código de jugador = ${conCodigo}`, p && p.codigo_jugador);
  ok(p && typeof p.nota === 'string' && p.nota.includes(cifra), `${codigo}: la nota cita la cifra medida (${cifra})`);
  ok(p && p.fotos_en_acta === null && p.sistema_juego === null && p.posiciones_desde === null,
    `${codigo}: lo que no se midió sigue NULL, no «no»`);
}

console.log('3 · los avisos de la página de la federación');
ok(!(await av('extremadura', null)).includes('sin_medir'), 'Extremadura ya no dice «sin medir»');
ok((await av('extremadura', null)).includes('identidad_por_nombre'), 'Extremadura sí avisa de identidad por nombre');
ok((await av('murcia', null)).includes('identidad_por_nombre'), 'Murcia sí avisa de identidad por nombre');
ok(!(await av('galicia', null)).includes('identidad_por_nombre'), 'Galicia no: ~3 de cada 4 sí traen código');
for (const f of ['aragon', 'asturias', 'baleares', 'cantabria', 'castilla-la-mancha']) {
  ok((await av(f, null)).length === 0, `${f}: sin avisos de fuente`, await av(f, null));
}

console.log('4 · la ficha y la auditoría');
const ficha = (await q(`select * from analytics.federacion_ficha where codigo = 'extremadura'`))[0];
ok(ficha && ficha.codigo_jugador === false && ficha.medido_en !== null, 'la ficha enseña el perfil medido', ficha && ficha.codigo_jugador);
await db.exec(`begin; select set_config('facylf.usuario','admin',true);
  update core.federacion_perfil set medido_en = '2026-10-23', nota = nota where codigo = 'aragon'; commit;`);
ok((await q(`select count(*)::int n from app.auditoria where tabla = 'core.federacion_perfil'`))[0].n >= 8,
  'cada cambio de perfil queda auditado (0046 toca ocho filas)');

console.log('5 · repetible e inocua');
await db.exec(`update core.federacion_perfil set codigo_jugador = true, medido_en = '2026-10-23', nota = 'Código de jugador en el 87 % de las filas de alineación (2024-25); el resto, identidad nominal por equipo. Cambios en el 36 % de las actas y tarjetas en el 56 %.' where codigo = 'aragon'`);
const antes = JSON.stringify(await perfil('extremadura'));
await db.exec(`update core.federacion_perfil set codigo_jugador = false, medido_en = '2026-10-23', nota = nota where codigo = 'extremadura'`);
ok(JSON.stringify(await perfil('extremadura')) === antes, 'volver a aplicarla no cambia nada');
ok((await q(`select count(*)::int n from core.federacion_perfil`))[0].n === 24, 'siguen siendo 24 filas (no duplica)');

console.log('6 · una federación de la que no se sabe nada sigue diciendo «sin medir»');
await q(`update core.federacion_perfil set medido_en = null where codigo = 'rioja'`);
ok((await av('rioja', null)).includes('sin_medir'), 'quitar la medición devuelve el aviso (el aviso no está cableado)');
ok(!(await av('inventada', null)).length, 'federación desconocida: ningún aviso y ningún error');
fin();
