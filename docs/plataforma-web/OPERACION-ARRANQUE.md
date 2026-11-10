# Operación: arranque del recolector de CyL y cómo diagnosticarlo

Última actualización: **10/11/2026, 18:05**. Este documento recoge lo aprendido midiendo el arranque del worker y
cómo diagnosticar el caso de «el recolector no pide nada» sin reiniciar a ciegas.

## 1 · Por qué importa

El worker prepara trabajo local al arrancar (mantenimiento de la cola) antes de pedir a la federación. En una cola de
2,4 GB, si esa preparación se hace mal, el arranque se come la recolección: se han medido arranques de **30-60 min
sin una sola petición**. Desde el 10/11 cada paso del arranque se cronometra y se registra en
`worker-programado.log` con dos líneas:

```
  · arranque: <paso> …          (empieza)
  · arranque: <paso> N s        (termina; siempre se registra, para poder comparar)
```

## 2 · Coste medido de cada paso (10/11/2026, en frío)

| Paso | Antes | Ahora | Cómo se arregló |
|---|---:|---:|---|
| `vigilancia` | 2-11 s | 2-11 s | sin cambios |
| `competiciones-sin-datos` | 0-60 min | 0,0 s | guardia diaria (metadato `competiciones_sin_datos_revisadas_en`) |
| `ambito-actas` | 30-60 min | 0,0 s | guardia diaria (`ambito_actas_revisado_en`) |
| `activa-actas` | **188,9 s** | **0,0-0,4 s** | el planificador hacía `SCAN` de toda la tabla; se fuerza el índice `actas_estado` con `INDEXED BY` |
| `actas-sin-trabajo` | **110-112 s** | 0,0 s tras el primer arranque del día | guardia diaria (`actas_sin_trabajo_revisadas_en`) |
| `aplaza-futuro` | **66-96 s** | 0,0 s tras el primer arranque del día | guardia diaria (`aplaza_futuro_revisado_en`) |
| `jornadas-vacias` | 1-13 s | 1-13 s | sin cambios |
| `marcadores-desde-actas` | 0,0 s | 0,0 s | ya tenía guardia |
| `repaso-reciente` | 0,6-4,5 s | 0,6-4,5 s | sin cambios |
| `reprioritiza-plan` | 0,2-2,7 s | 0,2-2,7 s | sólo recorre el plan si el catálogo cambió (huella) |

Con las guardias, el caso normal debería quedar en **~20-30 s**. El primer arranque del día paga los repasos
(actas-sin-trabajo y aplaza-futuro) y deja los metadatos para el resto del día.

## 3 · Qué hacer si el worker no pide (orden de comprobación)

1. **Mirar la traza del arranque** en `E:\facylf-datos\descargas-federacion\recolector-local\worker-programado.log`.
   La última línea `arranque: <paso> …` dice en qué está; si pasa de 5-10 min, ese paso es el problema.
2. **Medir el proceso**, no adivinarlo:

   ```powershell
   $p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'recolector-local' }
   $a = $p.ReadTransferCount; Start-Sleep 30; $p2 = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ProcessId)"
   "leido: {0:N0} MB en 30 s" -f (($p2.ReadTransferCount - $a)/1MB)
   Get-Process -Id $p.ProcessId | Select-Object CPU, WorkingSet64
   ```

3. **Comprobar si la cola está bloqueada** (no confundir «lento» con «bloqueado»): `node tmp/prueba-bloqueo-cola.mjs`
   hace una escritura inocua con 3 s de espera. Si responde en milisegundos, la cola no está bloqueada.
4. **Mirar la contención del equipo**: cuántos `node.exe` y `chrome.exe` hay y la carga de CPU. El 10/11 a las 18:00
   había **39 procesos node y 26 de Chrome, CPU al 49 %**, y la cola escribible en **3 ms**: el problema era el
   disco, no un bloqueo. Con esa contención cualquier lectura de 0,8 GB tarda decenas de minutos.
5. **No reiniciar el worker a mitad del arranque**: cada reinicio vuelve a empezar y, si se repite, nunca llega a
   pedir. Dejar terminar; el supervisor lo relanza solo si sale.

## 4 · Qué NO se toca sin decisión

- No se cambia el esquema de la cola en caliente (ni índices) sin validarlo con otra persona.
- No se paran los recolectores de otras federaciones (multideporte, La Preferente, Madrid, Cataluña) por iniciativa
  propia: eso es una decisión de producto. Si la contención impide cerrar CyL, se propone pararlos temporalmente y
  se deja por escrito en `ESTADO-AGENTE.md` (§`## Bloqueo`).
- No se bajan las pausas entre peticiones.

## 5 · La app real no tiene este problema

Medido a las 18:04 sobre la app servida en el PC (base `facylf_canonico_4`, túnel al servidor): portada 626 ms,
selector 133 ms, competición 355 ms, acta 158 ms, rankings 489 ms, ojeo 379 ms, ficha de equipo 109 ms; la API v1
responde 53-273 ms en los recursos probados. El único endpoint que se pasó del presupuesto de 5 s fue
`/api/v1/calendario` con la temporada 2026-27 completa (devuelve 503 con el motivo), que es el caso extremo de la
consulta más pesada.

## 6. No solapar el importador incremental con el recolector

**Regla operativa (medida el 10/11/2026).** La cola SQLite la usan dos procesos: el recolector y la tarea
`FACyLF importador incremental` (`importar-masivo.mjs`). El importador mantiene la cola ocupada durante su tanda y el
recolector **fallaba al arrancar** con:

```
Error: database is locked
    at reactivaTemporadasAsignadas (scripts/lib/temporadas-asignadas.mjs:175)
    at abreBase (scripts/lib/recolector-local.mjs:212)
```

La causa era doble: (a) el recolector escribe en `abreBase` **antes** de fijar `pragma busy_timeout`, y (b) el
importador tenía la cola en escritura. Arreglado pasando el timeout al abrir la base
(`new DatabaseSync(ruta, { timeout: 120000 })`). Aun así, mientras el importador está en una tanda larga el
recolector puede quedarse esperando: **para recolectar, el importador incremental debe estar parado** (la tarea se
deshabilita y se vuelve a habilitar cuando interese). La importación diaria del ciclo de las 04:30 cubre lo que la
tarea incremental habría hecho por la noche.

Comprobado: con la tarea deshabilitada y el proceso parado, el worker arrancó y empezó a pedir en menos de un
minuto (peticiones 200.666 → 200.675 en ese tramo).
