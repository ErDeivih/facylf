-- 0016 · La clave natural de una aparición incluye la condición, igual que la de la fuente.
--
-- QUÉ PASA. El importador moría con «ON CONFLICT DO UPDATE command cannot affect row a second time» en
-- 9 grupos (Murcia sobre todo, y uno de Cataluña): dentro de UNA acta, dos filas acababan en la misma clave
-- `(match_id, team_entry_id, person_id, orden)`.
--
-- POR QUÉ. La clave de la cola es `(temporada, competicion, grupo, jornada, acta, lado, condicion, orden)`, y
-- `orden` sólo es único DENTRO de cada condición: el recolector numera la lista de titulares desde 0 y la de
-- suplentes desde 0 otra vez. Al traducirla al canónico se dejó `condicion` fuera de la clave, así que la
-- clave canónica quedó MÁS ESTRICTA que la de la fuente. Medido el 24/09/2026 en el grupo 22884039 de
-- Murcia: 1.515 claves `(acta, lado, orden)` repetidas y **1.514 sin problema**, porque los dos implicados
-- son personas distintas. Sólo choca cuando el mismo nombre aparece en las dos listas con el mismo `orden`:
-- 1 caso en ese grupo, y es el que tumbaba el grupo entero — 26 filas de una acta contra 22 jornadas de
-- jugadores, minutos y goles.
--
-- El caso real, de la cola de Murcia (acta 529106, visitante, orden 0): «Adrián» en suplentes y «ADRIÁN» en
-- titulares. La fuente publica las dos filas. Sin código federativo en Murcia, la identidad es nominal dentro
-- del equipo (ADR-0011), así que las dos son la misma persona y la clave chocaba.
--
-- QUÉ SE HACE Y POR QUÉ ASÍ. Se añade `condition` a la clave natural, que es exactamente lo que ya hace la
-- fuente. Las dos filas publicadas se escriben: no se elige una ni se inventa un `orden` nuevo. La
-- alternativa —descartar una fila— rompía además la validación del lote, que compara las participaciones del
-- origen contra las escritas: al descartar una, `origen ≠ destino` y el grupo seguía fallando, sólo que con
-- otro mensaje.
--
-- CONSECUENCIA, PARA QUE CONSTE. En ese caso raro, la misma persona suma dos apariciones en el mismo partido
-- (una de titular y otra de suplente), porque es lo que la fuente dice. No es un error de conteo escondido:
-- `core.appearance.condition` viaja en cada fila y quien cuente partidos puede contar por `condition`. Lo que
-- NO se hace es quedarse con una de las dos y callar la otra.
--
-- ADITIVA Y SEGURA: añadir una columna a una clave única sólo la hace más permisiva, así que ninguna fila
-- existente la incumple. 0001-0015 no se tocan.

alter table core.appearance drop constraint if exists appearance_match_id_team_entry_id_person_id_orden_key;

alter table core.appearance
  add constraint appearance_clave_natural_key
  unique (match_id, team_entry_id, person_id, condition, orden);

comment on constraint appearance_clave_natural_key on core.appearance is
  'Clave natural de una aparición: la misma que publica la fuente (equipo, persona, condición y orden). '
  'Lleva `condition` porque el `orden` de la fuente sólo es único dentro de cada condición: el recolector '
  'numera titulares y suplentes por separado.';
