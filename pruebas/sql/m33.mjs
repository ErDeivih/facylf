import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`insert into core.federation (codigo,nombre,adaptador) values ('cyl','CyL','pnfg');
 insert into app.usuario (user_id, rol, paquete) values ('a','administrador',null),('e','usuario','esencial'),('o','usuario','ojeador');`);
const elige = async (esp, u, menores = false) => q(`select * from app.elige_campana($1, 1::smallint, 9, 3, $2, $3)`, [esp, u, menores]);
ok((await elige('competicion-lateral', 'e')).length === 0, 'por defecto nada (proveedor «ninguno»)');
await db.exec(`update app.espacio_anuncio set activo = true, proveedor = 'directo' where codigo = 'competicion-lateral';
 insert into app.campana_anuncio (patrocinador, titulo, imagen_url, destino_url, espacios, federaciones, desde, hasta, creada_por, tope_impresiones)
   values ('Deportes Tormes','Botas -20%','/anuncios/1.webp','https://ejemplo.invalid','{competicion-lateral}','{1}', current_date - 1, current_date + 30, 'a', 2);`);
ok((await elige('competicion-lateral', 'e'))[0]?.titulo === 'Botas -20%', 'patrocinio directo en su federación');
ok((await elige('competicion-lateral', 'o')).length === 0, 'paquete sin anuncios (ojeador): nada');
ok((await elige('competicion-lateral', 'e', true)).length === 0, 'página con menores: nada');
await q(`select ops.cuenta_anuncio('competicion-lateral', 1, false)`); await q(`select ops.cuenta_anuncio('competicion-lateral', 1, false)`);
ok((await elige('competicion-lateral', 'e')).length === 0, 'tope de impresiones alcanzado: deja de salir');
await db.exec(`update app.espacio_anuncio set proveedor = 'adsense', adsense_slot = '123' where codigo = 'competicion-lateral';`);
ok((await elige('competicion-lateral', 'e'))[0]?.proveedor === 'adsense', 'espacio AdSense: la web pinta el bloque de Google');
fin();
