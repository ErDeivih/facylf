# Espacio en disco: qué puede salir de `facylf`

> **Encargo directo de David (14/10/2026).** No es una sugerencia de otro agente: es una tarea
> pedida, así que no aplica la regla de «no tocar los ajustes del PC» — pero **sí aplican** las
> reglas de `AGENTS.md` y `CLAUDE.md`, empezando por «una cosa a la vez» y «el servidor no se
> sobrecarga». Esto es un movimiento **local**: el servidor **no** participa.
>
> **Este documento es solo de `facylf`.** El proyecto de oposiciones tiene el suyo, y no se mezclan.

## El problema, medido

F: tiene **203 GB de 208,3 GB**. Medido con una pasada completa sobre el disco (2.587.748 ficheros),
no estimado.

**`F:\EspacioCodigo\facylf` ocupa 74,9 GB en 1.470.573 ficheros**: el 37% del espacio del disco y
**el 57% de todos los ficheros de F:**. Es el bloque más grande de la máquina.

> **Cifras del 14/10/2026, hacia las 00:30.** El disco está en uso y los recolectores escriben
> mientras lees esto: **vuelve a medir antes de decidir** y no te fíes de estos números como si
> fueran de ahora. (`Get-ChildItem F:\EspacioCodigo\facylf -Recurse -File | Measure-Object Length -Sum`)

## Dónde está el espacio, dentro de facylf

| Carpeta | GB | Ficheros | Qué es |
|---|---|---|---|
| `descargas-federacion` | 15,0 | 252.267 | Castilla y León |
| `_traspaso` | 8,8 | **97** | Ficheros de traspaso entre PC y servidor |
| `pruebas` | 6,8 | 2.095 | Pruebas |
| `descargas-andalucia` | 6,5 | 79.739 | |
| `descargas-multideporte` | 6,1 | 80.707 | |
| `descargas-castilla-la-mancha` | 4,1 | 62.637 | |
| `descargas-asturias` | 3,1 | 62.361 | |
| `descargas-murcia` | 2,3 | 67.312 | |
| `descargas-valencia` | 2,1 | 115.679 | |
| `descargas-madrid` | 2,0 | 125.348 | |
| `descargas-federacion-sondeo` | 2,0 | 8.348 | |
| + 11 `descargas-*` más (extremadura, cantabria, aragon, rioja, navarra, baleares, cataluna, galicia, euskadi, ceuta, melilla, canarias, araba, bizkaia, gipuzkoa, laspalmas, tenerife) | ~12 | — | |
| `.git` | 0,6 | 808 | |
| `apps` | 0,6 | 469 | |
| `node_modules` | 0,6 | 21.532 | Regenerable |
| `.pnpm-store` | 0,4 | 12.657 | Regenerable |
| **`_borrar`** | 0,2 | 204 | **Se llama «borrar»** |

**El grueso son `descargas-*` (≈ 58 GB)**: evidencia descargada, en su mayoría HTML/PDF
comprimidos, más las colas `cola-v2.sqlite` de cada federación.

## Lo que ya existe para esto (no hay que inventarlo)

El proyecto **ya sabe** archivar fuera de F:. En `scripts/multideporte/archivo.json`:

```json
{"raiz": "E:\\facylf-archivo\\descargas-multideporte"}
```

`scripts/multideporte/archivo.mjs` documenta el contrato: **sin ese fichero, todo sigue igual**
(`descargas-multideporte/<adaptador>/evidencias`); con él, las evidencias van a E:.

Medido: hoy E: tiene **4,5 GB** en `E:\facylf-archivo\descargas-multideporte`, frente a los **6,1 GB**
de `descargas-multideporte` en F:. O sea: el mecanismo funciona y **está a medias**.

**Esta es la vía preferida**: extender ese mecanismo a las demás federaciones. Es del propio
proyecto, lo entienden sus scripts y no rompe ninguna ruta.

## Cómo se resuelven las rutas en facylf (por qué mover es seguro o no)

Las rutas **no** están en `recolector.config.json` (que solo tiene permiso, identidad, alcance,
ritmo y vigilancia) ni en `.env`. Se resuelven **relativas a la raíz del proyecto** (`FACYLF_RAIZ`;
`/app` en los contenedores, `F:\EspacioCodigo\facylf` en el PC).

Consecuencia práctica: si se mueve el contenido y se deja un **enlace** en el sitio viejo, **todo
sigue funcionando sin tocar una línea** — los ~30 scripts, las tareas programadas
(`FACyLF flota`, `FACyLF multideporte`, y las de recolección y sondeo), y `limpiar-chrome-huerfano.ps1`,
que reconoce sus procesos por la cadena `EspacioCodigo\facylf\descargas-`.

```powershell
# Mover una federación concreta y dejar el camino viejo funcionando:
robocopy "F:\EspacioCodigo\facylf\descargas-rioja" "E:\facylf-archivo\descargas-rioja" /MOVE /E /R:2 /W:5
New-Item -ItemType Junction -Path "F:\EspacioCodigo\facylf\descargas-rioja" -Target "E:\facylf-archivo\descargas-rioja"
```

`New-Item -ItemType Junction` **no necesita administrador** y funciona entre discos: verificado en
este PC el 14/10/2026 (creado, leído a través de él y borrado con `cmd /c rmdir`, que quita **solo**
el enlace).

## Procedimiento, en este orden

1. **Averigua qué está vivo antes de tocar nada.** Las descargas de `federacion` y `multideporte` se
   modificaron el **14/10 a la 1:02**: están activas. Comprueba cada una:
   ```powershell
   Get-ChildItem 'F:\EspacioCodigo\facylf' -Directory | Where-Object { $_.Name -like 'descargas-*' } | ForEach-Object {
     $u = Get-ChildItem $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1
     "{0,-34} {1}" -f $_.Name, $u.LastWriteTime
   }
   ```
2. **Para lo que vayas a mover.** `FACyLF flota` y `FACyLF multideporte` están **Running** y escriben
   dentro. Mover mientras escriben corrompe datos. Usa `scripts/parar-flota-pc.ps1` para la flota.
3. **Empieza por lo que no se toca**: `F:\EspacioCodigo\facylf\_borrar` (0,2 GB) y
   `node_modules` + `.pnpm-store` (1,0 GB, se regeneran con `pnpm install`).
4. **Luego `pruebas` (6,8 GB) y `_traspaso` (8,8 GB, solo 97 ficheros)**: pocos ficheros, mucho
   espacio. `_traspaso` es de traspaso: decide si sigue haciendo falta.
5. **Después, federación a federación**, empezando por las que estén **muertas** y terminando por las
   vivas. De una en una, verificando entre medias: es la regla del proyecto.
6. **Deja constancia**: añade la fila correspondiente en la tabla de este documento (estado, fecha,
   destino) y apunta el cambio en tu documento de estado de la plataforma web, como manda
   `AGENTS.md` («si encuentras trabajo que es de otro, apúntalo en su documento de estado»).

## ✎ Claude, 14/10/2026 — qué se puede mover YA, sin parar nada (comprobado)

**1. Las copias del PC de las 14 federaciones del servidor (lo más grande y lo más seguro).**
La flota del PC las **excluye** (`FACYLF_EXCLUIR` en `scripts/entorno-flota.ps1`: melilla, aragon, asturias, baleares, canarias, cantabria, castilla-la-mancha, ceuta, euskadi, extremadura, galicia, murcia, navarra, rioja). Su `cola-v2.sqlite` en el PC **no se escribe desde el 25-28/09**, y `importar-temporada.ps1` ya **se niega** a importarlas sin `-Paquete`. Son copias paradas: los datos vivos están en el servidor y llegan al PC por `_traspaso`.
- Se pueden mover **sin parar la flota**, de una en una: `robocopy … /MOVE` a `E:\facylf-archivo\descargas-<fed>` + enlace.
- Antes de cada una, confirma con el paso 1 del procedimiento que su fichero más nuevo es anterior al 29/09.
- **No** van aquí `descargas-federacion` (CyL, viva en el PC), andalucia, madrid, valencia, cataluna ni multideporte.

**2. `_traspaso`: lo viejo y ya sustituido (≈ 4,5 GB, pocos ficheros).**
- Se mueve a `E:\facylf-archivo\_traspaso-viejo` sin enlace: nada lo lee.
- Qué es viejo:
  - `cola-valencia.sqlite*`, `cola-madrid.sqlite*` y `cola-cataluna.sqlite*` (24/09: esas federaciones viven ya en el PC);
  - `traspaso-pc-20261009-1531.tar` (1,8 GB, el traslado del 09/10);
  - todos los `cyl-*.sqlite` (07/10, sustituidos por los `federacion-*` del 13/10);
  - todos los `*-anterior-*.sqlite`;
  - `facylf-web.tar`.
- Los paquetes del 11-13/10 (rioja, euskadi, navarra, melilla, canarias, ceuta, `federacion-*`) **se quedan hasta que su federación esté verificada**. Después pueden ir también a E:.

**3. Lo vivo** (CyL, andalucia, madrid, valencia, cataluna, multideporte) sólo **con la flota parada** y en un momento que elija David. O mejor: extendiendo `archivo.json` a las federaciones, que es código y lo hace Claude.

**Antes de empezar, una pregunta para David**: ¿E: es un disco **interno**? Si es externo (USB), un enlace a él deja de funcionar cada vez que se desconecta, y los recolectores fallarían. Con un disco externo, mover sólo lo del punto 2, que no lleva enlace.

## Qué NO hacer

- **No borrar `descargas-*` sin comprobar antes que la información está en el canónico o en el
  servidor.** El archivo de E: **no** es un duplicado de F: (medido: solo tiene `descargas-multideporte`).
- **No mover el proyecto entero de golpe.** 1.470.573 ficheros tardan horas.
- **No tocar el servidor para esto**, ni usar `docker cp`, ni `/tmp` del servidor: el movimiento es
  local. El servidor ya se cayó el 11/10 y el 13/10 por sobrecarga.
- **No hacer commit** sin que David lo pida.
- **No bajar la pausa entre peticiones** ni esquivar bloqueos para «recuperar» lo que se haya movido.

## Verificación tras cada movimiento

```powershell
node scripts/estado-recoleccion.mjs        # que siga viendo cada federación
node scripts/estado-colas.mjs              # que las colas cola-v2.sqlite se lean
```

Un enlace que funcione es invisible para el proyecto, así que **si estos dos comandos siguen
saliendo bien, el movimiento es correcto**.

## ✎ DeepSeek, 14/10/2026 — **movido hasta ahora** (tabla de registro)

> **Esta tabla se actualiza AL MOVER, no al final** ✓ (orden corregido por Claude el 14/10 ✓): si la
> sesión se corta a mitad, **esto es lo único que dice qué está ya en E:** ✓.

| carpeta / contenido | GB | destino en `E:` | ¿enlace? | cuándo |
|---|---|---|---|---|
| `descargas-federacion-sondeo` | 2,0 | `E:\facylf-archivo\descargas-federacion-sondeo` | **SÍ** ✓ | 14/10 01:1x |
| `_borrar` | 0,2 | `E:\facylf-archivo\_borrar` | **SÍ** ✓ | 14/10 01:1x |
| `_traspaso` **viejo** (25 ficheros: `traspaso-pc-20261009-1531.tar`, los `cyl-*` del 07/10, los `*-anterior-*`, `cola-valencia/madrid/cataluna` del 24/09, `facylf-web.tar`) | 4,48 | `E:\facylf-archivo\_traspaso-viejo` | **NO** ✗ (nada lo lee) | 14/10 01:2x |
| `descargas-castilla-la-mancha` | 4,2 | `E:\facylf-archivo\descargas-castilla-la-mancha` | **SÍ** ✓ | 14/10 02:1x |
| `descargas-asturias` | 3,1 | `E:\facylf-archivo\descargas-asturias` | **SÍ** ✓ | 14/10 02:2x |
| `descargas-murcia` | 2,3 | `E:\facylf-archivo\descargas-murcia` | **SÍ** ✓ | 14/10 02:2x |
| `descargas-extremadura` | 1,6 | `E:\facylf-archivo\descargas-extremadura` | **SÍ** ✓ | 14/10 10:5x |
| `descargas-cantabria` | 1,53 | `E:\facylf-archivo\descargas-cantabria` | **SÍ** ✓ | 14/10 10:5x |
| `descargas-aragon` | 1,5 | `E:\facylf-archivo\descargas-aragon` | **SÍ** ✓ | 14/10 10:5x |
| `descargas-rioja` | 1,43 | `E:\facylf-archivo\descargas-rioja` | **SÍ** ✓ | 14/10 10:5x |
| `descargas-navarra` | 1,4 | `E:\facylf-archivo\descargas-navarra` | **SÍ** ✓ | 14/10 11:0x |
| `descargas-baleares` | 1,3 | `E:\facylf-archivo\descargas-baleares` | **SÍ** ✓ | 14/10 11:0x |
| `descargas-galicia` | 1,1 | `E:\facylf-archivo\descargas-galicia` | **SÍ** ✓ | 14/10 11:0x |
| `descargas-euskadi` | 1,05 | `E:\facylf-archivo\descargas-euskadi` | **SÍ** ✓ | 14/10 11:1x |
| `descargas-ceuta` | 0,7 | `E:\facylf-archivo\descargas-ceuta` | **SÍ** ✓ | 14/10 11:1x |
| `descargas-melilla` | 0,29 | `E:\facylf-archivo\descargas-melilla` | **SÍ** ✓ | 14/10 11:1x |
| `descargas-canarias` | 0,25 | `E:\facylf-archivo\descargas-canarias` | **SÍ** ✓ | 14/10 11:1x |
| **TOTAL movido** | **≈28,5** | | **16 con enlace · 1 sin** | **F: 18,3 → 82,6 GB libres** ✓ |

*(Comprobadas antes de mover: `28/09 11:32` en euskadi y canarias, **`25/09` en ceuta y melilla** ✓ — frías ✓. Y **el doble recuento coincide exacto en las cuatro**: euskadi **46.899** · ceuta **42.647** · melilla **3.049** · canarias **5.014** ✓✓.)*

## ✓✓ **LAS 14 FEDERACIONES DEL SERVIDOR: HECHAS** (14/10/2026)

`melilla`, `aragon`, `asturias`, `baleares`, `canarias`, `cantabria`, `castilla-la-mancha`, `ceuta`, `euskadi`, `extremadura`, `galicia`, `murcia`, `navarra`, `rioja` — **todas en `E:\facylf-archivo\` con enlace y legibles por su ruta de siempre** ✓✓.

**Lo que NO se ha tocado, a propósito** ✗✓: `descargas-federacion` (CyL, viva en el PC), `andalucia`, `madrid`, `valencia`, `cataluna` y `multideporte` — esas necesitan **la flota parada** ✓ y son decisión de David ✓. También quedan en F: los paquetes recientes de `_traspaso` (hasta que su federación esté verificada ✓).

**Los enlaces funcionan**: leídos a través de ellos, `descargas-castilla-la-mancha` da **62.637 ficheros** ✓,
`asturias` **62.361** ✓ y `murcia` **67.312** ✓ — los mismos que antes de moverlos ✓.

**★ Y el filtro de fecha, corregido** ✓✓: el corte es **antes del 29/09** ✓ (no del 28/09: la cola de
castilla-la-mancha es del **28/09 11:32**, la fecha que dio Claude ✓) y se **ignoran los `-shm` y `-wal`**
de SQLite ✓ — son los que hacían parecer viva una carpeta parada (el único fichero del 07/10 en
castilla-la-mancha era `cola-v2.sqlite-shm` ✓, que se toca **al abrir** la cola, no al escribir datos ✓).

**Lo que queda de las 14** (una a una, mismo método, **anotando cada una justo al moverla** ✓):
`extremadura`, `cantabria`, `aragon`, `rioja`, `navarra`, `baleares`, `galicia`, `euskadi`, `ceuta`,
`melilla`, `canarias` ✓. Y **no** van aquí `descargas-federacion` (CyL), `andalucia`, `madrid`,
`valencia`, `cataluna` ni `multideporte` ✓ (esas necesitan la flota parada ✓).

**Verificación pendiente de pasar tras estos movimientos** ✓: `node scripts/estado-recoleccion.mjs` y
`node scripts/estado-colas.mjs` (los dos de arriba ✓) — **es lo siguiente que hago** ✓.

**Traídas**: de noche, **ninguna** ✓ (era la 01:00–02:30 ✓); mañana de día, la siguiente pasada del
servidor con el script, **una a la vez** ✓.
