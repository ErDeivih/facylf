# Diagnóstico: competiciones completas clavadas en 133/889 (06/11/2026)

## Respuesta corta

No es un problema de los 15 recolectores ni del cálculo: **el tramo de importación al canónico está parado**. Los recolectores descargan a la cola local, pero no hay lotes nuevos en `ops.batch` desde el **29/10/2026 12:19**. La cobertura que se pinta en `analytics`/`ops.coverage_checkpoint` se calcula al importar cada lote, así que lleva congelada desde esa fecha; por eso el panel sigue diciendo 133/889. No son 24 h: son **8 días**.

Además, el **proyector programado** (`FACyLF proyector`) llevaba saliendo con código 1: `scripts/proyectar-lectura.mjs` tenía un error de sintaxis (backticks dentro de un template literal, en el comentario SQL de la línea 99). Ya está corregido y `node --check` pasa. La tarea siguiente puede ejecutarse, pero por sí sola no arregla el atasco: **no hay datos nuevos importados que proyectar**.

## Qué significa «completa»

Una edición es completa sólo si **todos** sus `core.phase_group` tienen fila en `ops.coverage_checkpoint` y **todos** están en `visibility_state = 'completa'` (`scripts/metricas-facylf.mjs`, consulta de ediciones).

Un grupo llega a `completa` cuando (`packages/canonico/src/lote.ts`, `recalculaCobertura`):

1. Se conocen las jornadas esperadas.
2. Para **cada jornada 1..N**, hay al menos `floor(equipos_del_calendario / 2)` partidos.
3. **Todos** los partidos conocidos tienen resultado (`goles_local` y `goles_visitante` no nulos).
4. `actas_parseadas >= actas_disponibles` (no quedan actas disponibles sin parsear).

Si falla 2/3 se queda en `verificada_hasta_jornada` o `parcial_privada`; si no hay partidos, `oculta`.

## Evidencia medida

- CyL: **3.600 grupos** con checkpoint (no falta ninguna fila):
  - 1.473 `completa`
  - 1.652 `verificada_hasta_jornada`
  - 469 `parcial_privada`
  - 6 `oculta`
- **133 ediciones** tienen todos sus grupos completos; 756 no.
- Último checkpoint de CyL: **29/10/2026 12:19:28 UTC**. En las últimas 24 h: **0 checkpoints**. El último de cualquier federación real es del 30/10 (Andalucía); el 06/11 sólo hay checkpoints de `pruebas-sincodigo`.
- `ops.batch` de CyL: último lote real **29/10/2026 12:19**. Desde entonces sólo entran lotes de la federación de pruebas.
- Cola local de CyL (`descargas-federacion/recolector-local/cola-v2.sqlite`):
  - **41.783 trabajos pendientes** (31.940 jornadas, 6.098 actas, 1.557 clasificaciones, 1.440 calendarios, 612 índices).
  - 186.998 hechos; 2.536 cancelados.
  - Última actualización de la cola: 06/11 13:08; el log del recolector de CyL termina a las 14:08. El proceso de CyL sigue vivo, pero no avanza desde entonces.
- `analytics.proyeccion_pendiente`: 4.103 grupos (34 de CyL). Tras el filtro del proyector sólo queda **1** (`pruebas-sincodigo`): los 34 de CyL son ediciones con `origen <> 'federacion'` y el proyector las excluye salvo `FACYLF_LP_PUBLICO=true`. No es el atasco principal, pero es una parte que no se proyecta por diseño.
- `ops.invalidacion`: 273.716 pendientes. **No es la causa**: es la cola de invalidación de caché de la web (se consumen 1,48 M; el máximo consumido es de hoy 16:18). No alimenta `ops.coverage_checkpoint`.
- Tareas programadas:
  - `FACyLF proyector`: última ejecución 17:17, **resultado 1** (fallo). Tras corregir el error de sintaxis, `node --check` pasa.
  - `FACyLF recolector`: última ejecución 10:48, resultado 1.
  - No hay una tarea programada de **importación incremental**. La única ingesta programada es `FACyLF ingesta fin de semana` (semanal; última 04/11, siguiente 09/11). El importador masivo manual (`scripts/importar-masivo.mjs`) no está corriendo.

## Atasco y orden de desbloqueo

1. **Importador**: consumir la cola local (41.783 trabajos pendientes de CyL) y crear lotes en `ops.batch`. Sin esto, el canónico no cambia y ninguna competición puede pasar a completa.
2. **Proyector**: una vez importados los lotes, ejecutar `node scripts/proyectar-lectura.mjs --limite 200 --pausa-ms 100 --sin-globales` (es la orden de la tarea `FACyLF proyector`). Ya no falla por sintaxis. Para las 34 ediciones LP de CyL hace falta decidir si se proyectan con `FACYLF_LP_PUBLICO=true` o se excluyen también del denominador de «completas».
3. **Recolector de CyL**: el supervisor/proceso está vivo pero su log y su cola no avanzan desde las 13:08/14:08. Hay que revisar el supervisor `FACyLF recolector` (resultado 1) y el proceso de CyL; no se ha tocado su ritmo.
4. **No hacer**: reiniciar los 15 recolectores a la vez ni lanzar el importador masivo sin mirar la carga; el servidor ya avisa de la regla de memoria. La importación debe ir por tandas.

## Estado del código

- Corregido `scripts/proyectar-lectura.mjs` (backticks del comentario SQL). `node --check` pasa.
- No se ha tocado ningún recolector, ninguna migración ni ningún dato de producción.
- El cambio de prioridad de CyL en `scripts/importar-masivo.mjs` es de otra tanda (commit `14907a0`, 17:15) y no se ha ejecutado aquí.
