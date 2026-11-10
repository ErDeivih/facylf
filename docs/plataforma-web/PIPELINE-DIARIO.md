# Pipeline diario de consolidación de Castilla y León

Cómo se consolida todos los días en el **canónico del PC** todo lo extraído de Castilla y León, de forma
**idempotente**, recuperable si el PC estaba apagado, y con una comprobación de codificación que **falla** si hay
textos mal codificados.

- Script: `scripts/ciclo-diario-cyl.ps1` (ASCII, PowerShell 5.1).
- Comprobación de codificación: `scripts/lib/codificacion.mjs` (+ `scripts/lib/codificacion.test.mjs`).
- Fase: **C** (sólo CyL, `--federaciones federacion`). Canónico: PostgreSQL `127.0.0.1:5433`, contenedor
  `facylf-postgres`, usuario `facylf_admin`, base `facylf`.
- La tarea programada **la registra el Lead**; este script no crea ni modifica tareas de Windows.

---

## 0. La salida: un renglón si va bien, uno de fallo si no

El camino feliz imprime **una sola línea** y sale con `0`. No hay avisos intermedios: todo el detalle va al
registro y al resumen.

```
CYL COMPLETAS: 206 de 867 ediciones (23,8 %)
```

**Una sola cifra**, la de la definición única de la auditoría (ver §1). Los grupos, los partidos, el espacio, los
planes y la salida de los programas hijos **no salen por pantalla**: quedan en `estado/ciclo-diario.log` y en
`estado/ciclo-diario-ultimo.json`. Para verlos también por pantalla (diagnóstico): `-Detallado`.

Si algo falla —importación con error, codificación con problemas, **servidor sin margen**, base caída o una
excepción— no se imprime la línea de éxito: se imprime el fallo (con el detalle en el registro) y el código de
salida NO es 0.

```
CYL FALLO: el canonico no responde (contenedor facylf-no-existe o psql) | no se pudo comprobar la codificacion (exit 2) - detalle en F:\Proyectos\facylf\estado\ciclo-diario.log
```

Las dos salidas de arriba están medidas el 10/11/2026: la primera es el ciclo real, la segunda un fallo provocado
a propósito con `FACYLF_CONTENEDOR_POSTGRES=facylf-no-existe` (no toca nada real: falla en el preflight).

---

## 1. Qué hace, en orden

El ciclo es una sola pasada secuencial. No hay paralelismo en ningún punto.

| Paso | Qué hace | Pieza que reutiliza |
|---|---|---|
| Entorno | Comprueba cola, contenedor y `psql`; mide espacio (F:, E:, C:), tamaño de la base, tamaño de `_traspaso` y estado de la importación | `scripts/importar-masivo.mjs --estado` (sólo lee) |
| Medición «antes» | Cobertura de CyL por temporada y **recuentos exactos** de 11 tablas | `psql` dentro del contenedor |
| Plan | Dice qué va a hacer: tanda del PC y temporadas del servidor elegidas para hoy | rotación en `estado/ciclo-diario-estado.json` |
| Paso 1 | Importa de la **cola del PC** de CyL por tandas, apartando lo que no entra | `node scripts\importar-masivo.mjs --federaciones federacion --minutos 30 --limite 0` |
| Paso 2 | Trae del **servidor** lo que falta, como mucho **4 temporadas en una sola pasada** | `scripts\claude\trae-federacion-servidor.ps1 -Federacion castilla-leon -Temporadas … -Maximo 4` |
| Paso 3 | Vuelve a medir cobertura y recuentos; deja los deltas en el registro | igual que la medición «antes» |
| Paso 4 | Comprueba que no haya texto mal codificado en el canónico ni en sus propios ficheros | `node scripts\lib\codificacion.mjs --bd --alcance cyl` |

Todo lo que se escribe va al registro `estado/ciclo-diario.log` y a un resumen legible por máquina
`estado/ciclo-diario-ultimo.json`.

### Qué cuenta como «completa» (una sola definición)

Una **edición está completa cuando TODOS sus `core.phase_group` tienen
`ops.coverage_checkpoint.visibility_state = 'completa'`**. Es la definición de la auditoría del 09/11/2026
(`tmp/medir-canonico-cyl.sql`). **No** se usa `core.competition_edition.visibility_state`: con los mismos datos da
278 ediciones completas frente a 206, y tener dos cifras distintas de «completas» es justo lo que hace que ninguna
se pueda citar. Estado el 10/11/2026 a las 11:07 UTC:

| medida | valor |
|---|---|
| ediciones de CyL | **867** |
| ediciones completas (auditoría) | **206** |
| grupos | **3.961** (2.201 completos, misma fuente: el checkpoint) |
| partidos | **328.100** |

Los coordinadores hablan de «807» porque era el universo de la auditoría del 09/11; el canónico tiene hoy **867**
porque después de esa foto entró la temporada **2014-15**, que hoy tiene **61 ediciones** en el canónico (58 de la
federación y 3 de La Preferente; el saldo entre las dos cifras del universo es +60). La cifra de «completas» es
siempre la de la definición única (auditoría) sobre el canónico actual.

Esta definición es la que usa también el plan del servidor: una temporada «no completa» sigue siendo candidata a
que se le traiga su paquete.

---

## 2. Comandos

```powershell
# Sólo medir y enseñar el plan. No importa, no trae del servidor y NO toca la rotación de temporadas.
# (Sí escribe su registro y su resumen: es su única forma de dejar rastro; no son datos.)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ciclo-diario-cyl.ps1 -SoloComprobar

# Ciclo real completo (cola del PC + paquetes del servidor)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ciclo-diario-cyl.ps1

# Sólo la parte del PC (si el servidor está sin margen o no hay SSH)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ciclo-diario-cyl.ps1 -SinServidor

# Tanda corta y una sola temporada del servidor (lo recomendado para la tarea diaria)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ciclo-diario-cyl.ps1 -MinutosPC 20 -MaximoServidor 1
```

| Parámetro | Por defecto | Qué hace |
|---|---|---|
| `-SoloComprobar` | — | Sólo mide y enseña el plan |
| `-SinServidor` | — | No habla con el servidor (ni para medirlo) |
| `-MinutosPC` | `30` | Minutos de tanda del PC (se los pasa a `importar-masivo.mjs`) |
| `-LimitePC` | `0` | Unidades como mucho en la tanda; `0` = sin tope de unidades |
| `-MaximoServidor` | `4` | Temporadas como mucho en la pasada del servidor. **Nunca más de 4** (regla del proyecto). `0` = no traer nada |
| `-TemporadasPC` | vacío | Restringe la tanda del PC a unas temporadas (`2025-26,2023-24`) |
| `-Registro` | `estado\ciclo-diario.log` | Otro fichero de registro |
| `-OmitirCodificacion` | — | Sólo mantenimiento: no ejecutar la comprobación de codificación |
| `-Detallado` | — | Diagnóstico: enseña por pantalla el detalle (espacio, cobertura por temporada, planes, pasos) además de la línea final |

### Qué NO hace

- **No refresca la base publicada del servidor** ni publica nada en la web. Eso es otro paso (`scripts/claude/publica-canonico.ps1`), manual y medido.
- **No toca el servidor más allá de traer paquetes**: no lanza recolectores, no cambia pausas, no escribe en `/tmp` (la extracción va con `nice 19` al disco de datos).
- **No escribe en las colas**: entran en modo lectura (`readOnly`) en todas las piezas que usa.
- **No cambia el ritmo de los recolectores** ni arranca workers.
- **No crea ni modifica tareas programadas** (la registra el Lead, ver §6).
- **No hace `git commit`**.
- No borra paquetes de `_traspaso` (crecen; ver §8).

---

## 3. Idempotencia, y cómo se demuestra

### Por qué es idempotente

Las tres piezas lo son por diseño:

- **`importar-masivo.mjs`** identifica cada entidad por su clave natural: reimportar un grupo ya importado
  **actualiza**, no inserta. Además lleva su estado (`estado/importacion.json`): lo hecho no se repite, lo apartado
  no se reintenta y un fallo normal se reintenta como mucho **3 veces**.
- **`trae-federacion-servidor.ps1`** vuelve a extraer el paquete del servidor (sólo lee su cola) y lo reimporta;
  reimportar la misma temporada no duplica nada.
- El ciclo **no inventa trabajo**: si no hay nada pendiente, no importa nada y los recuentos no cambian.

### La prueba hecha el 10/11/2026 (con cifras)

Evidencia completa en `estado/ciclo-diario-idempotencia.json` (artefacto local de la máquina, no versionado: el resumen está en la tabla de abajo). Aviso importante de la medición: **durante las
pruebas había otro importador trabajando en el mismo canónico (otra federación)**, así que los recuentos globales
se movían por él. Por eso la evidencia va **por federación**: `cyl` es lo que toca el ciclo y `otras` es el otro
importador.

**Prueba 1 — `-SoloComprobar -SinServidor` dos veces seguidas.** Ni una fila de CyL cambia, y el otro importador
sí mueve las suyas:

| tabla | Δ CyL | Δ otras |
|---|---:|---:|
| `core.club` | 0 | +5 |
| `core.team_season` | 0 | +68 |
| `core.team_entry` | 0 | +112 |
| `core.phase_group` | 0 | +9 |
| `core.competition_edition` | 0 | +9 |
| `core.match` | 0 | +1.640 |
| `core.match_report` | 0 | 0 |

**Prueba 2 — dos pasadas reales seguidas (`-SinServidor`).** Las dos encuentran la cola sin unidades pendientes;
ninguna añade nada a CyL:

| tabla | 1.ª pasada Δ CyL / Δ otras | 2.ª pasada Δ CyL / Δ otras |
|---|---|---|
| `core.club` | 0 / +3 | 0 / +2 |
| `core.team_season` | 0 / +22 | 0 / +16 |
| `core.team_entry` | 0 / +35 | 0 / +58 |
| `core.phase_group` | 0 / +5 | 0 / +3 |
| `core.competition_edition` | 0 / +5 | 0 / +3 |
| `core.match` | 0 / +438 | 0 / +578 |
| `core.match_report` | 0 / 0 | 0 / 0 |

**Prueba 3 — reimportar DOS veces la misma unidad** (el camino exacto del ciclo, CyL 2025-26 grupo `22911127`):

```
RESUMEN: 1 grupo(s) · 0 filas insertadas · 24.134 actualizadas · 0 rechazadas · validación correcta en 1/1
RESUMEN: 1 grupo(s) · 0 filas insertadas · 24.134 actualizadas · 0 rechazadas · validación correcta en 1/1
```

Y los recuentos **de esa unidad** no cambian entre la primera y la segunda (ni respecto a antes de reimportar):

| partidos | actas | participaciones | eventos | cuerpo técnico | inscripciones |
|---:|---:|---:|---:|---:|---:|
| 306 | 306 | 11.522 | 7.828 | 3.089 | 18 |

- **Prueba 4 — una pasada real en un hueco sin otro importador.** Los 11 recuentos de tabla salieron idénticos antes y después (en el registro, `deltas:` con los once valores a cero); el registro lo resume con «la pasada no ha añadido ni cambiado filas».

**Conclusión:** repetir el ciclo no añade ni duplica filas en el canónico de CyL. Lo que se mueve en el global
durante una pasada es de otro importador (otra federación), no del ciclo.

### Cómo repetir la prueba

1. Toma los recuentos por tabla (los deja el propio ciclo en la línea `recuentos antes:` del registro).
2. Lanza el ciclo dos veces y compara las líneas `recuentos despues:` y `deltas:`.
3. Si otro importador está trabajando, compara **por federación** (la consulta está en el script de evidencia que se
   usó: `tmp/_evidencia-idempotencia.ps1`) o mira `coberturaAntes` y `coberturaDespues` en
   `estado/ciclo-diario-ultimo.json`, que ya son sólo de CyL.

---

## 4. Qué deja escrito

| Fichero | Qué es |
|---|---|
| `estado/ciclo-diario.log` | Registro en texto: fecha UTC, pasos, planes, líneas de los hijos, recuentos y deltas |
| `estado/ciclo-diario-ultimo.json` | Resumen del último ciclo (modo, espacio, cobertura antes/después, recuentos antes/después, codificación, avisos, fallos, resultado y `linea`, que es exactamente la línea que se imprimió) |
| `estado/ciclo-diario-estado.json` | Rotación: cuándo se trajo por última vez cada temporada del servidor (sólo lo escribe el modo real) |
| `estado/ciclo-diario-idempotencia.json` | Evidencia de la prueba de idempotencia del 10/11/2026 |

El registro y el resumen son también dos de los ficheros que comprueba el paso 4 (§5): si el ciclo escribe algo mal
codificado, se acusa a sí mismo al día siguiente. Eso es a propósito.

---

## 5. Comprobación de codificación (que falla de verdad)

`scripts/lib/codificacion.mjs` detecta tres familias de daño, y **una sola aparición es un fallo**:

1. **Doble codificación**: UTF-8 leído como Latin-1 («Ã¡» por «á», «Ã©» por «é», «Ã±» por «ñ», «Â» delante de los
   signos de dos bytes, la raya como «â€”») y su variante con pérdida («Ã?» por «Á», que es lo que hay hoy en el
   canónico fuera de CyL).
2. **Carácter de reemplazo U+FFFD**, que es un dato perdido disfrazado de letra.
3. **UTF-8 inválido**, que sólo se puede ver en los **bytes** (por eso la comprobación de ficheros recibe bytes, no
   texto ya decodificado).

Además, los `.ps1` que corren en PowerShell 5.1 se comprueban en **modo ASCII**: un guion largo UTF-8 sin BOM se
lee como ANSI y rompe el análisis del fichero (pasó el 24/09/2026 con `importar-temporada.ps1`).

### Dónde se comprueba

- **El canónico**, en 11 columnas de nombre: club (nombre, municipio, provincia), equipo-temporada, competición
  (nombre publicado y provincia), grupo/fase, persona y recinto (nombre y municipio), federación. PostgreSQL
  garantiza UTF-8 válido, así que en la base sólo caben las familias 1, 2 y los controles C1; el UTF-8 inválido se
  comprueba en los ficheros.
- **Ficheros**: `scripts/ciclo-diario-cyl.ps1` (ASCII), `estado/ciclo-diario-ultimo.json` y
  `estado/ciclo-diario.log`. Un fichero que no existe se **omite** (el primer día el registro no está).

### Alcance: CyL por defecto (`--alcance global` para toda la base)

El canónico tiene hoy daño real **fuera** de CyL: 22 problemas en nombres de persona (Madrid, Extremadura,
Cataluña…), del tipo «SÃ?NCHEZ» por «SÁNCHEZ». Eso se arregla aparte, con esos datos, y no es excusa para dejar el
ciclo de CyL en rojo todos los días (dejaría de mirarse). Por eso el ciclo comprueba **CyL** con la definición de
la auditoría, y el barrido completo queda a un comando de distancia:

```powershell
node scripts\lib\codificacion.mjs --bd                          # CyL (lo que hace el ciclo)
node scripts\lib\codificacion.mjs --bd --alcance global         # toda la base (hoy: 43 filas marcadas, 24
                                                                # benignas y 22 problemas)
node scripts\lib\codificacion.mjs --ficheros a.txt,b.md         # ficheros sueltos
```

Estado el 10/11/2026: **CyL 0 problemas** (3 filas marcadas por el filtro grueso y descartadas por el detector fino,
que son nombres portugueses bien escritos: «QUINTÃO», «MAGALHÃES»…), **global 22 problemas** fuera de CyL.

### Las dos trampas que ya están resueltas en el código

- **«Ã» y «Â» delante de una letra ASCII no se marcan.** «JOÃO», «MAGALHÃES», «CÂMARA» son portugués correcto; la
  marca es el *byte alto* detrás de la letra. Marcarlo todo daría un aviso permanente por datos buenos.
- **Los avisos del propio comprobador son ASCII puro** (`\u00c3` en vez del carácter). Si un aviso copiara la
  cadena corrupta al registro, el registro quedaría contaminado y al día siguiente el ciclo fallaría por su propio
  aviso. Pasó en las pruebas del 10/11/2026 y está corregido y con prueba propia.

### Que un fichero corrupto provoque exit 1 (demostración en un minuto)

```powershell
'MÃ¡laga CF' | Set-Content "$env:TEMP\corrupto.txt" -Encoding UTF8
node scripts\lib\codificacion.mjs --ficheros "$env:TEMP\corrupto.txt"   # exit 1 y linea [FALLO]
```

Pruebas: `node --test scripts/lib/codificacion.test.mjs` (17 pruebas) y dentro de `pnpm recolector:test`.

---

## 6. Si el PC estaba apagado: `StartWhenAvailable`

La tarea diaria se registra con **`-StartWhenAvailable`**: si a la hora prevista el PC está apagado, Windows la
ejecuta **en cuanto arranca** (una sola vez, la ocurrencia perdida). El ciclo está hecho para eso:

- es **idempotente**: recuperarse tarde no duplica nada;
- **mide antes de actuar** y decide el plan con lo que hay en ese momento, no con lo que había a la hora prevista;
- la rotación de temporadas del servidor usa **fechas de la última traída**, no «el día que tocaba», así que un
  arranque tardío no salta temporadas ni repite la misma dos veces;
- si el servidor no tiene margen (memoria < 3 GiB, carga > 14 o swap > 1 GiB), la parte del servidor se **salta**
  y queda escrito; no se fuerza nada.

**La tarea la registra el Lead.** Esta es la forma coherente con el resto de tareas del proyecto (ventana oculta
con `scripts\ejecutar-oculto.vbs`, como `registrar-tareas-plataforma.ps1`); está aquí como referencia, **no la
ejecuta el ciclo**:

```powershell
$raiz = 'F:\Proyectos\facylf'
$vbs  = Join-Path $raiz 'scripts\ejecutar-oculto.vbs'
$ps1  = Join-Path $raiz 'scripts\ciclo-diario-cyl.ps1'
$argumentos = "`"$vbs`" `"$ps1`" -MinutosPC 20 -MaximoServidor 1"
$accion = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" `
  -Argument $argumentos -WorkingDirectory $raiz
$disparador = New-ScheduledTaskTrigger -Daily -At '4:30am'
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 12)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'FACyLF ciclo diario CyL' -Action $accion -Trigger $disparador `
  -Settings $ajustes -Principal $principal
```

Recomendaciones para esa tarea: `-MaximoServidor 1` (una temporada del servidor por noche; ver §7), a las 04:30 y
`-ExecutionTimeLimit` de 12 h. `-MultipleInstances IgnoreNew` evita dos ciclos a la vez si uno se alarga.

---

## 7. La pasada del servidor y su coste

- Se traen como mucho **4 temporadas por pasada** (nunca más: regla de David del 13/10/2026). El ciclo pasa
  `-Maximo 4` como techo y elige las temporadas **que no están completas y hace más tiempo que no se traen**
  (rotación en `estado/ciclo-diario-estado.json`). Sin rotación, las 4 primeras se traerían siempre y las de atrás
  no se visitarían nunca.
- Las temporadas del servidor se leen de **su** `temporadas-asignadas.txt` por SSH. Hoy son 8: `2026-27, 2024-25,
  2022-23, 2020-21, 2018-19, 2016-17, 2014-15, 2012-13`. Las del PC son 7: `2025-26, 2023-24, 2021-22, 2019-20,
  2017-18, 2015-16, 2013-14`.
- Antes de cada temporada, `trae-federacion-servidor.ps1` mide el servidor y **espera o se para** si no hay margen;
  la extracción va con `nice 19` y al disco de datos (no a `/tmp`).
- **Coste real:** importar una temporada entera son cientos de grupos (una temporada de CyL ronda las 3 h). Por eso
  la recomendación diaria es `-MaximoServidor 1`; para ponerse al día un fin de semana, `4`. Con `0` (o
  `-SinServidor`) el ciclo es sólo del PC y tarda menos de un minuto si no hay trabajo.
- **Tanda del PC:** 30 minutos por defecto; con la cola al día el paso termina en segundos.

---

## 8. Códigos de salida y diagnóstico

| Código | Significado |
|---|---|
| `0` | Ciclo completo (haya o no trabajo que hacer) |
| `1` | La comprobación de codificación ha fallado: hay texto mal codificado |
| `2` | Fallo de entorno o de un paso: base caída, cola inexistente, importación/traída con error, **servidor sin margen** o excepción no controlada |

El **servidor sin margen ya no se salta en silencio**: si no se le puede añadir trabajo (memoria < 3 GiB, swap
> 1 GiB o carga > 14), el ciclo lo cuenta como fallo y sale con 2. Antes lo apuntaba como «saltado» y el día
parecía verde sin haber hecho la parte del servidor. Si de verdad no toca servidor, se usa `-SinServidor`.

En el camino feliz **no se imprime nada más que la línea `CYL COMPLETAS`**: si hay algo que mirar, es que el ciclo
no ha dicho esa línea. Qué mirar según lo que diga el registro:

- `[fallo] el canonico no responde` → Docker Desktop / contenedor `facylf-postgres`; el ciclo no toca nada más.
- `[fallo] no existe la cola del PC` → la junction `descargas-federacion` apunta a `E:\facylf-datos`; disco E:.
- `paso 1 … codigo 2` → abrir `estado/importacion.log` (el masivo aparta lo que no entra con su motivo).
- `fallo castilla-leon|<temporada>|<grupo> (intento N)` → una unidad con incoherencia de datos (calendario y acta
  que no se corresponden). El importador la intenta 3 veces y **no deja datos a medias** (revierte el lote). Si el
  motivo se arregla, `node scripts\importar-masivo.mjs --federaciones federacion --reintentar-apartados`.
  Observado el 10/11/2026: `castilla-leon 2017-18 grupo 17134` (el acta 3730777 de la J1 no se corresponde con la
  fila del calendario). No es un fallo del ciclo; es un dato que hay que mirar.
- `importación masiva: … 6 pendientes` con la tanda diciendo `0 pendientes`: el resumen del masivo cuenta
  `unidades − hechas − apartadas`, así que las unidades que han agotado sus 3 intentos siguen sumando ahí aunque
  ya no se intenten. El número que manda para saber si hay trabajo es el de la línea `tanda terminada`.
- `deltas:` con valores distintos de cero mientras otro importador trabaja: mirar `coberturaAntes/Despues` del JSON,
  que ya son sólo de CyL.
- `codificacion ficheros: FALLO … ciclo-diario.log` → el registro tiene una cadena mal codificada. Casi siempre es
  un aviso de la propia comprobación copiado sin sanear (ya corregido) o un hijo que escribió en ANSI.
- `_traspaso` creciendo: los paquetes traídos del servidor se guardan ahí (con la fecha). No se borran solos; el
  disco F: se mide en cada pasada y avisa por debajo de 20 GB libres. Limpieza manual cuando toque.

---

## 9. Referencias

- `scripts/ciclo-diario-cyl.ps1` — el ciclo.
- `scripts/lib/codificacion.mjs` + `scripts/lib/codificacion.test.mjs` — la comprobación y sus 17 pruebas
  (`pnpm recolector:test` las ejecuta).
- `scripts/importar-masivo.mjs` — importación por tandas desde la cola del PC.
- `scripts/importar-temporada.ps1` — importación grupo a grupo de una temporada (la usa la traída del servidor).
- `scripts/claude/trae-federacion-servidor.ps1` — extrae, `scp` e importa paquetes del servidor con las
  comprobaciones de memoria, swap y carga.
- `tmp/medir-canonico-cyl.sql` — la consulta de la auditoría con la definición de «completa».
- `estado/ciclo-diario-idempotencia.json` — la evidencia numérica de la prueba de idempotencia (local, no versionada).

## Importación de temporadas antiguas: unidades apartadas por datos parciales (10/11/2026)

Al probar una tanda del importador incremental sobre las temporadas antiguas recién abiertas
(`--federaciones federacion --temporadas 2014-15,2018-19,... --minutos 10`) la tanda terminó **sin importar nada**:
de 743 unidades, 1.978 ya estaban hechas, 437 apartadas y 2 pendientes; las dos pendientes se apartaron solas con
este motivo:

```
✗ La validación del lote ha fallado: partidos 9≠277, actas analizadas 6≠270 [origen≠canónico]
  (el ORIGEN trae menos que el canónico: ¿cola vieja? Importa desde el paquete del servidor; el canónico queda como está)
```

**No es un fallo: es la protección que impide pisar el canónico con menos datos de los que ya tiene.** La cola tiene
solo las actas recién recogidas de esas competiciones, mientras el canónico conserva el paquete completo que se
importó en su día desde el servidor. Esas unidades se importan **por el camino de paquete** (cuando la temporada se
cierra y se empaqueta), no por el incremental.

### Matiz importante: el incremental SÍ importa cuando la cola supera al canónico

Lo de arriba es solo la mitad de la historia y conviene no sacar la conclusión contraria. La validación compara
**origen contra canónico en cada grupo**: cuando el canónico ya tiene más datos (el paquete del servidor venía
completo y la cola solo trae lo recién recogido), la unidad se aparta y el canónico no se degrada. Pero cuando la
**cola acaba sabiendo más que el canónico** —justo el caso de los grupos a los que les faltaban resultados—, el
incremental los importa con normalidad; es la situación habitual de una recolección que rellena huecos (está descrita
en `docs/plataforma-web/ESTADO-DEEPSEEK.md` con el aviso «origen≠canónico» en las dos direcciones).

Consecuencia práctica para estos días de rotación: cada grupo de temporada antigua que la recolección complete por
encima de lo que ya había **sí puede importarse** y mover la cobertura; lo que no va a entrar es reimportar grupos
donde el canónico ya está mejor. Así que el contador 206/867 puede subir con el ciclo diario, y si no sube hay que
mirar qué grupos han superado al canónico y cuáles se quedaron cortos.
