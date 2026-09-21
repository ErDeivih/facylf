# ADR-0011 — La identidad de una persona sin código federativo exige un contexto explícito

- Estado: aceptada
- Fecha: 2026-09-14

## Contexto

La migración 0006 añadió `person_source_identity_scope_uq` sobre
(`federation_id`, `codigo_externo`, `context_key`) con `NULLS NOT DISTINCT`, y `context_key` tiene
`''` por defecto. Al contrastar el esquema con la cola real de Canarias apareció el efecto: técnicos
y árbitros llegan sin código —594 y 235 personas distintas, más 313 eventos de técnico— y todos
habrían chocado contra la misma fila, fundiéndose en una sola persona por federación.

El defecto era silencioso: no habría dado error, habría dado un árbitro que dirige todos los
partidos y un entrenador que entrena todos los equipos.

## Decisión

Sustituir el índice único por dos índices parciales y una restricción:

- con código: único por (`federation_id`, `codigo_externo`, `context_key`);
- sin código: único por (`federation_id`, `context_key`), con `context_key` obligatorio y no vacío.

El importador construye un contexto conservador con formato fijo, verificado por la base en la
migración 0008:

```text
rol=<rol normalizado>;temporada=<AAAA-AA>;ambito=<edicion|equipo>:<id>;nombre=<normalizado>
```

- **árbitros**: `ambito=edicion:<competition_edition_id>`;
- **cuerpo técnico**: `ambito=equipo:<team_season_id>`.

Nunca `partido` ni `acta`. Medido en la cola de Canarias el 14/09/2026, la granularidad cambia el
resultado por un factor de tres a diez sin separar mejor a dos homónimos reales:

| Granularidad | Árbitros | Técnicos |
|---|---:|---:|
| sólo nombre | 235 | 594 |
| + temporada | 514 | 735 |
| **+ temporada y edición/equipo** | **598** | **780** |
| por partido o acta | 1.846 | 8.081 |

Dos apariciones sólo comparten identidad provisional cuando todo ese contexto coincide. Toda
persona creada así lleva `core.person.identidad_nominal = true` y queda fuera de los rankings
nominales hasta que una `identity_decision` la confirme.

## Alternativas consideradas

- **Quitar `NULLS NOT DISTINCT`**: permitiría duplicados infinitos de la misma persona sin código,
  que es el error opuesto y también silencioso.
- **No registrar identidad de fuente para quien no tiene código**: perdería la trazabilidad de por
  qué dos apariciones nominales se consideran la misma persona.

## Consecuencias

- Un nombre igual nunca basta por sí solo para unir personas. Puede fragmentar provisionalmente a
  una persona real entre temporadas, que es recuperable; fundir dos homónimos contaminaría todas sus
  estadísticas. La unión histórica aplica, en este orden, nombre, provincia, club y equipo y se
  registra como `identity_decision` reversible.
- Cualquier importador que no construya `context_key` falla de inmediato y en voz alta, en vez de
  corromper identidades en silencio.

## Cómo revertirla

Los índices y la restricción se sustituyen sin tocar datos de hechos. Las decisiones de identidad ya
tomadas no dependen de esta clave.
