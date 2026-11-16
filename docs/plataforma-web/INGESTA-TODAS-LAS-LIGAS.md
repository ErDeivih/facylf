# Ingesta y actualización de resultados de todas las ligas (16/11/2026)

**Qué es.** El comando único que importa al canónico lo que los recolectores ya han dejado en las colas
de **todas las federaciones**, temporada **2026-27**, sin arrancar recolectores ni cambiar su ritmo. Es la
pasada que se ejecutó el 16/11/2026 y la que queda programada de noche (ver `INGESTA-NOCTURNA.md`).

## 1 · El comando

```bash
cd F:\Proyectos\facylf
node scripts/importar-masivo.mjs --temporadas 2026-27 --minutos 30
```

- **Sin `--federaciones`**: recorre todas las colas `descargas-*/recolector-local/cola-v2.sqlite` que
  encuentre en la raíz del repositorio (las 19 federaciones y RFEF).
- **`--temporadas 2026-27`**: sólo la temporada en curso. Para el histórico completo está
  `node --import tsx scripts/importar-todo.mts` (días de máquina; no se ejecutó aquí).
- **`--minutos 30`**: tanda acotada. Al agotarse el tiempo termina ordenadamente y la siguiente pasada
  continúa donde lo dejó.
- **`--estado`**: no importa; imprime el resumen de unidades hechas, apartadas, con fallos y pendientes.
- **`--seco`**: dice qué haría sin escribir.

## 2 · Qué hace con cada unidad

Una **unidad** es federación + temporada + grupo. Para cada una:

1. Lee de la cola (SQLite, **sólo lectura**) las actas hechas.
2. Ordena: temporada más reciente primero y, dentro de ella, los grupos con actas antes que los que sólo
   tienen calendario.
3. Importa el grupo en el canónico con el importador de siempre, que hace **upsert por clave natural**
   (federación/competición/grupo/jornada/equipos; partido/persona en alineaciones).
4. Si la validación del lote falla (por ejemplo, un acta con técnicos 414≠398 respecto al canónico), la
   unidad se **aparta** con su motivo en `estado/importacion.json` y el resto sigue. No se reintenta sola.

## 3 · Idempotencia (por qué repetirlo no duplica)

| Mecanismo | Dónde |
|---|---|
| Estado de unidades hechas y apartadas | `estado/importacion.json` |
| Salto de lo ya hecho | el propio `importar-masivo.mjs` (`unidadesPendientes`) |
| Clave natural y *upsert* | importador de `packages/canonico` |
| Reintento máximo de fallos | 3 por unidad, y luego se anota |

Repetir el comando **no vuelve a importar** lo que ya está; continúa con lo pendiente. La comprobación
de que no ha duplicado es contar antes y después y ver que el crecimiento es el de las filas importadas,
no el doble.

## 4 · Lo que se midió en la pasada del 16/11/2026

**Antes** (13:25, hora local):

```
partidos | actas | con resultado = 2.593.653 | 1.014.838 | 2.201.804
```

**Después** (13:54):

```
partidos | actas | con resultado = 2.599.065 | 1.020.053 | 2.207.367
resultados de 2026-27 = 63.918
```

| Medida | Valor |
|---|---:|
| Unidades importadas | **117** |
| Unidades apartadas por validación | 34 |
| Fallos | **0** |
| Partidos nuevos | **+5.412** |
| Actas nuevas | **+5.215** |
| Partidos nuevos con resultado | **+5.563** |
| Resultados de 2026-27 antes → después | 58.355 → **63.918** |

Reparto de las 117 unidades por federación (según `estado/importacion.log`):

| Federación | Unidades | Federación | Unidades |
|---|---:|---|---:|
| Madrid | 46 | Galicia | 4 |
| Andalucía | 14 | Murcia | 3 |
| Aragón | 12 | Euskadi | 3 |
| Cantabria | 11 | Extremadura | 2 |
| Castilla-La Mancha | 7 | Rioja | 1 |
| Valencia | 6 | Navarra | 1 |
| Tenerife | 5 | Las Palmas | 1 |
| Cataluña | 1 | | |

**Estado de 2026-27 al terminar:** 3.690 unidades conocidas, **2.261 hechas**, 876 apartadas y **553
pendientes**. Las pendientes no son un fallo: son grupos que aún no tienen todas sus actas en la cola o
que esperan su turno; la siguiente pasada sigue por ellas. En el total de todas las temporadas quedan
23.880 unidades pendientes (histórico); para eso está `importar-todo.mts`.

Dos colas no se pudieron leer en ese momento porque el recolector las tenía bloqueadas
(`araba` y `asturias`: «database is locked»); el importador lo anota y sigue. No es un fallo de datos.

## 5 · Cómo comprobar que no ha duplicado y que sigue vivo

```bash
# recuento antes/después (los tres números)
docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc \
 "select (select count(*) from core.match)||'|'||(select count(*) from core.match_report)||'|'||(select count(*) from core.match where goles_local is not null)"

# estado de la importación (sin importar)
node scripts/importar-masivo.mjs --estado

# registro de la pasada
Get-Content estado\ingesta-todas-2026-11-16.log -Tail 20
```

## 6 · Lo que NO hace

- No arranca ni para recolectores; no cambia pausas, workers ni la rotación.
- No escribe en las colas: las abre en sólo lectura.
- No borra ni reorganiza el canónico; sólo inserta/actualiza por clave natural.
- No importa 2025-26 ni anteriores con este comando (esas van con `importar-todo.mts`).
- No republica la demo; eso es `tmp/publica-demo.ps1` / la tarea horaria.

## 7 · Relación con la tarea nocturna

La tarea **`FACyLF ingesta nocturna`** (03:10) ejecuta este mismo importador con `--minutos 25` y deja un
registro por noche. El comando de esta página es el que se lanzó a mano el 16/11 para la primera pasada
completa del día; la tarea nocturna es la que lo mantiene.
