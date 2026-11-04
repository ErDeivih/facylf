# Informe de pruebas en rojo — `pnpm test` (04/11/2026)

Estado: **diagnóstico cerrado, sin arreglar todavía** (este fichero se escribe antes de tocar nada,
como manda la tarea). Sesión sobre la rama `fase-c`, commit de partida `a977896`.

Entorno medido: Windows, Node v24.19.0, pnpm 10.28.0, PostgreSQL 18 en Docker (`facylf-postgres`,
127.0.0.1:5433), base `facylf` de **32 GB**, con **2.284.324 personas** y **2.018.443 partidos**.

---

## Resumen en una línea

`pnpm test` no falla por el código de la plataforma: **falla porque el canónico estaba apagado**
(27 pruebas, `ECONNREFUSED`) y, con el canónico encendido, **fallan dos suites por una limpieza de
datos cuadrática** (`not in (select …)`, 2,28 M de filas → minutos) que agota el `hookTimeout` de 90 s.
Lo primero es entorno; lo segundo es **deuda de pruebas real, ya conocida y ahora medida**.

---

## Antes de las pruebas: el árbol no tenía dependencias

El primer intento de `pnpm test` no llegó ni a ejecutar Vitest:

```
Error: Cannot find module 'F:\Proyectos\facylf\node_modules\vitest\vitest.mjs'
```

`node_modules/` estaba vacío (solo quedaban los lanzadores de `.bin`). El proyecto se movió a
`F:\Proyectos` (commit `a977896`) y las dependencias no se instalaron en la ruta nueva.
`pnpm install --frozen-lockfile` avisó además `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; con
`CI=true` reinstaló los 177 paquetes desde el store local en 10,7 s. **No es un fallo de pruebas**:
es estado del árbol, y queda resuelto.

---

## Ejecución 1 — canónico apagado

`docker ps` mostraba `facylf-postgres  Exited (0) 21 minutes ago`. Resultado de `pnpm test`:

```
Test Files  2 failed | 47 passed (49)
     Tests  27 failed | 606 passed | 1 skipped (634)
```

Los 27 fallos son **todos** de conexión, no de aserción:

| Fichero | Pruebas en rojo | Error |
|---|---|---|
| `apps/web/test/consultas.test.ts` | 23 | `El canónico no acepta conexiones: ¿está arrancado el contenedor? (pnpm db:arrancar)` / `connect ECONNREFUSED 127.0.0.1:5433` |
| `packages/canonico/test/inscripcion-sin-codigo.test.ts` | 4 | `connect ECONNREFUSED 127.0.0.1:5433` |

Pruebas concretas de `apps/web/test/consultas.test.ts` (23): el resumen y sus columnas; cobertura por
federación; cobertura por grupo; grupo con visibilidad completa; grupo a medias no dice «completa»;
filtro por federación; límite; grupos con `LIMIT`; cabecera de grupo; orden de jornada y marcadores;
goles con autoría/minuto; goles que suman el marcador; grupo no importado; clasificación que cuadra;
listado del catálogo y su cobertura; grupo sin punto de control con cobertura nula; filtro de
federación y `conDatos`; filtros de vocabulario y búsqueda; paginación sin repetir ni perder filas;
federaciones declaradas; recuentos de portada; facetas y temporadas.

Y de `inscripcion-sin-codigo.test.ts` (4): grupo sin códigos; importación repetida con cero altas;
mismo equipo con y sin marcador en la misma jornada; código real que aparece después y se vincula.

**Diagnóstico: fallo de entorno, no de código.** La suite no arranca el canónico sola (a propósito:
hay pruebas que escriben). `docker start facylf-postgres` lo deja servible.

### Deuda tapada en la misma ejecución: dos suites «pasaban» sin comprobar nada

Con el canónico apagado, `lote.test.ts` (34 pruebas) y `retirada.test.ts` (6 pruebas) aparecían en
verde. No comprobaban nada: su `beforeAll` detecta que no hay canónico, avisa por consola y cada
prueba hace `if (!disponible || !pool) return;` → **pasa sin aserción**.

```
stderr | packages/canonico/test/lote.test.ts
⚠️  Pruebas del importador SALTADAS: no hay canónico disponible (connect ECONNREFUSED 127.0.0.1:5433).
```

Es deuda de diseño de pruebas (debería ser `skip` explícito y visible, no verde silencioso).
**No la arreglo en esta tanda**: cambiarla cambia el contrato de «pruebas que se saltan» de todo el
paquete y merece su propia decisión. Queda anotada.

---

## Ejecución 2 — canónico encendido

Con `facylf-postgres` arriba:

```
Test Files  2 failed | 47 passed (49)
     Tests  593 passed | 41 skipped (634)
  Duration  483.01s
```

Sin fallos de aserción: **2 suites fallan al arrancar** (`Failed Suites`), con el mismo error:

```
FAIL  packages/canonico/test/lote.test.ts
FAIL  packages/canonico/test/retirada.test.ts
Error: Hook timed out in 90000ms.
```

Las 40 pruebas de esas dos suites salen como `skipped` porque el `beforeAll` no llegó a terminar.
Ninguna aserción de negocio falla: las 593 que sí corren están en verde.

### Por qué se agota el hook: una limpieza cuadrática

Las dos suites limpian la federación de pruebas `pruebas` antes de cada prueba. En esa limpieza hay
una sentencia **global** (no acotada a la federación):

```sql
delete from core.person where id not in (select person_id from core.person_source_identity)
```

- `packages/canonico/test/lote.test.ts:177`
- `packages/canonico/test/retirada.test.ts:198`

`core.person` tiene **2.284.324 filas** y `core.person_source_identity` **2.284.324**. Con `NOT IN`,
PostgreSQL **no puede hashear el subplan** (`SubPlan` con `Materialize`, no `Hashed SubPlan`) y lo
reejecuta por fila: el plan estima coste **3,7·10¹⁰** y el barrido es **cuadrático**.

Medido en esta base, con el servidor en reposo:

| Consulta | Tiempo |
|---|---|
| `select count(*) from core.person … where not exists (select 1 from core.person_source_identity psi where psi.person_id = p.id)` | **1,03 s** (`Parallel Hash Anti Join`, 1.025 ms) |
| la misma con `not in (select person_id …)` | **> 5 min y sin terminar** (matada 3 veces; una instancia llegó a 9 min 50 s) |

Las pruebas limpiaban **una vez en `beforeAll` y otra en cada `beforeEach`**; en `lote.test.ts` son 35
limpiezas por ejecución. Con 90 s de `hookTimeout`, la primera ya lo agota.

Efecto secundario medido: como el `DELETE` sigue vivo aunque el proceso de Vitest lo abandone
(PostgreSQL no cancela por desconexión del cliente salvo que se le pida), quedaron **5 conexiones
`facylf-importador` ejecutando el mismo `DELETE` a la vez** — la más antigua, 9 min 50 s —, y la
ejecución acababa con los 2 ficheros en rojo. Se cancelaron con `pg_terminate_backend`.

### Es deuda conocida, pero estaba mal clasificada

`docs/plataforma-web/ESTADO-DEEPSEEK.md` ya registró este mismo rojo el 12/10
(«2 ficheros y 17 pruebas fallan, todas con `Hook timed out in 10000ms`; son justo las dos suites que
montan el esquema contra PostgreSQL») y lo cerró subiendo `hookTimeout` a 90 s. La conclusión de
entonces fue «**es el entorno, no el código**». Hoy no se sostiene: hasta la suite más simple tarda
minutos **con la máquina vacía**, y la causa es la forma de la consulta, no la carga. Al haber
crecido la base a 2,28 M de personas, la deuda ha pasado de «subir un timeout» a «romper las suites».

---

## Ejecución 3 — la limpieza cuadrática, arreglada, destapa un segundo fallo

Reescribir el borrado de personas como `not exists` deja correr las dos suites enteras… y entonces
aparece lo que el `hookTimeout` estaba tapando antes: **21 pruebas de `lote.test.ts` en rojo**, todas
con el mismo error dentro de la limpieza (`limpiaCanonico`, llamada desde el `beforeEach`):

```
update or delete on table "team_entry" violates foreign key constraint
"team_edition_summary_team_entry_id_fkey" on table "team_edition_summary"
```

Las 21 son las que van después de la primera que publica una clasificación; a partir de ahí **cada
`beforeEach` falla** y el resto cae en cadena.

### Por qué, y por qué es intermitente (estado envenenado)

- `analytics.team_edition_summary`, `analytics.player_team_season_summary` y
  `analytics.player_career_summary` apuntan a `core.team_entry` / `core.person` **sin cascada**
  (migración `0005`).
- Los escribe **la proyección de lectura** (`lectura:proyectar`), **no el importador**. La proyección
  recorre *todos* los grupos del canónico, incluidos los de la federación de pruebas `pruebas`.
- La limpieza de las dos suites **no los borra**. Así que en cuanto la proyección ha pasado por un
  resto de pruebas, borrar la inscripción choca con la FK, el `beforeEach` entero hace rollback y
  **el resto nunca se limpia**: el estado envenenado se queda para siempre.
- Medido en esta base antes de arreglarlo: 2 `team_entry`, 2 `team_edition_summary`,
  3 `player_team_season_summary` y 3 `player_career_summary` de la federación `pruebas`, que ya no se
  podían borrar.

Es la misma familia de problema que el propio `retirada.test.ts` ya documenta en
`limpiaCanonico` («`= any (array(…))` en vez de `in (select …)`, 45 s por limpieza, medido el
23/10/2026»): **el SQL de limpieza de estas pruebas es la parte frágil de la suite**, no el código de
la plataforma.

### Efecto secundario del primer fallo: procesos zombis

Cuando saltaba el `hookTimeout`, la consulta seguía viva en el servidor (PostgreSQL no cancela una
consulta por la desconexión del cliente salvo que se le pida) y Vitest arrancaba la siguiente
limpieza: se llegaron a ver **5 conexiones `facylf-importador` ejecutando el mismo `DELETE` a la vez**,
la más vieja **9 min 50 s**. Se terminaron con `pg_terminate_backend`.

---

## Veredicto por prueba

| # | Qué falla | ¿Fallo real? | Por qué | Arreglo |
|---|---|---|---|---|
| 1 | 23 pruebas de `apps/web/test/consultas.test.ts` | **No**: entorno | canónico apagado (`ECONNREFUSED 127.0.0.1:5433`) | arrancar `facylf-postgres` |
| 2 | 4 pruebas de `inscripcion-sin-codigo.test.ts` | **No**: entorno | idem | idem |
| 3 | `lote.test.ts` (34 pruebas, `Hook timed out`) | **Sí, deuda de pruebas** | `not in (select …)` cuadrático sobre 2,28 M de filas; 35 limpiezas por suite | reescribir el borrado como `not exists` (misma semántica, 1 s) |
| 4 | `retirada.test.ts` (6 pruebas, `Hook timed out`) | **Sí, deuda de pruebas** | idem | idem |
| 5 | `lote.test.ts` y `retirada.test.ts` «en verde» sin canónico | **Sí, deuda de pruebas** | pasan sin aserción cuando falta el canónico | `skip` explícito o fallo claro (tarea aparte) |
| 6 | 21 pruebas de `lote.test.ts` (`team_edition_summary_team_entry_id_fkey`) | **Sí, deuda de pruebas** | la limpieza no borra los agregados de `analytics` (0005), que escribe la proyección sobre restos de pruebas | borrarlos, acotados a la federación, **antes** de `team_entry` y de `person` |

Ningún fallo apunta a la lógica de la plataforma, del importador ni de las consultas: **los 593
asserts que se ejecutan están en verde**.

---

## Arreglo aplicado (Nivel 1)

1. **`packages/canonico/test/lote.test.ts`** y **`packages/canonico/test/retirada.test.ts`**: el
   borrado de personas huérfanas pasa de

   ```sql
   delete from core.person where id not in (select person_id from core.person_source_identity)
   ```

   a

   ```sql
   delete from core.person p
   where not exists (select 1 from core.person_source_identity psi where psi.person_id = p.id)
   ```

   Misma semántica (`person_source_identity.person_id` es `not null`, así que `NOT IN` y `NOT EXISTS`
   coinciden: se borran las personas que se han quedado sin identidad). Diferencia medida: **1 s frente
   a minutos**, con plan `Parallel Hash Anti Join`.

2. **En las dos limpiezas**, antes de borrar inscripciones y personas, se borran los agregados
   derivados de la federación de pruebas:

   ```sql
   delete from analytics.player_team_season_summary where team_entry_id in (…federación…);
   delete from analytics.team_edition_summary      where phase_group_id in (…federación…);
   delete from analytics.player_career_summary     where person_id in (…federación…);
   ```

   Acotado a `pruebas`, nunca a datos reales. Así la limpieza **se cura sola** de un estado envenenado
   por una ejecución anterior fallida.

Resultado: los 40 asserts de las dos suites pasan (`Test Files 2 passed · Tests 40 passed`, 272 s) y
la suite completa se vuelve a medir después.

---

## Resultado final — suite en verde

```
Test Files  49 passed (49)
     Tests  633 passed | 1 skipped (634)
  Duration  307.58s
```

`pnpm test` desde la raíz, con `facylf-postgres` arriba: **exit 0**. Las dos suites que fallaban pasan
(`lote.test.ts` 34/34 en 233 s; `retirada.test.ts` 6/6 en 19 s). Puertas del proyecto:

```
pnpm lint                                        → exit 0
pnpm --filter @facylf/web exec tsc --noEmit      → exit 0
```

La prueba 1 «saltada» es la de `apps/web/test/consultas.test.ts` que ya se marcaba como `skip` antes de
esta sesión (no la introduce este cambio).

Comparación de la misma suite:

| ejecución | estado | duración |
|---|---|---|
| canónico apagado | 27 fallos (ECONNREFUSED) + 2 suites «en verde» sin comprobar nada | 30 s |
| canónico arriba | 2 suites en rojo (`Hook timed out`), 593 en verde, 41 saltadas | **483 s** |
| con las dos correcciones | **633 en verde, 1 saltada, 0 fallos** | **308 s** |

---

## Deuda que queda anotada (no se toca en esta tanda)

1. **`lote.test.ts` tarda 233 s porque reimporta en cada prueba** (34 × ~6-7 s de import real). No falla,
   pero es la suite más cara del proyecto: valdría la pena una sola importación base y reinicios por
   transacción, o marcar los casos que no necesitan canónico limpio.
2. **Las dos suites pasan sin comprobar nada si el canónico está apagado** (`if (!disponible) return;`
   dentro de cada prueba). Debería ser un `skip` visible o un fallo explícito.
3. **La suite no arranca el canónico**: hay que acordarse (`docker start facylf-postgres`). El mensaje
   de error de `canonicoDisponible` ya lo dice, pero `pnpm test` no lo comprueba antes de empezar.
4. **Limpieza duplicada**: las dos suites tienen dos copias del SQL de limpieza y ya han
   divergido (una usa `= any (array(…))` por rendimiento, la otra `in (select …)`). Una función común
   de «limpia la federación de pruebas» evitaría el tercer fallo de esta sesión.
5. **La proyección de lectura proyecta los grupos de pruebas** si han quedado restos: es lo que
   envenenó el estado. La limpieza ya se cura sola, pero la proyección debería saltarse `pruebas`.

---



## Notas de entorno para la próxima sesión

- La base canónica es **grande de verdad** (32 GB, 2,28 M personas): cualquier consulta de prueba que
  barra una tabla entera se nota. Las pruebas que limpian datos deben acotar por federación siempre.
- El contenedor `facylf-postgres` pertenece al proyecto de compose **`infra`** con metadatos de la
  ruta antigua (`F:\EspacioCodigo\facylf`). Arrancarlo con `docker start facylf-postgres` es lo
  seguro; `pnpm db:arrancar` desde la ruta nueva usa el mismo nombre de contenedor y el mismo volumen
  `infra_facylf-pg`, pero cambia el `working_dir` del proyecto y puede recrear el contenedor (los
  datos van en el volumen, así que se conservan).
- `.env` está fuera de git y es lo que cargan las pruebas (`process.loadEnvFile` en
  `vitest.config.ts`).
- Los `beforeAll` de estas suites son los que deciden si se salta: **el canónico tiene que estar
  arriba antes de lanzar `pnpm test`**, no se arranca solo.
