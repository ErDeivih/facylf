# ADR-0010 — Las capacidades de cada fuente se declaran en la base

- Estado: aceptada
- Fecha: 2026-09-14

## Contexto

Las fuentes son heterogéneas y lo seguirán siendo. Algunas fichas existen sólo en determinadas
temporadas o llegan sin alineaciones; varias PNFG no distinguen titular de suplente; Cataluña usa un
adaptador propio y Melilla todavía no ofrece una ruta estable. Sin una declaración explícita y
versionada, la ausencia de filas se interpreta como ausencia de hechos y la web muestra ceros
falsos. Madrid demuestra además que una conclusión provisional no puede convertirse en una
capacidad permanente: su recolector ya procesa fichas públicas completas y otras parciales.

## Decisión

Crear `core.source_capability(federation_id, capability, support, season_from, season_to,
evidence_url, note)` con un vocabulario cerrado de capacidades. Todo importador declara las suyas y
el publicador rechaza lotes incoherentes con la declaración. Toda pantalla declara qué capacidades
necesita y muestra el componente `SinCapacidad` cuando faltan.

## Alternativas consideradas

- **Deducirlo de los datos** (si no hay `appearance`, la fuente no las publica): indistinguible de
  un adaptador roto o de una recolección a medias.
- **Condicionales por federación en las vistas**: dispersa el conocimiento por el código y garantiza
  que la federación veinte lo rompa.

## Consecuencias

- Se distinguen tres ausencias distintas —no publicado, pendiente, sin datos en este caso— con
  textos canónicos en [CONTENIDO-MICROCOPIA.md](../CONTENIDO-MICROCOPIA.md).
- Los rankings excluyen automáticamente las ediciones sin la capacidad que la métrica exige, en
  lugar de devolver ceros.
- Añadir una federación obliga a rellenar su fila de capacidades con evidencia; es parte de su
  incorporación, no un extra.

## Cómo revertirla

La tabla es aditiva: si se abandonara, las consultas dejarían de consultarla. No condiciona el
esquema de hechos.
