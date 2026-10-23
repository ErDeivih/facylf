-- 0046 · Las ocho federaciones del servidor salen de «sin medir» (medidas el 23/10/2026).
--
-- 0038 dejó a propósito en NULL los rasgos de las ocho federaciones que se recogen en el servidor (Aragón,
-- Asturias, Baleares, Cantabria, Castilla-La Mancha, Extremadura, Galicia y Murcia): «sin medir» no es «no».
-- Aquel día sólo se habían medido las que se recogen en el PC. El 23/10 se midieron también éstas
-- (`docs/plataforma-web/COBERTURA-FEDERACIONES.md` §2 y sus notas, temporada 2024-25, cifras sobre las actas
-- guardadas y comprobadas contra el HTML crudo), así que ya se puede decir qué rasgos tienen.
--
-- Se rellena **sólo lo que se midió**: el código de jugador, que es lo que cambia el aviso de identidad, y una
-- nota que explica lo demás. Los rasgos que no se midieron (árbitros unidos, «convocados» sin condición,
-- posiciones desde una temporada, sistema de juego, capitán, fotos en el acta) siguen en NULL a propósito:
-- desconocido no es cero. Lo que sí se sabe de cada competición y temporada no está aquí, sino medido en
-- `analytics.edicion_capacidad` (0032), que es lo que usan los avisos de cambios, tarjetas y minuto de gol.
--
-- Con esto desaparece el aviso «Aún no se ha medido qué datos publica esta federación» de las 24 fuentes,
-- porque las 24 tienen ya `medido_en`.

update core.federacion_perfil set
  codigo_jugador = true, medido_en = '2026-10-23',
  nota = 'Código de jugador en el 87 % de las filas de alineación (2024-25); el resto, identidad nominal por '
         'equipo. Cambios en el 36 % de las actas y tarjetas en el 56 %.'
 where codigo = 'aragon';

update core.federacion_perfil set
  codigo_jugador = true, medido_en = '2026-10-23',
  nota = 'Código de jugador en el 100 % de las filas de alineación (2024-25); cambios 48 %, tarjetas 50 %, '
         'minuto de gol 100 %.'
 where codigo = 'asturias';

update core.federacion_perfil set
  codigo_jugador = true, medido_en = '2026-10-23',
  nota = 'Código de jugador en el 97 % de las filas de alineación (2024-25); cambios 31 %, tarjetas 40 %.'
 where codigo = 'baleares';

update core.federacion_perfil set
  codigo_jugador = true, medido_en = '2026-10-23',
  nota = 'Código de jugador en el 99 % de las filas de alineación (2024-25); cambios 48 %, tarjetas 46 %.'
 where codigo = 'cantabria';

update core.federacion_perfil set
  codigo_jugador = true, medido_en = '2026-10-23',
  nota = 'Código de jugador en el 100 % de las filas de alineación (2024-25); cambios 46 %, tarjetas 61 %.'
 where codigo = 'castilla-la-mancha';

-- Extremadura y Murcia: la federación sólo enlaza a la ficha de ~4 de cada 10 jugadores, así que la mayoría de
-- sus fichas se unen por nombre y equipo. Es de la fuente, no del lector (comprobado en el HTML guardado).
update core.federacion_perfil set
  codigo_jugador = false, medido_en = '2026-10-23',
  nota = 'Sólo enlaza a la ficha de ~4 de cada 10 jugadores (42 % de las filas con código en 2024-25; 122 de 779 '
         'en 2016-17): la identidad del resto es nominal, por nombre y equipo. Las actas de base tampoco apuntan '
         'cambios (24 %) ni tarjetas (39 %).'
 where codigo = 'extremadura';

update core.federacion_perfil set
  codigo_jugador = false, medido_en = '2026-10-23',
  nota = 'Sólo enlaza a la ficha de ~4 de cada 10 jugadores (35 % de las filas con código en 2024-25): la '
         'identidad del resto es nominal, por nombre y equipo. Cambios 38 %, tarjetas 57 %.'
 where codigo = 'murcia';

-- Galicia: ~3 de cada 4 filas traen código; el resto se une por nombre y equipo. Los cambios (9 %) y las
-- tarjetas (23 %) son de las actas de base, que no los apuntan, no de nuestro lector.
update core.federacion_perfil set
  codigo_jugador = true, medido_en = '2026-10-23',
  nota = 'Código de jugador en el 74 % de las filas de alineación (2024-25): ~3 de cada 4, el resto por nombre y '
         'equipo. Cambios 9 % y tarjetas 23 %: las actas de base no los apuntan.'
 where codigo = 'galicia';
