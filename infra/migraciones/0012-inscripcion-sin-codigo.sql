-- 0012 · Inscripción de un equipo SIN código federativo, por referencia contextual.
--
-- ## El problema
--
-- La maqueta «nova» de Euskadi publica el código de equipo sólo en el enlace de comparativa, y la
-- mayoría de las filas no lo traen: medido el 15/09/2026, 30.314 de los 34.358 partidos de Euskadi no
-- tienen código en NINGUNO de los dos lados. Sin código, el importador no creaba inscripción para esos
-- equipos, así que sus partidos quedaban sin equipos y las apariciones del acta se rechazaban por
-- «participación sin equipo resoluble». Ésa es la razón de que Euskadi no esté en el canónico.
--
-- ## La decisión
--
-- Una inscripción puede identificarse por una REFERENCIA CONTEXTUAL:
--
--     federación | temporada | competición | grupo | nombre_normalizado
--
-- Los cuatro primeros ya están en `phase_group_id` y en `source.external_ref.context_key`; el nombre
-- normalizado es el que falta. Se guarda en `team_entry.referencia_contextual`, y la referencia
-- completa se registra además en `source.external_ref` con `external_id = 'ctx:<normalizado>'`.
--
-- Lo que NO se hace, y es el punto entero:
--
-- - **no se fabrica un código federativo**: `codigo_externo` sigue siendo NULL, y el prefijo `ctx:` no
--   puede confundirse con un código real porque los códigos de estas federaciones son numéricos;
-- - **el nombre normalizado sólo vale dentro del ámbito**: la unicidad es por `phase_group_id`, nunca
--   global, así que dos equipos homónimos de grupos distintos son dos inscripciones;
-- - **dos candidatos implican «sin resolver»**: si dos literales del mismo grupo normalizan igual y no
--   son el mismo equipo, no se elige ninguno y el partido no se importa.
--
-- ## Vinculación posterior con un código real
--
-- Si más adelante la fuente publica el código de ese equipo, la inscripción NO se duplica ni se funde
-- en silencio: se le escribe el `codigo_externo` y se registra la referencia `external_id = <código>`
-- apuntando al MISMO `canonical_id`. `codigo_vinculado_en` deja constancia de cuándo pasó, y las dos
-- referencias (la contextual y la del código) quedan en `source.external_ref` para poder auditarlo.
--
-- Ver ADR-0002 (identificadores contextualizados) y ADR-0011, que resolvió el mismo problema para las
-- personas y cuyo formato de contexto se reutiliza aquí.
--
-- Migración ADITIVA: no toca ninguna columna existente ni ninguna fila. Comprobado antes de escribirla:
-- de las 548 filas de `core.team_entry`, 548 tienen `codigo_externo` no nulo, así que las restricciones
-- nuevas se cumplen sin excepción.

alter table core.team_entry
  -- El nombre normalizado del equipo DENTRO de su grupo. Columna generada: no se inserta, y por eso no
  -- puede desincronizarse del literal que la fuente publicó.
  add column if not exists nombre_en_fuente_norm text
    generated always as (core.normaliza_nombre(nombre_en_fuente)) stored,
  -- La referencia contextual, sólo cuando la fuente no publica código. NULL en las inscripciones que sí
  -- lo tienen: no se rellena «por si acaso», porque una inscripción con código no necesita adivinar.
  add column if not exists referencia_contextual text,
  -- Cómo se resolvió esta inscripción. Vocabulario cerrado, y la base lo comprueba.
  add column if not exists metodo_resolucion text not null default 'codigo-externo',
  -- De dónde salió el candidato: puede venir de varias representaciones a la vez, y eso es información
  -- útil (un equipo citado en el calendario Y en el acta es más sólido que uno citado sólo en uno).
  add column if not exists procedencias text[] not null default '{}',
  -- Cuándo se le vinculó un código real a una inscripción que nació sin él. NULL mientras no pase.
  add column if not exists codigo_vinculado_en timestamptz;

comment on column core.team_entry.referencia_contextual is
  'Nombre normalizado que identifica la inscripción DENTRO de su grupo cuando la fuente no publica '
  'código federativo. La referencia completa (federación, temporada, competición, grupo, nombre) vive '
  'en source.external_ref con external_id = ''ctx:<normalizado>''. Nunca es un código: codigo_externo '
  'sigue siendo NULL.';

comment on column core.team_entry.metodo_resolucion is
  'codigo-externo: la fuente publicó el código. referencia-contextual: no lo publicó y la inscripción se '
  'identifica por su ámbito y su nombre normalizado.';

comment on column core.team_entry.procedencias is
  'Representaciones del ámbito que citan a este equipo: calendario, jornada, clasificacion, acta o '
  'catalogo. Sólo se reúne dentro del grupo: nunca se cruza el ámbito para resolver un nombre.';

alter table core.team_entry
  add constraint team_entry_metodo_resolucion_ck
    check (metodo_resolucion in ('codigo-externo', 'referencia-contextual')),
  add constraint team_entry_metodo_coherente_ck
    check (metodo_resolucion <> 'referencia-contextual' or referencia_contextual is not null),
  add constraint team_entry_codigo_coherente_ck
    check (metodo_resolucion <> 'codigo-externo' or codigo_externo is not null),
  -- La vinculación posterior: `codigo_vinculado_en` está puesto EXACTAMENTE cuando una inscripción que
  -- nació sin código ya tiene uno. Ni antes ni después, y nunca en una inscripción que siempre lo tuvo.
  add constraint team_entry_vinculacion_ck
    check ((codigo_vinculado_en is not null)
           = (metodo_resolucion = 'referencia-contextual' and codigo_externo is not null)),
  add constraint team_entry_procedencias_ck
    check (procedencias <@ array['calendario', 'jornada', 'clasificacion', 'acta', 'catalogo']::text[]);

-- Una referencia contextual identifica UNA inscripción dentro de su grupo: es lo que hace que importar
-- dos veces la misma fuente devuelva la MISMA inscripción y no una nueva.
create unique index team_entry_referencia_contextual_uq
  on core.team_entry(phase_group_id, referencia_contextual)
  where referencia_contextual is not null;

-- Dos inscripciones del mismo grupo no pueden compartir el mismo código federativo: eso sería el mismo
-- equipo inscrito dos veces, y partiría su plantilla y sus estadísticas en dos.
create unique index team_entry_grupo_codigo_uq
  on core.team_entry(phase_group_id, codigo_externo)
  where codigo_externo is not null;
