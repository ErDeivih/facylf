import test from 'node:test';
import assert from 'node:assert/strict';
import {fotosDeActa} from './informe-fotos.mjs';
import {nombrePdf} from './informe-nombre-pdf.mjs';
test('foto por código y tipo real de imagen, no nombre ni MIME declarado',()=>{
 const jpeg=Buffer.from([255,216,255,224,0,1]).toString('base64');
 const photos=fotosDeActa(`<tr onclick="jugador=12&amp;codacta=1"><td><img src="data:image/png;base64,${jpeg}"></td></tr><tr>Otro jugador<img src="data:image/png;base64,${jpeg}"></tr>`);
 assert.equal(photos.size,1);assert.equal(photos.get('12'),`data:image/jpeg;base64,${jpeg}`);
});
test('PDF identifica club, equipo, categoría, temporada y fecha sin caracteres de ruta',()=>{
 const filename=nombrePdf({generadoEn:'2026-09-28T12:00:00Z',datos:{contexto:[{club_nombre:'C.D. Águila',nombre_en_fuente:'Águila / B',categoria:'juvenil',temporada:'2026-27'}]}});
 assert.equal(filename,'c-d-aguila_aguila-b_juvenil_2026-27_resumen_consulta-2026-09-28.pdf');
 assert.equal(nombrePdf({generadoEn:'2026-09-28T12:00:00Z',datos:{contexto:[{club_nombre:'C.D. Águila',nombre_en_fuente:'Águila / B',categoria:'juvenil',temporada:'2026-27'}]}},'detalle'),'c-d-aguila_aguila-b_juvenil_2026-27_detalle_consulta-2026-09-28.pdf');
 assert(!/["\\/\r\n]/.test(filename));
});
