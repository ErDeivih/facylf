# Rotación pendiente · devolver la temporada viva al worker de CyL (PC)

Dejado por el Lead el 09/11/2026 ~22:30 para no depender de que una sesión esté despierta a las 07:30.

## Qué hay ahora mismo (noche del 09/11 al 10/11)

- `E:\facylf-datos\descargas-federacion\recolector-local\temporadas-asignadas.txt` contiene **solo tres temporadas**:
  `2019-20`, `2015-16`, `2013-14`. Es a propósito: el worker elige la temporada más reciente con trabajo
  disponible, así que con las 15 asignadas nunca llegaba a las antiguas. Con solo las antiguas, cierra sus
  calendarios, jornadas y clasificaciones pendientes (~4.000 trabajos vencidos, 19-22 h a 15-20 s).
- Copia del fichero de 15 temporadas: `tmp/temporadas-asignadas.15-antes-antiguas-2026-11-09.txt`.
- El worker es un solo proceso `recolector-local.mjs`; el supervisor-flota lo relanza solo al morir.

## Cómo devolverlo (cuando toque, no más de un día con solo las antiguas)

1. Copia previa del fichero actual (por si acaso):
   `Copy-Item E:\facylf-datos\descargas-federacion\recolector-local\temporadas-asignadas.txt tmp\temporadas-asignadas.antiguas-<fecha>.txt`
2. Escribir las 15, **2026-27 primero** (una por línea, sin BOM):
   `2026-27`, `2025-26`, `2024-25`, `2023-24`, `2022-23`, `2021-22`, `2020-21`, `2019-20`, `2018-19`, `2017-18`,
   `2016-17`, `2015-16`, `2014-15`, `2013-14`, `2012-13`.
3. Reiniciar el worker: parar el `node.exe` cuyo CommandLine es `recolector-local.mjs arrancar` y dejar que
   `supervisor-flota.mjs` lo relance (espera ~20 s). Comprobar que queda **un solo** worker.
4. Verificar en `worker-programado.log` que la primera obra es de 2026-27 (`catalogo_temporada|22` o una jornada 22).
5. Medir la cobertura del canónico y anotarla en `ESTADO-AGENTE.md`.
