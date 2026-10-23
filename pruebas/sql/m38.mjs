// 0038: perfil de federación y avisos de página según lo que apunta cada competición.
import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
 insert into core.federation (codigo,nombre,adaptador) values ('cataluna','Cataluña','fcf'),('madrid','Madrid','pnfg'),('aragon','Aragón','pnfg');
 insert into core.season (etiqueta,anio_inicio,orden) values ('2024-25',2024,24),('2025-26',2025,25);
 insert into core.competition_edition (federation_id,season_id,codigo_externo,nombre_publicado,categoria,modalidad,genero)
   values (1,2,'C','Lliga','juvenil','futbol11','masculina'),(2,1,'M','Liga','juvenil','futbol11','masculina'),(2,2,'M2','Liga','juvenil','futbol11','masculina');
 insert into analytics.edicion_capacidad values
   (1, 100, 95, 80, 160, 0, 0, 200, 200, 10, 10, 1600, 0, 0, 0, true, false, false, true, false, 'alineaciones', now()),
   (2, 100, 99, 99, 198, 150, 90, 250, 250, 99, 99, 1800, 0, 0, 0, true, true, true, true, false, 'completo', now()),
   (3, 100, 99, 99, 198, 150, 90, 250, 100, 99, 99, 1800, 900, 0, 0, true, true, true, false, true, 'completo', now());
 -- Cataluña 2025-26 leída con el lector antiguo: 100 jugadores, ninguno con código; Madrid: todos con código.
 update analytics.edicion_capacidad set personas = 100, personas_con_codigo = 0 where competition_edition_id = 1;
 update analytics.edicion_capacidad set personas = 100, personas_con_codigo = 97 where competition_edition_id in (2, 3);
`);
const av = async (f, e) => (await q(`select codigo from analytics.avisos_de_datos($1, $2::bigint)`, [f, e])).map((r) => r.codigo);
console.log('1 · perfiles');
ok((await q(`select count(*)::int n from core.federacion_perfil`))[0].n === 24, '24 fuentes (19 federaciones + forales y provincias canarias)');
ok((await q(`select count(*)::int n from core.federacion_perfil where medido_en is null`))[0].n === 0, 'las 24 fuentes medidas (las ocho del servidor, en 0046)');
const ara = (await q(`select codigo_jugador, plataforma, posiciones_desde, fotos_en_acta from core.federacion_perfil where codigo = 'aragon'`))[0];
ok(ara.codigo_jugador === true && ara.posiciones_desde === null && ara.fotos_en_acta === null, 'lo que no se midió sigue NULL, no «no»', ara);
console.log('2 · avisos');
const cat = await av('cataluna', 1);
ok(cat.includes('sin_cambios') && cat.includes('sin_tarjetas') && cat.includes('identidad_por_nombre') && cat.includes('arbitros_unidos'),
   'Cataluña (edición leída sin iconos): sin cambios, sin tarjetas, identidad por nombre MEDIDA en la edición, árbitros unidos', cat);
ok(!(await av('cataluna', null)).includes('identidad_por_nombre'), 'página de la federación: su fuente sí da código (perfil corregido el 22/10)');
await q(`update analytics.edicion_capacidad set personas_con_codigo = 95, registra_cambios = true, registra_tarjetas = true where competition_edition_id = 1`);
const cat2 = await av('cataluna', 1);
ok(!cat2.includes('identidad_por_nombre') && !cat2.includes('sin_cambios') && !cat2.includes('sin_tarjetas'), 'al releer las actas con códigos, tarjetas y cambios, los avisos se van solos', cat2);
ok(cat[0] === 'sin_cambios' || cat[0] === 'sin_tarjetas', 'los avisos de límite van primero');
const mad24 = await av('madrid', 2), mad25 = await av('madrid', 3);
ok(mad24.includes('posiciones_desde') && !mad25.includes('posiciones_desde'), 'Madrid: aviso de posiciones en 2024-25, no en 2025-26', [mad24, mad25]);
ok(mad25.includes('sin_minuto_gol') && !mad24.includes('sin_minuto_gol'), 'el aviso de minuto de gol depende de la competición, no de la federación');
ok(mad24.includes('convocados') && !mad24.includes('sin_cambios'), 'Madrid: «convocados» sí, sin cambios no (su liga los apunta)');
ok((await av('aragon', null)).length === 0, 'federación medida y sin tacha: ningún aviso (aragon: código, cambios y tarjetas)');
ok((await av('inventada', null)).length === 0, 'federación desconocida: ningún aviso (y ningún error)');
console.log('3 · ficha y auditoría');
const fi = (await q(`select * from analytics.federacion_ficha where codigo = 'cataluna'`))[0];
ok(fi.plataforma === 'fcf' && fi.codigo_jugador === true, 'ficha de Cataluña', fi);
await db.exec(`begin; select set_config('facylf.usuario','admin',true); update core.federacion_perfil set codigo_jugador = false where codigo = 'cataluna'; commit;`);
const au = await q(`select usuario, clave, antes->>'codigo_jugador' a, despues->>'codigo_jugador' d from app.auditoria where tabla = 'core.federacion_perfil' and clave = 'cataluna'`);
ok(au.length === 1 && au[0].clave === 'cataluna' && au[0].a === 'true' && au[0].d === 'false' && au[0].usuario === 'admin', 'cambiar un perfil queda auditado', au);
ok((await av('cataluna', null)).includes('identidad_por_nombre'), 'y el aviso de la federación cambia sin tocar la web');
fin();
