-- 0014 · `procedencias` como jsonb, para que el diario del lote pueda restaurarla.
--
-- ## Qué estaba mal
--
-- La 0012 declaró `core.team_entry.procedencias` como `text[]`. El diario de lote guarda el estado
-- anterior de cada fila como JSON, y la reversión lo devuelve como parámetro; para una columna
-- `text[]`, node-postgres recibe la cadena `["calendario","acta"]` allí donde PostgreSQL espera un
-- literal de array (`{calendario,acta}`) y la reversión falla:
--
--     ✗ malformed array literal: "["calendario","acta"]"
--
-- El fallo salió en el ciclo integral sobre la copia, al revertir la importación de un grupo de Euskadi.
-- Es exactamente el tipo de defecto que sólo aparece cuando se ejerce la reversión de verdad.
--
-- ## La corrección
--
-- `jsonb`. La reversión **ya** sabe tratarlo: `reversion.ts` convierte a texto JSON cualquier valor que
-- vuelva como objeto o lista de JavaScript, precisamente porque node-postgres manda un array de
-- JavaScript como literal de array de PostgreSQL. Con `jsonb` las dos direcciones cuadran:
--
-- - la inserción manda `JSON.stringify([...])`, y el importador lo hace así desde este cambio;
-- - el diario guarda ese mismo valor tal y como lo leyó, y la reversión lo devuelve como texto JSON.
--
-- La restricción pasa de contención de array a contención de jsonb, con el mismo vocabulario cerrado.
--
-- Migración ADITIVA sobre datos: convierte la columna y sus restricciones, y `to_jsonb` conserva el
-- contenido de las filas que ya la tuvieran escrita.

-- El orden importa: la restricción vieja hay que QUITARLA ANTES de cambiar el tipo. Si no, PostgreSQL
-- revalida la restricción existente contra el tipo nuevo y falla con «operator does not exist:
-- jsonb <@ text[]», que fue el primer intento de esta migración.
alter table core.team_entry
  drop constraint if exists team_entry_procedencias_ck;

alter table core.team_entry
  alter column procedencias drop default;

alter table core.team_entry
  alter column procedencias type jsonb using to_jsonb(procedencias);

alter table core.team_entry
  alter column procedencias set default '[]'::jsonb;

alter table core.team_entry
  add constraint team_entry_procedencias_ck
    check (jsonb_typeof(procedencias) = 'array'
           and procedencias <@ '["calendario","jornada","clasificacion","acta","catalogo"]'::jsonb);

comment on column core.team_entry.procedencias is
  'Representaciones del ámbito que citan a este equipo, como lista JSON: calendario, jornada, '
  'clasificacion, acta o catalogo. Es jsonb y no text[] porque el diario del lote guarda el estado '
  'anterior en JSON y la reversión lo devuelve como texto JSON: con text[] la restauración fallaba con '
  '«malformed array literal». Sólo se reúne dentro del grupo: nunca se cruza el ámbito.';
