# Lote canónico de retirada de las inscripciones fantasma de descanso

Medido: 2026-09-17T11:41:25.207Z · id del lote: `31144c63afd93f2d` · **preparado y NO aplicado**.

Este fichero lo genera `scripts/preparar-lote-canonico-descansos.mjs`, que **sólo lee** (rol
`DATABASE_URL_LECTOR`). No se ha borrado ni modificado ninguna fila canónica: la retirada no se hace a mano.

Inscripciones fantasma encontradas: **1** · cola de origen ya limpia: **sí**.

## Qué se retiraría, fila a fila

### euskadi · 2025-26 · competición 23233882 · grupo 23233962 · «Atsedena»

- inscripción `core.team_entry` **5344** · visibilidad del grupo: `parcial_privada`
- partidos `core.match`: **30746**, **30747**
- cierre de la retirada, contado por las claves foráneas **reales** (no por una lista a mano):

  | tabla | filas que se retiran |
  |---|---|
  | `core.match` | 2 |
  | `core.team_entry` | 1 |

  Y a **cero filas** —miradas por su clave foránea real, no por una lista a mano—:
  `analytics.player_team_season_summary`, `analytics.team_edition_summary`, `core.appearance`, `core.match_event`, `core.match_official`, `core.match_report`, `core.match_source`, `core.match_staff`, `core.standing_snapshot`.

- cola de origen: 23 filas en el grupo, 0 de descanso → la cola del grupo no tiene ninguna fila de descanso: el canónico es lo único que queda por reparar
- **cuadre**: canónico 25 partidos − cola 23 filas = 2, y el lote retira 2 partidos → **cuadra**
- aplicable: **sí**, cuando exista la acción de borrado del diario

```json
[
  {
    "tabla": "core.match",
    "filas": [
      {
        "id": 30746,
        "venue_id": null,
        "played_at": null,
        "goles_local": null,
        "matchday_id": 6264,
        "data_version": 1,
        "source_order": 2,
        "fecha_prevista": "2025-09-21",
        "phase_group_id": 1492,
        "goles_visitante": null,
        "hora_confirmada": false,
        "official_status": "unknown",
        "away_team_entry_id": 5344,
        "home_team_entry_id": 5339
      },
      {
        "id": 30747,
        "venue_id": null,
        "played_at": null,
        "goles_local": null,
        "matchday_id": 6264,
        "data_version": 1,
        "source_order": 3,
        "fecha_prevista": "2025-09-21",
        "phase_group_id": 1492,
        "goles_visitante": null,
        "hora_confirmada": false,
        "official_status": "unknown",
        "away_team_entry_id": 5344,
        "home_team_entry_id": 5334
      }
    ]
  },
  {
    "tabla": "core.team_entry",
    "filas": [
      {
        "id": 5344,
        "retirado": false,
        "procedencias": [
          "calendario"
        ],
        "codigo_externo": null,
        "phase_group_id": 1492,
        "team_season_id": 5344,
        "nombre_en_fuente": "Atsedena",
        "metodo_resolucion": "referencia-contextual",
        "codigo_vinculado_en": null,
        "nombre_en_fuente_norm": "atsedena",
        "referencia_contextual": "atsedena"
      }
    ]
  }
]
```

## Cómo se aplicaría y cómo se revertiría

**Hoy no se puede aplicar con la maquinaria que existe.** `revierteLote` (`packages/canonico/src/reversion.ts`)
sabe deshacer dos cosas: una fila que el lote **insertó** (`accion = 'insert'` → la borra) y una que
**actualizó** (`anterior` → la restaura). No sabe deshacer un **borrado**, así que un lote que retirara
estas filas sería irreversible con el diario actual. Antes de aplicarlo hay que añadir esa acción
—`borrado` con la fila entera en `anterior`, y la reinserción en orden INVERSO al de borrado— con sus
pruebas: preparar → aplicar → revertir tiene que dejar la huella lógica idéntica.

Y queda dicho por qué el diario del lote que las creó no sirve: la inscripción la creó el lote **1492**,
cuyo `ops.batch_cambio` ya no existe —lo sustituyó el lote 1493 del mismo ámbito—, y el 1493 sólo tiene
entradas de **actualización** de esa fila. Revertir 1493 restauraría valores, no retiraría nada.

