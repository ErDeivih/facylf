-- 0013 · Corrige la restricción de vinculación de la migración 0012.
--
-- ## Qué estaba mal
--
-- La 0012 ató `codigo_vinculado_en` a `metodo_resolucion = 'referencia-contextual'`. Eso confunde dos
-- cosas distintas:
--
-- - **cómo NACIÓ la inscripción**: sin código, por referencia contextual (`metodo_resolucion`);
-- - **si ya se le ha vinculado un código REAL después**, que es lo que dice `codigo_vinculado_en`.
--
-- Con la expresión vieja, una inscripción nacida contextual a la que después se le vincula su código
-- real no podía conservar las dos cosas a la vez: o perdía la referencia contextual —y con ella la
-- trazabilidad de que nació sin código— o no podía registrar la vinculación. Y la trazabilidad es
-- justamente el requisito: **la aparición posterior de un código real tiene que generar una vinculación
-- auditable, no una fusión silenciosa**.
--
-- ## La expresión correcta
--
-- `codigo_vinculado_en` está puesto EXACTAMENTE cuando la inscripción tiene a la vez un código real y una
-- referencia contextual: es decir, cuando nació sin código y se le vinculó uno.
--
--     (codigo_vinculado_en is not null)  =  (codigo_externo is not null and referencia_contextual is not null)
--
-- Se conservan las otras tres restricciones de la 0012, que ya eran correctas:
--
-- - `metodo_resolucion` en el vocabulario cerrado;
-- - una inscripción nacida por referencia contextual SIEMPRE tiene su referencia;
-- - una inscripción nacida con código federativo SIEMPRE tiene su código.
--
-- Migración ADITIVA sobre datos: quita una restricción y pone otra. No toca ninguna fila. Comprobado:
-- de las 548 filas de `core.team_entry`, ninguna tiene `codigo_vinculado_en`, así que la expresión nueva
-- se cumple en todas.

alter table core.team_entry
  drop constraint if exists team_entry_vinculacion_ck;

alter table core.team_entry
  add constraint team_entry_vinculacion_ck
    check ((codigo_vinculado_en is not null)
           = (codigo_externo is not null and referencia_contextual is not null));

comment on column core.team_entry.codigo_vinculado_en is
  'Cuándo se le vinculó un código real a una inscripción que nació SIN él. Puesto exactamente cuando la '
  'inscripción tiene a la vez código externo y referencia contextual. Una inscripción nacida contextual '
  'conserva su referencia al vincularse: es lo que hace auditable la vinculación en vez de una fusión '
  'silenciosa.';
